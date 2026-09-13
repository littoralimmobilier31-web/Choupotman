import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowRight, Sparkles, Code2, Server, Megaphone, Camera, Bot,
  CheckCircle2, MessageSquare, Compass, Rocket, Handshake,
} from 'lucide-react';
import { buttonClass } from '@/components/ui/button';
import { SectionHeading } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';
import { ProjectCard, ServiceCard, PostCard, TestimonialCard } from '@/components/public/cards';
import { ContactForm } from '@/components/public/contact-form';
import { getDictionary } from '@/lib/i18n';
import { isLocale, path, type Locale } from '@/lib/i18n/config';
import { getSiteProfile } from '@/lib/site';
import { SERVICE_FAMILIES, listPortfolio, listPosts, listServices, listTechnologies, listTestimonials } from '@/lib/db/repositories/content';
import { cn } from '@/lib/utils';

/**
 * Home page.
 *
 * Sections render only when they have real content: a bio that was never written
 * or a statistic that was never entered is skipped rather than filled with
 * invented copy. That is deliberate — the owner controls every claim the page
 * makes, from the CMS.
 */

export const revalidate = 300;

const FAMILY_ICONS: Record<string, React.ReactNode> = {
  web: <Code2 className="size-5" />,
  it: <Server className="size-5" />,
  marketing: <Megaphone className="size-5" />,
  audiovisual: <Camera className="size-5" />,
  ai: <Bot className="size-5" />,
};

const PROCESS_STEPS = [
  { icon: <MessageSquare className="size-4" />, title: 'Échange initial', body: 'On clarifie votre besoin, vos contraintes et votre budget. Sans engagement.' },
  { icon: <Compass className="size-4" />, title: 'Cadrage et devis', body: 'Un périmètre écrit, un planning et un prix fermes. Vous savez exactement ce qui est livré.' },
  { icon: <Rocket className="size-4" />, title: 'Production', body: 'Avancement visible en continu, points réguliers, retours intégrés au fil de l’eau.' },
  { icon: <Handshake className="size-4" />, title: 'Livraison et suivi', body: 'Mise en production, prise en main et accompagnement après livraison.' },
];

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;

  const dict = getDictionary(locale);
  const profile = getSiteProfile();

  const featured = listPortfolio({ status: 'published', featuredOnly: true, locale, limit: 3 });
  const recent = listPortfolio({ status: 'published', locale, limit: 6 }).filter(
    (project) => !featured.some((f) => f.id === project.id),
  );
  const services = listServices({ publishedOnly: true, featuredOnly: true, locale });
  const allServices = listServices({ publishedOnly: true, locale });
  const technologies = listTechnologies(true);
  const testimonials = profile.show.testimonials ? listTestimonials({ publishedOnly: true, limit: 6 }) : [];
  const posts = profile.show.blog ? listPosts({ status: 'published', locale, limit: 3 }) : [];

  const familiesPresent = SERVICE_FAMILIES.filter((family) =>
    allServices.some((service) => service.family === family.key),
  );

  const statLabels: Record<string, string> = {
    projects: locale === 'ar' ? 'مشاريع منجزة' : locale === 'en' ? 'Projects delivered' : 'Projets livrés',
    clients: locale === 'ar' ? 'عملاء' : locale === 'en' ? 'Clients' : 'Clients',
    years: locale === 'ar' ? 'سنوات خبرة' : locale === 'en' ? 'Years of experience' : 'Années d’expérience',
    satisfaction: locale === 'ar' ? 'رضا العملاء' : locale === 'en' ? 'Client satisfaction' : 'Satisfaction client',
  };

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 surface-mesh" aria-hidden />
        <div className="absolute inset-0 -z-10 grid-lines opacity-50" aria-hidden />

        <div className="container-page py-20 sm:py-28 lg:py-32">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-raised/80 px-3 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-fg-muted backdrop-blur">
                <Sparkles className="size-3 text-accent" />
                {dict.home.eyebrow}
              </span>
              {profile.availability && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-[0.6875rem] font-semibold text-success">
                  <span className="size-1.5 rounded-full bg-current" aria-hidden />
                  {profile.availability}
                </span>
              )}
            </div>

            <h1 className="mt-6 text-[2.25rem] font-semibold leading-[1.08] tracking-tight sm:text-[3.25rem] lg:text-[3.75rem]">
              <span className="text-gradient">{profile.headline ?? profile.ownerName}</span>
            </h1>

            {profile.roleLabel && (
              <p className="mt-3 text-[1.0625rem] font-medium text-accent sm:text-[1.1875rem]">{profile.roleLabel}</p>
            )}

            <p className="mt-5 max-w-2xl text-[1rem] leading-relaxed text-fg-muted sm:text-[1.0625rem]">
              {profile.subheadline ?? profile.shortBio ?? dict.meta.siteDescription}
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href={path(locale, 'projects')} className={buttonClass('primary', 'lg')}>
                {dict.home.ctaProjects}
                <ArrowRight className="size-4 rtl:-scale-x-100" />
              </Link>
              <Link href={path(locale, 'request')} className={buttonClass('secondary', 'lg')}>
                {dict.home.ctaQuote}
              </Link>
              <Link href={path(locale, 'contact')} className={buttonClass('ghost', 'lg')}>
                {dict.home.ctaContact}
              </Link>
            </div>

            {profile.location && (
              <p className="mt-7 text-[0.8125rem] text-fg-subtle">
                {profile.location}
                {profile.responseTime ? ` · ${profile.responseTime}` : ''}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ── Stats ────────────────────────────────────────────────────── */}
      {profile.show.stats && (
        <section className="border-y border-line bg-surface-sunken/40">
          <div className="container-page py-10">
            <h2 className="sr-only">{dict.home.statsTitle}</h2>
            <dl
              className={cn(
                'grid gap-8 sm:gap-6',
                profile.stats.length >= 4 ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3',
              )}
            >
              {profile.stats.map((stat) => (
                <div key={stat.key} className="min-w-0">
                  <dd className="text-[1.875rem] font-semibold leading-none tracking-tight text-fg sm:text-[2.25rem]">
                    {stat.value}
                  </dd>
                  <dt className="mt-2 text-[0.75rem] text-fg-muted">{statLabels[stat.key] ?? stat.key}</dt>
                </div>
              ))}
            </dl>
          </div>
        </section>
      )}

      {/* ── Expertise families ──────────────────────────────────────── */}
      {familiesPresent.length > 0 && (
        <section className="container-page py-20 sm:py-24">
          <SectionHeading
            eyebrow={dict.home.skillsTitle}
            title={dict.home.servicesTitle}
            description={dict.home.servicesSubtitle}
            action={
              <Link href={path(locale, 'services')} className={buttonClass('secondary', 'sm')}>
                {dict.home.servicesCta}
                <ArrowRight className="size-3.5 rtl:-scale-x-100" />
              </Link>
            }
          />

          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {familiesPresent.map((family) => {
              const count = allServices.filter((s) => s.family === family.key).length;
              return (
                <li key={family.key}>
                  <Link
                    href={`${path(locale, 'services')}#famille-${family.key}`}
                    className="group flex h-full flex-col rounded-[var(--radius-card)] border border-line bg-surface-raised p-5 shadow-soft transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-1 hover:border-line-strong hover:shadow-raised"
                  >
                    <span className="flex size-10 items-center justify-center rounded-lg bg-accent-soft text-accent">
                      {FAMILY_ICONS[family.key] ?? <Sparkles className="size-5" />}
                    </span>
                    <h3 className="mt-4 text-[0.9375rem] font-semibold text-fg">{family.label}</h3>
                    <p className="mt-2 flex-1 text-[0.8125rem] leading-relaxed text-fg-muted">{family.description}</p>
                    <span className="mt-4 inline-flex items-center gap-1 text-[0.75rem] font-semibold text-accent">
                      {count} {count > 1 ? 'prestations' : 'prestation'}
                      <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100" />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ── Selected projects ───────────────────────────────────────── */}
      {(featured.length > 0 || recent.length > 0) && (
        <section className="border-t border-line bg-surface-sunken/30 py-20 sm:py-24">
          <div className="container-page">
            <SectionHeading
              eyebrow={dict.home.selectedTitle}
              title={featured.length > 0 ? dict.home.selectedTitle : dict.home.recentTitle}
              description={featured.length > 0 ? dict.home.selectedSubtitle : dict.home.recentSubtitle}
              action={
                <Link href={path(locale, 'projects')} className={buttonClass('secondary', 'sm')}>
                  {dict.home.allProjects}
                  <ArrowRight className="size-3.5 rtl:-scale-x-100" />
                </Link>
              }
            />

            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[...featured, ...recent].slice(0, 6).map((project, index) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  locale={locale}
                  dict={dict}
                  featured={index === 0 && featured.length > 0}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Featured services ──────────────────────────────────────── */}
      {services.length > 0 && (
        <section className="container-page py-20 sm:py-24">
          <SectionHeading eyebrow="Services" title={dict.home.servicesTitle} description={dict.home.servicesSubtitle} />
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {services.slice(0, 6).map((service) => (
              <ServiceCard key={service.id} service={service} locale={locale} dict={dict} />
            ))}
          </div>
        </section>
      )}

      {/* ── Process ────────────────────────────────────────────────── */}
      {profile.show.process && (
        <section className="border-y border-line bg-surface-sunken/30 py-20 sm:py-24">
          <div className="container-page">
            <SectionHeading eyebrow="Méthode" title={dict.home.processTitle} description={dict.home.processSubtitle} />
            <ol className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {PROCESS_STEPS.map((step, index) => (
                <li
                  key={step.title}
                  className="relative flex flex-col rounded-[var(--radius-card)] border border-line bg-surface-raised p-5 shadow-soft"
                >
                  <div className="flex items-center justify-between">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
                      {step.icon}
                    </span>
                    <span className="text-[1.5rem] font-semibold leading-none text-line-strong">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                  </div>
                  <h3 className="mt-4 text-[0.9375rem] font-semibold text-fg">{step.title}</h3>
                  <p className="mt-2 text-[0.8125rem] leading-relaxed text-fg-muted">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {/* ── Technologies ───────────────────────────────────────────── */}
      {profile.show.technologies && technologies.length > 0 && (
        <section className="container-page py-20 sm:py-24">
          <SectionHeading eyebrow="Stack" title={dict.home.techTitle} description={dict.home.techSubtitle} />
          <ul className="mt-10 flex flex-wrap gap-2.5">
            {technologies.map((tech) => (
              <li
                key={tech.id}
                className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface-raised px-3.5 py-2 text-[0.8125rem] font-medium text-fg-muted transition-[border-color,color] hover:border-accent hover:text-fg"
              >
                <span className="size-1.5 rounded-full bg-accent" aria-hidden />
                {tech.name}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Testimonials ───────────────────────────────────────────── */}
      {testimonials.length > 0 && (
        <section className="border-y border-line bg-surface-sunken/30 py-20 sm:py-24">
          <div className="container-page">
            <SectionHeading
              eyebrow="Retours"
              title={dict.home.testimonialsTitle}
              description={dict.home.testimonialsSubtitle}
            />
            <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {testimonials.map((testimonial) => (
                <li key={testimonial.id}>
                  <TestimonialCard
                    quote={testimonial.quote}
                    author={testimonial.author_name}
                    role={testimonial.author_role}
                    company={testimonial.company}
                    rating={testimonial.rating}
                    isDemo={testimonial.is_demo === 1}
                    demoLabel={dict.projects.demoBadge}
                  />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* ── Blog ───────────────────────────────────────────────────── */}
      {posts.length > 0 && (
        <section className="container-page py-20 sm:py-24">
          <SectionHeading
            eyebrow="Blog"
            title={dict.blog.title}
            description={dict.blog.subtitle}
            action={
              <Link href={path(locale, 'blog')} className={buttonClass('secondary', 'sm')}>
                {dict.blog.allPosts}
                <ArrowRight className="size-3.5 rtl:-scale-x-100" />
              </Link>
            }
          />
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} locale={locale} dict={dict} />
            ))}
          </div>
        </section>
      )}

      {/* ── Contact ────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-t border-line py-20 sm:py-24">
        <div className="absolute inset-0 -z-10 surface-mesh opacity-70" aria-hidden />
        <div className="container-page">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-16">
            <div>
              <Badge tone="brand" className="mb-4">
                {dict.home.ctaWork}
              </Badge>
              <h2 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{dict.home.contactTitle}</h2>
              <p className="mt-4 text-[0.9375rem] leading-relaxed text-fg-muted">{dict.home.contactSubtitle}</p>

              <ul className="mt-8 space-y-3">
                {[
                  'Réponse avec une première analyse, pas un message automatique.',
                  'Un devis clair : périmètre, prix, délai.',
                  'Aucun engagement avant validation écrite.',
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2.5 text-[0.875rem] text-fg-muted">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                    {line}
                  </li>
                ))}
              </ul>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link href={path(locale, 'request')} className={buttonClass('primary', 'md')}>
                  {dict.nav.requestQuote}
                </Link>
                {profile.bookingUrl && (
                  <a
                    href={profile.bookingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonClass('secondary', 'md')}
                  >
                    Prendre rendez-vous
                  </a>
                )}
              </div>
            </div>

            <div className="rounded-[var(--radius-card)] border border-line bg-surface-raised p-6 shadow-raised sm:p-8">
              <ContactForm locale={locale} dict={dict} services={allServices.map((s) => ({ slug: s.slug, name: s.name }))} compact />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
