import { all, one, run, scalar } from '../client';
import type { AiConversationRow, AiMessageRow } from '../types';
import { safeJson, toJson, truncate } from '@/lib/utils';

/**
 * AI conversation persistence.
 *
 * Every exchange is stored, including proposed tool calls and whether they were
 * confirmed, executed or rejected. That makes the assistant auditable: the
 * activity log says an invoice was created by the AI, and this table says which
 * conversation and which confirmation led to it.
 */

export type AiSurface = AiConversationRow['surface'];

export function createConversation(input: {
  surface: AiSurface;
  title?: string | null;
  userId?: number | null;
  visitorKey?: string | null;
  projectId?: number | null;
  leadId?: number | null;
  locale?: string;
  model?: string | null;
}): number {
  const result = run(
    `INSERT INTO ai_conversations (surface, title, user_id, visitor_key, project_id, lead_id, locale, model)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.surface, input.title ?? null, input.userId ?? null, input.visitorKey ?? null,
      input.projectId ?? null, input.leadId ?? null, input.locale ?? 'fr', input.model ?? null,
    ],
  );
  return Number(result.lastInsertRowid);
}

export function findConversation(id: number): AiConversationRow | null {
  return one<AiConversationRow>('SELECT * FROM ai_conversations WHERE id = ?', [id]);
}

/**
 * Finds an existing public conversation for a visitor, or starts one.
 * Keeps the public chatbot's history coherent across page navigations without
 * requiring an account.
 */
export function getOrCreateVisitorConversation(visitorKey: string, locale = 'fr'): number {
  const existing = one<{ id: number }>(
    `SELECT id FROM ai_conversations
     WHERE surface = 'public' AND visitor_key = ? AND created_at > datetime('now', '-1 day')
     ORDER BY id DESC LIMIT 1`,
    [visitorKey],
  );
  if (existing) return existing.id;
  return createConversation({ surface: 'public', visitorKey, locale });
}

export type ConversationWithMeta = AiConversationRow & {
  message_count: number;
  last_message: string | null;
  user_name: string | null;
};

export function listConversations(filter: { surface?: AiSurface; userId?: number; limit?: number } = {}): ConversationWithMeta[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.surface) { where.push('c.surface = ?'); params.push(filter.surface); }
  if (filter.userId) { where.push('c.user_id = ?'); params.push(filter.userId); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  params.push(filter.limit ?? 50);
  return all<ConversationWithMeta>(
    `SELECT c.*,
       (SELECT COUNT(*) FROM ai_messages m WHERE m.conversation_id = c.id) AS message_count,
       (SELECT m.content FROM ai_messages m WHERE m.conversation_id = c.id
          ORDER BY m.id DESC LIMIT 1) AS last_message,
       COALESCE(u.full_name, u.username) AS user_name
     FROM ai_conversations c
     LEFT JOIN users u ON u.id = c.user_id
     ${clause} ORDER BY c.updated_at DESC LIMIT ?`,
    params,
  );
}

export function deleteConversation(id: number): void {
  run('DELETE FROM ai_conversations WHERE id = ?', [id]);
}

// ── Messages ─────────────────────────────────────────────────────────────

export type AiMessage = AiMessageRow & { payload: Record<string, unknown> | null };

export function listMessages(conversationId: number, limit = 100): AiMessage[] {
  return all<AiMessageRow>(
    'SELECT * FROM ai_messages WHERE conversation_id = ? ORDER BY created_at, id LIMIT ?',
    [conversationId, limit],
  ).map((row) => ({
    ...row,
    payload: row.tool_payload ? safeJson<Record<string, unknown>>(row.tool_payload, {}) : null,
  }));
}

export function addMessage(input: {
  conversationId: number;
  role: AiMessageRow['role'];
  content: string;
  toolName?: string | null;
  toolPayload?: unknown;
  toolStatus?: AiMessageRow['tool_status'];
  tokens?: number | null;
}): number {
  const result = run(
    `INSERT INTO ai_messages (conversation_id, role, content, tool_name, tool_payload, tool_status, tokens)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      input.conversationId, input.role, input.content, input.toolName ?? null,
      input.toolPayload === undefined ? null : toJson(input.toolPayload),
      input.toolStatus ?? null, input.tokens ?? null,
    ],
  );

  // Title the conversation from its first user message so the admin list is scannable.
  run(
    `UPDATE ai_conversations
     SET updated_at = datetime('now'),
         title = COALESCE(title, CASE WHEN ? = 'user' THEN ? ELSE NULL END)
     WHERE id = ?`,
    [input.role, truncate(input.content, 70), input.conversationId],
  );

  return Number(result.lastInsertRowid);
}

export function recordUsage(conversationId: number, inputTokens: number, outputTokens: number, model?: string | null): void {
  run(
    `UPDATE ai_conversations
     SET input_tokens = input_tokens + ?, output_tokens = output_tokens + ?,
         model = COALESCE(?, model), updated_at = datetime('now')
     WHERE id = ?`,
    [Math.max(0, inputTokens), Math.max(0, outputTokens), model ?? null, conversationId],
  );
}

export function findMessage(id: number): AiMessage | null {
  const row = one<AiMessageRow>('SELECT * FROM ai_messages WHERE id = ?', [id]);
  if (!row) return null;
  return { ...row, payload: row.tool_payload ? safeJson<Record<string, unknown>>(row.tool_payload, {}) : null };
}

export function setToolStatus(messageId: number, status: NonNullable<AiMessageRow['tool_status']>): void {
  run('UPDATE ai_messages SET tool_status = ? WHERE id = ?', [status, messageId]);
}

/** Tool calls waiting for the user to confirm or reject. */
export function pendingToolCalls(conversationId: number): AiMessage[] {
  return all<AiMessageRow>(
    `SELECT * FROM ai_messages
     WHERE conversation_id = ? AND tool_name IS NOT NULL AND tool_status = 'proposed'
     ORDER BY id`,
    [conversationId],
  ).map((row) => ({
    ...row,
    payload: row.tool_payload ? safeJson<Record<string, unknown>>(row.tool_payload, {}) : null,
  }));
}

// ── Usage reporting ──────────────────────────────────────────────────────

export type AiUsage = {
  conversations: number;
  messages: number;
  inputTokens: number;
  outputTokens: number;
  bySurface: { surface: string; conversations: number; tokens: number }[];
};

export function getAiUsage(days = 30): AiUsage {
  const since = `-${Math.max(1, days)} days`;
  return {
    conversations: scalar<number>(
      `SELECT COUNT(*) AS c FROM ai_conversations WHERE created_at > datetime('now', ?)`, [since], 0,
    ),
    messages: scalar<number>(
      `SELECT COUNT(*) AS c FROM ai_messages WHERE created_at > datetime('now', ?)`, [since], 0,
    ),
    inputTokens: scalar<number>(
      `SELECT COALESCE(SUM(input_tokens), 0) AS s FROM ai_conversations WHERE created_at > datetime('now', ?)`,
      [since], 0,
    ),
    outputTokens: scalar<number>(
      `SELECT COALESCE(SUM(output_tokens), 0) AS s FROM ai_conversations WHERE created_at > datetime('now', ?)`,
      [since], 0,
    ),
    bySurface: all<{ surface: string; conversations: number; tokens: number }>(
      `SELECT surface, COUNT(*) AS conversations,
              COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens
       FROM ai_conversations WHERE created_at > datetime('now', ?)
       GROUP BY surface ORDER BY conversations DESC`,
      [since],
    ),
  };
}

/** Leads generated by the public chatbot, for attribution reporting. */
export function chatbotLeads(days = 30): number {
  return scalar<number>(
    `SELECT COUNT(DISTINCT lead_id) AS c FROM ai_conversations
     WHERE lead_id IS NOT NULL AND created_at > datetime('now', ?)`,
    [`-${days} days`], 0,
  );
}

export function attachLead(conversationId: number, leadId: number): void {
  run('UPDATE ai_conversations SET lead_id = ? WHERE id = ?', [leadId, conversationId]);
}

export function pruneConversations(olderThanDays = 180): number {
  return run(
    `DELETE FROM ai_conversations
     WHERE surface = 'public' AND lead_id IS NULL AND created_at < datetime('now', ?)`,
    [`-${olderThanDays} days`],
  ).changes;
}
