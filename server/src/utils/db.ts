import { AsyncLocalStorage } from 'node:async_hooks';
import type { PoolClient } from 'pg';
import { pool, type DbClient } from '../db/pool.js';
import { logger } from './logger.js';
import { runInBackground } from './background.js';

/**
 * Exécute `fn` dans une transaction PostgreSQL (BEGIN/COMMIT/ROLLBACK).
 * TOUTE mutation monétaire ou de statut passe ici (architecture §5).
 *
 * ## Envois d'e-mail APRÈS le commit (C1 / CA-V5-003)
 *
 * `afterCommit()` enregistre un effet à déclencher une fois la transaction
 * VALIDÉE. Le rollback les jette : une transaction métier annulée n'envoie
 * donc aucun email, alors que la même transaction validée en envoie un.
 *
 * Le stockage est un `AsyncLocalStorage` : chaque transaction a SA propre file.
 * Un simple tableau module-level serait faux — deux requêtes HTTP concurrentes
 * auraient leurs effets mélangés, et un email pourrait partir avant le commit de
 * la transaction qui l'a programmé.
 *
 * ## Imbrication
 *
 * ⚠️ `withTransaction` imbriqué ouvre une VRAIE seconde transaction sur un autre
 * client du pool (ce n'est pas un SAVEPOINT). Chaque niveau possède donc sa
 * PROPRE file :
 * - rollback interne → sa file est jetée, les effets du parent sont intacts ;
 * - commit interne → sa file est VERSÉE dans celle du parent, jamais exécutée.
 *
 * Seul le niveau le plus EXTERNE exécute les effets. Partager un seul tableau
 * entre les niveaux était un défaut : un commit interne déclenchait les envois
 * du parent (donc AVANT son commit), et un rollback interne effaçait les effets
 * déjà programmés par le parent. Les deux violaient P8 / CA-V5-003.
 */
const afterCommitStore = new AsyncLocalStorage<AfterCommitJob[]>();

type AfterCommitJob = () => void | Promise<void>;

/**
 * Programme un effet post-commit. DOIT être appelé depuis le contexte
 * `withTransaction` ; hors transaction, l'effet est exécuté immédiatement
 * (utile pour les endpoints sans transaction, ex. l'inscription).
 *
 * `resolve` est évalué AVANT le commit, dans la transaction : c'est lui qui lit
 * l'adresse email du destinataire en base (CA-V5-011 — résolution par
 * identifiant, jamais depuis le corps de requête). L'envoi lui-même ne reçoit
 * qu'une chaîne déjà résolue, et il est donc immune à un commit concurrent.
 */
export function afterCommit(job: AfterCommitJob): void {
  const jobs = afterCommitStore.getStore();
  if (!jobs) {
    // Pas de transaction ouverte : on exécute tout de suite.
    dispatch(job);
    return;
  }
  jobs.push(job);
}

/** Durée maximale d'un effet post-commit : au-delà, la file avance sans lui. */
const AFTER_COMMIT_JOB_TIMEOUT_MS = 10_000;

/** Un job bloqué (SMTP sans socket timeout) ne doit jamais figer la file. */
class AfterCommitTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`effet post-commit interrompu après ${timeoutMs} ms`);
    this.name = 'AfterCommitTimeoutError';
  }
}

/** Exécute les effets en isolant chaque échec (P8 : un mail ne casse rien). */
async function runSafely(job: AfterCommitJob): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(() => job()),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new AfterCommitTimeoutError(AFTER_COMMIT_JOB_TIMEOUT_MS)), AFTER_COMMIT_JOB_TIMEOUT_MS);
        timer.unref?.();
      }),
    ]);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    if (err instanceof AfterCommitTimeoutError) {
      logger.error('effet post-commit interrompu (timeout)', { errorMessage: reason, timeoutMs: AFTER_COMMIT_JOB_TIMEOUT_MS });
    } else {
      logger.error('effet post-commit ignoré après erreur', { errorMessage: reason });
    }
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Effets post-commit EN COURS. Ils sont lancés sans être attendus (CA-V5-014) :
 * un envoi SMTP coutant ~300 ms sur une transaction de ~6 ms représentait une
 * dégradation de p95 de +4900 %, alors que le cahier tolère +15 %. L'endpoint
 * répond donc dès le commit confirmé ; l'effet tourne ensuite en tâche de fond.
 *
 * Ce registre sert à deux choses : ne pas perdre la trace des envois en cours
 * (vidage orderly possible) et rendre les assertions déterministes côté test
 * via `flushAfterCommit()`.
 */
const inFlight = new Set<Promise<void>>();

/** Suit un effet lancé jusqu'à son terme (quel que soit son résultat). */
function track(promise: Promise<void>): void {
  const pending = promise.finally(() => inFlight.delete(pending));
  inFlight.add(pending);
}

function dispatch(job: AfterCommitJob): void {
  const pending = runSafely(job);
  // Sur Vercel la fonction est gelée après la réponse : sans `waitUntil`,
  // l'effet post-commit (donc l'e-mail) n'est jamais exécuté.
  runInBackground(pending);
  track(pending);
}

/**
 * Attend la fin de tous les effets post-commit en cours (boucle : un effet peut
 * en programmer un autre). Réservé aux tests et à l'arrêt propre du serveur —
 * un endpoint NE DOIT PAS appeler ceci, ce sont précisément ces attentes que
 * CA-V5-014 interdit.
 */
export async function flushAfterCommit(): Promise<void> {
  while (inFlight.size > 0) await Promise.allSettled([...inFlight]);
}

/**
 * Chaque niveau de transaction reçoit SA file. Au commit interne, la file est
 * versée dans celle du parent (`parentJobs.push(...)`) — jamais exécutée : seul
 * le commit le plus externe rend un effet observable (P8, CA-V5-003).
 * Au rollback interne, seule la file de CE niveau est abandonnée.
 */
export async function withTransaction<T>(fn: (client: DbClient) => Promise<T>): Promise<T> {
  const parentJobs = afterCommitStore.getStore();
  const ownJobs: AfterCommitJob[] = [];
  return afterCommitStore.run(ownJobs, () => withTransactionBody(fn, ownJobs, parentJobs));
}

async function withTransactionBody<T>(
  fn: (client: DbClient) => Promise<T>,
  jobs: AfterCommitJob[],
  parentJobs: AfterCommitJob[] | undefined,
): Promise<T> {
  const client: PoolClient = await pool.connect();
  let committed = false;
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    committed = true;
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    if (committed) {
      if (parentJobs) {
        // Niveau interne : on transfère la charge, le parent décidera.
        parentJobs.push(...jobs.splice(0));
      } else {
        // Niveau le plus externe : les effets partent APRÈS le commit confirmé
        // et après `client.release()`, pour ne pas immobiliser un client du
        // pool pendant un envoi SMTP potentiellement lent.
        //
        // Ils sont LANCÉS, pas attendus : `await` ici ferait dépendre la
        // latence de la réponse HTTP du serveur SMTP (CA-V5-014). Le seul
        // effet secondaire retenu est un log d'échec.
        //
        // Ils sont enchaînés SÉRIELLEMENT dans l'ordre d'enregistrement :
        // PO-V5-14 impose qu'un même événement envoie l'e-mail acheteur (E4)
        // avant celui du vendeur (E5). Les lancer en parallèle (ancien
        // `for … dispatch`) laissait l'ordre dépendre du planificateur et
        // rendait `test/emails.test.ts` (E4/E5) aléatoire. Le chaînage ne
        // retient toujours PAS la réponse HTTP : seule la file de fond avance.
        const pending = jobs.splice(0);
        if (pending.length > 0) {
          let chain: Promise<void> = Promise.resolve();
          for (const job of pending) chain = chain.then(() => runSafely(job));
          track(chain);
        }
      }
    }
    // Rollback : la file de ce niveau est abandonnée. Celle du parent, si elle
    // existe, n'est pas touchée — seul le commit externe décidera de ses effets.
  }
}
