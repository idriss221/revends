/**
 * Largeurs de recette — DA §9.9 + cahier de validation finale.
 *
 * Volontairement **une seule** largeur par projet Playwright : les autres sont
 * obtenues par `page.setViewportSize()` dans les tests. Voir l'explication du
 * budget `/api/auth` dans `playwright.config.ts`.
 *
 * 13 largeurs couvrent les trois familles réellement utilisées :
 * · mobile  320 / 360 / 375 / 390 / 414 / 430 (iPhone SE → Pro Max) ;
 * · tablette 768 / 834 / 1024 (iPad mini portrait → paysage) ;
 * · desktop 1280 / 1440 / 1600 / 1920.
 * L'admin parcourt 5 écrans × 13 largeurs = **65 mesures** de débordement.
 */
export const WIDTHS: { width: number; height: number; label: string }[] = [
  { width: 320, height: 844, label: 'mobile-320' },
  { width: 360, height: 800, label: 'mobile-360' },
  { width: 375, height: 812, label: 'mobile-375' },
  { width: 390, height: 844, label: 'mobile-390' },
  { width: 414, height: 896, label: 'mobile-414' },
  { width: 430, height: 932, label: 'mobile-430' },
  { width: 768, height: 1024, label: 'tablette-768' },
  { width: 834, height: 1112, label: 'tablette-834' },
  { width: 1024, height: 768, label: 'tablette-1024' },
  { width: 1280, height: 800, label: 'desktop-1280' },
  { width: 1440, height: 900, label: 'desktop-1440' },
  { width: 1600, height: 900, label: 'desktop-1600' },
  { width: 1920, height: 1080, label: 'desktop-1920' },
]
