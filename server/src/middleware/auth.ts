import type { NextFunction, Request, Response } from 'express';
import type { UserRow } from '../utils/serializers.js';
import { forbidden, unauthorized } from '../utils/errors.js';
import { findById } from '../repositories/users.repository.js';
import { sessionPredatesPasswordChange } from '../services/password-reset.service.js';

// Session côte serveur : userId + role (architecture §6.1)
declare module 'express-session' {
  interface SessionData {
    userId?: number;
    role?: 'user' | 'admin';
    /**
     * Date d'émission de la session (ms epoch), posée à la connexion.
     * Sert à invalider rétroactivement les sessions ouvertes AVANT un
     * changement de mot de passe (route /auth/reset-password) : une
     * réinitialisation doit déconnecter PARTOUT, pas seulement sur l'appareil
     * courant — sinon un voleur de session resterait connecté.
     */
    issuedAt?: number;
    /** État anti-CSRF du flux OAuth en cours (Google / Facebook). */
    oauthState?: string;
  }
}

export interface AuthenticatedLocals {
  user: UserRow; // utilisateur fraîchement rechargé depuis la base (rôle/existence)
}

/**
 * requireAuth : session valide (`userId` présent) et utilisateur existant.
 * Place l'utilisateur frais dans res.locals.user.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = req.session.userId;
  if (typeof userId !== 'number') {
    throw unauthorized('UNAUTHENTICATED', 'Vous devez être connecté');
  }
  const user = await findById(userId);
  if (!user) {
    // Session orpheline : détruire et traiter comme non connecté
    req.session.destroy(() => undefined);
    throw unauthorized('UNAUTHENTICATED', 'Vous devez être connecté');
  }

  // ⚠️ Réinitialisation de mot de passe : toute session émise AVANT le
  // changement est révoquée. `issuedAt` est posé à chaque connexion réussie.
  if (sessionPredatesPasswordChange(req.session.issuedAt, user.password_changed_at)) {
    req.session.destroy(() => undefined);
    throw unauthorized('SESSION_REVOKED', 'Votre session a expiré après un changement de mot de passe. Reconnectez-vous.');
  }

  res.locals.user = user;
  next();
}

/** Extrait l'utilisateur de res.locals.user (mis à jour par requireAuth). */
export function currentUser(res: Response): UserRow {
  const user = res.locals.user;
  if (!user) throw unauthorized('UNAUTHENTICATED', 'Vous devez être connecté');
  return user;
}

/** requireUser : session + rôle exactement 'user' (un admin → 403, T04). */
export async function requireUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  await requireAuth(req, res, () => undefined);
  const user = res.locals.user as UserRow;
  if (user.role !== 'user') {
    throw forbidden('FORBIDDEN', 'Accès réservé aux utilisateurs');
  }
  next();
}

/** requireAdmin : session + rôle 'admin' (un user → 403, CA-AUTH02-04). */
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  await requireAuth(req, res, () => undefined);
  const user = res.locals.user as UserRow;
  if (user.role !== 'admin') {
    throw forbidden('FORBIDDEN', 'Accès réservé aux administrateurs');
  }
  next();
}
