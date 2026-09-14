import { createHandler, ok, badRequest, notFound } from '@/lib/api/handler';
import { aiChatSchema } from '@/lib/validation/admin';
import { runAssistant } from '@/lib/ai/assistant';
import { AiError, available } from '@/lib/ai/client';
import * as aiRepo from '@/lib/db/repositories/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = createHandler({ permission: 'ai.view' }, async ({ request, user }) => {
  const url = new URL(request.url);
  const id = Number.parseInt(url.searchParams.get('conversation') ?? '', 10);

  if (Number.isInteger(id) && id > 0) {
    const conversation = aiRepo.findConversation(id);
    // A conversation belongs to the person who had it.
    if (!conversation || conversation.user_id !== user.id) return notFound('Conversation introuvable.');
    return Response.json({
      ok: true,
      conversation,
      messages: aiRepo.listMessages(id),
      pending: aiRepo.pendingToolCalls(id),
      aiConfigured: available(),
    });
  }

  return Response.json({
    ok: true,
    conversations: aiRepo.listConversations({ surface: 'admin', userId: user.id, limit: 30 }),
    aiConfigured: available(),
  });
});

/**
 * One turn with Choupotman AI.
 *
 * Write actions the assistant proposes are stored with `tool_status: 'proposed'`
 * and returned for confirmation — they are never executed here. Running them is
 * a separate, explicit request (`/api/ia/confirmer`).
 */
export const POST = createHandler(
  { permission: 'ai.create', schema: aiChatSchema, rateLimitPolicy: 'aiAdmin' },
  async ({ body, user, log }) => {
    const conversationId =
      body.conversationId && aiRepo.findConversation(body.conversationId)?.user_id === user.id
        ? body.conversationId
        : aiRepo.createConversation({
            surface: 'admin',
            userId: user.id,
            projectId: body.projectId ?? null,
          });

    aiRepo.addMessage({ conversationId, role: 'user', content: body.message });

    // Only this user's own history is replayed to the model.
    const history = aiRepo
      .listMessages(conversationId, 40)
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .map((message) => ({ role: message.role as 'user' | 'assistant', content: message.content }));

    try {
      const turn = await runAssistant(history, user);

      aiRepo.addMessage({ conversationId, role: 'assistant', content: turn.reply });

      // Each proposed action is persisted so a confirmation cannot be forged:
      // the payload that gets executed is the one the assistant actually asked
      // for, read back from the database rather than resent by the browser.
      const proposals = turn.proposals.map((proposal) => {
        const messageId = aiRepo.addMessage({
          conversationId,
          role: 'tool',
          content: proposal.preview,
          toolName: proposal.name,
          toolPayload: proposal.input,
          toolStatus: 'proposed',
        });
        return { messageId, name: proposal.name, preview: proposal.preview };
      });

      if (turn.source === 'ai') {
        aiRepo.recordUsage(conversationId, turn.inputTokens, turn.outputTokens, turn.model);
      }

      log({
        action: 'ai.action',
        entityType: 'ai',
        entityId: conversationId,
        summary: `Échange avec l’assistant (${turn.source === 'ai' ? 'modèle' : 'règles internes'})`,
        metadata: { toolsUsed: turn.toolsUsed, proposals: proposals.map((p) => p.name) },
      });

      return ok({
        conversationId,
        reply: turn.reply,
        proposals,
        toolsUsed: turn.toolsUsed,
        source: turn.source,
        aiConfigured: available(),
      });
    } catch (error) {
      if (error instanceof AiError) return badRequest(error.message);
      throw error;
    }
  },
);
