import './env.js';
import { createHmac } from 'node:crypto';

export interface WaveFetchCall {
  url: string;
  method?: string;
  headers: Record<string, string>;
  body?: string;
}

export interface WaveFetchSpy {
  calls: WaveFetchCall[];
  restore(): void;
  waveCalls(): WaveFetchCall[];
}

export interface WaveReply {
  status?: number;
  body?: unknown;
}

function isWaveHost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'api.wave.com' || host === 'api.wave.test';
  } catch {
    return false;
  }
}

function toHeaderRecord(headers: HeadersInit | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!headers) return result;
  if (headers instanceof Headers) {
    for (const [key, value] of headers.entries()) result[key.toLowerCase()] = value;
    return result;
  }
  if (Array.isArray(headers)) {
    for (const [key, value] of headers) result[key.toLowerCase()] = value;
    return result;
  }
  for (const [key, value] of Object.entries(headers)) result[key.toLowerCase()] = String(value);
  return result;
}

export function fakeFetch(reply: WaveReply | ((call: WaveFetchCall) => WaveReply)): (call: WaveFetchCall) => Response {
  return (call) => {
    const resolved = typeof reply === 'function' ? reply(call) : reply;
    return new Response(JSON.stringify(resolved.body ?? {}), {
      status: resolved.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  };
}

export function spyFetchWave(
  respond: (call: WaveFetchCall) => Response | Promise<Response>,
): WaveFetchSpy {
  const original = globalThis.fetch;
  const calls: WaveFetchCall[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!isWaveHost(url)) return original(input, init);

    const call: WaveFetchCall = {
      url,
      method: init?.method ?? (typeof input !== 'string' && !(input instanceof URL) ? input.method : undefined),
      headers: toHeaderRecord(init?.headers),
      body: typeof init?.body === 'string' ? init.body : undefined,
    };
    calls.push(call);
    return respond(call);
  }) as typeof fetch;

  return {
    calls,
    waveCalls: () => calls.filter((call) => isWaveHost(call.url)),
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

export function setWaveEnv(options: {
  enabled: boolean;
  apiKey?: string;
  webhookSecret?: string;
  systemAdminId?: number;
  mailEnabled?: boolean;
}): void {
  process.env.WAVE_ENABLED = options.enabled ? 'true' : 'false';
  process.env.WAVE_API_BASE_URL = 'https://api.wave.com';

  if (options.apiKey === undefined) delete process.env.WAVE_API_KEY;
  else process.env.WAVE_API_KEY = options.apiKey;

  if (options.webhookSecret === undefined) delete process.env.WAVE_WEBHOOK_SECRET;
  else process.env.WAVE_WEBHOOK_SECRET = options.webhookSecret;

  if (options.systemAdminId === undefined) delete process.env.WAVE_SYSTEM_ADMIN_ID;
  else process.env.WAVE_SYSTEM_ADMIN_ID = String(options.systemAdminId);

  if (options.mailEnabled !== undefined) {
    process.env.MAIL_ENABLED = options.mailEnabled ? 'true' : 'false';
  }
}

export function signWaveHmac(secret: string, timestamp: number | string, rawBody: Buffer | string): string {
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
  return createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(String(timestamp), 'utf8'), body]))
    .digest('hex');
}

export function waveSignatureHeader(
  secret: string,
  timestamp: number | string,
  rawBody: Buffer | string,
  options?: { rotate?: boolean; includeTimestamp?: boolean },
): string {
  const valid = signWaveHmac(secret, timestamp, rawBody);
  const wrong = '0'.repeat(64);
  const values = options?.rotate ? [wrong, valid] : [valid];
  const parts = options?.includeTimestamp === false ? [] : [`t=${timestamp}`];
  for (const value of values) parts.push(`v1=${value}`);
  return parts.join(',');
}

export async function postRaw(
  baseUrl: string,
  path: string,
  rawBody: Buffer | string,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: any; headers: Headers }> {
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
  const text = await response.text();
  let parsed: any = text;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  return { status: response.status, body: parsed, headers: response.headers };
}
