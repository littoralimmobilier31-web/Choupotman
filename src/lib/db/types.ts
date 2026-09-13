/**
 * Row types mirroring the SQL schema one-to-one.
 *
 * These describe what SQLite actually returns: booleans are 0 | 1, timestamps
 * are ISO strings, and JSON columns are `string | null` (read them through
 * `safeJson`). Repositories are responsible for turning rows into the richer
 * view models the UI consumes — nothing outside `lib/db` should build SQL.
 */

export type Bool = 0 | 1;
export type Timestamp = string;

// ── Access control ───────────────────────────────────────────────────────

export type RoleSlug = 'super_admin' | 'manager' | 'finance' | 'editor' | 'viewer' | (string & {});

export type RoleRow = {
  id: number;
  slug: RoleSlug;
  name: string;
  description: string | null;
  is_system: Bool;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type PermissionRow = {
  id: number;
  slug: string;
  resource: string;
  action: string;
  description: string | null;
};

export type UserRow = {
  id: number;
  username: string;
  email: string;
  full_name: string | null;
  password_hash: string;
  role_id: number;
  avatar_path: string | null;
  phone: string | null;
  locale: string;
  theme: string;
  must_change_password: Bool;
  is_active: Bool;
  last_login_at: Timestamp | null;
  failed_login_count: number;
  locked_until: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

/** A user joined with its role — what the session layer hands to pages. */
export type AuthUser = Omit<UserRow, 'password_hash'> & {
  role_slug: RoleSlug;
  role_name: string;
  permissions: string[];
};

export type SessionRow = {
  id: string;
  user_id: number;
  token_hash: string;
  csrf_secret: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Timestamp;
  last_seen_at: Timestamp;
  expires_at: Timestamp;
  revoked_at: Timestamp | null;
};

export type ActivityLogRow = {
  id: number;
  user_id: number | null;
  actor_label: string | null;
  action: string;
  entity_type: string | null;
  entity_id: number | null;
  entity_label: string | null;
  summary: string | null;
  metadata: string | null;
  ip_address: string | null;
  created_at: Timestamp;
};

export type SettingRow = {
  key: string;
  value: string | null;
  group_name: string;
  value_type: 'string' | 'number' | 'boolean' | 'json' | 'richtext';
  label: string | null;
  updated_at: Timestamp;
};

export type TranslationRow = {
  id: number;
  entity_type: string;
  entity_id: number;
  field: string;
  locale: string;
  value: string | null;
  updated_at: Timestamp;
};

export type CategoryRow = {
  id: number;
  slug: string;
  name: string;
  kind: 'project' | 'post' | 'service' | 'expense' | (string & {});
  description: string | null;
  color: string | null;
  icon: string | null;
  position: number;
  created_at: Timestamp;
};

export type TagRow = { id: number; slug: string; name: string; created_at: Timestamp };

export type TechnologyRow = {
  id: number;
  slug: string;
  name: string;
  category: string | null;
  icon: string | null;
  color: string | null;
  position: number;
  is_featured: Bool;
  created_at: Timestamp;
};

// ── CRM ──────────────────────────────────────────────────────────────────

export type ClientStatus = 'active' | 'inactive' | 'archived';

export type ClientRow = {
  id: number;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  country: string | null;
  city: string | null;
  address: string | null;
  website: string | null;
  social_links: string | null;
  tax_id: string | null;
  currency: string;
  preferred_locale: string;
  status: ClientStatus;
  source: string | null;
  notes: string | null;
  avatar_path: string | null;
  is_demo: Bool;
  created_by: number | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type LeadStage =
  | 'new' | 'contacted' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost';

export type LeadRow = {
  id: number;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  city: string | null;
  stage: LeadStage;
  source: string;
  service_interest: string | null;
  budget_range: string | null;
  estimated_value: number;
  currency: string;
  deadline_hint: string | null;
  message: string | null;
  payload: string | null;
  score: number;
  lost_reason: string | null;
  client_id: number | null;
  project_id: number | null;
  assigned_to: number | null;
  is_demo: Bool;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type ClientUserRow = {
  id: number;
  client_id: number;
  email: string;
  full_name: string | null;
  password_hash: string | null;
  invite_token_hash: string | null;
  invite_expires_at: Timestamp | null;
  must_change_password: Bool;
  is_active: Bool;
  last_login_at: Timestamp | null;
  locale: string;
  created_at: Timestamp;
};

// ── Delivery ─────────────────────────────────────────────────────────────

export type ProjectStatus =
  | 'prospect' | 'planning' | 'in_progress' | 'in_review'
  | 'awaiting_client' | 'completed' | 'archived';

export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export type ProjectRow = {
  id: number;
  reference: string;
  title: string;
  slug: string;
  client_id: number | null;
  category_id: number | null;
  description: string | null;
  status: ProjectStatus;
  priority: Priority;
  budget: number;
  currency: string;
  start_date: string | null;
  delivery_date: string | null;
  completed_at: Timestamp | null;
  progress: number;
  revisions_included: number;
  revision_extra_cost: number;
  notes: string | null;
  color: string | null;
  is_demo: Bool;
  created_by: number | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type StageStatus = 'todo' | 'in_progress' | 'done' | 'blocked';

export type ProjectStageRow = {
  id: number;
  project_id: number;
  name: string;
  description: string | null;
  position: number;
  status: StageStatus;
  started_at: Timestamp | null;
  completed_at: Timestamp | null;
  due_date: string | null;
  created_at: Timestamp;
};

export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done' | 'blocked';

export type TaskRow = {
  id: number;
  project_id: number | null;
  stage_id: number | null;
  title: string;
  description: string | null;
  assignee_id: number | null;
  priority: Priority;
  status: TaskStatus;
  due_date: string | null;
  started_at: Timestamp | null;
  completed_at: Timestamp | null;
  estimate_hours: number | null;
  spent_hours: number;
  position: number;
  is_demo: Bool;
  created_by: number | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type ChecklistItemRow = {
  id: number;
  task_id: number;
  label: string;
  is_done: Bool;
  position: number;
  created_at: Timestamp;
};

export type TaskCommentRow = {
  id: number;
  task_id: number;
  user_id: number | null;
  author_label: string | null;
  body: string;
  created_at: Timestamp;
};

export type ProjectEventKind =
  | 'created' | 'status' | 'stage' | 'task' | 'feedback' | 'revision'
  | 'invoice' | 'payment' | 'file' | 'brief' | 'message' | 'ai' | 'quote' | 'contract';

export type ProjectEventRow = {
  id: number;
  project_id: number;
  kind: ProjectEventKind;
  title: string;
  body: string | null;
  actor_label: string | null;
  metadata: string | null;
  entity_type: string | null;
  entity_id: number | null;
  created_at: Timestamp;
};

// ── Files ────────────────────────────────────────────────────────────────

export type FileFolderRow = {
  id: number;
  parent_id: number | null;
  client_id: number | null;
  project_id: number | null;
  name: string;
  path: string;
  position: number;
  is_system: Bool;
  created_at: Timestamp;
};

export type FileKind = 'image' | 'video' | 'document' | 'archive' | 'other';

export type FileRow = {
  id: number;
  folder_id: number | null;
  client_id: number | null;
  project_id: number | null;
  entity_type: string | null;
  entity_id: number | null;
  original_name: string;
  stored_name: string;
  mime_type: string;
  extension: string | null;
  size_bytes: number;
  checksum: string | null;
  kind: FileKind;
  width: number | null;
  height: number | null;
  caption: string | null;
  is_client_visible: Bool;
  is_demo: Bool;
  uploaded_by: number | null;
  created_at: Timestamp;
};

export type FolderTemplateRow = {
  id: number;
  name: string;
  description: string | null;
  is_default: Bool;
  created_at: Timestamp;
};

export type FolderTemplateItemRow = {
  id: number;
  template_id: number;
  name: string;
  parent_name: string | null;
  position: number;
};

// ── Money ────────────────────────────────────────────────────────────────

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'refused' | 'expired' | 'archived';
export type DiscountType = 'none' | 'percent' | 'amount';

export type QuoteRow = {
  id: number;
  number: string;
  client_id: number | null;
  project_id: number | null;
  lead_id: number | null;
  title: string | null;
  status: QuoteStatus;
  issue_date: string;
  valid_until: string | null;
  currency: string;
  subtotal: number;
  discount_type: DiscountType;
  discount_value: number;
  discount_total: number;
  tax_rate: number;
  tax_total: number;
  total: number;
  delivery_terms: string | null;
  payment_terms: string | null;
  conditions: string | null;
  notes: string | null;
  sent_at: Timestamp | null;
  accepted_at: Timestamp | null;
  locale: string;
  is_demo: Bool;
  created_by: number | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type LineItemRow = {
  id: number;
  service_id: number | null;
  label: string;
  description: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
  discount: number;
  line_total: number;
  position: number;
};

export type QuoteItemRow = LineItemRow & { quote_id: number };
export type InvoiceItemRow = LineItemRow & { invoice_id: number };

export type InvoiceStatus =
  | 'draft' | 'sent' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled';

export type InvoiceRow = {
  id: number;
  number: string;
  client_id: number | null;
  project_id: number | null;
  quote_id: number | null;
  title: string | null;
  status: InvoiceStatus;
  kind: 'standard' | 'deposit' | 'revision_extra' | 'final';
  issue_date: string;
  due_date: string | null;
  currency: string;
  subtotal: number;
  discount_type: DiscountType;
  discount_value: number;
  discount_total: number;
  tax_rate: number;
  tax_total: number;
  total: number;
  amount_paid: number;
  balance_due: number;
  payment_terms: string | null;
  notes: string | null;
  sent_at: Timestamp | null;
  paid_at: Timestamp | null;
  last_reminder_at: Timestamp | null;
  reminder_count: number;
  locale: string;
  is_demo: Bool;
  created_by: number | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type PaymentMethod = 'cash' | 'transfer' | 'ccp' | 'card' | 'other';

export type PaymentRow = {
  id: number;
  invoice_id: number | null;
  client_id: number | null;
  project_id: number | null;
  amount: number;
  currency: string;
  method: PaymentMethod;
  reference: string | null;
  paid_at: string;
  status: 'pending' | 'confirmed' | 'refunded';
  notes: string | null;
  is_demo: Bool;
  recorded_by: number | null;
  created_at: Timestamp;
};

export type ContractTemplateRow = {
  id: number;
  name: string;
  description: string | null;
  body: string;
  locale: string;
  is_default: Bool;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type ContractRow = {
  id: number;
  number: string;
  template_id: number | null;
  client_id: number | null;
  project_id: number | null;
  title: string;
  body: string;
  variables: string | null;
  status: 'draft' | 'sent' | 'signed' | 'cancelled';
  issue_date: string;
  start_date: string | null;
  delivery_date: string | null;
  amount: number;
  currency: string;
  signed_at: Timestamp | null;
  locale: string;
  is_demo: Bool;
  created_by: number | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type RevisionRow = {
  id: number;
  project_id: number;
  index_number: number;
  title: string | null;
  description: string | null;
  requested_by: string | null;
  status: 'open' | 'in_progress' | 'done' | 'rejected';
  is_extra: Bool;
  extra_cost: number;
  currency: string;
  extra_invoice_id: number | null;
  requested_at: Timestamp;
  completed_at: Timestamp | null;
  is_demo: Bool;
  created_at: Timestamp;
};

export type FeedbackDecision = 'approved' | 'changes_requested' | 'comment';

export type FeedbackRow = {
  id: number;
  project_id: number;
  client_id: number | null;
  stage_id: number | null;
  task_id: number | null;
  author_label: string | null;
  comment: string | null;
  rating: number | null;
  decision: FeedbackDecision;
  status: 'new' | 'acknowledged' | 'resolved';
  source: string;
  is_demo: Bool;
  created_at: Timestamp;
  resolved_at: Timestamp | null;
};

export type ExpenseCategory =
  | 'software' | 'hosting' | 'advertising' | 'hardware'
  | 'transport' | 'training' | 'subcontracting' | 'other';

export type ExpenseRow = {
  id: number;
  label: string;
  category: ExpenseCategory;
  amount: number;
  currency: string;
  spent_at: string;
  supplier: string | null;
  project_id: number | null;
  receipt_file_id: number | null;
  is_recurring: Bool;
  notes: string | null;
  is_demo: Bool;
  created_by: number | null;
  created_at: Timestamp;
};

export type SubscriptionRow = {
  id: number;
  service_name: string;
  category: 'software' | 'hosting' | 'ai' | 'saas' | 'marketing' | 'other';
  amount: number;
  currency: string;
  frequency: 'monthly' | 'quarterly' | 'yearly' | 'one_time';
  renewal_date: string | null;
  status: 'active' | 'paused' | 'cancelled';
  auto_renew: Bool;
  url: string | null;
  notes: string | null;
  is_demo: Bool;
  created_at: Timestamp;
  updated_at: Timestamp;
};

// ── Public content ───────────────────────────────────────────────────────

export type ServiceFamily = 'web' | 'it' | 'marketing' | 'audiovisual' | 'ai';

export type ServiceRow = {
  id: number;
  slug: string;
  name: string;
  category_id: number | null;
  family: ServiceFamily;
  short_description: string | null;
  description: string | null;
  icon: string | null;
  bullet_points: string | null;
  deliverables: string | null;
  starting_price: number | null;
  currency: string;
  price_note: string | null;
  duration_note: string | null;
  position: number;
  is_published: Bool;
  is_featured: Bool;
  seo_title: string | null;
  seo_description: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type PublishStatus = 'draft' | 'published' | 'archived';

export type PortfolioProjectRow = {
  id: number;
  slug: string;
  title: string;
  subtitle: string | null;
  project_id: number | null;
  client_name: string | null;
  client_id: number | null;
  category_id: number | null;
  summary: string | null;
  description: string | null;
  challenge: string | null;
  objectives: string | null;
  solution: string | null;
  results: string | null;
  testimonial_quote: string | null;
  testimonial_author: string | null;
  testimonial_role: string | null;
  cover_file_id: number | null;
  cover_url: string | null;
  project_date: string | null;
  year: number | null;
  status: PublishStatus;
  delivery_status: string;
  technologies: string | null;
  services_done: string | null;
  links: string | null;
  videos: string | null;
  metrics: string | null;
  position: number;
  is_featured: Bool;
  is_demo: Bool;
  view_count: number;
  seo_title: string | null;
  seo_description: string | null;
  published_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type PortfolioMediaRow = {
  id: number;
  portfolio_id: number;
  file_id: number | null;
  url: string | null;
  kind: 'image' | 'video' | 'embed';
  caption: string | null;
  alt_text: string | null;
  position: number;
};

export type CaseStudyRow = {
  id: number;
  slug: string;
  portfolio_id: number | null;
  title: string;
  subtitle: string | null;
  problem: string | null;
  objectives: string | null;
  strategy: string | null;
  solution: string | null;
  development: string | null;
  tools_used: string | null;
  result: string | null;
  metrics: string | null;
  testimonial_quote: string | null;
  testimonial_author: string | null;
  cover_url: string | null;
  status: PublishStatus;
  reading_minutes: number | null;
  position: number;
  is_demo: Bool;
  seo_title: string | null;
  seo_description: string | null;
  published_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type BlogPostRow = {
  id: number;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string | null;
  cover_url: string | null;
  cover_file_id: number | null;
  author_id: number | null;
  author_name: string | null;
  category_id: number | null;
  status: PublishStatus;
  locale: string;
  seo_title: string | null;
  seo_description: string | null;
  reading_minutes: number | null;
  view_count: number;
  is_featured: Bool;
  is_demo: Bool;
  published_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type ProfileEntryKind =
  | 'experience' | 'education' | 'certification' | 'skill' | 'tool' | 'interest' | 'expertise';

export type ProfileEntryRow = {
  id: number;
  kind: ProfileEntryKind;
  title: string;
  organisation: string | null;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  is_current: Bool;
  description: string | null;
  level: number | null;
  icon: string | null;
  url: string | null;
  position: number;
  is_published: Bool;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type TestimonialRow = {
  id: number;
  author_name: string;
  author_role: string | null;
  company: string | null;
  avatar_url: string | null;
  quote: string;
  rating: number | null;
  client_id: number | null;
  project_id: number | null;
  locale: string;
  is_published: Bool;
  is_demo: Bool;
  position: number;
  created_at: Timestamp;
};

export type FaqRow = {
  id: number;
  question: string;
  answer: string;
  category: string | null;
  position: number;
  is_published: Bool;
  locale: string;
  created_at: Timestamp;
};

// ── Briefs, moodboards ───────────────────────────────────────────────────

export type BriefStatus = 'draft' | 'sent' | 'in_progress' | 'completed' | 'expired';

export type BriefRow = {
  id: number;
  token: string;
  title: string;
  client_id: number | null;
  project_id: number | null;
  lead_id: number | null;
  template_key: string;
  status: BriefStatus;
  locale: string;
  intro_text: string | null;
  expires_at: Timestamp | null;
  completed_at: Timestamp | null;
  last_activity_at: Timestamp | null;
  is_demo: Bool;
  created_by: number | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type BriefInputType =
  | 'text' | 'textarea' | 'select' | 'multiselect' | 'number'
  | 'date' | 'color' | 'url' | 'file' | 'rating';

export type BriefQuestionRow = {
  id: number;
  brief_id: number;
  key: string;
  label: string;
  help_text: string | null;
  input_type: BriefInputType;
  options: string | null;
  is_required: Bool;
  position: number;
  section: string | null;
};

export type BriefResponseRow = {
  id: number;
  brief_id: number;
  question_id: number | null;
  question_key: string;
  value: string | null;
  file_id: number | null;
  answered_at: Timestamp;
};

export type MoodboardRow = {
  id: number;
  title: string;
  slug: string;
  project_id: number | null;
  client_id: number | null;
  description: string | null;
  share_token: string | null;
  background: string | null;
  is_demo: Bool;
  created_by: number | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type MoodboardItemRow = {
  id: number;
  moodboard_id: number;
  kind: 'image' | 'text' | 'color' | 'link' | 'note';
  file_id: number | null;
  url: string | null;
  source_url: string | null;
  content: string | null;
  color: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  z_index: number;
  notes: string | null;
  created_at: Timestamp;
};

// ── Communication ────────────────────────────────────────────────────────

export type MessageTemplateRow = {
  id: number;
  key: string;
  name: string;
  channel: 'email' | 'whatsapp' | 'internal';
  subject: string | null;
  body: string;
  locale: string;
  description: string | null;
  is_system: Bool;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type MessageStatus = 'draft' | 'queued' | 'sent' | 'failed' | 'received';

export type MessageRow = {
  id: number;
  direction: 'outbound' | 'inbound';
  channel: 'email' | 'whatsapp' | 'internal';
  template_key: string | null;
  client_id: number | null;
  project_id: number | null;
  lead_id: number | null;
  invoice_id: number | null;
  to_name: string | null;
  to_address: string | null;
  from_address: string | null;
  subject: string | null;
  body: string | null;
  status: MessageStatus;
  error: string | null;
  sent_at: Timestamp | null;
  read_at: Timestamp | null;
  is_demo: Bool;
  created_by: number | null;
  created_at: Timestamp;
};

export type ContactSubmissionRow = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  service: string | null;
  budget: string | null;
  deadline: string | null;
  message: string | null;
  file_id: number | null;
  locale: string;
  source: 'contact_form' | 'project_request' | 'chatbot';
  payload: string | null;
  ip_address: string | null;
  user_agent: string | null;
  lead_id: number | null;
  status: 'new' | 'read' | 'converted' | 'spam';
  created_at: Timestamp;
};

export type NotificationKind =
  | 'task' | 'deadline' | 'payment_received' | 'payment_overdue' | 'feedback'
  | 'revision' | 'client' | 'message' | 'form' | 'project' | 'subscription' | 'system';

export type NotificationRow = {
  id: number;
  user_id: number | null;
  kind: NotificationKind;
  title: string;
  body: string | null;
  severity: 'info' | 'success' | 'warning' | 'danger';
  url: string | null;
  entity_type: string | null;
  entity_id: number | null;
  dedupe_key: string | null;
  read_at: Timestamp | null;
  created_at: Timestamp;
};

export type CalendarEventKind =
  | 'meeting' | 'delivery' | 'deadline' | 'task' | 'payment' | 'revision' | 'reminder' | 'other';

export type CalendarEventRow = {
  id: number;
  title: string;
  description: string | null;
  kind: CalendarEventKind;
  starts_at: Timestamp;
  ends_at: Timestamp | null;
  all_day: Bool;
  location: string | null;
  url: string | null;
  client_id: number | null;
  project_id: number | null;
  task_id: number | null;
  color: string | null;
  status: 'tentative' | 'confirmed' | 'cancelled';
  is_demo: Bool;
  created_by: number | null;
  created_at: Timestamp;
};

// ── AI & automation ──────────────────────────────────────────────────────

export type AiConversationRow = {
  id: number;
  surface: 'public' | 'admin' | 'project' | 'portfolio';
  title: string | null;
  user_id: number | null;
  visitor_key: string | null;
  project_id: number | null;
  lead_id: number | null;
  locale: string;
  input_tokens: number;
  output_tokens: number;
  model: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type AiMessageRow = {
  id: number;
  conversation_id: number;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_name: string | null;
  tool_payload: string | null;
  tool_status: 'proposed' | 'confirmed' | 'executed' | 'rejected' | 'failed' | null;
  tokens: number | null;
  created_at: Timestamp;
};

export type AutomationRow = {
  id: number;
  key: string;
  name: string;
  description: string | null;
  trigger_type: 'event' | 'schedule';
  trigger_key: string;
  config: string | null;
  is_enabled: Bool;
  is_system: Bool;
  last_run_at: Timestamp | null;
  run_count: number;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type AutomationRunRow = {
  id: number;
  automation_id: number | null;
  automation_key: string;
  trigger_key: string | null;
  status: 'success' | 'skipped' | 'failed';
  actions_count: number;
  summary: string | null;
  error: string | null;
  payload: string | null;
  duration_ms: number | null;
  created_at: Timestamp;
};

export type BackupRow = {
  id: number;
  filename: string;
  kind: 'database' | 'files' | 'full';
  size_bytes: number;
  checksum: string | null;
  note: string | null;
  created_by: number | null;
  created_at: Timestamp;
};

export type SearchIndexRow = {
  entity_type: string;
  entity_id: number;
  title: string;
  subtitle: string | null;
  body: string | null;
  url: string;
  icon: string | null;
  weight: number;
  updated_at: Timestamp;
};
