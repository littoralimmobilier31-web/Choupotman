import Link from 'next/link';
import { ExternalLink, Info } from 'lucide-react';
import { PageHeader, SummaryStrip } from '@/components/admin/page-kit';
import { ProfileManager } from '@/components/admin/profile-manager';
import { PROFILE_KINDS } from '@/lib/profile-kinds';
import { requirePermission } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { getCsrfToken } from '@/lib/auth/csrf';
import { listProfileEntries } from '@/lib/db/repositories/content';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Profil / À propos' };

export default async function ProfilePage() {
  const user = await requirePermission('profile.view');
  const csrf = (await getCsrfToken()) ?? '';

  // `false` includes unpublished rows: this screen manages drafts too.
  const entries = listProfileEntries(undefined, false);
  const published = entries.filter((entry) => entry.is_published === 1);

  return (
    <>
      <PageHeader
        title="Profil / À propos"
        description="Votre parcours, vos compétences et vos certifications, tels qu’ils apparaissent sur la page publique « À propos »."
        actions={
          <Link
            href="/a-propos"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[0.75rem] font-medium text-fg-muted transition-colors hover:text-fg"
          >
            <ExternalLink className="size-3.5" />
            Voir la page publique
          </Link>
        }
      />

      <p className="mb-5 flex items-start gap-2 rounded-lg bg-surface-sunken px-3 py-2.5 text-[0.8125rem] leading-relaxed text-fg-muted">
        <Info className="mt-0.5 size-4 shrink-0" />
        <span>
          La page « À propos » n’affiche que ce que vous saisissez ici. Rien n’est déduit, complété ni
          suggéré automatiquement — aucun diplôme, aucune certification, aucune expérience n’apparaît
          si vous ne l’avez pas écrit vous-même. Une section sans élément publié ne s’affiche pas du tout.
        </span>
      </p>

      <SummaryStrip
        items={[
          { label: 'Éléments publiés', value: published.length },
          { label: 'Masqués', value: entries.length - published.length },
          ...PROFILE_KINDS.slice(0, 3).map((kind) => ({
            label: kind.label,
            value: entries.filter((entry) => entry.kind === kind.key).length,
          })),
        ]}
      />

      <ProfileManager
        csrf={csrf}
        canEdit={can(user, 'profile.update')}
        canDelete={can(user, 'profile.delete')}
        entries={entries.map((entry) => ({
          id: entry.id,
          kind: entry.kind,
          title: entry.title,
          organisation: entry.organisation,
          location: entry.location,
          start_date: entry.start_date,
          end_date: entry.end_date,
          is_current: entry.is_current,
          description: entry.description,
          level: entry.level,
          url: entry.url,
          position: entry.position,
          is_published: entry.is_published,
        }))}
      />
    </>
  );
}
