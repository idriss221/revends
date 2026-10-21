/*
 * bureau-css.mjs — Scoping build-time du design system de la maquette REVENDS.
 *
 * Pourquoi ce script existe
 * --------------------------
 * La maquette (`/home/dioufidriss/Bureau/main`) est un site autonome dont les
 * feuilles (`assets/{styles,editorial,theme}.css`) définissent des sélecteurs
 * GLOBAUX (`:root`, `body`, `.card`, `.btn`, `header.site`…). Les charger tel
 * quel dans l'app React casserait l'admin (Tailwind emploie aussi `.grid`,
 * `.card`…). On conserve donc les sources VERBATIM dans
 * `src/bureau/vendor/*.css` (copies conformes de la maquette, md5 identiques)
 * et on génère une version SCOPÉE : chaque sélecteur est préfixé par
 * `.market-site`, posé sur le conteneur unique du site public par `SiteShell`.
 * Résultat : zéro fuite vers l'admin (`.market-admin`).
 *
 * Sortie : `src/styles/bureau.css` (FICHIER GÉNÉRÉ — ne jamais l'éditer à la
 * main, toute correction se pose dans `src/styles/bureau-fixes.css` ou ici).
 * Lancer : `npm run css:scope`
 *
 * Règles de scoping (vérifiées par diff sur la maquette) :
 *   :root { … }                      →  .market-site { … }
 *   html  { … }                      →  .market-site { … }
 *   body  { … }                      →  .market-site { … }
 *   body.home .top-strip { … }       →  .market-site.home .top-strip { … }
 *   :root[data-theme] body { … }     →  :root[data-theme] .market-site { … }
 *   :root[data-theme] .card { … }    →  :root[data-theme] .market-site .card { … }
 *   .card { … }                      →  .market-site .card { … }
 *   .theme-anim … { … }              →  :root.theme-anim .market-site … { … }
 *                                       (classe posée sur <html> par le
 *                                        bascule de thème : elle doit rester
 *                                        rattachée au document, pas à la
 *                                        vignette .market-site)
 * Les listes de sélecteurs sont reformatées (1 sélecteur par ligne) ;
 * corps de règle, commentaires, @media/@supports/@keyframes/@font-face sont
 * laissés intacts (@media et consorts sont parcourus récursivement).
 *
 * Renommage documenté : `.grid` → `.rv-grid` (collision avec l'utilitaire
 * Tailwind `.grid{display:grid}` ; voir `components/site/SiteBits.tsx`).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const vendor = join(here, '..', 'src', 'bureau', 'vendor')
const outFile = join(here, '..', 'src', 'styles', 'bureau.css')
const FILES = ['styles', 'editorial', 'theme']
const SCOPE = '.market-site'
/** Classe posée sur `<html>` pour animer le thème (maquette : documentElement). */
const ROOT_CLASSES = ['.theme-anim']
/** Renommages de sélecteurs imposés par l'app React (collision Tailwind). */
const RENAMES = [[/(?<![\w-])\.grid(?![\w-])/g, '.rv-grid']]
const WRAPPED_AT_RULES = ['media', 'supports', 'layer', 'container', 'document', 'scope']

const COMMENT = /\/\*[\s\S]*?\*\//g

/** Avance `i` au-delà d'un commentaire `/* … *​/` s'il commence à `src[i]`. */
function skipComment(src, i) {
  if (src[i] === '/' && src[i + 1] === '*') {
    const end = src.indexOf('*/', i + 2)
    return end < 0 ? src.length : end + 2
  }
  return i
}

/** Découpe une liste de sélecteurs sur les virgules de premier niveau. */
function splitSelectors(prelude) {
  const parts = []
  let depth = 0
  let cur = ''
  for (let i = 0; i < prelude.length; i++) {
    const c = skipComment(prelude, i)
    if (c !== i) {
      cur += prelude.slice(i, c)
      i = c - 1
      continue
    }
    const ch = prelude[i]
    if (ch === '"' || ch === "'") {
      const q = ch
      cur += ch
      i++
      while (i < prelude.length) {
        cur += prelude[i]
        if (prelude[i] === '\\') {
          i++
          if (i < prelude.length) cur += prelude[i]
        } else if (prelude[i] === q) break
        i++
      }
      continue
    }
    if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth--
    else if (ch === ',' && depth === 0) {
      parts.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  parts.push(cur)
  return parts
}

/** Applique les renommages (`.grid` → `.rv-grid`) à un sélecteur. */
function applyRenames(sel) {
  let out = sel
  for (const [re, to] of RENAMES) out = out.replace(re, to)
  return out
}

/** Scopes un sélecteur simple (voir l'en-tête du fichier pour la table). */
function scopeSelector(sel) {
  const lead = sel.match(/^\s*/)[0]
  const trail = sel.match(/\s*$/)[0]
  const s = sel.trim()
  if (!s) return sel

  let root = null
  let rest = ''

  const mRoot = s.match(/^(?::root|html)(?![\w-])/)
  if (mRoot) {
    // Racine : on lit le compose complet (`:root`, `:root[data-theme=…]`)
    // jusqu'au premier combinateur descendant.
    let j = mRoot[0].length
    let depth = 0
    let quote = null
    while (j < s.length) {
      const ch = s[j]
      if (quote) {
        if (ch === '\\') {
          j += 2
          continue
        }
        if (ch === quote) quote = null
        j++
        continue
      }
      if (ch === '"' || ch === "'") {
        quote = ch
        j++
        continue
      }
      if (ch === '(' || ch === '[') depth++
      else if (ch === ')' || ch === ']') depth--
      else if (depth === 0 && ' \t>+~'.includes(ch)) break
      j++
    }
    root = s.slice(0, j)
    rest = s.slice(j)
  } else {
    const rc = ROOT_CLASSES.find((c) => s === c || (s.startsWith(c) && !/^[\w-]/.test(s.slice(c.length))))
    if (rc) {
      root = `:root${rc}`
      rest = s.slice(rc.length)
    } else {
      const mBody = s.match(/^body(?![\w-])/)
      if (!mBody) return lead + applyRenames(`${SCOPE} ${s}`) + trail
      rest = s.slice(mBody[0].length)
    }
  }

  // Le `body` qui suit une racine DEVIENT le scope : on le retire avec les
  // espaces qui le précèdent (le scope remplace l'élément, il n'en est pas
  // un descendant), en conservant ceux qui le suivent (classes du body).
  rest = rest.replace(/^\s*body(?![\w-])/, '')

  const bareRoot = root === null || root === ':root' || root === 'html'
  const out = rest === '' ? (bareRoot ? SCOPE : `${root} ${SCOPE}`) : bareRoot ? SCOPE + rest : `${root} ${SCOPE}${rest}`
  return lead + applyRenames(out) + trail
}

/**
 * Scopes un préambule en conservant blancs/commentaires de bord :
 * `« blancs+commentaires » + liste de sélecteurs (1 par ligne) + « fins »`.
 */
function scopePrelude(prelude) {
  let i = 0
  while (i < prelude.length) {
    if (/\s/.test(prelude[i])) {
      i++
      continue
    }
    const m = prelude.slice(i).match(/^\/\*[\s\S]*?\*\//)
    if (m) {
      i += m[0].length
      continue
    }
    break
  }
  const prefix = prelude.slice(0, i)

  let j = prelude.length
  while (j > 0) {
    if (/\s/.test(prelude[j - 1])) {
      j--
      continue
    }
    let closed = null
    for (const m of prelude.slice(0, j).matchAll(/\/\*[\s\S]*?\*\//g)) {
      if (m.index + m[0].length === j) closed = m
    }
    if (closed) {
      j = closed.index
      continue
    }
    break
  }
  const suffix = prelude.slice(j)

  const parts = splitSelectors(prelude.slice(i, j))
    .map((p) => p.trim())
    .map((p) => (p ? scopeSelector(p) : ''))
  return prefix + parts.join(',\n') + suffix
}

/** Transforme récursivement le contenu d'un bloc (liste de règles). */
function transformBlock(src) {
  let out = ''
  let i = 0
  while (i < src.length) {
    const c = skipComment(src, i)
    if (c !== i) {
      out += src.slice(i, c)
      i = c
      continue
    }
    const start = i
    let depth = 0
    let quote = null
    while (i < src.length) {
      const cc = skipComment(src, i)
      if (cc !== i) {
        i = cc
        continue
      }
      const ch = src[i]
      if (quote) {
        if (ch === '\\') {
          i += 2
          continue
        }
        if (ch === quote) quote = null
        i++
        continue
      }
      if (ch === '"' || ch === "'") {
        quote = ch
        i++
        continue
      }
      if (ch === '(' || ch === '[') depth++
      else if (ch === ')' || ch === ']') depth--
      else if (ch === '{' && depth === 0) break
      else if (ch === ';' && depth === 0) break
      i++
    }
    const prelude = src.slice(start, i)
    if (i >= src.length) {
      out += prelude
      break
    }
    if (src[i] === ';') {
      out += prelude + ';'
      i++
      continue
    }
    const bodyStart = i + 1
    let j = bodyStart
    let d = 0
    let q = null
    while (j < src.length) {
      const cc = skipComment(src, j)
      if (cc !== j) {
        j = cc
        continue
      }
      const ch = src[j]
      if (q) {
        if (ch === '\\') {
          j += 2
          continue
        }
        if (ch === q) q = null
        j++
        continue
      }
      if (ch === '"' || ch === "'") {
        q = ch
        j++
        continue
      }
      if (ch === '{') d++
      else if (ch === '}') {
        if (d === 0) break
        d--
      }
      j++
    }
    const body = src.slice(bodyStart, j)
    const trimmed = prelude.replace(COMMENT, '').trim()
    if (trimmed.startsWith('@')) {
      const name = trimmed.slice(1).split(/[\s(;]/)[0].toLowerCase()
      out +=
        prelude +
        '{' +
        (WRAPPED_AT_RULES.includes(name) ? transformBlock(body) : body) +
        '}'
    } else {
      out += scopePrelude(prelude) + '{' + body + '}'
    }
    i = j + 1
  }
  return out
}

const HEADER =
  `/* =====================================================================\n` +
  `   BUREAU/MAIN — design system porté, PORTÉ SOUS .market-site\n` +
  `   Généré depuis src/bureau/vendor/{styles,editorial,theme}.css\n` +
  `   (copies verbatim, md5 identiques, de /home/dioufidriss/Bureau/main/assets/).\n` +
  `   Chaque sélecteur est préfixé par .market-site : l'admin (\`.market-admin\`) et le\n` +
  `   reste de l'app ne sont JAMAIS touchés. Ne pas éditer à la main : régénérer\n` +
  `   via \`npm run css:scope\` (scripts/bureau-css.mjs) ; toute dérogation vit\n` +
  `   dans src/styles/bureau-fixes.css.\n` +
  `   ===================================================================== */\n\n`

mkdirSync(dirname(outFile), { recursive: true })
let ok = true
let result = HEADER
for (const file of FILES) {
  const raw = readFileSync(join(vendor, `${file}.css`), 'utf8')
  const scoped = transformBlock(raw)
  const open = (scoped.match(/{/g) || []).length
  const close = (scoped.match(/}/g) || []).length
  if (open !== close) {
    ok = false
    console.error(`[bureau-css] ${file}.css : accolades déséquilibrées {=${open} }=${close}`)
  }
  result += `/* ===================== ${file}.css (Bureau/main, scopé .market-site) ===================== */\n${scoped}`
  if (file !== FILES[FILES.length - 1]) result += '\n'
  console.log(`[bureau-css] ${file}.css scopé (${open} règles)`)
}
writeFileSync(outFile, result)
console.log(`[bureau-css] écrit ${outFile}`)
process.exit(ok ? 0 : 1)
