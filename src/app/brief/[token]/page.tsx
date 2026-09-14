import type { Metadata } from 'next';
import Link from 'next/link';
import { Clock, ShieldCheck } from 'lucide-react';
import { BriefWizard, type BriefQuestion } from '@/components/brief/brief-wizard';
import { ThemeToggle } from '@/components/theme';
import {
  briefProgress, findBriefByToken, isBriefExpired, latestResponses, listBriefQuestions,
} from '@/lib/db/repositories/briefs';
import { getSiteProfile } from '@/lib/site';
import { dirFor, isLocale } from '@/lib/i18n/config';

/**
 * Public interactive brief.
 *
 * Reached by an unguessable token, with no login. Never indexed: the page is
 * addressed to one client and its content is theirs.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Brief de projet',
  robots: { index: false, follow: false, nocache: true },
};

export default async function BriefPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const brief = findBriefByToken(token);
  const ownerName = getSiteProfile().ownerName;

  if (!brief) {
    return (
      <Shell ownerName={ownerName}>
        <Notice
          title="Lien introuvable"
          message="Ce lien de brief n’existe pas ou a été remplacé. Demandez-nous un nouveau lien et nous vous l’enverrons aussitôt."
        />
      </Shell>
    );
  }

  if (isBriefExpired(brief)) {
    return (
      <Shell ownerName={ownerName}>
        <Notice
          title="Ce lien a expiré"
          message="Pour des raisons de confidentialité, les liens de brief ont une durée de validité limitée. Contactez-nous : nous vous en générons un nouveau en quelques secondes."
        />
      </Shell>
    );
  }

  const questions: BriefQuestion[] = listBriefQuestions(brief.id).map((question) => ({
    key: question.key,
    label: question.label,
    helpText: question.help_text,
    inputType: question.input_type,
    options: question.optionList,
    required: question.is_required === 1,
    section: question.section,
  }));

  const progress = briefProgress(brief.id);

  return (
    <Shell ownerName={ownerName} locale={brief.locale}>
      <BriefWizard
        token={token}
        title={brief.title}
        introText={brief.intro_text}
        questions={questions}
        initialAnswers={latestResponses(brief.id)}
        initialStatus={brief.status}
      />

      <p className="mx-auto mt-8 flex max-w-2xl items-start gap-2 text-[0.75rem] leading-relaxed text-fg-subtle">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        <span>
          Ce lien vous est personnel. Vos réponses sont enregistrées à chaque étape et ne sont visibles que par{' '}
          {ownerName}. {progress.total > 0 && `${progress.answered} réponse(s) sur ${progress.total} déjà enregistrée(s).`}
          {brief.expires_at && (
            <span className="mt-1 flex items-center gap-1.5">
              <Clock className="size-3.5" />
              Lien valable jusqu’au {new Date(brief.expires_at).toLocaleDateString('fr-FR')}
            </span>
          )}
        </span>
      </p>
    </Shell>
  );
}

function Shell({
  ownerName,
  locale = 'fr',
  children,
}: {
  ownerName: string;
  /** The brief's own language, so an Arabic brief renders right-to-left. */
  locale?: string;
  children: React.ReactNode;
}) {
  const resolved = isLocale(locale) ? locale : 'fr';
  return (
    <div className="min-h-dvh bg-surface" lang={resolved} dir={dirFor(resolved)}>
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" className="text-[0.9375rem] font-semibold tracking-tight text-fg">
            {ownerName}
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">{children}</main>
    </div>
  );
}

function Notice({ title, message }: { title: string; message: string }) {
  return (
    <div className="mx-auto max-w-xl rounded-[var(--radius-card)] border border-line bg-surface-raised p-8 text-center">
      <h1 className="text-[1.25rem] font-semibold text-fg">{title}</h1>
      <p className="mt-2.5 text-[0.875rem] leading-relaxed text-fg-muted">{message}</p>
      <Link
        href="/contact"
        className="mt-5 inline-flex items-center rounded-lg bg-accent px-4 py-2 text-[0.8125rem] font-semibold text-accent-fg transition-opacity hover:opacity-90"
      >
        Nous contacter
      </Link>
    </div>
  );
}
