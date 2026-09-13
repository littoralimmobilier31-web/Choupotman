import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Award, Briefcase, Download, GraduationCap, Heart, Sparkles, Wrench } from 'lucide-react';
import { buttonClass } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState, Progress, SectionHeading } from '@/components/ui/misc';
import { getDictionary } from '@/lib/i18n';
import { isLocale, locales, path, type Locale } from '@/lib/i18n/config';
import { formatShortDate } from '@/lib/i18n/format';
import { absoluteUrl, getSiteProfile, localeAlternates } from '@/lib/site';
import { listTechnologies, profileByKind } from '@/lib/db/repositories/content';
import type { ProfileEntryRow } from '@/lib/db/types';

/**
 * About page.
 *
 * Every factual section — experience, education, certifications — is driven by
 * `profile_entries`, which the seed leaves EMPTY on purpose. An unfilled section
 * shows an explicit "to be completed" state rather than placeholder biography,
 * so the page never asserts anything the owner did not write.
 */

export const revalidate = 600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  if (!isLocale(raw)) return {};
  const dict = getDictionary(raw);
  const profile = getSiteProfile();
  return {
    title: dict.about.title,
    description: profile.shortBio ?? dict.about.subtitle,
    alternates: {
      canonical: absoluteUrl(path(raw, 'about')),
      languages: localeAlternates('/a-propos', locales),
    },
  };
}

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;

  const dict = getDictionary(locale);
  const profile = getSiteProfile();
  const entries = profileByKind();
  const technologies = listTechnologies();

  const hasTimeline = entries.experience.length > 0 || entries.education.length > 0;
  const timeline = [...entries.experience, ...entries.education].sort((a, b) =>
    (b.start_date ?? '').localeCompare(a.start_date ?? ''),
  );

  return (
    <>
      <section className="relative overflow-hidden border-b border-line">
        <div className="absolute inset-0 -z-10 surface-mesh opacity-70" aria-hidden />
        <div className="container-page py-16 sm:py-20">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start lg:gap-16">
            <div>
              <Badge tone="brand" className="mb-4">
                {dict.about.title}
              </Badge>
              <h1 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
                {profile.ownerName}
              </h1>
              {profile.roleLabel && <p className="mt-2 text-[1.0625rem] font-medium text-accent">{profile.roleLabel}</p>}
              <p className="mt-5 max-w-2xl text-[0.9375rem] leading-relaxed text-fg-muted">
                {profile.shortBio ?? dict.about.subtitle}
              </p>

              {profile.longBio ? (
                <div
                  className="rich-text mt-6 max-w-2xl"
                  // Content is authored by the site owner in the admin CMS, not by
                  // visitors — the only writer is an authenticated Super Admin.
                  dangerouslySetInnerHTML={{ __html: profile.longBio }}
                />
              ) : null}

              <div className="mt-8 flex flex-wrap gap-3">
                <Link href={path(locale, 'contact')} className={buttonClass('primary', 'md')}>
                  {dict.home.ctaContact}
                </Link>
                <Link href={path(locale, 'projects')} className={buttonClass('secondary', 'md')}>
                  {dict.home.ctaProjects}
                </Link>
                {profile.cvUrl && (
                  <a href={profile.cvUrl} target="_blank" rel="noopener noreferrer" className={buttonClass('ghost', 'md')}>
                    <Download className="size-4" />
                    CV
                  </a>
                )}
              </div>
            </div>

            <aside className="rounded-[var(--radius-card)] border border-line bg-surface-raised p-5 shadow-soft">
              <dl className="divide-y divide-line text-[0.8125rem]">
                {[
                  { label: dict.contact.name, value: profile.ownerName },
                  { label: 'Localisation', value: profile.location },
                  { label: dict.contact.email, value: profile.email },
                  { label: dict.contact.phone, value: profile.phone },
                  { label: 'Disponibilité', value: profile.availability },
                  { label: 'Délai de réponse', value: profile.responseTime },
                ]
                  .filter((row) => row.value)
                  .map((row) => (
                    <div key={row.label} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
                      <dt className="text-fg-subtle">{row.label}</dt>
                      <dd className="font-medium text-fg">{row.value}</dd>
                    </div>
                  ))}
              </dl>

              {profile.social.length > 0 && (
                <ul className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                  {profile.social.map((link) => (
                    <li key={link.key}>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer me"
                        className="inline-flex rounded-md border border-line px-2.5 py-1 text-[0.6875rem] font-medium text-fg-muted transition-colors hover:border-accent hover:text-accent"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </aside>
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section className="container-page py-16 sm:py-20">
        <SectionHeading eyebrow={dict.about.journey} title={dict.about.timeline} />
        <div className="mt-10">
          {hasTimeline ? (
            <ol className="relative space-y-8 border-s border-line ps-6">
              {timeline.map((entry) => (
                <TimelineEntry key={`${entry.kind}-${entry.id}`} entry={entry} locale={locale} present={dict.about.present} />
              ))}
            </ol>
          ) : (
            <EmptyState
              icon={<Briefcase className="size-5" />}
              title={dict.about.emptySection}
              description="Les expériences professionnelles et la formation seront renseignées depuis l’espace d’administration."
            />
          )}
        </div>
      </section>

      {/* Skills & expertise */}
      <section className="border-y border-line bg-surface-sunken/30 py-16 sm:py-20">
        <div className="container-page grid gap-12 lg:grid-cols-2">
          <div>
            <SectionHeading eyebrow="Compétences" title={dict.about.skills} />
            <div className="mt-8">
              {entries.skill.length > 0 ? (
                <ul className="space-y-4">
                  {entries.skill.map((skill) => (
                    <li key={skill.id}>
                      {skill.level !== null ? (
                        <Progress value={skill.level} total={100} label={skill.title} showLabel />
                      ) : (
                        <div className="flex items-center gap-2 text-[0.875rem] text-fg">
                          <Sparkles className="size-3.5 text-accent" />
                          {skill.title}
                        </div>
                      )}
                      {skill.description && (
                        <p className="mt-1 text-[0.75rem] text-fg-subtle">{skill.description}</p>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon={<Sparkles className="size-5" />} title={dict.about.emptySection} />
              )}
            </div>
          </div>

          <div>
            <SectionHeading eyebrow="Expertise" title={dict.about.expertise} />
            <div className="mt-8">
              {entries.expertise.length > 0 ? (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {entries.expertise.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-lg border border-line bg-surface-raised p-4 text-[0.8125rem] shadow-soft"
                    >
                      <p className="font-semibold text-fg">{item.title}</p>
                      {item.description && <p className="mt-1.5 leading-relaxed text-fg-muted">{item.description}</p>}
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon={<Wrench className="size-5" />} title={dict.about.emptySection} />
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Tools & technologies */}
      <section className="container-page py-16 sm:py-20">
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <SectionHeading eyebrow="Outils" title={dict.about.tools} />
            <div className="mt-8">
              {entries.tool.length > 0 ? (
                <ul className="flex flex-wrap gap-2">
                  {entries.tool.map((tool) => (
                    <li key={tool.id}>
                      <Badge tone="outline" className="px-3 py-1.5 text-[0.75rem]">
                        {tool.title}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon={<Wrench className="size-5" />} title={dict.about.emptySection} />
              )}
            </div>
          </div>

          <div>
            <SectionHeading eyebrow="Stack" title={dict.about.technologies} />
            <ul className="mt-8 flex flex-wrap gap-2">
              {technologies.map((tech) => (
                <li key={tech.id}>
                  <Badge tone={tech.is_featured === 1 ? 'brand' : 'outline'} className="px-3 py-1.5 text-[0.75rem]">
                    {tech.name}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Certifications & interests */}
      <section className="border-t border-line bg-surface-sunken/30 py-16 sm:py-20">
        <div className="container-page grid gap-12 lg:grid-cols-2">
          <div>
            <SectionHeading eyebrow="Formation" title={dict.about.certifications} />
            <div className="mt-8">
              {entries.certification.length > 0 ? (
                <ul className="space-y-3">
                  {entries.certification.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-start gap-3 rounded-lg border border-line bg-surface-raised p-4 shadow-soft"
                    >
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                        <Award className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[0.875rem] font-semibold text-fg">{item.title}</p>
                        {item.organisation && <p className="text-[0.75rem] text-fg-subtle">{item.organisation}</p>}
                        {item.end_date && (
                          <p className="mt-1 text-[0.6875rem] text-fg-subtle">
                            {formatShortDate(item.end_date, locale)}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  icon={<GraduationCap className="size-5" />}
                  title={dict.about.emptySection}
                  description="Aucune certification n’est publiée pour le moment."
                />
              )}
            </div>
          </div>

          <div>
            <SectionHeading eyebrow="Intérêts" title={dict.about.interests} />
            <div className="mt-8">
              {entries.interest.length > 0 ? (
                <ul className="flex flex-wrap gap-2">
                  {entries.interest.map((item) => (
                    <li key={item.id}>
                      <Badge tone="neutral" className="px-3 py-1.5 text-[0.75rem]">
                        {item.title}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon={<Heart className="size-5" />} title={dict.about.emptySection} />
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function TimelineEntry({
  entry,
  locale,
  present,
}: {
  entry: ProfileEntryRow;
  locale: Locale;
  present: string;
}) {
  const period = [
    entry.start_date ? formatShortDate(entry.start_date, locale) : null,
    entry.is_current === 1 ? present : entry.end_date ? formatShortDate(entry.end_date, locale) : null,
  ]
    .filter(Boolean)
    .join(' → ');

  return (
    <li className="relative">
      <span
        className="absolute -start-[1.6875rem] top-1.5 size-3 rounded-full border-2 border-surface bg-accent"
        aria-hidden
      />
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-[0.9375rem] font-semibold text-fg">{entry.title}</h3>
        {entry.is_current === 1 && <Badge tone="success">{present}</Badge>}
      </div>
      <p className="mt-0.5 text-[0.8125rem] text-accent">
        {[entry.organisation, entry.location].filter(Boolean).join(' · ')}
      </p>
      {period && <p className="mt-1 text-[0.75rem] text-fg-subtle">{period}</p>}
      {entry.description && (
        <p className="mt-2.5 max-w-2xl text-[0.8125rem] leading-relaxed text-fg-muted">{entry.description}</p>
      )}
    </li>
  );
}
