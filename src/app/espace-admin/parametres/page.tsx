import Link from 'next/link';
import { AlertTriangle, KeyRound, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/admin/page-kit';
import { SettingsForm } from '@/components/admin/settings-form';
import { requirePermission } from '@/lib/auth/guard';
import { getCsrfToken } from '@/lib/auth/csrf';
import { listSettings, type SettingsGroup } from '@/lib/db/repositories/settings';
import { available as aiAvailable } from '@/lib/ai/client';
import { config } from '@/lib/config';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Paramètres' };

/**
 * Settings, one tab per group.
 *
 * The order is the order the owner needs them in when setting the site up:
 * who they are first, then how to reach them, then everything else.
 */
const TABS: { key: SettingsGroup; label: string; description: string }[] = [
  {
    key: 'identity',
    label: 'Identité',
    description:
      'Ce que le site public affiche à votre sujet. Tout champ laissé vide n’apparaît pas : rien n’est inventé à votre place.',
  },
  {
    key: 'contact',
    label: 'Contact',
    description: 'Les coordonnées affichées sur la page de contact et utilisées par l’assistant du site.',
  },
  {
    key: 'social',
    label: 'Réseaux',
    description: 'Seuls les réseaux renseignés apparaissent dans l’en-tête et le pied de page.',
  },
  {
    key: 'home',
    label: 'Page d’accueil',
    description:
      'Les compteurs affichés sur l’accueil. Renseignez uniquement des chiffres exacts : ils sont affichés tels quels.',
  },
  {
    key: 'seo',
    label: 'Référencement',
    description: 'Titre, description et indexation. Visibles par Google et lors d’un partage sur les réseaux.',
  },
  {
    key: 'finance',
    label: 'Facturation',
    description: 'Devise, TVA, délais et mentions reprises automatiquement sur chaque devis et facture.',
  },
  {
    key: 'automation',
    label: 'Automatisations',
    description: 'Les seuils utilisés par les règles automatiques (alertes d’échéance, relances).',
  },
  { key: 'ai', label: 'Assistant IA', description: 'Comportement du chatbot public et de l’assistant privé.' },
  {
    key: 'legal',
    label: 'Mentions légales',
    description: 'Informations juridiques affichées sur les pages Mentions légales et Confidentialité.',
  },
];

/** Guidance the field label alone cannot carry. */
const HINTS: Record<string, string> = {
  'site.owner_name': 'Le nom affiché partout sur le site public.',
  'site.role_label': 'Par exemple : Développeur web & consultant IT.',
  'site.short_bio': 'Deux ou trois phrases, affichées sur l’accueil.',
  'site.long_bio': 'La présentation complète de la page « À propos ».',
  'site.availability': 'Par exemple : disponible à partir de mars, ou complet jusqu’en juin.',
  'site.avatar_url': 'Adresse d’une image déjà en ligne, ou chemin d’un fichier téléversé.',
  'site.cv_url': 'Lien vers votre CV en PDF, proposé au téléchargement sur la page « À propos ».',
  'home.stat_projects': 'Laissez vide si vous préférez ne pas afficher ce compteur.',
  'home.stat_clients': 'Laissez vide si vous préférez ne pas afficher ce compteur.',
  'home.stat_years': 'Laissez vide si vous préférez ne pas afficher ce compteur.',
  'home.stat_satisfaction': 'Par exemple : 98 %. Laissez vide si vous n’avez pas de mesure fiable.',
  'seo.index': 'Désactivez tant que le site n’est pas prêt à être référencé.',
  'seo.canonical_host': 'Le domaine définitif, sans https:// ni barre finale.',
  'finance.tax_rate': 'Mettez 0 si vous n’êtes pas assujetti à la TVA.',
  'finance.default_revisions': 'Nombre de révisions incluses par défaut dans un nouveau projet.',
  'finance.revision_extra_cost': 'Montant facturé au-delà du forfait de révisions.',
  'finance.bank_details': 'Affiché sur les factures et dans l’espace client.',
  'ai.chatbot_enabled': 'Affiche l’assistant sur le site public.',
  'ai.chatbot_greeting': 'Le premier message affiché par l’assistant. Laissez vide pour le message par défaut.',
  'ai.collect_leads': 'Enregistre un prospect lorsqu’un visiteur laisse son email ou son téléphone.',
  'ai.require_confirmation':
    'Laissez activé : l’assistant privé demande votre confirmation avant toute action qui modifie vos données.',
  'automation.deadline_warning_days': 'Nombre de jours avant une échéance pour être alerté.',
  'automation.invoice_reminder_days': 'Délai après l’échéance avant de proposer une relance.',
  'legal.company_name': 'Raison sociale affichée dans les mentions légales.',
};

const PLACEHOLDERS: Record<string, string> = {
  'contact.email': 'contact@exemple.com',
  'contact.phone': '+213 ...',
  'social.linkedin': 'https://www.linkedin.com/in/...',
  'social.instagram': 'https://www.instagram.com/...',
  'site.location': 'Alger, Algérie',
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ groupe?: string }>;
}) {
  await requirePermission('settings.view');
  const csrf = (await getCsrfToken()) ?? '';
  const query = await searchParams;

  const active = TABS.find((tab) => tab.key === query.groupe) ?? TABS[0];
  const fields = listSettings(active.key);

  // How much of the public identity is still blank, so the owner can see at a
  // glance what the site is currently hiding.
  const identity = listSettings('identity');
  const emptyIdentity = identity.filter((setting) => setting.value === null || setting.value === '').length;

  return (
    <>
      <PageHeader
        title="Paramètres"
        description="Tout ce que le site public affiche à votre sujet se règle ici. Rien n’est inventé : un champ vide masque la section correspondante."
      />

      {emptyIdentity > 0 && active.key === 'identity' && (
        <p className="mb-5 flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2.5 text-[0.8125rem] leading-relaxed text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            {emptyIdentity} champ(s) d’identité ne sont pas encore renseignés. Les sections
            correspondantes n’apparaissent pas sur le site public tant qu’ils sont vides — c’est
            volontaire : le site n’affiche que ce que vous avez écrit vous-même.
          </span>
        </p>
      )}

      <nav className="mb-5" aria-label="Groupes de paramètres">
        <ul className="hide-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1">
          {TABS.map((tab) => (
            <li key={tab.key}>
              <Link
                href={`/espace-admin/parametres?groupe=${tab.key}`}
                aria-current={tab.key === active.key ? 'page' : undefined}
                className={cn(
                  'inline-flex shrink-0 items-center rounded-lg px-3 py-1.5 text-[0.8125rem] font-medium transition-colors',
                  tab.key === active.key
                    ? 'bg-accent text-accent-fg'
                    : 'text-fg-muted hover:bg-surface-hover hover:text-fg',
                )}
              >
                {tab.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <p className="mb-4 max-w-2xl text-[0.8125rem] leading-relaxed text-fg-muted">{active.description}</p>

      {active.key === 'ai' && (
        <p
          className={cn(
            'mb-5 flex items-start gap-2 rounded-lg px-3 py-2.5 text-[0.8125rem] leading-relaxed',
            aiAvailable() ? 'bg-success-soft text-success' : 'bg-surface-sunken text-fg-muted',
          )}
        >
          <Sparkles className="mt-0.5 size-4 shrink-0" />
          <span>
            {aiAvailable() ? (
              <>Une clé API est configurée : l’assistant conversationnel est actif ({config.ai.model}).</>
            ) : (
              <>
                Aucune clé API n’est configurée. L’assistant fonctionne alors en mode déterministe :
                il répond à partir de vos données réelles, sans conversation libre. Pour l’activer,
                ajoutez <code>ANTHROPIC_API_KEY</code> dans le fichier <code>.env.local</code> du
                serveur. Une clé ne se saisit jamais depuis cette interface.
              </>
            )}
          </span>
        </p>
      )}

      {active.key === 'legal' && (
        <p className="mb-5 flex items-start gap-2 rounded-lg bg-surface-sunken px-3 py-2.5 text-[0.75rem] leading-relaxed text-fg-muted">
          <KeyRound className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Les mots de passe, clés API et identifiants SMTP ne se règlent pas ici : ils vivent dans
            les variables d’environnement du serveur, jamais en base ni dans le navigateur.
          </span>
        </p>
      )}

      <SettingsForm
        key={active.key}
        csrf={csrf}
        group={active.key}
        hints={HINTS}
        placeholders={PLACEHOLDERS}
        fields={fields.map((setting) => ({
          key: setting.key,
          label: setting.label,
          value: setting.value,
          value_type: setting.value_type,
        }))}
      />
    </>
  );
}
