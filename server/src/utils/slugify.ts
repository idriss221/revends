/**
 * Slug kebab-case à partir d'un nom : minuscules, sans accents,
 * non-alphanumériques remplacés par des tirets.
 */
export function slugify(input: string): string {
  const slug = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return slug || 'article';
}