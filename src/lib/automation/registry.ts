/**
 * Automation catalogue.
 *
 * Each entry declares *what* a rule reacts to; the handlers in `engine.ts`
 * declare *what it does*. Keeping the two apart means the admin can enable,
 * disable and re-configure rules without any of them being hard-coded into the
 * call sites that emit events.
 *
 * Two trigger types:
 *   • `event`    — emitted synchronously by a repository call
 *                  (`project.created`, `payment.recorded`, …)
 *   • `schedule` — run by the daily sweep (`/api/automatisations/run`, a cron,
 *                  or the first admin page view of the day)
 */

export type AutomationEventKey =
  | 'project.created'
  | 'project.status_changed'
  | 'project.delivered'
  | 'task.completed'
  | 'revision.created'
  | 'feedback.received'
  | 'feedback.approved'
  | 'invoice.paid'
  | 'payment.recorded'
  | 'quote.accepted'
  | 'brief.completed'
  | 'lead.created'
  | 'contact.received';

export type AutomationTriggerKey = AutomationEventKey | 'daily';

export type AutomationDefinition = {
  key: string;
  name: string;
  description: string;
  triggerType: 'event' | 'schedule';
  triggerKey: AutomationTriggerKey;
  enabledByDefault: boolean;
  /** Seeded once; the admin's edits are preserved on re-seed. */
  defaultConfig?: Record<string, unknown>;
  /** Shown in the admin so each rule reads as "SI … ALORS …". */
  effect: string[];
};

export const SYSTEM_AUTOMATIONS: AutomationDefinition[] = [
  {
    key: 'project_scaffold',
    name: 'Structurer un nouveau projet',
    description:
      'À la création d’un projet, génère les étapes de production, les tâches de départ et l’arborescence de dossiers.',
    triggerType: 'event',
    triggerKey: 'project.created',
    enabledByDefault: true,
    defaultConfig: {
      createStages: true,
      createTasks: true,
      createFolders: true,
      stages: ['Discovery', 'Planning', 'Design', 'Development', 'Testing', 'Revision', 'Delivery'],
      starterTasks: [
        'Recueillir le brief et les accès',
        'Valider le périmètre avec le client',
        'Préparer le planning de production',
      ],
    },
    effect: ['Créer les étapes', 'Créer les tâches de départ', 'Créer l’arborescence de dossiers', 'Ajouter à la timeline'],
  },
  {
    key: 'deadline_watch',
    name: 'Alerter avant une deadline',
    description:
      'Chaque jour, notifie les livraisons de projet et les tâches dont l’échéance approche ou est dépassée.',
    triggerType: 'schedule',
    triggerKey: 'daily',
    enabledByDefault: true,
    defaultConfig: { warningDays: 3, includeTasks: true, includeProjects: true },
    effect: ['Notifier les deadlines proches', 'Notifier les retards'],
  },
  {
    key: 'invoice_overdue',
    name: 'Suivre les factures en retard',
    description:
      'Chaque jour, passe les factures échues au statut « en retard », notifie et prépare une relance.',
    triggerType: 'schedule',
    triggerKey: 'daily',
    enabledByDefault: true,
    defaultConfig: { reminderAfterDays: 3, prepareReminderDraft: true, maxReminders: 3 },
    effect: ['Marquer en retard', 'Notifier', 'Préparer un brouillon de relance'],
  },
  {
    key: 'revision_overflow',
    name: 'Facturer les révisions hors forfait',
    description:
      'Quand une demande de révision dépasse le forfait inclus, calcule le supplément et prépare une facture complémentaire en brouillon.',
    triggerType: 'event',
    triggerKey: 'revision.created',
    enabledByDefault: true,
    defaultConfig: { createDraftInvoice: true, notify: true },
    effect: ['Calculer le supplément', 'Créer une facture en brouillon', 'Notifier', 'Ajouter à la timeline'],
  },
  {
    key: 'feedback_approval',
    name: 'Avancer le projet après validation',
    description:
      'Quand le client valide une livraison, fait passer le projet au statut adéquat et enregistre l’événement.',
    triggerType: 'event',
    triggerKey: 'feedback.approved',
    enabledByDefault: true,
    defaultConfig: { targetStatus: 'completed', onlyWhenAllTasksDone: true },
    effect: ['Changer le statut du projet', 'Ajouter à la timeline', 'Notifier'],
  },
  {
    key: 'brief_to_project',
    name: 'Transformer un brief en projet',
    description:
      'Quand un brief client est complété, crée le projet correspondant s’il n’existe pas encore et rattache les réponses.',
    triggerType: 'event',
    triggerKey: 'brief.completed',
    enabledByDefault: true,
    defaultConfig: { createProject: true, notify: true },
    effect: ['Créer le projet', 'Rattacher le brief', 'Notifier'],
  },
  {
    key: 'lead_intake',
    name: 'Enregistrer un nouveau prospect',
    description:
      'À chaque demande entrante (formulaire, chatbot, demande de projet), crée la fiche prospect, calcule un score et notifie.',
    triggerType: 'event',
    triggerKey: 'contact.received',
    enabledByDefault: true,
    defaultConfig: { notify: true, sendAcknowledgement: true, autoQualifyScore: 60 },
    effect: ['Créer la fiche prospect', 'Calculer le score', 'Notifier', 'Préparer l’accusé de réception'],
  },
  {
    key: 'payment_followup',
    name: 'Suivre un paiement reçu',
    description:
      'À l’enregistrement d’un paiement, met la facture à jour, notifie et ajoute l’événement à la timeline du projet.',
    triggerType: 'event',
    triggerKey: 'payment.recorded',
    enabledByDefault: true,
    defaultConfig: { notify: true, prepareReceipt: true },
    effect: ['Recalculer la facture', 'Notifier', 'Ajouter à la timeline'],
  },
  {
    key: 'quote_accepted',
    name: 'Convertir un devis accepté',
    description:
      'Quand un devis est accepté, prépare la facture correspondante en brouillon et crée le projet si nécessaire.',
    triggerType: 'event',
    triggerKey: 'quote.accepted',
    enabledByDefault: true,
    defaultConfig: { createDraftInvoice: true, createProject: false, notify: true },
    effect: ['Créer la facture en brouillon', 'Notifier', 'Ajouter à la timeline'],
  },
  {
    key: 'subscription_renewal',
    name: 'Alerter sur les renouvellements',
    description:
      'Chaque jour, signale les abonnements qui arrivent à échéance et enregistre automatiquement la dépense lorsqu’ils se renouvellent.',
    triggerType: 'schedule',
    triggerKey: 'daily',
    enabledByDefault: true,
    defaultConfig: { warningDays: 7, autoRecordExpense: true },
    effect: ['Notifier les renouvellements', 'Enregistrer la dépense'],
  },
  {
    key: 'project_progress',
    name: 'Mettre à jour l’avancement',
    description:
      'Quand une tâche est terminée, recalcule l’avancement du projet et signale une étape achevée.',
    triggerType: 'event',
    triggerKey: 'task.completed',
    enabledByDefault: true,
    defaultConfig: { closeStageWhenAllTasksDone: true },
    effect: ['Recalculer l’avancement', 'Clôturer l’étape terminée', 'Ajouter à la timeline'],
  },
  {
    key: 'daily_housekeeping',
    name: 'Entretien quotidien',
    description:
      'Chaque jour, purge les sessions expirées, les anciennes notifications lues et reconstruit l’index de recherche si nécessaire.',
    triggerType: 'schedule',
    triggerKey: 'daily',
    enabledByDefault: true,
    defaultConfig: { pruneSessions: true, pruneNotificationsDays: 90, pruneAutomationRunsDays: 90 },
    effect: ['Purger les sessions', 'Purger les notifications lues', 'Nettoyer l’index'],
  },
];

export function findAutomationDefinition(key: string): AutomationDefinition | undefined {
  return SYSTEM_AUTOMATIONS.find((a) => a.key === key);
}

export function automationsForTrigger(trigger: AutomationTriggerKey): AutomationDefinition[] {
  return SYSTEM_AUTOMATIONS.filter((a) => a.triggerKey === trigger);
}
