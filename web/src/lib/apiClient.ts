/**
 * Client API bas-niveau — wrapper fetch avec intercepteur CSRF.
 *
 * - Lit le token CSRF depuis le cookie lisible `csrf_token`
 *   OU depuis la balise `<meta name="csrf-token">` (fallback).
 * - Attache le header `X-CSRF-Token` sur les requêtes mutantes (POST/PATCH/DELETE).
 * - Gère `credentials: 'include'` pour les cookies de session (HttpOnly).
 * - Lance l'erreur `ApiError` uniformisée (même format que `api.ts`).
 */
import type { ApiErrorBody, ValidationErrorDetail } from './types'

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined ?? '').replace(/\/+$/, '')

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: ValidationErrorDetail[]

  constructor(status: number, code: string, message: string, details?: ValidationErrorDetail[]) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }

  readableMessage(): string {
    if (this.details && this.details.length > 0) {
      return this.details.map((d) => d.message).join('\n')
    }
    return this.message
  }
}

/**
 * Récupère le token CSRF depuis le cookie `csrf_token` (priorité)
 * ou la meta tag `<meta name="csrf-token">`.
 */
function getCsrfToken(): string | null {
  // 1. Cookie lisible posé par le serveur (double soumission) — lisible en JS
  //    car non HttpOnly (sinon le SPA ne pourrait pas le relire).
  const cookieMatch = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/)
  if (cookieMatch) {
    return decodeURIComponent(cookieMatch[1])
  }
  // 2. Fallback : meta tag (rempli par le backend via template ou JS)
  const meta = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')
  if (meta?.content) {
    return meta.content
  }
  return null
}

/**
 * Vérifie si la méthode HTTP est mutante (nécessite CSRF).
 */
function isMutatingMethod(method?: string): boolean {
  const m = (method ?? 'GET').toUpperCase()
  return m === 'POST' || m === 'PATCH' || m === 'DELETE' || m === 'PUT'
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = options.method ?? 'GET'

  // Préparer les headers
  const headers: Record<string, string> = {
    ...(options.body instanceof FormData
      ? {}
      : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string> ?? {}),
  }

  // Attacher le token CSRF si méthode mutante
  if (isMutatingMethod(method)) {
    const csrf = getCsrfToken()
    if (csrf) {
      headers['X-CSRF-Token'] = csrf
    }
  }

  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      credentials: 'include',
      headers,
    })
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Impossible de joindre le serveur. Vérifiez votre connexion.')
  }

  if (res.status === 204) {
    return undefined as T
  }

  let data: ApiErrorBody | T | null = null
  try {
    data = (await res.json()) as ApiErrorBody | T
  } catch {
    data = null
  }

  if (!res.ok) {
    const err = (data as ApiErrorBody | null)?.error
    throw new ApiError(
      res.status,
      err?.code ?? 'UNKNOWN_ERROR',
      err?.message ?? `Erreur du serveur (${res.status})`,
      err?.details,
    )
  }

  return data as T
}

/**
 * API bas-niveau exposée pour les hooks React Query.
 * Ne contient QUE les endpoints d'authentification.
 * Les autres endpoints restent dans `api.ts` (haut niveau).
 */
export const apiClient = {
  // GET /api/auth/me — session (user ou admin)
  async me(): Promise<{ user: import('./types').SelfUser; unreadNotifications: number }> {
    return request<{ user: import('./types').SelfUser; unreadNotifications: number }>('/api/auth/me')
  },

  // POST /api/auth/login — public
  async login(identifier: string, password: string): Promise<{ user: import('./types').SelfUser }> {
    return request<{ user: import('./types').SelfUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    })
  },

  // POST /api/auth/register — public ; connecte immédiatement
  async register(payload: import('./types').RegisterPayload): Promise<{ user: import('./types').SelfUser; unreadNotifications: number }> {
    return request<{ user: import('./types').SelfUser; unreadNotifications: number }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  // POST /api/auth/logout — idempotent, 204
  async logout(): Promise<void> {
    return request<void>('/api/auth/logout', { method: 'POST' })
  },
}