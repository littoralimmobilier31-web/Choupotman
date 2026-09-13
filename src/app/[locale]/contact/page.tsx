import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Calendar, Clock, Mail, MapPin, MessageCircle, Phone, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { ContactForm } from '@/components/public/contact-form';
import { getDictionary } from '@/lib/i18n';
import { isLocale, locales, path, type Locale } from '@/lib/i18n/config';
import { absoluteUrl, getSiteProfile, localeAlternates } from '@/lib/site';
import { listServices } from '@/lib/db/repositories/content';

export const revalidate = 600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  if (!isLocale(raw)) return {};
  const dict = getDictionary(raw);
  return {
    title: dict.contact.title,
    description: dict.contact.subtitle,
    alternates: {
      canonical: absoluteUrl(path(raw, 'contact')),
      languages: localeAlternates('/contact', locales),
    },
  };
}

export default async function ContactPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ service?: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;

  const dict = getDictionary(locale);
  const profile = getSiteProfile();
  const query = await searchParams;
  const services = listServices({ publishedOnly: true, locale });
  const defaultService = query.service
    ? services.find((s) => s.slug === query.service)?.name
    : undefined;

  const channels = [
    profile.email && {
      icon: <Mail className="size-4" />,
      label: dict.contact.email,
      value: profile.email,
      href: `mailto:${profile.email}`,
    },
    profile.phone && {
      icon: <Phone className="size-4" />,
      label: dict.contact.phone,
      value: profile.phone,
      href: `tel:${profile.phone.replace(/\s/g, '')}`,
    },
    profile.whatsapp && {
      icon: <MessageCircle className="size-4" />,
      label: 'WhatsApp',
      value: profile.whatsapp,
      href: `https://wa.me/${profile.whatsapp.replace(/[^0-9]/g, '')}`,
    },
    (profile.address || profile.location) && {
      icon: <MapPin className="size-4" />,
      label: 'Adresse',
      value: profile.address ?? profile.location ?? '',
      href: undefined,
    },
    profile.hours && {
      icon: <Clock className="size-4" />,
      label: 'Horaires',
      value: profile.hours,
      href: undefined,
    },
  ].filter(Boolean) as { icon: React.ReactNode; label: string; value: string; href?: string }[];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ContactPage',
    name: dict.contact.title,
    url: absoluteUrl(path(locale, 'contact')),
    mainEntity: {
      '@type': 'Person',
      name: profile.ownerName,
      email: profile.email ?? undefined,
      telephone: profile.phone ?? undefined,
      address: profile.address ?? profile.location ?? undefined,
      jobTitle: profile.roleLabel ?? undefined,
      sameAs: profile.social.map((link) => link.url),
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section className="relative overflow-hidden border-b border-line">
        <div className="absolute inset-0 -z-10 surface-mesh opacity-60" aria-hidden />
        <div className="container-page py-16 sm:py-20">
          <Badge tone="brand" className="mb-4">
            {dict.contact.title}
          </Badge>
          <h1 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">{dict.contact.title}</h1>
          <p className="mt-4 max-w-2xl text-[0.9375rem] leading-relaxed text-fg-muted">{dict.contact.subtitle}</p>
        </div>
      </section>

      <div className="container-page py-14">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-16">
          <div className="rounded-[var(--radius-card)] border border-line bg-surface-raised p-6 shadow-soft sm:p-8">
            <ContactForm
              locale={locale}
              dict={dict}
              services={services.map((s) => ({ slug: s.slug, name: s.name }))}
              defaultService={defaultService}
            />
          </div>

          <aside className="space-y-6">
            {channels.length > 0 && (
              <div className="rounded-[var(--radius-card)] border border-line bg-surface-raised p-5 shadow-soft">
                <h2 className="text-[0.6875rem] font-semibold uppercase tracking-wider text-fg-subtle">
                  {dict.contact.directContact}
                </h2>
                <ul className="mt-4 space-y-4">
                  {channels.map((channel) => (
                    <li key={channel.label} className="flex items-start gap-3">
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                        {channel.icon}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[0.6875rem] text-fg-subtle">{channel.label}</p>
                        {channel.href ? (
                          <a
                            href={channel.href}
                            target={channel.href.startsWith('http') ? '_blank' : undefined}
                            rel={channel.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                            className="break-words text-[0.875rem] font-medium text-fg transition-colors hover:text-accent"
                          >
                            {channel.value}
                          </a>
                        ) : (
                          <p className="break-words text-[0.875rem] font-medium text-fg">{channel.value}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {profile.bookingUrl && (
              <a
                href={profile.bookingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface-raised p-5 shadow-soft transition-colors hover:border-accent"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                  <Calendar className="size-4" />
                </span>
                <span>
                  <span className="block text-[0.875rem] font-semibold text-fg">Prendre rendez-vous</span>
                  <span className="block text-[0.75rem] text-fg-subtle">Choisissez un créneau de 30 minutes</span>
                </span>
              </a>
            )}

            <div className="rounded-[var(--radius-card)] border border-line bg-accent-soft p-5">
              <p className="flex items-center gap-2 text-[0.875rem] font-semibold text-accent">
                <Sparkles className="size-4" />
                {dict.request.title}
              </p>
              <p className="mt-2 text-[0.8125rem] leading-relaxed text-fg-muted">{dict.request.subtitle}</p>
              <Link href={path(locale, 'request')} className={buttonClass('primary', 'sm', 'mt-4 w-full')}>
                {dict.nav.requestQuote}
              </Link>
            </div>

            {profile.social.length > 0 && (
              <div className="rounded-[var(--radius-card)] border border-line bg-surface-raised p-5 shadow-soft">
                <h2 className="text-[0.6875rem] font-semibold uppercase tracking-wider text-fg-subtle">
                  {dict.contact.followMe}
                </h2>
                <ul className="mt-3 flex flex-wrap gap-2">
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
              </div>
            )}
          </aside>
        </div>
      </div>
    </>
  );
}
