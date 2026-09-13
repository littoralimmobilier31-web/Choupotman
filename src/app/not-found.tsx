import Link from 'next/link';
import { ArrowLeft, Search } from 'lucide-react';
import { buttonClass } from '@/components/ui/button';
import { getDictionary } from '@/lib/i18n';
import { defaultLocale, path } from '@/lib/i18n/config';

/**
 * Global 404. Not locale-aware (it is also reached from non-localised routes), so
 * it uses the default language and offers the main entry points back into the
 * site rather than a dead end.
 */
export default function NotFound() {
  const dict = getDictionary(defaultLocale);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 py-20 text-center">
      <div className="surface-mesh absolute inset-0 -z-10 opacity-50" aria-hidden />

      <p className="text-[5rem] font-semibold leading-none tracking-tight text-line-strong sm:text-[7rem]">404</p>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-fg">{dict.common.notFoundTitle}</h1>
      <p className="mt-3 max-w-md text-[0.9375rem] leading-relaxed text-fg-muted">{dict.common.notFoundBody}</p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href={path(defaultLocale)} className={buttonClass('primary', 'md')}>
          <ArrowLeft className="size-4 rtl:-scale-x-100" />
          {dict.nav.home}
        </Link>
        <Link href={path(defaultLocale, 'projects')} className={buttonClass('secondary', 'md')}>
          <Search className="size-4" />
          {dict.nav.projects}
        </Link>
        <Link href={path(defaultLocale, 'contact')} className={buttonClass('ghost', 'md')}>
          {dict.nav.contact}
        </Link>
      </div>
    </div>
  );
}
