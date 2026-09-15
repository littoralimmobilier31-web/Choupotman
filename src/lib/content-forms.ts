/**
 * Field specifications for the public-content editors.
 *
 * Portfolio entries, case studies and articles are different records but the same
 * kind of screen: a title, a status, a handful of prose sections, some structured
 * lists and an SEO block. Describing each form as data instead of as JSX means one
 * editor component renders all three — so a fix to the list editor, the unsaved-
 * changes guard or the error display lands everywhere at once.
 *
 * This module is deliberately free of React and of `'use client'`: a server page
 * builds the specification (it is the side that knows the categories and the
 * clients) and passes it to the client editor as plain data.
 */

export type SelectOption = { value: string; label: string };

export type FieldSpec =
  | { kind: 'text'; name: string; label: string; hint?: string; max?: number; required?: boolean; wide?: boolean }
  | { kind: 'textarea'; name: string; label: string; hint?: string; max?: number; rows?: number }
  | { kind: 'number'; name: string; label: string; hint?: string; min?: number; max?: number }
  | { kind: 'date'; name: string; label: string; hint?: string }
  | { kind: 'select'; name: string; label: string; hint?: string; options: SelectOption[]; emptyLabel?: string }
  | { kind: 'switch'; name: string; label: string; hint?: string }
  /** A list of plain strings (technologies, services performed…). */
  | { kind: 'list'; name: string; label: string; hint?: string; placeholder?: string }
  /** A list of small objects, edited as rows (links, videos, figures…). */
  | {
      kind: 'rows';
      name: string;
      label: string;
      hint?: string;
      addLabel: string;
      columns: { name: string; label: string; max?: number; wide?: boolean }[];
    };

export type FormSection = {
  title: string;
  description?: string;
  /** Collapsed by default: secondary blocks such as SEO. */
  collapsed?: boolean;
  fields: FieldSpec[];
};

export const PUBLISH_STATUS_OPTIONS: SelectOption[] = [
  { value: 'draft', label: 'Brouillon — invisible sur le site' },
  { value: 'published', label: 'Publié — visible sur le site' },
  { value: 'archived', label: 'Archivé — retiré du site' },
];

export const LOCALE_OPTIONS: SelectOption[] = [
  { value: 'fr', label: 'Français' },
  { value: 'ar', label: 'العربية' },
  { value: 'en', label: 'English' },
];

const METRIC_COLUMNS = [
  { name: 'label', label: 'Intitulé', max: 120 },
  { name: 'value', label: 'Valeur', max: 80 },
  { name: 'note', label: 'Précision', max: 200, wide: true },
];

const SEO_FIELDS: FieldSpec[] = [
  {
    kind: 'text',
    name: 'seo_title',
    label: 'Titre SEO',
    hint: '55 à 60 caractères. Vide = le titre est utilisé.',
    max: 200,
    wide: true,
  },
  {
    kind: 'textarea',
    name: 'seo_description',
    label: 'Description SEO',
    hint: '150 à 158 caractères, affichés dans les résultats de recherche.',
    max: 400,
    rows: 2,
  },
];

const SLUG_FIELD: FieldSpec = {
  kind: 'text',
  name: 'slug',
  label: 'Adresse (slug)',
  hint: 'Vide = généré depuis le titre. Modifier l’adresse d’une page déjà publiée casse les liens existants.',
  max: 240,
  wide: true,
};

export type ContentFormOptions = {
  categories?: SelectOption[];
  clients?: SelectOption[];
  projects?: SelectOption[];
  portfolioEntries?: SelectOption[];
};

export function portfolioForm(options: ContentFormOptions = {}): FormSection[] {
  return [
    {
      title: 'Identité du projet',
      description:
        'Ce qui apparaît sur la carte dans /projets. Rien n’est pré-rempli : une réalisation figure sur le site parce qu’elle a été décrite ici.',
      fields: [
        { kind: 'text', name: 'title', label: 'Titre du projet', max: 200, required: true, wide: true },
        { kind: 'text', name: 'subtitle', label: 'Sous-titre', max: 300, wide: true },
        { kind: 'select', name: 'status', label: 'Statut', options: PUBLISH_STATUS_OPTIONS },
        {
          kind: 'select',
          name: 'category_id',
          label: 'Catégorie',
          options: options.categories ?? [],
          emptyLabel: 'Aucune',
        },
        {
          kind: 'text',
          name: 'client_name',
          label: 'Client affiché',
          hint: 'Le nom tel qu’il doit apparaître publiquement. Laissez vide si le client ne doit pas être nommé.',
          max: 160,
        },
        {
          kind: 'select',
          name: 'client_id',
          label: 'Fiche client liée',
          hint: 'Optionnel : relie la réalisation au CRM. N’affiche rien de plus sur le site.',
          options: options.clients ?? [],
          emptyLabel: 'Aucune',
        },
        {
          kind: 'select',
          name: 'project_id',
          label: 'Projet interne lié',
          options: options.projects ?? [],
          emptyLabel: 'Aucun',
        },
        { kind: 'date', name: 'project_date', label: 'Date du projet' },
        {
          kind: 'number',
          name: 'year',
          label: 'Année',
          hint: 'Vide = déduite de la date.',
          min: 1990,
          max: 2100,
        },
        { kind: 'text', name: 'cover_url', label: 'Image de couverture (adresse)', max: 500, wide: true },
        {
          kind: 'textarea',
          name: 'summary',
          label: 'Résumé',
          hint: 'Deux phrases maximum : c’est le texte de la carte.',
          max: 600,
          rows: 2,
        },
      ],
    },
    {
      title: 'Le projet en détail',
      description: 'Chaque bloc laissé vide disparaît de la page publique.',
      fields: [
        { kind: 'textarea', name: 'description', label: 'Présentation', max: 12000, rows: 6 },
        { kind: 'textarea', name: 'challenge', label: 'Le défi', max: 6000, rows: 4 },
        { kind: 'textarea', name: 'objectives', label: 'Objectifs', max: 6000, rows: 4 },
        { kind: 'textarea', name: 'solution', label: 'Solution mise en place', max: 6000, rows: 4 },
        { kind: 'textarea', name: 'results', label: 'Résultats', max: 6000, rows: 4 },
      ],
    },
    {
      title: 'Technique et liens',
      fields: [
        {
          kind: 'list',
          name: 'technologies',
          label: 'Technologies utilisées',
          hint: 'Sert aussi de filtre sur la page /projets.',
          placeholder: 'Next.js, PostgreSQL…',
        },
        {
          kind: 'list',
          name: 'services_done',
          label: 'Prestations réalisées',
          placeholder: 'Développement, référencement…',
        },
        {
          kind: 'rows',
          name: 'links',
          label: 'Liens',
          hint: 'Site en ligne, dépôt, documentation…',
          addLabel: 'Ajouter un lien',
          columns: [
            { name: 'label', label: 'Intitulé', max: 80 },
            { name: 'url', label: 'Adresse', max: 500, wide: true },
          ],
        },
        {
          kind: 'rows',
          name: 'videos',
          label: 'Vidéos',
          addLabel: 'Ajouter une vidéo',
          columns: [
            { name: 'title', label: 'Titre', max: 160 },
            { name: 'url', label: 'Adresse', max: 500, wide: true },
            { name: 'provider', label: 'Plateforme', max: 40 },
          ],
        },
        {
          kind: 'rows',
          name: 'metrics',
          label: 'Chiffres du projet',
          hint: 'N’indiquez que des chiffres que vous pouvez justifier : ils sont affichés tels quels.',
          addLabel: 'Ajouter un chiffre',
          columns: METRIC_COLUMNS,
        },
      ],
    },
    {
      title: 'Témoignage du client',
      description: 'Uniquement les mots du client. Rien n’est reformulé ni généré.',
      collapsed: true,
      fields: [
        { kind: 'textarea', name: 'testimonial_quote', label: 'Citation', max: 2000, rows: 3 },
        { kind: 'text', name: 'testimonial_author', label: 'Auteur', max: 160 },
        { kind: 'text', name: 'testimonial_role', label: 'Fonction', max: 160 },
      ],
    },
    {
      title: 'Affichage et référencement',
      collapsed: true,
      fields: [
        { kind: 'switch', name: 'is_featured', label: 'Mettre en avant sur la page d’accueil' },
        { kind: 'number', name: 'position', label: 'Ordre d’affichage', hint: '0 = en premier.', min: 0, max: 999 },
        SLUG_FIELD,
        ...SEO_FIELDS,
      ],
    },
  ];
}

export function caseStudyForm(options: ContentFormOptions = {}): FormSection[] {
  return [
    {
      title: 'L’étude de cas',
      fields: [
        { kind: 'text', name: 'title', label: 'Titre', max: 200, required: true, wide: true },
        { kind: 'text', name: 'subtitle', label: 'Sous-titre', max: 300, wide: true },
        { kind: 'select', name: 'status', label: 'Statut', options: PUBLISH_STATUS_OPTIONS },
        {
          kind: 'select',
          name: 'portfolio_id',
          label: 'Réalisation associée',
          hint: 'Relie l’étude à un projet du portfolio.',
          options: options.portfolioEntries ?? [],
          emptyLabel: 'Aucune',
        },
        { kind: 'text', name: 'cover_url', label: 'Image de couverture (adresse)', max: 500, wide: true },
      ],
    },
    {
      title: 'La démarche',
      description: 'Le fil de l’étude : le problème, ce qui a été décidé, ce qui a été livré, ce que ça a donné.',
      fields: [
        { kind: 'textarea', name: 'problem', label: 'Le problème', max: 8000, rows: 5 },
        { kind: 'textarea', name: 'objectives', label: 'Les objectifs', max: 8000, rows: 4 },
        { kind: 'textarea', name: 'strategy', label: 'La stratégie', max: 8000, rows: 5 },
        { kind: 'textarea', name: 'solution', label: 'La solution', max: 8000, rows: 5 },
        { kind: 'textarea', name: 'development', label: 'La réalisation', max: 8000, rows: 5 },
        { kind: 'textarea', name: 'tools_used', label: 'Outils et technologies', max: 2000, rows: 2 },
        { kind: 'textarea', name: 'result', label: 'Le résultat', max: 8000, rows: 5 },
      ],
    },
    {
      title: 'Chiffres et témoignage',
      fields: [
        {
          kind: 'rows',
          name: 'metrics',
          label: 'Résultats chiffrés',
          hint: 'Uniquement des chiffres réels et vérifiables.',
          addLabel: 'Ajouter un chiffre',
          columns: METRIC_COLUMNS,
        },
        { kind: 'textarea', name: 'testimonial_quote', label: 'Citation du client', max: 2000, rows: 3 },
        { kind: 'text', name: 'testimonial_author', label: 'Auteur de la citation', max: 160 },
      ],
    },
    {
      title: 'Affichage et référencement',
      collapsed: true,
      fields: [
        { kind: 'number', name: 'position', label: 'Ordre d’affichage', hint: '0 = en premier.', min: 0, max: 999 },
        SLUG_FIELD,
        ...SEO_FIELDS,
      ],
    },
  ];
}

export function postForm(options: ContentFormOptions = {}): FormSection[] {
  return [
    {
      title: 'L’article',
      fields: [
        { kind: 'text', name: 'title', label: 'Titre', max: 240, required: true, wide: true },
        { kind: 'select', name: 'status', label: 'Statut', options: PUBLISH_STATUS_OPTIONS },
        { kind: 'select', name: 'locale', label: 'Langue', options: LOCALE_OPTIONS },
        {
          kind: 'select',
          name: 'category_id',
          label: 'Catégorie',
          options: options.categories ?? [],
          emptyLabel: 'Aucune',
        },
        {
          kind: 'text',
          name: 'author_name',
          label: 'Signature',
          hint: 'Vide = aucune signature affichée.',
          max: 160,
        },
        { kind: 'text', name: 'cover_url', label: 'Image de couverture (adresse)', max: 500, wide: true },
        {
          kind: 'textarea',
          name: 'excerpt',
          label: 'Chapeau',
          hint: 'Le résumé affiché dans la liste des articles et dans les partages.',
          max: 600,
          rows: 3,
        },
      ],
    },
    {
      title: 'Contenu',
      description: 'Markdown accepté : titres avec #, listes avec -, **gras**, [liens](adresse).',
      fields: [{ kind: 'textarea', name: 'content', label: 'Corps de l’article', max: 80000, rows: 20 }],
    },
    {
      title: 'Classement et référencement',
      collapsed: true,
      fields: [
        { kind: 'switch', name: 'is_featured', label: 'Mettre en avant sur la page d’accueil' },
        {
          kind: 'list',
          name: 'tags',
          label: 'Mots-clés',
          hint: 'Servent de filtre sur le blog.',
          placeholder: 'sécurité, réseau…',
        },
        SLUG_FIELD,
        ...SEO_FIELDS,
      ],
    },
  ];
}

/** Every field name a specification touches, used to build the initial values. */
export function fieldNames(sections: FormSection[]): string[] {
  return sections.flatMap((section) => section.fields.map((field) => field.name));
}

/**
 * Blank values for a new record.
 *
 * A select that offers no empty choice takes its first option — which is how a
 * new article starts as a draft in French rather than in no state at all.
 */
export function emptyValues(sections: FormSection[]): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const section of sections) {
    for (const field of section.fields) {
      switch (field.kind) {
        case 'switch':
          values[field.name] = false;
          break;
        case 'list':
        case 'rows':
          values[field.name] = [];
          break;
        case 'select':
          values[field.name] = field.emptyLabel !== undefined ? '' : (field.options[0]?.value ?? '');
          break;
        default:
          values[field.name] = '';
      }
    }
  }
  return values;
}

/**
 * Turns a stored record into form values.
 *
 * `null` becomes `''` so an input is empty rather than showing "null", and a
 * boolean column stored as 0/1 becomes a real boolean for the switch.
 */
export function valuesFrom(
  sections: FormSection[],
  record: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const values = emptyValues(sections);

  for (const section of sections) {
    for (const field of section.fields) {
      const raw = field.name in overrides ? overrides[field.name] : record[field.name];
      if (raw === undefined) continue;

      switch (field.kind) {
        case 'switch':
          values[field.name] = raw === true || raw === 1;
          break;
        case 'list':
        case 'rows':
          values[field.name] = Array.isArray(raw) ? raw : [];
          break;
        default:
          values[field.name] = raw === null ? '' : String(raw);
      }
    }
  }

  return values;
}
