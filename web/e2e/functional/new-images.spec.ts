import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { expect, test, type Page } from '@playwright/test'
import {
  closeSharedPage,
  csrfHeaders,
  loginAdmin,
  openApp,
  primeCsrf,
  registerSeller,
  sharedPage,
  waitForContent,
} from '../lib/fixtures'
import { findPendingRow } from '../helpers/navigation'
import { BASE } from '../helpers/target'
import { cleanupNewImages, createNewImages } from '../lib/newImages'

/**
 * RECETTE — CYCLE COMPLET D'IMAGES **NEUVES** (pas les photos seedées).
 *
 * Une image uploadée doit rester intacte à chaque étape :
 *   formulaire (preview) → soumission → stockage réel → API → modération →
 *   approbation → fiche produit → catalogue → panier → admin → refresh →
 *   déconnexion/reconnexion → mobile → desktop → thème clair/sombre.
 *
 * Ce que le test prouve, au-delà d'un `naturalWidth > 0` :
 *   · URL finale = `/uploads/products/<uuid>.<ext>` (UUID serveur, jamais le
 *     nom du client) ; aucune URL `blob:` / `file:` / `/tmp/` ne fuit ;
 *   · fichier réellement présent dans le volume, permissions lisibles (644),
 *     taille identique aux octets envoyés (hash SHA-256 pour les formats non
 *     recompressés) ;
 *   · `Content-Type` servi = MIME réel (magic bytes), extension cohérente ;
 *   · aucun `srcset` (il n'existe pas de variantes : un faux srcset casse la
 *     sélection du navigateur) ;
 *   · 4 photos dont un gros JPEG (> 700 Ko) : la compression navigateur
 *     (limite 4,5 Mo des fonctions Vercel) est exercée et vérifiée
 *     (JPEG ≤ 1 Mo, dimensions ≤ 1600 px) ;
 *   · après `reload()` complet et après reconnexion, les MÊMES URLs répondent
 *     et se décodent (pas de blob URL temporaire, pas de cache empoisonné).
 *
 * Les compteurs par étape sont imprimés en fin de test (voir aussi
 * `docs/rapport-final-recette.md`).
 */

const MAX_EDGE_AFTER_COMPRESSION = 1600
const MAX_BYTES_AFTER_COMPRESSION = 1_000_000
const DOCKER_CONTAINER = process.env.E2E_UPLOAD_CONTAINER ?? 'revends_api_e2e'
const DOCKER_UPLOAD_DIR = process.env.E2E_UPLOAD_DIR ?? '/data/uploads/products'
/** Cible distante (Vercel) : le stockage est Blob, pas le volume Docker local. */
const REMOTE = !/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(BASE)

type Stage = { step: string; expected: number; loaded: number; broken: string[] }
const stages: Stage[] = []

interface ApiImage {
  id: number
  url: string
  isPrimary: boolean
  position: number
}

interface UploadedProduct {
  id: number
  name: string
  slug: string
  status?: string
  images: ApiImage[]
}

/** Toutes les `<img>` de la page qui référencent nos fichiers, avec leur état de décodage. */
async function productImageState(
  page: Page,
  needles: string[],
): Promise<{ src: string; naturalWidth: number; naturalHeight: number; srcset: string | null }[]> {
  return page.evaluate((list) => {
    return Array.from(document.images)
      .filter((img) => {
        const src = img.getAttribute('src') ?? ''
        return list.some((needle) => src.includes(needle))
      })
      .map((img) => ({
        src: img.getAttribute('src') ?? '',
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        srcset: img.getAttribute('srcset'),
      }))
  }, needles)
}

/**
 * Vérifie que les images neuves attendues sont présentes ET décodées.
 * `needles` = noms de fichiers UUID (stables quelle que soit l'origine).
 */
async function expectImagesLoaded(
  page: Page,
  step: string,
  needles: string[],
  expected: number,
): Promise<void> {
  await expect
    .poll(
      async () => {
        const state = await productImageState(page, needles)
        return state.filter((s) => s.naturalWidth > 0).length
      },
      { message: `${step} : ${expected} image(s) neuve(s) doivent être décodées`, timeout: 20_000 },
    )
    .toBeGreaterThanOrEqual(expected)

  const state = await productImageState(page, needles)
  const decoded = state.filter((s) => s.naturalWidth > 0)
  const broken = state.filter((s) => s.naturalWidth === 0).map((s) => s.src)
  stages.push({ step, expected, loaded: decoded.length, broken })

  expect(broken, `${step} : image(s) cassée(s)`).toEqual([])
  // Aucun srcset : il n'existe pas de variantes, un faux srcset fait choisir
  // au navigateur une densité inexistante (bug historique naturalWidth = 0).
  expect(
    state.filter((s) => s.srcset !== null).map((s) => s.src),
    `${step} : srcset interdit (aucune variante réelle)`,
  ).toEqual([])
}

/** Toutes les `<img>` de la page réellement cassées (global, pas seulement produit). */
async function brokenImagesOnPage(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.images)
      .filter((img) => img.complete && img.naturalWidth === 0 && (img.getAttribute('src') ?? '') !== '')
      .map((img) => img.getAttribute('src') ?? ''),
  )
}

/** Statut/taille/permissions du fichier dans le volume Docker (preuve de stockage réel). */
function statStoredFile(filename: string): { mode: string; owner: string; size: number } | null {
  try {
    const out = execFileSync(
      'docker',
      ['exec', DOCKER_CONTAINER, 'stat', '-c', '%a %U:%G %s', `${DOCKER_UPLOAD_DIR}/${filename}`],
      { encoding: 'utf8', timeout: 15_000 },
    ).trim()
    const [mode, owner, size] = out.split(' ')
    return { mode: mode!, owner: owner!, size: Number(size) }
  } catch {
    return null
  }
}

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

test.describe('Images neuves — cycle complet (formulaire → stockage → public → panier → admin → refresh)', () => {
  test.setTimeout(300_000)

  test('4 nouvelles images (JPEG, PNG, WebP, gros JPEG) restent intactes à chaque étape', async ({ browser }) => {
    const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    const files = createNewImages(runId)
    expect(files, '4 fichiers neufs générés').toHaveLength(4)
    expect(new Set(files.map((f) => f.mimeType))).toEqual(
      new Set(['image/jpeg', 'image/png', 'image/webp']),
    )
    expect(files.some((f) => f.needsCompression), 'un fichier > 700 Ko doit exercer la compression').toBe(true)

    const seller = await sharedPage(browser)
    const admin = await sharedPage(browser)
    const buyer = await sharedPage(browser)

    try {
      // ─────────────────────────────────────────────────────────────────────
      // 0. Vendeur + acheteur réels (inscriptions API avant chargement)
      // ─────────────────────────────────────────────────────────────────────
      const { email: sellerEmail } = await registerSeller(seller, 'e2e-images-neuves')
      const buyerEmail = `e2e-images-buy-${runId}@test.revends`
      const buyerPassword = 'Acheteur-Recette-42!'
      const reg = await buyer.request.post('/api/auth/register', {
        headers: await primeCsrf(buyer.request),
        data: {
          displayName: 'Acheteur Images Neuves',
          name: 'Acheteur Images Neuves',
          email: buyerEmail,
          phone: `76${String(Math.floor(Math.random() * 100_000_000)).padStart(8, '0')}`,
          password: buyerPassword,
          acceptedCgu: true,
        },
      })
      expect(reg.ok(), `inscription acheteur → ${reg.status()} ${await reg.text()}`).toBe(true)

      await loginAdmin(admin)
      await primeCsrf(seller.request)
      await primeCsrf(admin.request)
      await primeCsrf(buyer.request)

      // ─────────────────────────────────────────────────────────────────────
      // 1. FORMULAIRE — sélection + previews immédiates
      // ─────────────────────────────────────────────────────────────────────
      await openApp(seller, '/sell')
      await seller.locator('#sPhotos').setInputFiles(files.map((f) => f.path))

      const previews = seller.locator('#sellForm .pv img')
      await expect(previews, 'les 4 previews doivent apparaître').toHaveCount(4, { timeout: 60_000 })

      const previewState = await previews.evaluateAll((imgs) =>
        imgs.map((el) => {
          const img = el as HTMLImageElement
          return {
            src: img.getAttribute('src') ?? '',
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
          }
        }),
      )
      expect(previewState.filter((p) => p.src.startsWith('blob:')), 'preview = blob URL locale').toHaveLength(4)
      expect(previewState.filter((p) => p.naturalWidth === 0), 'preview non décodée').toEqual([])

      // Les 3 fichiers légers gardent leurs dimensions ; le gros est recompressé.
      for (let i = 0; i < 3; i++) {
        expect(previewState[i]!.naturalWidth, `preview ${i + 1} largeur`).toBe(files[i]!.width)
        expect(previewState[i]!.naturalHeight, `preview ${i + 1} hauteur`).toBe(files[i]!.height)
      }
      expect(previewState[3]!.naturalWidth).toBeLessThanOrEqual(MAX_EDGE_AFTER_COMPRESSION)
      expect(previewState[3]!.naturalWidth).toBeGreaterThan(0)
      stages.push({ step: '1. Formulaire (preview)', expected: 4, loaded: 4, broken: [] })

      // ─────────────────────────────────────────────────────────────────────
      // 2. SOUMISSION — vrai POST multipart
      // ─────────────────────────────────────────────────────────────────────
      const name = `Article images neuves ${runId}`
      await seller.fill('#sTitle', name)
      await seller.selectOption('#sCat', { label: 'Électronique' })
      await expect
        .poll(async () => seller.locator('#sSubcat option').count(), { timeout: 15_000 })
        .toBeGreaterThan(1)
      await seller.selectOption('#sSubcat', { label: 'Téléphones & tablettes' })
      await seller.selectOption('#sCond', { label: 'Très bon état' })
      await seller.fill('#sDesc', `Article de recette du cycle image complet — ${runId}.`)
      await seller.fill('#sPrice', '25000')
      await seller.fill('#sLoc', 'Dakar Plateau')

      const createResponse = seller.waitForResponse(
        (r) => r.url().endsWith('/api/products') && r.request().method() === 'POST',
        { timeout: 60_000 },
      )
      await seller.getByRole('button', { name: /Publier l['’]article/i }).click()
      const created = await createResponse
      expect(created.status(), `création → ${created.status()} ${await created.text()}`).toBe(201)
      const body = (await created.json()) as { product: UploadedProduct }
      const product = body.product
      expect(product.id).toBeGreaterThan(0)
      expect(product.images, '4 photos enregistrées').toHaveLength(4)
      expect(product.images.filter((i) => i.isPrimary), 'exactement 1 photo principale').toHaveLength(1)

      await expect(seller).toHaveURL(/\/confirmation/, { timeout: 20_000 })
      await waitForContent(seller)

      // — URLs finales : UUID serveur, aucune fuite de chemin local/temporaire —
      const filenames: string[] = []
      for (const image of product.images) {
        expect(image.url, 'URL finale publique').toMatch(
          /^(?:https?:\/\/[^\s]+)?\/uploads\/products\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/,
        )
        expect(image.url).not.toMatch(/blob:|file:|\/tmp\/|\\\\/)
        if (REMOTE) {
          expect(image.url, 'production : URL Blob absolue (pas de /tmp local)').toMatch(
            /^https:\/\/[^/]+\.public\.blob\.vercel-storage\.com\/uploads\/products\//,
          )
        }
        const filename = image.url.split('/').pop()!
        expect(filenames).not.toContain(filename)
        filenames.push(filename)
      }
      const needles = filenames

      // — API + octets + stockage réel + MIME/taille/nom ————————————————
      for (let i = 0; i < product.images.length; i++) {
        const url = product.images[i]!.url
        const filename = filenames[i]!
        const expected = files[i]!
        const res = await seller.request.get(url)
        expect(res.status(), `${url} doit répondre 200`).toBe(200)
        const contentType = (res.headers()['content-type'] ?? '').split(';')[0]!.trim()
        const bytes = Buffer.from(await res.body())

        if (!expected.needsCompression) {
          // Aucune transformation serveur : mêmes octets, même MIME, même taille.
          expect(contentType, `MIME servi pour ${expected.name}`).toBe(expected.mimeType)
          expect(bytes.length, `taille servie pour ${expected.name}`).toBe(expected.size)
          expect(sha256(bytes), `contenu identique pour ${expected.name}`).toBe(sha256(expected.buffer))
          expect(bytes.subarray(0, 4).toString('hex')).not.toBe('')
        } else {
          // Le navigateur a recompressé : JPEG, ≤ 1 Mo, ≤ 1600 px de côté.
          expect(contentType, 'gros fichier → JPEG après compression navigateur').toBe('image/jpeg')
          expect(bytes.length, 'compression ≤ 1 Mo').toBeLessThanOrEqual(MAX_BYTES_AFTER_COMPRESSION)
          expect(bytes.length).toBeGreaterThan(0)
          expect(bytes[0]).toBe(0xff)
          expect(bytes[1]).toBe(0xd8)
          expect(bytes[2]).toBe(0xff)
        }

        // Le fichier est réellement dans le volume, lisible par le process node.
        const stored = statStoredFile(filename)
        expect(stored, `${filename} doit exister dans ${DOCKER_UPLOAD_DIR}`).not.toBeNull()
        expect(stored!.size, 'taille sur disque = taille servie').toBe(bytes.length)
        expect(stored!.mode, 'permissions lisibles').toBe('644')
        expect(stored!.owner).toBe('nodejs:nodejs')
      }
      stages.push({ step: '2. Soumission + stockage réel', expected: 4, loaded: 4, broken: [] })

      // — Modération : PENDING invisible au public ————————————————————————
      const hidden = await buyer.request.get(`/api/products/${product.id}`)
      expect(hidden.status(), 'avant approbation, la fiche est privée').toBe(404)

      // ─────────────────────────────────────────────────────────────────────
      // 3. ADMIN — l'image s'affiche AVANT approbation (file de modération)
      // ─────────────────────────────────────────────────────────────────────
      await openApp(admin, '/admin/articles-en-attente')
      const pendingRow = await findPendingRow(admin, name)
      await expect(pendingRow, 'article en attente visible').toBeVisible({ timeout: 20_000 })
      await expectImagesLoaded(admin, '3. Admin (en attente)', [needles[0]!], 1)
      const pendingRowImg = pendingRow.locator('img')
      await expect(pendingRowImg).toHaveCount(1)
      await expect
        .poll(() => pendingRowImg.evaluate((el) => (el as HTMLImageElement).naturalWidth), {
          message: 'vignette admin (file d’attente) non décodée',
          timeout: 15_000,
        })
        .toBeGreaterThan(0)

      // — Approbation via l'UI réelle ————————————————————————————————————
      await pendingRow.getByRole('button', { name: /Approuver/i }).click()
      const dialog = admin.getByRole('dialog')
      await expect(dialog).toBeVisible()
      const approveResponse = admin.waitForResponse(
        (r) => r.url().includes(`/api/admin/products/${product.id}/approve`) && r.request().method() === 'POST',
      )
      await dialog.getByRole('button', { name: /Confirmer l['’]approbation/i }).click()
      expect((await approveResponse).status(), 'approbation admin').toBe(200)
      await expect(dialog).toBeHidden({ timeout: 15_000 })

      // ─────────────────────────────────────────────────────────────────────
      // 4. PUBLICATION — API : mêmes URLs, 4 images, statut public
      // ─────────────────────────────────────────────────────────────────────
      const published = await buyer.request.get(`/api/products/${product.id}`)
      expect(published.status(), 'approuvé = public').toBe(200)
      const detail = (await published.json()) as UploadedProduct & { status: string }
      expect(detail.status).toBe('AVAILABLE')
      expect(detail.images).toHaveLength(4)
      expect(detail.images.map((i) => i.url), 'URLs inchangées après approbation').toEqual(
        product.images.map((i) => i.url),
      )

      // — Admin : l'article approuvé affiche toujours la même image ————————
      await openApp(admin, '/admin/articles')
      await admin.getByLabel('Rechercher un article').fill(name)
      const adminRow = admin.getByRole('row', { name: new RegExp(name) })
      await expect(adminRow).toBeVisible({ timeout: 20_000 })
      await expectImagesLoaded(admin, '4. Admin (articles)', [needles[0]!], 1)

      // ─────────────────────────────────────────────────────────────────────
      // 5. PAGE PRODUIT — les 4 photos, aucune cassée, aucun srcset
      // ─────────────────────────────────────────────────────────────────────
      await openApp(buyer, `/catalogue/${product.slug}`)
      await expect(buyer.getByRole('heading', { level: 1, name })).toBeVisible()
      await expectImagesLoaded(buyer, '5. Fiche produit', needles, 4)

      const galleryMain = buyer.locator('#galMain img')
      await expect(galleryMain).toHaveCount(1)
      await expect
        .poll(() => galleryMain.evaluate((el) => (el as HTMLImageElement).naturalWidth))
        .toBeGreaterThan(0)

      // Chaque vignette change réellement la photo principale (les 4 URLs).
      for (let i = 0; i < 4; i++) {
        await buyer.getByRole('button', { name: `Afficher la photo ${i + 1}` }).click()
        await expect
          .poll(
            () => buyer.locator('#galMain img').evaluate((el) => (el as HTMLImageElement).getAttribute('src') ?? ''),
            { message: `la vignette ${i + 1} doit devenir l’image principale` },
          )
          .toContain(needles[i]!)
        await expect
          .poll(() => buyer.locator('#galMain img').evaluate((el) => (el as HTMLImageElement).naturalWidth), {
            message: `photo ${i + 1} non décodée en grand`,
          })
          .toBeGreaterThan(0)
      }
      expect(await brokenImagesOnPage(buyer), 'fiche produit : aucune image cassée').toEqual([])

      // ─────────────────────────────────────────────────────────────────────
      // 6. CATALOGUE — la carte du produit affiche la photo principale
      // ─────────────────────────────────────────────────────────────────────
      await openApp(buyer, `/search?q=${encodeURIComponent(name)}`)
      const cardLink = buyer.getByRole('link', { name: new RegExp(name, 'i') }).first()
      await expect(cardLink).toBeVisible({ timeout: 20_000 })
      await expectImagesLoaded(buyer, '6. Catalogue', [needles[0]!], 1)

      // ─────────────────────────────────────────────────────────────────────
      // 7. PANIER — ajout réel puis ligne de panier illustrée
      // ─────────────────────────────────────────────────────────────────────
      await openApp(buyer, `/catalogue/${product.slug}`)
      await buyer.getByRole('button', { name: /Ajouter au panier/i }).click()
      await expect(buyer.getByRole('button', { name: /Dans le panier/i })).toBeVisible({ timeout: 20_000 })
      await openApp(buyer, '/panier')
      await expect(buyer.getByRole('heading', { level: 1, name: /panier/i })).toBeVisible()
      await expectImagesLoaded(buyer, '7. Panier', [needles[0]!], 1)
      expect(await brokenImagesOnPage(buyer), 'panier : aucune image cassée').toEqual([])

      // ─────────────────────────────────────────────────────────────────────
      // 8. REFRESH COMPLET — mêmes URLs après rechargement du document
      // ─────────────────────────────────────────────────────────────────────
      await buyer.goto(`/catalogue/${product.slug}`)
      await waitForContent(buyer)
      await expectImagesLoaded(buyer, '8. Refresh complet', needles, 4)
      const refreshedSrcs = await productImageState(buyer, needles)
      expect(refreshedSrcs.every((s) => !s.src.startsWith('blob:'))).toBe(true)
      expect(await brokenImagesOnPage(buyer)).toEqual([])

      // ─────────────────────────────────────────────────────────────────────
      // 9. DÉCONNEXION / RECONNEXION — la session ne change pas les fichiers
      // ─────────────────────────────────────────────────────────────────────
      const logout = await buyer.request.post('/api/auth/logout', { headers: await csrfHeaders(buyer.request) })
      expect(logout.ok(), 'déconnexion').toBe(true)
      await buyer.goto('/login')
      await buyer.fill('#aMail', buyerEmail)
      await buyer.fill('#aPass', buyerPassword)
      await buyer.locator('#authSubmit').click()
      await buyer.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20_000 })
      await buyer.goto(`/catalogue/${product.slug}`)
      await waitForContent(buyer)
      await expectImagesLoaded(buyer, '9. Après reconnexion', needles, 4)
      expect(await brokenImagesOnPage(buyer)).toEqual([])

      // ─────────────────────────────────────────────────────────────────────
      // 10/11. MOBILE 390 puis DESKTOP 1440
      // ─────────────────────────────────────────────────────────────────────
      await buyer.setViewportSize({ width: 390, height: 844 })
      await buyer.goto(`/catalogue/${product.slug}`)
      await waitForContent(buyer)
      await expectImagesLoaded(buyer, '10. Mobile 390', [needles[0]!], 1)
      const mobileOverflow = await buyer.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      )
      expect(mobileOverflow, 'aucun débordement horizontal en 390').toBe(false)

      await buyer.setViewportSize({ width: 1440, height: 900 })
      await buyer.goto(`/catalogue/${product.slug}`)
      await waitForContent(buyer)
      await expectImagesLoaded(buyer, '11. Desktop 1440', needles, 4)

      // ─────────────────────────────────────────────────────────────────────
      // 12. THÈME SOMBRE puis CLAIR — même image, mêmes URLs
      // ─────────────────────────────────────────────────────────────────────
      const themeButton = buyer.locator('button.themebtn')
      const initialTheme = await buyer.evaluate(() => document.documentElement.getAttribute('data-theme'))
      if (initialTheme !== 'dark') await themeButton.click()
      await expect(buyer.locator('html')).toHaveAttribute('data-theme', 'dark')
      await expectImagesLoaded(buyer, '12. Thème sombre', needles, 4)
      await themeButton.click()
      await expect(buyer.locator('html')).toHaveAttribute('data-theme', 'light')
      await expectImagesLoaded(buyer, '13. Thème clair', needles, 4)

      // ─────────────────────────────────────────────────────────────────────
      // BILAN
      // ─────────────────────────────────────────────────────────────────────
      const totalBroken = stages.reduce((n, s) => n + s.broken.length, 0)
      // eslint-disable-next-line no-console
      console.log(
        [
          '',
          '=== CYCLE IMAGES NEUVES ===',
          `run: ${runId} — produit #${product.id} (${product.slug})`,
          `vendeur: ${sellerEmail}`,
          'Étape | attendues | décodées | cassées',
          ...stages.map((s) => `${s.step} | ${s.expected} | ${s.loaded} | ${s.broken.length}`),
          `IMAGES CASSÉES = ${totalBroken}`,
          '',
        ].join('\n'),
      )
      expect(totalBroken, 'objectif absolu : images cassées = 0').toBe(0)
      expect(stages.length, 'toutes les étapes ont été mesurées').toBeGreaterThanOrEqual(13)
    } finally {
      await Promise.all([seller, admin, buyer].map((p) => closeSharedPage(p).catch(() => undefined)))
      cleanupNewImages(runId)
    }
  })
})
