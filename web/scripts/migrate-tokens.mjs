/**
 * Migration des tokens — ancien jeu (docs/design-system.md §2) → REVENDS 2026
 * (docs/design-system-revends-v5.md §1.3, tableau de correspondance).
 *
 * Usage : node scripts/migrate-tokens.mjs [--check]
 *   --check : n'écrit rien, sort le rapport des occurrences restantes.
 *
 * Règle : le plus long d'abord (bg-primary-dark avant bg-primary).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'src')

/** [motif, remplacement] — ordre significatif (longueur décroissante). */
const MAP = [
  // ── Ombres ────────────────────────────────────────────────
  ['shadow-soft', 'shadow-sm'],
  ['shadow-card', 'shadow-sm'],
  ['shadow-hover', 'shadow-md'],
  ['shadow-floating', 'shadow-lg'],
  ['shadow-[0_2px_12px_rgba(26,26,46,0.08)]', 'shadow-nav'],
  ['shadow-[0_0_0_3px_rgba(255,107,53,0.15)]', 'shadow-focus'],
  ['shadow-[0_0_0_3px_rgba(255,107,53,0.4)]', 'shadow-focus'],
  ['shadow-[0_0_0_3px_rgba(200,90,42,0.35)]', 'shadow-focus'],
  ['shadow-[0_4px_12px_rgba(255,107,53,0.4)]', 'shadow-cta'],
  ['shadow-[0_4px_10px_rgba(255,107,53,0.35)]', 'shadow-cta'],
  ['shadow-[0_10px_30px_rgba(255,107,53,0.4)]', 'shadow-cta'],
  ['shadow-[0_10px_30px_rgba(0,200,83,0.35)]', 'shadow-sm'],
  ['shadow-[0_4px_12px_rgba(0,0,0,0.08)]', 'shadow-sm'],
  ['shadow-[0_4px_12px_rgba(0,0,0,0.05)]', 'shadow-sm'],
  ['shadow-[0_20px_60px_rgba(0,0,0,0.3)]', 'shadow-lg'],
  ['shadow-[0_2px_10px_rgba(0,0,0,0.1)]', 'shadow-nav'],
  [' drop-shadow-[0_1px_2px_rgba(26,26,46,0.5)]', ''],

  // ── Rayons (§1.5 : 12 / 16 / 20) ─────────────────────────
  ['rounded-[8px]', 'rounded-sm'],
  ['rounded-[10px]', 'rounded-md'],
  ['rounded-[12px]', 'rounded-sm'],
  ['rounded-[14px]', 'rounded-sm'],
  ['rounded-[15px]', 'rounded-md'],
  ['rounded-[20px]', 'rounded-lg'],
  ['rounded-[24px]', 'rounded-lg'],
  ['rounded-[30px]', 'rounded-lg'],

  // ── Couleurs d'état par rôle ──────────────────────────────
  ['hover:bg-primary-dark', 'hover:bg-terracotta-deep'],
  ['hover:text-primary-dark', 'hover:text-terracotta-deep'],
  ['hover:border-primary-dark', 'hover:border-terracotta-deep'],
  ['bg-primary-dark', 'bg-terracotta-deep'],
  ['text-primary-dark', 'text-terracotta-deep'],
  ['hover:bg-primary', 'hover:bg-terracotta-deep'],
  ['hover:text-primary', 'hover:text-terracotta-deep'],
  ['hover:border-primary', 'hover:border-terracotta-strong'],
  ['focus:border-primary', 'focus:border-terracotta-strong'],
  ['active:bg-primary', 'active:bg-terracotta-deep'],
  ['bg-primary', 'bg-terracotta-strong'],
  ['text-primary', 'text-terracotta-ink'],
  ['border-primary', 'border-terracotta'],
  ['ring-primary', 'ring-terracotta'],

  ['hover:bg-secondary', 'hover:bg-ink'],
  ['bg-secondary', 'bg-chocolate'],
  ['text-secondary', 'text-chocolate'],

  ['bg-bg', 'bg-ivory'],
  ['text-bg', 'text-ivory'],
  ['border-bg', 'border-ivory'],

  ['text-gray-light', 'text-faint'],
  ['border-gray-light', 'border-line'],
  ['bg-gray-light', 'bg-line'],
  ['text-gray', 'text-muted'],
  ['border-gray', 'border-line'],
  ['bg-gray', 'bg-line'],
  ['--color-gray-light', '--color-line'],
  ['--color-gray', '--color-muted'],
  ['--color-bg', '--color-ivory'],
  ['--color-primary', '--color-terracotta'],
  ['--color-primary-dark', '--color-terracotta-deep'],
  ['--color-secondary', '--color-chocolate'],
  ['--color-success', '--color-positive'],
  ['--color-danger', '--color-danger'],

  ['hover:bg-success', 'hover:bg-positive-dark'],
  ['bg-success', 'bg-positive'],
  ['text-success', 'text-positive'],
  ['bg-soft-success', 'bg-positive-soft'],

  ['bg-soft-info', 'bg-terracotta-soft'],
  ['bg-soft-orange', 'bg-terracotta-soft'],
  ['bg-soft-warning', 'bg-champagne-soft'],
  ['bg-soft-purple', 'bg-champagne-soft'],
  ['bg-soft-danger', 'bg-danger-soft'],
  ['text-amber-deep', 'text-chocolate'],
  ['text-purple-icon', 'text-chocolate'],

  ['hover:bg-danger', 'hover:bg-danger-dark'],
  ['hover:text-danger', 'hover:text-danger-dark'],
  ['hover:bg-[#00ba4d]', 'hover:bg-positive-dark'],
  ['hover:bg-[#004980]', 'hover:bg-ink'],
  ['hover:bg-[#ed153f]', 'hover:bg-danger-dark'],

  // ── Voiles & halos ────────────────────────────────────────
  ['bg-[rgba(26,26,46,0.5)]', 'bg-overlay'],
  ['bg-[rgba(23,21,19,0.5)]', 'bg-overlay'],
  ['bg-[rgba(255,107,53,0.05)]', 'bg-terracotta-wash'],
  ['bg-[rgba(255,107,53,0.04)]', 'bg-terracotta-wash'],
  ['bg-[rgba(255,107,53,0.15)]', 'bg-terracotta-wash'],
  ['ring-primary/30', 'ring-terracotta/30'],

  // ── Combinaisons à ré-accorder après coup (spec §3.5/§4.2) ─
  ['bg-terracotta-soft text-chocolate', 'bg-terracotta-soft text-terracotta-ink'],
  ['bg-terracotta-soft text-muted', 'bg-terracotta-soft text-terracotta-ink'],
]

/** Motifs qui DOIVENT avoir disparu après migration. */
const FORBIDDEN = [
  'primary', 'primary-dark', 'secondary', 'gray-light', 'soft-success', 'soft-info',
  'soft-warning', 'soft-danger', 'soft-orange', 'soft-purple', 'purple-icon', 'amber-deep',
  'shadow-soft', 'shadow-card', 'shadow-hover', 'shadow-floating',
]

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.(tsx?|css)$/.test(e.name)) out.push(p)
  }
  return out
}

const check = process.argv.includes('--check')
const files = walk(SRC)
const leftovers = []
let touched = 0

for (const file of files) {
  const before = fs.readFileSync(file, 'utf8')
  let after = before
  for (const [from, to] of MAP) after = after.split(from).join(to)
  if (after !== before) {
    touched++
    if (!check) fs.writeFileSync(file, after, 'utf8')
  }
}

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8')
  src.split('\n').forEach((line, i) => {
    for (const f of FORBIDDEN) {
      if (new RegExp(`(?<![\\w-])((?:[a-z-]+:)*)(bg|text|border|ring|from|to|via)-${f}(?![\\w-])`).test(line)) {
        leftovers.push(`${path.relative(ROOT, file)}:${i + 1}  ${f}  |  ${line.trim().slice(0, 110)}`)
      }
    }
  })
}

console.log(`${check ? '[check]' : '[write]'} ${touched}/${files.length} fichiers touchés`)
if (leftovers.length) {
  console.log(`\n⚠ ${leftovers.length} occurrence(s) d'ancien token restantes :`)
  for (const l of leftovers) console.log('  ' + l)
} else {
  console.log('✔ aucun ancien token restant dans src/')
}
