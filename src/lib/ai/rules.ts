import 'server-only';
import type { PublicKnowledge } from './knowledge';
import * as projectsRepo from '@/lib/db/repositories/projects';
import * as financeRepo from '@/lib/db/repositories/finance';
import { listServices } from '@/lib/db/repositories/content';
import { formatMoney, formatShortDate } from '@/lib/i18n/format';

/**
 * Deterministic fallbacks used when no AI key is configured.
 *
 * These are not a degraded imitation of the model: they are rule-based analyses
 * computed from the database, which makes them exact where the model would be
 * approximate (a deadline either has passed or it has not). The UI always says
 * which of the two produced a result, so the owner is never left guessing
 * whether a number was computed or generated.
 *
 * The same principle as everywhere else applies: nothing here invents a fact.
 */

// ── Public assistant ─────────────────────────────────────────────────────

/**
 * Keyword router for the public chatbot.
 *
 * Answers only from the knowledge base; anything it cannot match is handed to
 * the contact form rather than guessed at.
 */
export function answerFromRules(
  question: string,
  knowledge: PublicKnowledge,
): { answer: string; suggestions: string[] } {
  const q = question.toLowerCase();
  const owner = knowledge.ownerName;
  const has = (words: string[]) => words.some((word) => q.includes(word));

  const contactCta = 'Le formulaire de contact permet de le joindre directement : /contact';

  if (has(['bonjour', 'salut', 'hello', 'bonsoir', 'coucou', 'salam'])) {
    return {
      answer: `Bonjour ! Je suis l’assistant du site de ${owner}. Je peux vous renseigner sur ses services, ses réalisations et la façon de le contacter. Que puis-je faire pour vous ?`,
      suggestions: ['Quels sont vos services ?', 'Voir des réalisations', 'Demander un devis'],
    };
  }

  if (has(['service', 'presta', 'proposez', 'faites-vous', 'offre'])) {
    const services = listServices({ publishedOnly: true });
    if (services.length === 0) {
      return {
        answer: `Le catalogue de services n’est pas encore publié sur le site. ${contactCta}`,
        suggestions: ['Me contacter'],
      };
    }
    const names = services.slice(0, 6).map((service) => service.name).join(', ');
    return {
      answer: `${owner} propose notamment : ${names}. Le détail de chaque prestation est sur la page /services.`,
      suggestions: ['Demander un devis', 'Voir les réalisations'],
    };
  }

  if (has(['prix', 'tarif', 'coût', 'cout', 'combien', 'budget', 'devis'])) {
    const priced = listServices({ publishedOnly: true }).filter(
      (service) => service.starting_price !== null && service.starting_price > 0,
    );
    if (priced.length === 0) {
      return {
        answer: `Les tarifs dépendent du périmètre : ${owner} établit un devis après un échange sur votre besoin. Vous pouvez décrire votre projet ici : /demande-de-projet`,
        suggestions: ['Demander un devis'],
      };
    }
    const cheapest = priced.reduce((min, service) =>
      (service.starting_price ?? 0) < (min.starting_price ?? 0) ? service : min,
    );
    return {
      answer: `Les prestations publiées démarrent à partir de ${formatMoney(cheapest.starting_price ?? 0, cheapest.currency)} (${cheapest.name}). Le tarif exact dépend du périmètre : décrivez votre projet sur /demande-de-projet pour recevoir un devis.`,
      suggestions: ['Demander un devis', 'Voir les services'],
    };
  }

  if (has(['projet', 'réalisation', 'realisation', 'portfolio', 'travaux', 'exemple', 'référence'])) {
    return {
      answer: knowledge.has.portfolio
        ? `Les réalisations publiées sont sur /projets, avec pour chacune le contexte, les technologies et le résultat.`
        : `Aucune réalisation n’est encore publiée sur le site. ${contactCta}`,
      suggestions: knowledge.has.portfolio ? ['Voir les projets', 'Demander un devis'] : ['Me contacter'],
    };
  }

  if (has(['contact', 'joindre', 'appeler', 'téléphone', 'telephone', 'email', 'mail', 'rendez-vous'])) {
    return {
      answer: knowledge.has.contact
        ? `Vous pouvez joindre ${owner} via la page /contact — les coordonnées y sont indiquées, et le formulaire lui transmet votre message directement.`
        : `Le formulaire de la page /contact transmet votre message directement à ${owner}.`,
      suggestions: ['Me contacter', 'Demander un devis'],
    };
  }

  if (has(['délai', 'delai', 'combien de temps', 'durée', 'duree', 'quand'])) {
    return {
      answer: `Le délai dépend du périmètre du projet. Décrivez votre besoin sur /demande-de-projet : ${owner} vous répondra avec un planning réaliste.`,
      suggestions: ['Demander un devis'],
    };
  }

  if (has(['qui es', 'qui êtes', 'qui est', 'parcours', 'expérience', 'experience', 'cv', 'à propos'])) {
    return {
      answer: knowledge.has.bio || knowledge.has.profile
        ? `La page /a-propos présente le parcours de ${owner}, ses compétences et sa méthode de travail.`
        : `La présentation détaillée de ${owner} n’a pas encore été publiée sur le site. ${contactCta}`,
      suggestions: ['À propos', 'Voir les services'],
    };
  }

  // Nothing matched: never improvise an answer about the owner.
  return {
    answer: `Je n’ai pas cette information. Pour une réponse précise, le mieux est d’écrire directement à ${owner} : ${contactCta}`,
    suggestions: ['Me contacter', 'Demander un devis', 'Voir les services'],
  };
}

// ── Project analysis ─────────────────────────────────────────────────────

export type ProjectAnalysis = {
  summary: string;
  risks: string[];
  priorities: string[];
  actions: string[];
  nextStep: string;
  source: 'ai' | 'rules';
};

/**
 * Rule-based project analysis.
 *
 * Every statement is derived from a number in the database — deadlines, task
 * counts, the revision allowance, the invoiced-versus-paid gap — so it is exact
 * and reproducible.
 */
export function analyseProjectFromRules(projectId: number): ProjectAnalysis | null {
  const project = projectsRepo.findProject(projectId);
  if (!project) return null;

  const today = new Date().toISOString().slice(0, 10);
  const risks: string[] = [];
  const priorities: string[] = [];
  const actions: string[] = [];

  const tasks = projectsRepo.listTasks({ projectId, status: 'all', limit: 500 });
  const open = tasks.filter((task) => task.status !== 'done');
  const blocked = tasks.filter((task) => task.status === 'blocked');
  const overdue = open.filter((task) => task.due_date !== null && task.due_date < today);
  const unassigned = open.filter((task) => task.assignee_id === null);

  // ── Deadline ─────────────────────────────────────────────────────────
  if (project.delivery_date) {
    const daysLeft = Math.ceil(
      (new Date(project.delivery_date).getTime() - Date.now()) / 86_400_000,
    );
    if (daysLeft < 0 && project.status !== 'completed') {
      risks.push(
        `Livraison dépassée de ${Math.abs(daysLeft)} jour(s) (prévue le ${formatShortDate(project.delivery_date, 'fr')}) avec ${open.length} tâche(s) encore ouverte(s).`,
      );
      actions.push('Recaler la date de livraison avec le client, ou réduire le périmètre restant.');
    } else if (daysLeft >= 0 && daysLeft <= 7 && open.length > 0) {
      risks.push(`Livraison dans ${daysLeft} jour(s) avec ${open.length} tâche(s) ouverte(s).`);
      priorities.push('Terminer ou repousser les tâches non critiques avant la livraison.');
    }
  } else if (project.status !== 'completed' && project.status !== 'archived') {
    risks.push('Aucune date de livraison n’est définie : l’avancement n’est comparé à rien.');
    actions.push('Fixer une date de livraison avec le client.');
  }

  // ── Execution ────────────────────────────────────────────────────────
  if (blocked.length > 0) {
    risks.push(`${blocked.length} tâche(s) bloquée(s) : ${blocked.slice(0, 3).map((t) => t.title).join(', ')}.`);
    priorities.push('Lever les blocages — c’est ce qui coûte le plus de temps sur un projet.');
  }
  if (overdue.length > 0) {
    risks.push(`${overdue.length} tâche(s) en retard sur leur échéance.`);
  }
  if (unassigned.length > 0 && open.length > 0) {
    actions.push(`Assigner les ${unassigned.length} tâche(s) sans responsable.`);
  }
  if (tasks.length === 0) {
    risks.push('Aucune tâche n’est enregistrée : l’avancement du projet n’est pas mesurable.');
    actions.push('Découper le projet en tâches pour suivre l’avancement.');
  }

  // ── Revisions ────────────────────────────────────────────────────────
  const revisions = projectsRepo.getRevisionSummary(projectId);
  if (revisions.overLimit) {
    risks.push(
      `Forfait de révisions dépassé : ${revisions.used} utilisée(s) pour ${revisions.included} incluse(s), soit ${formatMoney(revisions.extraCostTotal, project.currency)} de supplément.`,
    );
    actions.push('Facturer les révisions supplémentaires ou les offrir explicitement, mais le dire au client.');
  } else if (revisions.included > 0 && revisions.remaining === 0) {
    priorities.push('Le forfait de révisions est épuisé : prévenir le client avant la prochaine demande.');
  }

  // ── Money ────────────────────────────────────────────────────────────
  const invoices = financeRepo.listInvoices({ projectId, status: 'all', limit: 100 });
  const issued = invoices.filter((i) => i.status !== 'draft' && i.status !== 'cancelled');
  const outstanding = issued.reduce((acc, invoice) => acc + invoice.balance_due, 0);
  const overdueInvoices = issued.filter((invoice) => invoice.days_overdue > 0);

  if (overdueInvoices.length > 0) {
    risks.push(
      `${overdueInvoices.length} facture(s) en retard de paiement, soit ${formatMoney(
        overdueInvoices.reduce((acc, invoice) => acc + invoice.balance_due, 0),
        project.currency,
      )}.`,
    );
    priorities.push('Relancer les factures échues avant de livrer davantage.');
  } else if (outstanding > 0) {
    actions.push(`Suivre les ${formatMoney(outstanding, project.currency)} encore à encaisser.`);
  }

  if (project.budget > 0 && issued.length === 0 && project.status === 'in_progress') {
    actions.push('Aucune facture émise alors que le projet est en cours : envisager un acompte.');
  }

  // ── Client silence ───────────────────────────────────────────────────
  const feedback = projectsRepo.listFeedback({ projectId, limit: 20 });
  const pending = feedback.filter((entry) => entry.status === 'new');
  if (pending.length > 0) {
    priorities.push(`${pending.length} retour(s) client non traité(s).`);
  }
  if (project.status === 'awaiting_client') {
    risks.push('Le projet est en attente du client : le temps qui passe ici n’est pas facturé.');
    actions.push('Relancer le client avec une échéance explicite.');
  }

  // ── Summary ──────────────────────────────────────────────────────────
  const summary = [
    `${project.title} est à ${project.progress} % d’avancement (${tasks.length - open.length}/${tasks.length} tâches terminées)`,
    project.delivery_date ? `pour une livraison prévue le ${formatShortDate(project.delivery_date, 'fr')}` : 'sans date de livraison définie',
    risks.length === 0 ? '. Aucun point de vigilance détecté.' : `. ${risks.length} point(s) de vigilance.`,
  ].join(' ');

  if (priorities.length === 0 && open.length > 0) {
    priorities.push(`Avancer les ${open.length} tâche(s) restantes dans l’ordre de leur échéance.`);
  }

  const nextStep =
    priorities[0] ??
    actions[0] ??
    (open.length === 0 && project.status !== 'completed'
      ? 'Toutes les tâches sont terminées : passer le projet en « terminé » et demander la validation du client.'
      : 'Rien d’urgent : poursuivre l’exécution.');

  return { summary, risks, priorities, actions, nextStep, source: 'rules' };
}
