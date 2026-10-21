import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

/** Statistiques admin (badge sidebar « en attente ») — requête partagée entre pages. */
export function useAdminStats() {
  return useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => api.adminStats(),
    staleTime: 30_000,
  })
}