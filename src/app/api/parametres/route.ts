import { createHandler, ok, badRequest } from '@/lib/api/handler';
import { settingsSchema } from '@/lib/validation/admin';
import { listSettings, setSettings, type SettingsGroup } from '@/lib/db/repositories/settings';
import { revalidateAllPublic } from '@/lib/revalidate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GROUPS: SettingsGroup[] = [
  'general', 'identity', 'contact', 'social', 'seo', 'finance', 'home', 'ai', 'automation', 'legal',
];

export const GET = createHandler({ permission: 'settings.view' }, async ({ request }) => {
  const url = new URL(request.url);
  const group = url.searchParams.get('groupe') as SettingsGroup | null;
  return Response.json({ ok: true, settings: listSettings(group ?? undefined) });
});

/**
 * Saves one group of settings.
 *
 * Only keys that already exist are written: the settings table is seeded with
 * the full catalogue, so an unknown key is a typo or an injection attempt, never
 * a new preference. Keys outside the named group are ignored for the same
 * reason — a form for "contact" must not be able to rewrite the finance rules.
 *
 * An empty value is stored as NULL rather than an empty string, because the
 * public site treats NULL as "not filled in" and hides the section instead of
 * rendering a blank. That is the mechanism behind the rule that nothing about
 * the owner is ever invented.
 */
export const POST = createHandler(
  { permission: 'settings.update', schema: settingsSchema },
  async ({ body, log }) => {
    const group = body.group as SettingsGroup;
    if (!GROUPS.includes(group)) return badRequest('Groupe de paramètres inconnu.');

    const known = new Set(listSettings(group).map((setting) => setting.key));
    const accepted: Record<string, string | number | boolean | null> = {};
    const rejected: string[] = [];

    for (const [key, value] of Object.entries(body.values)) {
      if (!known.has(key)) {
        rejected.push(key);
        continue;
      }
      const normalised =
        typeof value === 'string' && value.trim() === '' ? null : value;
      accepted[key] = normalised;
    }

    if (Object.keys(accepted).length === 0) {
      return badRequest('Aucun paramètre valide à enregistrer.');
    }

    setSettings(accepted, group);

    // Settings feed the header, footer, metadata and several sections at once,
    // so the cheapest correct answer is to refresh the whole public site.
    revalidateAllPublic();

    log({
      action: 'update',
      entityType: 'settings',
      entityLabel: group,
      summary: `Paramètres « ${group} » mis à jour (${Object.keys(accepted).length} champ(s))`,
      // The values themselves are not logged: some are contact details.
      metadata: { group, keys: Object.keys(accepted), rejected },
    });

    return ok({ saved: Object.keys(accepted).length, rejected });
  },
);
