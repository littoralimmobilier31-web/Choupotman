import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/misc';
import { PageHeader, Section, DetailGrid, MiniStat, DemoBadge } from '@/components/admin/page-kit';
import { CopyLinkButton, RegenerateTokenButton, DeleteBriefButton } from '@/components/admin/brief-controls';
import { requirePermission } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { getCsrfToken } from '@/lib/auth/csrf';
import {
  briefProgress, briefStatusLabel, briefTimeline, findBrief, isBriefExpired,
  latestResponses, listBriefQuestions,
} from '@/lib/db/repositories/briefs';
import { config } from '@/lib/config';
import { formatDateTime, formatRelative, formatShortDate } from '@/lib/i18n/format';

export const dynamic = 'force-dynamic';

const STATUS_TONES: Record<string, 'neutral' | 'info' | 'warning' | 'success' | 'outline'> = {
  draft: 'neutral', sent: 'info', in_progress: 'warning', completed: 'success', expired: 'outline',
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brief = findBrief(Number.parseInt(id, 10));
  return { title: brief?.title ?? 'Brief' };
}

export default async function BriefDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission('briefs.view');
  const { id: raw } = await params;
  const id = Number.parseInt(raw, 10);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const brief = findBrief(id);
  if (!brief) notFound();

  const csrf = (await getCsrfToken()) ?? '';
  const questions = listBriefQuestions(id);
  const answers = latestResponses(id);
  const progress = briefProgress(id);
  const timeline = briefTimeline(id);
  const expired = isBriefExpired(brief);
  const url = `${config.site.url}/brief/${brief.token}`;

  // Sections in the order the client sees them.
  const sections: { name: string; questions: typeof questions }[] = [];
  for (const question of questions) {
    const name = question.section || 'Questions';
    const existing = sections.find((section) => section.name === name);
    if (existing) existing.questions.push(question);
    else sections.push({ name, questions: [question] });
  }

  return (
    <>
      <PageHeader
        title={brief.title}
        backHref="/espace-admin/briefs"
        backLabel="Briefs"
        badges={
          <>
            <Badge tone={expired ? 'outline' : (STATUS_TONES[brief.status] ?? 'neutral')}>
              {expired ? 'Expiré' : briefStatusLabel(brief.status)}
            </Badge>
            <Badge tone="outline">{brief.locale.toUpperCase()}</Badge>
            <DemoBadge when={brief.is_demo} />
          </>
        }
        actions={
          <>
            <CopyLinkButton url={url} />
            <Link
              href={`/brief/${brief.token}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[0.75rem] font-medium text-fg-muted transition-colors hover:text-fg"
            >
              <ExternalLink className="size-3.5" />
              Ouvrir
            </Link>
            {can(user, 'briefs.update') && <RegenerateTokenButton csrf={csrf} briefId={id} />}
            {can(user, 'briefs.delete') && <DeleteBriefButton csrf={csrf} briefId={id} />}
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardBody className="space-y-3">
              <Progress
                value={progress.answered}
                total={Math.max(1, progress.total)}
                showLabel
                label={`${progress.answered} / ${progress.total} réponses`}
                tone={progress.percent === 100 ? 'success' : 'accent'}
              />
              {progress.requiredMissing.length > 0 && (
                <p className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2.5 text-[0.75rem] leading-relaxed text-warning">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    Réponses obligatoires manquantes : {progress.requiredMissing.join(', ')}. Le client ne
                    peut pas valider le brief tant qu’elles sont vides.
                  </span>
                </p>
              )}
            </CardBody>
          </Card>

          {sections.map((section) => (
            <Card key={section.name}>
              <CardHeader>
                <CardTitle>{section.name}</CardTitle>
              </CardHeader>
              <CardBody className="pt-3">
                <dl className="space-y-4">
                  {section.questions.map((question) => {
                    const value = answers[question.key] ?? '';
                    return (
                      <div key={question.id} className="min-w-0">
                        <dt className="flex flex-wrap items-center gap-2 text-[0.6875rem] font-semibold uppercase tracking-wider text-fg-subtle">
                          {question.label}
                          {question.is_required === 1 && value === '' && (
                            <Badge tone="warning">obligatoire</Badge>
                          )}
                        </dt>
                        <dd
                          className={
                            value === ''
                              ? 'mt-1 text-[0.8125rem] italic text-fg-subtle'
                              : 'mt-1 whitespace-pre-line break-words text-[0.8125rem] leading-relaxed text-fg'
                          }
                        >
                          {value === '' ? 'Sans réponse' : value}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </CardBody>
            </Card>
          ))}
        </div>

        <aside className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Informations</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4 pt-3">
              <div className="grid grid-cols-2 gap-4">
                <MiniStat label="Questions" value={progress.total} />
                <MiniStat
                  label="Complété"
                  value={`${progress.percent} %`}
                  tone={progress.percent === 100 ? 'success' : 'default'}
                />
              </div>

              <DetailGrid
                columns={2}
                items={[
                  {
                    label: 'Client',
                    value: brief.client_id ? (
                      <Link href={`/espace-admin/clients/${brief.client_id}`} className="text-accent hover:underline">
                        {brief.client_name}
                      </Link>
                    ) : (
                      '—'
                    ),
                  },
                  {
                    label: 'Projet',
                    value: brief.project_id ? (
                      <Link href={`/espace-admin/projets/${brief.project_id}`} className="text-accent hover:underline">
                        {brief.project_title}
                      </Link>
                    ) : (
                      '—'
                    ),
                  },
                  { label: 'Créé le', value: formatShortDate(brief.created_at, 'fr') },
                  {
                    label: 'Expiration',
                    value: brief.expires_at ? formatShortDate(brief.expires_at, 'fr') : 'Sans limite',
                  },
                  {
                    label: 'Dernière activité',
                    value: brief.last_activity_at ? formatRelative(brief.last_activity_at, 'fr') : '—',
                  },
                  {
                    label: 'Validé le',
                    value: brief.completed_at ? formatShortDate(brief.completed_at, 'fr') : '—',
                  },
                ]}
              />

              <p className="break-all rounded-lg bg-surface-sunken px-2.5 py-2 font-mono text-[0.6875rem] text-fg-muted">
                {url}
              </p>
            </CardBody>
          </Card>

          <Section title="Historique des réponses" description="Une entrée par enregistrement, du plus récent au plus ancien.">
            {timeline.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-[0.75rem] text-fg-subtle">
                Le client n’a pas encore répondu.
              </p>
            ) : (
              <ol className="space-y-2.5">
                {timeline.slice(0, 40).map((entry, index) => (
                  <li key={`${entry.at}-${index}`} className="border-s-2 border-line ps-3">
                    <p className="text-[0.75rem] font-medium text-fg">{entry.label}</p>
                    {entry.value && (
                      <p className="mt-0.5 line-clamp-2 text-[0.6875rem] text-fg-muted">{entry.value}</p>
                    )}
                    <p className="mt-0.5 text-[0.625rem] text-fg-subtle">{formatDateTime(entry.at, 'fr')}</p>
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </aside>
      </div>
    </>
  );
}
