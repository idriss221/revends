import { badRequest, conflict, gone } from '../utils/errors.js';
import { sendMail } from '../mail/mailer.js';
import { findByEmail } from '../repositories/users.repository.js';
import { normalizePhone } from '../utils/phone.js';
import {
  PHONE_RESET_TOKEN_TTL_MS,
  consumePhoneResetToken,
  findValidPhoneResetToken,
  generatePhoneResetToken,
  hashPhoneResetToken,
  insertPhoneResetToken,
  updateUserPhone,
} from '../repositories/phone-resets.repository.js';
import { pool } from '../db/pool.js';

/** Chemin RELATIF (contrat TemplateVars.linkPath) — jamais d'URL absolue. */
function phoneResetLink(rawToken: string): string {
  return `/update-phone?token=${encodeURIComponent(rawToken)}`;
}

/**
 * Totale anti-énumération pour la demande unitaire (comme le mot de passe
 * oublié) : la réponse HTTP est identique que le compte existe ou non.
 */
export async function requestPhoneReset(email: string): Promise<void> {
  const user = await findByEmail(email);
  if (!user) return;
  const { rawToken, tokenHash } = generatePhoneResetToken();
  const expiresAt = new Date(Date.now() + PHONE_RESET_TOKEN_TTL_MS);
  await insertPhoneResetToken(user.id, tokenHash, expiresAt);
  await sendMail(user.id, user.email, 'phone_reset', {
    linkPath: phoneResetLink(rawToken),
  });
}

/** Prépare + envoie le mail de mise à jour pour un utilisateur connu (campagne). */
export async function sendPhoneResetToUser(
  userId: number,
  email: string,
): Promise<{ ok: boolean; rawToken?: string }> {
  const { rawToken, tokenHash } = generatePhoneResetToken();
  const expiresAt = new Date(Date.now() + PHONE_RESET_TOKEN_TTL_MS);
  await insertPhoneResetToken(userId, tokenHash, expiresAt);
  const ok = await sendMail(userId, email, 'phone_reset', {
    linkPath: phoneResetLink(rawToken),
  });
  return { ok, rawToken };
}

/**
 * Phase 2 : saisie du nouveau numéro. **Écrase l'ancien numéro.**
 * - jeton valide, usage unique, 7 jours ;
 * - numéro STRICTEMENT `+221` + 9 chiffres commençant par 7
 *   (normalisation partagée `normalizePhone`, jamais de déformation) ;
 * - unicité : un numéro déjà pris par un autre compte → 409 PHONE_TAKEN
 *   (le jeton est alors brûlé pour éviter les essais en boucle).
 */
export async function updatePhoneWithToken(rawToken: string, newPhoneRaw: string): Promise<{ phone: string }> {
  if (typeof rawToken !== 'string' || rawToken.trim().length === 0) {
    throw badRequest('MISSING_RESET_TOKEN', 'Jeton manquant');
  }
  const found = await findValidPhoneResetToken(hashPhoneResetToken(rawToken.trim()));
  if (!found) {
    throw gone('INVALID_OR_EXPIRED_RESET_TOKEN', 'Lien invalide ou expiré');
  }

  const normalized = normalizePhone(newPhoneRaw);
  if (!normalized) {
    throw badRequest(
      'VALIDATION_ERROR',
      'Numéro invalide. Saisissez 9 chiffres commençant par 7 avec +221, ex. 77 123 45 67 ou +221 77 123 45 67.',
    );
  }

  // Unicité avant consommation : même numéro que l'actuel → OK idempotent.
  const { rows } = await pool.query<{ id: number }>(
    `SELECT id FROM users WHERE phone = $1 AND id <> $2 LIMIT 1`,
    [normalized, found.user.id],
  );
  if (rows[0]) {
    throw conflict('PHONE_TAKEN', 'Ce numéro est déjà utilisé par un autre compte.');
  }

  const consumed = await consumePhoneResetToken(found.token.id);
  if (!consumed) {
    throw gone('INVALID_OR_EXPIRED_RESET_TOKEN', 'Lien invalide ou expiré');
  }
  try {
    await updateUserPhone(found.user.id, normalized);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('users_phone_key') || msg.includes('duplicate')) {
      throw conflict('PHONE_TAKEN', 'Ce numéro est déjà utilisé par un autre compte.');
    }
    throw err;
  }
  return { phone: normalized };
}
