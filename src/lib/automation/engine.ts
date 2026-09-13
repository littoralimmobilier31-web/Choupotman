// Server-only by construction: this module imports Node built-ins / native
// bindings, which the bundler refuses in a client component. The `server-only`
// guard is deliberately NOT used here so the CLI scripts in scripts/ can
// import it directly (that package throws outside the Next bundler).
import { getSettingBool, getSettingNumber } from '@/lib/db/repositories/settings';
import * as automationsRepo from '@/lib/db/repositories/automations';
import * as projectsRepo from '@/lib/db/repositories/projects';
import * as financeRepo from '@/lib/db/repositories/finance';
import * as commsRepo from '@/lib/db/repositories/comms';
import * as clientsRepo from '@/lib/db/repositories/clients';
import * as leadsRepo from '@/lib/db/repositories/leads';
import * as filesRepo from '@/lib/db/repositories/files';
import * as briefsRepo from '@/lib/db/repositories/briefs';
import * as expensesRepo from '@/lib/db/repositories/expenses';
import { logActivity } from '@/lib/db/repositories/activity';
import { pruneSessions } from '@/lib/auth/session';
import { pruneIndex } from '@/lib/db/repositories/search';
import { formatMoney } from '@/lib/i18n/format';
import { money } from '@/lib/money';
import type { AutomationEventKey } from './registry';
import { findAutomationDefinition } from './registry';

/**
 * Automation engine.
 *
 * `emit()` is called from the places where things actually happen (a project is
 * created, a payment is recorded). It looks the rule up, checks it is enabled,
 * runs it, and records the outcome — so a rule failing can never break the user
 * action that triggered it: the write has already committed, and the failure is
 * visible in the automation run log instead of as a 500.
 *
 * `runDaily()` is the scheduled sweep. It is idempotent thanks to notification
 * dedupe keys, so running it twice in a day produces no duplicates.
 */

export type ActionLog = string[];

export type AutomationOutcome = {
  automation: string;
  status: 'success' | 'skipped' | 'failed';
  actions: ActionLog;
  error?: string;
};

type EventPayloads = {
  'project.created': { projectId: number; actorLabel?: string };
  'project.status_changed': { projectId: number; from: string; to: string; actorLabel?: string };
  'project.delivered': { projectId: number; actorLabel?: string };
  'task.completed': { taskId: number; actorLabel?: string };
  'revision.created': { projectId: number; revisionId: number; isExtra: boolean; extraCost: number; indexNumber: number };
  'feedback.received': { projectId: number; feedbackId: number };
  'feedback.approved': { projectId: number; feedbackId: number };
  'invoice.paid': { invoiceId: number };
  'payment.recorded': { paymentId: number; invoiceId?: number | null };
  'quote.accepted': { quoteId: number };
  'brief.completed': { briefId: number };
  'lead.created': { leadId: number };
  'contact.received': { submissionId: number; leadId?: number | null; source: string };
};

/** Runs every enabled rule bound to an event. Never throws. */
export function emit<K extends AutomationEventKey>(
  event: K,
  payload: EventPayloads[K],
): AutomationOutcome[] {
  const rules = automationsRepo.automationsFor(event);
  const outcomes: AutomationOutcome[] = [];

  for (const rule of rules) {
    const startedAt = Date.now();
    try {
      const handler = HANDLERS[rule.key];
      if (!handler) {
        outcomes.push({ automation: rule.key, status: 'skipped', actions: ['Aucun gestionnaire enregistré'] });
        continue;
      }
      const actions = handler(payload as never, automationsRepo.automationConfig<Record<string, unknown>>(rule.key, {}));
      const status: AutomationOutcome['status'] = actions.length > 0 ? 'success' : 'skipped';
      automationsRepo.recordRun({
        automationKey: rule.key,
        triggerKey: event,
        status,
        actionsCount: actions.length,
        summary: actions.join(' · ') || 'Aucune action nécessaire',
        payload,
        durationMs: Date.now() - startedAt,
      });
      outcomes.push({ automation: rule.key, status, actions });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      automationsRepo.recordRun({
        automationKey: rule.key,
        triggerKey: event,
        status: 'failed',
        summary: 'Échec de l’automatisation',
        error: message,
        payload,
        durationMs: Date.now() - startedAt,
      });
      outcomes.push({ automation: rule.key, status: 'failed', actions: [], error: message });
    }
  }

  return outcomes;
}

// ── Event handlers ───────────────────────────────────────────────────────

type Handler = (payload: never, config: Record<string, unknown>) => ActionLog;

function bool(config: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = config[key];
  return typeof value === 'boolean' ? value : fallback;
}

function num(config: Record<string, unknown>, key: string, fallback: number): number {
  const value = Number(config[key]);
  return Number.isFinite(value) ? value : fallback;
}

function strings(config: Record<string, unknown>, key: string, fallback: string[]): string[] {
  const value = config[key];
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : fallback;
}

const HANDLERS: Record<string, Handler> = {
  /** SI projet créé → créer étapes + tâches + dossiers. */
  project_scaffold: (payload: EventPayloads['project.created'], config) => {
    const actions: ActionLog = [];
    const project = projectsRepo.findProject(payload.projectId);
    if (!project) return actions;

    if (bool(config, 'createStages', true) && getSettingBool('automation.auto_create_stages', true)) {
      const created = projectsRepo.createDefaultStages(
        project.id,
        strings(config, 'stages', projectsRepo.DEFAULT_STAGES),
      );
      if (created > 0) actions.push(`${created} étape(s) créée(s)`);
    }

    if (bool(config, 'createTasks', true)) {
      const stages = projectsRepo.listStages(project.id);
      const firstStage = stages[0];
      const starters = strings(config, 'starterTasks', []);
      for (const title of starters) {
        projectsRepo.createTask({
          project_id: project.id,
          stage_id: firstStage?.id ?? null,
          title,
          priority: 'medium',
          is_demo: project.is_demo === 1,
        });
      }
      if (starters.length > 0) actions.push(`${starters.length} tâche(s) de départ créée(s)`);
    }

    if (bool(config, 'createFolders', true) && getSettingBool('automation.auto_create_folders', true)) {
      const template = filesRepo.defaultFolderTemplate();
      const created = filesRepo.applyFolderTemplate({
        projectId: project.id,
        clientId: project.client_id,
        rootName: project.title,
        templateId: template?.id,
      });
      if (created > 0) actions.push(`Arborescence créée (${created} dossiers)`);
    }

    if (actions.length > 0) {
      projectsRepo.addProjectEvent({
        projectId: project.id,
        kind: 'created',
        title: 'Projet structuré automatiquement',
        body: actions.join(' · '),
        actorLabel: 'Automatisation',
      });
      commsRepo.notify({
        kind: 'project',
        title: `Projet structuré : ${project.title}`,
        body: actions.join(' · '),
        url: `/espace-admin/projets/${project.id}`,
        entityType: 'project',
        entityId: project.id,
        severity: 'success',
      });
    }
    return actions;
  },

  /** SI révision > limite → supplément + facture complémentaire. */
  revision_overflow: (payload: EventPayloads['revision.created'], config) => {
    const actions: ActionLog = [];
    if (!payload.isExtra) return actions;

    const project = projectsRepo.findProject(payload.projectId);
    if (!project) return actions;

    const summary = projectsRepo.getRevisionSummary(project.id);
    actions.push(`Révision #${payload.indexNumber} au-delà du forfait (${summary.included} incluse(s))`);

    if (bool(config, 'createDraftInvoice', true) && payload.extraCost > 0) {
      const invoiceId = financeRepo.createInvoice({
        client_id: project.client_id,
        project_id: project.id,
        title: `Révision supplémentaire #${payload.indexNumber} — ${project.title}`,
        status: 'draft',
        kind: 'revision_extra',
        currency: project.currency,
        is_demo: project.is_demo === 1,
        items: [{
          label: `Révision supplémentaire #${payload.indexNumber}`,
          description: `Au-delà des ${summary.included} révisions incluses au forfait.`,
          quantity: 1,
          unit: 'forfait',
          unit_price: payload.extraCost,
        }],
      });
      projectsRepo.updateRevision(payload.revisionId, { extra_invoice_id: invoiceId });
      actions.push(`Facture complémentaire créée en brouillon (${formatMoney(payload.extraCost, project.currency)})`);
    }

    if (bool(config, 'notify', true)) {
      commsRepo.notify({
        kind: 'revision',
        title: `Révision hors forfait — ${project.title}`,
        body: `Révision #${payload.indexNumber} · supplément ${formatMoney(payload.extraCost, project.currency)}`,
        url: `/espace-admin/projets/${project.id}`,
        entityType: 'project',
        entityId: project.id,
        severity: 'warning',
        dedupeKey: `revision-extra-${payload.revisionId}`,
      });
      actions.push('Notification envoyée');
    }

    projectsRepo.addProjectEvent({
      projectId: project.id,
      kind: 'revision',
      title: `Révision #${payload.indexNumber} hors forfait`,
      body: actions.join(' · '),
      actorLabel: 'Automatisation',
      entityType: 'revision',
      entityId: payload.revisionId,
    });

    return actions;
  },

  /** SI client valide livraison → changer statut projet. */
  feedback_approval: (payload: EventPayloads['feedback.approved'], config) => {
    const actions: ActionLog = [];
    const project = projectsRepo.findProject(payload.projectId);
    if (!project) return actions;

    const target = (config.targetStatus as projectsRepo.ProjectWithClient['status']) ?? 'completed';

    if (bool(config, 'onlyWhenAllTasksDone', true)) {
      const open = projectsRepo.countTasks({ projectId: project.id, status: 'open' });
      if (open > 0) {
        actions.push(`Validation reçue — ${open} tâche(s) encore ouverte(s), statut inchangé`);
        projectsRepo.addProjectEvent({
          projectId: project.id,
          kind: 'feedback',
          title: 'Livraison validée par le client',
          body: actions[0] ?? null,
          actorLabel: 'Automatisation',
        });
        return actions;
      }
    }

    if (project.status !== target) {
      projectsRepo.updateProject(project.id, { status: target });
      actions.push(`Statut du projet passé à « ${projectsRepo.projectStatusLabel(target)} »`);
    }

    projectsRepo.addProjectEvent({
      projectId: project.id,
      kind: 'feedback',
      title: 'Livraison validée par le client',
      body: actions.join(' · ') || 'Validation enregistrée',
      actorLabel: 'Automatisation',
      entityType: 'feedback',
      entityId: payload.feedbackId,
    });

    commsRepo.notify({
      kind: 'feedback',
      title: `Livraison validée — ${project.title}`,
      body: actions.join(' · '),
      url: `/espace-admin/projets/${project.id}`,
      entityType: 'project',
      entityId: project.id,
      severity: 'success',
      dedupeKey: `feedback-approved-${payload.feedbackId}`,
    });
    actions.push('Notification envoyée');

    return actions;
  },

  /** SI brief terminé → créer projet. */
  brief_to_project: (payload: EventPayloads['brief.completed'], config) => {
    const actions: ActionLog = [];
    const brief = briefsRepo.findBrief(payload.briefId);
    if (!brief) return actions;

    const answers = briefsRepo.latestResponses(brief.id);

    if (bool(config, 'createProject', true) && !brief.project_id) {
      let clientId = brief.client_id;

      // No client yet: create one from the brief's own contact answers.
      if (!clientId && (answers.contact_name || answers.company)) {
        clientId = clientsRepo.createClient({
          name: answers.contact_name || answers.company || 'Client (brief)',
          company: answers.company ?? null,
          email: answers.email ?? null,
          phone: answers.phone ?? null,
          source: 'brief',
          notes: 'Créé automatiquement depuis un brief client.',
        });
        actions.push('Fiche client créée');
      }

      const projectId = projectsRepo.createProject({
        title: answers.project_name || brief.title.replace(/^Brief\s*—?\s*/i, '') || 'Nouveau projet',
        client_id: clientId,
        description: answers.project_description ?? null,
        status: 'planning',
        notes: [
          answers.objectives ? `Objectifs : ${answers.objectives}` : null,
          answers.budget ? `Budget indiqué : ${answers.budget}` : null,
          answers.deadline ? `Délai souhaité : ${answers.deadline}` : null,
        ].filter(Boolean).join('\n'),
        revisions_included: getSettingNumber('finance.default_revisions', 3),
        revision_extra_cost: getSettingNumber('finance.revision_extra_cost', 0),
      });

      briefsRepo.updateBrief(brief.id, { projectId, clientId });
      actions.push('Projet créé depuis le brief');

      // The new project runs through the scaffolding rule as well.
      emit('project.created', { projectId, actorLabel: 'Automatisation (brief)' });

      projectsRepo.addProjectEvent({
        projectId,
        kind: 'brief',
        title: 'Brief client reçu',
        body: `${Object.keys(answers).length} réponse(s) enregistrée(s).`,
        actorLabel: 'Automatisation',
        entityType: 'brief',
        entityId: brief.id,
      });
    }

    if (bool(config, 'notify', true)) {
      commsRepo.notify({
        kind: 'form',
        title: `Brief complété : ${brief.title}`,
        body: actions.join(' · ') || 'Toutes les réponses sont disponibles.',
        url: `/espace-admin/briefs/${brief.id}`,
        entityType: 'brief',
        entityId: brief.id,
        severity: 'success',
        dedupeKey: `brief-completed-${brief.id}`,
      });
      actions.push('Notification envoyée');
    }

    return actions;
  },

  /** SI nouveau prospect → fiche CRM + score + accusé de réception. */
  lead_intake: (payload: EventPayloads['contact.received'], config) => {
    const actions: ActionLog = [];
    const submission = commsRepo.findContactSubmission(payload.submissionId);
    if (!submission) return actions;

    let leadId = payload.leadId ?? submission.lead_id;

    if (!leadId) {
      leadId = leadsRepo.createLead({
        name: submission.name,
        company: submission.company,
        email: submission.email,
        phone: submission.phone,
        source: submission.source,
        service_interest: submission.service,
        budget_range: submission.budget,
        deadline_hint: submission.deadline,
        message: submission.message,
        payload: submission.payloadData,
      });
      commsRepo.linkSubmissionToLead(submission.id, leadId);
      actions.push('Fiche prospect créée');
    }

    const lead = leadsRepo.findLead(leadId);
    if (lead) {
      const threshold = num(config, 'autoQualifyScore', 60);
      if (lead.score >= threshold && lead.stage === 'new') {
        leadsRepo.moveLeadStage(lead.id, 'qualified');
        actions.push(`Prospect qualifié automatiquement (score ${lead.score})`);
      } else {
        actions.push(`Score de qualification : ${lead.score}/100`);
      }
    }

    if (bool(config, 'sendAcknowledgement', true) && submission.email) {
      const template = commsRepo.findMessageTemplate('form_confirmation');
      if (template) {
        commsRepo.createMessage({
          channel: 'email',
          templateKey: template.key,
          leadId,
          toName: submission.name,
          toAddress: submission.email,
          subject: template.subject ?? 'Votre demande a bien été reçue',
          body: commsRepo.renderTemplate(template.body, {
            client_name: submission.name,
            owner_name: 'Boubaker Choupotman',
            site_url: 'choupotman.com',
          }),
          status: 'queued',
        });
        actions.push('Accusé de réception préparé');
      }
    }

    if (bool(config, 'notify', true)) {
      commsRepo.notify({
        kind: 'form',
        title: `Nouvelle demande : ${submission.name}`,
        body: [submission.company, submission.service, submission.budget].filter(Boolean).join(' · '),
        url: leadId ? `/espace-admin/prospects/${leadId}` : '/espace-admin/demandes',
        entityType: 'lead',
        entityId: leadId,
        severity: 'info',
        dedupeKey: `submission-${submission.id}`,
      });
      actions.push('Notification envoyée');
    }

    return actions;
  },

  /** SI paiement reçu → recalcul + notification + timeline. */
  payment_followup: (payload: EventPayloads['payment.recorded'], config) => {
    const actions: ActionLog = [];
    const payment = financeRepo.findPayment(payload.paymentId);
    if (!payment) return actions;

    if (payment.invoice_id) {
      financeRepo.recalcInvoice(payment.invoice_id);
      actions.push('Facture recalculée');
    }

    const invoice = payment.invoice_id ? financeRepo.findInvoice(payment.invoice_id) : null;

    if (bool(config, 'notify', true)) {
      commsRepo.notify({
        kind: 'payment_received',
        title: `Paiement reçu : ${formatMoney(payment.amount, payment.currency)}`,
        body: invoice
          ? `Facture ${invoice.number} · solde ${formatMoney(invoice.balance_due, invoice.currency)}`
          : null,
        url: invoice ? `/espace-admin/factures/${invoice.id}` : '/espace-admin/paiements',
        entityType: 'payment',
        entityId: payment.id,
        severity: 'success',
        dedupeKey: `payment-${payment.id}`,
      });
      actions.push('Notification envoyée');
    }

    if (payment.project_id) {
      projectsRepo.addProjectEvent({
        projectId: payment.project_id,
        kind: 'payment',
        title: `Paiement reçu — ${formatMoney(payment.amount, payment.currency)}`,
        body: invoice ? `Facture ${invoice.number}` : null,
        actorLabel: 'Automatisation',
        entityType: 'payment',
        entityId: payment.id,
      });
      actions.push('Timeline mise à jour');
    }

    return actions;
  },

  /** SI devis accepté → facture en brouillon. */
  quote_accepted: (payload: EventPayloads['quote.accepted'], config) => {
    const actions: ActionLog = [];
    const quote = financeRepo.findQuote(payload.quoteId);
    if (!quote) return actions;

    // An invoice already derived from this quote means nothing to do.
    const existing = financeRepo.listInvoices({ limit: 500 }).some((i) => i.quote_id === quote.id);
    if (existing) {
      actions.push('Facture déjà existante pour ce devis');
      return actions;
    }

    if (bool(config, 'createDraftInvoice', true)) {
      const invoiceId = financeRepo.invoiceFromQuote(quote.id);
      if (invoiceId) actions.push('Facture créée en brouillon depuis le devis');
    }

    if (bool(config, 'notify', true)) {
      commsRepo.notify({
        kind: 'project',
        title: `Devis accepté : ${quote.number}`,
        body: `${quote.client_name ?? 'Client'} · ${formatMoney(quote.total, quote.currency)}`,
        url: `/espace-admin/devis/${quote.id}`,
        entityType: 'quote',
        entityId: quote.id,
        severity: 'success',
        dedupeKey: `quote-accepted-${quote.id}`,
      });
      actions.push('Notification envoyée');
    }

    if (quote.project_id) {
      projectsRepo.addProjectEvent({
        projectId: quote.project_id,
        kind: 'quote',
        title: `Devis ${quote.number} accepté`,
        body: formatMoney(quote.total, quote.currency),
        actorLabel: 'Automatisation',
        entityType: 'quote',
        entityId: quote.id,
      });
    }

    return actions;
  },

  /** SI tâche terminée → avancement + clôture d'étape. */
  project_progress: (payload: EventPayloads['task.completed'], config) => {
    const actions: ActionLog = [];
    const task = projectsRepo.findTask(payload.taskId);
    if (!task?.project_id) return actions;

    const progress = projectsRepo.recalcProjectProgress(task.project_id);
    actions.push(`Avancement recalculé : ${progress}%`);

    if (bool(config, 'closeStageWhenAllTasksDone', true) && task.stage_id) {
      const open = projectsRepo.listTasks({ stageId: task.stage_id, status: 'open', limit: 1 });
      if (open.length === 0) {
        projectsRepo.updateStage(task.stage_id, { status: 'done' });
        actions.push(`Étape « ${task.stage_name ?? '—'} » clôturée`);
        projectsRepo.addProjectEvent({
          projectId: task.project_id,
          kind: 'stage',
          title: `Étape terminée : ${task.stage_name ?? '—'}`,
          actorLabel: 'Automatisation',
        });
      }
    }

    return actions;
  },
};

// ── Scheduled sweep ──────────────────────────────────────────────────────

export type DailyReport = {
  ranAt: string;
  outcomes: AutomationOutcome[];
  totalActions: number;
};

/**
 * Daily sweep. Safe to run repeatedly: every notification carries a dedupe key
 * derived from the underlying fact plus the day, so a second run on the same day
 * inserts nothing new.
 */
export function runDaily(options: { force?: boolean } = {}): DailyReport {
  const today = new Date().toISOString().slice(0, 10);
  const outcomes: AutomationOutcome[] = [];

  if (!options.force && automationsRepo.hasRunToday('daily')) {
    return { ranAt: new Date().toISOString(), outcomes: [], totalActions: 0 };
  }

  const scheduled = automationsRepo.automationsFor('daily');

  for (const rule of scheduled) {
    const startedAt = Date.now();
    try {
      const config = automationsRepo.automationConfig<Record<string, unknown>>(rule.key, {});
      const actions = DAILY_HANDLERS[rule.key]?.(config, today) ?? [];
      const status: AutomationOutcome['status'] = actions.length > 0 ? 'success' : 'skipped';
      automationsRepo.recordRun({
        automationKey: rule.key,
        triggerKey: 'daily',
        status,
        actionsCount: actions.length,
        summary: actions.join(' · ') || 'Rien à signaler',
        durationMs: Date.now() - startedAt,
      });
      outcomes.push({ automation: rule.key, status, actions });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      automationsRepo.recordRun({
        automationKey: rule.key,
        triggerKey: 'daily',
        status: 'failed',
        summary: 'Échec de la tâche planifiée',
        error: message,
        durationMs: Date.now() - startedAt,
      });
      outcomes.push({ automation: rule.key, status: 'failed', actions: [], error: message });
    }
  }

  const totalActions = outcomes.reduce((acc, o) => acc + o.actions.length, 0);

  logActivity({
    action: 'automation',
    actorLabel: 'Automatisation',
    summary: `Tâches quotidiennes exécutées — ${totalActions} action(s)`,
    metadata: { outcomes },
  });

  return { ranAt: new Date().toISOString(), outcomes, totalActions };
}

type DailyHandler = (config: Record<string, unknown>, today: string) => ActionLog;

const DAILY_HANDLERS: Record<string, DailyHandler> = {
  /** SI deadline < N jours → notification. */
  deadline_watch: (config, today) => {
    const actions: ActionLog = [];
    const warningDays = num(config, 'warningDays', getSettingNumber('automation.deadline_warning_days', 3));
    const horizon = new Date(Date.now() + warningDays * 86400000).toISOString().slice(0, 10);

    if (bool(config, 'includeProjects', true)) {
      for (const project of projectsRepo.listProjects({ status: 'active', limit: 200 })) {
        if (!project.delivery_date) continue;
        const late = project.delivery_date < today;
        if (!late && project.delivery_date > horizon) continue;

        const created = commsRepo.notify({
          kind: 'deadline',
          title: late
            ? `Livraison en retard : ${project.title}`
            : `Livraison proche : ${project.title}`,
          body: `Date de livraison : ${project.delivery_date}${project.client_name ? ` · ${project.client_name}` : ''}`,
          url: `/espace-admin/projets/${project.id}`,
          entityType: 'project',
          entityId: project.id,
          severity: late ? 'danger' : 'warning',
          dedupeKey: `deadline-project-${project.id}-${today}`,
        });
        if (created) actions.push(`${late ? 'Retard' : 'Échéance'} signalé — ${project.title}`);
      }
    }

    if (bool(config, 'includeTasks', true)) {
      for (const task of projectsRepo.listTasks({ status: 'open', dueBefore: horizon, limit: 200 })) {
        if (!task.due_date) continue;
        const late = task.due_date < today;
        const created = commsRepo.notify({
          kind: 'deadline',
          title: late ? `Tâche en retard : ${task.title}` : `Tâche à échéance : ${task.title}`,
          body: [task.project_title, `Échéance ${task.due_date}`].filter(Boolean).join(' · '),
          url: task.project_id ? `/espace-admin/projets/${task.project_id}?tache=${task.id}` : '/espace-admin/taches',
          entityType: 'task',
          entityId: task.id,
          severity: late ? 'danger' : 'warning',
          dedupeKey: `deadline-task-${task.id}-${today}`,
        });
        if (created) actions.push(`${late ? 'Retard' : 'Échéance'} signalé — ${task.title}`);
      }
    }

    return actions;
  },

  /** SI facture en retard → notification + relance. */
  invoice_overdue: (config, today) => {
    const actions: ActionLog = [];
    const changed = financeRepo.refreshOverdueInvoices();
    if (changed > 0) actions.push(`${changed} facture(s) passée(s) en retard`);

    const reminderAfter = num(config, 'reminderAfterDays', getSettingNumber('automation.invoice_reminder_days', 3));
    const maxReminders = num(config, 'maxReminders', 3);

    for (const invoice of financeRepo.listInvoices({ status: 'overdue', limit: 200 })) {
      const created = commsRepo.notify({
        kind: 'payment_overdue',
        title: `Facture en retard : ${invoice.number}`,
        body: [
          invoice.client_name,
          `${formatMoney(invoice.balance_due, invoice.currency)} dus`,
          `${invoice.days_overdue} jour(s) de retard`,
        ].filter(Boolean).join(' · '),
        url: `/espace-admin/factures/${invoice.id}`,
        entityType: 'invoice',
        entityId: invoice.id,
        severity: 'danger',
        dedupeKey: `invoice-overdue-${invoice.id}-${today}`,
      });
      if (created) actions.push(`Retard signalé — ${invoice.number}`);

      // Prepare (never auto-send) a reminder: money leaving the building
      // always goes through a human.
      if (
        bool(config, 'prepareReminderDraft', true) &&
        invoice.days_overdue >= reminderAfter &&
        invoice.reminder_count < maxReminders
      ) {
        const client = invoice.client_id ? clientsRepo.findClient(invoice.client_id) : null;
        const template = commsRepo.findMessageTemplate('payment_reminder');
        if (template && client?.email) {
          commsRepo.createMessage({
            channel: 'email',
            templateKey: template.key,
            clientId: client.id,
            projectId: invoice.project_id,
            invoiceId: invoice.id,
            toName: client.name,
            toAddress: client.email,
            subject: commsRepo.renderTemplate(template.subject ?? '', { invoice_number: invoice.number }),
            body: commsRepo.renderTemplate(template.body, {
              client_name: client.name,
              invoice_number: invoice.number,
              invoice_due_date: invoice.due_date ?? '—',
              invoice_balance: formatMoney(invoice.balance_due, invoice.currency),
              days_overdue: invoice.days_overdue,
              owner_name: 'Boubaker Choupotman',
            }),
            status: 'draft',
          });
          actions.push(`Relance préparée — ${invoice.number}`);
        }
      }
    }

    return actions;
  },

  /** Renouvellements d'abonnement. */
  subscription_renewal: (config, today) => {
    const actions: ActionLog = [];
    const warningDays = num(config, 'warningDays', getSettingNumber('automation.renewal_warning_days', 7));

    for (const sub of expensesRepo.upcomingRenewals(warningDays)) {
      const created = commsRepo.notify({
        kind: 'subscription',
        title: `Renouvellement proche : ${sub.service_name}`,
        body: `${formatMoney(sub.amount, sub.currency)} · ${sub.renewal_date}`,
        url: '/espace-admin/abonnements',
        entityType: 'subscription',
        entityId: sub.id,
        severity: sub.days_until <= 0 ? 'warning' : 'info',
        dedupeKey: `renewal-${sub.id}-${sub.renewal_date}`,
      });
      if (created) actions.push(`Renouvellement signalé — ${sub.service_name}`);

      if (bool(config, 'autoRecordExpense', true) && sub.renewal_date && sub.renewal_date <= today) {
        const result = expensesRepo.rollRenewal(sub.id);
        if (result.rolled) actions.push(`Dépense enregistrée — ${sub.service_name}`);
      }
    }

    return actions;
  },

  /** Entretien : purge des données transitoires. */
  daily_housekeeping: (config) => {
    const actions: ActionLog = [];

    if (bool(config, 'pruneSessions', true)) {
      const removed = pruneSessions();
      if (removed > 0) actions.push(`${removed} session(s) expirée(s) supprimée(s)`);
    }

    const notificationDays = num(config, 'pruneNotificationsDays', 90);
    const notifications = commsRepo.pruneNotifications(notificationDays);
    if (notifications > 0) actions.push(`${notifications} notification(s) archivée(s)`);

    const runDays = num(config, 'pruneAutomationRunsDays', 90);
    const runs = automationsRepo.pruneRuns(runDays);
    if (runs > 0) actions.push(`${runs} historique(s) d’automatisation purgé(s)`);

    const orphans = pruneIndex();
    if (orphans > 0) actions.push(`${orphans} entrée(s) d’index orpheline(s) nettoyée(s)`);

    return actions;
  },
};

/** Human-readable "SI … ALORS …" description for the admin UI. */
export function describeAutomation(key: string): { condition: string; effects: string[] } | null {
  const definition = findAutomationDefinition(key);
  if (!definition) return null;
  const CONDITIONS: Record<string, string> = {
    'project.created': 'Un projet est créé',
    'project.status_changed': 'Le statut d’un projet change',
    'project.delivered': 'Un projet est livré',
    'task.completed': 'Une tâche est terminée',
    'revision.created': 'Une révision est demandée',
    'feedback.received': 'Un feedback client est reçu',
    'feedback.approved': 'Le client valide une livraison',
    'invoice.paid': 'Une facture est payée',
    'payment.recorded': 'Un paiement est enregistré',
    'quote.accepted': 'Un devis est accepté',
    'brief.completed': 'Un brief client est complété',
    'lead.created': 'Un prospect est créé',
    'contact.received': 'Une demande est reçue',
    daily: 'Chaque jour',
  };
  return {
    condition: CONDITIONS[definition.triggerKey] ?? definition.triggerKey,
    effects: definition.effect,
  };
}

export { money };
