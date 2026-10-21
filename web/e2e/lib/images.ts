import { expect, type Locator } from '@playwright/test'

/**
 * Attend qu'une image soit présente dans le DOM **ET** décodée.
 *
 * Double assertion volontaire :
 *  1. le `<img>` existe — sinon `SiteImage` l'a remplacé par l'illustration
 *     SVG de secours (`art()`), ce qui signifierait « photo perdue » ;
 *  2. `naturalWidth > 0` — l'image est réellement décodée (un `src` correct
 *     qui 404 laisse `naturalWidth = 0`).
 */
export async function loaded(locator: Locator, label: string): Promise<void> {
  await expect(locator, `${label} : <img> absent (SVG de secours affiché ?)`).toHaveCount(1)
  await expect
    .poll(() => locator.evaluate((el) => (el as HTMLImageElement).naturalWidth), {
      message: `${label} : image non décodée (src cassé ?)`,
      timeout: 15_000,
    })
    .toBeGreaterThan(0)
}
