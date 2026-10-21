import { Router, type Request, type Response } from 'express';
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema } from '../utils/validation.js';
import { requestPasswordReset, resetPassword } from '../services/password-reset.service.js';
import { loginUser, mePayload, registerUser } from '../services/users.service.js';
import { requireAuth, currentUser } from '../middleware/auth.js';
import { config } from '../config.js';
import { findOrCreateOAuthUser } from '../services/oauth.service.js';
import crypto from 'node:crypto';

export const authRouter = Router();

/**
 * URL publique de base, dérivée de la requête entrante.
 *
 * Pourquoi : `GOOGLE_CALLBACK_URL` / `SITE_URL` figés en dur cassent le
 * flux OAuth dès que le site change d'adresse (ex. dev en `localhost`,
 * prod derrière un tunnel/domaine). Google renverrait alors l'utilisateur
 * vers une adresse injoignable → « site inaccessible ».
 *
 * On fait donc confiance au `Host` réellement visité par l'utilisateur
 * (nginx transmet `Host` et `X-Forwarded-Proto`, et `trust proxy` est
 * activé — app.ts:42). Si `SITE_URL`/`*_CALLBACK_URL` sont définis, ils
 * restent prioritaires (override explicite pour l'admin).
 */
function publicBaseUrl(req: Request): string {
  const host = req.get('host');
  if (!host) return config.siteUrl.replace(/\/+$/, '');

  const proto = req.get('x-forwarded-proto')?.split(',')[0]?.trim() || req.protocol || 'https';
  const fromRequest = `${proto}://${host}`;

  const configured = config.siteUrl.replace(/\/+$/, '');
  const configuredIsLocal = /localhost|127\.0\.0\.1/.test(configured);
  const requestIsLocal = /localhost|127\.0\.0\.1/.test(host);

  // `SITE_URL` explicite gagne, SAUF s'il désigne localhost alors que la
  // requête arrive d'ailleurs (cas prod : config de dev oubliée). Sinon
  // Google renverrait l'utilisateur vers une adresse injoignable.
  if (configured && !(configuredIsLocal && !requestIsLocal)) return configured;

  return fromRequest;
}

/** Callback OAuth à déclarer dans la console du fournisseur. */
function oauthCallbackUrl(req: Request, provider: 'google' | 'facebook', explicit?: string): string {
  const base = publicBaseUrl(req);
  // Idem : un callback figé sur localhost est ignoré si la requête vient
  // d'un vrai domaine (sinon → « site inaccessible » après le consentement).
  if (explicit && !(/(localhost|127\.0\.0\.1)/.test(explicit) && !/(localhost|127\.0\.0\.1)/.test(base))) {
    return explicit;
  }
  return `${base}/api/auth/${provider}/callback`;
}


/** POST /api/auth/register — 201, session immédiate (CA-AUTH03-01) */
authRouter.post('/register', async (req, res) => {
  const input = registerSchema.parse(req.body);
  const user = await registerUser(input);
  // Session : establishSession est appelée inline (même logique que avant)
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = user.id;
      req.session.role = user.role;
      req.session.issuedAt = Date.now();
      req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve()));
    });
  });
  res.status(201).json(await mePayload(user));
});

/** POST /api/auth/login — 200, erreur générique (CA-AUTH02-01) */
authRouter.post('/login', async (req, res) => {
  const input = loginSchema.parse(req.body);
  const user = await loginUser(input.identifier, input.password);
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = user.id;
      req.session.role = user.role;
      req.session.issuedAt = Date.now();
      req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve()));
    });
  });
  res.json({
    user: {
      id: user.id,
      displayName: user.display_name,
      email: user.email,
      role: user.role,
      memberSince: new Date(user.created_at).getUTCFullYear(),
    },
  });
});

/** POST /api/auth/forgot-password — 202 TOUJOURS (anti-énumération, §9.1) */
authRouter.post('/forgot-password', async (req, res) => {
  const input = forgotPasswordSchema.parse(req.body);
  await requestPasswordReset(input.email);
  res.status(202).json({
    message: 'Si un compte existe pour cette adresse, un lien de réinitialisation a été envoyé.',
  });
});

/** POST /api/auth/reset-password — 200 (jeton consommé) / 410 (invalide ou expiré) */
authRouter.post('/reset-password', async (req, res) => {
  const input = resetPasswordSchema.parse(req.body);
  await resetPassword(input.token, input.password);
  res.json({
    message: 'Votre mot de passe a été modifié. Vous pouvez vous connecter avec vos nouveaux identifiants.',
  });
});

/** POST /api/auth/logout — 204 idempotent (session détruite + cookie client supprimé) */
authRouter.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid', {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProduction,
      path: '/',
    });
    res.status(204).end();
  });
});

/** GET /api/auth/me — profil + badge notifications (CA-NOT01-01) */
authRouter.get('/me', requireAuth, async (_req: Request, res: Response) => {
  res.json(await mePayload(currentUser(res)));
});

/** OAuth routes — Google */
authRouter.get('/google', async (req: Request, res: Response) => {
  const { clientId, clientSecret } = config.oauth.google;
  const callbackUrl = oauthCallbackUrl(req, 'google', config.oauth.google.callbackUrl);
  if (!clientId || !clientSecret) {
    res.status(503).json({
      error: {
        code: 'OAUTH_NOT_CONFIGURED',
        message: 'OAuth Google non configuré : définissez GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET',
      },
    });
    return;
  }
  const state = crypto.randomBytes(32).toString('base64url');
  req.session.oauthState = state;
  await new Promise<void>((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

authRouter.get('/google/callback', async (req: Request, res: Response) => {
  const { clientId, clientSecret } = config.oauth.google;
  const callbackUrl = oauthCallbackUrl(req, 'google', config.oauth.google.callbackUrl);
  const { code, state, error } = req.query as Record<string, unknown>;

  const redirectError = `${publicBaseUrl(req)}/?oauth=error`;
  if (!clientId || !clientSecret) {
    res.redirect(redirectError);
    return;
  }
  if (error) {
    res.redirect(redirectError);
    return;
  }
  if (!code || typeof code !== 'string') {
    res.redirect(redirectError);
    return;
  }
  if (!req.session.oauthState || state !== req.session.oauthState) {
    res.redirect(redirectError);
    return;
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl,
        grant_type: 'authorization_code',
      }).toString(),
    });

    if (!tokenRes.ok) {
      res.redirect(redirectError);
      return;
    }
    const tokenData = (await tokenRes.json()) as any;
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      res.redirect(redirectError);
      return;
    }

    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!profileRes.ok) {
      res.redirect(redirectError);
      return;
    }
    const profile = (await profileRes.json()) as any;
    const email = profile.email;
    if (!email || typeof email !== 'string') {
      res.redirect(redirectError);
      return;
    }

    const user = await findOrCreateOAuthUser({
      provider: 'google',
      providerId: String(profile.id),
      email,
      name: profile.name,
    });

    await new Promise<void>((resolve, reject) => {
      req.session.regenerate((err) => {
        if (err) return reject(err);
        req.session.userId = user.id;
        req.session.role = user.role;
        req.session.issuedAt = Date.now();
        req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve()));
      });
    });
    res.redirect(publicBaseUrl(req));
  } catch (err) {
    res.redirect(redirectError);
  }
});

/** OAuth routes — Facebook */
authRouter.get('/facebook', async (req: Request, res: Response) => {
  const { appId, appSecret } = config.oauth.facebook;
  if (!appId || !appSecret) {
    res.status(503).json({
      error: {
        code: 'OAUTH_NOT_CONFIGURED',
        message: 'OAuth Facebook non configuré : définissez FACEBOOK_APP_ID et FACEBOOK_APP_SECRET',
      },
    });
    return;
  }
  const state = crypto.randomBytes(32).toString('base64url');
  req.session.oauthState = state;
  await new Promise<void>((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
  const callbackUrl = oauthCallbackUrl(req, 'facebook', config.oauth.facebook.callbackUrl);
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: callbackUrl,
    state,
    scope: 'email',
    response_type: 'code',
  });
  res.redirect(`https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`);
});

authRouter.get('/facebook/callback', async (req: Request, res: Response) => {
  const { appId, appSecret } = config.oauth.facebook;
  const callbackUrl = oauthCallbackUrl(req, 'facebook', config.oauth.facebook.callbackUrl);
  const { code, state, error } = req.query as Record<string, unknown>;

  const redirectError = `${publicBaseUrl(req)}/?oauth=error`;
  if (!appId || !appSecret) {
    res.redirect(redirectError);
    return;
  }
  if (error) {
    res.redirect(redirectError);
    return;
  }
  if (!code || typeof code !== 'string') {
    res.redirect(redirectError);
    return;
  }
  if (!req.session.oauthState || state !== req.session.oauthState) {
    res.redirect(redirectError);
    return;
  }

  try {
    const tokenParams = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: callbackUrl,
      code,
    });
    const tokenRes = await fetch(`https://graph.facebook.com/v21.0/oauth/access_token?${tokenParams.toString()}`);
    if (!tokenRes.ok) {
      res.redirect(redirectError);
      return;
    }
    const tokenData = (await tokenRes.json()) as any;
    const accessToken = tokenData.access_token;
    if (!accessToken) {
      res.redirect(redirectError);
      return;
    }

    const profileRes = await fetch(
      `https://graph.facebook.com/me?fields=id,name,email&access_token=${encodeURIComponent(accessToken)}`,
    );
    if (!profileRes.ok) {
      res.redirect(redirectError);
      return;
    }
    const profile = (await profileRes.json()) as any;
    if (!profile.email || typeof profile.email !== 'string') {
      res.redirect(redirectError);
      return;
    }

    const user = await findOrCreateOAuthUser({
      provider: 'facebook',
      providerId: String(profile.id),
      email: profile.email,
      name: profile.name,
    });

    await new Promise<void>((resolve, reject) => {
      req.session.regenerate((err) => {
        if (err) return reject(err);
        req.session.userId = user.id;
        req.session.role = user.role;
        req.session.issuedAt = Date.now();
        req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve()));
      });
    });
    res.redirect(publicBaseUrl(req));
  } catch (err) {
    res.redirect(redirectError);
  }
});
