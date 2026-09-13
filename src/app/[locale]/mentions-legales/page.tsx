import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LegalPage } from '@/components/public/legal-page';
import { getDictionary } from '@/lib/i18n';
import { isLocale, locales, path, type Locale } from '@/lib/i18n/config';
import { absoluteUrl, getSiteProfile, localeAlternates } from '@/lib/site';
import { config } from '@/lib/config';

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  if (!isLocale(raw)) return {};
  const dict = getDictionary(raw);
  return {
    title: dict.footer.terms,
    alternates: {
      canonical: absoluteUrl(path(raw, 'terms')),
      languages: localeAlternates('/mentions-legales', locales),
    },
  };
}

export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const dict = getDictionary(locale);
  const profile = getSiteProfile();

  const identity = [
    profile.legal.companyName && `Raison sociale : ${profile.legal.companyName}`,
    `Responsable de la publication : ${profile.ownerName}`,
    profile.address && `Adresse : ${profile.address}`,
    profile.legal.taxId && `Identifiant fiscal : ${profile.legal.taxId}`,
    profile.legal.registration && `Registre de commerce : ${profile.legal.registration}`,
    profile.email && `Email : ${profile.email}`,
    profile.phone && `Téléphone : ${profile.phone}`,
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <LegalPage
      title={dict.footer.terms}
      content={profile.legal.termsText}
      fallback={[
        {
          heading: 'Éditeur du site',
          body:
            identity ||
            'Les informations d’identification de l’éditeur seront renseignées depuis l’espace d’administration.',
        },
        {
          heading: 'Hébergement',
          body: `Le site est accessible à l’adresse ${config.site.domain}. Les informations relatives à l’hébergeur sont communiquées sur demande.`,
        },
        {
          heading: 'Propriété intellectuelle',
          body: 'L’ensemble des contenus présents sur ce site — textes, images, vidéos, code et éléments graphiques — est protégé. Toute reproduction ou réutilisation sans autorisation écrite préalable est interdite. Les projets présentés restent la propriété de leurs commanditaires respectifs et sont affichés à titre de référence.',
        },
        {
          heading: 'Responsabilité',
          body: 'Les informations publiées sont fournies à titre indicatif et peuvent évoluer. Les estimations de prix et de délais indiquées sur le site ne constituent pas un engagement contractuel : seul un devis écrit et accepté engage les parties.',
        },
        {
          heading: 'Liens externes',
          body: 'Le site peut contenir des liens vers des sites tiers. Leur contenu n’engage pas la responsabilité de l’éditeur.',
        },
        {
          heading: 'Droit applicable',
          body: 'Le présent site et les prestations qui en découlent sont soumis au droit applicable au lieu d’établissement de l’éditeur. Tout litige sera porté devant la juridiction compétente à défaut de résolution amiable.',
        },
      ]}
      contactEmail={profile.email}
      ownerName={profile.ownerName}
      lastUpdatedNote="Ce texte est modifiable depuis l’espace d’administration."
    />
  );
}
