import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient, ApiError } from '../lib/apiClient'
import type { SelfUser } from '../lib/types'
import { useToast } from '../lib/toast'

interface AuthContextValue {
  user: SelfUser | null
  /** true tant que GET /api/auth/me n'a pas répondu (splash de chargement) */
  isLoading: boolean
  /** @deprecated Utilisez `isLoading` — maintenu pour compatibilité avec `guardDecision` */
  loading: boolean
  unreadNotifications: number
  /** Connexion/inscription : via `useLogin()` / `useRegister()` (hooks/useAuth.ts). */
  logout: () => Promise<void>
  /** Force le rechargement de la session (ex. après modification profil) */
  refresh: () => Promise<void>
  /** Met à jour le compteur de notifications non lues */
  setUnread: (count: number) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [unreadNotifications, setUnreadNotifications] = useState(0)

  // Requête de session — gérée par React Query (cache, retry, dedup)
  const { data: authData, isLoading, refetch } = useQuery({
    queryKey: ['me'],
    queryFn: apiClient.me,
    retry: (failureCount, err) => {
      // Ne pas retry sur 401 (non connecté) — c'est un état normal
      if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 401) {
        return false
      }
      return failureCount < 1
    },
    staleTime: 60_000, // 1 min : la session ne change pas souvent
  })

  // Synchroniser l'état local depuis React Query
  const user = authData?.user ?? null

  useEffect(() => {
    if (authData?.unreadNotifications !== undefined) {
      setUnreadNotifications(authData.unreadNotifications)
    }
  }, [authData])

  // Mutation logout
  const logoutMutation = useMutation({
    mutationFn: apiClient.logout,
    onSuccess: () => {
      queryClient.setQueryData(['me'], null)
      setUnreadNotifications(0)
      // CartProvider/FavoritesProvider retombent sur le store local anonyme.
      toast('success', 'Vous êtes déconnecté.')
    },
    onError: (err) => {
      toast('error', isApiError(err) ? err.readableMessage() : 'Erreur lors de la déconnexion')
    },
  })

  const logout = useCallback(async () => {
    await logoutMutation.mutateAsync()
  }, [logoutMutation])

  const refresh = useCallback(async () => {
    await refetch()
  }, [refetch])

  const setUnread = useCallback((count: number) => {
    setUnreadNotifications(count)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        loading: isLoading, // alias pour compatibilité
        unreadNotifications,
        logout,
        refresh,
        setUnread,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>')
  return ctx
}