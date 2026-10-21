/**
 * Journalisation structurée minimale — **une seule fonction d'écriture**
 * (CA-V5-090 / RG-V5-07).
 *
 * ### Choix : PAS de logger externe (pino/winston) — justification consignée
 * Le besoin est un flux **JSON homogène** sur `stdout`/`stderr`, sans transport,
 * sans rotation et sans niveaux dynamiques : la plateforme d'hébergement collecte
 * déjà ces flux. Écrire une API de ~50 lignes, testable et **sans dépendance**,
 * réduit la surface d'attaque et l'empreinte de démarrage (cohérent avec le
 * durcissement V5) tout en couvrant exactement la contrainte. Tout le code
 * serveur journalise via `logger` : **aucun `console.*` libre** dans `src/`.
 *
 * ### Contrat de sortie
 * Objet JSON sur une ligne : `{ ts, level, msg, ...contexte }` où `contexte`
 * peut porter `route`, `method`, `correlationId`, `status`, `code`, `errorName`,
 * `errorMessage`. Les clés sensibles (secret/token/cookie/session/csrf/email/
 * téléphone/adresse) sont **masquées** par `redact` : jamais de secret ni de
 * donnée personnelle (jamais de corps de requête complet).
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Contexte structuré joint à une entrée de log. */
export interface LogFields {
  route?: string;
  method?: string;
  correlationId?: string;
  status?: number;
  code?: string;
  [key: string]: unknown;
}

/** Clés jamais journalisées en clair (secrets, jetons, session, CSRF). */
const SECRET_KEYS = /pass(word)?|secret|token|authorization|cookie|session|csrf|api[-_]?key/i;
/** Clés jamais journalisées en clair (données personnelles — RG-V5-07). */
const PII_KEYS = /e-?mail|phone|t[ée]l[ée]phone|address|adresse/i;

/** Masque récursivement les clés sensibles/PII d'un objet de log. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 5 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEYS.test(key) || PII_KEYS.test(key)) {
      out[key] = '[redacted]';
      continue;
    }
    out[key] = redact(v, depth + 1);
  }
  return out;
}

/**
 * Nettoie les secrets qui pourraient se trouver **dans la valeur** d'un message
 * (et non dans une clé) : chaînes de connexion `user:pass@host`, `password=…`,
 * `Bearer <jeton>`, etc. Appliqué à la ligne JSON finale — défense en
 * profondeur : même un message d'erreur brut ne peut pas fuiter un secret.
 */
export function scrubSecrets(line: string): string {
  return line
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]')
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, '$1[redacted]@')
    .replace(/\b(password|pwd|pass|secret|token|api[-_]?key|authorization)\b(\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s"',;&}\]]+)/gi, '$1$2[redacted]');
}

/** Écrit UNE ligne JSON — point de sortie unique de toute la journalisation. */
function emit(level: LogLevel, message: string, fields: LogFields = {}): void {
  const entry = { ts: new Date().toISOString(), level, msg: message, ...(redact(fields) as LogFields) };
  const line = scrubSecrets(`${JSON.stringify(entry)}\n`);
  if (level === 'error') process.stderr.write(line);
  else process.stdout.write(line);
}

export const logger = {
  debug: (message: string, fields?: LogFields): void => emit('debug', message, fields),
  info: (message: string, fields?: LogFields): void => emit('info', message, fields),
  warn: (message: string, fields?: LogFields): void => emit('warn', message, fields),
  error: (message: string, fields?: LogFields): void => emit('error', message, fields),
};

/**
 * Décrit une erreur inconnue pour le log : nom, message et (bornée) pile d'appels.
 * Ne lève jamais et ne rend jamais de secret (messages d'erreur applicatifs).
 */
export function describeError(err: unknown): LogFields {
  if (err instanceof Error) {
    return {
      errorName: err.name,
      errorMessage: err.message,
      ...(err.stack ? { stack: err.stack.split('\n').slice(0, 6).join('\n') } : {}),
    };
  }
  return { errorMessage: typeof err === 'string' ? err : JSON.stringify(err) };
}
