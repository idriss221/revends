/**
 * Anti-régression B1 : une seule classe `ApiError`.
 *
 * `api.ts` re-exporte `apiClient.ApiError` (et l'importe pour son usage
 * interne). Avant correctif, deux classes distinctes existaient :
 * `instanceof` croisé renvoyait `false`, donc `AuthView` affichait toujours
 * « Une erreur est survenue. Réessayez. » au lieu du message serveur.
 * Ce test verrouille l'identité des deux symboles.
 */
import { describe, it, expect } from 'vitest'
import { ApiError as ApiErrorFromApi } from './api'
import { ApiError as ApiErrorFromClient } from './apiClient'

describe('ApiError — identité unique (B1)', () => {
  it('api.ts et apiClient.ts partagent la MÊME classe', () => {
    expect(ApiErrorFromApi).toBe(ApiErrorFromClient)
  })

  it('une ApiError créée par apiClient est instanceof ApiError (importé via api.ts)', () => {
    const err = new ApiErrorFromClient(400, 'EMAIL_TAKEN', 'Cet email est déjà utilisé.')
    expect(err instanceof ApiErrorFromApi).toBe(true)
    expect(err.readableMessage()).toBe('Cet email est déjà utilisé.')
  })
})
