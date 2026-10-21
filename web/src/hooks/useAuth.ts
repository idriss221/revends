/**
 * Hooks d'authentification — ré-export + mutations React Query.
 *
 * - `useAuth()` : état global (user, isLoading, unreadNotifications, logout, refresh)
 * - `useLogin()` : mutation `login` avec gestion d'erreur/toast intégrée
 * - `useRegister()` : mutation `register` avec gestion d'erreur/toast intégrée
 * - `useLogout()` : mutation `logout` avec gestion d'erreur/toast intégrée
 *
 * Usage dans les composants :
 *   const { user, isLoading } = useAuth()
 *   const login = useLogin()
 *   await login.mutateAsync({ identifier, password })
 */
export { useAuth } from '../context/AuthContext'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient, ApiError } from '../lib/apiClient'
import type { RegisterPayload } from '../lib/types'
import { useToast } from '../lib/toast'

/** Vérifie si l'erreur est une ApiError avec readableMessage. */
function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError
}

/** Mutation de connexion — retourne l'utilisateur connecté. */
export function useLogin() {
  const queryClient = useQueryClient()
  const toast = useToast()

  return useMutation({
    mutationFn: ({ identifier, password }: { identifier: string; password: string }) =>
      apiClient.login(identifier, password),
    onSuccess: (res) => {
      queryClient.setQueryData(['me'], { user: res.user, unreadNotifications: 0 })
      toast('success', `Bienvenue, ${res.user.displayName} !`)
    },
    onError: (err) => {
      toast('error', isApiError(err) ? err.readableMessage() : 'Échec de la connexion')
    },
  })
}

/** Mutation d'inscription — connecte automatiquement après création. */
export function useRegister() {
  const queryClient = useQueryClient()
  const toast = useToast()

  return useMutation({
    mutationFn: (payload: RegisterPayload) => apiClient.register(payload),
    onSuccess: (res) => {
      queryClient.setQueryData(['me'], res)
      toast('success', `Compte créé ! Bienvenue, ${res.user.displayName}.`)
    },
    onError: (err) => {
      toast('error', isApiError(err) ? err.readableMessage() : "Échec de l'inscription")
    },
  })
}

/** Mutation de déconnexion — nettoie le cache et notifie. */
export function useLogout() {
  const queryClient = useQueryClient()
  const toast = useToast()

  return useMutation({
    mutationFn: apiClient.logout,
    onSuccess: () => {
      queryClient.setQueryData(['me'], null)
      toast('success', 'Vous êtes déconnecté.')
    },
    onError: (err) => {
      toast('error', isApiError(err) ? err.readableMessage() : 'Erreur lors de la déconnexion')
    },
  })
}

/** Type helper pour les composants utilisant les mutations. */
export type UseLoginReturn = ReturnType<typeof useLogin>
export type UseRegisterReturn = ReturnType<typeof useRegister>
export type UseLogoutReturn = ReturnType<typeof useLogout>