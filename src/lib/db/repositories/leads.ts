import { all, one, run, scalar } from '../client';
import type { LeadRow, LeadStage } from '../types';
import { indexEntity, removeFromIndex } from './search';
import { safeJson, toJson } from '@/lib/utils';
import { money } from '@/lib/money';

/**
 * Sales pipeline.
 *
 * Every public entry point (contact form, project-request wizard, chatbot)
 * lands here as a lead, which is the single funnel the commercial dashboard
 * reports on.
 */

export const LEAD_STAGES: { key: LeadStage; label: string; tone: string }[] = [
  { key: 'new', label: 'Nouveau', tone: 'neutral' },
  { key: 'contacted', label: 'Contacté', tone: 'info' },
  { key: 'qualified', label: 'Qualifié', tone: 'brand' },
  { key: 'proposal', label: 'Proposition', tone: 'warning' },
  { key: 'negotiation', label: 'Négociation', tone: 'warning' },
  { key: 'won', label: 'Gagné', tone: 'success' },
  { key: 'lost', label: 'Perdu', tone: 'danger' },
];

export const OPEN_STAGES: LeadStage[] = ['new', 'contacted', 'qualified', 'proposal', 'negotiation'];

export function stageLabel(stage: string): string {
  return LEAD_STAGES.find((s) => s.key === stage)?.label ?? stage;
}

export function findLead(id: number): LeadRow | null {
  return one<LeadRow>('SELECT * FROM leads WHERE id = ?', [id]);
}

export type LeadFilter = {
  stage?: LeadStage | 'all' | 'open';
  source?: string;
  search?: string;
  assignedTo?: number;
  limit?: number;
  offset?: number;
};

export function listLeads(filter: LeadFilter = {}): LeadRow[] {
  const where: string[] = [];
  const params: unknown[] = [];

  if (filter.stage === 'open') {
    where.push(`stage IN (${OPEN_STAGES.map(() => '?').join(',')})`);
    params.push(...OPEN_STAGES);
  } else if (filter.stage && filter.stage !== 'all') {
    where.push('stage = ?');
    params.push(filter.stage);
  }
  if (filter.source) { where.push('source = ?'); params.push(filter.source); }
  if (filter.assignedTo) { where.push('assigned_to = ?'); params.push(filter.assignedTo); }
  if (filter.search) {
    where.push('(name LIKE ? OR company LIKE ? OR email LIKE ? OR message LIKE ?)');
    const like = `%${filter.search}%`;
    params.push(like, like, like, like);
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  params.push(filter.limit ?? 200, filter.offset ?? 0);

  return all<LeadRow>(
    `SELECT * FROM leads ${clause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    params,
  );
}

export function countLeads(stage?: LeadStage | 'open'): number {
  if (stage === 'open') {
    return scalar<number>(
      `SELECT COUNT(*) AS c FROM leads WHERE stage IN (${OPEN_STAGES.map(() => '?').join(',')})`,
      OPEN_STAGES,
      0,
    );
  }
  return stage
    ? scalar<number>('SELECT COUNT(*) AS c FROM leads WHERE stage = ?', [stage], 0)
    : scalar<number>('SELECT COUNT(*) AS c FROM leads', [], 0);
}

export type LeadInput = {
  name: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  country?: string | null;
  city?: string | null;
  stage?: LeadStage;
  source?: string;
  service_interest?: string | null;
  budget_range?: string | null;
  estimated_value?: number;
  currency?: string;
  deadline_hint?: string | null;
  message?: string | null;
  payload?: unknown;
  score?: number;
  assigned_to?: number | null;
  is_demo?: boolean;
};

export function createLead(input: LeadInput): number {
  const score = input.score ?? scoreLead(input);
  const result = run(
    `INSERT INTO leads
      (name, company, email, phone, country, city, stage, source, service_interest,
       budget_range, estimated_value, currency, deadline_hint, message, payload, score,
       assigned_to, is_demo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.name.trim(), input.company ?? null, input.email ?? null, input.phone ?? null,
      input.country ?? null, input.city ?? null, input.stage ?? 'new', input.source ?? 'contact_form',
      input.service_interest ?? null, input.budget_range ?? null, money(input.estimated_value ?? 0),
      input.currency ?? 'DZD', input.deadline_hint ?? null, input.message ?? null,
      input.payload === undefined ? null : toJson(input.payload), score,
      input.assigned_to ?? null, input.is_demo ? 1 : 0,
    ],
  );
  const id = Number(result.lastInsertRowid);
  reindexLead(id);
  return id;
}

export function updateLead(id: number, patch: Partial<LeadInput> & { lost_reason?: string | null; client_id?: number | null; project_id?: number | null }): void {
  const map: Record<string, unknown> = {
    name: patch.name, company: patch.company, email: patch.email, phone: patch.phone,
    country: patch.country, city: patch.city, stage: patch.stage, source: patch.source,
    service_interest: patch.service_interest, budget_range: patch.budget_range,
    estimated_value: patch.estimated_value === undefined ? undefined : money(patch.estimated_value),
    currency: patch.currency, deadline_hint: patch.deadline_hint, message: patch.message,
    score: patch.score, assigned_to: patch.assigned_to, lost_reason: patch.lost_reason,
    client_id: patch.client_id, project_id: patch.project_id,
  };
  if (patch.payload !== undefined) map.payload = toJson(patch.payload);

  const fields: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(map)) {
    if (value === undefined) continue;
    fields.push(`${key} = ?`);
    params.push(value);
  }
  if (fields.length === 0) return;
  params.push(id);
  run(`UPDATE leads SET ${fields.join(', ')}, updated_at = datetime('now') WHERE id = ?`, params);
  reindexLead(id);
}

export function moveLeadStage(id: number, stage: LeadStage, lostReason?: string | null): void {
  run(
    `UPDATE leads SET stage = ?, lost_reason = ?, updated_at = datetime('now') WHERE id = ?`,
    [stage, stage === 'lost' ? (lostReason ?? null) : null, id],
  );
}

export function deleteLead(id: number): void {
  run('DELETE FROM leads WHERE id = ?', [id]);
  removeFromIndex('lead', id);
}

function reindexLead(id: number): void {
  const lead = findLead(id);
  if (!lead) return;
  indexEntity({
    type: 'lead',
    id,
    title: lead.name,
    subtitle: [lead.company, stageLabel(lead.stage)].filter(Boolean).join(' · '),
    body: [lead.message, lead.email, lead.phone, lead.service_interest].filter(Boolean).join(' · '),
    url: `/espace-admin/prospects/${id}`,
  });
}

/**
 * Qualification score (0-100), used to sort the pipeline and to tell the chatbot
 * how hard to push for a meeting. Deliberately transparent and rule-based
 * rather than a black box: budget and deadline signals dominate, because those
 * are what actually predict a project going ahead.
 */
export function scoreLead(input: Partial<LeadInput>): number {
  let score = 0;

  if (input.email) score += 15;
  if (input.phone) score += 15;
  if (input.company) score += 10;

  const budget = (input.budget_range ?? '').toLowerCase();
  const value = Number(input.estimated_value ?? 0);
  if (value >= 500_000 || /\+|500|1 ?000 ?000|>/.test(budget)) score += 25;
  else if (value > 0 || budget) score += 15;

  const deadline = (input.deadline_hint ?? '').toLowerCase();
  if (/urgent|semaine|week|asap|imm/.test(deadline)) score += 20;
  else if (deadline) score += 10;

  if (input.service_interest) score += 10;
  if ((input.message ?? '').length > 120) score += 5;

  return Math.max(0, Math.min(100, score));
}

// ── Pipeline reporting ───────────────────────────────────────────────────

export type PipelineColumn = {
  stage: LeadStage;
  label: string;
  tone: string;
  count: number;
  value: number;
  leads: LeadRow[];
};

export function getPipeline(): PipelineColumn[] {
  const leads = all<LeadRow>('SELECT * FROM leads ORDER BY score DESC, created_at DESC');
  return LEAD_STAGES.map((stage) => {
    const bucket = leads.filter((l) => l.stage === stage.key);
    return {
      stage: stage.key,
      label: stage.label,
      tone: stage.tone,
      count: bucket.length,
      value: money(bucket.reduce((acc, l) => acc + l.estimated_value, 0)),
      leads: bucket,
    };
  });
}

export type PipelineStats = {
  total: number;
  open: number;
  qualified: number;
  won: number;
  lost: number;
  conversionRate: number;
  potentialValue: number;
  wonValue: number;
  averageDealValue: number;
};

export function getPipelineStats(days?: number): PipelineStats {
  const windowClause = days ? `WHERE created_at > datetime('now', '-${Math.max(1, days)} days')` : '';
  const rows = all<{ stage: LeadStage; c: number; v: number }>(
    `SELECT stage, COUNT(*) AS c, COALESCE(SUM(estimated_value), 0) AS v
     FROM leads ${windowClause} GROUP BY stage`,
  );
  const by = (stage: LeadStage) => rows.find((r) => r.stage === stage) ?? { stage, c: 0, v: 0 };

  const total = rows.reduce((acc, r) => acc + r.c, 0);
  const won = by('won').c;
  const lost = by('lost').c;
  const open = OPEN_STAGES.reduce((acc, s) => acc + by(s).c, 0);
  const decided = won + lost;

  return {
    total,
    open,
    qualified: by('qualified').c + by('proposal').c + by('negotiation').c,
    won,
    lost,
    conversionRate: decided ? Math.round((won / decided) * 100) : 0,
    potentialValue: money(OPEN_STAGES.reduce((acc, s) => acc + by(s).v, 0)),
    wonValue: money(by('won').v),
    averageDealValue: won ? money(by('won').v / won) : 0,
  };
}

/** Distinct sources present, for reporting where leads come from. */
export function leadSources(): { source: string; count: number }[] {
  return all<{ source: string; count: number }>(
    'SELECT source, COUNT(*) AS count FROM leads GROUP BY source ORDER BY count DESC',
  );
}

export function leadPayload<T = Record<string, unknown>>(lead: LeadRow): T {
  return safeJson<T>(lead.payload, {} as T);
}
