# ARCHITECTURE TECHNIQUE V9 — « Wave Checkout + webhooks pour abonnements boutique »

| | |
|---|---|
| **Projet** | ReVends — marketplace de revente d'articles d'occasion (Sénégal) |
| **Version document** | **1.0 — 19/11/2026** |
| **Auteur** | `@architecte` |
| **Statut** | **Proposée — à valider par le chef de projet**. Spécification seule : **aucune ligne de code applicatif écrite, aucun commit créé, aucun autre document modifié**. |
| **Nature** | Architecture **additive** : V9 s'ajoute à V1→V8 sans les amender. Aucune route existante ne change de contrat, aucune table préexistante ne reçoit de colonne, aucun verrou n'est levé. |
| **Cible** | Web (React + Vite, `revends/web`) + API (Node + Express + PostgreSQL, `revends/server`). **Aucune cible mobile native, aucune webview**. |
| **Contexte de production** | `https://revends.vercel.app` — branche `fix/v6-on-799a7ab` — V8.5 déployé. **`WAVE_ENABLED=false`** : livrable « prêt mais désactivé ». Aucune clé Wave dans le coffre ; bascule **hors V9**. Migrations manuelles (`RUN_MIGRATIONS=false`). Prochaine migration : **`023`**. |
| **Références amont** | `docs/cahier-des-charges-v9-wave-checkout.md` (361 lignes, approuvé — porte 2 du `docs/journal.md:4891-4904`) : §1.3 sessions API vs liens hébergés, §1.6 V9-D1…D6, §2.1 F1→F7, §2.2 hors-périmètre, §2.3 interprétations tranchées, §4 (55 `CA-V9-xxx`), §5 (12 `SC-V9-xx`), §6 (14 `R-V9-xx`). · `docs/architecture-v8-hebergement-boutique.md:98-272` (DDL `020`), `:896-1023` (§13 contrat v2.8), `:1026-1063` (§14 arbitrages). · `docs/api.md:5` (contrat v2.8), `:2176-2234` (§3.10). · `docs/journal.md:4836-4904`. |
| **Sources officielles Wave** (citées, non réinventées — vérifiées le 19/11/2026 par le chef de projet, `docs/journal.md:4841-4852` ; relecture des deux URL le 19/11/2026 par `@architecte`, skill `docs-officielles`) | `https://docs.wave.com/checkout` — `POST https://api.wave.com/v1/checkout/sessions` (Bearer, `amount` **string**, `currency: "XOF"` sans décimal, `success_url`/`error_url` **HTTPS qualifiés**, `client_reference` ≤ 255), réponse `wave_launch_url` (`pay.wave.com/c/cos-…`) à ouvrir par le **navigateur** (jamais webview), `GET /v1/checkout/sessions/:id`, `GET /v1/checkout/sessions/search?client_reference=…`. · `https://docs.wave.com/webhook` — `checkout.session.completed` / `checkout.session.payment_failed`, en-tête `Wave-Signature: t=<unix>,v1=<hmac>…`, **payload signé = `timestamp + rawBody`** (concaténation directe, exemple JS officiel), HMAC-SHA256 hex, **plusieurs `v1`** en rotation, rejet rejouer > 5 min, idempotence `event.id`, **2xx < 5 s**, retry jusqu'à 3 jours, secret webhook **distinct** de la clé API. **Request signing et IP whitelisting sont documentés comme optionnels par Wave mais écartés en V9** (Vercel sans IP fixes — cf. §7.6). |
| **Faits non renégociables** | V9-D1 pas de clé / `WAVE_ENABLED=false` en prod · V9-D2 activation **immédiate** sur webhook signé conforme sans clic admin · V9-D3 `admin@revends.com` **id 7** via `WAVE_SYSTEM_ADMIN_ID=7`, **aucune migration `users`** · V9-D4 Découverte **2 000 FCFA** · V9-D5 **sessions API Checkout**, 3 liens hébergés = **repli manuel sans activation auto** · V9-D6 **webhook signé = seule preuve**, `success_url` ne suffit pas. |

> **Convention de lecture.** Chaque décision du §8 est **actionnable** et rattachée à des critères `CA-V9-xxx` binaires. Une affirmation de faisabilité est toujours adossée à un fichier réel inspecté (`fichier:ligne`) ou à une source Wave citée. La preuve finale des critères reste à produire par `@tester` sur le livrable code (cahier §4) : ce document ne la remplace pas.

---

## 1. Principes directeurs et non-régression

### 1.1 Reformulation du problème

V9 doit rendre **implémentable** un parcours d'abonnement payé par Wave sans modifier le parcours manuel existant, malgré l'absence de clés Wave en production. La solution doit donc être **complète, testable et désactivée** : le code, la table, les routes et les tests existent ; aucun appel réseau Wave n'est possible tant que `WAVE_ENABLED=false`, et aucune activation ne peut survenir sans webhook HMAC-valide.

### 1.2 Les 8 principes directeurs (additivité stricte)

| # | Principe | Traduction concrète | Verrou / critère |
|---|---|---|---|
| P1 | **Zéro mutation du schéma existant** | `001`→`022` byte-identiques ; **aucune colonne** sur `users`, `products`, `orders`, `payments`, `seller_subscriptions` ; `chk_activation_pair` (migration `022`) intacte | CA-V9-050, §2.2 cahier |
| P2 | **Une seule implémentation d'activation** | Le chemin webhook appelle `activateSubscription(config.wave.systemAdminId, targetId)` (`storefront.service.ts:653`) — jamais un second `UPDATE ... SET status='ACTIVE'` | CA-V9-040/042/044 |
| P3 | **Webhook = seule preuve** | `success_url`, `error_url` et les `GET` Wave de réconciliation n'écrivent jamais d'activation | CA-V9-018/021/037 |
| P4 | **Fail-closed** | `WAVE_ENABLED=false` (défaut) ⇒ erreur `WAVE_DISABLED`, **0 appel HTTP sortant**, 0 écriture | CA-V9-001/015/016 |
| P5 | **Body brut avant parsing** | Webhook monté avant `csrfProtection` **et** avant `express.json()` ; `express.raw` dans le routeur dédié | CA-V9-006/031/038 (`app.ts:111-114` vérifié) |
| P6 | **Zéro secret exposé** | Deux variables distinctes serveur seul ; ni clé, ni secret, ni signature, ni `rawBody` dans logs/bundle ; drapeau front booléen uniquement | CA-V9-005/038/052/070 |
| P7 | **Cartographie à quatre zéros** | 0 écriture orders/payments/checkout/payouts (V6.4), 0 modification Gmail/Whapi/`REDIS_URL`, 0 changement de prix/quota/commission, 0 modification de `rejectSubscription` | CA-V9-053/054/060/063/064 |
| P8 | **Traçabilité sans fuite** | Table dédiée `wave_checkout_events` : `event_id` unique, référence, montant, devise, statut, souscription cible ; **jamais de donnée Wave dans une réponse publique** | CA-V9-030/046/050/051 |

### 1.3 Garantie de non-régression — état réel vérifié avant conception

| Contrôle | Résultat observé (commandes exécutées le 19/11/2026) |
|---|---|
| Branche | `fix/v6-on-799a7ab` (`git branch --show-current`) |
| État initial du dépôt | `M docs/journal.md` et `?? docs/cahier-des-charges-v9-wave-checkout.md` : **préexistants au travail de l'architecte** (chef de projet). Empreintes capturées avant écriture : `journal.md` `8ee1e58a…10baba`, cahier `c6de577c…8ce89`. Aucune autre modification. |
| Fichier de helper de test | **Correction terrain** : `server/test/helpers.ts` existe ; `server/tests/helpers.ts` **n'existe pas**. Toute référence ultérieure utilise `server/test/helpers.ts` (vérifié : `bootTestServer`, `ApiClient`, `dbQuery`, `errorCode`). |
| Migrations | 21 fichiers `.sql` présents : `001`…`020`, **deux `013`**, **pas de `011` ni de `021`**, `022_refusal_pair.sql` est la dernière. `023` n'existe pas → prochaine migration disponible, cohérente avec le cahier. |
| `app.ts` | `app.use('/api/cron', cronRouter)` **:111**, `app.use('/api', csrfProtection)` **:112**, `app.use(express.json({ limit: '2mb' }))` **:114**. Le modèle de montage avant CSRF est donc réel et reproductible. |
| `config.ts` | Schéma Zod `envSchema` **:15-149**, gardes de production **:233-282**, export `config` **:350-434**. Convention booléenne `z.enum(['true','false']).default(…).transform(v => v === 'true')`. Journalisation des *chemins* uniquement en cas d'erreur de config **:151-159**. |
| Activation | `activateSubscription` **:653-749** : garde `status !== 'PENDING'` **:661-663**, `UPDATE … WHERE id=$1 AND status='PENDING'` **:702-711**, e-mail **après commit** via `afterCommit` **:723-725** avec clé anti-doublon existante, filet DB `23505` **:738-745**. |
| Sérialisation `/me` | `getMySubscription` **:310-385** : `subscription` est un `Record<string, unknown>` **:355-367**, `payment_method`/`payment_reference` **non sérialisés** (confirmation de R-V9-09). Ajout d'un booléen dérivé est donc additif. |
| Projet de test | `server/package.json` : suite via `node --import tsx --import ./test/env.ts --test … test/*.test.ts` ; `web/package.json` : `vitest run`, `tsc -b`, `vite build`. `server/test/env.ts` force `NODE_ENV=test`, `SITE_URL=https://revends.test`, `MIGRATIONS_DIR` du dépôt. |

### 1.4 Périmètre — ce que V9 n'est pas

- **Pas une bascule** : `WAVE_ENABLED=false`, aucune clé posée, aucun webhook enregistré chez Wave, aucun paiement test réel (CA-V9-074).
- **Pas un remplacement du manuel** : `POST /api/subscriptions` tel quel (`subscriptions.routes.ts:17-22`), `validatePaymentFields()` tel quel (`storefront-validation.ts:102-128`), validation admin inchangée (CA-V9-060/061/062).
- **Pas un pipeline de commandes** : 0 ligne dans orders/payments/checkout/payouts ; V6.4 préservé (CA-V9-053).
- **Pas un nouveau canal de notification** : aucun `notification_type` ajouté ; l'e-mail d'activation est celui de `activateSubscription` (CA-V9-043/053).
- **Pas de « ranga »** dans ce document ni dans le livrable ; contact public unique `revendsen@gmail.com` ; numéros `+221 7XXXXXXXX` inchangés (CA-V9-064).

---

## 2. Modèle de données — migration `023`

### 2.1 Fichier et garantie d'additivité

Fichier unique : **`server/migrations/023_wave_checkout.sql`** (PostgreSQL 15+, exécuté par `migrate.ts:16-85` dans `BEGIN`/`COMMIT`, verrou consultatif `123456789`, table `schema_migrations`).

**Arbitrage retenu (décision D-ARCH-1) : tout dans une table dédiée, zéro colonne sur `seller_subscriptions`.**

- `001`→`022` restent **byte-identiques** (preuve : `git diff --stat server/migrations/` ne doit montrer que `023`).
- `chk_activation_pair` (migration `022:29-41`) n'est **ni lue, ni modifiée, ni contournée** : la contrainte exige `started_at`/`ends_at`/`activated_at`/`activated_by` **NULL** en `PENDING`. Le chemin webhook ne touche jamais ces colonnes en `PENDING` — il appelle `activateSubscription`, qui les pose en une seule transaction au passage `ACTIVE`.
- Aucune colonne sur `users` (id 7 existant, authentifié par `WAVE_SYSTEM_ADMIN_ID`), `products`, `orders`, `payments`, `admin_actions` (refus V8.2 intact) ni `notification_type` (aucun `ALTER TYPE`).
- Migration **idempotente** : `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, aucun `INSERT` de seed. Rejouée deux fois sans erreur (CA-V9-050).

### 2.2 DDL exacte de `023_wave_checkout.sql`

```sql
-- ============================================================================
-- 023_wave_checkout.sql — V9 « WAVE CHECKOUT + WEBHOOKS » (PostgreSQL 15+)
-- Prérequis : migrations existantes (001→020, 022) appliquées. Exécutée par
--             migrate.ts dans BEGIN/COMMIT — migrated manuellement en prod
--             (RUN_MIGRATIONS=false, CA-V9-050/075).
-- ADDITIF : 1 table nouvelle, 4 index nouveaux. 0 colonne sur une table
--           existante, 0 trigger, 0 ALTER TYPE, 0 seed, 0 modification 001→022.
-- ============================================================================

CREATE TABLE IF NOT EXISTS wave_checkout_events (
    id               BIGSERIAL PRIMARY KEY,
    -- event_id NULL = ligne « intention » créée côté serveur au moment de la
    -- session API (avant tout webhook). Non NULL = événement Wave reçu.
    event_id         VARCHAR(255) NULL,
    -- cos-… : id de session Wave. Posé à la création (réponse API) puis
    -- retrouvé dans data.id du webhook — y compris sur payment_failed,
    -- dont le payload officiel ne porte pas toujours client_reference.
    session_id       VARCHAR(64) NULL,
    client_reference VARCHAR(255) NOT NULL,
    subscription_id  BIGINT NOT NULL REFERENCES seller_subscriptions(id) ON DELETE CASCADE,
    seller_id        BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount_fcfa      INTEGER NOT NULL CHECK (amount_fcfa > 0),
    currency         VARCHAR(3) NOT NULL DEFAULT 'XOF' CHECK (currency = 'XOF'),
    event_type       VARCHAR(64) NULL,
    status           VARCHAR(32) NOT NULL CHECK (
        status IN ('SESSION_CREATED','PROCESSING','COMPLETED',
                   'PAYMENT_FAILED','IGNORED','FAILED')
    ),
    activated        BOOLEAN NOT NULL DEFAULT false,
    received_at      TIMESTAMPTZ NULL,
    processed_at     TIMESTAMPTZ NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_wave_event_id UNIQUE (event_id),
    CONSTRAINT chk_wave_row_kind CHECK (
        (event_id IS NULL     AND status = 'SESSION_CREATED' AND event_type IS NULL)
        OR
        (event_id IS NOT NULL AND status <> 'SESSION_CREATED' AND event_type IS NOT NULL)
    )
);

-- Une seule intention vivante par souscription : stabilité de client_reference
-- et absence de session dupliquée si le vendeur clique deux fois.
CREATE UNIQUE INDEX IF NOT EXISTS uq_wave_intent_per_subscription
    ON wave_checkout_events (subscription_id) WHERE status = 'SESSION_CREATED';

-- Corrélation webhook → souscription (CA-V9-013/035) et réconciliation SQL.
CREATE INDEX IF NOT EXISTS idx_wave_events_reference
    ON wave_checkout_events (client_reference, created_at DESC);

-- Corrélation de secours pour payment_failed (payload sans client_reference).
CREATE INDEX IF NOT EXISTS idx_wave_events_session
    ON wave_checkout_events (session_id) WHERE session_id IS NOT NULL;

-- File admin : une seule requête paginée, aucun N+1.
CREATE INDEX IF NOT EXISTS idx_wave_events_admin
    ON wave_checkout_events (created_at DESC) WHERE event_id IS NOT NULL;

COMMENT ON TABLE wave_checkout_events IS
    'V9 — traçabilité des sessions API Checkout et des webhooks Wave. event_id unique = idempotence. Aucune donnée publique, aucun secret, aucune référence journalisée en clair (CA-V9-030/050/052).';
COMMENT ON COLUMN wave_checkout_events.event_id IS
    'Identifiant Wave de l''événement (EV_…). NULL pour la ligne intention créée avant webhook.';
COMMENT ON COLUMN wave_checkout_events.client_reference IS
    'Référence déterministe wave-sub-<subscriptionId>-<hmac8>, ≤255, stable par souscription. Non secrète, jamais affichée publiquement ni loggée (CA-V9-012/013/052).';
COMMENT ON COLUMN wave_checkout_events.status IS
    'SESSION_CREATED = intention locale ; PROCESSING = événement revendiqué ; COMPLETED/PAYMENT_FAILED/IGNORED = terminaux (2xx) ; FAILED = à rejouer par Wave.';
```

### 2.3 Sémantique des statuts de trace

| `status` | Signification | Réponse webhook | Effet |
|---|---|---|---|
| `SESSION_CREATED` | Intention créée par `POST /api/wave/checkout/sessions` ; `event_id NULL` | — (pas un webhook) | Aucune activation. `wavePaymentPending` devient `true` côté `/me`. |
| `PROCESSING` | Événement revendiqué (insert gagnant) ; activation en cours | (intermédiaire, < 5 s) | En attente du résultat. |
| `COMPLETED` | Webhook `completed` valide + `activateSubscription` réussi | `200 { received: true }` | `ACTIVE`, `activated_by=7`, 1 e-mail. |
| `PAYMENT_FAILED` | Webhook `payment_failed` signé et rattaché | `200 { received: true }` | Aucune activation, souscription `PENDING`. |
| `IGNORED` | Événement signé mais non pertinent (autre `type`, référence inconnue, montant/devise/méthode incohérents, statut non `PENDING`) | `200 { received: true, ignored: true }` | Aucune écriture hors trace. |
| `FAILED` | Erreur technique pendant l'activation (DB indisponible, conflit inattendu) | `503` (déclenche le retry Wave jusqu'à 3 jours) | Reprise au retry : la ligne existante est **rejouée**, pas dupliquée. |

### 2.4 Pourquoi pas de colonnes sur `seller_subscriptions`

| Option | Pour | Contre | Verdict |
|---|---|---|---|
| **Table dédiée (retenue)** | Additivité totale ; `chk_activation_pair` intacte ; aucune ligne existante réécrite ; histoire complète (plusieurs tentatives, `payment_failed` puis `completed`) ; `event_id` en clé unique naturelle | Une requête de jointure pour la vue admin (résolue par un endpoint dédié paginé, §8-D9) | **RETENUE** |
| Colonnes `wave_session_id` / `wave_client_reference` / `wave_provider` sur `seller_subscriptions` | Lecture `/me` et admin sans jointure | Modifie le schéma V7/V8 ; risque sur `chk_activation_pair` si un champ d'activation était ajouté par erreur ; ne résout pas l'idempotence `event_id` ; écraserait l'historique des tentatives ; contredit §2.3.2 du cahier | **ÉCARTÉE** |
| Réemploi de `admin_actions` (V8.2) | Table existante | Détournerait le refus admin et casserait CA-V9-054 | **ÉCARTÉE** |

---

## 3. Configuration et environnement

### 3.1 Variables exactes à ajouter dans `server/src/config.ts`

Insertion dans `envSchema` (`:15-149`), dans le bloc features aux côtés de `AUTO_APPROVE_V8` / `CRON_SECRET`. Aucune valeur littérale de clé, aucun secret par défaut.

| Variable | Expression Zod exacte | Défaut | Export `config` | Rôle |
|---|---|---|---|---|
| `WAVE_ENABLED` | `z.enum(['true','false']).default('false').transform(v => v === 'true')` | `false` | `config.wave.enabled: boolean` | Interrupteur global ; **fail-closed** |
| `WAVE_API_KEY` | `z.string().optional()` | absent | `config.wave.apiKey: string \| undefined` | Bearer sortant, **serveur seul** |
| `WAVE_WEBHOOK_SECRET` | `z.string().optional()` | absent | `config.wave.webhookSecret: string \| undefined` | HMAC entrant, **distinct** de la clé API |
| `WAVE_SYSTEM_ADMIN_ID` | `z.coerce.number().int().positive().default(7)` | `7` | `config.wave.systemAdminId: number` | `adminId` passé à `activateSubscription` |
| `WAVE_API_BASE_URL` | `z.string().url().default('https://api.wave.com')` | URL officielle | `config.wave.apiBaseUrl: string` | Base des appels sortants ; **injectable en test** |

Aucune variable `REDIS_URL`, `MAIL_*`, `WHAPI_*`, `SESSION_SECRET`, `COMMISSION_RATE` n'est lue ou modifiée par V9.

### 3.2 Garde de démarrage — cohérente avec l'existant

Calquée sur la garde `CRON_SECRET` de `config.ts:233-248` (message journalisé, **jamais la valeur**, puis `process.exit(1)`) :

| Condition | Comportement |
|---|---|
| `WAVE_ENABLED=false` (défaut, prod aujourd'hui) | **Aucune garde bloquante** : le serveur démarre sans clé. Les routes Wave répondent `WAVE_DISABLED`. Le webhook répond `200 { received: true, ignored: true, reason: 'WAVE_DISABLED' }` sans vérifier HMAC (aucun secret à utiliser). |
| `WAVE_ENABLED=true` et `WAVE_API_KEY` absent ou vide | Refus de démarrer : `WAVE_API_KEY est requis lorsque WAVE_ENABLED=true`. |
| `WAVE_ENABLED=true` et `WAVE_WEBHOOK_SECRET` absent, < 32 car. ou préfixe public (`change-me`, `test`, `example`, `wave_sn_WHS_…` de la doc) | Refus de démarrer : message sans valeur, même motif que `CRON_SECRET`. |
| `WAVE_ENABLED=true` et `SITE_URL` non `https://` | Refus de démarrer : la doc Wave impose des `success_url`/`error_url` **HTTPS entièrement qualifiées** (vérifié sur `docs.wave.com/checkout`, paramètres de `POST /v1/checkout/sessions`). En test, `SITE_URL=https://revends.test` (`test/env.ts:77`) satisfait la garde. |
| `WAVE_SYSTEM_ADMIN_ID` | Entier positif ; **contrôle d'existence** (`SELECT id, role FROM users WHERE id = $7 AND role = 'admin'`) au premier appel de webhook valide, pas au démarrage (évite de couper le serveur pour une donnée de seed). Échec ⇒ `FAILED` + 503, sans écriture d'activation. |

### 3.3 Exposition au front — drapeau public, zéro secret

- **Route dédiée** `GET /api/wave/config` (`requireAuth`) → `200 { waveEnabled: boolean }`. Aucun autre champ : ni clé, ni prefix de clé, ni URL d'API, ni secret webhook, ni identifiant admin.
- Le front appelle cette route une fois au chargement de `/mon-abonnement` et de `/admin/abonnements` (query React avec `staleTime` long). `waveEnabled:false` ⇒ **aucun bouton de création de session rendu** ; formulaire manuel + 3 liens hébergés inchangés (CA-V9-002/003).
- Aucune variable `WAVE_*` n'est injectée dans le bundle Vite : `grep -rniE 'WAVE_API_KEY|WAVE_WEBHOOK_SECRET|wave_sn_' web/dist/assets/` doit retourner 0 (CA-V9-070). Le `VITE_`-prefix est **interdit** pour ces variables.
- Le booléen `waveEnabled` n'est pas une preuve de paiement et n'autorise aucune écriture : il ne pilote que l'affichage du bouton (CA-V9-021).

### 3.4 Variables de bascule (hors V9, documentées ici pour éviter l'à-peu-près)

Dès réception des accès : poser `WAVE_API_KEY`, `WAVE_WEBHOOK_SECRET`, `WAVE_ENABLED=true`, `WAVE_SYSTEM_ADMIN_ID=7`, enregistrer `https://revends.vercel.app/api/webhooks/wave` avec les deux événements `checkout.session.completed` et `checkout.session.payment_failed`, puis 1 paiement test. **Aucune de ces étapes n'est exécutée dans V9** (CA-V9-074/075).

---

## 4. Composants et structure de fichiers

### 4.1 Arborescence des nouveaux fichiers

```
server/
├── migrations/
│   └── 023_wave_checkout.sql            # DDL §2 (idempotente)
├── src/
│   ├── utils/
│   │   ├── wave-signature.ts            # HMAC t+rawBody, multi-v1, fenêtre 5 min / 30 s (pur, horloge injectée)
│   │   └── wave-validation.ts           # zod envelope {id,type,data} + data session + amount "YYYY" strict
│   ├── services/
│   │   ├── wave-client.service.ts       # HTTP SORTANT seul (fetch injecté, Bearer, timeout 5 s)
│   │   ├── wave-checkout.service.ts     # Éligibilité, client_reference, intention, wave_launch_url, GET diagnostics
│   │   └── wave-webhook.service.ts      # HMAC + contrôles + idempotence + appel activateSubscription (0 e-mail)
│   ├── repositories/
│   │   └── wave-events.repository.ts    # SQL de wave_checkout_events (intention, claim, statuts, file admin)
│   └── routes/
│       ├── wave.routes.ts               # POST /checkout/sessions, GET /config, GET /admin/events
│       └── webhooks/
│           └── wave.routes.ts           # POST /api/webhooks/wave (express.raw + HMAC + 2xx rapide)
└── test/
    ├── wave-v9-checkout.test.ts         # CA-V9-001..019, 053, 060..065, 072
    ├── wave-v9-webhook.test.ts          # CA-V9-006, 020..047, 050, 051, 052
    └── helpers-wave.ts                  # signeHmac(), fakeFetch(), spyFetchWave(), postRaw()

web/
├── src/
│   ├── pages/
│   │   ├── WaveSucces.tsx               # /paiement-wave/succes — "Wave en attente", aucune écriture
│   │   └── WaveEchec.tsx                # /paiement-wave/echec — repli manuel visible
│   ├── components/storefront/
│   │   └── WaveCheckoutPanel.tsx        # bouton (si waveEnabled), 3 liens hébergés (statiques), état PENDING
│   └── lib/
│       ├── wave.ts                      # createWaveCheckoutSession(), getWaveConfig(), getWaveAdminEvents()
│       └── wave.types.ts                # WaveConfig, WaveCheckoutSession, WaveAdminEvent
```

### 4.2 Fichiers existants modifiés de façon **additive et minimale**

| Fichier | Modification exacte | Contrat |
|---|---|---|
| `server/src/config.ts` | +5 clés dans `envSchema` (§3.1), +gardes (§3.2), +bloc `wave` dans `config` (`:350`) | Aucune clé existante retirée |
| `server/src/app.ts` | +2 `import` ; +`app.use('/api/webhooks/wave', waveWebhookRouter)` **juste avant** la ligne 111/112 ; +`app.use('/api/wave', waveRouter)` près de `:267` | Aucun middleware retiré, aucun ordre existant changé |
| `server/src/services/storefront.service.ts` | Dans `getMySubscription` **uniquement** : +`wavePaymentPending` dans l'objet `subscription` (`:355-367`) | Aucun champ existant modifié (D-ARCH-3) |
| `web/src/lib/storefront.types.ts` | `Subscription` += `wavePaymentPending?: boolean` (`:19-33`) | Optionnel : compatibilité V8.5 conservée |
| `web/src/components/storefront/SubscriptionStatusPanel.tsx` | Si `status==='PENDING' && wavePaymentPending` → libellé « Wave — en attente de confirmation du paiement » (`:31-64`) | Aucun changement pour OM/virement/legacy |
| `web/src/pages/MonAbonnement.tsx` | +`<WaveCheckoutPanel />` dans les visages « aucun » / `PENDING` / `EXPIRED` (`:255`, `:469`, `:369`) | Formulaire manuel et `PaymentReferenceFields` inchangés |
| `web/src/App.tsx` | +2 routes `/paiement-wave/succes`, `/paiement-wave/echec` (après `:129`) | Aucune route existante renommée |
| `web/src/pages/admin/Abonnements.tsx` | +colonne « Paiement Wave » alimentée par `GET /api/wave/admin/events` | File V8 et refus V8.2 inchangés |

**0 ligne** sur : `subscriptions.routes.ts`, `storefront-validation.ts`, `storefront-admin-ctl.service.ts`, `app.ts` hors 2 lignes de montage, `config.ts` hors bloc Wave, `mail/*`, `orders/*`, `payments/*`, `redis*`, `vercel.json`.

### 4.3 Dépendances — schéma texte

```
[Vendeur / navigateur]
   │  POST /api/wave/checkout/sessions  (cookie + CSRF)  ──► wave.routes.ts
   │                                                        │
   │                                                        ▼
   │                                            wave-checkout.service.ts
   │                                              ├─ storefront.service (plan, souscription)
   │                                              ├─ wave-events.repository (intention)
   │                                              └─ wave-client.service ──[Bearer]──► api.wave.com
   │  wave_launch_url ──► navigation navigateur ──► pay.wave.com/c/cos-…
   │  retour ──► /paiement-wave/{succes|echec} ──► GET /api/subscriptions/me (PENDING)

[Wave / serveur]
   POST /api/webhooks/wave  (raw body, hors CSRF) ──► webhooks/wave.routes.ts
        ├─ express.raw (Buffer) → wave-signature.ts (t + rawBody, multi-v1, 5 min)
        ├─ wave-validation.ts (zod envelope)
        └─ wave-webhook.service.ts
             ├─ wave-events.repository (claim event_id, statuts)
             ├─ seller_subscriptions (SELECT seul : statut, payment_method, plan)
             └─ storefront.service.activateSubscription(7, id)  ← SEUL chemin d'activation
                    └─ afterCommit → sendSubscriptionActivatedMail (déjà existant)

[Admin] GET /api/wave/admin/events (requireAdmin) ──► wave-events.repository ──► /admin/abonnements
```

---

## 5. Séquence complète

### 5.1 (a) Création de session → redirection → retour

| # | Appel | Fichier | Garde / effet |
|---|---|---|---|
| 1 | Front lit `GET /api/wave/config` | `web/src/lib/wave.ts` | `waveEnabled:false` ⇒ **bouton non rendu**, arrêt (CA-V9-002) |
| 2 | Clic « Payer avec Wave » → `POST /api/wave/checkout/sessions` `{ subscriptionId }` | `wave.routes.ts` | `requireAuth` + CSRF (navigateur) |
| 3 | Résolution serveur : `SELECT … FROM seller_subscriptions s JOIN subscription_plans pl … WHERE s.id=$1 AND s.seller_id=$2` | `wave-checkout.service.ts` | Introuvable/`PENDING` absent/`payment_method ≠ 'wave'` ⇒ `404`/`409`, **0 appel Wave**, 0 écriture (CA-V9-015/046) |
| 4 | Calcul `amount = String(pl.price_fcfa)` (2 000 / 5 000 / 10 000), `currency='XOF'` | `wave-checkout.service.ts` | Montant **jamais** lu dans `req.body` (CA-V9-011/017) |
| 5 | `client_reference` déterministe `wave-sub-<id>-<hmac8>` ; upsert intention `status='SESSION_CREATED'` | `wave-checkout.service.ts` + `wave-events.repository.ts` | Index partiel unique ⇒ 1 intention par souscription, référence stable (CA-V9-013) |
| 6 | `POST https://api.wave.com/v1/checkout/sessions` `{ amount, currency, success_url, error_url, client_reference }`, `Authorization: Bearer <WAVE_API_KEY>` | `wave-client.service.ts` | 1 appel, timeout 5 s, **0 log de clé/corps** (CA-V9-010/038) |
| 7 | Échec réseau/500 Wave | `wave-checkout.service.ts` | Erreur explicite au front, **0 écriture d'activation**, intention conservée `SESSION_CREATED`, souscription `PENDING` (CA-V9-016) |
| 8 | Succès : `session_id = data.id` (`cos-…`) mis à jour sur l'intention ; réponse `{ waveLaunchUrl, sessionId }` | `wave-checkout.service.ts` | `wave_launch_url` seul ; **aucun secret, aucune référence d'un autre vendeur** (CA-V9-014) |
| 9 | `window.location.assign(waveLaunchUrl)` | `WaveCheckoutPanel.tsx` | Navigation navigateur ; **aucun iframe/webview** (CA-V9-020/024) |
| 10 | Retour `GET /paiement-wave/succes` ou `/echec` | `web/src/App.tsx`, `WaveSucces.tsx`, `WaveEchec.tsx` | Aucun paramètre de requête (ni id, ni référence, ni session) ; `/me` relu pour l'état réel |
| 11 | Page succès | `WaveSucces.tsx` + `SubscriptionStatusPanel.tsx` | `PENDING`, `wavePaymentPending=true` ⇒ « Wave — en attente de confirmation du paiement » ; **0 écriture**, 0 e-mail, boutique 404 (CA-V9-021/022) |
| 12 | Page échec | `WaveEchec.tsx` | Message lisible + formulaire manuel + 3 liens de repli ; `PENDING`, 0 activation (CA-V9-023) |

**URLs de retour** (dérivées de `config.siteUrl`, **sans query**) :
`success_url = ${SITE_URL}/paiement-wave/succes` · `error_url = ${SITE_URL}/paiement-wave/echec` · en prod `https://revends.vercel.app/paiement-wave/…`.

### 5.2 (b) Webhook → HMAC → idempotence → contrôles → activation → effets

| # | Appel | Fichier | Garde / effet |
|---|---|---|---|
| 1 | `POST /api/webhooks/wave`, corps **brut** | `webhooks/wave.routes.ts` | Monté avant CSRF et `express.json()` ; `express.raw({type:'application/json', limit:'256kb'})` ; **aucun cookie/token exigé** (CA-V9-006/036) |
| 2 | `WAVE_ENABLED=false` | `webhooks/wave.routes.ts` | `200 { received:true, ignored:true, reason:'WAVE_DISABLED' }`, **0 écriture** (mode prod actuel) |
| 3 | Lecture `Wave-Signature`, vérification `t + rawBody`, HMAC-SHA256 hex, **toutes valeurs `v1`**, fenêtre passé 300 s / futur 30 s, `timingSafeEqual` | `wave-signature.ts` | Échec ⇒ `400 INVALID_SIGNATURE` (ou 401 en interne), **0 activation**, **0 log de signature/secret/rawBody** (CA-V9-031/032/038) |
| 4 | `JSON.parse(rawBody)` puis zod `{ id, type, data }` ; `amount` doit être une **chaîne de chiffres entiers** | `wave-validation.ts` | Corps resérialisé ⇒ HMAC invalide rejeté en **3** ; JSON invalide ⇒ `400 INVALID_PAYLOAD` |
| 5 | Claim d'idempotence : `INSERT … event_id=$id … ON CONFLICT (event_id) DO NOTHING RETURNING id` | `wave-events.repository.ts` | 1 ligne maximale par `event_id` ; doublon ⇒ lecture du statut existant (CA-V9-030) |
| 6 | Événement déjà `COMPLETED`/`PAYMENT_FAILED`/`IGNORED` | `wave-webhook.service.ts` | `200 { received:true, duplicate:true }` immédiat, 0 seconde activation/e-mail (CA-V9-030/043) |
| 7 | Statut `PROCESSING`/`FAILED` (concurrent ou retry après erreur) | `wave-webhook.service.ts` | Reprise : on revérifie la souscription puis on rappelle `activateSubscription` — la condition `WHERE status='PENDING'` fait le départage (CA-V9-047) |
| 8 | Rattachement : `completed` → `client_reference` (intention) **et** `data.id` (session) ; `payment_failed` → **`data.id` d'abord** (le payload officiel de `payment_failed` ne porte pas systématiquement `client_reference`) | `wave-webhook.service.ts` | Référence inconnue/autre vendeur/session inconnue ⇒ `IGNORED`, `200`, 0 écriture métier (CA-V9-035/036) |
| 9 | Contrôles métier sur la souscription : `status='PENDING'`, `payment_method='wave'`, `amount === String(plan.price_fcfa)`, `currency === 'XOF'` | `wave-webhook.service.ts` | Montant `1000` (ex-lien erroné), décimal, autre devise, OM/virement, `ACTIVE`/`EXPIRED`/`CANCELLED` ⇒ `IGNORED`, 2xx, **0 UPDATE** (CA-V9-033/034/035/041/046) |
| 10 | Événement `checkout.session.payment_failed` cohérent | `wave-webhook.service.ts` | Trace `PAYMENT_FAILED`, `200`, souscription `PENDING`, dates NULL, 0 e-mail (CA-V9-037) |
| 11 | Autre `type` | `wave-webhook.service.ts` | Trace `IGNORED`, `200` (CA-V9-036) |
| 12 | `completed` valide : **appel unique** `activateSubscription(config.wave.systemAdminId /* 7 */, targetId)` | `storefront.service.ts:653` | Seul chemin d'activation : garde `PENDING`, `started_at`/`ends_at` = 30 jours, `activated_by=7`, `activated_at`, auto-approbation, badges (CA-V9-040/042/044) |
| 13 | Conflit attendu de `activateSubscription` (`INVALID_STATUS`, `SUBSCRIPTION_ALREADY_ACTIVE`) | `wave-webhook.service.ts` | Interprété **« déjà gagné »** ⇒ trace `COMPLETED`, `200`. Aucune écrasure de `activated_by`, aucun second e-mail (CA-V9-041/043/047) |
| 14 | E-mail vendeur | `storefront.service.ts:723-725` (`afterCommit`) | **Le contrôle anti-doublon est ici, pas dans le webhook** : file post-commit + clé existante `subscription-activated:<userId>:<subscriptionId>`. Le module Wave n'envoie aucun e-mail (CA-V9-043/053) |
| 15 | Trace `COMPLETED`, `activated=true`, `processed_at=now()` ; réponse | `wave-events.repository.ts` | `200 { received:true }` en < 5 s ; erreur technique inattendue ⇒ `FAILED` + `503` ⇒ retry Wave (CA-V9-036) |

> ⚠️ **Piège de conception documenté** : ne **pas** encapsuler l'appel à `activateSubscription` dans un `withTransaction` externe qui maintient `SELECT … FOR UPDATE` sur la souscription. `withTransaction` ouvre une vraie seconde transaction sur un autre client (`utils/db.ts:22-33`) : le verrou externe et l'`UPDATE` interne se bloqueraient mutuellement. Le gagnant est déterminé par le `UPDATE … WHERE status='PENDING'` de `activateSubscription` lui-même, secondé par la contrainte DB existante `uq_one_active_subscription_per_seller`.

---

## 6. Contrat des nouvelles routes (résumé)

> Le contrat détaillé (schémas, exemples, codes) sera fusionné dans `docs/api.md` **v2.9** par `@backend` (CA-V9-071). Ce document ne modifie pas `api.md`.

| # | Méthode & chemin | Auth / montage | Corps / query | Succès | Erreurs |
|---|---|---|---|---|---|
| N1 | `POST /api/wave/checkout/sessions` | `requireAuth` + CSRF ; routeur monté sous `/api/wave` après `express.json()` | `{ subscriptionId: number > 0 }` | `200 { waveLaunchUrl, sessionId }` | `401 UNAUTHENTICATED` · `400 VALIDATION_ERROR` · `404 WAVE_SUBSCRIPTION_NOT_FOUND` (non divulgateur : introuvable **ou** autre vendeur) · `409 WAVE_SUBSCRIPTION_NOT_PENDING` · `409 WAVE_PAYMENT_METHOD_MISMATCH` · `503 WAVE_DISABLED` · `502 WAVE_UPSTREAM_ERROR` |
| N2 | `POST /api/webhooks/wave` | **Aucun cookie/CSRF** ; monté **avant** `csrfProtection` et avant `express.json()` ; `express.raw` | Corps brut JSON signé ; en-tête `Wave-Signature` | `200 { received: true, duplicate?, ignored?, reason? }` | `400 INVALID_SIGNATURE` · `400 INVALID_PAYLOAD` · `503 WAVE_MISCONFIGURED` · `503 INTERNAL_ERROR` (retry Wave) |
| N3 | `GET /api/wave/config` | `requireAuth` | — | `200 { waveEnabled: boolean }` | `401 UNAUTHENTICATED` |
| N4 | `GET /api/wave/admin/events` | `requireAdmin` | `subscriptionId?`, `page` (défaut 1), `perPage` (1..48, défaut 12) | `200 { items:[{ id, subscriptionId, sellerId, eventId, sessionId, eventType, amountFcfa, currency, status, activated, receivedAt, processedAt, createdAt }], page, perPage, total, totalPages }` | `401` · `403 FORBIDDEN` · `400 VALIDATION_ERROR` |
| N5 | `GET /paiement-wave/succes` | SPA (RequireUser) | **aucun query** | page HTML | — |
| N6 | `GET /paiement-wave/echec` | SPA (RequireUser) | **aucun query** | page HTML | — |

**Extension additive (pas une nouvelle route)** : `GET /api/subscriptions/me` gagne `subscription.wavePaymentPending: boolean` (D-ARCH-3). Méthode, chemin, codes et champs existants **inchangés** (CA-V9-062).

**Routes existantes explicitement inchangées** : `POST /api/subscriptions`, `GET /api/subscriptions/me/stats`, `GET /api/subscriptions/me/report`, `GET /api/admin/subscriptions`, `POST /api/admin/subscriptions/:id/activate`, tout `/api/storefront/*`, tout `/api/cron/*`. En particulier `GET /api/admin/subscriptions` **ne gagne aucun champ** : la vue admin Wave passe par N4 (D-ARCH-9).

---

## 7. Sécurité

### 7.1 Vérification HMAC sur `t + rawBody`

- `Wave-Signature: t=<unix>,v1=<hex>[,v1=<hex>…]` ; parser en **exigeant** exactement un `t=` numérique et **au moins un** `v1=` ; accepter **toutes** les valeurs `v1` (rotation de secret, R-V9-02).
- Payload = concaténation directe de la **chaîne du timestamp** et du **buffer brut** (`Buffer.concat([Buffer.from(String(t)), rawBody])`) — identique à l'exemple JS officiel (`docs.wave.com/webhook`, § « Signature verification implementation »).
- `createHmac('sha256', WAVE_WEBHOOK_SECRET).update(payload).digest('hex')` ; comparaison via `timingSafeEqual` sur les hexadécimaux.
- **Ne jamais** utiliser `req.body` re-sérialisé : un corps réordonné ou réespacé doit échouer (CA-V9-031.b, SC-V9-10).

### 7.2 Fenêtre temporelle et rejeu

- `nowSec = Math.floor(Date.now()/1000)` (horloge **serveur**). Rejet si `now - t > 300` (5 min), si `t - now > 30` (tolérance d'horloge alignée sur la validation de timestamp de `docs.wave.com/checkout`), si `t` absent/non numérique (CA-V9-032).
- Horloge injectée dans `verifyWaveSignature(..., nowSec?)` pour des tests déterministes à 6 min / 4 min sans `setTimeout`.
- Rejeu d'un `event.id` déjà traité ⇒ 2xx immédiat, aucun effet (CA-V9-030/036).

### 7.3 Idempotence et concurrence

- `uq_wave_event_id UNIQUE(event_id)` : un seul gagnant à l'`INSERT`.
- Événements concurrents avec le **même** `event_id` : le perdant lit le statut ; si `PROCESSING`, il retente via `activateSubscription` (dont le `UPDATE … WHERE status='PENDING'` est atomique) ; les deux répondent 2xx (CA-V9-047).
- Événements **distincts** pour la même souscription : le second reçoit `INVALID_STATUS` de `activateSubscription` → interprété « déjà activé » → trace `COMPLETED` (ou `IGNORED` si la souscription n'est plus `PENDING` au contrôle), **jamais de second e-mail**.
- Aucun `FOR UPDATE` traversant l'appel à `activateSubscription` (piège §5.2).

### 7.4 Contrôles métier opposables

`status='PENDING'` **et** `payment_method='wave'` **et** `amount === String(plan.price_fcfa)` **et** `currency='XOF'` **et** rattachement par `client_reference`/`session_id`. Toute déviation ⇒ `IGNORED` + 2xx + 0 activation (CA-V9-033/034/035/046). Aucune activation sur `payment_failed`, ni sur retour navigateur, ni sur `GET /v1/checkout/sessions/:id` même si `checkout_status=complete` (CA-V9-018/021/037).

### 7.5 Secrets, logs, exposition

- `WAVE_API_KEY` et `WAVE_WEBHOOK_SECRET` : deux variables distinctes, serveur seul, **0 valeur littérale** dans le dépôt, `web/dist`, les logs ou les fixtures (CA-V9-005/052/070).
- `rawBody`, en-tête `Wave-Signature`, `client_reference` : **jamais** dans `logger.*` (le logger existant journalise déjà les chemins de config, pas les valeurs — `config.ts:151-159`).
- La référence est stockée en base pour la traçabilité (obligation CA-V9-050), ce qui n'est **pas** un log : aucune requête HTTP ne la renvoie publiquement.
- Le drapeau front est un booléen (`waveEnabled`) : ni clé, ni prefix, ni URL d'API, ni id admin (§3.3).

### 7.6 CSRF, Vercel et mesures écartées

- Le webhook est un appel **machine** : Wave ne peut pas envoyer le cookie ni l'en-tête CSRF. Il est donc monté avant `app.use('/api', csrfProtection)` sur le modèle exact de `/api/cron` (`app.ts:106-112`). Les routes **navigateur** (`/api/wave/...`) restent derrière CSRF.
- **Request signing sortant écarté** : optionnel côté Wave, il exigerait un secret supplémentaire et n'apporte rien ici (le webhook entrant porte déjà l'authenticité ; aucun appel sortant ne modifie d'état métier).
- **IP whitelisting écarté** : Vercel n'a pas d'IP fixes ; la doc Wave précise qu'une fois activé il ne peut pas être désactivé depuis le portail — risque opérationnel rédhibitoire. HMAC + monitoring des 4xx sur la route webhook sont la compensation (R-V9-05).
- Le webhook est monté avant le limiteur global (`:192`) : c'est **volontaire** (les retry Wave ne doivent pas être 429). Monitoring des 4xx/503 et du `event.FAILED` via la table de trace.

---

## 8. Décisions d'architecture (10 arbitrages tranchés)

### D-ARCH-1 — Migration `023` : table dédiée, zéro colonne sur `seller_subscriptions`

**Choix** : une seule table `wave_checkout_events` (§2.2) porte intention + événements ; aucune colonne ajoutée à `seller_subscriptions`.
**Pour** : additivité stricte, `chk_activation_pair` intacte, aucune ligne existante réécrite, clé unique `event_id`, historique des tentatives conservé. **Contre** : jointure pour la vue admin (résolue par N4 paginé).
**CA couverts** : 013, 019, 030, 046, 050.

### D-ARCH-2 — Format du `client_reference`

**Choix** : `wave-sub-<subscriptionId>-<hmac8>` où `hmac8` = 8 premiers hexadécimaux de `HMAC-SHA256(SESSION_SECRET, 'wave-ref:' + subscriptionId)`. Généré dans `wave-checkout.service.ts`, stocké dans la ligne `SESSION_CREATED` dès la création de session. Exemple (fictif) : `wave-sub-41-3f9a2c17` — 21 caractères, ≤ 255.
**Pour** : unique (id de souscription), stable (fonction déterministe), non devinable (HMAC avec séparation de domaine, sans nouveau secret), récupérable par SQL et par `GET /v1/checkout/sessions/search?client_reference=…` ; aucun prix ni donnée vendeur dans la référence. **Contre** : dépend de `SESSION_SECRET` (déjà présent, gardé ≥ 32 car.) ; si ce secret était rotationné, les références des sessions ouvertes changeraient — sans impact car la table conserve l'ancienne référence et le rattachement se fait aussi par `session_id`.
**CA couverts** : 012, 013, 014, 033, 035.

### D-ARCH-3 — Indicateur front : **option (a)**, champ optionnel sur `/me`

**Choix** : `subscription.wavePaymentPending: boolean` dans `GET /api/subscriptions/me`, calculé serveur comme `sub.status === 'PENDING' && sub.payment_method === 'wave'` ; `false` pour OM, virement et legacy ; champ absent si `subscription === null`.
**Pour** : aucun nouvel appel HTTP sur la page, contrat préservé (simple ajout de champ, précédent E4 de v2.8), **zéro dépendance à la table `023`** — donc aucun risque de casser `/mon-abonnement` en prod avant migration manuelle — et **zéro exposition** de `paymentReference`. **Contre** : vrai également pour un Wave payé par lien hébergé (repli) ; le libellé « en attente de confirmation du paiement » reste exact dans les deux cas, et la distinction session API vs lien hébergé n'est pas exigée par CA-V9-019.
**Nom exact** : `wavePaymentPending` (et non `waveCheckoutPending`, qui suggérerait à tort l'existence d'une session API).
**CA couverts** : 019, 022, 062 (et 021 par absence d'effet).

### D-ARCH-4 — Configuration : 4 variables + 1 base URL, gardes, fail-closed

**Choix** : §3.1/§3.2. Défauts `WAVE_ENABLED=false`, `WAVE_SYSTEM_ADMIN_ID=7`, secrets `undefined`. Garde « enabled ⇒ secrets présents + SITE_URL https ». Erreur `WAVE_DISABLED` (503) sur toute tentative serveur. Drapeau public `waveEnabled` via `GET /api/wave/config` (requireAuth).
**Pour** : prod démarre sans clé ; cohérent avec `MAIL_ENABLED`/`CRON_SECRET` ; aucun secret côté client. **Contre** : gardes supplémentaires à maintenir ; une route de lecture de plus.
**CA couverts** : 001, 002, 004, 005, 070, 074.

### D-ARCH-5 — Montage des routes

**Choix** : `POST /api/webhooks/wave` monté dans `app.ts` **juste avant** `app.use('/api/cron', cronRouter)` (`:111`) — donc avant CSRF (`:112`) **et** avant `express.json()` (`:114`) — avec `express.raw` **dans le routeur** ; `app.use('/api/wave', waveRouter)` après les middlewares navigateur, près de `:267`. Pages SPA `/paiement-wave/succes` et `/paiement-wave/echec`.
**Pour** : body brut préservé, aucun token CSRF exigé, aucune route existante touchée, retour sans donnée sensible dans l'URL. **Contre** : deux points de montage sensibles à l'ordre → test d'audit dédié (CA-V9-006).
**CA couverts** : 006, 010, 012, 020, 021, 022, 023, 030, 036, 062.

### D-ARCH-6 — Service Wave : découpage et injectabilité

**Choix** : 3 services (`wave-client` HTTP sortant / `wave-checkout` orchestration / `wave-webhook` sécurité+métier), 1 helper HMAC pur, 1 helper zod, 1 repository, 2 routeurs. `createWaveClient({ fetchImpl, baseUrl, apiKey })` reçoit `fetch` en injection ; défaut = `globalThis.fetch`.
**Pour** : séparation stricte HTTP / HMAC / activation ; tests **sans clé et sans réseau** ; aucun secret dans le module de signature. **Contre** : 6 nouveaux fichiers serveur (chacun < 150 lignes) — complexité maîtrisée et justifiée par la surface de sécurité.
**CA couverts** : 010, 018, 031, 038, 072.

### D-ARCH-7 — Transaction, concurrence et unicité de l'e-mail

**Choix** : claim par `event_id` unique ; statuts `PROCESSING`/`FAILED` rejouables ; `activateSubscription` comme **seul** départageur (`UPDATE … WHERE status='PENDING'` + filet `uq_one_active_subscription_per_seller`) ; **aucun `FOR UPDATE`** traversant l'appel ; e-mail uniquement dans le `afterCommit` déjà existant de `activateSubscription`.
**Pour** : un seul gagnant même avec des `event_id` différents ; 2xx sur doublon ; e-mail unique ; pas de réactivation. **Contre** : logique de reprise à documenter et tester (SC-V9-02, CA-V9-047).
**CA couverts** : 030, 040, 041, 042, 043, 047.

### D-ARCH-8 — Pages retour dédiées, sans query params

**Choix** : `/paiement-wave/succes` et `/paiement-wave/echec`, **sans aucun paramètre** ; état réel lu via `/me` ; `RequireUser` (cookie `SameSite=Lax` transmis sur navigation top-level depuis Wave), repli manuel visible sur les deux.
**Pour** : aucun id de souscription, session ou référence dans l'historique/`Referer` ; aucune écriture ; message cohérent avec `/mon-abonnement`. **Contre** : deux routes front supplémentaires.
**CA couverts** : 020, 021, 022, 023, 024.

### D-ARCH-9 — Traçabilité admin sans toucher à la file V8

**Choix** : `GET /api/wave/admin/events` (requireAdmin, paginé) + colonne « Paiement Wave » dans `/admin/abonnements` (jointure client-side par `subscriptionId`). **`GET /api/admin/subscriptions` inchangé** ; `rejectSubscription`, `admin_actions`, `subscription_refused` intacts.
**Pour** : zéro risque sur la file admin existante ni sur le refus V8.2 ; aucune donnée Wave publique. **Contre** : un appel de plus côté admin.
**CA couverts** : 004, 050, 051, 054.

### D-ARCH-10 — Stratégie de test (à transmettre à `@tester`)

**Choix** :
- Emplacement : `server/test/wave-v9-checkout.test.ts`, `server/test/wave-v9-webhook.test.ts`, helpers dans `server/test/helpers-wave.ts` (helpers génériques existants : `server/test/helpers.ts`).
- HTTP : `fakeFetch({ url, method, headers, body })` injecté dans `createWaveClient` ; il enregistre chaque appel et renvoie des fixtures. **Aucune clé réelle** : secret fictif de test, jamais un prefix `wave_sn_prod_`. Un `spyFetchWave()` enveloppe `globalThis.fetch` et **filtre les appels dont l'hôte est `api.wave.com`** : assertion `=== 0` sur toute la suite (les appels locaux `127.0.0.1` de `ApiClient` restent autorisés).
- Corps brut et HMAC : `postRaw(path, rawBytes, headers)` dans `helpers-wave.ts` envoie des octets exacts (espaces/ordre de clés différents) ; `signWave(secret, t, rawBody)` calcule le HMAC attendu ; en-têtes `t=…,v1=<mauvais>,v1=<bon>` pour la rotation ; horloge injectée pour 6 min / 4 min.
- Idempotence/concurrence : `Promise.all` de 2–3 `postRaw` avec le même `event.id` ; assertions `COUNT(*) FROM wave_checkout_events WHERE event_id=… = 1`, `COUNT(*) … status='ACTIVE' = 1`, compteur e-mail `= 1`.
- Non-régression : rejeu `npm test` (serveur, dont `storefront-v8.test.ts` **63/63**) et `npm test` (web, **273/273**), `npm run typecheck` (serveur), `npm run typecheck` / `npm run build` (web), `npm audit --omit=dev` des deux côtés.
**Pour** : preuves binaires, 0 réseau Wave, 0 clé, HMAC multi-`v1` et corpus resérialisé couverts. **Contre** : petit helper de test supplémentaire pour envoyer du brut (hors code de production).
**CA couverts** : 006, 030…038, 043, 047, 063, 072, 073.

### 8.11 Matrice de couverture des 55 critères

| Critère | Réponse architecturale | Décision / section |
|---|---|---|
| 001 | `WAVE_ENABLED=false` par défaut, `WAVE_DISABLED`, 0 appel (`fakeFetch.calls=0`) | D4 §3.2 |
| 002 | `GET /api/wave/config` ⇒ bouton non rendu, formulaire + 3 liens présents | D4 §3.3, D8 |
| 003 | 3 liens statiques, clic = navigation seule, aucune écriture | §1.4, D8 |
| 004 | `WAVE_SYSTEM_ADMIN_ID=7`, SQL `users` intact, contrôle `role='admin'` | D4 §3.2, D9 |
| 005 | Deux secrets, 0 valeur dans dépôt / bundle / logs | §7.5 |
| 006 | Webhook monté avant `:112`, aucun CSRF | D5 §4.2 |
| 010 | 1 appel `POST /v1/checkout/sessions` Bearer via `fakeFetch` | D6 §5.1 |
| 011 | `amount=String(plan.price_fcfa)` serveur seul, XOF sans décimal | §5.1 étape 4, §8-D1 |
| 012 | `success_url`, `error_url`, `client_reference` ≤ 255 | D2, D5, D8 |
| 013 | Référence stable/unique, table + `search?client_reference` | D2, §2.2 |
| 014 | `waveLaunchUrl` seul dans la réponse | §5.1 étape 8 |
| 015 | 404/409 sans appel Wave ni écriture | §5.1 étape 3, §6 N1 |
| 016 | `WAVE_UPSTREAM_ERROR` 502, 0 écriture d'activation | §5.1 étape 7 |
| 017 | Aucun prix codé dans le front (hors 3 URL de repli statiques) | §5.1 étape 4, §1.4 |
| 018 | GET diagnostics isolés, jamais déclencheurs | D6, §7.4 |
| 019 | `wavePaymentPending` explicite, false pour OM/virement/legacy | D3 |
| 020 | `window.location.assign`, pas d'iframe | §5.1 étape 9 |
| 021 | Page succès = 0 écriture, `PENDING`, boutique 404 | D8 §5.1 étape 11 |
| 022 | Libellé « Wave — en attente de confirmation… » via l'indicateur | D3, D8 |
| 023 | Page échec + repli, 0 activation | D8 §5.1 étape 12 |
| 024 | Aucune webview introduite, aucun paramètre croisé | D8, §6 N5/N6 |
| 030 | `uq_wave_event_id`, 1 trace, 1 e-mail, 2xx sur doublon | D1, D7 |
| 031 | HMAC `t+rawBody`, multi-`v1`, corps resérialisé rejeté | §7.1, D10 |
| 032 | 300 s passé / 30 s futur, horloge serveur injectée | §7.2 |
| 033 | `amount` comparé au plan ; `1000`/décimal/autre plan rejetés | §5.2 étape 9 |
| 034 | `currency='XOF'` CHECK BDD + contrôle applicatif | §2.2, §5.2 étape 9 |
| 035 | Référence/session rattachée, statut `PENDING` exigé | §5.2 étapes 8-9 |
| 036 | 2xx < 5 s pour traité/non pertinent ; 4xx signature ; retry sans double effet | §5.2, §7.6 |
| 037 | `payment_failed` ⇒ trace + 2xx, 0 activation | §5.2 étape 10 |
| 038 | `express.raw` avant parsing ; secret/signature/rawBody absents des logs | D5, §7.5 |
| 040 | Un seul `PENDING → ACTIVE`, 30 j, `activated_by=7` | D7, §5.2 étape 12 |
| 041 | Garde `status !== 'PENDING'` de `activateSubscription`, `activated_by` préservé | §5.2 étape 13 |
| 042 | Un seul `activateSubscription` (`storefront.service.ts:653`) | P2, D7 |
| 043 | E-mail unique : `afterCommit` existant, module Wave muet | §5.2 étape 14, D7 |
| 044 | Parité webhook/admin par réutilisation stricte | P2, D7 |
| 045 | Aucune écriture de `payment_method`/`payment_reference` par V9 | §2.1, D1 |
| 046 | `payment_method='wave'` exigé, OM/virement rejetés | §5.2 étape 9 |
| 047 | Unique `event_id` + `UPDATE … WHERE PENDING` ⇒ 1 gagnant | D7, §7.3 |
| 050 | `023` additive, idempotente, 0 colonne existante | D1, §2.1 |
| 051 | `GET /api/wave/admin/events` + colonne admin, 0 exposition publique | D9 |
| 052 | 0 secret en clair, référence non journalisée | §7.5 |
| 053 | Aucun e-mail avant webhook validé ; `notification_type` intact | §5.2 étape 14, P7 |
| 054 | `rejectSubscription` / `admin_actions` / `subscription_refused` intacts | D9, P7 |
| 060 | `POST /api/subscriptions` inchangé, flux manuel Wave | P7, §1.4 |
| 061 | OM/virement manuels, aucun webhook ne les active | §5.2 étape 9 |
| 062 | Routes existantes préservées ; extension additive `/me` seule | D3, §6 |
| 063 | Verrous V8 non régressés (gratuit, 10 %, catalogue, parrainage) | P7, D10 |
| 064 | 0 terme proscrit, contact unique, prix inchangés | §1.4, P7 |
| 065 | Aucun remboursement/webview/mobile/automation des liens | §1.4, P7 |
| 070 | 0 secret dans `web/dist` et les logs | §3.3, §7.5 |
| 071 | Fusion `api.md` v2.9 par `@backend` (hors ce livrable) | §6 note |
| 072 | Suite mockée nommée, 0 appel réel, 12 scénarios couverts | D10 |
| 073 | 63/63, 273/273, typechecks, build, audits 0 | D10, §10 |
| 074 | Prod `WAVE_ENABLED=false`, aucun secret posé | §3.4 |
| 075 | Backup → migration `023` → code → `deploy-vercel.sh`, **non exécuté** | §9 R-V9-07 |

---

## 9. Risques résiduels et plans B

### 9.1 Les 14 risques du cahier — traités

| ID | Niveau | Traitement architectural | Plan B / restant |
|---|---|---|---|
| R-V9-01 Clés absentes | 🔴 Bloquant | Mode « prêt mais désactivé », 0 garde bloquante si `false` (§3.2) | **Accepté** : bascule hors V9 (§3.4) |
| R-V9-02 Rotation `v1` | ⚠️ | Toutes valeurs `v1` acceptées + `timingSafeEqual` (§7.1) | Aucun journal de secret ; compteur de rotation uniquement |
| R-V9-03 Horloge/rejeu | ⚠️ | 300 s passé / 30 s futur, horloge serveur (§7.2) | Durcir à 120 s ; GET diagnostic ne peut jamais activer |
| R-V9-04 Idempotence | 🔴 | `uq_wave_event_id` + statuts rejouables + garde `PENDING` (§7.3) | 2xx sur déjà-traité, jamais 5xx sur doublon terminal |
| R-V9-05 Vercel sans IP fixes | 🔴 | HMAC obligatoire ; request signing / whitelist **écartés et justifiés** (§7.6) | Rotation du secret webhook + monitoring 4xx |
| R-V9-06 Liens hébergés modifiables | 🔴 | Repli manuel uniquement, montant figé serveur pour les sessions API (P7) | Validation admin comme aujourd'hui |
| R-V9-07 Migration manuelle | ⚠️ | `023` avant le code, `IF NOT EXISTS`, `/me` sans dépendance à la table | Rollback par backup ; `WAVE_ENABLED=false` rend l'absence de table inoffensive sur le parcours principal |
| R-V9-08 Dépendance `activateSubscription` | ⚠️ | Réutilisation stricte, 0 second `UPDATE` (P2) | Test de parité webhook vs admin ; revert du module Wave seul |
| R-V9-09 Front ne peut pas déduire « wave » | ⚠️ | `wavePaymentPending` calculé serveur depuis `payment_method` (D3) | Libellé neutre commun si le champ est absent |
| R-V9-10 `success_url` pris pour preuve | 🔴 | Aucune écriture sur les pages retour, GET diagnostics stériles (§5.1) | Reste `PENDING` + support `revendsen@gmail.com` |
| R-V9-11 Secret exposé | 🔴 | 2 secrets serveur seuls, greps build/logs (§7.5) | Rotation immédiate + retrait du champ de log |
| R-V9-12 OM/virement activés par erreur | ⚠️ | `payment_method='wave'` exigé au contrôle webhook (§5.2) | Rejet `IGNORED`, validation admin conservée |
| R-V9-13 Noms non figés | INFO | **Tranché** : §6 (routes), §2 (table), D2 (référence), D3 (champ) | `@backend` fusionne en api.md v2.9 |
| R-V9-14 Bascale hors V9 mal interprétée | INFO | En-tête, §1.4, §3.4, CA-V9-074 explicites | Rappel : décision utilisateur D1, pas un oubli |

### 9.2 Risques d'architecture identifiés pendant la conception

| ID | Risque | Niveau | Action | Plan B |
|---|---|---|---|---|
| R-ARCH-01 | **Piège `payment_failed` sans `client_reference`** : la doc officielle montre un payload de `payment_failed` sans ce champ → corrélation par référence seule perdrait l'événement | ⚠️ Important | Rattachement par `session_id` (`data.id`) en priorité sur `payment_failed`, index dédié (§2.2, §5.2 étape 8) | `IGNORED` + 2xx ; le vendeur reste `PENDING` et le support corrèle via la file admin |
| R-ARCH-02 | **Deadlock `withTransaction` imbriqué + `FOR UPDATE`** sur la souscription | ⚠️ Important | Aucun verrou externe traversant `activateSubscription` (§5.2 note) | S'appuyer sur `UPDATE … WHERE PENDING` + contrainte DB unique existante |
| R-ARCH-03 | **`success_url` HTTPS obligatoire** : la doc Wave exige une URL HTTPS qualifiée ; un `SITE_URL` HTTP en bascule ferait rejeter la création de session | ⚠️ Important | Garde de démarrage `WAVE_ENABLED=true ⇒ SITE_URL https` (§3.2) ; `test/env.ts` utilise déjà `https://revends.test` | Corriger `SITE_URL` dans la config Vercel avant bascule |
| R-ARCH-04 | **Table `023` absente en prod** (migration manuelle oubliée) alors que le code est déployé | ⚠️ Important | Le parcours principal `/me` et le webhook `WAVE_DISABLED` **ne lisent pas la table** ; seul `/api/wave/admin/events` la lit | Appliquer `023` avant le code ; rollback par backup (R-V9-07) |
| R-ARCH-05 | **Retry Wave après erreur technique** : si on répondait 2xx sur `FAILED`, l'activation serait perdue | ⚠️ Important | Statut `FAILED` ⇒ `503` explicite, ligne conservée et rejouée (§2.3, §5.2 étape 15) | Corrélation diagnostic via `GET /v1/checkout/sessions/:id` (jamais activatrice) |
| R-ARCH-06 | **Extension `/me` interprétée comme rupture de contrat** | INFO (mineur) | Champ optionnel, précédent documenté E4 v2.8, aucun champ existant modifié (D3) | Route de lecture dédiée `GET /api/subscriptions/me/wave` si le chef de projet préfère zéro extension |

### 9.3 Risques ouverts à la validation du chef de projet

- **Aucun bloquant technique** pour la spécification : tous les arbitrages sont tranchés (§8), les faits Wave sont sourcés et le mode désactivé rend la production sûre.
- **Attendu externe** : validation de ce document (statut « proposée »), puis fusion `api.md` v2.9 par `@backend` et grille de recette par `@tester`. La bascule de production reste **hors V9** par décision utilisateur.

---

## 10. Définition de Done de l'architecture — verdict binaire

> Portée : **ce document uniquement**. Les 55 `CA-V9-xxx` décrivent le livrable code futur et sont transférés à `@tester` ; ils ne sont pas validés ici (aucun code Wave écrit, aucun secret posé, aucune production touchée).

| # | Exigence de la mission | O/N | Preuve |
|---|---|---|---|
| 1 | Un seul fichier créé, aucun autre document modifié, aucun commit | ✅ O | `git status --short` en fin de tâche (§10.2) : seuls les 2 états **préexistants** du chef de projet + ce nouveau fichier ; empreintes `journal.md` et cahier inchangées (§1.3) |
| 2 | En-tête complet (version, date, auteur, statut proposé, références cahier + sources Wave URL) | ✅ O | Tableau d'en-tête, lignes 3-12 |
| 3 | §1 Principes directeurs et non-régression (verrous, additivité) | ✅ O | §1.1→§1.4, 8 principes P1–P8 |
| 4 | §2 Modèle de données : DDL exacte `023`, arbitrage table vs colonnes, index, 0 modification `001`→`022` | ✅ O | §2.1→§2.4 ; 21 fichiers de migration réels vérifiés, `023` absent |
| 5 | §3 Configuration/env : noms, types Zod, défauts, gardes, fail-closed, exposition front sans secret | ✅ O | §3.1→§3.4, `config.ts:15-149/233-282/350-434` inspecté |
| 6 | §4 Composants, arborescence, responsabilités, dépendances | ✅ O | §4.1→§4.3 |
| 7 | §5 Séquences complètes (session → navigateur → retour ; webhook → HMAC → activation) avec fichiers et ordre | ✅ O | §5.1 (12 étapes), §5.2 (15 étapes) |
| 8 | §6 Contrat des nouvelles routes (résumé, api.md v2.9 délégué) | ✅ O | §6, 6 routes N1–N6 + extension additive |
| 9 | §7 Sécurité HMAC `t+rawBody`, multi-`v1`, 5 min, replay, idempotence, secrets, CSRF, Vercel | ✅ O | §7.1→§7.6, sources `docs.wave.com/webhook` et `/checkout` citées |
| 10 | §8 Les **10 décisions** avec choix, pour/contre, CA associés + couverture des 55 critères | ✅ O | §8 D-ARCH-1…D-ARCH-10 + §8.11 (55 lignes) |
| 11 | §9 Risques résiduels et plans B (14 du cahier + 6 d'architecture) | ✅ O | §9.1, §9.2, §9.3 |
| 12 | Auto-revue effectuée (unicité des IDs, cohérence des sections, pièges corrigés) | ✅ O | §10.3 |
| 13 | Skills obligatoires appliqués et prouvés | ✅ O | `plan-le-first` (plan en 7 étapes), `docs-officielles` (2 URL relues), `gestion-risques` (§9), `verifie-toujours` (§1.3 + §10.2), `auto-revue` (§10.3), `definition-done` (ce tableau) |
| 14 | Aucun chiffre déformé, aucun terme proscrit, contact `revendsen@gmail.com` | ✅ O | Découverte **2 000**, Boutique **5 000**, Atelier **10 000** ; `1000` uniquement cité comme **montant rejeté** (CA-V9-033) ; §1.4 |

### 10.1 Mesures finales

- Nombre de sections principales : **10** (§1 à §10) + en-tête + §8.11.
- Longueur finale mesurée : **622 lignes** (`wc -l docs/architecture-v9-wave-checkout.md`).
- Fichier livré : `docs/architecture-v9-wave-checkout.md`.
- Aucun code applicatif, aucune migration réelle, aucun commit, aucun secret.

### 10.2 Preuves d'exécution (commandes réellement lancées)

```
git branch --show-current                  → fix/v6-on-799a7ab
sha256sum docs/journal.md                  → 8ee1e58a9b56d7fec79598fdc6803868c6fdeab81ce4abdfa4c8f6b42100baba  (avant)
sha256sum docs/cahier-des-charges-v9…md    → c6de577c89dd6c05111b1102edcecbb15b5a8439bc28e818b672ec61f9b8ce89  (avant)
wc -l docs/cahier-des-charges-v9…md        → 361
ls server/migrations/*.sql | wc -l         → 21  (0023 absent)
test -f server/tests/helpers.ts            → faux ; test -f server/test/helpers.ts → vrai
webfetch https://docs.wave.com/checkout    → 200, endpoints et paramètres confirmés
webfetch https://docs.wave.com/webhook     → 200, t+rawBody, multi-v1, 5 min, 2xx <5 s confirmés
wc -l docs/architecture-v9-wave-checkout.md → 622
git status --short                         →  M docs/journal.md
                                             ?? docs/architecture-v9-wave-checkout.md
                                             ?? docs/cahier-des-charges-v9-wave-checkout.md
sha256sum docs/journal.md                  → 8ee1e58a… (identique à l'avant-tâche)
sha256sum docs/cahier-des-charges-v9…md    → c6de577c… (identique à l'avant-tâche)
```

### 10.3 Auto-revue (une ligne)

> Auto-revue effectuée : relecture intégrale du document et des fichiers sources ; **6 défauts détectés et corrigés** — (1) chemin du helper de test corrigé en `server/test/helpers.ts` ; (2) `payment_failed` sans `client_reference` traité par corrélation `session_id` (R-ARCH-01) ; (3) piège de deadlock `withTransaction` + `FOR UPDATE` documenté (R-ARCH-02) ; (4) exigence HTTPS de `success_url`/`error_url` ajoutée à la garde de prod (R-ARCH-03) ; (5) extension `/me` qualifiée explicitement d'additive avec plan B (R-ARCH-06) ; (6) portée de la preuve DoD limitée au document, les 55 CA étant transférés à `@tester`. Aucun identifiant dupliqué (`D-ARCH-1..10`, `N1..N6`, `R-ARCH-01..06`), aucune contradiction avec V9-D1…D6.

---

**VERDICT : DONE** — l'architecture V9 est complète, additive, sourcée et actionnable ; les 10 décisions sont tranchées et les 55 critères `CA-V9-xxx` sont rendus implémentables. **Passage à `@backend` / `@frontend` / `@tester` : ACCORDÉ sous réserve de validation du chef de projet** (statut « proposée »), de la fusion `api.md` v2.9 et de l'application manuelle de la migration `023` avant tout code. La production reste en `WAVE_ENABLED=false` ; aucune bascule n'est incluse dans V9.
