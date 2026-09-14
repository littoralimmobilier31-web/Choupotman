/**
 * Kinds of profile entry, shared by the admin screen and the client component
 * that edits them.
 *
 * In a plain module on purpose: a `'use client'` file's exports become client
 * references when imported from a server component, so a constant shared across
 * that boundary has to live outside it — importing this array from the editor
 * would hand the page a function reference instead of the data.
 */
export type ProfileKind = {
  key: string;
  label: string;
  plural: string;
  hint: string;
  /** Skills and tools can carry an indicative level; a diploma cannot. */
  hasLevel?: boolean;
};

export const PROFILE_KINDS: ProfileKind[] = [
  {
    key: 'experience',
    label: 'Expérience',
    plural: 'Expériences professionnelles',
    hint: 'Postes, missions et collaborations. Affichés sous forme de parcours chronologique.',
  },
  {
    key: 'education',
    label: 'Formation',
    plural: 'Formations',
    hint: 'Diplômes et cursus suivis. N’indiquez que ce que vous avez réellement obtenu.',
  },
  {
    key: 'certification',
    label: 'Certification',
    plural: 'Certifications',
    hint: 'Certifications obtenues, avec l’organisme et l’année.',
  },
  {
    key: 'skill',
    label: 'Compétence',
    plural: 'Compétences',
    hint: 'Vos compétences, avec un niveau indicatif si vous le souhaitez.',
    hasLevel: true,
  },
  {
    key: 'tool',
    label: 'Outil',
    plural: 'Outils & technologies',
    hint: 'Les technologies et outils que vous utilisez au quotidien.',
    hasLevel: true,
  },
  {
    key: 'expertise',
    label: 'Domaine d’expertise',
    plural: 'Domaines d’expertise',
    hint: 'Les domaines dans lesquels vous intervenez.',
  },
  {
    key: 'interest',
    label: 'Centre d’intérêt',
    plural: 'Centres d’intérêt',
    hint: 'Facultatif, pour donner un peu de relief à votre présentation.',
  },
];
