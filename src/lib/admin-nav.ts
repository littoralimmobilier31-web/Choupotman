import type { Permission, Resource } from '@/lib/auth/permissions';

/**
 * Admin navigation.
 *
 * One declaration drives the sidebar, the command palette and the mobile menu, so
 * a new section appears everywhere at once. `permission` is what the sidebar
 * filters on — a Finance user simply never sees the content sections, and the
 * page guards enforce the same rule server-side.
 */

export type NavItem = {
  href: string;
  label: string;
  /** lucide-react icon name, resolved by the sidebar. */
  icon: string;
  permission: Permission;
  resource: Resource;
  /** Badge source: resolved server-side into a count. */
  badge?: 'notifications' | 'submissions' | 'overdueInvoices' | 'openTasks' | 'newFeedback';
  description?: string;
  /** Keywords that should also match this entry in the command palette. */
  keywords?: string[];
};

export type NavGroup = { label: string; items: NavItem[] };

export const ADMIN_NAV: NavGroup[] = [
  {
    label: 'Pilotage',
    items: [
      {
        href: '/espace-admin',
        label: 'Tableau de bord',
        icon: 'LayoutDashboard',
        permission: 'dashboard.view',
        resource: 'dashboard',
        description: 'Vue d’ensemble de l’activité',
        keywords: ['accueil', 'dashboard', 'kpi'],
      },
      {
        href: '/espace-admin/statistiques',
        label: 'Statistiques',
        icon: 'ChartLine',
        permission: 'analytics.view',
        resource: 'analytics',
        description: 'Revenus, dépenses, conversion',
        keywords: ['analytics', 'rapport', 'chiffres', 'ca'],
      },
      {
        href: '/espace-admin/calendrier',
        label: 'Calendrier',
        icon: 'CalendarDays',
        permission: 'calendar.view',
        resource: 'calendar',
        description: 'Deadlines, livraisons, rendez-vous',
        keywords: ['agenda', 'planning', 'échéances'],
      },
      {
        href: '/espace-admin/assistant',
        label: 'Choupotman AI',
        icon: 'Sparkles',
        permission: 'ai.view',
        resource: 'ai',
        description: 'Assistant IA privé',
        keywords: ['ia', 'ai', 'assistant', 'chat'],
      },
    ],
  },
  {
    label: 'Commercial',
    items: [
      {
        href: '/espace-admin/prospects',
        label: 'Prospects',
        icon: 'Target',
        permission: 'leads.view',
        resource: 'leads',
        description: 'Pipeline commercial',
        keywords: ['leads', 'pipeline', 'crm'],
      },
      {
        href: '/espace-admin/clients',
        label: 'Clients',
        icon: 'Users',
        permission: 'clients.view',
        resource: 'clients',
        description: 'Base clients et fiches',
        keywords: ['crm', 'contacts'],
      },
      {
        href: '/espace-admin/demandes',
        label: 'Demandes reçues',
        icon: 'Inbox',
        permission: 'leads.view',
        resource: 'leads',
        badge: 'submissions',
        description: 'Formulaires et demandes de projet',
        keywords: ['formulaire', 'contact', 'inbox'],
      },
      {
        href: '/espace-admin/briefs',
        label: 'Briefs',
        icon: 'ClipboardList',
        permission: 'briefs.view',
        resource: 'briefs',
        description: 'Questionnaires clients',
        keywords: ['questionnaire', 'cadrage'],
      },
    ],
  },
  {
    label: 'Production',
    items: [
      {
        href: '/espace-admin/projets',
        label: 'Projets',
        icon: 'FolderKanban',
        permission: 'projects.view',
        resource: 'projects',
        description: 'Projets, étapes et avancement',
        keywords: ['missions', 'chantiers'],
      },
      {
        href: '/espace-admin/taches',
        label: 'Tâches',
        icon: 'ListChecks',
        permission: 'tasks.view',
        resource: 'tasks',
        badge: 'openTasks',
        description: 'Kanban global',
        keywords: ['kanban', 'todo', 'board'],
      },
      {
        href: '/espace-admin/revisions',
        label: 'Révisions',
        icon: 'RefreshCw',
        permission: 'revisions.view',
        resource: 'revisions',
        description: 'Demandes de modification',
        keywords: ['modifications', 'retours'],
      },
      {
        href: '/espace-admin/feedback',
        label: 'Feedback',
        icon: 'MessageSquareQuote',
        permission: 'feedback.view',
        resource: 'feedback',
        badge: 'newFeedback',
        description: 'Retours clients',
        keywords: ['avis', 'validation'],
      },
      {
        href: '/espace-admin/fichiers',
        label: 'Fichiers',
        icon: 'FolderOpen',
        permission: 'files.view',
        resource: 'files',
        description: 'Bibliothèque de fichiers',
        keywords: ['documents', 'médias', 'livrables'],
      },
      {
        href: '/espace-admin/moodboards',
        label: 'Moodboards',
        icon: 'Palette',
        permission: 'moodboards.view',
        resource: 'moodboards',
        description: 'Direction visuelle',
        keywords: ['inspiration', 'références'],
      },
    ],
  },
  {
    label: 'Finances',
    items: [
      {
        href: '/espace-admin/devis',
        label: 'Devis',
        icon: 'FileText',
        permission: 'quotes.view',
        resource: 'quotes',
        description: 'Propositions commerciales',
        keywords: ['proposition', 'estimation'],
      },
      {
        href: '/espace-admin/factures',
        label: 'Factures',
        icon: 'Receipt',
        permission: 'invoices.view',
        resource: 'invoices',
        badge: 'overdueInvoices',
        description: 'Facturation et encaissement',
        keywords: ['facturation', 'invoice'],
      },
      {
        href: '/espace-admin/paiements',
        label: 'Paiements',
        icon: 'Banknote',
        permission: 'payments.view',
        resource: 'payments',
        description: 'Encaissements enregistrés',
        keywords: ['règlements', 'virements'],
      },
      {
        href: '/espace-admin/contrats',
        label: 'Contrats',
        icon: 'FileSignature',
        permission: 'contracts.view',
        resource: 'contracts',
        description: 'Contrats de prestation',
        keywords: ['engagement', 'signature'],
      },
      {
        href: '/espace-admin/depenses',
        label: 'Dépenses',
        icon: 'CreditCard',
        permission: 'expenses.view',
        resource: 'expenses',
        description: 'Charges et justificatifs',
        keywords: ['charges', 'achats'],
      },
      {
        href: '/espace-admin/abonnements',
        label: 'Abonnements',
        icon: 'RefreshCcwDot',
        permission: 'subscriptions.view',
        resource: 'subscriptions',
        description: 'Renouvellements récurrents',
        keywords: ['saas', 'récurrent', 'licences'],
      },
    ],
  },
  {
    label: 'Contenu public',
    items: [
      {
        href: '/espace-admin/portfolio',
        label: 'Portfolio',
        icon: 'Image',
        permission: 'portfolio.view',
        resource: 'portfolio',
        description: 'Projets publiés',
        keywords: ['réalisations', 'travaux'],
      },
      {
        href: '/espace-admin/etudes-de-cas',
        label: 'Études de cas',
        icon: 'BookOpen',
        permission: 'case_studies.view',
        resource: 'case_studies',
        description: 'Démarche et résultats',
        keywords: ['case study'],
      },
      {
        href: '/espace-admin/blog',
        label: 'Blog',
        icon: 'Newspaper',
        permission: 'blog.view',
        resource: 'blog',
        description: 'Articles et tutoriels',
        keywords: ['articles', 'posts'],
      },
      {
        href: '/espace-admin/services',
        label: 'Services',
        icon: 'Layers',
        permission: 'services.view',
        resource: 'services',
        description: 'Catalogue de prestations',
        keywords: ['prestations', 'offres'],
      },
      {
        href: '/espace-admin/profil',
        label: 'Profil / À propos',
        icon: 'UserCircle',
        permission: 'profile.view',
        resource: 'profile',
        description: 'Parcours, compétences, certifications',
        keywords: ['cv', 'expérience', 'bio'],
      },
      {
        href: '/espace-admin/temoignages',
        label: 'Témoignages',
        icon: 'Quote',
        permission: 'testimonials.view',
        resource: 'testimonials',
        description: 'Avis clients publiés',
        keywords: ['avis', 'recommandations'],
      },
    ],
  },
  {
    label: 'Communication',
    items: [
      {
        href: '/espace-admin/messages',
        label: 'Messagerie',
        icon: 'Mail',
        permission: 'messages.view',
        resource: 'messages',
        description: 'Emails et modèles',
        keywords: ['emails', 'relances', 'templates'],
      },
      {
        href: '/espace-admin/notifications',
        label: 'Notifications',
        icon: 'Bell',
        permission: 'notifications.view',
        resource: 'notifications',
        badge: 'notifications',
        description: 'Alertes de la plateforme',
        keywords: ['alertes'],
      },
    ],
  },
  {
    label: 'Système',
    items: [
      {
        href: '/espace-admin/automatisations',
        label: 'Automatisations',
        icon: 'Workflow',
        permission: 'automations.view',
        resource: 'automations',
        description: 'Règles SI … ALORS …',
        keywords: ['règles', 'workflow', 'robot'],
      },
      {
        href: '/espace-admin/parametres',
        label: 'Paramètres',
        icon: 'Settings',
        permission: 'settings.view',
        resource: 'settings',
        description: 'Identité, SEO, finances, IA',
        keywords: ['configuration', 'réglages', 'seo'],
      },
      {
        href: '/espace-admin/utilisateurs',
        label: 'Utilisateurs',
        icon: 'UserCog',
        permission: 'users.view',
        resource: 'users',
        description: 'Comptes et accès',
        keywords: ['comptes', 'équipe'],
      },
      {
        href: '/espace-admin/roles',
        label: 'Rôles',
        icon: 'ShieldCheck',
        permission: 'roles.view',
        resource: 'roles',
        description: 'Permissions par rôle',
        keywords: ['permissions', 'rbac', 'droits'],
      },
      {
        href: '/espace-admin/journal',
        label: 'Journal d’activité',
        icon: 'ScrollText',
        permission: 'activity.view',
        resource: 'activity',
        description: 'Audit des actions',
        keywords: ['audit', 'logs', 'historique'],
      },
      {
        href: '/espace-admin/sauvegardes',
        label: 'Sauvegardes',
        icon: 'DatabaseBackup',
        permission: 'backups.view',
        resource: 'backups',
        description: 'Export et restauration',
        keywords: ['backup', 'restauration', 'export'],
      },
    ],
  },
];

/** Flat list, used by the command palette. */
export function flatNav(): NavItem[] {
  return ADMIN_NAV.flatMap((group) => group.items);
}

/** Best-matching nav item for a pathname, for breadcrumbs and the page title. */
export function findNavItem(pathname: string): NavItem | undefined {
  const items = flatNav();
  const exact = items.find((item) => item.href === pathname);
  if (exact) return exact;
  return items
    .filter((item) => item.href !== '/espace-admin' && pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
}
