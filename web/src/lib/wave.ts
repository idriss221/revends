import { request } from './api';

/**
 * V9 — client Wave (frontend).
 *
 * Règles (CA-V9-002/003/011/017/021/050/052) :
 * - aucune clé API, aucun secret, aucun `amount` calculé ici ;
 * - une seule source de vérité pour l'activation : le webhook signé côté serveur ;
 * - les 3 liens ci-dessous sont un repli manuel d'affichage, jamais une session ;
 * - l'admin ne reçoit qu'un sous-ensemble de champs (aucun identifiant d'événement,
 *   de session ni de référence client).
 */

export interface WaveConfigResponse {
  waveEnabled: boolean;
}

export interface WaveCheckoutSessionResult {
  waveLaunchUrl: string;
  sessionId: string;
}

/** Sous-ensemble volontaire : aucun identifiant d'événement/session/référence. */
export interface WaveAdminEvent {
  id: number;
  subscriptionId: number;
  status: string;
  activated: boolean;
}

export interface WaveAdminEventsResponse {
  items: WaveAdminEvent[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

/** Configuration d'affichage uniquement — jamais utilisée pour tarifer ou valider. */
export const WAVE_HOSTED_LINKS = [
  {
    label: 'Découverte — 2 000 FCFA',
    href: 'https://pay.wave.com/m/M_sn_nLXzUBh809Au/c/sn/?amount=2000',
  },
  {
    label: 'Boutique — 5 000 FCFA',
    href: 'https://pay.wave.com/m/M_sn_nLXzUBh809Au/c/sn/?amount=5000',
  },
  {
    label: 'Atelier — 10 000 FCFA',
    href: 'https://pay.wave.com/m/M_sn_nLXzUBh809Au/c/sn/?amount=10000',
  },
] as const;

export type WaveAdminStatus = 'pending' | 'confirmed' | 'failed' | 'none';

/** Traduction des statuts Wave en états d'affichage_admin. Aucun texte technique. */
export function waveAdminStatus(event: WaveAdminEvent | undefined): WaveAdminStatus {
  if (!event) return 'none';
  if (event.activated) return 'confirmed';
  const status = event.status.toUpperCase();
  if (status === 'COMPLETED') return 'confirmed';
  if (status === 'SESSION_CREATED' || status === 'PROCESSING') return 'pending';
  if (status === 'PAYMENT_FAILED' || status === 'FAILED') return 'failed';
  return 'none';
}

export const waveApi = {
  /** GET /api/wave/config — fail-closed : seul `waveEnabled` est lu. */
  config: () => request<WaveConfigResponse>('/api/wave/config'),

  /** POST /api/wave/checkout/sessions — la navigation est décidée par l'appelant. */
  createCheckoutSession: (subscriptionId: string) =>
    request<WaveCheckoutSessionResult>('/api/wave/checkout/sessions', {
      method: 'POST',
      body: JSON.stringify({ subscriptionId }),
    }),

  /** GET /api/wave/admin/events — lecture seule, administrative. */
  adminEvents: (params: { subscriptionId?: number | string; page?: number; perPage?: number } = {}) => {
    const search = new URLSearchParams();
    if (params.subscriptionId !== undefined) search.set('subscriptionId', String(params.subscriptionId));
    search.set('page', String(params.page ?? 1));
    search.set('per_page', String(params.perPage ?? 48));
    return request<WaveAdminEventsResponse>(`/api/wave/admin/events?${search.toString()}`);
  },
};
