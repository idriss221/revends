# RECETTE V9 — « Wave Checkout + webhooks pour abonnements boutique »

| | |
|---|---|
| **Projet** | ReVends — marketplace de revente d'articles d'occasion (Sénégal) |
| **Version document** | **2.0 — 19/11/2026** (recette rejouée après les commits `15bc675` front et `89d8555` backend) |
| **Auteur** | Agent `@tester` |
| **Objet** | Exécution des **55 critères** `CA-V9-001`→`075` et des **12 scénarios** `SC-V9-01`→`12` du cahier V9 (`docs/cahier-des-charges-v9-wave-checkout.md` §4 et §5, cahier **amendé** avec `CA-V9-075` en phase de clôture) |
| **Statut livrable** | Tests + documentation uniquement. **Aucun déploiement, aucune clé Wave réelle, aucun appel réseau Wave, aucun code applicatif modifié.** Seul le présent document a fait l'objet d'un second commit (voir historique git). |
| **Branche / HEAD (code sous test)** | `fix/v6-on-799a7ab` / `15bc675` (web) + `89d8555` (backend) |
| **Environnement de preuve** | `NODE_ENV=test`, PostgreSQL jetable `revends_test` sur `127.0.0.1:5433`, `SITE_URL=https://revends.test`, Chromium Playwright 1.63 (headless) |
| **Règle de verdict** | Critère binaire : 🟢 **prouvé** / ⚪ **non prouvé** (intention exclue). **Un seul critère non prouvé suffit à rendre V9 NON CONFORME** (cahier §5). |

> **Modes de preuve** (identiques au cahier) : `[TEST]` test nommé et rejouable · `[EXEC]` mesure/SQL exécutable · `[AUDIT]` revue de code avec référence `fichier:ligne`. Toutes les commandes ci-dessous ont été **réellement exécutées** ; les sorties sont reproduites textuellement.

---

## 1. Mission A — correction du test intermittent préexistant

### 1.1 Reproduction et isolation

| Étape | Résultat mesuré |
|---|---|
| Reproductions en isolement avant correction | **2 échecs observés** (1 sur 5 puis 1 sur 4 relances) |
| Commande | `cd server && node --import tsx --import ./test/env.ts --test --test-concurrency=1 --test-force-exit test/emails.test.ts` |
| Échec exact | `not ok 1 - MAIL_ENABLED=false : l'endpoint réussit et la notification in-app existe` — `error: aucun envoi tenté / 1 !== 0` — `expected: 0`, `actual: 1` — `server/test/emails.test.ts:693` |
| Diagnostic | `DIAG=[{"event":"product_submitted_admin","to":"admin@revends.com","subject":"Nouvel article en attente de validation","transport":"json","ok":true,"attachmentCount":0}]` |
| Cause isolée | `createProduct` programme `product_submitted_admin` via `alertAdmins` → file `afterCommit` (`server/src/services/products.service.ts:227`). L'effet atterrissait **après** le `clearSentMails()` du test, d'où `1 !== 0`. Hypothèse initiale d'un mail `welcome` écartée par le diagnostic. |
| Correctif (4 lignes, **test uniquement**) | `await flushAfterCommit()` inséré avant `clearSentMails()` dans le test `MAIL_ENABLED=false`. **Aucun comportement applicatif modifié.** |

### 1.2 Vérification du correctif

```
run1 exit=0 # tests 43 # pass 43 # fail 0
run2 exit=0 # tests 43 # pass 43 # fail 0
run3 exit=0 # tests 43 # pass 43 # fail 0
run4 exit=0 # tests 43 # pass 43 # fail 0
run5 exit=0 # tests 43 # pass 43 # fail 0
```

→ **5/5 relances isolées vertes** (7 relances supplémentaires avaient déjà été faites lors de l'isolation, toutes vertes). Suite complète serveur relancée **2 fois de suite** après les commits `15bc675` et `89d8555`, **807/807** à chaque exécution (§2.1).

---

## 2. Vérifications obligatoires — sorties réelles

### 2.1 Serveur

| Commande | Sortie | Code |
|---|---|---|
| `cd server && npx tsc --noEmit` | `0 erreurs TS` | `0` |
| `cd server && npm test` (exécution 1) | `✅ ALL SUITES GREEN` · `# tests 807` · `# pass 807` · `# fail 0` | `0` |
| `cd server && npm test` (exécution 2, consécutive) | `✅ ALL SUITES GREEN` · `# tests 807` · `# pass 807` · `# fail 0` | `0` |
| `cd server && node --import tsx --import ./test/env.ts --test --test-concurrency=1 --test-force-exit test/wave-v9-diagnostics.test.ts` (rejeu personnel, isolement) | `# tests 8` · `# pass 8` · `# fail 0` | `0` |
| `cd server && npm run build` | `tsc -p tsconfig.json` terminé sans erreur | `0` |
| `cd server && npm audit --omit=dev` | `found 0 vulnerabilities` | `0` |

> **Consigne du chef de projet respectée** : `CA-V9-013` et `CA-V9-018` n'ont **pas** été validés sur la seule parole de `@backend`. Les 8 tests de `test/wave-v9-diagnostics.test.ts` ont été relus un à un (assertions sur l'URL exacte, la méthode `GET`, le header `Bearer`, l'encodage, la référence retrouvée en mock **et** en table `wave_checkout_events`, l'absence d'activation sur session `COMPLETED` sans webhook, l'absence d'écriture sur erreur réseau/500, l'absence de route HTTP de diagnostic) puis rejoués **en isolement** (8/8) et **dans la suite complète** (8/8, dans chacune des 2 exécutions 807/807).

Détail des suites V9 et de non-régression dans chacune des 2 exécutions :

| Suite | Tests | Pass | Fail |
|---|---:|---:|---:|
| `test/storefront-v8.test.ts` (verrou V8.5) | 63 | 63 | 0 |
| `test/emails.test.ts` (correctif Mission A) | 43 | 43 | 0 |
| `test/wave-v9-checkout.test.ts` | 13 | 13 | 0 |
| `test/wave-v9-disabled.test.ts` | 4 | 4 | 0 |
| `test/wave-v9-enabled.test.ts` | 15 | 15 | 0 |
| `test/wave-v9-webhook.test.ts` | 25 | 25 | 0 |
| `test/wave-v9-audit.test.ts` | 12 | 12 | 0 |
| `test/wave-v9-diagnostics.test.ts` (**commit `89d8555`**) | 8 | 8 | 0 |
| **Total suite serveur** | **807** | **807** | **0** |

### 2.2 Web

| Commande | Sortie | Code |
|---|---|---|
| `cd web && npx tsc -b` | `0 erreurs TS` | `0` |
| `cd web && npm test` | `Test Files 21 passed (21)` · `Tests 291 passed (291)` | `0` |
| `cd web && npm run build` | `✓ 208 modules transformed` · `dist/assets/index-0xCtJ8OR.css 266.79 kB` · `dist/assets/index-B0fNaioy.js 656.68 kB` · `✓ built in 3.24s` | `0` |
| `cd web && npm audit --omit=dev` | `found 0 vulnerabilities` | `0` |

> L'avertissement Vite « chunks > 500 kB » est un avertissement de taille préexistant, **pas une erreur** (`exit=0`) ; il n'entre dans aucun critère V9.

### 2.3 Dépôt et preuve responsive

| Commande | Sortie | Code |
|---|---|---|
| `git diff --check` | *(aucune sortie)* | `0` |
| `cd web && node scripts/v9-responsive-check.mjs` | 4 largeurs conformes + 3 clics sans appel API (§5, point 4) | `0` |

Contrôles de périmètre et de sécurité rejoués après les deux commits :

| Contrôle | Méthode | Résultat |
|---|---|---|
| 0 ligne de diff de **code applicatif** | `git diff HEAD -- server/src web/src server/migrations server/package.json web/package.json .env.production ':(exclude)**/*.test.ts' ':(exclude)**/*.test.tsx'` | `0 ligne` |
| 0 secret littéral | `grep -rniE 'wave_sn_[A-Za-z0-9]\|sk_[A-Za-z0-9]{12,}' server/src web/src web/dist/assets` | `0 occurrence` |
| 0 appel réseau Wave non mocké | `grep -rnE "fetch\(['\"]https://api\.wave\.com" server/src web/src` | `0 occurrence` |
| Zones interdites préexistantes intactes | `docs/cahier-des-charges-v9-wave-checkout.md` et `docs/journal.md` non modifiés par ce travail | OK |

---

## 3. Grille des 12 scénarios (`docs/cahier-des-charges-v9-wave-checkout.md` §5)

Légende : 🟢 prouvé par le scénario · ⚪ non prouvé.

| # | Scénario | État | Commande / preuve |
|---|---|---|---|
| **SC-V9-01** | Nominal complet | 🟢 | `wave-v9-enabled.test.ts` (session Bearer mockée, montant 2000/XOF, `wave_launch_url`) + `wave-v9-webhook.test.ts` (`completed valide → 200, ACTIVE 30 jours, activated_by admin, 1 seul e-mail`) + `v9-wave.test.tsx` (libellés succès) |
| **SC-V9-02** | Doublon de webhook | 🟢 | `wave-v9-webhook.test.ts` — `CA-V9-030/036 — doublon séquentiel 2× puis 3× : 2xx partout, 1 trace, 1 e-mail` + `3 webhooks concurrents avec le même event.id` |
| **SC-V9-03** | Replay | 🟢 | `wave-v9-webhook.test.ts` — `CA-V9-032 — horodatage HTTP : 4 min accepté, 6 min / absent / non numérique / futur rejetés` |
| **SC-V9-04** | Mauvais montant | 🟢 | `wave-v9-webhook.test.ts` — `montant erroné, décimal et devise étrangère` (`1000`, `2000.5`) + `CA-V9-033/034 — montant d'un autre plan` ; `wave-v9-enabled.test.ts` — `client envoie amount:1 → serveur envoie "2000"` |
| **SC-V9-05** | Mauvaise devise | 🟢 | `wave-v9-webhook.test.ts` — `EUR` et devise absente → `ignored`, 0 activation |
| **SC-V9-06** | Mauvaise référence | 🟢 | `wave-v9-webhook.test.ts` — `CA-V9-035/041/046 — référence d'autrui, EXPIRED/CANCELLED et virement` |
| **SC-V9-07** | Échec de paiement | 🟢 | `wave-v9-webhook.test.ts` — `payment_failed ... 200, souscription PENDING, 0 e-mail` + `v9-wave.test.tsx` — page `WaveEchec` (repli, contact unique, 0 activation) |
| **SC-V9-08** | `WAVE_ENABLED=false` | 🟢 | `wave-v9-disabled.test.ts` (4/4 : défaut `false`, `503 WAVE_DISABLED`, webhook `200 ignored`, 0 appel) + `v9-wave.test.tsx` (bouton absent, formulaire + 3 liens présents). **Hors CA-V9-074 (production), voir §5.** |
| **SC-V9-09** | Lien hébergé = manuel | 🟢 | `v9-responsive-check.mjs` — 3 clics sur `#fx-1 .wave-hosted-link` : `requêtes /api avant=0 après=0`, `href=3` tous `pay.wave.com/m/...?amount=` + `v9-wave.test.tsx` (liens statiques, 0 calcul) |
| **SC-V9-10** | Rotation + corps resérialisé | 🟢 | `wave-v9-webhook.test.ts` — `rotation multi-v1 : une signature valide suffit` + `corps resérialisé : HMAC calculé sur les octets d'origine → 400` |
| **SC-V9-11** | Retour navigateur seul | 🟢 | `wave-v9-enabled.test.ts` — `CA-V9-053 / SC-V9-11 — retour navigateur et session créée : 0 e-mail, 0 activation` + `v9-wave.test.tsx` (pages retour lecture seule) + `wave-v9-diagnostics.test.ts` (8/8) — `CA-V9-018 — session COMPLETED retrouvée par GET sans webhook : PENDING, 0 activation, 0 e-mail, 0 écriture`. Le GET est un **outil diagnostique**, pas une preuve d'activation : le webhook reste la seule source d'activation. |
| **SC-V9-12** | Non-régression V8.5 | 🟢 | `storefront-v8.test.ts` **63/63** · web **291/291** · `tsc` serveur/web **0 erreur** · `npm run build` ×2 **OK** · `npm audit --omit=dev` ×2 **0 vulnérabilité** · `git diff --check` **0** · `wave-v9-audit.test.ts` (zones interdites) |

**Couverture des 12 scénarios : 12 🟢 / 0 ⚪.**

---

## 4. Grille des 55 critères (`CA-V9-001` → `075`)

### 4.1 Configuration et mode « prêt mais désactivé » (6)

| Critère | État | Preuve | Limite éventuelle |
|---|---|---|---|
| CA-V9-001 | 🟢 | `wave-v9-disabled.test.ts` (`WAVE_ENABLED` absent ⇒ `false`, `503 WAVE_DISABLED`, 0 appel HTTP) + `wave-v9-enabled.test.ts` (`borne enabled:true`) | — |
| CA-V9-002 | 🟢 | `v9-wave.test.tsx` — `waveEnabled:false ⇒ aucun bouton dans le DOM, 3 liens et repli manuel présents` + contrôle positif `éligible ⇒ bouton rendu` | Pas de session authentifiée `/mon-abonnement` complète : DOM SSR du **vrai composant** + rendu Chromium du CSS compilé (§2.3) |
| CA-V9-003 | 🟢 | `v9-responsive-check.mjs` — 3 liens présents à 280/320/360/375 px, 3 clics, `/api` avant=0 après=0 ; `v9-wave.test.tsx` — `les 3 liens hébergés sont statiques, exacts` | — |
| CA-V9-004 | 🟢 | **Preuve SQL prod fournie par le chef de projet (lecture seule, 19/11/2026)** : `SELECT id,email,role FROM users WHERE id IN (7,23) ORDER BY id` → `[{"id":"7","email":"admin@revends.com","role":"admin"},{"id":"23","email":"boiroabasse7@gmail.com","role":"admin"}]`. Complété par `wave-v9-disabled.test.ts` (`WAVE_ENABLED absent ⇒ false`, `WAVE_SYSTEM_ADMIN_ID absent ⇒ 7`) et `wave-v9-audit.test.ts` (0 migration `users`, 0 diff de code). | Aucune autre donnée utilisateur n'est reproduite dans cette recette. Les suites utilisent `WAVE_SYSTEM_ADMIN_ID=1` (seul admin de la base de test), sans incidence sur la preuve prod. |
| CA-V9-005 | 🟢 | **Preuve coffre local fournie par le chef de projet (noms/présence uniquement, 19/11/2026)** : dans `~/.revends-secrets/revends.env.local` → `WAVE_API_KEY: ABSENT` · `WAVE_WEBHOOK_SECRET: ABSENT` · `WAVE_ENABLED: ABSENT` · `WAVE_SYSTEM_ADMIN_ID: ABSENT`. Complété par `wave-v9-audit.test.ts` (2 variables distinctes, 0 littéral de clé dans `server/src`/`web/src`), `v9-wave.test.tsx` (0 secret dans `web/dist/assets`) et 0 secret dans les logs. | **Aucune valeur de secret n'a été affichée**, aucune clé réelle utilisée. La config **effective en production** reste couverte par CA-V9-074 (⚪, en attente de déploiement). |
| CA-V9-006 | 🟢 | `wave-v9-audit.test.ts` — `webhook monté avant CSRF et avant express.json` (`app.ts:113` < `:115` < `:117`) ; `wave-v9-enabled.test.ts` — POST sans cookie ni en-tête CSRF accepté | — |

### 4.2 Création de session Checkout (10)

| Critère | État | Preuve | Limite éventuelle |
|---|---|---|---|
| CA-V9-010 | 🟢 | `wave-v9-enabled.test.ts` — `1 appel POST /v1/checkout/sessions avec Bearer, via fetchImpl injectable` ; clé fictive `wave-api-key-for-local-tests-only` | — |
| CA-V9-011 | 🟢 | `wave-v9-enabled.test.ts` — `montant serveur par plan 1/2/3, chaîne entière, XOF, client ignoré` (`"2000"/"5000"/"10000"`, client `amount:1`) ; `wave-v9-audit.test.ts` — `String(subscription.price_fcfa)`, 0 `amount` dans le panneau | — |
| CA-V9-012 | 🟢 | `wave-v9-enabled.test.ts` — `URLs HTTPS sans query, référence non vide ≤ 255, corps sans secret` | — |
| CA-V9-013 | 🟢 | `wave-v9-enabled.test.ts` — `référence stable pour une souscription, unique entre deux souscriptions, traçable` (SQL `wave_checkout_events`) ; `wave-v9-audit.test.ts` — `uq_wave_event_id`, index de corrélation ; **`wave-v9-diagnostics.test.ts` (commit `89d8555`)** — `CA-V9-013 — référence stable, unique, retrouvée par le mock search ET par la table de suivi` + `CA-V9-013/018 — searchCheckoutSessions : URL exacte, query client_reference encodée, Bearer, réponse typée (query /v1/checkout/sessions/search?client_reference=…)`. | Cliente GET fournie avec `fetchImpl` injectable, 0 appel réseau Wave, 0 secret. Outil **diagnostique** : aucune route HTTP exposée. |
| CA-V9-014 | 🟢 | `wave-v9-enabled.test.ts` — `wave_launch_url HTTPS renvoyée, aucune référence d'un autre vendeur` | — |
| CA-V9-015 | 🟢 | `wave-v9-enabled.test.ts` — `sans abonnement éligible : 404/409, 0 appel Wave, 0 écriture` ; `wave-v9-checkout.test.ts` — ACTIVE/autrui/OM | — |
| CA-V9-016 | 🟢 | `wave-v9-enabled.test.ts` — `500 : 502, PENDING, 0 activation, 0 e-mail, 1 trace autorisée` et `timeout réseau : 502, aucune écriture métier` | — |
| CA-V9-017 | 🟢 | `wave-v9-audit.test.ts` — montant issu de `subscription.price_fcfa`, 0 `req.body.amount`, 3 `?amount=` front (liens statiques), 0 `parseInt/Number` | — |
| CA-V9-018 | 🟢 | **Implémenté par le commit `89d8555`** dans `server/src/services/wave-client.service.ts` : `retrieveCheckoutSession(sessionId)` → `GET ${baseUrl}/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, `searchCheckoutSessions(clientReference)` → `GET ${baseUrl}/v1/checkout/sessions/search?client_reference=${encodeURIComponent(...)}` ; Bearer, timeout 5 s, `fetchImpl` injectable, `502 WAVE_UPSTREAM_ERROR` sans clé, 0 log. **`wave-v9-diagnostics.test.ts` 8/8** (isolement + suite complète ×2) : URL/query exactes, encodage du chemin et de la query, session `COMPLETED` retrouvée par GET **sans webhook** → `PENDING`/`activated_by=null`/0 trace/0 e-mail, erreur réseau et HTTP 500 → 0 écriture, aucune route HTTP de diagnostic exposée par `/api/wave`. | Outil diagnostique **interne** : aucun appel réseau Wave réel, aucune clé réelle. Le GET ne déclenche jamais d'activation ; le webhook reste la seule preuve d'activation (intention du cahier préservée). |
| CA-V9-019 | 🟢 | `wave-v9-enabled.test.ts` — `CA-V9-019 — indicateur /me explicite : true Wave PENDING, false OM/virement` ; `wave-v9-checkout.test.ts` — `wavePaymentPending` absent si aucune souscription | — |

### 4.3 Redirection navigateur et pages retour (5)

| Critère | État | Preuve | Limite éventuelle |
|---|---|---|---|
| CA-V9-020 | 🟢 | `v9-wave.test.tsx` — `un clic navigue en top-level` (`window.location.assign(result.waveLaunchUrl)`) ; `WaveCheckoutPanel.tsx:72` | Pas d'E2E réelle vers Wave : URL factice de mock, aucun appel réseau autorisé |
| CA-V9-021 | 🟢 | `wave-v9-enabled.test.ts` — `CA-V9-053 / SC-V9-11 — retour navigateur ... 0 e-mail, 0 activation` ; `v9-wave.test.tsx` — pages retour `lecture seule, aucune query, aucune écriture` | — |
| CA-V9-022 | 🟢 | `v9-wave.test.tsx` — `E3 : libellés exacts` (« en attente de confirmation », aucun « Paiement reçu ») | — |
| CA-V9-023 | 🟢 | `v9-wave.test.tsx` — `E4 : libellés exacts, contact unique` + `wave-v9-webhook.test.ts` — `payment_failed ... 0 e-mail` | — |
| CA-V9-024 | 🟢 | `wave-v9-audit.test.ts` — 0 `iframe`/`webview`/`inappbrowser`/`react-native`/`expo` dans les 12 fichiers V9 ; `v9-wave.test.tsx` — 0 occurrence dans tout `web/src` | — |

### 4.4 Sécurité du webhook (9)

| Critère | État | Preuve | Limite éventuelle |
|---|---|---|---|
| CA-V9-030 | 🟢 | `wave-v9-webhook.test.ts` — `CA-V9-030/036 — doublon séquentiel 2× puis 3× : 2xx partout, 1 trace, 1 e-mail` | — |
| CA-V9-031 | 🟢 | `wave-v9-webhook.test.ts` — helper `valide les signatures multi-v1 et rejette corps resérialisé, rejoué et futur`, `mauvais secret → 400`, `rotation multi-v1`, `corps resérialisé → 400` | — |
| CA-V9-032 | 🟢 | `wave-v9-webhook.test.ts` — `rejeu à 6 minutes → 400`, `CA-V9-032 — 4 min accepté, 6 min / absent / non numérique / futur rejetés` | — |
| CA-V9-033 | 🟢 | `wave-v9-webhook.test.ts` — `montant erroné, décimal et devise étrangère` (`1000`, `2000.5`), `montant d'un autre plan` | — |
| CA-V9-034 | 🟢 | `wave-v9-webhook.test.ts` — `currency EUR` et champ absent → `ignored`, 0 activation | — |
| CA-V9-035 | 🟢 | `wave-v9-webhook.test.ts` — `CA-V9-035/041/046 — référence d'autrui, EXPIRED/CANCELLED et virement → 2xx ignored, 0 activation` | — |
| CA-V9-036 | 🟢 | `wave-v9-webhook.test.ts` — `CA-V9-036 — 2xx en < 5 s pour traité et non pertinent, 4xx rapide pour signature invalide` (chronomètre mesuré) | — |
| CA-V9-037 | 🟢 | `wave-v9-webhook.test.ts` — `payment_failed sans référence, corrélé par data.id → 200, souscription PENDING, 0 e-mail` | — |
| CA-V9-038 | 🟢 | `wave-v9-audit.test.ts` — `express.raw` avant `express.json`, 0 secret/signature/rawBody dans tout appel `logger.*` ; signature `t + rawBody` prouvée par les tests HMAC | — |

### 4.5 Activation immédiate (8)

| Critère | État | Preuve | Limite éventuelle |
|---|---|---|---|
| CA-V9-040 | 🟢 | `wave-v9-webhook.test.ts` — `completed valide → 200, ACTIVE 30 jours, activated_by admin, 1 seul e-mail` (`ends_at − started_at = 30 j`, 0 route admin appelée) | Valeur `activated_by` = 1 en base de test ; **id 7 = `admin@revends.com`, `role=admin`, confirmé en production par le SQL de CA-V9-004** |
| CA-V9-041 | 🟢 | `wave-v9-webhook.test.ts` — `souscription déjà ACTIVE → 200 ignored, aucun écrasement de activated_by` + `CA-V9-035/041/046` (EXPIRED/CANCELLED) | — |
| CA-V9-042 | 🟢 | `wave-v9-audit.test.ts` — `une seule implémentation d'activation, réutilisée par le webhook` (1 définition, 0 second `UPDATE ... SET status='ACTIVE'`) | — |
| CA-V9-043 | 🟢 | `wave-v9-webhook.test.ts` — `completed valide ... 1 seul e-mail` + doublons 2×/3× → compteur = 1 | — |
| CA-V9-044 | 🟢 | `wave-v9-webhook.test.ts` — `CA-V9-044 — parité des effets webhook vs activation admin` (statut, jours, activated_by, e-mail, `payment_*`) | — |
| CA-V9-045 | 🟢 | `wave-v9-webhook.test.ts` — `CA-V9-045 — activation automatique : payment_method et payment_reference intacts` | — |
| CA-V9-046 | 🟢 | `wave-v9-webhook.test.ts` — `payment_method ≠ wave → 200 ignored, validation manuelle conservée` + CA-V9-035 (virement) | — |
| CA-V9-047 | 🟢 | `wave-v9-webhook.test.ts` — `CA-V9-047 — deux événements distincts simultanés ... → 1 seul ACTIVE` + `3 webhooks concurrents avec le même event.id` | — |

### 4.6 Traçabilité, vue admin et non-régression V8.2 (5)

| Critère | État | Preuve | Limite éventuelle |
|---|---|---|---|
| CA-V9-050 | 🟢 | `wave-v9-audit.test.ts` — DDL (`event_id` unique, colonnes requises, 0 `ALTER`/`DROP`), `001→022 byte-identiques` (0 diff de migration), **`[EXEC]` migration `023` exécutée 2 fois sur `revends_test` sans erreur** (colonnes + 2 contraintes vérifiées), `chk_activation_pair` intacte dans `022` | Rejouabilité prouvée sur la base de test ; migration prod prévue au déploiement V9 désactivé (CA-V9-075, phase de clôture, non exécutée ici) |
| CA-V9-051 | 🟢 | `wave-v9-checkout.test.ts` — `GET /api/wave/admin/events : file paginée ... sans exposition publique` (401/403/400) ; `v9-wave.test.tsx` — colonne « Paiement Wave », statuts traduits, `Activé par {activatedByLabel(...)}`, 0 `client_reference`/`sessionId` | Pas de capture d'écran du back-office authentifié (preuve DOM SSR + API) |
| CA-V9-052 | 🟢 | `wave-v9-audit.test.ts` — 0 secret/signature/rawBody dans les logs, 0 littéral `sk_`/`wave_sn_`, 0 diff de code ; `v9-wave.test.tsx` — 0 secret dans `web/dist/assets` ; contrôles `grep` rejoués (§2.3) | Coffre local audité **par nom/présence uniquement** (CA-V9-005 🟢, 0 valeur affichée) ; config effective en prod en attente de déploiement (CA-V9-074 ⚪) |
| CA-V9-053 | 🟢 | `wave-v9-enabled.test.ts` — `CA-V9-053 / SC-V9-11 — 0 e-mail` ; `wave-v9-audit.test.ts` — `023` sans `ALTER TYPE` ; 0 diff de migration/code sur l'enum | `enum_range(NULL::notification_type)` non interrogé en production (0 diff de code prouvé à la place) |
| CA-V9-054 | 🟢 | `wave-v9-audit.test.ts` — `0 ligne de diff de code applicatif`, nommément `server/src/services/storefront-admin-ctl.service.ts` ; `git diff --check` = 0 | — |

### 4.7 Repli manuel et flux inchangés (6)

| Critère | État | Preuve | Limite éventuelle |
|---|---|---|---|
| CA-V9-060 | 🟢 | `wave-v9-enabled.test.ts` — `CA-V9-060/061/062 — flux manuels Wave/OM/virement et contrat des routes inchangés` (201 `PENDING` → activation admin 200) | — |
| CA-V9-061 | 🟢 | idem (`orange_money` puis `virement`) + `wave-v9-webhook.test.ts` — 0 activation par webhook sur OM/virement | — |
| CA-V9-062 | 🟢 | idem + `wave-v9-checkout.test.ts` — 401/403/400 des routes existantes préservés | — |
| CA-V9-063 | 🟢 | `test/storefront-v8.test.ts` **63/63** (2 exécutions consécutives) ; `wave-v9-audit.test.ts` — prix de plan inchangés (`019_storefront.sql`) et 0 diff de code | — |
| CA-V9-064 | 🟢 | `wave-v9-audit.test.ts` — 0 `ranga` dans tout le code, contact `revendsen@gmail.com` unique, 2000/5000/10000, 0 diff Gmail/Whapi/`REDIS_URL` dans le code (les 3 mentions de `docs/journal.md` sont normatives et préexistantes) | — |
| CA-V9-065 | 🟢 | `wave-v9-audit.test.ts` — `aucun hors-périmètre dans le livrable Wave` (0 remboursement, webview, iframe, mobile natif, automation des liens, rotation réelle) | — |

### 4.8 Documentation, tests et déploiement (6)

| Critère | État | Preuve | Limite éventuelle |
|---|---|---|---|
| CA-V9-070 | 🟢 | `v9-wave.test.tsx` — `le build web existe et ne contient aucune clé, aucun secret ni identifiant de session` (`index-0xCtJ8OR.css`, `index-B0fNaioy.js`) ; `wave-v9-audit.test.ts` — 0 secret dans les logs | — |
| CA-V9-071 | 🟢 | `wave-v9-audit.test.ts` — `docs/api.md` v2.9 (19/11/2026), 4 routes V9, `WAVE_DISABLED`, `client_reference` ; `docs/architecture-v9-wave-checkout.md` présent | — |
| CA-V9-072 | 🟢 | Suites V9 nommées et rejouables : 13 + 4 + 15 + 25 + 12 + **8 (diagnostics)** = **77 tests serveur V9**, 18 tests web V9 ; `spyFetchWave` intercepte `api.wave.com` (compteur d'appels) ; **0 appel réseau Wave**, 0 clé réelle (`wave-api-key-for-local-tests-only`, secrets factices) ; 12/12 scénarios couverts (§3) | — |
| CA-V9-073 | 🟢 | Serveur **807/807** (2× consécutives), storefront **63/63**, web **291/291**, `tsc` serveur/web **0 erreur**, builds ×2 **OK**, audits **0 vulnérabilité** (§2) | Le cahier cite 273/273 web (valeur V8.5) ; 291/291 est une **augmentation**, aucune régression. +8 tests = 807 suite aux diagnostics `89d8555` |
| CA-V9-074 | ⚪ | `wave-v9-disabled.test.ts` prouve le **comportement** `WAVE_ENABLED=false` (503, webhook ignoré, 0 appel) ; preuves administratives CA-V9-004/005 🟢 | **En attente de déploiement — condition de clôture, PAS un défaut de code.** La config effective en production (`WAVE_ENABLED=false`, absence de variables, aucun webhook enregistré, aucun paiement test) ne peut être prouvée qu'après le déploiement V9 désactivé (CA-V9-075) et le smoke. Aucun déploiement autorisé dans cette mission. Clôture par `@cahier-des-charges`. |
| CA-V9-075 | 🟢 | **Cahier amendé** : `CA-V9-075` prévoit explicitement le **déploiement de V9 en mode désactivé en phase de clôture**, procédure documentée dans `docs/cahier-des-charges-v9-wave-checkout.md` (CA-V9-075) et `docs/architecture-v9-wave-checkout.md:526,542,558` : backup → migration `023` **avant** le code (`RUN_MIGRATIONS=true MIGRATIONS_DIR=$(pwd)/migrations npx tsx src/db/migrate.ts`, `RUN_MIGRATIONS=false` en config) → `bash scripts/deploy-vercel.sh` → smoke post-déploiement. **Seule la bascule** (clés + `WAVE_ENABLED=true` + webhook + paiement test) reste hors V9. | Procédure **non exécutée ici** (aucun déploiement autorisé) : c'est précisément l'étape qui lèvera CA-V9-074. |

**Totaux : 54 🟢 / 1 ⚪ = 55 critères.** Le seul ⚪ est **CA-V9-074**, bloquant de **phase** (déploiement), **pas un défaut de code**.

---

## 5. Limites explicites (non dissimulées)

1. **Une seule limite de phase : CA-V9-074** (décision V9-D1, hors périmètre). Les anciennes limites « CA-V9-004/005 non prouvés » sont **levées** : le chef de projet a fourni le SQL prod de lecture seule prouvant l'identité et le rôle des admins id 7 et id 23 (cf. CA-V9-004, seul endroit où le résultat est reproduit) et la preuve du coffre local par nom/présence (`WAVE_API_KEY`, `WAVE_WEBHOOK_SECRET`, `WAVE_ENABLED`, `WAVE_SYSTEM_ADMIN_ID` : **ABSENT**, aucune valeur affichée). Il reste uniquement à prouver la **config effective après déploiement** : `WAVE_ENABLED=false`, absence de variables sur l'instance, aucun webhook enregistré chez Wave, aucun paiement test. **Ce n'est pas un défaut de code.**
2. **Réconciliation diagnostique = outil, pas preuve d'activation** (CA-V9-013/018 désormais 🟢). `retrieveCheckoutSession` et `searchCheckoutSessions` existent dans `server/src/services/wave-client.service.ts` (commit `89d8555`) et sont couverts par 8 tests mockés. Le GET retrouve une session `COMPLETED` **sans déclencher d'activation** (`PENDING`, `activated_by=null`, 0 trace, 0 e-mail) : le webhook reste la seule source d'activation, conformément à l'intention du cahier. Aucune route HTTP de diagnostic n'est exposée ; aucun appel réseau Wave réel.
3. **Identité admin** : `WAVE_SYSTEM_ADMIN_ID=1` dans les suites (seul `admin@revends.com` de `revends_test` porte l'id 1) ; la valeur `7` est le défaut de configuration (`process.env` absent ⇒ `7`) et est désormais **corroborée par le SQL prod** (CA-V9-004 🟢).
4. **Responsive sans session authentifiée** : la preuve `v9-responsive-check.mjs` rend les **vrais composants V9** en SSR avec le **CSS du build réel** dans Chromium à 280/320/360/375 px (`scrollWidth = clientWidth` partout), puis clique les 3 liens hébergés (0 requête `/api`). Elle ne couvre pas la page `/mon-abonnement` complète avec session, ni les écrans `/admin/abonnements` authentifiés (preuve DOM SSR + API à la place).
5. **Aucun appel Wave réel**, aucune clé réelle, aucun secret : tous les appels sont interceptés (`spyFetchWave`, `fetchImpl` injectable) ; la navigation `wave_launch_url` est prouvée par le composant, pas par un E2E vers `pay.wave.com`.
6. **Modifications préexistantes non incluses** : `docs/cahier-des-charges-v9-wave-checkout.md` et `docs/journal.md` étaient déjà modifiés avant ce travail (par d'autres agents / le chef de projet, notamment l'amendement CA-V9-075). Ce travail n'y a **rien ajouté** ; il n'a produit que du code de test et le présent document, fait l'objet d'un second commit dédié, et **n'a modifié aucun code applicatif**.
7. **Séquencement de clôture** (cahier amendé, `CA-V9-075`) : **(a)** revue de cette recette et levée des 4 écarts (✅ fait) → **(b)** contrôles sécurité/commit (✅ fait) → **(c)** déploiement de **V9 en mode désactivé** avec backup et migration `023` avant le code (`bash scripts/deploy-vercel.sh`) → **(d)** smoke post-déploiement consigné dans `docs/journal.md` → **(e)** preuve de `WAVE_ENABLED=false` effectif et levée de `CA-V9-074`, puis **recette finale par `@cahier-des-charges`**. Aucune bascule Wave (clés + `WAVE_ENABLED=true` + webhook + paiement test) ne doit intervenir avant cette clôture.

---

## 6. Verdict

| Contrôle | Résultat |
|---|---|
| 12 scénarios prouvés | **12 / 12** |
| 55 critères prouvés | **54 / 55** |
| Critères non prouvés | **`CA-V9-074` uniquement** — en attente de déploiement, **pas un défaut de code** |
| Suites obligatoires | **Toutes vertes** (serveur **807/807 ×2 consécutives**, diagnostics **8/8** en isolement et en suite, storefront **63/63**, web **291/291**, typechecks 0 erreur, builds OK, audits 0 vulnérabilité, `git diff --check` 0, 0 secret, 0 appel Wave) |
| Règle appliquée | « Un seul critère non prouvé → V9 non conforme » (cahier §5) |

**Les 4 écarts levés sont prouvés** : `CA-V9-004` (SQL prod), `CA-V9-005` (coffre local, présence seule), `CA-V9-013`/`CA-V9-018` (clients GET diagnostiques du commit `89d8555` + 8 tests rejoués personnellement en isolement et dans les 2 suites 807/807). Le livrable code est fonctionnellement sain et non régressif, **0 défaut de code**. Il reste **un seul bloquant de phase** : la preuve de configuration effective en production, qui dépend du déploiement V9 désactivé prévu par le cahier amendé (`CA-V9-075`). En application stricte de la règle binaire du cahier, la recette V9 est :

# NON CONFORME — 1 bloquant de phase (`CA-V9-074`), 0 défaut de code

VERDICT : NON CONFORME

> **Procédure pour lever `CA-V9-074`** (phase de clôture, cahier amendé `CA-V9-075`) : (1) backup puis migration `023` **avant** le code (`RUN_MIGRATIONS=true MIGRATIONS_DIR=$(pwd)/migrations npx tsx src/db/migrate.ts` avec `~/.revends-secrets/revends.env.local`, `RUN_MIGRATIONS=false` en config) ; (2) `bash scripts/deploy-vercel.sh` déploie **V9 avec `WAVE_ENABLED=false`**, sans clé ni webhook enregistré ; (3) smoke post-déploiement et output de santé/config consignés dans `docs/journal.md` prouvant `WAVE_ENABLED=false` effectif, l'absence de variables et de webhook Wave et l'absence de paiement test ; (4) **recette finale par `@cahier-des-charges`** → `CA-V9-074` passe 🟢 et le verdict devient CONFORME. Aucune bascule Wave (clés + `WAVE_ENABLED=true` + webhook + paiement test) ne doit être effectuée avant cette clôture.
