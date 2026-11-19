import { createHmac, timingSafeEqual } from 'node:crypto';

export interface ParsedWaveSignature {
  timestamp: string;
  signatures: string[];
}

const TIMESTAMP_PATTERN = /^\d+$/;
const HMAC_HEX_PATTERN = /^[0-9a-fA-F]{64}$/;

export function parseWaveSignature(header: string | undefined | null): ParsedWaveSignature | null {
  if (typeof header !== 'string' || header.trim().length === 0) return null;

  let timestamp: string | null = null;
  const signatures: string[] = [];

  for (const chunk of header.split(',')) {
    const separator = chunk.indexOf('=');
    if (separator <= 0) return null;
    const key = chunk.slice(0, separator).trim();
    const value = chunk.slice(separator + 1).trim();

    if (key === 't') {
      if (timestamp !== null || !TIMESTAMP_PATTERN.test(value)) return null;
      timestamp = value;
      continue;
    }
    if (key === 'v1') {
      if (!HMAC_HEX_PATTERN.test(value)) return null;
      signatures.push(value);
      continue;
    }
    return null;
  }

  if (timestamp === null || signatures.length === 0) return null;
  return { timestamp, signatures };
}

export function signWave(secret: string, timestamp: number | string, rawBody: Buffer | string): string {
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
  const payload = Buffer.concat([Buffer.from(String(timestamp), 'utf8'), body]);
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function verifyWaveSignature(
  header: string | undefined | null,
  rawBody: Buffer,
  secret: string | undefined,
  nowSec: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!secret) return false;
  const parsed = parseWaveSignature(header);
  if (!parsed) return false;

  const timestamp = Number(parsed.timestamp);
  if (!Number.isSafeInteger(timestamp)) return false;
  if (nowSec - timestamp > 300 || timestamp - nowSec > 30) return false;

  const payload = Buffer.concat([Buffer.from(parsed.timestamp, 'utf8'), rawBody]);
  const expected = createHmac('sha256', secret).update(payload).digest();

  let valid = false;
  for (const signature of parsed.signatures) {
    const received = Buffer.from(signature, 'hex');
    valid = received.length === expected.length && timingSafeEqual(received, expected) ? true : valid;
  }
  return valid;
}
