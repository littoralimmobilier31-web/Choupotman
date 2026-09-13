import { all, one, run, scalar, transaction } from '../client';
import type {
  BriefInputType, BriefQuestionRow, BriefResponseRow, BriefRow, BriefStatus,
} from '../types';
import { indexEntity, removeFromIndex } from './search';
import { generateToken } from '@/lib/auth/password';
import { safeJson, toJson } from '@/lib/utils';

/**
 * Interactive client brief.
 *
 * A brief is reached through /brief/[token] with no login: the token is 32 bytes
 * of randomness, single-purpose and optionally time-limited. Responses are
 * appended rather than overwritten, which gives the admin a timeline of how the
 * client's answers evolved instead of only the final state.
 */

export type BriefQuestionTemplate = {
  key: string;
  label: string;
  helpText?: string;
  inputType: BriefInputType;
  options?: string[];
  required?: boolean;
  section: string;
};

/** The standard questionnaire, editable per brief after creation. */
export const STANDARD_BRIEF: BriefQuestionTemplate[] = [
  { key: 'contact_name', label: 'Votre nom complet', inputType: 'text', required: true, section: 'Vous' },
  { key: 'company', label: 'Nom de l’entreprise', inputType: 'text', section: 'Vous' },
  { key: 'email', label: 'Email', inputType: 'text', required: true, section: 'Vous' },
  { key: 'phone', label: 'Téléphone / WhatsApp', inputType: 'text', section: 'Vous' },
  { key: 'sector', label: 'Secteur d’activité', inputType: 'text', section: 'Vous' },

  { key: 'project_name', label: 'Nom du projet', inputType: 'text', required: true, section: 'Projet' },
  { key: 'project_description', label: 'Décrivez votre projet', inputType: 'textarea', required: true, section: 'Projet' },
  {
    key: 'objectives',
    label: 'Quels objectifs souhaitez-vous atteindre ?',
    helpText: 'Par exemple : plus de demandes entrantes, automatiser un processus, moderniser votre image.',
    inputType: 'textarea',
    required: true,
    section: 'Projet',
  },
  { key: 'audience', label: 'Qui est votre audience cible ?', inputType: 'textarea', section: 'Projet' },
  {
    key: 'features',
    label: 'Fonctionnalités souhaitées',
    inputType: 'multiselect',
    options: [
      'Site vitrine', 'Boutique en ligne', 'Espace client', 'Blog', 'Multilingue',
      'Prise de rendez-vous', 'Paiement en ligne', 'Tableau de bord', 'Chatbot IA',
      'Automatisations', 'Application mobile', 'Autre',
    ],
    section: 'Projet',
  },

  {
    key: 'budget',
    label: 'Budget envisagé',
    inputType: 'select',
    options: ['< 50 000 DZD', '50 000 – 150 000 DZD', '150 000 – 400 000 DZD', '400 000 – 1 000 000 DZD', '> 1 000 000 DZD', 'À définir'],
    required: true,
    section: 'Cadre',
  },
  {
    key: 'deadline',
    label: 'Délai souhaité',
    inputType: 'select',
    options: ['Urgent (< 2 semaines)', '1 mois', '2 à 3 mois', '> 3 mois', 'Flexible'],
    required: true,
    section: 'Cadre',
  },
  { key: 'launch_date', label: 'Date de lancement visée', inputType: 'date', section: 'Cadre' },

  { key: 'style', label: 'Style recherché', inputType: 'textarea', helpText: 'Moderne, épuré, coloré, corporate, luxueux…', section: 'Direction créative' },
  { key: 'references', label: 'Sites ou marques de référence', inputType: 'textarea', helpText: 'Des liens ou des noms que vous aimez.', section: 'Direction créative' },
  { key: 'colors', label: 'Couleurs préférées', inputType: 'text', section: 'Direction créative' },
  { key: 'competitors', label: 'Vos principaux concurrents', inputType: 'textarea', section: 'Direction créative' },
  { key: 'assets', label: 'Documents, logo, textes ou images à partager', inputType: 'file', section: 'Fichiers' },
  { key: 'extra', label: 'Autre chose à nous dire ?', inputType: 'textarea', section: 'Fichiers' },
];

export const BRIEF_STATUSES: { key: BriefStatus; label: string; tone: string }[] = [
  { key: 'draft', label: 'Brouillon', tone: 'neutral' },
  { key: 'sent', label: 'Envoyé', tone: 'info' },
  { key: 'in_progress', label: 'En cours', tone: 'warning' },
  { key: 'completed', label: 'Terminé', tone: 'success' },
  { key: 'expired', label: 'Expiré', tone: 'outline' },
];

export function briefStatusLabel(status: string): string {
  return BRIEF_STATUSES.find((s) => s.key === status)?.label ?? status;
}

export type BriefWithMeta = BriefRow & {
  client_name: string | null;
  project_title: string | null;
  question_count: number;
  answered_count: number;
};

const BRIEF_SELECT = `
  SELECT b.*, c.name AS client_name, p.title AS project_title,
    (SELECT COUNT(*) FROM brief_questions q WHERE q.brief_id = b.id) AS question_count,
    (SELECT COUNT(DISTINCT r.question_key) FROM brief_responses r
       WHERE r.brief_id = b.id AND r.value IS NOT NULL AND r.value != '') AS answered_count
  FROM briefs b
  LEFT JOIN clients c ON c.id = b.client_id
  LEFT JOIN projects p ON p.id = b.project_id
`;

export function findBrief(id: number): BriefWithMeta | null {
  return one<BriefWithMeta>(`${BRIEF_SELECT} WHERE b.id = ?`, [id]);
}

/** Public lookup by token; expired briefs resolve but are flagged. */
export function findBriefByToken(token: string): BriefWithMeta | null {
  return one<BriefWithMeta>(`${BRIEF_SELECT} WHERE b.token = ?`, [token]);
}

export function isBriefExpired(brief: BriefRow): boolean {
  if (!brief.expires_at) return false;
  return new Date(brief.expires_at).getTime() < Date.now();
}

export function listBriefs(filter: { status?: BriefStatus | 'all'; clientId?: number; limit?: number } = {}): BriefWithMeta[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.status && filter.status !== 'all') { where.push('b.status = ?'); params.push(filter.status); }
  if (filter.clientId) { where.push('b.client_id = ?'); params.push(filter.clientId); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  params.push(filter.limit ?? 100);
  return all<BriefWithMeta>(`${BRIEF_SELECT} ${clause} ORDER BY b.created_at DESC LIMIT ?`, params);
}

export function createBrief(input: {
  title: string;
  clientId?: number | null;
  projectId?: number | null;
  leadId?: number | null;
  templateKey?: string;
  questions?: BriefQuestionTemplate[];
  introText?: string | null;
  locale?: string;
  expiresInDays?: number | null;
  isDemo?: boolean;
  createdBy?: number | null;
}): { id: number; token: string } {
  return transaction(() => {
    const token = generateToken(24);
    const expiresAt = input.expiresInDays
      ? new Date(Date.now() + input.expiresInDays * 86400000).toISOString()
      : null;

    const result = run(
      `INSERT INTO briefs
        (token, title, client_id, project_id, lead_id, template_key, status, locale,
         intro_text, expires_at, is_demo, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        token, input.title, input.clientId ?? null, input.projectId ?? null,
        input.leadId ?? null, input.templateKey ?? 'standard', 'sent',
        input.locale ?? 'fr', input.introText ?? null, expiresAt,
        input.isDemo ? 1 : 0, input.createdBy ?? null,
      ],
    );
    const id = Number(result.lastInsertRowid);

    const questions = input.questions ?? STANDARD_BRIEF;
    questions.forEach((question, index) => {
      run(
        `INSERT INTO brief_questions
          (brief_id, key, label, help_text, input_type, options, is_required, position, section)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, question.key, question.label, question.helpText ?? null, question.inputType,
          question.options ? toJson(question.options) : null,
          question.required ? 1 : 0, index, question.section,
        ],
      );
    });

    indexEntity({
      type: 'brief', id, title: input.title, subtitle: 'Brief client',
      body: input.introText, url: `/espace-admin/briefs/${id}`,
    });
    return { id, token };
  });
}

export function updateBrief(
  id: number,
  patch: { title?: string; status?: BriefStatus; introText?: string | null; projectId?: number | null; clientId?: number | null; expiresAt?: string | null },
): void {
  const map: Record<string, unknown> = {
    title: patch.title, status: patch.status, intro_text: patch.introText,
    project_id: patch.projectId, client_id: patch.clientId, expires_at: patch.expiresAt,
  };
  const fields: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(map)) {
    if (value === undefined) continue;
    fields.push(`${key} = ?`);
    params.push(value);
  }
  if (patch.status === 'completed') fields.push(`completed_at = COALESCE(completed_at, datetime('now'))`);
  if (fields.length === 0) return;
  params.push(id);
  run(`UPDATE briefs SET ${fields.join(', ')}, updated_at = datetime('now') WHERE id = ?`, params);
}

export function deleteBrief(id: number): void {
  run('DELETE FROM briefs WHERE id = ?', [id]);
  removeFromIndex('brief', id);
}

/** Issues a fresh token, invalidating the old link. */
export function regenerateBriefToken(id: number): string {
  const token = generateToken(24);
  run(`UPDATE briefs SET token = ?, updated_at = datetime('now') WHERE id = ?`, [token, id]);
  return token;
}

// ── Questions ────────────────────────────────────────────────────────────

export type BriefQuestion = BriefQuestionRow & { optionList: string[] };

export function listBriefQuestions(briefId: number): BriefQuestion[] {
  return all<BriefQuestionRow>(
    'SELECT * FROM brief_questions WHERE brief_id = ? ORDER BY position, id',
    [briefId],
  ).map((row) => ({ ...row, optionList: safeJson<string[]>(row.options, []) }));
}

export function addBriefQuestion(briefId: number, question: BriefQuestionTemplate): number {
  const position = scalar<number>(
    'SELECT COALESCE(MAX(position), -1) + 1 AS p FROM brief_questions WHERE brief_id = ?',
    [briefId], 0,
  );
  const result = run(
    `INSERT INTO brief_questions
      (brief_id, key, label, help_text, input_type, options, is_required, position, section)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      briefId, question.key, question.label, question.helpText ?? null, question.inputType,
      question.options ? toJson(question.options) : null, question.required ? 1 : 0,
      position, question.section,
    ],
  );
  return Number(result.lastInsertRowid);
}

export function deleteBriefQuestion(id: number): void {
  run('DELETE FROM brief_questions WHERE id = ?', [id]);
}

// ── Responses ────────────────────────────────────────────────────────────

/**
 * Appends an answer.
 *
 * Re-answering the same question inserts a new row instead of updating, so the
 * response history is preserved. `latestResponses` collapses it to the current
 * value for display and for the AI's brief-to-tasks conversion.
 */
export function saveBriefResponse(input: {
  briefId: number;
  questionKey: string;
  questionId?: number | null;
  value?: string | null;
  fileId?: number | null;
}): number {
  return transaction(() => {
    const result = run(
      `INSERT INTO brief_responses (brief_id, question_id, question_key, value, file_id)
       VALUES (?, ?, ?, ?, ?)`,
      [input.briefId, input.questionId ?? null, input.questionKey, input.value ?? null, input.fileId ?? null],
    );
    run(
      `UPDATE briefs
       SET last_activity_at = datetime('now'),
           status = CASE WHEN status IN ('draft','sent') THEN 'in_progress' ELSE status END,
           updated_at = datetime('now')
       WHERE id = ?`,
      [input.briefId],
    );
    return Number(result.lastInsertRowid);
  });
}

export function listBriefResponses(briefId: number): BriefResponseRow[] {
  return all<BriefResponseRow>(
    'SELECT * FROM brief_responses WHERE brief_id = ? ORDER BY answered_at, id',
    [briefId],
  );
}

/** Current value per question key. */
export function latestResponses(briefId: number): Record<string, string> {
  const rows = all<BriefResponseRow>(
    `SELECT r.* FROM brief_responses r
     WHERE r.brief_id = ? AND r.id = (
       SELECT MAX(r2.id) FROM brief_responses r2
       WHERE r2.brief_id = r.brief_id AND r2.question_key = r.question_key
     )`,
    [briefId],
  );
  return Object.fromEntries(rows.filter((r) => r.value !== null).map((r) => [r.question_key, r.value as string]));
}

/** Completion percentage over required questions, then all questions. */
export function briefProgress(briefId: number): { answered: number; total: number; percent: number; requiredMissing: string[] } {
  const questions = listBriefQuestions(briefId);
  const answers = latestResponses(briefId);
  const answered = questions.filter((q) => (answers[q.key] ?? '').trim() !== '').length;
  const requiredMissing = questions
    .filter((q) => q.is_required === 1 && (answers[q.key] ?? '').trim() === '')
    .map((q) => q.label);
  return {
    answered,
    total: questions.length,
    percent: questions.length ? Math.round((answered / questions.length) * 100) : 0,
    requiredMissing,
  };
}

/** Answer timeline — one entry per save, newest first. */
export function briefTimeline(briefId: number): { at: string; label: string; value: string | null }[] {
  const questions = new Map(listBriefQuestions(briefId).map((q) => [q.key, q.label]));
  return listBriefResponses(briefId)
    .slice()
    .reverse()
    .map((r) => ({
      at: r.answered_at,
      label: questions.get(r.question_key) ?? r.question_key,
      value: r.value,
    }));
}

export function markBriefCompleted(briefId: number): void {
  run(
    `UPDATE briefs SET status = 'completed', completed_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ?`,
    [briefId],
  );
}
