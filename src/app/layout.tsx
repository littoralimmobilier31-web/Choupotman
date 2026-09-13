import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ToastProvider } from '@/components/ui/toast';
import { ThemeScript } from '@/components/theme';
import { ServiceWorkerRegistrar } from '@/components/service-worker';
import { config } from '@/lib/config';

/**
 * Root layout.
 *
 * Deliberately minimal: it owns `<html>`/`<body>`, the no-flash theme script and
 * the toast provider. `lang` and `dir` are set per-locale by the public layout
 * (and by the admin layout), because this file is shared by routes that are not
 * locale-prefixed — the admin, the client portal and public brief links.
 */

export const metadata: Metadata = {
  metadataBase: new URL(config.site.url),
  title: {
    default: 'Boubaker Choupotman — Développement web, IT, marketing & IA',
    template: '%s · Boubaker Choupotman',
  },
  description:
    'Boubaker Choupotman conçoit des sites et applications web, des systèmes informatiques, des campagnes marketing, des contenus audiovisuels et des automatisations IA.',
  applicationName: 'CHOUPOTMAN OS',
  authors: [{ name: 'Boubaker Choupotman' }],
  creator: 'Boubaker Choupotman',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'CHOUPOTMAN OS',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: '32x32' },
    ],
    apple: [{ url: '/apple-icon.png', sizes: '180x180' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f9fafb' },
    { media: '(prefers-color-scheme: dark)', color: '#030306' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" dir="ltr" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        <ToastProvider>{children}</ToastProvider>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
