import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { normalizePhone } from '../utils/phone.js';

/**
 * WhatsApp via Whapi (gate.whapi.cloud).
 *
 * Aucune API Meta / Cloud API n'est nécessaire : le numéro est connecté chez
 * Whapi et les messages sont envoyés par son API HTTP.
 *
 * Règles de fiabilité :
 *  - le token n'est JAMAIS journalisé ni renvoyé (même tronqué) ;
 *  - un échec WhatsApp n'échoue jamais l'action métier ni l'e-mail ;
 *  - timeout court (8 s) : la fonction serverless ne reste pas suspendue ;
 *  - `WHATSAPP_ENABLED=false` ou token absent ⇒ canal `SKIPPED`, sans appel réseau.
 */

export interface WhatsAppResult {
  ok: boolean;
  skipped?: boolean;
  status?: number;
  error?: string;
}

/** Masque un numéro dans les logs : +221 77 ••• •• 67. */
function maskPhone(phone: string): string {
  if (phone.length < 6) return '***';
  return `${phone.slice(0, 4)}•••${phone.slice(-2)}`;
}

export function whatsappConfigured(): boolean {
  const wa = config.whatsapp as unknown as {
    enabled?: boolean;
    token?: string;
  };
  return Boolean(wa.enabled && wa.token);
}

interface SendOptions {
  /** Paramètres historiques — Whapi envoie le message texte final. */
  templateParams?: string[];
  /** Surcharge ponctuelle du template configuré. */
  templateName?: string;
}

/**
 * Envoie un message WhatsApp. **NE LÈVE JAMAIS** : retourne un résultat
 * explicite que l'orchestrateur de notifications enregistre.
 */
export async function sendWhatsAppMessage(rawPhone: string, body: string, opts: SendOptions = {}): Promise<WhatsAppResult> {
  if (!whatsappConfigured()) {
    return { ok: false, skipped: true, error: 'WHATSAPP_DISABLED' };
  }

  const phone = normalizePhone(rawPhone);
  if (!phone) {
    logger.warn('WhatsApp ignoré : numéro invalide', { phone: maskPhone(rawPhone) });
    return { ok: false, skipped: true, error: 'INVALID_PHONE' };
  }

  const wa = config.whatsapp as unknown as {
    apiUrl?: string;
    token?: string;
  };
  const apiUrl = (wa.apiUrl || 'https://gate.whapi.cloud').replace(/\/+$/, '');
  // Whapi attend le destinataire (format international, ex. 221770673233).
  const to = phone.replace(/^\+/, '');
  const url = `${apiUrl}/messages`;

  const payload = {
    to,
    body,
  };

  const startedAt = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${wa.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 400);
      logger.warn('envoi WhatsApp Whapi refusé', {
        phone: maskPhone(phone),
        status: res.status,
        detail,
        durationMs: Date.now() - startedAt,
      });
      return { ok: false, status: res.status, error: `HTTP_${res.status}` };
    }

    logger.info('message WhatsApp Whapi envoyé', {
      phone: maskPhone(phone),
      mode: 'text',
      durationMs: Date.now() - startedAt,
    });
    return { ok: true, status: res.status };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.error('échec envoi WhatsApp Whapi', {
      phone: maskPhone(phone),
      errorMessage: reason,
      durationMs: Date.now() - startedAt,
    });
    return { ok: false, error: reason };
  }
}
