import bcrypt from 'bcryptjs';
import { badRequest, gone } from '../utils/errors.js';
import { sendMail } from '../mail/mailer.js';
import { findByEmail } from '../repositories/users.repository.js';
import {
  RESET_TOKEN_TTL_MS,
  consumeResetToken,
  findValidResetToken,
  generateResetToken,
  hashResetToken,
  insertResetToken,
  updateUserPassword,
} from '../repositories/password-resets.repository.js';
import { registerSchema } from '../utils/validation.js';

const BCRYPT_COST = 10;

/**
 * Chemin vers l'écran de réinitialisation du SPA (hash routing).
 *
 * ⚠️ **Chemin RELATIF**, jamais d'URL absolue : c'est le contrat du champ
 * `TemplateVars.linkPath`, qui documente « Relié à SITE_URL. Jamais absolu ».
 * Un préfixe `SITE_URL` ici produisait un lien mort
 * (`SITE_URL + "https://SITE_URL/#/…"`), donc un mail de réinitialisation
 * dont le bouton ne menait nulle part.
 */
function resetLink(rawToken: string): string {
  return `/reset-password?token=${encodeURIComponent(rawToken)}`;
}

/**
 * Mot de passe oublié — phase 1 : DEMANDE.
 *
 * ⚠️ ANTI-ÉNUMÉRATION DE COMPTES (CA-AUTH02-01, §9.1).
 * La réponse doit être IDENTIQUE que l'e-mail existe ou non. On ne renvoie
 * jamais « aucun compte ne correspond » : cette phrase seule permet à quiconque
 * de découvrir quelles adresses sont inscrites. On journalise côté serveur la
 * différence (utile au support), on ne la montre jamais au client.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await findByEmail(email);

  if (!user) {
    // Aucun compte : on repart comme si de rien n'était. La réponse HTTP envoyée
    // par la route est la même dans les deux cas.
    return;
  }

  const { rawToken, tokenHash } = generateResetToken();
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

  // Insertion AVANT l'envoi : si l'INSERT échoue, on n'a pas envoyé de lien vers
  // un jeton inexistant (le jeton ne fonctionnerait pas).
  await insertResetToken(user.id, tokenHash, expiresAt);

  // P8 — un échec d'envoi ne fait jamais échouer la demande : l'utilisateur
  // pourra redemander. `sendMail` ne lève jamais.
  await sendMail(user.id, user.email, 'password_reset', {
    linkPath: resetLink(rawToken),
  });
}

/**
 * Mot de passe oublié — phase 2 : RÉINITIALISATION.
 *
 * Séquence : jeton valide → mot de passe haché → `used_at` posé AVANT la mise
 * à jour → `password_changed_at` renseigné (invalide toutes les sessions
 * existantes, pas seulement celle en cours).
 *
 * Le jeton est marqué consommé **avant** le `UPDATE` : si le `UPDATE` échoue,
 * le jeton est déjà brûlé — un échec ne laisse pas une porte réutilisable.
 */
export async function resetPassword(rawToken: string, newPassword: string): Promise<void> {
  if (typeof rawToken !== 'string' || rawToken.trim().length === 0) {
    throw badRequest('MISSING_RESET_TOKEN', 'Jeton de réinitialisation manquant');
  }

  const found = await findValidResetToken(hashResetToken(rawToken.trim()));
  if (!found) {
    // Jeton inconnu, déjà utilisé ou expiré — message unique, aucune
    // distinction exploitable.
    throw gone('INVALID_OR_EXPIRED_RESET_TOKEN', 'Lien de réinitialisation invalide ou expiré');
  }

  const parsed = registerSchema.shape.password.safeParse(newPassword);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Mot de passe invalide';
    throw badRequest('VALIDATION_ERROR', msg);
  }

  // Même politique que l'inscription : coût bcrypt identique.
  const hashed = await bcrypt.hash(parsed.data, BCRYPT_COST);

  const consumed = await consumeResetToken(found.token.id);
  if (!consumed) {
    // Course : le jeton vient d'être consommé (double requête simultanée).
    throw gone('INVALID_OR_EXPIRED_RESET_TOKEN', 'Lien de réinitialisation invalide ou expiré');
  }

  await updateUserPassword(found.user.id, hashed);
}

/**
 * Vrai si la session courante précède le dernier changement de mot de passe.
 * Sert à `requireAuth` pour déconnecter partout après une réinitialisation.
 */
export function sessionPredatesPasswordChange(
  issuedAtMs: number | undefined,
  changedAt: Date | string | null | undefined,
): boolean {
  if (!issuedAtMs || changedAt == null) return false;
  return issuedAtMs < new Date(changedAt).getTime();
}
