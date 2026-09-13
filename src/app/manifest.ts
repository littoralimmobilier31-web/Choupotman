import type { MetadataRoute } from 'next';

/**
 * PWA manifest.
 *
 * Shortcuts point at the surfaces that are actually worth one tap from a phone
 * home screen: the admin dashboard, the project list and the calendar. Icons are
 * SVG so one file covers every density.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'CHOUPOTMAN OS — My Work. My Clients. My Projects. My Business.',
    short_name: 'CHOUPOTMAN OS',
    description:
      'Portfolio professionnel et plateforme de gestion freelance : projets, clients, devis, factures, calendrier et assistant IA.',
    start_url: '/espace-admin',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#f9fafb',
    theme_color: '#725ee0',
    lang: 'fr',
    dir: 'auto',
    categories: ['business', 'productivity', 'portfolio'],
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Tableau de bord', url: '/espace-admin', description: 'Vue d’ensemble de l’activité' },
      { name: 'Projets', url: '/espace-admin/projets', description: 'Projets en cours' },
      { name: 'Calendrier', url: '/espace-admin/calendrier', description: 'Deadlines et rendez-vous' },
      { name: 'Nouveau devis', url: '/espace-admin/devis/nouveau', description: 'Créer un devis' },
    ],
  };
}
