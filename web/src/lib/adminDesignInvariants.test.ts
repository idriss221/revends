import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Test d'invariant — **interdits DA §9.1 / §9.2** et contrat spec-admin §9.1
 * (CA-V5-047).
 *
 * Ces règles ne peuvent pas être vérifiées à l'œil sur 9 écrans et 5
 * composants : un `style={{` réintroduit par un copier-coller passerait la
 * revue visuelle tout en violant l'anti-dérive. On lit donc le code source des
 * écrans **et** des composants admin.
 *
 * `min-w-[…]` est **autorisé** dans `AdminTable` (spécifié) et **interdit**
 * ailleurs : c'est la seule exception, elle est donc testée explicitement.
 */

const SRC = join(process.cwd(), 'src')
const ADMIN_DIR = join(SRC, 'pages', 'admin')
/** Composants du back-office : mêmes interdits que les écrans — hors garde avant V5. */
const ADMIN_COMPONENTS_DIR = join(SRC, 'components', 'admin')
const ADMIN_LAYOUT = ['DashboardLayout.tsx', 'Sidebar.tsx'].map((f) => join(SRC, 'components', 'layout', f))
/** Le seul shell porteur des breakpoints : la Sidebar est pilotée par DashboardLayout. */
const LAYOUT_WITH_BREAKPOINTS = [join(SRC, 'components', 'layout', 'DashboardLayout.tsx')]
/** Seule exception `min-w-[…]` du projet : les 3 largeurs de tableau du spec (§9.1). */
const ADMIN_TABLE = join(ADMIN_COMPONENTS_DIR, 'AdminTable.tsx')

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)
    return entry.name.endsWith('.tsx') ? [full] : []
  })
}

/** Fichiers « soumis » : les 9 écrans + les 5 composants admin + le shell (16). */
const SUBJECT = [...walk(ADMIN_DIR), ...walk(ADMIN_COMPONENTS_DIR), ...ADMIN_LAYOUT]

const rel = (f: string) => f.slice(SRC.length + 1)

/**
 * Code **exécutable** : on neutralise les commentaires, sinon une consigne
 * écrite en dur comme « aucun `style={{` » (dans l'en-tête d'un fichier)
 * ferait échouer le test qui la vérifie. Les bloc `/* *\/` et les lignes `//`
 * sont retirés avant toute recherche.
 */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')
}

/**
 * Idem `code`, moins la déclaration `MIN_W` d'`AdminTable` : c'est une
 * **constante d'objet** (`md:` y est une clé de record, §9.1), pas un
 * breakpoint. Seule occurrence autorisée, testée explicitement plus bas.
 */
function codeWithoutMinW(file: string): string {
  return code(file).replace(/const MIN_W = \{[^}]*\} as const/, '')
}

/** Fichiers dont le code exécutable est comparé (tout sauf l'en-tête de test). */
const FINDING = (needle: string) => SUBJECT.filter((f) => code(f).includes(needle)).map(rel)

/** Extrait la liste des `fa-…` utilisées (icônes FA, pas de police Emoji). */
function faIcons(code: string): string[] {
  return [...code.matchAll(/fa-[a-z0-9-]+/g)].map((m) => m[0])
}

describe('Anti-dérive DA §9.1/§9.2 sur les écrans et composants admin', () => {
  it('la liste des fichiers soumis est bien couverte (garde-fou du test)', () => {
    // 9 écrans + 5 composants (`components/admin/*`) + DashboardLayout + Sidebar.
    expect(SUBJECT).toHaveLength(16)
    expect(rel(ADMIN_DIR)).toBe('pages/admin')
    expect(rel(ADMIN_COMPONENTS_DIR)).toBe('components/admin')
  })

  it.each([
    ['style={{', 'style inline (DA §9.2)'],
    ['accent-[#', 'couleur hexadécimale en classe (DA §9.1)'],
    ['text-[#', 'couleur hexadécimale en classe (DA §9.1)'],
    ['bg-[rgba(', 'couleur rgba en classe (DA §9.1)'],
    ['shadow-[', 'ombre arbitraire (spec-admin §2.2 — utiliser shadow-*token)'],
    ['soft-primary', 'classe inexistante (ne génère aucun CSS)'],
    ['className="card"', 'classe `.card` brute au lieu du composant `Card` (CA-V5-035)'],
  ])('aucun %s — %s', (needle, why) => {
    const offenders = FINDING(needle)
    expect(offenders, `${why} — trouvé dans : ${offenders.join(', ') || 'aucun fichier'}`).toEqual([])
  })

  it('aucun `min-w-[…]` hors AdminTable (spec-admin §9.1)', () => {
    const offenders = FINDING('min-w-[').filter((f) => f !== rel(ADMIN_TABLE))
    expect(offenders, `min-w arbitraire : ${offenders.join(', ')}`).toEqual([])
  })

  it('AdminTable n’utilise `min-w-[…]` que via les 3 largeurs MIN_W du spec', () => {
    // Exception explicite : sans ce test, « autorisé dans AdminTable » voudrait
    // dire « tout `min-w-[…]` inventé y est toléré ».
    const found = [...new Set(code(ADMIN_TABLE).match(/min-w-\[[^\]]+\]/g) ?? [])]
    expect(found.sort()).toEqual(['min-w-[640px]', 'min-w-[760px]', 'min-w-[900px]'])
  })

  it('D14 : les breakpoints admin sont uniquement des `max-[…]` (pas de md:/lg:/xl:)', () => {
    const offenders = SUBJECT.filter((f) => /(?<![\w-])(md|lg|xl):(?![\w-])/.test(codeWithoutMinW(f))).map(rel)
    expect(offenders, `breakpoint croissant interdit : ${offenders.join(', ')}`).toEqual([])
  })

  it('D14 : le layout admin déclare ses `max-[…]` (§9.3-f)', () => {
    // §9.3-f est une recette de CAPTURE (« grep ≥ 1 par page ») : l'adaptatif
    // appartient au shell (grille sidebar/contenu, padding, burger), tandis que
    // les 7 pages à tableau n'ont aucune grille propre — leur tableau est déjà
    // contraint en largeur par `AdminTable` (`min-w-[…]` + scroll interne).
    // On vérifie donc le layout + les 2 écrans qui ont réellement des grilles.
    const gridPages = [join(ADMIN_DIR, 'AdminDashboardPage.tsx'), join(ADMIN_DIR, 'AdminOrderDetailPage.tsx')]
    const without = [...gridPages, ...LAYOUT_WITH_BREAKPOINTS]
      .filter((f) => !code(f).includes('max-['))
      .map(rel)
    expect(without, `aucun breakpoint adaptatif : ${without.join(', ')}`).toEqual([])
  })
})

describe('Vocabulaire fermé RG-V5-08 — modales d’action', () => {
  const confirm = readFileSync(join(SRC, 'components', 'admin', 'ConfirmAction.tsx'), 'utf8')

  it('ConfirmDelete porte le préréglage exact du spec §4.4', () => {
    expect(confirm).toContain('Cette action est irréversible')
    expect(confirm).toContain("confirmLabel=\"Supprimer l'article\"")
    expect(confirm).toContain('tone="danger"')
    expect(confirm).toContain('urgency="danger"')
  })

  it('ConfirmeDelete énumère les conséquences (une suppression doit dire ce qu’elle perd)', () => {
    // 3 conséquences : retrait du catalogue, notification, aucune restauration.
    const consequences = confirm.slice(confirm.indexOf('consequences={['))
    expect(consequences).toContain('fa-eye-slash')
    expect(consequences).toContain('fa-bell')
    expect(consequences).toContain('fa-ban')
  })

  it('le pied de modale est toujours « Annuler » puis l’action (spéc §4.4)', () => {
    expect(confirm).toContain('Annuler')
    // L'ancien libellé « Fermer » de la modale d'annulation a été corrigé (CA-V5-037).
    expect(confirm).not.toMatch(/confirmLabel="Fermer"/)
  })
})

describe('Palette REVENDS — aucune couleur décorative hors tokens (DA §9.5)', () => {
  it('ni bleu ni violet dans les écrans admin (héritage V4 interdit)', () => {
    const banned = ['text-blue', 'bg-blue', 'text-purple', 'bg-purple', 'purple-icon', 'text-amber', 'bg-amber']
    const offenders: string[] = []
    for (const file of SUBJECT) {
      const src = code(file)
      for (const b of banned) if (src.includes(b)) offenders.push(`${rel(file)} → ${b}`)
    }
    expect(offenders, offenders.join(', ')).toEqual([])
  })

  it('n’utilise que des icônes Font Awesome (pas d’emoji comme icône)', () => {
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u
    const offenders = SUBJECT.filter((f) => emoji.test(code(f))).map(rel)
    expect(offenders, `emoji trouvé dans ${offenders.join(', ')}`).toEqual([])
  })

  it('les badges de statut passent bien par StatusBadge (pas de pastille manuelle)', () => {
    const pagesWithStatus = SUBJECT.filter((f) => code(f).includes('<StatusBadge'))
    // 8 écrans sur 9 (Users est en lecture seule) + AdminProductSheet.
    expect(pagesWithStatus.length).toBe(9)
    for (const file of pagesWithStatus) {
      expect(faIcons(code(file)), rel(file)).not.toContain('fa-circle')
    }
  })

  it('chaque StatusBadge admin porte la pastille `dot` (design-system §6.2)', () => {
    const offenders: string[] = []
    for (const file of SUBJECT) {
      for (const tag of code(file).match(/<StatusBadge[\s\S]*?\/>/g) ?? []) {
        if (!/\bdot\b/.test(tag)) offenders.push(`${rel(file)} → ${tag.replace(/\s+/g, ' ').slice(0, 80)}`)
      }
    }
    expect(offenders, offenders.join(' | ')).toEqual([])
  })
})

/**
 * Gardes de non-régression — **retours utilisateur** et critères du cahier
 * corrigés en V5. Chaque test lit le code source : il tombe en échec si la
 * règle re-violée, sans avoir à relancer l'app.
 */
describe('Corrections retour utilisateur — gardes (spec V5 / CA-V5)', () => {
  const read = (relPath: string) => readFileSync(join(SRC, relPath), 'utf8')
  const page = (name: string) => code(join(ADMIN_DIR, name))

  it('CA-V5-035 : le détail commande ne mélange pas `.card` brut et `Card`', () => {
    // `InfoBlock` rendait `<section className="card">` alors que la même page
    // utilise le composant `Card` (interdit « concurrence sur la même page »).
    const src = page('AdminOrderDetailPage.tsx')
    expect(src).not.toContain('className="card"')
    expect(src).toContain('<Card>')
    expect(src).toContain('function InfoBlock')
    // Le composant `Card` est bien appelé par InfoBlock, pas seulement ailleurs.
    expect(src.slice(src.indexOf('function InfoBlock'), src.indexOf('function paymentBadge'))).toContain('<Card>')
  })

  it('CA-V5-043 : le focus est piégé dans la modale ET dans le tiroir mobile', () => {
    const hook = read('hooks/useFocusTrap.ts')
    expect(read('components/ui/Modal.tsx')).toContain('useFocusTrap(')
    expect(read('components/layout/DashboardLayout.tsx')).toContain('useFocusTrap(')
    expect(hook).toContain("e.key !== 'Tab'")
    expect(hook).toContain('last.focus()')
    expect(hook).toContain('first.focus()')
  })

  it('dashboard : la ligne « PREPARING » compte `preparing` (et non `shipped`)', () => {
    // Bug : lien `?status=PREPARING` + compteur `shipped` = mauvais compteur.
    const dash = page('AdminDashboardPage.tsx')
    expect(dash).toContain('stats?.orders?.preparing ?? 0')
    expect(dash).not.toContain('stats?.orders?.shipped ?? 0')
    expect(dash).toContain("to: '/admin/commandes?status=PREPARING'")
  })

  it('suppression d’article : le toast dépend du code d’erreur, pas d’un regex', () => {
    const src = page('AdminArticlesPage.tsx')
    expect(src).toContain("err.code === 'PRODUCT_HAS_ACTIVE_ORDER'")
    expect(src).toContain('TOAST_COPY.productHasActiveOrder')
    expect(src).not.toContain('/active/i')
    // La branche est bien typée `ApiError` : c'est son `.code` qui pilote le texte.
    expect(src).toContain('err instanceof ApiError')
  })

  it('confirmation de paiement : toast dédié `paymentConfirmed` (pas `orderReceived`)', () => {
    expect(read('lib/constants.ts')).toContain('paymentConfirmed:')
    const src = page('AdminOrderDetailPage.tsx')
    expect(src).toContain('TOAST_COPY.paymentConfirmed')
    const confirmPayment = src.slice(src.indexOf('const confirmPayment'), src.indexOf('const markProductReceived'))
    expect(confirmPayment).not.toContain('TOAST_COPY.orderReceived')
  })

  it('commandes : un statut hors enum dans l’URL n’est jamais envoyé à l’API', () => {
    const src = page('AdminOrdersPage.tsx')
    expect(src).toContain('ORDER_STATUS_FILTERS.some')
    expect(src).not.toContain("params.get('status') ?? ''")
  })

  it('Commandes et Articles réinitialisent `page` quand le statut change par l’URL', () => {
    for (const name of ['AdminOrdersPage.tsx', 'AdminArticlesPage.tsx']) {
      expect(page(name), name).toMatch(
        /if \(prevStatus !== status\) \{\s*setPrevStatus\(status\)\s*setPage\(1\)\s*\}/,
      )
    }
  })

  it('renommage de catégorie : nom vide bloqué côté client, maxLength = 100', () => {
    const src = page('AdminCategoriesPage.tsx')
    expect(src).toContain('confirmDisabled={!name.trim()}')
    expect(src).toContain('maxLength={100}')
    expect(src).not.toContain('maxLength={80}')
  })

  it('fiche produit externe : `window.open` sans opener + référence serveur exacte', () => {
    const raw = readFileSync(join(ADMIN_DIR, 'AdminOrderDetailPage.tsx'), 'utf8')
    expect(raw).toMatch(/window\.open\([^)]*'_blank', 'noopener'\)/)
    expect(raw).toContain('admin.service.ts:374')
    expect(raw).not.toContain('admin.service.ts:580')
  })

  it('historique : `category.update` couverte par la meta (action non filtrable)', () => {
    const types = read('lib/types.ts')
    expect(types).toContain("| 'category.update'")
    expect(read('lib/constants.ts')).toContain("'category.update':")
  })
})
