/**
 * Minimal class-name joiner. Deliberately dependency-free — we never need
 * Tailwind class conflict resolution because components own their base
 * classes and callers only append.
 */
export type ClassValue = string | number | null | false | undefined | ClassValue[];

export function cn(...values: ClassValue[]): string {
  const out: string[] = [];
  const walk = (v: ClassValue) => {
    if (!v && v !== 0) return;
    if (Array.isArray(v)) { v.forEach(walk); return; }
    out.push(String(v));
  };
  values.forEach(walk);
  return out.join(' ');
}
