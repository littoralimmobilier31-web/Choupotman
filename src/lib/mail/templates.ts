/**
 * Message and document templates.
 *
 * Bodies use `{{variable}}` placeholders substituted by `renderTemplate` from a
 * whitelisted map — never by string concatenation of user input. Every template
 * is editable in the admin; these are only the defaults the seed installs.
 */

export type SystemMessageTemplate = {
  key: string;
  name: string;
  channel: 'email' | 'whatsapp' | 'internal';
  subject?: string;
  body: string;
  description: string;
};

/** Variables available to message templates, shown as help in the editor. */
export const TEMPLATE_VARIABLE_HELP: Record<string, string> = {
  client_name: 'Nom du client',
  client_company: 'Entreprise du client',
  project_name: 'Nom du projet',
  project_price: 'Budget du projet',
  invoice_number: 'Numéro de facture',
  invoice_total: 'Montant total de la facture',
  invoice_balance: 'Solde restant dû',
  invoice_due_date: 'Date d’échéance',
  quote_number: 'Numéro de devis',
  quote_total: 'Montant du devis',
  quote_validity: 'Date de validité du devis',
  delivery_date: 'Date de livraison',
  start_date: 'Date de début',
  revision_number: 'Numéro de révision',
  revision_cost: 'Coût de la révision supplémentaire',
  services: 'Liste des prestations',
  payment_terms: 'Conditions de paiement',
  owner_name: 'Votre nom',
  owner_email: 'Votre email',
  owner_phone: 'Votre téléphone',
  site_url: 'Adresse du site',
  portal_url: 'Lien vers l’espace client',
  brief_url: 'Lien vers le brief',
  meeting_date: 'Date de la réunion',
  meeting_time: 'Heure de la réunion',
  days_overdue: 'Nombre de jours de retard',
};

export const SYSTEM_MESSAGE_TEMPLATES: SystemMessageTemplate[] = [
  {
    key: 'payment_reminder',
    name: 'Relance de paiement',
    channel: 'email',
    subject: 'Relance — facture {{invoice_number}}',
    description: 'Envoyée lorsqu’une facture dépasse son échéance.',
    body: `Bonjour {{client_name}},

Je me permets de revenir vers vous concernant la facture {{invoice_number}}, dont l'échéance était fixée au {{invoice_due_date}}.

Montant restant dû : {{invoice_balance}}

Si le règlement a déjà été effectué, merci de ne pas tenir compte de ce message et de m'en informer pour que je mette le dossier à jour.

Je reste à votre disposition.

Cordialement,
{{owner_name}}
{{owner_email}} · {{owner_phone}}`,
  },
  {
    key: 'delivery',
    name: 'Livraison de projet',
    channel: 'email',
    subject: 'Livraison — {{project_name}}',
    description: 'Annonce la mise à disposition des livrables.',
    body: `Bonjour {{client_name}},

Le projet {{project_name}} est prêt. Vous trouverez l'ensemble des livrables dans votre espace client :

{{portal_url}}

N'hésitez pas à me faire part de vos remarques directement depuis cet espace : chaque retour est enregistré et suivi.

Merci pour votre confiance.

{{owner_name}}`,
  },
  {
    key: 'feedback_request',
    name: 'Demande de retour',
    channel: 'email',
    subject: 'Votre avis sur {{project_name}}',
    description: 'Sollicite un retour client après une étape ou une livraison.',
    body: `Bonjour {{client_name}},

Une nouvelle version de {{project_name}} est disponible pour relecture.

Pour la consulter et laisser vos commentaires :
{{portal_url}}

Vos retours sont précieux : plus ils sont précis, plus la suite avance vite.

Bien à vous,
{{owner_name}}`,
  },
  {
    key: 'meeting_confirmation',
    name: 'Confirmation de réunion',
    channel: 'email',
    subject: 'Confirmation — réunion du {{meeting_date}}',
    description: 'Confirme un rendez-vous et son ordre du jour.',
    body: `Bonjour {{client_name}},

Je confirme notre réunion du {{meeting_date}} à {{meeting_time}}, au sujet de {{project_name}}.

Si un point particulier doit être abordé, dites-le-moi en avance et je le prépare.

À bientôt,
{{owner_name}}`,
  },
  {
    key: 'new_revision',
    name: 'Nouvelle révision',
    channel: 'email',
    subject: 'Révision #{{revision_number}} — {{project_name}}',
    description: 'Accuse réception d’une demande de modification.',
    body: `Bonjour {{client_name}},

J'ai bien reçu votre demande de modification concernant {{project_name}}. Elle est enregistrée sous le numéro de révision #{{revision_number}}.

{{revision_cost}}

Je reviens vers vous dès que les ajustements sont prêts.

{{owner_name}}`,
  },
  {
    key: 'project_end',
    name: 'Clôture de projet',
    channel: 'email',
    subject: 'Clôture — {{project_name}}',
    description: 'Clôt formellement un projet livré et accepté.',
    body: `Bonjour {{client_name}},

Le projet {{project_name}} est officiellement clôturé. Merci pour votre collaboration tout au long de cette mission.

Tous les livrables et documents restent accessibles dans votre espace client :
{{portal_url}}

Si vous avez besoin d'une évolution ou d'un accompagnement par la suite, je reste joignable.

Au plaisir de retravailler ensemble,
{{owner_name}}`,
  },
  {
    key: 'new_lead',
    name: 'Nouveau prospect (interne)',
    channel: 'internal',
    subject: 'Nouveau prospect : {{client_name}}',
    description: 'Notification interne à la réception d’une demande.',
    body: `Nouvelle demande reçue.

Contact : {{client_name}} ({{client_company}})
Service demandé : {{services}}
Budget indiqué : {{project_price}}
Délai souhaité : {{delivery_date}}

À traiter depuis l'espace d'administration.`,
  },
  {
    key: 'form_confirmation',
    name: 'Accusé de réception (formulaire)',
    channel: 'email',
    subject: 'Votre demande a bien été reçue',
    description: 'Réponse automatique après l’envoi du formulaire public.',
    body: `Bonjour {{client_name}},

Merci pour votre message : votre demande est bien enregistrée.

Je l'étudie et reviens vers vous rapidement avec une première analyse et, si nécessaire, quelques questions pour cadrer précisément votre besoin.

À très bientôt,
{{owner_name}}
{{site_url}}`,
  },
  {
    key: 'quote_sent',
    name: 'Envoi de devis',
    channel: 'email',
    subject: 'Votre devis {{quote_number}}',
    description: 'Accompagne l’envoi d’un devis.',
    body: `Bonjour {{client_name}},

Vous trouverez ci-joint le devis {{quote_number}} pour {{project_name}}.

Montant total : {{quote_total}}
Validité : jusqu'au {{quote_validity}}
Conditions de paiement : {{payment_terms}}

Je reste disponible pour en discuter ou ajuster le périmètre si besoin.

Cordialement,
{{owner_name}}`,
  },
  {
    key: 'invoice_sent',
    name: 'Envoi de facture',
    channel: 'email',
    subject: 'Facture {{invoice_number}}',
    description: 'Accompagne l’envoi d’une facture.',
    body: `Bonjour {{client_name}},

Vous trouverez ci-joint la facture {{invoice_number}} concernant {{project_name}}.

Montant total : {{invoice_total}}
Échéance : {{invoice_due_date}}

Merci par avance pour votre règlement.

Cordialement,
{{owner_name}}`,
  },
  {
    key: 'payment_received',
    name: 'Confirmation de paiement',
    channel: 'email',
    subject: 'Paiement reçu — {{invoice_number}}',
    description: 'Confirme la réception d’un règlement.',
    body: `Bonjour {{client_name}},

Je vous confirme la réception de votre paiement pour la facture {{invoice_number}}.

Solde restant : {{invoice_balance}}

Merci pour votre ponctualité.

{{owner_name}}`,
  },
  {
    key: 'appointment',
    name: 'Proposition de rendez-vous',
    channel: 'email',
    subject: 'Proposition de rendez-vous',
    description: 'Propose un créneau à un prospect qualifié.',
    body: `Bonjour {{client_name}},

Merci pour votre demande. Pour cadrer précisément votre projet, je vous propose un échange de 30 minutes.

Vous pouvez choisir directement un créneau ici :
{{portal_url}}

Si aucun horaire ne convient, indiquez-moi vos disponibilités et je m'adapte.

Cordialement,
{{owner_name}}`,
  },
];

/**
 * Default contract template.
 *
 * Written as a workable starting point, not legal advice: the admin is expected
 * to adapt the clauses to the applicable jurisdiction. Placeholders match the
 * variable map built by `lib/pdf/contract.ts`.
 */
export const DEFAULT_CONTRACT_TEMPLATE = `CONTRAT DE PRESTATION DE SERVICES

Entre les soussignés :

Le prestataire : {{owner_name}}
{{owner_address}}
Email : {{owner_email}} — Téléphone : {{owner_phone}}

Et

Le client : {{client_name}}
{{client_company}}
{{client_address}}
Email : {{client_email}}

Il a été convenu ce qui suit.

ARTICLE 1 — OBJET
Le prestataire s'engage à réaliser pour le client la prestation suivante :
{{project_name}}

Prestations incluses :
{{services}}

ARTICLE 2 — DURÉE ET CALENDRIER
Date de début : {{start_date}}
Date de livraison prévue : {{delivery_date}}

Les délais sont calculés à compter de la réception de l'ensemble des éléments nécessaires (contenus, accès, validations). Tout retard dans la fourniture de ces éléments décale la date de livraison d'autant.

ARTICLE 3 — PRIX
Le montant total de la prestation est fixé à {{project_price}}.

ARTICLE 4 — MODALITÉS DE PAIEMENT
{{payment_terms}}

ARTICLE 5 — RÉVISIONS
Le forfait comprend {{revisions_included}} série(s) de modifications. Toute demande supplémentaire fait l'objet d'un devis complémentaire, communiqué et accepté avant exécution.

ARTICLE 6 — VALIDATION ET RECETTE
Le client dispose de sept (7) jours à compter de la livraison pour formuler ses remarques. Passé ce délai sans retour écrit, la livraison est réputée acceptée.

ARTICLE 7 — PROPRIÉTÉ INTELLECTUELLE
Les droits d'utilisation des livrables sont transférés au client après paiement intégral du prix. Le prestataire conserve la faculté de mentionner la prestation à titre de référence, sauf refus écrit du client.

ARTICLE 8 — CONFIDENTIALITÉ
Chaque partie s'engage à ne pas divulguer les informations confidentielles portées à sa connaissance dans le cadre du présent contrat.

ARTICLE 9 — DONNÉES ET SAUVEGARDES
Le prestataire met en œuvre des mesures raisonnables de sécurité et de sauvegarde. Le client demeure responsable de la conservation de ses propres données et accès.

ARTICLE 10 — RÉSILIATION
En cas de résiliation par l'une des parties, les prestations déjà réalisées restent dues au prorata de l'avancement constaté à la date de résiliation.

ARTICLE 11 — LITIGES
Les parties s'efforceront de régler à l'amiable tout différend relatif au présent contrat. À défaut d'accord, le litige sera porté devant la juridiction compétente.

Fait à ______________________, le {{issue_date}}

Le prestataire                                     Le client
{{owner_name}}                                     {{client_name}}


Signature :                                        Signature :`;

/**
 * Wraps a plain-text message body in a minimal, email-client-safe HTML shell.
 * Tables and inline styles are used deliberately — email clients strip modern
 * CSS, so this is the format that renders consistently.
 */
export function wrapEmailHtml(options: {
  title: string;
  body: string;
  footer?: string;
  siteUrl?: string;
}): string {
  const paragraphs = options.body
    .split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 16px;line-height:1.65;">${escapeHtml(block).replace(/\n/g, '<br />')}</p>`)
    .join('');

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(options.title)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1c1c22;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;border:1px solid #e5e5ea;overflow:hidden;">
          <tr>
            <td style="padding:24px 28px;border-bottom:1px solid #f0f0f3;">
              <span style="font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#725ee0;">CHOUPOTMAN OS</span>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;font-size:15px;">
              ${paragraphs}
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px;background:#fafafc;border-top:1px solid #f0f0f3;font-size:12px;color:#6b6b76;">
              ${escapeHtml(options.footer ?? '')}
              ${options.siteUrl ? `<br /><a href="${escapeHtml(options.siteUrl)}" style="color:#725ee0;text-decoration:none;">${escapeHtml(options.siteUrl)}</a>` : ''}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
