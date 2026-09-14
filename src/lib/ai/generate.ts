import 'server-only';
import { available, complete, parseJsonReply, AiError } from './client';
import { analyseProjectFromRules, type ProjectAnalysis } from './rules';
import * as projectsRepo from '@/lib/db/repositories/projects';
import * as financeRepo from '@/lib/db/repositories/finance';
import * as briefsRepo from '@/lib/db/repositories/briefs';
import { findPortfolio } from '@/lib/db/repositories/content';
import { getSiteProfile } from '@/lib/site';
import { formatMoney, formatShortDate } from '@/lib/i18n/format';

/**
 * One-shot generation tasks used from buttons across the admin.
 *
 * Every task follows the same shape: gather real data from the database, hand it
 * to the model as the *only* permitted source, and fall back to a deterministic
 * rule-based result when no key is configured. The result always carries its
 * `source`, so the interface can say plainly which produced it.
 *
 * The anti-invention rule from the specification applies here too, and is
 * repeated in each prompt: the model may rephrase and structure the supplied
 * facts, never add new ones.
 */

const GROUNDING = `RÈGLE ABSOLUE : tu ne disposes que des données fournies ci-dessous.
N'invente jamais un client, un chiffre, une date, une technologie, un résultat ou un témoignage
qui n'y figure pas. Si une information manque, dis-le explicitement plutôt que de la deviner.
Tu peux reformuler, structurer et hiérarchiser ; tu ne peux rien ajouter.`;

export type GenerationTask =
  | 'project_summary' | 'project_analysis' | 'brief_to_tasks' | 'quote_draft'
  | 'portfolio_description' | 'portfolio_case_study' | 'seo_meta' | 'social_post'
  | 'email_draft' | 'payment_reminder' | 'monthly_report' | 'content_ideas';

export type GenerationInput = {
  task: GenerationTask;
  projectId?: number | null;
  portfolioId?: number | null;
  briefId?: number | null;
  invoiceId?: number | null;
  extra?: string | null;
};

export type GenerationResult =
  | { kind: 'analysis'; analysis: ProjectAnalysis }
  | { kind: 'text'; text: string; source: 'ai' | 'rules' }
  | { kind: 'list'; items: string[]; source: 'ai' | 'rules' }
  | { kind: 'fields'; fields: Record<string, string>; source: 'ai' | 'rules' };

export class GenerationError extends Error {}

export async function generate(input: GenerationInput): Promise<GenerationResult> {
  switch (input.task) {
    case 'project_analysis':
      return { kind: 'analysis', analysis: await analyseProject(requireId(input.projectId, 'projet')) };
    case 'project_summary':
      return await projectSummary(requireId(input.projectId, 'projet'));
    case 'brief_to_tasks':
      return await briefToTasks(requireId(input.briefId, 'brief'));
    case 'payment_reminder':
      return await paymentReminder(requireId(input.invoiceId, 'facture'));
    case 'portfolio_description':
      return await portfolioDescription(requireId(input.portfolioId, 'projet du portfolio'));
    case 'seo_meta':
      return await seoMeta(input);
    case 'content_ideas':
      return await contentIdeas(input.extra ?? null);
    default:
      throw new GenerationError('Cette génération n’est pas encore disponible.');
  }
}

function requireId(value: number | null | undefined, label: string): number {
  if (!value) throw new GenerationError(`Aucun ${label} sélectionné.`);
  return value;
}

// ── Project analysis ─────────────────────────────────────────────────────

/**
 * "✨ Analyser avec IA" on a project.
 *
 * The rule-based analysis runs first and always: it is exact. With a key
 * configured, the model receives that analysis plus the raw figures and returns
 * a better-prioritised version — but it is anchored to numbers it did not invent.
 */
async function analyseProject(projectId: number): Promise<ProjectAnalysis> {
  const rules = analyseProjectFromRules(projectId);
  if (!rules) throw new GenerationError('Projet introuvable.');
  if (!available()) return rules;

  const project = projectsRepo.findProject(projectId);
  if (!project) throw new GenerationError('Projet introuvable.');

  const facts = projectFacts(projectId);

  try {
    const response = await complete({
      effort: 'high',
      maxTokens: 2000,
      system: `Tu assistes un freelance dans le pilotage de ses projets.
${GROUNDING}

Tu réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, de la forme :
{
  "summary": "2 à 3 phrases sur l'état réel du projet",
  "risks": ["risque concret et vérifiable", "..."],
  "priorities": ["ce qu'il faut faire en premier", "..."],
  "actions": ["action précise et actionnable", "..."],
  "nextStep": "la seule prochaine action à faire maintenant"
}
Chaque élément est une phrase courte, en français, concrète et rattachée à une donnée fournie.
Maximum 5 éléments par liste. Pas de conseil générique.`,
      messages: [
        {
          role: 'user',
          content: `Voici les données du projet, et l'analyse automatique déjà calculée à partir de la base.

## Données du projet
${facts}

## Analyse automatique (calculée, exacte)
Résumé : ${rules.summary}
Risques : ${rules.risks.join(' | ') || 'aucun'}
Priorités : ${rules.priorities.join(' | ') || 'aucune'}
Actions : ${rules.actions.join(' | ') || 'aucune'}

Reprends ces éléments, hiérarchise-les par impact réel sur la livraison et sur la trésorerie,
et formule-les clairement. N'ajoute aucun fait absent des données ci-dessus.`,
        },
      ],
    });

    const parsed = parseJsonReply<{
      summary?: string; risks?: string[]; priorities?: string[]; actions?: string[]; nextStep?: string;
    }>(response.text);

    if (!parsed?.summary) return rules;

    return {
      summary: parsed.summary,
      risks: cleanList(parsed.risks) ?? rules.risks,
      priorities: cleanList(parsed.priorities) ?? rules.priorities,
      actions: cleanList(parsed.actions) ?? rules.actions,
      nextStep: parsed.nextStep?.trim() || rules.nextStep,
      source: 'ai',
    };
  } catch (error) {
    // The computed analysis is still correct and useful: never fail the button.
    if (error instanceof AiError) return rules;
    throw error;
  }
}

function cleanList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const items = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 5);
  return items.length > 0 ? items : null;
}

/** Every figure the model is allowed to reason from. */
function projectFacts(projectId: number): string {
  const project = projectsRepo.findProject(projectId);
  if (!project) return '';

  const tasks = projectsRepo.listTasks({ projectId, status: 'all', limit: 300 });
  const stages = projectsRepo.listStages(projectId);
  const revisions = projectsRepo.getRevisionSummary(projectId);
  const invoices = financeRepo.listInvoices({ projectId, status: 'all', limit: 50 });
  const feedback = projectsRepo.listFeedback({ projectId, limit: 20 });
  const issued = invoices.filter((i) => i.status !== 'draft' && i.status !== 'cancelled');

  return [
    `Titre : ${project.title}`,
    `Référence : ${project.reference}`,
    `Client : ${project.client_company ?? project.client_name ?? 'aucun client rattaché'}`,
    `Statut : ${projectsRepo.projectStatusLabel(project.status)} · priorité ${projectsRepo.priorityLabel(project.priority)}`,
    `Avancement : ${project.progress} %`,
    `Début : ${project.start_date ? formatShortDate(project.start_date, 'fr') : 'non défini'}`,
    `Livraison prévue : ${project.delivery_date ? formatShortDate(project.delivery_date, 'fr') : 'non définie'}`,
    `Budget : ${project.budget > 0 ? formatMoney(project.budget, project.currency) : 'non renseigné'}`,
    project.description ? `Description : ${project.description}` : '',
    '',
    `Étapes (${stages.length}) : ${stages.map((s) => `${s.name} [${s.status}] ${s.done_count}/${s.task_count}`).join(' · ') || 'aucune'}`,
    `Tâches : ${tasks.length} au total, ${tasks.filter((t) => t.status === 'done').length} terminées, ${tasks.filter((t) => t.status === 'blocked').length} bloquées`,
    `Tâches ouvertes : ${tasks.filter((t) => t.status !== 'done').map((t) => `${t.title} [${t.status}${t.due_date ? `, échéance ${t.due_date}` : ''}]`).slice(0, 25).join(' · ') || 'aucune'}`,
    '',
    `Révisions : ${revisions.used} utilisée(s) sur ${revisions.included} incluse(s), ${revisions.extras} hors forfait, supplément ${formatMoney(revisions.extraCostTotal, project.currency)}`,
    `Factures émises : ${issued.length} — total ${formatMoney(issued.reduce((a, i) => a + i.total, 0), project.currency)}, encaissé ${formatMoney(issued.reduce((a, i) => a + i.amount_paid, 0), project.currency)}, reste dû ${formatMoney(issued.reduce((a, i) => a + i.balance_due, 0), project.currency)}`,
    `Factures en retard : ${issued.filter((i) => i.days_overdue > 0).map((i) => `${i.number} (${i.days_overdue} j)`).join(', ') || 'aucune'}`,
    `Retours client : ${feedback.length} au total, ${feedback.filter((f) => f.status === 'new').length} non traité(s)`,
    `Date du jour : ${new Date().toISOString().slice(0, 10)}`,
  ]
    .filter(Boolean)
    .join('\n');
}

// ── Project summary ──────────────────────────────────────────────────────

async function projectSummary(projectId: number): Promise<GenerationResult> {
  const project = projectsRepo.findProject(projectId);
  if (!project) throw new GenerationError('Projet introuvable.');

  const rules = analyseProjectFromRules(projectId);
  if (!available()) {
    return { kind: 'text', text: rules?.summary ?? project.title, source: 'rules' };
  }

  const response = await complete({
    effort: 'low',
    maxTokens: 700,
    system: `Tu rédiges un point d'avancement destiné au client d'un freelance.
${GROUNDING}
Ton : professionnel, factuel, rassurant sans être flatteur. 3 à 5 phrases, en français.
Pas de jargon interne, pas de montants internes, pas de mention des retards de paiement.`,
    messages: [{ role: 'user', content: projectFacts(projectId) }],
  });

  return { kind: 'text', text: response.text, source: 'ai' };
}

// ── Brief → tasks ────────────────────────────────────────────────────────

async function briefToTasks(briefId: number): Promise<GenerationResult> {
  const brief = briefsRepo.findBrief(briefId);
  if (!brief) throw new GenerationError('Brief introuvable.');

  const answers = briefsRepo.latestResponses(briefId);
  const questions = briefsRepo.listBriefQuestions(briefId);

  if (Object.keys(answers).length === 0) {
    throw new GenerationError('Ce brief ne contient encore aucune réponse.');
  }

  const transcript = questions
    .map((question) => {
      const value = answers[question.key];
      return value ? `- ${question.label} : ${value}` : null;
    })
    .filter(Boolean)
    .join('\n');

  if (!available()) {
    // Without a model, turn each substantial answer into a task to review.
    const items = questions
      .filter((question) => (answers[question.key] ?? '').trim().length > 20)
      .map((question) => `Analyser la réponse « ${question.label} » et en déduire le périmètre`);
    return {
      kind: 'list',
      items: items.length > 0 ? items : ['Relire le brief et découper le projet en tâches'],
      source: 'rules',
    };
  }

  const response = await complete({
    effort: 'medium',
    maxTokens: 1500,
    system: `Tu transformes le brief d'un client en tâches de production concrètes.
${GROUNDING}

Réponds UNIQUEMENT avec un tableau JSON de chaînes, par exemple :
["Maquetter la page d'accueil", "Intégrer le formulaire de contact"]
Entre 5 et 15 tâches, en français, chacune commençant par un verbe à l'infinitif,
formulée de façon vérifiable (« Intégrer X » plutôt que « Réfléchir à X »).
Ne déduis que ce que le brief dit réellement.`,
    messages: [{ role: 'user', content: `Brief « ${brief.title} »\n\n${transcript}` }],
  });

  const parsed = parseJsonArray(response.text);
  if (!parsed) throw new GenerationError('Réponse inexploitable, réessayez.');
  return { kind: 'list', items: parsed, source: 'ai' };
}

function parseJsonArray(text: string): string[] | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : text).trim();
  const start = candidate.indexOf('[');
  const end = candidate.lastIndexOf(']');
  if (start === -1 || end <= start) return null;
  try {
    const value = JSON.parse(candidate.slice(start, end + 1)) as unknown;
    if (!Array.isArray(value)) return null;
    const items = value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 2)
      .slice(0, 20);
    return items.length > 0 ? items : null;
  } catch {
    return null;
  }
}

// ── Payment reminder ─────────────────────────────────────────────────────

async function paymentReminder(invoiceId: number): Promise<GenerationResult> {
  const invoice = financeRepo.findInvoice(invoiceId);
  if (!invoice) throw new GenerationError('Facture introuvable.');

  const profile = getSiteProfile();
  const amount = formatMoney(invoice.balance_due, invoice.currency);
  const due = invoice.due_date ? formatShortDate(invoice.due_date, 'fr') : null;
  const name = invoice.client_company ?? invoice.client_name ?? 'Madame, Monsieur';

  // Escalating but always courteous: the tone is chosen from how late it is.
  const tone =
    invoice.days_overdue <= 0 ? 'rappel courtois avant échéance'
    : invoice.days_overdue <= 15 ? 'relance courtoise'
    : invoice.days_overdue <= 45 ? 'relance ferme mais cordiale'
    : 'relance ferme, en proposant un échéancier';

  if (!available()) {
    const text = [
      `Bonjour ${name},`,
      '',
      invoice.days_overdue > 0
        ? `Sauf erreur de notre part, la facture ${invoice.number}${due ? `, échue le ${due}` : ''}, reste impayée à hauteur de ${amount}.`
        : `Nous vous rappelons que la facture ${invoice.number}${due ? ` arrive à échéance le ${due}` : ''}, pour un montant de ${amount}.`,
      '',
      'Si le règlement a déjà été effectué, merci de ne pas tenir compte de ce message.',
      'Dans le cas contraire, nous restons à votre disposition pour toute question.',
      '',
      'Cordialement,',
      profile.ownerName,
    ].join('\n');
    return { kind: 'text', text, source: 'rules' };
  }

  const response = await complete({
    effort: 'low',
    maxTokens: 900,
    system: `Tu rédiges un email de relance de paiement pour un freelance.
${GROUNDING}
Ton attendu : ${tone}. En français, 80 à 150 mots, sans objet d'email.
Commence par « Bonjour », termine par une formule de politesse et le nom du freelance.
Mentionne toujours qu'il faut ignorer le message si le paiement a déjà été fait.
N'invente ni pénalité, ni menace, ni date qui ne figure pas dans les données.`,
    messages: [
      {
        role: 'user',
        content: [
          `Freelance : ${profile.ownerName}`,
          `Client : ${name}`,
          `Facture : ${invoice.number}`,
          `Montant restant dû : ${amount}`,
          due ? `Échéance : ${due}` : 'Échéance : non définie',
          invoice.days_overdue > 0 ? `Retard : ${invoice.days_overdue} jour(s)` : 'Pas encore échue',
          invoice.title ? `Objet de la facture : ${invoice.title}` : '',
        ].filter(Boolean).join('\n'),
      },
    ],
  });

  return { kind: 'text', text: response.text, source: 'ai' };
}

// ── Portfolio ────────────────────────────────────────────────────────────

async function portfolioDescription(portfolioId: number): Promise<GenerationResult> {
  const item = findPortfolio(portfolioId);
  if (!item) throw new GenerationError('Projet du portfolio introuvable.');

  const facts = [
    `Titre : ${item.title}`,
    item.subtitle ? `Sous-titre : ${item.subtitle}` : '',
    item.client_name ? `Client : ${item.client_name}` : '',
    item.year ? `Année : ${item.year}` : '',
    item.summary ? `Résumé existant : ${item.summary}` : '',
    item.challenge ? `Problématique : ${item.challenge}` : '',
    item.objectives ? `Objectifs : ${item.objectives}` : '',
    item.solution ? `Solution : ${item.solution}` : '',
    item.results ? `Résultats : ${item.results}` : '',
    item.technologyList.length > 0 ? `Technologies : ${item.technologyList.join(', ')}` : '',
    item.serviceList.length > 0 ? `Prestations : ${item.serviceList.join(', ')}` : '',
    item.metricList.length > 0
      ? `Chiffres : ${item.metricList.map((m) => `${m.label} ${m.value}`).join(', ')}`
      : '',
  ].filter(Boolean).join('\n');

  if (!available()) {
    throw new GenerationError(
      'La rédaction assistée nécessite une clé API. Les champs restent modifiables à la main.',
    );
  }

  const response = await complete({
    effort: 'medium',
    maxTokens: 1200,
    system: `Tu rédiges la présentation publique d'une réalisation pour le portfolio d'un freelance.
${GROUNDING}
N'invente AUCUN chiffre, résultat, nom de client ni technologie. Si les résultats ne sont pas
fournis, n'en mentionne aucun — écris la présentation sans cette partie.

Réponds UNIQUEMENT avec un objet JSON :
{ "summary": "2 phrases d'accroche", "description": "3 à 4 paragraphes courts" }
En français, à la troisième personne, concret, sans superlatifs creux.`,
    messages: [{ role: 'user', content: facts }],
  });

  const parsed = parseJsonReply<{ summary?: string; description?: string }>(response.text);
  if (!parsed?.description) throw new GenerationError('Réponse inexploitable, réessayez.');

  return {
    kind: 'fields',
    fields: {
      summary: parsed.summary?.trim() ?? '',
      description: parsed.description.trim(),
    },
    source: 'ai',
  };
}

// ── SEO ──────────────────────────────────────────────────────────────────

async function seoMeta(input: GenerationInput): Promise<GenerationResult> {
  const source = input.portfolioId
    ? findPortfolio(input.portfolioId)
    : null;

  const subject = source
    ? [source.title, source.summary, source.technologyList.join(', ')].filter(Boolean).join('\n')
    : (input.extra ?? '').trim();

  if (!subject) throw new GenerationError('Indiquez le contenu à optimiser.');

  if (!available()) {
    // A truthful, mechanical fallback: trim the existing text to the right length.
    const title = subject.split('\n')[0].slice(0, 60);
    const description = subject.replace(/\n/g, ' ').slice(0, 155);
    return { kind: 'fields', fields: { seo_title: title, seo_description: description }, source: 'rules' };
  }

  const response = await complete({
    effort: 'low',
    maxTokens: 500,
    system: `Tu rédiges les métadonnées SEO d'une page.
${GROUNDING}
Réponds UNIQUEMENT avec un objet JSON :
{ "seo_title": "55 à 60 caractères", "seo_description": "150 à 158 caractères" }
En français, descriptif et honnête, sans promesse ni chiffre inventé, sans bourrage de mots-clés.`,
    messages: [{ role: 'user', content: subject }],
  });

  const parsed = parseJsonReply<{ seo_title?: string; seo_description?: string }>(response.text);
  if (!parsed?.seo_title) throw new GenerationError('Réponse inexploitable, réessayez.');

  return {
    kind: 'fields',
    fields: {
      seo_title: parsed.seo_title.trim().slice(0, 70),
      seo_description: (parsed.seo_description ?? '').trim().slice(0, 170),
    },
    source: 'ai',
  };
}

// ── Content ideas ────────────────────────────────────────────────────────

async function contentIdeas(topic: string | null): Promise<GenerationResult> {
  const services = getSiteProfile();

  if (!available()) {
    throw new GenerationError(
      'Les idées de contenu nécessitent une clé API. Vous pouvez créer un article directement.',
    );
  }

  const response = await complete({
    effort: 'low',
    maxTokens: 900,
    system: `Tu proposes des sujets d'articles pour le blog d'un freelance.
Réponds UNIQUEMENT avec un tableau JSON de 8 titres d'articles, en français.
Des sujets utiles à ses clients potentiels, jamais de promesse chiffrée.
Tu ne dois rien affirmer sur le parcours du freelance : ce sont des sujets, pas des affirmations.`,
    messages: [
      {
        role: 'user',
        content: `Métier : ${services.roleLabel ?? 'freelance en développement web, IT, marketing, audiovisuel et IA'}.
${topic ? `Thème souhaité : ${topic}` : 'Aucun thème imposé.'}`,
      },
    ],
  });

  const parsed = parseJsonArray(response.text);
  if (!parsed) throw new GenerationError('Réponse inexploitable, réessayez.');
  return { kind: 'list', items: parsed, source: 'ai' };
}
