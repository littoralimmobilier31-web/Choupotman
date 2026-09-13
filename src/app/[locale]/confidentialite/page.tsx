import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LegalPage } from '@/components/public/legal-page';
import { getDictionary } from '@/lib/i18n';
import { isLocale, locales, path, type Locale } from '@/lib/i18n/config';
import { absoluteUrl, getSiteProfile, localeAlternates } from '@/lib/site';

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
    title: dict.footer.privacy,
    alternates: {
      canonical: absoluteUrl(path(raw, 'privacy')),
      languages: localeAlternates('/confidentialite', locales),
    },
  };
}

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const dict = getDictionary(locale);
  const profile = getSiteProfile();

  return (
    <LegalPage
      title={dict.footer.privacy}
      content={profile.legal.privacyText}
      /**
       * Fallback text describes what this application actually does — first-party
       * analytics with a rotating pseudonymous key, no third-party tracker, data
       * kept only to answer a request. The owner can replace it entirely from the
       * admin; nothing here is a legal warranty.
       */
      fallback={[
        {
          heading: 'Données collectées',
          body: 'Ce site collecte uniquement les informations que vous saisissez vous-même dans le formulaire de contact ou la demande de projet : nom, email, téléphone, entreprise, et la description de votre besoin. Ces données servent exclusivement à répondre à votre demande.',
        },
        {
          heading: 'Mesure d’audience',
          body: 'La fréquentation est mesurée en interne, sans outil tiers et sans cookie publicitaire. Chaque visite est associée à un identifiant technique recalculé chaque jour à partir d’éléments non nominatifs : il permet de compter les visites uniques d’une journée, sans permettre de vous identifier ni de vous suivre dans le temps.',
        },
        {
          heading: 'Cookies',
          body: 'Le site utilise un cookie pour mémoriser votre langue et, si vous vous connectez à un espace privé, un cookie de session strictement nécessaire à l’authentification. Aucun cookie de publicité ou de profilage n’est déposé.',
        },
        {
          heading: 'Assistant conversationnel',
          body: 'Si vous utilisez l’assistant, le contenu de la conversation est enregistré afin de traiter votre demande et d’améliorer les réponses. N’y saisissez aucune information sensible. La conversation reste dans votre navigateur tant que l’onglet est ouvert, et côté serveur uniquement si elle donne lieu à une demande.',
        },
        {
          heading: 'Conservation',
          body: 'Les demandes sont conservées le temps nécessaire au suivi commercial puis archivées. Les données de mesure d’audience sont purgées automatiquement au-delà d’une durée limitée.',
        },
        {
          heading: 'Vos droits',
          body: 'Vous pouvez demander à consulter, corriger ou supprimer les informations vous concernant en écrivant à l’adresse de contact indiquée sur ce site. La demande est traitée dans les meilleurs délais.',
        },
        {
          heading: 'Sécurité',
          body: 'Les échanges sont chiffrés (HTTPS), les mots de passe ne sont jamais stockés en clair, les accès à l’administration sont limités et journalisés.',
        },
      ]}
      contactEmail={profile.email}
      ownerName={profile.ownerName}
      lastUpdatedNote="Ce texte est modifiable depuis l’espace d’administration."
    />
  );
}
