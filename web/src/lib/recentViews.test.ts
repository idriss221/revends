/**
 * Tests — historique « Vus récents » (lib/recentViews.ts, CA-ACC-37/38).
 * Pur (pas de rendu React) : logique de dedup/borne 8/éviction simple.
 *
 * Environnement node (vitest.config.ts) : pas de `window` réel — on stube un
 * faux localStorage global pour exercer la persistance sans navigateur.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { pushIdPure, readRecentIds, pushRecentId, purgeRecentIds, clearRecentIds, RECENT_MAX, writeRecentIds } from './recentViews'

/** Fake localStorage conforme à l'API navigateur (getItem/setItem/removeItem/clear/key/length). */
class FakeStorage {
  private store = new Map<string, string>()
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value))
  }
  removeItem(key: string): void {
    this.store.delete(key)
  }
  clear(): void {
    this.store.clear()
  }
  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null
  }
  get length(): number {
    return this.store.size
  }
}

beforeEach(() => {
  const storage = new FakeStorage()
  const win = { localStorage: storage } as unknown as Window & typeof globalThis
  vi.stubGlobal('window', win)
  // Le « vrai » média (quota) n'existe pas ici : on permet de le remplacer par le test.
  vi.stubGlobal('_fakeStorageForQuotaTest', storage)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('pushIdPur (dédoublonnage + plus récent d’abord)', () => {
  it('ajoute un nouvel id en tête', () => {
    expect(pushIdPure([2, 3], 1)).toEqual([1, 2, 3])
  })
  it('déduplique : un id déjà présent remonte en tête', () => {
    expect(pushIdPure([1, 2, 3], 2)).toEqual([2, 1, 3])
  })
  it('borne à RECENT_MAX entrées (évince la plus ancienne)', () => {
    const full = Array.from({ length: RECENT_MAX }, (_, i) => i + 1)
    const next = pushIdPure(full, RECENT_MAX + 1)
    expect(next).toHaveLength(RECENT_MAX)
    expect(next[0]).toBe(RECENT_MAX + 1)
    // Le plus ancien (dernier de la liste pleine) est évincé
    expect(next).not.toContain(RECENT_MAX)
  })
})

describe('persistance localStorage (CA-ACC-37)', () => {
  it('pushRecentId persiste et renvoie la liste à jour', () => {
    pushRecentId(5)
    pushRecentId(3)
    expect(readRecentIds()).toEqual([3, 5])
  })
  it('ignore les données corrompues (parse échoué)', () => {
    window.localStorage.setItem('revends:recently-viewed', 'pas-json{')
    expect(readRecentIds()).toEqual([])
  })
  it('filtre les valeurs non-entier positives', () => {
    window.localStorage.setItem('revends:recently-viewed', JSON.stringify([1, 'x', -3, 2.5, 7]))
    expect(readRecentIds()).toEqual([1, 7])
  })
})

describe('purge / clear (CA-ACC-38)', () => {
  it('purgeRecentIds ne garde que les ids initiaux présents dans la réponse API', () => {
    pushRecentId(9)
    pushRecentId(7)
    pushRecentId(5)
    purgeRecentIds([5, 7, 9], [7])
    expect(readRecentIds()).toEqual([7])
  })
  it('race purge/fetch : une consultation fraîche pendant le fetch est conservée (revue P1-2)', () => {
    // Au montage de l'accueil : historique lu = [9, 7, 5]
    writeRecentIds([9, 7, 5])
    // Pendant le fetch (~300-600 ms), l'utilisateur consulte le produit 3
    pushRecentId(3)
    // La réponse du fetch ne contient que les ids initiaux 9 et 7 (5 supprimé) :
    // l'id 3, qui n'était PAS dans la liste initiale, ne doit jamais être purgé.
    purgeRecentIds([9, 7, 5], [9, 7])
    expect(readRecentIds()).toEqual([3, 9, 7])
  })
  it('clearRecentIds vide l’historique', () => {
    pushRecentId(1)
    clearRecentIds()
    expect(readRecentIds()).toEqual([])
  })
  it('pushRecentId survit à un quota localStorage (écriture qui lève)', () => {
    const storage = vi.mocked(window.localStorage)
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })
    expect(() => pushRecentId(42)).not.toThrow()
  })
})