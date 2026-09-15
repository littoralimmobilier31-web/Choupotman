#!/usr/bin/env tsx
/**
 * Captures the running application, screen by screen.
 *
 *   npm run build && npm start &
 *   npm run screenshots
 *
 * These are photographs of the real application answering real requests against
 * the real database — not mockups. That distinction is the whole point: a
 * preview assembled by hand shows what someone hoped to build.
 *
 * Every admin screen is captured twice, light and dark, and the public pages are
 * captured at phone width as well. Output goes to `var/screenshots/`.
 */
import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { chromium, type Browser, type Page } from 'playwright';

/**
 * Chromium may already be on the machine at a version the installed Playwright
 * does not expect. Pointing at it directly avoids downloading a second copy of a
 * browser that is already there — `CHROMIUM_PATH` overrides, and falling through
 * to `undefined` lets Playwright use its own.
 */
function chromiumPath(): string | undefined {
  const candidates = [
    process.env.CHROMIUM_PATH,
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
  ].filter(Boolean) as string[];

  return candidates.find((candidate) => existsSync(candidate));
}

const BASE = process.env.BASE ?? 'http://localhost:3000';
const OUT = process.env.SCREENSHOT_DIR ?? 'var/screenshots';

/**
 * `--preview` produces a set sized for sharing rather than for inspection:
 * JPEG at device scale 1 instead of PNG at 2. The full-resolution set is around
 * 66 MB, which is the right thing to keep locally and the wrong thing to put on
 * a page someone opens on a phone.
 */
const PREVIEW = process.argv.includes('--preview');
const SCALE = PREVIEW ? 1 : 2;
const EXT = PREVIEW ? 'jpg' : 'png';

const LOGIN = process.env.ADMIN_LOGIN ?? 'Choupotman';
const PASSWORD = process.env.ADMIN_PASSWORD ?? process.env.TEST_PASSWORD ?? 'Chp-Test-2026!ok';

type Shot = { name: string; path: string; label: string; wait?: string };

const PUBLIC_PAGES: Shot[] = [
  { name: 'public-accueil', path: '/', label: 'Accueil' },
  { name: 'public-a-propos', path: '/a-propos', label: 'À propos' },
  { name: 'public-services', path: '/services', label: 'Services' },
  { name: 'public-projets', path: '/projets', label: 'Réalisations' },
  { name: 'public-etudes-de-cas', path: '/etudes-de-cas', label: 'Études de cas' },
  { name: 'public-blog', path: '/blog', label: 'Blog' },
  { name: 'public-contact', path: '/contact', label: 'Contact' },
  { name: 'public-demande', path: '/demande-de-projet', label: 'Demande de projet' },
];

const ADMIN_PAGES: Shot[] = [
  { name: 'admin-tableau-de-bord', path: '/espace-admin', label: 'Tableau de bord' },
  { name: 'admin-statistiques', path: '/espace-admin/statistiques', label: 'Statistiques' },
  { name: 'admin-calendrier', path: '/espace-admin/calendrier', label: 'Calendrier' },
  { name: 'admin-prospects', path: '/espace-admin/prospects', label: 'Prospects' },
  { name: 'admin-clients', path: '/espace-admin/clients', label: 'Clients' },
  { name: 'admin-projets', path: '/espace-admin/projets', label: 'Projets' },
  { name: 'admin-taches', path: '/espace-admin/taches', label: 'Tâches — Kanban' },
  { name: 'admin-devis', path: '/espace-admin/devis', label: 'Devis' },
  { name: 'admin-factures', path: '/espace-admin/factures', label: 'Factures' },
  { name: 'admin-paiements', path: '/espace-admin/paiements', label: 'Paiements' },
  { name: 'admin-contrats', path: '/espace-admin/contrats', label: 'Contrats' },
  { name: 'admin-depenses', path: '/espace-admin/depenses', label: 'Dépenses' },
  { name: 'admin-abonnements', path: '/espace-admin/abonnements', label: 'Abonnements' },
  { name: 'admin-fichiers', path: '/espace-admin/fichiers', label: 'Fichiers' },
  { name: 'admin-moodboards', path: '/espace-admin/moodboards', label: 'Moodboards' },
  { name: 'admin-portfolio', path: '/espace-admin/portfolio', label: 'Portfolio' },
  { name: 'admin-blog', path: '/espace-admin/blog', label: 'Blog' },
  { name: 'admin-services', path: '/espace-admin/services', label: 'Services' },
  { name: 'admin-temoignages', path: '/espace-admin/temoignages', label: 'Témoignages' },
  { name: 'admin-messages', path: '/espace-admin/messages', label: 'Messagerie' },
  { name: 'admin-automatisations', path: '/espace-admin/automatisations', label: 'Automatisations' },
  { name: 'admin-roles', path: '/espace-admin/roles', label: 'Rôles et permissions' },
  { name: 'admin-utilisateurs', path: '/espace-admin/utilisateurs', label: 'Utilisateurs' },
  { name: 'admin-journal', path: '/espace-admin/journal', label: 'Journal d’activité' },
  { name: 'admin-sauvegardes', path: '/espace-admin/sauvegardes', label: 'Sauvegardes' },
  { name: 'admin-parametres', path: '/espace-admin/parametres', label: 'Paramètres' },
  { name: 'admin-assistant', path: '/espace-admin/assistant', label: 'Choupotman AI' },
];

/** Fonts and images need a beat to settle, or the capture shows a half-drawn page. */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.evaluate(() => document.fonts?.ready).catch(() => undefined);
  await page.waitForTimeout(350);
}

async function capture(page: Page, shot: Shot, suffix: string): Promise<boolean> {
  const response = await page.goto(`${BASE}${shot.path}`, { waitUntil: 'domcontentloaded' });
  if (response && response.status() >= 400) {
    console.log(`  ✗ ${shot.path} → ${response.status()}`);
    return false;
  }
  await settle(page);
  await page.screenshot({
    path: `${OUT}/${shot.name}${suffix}.${EXT}`,
    fullPage: true,
    ...(PREVIEW ? { type: 'jpeg' as const, quality: 78 } : {}),
  });
  console.log(`  ✓ ${shot.name}${suffix}`);
  return true;
}

async function signIn(browser: Browser, theme: 'light' | 'dark') {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: SCALE,
    colorScheme: theme,
    locale: 'fr-FR',
  });
  const page = await context.newPage();

  await page.goto(`${BASE}/espace-admin/connexion`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[name="login"], #login', LOGIN);
  await page.fill('input[type="password"]', PASSWORD);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes('/connexion'), { timeout: 15_000 }),
    page.click('button[type="submit"]'),
  ]).catch(() => undefined);

  return { context, page };
}

async function main(): Promise<void> {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch({ executablePath: chromiumPath() });
  let captured = 0;

  try {
    // Public pages, both themes, desktop.
    for (const theme of ['light', 'dark'] as const) {
      console.log(`\nPages publiques — thème ${theme === 'light' ? 'clair' : 'sombre'}`);
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: SCALE,
        colorScheme: theme,
        locale: 'fr-FR',
      });
      const page = await context.newPage();
      for (const shot of PUBLIC_PAGES) {
        if (await capture(page, shot, theme === 'dark' ? '-sombre' : '')) captured += 1;
      }
      await context.close();
    }

    // Public pages at phone width — the layout has to hold at 390px.
    console.log('\nPages publiques — mobile');
    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: SCALE === 1 ? 2 : 3,
      isMobile: true,
      hasTouch: true,
      locale: 'fr-FR',
    });
    const mobilePage = await mobile.newPage();
    for (const shot of PUBLIC_PAGES.slice(0, 4)) {
      if (await capture(mobilePage, shot, '-mobile')) captured += 1;
    }
    await mobile.close();

    // Arabic, to show the right-to-left layout is real.
    console.log('\nArabe (droite à gauche)');
    const rtl = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: SCALE,
      locale: 'ar',
    });
    const rtlPage = await rtl.newPage();
    for (const shot of [
      { name: 'public-accueil-ar', path: '/ar', label: 'الرئيسية' },
      { name: 'public-services-ar', path: '/ar/services', label: 'الخدمات' },
    ]) {
      if (await capture(rtlPage, shot, '')) captured += 1;
    }
    await rtl.close();

    // Admin, both themes.
    for (const theme of ['light', 'dark'] as const) {
      console.log(`\nAdministration — thème ${theme === 'light' ? 'clair' : 'sombre'}`);
      const { context, page } = await signIn(browser, theme);

      if (page.url().includes('/connexion') || page.url().includes('changer-mot-de-passe')) {
        console.log('  ✗ connexion impossible — vérifiez ADMIN_PASSWORD');
        await context.close();
        continue;
      }

      for (const shot of ADMIN_PAGES) {
        if (await capture(page, shot, theme === 'dark' ? '-sombre' : '')) captured += 1;
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }

  console.log(`\n${captured} captures dans ${OUT}/`);
}

void main();
