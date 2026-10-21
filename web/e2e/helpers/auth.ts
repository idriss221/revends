import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Lecture de la session admin partagée — **zéro appel réseau**.
 *
 * La session est créée une fois par `e2e/global-setup.ts` (le rate limit de
 * `/api/auth` est de 20 appels / 10 min côté serveur) puis relue ici. On ne
 * refait donc jamais de `POST /api/auth/login` depuis un test : c'était la
 * cause du faux négatif « admin connecté → /login ».
 */
const FILE = join(process.cwd(), 'e2e', '.session.json')

export interface AdminSession {
  cookie: string
  email: string
}

export function readAdminSession(): AdminSession | null {
  try {
    const { cookie, email } = JSON.parse(readFileSync(FILE, 'utf8')) as AdminSession
    return cookie.startsWith('connect.sid=') ? { cookie, email } : null
  } catch {
    return null
  }
}

/** Cookie `connect.sid` au format Playwright, prêt pour `addCookies`. */
export function adminCookie() {
  const session = readAdminSession()
  if (!session) return null
  return {
    name: 'connect.sid',
    value: session.cookie.split('=')[1],
    domain: '127.0.0.1',
    path: '/',
  } as const
}
