import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { normalizePhone } from '../utils/phone.js';

/**
 * WhatsApp Business — Cloud API OFFICIELLE (Meta).
 *
 * Aucune automatisation de WhatsApp Web, aucun Puppeteer/Selenium, aucune API
 * non officielle : uniquement `POST https://graph.facebook.com/<version>/
 * <phone-number-id>/messages` avec un token permanent côté serveur.
 *
 * Règles de fiabilité :
 *  - le token n'est JAMAIS journalisé ni renvoyé (même tronqué) ;
 *  - un échec WhatsApp n'échoue jamais l'action métier ni l'e-mail ;
 *  - timeout court (8 s) : la fonction serverless ne reste pas suspendue ;
 *  - sans template pré-approuvé, on n'envoie qu'un message texte (valable
 *    uniquement dans la fenêtre de 24 h ouverte par l'utilisateur).
 *
 * ⚠️ Les messages BUSINESS-INITIATED (commande, paiement…) exigent un template
 * approuvé par Meta. Renseigner `WHATSAPP_TEMPLATE_NAME` + langue, avec un
 * corps composé de variables {{1}}, {{2}}, {{3}}.
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
  return config.whatsapp.enabled && Boolean(config.whatsapp.accessToken) && Boolean(config.whatsapp.phoneNumberId);
}

interface SendOptions {
  /** Paramètres du template ({{1}}, {{2}}…) — ignorés en mode texte. */
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

  const { accessToken, phoneNumberId, apiVersion, templateName, templateLang } = config.whatsapp;
  const template = opts.templateName ?? templateName;
  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

  // Meta attend le numéro SANS le `+` (format international).
  const to = phone.slice(1);

  const payload = template
    ? {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: template,
          language: { code: templateLang || 'fr' },
          components: [
            {
              type: 'body',
              parameters: (opts.templateParams ?? [body]).map((text) => ({ type: 'text', text })),
            },
          ],
        },
      }
    : {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { preview_url: false, body },
      };

  const startedAt = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      // Le corps d'erreur Meta ne contient pas de secret ; on le tronque.
      const detail = (await res.text().catch(() => '')).slice(0, 400);
      logger.warn('envoi WhatsApp refusé', {
        phone: maskPhone(phone),
        status: res.status,
        detail,
        durationMs: Date.now() - startedAt,
      });
      return { ok: false, status: res.status, error: `HTTP_${res.status}` };
    }

    logger.info('message WhatsApp envoyé', {
      phone: maskPhone(phone),
      mode: template ? 'template' : 'text',
      durationMs: Date.now() - startedAt,
    });
    return { ok: true, status: res.status };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.error('échec envoi WhatsApp', {
      phone: maskPhone(phone),
      errorMessage: reason,
      durationMs: Date.now() - startedAt,
    });
    return { ok: false, error: reason };
  }
}
