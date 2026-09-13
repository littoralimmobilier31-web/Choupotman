/**
 * RBAC catalogue — the single source of truth for permissions and for what each
 * built-in role may do. The seed writes these into `permissions` /
 * `role_permissions`, and `hasPermission` checks against the flattened list on
 * the session user. Adding a resource here is all it takes to protect it.
 */

export const RESOURCES = [
  'dashboard', 'clients', 'leads', 'projects', 'tasks', 'quotes', 'invoices',
  'payments', 'contracts', 'revisions', 'feedback', 'files', 'moodboards',
  'briefs', 'calendar', 'messages', 'notifications', 'expenses', 'subscriptions',
  'analytics', 'portfolio', 'case_studies', 'blog', 'services', 'profile',
  'testimonials', 'settings', 'users', 'roles', 'ai', 'automations',
  'activity', 'backups',
] as const;

export type Resource = (typeof RESOURCES)[number];

export const ACTIONS = ['view', 'create', 'update', 'delete', 'export'] as const;
export type Action = (typeof ACTIONS)[number];

export type Permission = `${Resource}.${Action}`;

/** Human labels used by the role editor in the admin. */
export const RESOURCE_LABELS: Record<Resource, string> = {
  dashboard: 'Tableau de bord', clients: 'Clients', leads: 'Prospects',
  projects: 'Projets', tasks: 'Tâches', quotes: 'Devis', invoices: 'Factures',
  payments: 'Paiements', contracts: 'Contrats', revisions: 'Révisions',
  feedback: 'Feedback', files: 'Fichiers', moodboards: 'Moodboards',
  briefs: 'Briefs', calendar: 'Calendrier', messages: 'Messagerie',
  notifications: 'Notifications', expenses: 'Dépenses', subscriptions: 'Abonnements',
  analytics: 'Statistiques', portfolio: 'Portfolio', case_studies: 'Études de cas',
  blog: 'Blog', services: 'Services', profile: 'Profil / À propos',
  testimonials: 'Témoignages', settings: 'Paramètres', users: 'Utilisateurs',
  roles: 'Rôles', ai: 'Assistant IA', automations: 'Automatisations',
  activity: 'Journal d’activité', backups: 'Sauvegardes',
};

export const ACTION_LABELS: Record<Action, string> = {
  view: 'Consulter', create: 'Créer', update: 'Modifier',
  delete: 'Supprimer', export: 'Exporter',
};

/** Every valid permission string. */
export function allPermissions(): Permission[] {
  return RESOURCES.flatMap((resource) => ACTIONS.map((action) => `${resource}.${action}` as Permission));
}

export type BuiltinRole = 'super_admin' | 'manager' | 'finance' | 'editor' | 'viewer';

export const ROLE_DEFINITIONS: Record<
  BuiltinRole,
  { name: string; description: string; permissions: 'all' | Permission[] }
> = {
  super_admin: {
    name: 'Super Admin',
    description: 'Accès total à toutes les fonctions et aux paramètres système.',
    permissions: 'all',
  },
  manager: {
    name: 'Manager',
    description: 'Gestion des projets, des clients et de la production. Pas d’accès aux paramètres système.',
    permissions: [
      'dashboard.view',
      ...expand('clients', ['view', 'create', 'update', 'export']),
      ...expand('leads', ['view', 'create', 'update', 'delete', 'export']),
      ...expand('projects', ['view', 'create', 'update', 'export']),
      ...expand('tasks', ['view', 'create', 'update', 'delete']),
      ...expand('quotes', ['view', 'create', 'update', 'export']),
      'invoices.view', 'payments.view',
      ...expand('contracts', ['view', 'create', 'update']),
      ...expand('revisions', ['view', 'create', 'update']),
      ...expand('feedback', ['view', 'create', 'update']),
      ...expand('files', ['view', 'create', 'update', 'delete']),
      ...expand('moodboards', ['view', 'create', 'update', 'delete']),
      ...expand('briefs', ['view', 'create', 'update', 'delete']),
      ...expand('calendar', ['view', 'create', 'update', 'delete']),
      ...expand('messages', ['view', 'create', 'update']),
      'notifications.view', 'notifications.update',
      'analytics.view', 'analytics.export',
      'ai.view', 'ai.create',
      'activity.view',
    ],
  },
  finance: {
    name: 'Finance',
    description: 'Factures, devis, paiements, dépenses et abonnements.',
    permissions: [
      'dashboard.view',
      'clients.view', 'clients.update', 'clients.export',
      'projects.view',
      ...expand('quotes', ['view', 'create', 'update', 'delete', 'export']),
      ...expand('invoices', ['view', 'create', 'update', 'delete', 'export']),
      ...expand('payments', ['view', 'create', 'update', 'delete', 'export']),
      ...expand('contracts', ['view', 'create', 'update', 'export']),
      ...expand('expenses', ['view', 'create', 'update', 'delete', 'export']),
      ...expand('subscriptions', ['view', 'create', 'update', 'delete']),
      'analytics.view', 'analytics.export',
      'messages.view', 'messages.create',
      'notifications.view', 'notifications.update',
      'ai.view', 'ai.create',
      'activity.view',
    ],
  },
  editor: {
    name: 'Editor',
    description: 'Contenu public : portfolio, études de cas, blog, services, profil.',
    permissions: [
      'dashboard.view',
      ...expand('portfolio', ['view', 'create', 'update', 'delete']),
      ...expand('case_studies', ['view', 'create', 'update', 'delete']),
      ...expand('blog', ['view', 'create', 'update', 'delete']),
      ...expand('services', ['view', 'create', 'update', 'delete']),
      ...expand('profile', ['view', 'create', 'update', 'delete']),
      ...expand('testimonials', ['view', 'create', 'update', 'delete']),
      ...expand('files', ['view', 'create', 'update']),
      ...expand('moodboards', ['view', 'create', 'update']),
      'projects.view', 'clients.view',
      'analytics.view',
      'notifications.view', 'notifications.update',
      'ai.view', 'ai.create',
    ],
  },
  viewer: {
    name: 'Viewer',
    description: 'Lecture seule sur l’ensemble de l’espace d’administration.',
    permissions: RESOURCES.map((r) => `${r}.view` as Permission).filter(
      (p) => !p.startsWith('settings.') && !p.startsWith('users.') && !p.startsWith('roles.') && !p.startsWith('backups.'),
    ),
  },
};

function expand(resource: Resource, actions: Action[]): Permission[] {
  return actions.map((action) => `${resource}.${action}` as Permission);
}

/** Resolves a role's permission list, expanding the `'all'` shorthand. */
export function permissionsForRole(role: BuiltinRole): Permission[] {
  const def = ROLE_DEFINITIONS[role];
  return def.permissions === 'all' ? allPermissions() : def.permissions;
}

/**
 * Permission check. `super_admin` short-circuits so a newly added resource is
 * never accidentally locked away from the owner of the system.
 */
export function can(
  user: { role_slug: string; permissions: string[] } | null | undefined,
  permission: Permission | Permission[],
): boolean {
  if (!user) return false;
  if (user.role_slug === 'super_admin') return true;
  const needed = Array.isArray(permission) ? permission : [permission];
  return needed.some((p) => user.permissions.includes(p));
}

/** True when the user may do anything at all with a resource. */
export function canAccessResource(
  user: { role_slug: string; permissions: string[] } | null | undefined,
  resource: Resource,
): boolean {
  if (!user) return false;
  if (user.role_slug === 'super_admin') return true;
  return user.permissions.some((p) => p.startsWith(`${resource}.`));
}

export function parsePermission(value: string): { resource: Resource; action: Action } | null {
  const [resource, action] = value.split('.');
  if (!resource || !action) return null;
  if (!(RESOURCES as readonly string[]).includes(resource)) return null;
  if (!(ACTIONS as readonly string[]).includes(action)) return null;
  return { resource: resource as Resource, action: action as Action };
}
