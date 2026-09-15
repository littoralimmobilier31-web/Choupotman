import { z } from 'zod';

/**
 * Validation schemas for authenticated admin input.
 *
 * Every mutating endpoint validates through one of these. `csrf` is accepted on
 * each schema because the handler reads it off the same body before validation;
 * declaring it keeps strict parsing from rejecting it.
 */

const trimmed = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => trimmed(max).optional().or(z.literal('')).nullable();
const id = z.coerce.number().int().positive();
const optionalId = z.coerce.number().int().positive().nullable().optional();
const amount = z.coerce.number().min(0).max(1_000_000_000);
const isoDate = trimmed(30).regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ');
const optionalDate = isoDate.optional().or(z.literal('')).nullable();

/** Present on every mutating request; verified by the handler, not here. */
const csrf = z.string().optional();

/**
 * Turns a create schema into a PATCH schema.
 *
 * `schema.partial()` alone is **not** safe here: Zod keeps a field's `.default()`
 * inside the optional wrapper, so parsing `{ status: 'sent' }` against a partial
 * schema yields `{ status: 'sent', items: [], tax_rate: 0, discount_type: 'none' }`.
 * A repository that faithfully applies the patch then wipes the document's lines
 * and resets its VAT — from a request that only meant to change the status.
 *
 * `patchOf` strips the defaults first, so an absent key stays genuinely absent
 * and "unspecified" can never be mistaken for "reset to the default".
 */
type Undefaulted<T> = T extends z.ZodDefault<infer Inner> ? Inner : T;
type PatchShape<T extends z.ZodRawShape> = { [K in keyof T]: z.ZodOptional<Undefaulted<T[K]>> };

export function patchOf<T extends z.ZodRawShape>(schema: z.ZodObject<T>): z.ZodObject<PatchShape<T>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, field] of Object.entries(schema.shape)) {
    shape[key] = stripDefault(field as z.ZodTypeAny).optional();
  }
  // The runtime shape matches `PatchShape<T>` by construction; the cast is only
  // needed because the loop erases the per-key types.
  return z.object(shape) as unknown as z.ZodObject<PatchShape<T>>;
}

function stripDefault(field: z.ZodTypeAny): z.ZodTypeAny {
  // Unwrap nested default/optional/nullable layers until a real type is reached.
  let current = field;
  for (let depth = 0; depth < 8; depth += 1) {
    const def = (current as unknown as { def?: { type?: string; innerType?: z.ZodTypeAny } }).def;
    if (def?.type === 'default' && def.innerType) current = def.innerType;
    else if (def?.type === 'prefault' && def.innerType) current = def.innerType;
    else break;
  }
  return current;
}

// ── Clients ──────────────────────────────────────────────────────────────

export const clientSchema = z.object({
  csrf,
  name: trimmed(120).min(2, 'Le nom est requis.'),
  company: optionalText(140),
  email: z.union([trimmed(180).email('Adresse email invalide.'), z.literal('')]).optional().nullable(),
  phone: optionalText(40),
  whatsapp: optionalText(40),
  country: optionalText(80),
  city: optionalText(80),
  address: optionalText(300),
  website: optionalText(200),
  tax_id: optionalText(60),
  currency: trimmed(8).default('DZD'),
  preferred_locale: z.enum(['fr', 'ar', 'en']).default('fr'),
  status: z.enum(['active', 'inactive', 'archived']).default('active'),
  source: optionalText(60),
  notes: optionalText(4000),
  social: z
    .object({
      linkedin: optionalText(200),
      instagram: optionalText(200),
      facebook: optionalText(200),
      x: optionalText(200),
      youtube: optionalText(200),
      tiktok: optionalText(200),
      behance: optionalText(200),
    })
    .partial()
    .optional(),
});

// ── Leads ────────────────────────────────────────────────────────────────

export const leadSchema = z.object({
  csrf,
  name: trimmed(120).min(2, 'Le nom est requis.'),
  company: optionalText(140),
  email: z.union([trimmed(180).email('Adresse email invalide.'), z.literal('')]).optional().nullable(),
  phone: optionalText(40),
  country: optionalText(80),
  city: optionalText(80),
  stage: z.enum(['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost']).default('new'),
  source: trimmed(60).default('manual'),
  service_interest: optionalText(160),
  budget_range: optionalText(80),
  estimated_value: amount.default(0),
  currency: trimmed(8).default('DZD'),
  deadline_hint: optionalText(80),
  message: optionalText(4000),
  lost_reason: optionalText(300),
  assigned_to: optionalId,
});

export const leadStageSchema = z.object({
  csrf,
  stage: z.enum(['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost']),
  lost_reason: optionalText(300),
});

export const leadConvertSchema = z.object({
  csrf,
  createProject: z.boolean().default(false),
  projectTitle: optionalText(160),
  budget: amount.optional(),
});

// ── Projects ─────────────────────────────────────────────────────────────

export const projectSchema = z.object({
  csrf,
  title: trimmed(160).min(2, 'Le titre est requis.'),
  client_id: optionalId,
  category_id: optionalId,
  description: optionalText(6000),
  status: z
    .enum(['prospect', 'planning', 'in_progress', 'in_review', 'awaiting_client', 'completed', 'archived'])
    .default('planning'),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  budget: amount.default(0),
  currency: trimmed(8).default('DZD'),
  start_date: optionalDate,
  delivery_date: optionalDate,
  revisions_included: z.coerce.number().int().min(0).max(99).default(3),
  revision_extra_cost: amount.default(0),
  notes: optionalText(6000),
  color: optionalText(20),
  /** Apply the default stage/task/folder scaffolding on creation. */
  scaffold: z.boolean().default(true),
});

export const stageSchema = z.object({
  csrf,
  project_id: id,
  name: trimmed(120).min(1, 'Le nom est requis.'),
  description: optionalText(1000),
  due_date: optionalDate,
  position: z.coerce.number().int().min(0).max(999).optional(),
});

export const stageUpdateSchema = z.object({
  csrf,
  name: trimmed(120).optional(),
  description: optionalText(1000),
  status: z.enum(['todo', 'in_progress', 'done', 'blocked']).optional(),
  due_date: optionalDate,
  position: z.coerce.number().int().min(0).max(999).optional(),
});

// ── Tasks ────────────────────────────────────────────────────────────────

export const taskSchema = z.object({
  csrf,
  project_id: optionalId,
  stage_id: optionalId,
  title: trimmed(200).min(2, 'Le titre est requis.'),
  description: optionalText(4000),
  assignee_id: optionalId,
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  status: z.enum(['todo', 'in_progress', 'review', 'done', 'blocked']).default('todo'),
  due_date: optionalDate,
  estimate_hours: z.coerce.number().min(0).max(9999).nullable().optional(),
  spent_hours: z.coerce.number().min(0).max(9999).optional(),
});

export const taskMoveSchema = z.object({
  csrf,
  status: z.enum(['todo', 'in_progress', 'review', 'done', 'blocked']),
  position: z.coerce.number().int().min(0).max(9999).default(0),
});

export const checklistSchema = z.object({
  csrf,
  task_id: id,
  label: trimmed(240).min(1, 'Le libellé est requis.'),
});

export const checklistUpdateSchema = z.object({
  csrf,
  label: trimmed(240).min(1, 'Le libellé est requis.').optional(),
  is_done: z.boolean().optional(),
});

export const commentSchema = z.object({
  csrf,
  task_id: id,
  body: trimmed(4000).min(1, 'Le commentaire est vide.'),
});

// ── Finance ──────────────────────────────────────────────────────────────

export const lineItemSchema = z.object({
  service_id: optionalId,
  label: trimmed(240).min(1, 'Le libellé est requis.'),
  description: optionalText(1000),
  quantity: z.coerce.number().min(0).max(100000).default(1),
  unit: trimmed(40).default('forfait'),
  unit_price: amount.default(0),
  discount: z.coerce.number().min(0).max(100).default(0),
});

const documentBase = {
  csrf,
  client_id: optionalId,
  project_id: optionalId,
  title: optionalText(200),
  currency: trimmed(8).default('DZD'),
  discount_type: z.enum(['none', 'percent', 'amount']).default('none'),
  discount_value: amount.default(0),
  tax_rate: z.coerce.number().min(0).max(100).default(0),
  notes: optionalText(4000),
  locale: z.enum(['fr', 'ar', 'en']).default('fr'),
  items: z.array(lineItemSchema).max(200).default([]),
};

export const quoteSchema = z.object({
  ...documentBase,
  lead_id: optionalId,
  status: z.enum(['draft', 'sent', 'accepted', 'refused', 'expired', 'archived']).default('draft'),
  issue_date: optionalDate,
  valid_until: optionalDate,
  delivery_terms: optionalText(1000),
  payment_terms: optionalText(1000),
  conditions: optionalText(4000),
});

export const invoiceSchema = z.object({
  ...documentBase,
  quote_id: optionalId,
  status: z.enum(['draft', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled']).default('draft'),
  kind: z.enum(['standard', 'deposit', 'revision_extra', 'final']).default('standard'),
  issue_date: optionalDate,
  due_date: optionalDate,
  payment_terms: optionalText(1000),
});

export const paymentSchema = z.object({
  csrf,
  invoice_id: optionalId,
  client_id: optionalId,
  project_id: optionalId,
  amount: amount.refine((v) => v > 0, 'Le montant doit être supérieur à zéro.'),
  currency: trimmed(8).default('DZD'),
  method: z.enum(['cash', 'transfer', 'ccp', 'card', 'other']).default('transfer'),
  reference: optionalText(120),
  paid_at: optionalDate,
  status: z.enum(['pending', 'confirmed', 'refunded']).default('confirmed'),
  notes: optionalText(1000),
});

export const contractSchema = z.object({
  csrf,
  template_id: optionalId,
  client_id: optionalId,
  project_id: optionalId,
  title: trimmed(200).min(2, 'Le titre est requis.'),
  /**
   * Optional here, and required by the route instead: a contract drawn from a
   * template sends an empty body on purpose — the server expands the template.
   * Declaring a minimum length at this level would reject exactly the normal
   * case. The route checks "a template or at least 20 characters", which is the
   * real rule, and can say which one is missing.
   */
  body: trimmed(60000).optional(),
  status: z.enum(['draft', 'sent', 'signed', 'cancelled']).default('draft'),
  start_date: optionalDate,
  delivery_date: optionalDate,
  amount: amount.default(0),
  currency: trimmed(8).default('DZD'),
  locale: z.enum(['fr', 'ar', 'en']).default('fr'),
});

export const contractTemplateSchema = z.object({
  csrf,
  name: trimmed(160).min(2, 'Le nom est requis.'),
  description: optionalText(500),
  body: trimmed(60000).min(20, 'Le contenu est trop court.'),
  locale: z.enum(['fr', 'ar', 'en']).default('fr'),
  is_default: z.boolean().default(false),
});

// ── Revisions & feedback ─────────────────────────────────────────────────

export const revisionSchema = z.object({
  csrf,
  project_id: id,
  title: optionalText(200),
  description: optionalText(4000),
  requested_by: z.enum(['client', 'internal']).default('client'),
  extra_cost_override: amount.nullable().optional(),
});

export const revisionUpdateSchema = z.object({
  csrf,
  status: z.enum(['open', 'in_progress', 'done', 'rejected']).optional(),
  title: optionalText(200),
  description: optionalText(4000),
  extra_cost: amount.optional(),
});

export const feedbackSchema = z.object({
  csrf,
  project_id: id,
  client_id: optionalId,
  stage_id: optionalId,
  task_id: optionalId,
  author_label: optionalText(140),
  comment: optionalText(4000),
  rating: z.coerce.number().int().min(1).max(5).nullable().optional(),
  decision: z.enum(['approved', 'changes_requested', 'comment']).default('comment'),
  source: trimmed(40).default('admin'),
});

// ── Expenses & subscriptions ─────────────────────────────────────────────

export const expenseSchema = z.object({
  csrf,
  label: trimmed(200).min(2, 'Le libellé est requis.'),
  category: z
    .enum(['software', 'hosting', 'advertising', 'hardware', 'transport', 'training', 'subcontracting', 'other'])
    .default('other'),
  amount: amount.refine((v) => v > 0, 'Le montant doit être supérieur à zéro.'),
  currency: trimmed(8).default('DZD'),
  spent_at: optionalDate,
  supplier: optionalText(160),
  project_id: optionalId,
  receipt_file_id: optionalId,
  is_recurring: z.boolean().default(false),
  notes: optionalText(2000),
});

export const subscriptionSchema = z.object({
  csrf,
  service_name: trimmed(160).min(2, 'Le nom du service est requis.'),
  category: z.enum(['software', 'hosting', 'ai', 'saas', 'marketing', 'other']).default('software'),
  amount: amount.default(0),
  currency: trimmed(8).default('DZD'),
  frequency: z.enum(['monthly', 'quarterly', 'yearly', 'one_time']).default('monthly'),
  renewal_date: optionalDate,
  status: z.enum(['active', 'paused', 'cancelled']).default('active'),
  auto_renew: z.boolean().default(true),
  url: optionalText(300),
  notes: optionalText(2000),
});

// ── Calendar ─────────────────────────────────────────────────────────────

export const eventSchema = z.object({
  csrf,
  title: trimmed(200).min(2, 'Le titre est requis.'),
  description: optionalText(2000),
  kind: z
    .enum(['meeting', 'delivery', 'deadline', 'task', 'payment', 'revision', 'reminder', 'other'])
    .default('meeting'),
  starts_at: trimmed(40).min(10, 'Date de début requise.'),
  ends_at: optionalText(40),
  all_day: z.boolean().default(false),
  location: optionalText(200),
  url: optionalText(300),
  client_id: optionalId,
  project_id: optionalId,
  color: optionalText(20),
});

// ── Content ──────────────────────────────────────────────────────────────

export const serviceSchema = z.object({
  csrf,
  name: trimmed(160).min(2, 'Le nom est requis.'),
  slug: optionalText(160),
  family: z.enum(['web', 'it', 'marketing', 'audiovisual', 'ai']).default('web'),
  category_id: optionalId,
  short_description: optionalText(400),
  description: optionalText(8000),
  icon: optionalText(60),
  bullets: z.array(trimmed(300)).max(30).default([]),
  deliverables: z.array(trimmed(300)).max(30).default([]),
  starting_price: amount.nullable().optional(),
  currency: trimmed(8).default('DZD'),
  price_note: optionalText(200),
  duration_note: optionalText(200),
  position: z.coerce.number().int().min(0).max(999).default(0),
  is_published: z.boolean().default(true),
  is_featured: z.boolean().default(false),
  seo_title: optionalText(200),
  seo_description: optionalText(400),
});

export const portfolioSchema = z.object({
  csrf,
  title: trimmed(200).min(2, 'Le titre est requis.'),
  slug: optionalText(200),
  subtitle: optionalText(300),
  project_id: optionalId,
  client_id: optionalId,
  client_name: optionalText(160),
  category_id: optionalId,
  summary: optionalText(600),
  description: optionalText(12000),
  challenge: optionalText(6000),
  objectives: optionalText(6000),
  solution: optionalText(6000),
  results: optionalText(6000),
  testimonial_quote: optionalText(2000),
  testimonial_author: optionalText(160),
  testimonial_role: optionalText(160),
  cover_url: optionalText(500),
  project_date: optionalDate,
  year: z.coerce.number().int().min(1990).max(2100).nullable().optional(),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  technologies: z.array(trimmed(80)).max(40).default([]),
  services_done: z.array(trimmed(160)).max(40).default([]),
  links: z.array(z.object({ label: trimmed(80), url: trimmed(500) })).max(20).default([]),
  videos: z
    .array(z.object({ title: trimmed(160), url: trimmed(500), provider: trimmed(40).optional() }))
    .max(20)
    .default([]),
  metrics: z
    .array(z.object({ label: trimmed(120), value: trimmed(80), note: trimmed(200).optional() }))
    .max(20)
    .default([]),
  position: z.coerce.number().int().min(0).max(999).default(0),
  is_featured: z.boolean().default(false),
  seo_title: optionalText(200),
  seo_description: optionalText(400),
});

/**
 * A gallery entry on a portfolio project.
 *
 * Either a file from the library (`file_id`) or an external address (`url`);
 * the route refuses a media with neither, since an empty frame on the public
 * page is worse than no frame at all.
 */
export const portfolioMediaSchema = z.object({
  csrf,
  file_id: optionalId,
  url: optionalText(500),
  kind: z.enum(['image', 'video', 'embed']).default('image'),
  caption: optionalText(300),
  alt_text: optionalText(300),
  position: z.coerce.number().int().min(0).max(999).optional(),
});

export const caseStudySchema = z.object({
  csrf,
  title: trimmed(200).min(2, 'Le titre est requis.'),
  slug: optionalText(200),
  portfolio_id: optionalId,
  subtitle: optionalText(300),
  problem: optionalText(8000),
  objectives: optionalText(8000),
  strategy: optionalText(8000),
  solution: optionalText(8000),
  development: optionalText(8000),
  tools_used: optionalText(2000),
  result: optionalText(8000),
  metrics: z
    .array(z.object({ label: trimmed(120), value: trimmed(80), note: trimmed(200).optional() }))
    .max(20)
    .default([]),
  testimonial_quote: optionalText(2000),
  testimonial_author: optionalText(160),
  cover_url: optionalText(500),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  position: z.coerce.number().int().min(0).max(999).default(0),
  seo_title: optionalText(200),
  seo_description: optionalText(400),
});

export const postSchema = z.object({
  csrf,
  title: trimmed(240).min(2, 'Le titre est requis.'),
  slug: optionalText(240),
  excerpt: optionalText(600),
  content: optionalText(80000),
  cover_url: optionalText(500),
  author_name: optionalText(160),
  category_id: optionalId,
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  locale: z.enum(['fr', 'ar', 'en']).default('fr'),
  seo_title: optionalText(200),
  seo_description: optionalText(400),
  is_featured: z.boolean().default(false),
  tags: z.array(trimmed(60)).max(20).default([]),
});

export const profileEntrySchema = z.object({
  csrf,
  kind: z.enum(['experience', 'education', 'certification', 'skill', 'tool', 'interest', 'expertise']),
  title: trimmed(200).min(2, 'Le titre est requis.'),
  organisation: optionalText(200),
  location: optionalText(160),
  start_date: optionalText(30),
  end_date: optionalText(30),
  is_current: z.boolean().default(false),
  description: optionalText(4000),
  level: z.coerce.number().int().min(0).max(100).nullable().optional(),
  icon: optionalText(60),
  url: optionalText(300),
  position: z.coerce.number().int().min(0).max(999).default(0),
  is_published: z.boolean().default(true),
});

export const testimonialSchema = z.object({
  csrf,
  author_name: trimmed(160).min(2, 'Le nom est requis.'),
  author_role: optionalText(160),
  company: optionalText(160),
  avatar_url: optionalText(500),
  quote: trimmed(2000).min(10, 'Le témoignage est trop court.'),
  rating: z.coerce.number().int().min(1).max(5).nullable().optional(),
  client_id: optionalId,
  project_id: optionalId,
  locale: z.enum(['fr', 'ar', 'en']).default('fr'),
  is_published: z.boolean().default(false),
  position: z.coerce.number().int().min(0).max(999).default(0),
});

export const faqSchema = z.object({
  csrf,
  question: trimmed(400).min(5, 'La question est trop courte.'),
  answer: trimmed(4000).min(5, 'La réponse est trop courte.'),
  category: optionalText(80),
  position: z.coerce.number().int().min(0).max(999).default(0),
  is_published: z.boolean().default(true),
});

// ── Briefs & moodboards ──────────────────────────────────────────────────

export const briefSchema = z.object({
  csrf,
  title: trimmed(200).min(2, 'Le titre est requis.'),
  client_id: optionalId,
  project_id: optionalId,
  lead_id: optionalId,
  intro_text: optionalText(2000),
  locale: z.enum(['fr', 'ar', 'en']).default('fr'),
  expires_in_days: z.coerce.number().int().min(1).max(365).nullable().optional(),
});

export const moodboardSchema = z.object({
  csrf,
  title: trimmed(200).min(2, 'Le titre est requis.'),
  project_id: optionalId,
  client_id: optionalId,
  description: optionalText(2000),
  background: optionalText(40),
});

export const moodboardItemSchema = z.object({
  csrf,
  moodboard_id: id,
  kind: z.enum(['image', 'text', 'color', 'link', 'note']).default('image'),
  file_id: optionalId,
  url: optionalText(1000),
  source_url: optionalText(1000),
  content: optionalText(2000),
  color: optionalText(40),
  x: z.coerce.number().optional(),
  y: z.coerce.number().optional(),
  width: z.coerce.number().min(20).max(4000).optional(),
  height: z.coerce.number().min(20).max(4000).optional(),
  notes: optionalText(1000),
});

export const moodboardLayoutSchema = z.object({
  csrf,
  moodboard_id: id,
  items: z
    .array(
      z.object({
        id,
        x: z.coerce.number(),
        y: z.coerce.number(),
        width: z.coerce.number().min(20).max(4000).optional(),
        height: z.coerce.number().min(20).max(4000).optional(),
        z_index: z.coerce.number().int().optional(),
      }),
    )
    .max(400),
});

// ── Files ────────────────────────────────────────────────────────────────

export const folderSchema = z.object({
  csrf,
  name: trimmed(120).min(1, 'Le nom est requis.'),
  parent_id: optionalId,
  client_id: optionalId,
  project_id: optionalId,
});

export const fileUpdateSchema = z.object({
  csrf,
  original_name: trimmed(240).optional(),
  caption: optionalText(500),
  folder_id: optionalId,
  is_client_visible: z.boolean().optional(),
});

export const folderTemplateSchema = z.object({
  csrf,
  name: trimmed(160).min(2, 'Le nom est requis.'),
  description: optionalText(500),
  is_default: z.boolean().default(false),
  items: z.array(trimmed(120)).min(1, 'Au moins un dossier.').max(40),
});

// ── Messages ─────────────────────────────────────────────────────────────

export const messageSchema = z.object({
  csrf,
  template_key: optionalText(80),
  client_id: optionalId,
  project_id: optionalId,
  lead_id: optionalId,
  invoice_id: optionalId,
  to_name: optionalText(160),
  to_address: z.union([trimmed(180).email('Adresse email invalide.'), z.literal('')]).optional().nullable(),
  subject: trimmed(300).min(2, 'L’objet est requis.'),
  body: trimmed(20000).min(2, 'Le message est vide.'),
  /** Attempt delivery now instead of saving as a draft. */
  send: z.boolean().default(false),
});

export const messageTemplateSchema = z.object({
  csrf,
  key: trimmed(80).regex(/^[a-z0-9_]+$/, 'Clé invalide (minuscules, chiffres et _).'),
  name: trimmed(160).min(2, 'Le nom est requis.'),
  channel: z.enum(['email', 'whatsapp', 'internal']).default('email'),
  subject: optionalText(300),
  body: trimmed(20000).min(2, 'Le contenu est vide.'),
  locale: z.enum(['fr', 'ar', 'en']).default('fr'),
  description: optionalText(400),
});

// ── Settings, users, roles ───────────────────────────────────────────────

export const settingsSchema = z.object({
  csrf,
  group: trimmed(40),
  values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
});

export const userSchema = z.object({
  csrf,
  username: trimmed(60).regex(/^[A-Za-z0-9._-]{3,60}$/, 'Nom d’utilisateur invalide.'),
  email: trimmed(180).email('Adresse email invalide.'),
  full_name: optionalText(160),
  phone: optionalText(40),
  role_id: id,
  locale: z.enum(['fr', 'ar', 'en']).default('fr'),
  is_active: z.boolean().default(true),
  /** Only on creation; the account is always flagged must_change_password. */
  password: z.string().min(10).max(200).optional(),
});

export const roleSchema = z.object({
  csrf,
  slug: trimmed(40).regex(/^[a-z0-9_]+$/, 'Identifiant invalide (minuscules et _).').optional(),
  name: trimmed(80).min(2, 'Le nom est requis.'),
  description: optionalText(400),
  permissions: z.array(trimmed(80)).max(400).default([]),
});

export const automationToggleSchema = z.object({
  csrf,
  key: trimmed(80),
  enabled: z.boolean(),
});

export const automationConfigSchema = z.object({
  csrf,
  key: trimmed(80),
  config: z.record(z.string(), z.unknown()),
});

// ── AI ───────────────────────────────────────────────────────────────────

export const aiChatSchema = z.object({
  csrf,
  conversationId: optionalId,
  projectId: optionalId,
  surface: z.enum(['admin', 'project', 'portfolio']).default('admin'),
  message: trimmed(6000).min(1, 'Message vide.'),
});

export const aiConfirmSchema = z.object({
  csrf,
  messageId: id,
  confirm: z.boolean(),
});

export const aiGenerateSchema = z.object({
  csrf,
  task: z.enum([
    'project_summary', 'project_analysis', 'brief_to_tasks', 'quote_draft',
    'portfolio_description', 'portfolio_case_study', 'seo_meta', 'social_post',
    'email_draft', 'payment_reminder', 'monthly_report', 'content_ideas',
  ]),
  projectId: optionalId,
  portfolioId: optionalId,
  briefId: optionalId,
  invoiceId: optionalId,
  extra: optionalText(4000),
});

export type ClientInputSchema = z.infer<typeof clientSchema>;
export type ProjectInputSchema = z.infer<typeof projectSchema>;
export type QuoteInputSchema = z.infer<typeof quoteSchema>;
export type InvoiceInputSchema = z.infer<typeof invoiceSchema>;
