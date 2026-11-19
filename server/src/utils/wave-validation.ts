import { z } from 'zod';
import { badRequest } from './errors.js';

const waveEventSchema = z
  .object({
    id: z.string().min(1).max(255),
    type: z.string().min(1).max(64),
    data: z
      .object({
        id: z.string().min(1).max(64),
        amount: z.string().max(32).optional(),
        currency: z.string().max(8).optional(),
        client_reference: z.string().max(255).nullish(),
      })
      .passthrough(),
  })
  .passthrough();

export type WaveEvent = z.infer<typeof waveEventSchema>;

export function parseWaveEvent(rawBody: Buffer): WaveEvent {
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    throw badRequest('INVALID_PAYLOAD', 'Charge utile Wave invalide');
  }

  const parsed = waveEventSchema.safeParse(payload);
  if (!parsed.success) {
    throw badRequest('INVALID_PAYLOAD', 'Charge utile Wave invalide');
  }
  return parsed.data;
}
