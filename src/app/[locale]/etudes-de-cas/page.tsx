import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BookOpen } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/misc';
import { CaseStudyCard } from '@/components/public/cards';
import { getDictionary } from '@/lib/i18n';
import { isLocale, locales, path, type Locale } from '@/lib/i18n/config';
import { absoluteUrl, localeAlternates } from '@/lib/site';
import { listCaseStudies } from '@/lib/db/repositories/content';

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  if (!isLocale(raw)) return {};
  const dict = getDictionary(raw);
  return {
    title: dict.caseStudy.title,
    description: dict.caseStudy.subtitle,
    alternates: {
      canonical: absoluteUrl(path(raw, 'caseStudies')),
      languages: localeAlternates('/etudes-de-cas', locales),
    },
  };
}

export default async function CaseStudiesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;

  const dict = getDictionary(locale);
  const studies = listCaseStudies({ status: 'published', locale, limit: 60 });

  return (
    <>
      <section className="relative overflow-hidden border-b border-line">
        <div className="absolute inset-0 -z-10 surface-mesh opacity-60" aria-hidden />
        <div className="container-page py-16 sm:py-20">
          <Badge tone="brand" className="mb-4">
            {dict.caseStudy.title}
          </Badge>
          <h1 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">{dict.caseStudy.title}</h1>
          <p className="mt-4 max-w-2xl text-[0.9375rem] leading-relaxed text-fg-muted">{dict.caseStudy.subtitle}</p>
        </div>
      </section>

      <div className="container-page py-14">
        {studies.length === 0 ? (
          <EmptyState icon={<BookOpen className="size-5" />} title={dict.caseStudy.empty} />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {studies.map((study) => (
              <CaseStudyCard key={study.id} study={study} locale={locale} dict={dict} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
