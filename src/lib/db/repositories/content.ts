import { all, one, run, scalar, transaction } from '../client';
import type {
  BlogPostRow, CaseStudyRow, CategoryRow, FaqRow, PortfolioMediaRow, PortfolioProjectRow,
  ProfileEntryKind, ProfileEntryRow, PublishStatus, ServiceFamily, ServiceRow,
  TagRow, TechnologyRow, TestimonialRow,
} from '../types';
import { indexEntity, removeFromIndex } from './search';
import { localiseRow, localiseRows, deleteTranslations } from './settings';
import { readingTime, safeJson, slugify, toJson, unique } from '@/lib/utils';
import type { Locale } from '@/lib/i18n/config';

/**
 * Public content: services, portfolio, case studies, blog, profile.
 *
 * Everything here is CMS-managed. Read paths take a `locale` and overlay
 * translations, so the same row serves FR / AR / EN with the base language as
 * fallback when a translation is missing.
 */

// ── Taxonomy ─────────────────────────────────────────────────────────────

export function listCategories(kind?: CategoryRow['kind']): CategoryRow[] {
  return kind
    ? all<CategoryRow>('SELECT * FROM categories WHERE kind = ? ORDER BY position, name', [kind])
    : all<CategoryRow>('SELECT * FROM categories ORDER BY kind, position, name');
}

export function findCategory(id: number): CategoryRow | null {
  return one<CategoryRow>('SELECT * FROM categories WHERE id = ?', [id]);
}

export function upsertCategory(input: {
  id?: number; name: string; kind: CategoryRow['kind'];
  slug?: string; description?: string | null; color?: string | null; icon?: string | null; position?: number;
}): number {
  const slug = input.slug ?? slugify(input.name);
  if (input.id) {
    run(
      `UPDATE categories SET name = ?, slug = ?, description = ?, color = ?, icon = ?, position = ?
       WHERE id = ?`,
      [input.name, slug, input.description ?? null, input.color ?? null, input.icon ?? null, input.position ?? 0, input.id],
    );
    return input.id;
  }
  const result = run(
    `INSERT INTO categories (slug, name, kind, description, color, icon, position)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(kind, slug) DO UPDATE SET name = excluded.name`,
    [slug, input.name, input.kind, input.description ?? null, input.color ?? null, input.icon ?? null, input.position ?? 0],
  );
  const id = Number(result.lastInsertRowid);
  if (id > 0) return id;
  return one<{ id: number }>('SELECT id FROM categories WHERE kind = ? AND slug = ?', [input.kind, slug])?.id ?? 0;
}

export function deleteCategory(id: number): void {
  run('DELETE FROM categories WHERE id = ?', [id]);
}

export function listTags(): TagRow[] {
  return all<TagRow>('SELECT * FROM tags ORDER BY name');
}

/** Resolves names to tag ids, creating any that don't exist yet. */
export function ensureTags(names: string[]): number[] {
  const cleaned = unique(names.map((n) => n.trim()).filter(Boolean));
  if (cleaned.length === 0) return [];
  return transaction(() => {
    const ids: number[] = [];
    for (const name of cleaned) {
      const slug = slugify(name);
      if (!slug) continue;
      run('INSERT OR IGNORE INTO tags (slug, name) VALUES (?, ?)', [slug, name]);
      const row = one<{ id: number }>('SELECT id FROM tags WHERE slug = ?', [slug]);
      if (row) ids.push(row.id);
    }
    return ids;
  });
}

export function setEntityTags(entityType: string, entityId: number, names: string[]): void {
  const ids = ensureTags(names);
  transaction(() => {
    run('DELETE FROM taggables WHERE entity_type = ? AND entity_id = ?', [entityType, entityId]);
    for (const tagId of ids) {
      run('INSERT OR IGNORE INTO taggables (tag_id, entity_type, entity_id) VALUES (?, ?, ?)', [tagId, entityType, entityId]);
    }
  });
}

export function entityTags(entityType: string, entityId: number): TagRow[] {
  return all<TagRow>(
    `SELECT t.* FROM tags t
     JOIN taggables tg ON tg.tag_id = t.id
     WHERE tg.entity_type = ? AND tg.entity_id = ? ORDER BY t.name`,
    [entityType, entityId],
  );
}

export function listTechnologies(featuredOnly = false): TechnologyRow[] {
  return featuredOnly
    ? all<TechnologyRow>('SELECT * FROM technologies WHERE is_featured = 1 ORDER BY position, name')
    : all<TechnologyRow>('SELECT * FROM technologies ORDER BY position, name');
}

export function upsertTechnology(input: {
  id?: number; name: string; category?: string | null; icon?: string | null;
  color?: string | null; position?: number; isFeatured?: boolean;
}): number {
  const slug = slugify(input.name);
  if (input.id) {
    run(
      `UPDATE technologies SET name = ?, slug = ?, category = ?, icon = ?, color = ?, position = ?, is_featured = ?
       WHERE id = ?`,
      [input.name, slug, input.category ?? null, input.icon ?? null, input.color ?? null, input.position ?? 0, input.isFeatured ? 1 : 0, input.id],
    );
    return input.id;
  }
  run(
    `INSERT INTO technologies (slug, name, category, icon, color, position, is_featured)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET
       name = excluded.name, category = excluded.category, icon = excluded.icon,
       color = excluded.color, position = excluded.position, is_featured = excluded.is_featured`,
    [slug, input.name, input.category ?? null, input.icon ?? null, input.color ?? null, input.position ?? 0, input.isFeatured ? 1 : 0],
  );
  return one<{ id: number }>('SELECT id FROM technologies WHERE slug = ?', [slug])?.id ?? 0;
}

export function deleteTechnology(id: number): void {
  run('DELETE FROM technologies WHERE id = ?', [id]);
}

// ── Services ─────────────────────────────────────────────────────────────

export const SERVICE_FAMILIES: { key: ServiceFamily; label: string; description: string; icon: string }[] = [
  { key: 'web', label: 'Développement web', description: 'Sites, applications, dashboards et plateformes SaaS.', icon: 'code' },
  { key: 'it', label: 'Informatique', description: 'Réseaux, serveurs, systèmes, cybersécurité et vidéosurveillance.', icon: 'server' },
  { key: 'marketing', label: 'Marketing digital', description: 'Stratégie, réseaux sociaux, publicité, SEO et contenu.', icon: 'megaphone' },
  { key: 'audiovisual', label: 'Création audiovisuelle', description: 'Photographie, vidéographie, drone, montage et publicité.', icon: 'camera' },
  { key: 'ai', label: 'IA & Automatisation', description: 'Chatbots, agents IA, CRM et automatisations métier.', icon: 'sparkles' },
];

export function familyLabel(family: string): string {
  return SERVICE_FAMILIES.find((f) => f.key === family)?.label ?? family;
}

export type Service = ServiceRow & { bullets: string[]; deliverableList: string[] };

function hydrateService(row: ServiceRow): Service {
  return {
    ...row,
    bullets: safeJson<string[]>(row.bullet_points, []),
    deliverableList: safeJson<string[]>(row.deliverables, []),
  };
}

const SERVICE_TRANSLATED = ['name', 'short_description', 'description', 'price_note', 'duration_note'] as const;

export function listServices(
  options: { publishedOnly?: boolean; family?: ServiceFamily; locale?: Locale; featuredOnly?: boolean } = {},
): Service[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (options.publishedOnly) where.push('is_published = 1');
  if (options.featuredOnly) where.push('is_featured = 1');
  if (options.family) { where.push('family = ?'); params.push(options.family); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  let rows = all<ServiceRow>(`SELECT * FROM services ${clause} ORDER BY position, name`, params);
  if (options.locale) rows = localiseRows(rows, 'service', options.locale, [...SERVICE_TRANSLATED]);
  return rows.map(hydrateService);
}

export function findService(id: number, locale?: Locale): Service | null {
  let row = one<ServiceRow>('SELECT * FROM services WHERE id = ?', [id]);
  if (!row) return null;
  if (locale) row = localiseRow(row, 'service', locale, [...SERVICE_TRANSLATED]);
  return hydrateService(row);
}

export function findServiceBySlug(slug: string, locale?: Locale): Service | null {
  let row = one<ServiceRow>('SELECT * FROM services WHERE slug = ?', [slug]);
  if (!row) return null;
  if (locale) row = localiseRow(row, 'service', locale, [...SERVICE_TRANSLATED]);
  return hydrateService(row);
}

/** Services grouped by family — the shape the /services page renders. */
export function servicesByFamily(locale?: Locale): { family: ServiceFamily; label: string; description: string; icon: string; services: Service[] }[] {
  const services = listServices({ publishedOnly: true, locale });
  return SERVICE_FAMILIES.map(({ key, label, description, icon }) => ({
    family: key,
    label,
    description,
    icon,
    services: services.filter((s) => s.family === key),
  })).filter((group) => group.services.length > 0);
}

export type ServiceInput = {
  name: string;
  slug?: string;
  family?: ServiceFamily;
  category_id?: number | null;
  short_description?: string | null;
  description?: string | null;
  icon?: string | null;
  bullets?: string[];
  deliverables?: string[];
  starting_price?: number | null;
  currency?: string;
  price_note?: string | null;
  duration_note?: string | null;
  position?: number;
  is_published?: boolean;
  is_featured?: boolean;
  seo_title?: string | null;
  seo_description?: string | null;
};

function uniqueSlugFor(table: string, base: string, excludeId?: number): string {
  const root = slugify(base) || 'item';
  let candidate = root;
  let n = 2;
  const exists = (value: string) =>
    scalar<number>(
      `SELECT COUNT(*) AS c FROM ${table} WHERE slug = ?${excludeId ? ' AND id != ?' : ''}`,
      excludeId ? [value, excludeId] : [value],
      0,
    ) > 0;
  while (exists(candidate)) {
    candidate = `${root}-${n}`;
    n += 1;
  }
  return candidate;
}

export function createService(input: ServiceInput): number {
  const slug = uniqueSlugFor('services', input.slug ?? input.name);
  const result = run(
    `INSERT INTO services
      (slug, name, category_id, family, short_description, description, icon,
       bullet_points, deliverables, starting_price, currency, price_note, duration_note,
       position, is_published, is_featured, seo_title, seo_description)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      slug, input.name, input.category_id ?? null, input.family ?? 'web',
      input.short_description ?? null, input.description ?? null, input.icon ?? null,
      toJson(input.bullets ?? []), toJson(input.deliverables ?? []),
      input.starting_price ?? null, input.currency ?? 'DZD', input.price_note ?? null,
      input.duration_note ?? null, input.position ?? 0,
      input.is_published === false ? 0 : 1, input.is_featured ? 1 : 0,
      input.seo_title ?? null, input.seo_description ?? null,
    ],
  );
  const id = Number(result.lastInsertRowid);
  reindexService(id);
  return id;
}

export function updateService(id: number, patch: Partial<ServiceInput>): void {
  const map: Record<string, unknown> = {
    name: patch.name, category_id: patch.category_id, family: patch.family,
    short_description: patch.short_description, description: patch.description,
    icon: patch.icon, starting_price: patch.starting_price, currency: patch.currency,
    price_note: patch.price_note, duration_note: patch.duration_note, position: patch.position,
    seo_title: patch.seo_title, seo_description: patch.seo_description,
  };
  if (patch.slug !== undefined) map.slug = uniqueSlugFor('services', patch.slug, id);
  if (patch.bullets !== undefined) map.bullet_points = toJson(patch.bullets);
  if (patch.deliverables !== undefined) map.deliverables = toJson(patch.deliverables);
  if (patch.is_published !== undefined) map.is_published = patch.is_published ? 1 : 0;
  if (patch.is_featured !== undefined) map.is_featured = patch.is_featured ? 1 : 0;

  const fields: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(map)) {
    if (value === undefined) continue;
    fields.push(`${key} = ?`);
    params.push(value);
  }
  if (fields.length === 0) return;
  params.push(id);
  run(`UPDATE services SET ${fields.join(', ')}, updated_at = datetime('now') WHERE id = ?`, params);
  reindexService(id);
}

export function deleteService(id: number): void {
  run('DELETE FROM services WHERE id = ?', [id]);
  deleteTranslations('service', id);
  removeFromIndex('service', id);
}

function reindexService(id: number): void {
  const service = findService(id);
  if (!service) return;
  indexEntity({
    type: 'service', id, title: service.name,
    subtitle: familyLabel(service.family), body: service.short_description ?? service.description,
    url: `/espace-admin/services/${id}`,
  });
}

export function serviceOptions(): { id: number; label: string; price: number | null }[] {
  return all<{ id: number; name: string; starting_price: number | null }>(
    'SELECT id, name, starting_price FROM services WHERE is_published = 1 ORDER BY position, name',
  ).map((r) => ({ id: r.id, label: r.name, price: r.starting_price }));
}

// ── Portfolio ────────────────────────────────────────────────────────────

export type PortfolioProject = PortfolioProjectRow & {
  technologyList: string[];
  serviceList: string[];
  linkList: { label: string; url: string }[];
  videoList: { title: string; url: string; provider?: string }[];
  metricList: { label: string; value: string; note?: string }[];
  category_name: string | null;
};

const PORTFOLIO_TRANSLATED = [
  'title', 'subtitle', 'summary', 'description', 'challenge',
  'objectives', 'solution', 'results', 'seo_title', 'seo_description',
] as const;

function hydratePortfolio(row: PortfolioProjectRow & { category_name?: string | null }): PortfolioProject {
  return {
    ...row,
    category_name: row.category_name ?? null,
    technologyList: safeJson<string[]>(row.technologies, []),
    serviceList: safeJson<string[]>(row.services_done, []),
    linkList: safeJson<{ label: string; url: string }[]>(row.links, []),
    videoList: safeJson<{ title: string; url: string; provider?: string }[]>(row.videos, []),
    metricList: safeJson<{ label: string; value: string; note?: string }[]>(row.metrics, []),
  };
}

export type PortfolioFilter = {
  status?: PublishStatus | 'all';
  categoryId?: number;
  technology?: string;
  year?: number;
  search?: string;
  featuredOnly?: boolean;
  locale?: Locale;
  limit?: number;
  offset?: number;
};

export function listPortfolio(filter: PortfolioFilter = {}): PortfolioProject[] {
  const where: string[] = [];
  const params: unknown[] = [];

  if (filter.status && filter.status !== 'all') { where.push('pp.status = ?'); params.push(filter.status); }
  if (filter.categoryId) { where.push('pp.category_id = ?'); params.push(filter.categoryId); }
  if (filter.year) { where.push('pp.year = ?'); params.push(filter.year); }
  if (filter.featuredOnly) where.push('pp.is_featured = 1');
  // technologies is a JSON array in TEXT; a LIKE on the quoted value is exact
  // enough here and avoids a join table for what is display-only metadata.
  if (filter.technology) { where.push('pp.technologies LIKE ?'); params.push(`%"${filter.technology}"%`); }
  if (filter.search) {
    where.push('(pp.title LIKE ? OR pp.summary LIKE ? OR pp.description LIKE ? OR pp.client_name LIKE ? OR pp.technologies LIKE ?)');
    const like = `%${filter.search}%`;
    params.push(like, like, like, like, like);
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  params.push(filter.limit ?? 100, filter.offset ?? 0);

  let rows = all<PortfolioProjectRow & { category_name: string | null }>(
    `SELECT pp.*, cat.name AS category_name
     FROM portfolio_projects pp
     LEFT JOIN categories cat ON cat.id = pp.category_id
     ${clause}
     ORDER BY pp.is_featured DESC, pp.position, pp.year DESC, pp.id DESC
     LIMIT ? OFFSET ?`,
    params,
  );
  if (filter.locale) rows = localiseRows(rows, 'portfolio', filter.locale, [...PORTFOLIO_TRANSLATED]);
  return rows.map(hydratePortfolio);
}

export function countPortfolio(filter: PortfolioFilter = {}): number {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.status && filter.status !== 'all') { where.push('status = ?'); params.push(filter.status); }
  if (filter.categoryId) { where.push('category_id = ?'); params.push(filter.categoryId); }
  if (filter.year) { where.push('year = ?'); params.push(filter.year); }
  if (filter.technology) { where.push('technologies LIKE ?'); params.push(`%"${filter.technology}"%`); }
  if (filter.search) {
    where.push('(title LIKE ? OR summary LIKE ? OR description LIKE ?)');
    const like = `%${filter.search}%`;
    params.push(like, like, like);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return scalar<number>(`SELECT COUNT(*) AS c FROM portfolio_projects ${clause}`, params, 0);
}

export function findPortfolio(id: number, locale?: Locale): PortfolioProject | null {
  let row = one<PortfolioProjectRow & { category_name: string | null }>(
    `SELECT pp.*, cat.name AS category_name FROM portfolio_projects pp
     LEFT JOIN categories cat ON cat.id = pp.category_id WHERE pp.id = ?`,
    [id],
  );
  if (!row) return null;
  if (locale) row = localiseRow(row, 'portfolio', locale, [...PORTFOLIO_TRANSLATED]);
  return hydratePortfolio(row);
}

export function findPortfolioBySlug(slug: string, locale?: Locale): PortfolioProject | null {
  let row = one<PortfolioProjectRow & { category_name: string | null }>(
    `SELECT pp.*, cat.name AS category_name FROM portfolio_projects pp
     LEFT JOIN categories cat ON cat.id = pp.category_id WHERE pp.slug = ?`,
    [slug],
  );
  if (!row) return null;
  if (locale) row = localiseRow(row, 'portfolio', locale, [...PORTFOLIO_TRANSLATED]);
  return hydratePortfolio(row);
}

export type PortfolioInput = {
  title: string;
  slug?: string;
  subtitle?: string | null;
  project_id?: number | null;
  client_name?: string | null;
  client_id?: number | null;
  category_id?: number | null;
  summary?: string | null;
  description?: string | null;
  challenge?: string | null;
  objectives?: string | null;
  solution?: string | null;
  results?: string | null;
  testimonial_quote?: string | null;
  testimonial_author?: string | null;
  testimonial_role?: string | null;
  cover_url?: string | null;
  project_date?: string | null;
  year?: number | null;
  status?: PublishStatus;
  technologies?: string[];
  services_done?: string[];
  links?: { label: string; url: string }[];
  videos?: { title: string; url: string; provider?: string }[];
  metrics?: { label: string; value: string; note?: string }[];
  position?: number;
  is_featured?: boolean;
  is_demo?: boolean;
  seo_title?: string | null;
  seo_description?: string | null;
};

export function createPortfolio(input: PortfolioInput): number {
  const slug = uniqueSlugFor('portfolio_projects', input.slug ?? input.title);
  const result = run(
    `INSERT INTO portfolio_projects
      (slug, title, subtitle, project_id, client_name, client_id, category_id, summary,
       description, challenge, objectives, solution, results, testimonial_quote,
       testimonial_author, testimonial_role, cover_url, project_date, year, status,
       technologies, services_done, links, videos, metrics, position, is_featured, is_demo,
       seo_title, seo_description, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      slug, input.title, input.subtitle ?? null, input.project_id ?? null,
      input.client_name ?? null, input.client_id ?? null, input.category_id ?? null,
      input.summary ?? null, input.description ?? null, input.challenge ?? null,
      input.objectives ?? null, input.solution ?? null, input.results ?? null,
      input.testimonial_quote ?? null, input.testimonial_author ?? null,
      input.testimonial_role ?? null, input.cover_url ?? null, input.project_date ?? null,
      input.year ?? (input.project_date ? new Date(input.project_date).getFullYear() : null),
      input.status ?? 'draft', toJson(input.technologies ?? []), toJson(input.services_done ?? []),
      toJson(input.links ?? []), toJson(input.videos ?? []), toJson(input.metrics ?? []),
      input.position ?? 0, input.is_featured ? 1 : 0, input.is_demo ? 1 : 0,
      input.seo_title ?? null, input.seo_description ?? null,
      input.status === 'published' ? new Date().toISOString() : null,
    ],
  );
  const id = Number(result.lastInsertRowid);
  reindexPortfolio(id);
  return id;
}

export function updatePortfolio(id: number, patch: Partial<PortfolioInput>): void {
  const map: Record<string, unknown> = {
    title: patch.title, subtitle: patch.subtitle, project_id: patch.project_id,
    client_name: patch.client_name, client_id: patch.client_id, category_id: patch.category_id,
    summary: patch.summary, description: patch.description, challenge: patch.challenge,
    objectives: patch.objectives, solution: patch.solution, results: patch.results,
    testimonial_quote: patch.testimonial_quote, testimonial_author: patch.testimonial_author,
    testimonial_role: patch.testimonial_role, cover_url: patch.cover_url,
    project_date: patch.project_date, year: patch.year, status: patch.status,
    position: patch.position, seo_title: patch.seo_title, seo_description: patch.seo_description,
  };
  if (patch.slug !== undefined) map.slug = uniqueSlugFor('portfolio_projects', patch.slug, id);
  if (patch.technologies !== undefined) map.technologies = toJson(patch.technologies);
  if (patch.services_done !== undefined) map.services_done = toJson(patch.services_done);
  if (patch.links !== undefined) map.links = toJson(patch.links);
  if (patch.videos !== undefined) map.videos = toJson(patch.videos);
  if (patch.metrics !== undefined) map.metrics = toJson(patch.metrics);
  if (patch.is_featured !== undefined) map.is_featured = patch.is_featured ? 1 : 0;

  const fields: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(map)) {
    if (value === undefined) continue;
    fields.push(`${key} = ?`);
    params.push(value);
  }
  if (patch.status === 'published') fields.push(`published_at = COALESCE(published_at, datetime('now'))`);
  if (fields.length === 0) return;
  params.push(id);
  run(`UPDATE portfolio_projects SET ${fields.join(', ')}, updated_at = datetime('now') WHERE id = ?`, params);
  reindexPortfolio(id);
}

export function deletePortfolio(id: number): void {
  run('DELETE FROM portfolio_projects WHERE id = ?', [id]);
  deleteTranslations('portfolio', id);
  removeFromIndex('portfolio', id);
}

export function incrementPortfolioViews(id: number): void {
  run('UPDATE portfolio_projects SET view_count = view_count + 1 WHERE id = ?', [id]);
}

function reindexPortfolio(id: number): void {
  const project = findPortfolio(id);
  if (!project) return;
  indexEntity({
    type: 'portfolio', id, title: project.title,
    subtitle: [project.client_name, project.year ? String(project.year) : null].filter(Boolean).join(' · '),
    body: [project.summary, project.description].filter(Boolean).join(' '),
    url: `/espace-admin/portfolio/${id}`,
  });
}

export function listPortfolioMedia(portfolioId: number): PortfolioMediaRow[] {
  return all<PortfolioMediaRow>(
    'SELECT * FROM portfolio_media WHERE portfolio_id = ? ORDER BY position, id',
    [portfolioId],
  );
}

export function addPortfolioMedia(input: {
  portfolioId: number; fileId?: number | null; url?: string | null;
  kind?: PortfolioMediaRow['kind']; caption?: string | null; altText?: string | null; position?: number;
}): number {
  const position = input.position ?? scalar<number>(
    'SELECT COALESCE(MAX(position), -1) + 1 AS p FROM portfolio_media WHERE portfolio_id = ?',
    [input.portfolioId], 0,
  );
  const result = run(
    `INSERT INTO portfolio_media (portfolio_id, file_id, url, kind, caption, alt_text, position)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [input.portfolioId, input.fileId ?? null, input.url ?? null, input.kind ?? 'image', input.caption ?? null, input.altText ?? null, position],
  );
  return Number(result.lastInsertRowid);
}

export function deletePortfolioMedia(id: number): void {
  run('DELETE FROM portfolio_media WHERE id = ?', [id]);
}

/** Filter facets for the public /projets page. */
export function portfolioFacets(): { years: number[]; technologies: string[]; categories: CategoryRow[] } {
  const years = all<{ year: number }>(
    "SELECT DISTINCT year FROM portfolio_projects WHERE status = 'published' AND year IS NOT NULL ORDER BY year DESC",
  ).map((r) => r.year);

  const techRows = all<{ technologies: string | null }>(
    "SELECT technologies FROM portfolio_projects WHERE status = 'published'",
  );
  const technologies = unique(
    techRows.flatMap((r) => safeJson<string[]>(r.technologies, [])),
  ).sort((a, b) => a.localeCompare(b, 'fr'));

  const categories = all<CategoryRow>(
    `SELECT DISTINCT cat.* FROM categories cat
     JOIN portfolio_projects pp ON pp.category_id = cat.id
     WHERE pp.status = 'published' ORDER BY cat.position, cat.name`,
  );

  return { years, technologies, categories };
}

/** Previous/next navigation within the published portfolio. */
export function portfolioNeighbours(id: number, locale?: Locale): { previous: PortfolioProject | null; next: PortfolioProject | null } {
  const published = listPortfolio({ status: 'published', locale, limit: 500 });
  const index = published.findIndex((p) => p.id === id);
  if (index === -1) return { previous: null, next: null };
  return {
    previous: index > 0 ? published[index - 1] ?? null : null,
    next: index < published.length - 1 ? published[index + 1] ?? null : null,
  };
}

// ── Case studies ─────────────────────────────────────────────────────────

export type CaseStudy = CaseStudyRow & { metricList: { label: string; value: string; note?: string }[] };

const CASE_TRANSLATED = [
  'title', 'subtitle', 'problem', 'objectives', 'strategy', 'solution',
  'development', 'tools_used', 'result', 'seo_title', 'seo_description',
] as const;

function hydrateCase(row: CaseStudyRow): CaseStudy {
  return { ...row, metricList: safeJson<{ label: string; value: string; note?: string }[]>(row.metrics, []) };
}

export function listCaseStudies(options: { status?: PublishStatus | 'all'; locale?: Locale; limit?: number } = {}): CaseStudy[] {
  const where = options.status && options.status !== 'all' ? 'WHERE status = ?' : '';
  const params: unknown[] = options.status && options.status !== 'all' ? [options.status] : [];
  params.push(options.limit ?? 100);
  let rows = all<CaseStudyRow>(
    `SELECT * FROM case_studies ${where} ORDER BY position, published_at DESC, id DESC LIMIT ?`,
    params,
  );
  if (options.locale) rows = localiseRows(rows, 'case_study', options.locale, [...CASE_TRANSLATED]);
  return rows.map(hydrateCase);
}

export function findCaseStudy(id: number, locale?: Locale): CaseStudy | null {
  let row = one<CaseStudyRow>('SELECT * FROM case_studies WHERE id = ?', [id]);
  if (!row) return null;
  if (locale) row = localiseRow(row, 'case_study', locale, [...CASE_TRANSLATED]);
  return hydrateCase(row);
}

export function findCaseStudyBySlug(slug: string, locale?: Locale): CaseStudy | null {
  let row = one<CaseStudyRow>('SELECT * FROM case_studies WHERE slug = ?', [slug]);
  if (!row) return null;
  if (locale) row = localiseRow(row, 'case_study', locale, [...CASE_TRANSLATED]);
  return hydrateCase(row);
}

export type CaseStudyInput = {
  title: string;
  slug?: string;
  portfolio_id?: number | null;
  subtitle?: string | null;
  problem?: string | null;
  objectives?: string | null;
  strategy?: string | null;
  solution?: string | null;
  development?: string | null;
  tools_used?: string | null;
  result?: string | null;
  metrics?: { label: string; value: string; note?: string }[];
  testimonial_quote?: string | null;
  testimonial_author?: string | null;
  cover_url?: string | null;
  status?: PublishStatus;
  position?: number;
  is_demo?: boolean;
  seo_title?: string | null;
  seo_description?: string | null;
};

export function createCaseStudy(input: CaseStudyInput): number {
  const slug = uniqueSlugFor('case_studies', input.slug ?? input.title);
  const prose = [input.problem, input.strategy, input.solution, input.development, input.result].filter(Boolean).join(' ');
  const result = run(
    `INSERT INTO case_studies
      (slug, portfolio_id, title, subtitle, problem, objectives, strategy, solution,
       development, tools_used, result, metrics, testimonial_quote, testimonial_author,
       cover_url, status, reading_minutes, position, is_demo, seo_title, seo_description, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      slug, input.portfolio_id ?? null, input.title, input.subtitle ?? null,
      input.problem ?? null, input.objectives ?? null, input.strategy ?? null,
      input.solution ?? null, input.development ?? null, input.tools_used ?? null,
      input.result ?? null, toJson(input.metrics ?? []), input.testimonial_quote ?? null,
      input.testimonial_author ?? null, input.cover_url ?? null, input.status ?? 'draft',
      readingTime(prose), input.position ?? 0, input.is_demo ? 1 : 0,
      input.seo_title ?? null, input.seo_description ?? null,
      input.status === 'published' ? new Date().toISOString() : null,
    ],
  );
  const id = Number(result.lastInsertRowid);
  reindexCaseStudy(id);
  return id;
}

export function updateCaseStudy(id: number, patch: Partial<CaseStudyInput>): void {
  const map: Record<string, unknown> = {
    title: patch.title, portfolio_id: patch.portfolio_id, subtitle: patch.subtitle,
    problem: patch.problem, objectives: patch.objectives, strategy: patch.strategy,
    solution: patch.solution, development: patch.development, tools_used: patch.tools_used,
    result: patch.result, testimonial_quote: patch.testimonial_quote,
    testimonial_author: patch.testimonial_author, cover_url: patch.cover_url,
    status: patch.status, position: patch.position,
    seo_title: patch.seo_title, seo_description: patch.seo_description,
  };
  if (patch.slug !== undefined) map.slug = uniqueSlugFor('case_studies', patch.slug, id);
  if (patch.metrics !== undefined) map.metrics = toJson(patch.metrics);

  const fields: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(map)) {
    if (value === undefined) continue;
    fields.push(`${key} = ?`);
    params.push(value);
  }
  if (patch.status === 'published') fields.push(`published_at = COALESCE(published_at, datetime('now'))`);
  if (fields.length === 0) return;
  params.push(id);
  run(`UPDATE case_studies SET ${fields.join(', ')}, updated_at = datetime('now') WHERE id = ?`, params);
  reindexCaseStudy(id);
}

export function deleteCaseStudy(id: number): void {
  run('DELETE FROM case_studies WHERE id = ?', [id]);
  deleteTranslations('case_study', id);
  removeFromIndex('case_study', id);
}

function reindexCaseStudy(id: number): void {
  const study = findCaseStudy(id);
  if (!study) return;
  indexEntity({
    type: 'case_study', id, title: study.title, subtitle: study.subtitle,
    body: [study.problem, study.solution, study.result].filter(Boolean).join(' '),
    url: `/espace-admin/etudes-de-cas/${id}`,
  });
}

// ── Blog ─────────────────────────────────────────────────────────────────

export type BlogPost = BlogPostRow & { category_name: string | null; tags: TagRow[] };

const POST_TRANSLATED = ['title', 'excerpt', 'content', 'seo_title', 'seo_description'] as const;

export type BlogFilter = {
  status?: PublishStatus | 'all';
  categoryId?: number;
  tag?: string;
  search?: string;
  featuredOnly?: boolean;
  locale?: Locale;
  limit?: number;
  offset?: number;
};

export function listPosts(filter: BlogFilter = {}): BlogPost[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.status && filter.status !== 'all') { where.push('bp.status = ?'); params.push(filter.status); }
  if (filter.categoryId) { where.push('bp.category_id = ?'); params.push(filter.categoryId); }
  if (filter.featuredOnly) where.push('bp.is_featured = 1');
  if (filter.tag) {
    where.push(`bp.id IN (
      SELECT tg.entity_id FROM taggables tg JOIN tags t ON t.id = tg.tag_id
      WHERE tg.entity_type = 'post' AND t.slug = ?)`);
    params.push(slugify(filter.tag));
  }
  if (filter.search) {
    where.push('(bp.title LIKE ? OR bp.excerpt LIKE ? OR bp.content LIKE ?)');
    const like = `%${filter.search}%`;
    params.push(like, like, like);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  params.push(filter.limit ?? 50, filter.offset ?? 0);

  let rows = all<BlogPostRow & { category_name: string | null }>(
    `SELECT bp.*, cat.name AS category_name FROM blog_posts bp
     LEFT JOIN categories cat ON cat.id = bp.category_id
     ${clause} ORDER BY bp.is_featured DESC, COALESCE(bp.published_at, bp.created_at) DESC LIMIT ? OFFSET ?`,
    params,
  );
  if (filter.locale) rows = localiseRows(rows, 'post', filter.locale, [...POST_TRANSLATED]);
  return rows.map((row) => ({ ...row, tags: entityTags('post', row.id) }));
}

export function countPosts(filter: BlogFilter = {}): number {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.status && filter.status !== 'all') { where.push('status = ?'); params.push(filter.status); }
  if (filter.categoryId) { where.push('category_id = ?'); params.push(filter.categoryId); }
  if (filter.search) {
    where.push('(title LIKE ? OR excerpt LIKE ? OR content LIKE ?)');
    const like = `%${filter.search}%`;
    params.push(like, like, like);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return scalar<number>(`SELECT COUNT(*) AS c FROM blog_posts ${clause}`, params, 0);
}

export function findPost(id: number, locale?: Locale): BlogPost | null {
  let row = one<BlogPostRow & { category_name: string | null }>(
    `SELECT bp.*, cat.name AS category_name FROM blog_posts bp
     LEFT JOIN categories cat ON cat.id = bp.category_id WHERE bp.id = ?`,
    [id],
  );
  if (!row) return null;
  if (locale) row = localiseRow(row, 'post', locale, [...POST_TRANSLATED]);
  return { ...row, tags: entityTags('post', row.id) };
}

export function findPostBySlug(slug: string, locale?: Locale): BlogPost | null {
  let row = one<BlogPostRow & { category_name: string | null }>(
    `SELECT bp.*, cat.name AS category_name FROM blog_posts bp
     LEFT JOIN categories cat ON cat.id = bp.category_id WHERE bp.slug = ?`,
    [slug],
  );
  if (!row) return null;
  if (locale) row = localiseRow(row, 'post', locale, [...POST_TRANSLATED]);
  return { ...row, tags: entityTags('post', row.id) };
}

export type PostInput = {
  title: string;
  slug?: string;
  excerpt?: string | null;
  content?: string | null;
  cover_url?: string | null;
  author_id?: number | null;
  author_name?: string | null;
  category_id?: number | null;
  status?: PublishStatus;
  locale?: string;
  seo_title?: string | null;
  seo_description?: string | null;
  is_featured?: boolean;
  is_demo?: boolean;
  tags?: string[];
  published_at?: string | null;
};

export function createPost(input: PostInput): number {
  const slug = uniqueSlugFor('blog_posts', input.slug ?? input.title);
  const result = run(
    `INSERT INTO blog_posts
      (slug, title, excerpt, content, cover_url, author_id, author_name, category_id,
       status, locale, seo_title, seo_description, reading_minutes, is_featured, is_demo, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      slug, input.title, input.excerpt ?? null, input.content ?? null, input.cover_url ?? null,
      input.author_id ?? null, input.author_name ?? null, input.category_id ?? null,
      input.status ?? 'draft', input.locale ?? 'fr', input.seo_title ?? null,
      input.seo_description ?? null, readingTime(input.content), input.is_featured ? 1 : 0,
      input.is_demo ? 1 : 0,
      input.published_at ?? (input.status === 'published' ? new Date().toISOString() : null),
    ],
  );
  const id = Number(result.lastInsertRowid);
  if (input.tags) setEntityTags('post', id, input.tags);
  reindexPost(id);
  return id;
}

export function updatePost(id: number, patch: Partial<PostInput>): void {
  const map: Record<string, unknown> = {
    title: patch.title, excerpt: patch.excerpt, content: patch.content,
    cover_url: patch.cover_url, author_id: patch.author_id, author_name: patch.author_name,
    category_id: patch.category_id, status: patch.status, locale: patch.locale,
    seo_title: patch.seo_title, seo_description: patch.seo_description,
    published_at: patch.published_at,
  };
  if (patch.slug !== undefined) map.slug = uniqueSlugFor('blog_posts', patch.slug, id);
  if (patch.content !== undefined) map.reading_minutes = readingTime(patch.content);
  if (patch.is_featured !== undefined) map.is_featured = patch.is_featured ? 1 : 0;

  const fields: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(map)) {
    if (value === undefined) continue;
    fields.push(`${key} = ?`);
    params.push(value);
  }
  if (patch.status === 'published' && patch.published_at === undefined) {
    fields.push(`published_at = COALESCE(published_at, datetime('now'))`);
  }
  if (fields.length > 0) {
    params.push(id);
    run(`UPDATE blog_posts SET ${fields.join(', ')}, updated_at = datetime('now') WHERE id = ?`, params);
  }
  if (patch.tags) setEntityTags('post', id, patch.tags);
  reindexPost(id);
}

export function deletePost(id: number): void {
  run('DELETE FROM blog_posts WHERE id = ?', [id]);
  run("DELETE FROM taggables WHERE entity_type = 'post' AND entity_id = ?", [id]);
  deleteTranslations('post', id);
  removeFromIndex('post', id);
}

export function incrementPostViews(id: number): void {
  run('UPDATE blog_posts SET view_count = view_count + 1 WHERE id = ?', [id]);
}

function reindexPost(id: number): void {
  const post = findPost(id);
  if (!post) return;
  indexEntity({
    type: 'post', id, title: post.title, subtitle: post.category_name,
    body: post.excerpt ?? post.content, url: `/espace-admin/blog/${id}`,
  });
}

/** Posts sharing a category or tag, excluding the current one. */
export function relatedPosts(post: BlogPost, limit = 3): BlogPost[] {
  const tagSlugs = post.tags.map((t) => t.slug);
  if (tagSlugs.length === 0 && !post.category_id) return [];
  const rows = all<BlogPostRow & { category_name: string | null }>(
    `SELECT DISTINCT bp.*, cat.name AS category_name FROM blog_posts bp
     LEFT JOIN categories cat ON cat.id = bp.category_id
     LEFT JOIN taggables tg ON tg.entity_type = 'post' AND tg.entity_id = bp.id
     LEFT JOIN tags t ON t.id = tg.tag_id
     WHERE bp.status = 'published' AND bp.id != ?
       AND (bp.category_id = ? ${tagSlugs.length ? `OR t.slug IN (${tagSlugs.map(() => '?').join(',')})` : ''})
     ORDER BY bp.published_at DESC LIMIT ?`,
    [post.id, post.category_id ?? -1, ...tagSlugs, limit],
  );
  return rows.map((row) => ({ ...row, tags: entityTags('post', row.id) }));
}

// ── Profile (about page) ─────────────────────────────────────────────────

export function listProfileEntries(kind?: ProfileEntryKind, publishedOnly = true): ProfileEntryRow[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (kind) { where.push('kind = ?'); params.push(kind); }
  if (publishedOnly) where.push('is_published = 1');
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return all<ProfileEntryRow>(
    `SELECT * FROM profile_entries ${clause}
     ORDER BY position, is_current DESC, start_date DESC, id DESC`,
    params,
  );
}

/** Grouped by kind — what the /a-propos page iterates over. */
export function profileByKind(publishedOnly = true): Record<ProfileEntryKind, ProfileEntryRow[]> {
  const rows = listProfileEntries(undefined, publishedOnly);
  const empty: Record<ProfileEntryKind, ProfileEntryRow[]> = {
    experience: [], education: [], certification: [], skill: [], tool: [], interest: [], expertise: [],
  };
  for (const row of rows) (empty[row.kind] ??= []).push(row);
  return empty;
}

export function findProfileEntry(id: number): ProfileEntryRow | null {
  return one<ProfileEntryRow>('SELECT * FROM profile_entries WHERE id = ?', [id]);
}

export type ProfileEntryInput = {
  kind: ProfileEntryKind;
  title: string;
  organisation?: string | null;
  location?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  is_current?: boolean;
  description?: string | null;
  level?: number | null;
  icon?: string | null;
  url?: string | null;
  position?: number;
  is_published?: boolean;
};

export function createProfileEntry(input: ProfileEntryInput): number {
  const result = run(
    `INSERT INTO profile_entries
      (kind, title, organisation, location, start_date, end_date, is_current,
       description, level, icon, url, position, is_published)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.kind, input.title, input.organisation ?? null, input.location ?? null,
      input.start_date ?? null, input.end_date ?? null, input.is_current ? 1 : 0,
      input.description ?? null, input.level ?? null, input.icon ?? null, input.url ?? null,
      input.position ?? 0, input.is_published === false ? 0 : 1,
    ],
  );
  return Number(result.lastInsertRowid);
}

export function updateProfileEntry(id: number, patch: Partial<ProfileEntryInput>): void {
  const map: Record<string, unknown> = {
    kind: patch.kind, title: patch.title, organisation: patch.organisation,
    location: patch.location, start_date: patch.start_date, end_date: patch.end_date,
    description: patch.description, level: patch.level, icon: patch.icon, url: patch.url,
    position: patch.position,
  };
  if (patch.is_current !== undefined) map.is_current = patch.is_current ? 1 : 0;
  if (patch.is_published !== undefined) map.is_published = patch.is_published ? 1 : 0;

  const fields: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(map)) {
    if (value === undefined) continue;
    fields.push(`${key} = ?`);
    params.push(value);
  }
  if (fields.length === 0) return;
  params.push(id);
  run(`UPDATE profile_entries SET ${fields.join(', ')}, updated_at = datetime('now') WHERE id = ?`, params);
}

export function deleteProfileEntry(id: number): void {
  run('DELETE FROM profile_entries WHERE id = ?', [id]);
  deleteTranslations('profile_entry', id);
}

// ── Testimonials & FAQ ───────────────────────────────────────────────────

export function listTestimonials(options: { publishedOnly?: boolean; limit?: number } = {}): TestimonialRow[] {
  const clause = options.publishedOnly ? 'WHERE is_published = 1' : '';
  return all<TestimonialRow>(
    `SELECT * FROM testimonials ${clause} ORDER BY position, id DESC LIMIT ?`,
    [options.limit ?? 50],
  );
}

export function findTestimonial(id: number): TestimonialRow | null {
  return one<TestimonialRow>('SELECT * FROM testimonials WHERE id = ?', [id]);
}

export function upsertTestimonial(input: {
  id?: number; author_name: string; author_role?: string | null; company?: string | null;
  avatar_url?: string | null; quote: string; rating?: number | null;
  client_id?: number | null; project_id?: number | null; locale?: string;
  is_published?: boolean; is_demo?: boolean; position?: number;
}): number {
  if (input.id) {
    run(
      `UPDATE testimonials SET author_name = ?, author_role = ?, company = ?, avatar_url = ?,
         quote = ?, rating = ?, client_id = ?, project_id = ?, locale = ?, is_published = ?, position = ?
       WHERE id = ?`,
      [
        input.author_name, input.author_role ?? null, input.company ?? null, input.avatar_url ?? null,
        input.quote, input.rating ?? null, input.client_id ?? null, input.project_id ?? null,
        input.locale ?? 'fr', input.is_published ? 1 : 0, input.position ?? 0, input.id,
      ],
    );
    return input.id;
  }
  const result = run(
    `INSERT INTO testimonials
      (author_name, author_role, company, avatar_url, quote, rating, client_id, project_id,
       locale, is_published, is_demo, position)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.author_name, input.author_role ?? null, input.company ?? null, input.avatar_url ?? null,
      input.quote, input.rating ?? null, input.client_id ?? null, input.project_id ?? null,
      input.locale ?? 'fr', input.is_published ? 1 : 0, input.is_demo ? 1 : 0, input.position ?? 0,
    ],
  );
  return Number(result.lastInsertRowid);
}

export function deleteTestimonial(id: number): void {
  run('DELETE FROM testimonials WHERE id = ?', [id]);
  deleteTranslations('testimonial', id);
}

export function listFaqs(options: { publishedOnly?: boolean; locale?: Locale } = {}): FaqRow[] {
  const clause = options.publishedOnly ? 'WHERE is_published = 1' : '';
  let rows = all<FaqRow>(`SELECT * FROM faqs ${clause} ORDER BY position, id`);
  if (options.locale) rows = localiseRows(rows, 'faq', options.locale, ['question', 'answer']);
  return rows;
}

export function upsertFaq(input: {
  id?: number; question: string; answer: string; category?: string | null;
  position?: number; is_published?: boolean; locale?: string;
}): number {
  if (input.id) {
    run(
      'UPDATE faqs SET question = ?, answer = ?, category = ?, position = ?, is_published = ? WHERE id = ?',
      [input.question, input.answer, input.category ?? null, input.position ?? 0, input.is_published === false ? 0 : 1, input.id],
    );
    return input.id;
  }
  const result = run(
    'INSERT INTO faqs (question, answer, category, position, is_published, locale) VALUES (?, ?, ?, ?, ?, ?)',
    [input.question, input.answer, input.category ?? null, input.position ?? 0, input.is_published === false ? 0 : 1, input.locale ?? 'fr'],
  );
  return Number(result.lastInsertRowid);
}

export function deleteFaq(id: number): void {
  run('DELETE FROM faqs WHERE id = ?', [id]);
  deleteTranslations('faq', id);
}
