/**
 * Configuration d'environnement pour les tests — CE MODULE DOIT ÊTRE ÉVALUÉ
 * EN PREMIER dans toute suite.
 *
 * ⚠️ PO-V5-13 / CA-V5-127 — POURQUOI LE CHARGEMENT EST *FORCÉ* ET NON CONDITIONNEL
 * ---------------------------------------------------------------------------
 * `config.ts` appelle `process.loadEnvFile('.env')`, qui **ne surcharge pas** une
 * variable déjà présente dans `process.env`. L'ancien `process.env.DATABASE_URL ??= …`
 * était donc un garde **mou** : il ne protégeait que si RIEN n'avait défini la variable.
 *
 * Bug mesuré (F14) : `test/accueil-v3.test.ts` importe `../src/db/seed.js` (ligne 14)
 * **AVANT** `./helpers.js` (ligne 15) qui importe ce fichier. L'évaluation ESM suit
 * l'ordre des imports → `config.ts` est évalué d'abord → `.env` injecte
 * `DATABASE_URL=…/revends` (base de DEV) → le `??=` ne remplace rien →
 * `resetDatabaseAndSeed()` exécute `DROP SCHEMA public CASCADE` **sur la base de dev**.
 *
 * Deux garanties cumulatives, aucune ne reposant sur l'ordre d'import :
 *   1. AUCUNE affectation conditionnelle ici : `DATABASE_URL` est **écrit** par
 *      affectation inconditionnelle, calculée à partir de `TEST_DATABASE_URL`
 *      (jamais héritée de `DATABASE_URL` ni de `.env`).
 *   2. `package.json` (`npm test`) pré-charge ce module via `--import ./test/env.ts`,
 *      donc il est évalué AVANT tout module applicatif.
 *   3. Filet de sécurité : `bootstrap.ts` refuse (`throw`) de jouer un
 *      `DROP SCHEMA` sur une base dont le nom ne porte pas le suffixe de test.
 */
import { fileURLToPath } from 'node:url';

/** Nom de base de test — constante en dur, jamais hérité de l'environnement. */
export const TEST_DB_NAME = 'revends_test';

/** Connexion d'administration (création de la base de test si absente). */
const DEFAULT_TEST_DATABASE_URL = 'postgres://revends:StrongDevPassword123@127.0.0.1:5433/revends_test';

/**
 * URL de la base de TEST. `TEST_DATABASE_URL` peut la surcharger explicitement ;
 * la valeur est de toute façon RECALCULÉE ici — elle n'est jamais lue dans
 * `DATABASE_URL` ni dans `.env`.
 */
export const testDatabaseUrl: string = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;

/** Même serveur/identifiants, base d'administration `postgres` (création de base). */
const maintenanceUrl = new URL(testDatabaseUrl);
maintenanceUrl.pathname = '/postgres';
export const testMaintenanceUrl: string = maintenanceUrl.toString();

process.env.NODE_ENV = 'test';
// Affectation INCONDITIONNELLE : écrase même une DATABASE_URL fournie par le shell
// ou par un `.env` déjà chargé (cas du contrôle négatif de CA-V5-126).
process.env.DATABASE_URL = testDatabaseUrl;
process.env.TEST_MAINTENANCE_URL = testMaintenanceUrl;
process.env.TEST_DB_NAME = TEST_DB_NAME;
// Uploads isolés par process, purgés à chaque run dans bootstrap.
// Le suffixe "uploads/products" doit subsister DANS le chemin pour que l'URL
// publique `photoPublicPath` → `/uploads/products/...` soit réellement servie.
process.env.UPLOAD_DIR = `/tmp/revends-test-uploads-${process.pid}/uploads/products`;
process.env.DISABLE_CRON = 'true';
// SESSION_SECRET: >=32 chars, no dev/change/test patterns
process.env.SESSION_SECRET = 'strong-session-secret-for-testing-42-chars-minimum-ok!';
// ADMIN_PASSWORD: >=12 chars, no weak patterns
process.env.ADMIN_PASSWORD = 'AdminTestPass123!';
// DB_PASSWORD: >=12 chars, not revends_dev_password
process.env.DB_PASSWORD = 'TestDbPass123!';
process.env.ADMIN_EMAIL = 'admin@revends.com';
// Migrations du dépôt, quel que soit le répertoire courant du runner.
process.env.MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
// Messagerie (C1) : l'envoi est ACTIVÉ mais reste 100 % local — le mailer
// choisit `jsonTransport` en NODE_ENV=test, donc ni SMTP, ni réseau, ni disque
// (CA-V5-015). `MAIL_ENABLED=false` ici disable les tests métier existants ;
// la suite `emails.test.ts` le repasse à `true` pour asserter les 11 envois.
process.env.MAIL_ENABLED = process.env.MAIL_ENABLED ?? 'false';
process.env.MAIL_FROM = process.env.MAIL_FROM ?? 'ReVends <no-reply@revends.test>';
process.env.SITE_URL = process.env.SITE_URL ?? 'https://revends.test';

// Ré-export silencieux : garantit que l'import seul suffit.
export {};