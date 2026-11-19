import { AppError } from '../utils/errors.js';

const WAVE_UPSTREAM_MESSAGE = 'Impossible d\'ouvrir Wave pour le moment. Le paiement manuel reste disponible ci-dessous.';

export interface WaveCheckoutPayload {
  amount: string;
  currency: 'XOF';
  success_url: string;
  error_url: string;
  client_reference: string;
}

export interface WaveCheckoutResult {
  sessionId: string;
  waveLaunchUrl: string;
}

export interface WaveCheckoutSession {
  id: string;
  amount?: string;
  currency?: string;
  checkout_status?: 'open' | 'complete' | 'expired';
  payment_status?: 'processing' | 'cancelled' | 'succeeded';
  client_reference?: string | null;
  wave_launch_url?: string;
  success_url?: string;
  error_url?: string;
  transaction_id?: string | null;
  business_name?: string;
  last_payment_error?: { code: string; message: string } | null;
  when_created?: string;
  when_completed?: string | null;
  when_expires?: string;
}

export interface WaveCheckoutSessionSearchResult {
  result: WaveCheckoutSession[];
}

type WaveFetchResponse = Pick<Response, 'ok' | 'status' | 'json'>;
export type WaveFetch = (url: string, init?: RequestInit) => Promise<WaveFetchResponse>;

export interface WaveClientOptions {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: WaveFetch;
}

export interface WaveClient {
  createCheckoutSession(payload: WaveCheckoutPayload): Promise<WaveCheckoutResult>;
  retrieveCheckoutSession(sessionId: string): Promise<WaveCheckoutSession>;
  searchCheckoutSessions(clientReference: string): Promise<WaveCheckoutSessionSearchResult>;
}

function upstreamError(): AppError {
  return new AppError(502, 'WAVE_UPSTREAM_ERROR', WAVE_UPSTREAM_MESSAGE);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function createWaveClient(options: WaveClientOptions): WaveClient {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const endpoint = `${options.baseUrl.replace(/\/+$/, '')}/v1/checkout/sessions`;

  async function getJson(path: string): Promise<unknown> {
    let response: WaveFetchResponse;
    try {
      response = await fetchImpl(`${endpoint}${path}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${options.apiKey}` },
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      throw upstreamError();
    }

    if (!response.ok) throw upstreamError();
    try {
      return await response.json();
    } catch {
      throw upstreamError();
    }
  }

  function parseSession(data: unknown): WaveCheckoutSession {
    if (!isRecord(data) || typeof data.id !== 'string' || data.id.length === 0) throw upstreamError();
    return { ...data, id: data.id } as WaveCheckoutSession;
  }

  return {
    async createCheckoutSession(payload) {
      let response: WaveFetchResponse;
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(5_000),
        });
      } catch {
        throw upstreamError();
      }

      if (!response.ok) throw upstreamError();

      let data: unknown;
      try {
        data = await response.json();
      } catch {
        throw upstreamError();
      }

      if (typeof data !== 'object' || data === null) throw upstreamError();
      const record = data as Record<string, unknown>;
      const { id, wave_launch_url: launchUrl } = record;
      if (typeof id !== 'string' || !id.startsWith('cos-') || id.length > 64) throw upstreamError();
      if (typeof launchUrl !== 'string') throw upstreamError();

      try {
        if (new URL(launchUrl).protocol !== 'https:') throw upstreamError();
      } catch {
        throw upstreamError();
      }

      return { sessionId: id, waveLaunchUrl: launchUrl };
    },

    async retrieveCheckoutSession(sessionId) {
      return parseSession(await getJson(`/${encodeURIComponent(sessionId)}`));
    },

    async searchCheckoutSessions(clientReference) {
      const data = await getJson(`/search?client_reference=${encodeURIComponent(clientReference)}`);
      if (!isRecord(data) || !Array.isArray(data.result)) throw upstreamError();
      return { result: data.result.map(parseSession) };
    },
  };
}
