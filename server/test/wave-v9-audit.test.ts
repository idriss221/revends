/**
 * V9 — audits [AUDIT] et preuves [EXEC] qui ne peuvent pas être portés par un
 * test de comportement : ordre de montage du webhook, source du montant,
 * absence de secret dans les logs, unicité de l'activation, migration 023
 * additive et rejouable, zones de code interdites, documentation v2.9.
 *
 * Aucun appel Wave, aucun secret réel, aucune production : ce fichier lit le
 * dépôt et la base de TEST (`test/env.ts` force `revends_test`).
 *
 * ### Qualité probatoire (revue du 20/11/2026 — réserve F2)
 * - `[EXEC]` : exécute réellement quelque chose (migration `023` rejouée 2× sur
 *   `revends_test`). C'est une preuve d'exécution.
 * - `[MIROIR]` : lit le code source ou le dépôt par regex/grep/git. C'est un
 *   **garde-fou de non-régression**, PAS une preuve comportementale : une regex
 *   reste verte si le comportement est cassé. La preuve est portée par les suites
 *   référencées dans `MIRROR_TO_BEHAVIOR` (checkout / webhook / enabled / disabled
 *   / diagnostics). Ne jamais compter un miroir comme preuve unique.
 *   13 contrôles `[MIROIR]` = 11 audits d'origine + 2 garde-fous ajoutés en
 *   revue (base de diff F1, rattachement F2) ; 1 seul contrôle `[EXEC]`.
 *
 * ### Base de comparaison (revue du 20/11/2026 — réserve F1)
 * Tout contrôle « 0 ligne / 0 fichier modifié » est mesuré depuis `V9_BASE`
 * (dernier commit avant V9), jamais depuis `HEAD` : comparer à `HEAD` ne voit
 * que les changements non commités et passe quoi qu'il arrive une fois V9
 * commité (preuve tautologique).
 */
import './env.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { testDatabaseUrl } from './env.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const git = (...args: string[]) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });

/** Dernier commit avant V9 — base immuable des contrôles « 0 ligne ». */
const V9_BASE = '42f9bd8';

/** F2 : chaque miroir renvoie vers la suite qui prouve réellement le comportement. */
const MIRROR_TO_BEHAVIOR: Record<string, string> = {
  'CA-V9-006/038': 'wave-v9-webhook.test.ts — « webhook sans cookie ni en-tête CSRF… »',
  'CA-V9-005/038/052': 'wave-v9-webhook.test.ts — journalisation capturée sur signature invalide',
  'CA-V9-017': 'wave-v9-enabled.test.ts — « montant serveur par plan… » + « montant jamais lu dans le corps… »',
  'CA-V9-042': 'wave-v9-webhook.test.ts — « completed valide → … 1 seul e-mail » + « 2 événements distincts… »',
  'CA-V9-065': 'wave-v9-webhook.test.ts — « le webhook n’appelle jamais l’API Wave » + v9-wave.test.tsx',
  'CA-V9-071': 'audit documentaire — aucun comportement exécutable (contrat v2.9)',
  'CA-V9-050/DDL': 'audit [EXEC] ci-dessous — migration 023 rejouée 2× sur revends_test',
  'CA-V9-050/base': 'git diff 42f9bd8..HEAD — aucun équivalent comportemental (audit de dépôt)',
  'CA-V9-054/064': 'git diff 42f9bd8..HEAD — aucun équivalent comportemental (audit de dépôt)',
  'CA-V9-064/conventions': 'v9-wave.test.tsx — « aucun secret… aucun mot proscrit… »',
  'CA-V9-005/secrets': 'wave-v9-disabled.test.ts + wave-v9-webhook.test.ts — « mauvais secret → 400 »',
};

/**
 * F1 : périmètre applicatif exact de V9 (architecture §4.1/§4.2). Toute
 * modification hors de cette liste est un écart, même si elle est commitée.
 */
const V9_APP_ALLOWLIST = new Set([
  'server/migrations/023_wave_checkout.sql',
  'server/src/app.ts',
  'server/src/config.ts',
  'server/src/repositories/wave-events.repository.ts',
  'server/src/routes/wave.routes.ts',
  'server/src/routes/webhooks/wave.routes.ts',
  'server/src/services/storefront.service.ts',
  'server/src/services/wave-checkout.service.ts',
  'server/src/services/wave-client.service.ts',
  'server/src/services/wave-webhook.service.ts',
  'server/src/utils/wave-signature.ts',
  'server/src/utils/wave-validation.ts',
  'web/src/App.tsx',
  'web/src/components/storefront/SubscriptionStatusPanel.tsx',
  'web/src/components/storefront/WaveCheckoutPanel.tsx',
  'web/src/index.css',
  'web/src/lib/storefront.types.ts',
  'web/src/lib/wave.ts',
  'web/src/pages/MonAbonnement.tsx',
  'web/src/pages/WaveEchec.tsx',
  'web/src/pages/WaveSucces.tsx',
  'web/src/pages/admin/Abonnements.tsx',
  'web/src/styles/storefront.css',
  'web/src/v9-wave.test.tsx',
]);

const changedSinceBase = (...paths: string[]): string[] =>
  git('diff', '--name-only', `${V9_BASE}..HEAD`, '--', ...paths).trim().split('\n').filter(Boolean);

const sources = (dir: string): string[] =>
  readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return sources(rel);
    return /\.(ts|tsx)$/.test(entry.name) ? [rel] : [];
  });

const CODE = [...sources('server/src'), ...sources('web/src')];
const codeText = (rel: string) => read(rel);

describe('V9 — audits de montage et de flux', () => {
  it('[MIROIR] CA-V9-006/038 — webhook monté avant CSRF et avant express.json, body brut par express.raw', () => {
    const app = read('server/src/app.ts');
    const webhook = app.indexOf("app.use('/api/webhooks/wave', waveWebhookRouter)");
    const csrf = app.indexOf("app.use('/api', csrfProtection)");
    const json = app.indexOf('app.use(express.json(');
    assert.ok(webhook > 0, 'routeur webhook absent de app.ts');
    assert.ok(csrf > 0 && json > 0, 'barrière CSRF ou express.json introuvable');
    assert.ok(webhook < csrf, 'le webhook doit être monté AVANT csrfProtection');
    assert.ok(webhook < json, 'le webhook doit recevoir les octets bruts AVANT express.json');

    const router = read('server/src/routes/webhooks/wave.routes.ts');
    assert.match(router, /express\.raw\(\{\s*type:\s*'application\/json'/);
    assert.doesNotMatch(router, /express\.json|csrf/i, 'aucun parseur JSON ni CSRF dans le routeur webhook');
  });

  it('[MIROIR] CA-V9-005/038/052 — secret, signature et rawBody absents de tout log serveur', () => {
    const forbidden = /WAVE_WEBHOOK_SECRET|WAVE_API_KEY|Wave-Signature|rawBody|sk_[A-Za-z0-9]/i;
    let logLines = 0;
    for (const rel of sources('server/src')) {
      for (const line of codeText(rel).split('\n')) {
        if (!/logger\.(info|warn|error|debug|fatal|trace)\s*\(/.test(line)) continue;
        logLines += 1;
        assert.doesNotMatch(line, forbidden, `${rel} : un secret/signature/rawBody est journalisé`);
      }
    }
    assert.ok(logLines > 0, 'aucun appel logger trouvé : l’audit ne porte sur rien');
  });

  it('[MIROIR] CA-V9-017 — montant dérivé de subscription_plans, jamais du corps client', () => {
    const checkout = read('server/src/services/wave-checkout.service.ts');
    assert.match(checkout, /String\(subscription\.price_fcfa\)/);
    for (const rel of [
      'server/src/services/wave-checkout.service.ts',
      'server/src/services/wave-client.service.ts',
      'server/src/services/wave-webhook.service.ts',
      'server/src/routes/wave.routes.ts',
      'server/src/routes/webhooks/wave.routes.ts',
    ]) {
      assert.doesNotMatch(codeText(rel), /req\.body\.amount|body\.amount|amount\s*:\s*req\.body/, rel);
    }
    // Le panneau qui déclenche la session n'a aucun prix en dur et n'en envoie aucun.
    const panel = read('web/src/components/storefront/WaveCheckoutPanel.tsx');
    assert.doesNotMatch(panel, /2000|5000|10000|amount/);
    // Seules les 3 URL de repli statiques portent un ?amount= côté front.
    const front = read('web/src/lib/wave.ts');
    assert.equal((front.match(/\?amount=/g) ?? []).length, 3);
    assert.doesNotMatch(front, /parseInt|parseFloat|Number\(/);
  });

  it('[MIROIR] CA-V9-042 — une seule implémentation d’activation, réutilisée par le webhook', () => {
    let definitions = 0;
    for (const rel of sources('server/src')) {
      definitions += (codeText(rel).match(/export async function activateSubscription\s*\(/g) ?? []).length;
      if (rel.endsWith('/storefront.service.ts')) continue;
      assert.doesNotMatch(
        codeText(rel),
        /UPDATE\s+seller_subscriptions\s+SET\s+status\s*=\s*'ACTIVE'/i,
        `${rel} : second chemin d'activation introduit`,
      );
    }
    assert.equal(definitions, 1, 'activateSubscription doit rester la seule implémentation');
    const webhook = read('server/src/services/wave-webhook.service.ts');
    assert.match(webhook, /import\s*\{\s*activateSubscription\s*\}\s*from\s*'\.\/storefront\.service\.js'/);
    assert.match(webhook, /activateSubscription\(config\.wave\.systemAdminId/);
  });

  it('[MIROIR] CA-V9-065 — aucun hors-périmètre dans le livrable Wave', () => {
    const v9 = [
      'server/src/config.ts',
      'server/src/services/wave-checkout.service.ts',
      'server/src/services/wave-client.service.ts',
      'server/src/services/wave-webhook.service.ts',
      'server/src/routes/wave.routes.ts',
      'server/src/routes/webhooks/wave.routes.ts',
      'server/src/utils/wave-signature.ts',
      'server/src/utils/wave-validation.ts',
      'web/src/lib/wave.ts',
      'web/src/components/storefront/WaveCheckoutPanel.tsx',
      'web/src/pages/WaveSucces.tsx',
      'web/src/pages/WaveEchec.tsx',
    ].map(codeText).join('\n');
    for (const pattern of [
      /refund/i,
      /remboursement/i,
      /iframe/i,
      /webview|inappbrowser/i,
      /react-native|\bexpo\b/i,
    ]) {
      assert.doesNotMatch(v9, pattern, `hors-périmètre détecté : ${pattern}`);
    }
  });

  it('[MIROIR] CA-V9-071 — contrat v2.9 et architecture V9 documentés', () => {
    const api = read('docs/api.md');
    assert.match(api, /\*\*2\.9 \(2026-11-19\)\*\*/);
    for (const route of [
      'POST /api/wave/checkout/sessions',
      'POST /api/webhooks/wave',
      'GET /api/wave/config',
      'GET /api/wave/admin/events',
    ]) {
      assert.ok(api.includes(route), `${route} absent de docs/api.md`);
    }
    assert.match(api, /WAVE_DISABLED/);
    assert.match(api, /client_reference/);
    const arch = read('docs/architecture-v9-wave-checkout.md');
    assert.match(arch, /ARCHITECTURE TECHNIQUE V9/);
    assert.match(arch, /WAVE_ENABLED=false/);
  });
});

describe('V9 — migration 023 additive et rejouable', () => {
  it('[MIROIR] CA-V9-050/DDL — table dédiée, event_id unique, aucune table existante modifiée', () => {
    const sql = read('server/migrations/023_wave_checkout.sql');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS wave_checkout_events/);
    assert.match(sql, /CONSTRAINT uq_wave_event_id UNIQUE \(event_id\)/);
    for (const column of ['session_id', 'client_reference', 'amount_fcfa', 'currency', 'status', 'created_at']) {
      assert.match(sql, new RegExp(`\\b${column}\\b`), `colonne ${column} absente de 023`);
    }
    assert.match(sql, /CHECK \(currency = 'XOF'\)/);
    // Les commentaires normatifs (« 0 ALTER TYPE ») ne sont pas du SQL exécutable.
    const executable = sql.split('\n').filter((line) => !line.trimStart().startsWith('--')).join('\n');
    assert.doesNotMatch(executable, /\bALTER\s+TABLE\b|\bALTER\s+TYPE\b|\bDROP\s+TABLE\b|\bDROP\s+COLUMN\b|\bINSERT\s+INTO\s+users\b/i);
    assert.match(read('server/migrations/022_refusal_pair.sql'), /chk_activation_pair/);
  });

  it('[MIROIR] CA-V9-050/base — 001→022 byte-identiques depuis la base pré-V9', () => {
    // F1 : comparer à HEAD ne voit que les non-commités et passe quoi qu'il
    // arrive. La base 42f9bd8 est le dernier commit avant V9.
    assert.deepEqual(
      changedSinceBase('server/migrations/'),
      ['server/migrations/023_wave_checkout.sql'],
      'seule la migration 023 peut apparaître depuis la base pré-V9',
    );
    const tracked = git('ls-files', 'server/migrations/').trim().split('\n');
    assert.ok(tracked.includes('server/migrations/023_wave_checkout.sql'));
    assert.ok(tracked.filter((f) => /^server\/migrations\/0(0[1-9]|1\d|2[0-2])_/.test(f)).length >= 20);
  });

  it('[EXEC] CA-V9-050 — migration 023 exécutée deux fois sur la base de TEST', async () => {
    const sql = read('server/migrations/023_wave_checkout.sql');
    const pool = new pg.Pool({ connectionString: testDatabaseUrl });
    try {
      for (let run = 1; run <= 2; run += 1) {
        await pool.query(sql); // si le DDL n'était pas idempotent, le 2e run lèverait ici
      }
      const columns = await pool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'wave_checkout_events'`,
      );
      const names = columns.rows.map((row) => row.column_name);
      for (const column of ['event_id', 'session_id', 'client_reference', 'amount_fcfa', 'currency', 'status']) {
        assert.ok(names.includes(column), `colonne ${column} absente après 2 exécutions`);
      }
      const constraints = await pool.query<{ conname: string }>(
        `SELECT conname FROM pg_constraint WHERE conname IN ('uq_wave_event_id','chk_wave_row_kind')`,
      );
      assert.equal(constraints.rows.length, 2);
    } finally {
      await pool.end();
    }
  });
});

describe('V9 — zones interdites et conventions', () => {
  it('[MIROIR] CA-V9-054/064 — zones verrouillées : 0 ligne de diff depuis la base pré-V9', () => {
    // F1 : la base est 42f9bd8 (pré-V9), PAS HEAD. Sans cela V9 étant commité,
    // l'assertion est vraie quoi qu'il arrive.
    const lockedPaths = [
      'server/src/services/storefront-admin-ctl.service.ts', // refus V8.2
      'server/src/services/notifications.service.ts', // Gmail
      'server/src/services/notification-dispatch.service.ts', // Whapi
      'server/src/services/subscription-notifications.service.ts',
      '.env.production',
    ];
    const lockedDiff = git('diff', `${V9_BASE}..HEAD`, '--', ...lockedPaths);
    assert.equal(lockedDiff.trim(), '', `aucune modification autorisée sur : ${lockedPaths.join(', ')}`);

    const codeDiff = git(
      'diff', `${V9_BASE}..HEAD`, '--',
      'server/src', 'web/src', 'server/migrations',
      'server/package.json', 'web/package.json',
    );
    const added = codeDiff.split('\n').filter((line) => line.startsWith('+') && !line.startsWith('+++'));
    assert.equal(
      added.filter((line) => /REDIS_URL/i.test(line)).length,
      0,
      'REDIS_URL ne doit apparaître sur aucune ligne ajoutée par V9',
    );
    // Le contact public revendsen@gmail.com est autorisé ; toute autre
    // adresse Gmail/Whapi ajoutée est un écart.
    assert.equal(
      added.filter((line) => /gmail|whapi/i.test(line) && !line.includes('revendsen@gmail.com')).length,
      0,
      'aucun autre compte Gmail/Whapi ajouté par V9',
    );
  });

  it('[MIROIR] CA-V9-071 — tout fichier applicatif modifié depuis la base est dans le périmètre V9', () => {
    const changed = changedSinceBase(
      'server/src', 'web/src', 'server/migrations',
      'server/package.json', 'web/package.json',
    );
    const outside = changed.filter((file) => !V9_APP_ALLOWLIST.has(file));
    assert.deepEqual(outside, [], `fichier applicatif hors périmètre V9 : ${outside.join(', ')}`);
  });

  it('[MIROIR] F2 — table de rattachement des 11 audits d’origine complète', () => {
    assert.equal(Object.keys(MIRROR_TO_BEHAVIOR).length, 11);
    for (const [id, proof] of Object.entries(MIRROR_TO_BEHAVIOR)) {
      assert.ok(proof.length > 0, `aucune preuve comportementale rattachée à ${id}`);
    }
  });

  it('[MIROIR] CA-V9-064/conventions — 0 usage de « ranga », contact public unique, prix de plan inchangés', () => {
    for (const rel of CODE) {
      assert.doesNotMatch(codeText(rel), /ranga/i, `${rel} : usage de « ranga »`);
    }
    const plans = read('server/migrations/019_storefront.sql');
    assert.match(plans, /\(1,\s*'Découverte',\s*2000,\s*10,\s*30/);
    assert.match(plans, /\(2,\s*'Boutique',\s*5000,\s*30,\s*30/);
    assert.match(plans, /\(3,\s*'Atelier',\s*10000,\s*100,\s*30/);
    const allCode = CODE.map(codeText).join('\n');
    assert.ok(allCode.includes('revendsen@gmail.com'));
    assert.doesNotMatch(allCode.replaceAll('revendsen@gmail.com', ''), /@gmail\./i);
  });

  it('[MIROIR] CA-V9-005/secrets — deux variables de secrets distinctes, aucune valeur littérale de clé', () => {
    const config = read('server/src/config.ts');
    assert.match(config, /apiKey:\s*env\.WAVE_API_KEY/);
    assert.match(config, /webhookSecret:\s*env\.WAVE_WEBHOOK_SECRET/);
    assert.match(read('server/src/services/wave-client.service.ts'), /Authorization:\s*`Bearer \$\{options\.apiKey\}`/);
    assert.match(
      read('server/src/routes/webhooks/wave.routes.ts'),
      /verifyWaveSignature\([^\n]*config\.wave\.webhookSecret/,
    );
    const allCode = CODE.map(codeText).join('\n');
    assert.doesNotMatch(allCode, /['"]wave_sn_[A-Za-z0-9_]+['"]/);
    assert.doesNotMatch(allCode, /['"]sk_[A-Za-z0-9]{12,}['"]/);
  });
});
