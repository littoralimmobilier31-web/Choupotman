'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, Globe, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/theme';
import { buttonClass } from '@/components/ui/button';
import { Dropdown, DropdownItem, DropdownLabel } from '@/components/ui/dropdown';
import { localeMeta, locales, path, switchLocalePath, type Locale } from '@/lib/i18n/config';
import type { Dictionary } from '@/lib/i18n/types';

/**
 * Public header. Sticky, translucent once scrolled, with the mobile sheet and
 * language switcher. Nav items come from the dictionary so the labels translate
 * and the hrefs stay locale-prefixed.
 */
export function SiteHeader({
  locale,
  dict,
  ownerName,
}: {
  locale: Locale;
  dict: Dictionary;
  ownerName: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close the mobile sheet on navigation.
  React.useEffect(() => setOpen(false), [pathname]);

  // Prevent background scroll while the sheet is open.
  React.useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const links = [
    { href: path(locale, 'about'), label: dict.nav.about },
    { href: path(locale, 'services'), label: dict.nav.services },
    { href: path(locale, 'projects'), label: dict.nav.projects },
    { href: path(locale, 'caseStudies'), label: dict.nav.caseStudies },
    { href: path(locale, 'blog'), label: dict.nav.blog },
    { href: path(locale, 'contact'), label: dict.nav.contact },
  ];

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header
      className={cn(
        'sticky top-0 z-50 border-b transition-[background-color,border-color,backdrop-filter] duration-300',
        scrolled
          ? 'border-line bg-surface/85 backdrop-blur-xl'
          : 'border-transparent bg-transparent',
      )}
    >
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Link
          href={path(locale)}
          className="group flex min-w-0 shrink-0 items-center gap-2.5"
          aria-label={ownerName}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-[0.8125rem] font-bold text-accent-fg">
            BC
          </span>
          <span className="hidden min-w-0 flex-col leading-tight sm:flex">
            <span className="truncate text-[0.875rem] font-semibold text-fg">{ownerName}</span>
            <span className="truncate text-[0.6875rem] text-fg-subtle">CHOUPOTMAN OS</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-0.5 lg:flex" aria-label={dict.nav.menu}>
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'rounded-lg px-3 py-2 text-[0.8125rem] font-medium transition-colors',
                isActive(link.href)
                  ? 'bg-surface-hover text-fg'
                  : 'text-fg-muted hover:bg-surface-hover hover:text-fg',
              )}
              aria-current={isActive(link.href) ? 'page' : undefined}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <LanguageSwitcher locale={locale} label={dict.nav.language} />
          <ThemeToggle
            className="hidden sm:inline-flex"
            labels={{ light: dict.nav.themeLight, dark: dict.nav.themeDark, system: dict.nav.themeSystem }}
          />
          <Link href={path(locale, 'request')} className={buttonClass('primary', 'sm', 'hidden sm:inline-flex')}>
            {dict.nav.requestQuote}
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex size-9 items-center justify-center rounded-lg border border-line text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg lg:hidden"
            aria-expanded={open}
            aria-label={open ? dict.nav.close : dict.nav.menu}
          >
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="animate-fade-in border-t border-line bg-surface lg:hidden">
          <nav className="container-page flex flex-col py-3" aria-label={dict.nav.menu}>
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'flex items-center justify-between rounded-lg px-3 py-3 text-[0.9375rem] font-medium transition-colors',
                  isActive(link.href) ? 'bg-surface-hover text-fg' : 'text-fg-muted hover:bg-surface-hover',
                )}
              >
                {link.label}
                <ArrowUpRight className="size-4 opacity-40" />
              </Link>
            ))}
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-4">
              <ThemeToggle
                labels={{ light: dict.nav.themeLight, dark: dict.nav.themeDark, system: dict.nav.themeSystem }}
              />
              <Link href={path(locale, 'request')} className={buttonClass('primary', 'md', 'flex-1')}>
                {dict.nav.requestQuote}
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

function LanguageSwitcher({ locale, label }: { locale: Locale; label: string }) {
  const pathname = usePathname();
  return (
    <Dropdown
      trigger={({ toggle, open }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-label={label}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[0.75rem] font-semibold text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
        >
          <Globe className="size-3.5" />
          {localeMeta[locale].short}
        </button>
      )}
    >
      {(close) => (
        <>
          <DropdownLabel>{label}</DropdownLabel>
          {locales.map((code) => (
            <Link key={code} href={switchLocalePath(pathname, code)} onClick={close} lang={code}>
              <DropdownItem
                className={cn('w-full', code === locale && 'bg-accent-soft text-accent')}
                dir={localeMeta[code].dir}
              >
                <span className="w-7 shrink-0 text-[0.6875rem] font-bold opacity-60">
                  {localeMeta[code].short}
                </span>
                {localeMeta[code].label}
              </DropdownItem>
            </Link>
          ))}
        </>
      )}
    </Dropdown>
  );
}
