import { config } from '@/lib/config';
import { hashPassword } from '@/lib/auth/password';
import { getDb, migrate, run, scalar, transaction } from './client';
import * as usersRepo from './repositories/users';
import * as settingsRepo from './repositories/settings';
import * as contentRepo from './repositories/content';
import * as commsRepo from './repositories/comms';
import * as filesRepo from './repositories/files';
import * as financeRepo from './repositories/finance';
import * as projectsRepo from './repositories/projects';
import * as clientsRepo from './repositories/clients';
import * as leadsRepo from './repositories/leads';
import * as expensesRepo from './repositories/expenses';
import * as calendarRepo from './repositories/calendar';
import * as automationsRepo from './repositories/automations';
import * as briefsRepo from './repositories/briefs';
import * as moodboardsRepo from './repositories/moodboards';
import { rebuildIndex } from './repositories/search';
import { SYSTEM_AUTOMATIONS } from '@/lib/automation/registry';
import { DEFAULT_CONTRACT_TEMPLATE, SYSTEM_MESSAGE_TEMPLATES } from '@/lib/mail/templates';

/**
 * Idempotent seed.
 *
 * Split into two halves:
 *
 *   • `seedCore` — roles, permissions, the bootstrap admin, settings, taxonomy,
 *     services, templates and automations. Safe and expected to re-run on every
 *     deploy; it never overwrites a value the user has edited.
 *
 *   • `seedDemo` — sample clients, projects, invoices and content for testing.
 *     Every row is flagged `is_demo = 1` and can be removed with `purgeDemo()`
 *     without touching real data.
 *
 * Personal facts (experience, diplomas, certifications, real client names,
 * testimonials, statistics) are deliberately NOT seeded: the about page ships
 * with empty, clearly-labelled fields for the owner to fill in, so the site can
 * never publish a claim nobody made.
 */

export type SeedReport = {
  rolesSynced: boolean;
  adminCreated: boolean;
  adminUsername: string;
  settings: number;
  services: number;
  categories: number;
  technologies: number;
  templates: number;
  automations: number;
  demo: DemoReport | null;
  indexed: number;
};

export type DemoReport = {
  clients: number;
  projects: number;
  stages: number;
  tasks: number;
  quotes: number;
  invoices: number;
  payments: number;
  feedback: number;
  revisions: number;
  events: number;
  leads: number;
  expenses: number;
  subscriptions: number;
  portfolio: number;
  caseStudies: number;
  posts: number;
  testimonials: number;
  briefs: number;
  moodboards: number;
};

// ── Settings ─────────────────────────────────────────────────────────────

/**
 * Default settings.
 *
 * `null` means "the admin must fill this in": the field appears empty in the CMS
 * and the public site renders a neutral placeholder rather than invented copy.
 */
const DEFAULT_SETTINGS: {
  key: string;
  value: string | number | boolean | null;
  group: settingsRepo.SettingsGroup;
  type?: 'string' | 'number' | 'boolean' | 'json' | 'richtext';
  label: string;
}[] = [
  // Identity
  { key: 'site.owner_name', value: 'Boubaker Choupotman', group: 'identity', label: 'Nom affiché' },
  { key: 'site.product_name', value: 'CHOUPOTMAN OS', group: 'identity', label: 'Nom du produit' },
  { key: 'site.tagline', value: 'My Work. My Clients. My Projects. My Business.', group: 'identity', label: 'Slogan produit' },
  { key: 'site.headline', value: null, group: 'identity', label: 'Titre principal (accueil)' },
  { key: 'site.subheadline', value: null, group: 'identity', label: 'Sous-titre (accueil)' },
  { key: 'site.role_label', value: null, group: 'identity', label: 'Intitulé professionnel' },
  { key: 'site.short_bio', value: null, group: 'identity', type: 'richtext', label: 'Présentation courte' },
  { key: 'site.long_bio', value: null, group: 'identity', type: 'richtext', label: 'Présentation longue (à propos)' },
  { key: 'site.avatar_url', value: null, group: 'identity', label: 'Photo de profil (URL)' },
  { key: 'site.og_image', value: null, group: 'identity', label: 'Image de partage (Open Graph)' },
  { key: 'site.location', value: null, group: 'identity', label: 'Ville / pays' },
  { key: 'site.availability', value: null, group: 'identity', label: 'Disponibilité affichée' },
  { key: 'site.cv_url', value: null, group: 'identity', label: 'Lien CV' },

  // Contact
  { key: 'contact.email', value: null, group: 'contact', label: 'Email de contact' },
  { key: 'contact.phone', value: null, group: 'contact', label: 'Téléphone' },
  { key: 'contact.whatsapp', value: null, group: 'contact', label: 'WhatsApp' },
  { key: 'contact.address', value: null, group: 'contact', label: 'Adresse' },
  { key: 'contact.hours', value: null, group: 'contact', label: 'Horaires' },
  { key: 'contact.response_time', value: null, group: 'contact', label: 'Délai de réponse annoncé' },
  { key: 'contact.booking_url', value: null, group: 'contact', label: 'Lien de prise de rendez-vous' },

  // Social
  { key: 'social.linkedin', value: null, group: 'social', label: 'LinkedIn' },
  { key: 'social.instagram', value: null, group: 'social', label: 'Instagram' },
  { key: 'social.facebook', value: null, group: 'social', label: 'Facebook' },
  { key: 'social.github', value: null, group: 'social', label: 'GitHub' },
  { key: 'social.youtube', value: null, group: 'social', label: 'YouTube' },
  { key: 'social.tiktok', value: null, group: 'social', label: 'TikTok' },
  { key: 'social.behance', value: null, group: 'social', label: 'Behance' },

  // SEO
  { key: 'seo.title', value: 'Boubaker Choupotman — Développement web, IT, marketing & IA', group: 'seo', label: 'Titre SEO' },
  { key: 'seo.description', value: 'Boubaker Choupotman conçoit des sites et applications web, des systèmes informatiques, des campagnes marketing, des contenus audiovisuels et des automatisations IA.', group: 'seo', label: 'Meta description' },
  { key: 'seo.keywords', value: 'Boubaker Choupotman, Choupotman, développeur web, informatique, marketing digital, IA, automatisation', group: 'seo', label: 'Mots-clés' },
  { key: 'seo.canonical_host', value: 'choupotman.com', group: 'seo', label: 'Domaine canonique' },
  { key: 'seo.index', value: true, group: 'seo', type: 'boolean', label: 'Autoriser l’indexation' },

  // Home page toggles — the owner controls what appears publicly
  { key: 'home.show_stats', value: true, group: 'home', type: 'boolean', label: 'Afficher les statistiques' },
  { key: 'home.show_testimonials', value: true, group: 'home', type: 'boolean', label: 'Afficher les témoignages' },
  { key: 'home.show_technologies', value: true, group: 'home', type: 'boolean', label: 'Afficher les technologies' },
  { key: 'home.show_blog', value: true, group: 'home', type: 'boolean', label: 'Afficher le blog' },
  { key: 'home.show_process', value: true, group: 'home', type: 'boolean', label: 'Afficher la méthode de travail' },
  // Public counters stay empty until the owner enters real numbers.
  { key: 'home.stat_projects', value: null, group: 'home', label: 'Statistique — projets livrés' },
  { key: 'home.stat_clients', value: null, group: 'home', label: 'Statistique — clients' },
  { key: 'home.stat_years', value: null, group: 'home', label: 'Statistique — années d’expérience' },
  { key: 'home.stat_satisfaction', value: null, group: 'home', label: 'Statistique — satisfaction' },

  // Finance
  { key: 'finance.currency', value: 'DZD', group: 'finance', label: 'Devise par défaut' },
  { key: 'finance.tax_rate', value: 19, group: 'finance', type: 'number', label: 'Taux de TVA (%)' },
  { key: 'finance.tax_label', value: 'TVA', group: 'finance', label: 'Libellé de la taxe' },
  { key: 'finance.payment_due_days', value: 15, group: 'finance', type: 'number', label: 'Échéance par défaut (jours)' },
  { key: 'finance.payment_terms', value: 'Paiement à 15 jours à compter de la date de facturation.', group: 'finance', label: 'Conditions de paiement' },
  { key: 'finance.quote_conditions', value: 'Devis valable 30 jours. Un acompte de 40 % est demandé au démarrage.', group: 'finance', label: 'Conditions du devis' },
  { key: 'finance.quote_validity_days', value: 30, group: 'finance', type: 'number', label: 'Validité du devis (jours)' },
  { key: 'finance.default_revisions', value: 3, group: 'finance', type: 'number', label: 'Révisions incluses par défaut' },
  { key: 'finance.revision_extra_cost', value: 0, group: 'finance', type: 'number', label: 'Coût d’une révision supplémentaire' },
  { key: 'finance.bank_details', value: null, group: 'finance', type: 'richtext', label: 'Coordonnées bancaires (documents)' },
  { key: 'finance.legal_footer', value: null, group: 'finance', label: 'Mentions bas de document' },

  // Automation
  { key: 'automation.deadline_warning_days', value: 3, group: 'automation', type: 'number', label: 'Alerte deadline (jours avant)' },
  { key: 'automation.renewal_warning_days', value: 7, group: 'automation', type: 'number', label: 'Alerte renouvellement (jours avant)' },
  { key: 'automation.invoice_reminder_days', value: 3, group: 'automation', type: 'number', label: 'Relance facture (jours après échéance)' },
  { key: 'automation.auto_create_stages', value: true, group: 'automation', type: 'boolean', label: 'Créer les étapes automatiquement' },
  { key: 'automation.auto_create_folders', value: true, group: 'automation', type: 'boolean', label: 'Créer l’arborescence de dossiers' },

  // AI
  { key: 'ai.assistant_name', value: 'Choupotman AI', group: 'ai', label: 'Nom de l’assistant' },
  { key: 'ai.chatbot_enabled', value: true, group: 'ai', type: 'boolean', label: 'Activer le chatbot public' },
  { key: 'ai.chatbot_greeting', value: null, group: 'ai', type: 'richtext', label: 'Message d’accueil du chatbot' },
  { key: 'ai.collect_leads', value: true, group: 'ai', type: 'boolean', label: 'Le chatbot peut enregistrer un prospect' },
  { key: 'ai.require_confirmation', value: true, group: 'ai', type: 'boolean', label: 'Confirmation avant action critique' },

  // Legal
  { key: 'legal.company_name', value: null, group: 'legal', label: 'Raison sociale' },
  { key: 'legal.tax_id', value: null, group: 'legal', label: 'NIF / identifiant fiscal' },
  { key: 'legal.registration', value: null, group: 'legal', label: 'Registre de commerce' },
  { key: 'legal.privacy_text', value: null, group: 'legal', type: 'richtext', label: 'Politique de confidentialité' },
  { key: 'legal.terms_text', value: null, group: 'legal', type: 'richtext', label: 'Mentions légales' },
];

// ── Catalogue content (supplied in the specification, safe to seed) ──────

const PROJECT_CATEGORIES = [
  { name: 'Développement web', slug: 'developpement-web', color: 'series-1' },
  { name: 'Informatique & réseaux', slug: 'informatique-reseaux', color: 'series-2' },
  { name: 'Marketing digital', slug: 'marketing-digital', color: 'series-3' },
  { name: 'Audiovisuel', slug: 'audiovisuel', color: 'series-4' },
  { name: 'IA & automatisation', slug: 'ia-automatisation', color: 'series-5' },
  { name: 'Design', slug: 'design', color: 'series-6' },
];

const POST_CATEGORIES = [
  { name: 'Développement', slug: 'developpement' },
  { name: 'Informatique', slug: 'informatique' },
  { name: 'Marketing', slug: 'marketing' },
  { name: 'Intelligence artificielle', slug: 'intelligence-artificielle' },
  { name: 'Conseils', slug: 'conseils' },
];

const TECHNOLOGIES = [
  { name: 'Next.js', category: 'frontend', featured: true },
  { name: 'React', category: 'frontend', featured: true },
  { name: 'TypeScript', category: 'frontend', featured: true },
  { name: 'Tailwind CSS', category: 'frontend', featured: true },
  { name: 'Node.js', category: 'backend', featured: true },
  { name: 'PostgreSQL', category: 'backend', featured: true },
  { name: 'SQLite', category: 'backend', featured: false },
  { name: 'PHP', category: 'backend', featured: false },
  { name: 'WordPress', category: 'backend', featured: true },
  { name: 'Docker', category: 'devops', featured: true },
  { name: 'Linux', category: 'devops', featured: true },
  { name: 'Nginx', category: 'devops', featured: false },
  { name: 'Figma', category: 'design', featured: true },
  { name: 'Adobe Photoshop', category: 'design', featured: false },
  { name: 'Adobe Premiere Pro', category: 'media', featured: true },
  { name: 'Adobe After Effects', category: 'media', featured: false },
  { name: 'DaVinci Resolve', category: 'media', featured: false },
  { name: 'Claude / API IA', category: 'ai', featured: true },
  { name: 'n8n', category: 'ai', featured: true },
  { name: 'Meta Ads', category: 'marketing', featured: true },
  { name: 'Google Analytics', category: 'marketing', featured: false },
  { name: 'Cisco / Réseaux', category: 'network', featured: false },
  { name: 'Vidéosurveillance IP', category: 'network', featured: false },
];

/** Service catalogue taken verbatim from the specification's service list. */
const SERVICES: contentRepo.ServiceInput[] = [
  {
    name: 'Site vitrine professionnel', family: 'web', is_featured: true, position: 1,
    short_description: 'Un site clair et rapide qui présente votre activité et génère des contacts.',
    bullets: ['Design sur mesure', 'Responsive mobile & tablette', 'Optimisation SEO de base', 'Formulaire de contact', 'Hébergement et mise en ligne'],
    deliverables: ['Maquette validée', 'Site en production', 'Formation à la prise en main'],
  },
  {
    name: 'Application web sur mesure', family: 'web', is_featured: true, position: 2,
    short_description: 'Une application métier conçue autour de votre processus réel.',
    bullets: ['Cadrage fonctionnel', 'Base de données', 'Authentification et rôles', 'Tableau de bord', 'API documentée'],
    deliverables: ['Spécifications', 'Application déployée', 'Documentation technique'],
  },
  {
    name: 'Dashboard & système d’administration', family: 'web', position: 3,
    short_description: 'Un back-office pour piloter vos données, vos utilisateurs et vos contenus.',
    bullets: ['Interface d’administration', 'Statistiques et exports', 'Gestion des permissions', 'Journal d’activité'],
    deliverables: ['Back-office fonctionnel', 'Comptes et rôles configurés'],
  },
  {
    name: 'Plateforme SaaS', family: 'web', position: 4,
    short_description: 'Une plateforme multi-utilisateurs prête à évoluer.',
    bullets: ['Architecture évolutive', 'Comptes et abonnements', 'Espace client', 'Facturation intégrée'],
    deliverables: ['MVP déployé', 'Documentation d’architecture'],
  },
  {
    name: 'Réseaux & infrastructure', family: 'it', position: 1,
    short_description: 'Installation et configuration de réseaux fiables et sécurisés.',
    bullets: ['Audit de l’existant', 'Câblage et équipements', 'Configuration routeurs / switchs', 'Wi-Fi professionnel', 'Documentation du réseau'],
    deliverables: ['Réseau opérationnel', 'Schéma et documentation'],
  },
  {
    name: 'Serveurs & maintenance', family: 'it', position: 2,
    short_description: 'Mise en place, supervision et maintenance de vos serveurs.',
    bullets: ['Installation serveur', 'Sauvegardes automatiques', 'Supervision', 'Interventions correctives'],
    deliverables: ['Serveur configuré', 'Plan de sauvegarde'],
  },
  {
    name: 'Cybersécurité', family: 'it', is_featured: true, position: 3,
    short_description: 'Réduire concrètement votre surface d’exposition.',
    bullets: ['Audit de sécurité', 'Durcissement des accès', 'Politique de mots de passe', 'Sauvegardes testées', 'Sensibilisation des équipes'],
    deliverables: ['Rapport d’audit', 'Plan d’action priorisé'],
  },
  {
    name: 'Vidéosurveillance', family: 'it', position: 4,
    short_description: 'Installation de systèmes de vidéosurveillance IP.',
    bullets: ['Étude des emplacements', 'Installation caméras', 'Enregistrement et stockage', 'Accès à distance sécurisé'],
    deliverables: ['Système installé', 'Accès configuré'],
  },
  {
    name: 'Stratégie digitale', family: 'marketing', is_featured: true, position: 1,
    short_description: 'Un plan d’action clair plutôt qu’une présence dispersée.',
    bullets: ['Analyse de la concurrence', 'Positionnement', 'Plan de contenu', 'Indicateurs de suivi'],
    deliverables: ['Document de stratégie', 'Calendrier éditorial'],
  },
  {
    name: 'Gestion des réseaux sociaux', family: 'marketing', position: 2,
    short_description: 'Publication régulière, cohérente et mesurée.',
    bullets: ['Calendrier de publication', 'Création des visuels', 'Rédaction des textes', 'Réponses aux messages', 'Rapport mensuel'],
    deliverables: ['Publications programmées', 'Rapport de performance'],
  },
  {
    name: 'Publicité en ligne', family: 'marketing', position: 3,
    short_description: 'Des campagnes ciblées avec un coût par contact suivi.',
    bullets: ['Configuration des campagnes', 'Ciblage', 'Création des visuels', 'Optimisation continue', 'Reporting'],
    deliverables: ['Campagnes actives', 'Tableau de suivi'],
  },
  {
    name: 'Référencement SEO', family: 'marketing', position: 4,
    short_description: 'Être trouvé sur les requêtes qui comptent pour votre activité.',
    bullets: ['Audit technique', 'Recherche de mots-clés', 'Optimisation on-page', 'Contenus optimisés', 'Suivi des positions'],
    deliverables: ['Audit SEO', 'Plan d’optimisation'],
  },
  {
    name: 'Photographie professionnelle', family: 'audiovisual', position: 1,
    short_description: 'Des images qui donnent envie de vous contacter.',
    bullets: ['Séance photo', 'Retouche professionnelle', 'Livraison haute définition', 'Formats réseaux sociaux'],
    deliverables: ['Photos retouchées', 'Banque d’images libre d’usage'],
  },
  {
    name: 'Vidéographie & montage', family: 'audiovisual', is_featured: true, position: 2,
    short_description: 'De l’idée au montage final, une vidéo qui raconte quelque chose.',
    bullets: ['Scénario', 'Tournage', 'Montage', 'Étalonnage', 'Sous-titres'],
    deliverables: ['Vidéo finale', 'Déclinaisons réseaux sociaux'],
  },
  {
    name: 'Prises de vue par drone', family: 'audiovisual', position: 3,
    short_description: 'Vues aériennes pour vos projets, chantiers et événements.',
    bullets: ['Repérage', 'Vol et captation', 'Montage', 'Livraison 4K'],
    deliverables: ['Séquences aériennes', 'Montage final'],
  },
  {
    name: 'Contenu publicitaire', family: 'audiovisual', position: 4,
    short_description: 'Des créations pensées pour la conversion, pas seulement pour l’esthétique.',
    bullets: ['Concept', 'Production', 'Déclinaisons multi-formats', 'Tests créatifs'],
    deliverables: ['Kit créatif complet'],
  },
  {
    name: 'Chatbot IA', family: 'ai', is_featured: true, position: 1,
    short_description: 'Un assistant qui répond à vos clients et qualifie vos prospects 24 h/24.',
    bullets: ['Base de connaissances', 'Personnalité et ton', 'Qualification des prospects', 'Transfert vers un humain', 'Statistiques de conversation'],
    deliverables: ['Chatbot déployé', 'Tableau de bord des conversations'],
  },
  {
    name: 'Automatisations métier', family: 'ai', is_featured: true, position: 2,
    short_description: 'Supprimer les tâches répétitives qui vous coûtent des heures.',
    bullets: ['Cartographie du processus', 'Scénarios d’automatisation', 'Connexion de vos outils', 'Alertes et rapports'],
    deliverables: ['Automatisations en production', 'Documentation des scénarios'],
  },
  {
    name: 'CRM & suivi commercial', family: 'ai', position: 3,
    short_description: 'Centraliser vos prospects, vos relances et vos ventes.',
    bullets: ['Pipeline commercial', 'Fiches clients', 'Relances automatiques', 'Rapports de conversion'],
    deliverables: ['CRM configuré', 'Pipeline opérationnel'],
  },
  {
    name: 'Agents IA & traitement de données', family: 'ai', position: 4,
    short_description: 'Faire traiter par une IA ce qui demandait une saisie manuelle.',
    bullets: ['Extraction de données', 'Classification automatique', 'Génération de documents', 'Contrôle humain sur les actions sensibles'],
    deliverables: ['Agent déployé', 'Procédure de supervision'],
  },
];

// ── Core seed ────────────────────────────────────────────────────────────

export function seedSettings(): number {
  let count = 0;
  transaction(() => {
    for (const setting of DEFAULT_SETTINGS) {
      // Never overwrite a value the owner has already set.
      const exists = scalar<number>('SELECT COUNT(*) AS c FROM settings WHERE key = ?', [setting.key], 0) > 0;
      if (exists) {
        // Keep the label/group metadata fresh even for existing values.
        run(
          `UPDATE settings SET group_name = ?, value_type = ?, label = ? WHERE key = ?`,
          [setting.group, setting.type ?? 'string', setting.label, setting.key],
        );
        continue;
      }
      settingsRepo.setSetting(setting.key, setting.value, {
        group: setting.group,
        type: setting.type ?? 'string',
        label: setting.label,
      });
      count += 1;
    }
  });
  return count;
}

export function seedTaxonomy(): { categories: number; technologies: number } {
  let categories = 0;
  let technologies = 0;
  transaction(() => {
    PROJECT_CATEGORIES.forEach((category, index) => {
      contentRepo.upsertCategory({ ...category, kind: 'project', position: index });
      categories += 1;
    });
    POST_CATEGORIES.forEach((category, index) => {
      contentRepo.upsertCategory({ ...category, kind: 'post', position: index });
      categories += 1;
    });
    expensesRepo.EXPENSE_CATEGORIES.forEach((category, index) => {
      contentRepo.upsertCategory({
        name: category.label, slug: category.key, kind: 'expense', position: index,
      });
      categories += 1;
    });
    TECHNOLOGIES.forEach((tech, index) => {
      contentRepo.upsertTechnology({
        name: tech.name, category: tech.category, position: index, isFeatured: tech.featured,
      });
      technologies += 1;
    });
  });
  return { categories, technologies };
}

export function seedServices(): number {
  let count = 0;
  transaction(() => {
    for (const service of SERVICES) {
      const existing = scalar<number>(
        'SELECT COUNT(*) AS c FROM services WHERE name = ?', [service.name], 0,
      );
      if (existing > 0) continue;
      contentRepo.createService(service);
      count += 1;
    }
  });
  return count;
}

export function seedTemplates(): number {
  let count = 0;
  transaction(() => {
    for (const template of SYSTEM_MESSAGE_TEMPLATES) {
      commsRepo.upsertMessageTemplate({ ...template, isSystem: true });
      count += 1;
    }

    if (scalar<number>('SELECT COUNT(*) AS c FROM contract_templates', [], 0) === 0) {
      financeRepo.upsertContractTemplate({
        name: 'Contrat de prestation standard',
        description: 'Modèle de base, à adapter à chaque mission.',
        body: DEFAULT_CONTRACT_TEMPLATE,
        isDefault: true,
      });
      count += 1;
    }

    if (scalar<number>('SELECT COUNT(*) AS c FROM folder_templates', [], 0) === 0) {
      filesRepo.upsertFolderTemplate({
        name: 'Structure standard',
        description: 'Arborescence créée automatiquement pour chaque nouveau projet.',
        isDefault: true,
        items: filesRepo.DEFAULT_FOLDER_TEMPLATE,
      });
      filesRepo.upsertFolderTemplate({
        name: 'Structure production',
        description: 'Pour les projets audiovisuels et de production lourde.',
        items: filesRepo.PRODUCTION_FOLDER_TEMPLATE,
      });
      count += 2;
    }
  });
  return count;
}

export function seedAutomations(): number {
  let count = 0;
  transaction(() => {
    for (const automation of SYSTEM_AUTOMATIONS) {
      automationsRepo.registerAutomation({
        key: automation.key,
        name: automation.name,
        description: automation.description,
        triggerType: automation.triggerType,
        triggerKey: automation.triggerKey,
        config: automation.defaultConfig,
        enabled: automation.enabledByDefault,
        isSystem: true,
      });
      count += 1;
    }
  });
  return count;
}

/**
 * Creates the first Super Admin from BOOTSTRAP_ADMIN_* env vars.
 *
 * The account is created with `must_change_password = 1`, so the initial
 * password is a one-time key: the guard in `lib/auth/guard.ts` redirects every
 * admin route to the change-password screen until it has been replaced. The
 * password itself is only ever stored as a scrypt hash, and the strength policy
 * is deliberately not applied to this bootstrap value — it is not meant to
 * survive the first login.
 */
export async function seedBootstrapAdmin(): Promise<{ created: boolean; username: string }> {
  usersRepo.syncRolesAndPermissions();

  const username = config.bootstrap.username || 'Choupotman';
  const existing = usersRepo.findUserByLogin(username);
  if (existing) return { created: false, username: existing.username };

  if (usersRepo.countUsers() > 0) {
    // Another admin already exists — do not create a second bootstrap account.
    return { created: false, username };
  }

  const password = config.bootstrap.password;
  if (!password) {
    throw new Error(
      'BOOTSTRAP_ADMIN_PASSWORD is not set. Add it to .env.local before seeding the first admin.',
    );
  }

  const passwordHash = await hashPassword(password);
  usersRepo.createUser({
    username,
    email: config.bootstrap.email,
    fullName: 'Boubaker Choupotman',
    passwordHash,
    roleId: usersRepo.roleIdFor('super_admin'),
    mustChangePassword: true,
  });

  return { created: true, username };
}

export async function seedCore(): Promise<Omit<SeedReport, 'demo' | 'indexed'>> {
  const admin = await seedBootstrapAdmin();
  const settings = seedSettings();
  const taxonomy = seedTaxonomy();
  const services = seedServices();
  const templates = seedTemplates();
  const automations = seedAutomations();

  return {
    rolesSynced: true,
    adminCreated: admin.created,
    adminUsername: admin.username,
    settings,
    services,
    categories: taxonomy.categories,
    technologies: taxonomy.technologies,
    templates,
    automations,
  };
}

// ── Demo data ────────────────────────────────────────────────────────────

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

/** True when demo rows are already present, so seeding is not repeated. */
export function hasDemoData(): boolean {
  return scalar<number>('SELECT COUNT(*) AS c FROM clients WHERE is_demo = 1', [], 0) > 0;
}

/**
 * Sample data for exercising every module.
 *
 * All rows carry `is_demo = 1`. Company names are obviously fictional
 * ("Démo — …") so nothing here can be mistaken for a real reference, and
 * `purgeDemo()` removes the whole set in one transaction.
 */
export function seedDemo(): DemoReport {
  const report: DemoReport = {
    clients: 0, projects: 0, stages: 0, tasks: 0, quotes: 0, invoices: 0, payments: 0,
    feedback: 0, revisions: 0, events: 0, leads: 0, expenses: 0, subscriptions: 0,
    portfolio: 0, caseStudies: 0, posts: 0, testimonials: 0, briefs: 0, moodboards: 0,
  };

  if (hasDemoData()) return report;

  const projectCategories = contentRepo.listCategories('project');
  const categoryId = (slug: string) => projectCategories.find((c) => c.slug === slug)?.id ?? null;
  const postCategories = contentRepo.listCategories('post');
  const postCategoryId = (slug: string) => postCategories.find((c) => c.slug === slug)?.id ?? null;

  // ── Clients ──
  const clientA = clientsRepo.createClient({
    name: 'Démo — Amine Belkacem', company: 'Démo Atlas Immobilier',
    email: 'contact@demo-atlas.example', phone: '+213 000 00 00 01',
    whatsapp: '+213 000 00 00 01', country: 'Algérie', city: 'Alger',
    website: 'https://demo-atlas.example', currency: 'DZD',
    source: 'contact_form', notes: 'Données de démonstration créées par le seed.',
    is_demo: true,
  });
  const clientB = clientsRepo.createClient({
    name: 'Démo — Yasmine Haddad', company: 'Démo Studio Lumière',
    email: 'hello@demo-lumiere.example', phone: '+213 000 00 00 02',
    country: 'Algérie', city: 'Oran', currency: 'DZD', source: 'referral',
    notes: 'Données de démonstration créées par le seed.', is_demo: true,
  });
  const clientC = clientsRepo.createClient({
    name: 'Démo — Karim Ziani', company: 'Démo TechnoParts',
    email: 'k.ziani@demo-technoparts.example', phone: '+213 000 00 00 03',
    country: 'Algérie', city: 'Constantine', currency: 'DZD', source: 'chatbot',
    notes: 'Données de démonstration créées par le seed.', is_demo: true,
  });
  report.clients = 3;

  // ── Projects ──
  const projectSpecs: {
    title: string; clientId: number; category: string; status: projectsRepo.ProjectWithClient['status'];
    budget: number; start: string; delivery: string; priority: 'low' | 'medium' | 'high' | 'urgent';
    description: string; progressHint: number;
  }[] = [
    {
      title: 'Démo — Site vitrine Atlas Immobilier', clientId: clientA,
      category: 'developpement-web', status: 'in_progress', budget: 180000,
      start: daysFromNow(-24), delivery: daysFromNow(11), priority: 'high',
      description: 'Site vitrine avec catalogue de biens, recherche et formulaire de contact qualifié.',
      progressHint: 60,
    },
    {
      title: 'Démo — Refonte identité Studio Lumière', clientId: clientB,
      category: 'design', status: 'in_review', budget: 95000,
      start: daysFromNow(-40), delivery: daysFromNow(4), priority: 'medium',
      description: 'Refonte de l’identité visuelle et déclinaison sur les supports print et web.',
      progressHint: 80,
    },
    {
      title: 'Démo — Automatisation devis TechnoParts', clientId: clientC,
      category: 'ia-automatisation', status: 'in_progress', budget: 240000,
      start: daysFromNow(-15), delivery: daysFromNow(25), priority: 'urgent',
      description: 'Automatisation de la génération de devis à partir des demandes entrantes.',
      progressHint: 35,
    },
    {
      title: 'Démo — Campagne publicitaire Atlas', clientId: clientA,
      category: 'marketing-digital', status: 'completed', budget: 60000,
      start: daysFromNow(-95), delivery: daysFromNow(-38), priority: 'medium',
      description: 'Campagne de génération de contacts sur les réseaux sociaux.',
      progressHint: 100,
    },
    {
      title: 'Démo — Vidéo institutionnelle Studio Lumière', clientId: clientB,
      category: 'audiovisuel', status: 'awaiting_client', budget: 130000,
      start: daysFromNow(-30), delivery: daysFromNow(-2), priority: 'high',
      description: 'Vidéo de présentation de 2 minutes, tournage, montage et déclinaisons sociales.',
      progressHint: 90,
    },
  ];

  const projectIds: number[] = [];

  for (const spec of projectSpecs) {
    const projectId = projectsRepo.createProject({
      title: spec.title,
      client_id: spec.clientId,
      category_id: categoryId(spec.category),
      description: spec.description,
      status: spec.status,
      priority: spec.priority,
      budget: spec.budget,
      currency: 'DZD',
      start_date: spec.start,
      delivery_date: spec.delivery,
      revisions_included: 3,
      revision_extra_cost: 8000,
      notes: 'Projet de démonstration — supprimable via npm run db:reset -- --demo.',
      is_demo: true,
    });
    projectIds.push(projectId);
    report.projects += 1;

    // Stages
    projectsRepo.createDefaultStages(projectId);
    const stages = projectsRepo.listStages(projectId);
    report.stages += stages.length;

    // Tasks spread across stages, completion matching the progress hint
    const taskTitles = [
      'Recueillir le brief et les contenus',
      'Définir l’arborescence',
      'Maquetter les écrans clés',
      'Intégrer la page d’accueil',
      'Intégrer les pages internes',
      'Configurer le formulaire',
      'Recette et corrections',
      'Mise en production',
    ];
    const doneCount = Math.round((spec.progressHint / 100) * taskTitles.length);

    taskTitles.forEach((title, index) => {
      const stage = stages[Math.min(stages.length - 1, Math.floor((index / taskTitles.length) * stages.length))];
      const isDone = index < doneCount;
      projectsRepo.createTask({
        project_id: projectId,
        stage_id: stage?.id ?? null,
        title: `${title}`,
        description: null,
        status: isDone ? 'done' : index === doneCount ? 'in_progress' : 'todo',
        priority: index === doneCount ? 'high' : 'medium',
        due_date: daysFromNow(-10 + index * 4),
        estimate_hours: 4,
        position: index,
        is_demo: true,
      });
      report.tasks += 1;
    });

    // Folder tree
    filesRepo.applyFolderTemplate({
      projectId,
      clientId: spec.clientId,
      rootName: spec.title,
      names: filesRepo.DEFAULT_FOLDER_TEMPLATE,
    });

    // Timeline
    projectsRepo.addProjectEvent({
      projectId, kind: 'created', title: 'Projet créé',
      body: 'Création automatique par les données de démonstration.',
      actorLabel: 'Seed',
    });
    projectsRepo.addProjectEvent({
      projectId, kind: 'stage', title: 'Étapes générées',
      body: `${stages.length} étapes créées automatiquement.`, actorLabel: 'Automatisation',
    });
    report.events += 2;
  }

  // ── Quotes, invoices, payments ──
  const quoteId = financeRepo.createQuote({
    client_id: clientA,
    project_id: projectIds[0],
    title: 'Démo — Site vitrine Atlas Immobilier',
    status: 'accepted',
    valid_until: daysFromNow(18),
    tax_rate: 19,
    is_demo: true,
    items: [
      { label: 'Conception et maquettage', quantity: 1, unit: 'forfait', unit_price: 45000 },
      { label: 'Intégration et développement', quantity: 1, unit: 'forfait', unit_price: 95000 },
      { label: 'Optimisation SEO de base', quantity: 1, unit: 'forfait', unit_price: 25000 },
      { label: 'Formation à la prise en main', quantity: 2, unit: 'heure', unit_price: 7500 },
    ],
  });
  report.quotes = 1;

  const _quoteB = financeRepo.createQuote({
    client_id: clientC,
    project_id: projectIds[2],
    title: 'Démo — Automatisation des devis',
    status: 'sent',
    valid_until: daysFromNow(22),
    tax_rate: 19,
    is_demo: true,
    items: [
      { label: 'Cartographie du processus', quantity: 1, unit: 'forfait', unit_price: 40000 },
      { label: 'Développement de l’automatisation', quantity: 1, unit: 'forfait', unit_price: 150000 },
      { label: 'Formation et documentation', quantity: 1, unit: 'forfait', unit_price: 30000 },
    ],
  });
  report.quotes += 1;

  // Paid invoice
  const invoicePaid = financeRepo.invoiceFromQuote(quoteId);
  if (invoicePaid) {
    financeRepo.updateInvoice(invoicePaid, { status: 'sent', issue_date: daysFromNow(-22), due_date: daysFromNow(-7) });
    const invoice = financeRepo.findInvoice(invoicePaid);
    if (invoice) {
      financeRepo.createPayment({
        invoiceId: invoicePaid, amount: invoice.total, method: 'transfer',
        reference: 'DEMO-VIR-0001', paidAt: daysFromNow(-6), isDemo: true,
      });
      report.payments += 1;
    }
    report.invoices += 1;
  }

  // Partially paid invoice
  const invoicePartial = financeRepo.createInvoice({
    client_id: clientB,
    project_id: projectIds[1],
    title: 'Démo — Refonte identité (acompte)',
    status: 'sent',
    kind: 'deposit',
    issue_date: daysFromNow(-12),
    due_date: daysFromNow(3),
    tax_rate: 19,
    is_demo: true,
    items: [{ label: 'Acompte 40 % — refonte identité', quantity: 1, unit: 'forfait', unit_price: 38000 }],
  });
  financeRepo.createPayment({
    invoiceId: invoicePartial, amount: 20000, method: 'ccp',
    reference: 'DEMO-CCP-0002', paidAt: daysFromNow(-9), isDemo: true,
  });
  report.invoices += 1;
  report.payments += 1;

  // Overdue invoice
  const _invoiceOverdue = financeRepo.createInvoice({
    client_id: clientB,
    project_id: projectIds[4],
    title: 'Démo — Vidéo institutionnelle',
    status: 'sent',
    issue_date: daysFromNow(-45),
    due_date: daysFromNow(-18),
    tax_rate: 19,
    is_demo: true,
    items: [
      { label: 'Tournage (1 journée)', quantity: 1, unit: 'jour', unit_price: 60000 },
      { label: 'Montage et étalonnage', quantity: 1, unit: 'forfait', unit_price: 45000 },
      { label: 'Déclinaisons réseaux sociaux', quantity: 3, unit: 'format', unit_price: 8000 },
    ],
  });
  report.invoices += 1;

  // Draft invoice
  financeRepo.createInvoice({
    client_id: clientC,
    project_id: projectIds[2],
    title: 'Démo — Automatisation (jalon 1)',
    status: 'draft',
    tax_rate: 19,
    is_demo: true,
    items: [{ label: 'Jalon 1 — cartographie et spécifications', quantity: 1, unit: 'forfait', unit_price: 40000 }],
  });
  report.invoices += 1;

  financeRepo.refreshOverdueInvoices();

  // ── Revisions & feedback ──
  if (projectIds[1]) {
    for (let i = 0; i < 4; i += 1) {
      const revision = projectsRepo.createRevision({
        projectId: projectIds[1],
        title: `Révision #${i + 1} — ajustements`,
        description: i === 3
          ? 'Quatrième demande de modification : au-delà du forfait inclus.'
          : 'Ajustements demandés par le client après présentation.',
        requestedBy: 'client',
        isDemo: true,
      });
      if (revision.isExtra) {
        projectsRepo.addProjectEvent({
          projectId: projectIds[1],
          kind: 'revision',
          title: `Révision #${revision.indexNumber} hors forfait`,
          body: `Supplément calculé : ${revision.extraCost} DZD.`,
          actorLabel: 'Automatisation',
        });
        report.events += 1;
      }
      report.revisions += 1;
    }

    projectsRepo.createFeedback({
      projectId: projectIds[1], clientId: clientB,
      authorLabel: 'Démo — Yasmine Haddad',
      comment: 'La direction visuelle nous convient. Peut-on tester une variante plus sombre du logo ?',
      rating: 4, decision: 'changes_requested', source: 'portal', isDemo: true,
    });
    projectsRepo.createFeedback({
      projectId: projectIds[1], clientId: clientB,
      authorLabel: 'Démo — Yasmine Haddad',
      comment: 'Version validée, merci.',
      rating: 5, decision: 'approved', source: 'portal', isDemo: true,
    });
    report.feedback += 2;
  }

  if (projectIds[0]) {
    projectsRepo.createFeedback({
      projectId: projectIds[0], clientId: clientA,
      authorLabel: 'Démo — Amine Belkacem',
      comment: 'La page d’accueil est très claire. Merci d’agrandir les photos des biens.',
      rating: 4, decision: 'changes_requested', source: 'portal', isDemo: true,
    });
    report.feedback += 1;
  }

  // ── Leads / pipeline ──
  const demoLeads: leadsRepo.LeadInput[] = [
    {
      name: 'Démo — Nadia Bouzid', company: 'Démo Pharmacie Centrale',
      email: 'nadia@demo-pharmacie.example', phone: '+213 000 00 00 11',
      stage: 'new', source: 'contact_form', service_interest: 'Site vitrine professionnel',
      budget_range: '50 000 – 150 000 DZD', estimated_value: 110000,
      deadline_hint: '1 mois', message: 'Nous cherchons un site simple avec les horaires et un formulaire.',
      is_demo: true,
    },
    {
      name: 'Démo — Sofiane Merad', company: 'Démo Transport Express',
      email: 'sofiane@demo-transport.example', stage: 'contacted', source: 'chatbot',
      service_interest: 'Application web sur mesure', budget_range: '400 000 – 1 000 000 DZD',
      estimated_value: 650000, deadline_hint: '2 à 3 mois',
      message: 'Suivi de flotte et de livraisons en temps réel.', is_demo: true,
    },
    {
      name: 'Démo — Leila Cherif', company: 'Démo Institut Beauté',
      email: 'leila@demo-institut.example', phone: '+213 000 00 00 13',
      stage: 'qualified', source: 'project_request', service_interest: 'Gestion des réseaux sociaux',
      budget_range: '50 000 – 150 000 DZD', estimated_value: 90000,
      deadline_hint: 'Flexible', message: 'Besoin d’une présence régulière sur Instagram.', is_demo: true,
    },
    {
      name: 'Démo — Omar Tazi', company: 'Démo Groupe Agro',
      email: 'omar@demo-agro.example', stage: 'proposal', source: 'referral',
      service_interest: 'Automatisations métier', budget_range: '> 1 000 000 DZD',
      estimated_value: 1200000, deadline_hint: 'Urgent (< 2 semaines)',
      message: 'Automatiser le traitement des bons de commande.', is_demo: true,
    },
    {
      name: 'Démo — Hana Rezki', company: 'Démo Cabinet Conseil',
      email: 'hana@demo-conseil.example', stage: 'won', source: 'contact_form',
      service_interest: 'Dashboard & système d’administration', estimated_value: 320000, is_demo: true,
    },
    {
      name: 'Démo — Reda Slimani', company: 'Démo Boutique Mode',
      email: 'reda@demo-mode.example', stage: 'lost', source: 'contact_form',
      service_interest: 'Site vitrine professionnel', estimated_value: 75000, is_demo: true,
    },
  ];
  for (const lead of demoLeads) {
    leadsRepo.createLead(lead);
    report.leads += 1;
  }

  // ── Expenses & subscriptions ──
  const demoExpenses = [
    { label: 'Démo — Hébergement annuel', category: 'hosting' as const, amount: 24000, spentAt: daysFromNow(-60) },
    { label: 'Démo — Licence suite créative', category: 'software' as const, amount: 9800, spentAt: daysFromNow(-30) },
    { label: 'Démo — Campagne publicitaire test', category: 'advertising' as const, amount: 35000, spentAt: daysFromNow(-20) },
    { label: 'Démo — Disque dur externe', category: 'hardware' as const, amount: 18500, spentAt: daysFromNow(-14) },
    { label: 'Démo — Déplacement client Oran', category: 'transport' as const, amount: 6200, spentAt: daysFromNow(-8) },
    { label: 'Démo — Sous-traitance montage vidéo', category: 'subcontracting' as const, amount: 28000, spentAt: daysFromNow(-5) },
  ];
  for (const expense of demoExpenses) {
    expensesRepo.createExpense({ ...expense, isDemo: true, notes: 'Dépense de démonstration.' });
    report.expenses += 1;
  }

  const demoSubscriptions = [
    { serviceName: 'Démo — Hébergement cloud', category: 'hosting' as const, amount: 2400, frequency: 'monthly' as const, renewalDate: daysFromNow(6) },
    { serviceName: 'Démo — Suite design', category: 'software' as const, amount: 4900, frequency: 'monthly' as const, renewalDate: daysFromNow(19) },
    { serviceName: 'Démo — API IA', category: 'ai' as const, amount: 3500, frequency: 'monthly' as const, renewalDate: daysFromNow(2) },
    { serviceName: 'Démo — Nom de domaine', category: 'hosting' as const, amount: 2200, frequency: 'yearly' as const, renewalDate: daysFromNow(120) },
  ];
  for (const subscription of demoSubscriptions) {
    expensesRepo.createSubscription({ ...subscription, isDemo: true });
    report.subscriptions += 1;
  }

  // ── Calendar ──
  const demoEvents = [
    { title: 'Démo — Réunion de cadrage Atlas', kind: 'meeting' as const, startsAt: `${daysFromNow(2)}T10:00:00.000Z`, projectId: projectIds[0], clientId: clientA },
    { title: 'Démo — Présentation identité Studio Lumière', kind: 'meeting' as const, startsAt: `${daysFromNow(4)}T14:00:00.000Z`, projectId: projectIds[1], clientId: clientB },
    { title: 'Démo — Point automatisation TechnoParts', kind: 'meeting' as const, startsAt: `${daysFromNow(7)}T09:30:00.000Z`, projectId: projectIds[2], clientId: clientC },
  ];
  for (const event of demoEvents) {
    calendarRepo.createEvent({ ...event, isDemo: true });
    report.events += 1;
  }

  // ── Public content (clearly marked as demonstration) ──
  const demoPortfolio: contentRepo.PortfolioInput[] = [
    {
      title: 'Démo — Plateforme immobilière',
      subtitle: 'Site vitrine et catalogue de biens',
      client_name: 'Démo Atlas Immobilier',
      category_id: categoryId('developpement-web'),
      summary: 'Exemple de réalisation créé pour illustrer la mise en page du portfolio.',
      description: 'Ce projet est une donnée de démonstration. Il montre comment une réalisation réelle sera présentée : contexte, problématique, solution et résultats.',
      challenge: 'Rendre un catalogue de biens lisible et rapide à parcourir sur mobile.',
      objectives: 'Augmenter le nombre de demandes qualifiées reçues via le site.',
      solution: 'Une recherche par filtres, des fiches synthétiques et un formulaire court.',
      results: 'Les chiffres réels seront renseignés par l’administrateur.',
      year: new Date().getFullYear(),
      status: 'published',
      technologies: ['Next.js', 'TypeScript', 'Tailwind CSS'],
      services_done: ['Site vitrine professionnel', 'Référencement SEO'],
      is_featured: true,
      is_demo: true,
      position: 1,
    },
    {
      title: 'Démo — Identité visuelle studio photo',
      subtitle: 'Direction artistique et déclinaisons',
      client_name: 'Démo Studio Lumière',
      category_id: categoryId('design'),
      summary: 'Exemple de réalisation design créé pour la démonstration.',
      description: 'Donnée de démonstration illustrant la présentation d’un projet de design.',
      challenge: 'Unifier une identité utilisée de façon incohérente sur les supports.',
      objectives: 'Un système visuel simple, applicable sans graphiste.',
      solution: 'Un jeu de règles, des gabarits et une bibliothèque d’assets.',
      year: new Date().getFullYear(),
      status: 'published',
      technologies: ['Figma', 'Adobe Photoshop'],
      services_done: ['Contenu publicitaire'],
      is_demo: true,
      position: 2,
    },
    {
      title: 'Démo — Automatisation commerciale',
      subtitle: 'Génération de devis assistée',
      client_name: 'Démo TechnoParts',
      category_id: categoryId('ia-automatisation'),
      summary: 'Exemple de projet d’automatisation créé pour la démonstration.',
      description: 'Donnée de démonstration illustrant un projet d’automatisation et d’IA.',
      challenge: 'Des devis rédigés à la main, avec plusieurs jours de délai.',
      objectives: 'Réduire le délai de réponse commerciale.',
      solution: 'Un flux automatisé qui prépare le devis et le soumet à validation humaine.',
      year: new Date().getFullYear(),
      status: 'published',
      technologies: ['Node.js', 'Claude / API IA', 'n8n'],
      services_done: ['Automatisations métier', 'CRM & suivi commercial'],
      is_featured: true,
      is_demo: true,
      position: 3,
    },
  ];
  const portfolioIds = demoPortfolio.map((project) => contentRepo.createPortfolio(project));
  report.portfolio = portfolioIds.length;

  const caseStudyId = contentRepo.createCaseStudy({
    title: 'Démo — Réduire le délai de réponse commerciale',
    subtitle: 'Étude de cas de démonstration',
    portfolio_id: portfolioIds[2] ?? null,
    problem: 'Les demandes entrantes attendaient plusieurs jours avant d’obtenir un devis, et une partie des prospects se tournait vers un concurrent entre-temps.',
    objectives: 'Répondre à toute demande entrante le jour même, sans dégrader la qualité du devis.',
    strategy: 'Cartographier le processus existant, identifier les étapes réellement manuelles, puis automatiser uniquement celles qui ne demandent pas de jugement.',
    solution: 'Un flux qui structure la demande, propose un devis pré-rempli et le soumet à validation humaine avant envoi.',
    development: 'Développement itératif avec mise en production progressive, en gardant une validation humaine sur chaque envoi.',
    tools_used: 'Node.js, API IA, base de données, générateur de PDF.',
    result: 'Les chiffres réels seront renseignés par l’administrateur : cette étude de cas est un gabarit de démonstration.',
    metrics: [
      { label: 'Délai de réponse', value: '—', note: 'À renseigner' },
      { label: 'Devis traités / mois', value: '—', note: 'À renseigner' },
      { label: 'Temps gagné', value: '—', note: 'À renseigner' },
    ],
    status: 'published',
    is_demo: true,
  });
  report.caseStudies = caseStudyId ? 1 : 0;

  const demoPosts: contentRepo.PostInput[] = [
    {
      title: 'Démo — Pourquoi un site rapide rapporte plus qu’un site joli',
      excerpt: 'Article de démonstration : la performance web comme levier commercial direct.',
      content: '<p>Cet article est une donnée de démonstration destinée à illustrer la mise en page du blog.</p><h2>La vitesse est une fonctionnalité</h2><p>Un visiteur qui attend trois secondes de trop ne revient pas. Optimiser les images, différer ce qui n’est pas visible et limiter le JavaScript envoyé au navigateur a un effet direct sur le nombre de contacts reçus.</p><h2>Ce qu’il faut mesurer</h2><p>Le temps d’affichage du contenu principal, la stabilité visuelle et la réactivité aux interactions. Ces trois indicateurs suffisent pour décider où investir.</p>',
      category_id: postCategoryId('developpement'),
      status: 'published',
      author_name: 'Boubaker Choupotman',
      tags: ['performance', 'web', 'seo'],
      is_featured: true,
      is_demo: true,
      published_at: new Date(Date.now() - 6 * 86400000).toISOString(),
    },
    {
      title: 'Démo — Automatiser sans perdre le contrôle',
      excerpt: 'Article de démonstration : où s’arrête l’automatisation et où commence la décision humaine.',
      content: '<p>Cet article est une donnée de démonstration.</p><h2>Automatiser la préparation, pas la décision</h2><p>Une automatisation utile prépare le travail et laisse la validation à un humain. C’est particulièrement vrai pour tout ce qui engage de l’argent : un devis, une facture, une relance.</p><h2>Trois règles simples</h2><p>Tracer chaque action, rendre chaque étape réversible, et demander confirmation avant tout envoi vers un client.</p>',
      category_id: postCategoryId('intelligence-artificielle'),
      status: 'published',
      author_name: 'Boubaker Choupotman',
      tags: ['automatisation', 'ia', 'processus'],
      is_demo: true,
      published_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    },
    {
      title: 'Démo — Sécuriser un petit réseau d’entreprise',
      excerpt: 'Article de démonstration : les mesures qui comptent vraiment quand on n’a pas d’équipe dédiée.',
      content: '<p>Cet article est une donnée de démonstration.</p><h2>Commencer par les accès</h2><p>Un gestionnaire de mots de passe, l’authentification à deux facteurs et la suppression des comptes inutilisés couvrent la majorité des incidents réels.</p><h2>Tester les sauvegardes</h2><p>Une sauvegarde jamais restaurée n’est pas une sauvegarde. Un test de restauration trimestriel suffit à révéler les problèmes.</p>',
      category_id: postCategoryId('informatique'),
      status: 'draft',
      author_name: 'Boubaker Choupotman',
      tags: ['cybersécurité', 'réseau'],
      is_demo: true,
    },
  ];
  for (const post of demoPosts) {
    contentRepo.createPost(post);
    report.posts += 1;
  }

  // Testimonials are demo-only and explicitly labelled, so the public site never
  // shows a quote that was not actually given.
  const demoTestimonials = [
    {
      author_name: 'Démo — Amine Belkacem', author_role: 'Gérant', company: 'Démo Atlas Immobilier',
      quote: 'Témoignage de démonstration. Les avis réels seront ajoutés depuis l’espace d’administration.',
      rating: 5, client_id: clientA, is_published: true, is_demo: true, position: 1,
    },
    {
      author_name: 'Démo — Yasmine Haddad', author_role: 'Directrice artistique', company: 'Démo Studio Lumière',
      quote: 'Témoignage de démonstration. Les avis réels seront ajoutés depuis l’espace d’administration.',
      rating: 5, client_id: clientB, is_published: true, is_demo: true, position: 2,
    },
  ];
  for (const testimonial of demoTestimonials) {
    contentRepo.upsertTestimonial(testimonial);
    report.testimonials += 1;
  }

  // ── Brief & moodboard ──
  const brief = briefsRepo.createBrief({
    title: 'Démo — Brief site vitrine Atlas',
    clientId: clientA,
    projectId: projectIds[0],
    introText: 'Brief de démonstration. Répondez aux questions pour cadrer le projet.',
    expiresInDays: 30,
    isDemo: true,
  });
  const questions = briefsRepo.listBriefQuestions(brief.id);
  const demoAnswers: Record<string, string> = {
    contact_name: 'Démo — Amine Belkacem',
    company: 'Démo Atlas Immobilier',
    email: 'contact@demo-atlas.example',
    project_name: 'Site vitrine et catalogue',
    project_description: 'Présenter nos biens et recevoir des demandes qualifiées.',
    objectives: 'Recevoir plus de demandes sérieuses, réduire les appels pour rien.',
    budget: '150 000 – 400 000 DZD',
    deadline: '1 mois',
  };
  for (const question of questions) {
    const value = demoAnswers[question.key];
    if (!value) continue;
    briefsRepo.saveBriefResponse({
      briefId: brief.id, questionId: question.id, questionKey: question.key, value,
    });
  }
  report.briefs = 1;

  const moodboardId = moodboardsRepo.createMoodboard({
    title: 'Démo — Direction visuelle Atlas',
    projectId: projectIds[0],
    clientId: clientA,
    description: 'Moodboard de démonstration : couleurs, notes et références.',
    isDemo: true,
  });
  moodboardsRepo.addMoodboardItem({ moodboardId, kind: 'color', color: '#725ee0', content: 'Accent principal', x: 40, y: 40, width: 160, height: 120 });
  moodboardsRepo.addMoodboardItem({ moodboardId, kind: 'color', color: '#0095ae', content: 'Accent secondaire', x: 220, y: 40, width: 160, height: 120 });
  moodboardsRepo.addMoodboardItem({ moodboardId, kind: 'note', content: 'Beaucoup de blanc, photos larges, typographie sobre.', x: 400, y: 40, width: 240, height: 140 });
  moodboardsRepo.addMoodboardItem({ moodboardId, kind: 'link', url: 'https://example.com', content: 'Référence de mise en page', x: 40, y: 190, width: 240, height: 90 });
  report.moodboards = 1;

  // Refresh derived numbers now that tasks exist.
  for (const projectId of projectIds) projectsRepo.recalcProjectProgress(projectId);

  return report;
}

/**
 * Removes every demonstration row in one transaction. Tables without an
 * `is_demo` column are cleaned via their parent (cascade) or by matching the
 * "Démo — " prefix, which the seed applies to every user-visible label.
 */
export function purgeDemo(): Record<string, number> {
  const removed: Record<string, number> = {};
  transaction(() => {
    const demoTables = [
      'payments', 'invoices', 'quotes', 'contracts', 'revisions', 'feedback',
      'tasks', 'projects', 'clients', 'leads', 'expenses', 'subscriptions',
      'calendar_events', 'messages', 'portfolio_projects', 'case_studies',
      'blog_posts', 'testimonials', 'briefs', 'moodboards', 'files',
    ];
    for (const table of demoTables) {
      removed[table] = run(`DELETE FROM ${table} WHERE is_demo = 1`).changes;
    }
    // Orphans whose parent had no is_demo flag of its own.
    removed.project_events = run(
      'DELETE FROM project_events WHERE project_id NOT IN (SELECT id FROM projects)',
    ).changes;
    removed.file_folders = run(
      `DELETE FROM file_folders WHERE project_id IS NOT NULL
       AND project_id NOT IN (SELECT id FROM projects)`,
    ).changes;
    removed.contact_submissions = run(
      "DELETE FROM contact_submissions WHERE name LIKE 'Démo — %'",
    ).changes;
  });
  rebuildIndex();
  return removed;
}

/** Full setup: migrate, seed core, optionally seed demo, then build the search index. */
export async function runSeed(options: { demo?: boolean } = {}): Promise<SeedReport> {
  migrate(getDb());
  const core = await seedCore();
  const demo = options.demo === false ? null : seedDemo();
  const indexed = rebuildIndex();
  return { ...core, demo, indexed };
}
