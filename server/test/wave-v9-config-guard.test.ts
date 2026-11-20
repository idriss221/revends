/**
 * V9 — gardes de configuration à la bascule (audit sécurité 20/11/2026).
 *
 * Ces contrôles exécutent un PROCESSUS ENFANT qui importe `src/config.ts` avec
 * des variables fictives générées ici : aucune vraie clé, aucune valeur affichée,
 * aucun appel Wave, aucune base touchée. Le processus meurt par `process.exit(1)`
 * quand la garde refuse — c'est exactement le comportement à prévenir.
 */
import './env.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const API_KEY = 'dummy-key-for-config-probe-only-0123456789';
const SHARED_VALUE = 'shared-dummy-value-for-probe-only-0123456789';
const PREFIXED_SECRET = `wave_sn_WHS_${'f'.repeat(32)}`;
const PLAIN_SECRET = 'b'.repeat(40);

function probe(env: Record<string, string>): { status: number | null; stderr: string; stdout: string } {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', '--import', './test/env.ts', '-e', "import('./src/config.ts').then(() => console.log('CONFIG_ACCEPTED'))"],
    { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...env } },
  );
  return { status: result.status, stderr: result.stderr ?? '', stdout: result.stdout ?? '' };
}

const enabledEnv = (secret: string): Record<string, string> => ({
  WAVE_ENABLED: 'true',
  WAVE_API_KEY: API_KEY,
  WAVE_WEBHOOK_SECRET: secret,
  WAVE_SYSTEM_ADMIN_ID: '7',
  SITE_URL: 'https://revends.test',
});

describe('V9 — configuration Wave à la bascule (V9-SEC-01/02)', () => {
  it('V9-SEC-01 — le préfixe officiel wave_sn_WHS_ est ACCEPTÉ (plus de process.exit)', () => {
    const result = probe(enabledEnv(PREFIXED_SECRET));
    assert.equal(result.status, 0, `démarrage refusé : ${result.stderr.split('\n').find((l) => l.includes('"msg"')) ?? ''}`);
    assert.match(result.stdout, /CONFIG_ACCEPTED/);
    assert.doesNotMatch(result.stderr, /WAVE_WEBHOOK_SECRET/);
  });

  it('V9-SEC-01 — un secret sans préfixe reste accepté (non-régression)', () => {
    const result = probe(enabledEnv(PLAIN_SECRET));
    assert.equal(result.status, 0);
    assert.match(result.stdout, /CONFIG_ACCEPTED/);
  });

  it('V9-SEC-02 — clé API égale au secret webhook ⇒ démarrage refusé, sans valeur', () => {
    const result = probe({ ...enabledEnv(SHARED_VALUE), WAVE_API_KEY: SHARED_VALUE });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /WAVE_API_KEY et WAVE_WEBHOOK_SECRET doivent être distincts/);
    assert.ok(!result.stderr.includes(SHARED_VALUE), 'la valeur fictive a fuité dans le message');
  });

  it('V9-SEC-03 — WAVE_ENABLED absent ⇒ la garde ne s’applique pas (mode désactivé livré)', () => {
    const result = probe({ WAVE_ENABLED: 'false' });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /CONFIG_ACCEPTED/);
  });
});
