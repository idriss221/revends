# RECETTE V9.1 — « Référence de paiement optionnelle pour Wave »

| | |
|---|---|
| **Projet** | ReVends — marketplace de revente d'articles d'occasion (Sénégal) |
| **Version document** | **1.0 — 20/11/2026** (recette finale V9.1 — 6 critères `CA-V9.1-001` → `CA-V9.1-006`) |
| **Auteur** | Agent `@cahier-des-charges` — rejeu des suites et grille de recette |
| **Objet** | Validation binaire de l'avenant `docs/cahier-des-charges-v9.1-reference-wave.md` (6 critères), sur le livrable déjà produit par l'équipe. |
| **Statut livrable** | **Lecture seule pour la présente recette** : aucun code applicatif modifié, aucun secret posé, aucun déploiement, aucune migration, aucun appel réseau Wave ; `WAVE_ENABLED` reste absent/`false`. |
| **Branche / HEAD (code sous test)** | `fix/v6-on-799a7ab` / `5983fbf9c3d4214be473d7cc76f85554189b4f08` — 5 commits depuis la base V9 `b57eb54` : `aeccf3d` (avenant), `2d0c411` (backend), `3f314c3` (frontend), `04ddda4` (revue F1/F2), `5983fbf` (audit sécu M1). Branche locale **en avance de 5** sur `origin/fix/v6-on-799a7ab` ; aucun push effectué. |
| **Sources de vérité** | `docs/cahier-des-charges-v9.1-reference-wave.md` (avenant approuvé, 6 critères) · modèle de grille `docs/recette-v9-wave-checkout.md` (V9 : **55/55**, 12/12 scénarios, `VERDICT : CONFORME`, déployé désactivé). **Le cahier V9 et la recette V9 ne sont pas modifiés.** |
| **Règle de verdict** | Critère **binaire** : 🟢 **prouvé** (test nommé rejouable ou commande avec output consigné) / ⚪ **non prouvé** (intention exclue). **6 🟢 → `CONFORME` ; ≥ 1 ⚪ → `NON CONFORME`**, sans déploiement ni bascule Wave (`CA-V9.1-006`, avenant §5). |

> **Modes de preuve** (identiques à l'avenant) : `[TEST]` test nommé rejouable · `[EXEC]` commande/SQL dont l'output est reproduit · `[AUDIT]` revue de code avec référence `fichier:ligne`. Toutes les commandes ci-dessous ont été **réellement exécutées** sur le HEAD ci-dessus ; les sorties sont reproduites textuellement (extraits). Les preuves déjà collectées par le chef de projet ont été **rejouées** ici, sans valeur inventée.

---

## 1. Vérifications obligatoires rejouées — outputs réels

### 1.1 Suites de tests et non-régression

| Commande réellement exécutée | Output réel (extrait) | Code |
|---|---|---|
| `cd server && npm test` | `✅ ALL SUITES GREEN` · `# tests 822` · `# pass 822` · `# fail 0` (cumul des suites) | `0` |
| ↳ `test/wave-v9.1-reference.test.ts` | `# tests 8` · `# pass 8` · `# fail 0` — 8 tests nommés `CA-V9.1-001/002/003/005` | `0` |
| ↳ `test/wave-v9-audit.test.ts` | `# tests 14` · `# pass 14` · `# fail 0` (allowlist V9.1 étendue) | `0` |
| ↳ `test/storefront-v8.test.ts` | `# tests 63` · `# pass 63` · `# fail 0` | `0` |
| ↳ `test/wave-v9-webhook.test.ts` | `# tests 26` · `# pass 26` · `# fail 0` | `0` |
| `cd web && npm test` | `Test Files 21 passed (21)` · `Tests 301 passed (301)` · vitest 5.1.1 | `0` |

Extrait des 8 tests V9.1 (sortie TAP réelle, `ok` = pass) :

```
ok 1 - CA-V9.1-001 — validatePaymentFields(wave, ""/espace/absente) → WAVE-AUTO-[0-9A-F]{8} (18 car., regex V8), unique sur 2 appels
ok 2 - CA-V9.1-001 — POST /api/subscriptions wave sans référence (absente, "", espaces, null) → 201 PENDING + référence générée distincte
ok 1 - CA-V9.1-002 — OM/virement sans référence → PAYMENT_REFERENCE_REQUIRED ; < 4 car. → INVALID_PAYMENT_REFERENCE (unité)
ok 2 - CA-V9.1-002 — OM/virement sans référence → 400 PAYMENT_REFERENCE_REQUIRED en HTTP, aucune souscription créée
ok 3 - CA-V9.1-002 — wave avec référence valide fournie → conservée telle quelle (unité + HTTP)
ok 4 - CA-V9.1-002 — paymentMethod absent/invalide → 400 INVALID_PAYMENT_METHOD (inchangé)
ok 1 - CA-V9.1-003 — création PENDING : 0 appel Wave, 0 activation, 0 intention de session, 0 e-mail
ok 1 - CA-V9.1-005 — 0 diff Gmail/Whapi/REDIS_URL, 0 migration, 0 secret littéral, WAVE_ENABLED non activé
```

### 1.2 Typechecks, builds, audits, périmètre

| Commande réellement exécutée | Output réel (extrait) | Code |
|---|---|---|
| `cd server && npx tsc --noEmit` | *(aucune erreur)* | `0` |
| `cd web && npx tsc -b` | *(aucune erreur)* | `0` |
| `cd server && npm run build` | `tsc -p tsconfig.json` terminé | `0` |
| `cd web && npm run build` | `✓ built in 1.94s` (avertissement Vite préexistant « chunks > 500 kB », non bloquant) | `0` |
| `cd server && npm audit --omit=dev` | `found 0 vulnerabilities` | `0` |
| `cd web && npm audit --omit=dev` | `found 0 vulnerabilities` | `0` |
| `grep -rniE 'WAVE_API_KEY\|WAVE_WEBHOOK_SECRET\|wave_sn_' web/dist/assets/ \| wc -l` (après build) | `0 secret dans dist` | `0` |
| `git diff --check` | *(aucune sortie)* | `0` |
| `git diff b57eb54..HEAD -- server/src/services/wave-webhook.service.ts server/src/routes/webhooks/wave.routes.ts server/src/utils/wave-signature.ts server/src/utils/wave-validation.ts server/src/repositories/wave-events.repository.ts server/migrations/ \| wc -l` | `0 ligne` | `0` |
| `git diff --unified=0 b57eb54..HEAD -- server/src web/src \| grep -ciE '^\+.*(WAVE_API_KEY\|WAVE_WEBHOOK_SECRET\|wave_sn_\|REDIS_URL\|whapi\|ranga)'` | `0` | `1` (grep : **0 occurrence**) |
| `git diff --unified=0 b57eb54..HEAD -- server/src web/src \| grep -E '^\+.*WAVE_ENABLED' \| wc -l` | `0` | `0` |

> `git status --porcelain` vide avant et après ces rejeux : **aucun fichier applicatif ni document modifié par la vérification**. Le risque « secret exposé » est écarté par le grep sur le bundle réellement construit et par le diff ajouté ; **aucune valeur de secret n'a été affichée**.

---

## 2. Grille de recette V9.1 (6 critères)

| ID | Scénario | État 🟢/⚪ | Commande / preuve |
|---|---|---|---|
| **CA-V9.1-001** | Wave sans référence (absente / `''` / espaces / `null`) → **201 `PENDING`**, `payment_method='wave'`, `payment_reference = WAVE-AUTO-<8 hex majuscules>` (18 car., regex `^WAVE-AUTO-[0-9A-F]{8}$`), conforme à `PAYMENT_REFERENCE_REGEX`, **unique sur 2 appels** ; aucune erreur `PAYMENT_REFERENCE_REQUIRED`. | 🟢 | `[TEST]` `server/test/wave-v9.1-reference.test.ts:63-103` — 2 tests nommés ci-dessus, **8/8** dans la suite (`server/test/wave-v9.1-reference.test.ts` : `# pass 8`) ; génération réelle `randomBytes(4).toString('hex').toUpperCase()` en `server/src/utils/storefront-validation.ts:127`, regex `:13`. `[EXEC]` aucune migration : `payment_reference varchar(64) NULL` préexistant en `server/migrations/020_storefront_v8.sql:20` ; `git diff b57eb54..HEAD -- server/migrations/` = **0 ligne**. |
| **CA-V9.1-002** | OM / virement sans référence → **400 `PAYMENT_REFERENCE_REQUIRED`** ; référence < 4 car. → **`INVALID_PAYMENT_REFERENCE`** ; `paymentMethod` absent/invalide → **`INVALID_PAYMENT_METHOD`**, **aucune souscription créée** ; Wave avec référence valide → référence conservée. Codes et regex V8 inchangés. | 🟢 | `[TEST]` `server/test/wave-v9.1-reference.test.ts:105-169` — 4 tests nommés, `assert.equal(after.count, before.count)` en `:137-141` ; `validatePaymentFields` en `server/src/utils/storefront-validation.ts:102-135`. `[TEST]` non-régression `server/test/storefront-v8.test.ts` **63/63** ; recette V9 **55/55** inchangée (`docs/recette-v9-wave-checkout.md:239`). |
| **CA-V9.1-003** | **Webhook signé = seule source d'activation** : retour navigateur, `success_url`, référence saisie ou `WAVE-AUTO-…` laissent la souscription `PENDING` ; chemin `client_reference` / `session_id` / devise `XOF` / montant inchangé ; activation manuelle admin inchangée (plan B §5). | 🟢 | `[EXEC]` `git diff b57eb54..HEAD -- <6 fichiers webhook + migrations>` = **0 ligne** (§1.2). `[AUDIT]` `server/src/services/wave-webhook.service.ts:121` = seul `activateSubscription()` automatique ; `web/src/pages/WaveSucces.tsx:14` = `GET /api/subscriptions/me` **lecture seule**, aucun paramètre lu. `[TEST]` `server/test/wave-v9.1-reference.test.ts:171-199` : 0 appel Wave, 0 `admin_actions`, 0 `wave_checkout_events`, 0 e-mail ; `web/src/v9-wave.test.tsx:223` (`lecture seule, aucune query, aucune écriture`), E3/E4 `:238,274`. |
| **CA-V9.1-004** | Web : sélection « Wave » → **aucun champ `paymentReference`** dans le DOM, ni libellé « Référence de paiement * » ; note d'auto-confirmation présente ; 3 options de moyen de paiement. OM/virement → input **`required`** + aria conservés, validation bloquante. Soumission active sans saisie de référence. Correctif F1 : référence forcée vide pour Wave **même après bascule OM→Wave**. | 🟢 | `[TEST]` `web/src/lib/v8.test.ts:80` (`validatePaymentFields({paymentMethod:'wave',paymentReference:''}) === {}`), `:102` (bascule OM→Wave) et `:110-115` ; `web/src/lib/v8.ts:125` (`paymentMethod === 'wave' ? '' : …`), point d'appel applicatif `web/src/pages/MonAbonnement.tsx:109`. `[TEST]` SSR du vrai composant `web/src/v9-wave.test.tsx:119,136,149` — **21 fichiers / 301 tests verts**. |
| **CA-V9.1-005** | 0 secret ajouté/exposé ; **0 ligne de diff** Gmail / Whapi / `REDIS_URL` ; 0 « ranga » ; contact `revendsen@gmail.com` unique ; montants **2 000 / 5 000 / 10 000** ; commission **10 %** ; « Vendre un produit » gratuit et illimité ; `WAVE_ENABLED` non activé ; 0 nouvel appel réseau. Réserve M1 corrigée (textes de `WaveEchec` ne demandant plus de référence Wave). | 🟢 | `[AUDIT]` audit `@securite` : **VERDICT : APPROUVÉ SOUS RÉSERVE** — **0 bloquant, 0 critique, 0 important** ; réserve **M1 corrigée et vérifiée en `5983fbf`** (`web/src/pages/WaveEchec.tsx`, test E4 adapté `web/src/v9-wave.test.tsx:274`). `[EXEC]` grep du diff ajouté = **0** (§1.2) ; `V9_BASE = '42f9bd8'` et `V9_APP_ALLOWLIST` intacts (`server/test/wave-v9-audit.test.ts:42,63`), `V91_APP_ALLOWLIST` = exactement les 4 fichiers légitimes (`:100-106`) ; `wave-v9-audit.test.ts` **14/14** ; `server/src/config.ts:56` `WAVE_ENABLED` défaut `false` ; grep secrets `web/dist/assets/` = **0**. |
| **CA-V9.1-006** | **Recette binaire V9.1** produite avant tout déploiement : les 6 critères sont 🟢 prouvés par test nommé ou commande dont l'output est consigné ; un seul ⚪ rendrait V9.1 NON CONFORME. | 🟢 | `[EXEC]` le présent document : grille **6 🟢 / 0 ⚪**, outputs réels en §1, règle binaire rappelée en tête et en §3. Aucun déploiement, aucune clé, aucune bascule `WAVE_ENABLED`. |

**Couverture : 6 🟢 / 0 ⚪.**

---

## 3. Risque accepté — rappel au chef de projet

⚠️ **Risque identifié et ACCEPTÉ en connaissance de cause** (avenant V9.1 §5, `docs/cahier-des-charges-v9.1-reference-wave.md:71-73`). Si le vendeur sélectionne « Wave » mais règle via l'un des **3 liens hébergés de repli** (`https://pay.wave.com/m/…`, **aucune session `cos-…`**), le webhook ne peut corréler l'événement et, aucune référence n'ayant été saisie, **l'administration n'a aucune référence pour retrouver la transaction** : la souscription reste `PENDING`. **Plan B** : activation **manuelle** de l'admin depuis `/admin/abonnements` **après vérification du paiement dans le portail Wave**. Le chemin prioritaire reste le bouton « Payer avec Wave » (session API + webhook signé), sans référence. Aucune mesure compensatoire n'est autorisée (pas de champ de référence réintroduit pour Wave, pas d'activation sur retour navigateur). **Ce risque est accepté et doit être rappelé au chef de projet avant toute bascule éventuelle de `WAVE_ENABLED`.**

---

## 4. Verdict

| Contrôle | Résultat |
|---|---|
| Critères prouvés | **6 / 6** (`CA-V9.1-001` → `CA-V9.1-006`) |
| Critères non prouvés | **Aucun** (0 ⚪) |
| Suites rejouées | Serveur `✅ ALL SUITES GREEN` **822/822** (`wave-v9.1-reference` 8/8, `wave-v9-audit` 14/14, `storefront-v8` 63/63) · web **21 fichiers / 301 tests** · typechecks 0 erreur · builds OK · audits `0 vulnerabilities` · `git diff --check` 0 · 0 secret dans `dist` |
| Non-régression V9 | Cahier V9, recette V9 (**55/55**, `VERDICT : CONFORME`) et livrable déployé **inchangés** |
| Périmètre | **Documentation uniquement** : 0 code applicatif, 0 secret, 0 déploiement, 0 migration, 0 appel Wave réel, `WAVE_ENABLED` absent/`false` |
| Règle appliquée | « Un seul critère non prouvé → NON CONFORME » : **aucun critère non prouvé** |

En application de la règle binaire de l'avenant (§4 et §6), la recette V9.1 est :

# CONFORME — 6/6 critères, 0 bloquant

VERDICT : CONFORME

> **Limites et écarts de transcription (sans incidence sur les critères)** : (1) aucun test de paiement Wave réel, aucune clé et aucun accès au portail Wave — conformément au hors-périmètre de l'avenant §2.2 ; la preuve d'activation repose sur les tests mockés et l'audit de code. (2) La consigne du chef de projet mentionnait « les 6 points d'appel de `MonAbonnement.tsx` » pour `buildPaymentFields` ; le relevé réel donne **un seul point d'appel applicatif** (`MonAbonnement.tsx:109`) et **4 appels dans `web/src/lib/v8.test.ts:105-120`**. Le comportement exigé par `CA-V9.1-004` est bien prouvé (`web/src/lib/v8.ts:125`), sans extension de périmètre. (3) Les commits V9.1 ne sont **pas poussés** (`origin` en retard de 5) : aucun push n'a été effectué par la recette.
