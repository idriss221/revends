#!/usr/bin/env node
/**
 * Harnais d'audit des images / médias — ReVends.
 *
 * Objectif : inventorier TOUTES les images réellement rendues par la SPA
 * (publique + admin connecté), prouver lesquelles se chargent, repérer les
 * anomalies (image cassée, repli SVG silencieux, MIME non-image, débordement,
 * scroll horizontal), sur les 15 largeurs et les 2 thèmes, puis produire :
 *   - docs/audit/images-inventory.json  (brut complet, exploitable)
 *   - docs/audit/images-report.md       (synthèse chiffrée + anomalies)
 *
 * Aucune modification de la stack : le script ne fait que lire.
 *
 * Usage :
 *   node web/scripts/media-audit.mjs [baseUrl]
 *   AUDIT_ADMIN_PASSWORD=... node web/scripts/media-audit.mjs http://127.0.0.1:8080
 *
 * Le mot de passe admin est résolu, dans cet ordre :
 *   1. AUDIT_ADMIN_PASSWORD
 *   2. E2E_ADMIN_PASSWORD
 *   3. `docker inspect $AUDIT_API_CONTAINER` (défaut : revends_api1) — jamais affiché.
 *
 * Options (env) :
 *   AUDIT_WIDTHS=1440,390   largeurs des passes d'inventaire complet
 *   AUDIT_SKIP_RESPONSIVE=1 saute la matrice 15 largeurs
 *   AUDIT_SKIP_CROSSCHECK=1 saute la vérification produits ↔ images
 *   AUDIT_SKIP_THEMES=1     saute la passe thèmes
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const WEB_ROOT = resolve(HERE, '..')
const REPO_ROOT = resolve(WEB_ROOT, '..')
const OUT_DIR = join(REPO_ROOT, 'docs', 'audit')

const PLAYWRIGHT_ENTRY = join(WEB_ROOT, 'node_modules', 'playwright', 'index.mjs')
const { chromium } = await import(pathToFileURL(PLAYWRIGHT_ENTRY).href)

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

const BASE = (process.argv[2] ?? process.env.AUDIT_BASE_URL ?? 'http://127.0.0.1:8080').replace(/\/+$/, '')
const ORIGIN = new URL(BASE).origin
const ADMIN_EMAIL = process.env.AUDIT_ADMIN_EMAIL ?? process.env.E2E_ADMIN_EMAIL ?? 'admin@revends.com'
const ADMIN_PASSWORD =
  process.env.AUDIT_ADMIN_PASSWORD ?? process.env.E2E_ADMIN_PASSWORD ?? dockerAdminPassword()

const WIDTHS = [
  { width: 320, height: 640 },
  { width: 360, height: 740 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 414, height: 896 },
  { width: 430, height: 932 },
  { width: 480, height: 800 },
  { width: 768, height: 1024 },
  { width: 834, height: 1112 },
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1600, height: 900 },
  { width: 1920, height: 1080 },
]
const INVENTORY_WIDTHS = (process.env.AUDIT_WIDTHS ?? '1440,390')
  .split(',')
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n))
  .map((w) => WIDTHS.find((x) => x.width === w) ?? { width: w, height: Math.round(w * 0.7) })

const THEMES = ['dark', 'light']

/* ------------------------------------------------------------------ */
/* Routes auditées — chemins RÉELS du routeur (src/App.tsx)             */
/* ------------------------------------------------------------------ */

function routes(productSlug) {
  return [
    { path: '/', name: 'accueil' },
    { path: '/shop', name: 'boutique' },
    { path: '/search?q=sac', name: 'recherche-sac' },
    { path: '/category/mode', name: 'categorie-mode' },
    { path: '/category/mode-chaussures', name: 'categorie-mode-chaussures' },
    { path: '/category/inconnu-xyz', name: 'categorie-inconnue', expectNotFound: true },
    { path: `/catalogue/${productSlug}`, name: 'fiche-produit' },
    { path: '/favoris', name: 'favoris' },
    { path: '/panier', name: 'panier' },
    { path: '/commande', name: 'commande' },
    { path: '/login', name: 'login' },
    { path: '/register', name: 'register' },
    { path: '/reset-password', name: 'reset-password' },
    { path: '/conditions', name: 'conditions' },
    { path: '/confidentialite', name: 'confidentialite' },
    { path: '/route-inexistante', name: 'route-inexistante', expectNotFound: true },
    { path: '/admin', name: 'admin-dashboard', admin: true },
    { path: '/admin/articles', name: 'admin-articles', admin: true },
    { path: '/admin/articles-en-attente', name: 'admin-articles-en-attente', admin: true },
    { path: '/admin/commandes', name: 'admin-commandes', admin: true },
    { path: '/admin/paiements', name: 'admin-paiements', admin: true },
    { path: '/admin/utilisateurs', name: 'admin-utilisateurs', admin: true },
    { path: '/admin/categories', name: 'admin-categories', admin: true },
    { path: '/admin/historique', name: 'admin-historique', admin: true },
  ]
}

/* ------------------------------------------------------------------ */
/* Petites utilitaires                                                 */
/* ------------------------------------------------------------------ */

function dockerAdminPassword() {
  const container = process.env.AUDIT_API_CONTAINER ?? 'revends_api1'
  try {
    const env = execFileSync('docker', ['inspect', container, '--format', '{{range .Config.Env}}{{println .}}{{end}}'], {
      encoding: 'utf8',
      timeout: 10_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const line = env.split('\n').find((l) => l.startsWith('ADMIN_PASSWORD='))
    return line ? line.slice('ADMIN_PASSWORD='.length) : undefined
  } catch {
    return undefined
  }
}

function stripHash(url) {
  try {
    const u = new URL(url, BASE)
    return u.origin === ORIGIN ? `${u.pathname}${u.search}` : u.href
  } catch {
    return url
  }
}

function keyOf(url) {
  return stripHash(url)
}

function isImageUrl(url) {
  return /\.(png|jpe?g|gif|webp|avif|svg|ico)(\?|#|$)/i.test(url)
}

function safeName(s) {
  return s.replace(/[^a-z0-9._-]+/gi, '-')
}

const nowIso = () => new Date().toISOString()

/* ------------------------------------------------------------------ */
/* API helpers (fetch Node, GET seulement — aucune mutation)           */
/* ------------------------------------------------------------------ */

async function apiJson(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`)
  return res.json()
}

async function probeImage(url) {
  const abs = /^https?:\/\//i.test(url) ? url : `${BASE}${url.startsWith('/') ? '' : '/'}${url}`
  try {
    let res = await fetch(abs, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(20_000) })
    if (res.status === 405 || res.status === 501) {
      res = await fetch(abs, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(20_000) })
    }
    const ct = (res.headers.get('content-type') ?? '').split(';')[0].trim()
    const len = Number(res.headers.get('content-length') ?? 0) || null
    return { url, absoluteUrl: abs, status: res.status, contentType: ct, bytes: len, ok: res.ok }
  } catch (err) {
    return { url, absoluteUrl: abs, status: 0, contentType: '', bytes: null, ok: false, error: String(err) }
  }
}

/* ------------------------------------------------------------------ */
/* Attentes navigateur                                                 */
/* ------------------------------------------------------------------ */

/** Attend `complete` + `decode()` de toutes les <img>, avec plafond. */
async function settleImages(page, budgetMs = 12_000) {
  await page.evaluate(async (budget) => {
    const imgs = Array.from(document.images)
    const withTimeout = (p) =>
      Promise.race([p, new Promise((r) => setTimeout(r, budget))]).catch(() => undefined)
    await Promise.all(
      imgs.map((img) =>
        new Promise((resolve) => {
          if (img.complete) return resolve()
          const done = () => {
            img.removeEventListener('load', done)
            img.removeEventListener('error', done)
            resolve()
          }
          img.addEventListener('load', done)
          img.addEventListener('error', done)
          setTimeout(done, budget)
        }),
      ),
    )
    await Promise.all(imgs.map((img) => withTimeout(img.decode().catch(() => undefined))))
  }, budgetMs)
}

/** Défilement complet (déclenche loading="lazy"), puis retour en haut. */
async function scrollThrough(page) {
  await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const height = () => document.documentElement.scrollHeight
    const step = Math.max(240, Math.round(window.innerHeight * 0.8))
    for (let y = 0; y <= height(); y += step) {
      window.scrollTo(0, y)
      await sleep(45)
    }
    window.scrollTo(0, height())
    await sleep(300)
    window.scrollTo(0, 0)
    await sleep(120)
  })
  // Une deuxième passe : certains composants montent du contenu au scroll.
  await settleImages(page, 6_000)
}

/** Attend un état « posé » (réseau calme + images décodées). */
async function settlePage(page) {
  await page.waitForLoadState('load', { timeout: 30_000 }).catch(() => undefined)
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined)
  await scrollThrough(page)
}

/* ------------------------------------------------------------------ */
/* Extraction DOM (une seule évaluation, données sérialisables)        */
/* ------------------------------------------------------------------ */

async function extractDom(page) {
  return page.evaluate(async () => {
    const cssPath = (el) => {
      const parts = []
      let node = el
      for (let i = 0; node && node.nodeType === 1 && i < 4; i++) {
        let part = node.tagName.toLowerCase()
        if (node.id) {
          part += `#${node.id}`
          parts.unshift(part)
          break
        }
        const cls = String(node.className ?? '')
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
        if (cls.length) part += `.${cls.join('.')}`
        parts.unshift(part)
        node = node.parentElement
      }
      return parts.join(' > ')
    }
    const sectionOf = (el) => {
      if (el.closest('header')) return 'header'
      if (el.closest('footer')) return 'footer'
      if (el.closest('nav')) return 'nav'
      if (el.closest('[role="dialog"]')) return 'dialog'
      if (el.closest('aside')) return 'aside'
      if (el.closest('.gallery, .pd, .thumbs')) return 'galerie-produit'
      if (el.closest('main')) return 'main'
      return 'body'
    }
    const rectOf = (el) => {
      const r = el.getBoundingClientRect()
      return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom) }
    }
    const visibilityOf = (el) => {
      const cs = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      const opacity = Number.parseFloat(cs.opacity || '1')
      const displayed = cs.display !== 'none' && cs.visibility !== 'hidden' && cs.visibility !== 'collapse'
      const visible = displayed && opacity > 0.01 && r.width > 0 && r.height > 0
      return { display: cs.display, visibility: cs.visibility, opacity, visible }
    }
    const hasSvgFallback = (el) => {
      const scope = el.parentElement
      if (!scope) return false
      return Boolean(scope.querySelector('svg[aria-label="Illustration"], svg[data-fallback="true"]'))
    }
    const clippedHorizontally = (el) => {
      let node = el.parentElement
      while (node && node !== document.documentElement) {
        const cs = getComputedStyle(node)
        if (cs.overflowX !== 'visible' && /(hidden|clip|auto|scroll)/.test(cs.overflowX)) {
          const r = node.getBoundingClientRect()
          if (r.width > 0) return true
        }
        node = node.parentElement
      }
      return false
    }
    /** Texte visible à côté de l'image (permet d'accepter un alt="" décoratif). */
    const hasAdjacentText = (el) => {
      const scope = el.closest('a, button, tr, li, article, figure') ?? el.parentElement
      if (!scope) return false
      const text = (scope.innerText ?? '').replace(/\s+/g, ' ').trim()
      return text.length >= 3
    }

    /* ---------- <img> ---------- */
    const imageEls = Array.from(document.images)
    const images = await Promise.all(
      imageEls.map(async (img, index) => {
        const vis = visibilityOf(img)
        const rect = rectOf(img)
        const decodeOk = await Promise.race([
          img.decode().then(() => true).catch(() => false),
          new Promise((r) => setTimeout(() => r('timeout'), 4_000)),
        ]).catch(() => false)
        const srcsetRaw = img.getAttribute('srcset') ?? ''
        const srcsetCandidates = srcsetRaw
          .split(',')
          .map((s) => s.trim().split(/\s+/)[0])
          .filter(Boolean)
        return {
          index,
          tag: 'img',
          srcAttr: img.getAttribute('src') ?? '',
          src: img.getAttribute('src') ?? '',
          currentSrc: img.currentSrc ?? '',
          srcset: srcsetRaw,
          srcsetCandidates,
          alt: img.getAttribute('alt') ?? '',
          title: img.getAttribute('title') ?? '',
          loading: img.getAttribute('loading') ?? '',
          decoding: img.getAttribute('decoding') ?? '',
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          complete: img.complete,
          decodeOk,
          rect,
          section: sectionOf(img),
          selector: cssPath(img),
          classes: String(img.className ?? ''),
          id: img.id || '',
          role: img.getAttribute('role') ?? '',
          ariaHidden: img.getAttribute('aria-hidden') ?? '',
          inlineOnError: img.getAttribute('onerror') ?? '',
          fallbackSvgPresent: hasSvgFallback(img),
          clippedHorizontally: clippedHorizontally(img),
          hasAdjacentText: hasAdjacentText(img),
          visibility: vis,
        }
      }),
    )

    /* ---------- <picture>/<source> ---------- */
    const pictures = Array.from(document.querySelectorAll('picture')).map((pic) => ({
      selector: cssPath(pic),
      sources: Array.from(pic.querySelectorAll('source')).map((s) => ({
        srcset: s.getAttribute('srcset') ?? '',
        media: s.getAttribute('media') ?? '',
        type: s.getAttribute('type') ?? '',
        sizes: s.getAttribute('sizes') ?? '',
      })),
      imgSrc: pic.querySelector('img')?.getAttribute('src') ?? '',
    }))

    /* ---------- <svg> ---------- */
    const svgs = Array.from(document.querySelectorAll('svg')).map((svg, index) => {
      const vis = visibilityOf(svg)
      const rect = rectOf(svg)
      const hasUse = Boolean(svg.querySelector('use'))
      const ariaHidden = svg.getAttribute('aria-hidden')
      const ariaLabel = svg.getAttribute('aria-label') ?? ''
      const role = svg.getAttribute('role') ?? ''
      const isSprite = hasUse || /sprite|icon-?sprite|is-hidden/i.test(String(svg.className?.baseVal ?? svg.getAttribute('class') ?? ''))
      const decorative = ariaHidden === 'true' || (!role && !ariaLabel)
      return {
        index,
        selector: cssPath(svg),
        ariaLabel,
        role,
        ariaHidden,
        viewBox: svg.getAttribute('viewBox') ?? '',
        classes: String(svg.getAttribute('class') ?? ''),
        rect,
        visible: vis.visible,
        display: vis.display,
        isSprite,
        decorative,
        section: sectionOf(svg),
        hasTitle: Boolean(svg.querySelector('title')),
      }
    })

    /* ---------- images de fond CSS (éléments + pseudo-éléments) ---------- */
    const backgrounds = []
    const pushBg = (el, pseudo, value) => {
      if (!value || value === 'none' || !value.includes('url(')) return
      const urls = Array.from(value.matchAll(/url\((['"]?)(.*?)\1\)/g)).map((m) => m[2])
      if (!urls.length) return
      const vis = visibilityOf(el)
      const rect = rectOf(el)
      if (!vis.visible) return
      for (const url of urls) {
        if (url.startsWith('data:')) continue
        backgrounds.push({
          selector: cssPath(el),
          pseudo,
          url,
          raw: value.slice(0, 300),
          rect,
          section: sectionOf(el),
        })
      }
    }
    for (const el of Array.from(document.querySelectorAll('*'))) {
      const cs = getComputedStyle(el)
      pushBg(el, '', cs.backgroundImage)
      const before = getComputedStyle(el, '::before').backgroundImage
      if (before && before !== 'none') pushBg(el, '::before', before)
      const after = getComputedStyle(el, '::after').backgroundImage
      if (after && after !== 'none') pushBg(el, '::after', after)
    }

    const doc = document.documentElement
    return {
      title: document.title,
      h1: document.querySelector('h1')?.textContent?.trim() ?? '',
      pathname: location.pathname + location.search,
      theme: doc.getAttribute('data-theme') ?? '',
      scroll: {
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
        scrollHeight: doc.scrollHeight,
        clientHeight: doc.clientHeight,
        horizontalOverflow: doc.scrollWidth > doc.clientWidth + 1,
      },
      counts: {
        img: imageEls.length,
        picture: pictures.length,
        svg: svgs.length,
        background: backgrounds.length,
      },
      images,
      pictures,
      svgs,
      backgrounds,
    }
  })
}

/* ------------------------------------------------------------------ */
/* Classification / anomalies                                          */
/* ------------------------------------------------------------------ */

const REQUIRED_SRC = [/^\/catalog\//i, /^\/uploads\//i, /^\/categories\//i]

function classifyImage(img) {
  const path = (() => {
    try {
      return new URL(img.currentSrc || img.srcAttr, BASE).pathname
    } catch {
      return img.currentSrc || img.srcAttr
    }
  })()
  if (REQUIRED_SRC.some((re) => re.test(path))) {
    return { requirement: 'obligatoire', reason: path.startsWith('/catalog/') || path.startsWith('/uploads/') ? 'photo produit' : 'visuel éditorial / catégorie' }
  }
  if (['header', 'footer', 'nav'].includes(img.section) && img.alt.trim()) {
    return { requirement: 'obligatoire', reason: 'logo / navigation' }
  }
  if (/avatar|logo/i.test(`${img.classes} ${img.alt}`) && !/^https?:\/\/(?!127\.0\.0\.1|localhost)/i.test(img.currentSrc || '')) {
    return { requirement: 'obligatoire', reason: 'logo / avatar' }
  }
  if (img.alt.trim() && img.section === 'main') return { requirement: 'facultative', reason: 'illustration de contenu' }
  return { requirement: 'facultative', reason: 'décoratif' }
}

function severityRank(s) {
  return { P0: 0, P1: 1, P2: 2, P3: 3 }[s] ?? 9
}

/**
 * Transforme les données d'une page en liste d'anomalies normalisées.
 * Chaque anomalie porte sa preuve : valeur mesurée, URL, page, largeur.
 */
function analyzePage(pageRec, netEntries) {
  const anomalies = []
  const cw = pageRec.dom.scroll.clientWidth
  const netByKey = new Map()
  for (const n of netEntries) {
    const k = keyOf(n.url)
    const prev = netByKey.get(k)
    // On garde la pire réponse (>=400 prioritaire, puis la plus informative).
    if (!prev || (n.status >= 400 && prev.status < 400) || (prev.size == null && n.size != null)) netByKey.set(k, n)
  }
  const add = (severity, kind, details) => {
    anomalies.push({ severity, kind, page: pageRec.route.path, pageName: pageRec.route.name, width: pageRec.viewport.width, theme: pageRec.theme, ...details })
  }

  // Repli SVG affiché à la place d'une photo (SiteImage onError) → photo perdue.
  const fallbacks = pageRec.dom.svgs.filter((s) => s.ariaLabel === 'Illustration' && s.visible)
  for (const fb of fallbacks) {
    add('P1', 'fallback-svg', {
      element: fb.selector,
      url: '(image remplacée par le SVG de secours)',
      problem: 'Photo attendue remplacée par l’illustration SVG de secours (onError de SiteImage)',
      probableCause: 'URL d’image en erreur (404/403) ou fichier supprimé côté vendeur',
      requirement: 'obligatoire',
      evidence: `svg[aria-label="Illustration"] visible, rect ${fb.rect.width}×${fb.rect.height}`,
    })
  }

  for (const img of pageRec.dom.images) {
    const cls = classifyImage(img)
    const url = img.currentSrc || img.srcAttr
    const key = keyOf(url)
    const net = netByKey.get(key)
    const isVisible = img.visibility.visible
    const broken = img.complete && img.naturalWidth === 0
    const pending = !img.complete
    const empty = !img.srcAttr || img.srcAttr.trim() === '' || img.srcAttr.trim() === '#' || img.srcAttr.startsWith('data:,')
    const bogus = /(?:undefined|null|placeholder|no-image|image-manquante)/i.test(url)

    const requirement = cls.requirement
    const reason = cls.reason
    const base = {
      element: img.selector,
      url: url || '(src vide)',
      alt: img.alt,
      requirement,
      reason,
      natural: `${img.naturalWidth}×${img.naturalHeight}`,
      rect: `${img.rect.width}×${img.rect.height}`,
      loading: img.loading,
      evidence: '',
    }

    if (empty) {
      add(requirement === 'obligatoire' ? 'P0' : 'P2', 'src-vide', {
        ...base,
        problem: 'Balise <img> avec un src vide / placeholder',
        probableCause: 'Donnée image absente en base ou fallback DOM incomplet',
        evidence: `src=${JSON.stringify(img.srcAttr)} visible=${isVisible}`,
      })
    } else if (broken && isVisible) {
      add(requirement === 'obligatoire' ? 'P0' : 'P2', 'image-cassee', {
        ...base,
        problem: 'Image affichée mais non décodée (naturalWidth = 0)',
        probableCause: net && net.status >= 400 ? `Réponse HTTP ${net.status}` : 'Fichier corrompu / réponse non-image',
        evidence: `complete=${img.complete} natural=${img.naturalWidth}×${img.naturalHeight} visible=${isVisible}`,
      })
    } else if (broken && !isVisible) {
      add('P3', 'image-cassee-cachee', {
        ...base,
        problem: 'Image non décodée mais masquée (impact visuel nul, donnée morte)',
        probableCause: 'Même cause qu’une image cassée, mais élément caché',
        evidence: `natural=0 display=${img.visibility.display}`,
      })
    } else if (pending && isVisible) {
      add(requirement === 'obligatoire' ? 'P1' : 'P3', 'chargement-incomplet', {
        ...base,
        problem: 'Image toujours en chargement après défilement complet + attente',
        probableCause: 'Requête bloquée / réseau lent / URL sans réponse',
        evidence: `complete=false decodeOk=${img.decodeOk}`,
      })
    }

    if (!broken && img.decodeOk === false && isVisible) {
      add('P1', 'decode-echec', {
        ...base,
        problem: 'decode() échoue alors que naturalWidth > 0',
        probableCause: 'Format non supporté / flux tronqué',
        evidence: `natural=${img.naturalWidth}×${img.naturalHeight}`,
      })
    }

    if (net && net.status >= 400 && url) {
      add(requirement === 'obligatoire' ? 'P0' : 'P2', 'http-image-erreur', {
        ...base,
        problem: `Réponse HTTP ${net.status} sur l’URL d’image`,
        probableCause: net.status === 404 ? 'Fichier absent du build /uploads' : net.status === 403 ? 'Accès refusé' : net.status === 429 ? 'Rate limit' : 'Erreur serveur',
        evidence: `${net.status} ${net.contentType || '(sans content-type)'} bytes=${net.size ?? '?'}`,
      })
    }

    if (net && net.contentType && url && !/^image\//i.test(net.contentType)) {
      add('P1', 'mime-non-image', {
        ...base,
        problem: `Content-Type "${net.contentType}" sur une URL utilisée comme image`,
        probableCause: 'Route API renvoyant du JSON/HTML, ou fichier statique manquant (fallback HTML)',
        evidence: `${net.status} ${net.contentType}`,
      })
    }

    if (bogus) {
      add('P1', 'placeholder-suspect', {
        ...base,
        problem: 'URL contenant un marqueur de placeholder (undefined/null/placeholder)',
        probableCause: 'Interpolation d’une valeur absente',
        evidence: url,
      })
    }

    if (!broken && img.naturalWidth > 0 && isVisible === false && img.visibility.display !== 'none') {
      add('P2', 'boite-nulle', {
        ...base,
        problem: 'Image chargée mais boîte rendue vide (largeur ou hauteur = 0)',
        probableCause: 'Conteneur sans dimension / aspect-ratio manquant',
        evidence: `rect=${img.rect.width}×${img.rect.height} opacity=${img.visibility.opacity}`,
      })
    }

    if (isVisible && !img.clippedHorizontally && (img.rect.right > cw + 1 || img.rect.x < -1)) {
      add('P2', 'debordement-image', {
        ...base,
        problem: 'Image rendue hors du viewport horizontal',
        probableCause: 'Largeur intrinsèque non contrainte (max-width manquant)',
        evidence: `right=${img.rect.right} > clientWidth=${cw} (x=${img.rect.x})`,
      })
    }

    if (requirement === 'obligatoire' && !img.alt.trim() && !img.hasAdjacentText) {
      add('P3', 'alt-manquant', {
        ...base,
        problem: 'Image obligatoire sans texte alternatif ni texte adjacent',
        probableCause: 'alt oublié',
        evidence: `alt="" sur ${img.selector}`,
      })
    }

    if (net && net.status === 200 && net.contentType && net.size === 0) {
      add('P2', 'image-vide-octets', {
        ...base,
        problem: 'Réponse image 200 mais 0 octet',
        probableCause: 'Fichier vide',
        evidence: 'content-length: 0',
      })
    }
  }

  // Ressources image du réseau qui n'ont jamais abouti (img hors DOM, favicon…).
  const domUrls = new Set(pageRec.dom.images.map((i) => keyOf(i.currentSrc || i.srcAttr)))
  for (const n of netEntries) {
    if (!isImageUrl(n.url) && n.resourceType !== 'image') continue
    if (!n.url.includes('/api/') && n.status >= 400) {
      add('P2', 'asset-image-erreur', {
        element: '(hors DOM <img>)',
        url: stripHash(n.url),
        requirement: 'facultative',
        problem: `Asset image référencé mais en erreur HTTP ${n.status}`,
        probableCause: n.status === 404 ? 'Fichier absent du build' : 'Erreur serveur/CDN',
        evidence: `${n.status} ${n.contentType || '(sans content-type)'} resourceType=${n.resourceType}`,
      })
    }
    if (n.failure && !domUrls.has(keyOf(n.url))) {
      add('P2', 'requete-image-echouee', {
        element: '(hors DOM <img>)',
        url: stripHash(n.url),
        requirement: 'facultative',
        problem: `Requête image échouée (${n.failure})`,
        probableCause: 'Réseau / ressource indisponible',
        evidence: n.failure,
      })
    }
  }

  // Requêtes non-image en erreur : preuve utile pour distinguer « image cassée » de « page cassée ».
  for (const n of netEntries) {
    // 401 sur /api/auth/me = sonde anonyme normale (AuthContext), pas une anomalie.
    const expectedAuthProbe = n.status === 401 && /\/api\/auth\/me(\?|$)/.test(n.url)
    if (n.status >= 400 && n.resourceType !== 'image' && !isImageUrl(n.url) && !expectedAuthProbe) {
      add('P2', 'requete-page-erreur', {
        element: '(requête réseau)',
        url: stripHash(n.url),
        requirement: 'facultative',
        problem: `Réponse HTTP ${n.status} (${n.resourceType})`,
        probableCause: n.status === 429 ? 'Rate limit atteint' : n.status === 404 ? 'Endpoint/route absent' : 'Erreur serveur',
        evidence: `${n.status} ${n.contentType || ''}`,
      })
    }
  }

  if (pageRec.dom.scroll.horizontalOverflow) {
    add('P2', 'scroll-horizontal', {
      element: 'documentElement',
      url: pageRec.route.path,
      requirement: 'facultative',
      problem: `Débordement horizontal (scrollWidth ${pageRec.dom.scroll.scrollWidth} > clientWidth ${pageRec.dom.scroll.clientWidth})`,
      probableCause: 'Élément plus large que le viewport (image, tableau, marge négative)',
      evidence: `overflow=${pageRec.dom.scroll.scrollWidth - pageRec.dom.scroll.clientWidth}px`,
    })
  }

  return anomalies
}

/* ------------------------------------------------------------------ */
/* Capture réseau                                                      */
/* ------------------------------------------------------------------ */

function attachNetworkSpy(page) {
  const entries = []
  const seen = new Set()
  let started = Date.now()

  const record = (entry) => {
    const k = `${entry.url}|${entry.status}|${entry.failure ?? ''}`
    if (seen.has(k)) return
    seen.add(k)
    entries.push(entry)
  }

  const onResponse = (res) => {
    const req = res.request()
    const resourceType = req.resourceType()
    const url = res.url()
    if (!isImageUrl(url) && resourceType !== 'image' && res.status() < 400) return
    const headers = res.headers()
    const contentType = (headers['content-type'] ?? '').split(';')[0].trim()
    const size = Number(headers['content-length'] ?? 0) || null
    record({ url, status: res.status(), contentType, resourceType, size, at: Date.now() - started })
    if (resourceType === 'image' && size == null) {
      res
        .body()
        .then((body) => {
          const e = entries.find((x) => x.url === url && x.size == null)
          if (e) e.size = body.length
        })
        .catch(() => undefined)
    }
  }
  const onFailed = (req) => {
    record({
      url: req.url(),
      status: 0,
      contentType: '',
      resourceType: req.resourceType(),
      size: null,
      failure: req.failure()?.errorText ?? 'unknown',
      at: Date.now() - started,
    })
  }
  page.on('response', onResponse)
  page.on('requestfailed', onFailed)
  return {
    reset() {
      entries.length = 0
      seen.clear()
      started = Date.now()
    },
    entries() {
      return entries.slice()
    },
    detach() {
      page.off('response', onResponse)
      page.off('requestfailed', onFailed)
    },
  }
}

/* ------------------------------------------------------------------ */
/* Passes de mesure                                                    */
/* ------------------------------------------------------------------ */

async function gotoRoute(page, path) {
  const response = await page
    .goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    .catch((err) => ({ status: () => 0, error: String(err) }))
  await settlePage(page)
  let status = 0
  try {
    status = typeof response?.status === 'function' ? response.status() : 0
  } catch {
    status = 0
  }
  return status
}

async function scanAtWidth(page, spy, route, width, theme, extra = {}) {
  await page.setViewportSize(width)
  spy.reset()
  const t0 = Date.now()
  const status = await gotoRoute(page, route.path)
  const dom = await extractDom(page)
  const net = spy.entries()
  const pageRec = {
    route,
    viewport: width,
    theme: theme ?? dom.theme,
    url: `${BASE}${route.path}`,
    finalPath: dom.pathname,
    title: dom.title,
    h1: dom.h1,
    themeApplied: dom.theme,
    httpStatus: status,
    loadDurationMs: Date.now() - t0,
    dom,
    network: net,
    consoleErrors: extra.consoleErrors ?? [],
    ...extra.meta,
  }
  pageRec.images = dom.images.map((img) => ({ ...img, ...classifyImage(img) }))
  pageRec.anomalies = analyzePage(pageRec, net)
  return pageRec
}

/** Mesure le débordement + les images hors viewport sur les 15 largeurs. */
async function measureResponsive(page) {
  const out = []
  for (const { width, height } of WIDTHS) {
    await page.setViewportSize({ width, height })
    await page.waitForTimeout(120)
    await page.evaluate(async () => {
      window.scrollTo(0, document.documentElement.scrollHeight)
      await new Promise((r) => setTimeout(r, 120))
      window.scrollTo(0, 0)
      await new Promise((r) => setTimeout(r, 80))
    })
    const m = await page.evaluate(() => {
      const doc = document.documentElement
      const cw = doc.clientWidth
      const clipped = (el) => {
        let node = el.parentElement
        while (node && node !== document.documentElement) {
          const cs = getComputedStyle(node)
          if (cs.overflowX !== 'visible' && /(hidden|clip|auto|scroll)/.test(cs.overflowX)) {
            if (node.getBoundingClientRect().width > 0) return true
          }
          node = node.parentElement
        }
        return false
      }
      const imgs = Array.from(document.images).map((img) => {
        const r = img.getBoundingClientRect()
        return {
          src: img.currentSrc || img.getAttribute('src') || '',
          naturalWidth: img.naturalWidth,
          width: Math.round(r.width),
          height: Math.round(r.height),
          left: Math.round(r.left),
          right: Math.round(r.right),
          visible:
            getComputedStyle(img).display !== 'none' &&
            getComputedStyle(img).visibility !== 'hidden' &&
            r.width > 0 &&
            r.height > 0,
          clipped: clipped(img),
        }
      })
      const overflowingImgs = imgs.filter((i) => i.visible && !i.clipped && (i.right > cw + 1 || i.left < -1))
      const guilty = Array.from(document.querySelectorAll('body *'))
        .filter((n) => n.getBoundingClientRect().right > cw + 1 || n.getBoundingClientRect().left < -1)
        .slice(0, 4)
        .map((n) => `${n.tagName.toLowerCase()}${n.className ? `.${String(n.className).split(/\s+/).slice(0, 2).join('.')}` : ''}`)
      return {
        scrollWidth: doc.scrollWidth,
        clientWidth: cw,
        overflowPx: Math.max(0, doc.scrollWidth - cw),
        imageCount: imgs.length,
        overflowingImgs: overflowingImgs.slice(0, 10),
        guilty,
      }
    })
    out.push({ width, height, ...m })
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  return out
}

/* ------------------------------------------------------------------ */
/* Cross-check produits ↔ images (Livrable 3)                          */
/* ------------------------------------------------------------------ */

function slugTokens(s) {
  return new Set(
    String(s)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2 && !['les', 'des', 'une', 'pour', 'avec', 'en', 'de', 'du', 'la', 'le'].includes(t)),
  )
}

async function crossCheckProducts() {
  const list = await apiJson('/api/products?per_page=48')
  const items = list.items ?? []
  const products = []
  for (const item of items) {
    let detail
    try {
      detail = await apiJson(`/api/products/${encodeURIComponent(item.slug)}`)
    } catch (err) {
      products.push({ slug: item.slug, name: item.name, error: String(err), images: [] })
      continue
    }
    const images = detail.images ?? []
    products.push({ slug: item.slug, name: item.name, id: detail.id, imageCount: images.length, images })
  }

  // URLs distinctes → une seule sonde réseau.
  const urls = [...new Set(products.flatMap((p) => (p.images ?? []).map((i) => i.url)).filter(Boolean))]
  const probes = new Map()
  await Promise.all(
    urls.map(async (u) => {
      probes.set(u, await probeImage(u))
    }),
  )

  const perProduct = products.map((p) => {
    const imgs = (p.images ?? []).map((i) => ({
      ...i,
      probe: probes.get(i.url) ?? null,
      requirement: 'obligatoire',
    }))
    const broken = imgs.filter((i) => !i.probe || !i.probe.ok || !/^image\//i.test(i.probe.contentType) || i.probe.status !== 200)
    const tokens = slugTokens(p.slug)
    const shared = imgs.length
      ? [...slugTokens(imgs[0].url.split('/').pop()?.replace(/\.[a-z0-9]+$/i, '') ?? '')].filter((t) => tokens.has(t))
      : []
    return {
      ...p,
      images: imgs,
      brokenImages: broken.map((b) => ({ url: b.url, probe: b.probe })),
      primarySemanticOverlap: shared,
      semanticSuspicion: Boolean(imgs.length) && shared.length === 0,
    }
  })

  // Doublons exacts entre produits distincts.
  const byUrl = new Map()
  for (const p of perProduct) {
    for (const img of p.images) {
      if (!img.url) continue
      if (!byUrl.has(img.url)) byUrl.set(img.url, new Set())
      byUrl.get(img.url).add(p.slug)
    }
  }
  const exactDuplicates = [...byUrl.entries()]
    .filter(([, slugs]) => slugs.size > 1)
    .map(([url, slugs]) => ({ url, products: [...slugs], probe: probes.get(url) ?? null }))

  // Familles (même base, suffixes -1/-2) partagées entre produits distincts.
  const byFamily = new Map()
  for (const p of perProduct) {
    for (const img of p.images) {
      if (!img.url) continue
      const family = img.url.replace(/-\d+(\.[a-z0-9]+)$/i, '$1')
      if (!byFamily.has(family)) byFamily.set(family, new Set())
      byFamily.get(family).add(p.slug)
    }
  }
  const familyDuplicates = [...byFamily.entries()]
    .filter(([, slugs]) => slugs.size > 1)
    .map(([family, slugs]) => ({ family, products: [...slugs] }))
    .filter((f) => !exactDuplicates.some((d) => d.url.replace(/-\d+(\.[a-z0-9]+)$/i, '$1') === f.family))

  const noImage = perProduct.filter((p) => (p.images?.length ?? 0) === 0)
  const broken = perProduct.filter((p) => p.brokenImages.length > 0)
  const semantic = perProduct.filter((p) => p.semanticSuspicion)

  return {
    apiTotal: list.total ?? items.length,
    fetched: items.length,
    products: perProduct,
    probes: [...probes.values()],
    summary: {
      products: perProduct.length,
      imageUrls: urls.length,
      urlsOk: [...probes.values()].filter((p) => p.status === 200 && /^image\//i.test(p.contentType)).length,
      urlsBroken: [...probes.values()].filter((p) => !(p.status === 200 && /^image\//i.test(p.contentType))).length,
      productsWithoutImage: noImage.map((p) => p.slug),
      productsWithBrokenImage: broken.map((p) => ({ slug: p.slug, broken: p.brokenImages })),
      exactDuplicatePhotos: exactDuplicates,
      familySharedPhotos: familyDuplicates,
      semanticSuspects: semantic.map((p) => ({ slug: p.slug, name: p.name, primary: p.images[0]?.url ?? null })),
    },
  }
}

/* ------------------------------------------------------------------ */
/* Rapport Markdown                                                    */
/* ------------------------------------------------------------------ */

function mdEscape(s) {
  return String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

function buildReport(result) {
  const { meta, pages, responsive, themes, crosscheck, summary } = result
  const L = []
  const push = (...args) => L.push(...args)

  push(`# Audit exhaustif des images & médias — ReVends`)
  push('')
  push(`- **Cible** : \`${meta.base}`+'`')
  push(`- **Date** : ${meta.startedAt} → ${meta.finishedAt}`)
  push(`- **Navigateur** : Chromium (Playwright ${meta.playwrightVersion ?? 'n/a'})`)
  push(`- **Périmètre** : ${pages.length} inventaires de page (${meta.routeCount} routes × ${meta.inventoryWidths.join('/')} px), ${themes.length} passes thèmes, ${responsive.length} mesures responsive (15 largeurs)`)
  push(`- **Admin** : ${meta.adminConnected ? 'connecté (session réelle)' : 'NON connecté — pages admin non recettées'}`)
  push(`- **Corrections appliquées** : 0 (mission d’audit en lecture seule)`)
  if (meta.faultInjection) {
    push(`- ⚠️ **Injection de panne contrôlée** : toutes les requêtes contenant \`${meta.faultInjection}\` ont été avortées côté navigateur — ce rapport prouve que le harnais **détecte** une image cassée (il ne décrit pas l’état nominal).`)
  }
  push('')
  push('## 1. Synthèse chiffrée')
  push('')
  push('| Indicateur | Valeur |')
  push('| --- | ---: |')
  push(`| Pages auditées (inventaires) | ${summary.pages} |`)
  push(`| Images \`<img>\` inspectées | ${summary.images} |`)
  push(`| Images chargées (naturalWidth > 0) | ${summary.imagesLoaded} |`)
  push(`| Images visibles | ${summary.imagesVisible} |`)
  push(`| Images obligatoires | ${summary.imagesRequired} |`)
  push(`| Images facultatives | ${summary.imagesOptional} |`)
  push(`| Images cassées / non décodées (visibles) | ${summary.imagesBroken} |`)
  push(`| Replis SVG « Illustration » affichés | ${summary.svgFallbacks} |`)
  push(`| URLs d’image en erreur HTTP | ${summary.imageHttpErrors} |`)
  push(`| MIME non-image sur URL image | ${summary.mimeMismatches} |`)
  push(`| Pages avec scroll horizontal | ${summary.horizontalOverflowPages} |`)
  push(`| Réponses réseau ≥ 400 (toutes) | ${summary.networkErrors} |`)
  push(`| Anomalies P0 / P1 / P2 / P3 | ${summary.bySeverity.P0} / ${summary.bySeverity.P1} / ${summary.bySeverity.P2} / ${summary.bySeverity.P3} |`)
  push('')
  push('> Lecture : une image « chargée » est une `<img>` dont `complete === true` et `naturalWidth > 0` après défilement complet. Un repli SVG signifie qu’une photo a échoué et a été **silencieusement remplacée** par l’illustration de secours de `SiteImage` : c’est une anomalie même si la page « semble » correcte.')
  push('')

  push('## 2. Anomalies réelles (triées par gravité)')
  push('')
  const all = pages.flatMap((p) => p.anomalies)
  if (!all.length) {
    push('_Aucune anomalie détectée._')
  } else {
    push('| # | Gravité | Page | Élément / URL | Problème | Cause probable | Type | Statut |')
    push('| ---: | --- | --- | --- | --- | --- | --- | --- |')
    all
      .slice()
      .sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || a.page.localeCompare(b.page))
      .forEach((a, i) => {
        push(
          `| ${i + 1} | **${a.severity}** | \`${mdEscape(a.page)}\` (${a.width}px) | \`${mdEscape(a.url)}\` | ${mdEscape(a.problem)} | ${mdEscape(a.probableCause)} | ${a.requirement} | ouvert |`,
        )
      })
  }
  push('')
  push('> Détail complet (sélecteur CSS, dimensions, en-têtes, réseau) : `docs/audit/images-inventory.json`.')
  push('')

  push('## 3. Matrice responsive — 15 largeurs')
  push('')
  push('Contrôles par largeur : `documentElement.scrollWidth === clientWidth`, et aucune image visible hors viewport.')
  push('')
  const overflowWidths = responsive.filter((r) => r.overflowPx > 0)
  const overflowImages = responsive.filter((r) => r.overflowingImgs.length > 0)
  push(`- Largeurs testées : ${WIDTHS.map((w) => w.width).join(', ')} px`)
  push(`- Mesures : **${responsive.length}**`)
  push(`- Débordements horizontaux : **${overflowWidths.length}**`)
  push(`- Images débordantes : **${overflowImages.length}**`)
  if (overflowWidths.length || overflowImages.length) {
    push('')
    push('| Page | Largeur | scrollWidth | clientWidth | Débord (px) | Images hors viewport | Coupables |')
    push('| --- | ---: | ---: | ---: | ---: | ---: | --- |')
    for (const r of [...responsive].filter((r) => r.overflowPx > 0 || r.overflowingImgs.length).sort((a, b) => a.route.localeCompare(b.route) || a.width - b.width)) {
      push(
        `| \`${mdEscape(r.route)}\` | ${r.width} | ${r.scrollWidth} | ${r.clientWidth} | ${r.overflowPx} | ${r.overflowingImgs.length} | ${mdEscape((r.guilty ?? []).join(', '))} |`,
      )
    }
  } else {
    push('')
    push('✅ Aucun débordement horizontal ni image hors viewport sur les 15 largeurs.')
  }
  push('')

  push('## 4. Thèmes sombre / clair')
  push('')
  push('| Thème | Page | data-theme | Images | Chargées | Cassées | Anomalies |')
  push('| --- | --- | --- | ---: | ---: | ---: | ---: |')
  for (const t of themes) {
    const loaded = t.dom.images.filter((i) => i.naturalWidth > 0).length
    const broken = t.dom.images.filter((i) => i.complete && i.naturalWidth === 0 && i.visibility.visible).length
    push(`| ${t.theme} | \`${mdEscape(t.route.path)}\` | ${t.themeApplied} | ${t.dom.images.length} | ${loaded} | ${broken} | ${t.anomalies.length} |`)
  }
  push('')
  const themeAnoms = themes.flatMap((t) => t.anomalies)
  if (themeAnoms.length) {
    push('Anomalies propres aux thèmes :')
    push('')
    for (const a of themeAnoms) push(`- **${a.severity}** \`${a.page}\` (${a.theme}) — ${a.problem} — \`${a.url}\``)
  } else {
    push('✅ Aucune anomalie image propre à un thème (mêmes ressources dans les deux modes).')
  }
  push('')

  push('## 5. Réseau image')
  push('')
  const imgNet = pages.flatMap((p) => p.network).filter((n) => isImageUrl(n.url) || n.resourceType === 'image')
  const byStatus = imgNet.reduce((acc, n) => {
    acc[n.status] = (acc[n.status] ?? 0) + 1
    return acc
  }, {})
  push('| Statut | Occurrences |')
  push('| ---: | ---: |')
  for (const [s, c] of Object.entries(byStatus).sort((a, b) => Number(a[0]) - Number(b[0]))) push(`| ${s} | ${c} |`)
  push('')
  const failures = imgNet.filter((n) => n.status >= 400 || n.failure)
  if (failures.length) {
    push('| URL | Statut | Content-Type | Taille | Type | Page |')
    push('| --- | ---: | --- | ---: | --- | --- |')
    const seen = new Set()
    for (const n of failures) {
      const k = `${n.url}|${n.status}`
      if (seen.has(k)) continue
      seen.add(k)
      push(`| \`${mdEscape(stripHash(n.url))}\` | ${n.status || n.failure} | ${mdEscape(n.contentType || '—')} | ${n.size ?? '—'} | ${n.resourceType} | — |`)
    }
  } else {
    push('✅ Aucune requête image en échec (toutes 200 + content-type image/*).')
  }
  push('')

  push('## 6. Vérification croisée produits ↔ images (API réelles)')
  push('')
  const cs = crosscheck
  push('| Indicateur | Valeur |')
  push('| --- | ---: |')
  push(`| Produits listés par l’API | ${cs.apiTotal} (récupérés : ${cs.fetched}) |`)
  push(`| URLs d’image distinctes | ${cs.summary.imageUrls} |`)
  push(`| URLs 200 + image/* | ${cs.summary.urlsOk} |`)
  push(`| URLs cassées / non-image | ${cs.summary.urlsBroken} |`)
  push(`| Produits sans image | ${cs.summary.productsWithoutImage.length} |`)
  push(`| Produits avec image cassée | ${cs.summary.productsWithBrokenImage.length} |`)
  push(`| Photos identiques entre produits distincts | ${cs.summary.exactDuplicatePhotos.length} |`)
  push(`| Familles de photos partagées | ${cs.summary.familySharedPhotos.length} |`)
  push(`| Suspicions sémantiques (nom ↔ fichier) | ${cs.summary.semanticSuspects.length} |`)
  push('')
  if (cs.summary.exactDuplicatePhotos.length) {
    push('### Photos strictement identiques entre produits distincts')
    push('')
    push('| URL | Produits | HTTP | Content-Type |')
    push('| --- | --- | ---: | --- |')
    for (const d of cs.summary.exactDuplicatePhotos) {
      push(`| \`${mdEscape(d.url)}\` | ${d.products.map((s) => `\`${s}\``).join(', ')} | ${d.probe?.status ?? '—'} | ${mdEscape(d.probe?.contentType ?? '—')} |`)
    }
    push('')
  }
  if (cs.summary.familySharedPhotos.length) {
    push('### Familles de fichiers partagées (-1/-2)')
    push('')
    for (const f of cs.summary.familySharedPhotos) push(`- \`${mdEscape(f.family)}\` → ${f.products.map((s) => `\`${s}\``).join(', ')}`)
    push('')
  }
  if (cs.summary.productsWithBrokenImage.length) {
    push('### Produits avec image cassée')
    push('')
    for (const p of cs.summary.productsWithBrokenImage) {
      push(`- \`${p.slug}\` : ${p.broken.map((b) => `\`${b.url}\` → ${b.probe?.status ?? 0} ${b.probe?.contentType ?? ''}`).join(', ')}`)
    }
    push('')
  }
  if (cs.summary.semanticSuspects.length) {
    push('### Suspicions sémantiques (photo sans rapport lexical avec le produit)')
    push('')
    push('| Produit | Photo principale | Recouvrement de mots |')
    push('| --- | --- | --- |')
    for (const s of cs.summary.semanticSuspects) push(`| \`${s.slug}\` | \`${mdEscape(s.primary ?? '—')}\` | 0 |`)
    push('')
    push('> Ces écarts ne cassent pas l’affichage mais trompent l’acheteur (ex. clavier illustré par une montre). À traiter côté données de démonstration.')
    push('')
  }

  push('## 7. Pages non recettées / limites')
  push('')
  if (summary.skipped.length) {
    for (const s of summary.skipped) push(`- \`${s.path}\` — ${s.reason}`)
  } else {
    push('Aucune page prévue n’a été sautée.')
  }
  push('')
  push('## 8. Méthode (reproductible)')
  push('')
  push('```bash')
  push('# mot de passe lu depuis le conteneur, jamais affiché')
  push('cd web && AUDIT_ADMIN_PASSWORD="$(docker inspect revends_api1 --format \'{{range .Config.Env}}{{println .}}{{end}}\' | grep \'^ADMIN_PASSWORD=\' | cut -d= -f2-)" \\')
  push('  node scripts/media-audit.mjs http://127.0.0.1:8080')
  push('```')
  push('')
  push('1. Récupération d’un slug produit réel via `GET /api/products?per_page=48`.')
  push('2. Connexion admin via `POST /api/auth/login` (double soumission CSRF), cookie de session réutilisé.')
  push('3. Pour chaque route : `goto` → `load` + `networkidle` → défilement complet (lazy) → attente `complete`/`decode()` → extraction DOM + réseau.')
  push('4. Anomalies dérivées de mesures (pas d’heuristique d’apparence) : `naturalWidth`, `complete`, `decode()`, statut HTTP, `content-type`, `getBoundingClientRect()`, `scrollWidth/clientWidth`.')
  push('5. Matrice responsive 15 largeurs + 2 thèmes (`localStorage[\'rv:theme\']`).')
  push('6. Cross-check produits via API + `HEAD` sur chaque URL d’image.')
  push('')
  push(`_Rapport généré automatiquement par \`web/scripts/media-audit.mjs\` — aucune correction appliquée._`)
  push('')
  return L.join('\n')
}

/* ------------------------------------------------------------------ */
/* Orchestration                                                       */
/* ------------------------------------------------------------------ */

async function loginAdmin(context, page) {
  if (!ADMIN_PASSWORD) return { connected: false, reason: 'mot de passe admin introuvable' }
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => undefined)
  let cookies = await context.cookies()
  if (!cookies.some((c) => c.name === 'csrf_token')) {
    await context.request.get(`${BASE}/api/categories`).catch(() => undefined)
    cookies = await context.cookies()
  }
  const csrf = cookies.find((c) => c.name === 'csrf_token')?.value
  const res = await context.request
    .post(`${BASE}/api/auth/login`, {
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
      data: { identifier: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      timeout: 20_000,
    })
    .catch((err) => ({ status: () => 0, ok: () => false, text: async () => String(err) }))
  if (!res.ok()) {
    return { connected: false, reason: `login ${res.status()}` }
  }
  const me = await context.request.get(`${BASE}/api/auth/me`, { timeout: 15_000 }).catch(() => null)
  const body = me && me.ok() ? await me.json().catch(() => null) : null
  return { connected: Boolean(body?.user), reason: body?.user ? `admin ${ADMIN_EMAIL}` : 'session non reconnue' }
}

async function main() {
  const startedAt = nowIso()
  mkdirSync(OUT_DIR, { recursive: true })

  // 1. Produit réel (slug) via l'API, avec repli explicite.
  let productSlug = 'chemise-lin-ecru'
  let productSource = 'repli statique'
  try {
    const list = await apiJson('/api/products?per_page=48')
    const first = list.items?.[0]
    if (first?.slug) {
      productSlug = first.slug
      productSource = 'API /api/products'
    }
  } catch (err) {
    productSource = `API indisponible (${err.message})`
  }

  const ROUTES = routes(productSlug)

  const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] })

  /*
   * DEUX contextes isolés — indispensable pour la justesse de l'audit :
   *  · anonyme : /login et /register montrent réellement le formulaire + le
   *    visuel `aside.art` ; avec une session admin, elles affichent
   *    « Vous êtes connecté·e » et l'image testée n'est plus la bonne ;
   *  · admin   : seules les routes /admin en ont besoin.
   * Les mélanger produisait un faux négatif de couverture (constaté au smoke).
   */
  const contextOptions = {
    viewport: { width: 1440, height: 900 },
    locale: 'fr-FR',
    timezoneId: 'Africa/Dakar',
    deviceScaleFactor: 1,
  }

  function attachConsole(page) {
    const errors = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text().slice(0, 300))
    })
    page.on('pageerror', (err) => errors.push(`pageerror: ${String(err.message).slice(0, 300)}`))
    return errors
  }

  const anonContext = await browser.newContext(contextOptions)
  const anonPage = await anonContext.newPage()
  const anonErrors = attachConsole(anonPage)
  const anonSpy = attachNetworkSpy(anonPage)

  const adminContext = await browser.newContext(contextOptions)
  const adminPage = await adminContext.newPage()
  const adminErrors = attachConsole(adminPage)
  const adminSpy = attachNetworkSpy(adminPage)
  const auth = await loginAdmin(adminContext, adminPage)

  /*
   * Injection de panne CONTRÔLÉE (preuve que le harnais sait échouer).
   * Exemple : AUDIT_FAULT_IMAGE=sac-a-main-en-cuir-1.jpg
   * Aucun fichier source n'est touché : on coupe la requête côté navigateur.
   * Les rapports sont écrits avec le suffixe `-fault` pour ne pas écraser
   * l'audit nominal.
   */
  const FAULT_IMAGE = process.env.AUDIT_FAULT_IMAGE ?? ''
  if (FAULT_IMAGE) {
    const re = new RegExp(FAULT_IMAGE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    await anonContext.route(re, (route) => route.abort('failed'))
    await adminContext.route(re, (route) => route.abort('failed'))
    console.log(`[media-audit] injection de panne : requêtes contenant "${FAULT_IMAGE}" avortées.`)
  }

  const pages = []
  const skipped = []

  for (const route of ROUTES) {
    if (route.admin && !auth.connected) {
      skipped.push({ path: route.path, reason: 'admin non connecté' })
      continue
    }
    const page = route.admin ? adminPage : anonPage
    const spy = route.admin ? adminSpy : anonSpy
    const errors = route.admin ? adminErrors : anonErrors
    for (const vp of INVENTORY_WIDTHS) {
      errors.length = 0
      const rec = await scanAtWidth(page, spy, route, vp, null, { consoleErrors: errors.slice() })
      // Si une route admin redirige vers /login, la mesure d'images n'a pas de sens.
      if (route.admin && !rec.finalPath.startsWith('/admin')) {
        skipped.push({ path: route.path, reason: `redirigé vers ${rec.finalPath} (session non reconnue)` })
        rec.redirectedTo = rec.finalPath
      }
      pages.push(rec)
    }
  }

  // 2. Matrice responsive (15 largeurs) — une passe par route à 1440.
  const responsive = []
  if (process.env.AUDIT_SKIP_RESPONSIVE !== '1') {
    for (const route of ROUTES) {
      if (route.admin && !auth.connected) continue
      const page = route.admin ? adminPage : anonPage
      await page.setViewportSize({ width: 1440, height: 900 })
      await gotoRoute(page, route.path)
      const measures = await measureResponsive(page)
      for (const m of measures) responsive.push({ route: route.path, name: route.name, ...m })
    }
  }

  // 3. Thèmes (sombre / clair) sur / et /shop — contexte anonyme dédié.
  const themes = []
  if (process.env.AUDIT_SKIP_THEMES !== '1') {
    for (const theme of THEMES) {
      const themeContext = await browser.newContext(contextOptions)
      await themeContext.addInitScript((t) => {
        try {
          localStorage.setItem('rv:theme', t)
        } catch {
          /* stockage indisponible */
        }
      }, theme)
      const themePage = await themeContext.newPage()
      const themeSpy = attachNetworkSpy(themePage)
      for (const route of ROUTES.filter((r) => ['accueil', 'boutique'].includes(r.name))) {
        const rec = await scanAtWidth(themePage, themeSpy, route, { width: 1440, height: 900 }, theme, {})
        rec.theme = theme
        themes.push(rec)
      }
      themeSpy.detach()
      await themeContext.close()
    }
  }

  // 4. Cross-check produits (API).
  let crosscheck = { products: [], probes: [], summary: { imageUrls: 0, urlsOk: 0, urlsBroken: 0, productsWithoutImage: [], productsWithBrokenImage: [], exactDuplicatePhotos: [], familySharedPhotos: [], semanticSuspects: [] }, apiTotal: 0, fetched: 0 }
  if (process.env.AUDIT_SKIP_CROSSCHECK !== '1') {
    try {
      crosscheck = await crossCheckProducts()
    } catch (err) {
      crosscheck.error = String(err)
    }
  }

  anonSpy.detach()
  adminSpy.detach()
  await anonContext.close()
  await adminContext.close()
  await browser.close()

  /* ------------------------- Agrégation ------------------------- */

  const allAnomalies = pages.flatMap((p) => p.anomalies)
  const bySeverity = { P0: 0, P1: 0, P2: 0, P3: 0 }
  for (const a of allAnomalies) bySeverity[a.severity] = (bySeverity[a.severity] ?? 0) + 1

  const images = pages.flatMap((p) => p.images)
  const summary = {
    pages: pages.length,
    images: images.length,
    imagesLoaded: images.filter((i) => i.naturalWidth > 0).length,
    imagesVisible: images.filter((i) => i.visibility.visible).length,
    imagesRequired: images.filter((i) => i.requirement === 'obligatoire').length,
    imagesOptional: images.filter((i) => i.requirement === 'facultative').length,
    imagesBroken: images.filter((i) => i.visibility.visible && i.complete && i.naturalWidth === 0).length,
    svgFallbacks: pages.reduce((n, p) => n + p.dom.svgs.filter((s) => s.ariaLabel === 'Illustration' && s.visible).length, 0),
    imageHttpErrors: 0,
    mimeMismatches: allAnomalies.filter((a) => a.kind === 'mime-non-image').length,
    horizontalOverflowPages: pages.filter((p) => p.dom.scroll.horizontalOverflow).length,
    networkErrors: pages.reduce(
      (n, p) =>
        n +
        p.network.filter(
          (x) => (x.status >= 400 || x.failure) && !(x.status === 401 && /\/api\/auth\/me(\?|$)/.test(x.url)),
        ).length,
      0,
    ),
    bySeverity,
    skipped,
    productSlug,
    productSource,
  }

  // imageHttpErrors réel : compter les URLs d'image distinctes en erreur.
  const errorImageUrls = new Set()
  for (const p of pages) {
    for (const n of p.network) {
      if ((isImageUrl(n.url) || n.resourceType === 'image') && n.status >= 400) errorImageUrls.add(stripHash(n.url))
    }
  }
  summary.imageHttpErrors = errorImageUrls.size
  summary.imageHttpErrorUrls = [...errorImageUrls]

  const result = {
    meta: {
      base: BASE,
      origin: ORIGIN,
      startedAt,
      finishedAt: nowIso(),
      node: process.version,
      platform: process.platform,
      adminConnected: auth.connected,
      adminReason: auth.reason,
      inventoryWidths: INVENTORY_WIDTHS.map((w) => w.width),
      responsiveWidths: WIDTHS.map((w) => w.width),
      themes: THEMES,
      routeCount: ROUTES.length,
      productSlug,
      productSource,
      readOnly: true,
      faultInjection: FAULT_IMAGE || null,
    },
    summary,
    routes: ROUTES,
    pages,
    responsive,
    themes,
    crosscheck,
  }

  const suffix = FAULT_IMAGE ? '-fault' : ''
  const jsonPath = join(OUT_DIR, `images-inventory${suffix}.json`)
  const mdPath = join(OUT_DIR, `images-report${suffix}.md`)
  writeFileSync(jsonPath, JSON.stringify(result, null, 2))
  writeFileSync(mdPath, buildReport(result))

  /* ------------------------- Console ------------------------- */

  console.log('')
  console.log('=== AUDIT IMAGES / MÉDIAS — RÉSUMÉ ===')
  console.log(`base=${BASE} admin=${auth.connected ? 'OK' : 'NON'} produit=${productSlug}`)
  console.log(`pages=${summary.pages} images=${summary.images} chargées=${summary.imagesLoaded} cassées=${summary.imagesBroken} obligatoires=${summary.imagesRequired}`)
  console.log(`replis SVG=${summary.svgFallbacks} http-erreurs-images=${summary.imageHttpErrors} mime-non-image=${summary.mimeMismatches}`)
  console.log(`scroll-horizontal pages=${summary.horizontalOverflowPages} réseau>=400=${summary.networkErrors}`)
  console.log(`anomalies P0=${bySeverity.P0} P1=${bySeverity.P1} P2=${bySeverity.P2} P3=${bySeverity.P3}`)
  console.log(`responsive mesures=${responsive.length} débordements=${responsive.filter((r) => r.overflowPx > 0).length} images-hors-viewport=${responsive.filter((r) => r.overflowingImgs.length).length}`)
  console.log(`crosscheck produits=${crosscheck.summary?.products ?? 0} urls=${crosscheck.summary?.imageUrls ?? 0} cassées=${crosscheck.summary?.urlsBroken ?? 0} doublons=${crosscheck.summary?.exactDuplicatePhotos?.length ?? 0}`)
  if (skipped.length) console.log(`pages sautées=${skipped.length} (${skipped.map((s) => s.path).join(', ')})`)
  console.log(`JSON : ${jsonPath}`)
  console.log(`MD   : ${mdPath}`)
  console.log('')

  // Code de sortie : 2 si P0 (image obligatoire cassée) pour usage CI.
  process.exitCode = bySeverity.P0 > 0 ? 2 : 0
}

await main().catch((err) => {
  console.error('[media-audit] échec :', err?.stack ?? err)
  process.exitCode = 1
})
