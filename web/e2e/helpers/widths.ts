/**
 * Largeurs de recette — DA §9.9.
 *
 * Volontairement **une seule** largeur par projet Playwright : les autres sont
 * obtenues par `page.setViewportSize()` dans les tests. Voir l'explication du
 * budget `/api/auth` dans `playwright.config.ts`.
 */
export const WIDTHS: { width: number; height: number; label: string }[] = [
  { width: 1440, height: 900, label: 'desktop' },
  { width: 1280, height: 800, label: 'portable' },
  { width: 1024, height: 768, label: 'petit-portable' },
  { width: 768, height: 1024, label: 'tablette' },
  { width: 390, height: 844, label: 'mobile' },
]
