import Link from 'next/link';
import { Mail, Phone, MapPin, ArrowUp } from 'lucide-react';
import { path, type Locale } from '@/lib/i18n/config';
import type { Dictionary } from '@/lib/i18n/types';
import type { SiteProfile } from '@/lib/site';

/**
 * Public footer. Contact details, navigation and legal links all come from
 * settings, so a blank value simply omits the row instead of rendering an empty
 * label.
 */
export function SiteFooter({
  locale,
  dict,
  profile,
  serviceLinks,
}: {
  locale: Locale;
  dict: Dictionary;
  profile: SiteProfile;
  serviceLinks: { label: string; href: string }[];
}) {
  const year = new Date().getFullYear();

  const navLinks = [
    { href: path(locale, 'about'), label: dict.nav.about },
    { href: path(locale, 'services'), label: dict.nav.services },
    { href: path(locale, 'projects'), label: dict.nav.projects },
    { href: path(locale, 'caseStudies'), label: dict.nav.caseStudies },
    { href: path(locale, 'blog'), label: dict.nav.blog },
    { href: path(locale, 'contact'), label: dict.nav.contact },
  ];

  return (
    <footer className="mt-24 border-t border-line bg-surface-sunken/40">
      <div className="container-page py-14">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-[0.8125rem] font-bold text-accent-fg">
                BC
              </span>
              <span className="flex flex-col leading-tight">
                <span className="text-[0.875rem] font-semibold text-fg">{profile.ownerName}</span>
                <span className="text-[0.6875rem] text-fg-subtle">CHOUPOTMAN OS</span>
              </span>
            </div>
            <p className="mt-4 max-w-xs text-[0.8125rem] leading-relaxed text-fg-muted">
              {profile.shortBio ?? dict.footer.tagline}
            </p>
            {profile.social.length > 0 && (
              <div className="mt-5">
                <p className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-wider text-fg-subtle">
                  {dict.contact.followMe}
                </p>
                <ul className="flex flex-wrap gap-2">
                  {profile.social.map((link) => (
                    <li key={link.key}>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer me"
                        className="inline-flex items-center rounded-md border border-line bg-surface-raised px-2.5 py-1 text-[0.6875rem] font-medium text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <nav aria-label={dict.footer.navigation}>
            <h2 className="mb-3.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-fg-subtle">
              {dict.footer.navigation}
            </h2>
            <ul className="space-y-2.5">
              {navLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-[0.8125rem] text-fg-muted transition-colors hover:text-fg">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {serviceLinks.length > 0 && (
            <nav aria-label={dict.footer.services}>
              <h2 className="mb-3.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-fg-subtle">
                {dict.footer.services}
              </h2>
              <ul className="space-y-2.5">
                {serviceLinks.slice(0, 6).map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-[0.8125rem] text-fg-muted transition-colors hover:text-fg">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          <div>
            <h2 className="mb-3.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-fg-subtle">
              {dict.contact.directContact}
            </h2>
            <ul className="space-y-3">
              {profile.email && (
                <li>
                  <a
                    href={`mailto:${profile.email}`}
                    className="inline-flex items-start gap-2 text-[0.8125rem] text-fg-muted transition-colors hover:text-fg"
                  >
                    <Mail className="mt-0.5 size-3.5 shrink-0" />
                    <span className="break-all">{profile.email}</span>
                  </a>
                </li>
              )}
              {profile.phone && (
                <li>
                  <a
                    href={`tel:${profile.phone.replace(/\s/g, '')}`}
                    className="inline-flex items-start gap-2 text-[0.8125rem] text-fg-muted transition-colors hover:text-fg"
                  >
                    <Phone className="mt-0.5 size-3.5 shrink-0" />
                    {profile.phone}
                  </a>
                </li>
              )}
              {(profile.address || profile.location) && (
                <li className="inline-flex items-start gap-2 text-[0.8125rem] text-fg-muted">
                  <MapPin className="mt-0.5 size-3.5 shrink-0" />
                  {profile.address ?? profile.location}
                </li>
              )}
            </ul>
            {profile.hours && <p className="mt-3 text-[0.75rem] text-fg-subtle">{profile.hours}</p>}
          </div>
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
          <p className="text-[0.75rem] text-fg-subtle">
            © {year} {profile.legal.companyName ?? profile.ownerName}. {dict.footer.rights}
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link href={path(locale, 'privacy')} className="text-[0.75rem] text-fg-subtle transition-colors hover:text-fg">
              {dict.footer.privacy}
            </Link>
            <Link href={path(locale, 'terms')} className="text-[0.75rem] text-fg-subtle transition-colors hover:text-fg">
              {dict.footer.terms}
            </Link>
            <a href="#top" className="inline-flex items-center gap-1 text-[0.75rem] text-fg-subtle transition-colors hover:text-fg">
              <ArrowUp className="size-3" />
              {dict.footer.backToTop}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
