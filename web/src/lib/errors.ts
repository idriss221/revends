import { ApiError } from './apiClient'
import { TOAST_COPY } from './constants'

/**
 * Message d'erreur **destiné à un humain**, jamais à un attaquant.
 *
 * Le serveur renvoie déjà des messages génériques sur les 5xx
 * (`middleware/errors.ts` → `INTERNAL_ERROR`), et le code machine (`code`)
 * n'est pas une donnée sensible. Mais le client a trois fuites historiques :
 *
 *  - `err.message` brut d'un `ApiError` construit sur une réponse illisible
 *    (`Erreur du serveur (500)`, `Failed to fetch`, `NetworkError…`) ;
 *  - `err.message` d'une erreur **de rendu** (React), qui décrit un composant ;
 *  - les détails de validation, eux, sont rédigés pour l'utilisateur → gardés.
 *
 * Règle : on n'affiche que ce qui a été écrit **pour** l'utilisateur. Tout le
 * reste retombe sur un message générique (jamais de détail technique, jamais de
 * statut HTTP, jamais de nom de contrainte ou de composant).
 */

/** Chaînes qui trahissent un échec technique / réseau — jamais affichées. */
const TECHNICAL_PATTERNS = [
  /^erreur du serveur\b/i,
  /^failed to fetch\b/i,
  /^networkerror\b/i,
  /^typeerror\b/i,
  /^referenceerror\b/i,
  /^syntaxerror\b/i,
  /^cannot read propert/i,
  /^undefined is not/i,
  /^internal server error\b/i,
  /^econn/,
  /^etimedout\b/i,
  /^aborted\b/i,
]

function looksTechnical(message: string | undefined): boolean {
  const m = (message ?? '').trim()
  if (m.length === 0) return true
  return TECHNICAL_PATTERNS.some((re) => re.test(m))
}

/**
 * Traduit une erreur en message affichable.
 *
 * @param error      l'erreur levée (ApiError, Error, autre)
 * @param fallback   message générique à utiliser — chaque écran passe sa phrase
 *                   (boutique, panier, preuve de paiement…) plutôt que de
 *                   réécrire du texte dans le composant.
 */
export function friendlyError(error: unknown, fallback: string = TOAST_COPY.actionFailed): string {
  // Validation : les `details` sont rédigés pour l'utilisateur (Zod, métier).
  if (error instanceof ApiError && error.details && error.details.length > 0) {
    const lines = error.details.map((d) => d.message.trim()).filter(Boolean)
    if (lines.length > 0) return lines.join('\n')
  }

  if (error instanceof ApiError) {
    if (error.status === 0 || error.code === 'NETWORK_ERROR') return TOAST_COPY.networkError
    if (error.status === 429) return 'Trop de tentatives. Réessayez dans un instant.'
    if (error.status === 401) return 'Votre session a expiré. Reconnectez-vous.'
    if (error.status === 403) return 'Cette action est impossible avec ce compte.'
    if (error.status >= 500) return fallback
    // 4xx métier : le message du serveur est le nôtre (« Article introuvable »…).
    // S'il a une forme technique (ou est vide), on ne le montre pas.
    return looksTechnical(error.message) ? fallback : error.message
  }

  // Erreur de rendu, de librairie, ou valeur non Error : rien n'est sûr à
  // afficher → message générique.
  return fallback
}
