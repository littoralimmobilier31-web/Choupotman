/**
 * URL-safe slug. Handles French accents and strips Arabic diacritics so an
 * Arabic title still produces a usable (if transliteration-free) slug; the
 * admin can always override the slug by hand.
 */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ً-ٰٟ]/g, '')
    .toLowerCase()
    .replace(/['’"]/g, '')
    .replace(/[^a-z0-9؀-ۿ]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

/** Appends -2, -3 … until the slug is free. */
export function uniqueSlug(base: string, exists: (candidate: string) => boolean): string {
  const root = slugify(base) || 'item';
  if (!exists(root)) return root;
  let n = 2;
  while (exists(`${root}-${n}`)) n += 1;
  return `${root}-${n}`;
}
