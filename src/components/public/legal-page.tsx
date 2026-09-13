import { Info } from 'lucide-react';

/**
 * Legal page shell.
 *
 * Renders the CMS text when the owner has written one, otherwise a clearly
 * labelled default that describes what this application genuinely does. The
 * notice makes plain that the default is editable and not a legal warranty.
 */
export function LegalPage({
  title,
  content,
  fallback,
  contactEmail,
  ownerName,
  lastUpdatedNote,
}: {
  title: string;
  content: string | null;
  fallback: { heading: string; body: string }[];
  contactEmail: string | null;
  ownerName: string;
  lastUpdatedNote?: string;
}) {
  return (
    <article className="container-prose py-14 sm:py-20">
      <h1 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">{title}</h1>

      {content ? (
        // Authored by the site owner in the admin CMS.
        <div className="rich-text mt-8" dangerouslySetInnerHTML={{ __html: content }} />
      ) : (
        <>
          <div className="mt-6 flex items-start gap-3 rounded-lg border border-info/30 bg-info-soft px-4 py-3">
            <Info className="mt-0.5 size-4 shrink-0 text-info" />
            <p className="text-[0.8125rem] leading-relaxed text-fg-muted">
              Texte par défaut, à adapter à votre situation et à la réglementation applicable.
              {lastUpdatedNote ? ` ${lastUpdatedNote}` : ''}
            </p>
          </div>

          <div className="mt-10 space-y-9">
            {fallback.map((section) => (
              <section key={section.heading}>
                <h2 className="text-[1.125rem] font-semibold text-fg">{section.heading}</h2>
                <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-fg-muted">{section.body}</p>
              </section>
            ))}

            <section>
              <h2 className="text-[1.125rem] font-semibold text-fg">Contact</h2>
              <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-fg-muted">
                Responsable : {ownerName}.
                {contactEmail ? (
                  <>
                    {' '}
                    Pour toute question :{' '}
                    <a href={`mailto:${contactEmail}`} className="text-accent underline">
                      {contactEmail}
                    </a>
                    .
                  </>
                ) : (
                  ' Les coordonnées de contact seront renseignées depuis l’espace d’administration.'
                )}
              </p>
            </section>
          </div>
        </>
      )}
    </article>
  );
}
