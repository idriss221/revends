import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import type { UserRow } from '../utils/serializers.js';
import { serializeSelfUser } from '../utils/serializers.js';
import { conflict, unauthorized } from '../utils/errors.js';
import { countUnreadNotifications } from './notifications.service.js';
import { sendMail } from '../mail/mailer.js';
import { runInBackground } from '../utils/background.js';
import { findByEmail, insertUser, type UserWithHash } from '../repositories/users.repository.js';

const BCRYPT_COST = 10;

// Hash bcrypt factice : comparé lorsque le compte n'existe pas, pour égaliser
// le temps de réponse (anti-énumération de comptes par timing, §9.1).
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), BCRYPT_COST);

/** Entrée d'inscription — miroir de `registerSchema` (validation.ts = autorité). */
export interface RegisterInput {
  displayName: string;
  name: string;
  email: string;
  phone: string;
  password: string;
  acceptedCgu: true;
}

/** Inscription : hash bcrypt + INSERT, échecs uniques → 409. Retourne la ligne DB (session). */
export async function registerUser(input: RegisterInput): Promise<UserRow> {
  const hashed = await bcrypt.hash(input.password, BCRYPT_COST);
  try {
    const user = await insertUser(
      { displayName: input.displayName, name: input.name, email: input.email, phone: input.phone },
      hashed,
    );
    runInBackground(sendMail(user.id, user.email, 'welcome', { linkPath: '/' }));
    return user;
  } catch (err) {
    if (isUniqueViolation(err, 'users_email_key')) {
      throw conflict('EMAIL_TAKEN', 'Un compte avec cet e-mail existe déjà');
    }
    if (isUniqueViolation(err, 'users_phone_key')) {
      throw conflict('PHONE_TAKEN', 'Un compte avec ce numéro existe déjà');
    }
    throw err;
  }
}

/** Connexion : identifiant = e-mail UNIQUEMENT (E1 — CHG-2/D18, schéma login). */
export async function loginUser(identifier: string, password: string): Promise<UserRow> {
  const id = identifier.trim().toLowerCase();
  const user: UserWithHash | undefined = await findByEmail(id);
  if (!user) {
    // Comparaison factice : même coût CPU qu'un vrai compte (pas de fuite
    // « identifiant inconnu » détectable par timing, §9.1).
    await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
    throw unauthorized('INVALID_CREDENTIALS', 'Identifiants incorrects');
  }
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    throw unauthorized('INVALID_CREDENTIALS', 'Identifiants incorrects');
  }
  return user;
}

export async function mePayload(row: UserRow): Promise<{ user: Record<string, unknown>; unreadNotifications: number }> {
  return {
    user: serializeSelfUser(row),
    unreadNotifications: await countUnreadNotifications(row.id),
  };
}

interface PgErrorLike {
  code?: string;
  constraint?: string;
}
function isUniqueViolation(e: unknown, constraint: string): boolean {
  return typeof e === 'object' && e !== null && (e as PgErrorLike).code === '23505' && (e as PgErrorLike).constraint === constraint;
}
