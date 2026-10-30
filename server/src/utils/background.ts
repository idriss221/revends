import { logger } from './logger.js';

/**
 * Maintient une tâche de fond en vie jusqu'à son terme.
 *
 * Sur Vercel, l'invocation serverless est **gelée dès que la réponse HTTP est
 * envoyée** : une promesse non attendue (`void sendMail(...)`, effets
 * post-commit de `afterCommit`) n'est jamais exécutée. C'est prouvé en
 * production : l'e-mail de bienvenue n'a laissé AUCUNE trace de log, alors que
 * le mot de passe oublié (qui attend l'envoi) est arrivé en ~230 ms.
 *
 * `waitUntil()` est l'API officielle Vercel pour prolonger la durée de vie de
 * l'invocation sans bloquer la réponse : on conserve donc CA-V5-014 (l'endpoint
 * ne paie pas la latence SMTP) tout en garantissant la remise.
 *
 * Hors Vercel (Docker, tests), le processus survit à la réponse : la promesse
 * se termine seule, aucune dépendance n'est chargée.
 */
export function runInBackground(promise: Promise<unknown>): void {
  // Épinglé à `1` par la plateforme Vercel ; absent en local/Docker.
  if (process.env.VERCEL !== '1') return;

  void import('@vercel/functions')
    .then(({ waitUntil }) => waitUntil(promise as Promise<unknown>))
    .catch((err: unknown) => {
      const reason = err instanceof Error ? err.message : String(err);
      logger.warn('waitUntil indisponible — tâche de fond non garantie', { errorMessage: reason });
    });
}
