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

type WaveFetchResponse = Pick<Response, 'ok' | 'status' | 'json'>;
export type WaveFetch = (url: string, init?: RequestInit) => Promise<WaveFetchResponse>;

export interface WaveClientOptions {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: WaveFetch;
}

export interface WaveClient {
  createCheckoutSession(payload: WaveCheckoutPayload): Promise<WaveCheckoutResult>;
}

function upstreamError(): AppError {
  return new AppError(502, 'WAVE_UPSTREAM_ERROR', WAVE_UPSTREAM_MESSAGE);
}

export function createWaveClient(options: WaveClientOptions): WaveClient {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const endpoint = `${options.baseUrl.replace(/\/+$/, '')}/v1/checkout/sessions`;

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
  };
}
