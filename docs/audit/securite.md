# Audit de sécurité — ReVends

- **Date** : 2026-10-27
- **Périmètre** : API Express 5 + front React 19 + nginx + configuration Docker/Render
- **Cible principale** : `http://127.0.0.1:8080` (nginx → `revends_api1/2/3`)
- **Cible fonctionnelle** : `http://127.0.0.1:4002` (instance e2e, base `revends_e2e`)
- **Mode** : lecture seule — aucune modification de code, aucun redémarrage, aucun test destructif
- **Auditeur** : audit automatisé + revue de code manuelle

> **Avertissement de sincérité** : cet audit n'est **pas exhaustif**. Il couvre les
> contrôles listés ci-dessous, sur une stack locale de recette. Les éléments
> « non testés / bloqués » sont explicitement listés en §5. Aucune conclusion ne
> doit être extrapolée à un environnement non observé.
>
> **Incident de test à déclarer** : un `POST /api/auth/forgot-password` a été
> envoyé **une fois** pour `admin@revends.com` alors que la stack live a
> `MAIL_ENABLED=true` et `MAIL_HOST=smtp.gmail.com`. Un email de réinitialisation
> réel a donc pu partir. Tous les tests déclenchant un email ont été arrêtés
> ensuite. Aucun secret n'a été affiché ni copié dans ce document.

---

## 1. Synthèse

| Statut | Nombre |
| --- | ---: |
| PASS | 41 |
| FAIL | 9 |
| PARTIAL | 6 |
| **Total contrôles** | **56** |

**Aucune vulnérabilité critique (P0) confirmée** : pas d'exécution de code à
distance, pas d'accès non authentifié à des données privées, pas de secret
versionné, pas d'injection SQL exploitable observée.

**Risques principaux, par ordre de priorité :**

1. **P1 — Rate limiting désactivé sur la stack auditée** (`RATE_LIMIT_DISABLED=true`).
   Brute-force / credential stuffing / épuisement de ressources sans plafond.
   La configuration de production (`render.yaml`) est correcte : il s'agit d'une
   dérive de configuration de l'environnement de recette, mais elle est héritée
   par les 4 conteneurs API.
2. **P1 — Dépendances vulnérables** : 4 vulnérabilités en production côté serveur
   (3 high, 1 moderate), 1 high côté web, 7 côté racine/Vercel. Preuves `npm audit`
   en §4.2.
3. **P2 — Confiance au `Host` / `X-Forwarded-Proto` pour construire des URL absolues**
   (`publicBaseUrl`), avec `SITE_URL` vide dans `render.yaml` : redirection ouverte
   prouvée sur le callback OAuth.
4. **P2 — Liaison de compte OAuth par email sans vérifier `email_verified`** ni
   conserver l'identifiant du fournisseur : risque de prise de contrôle de compte
   si un fournisseur renvoie un email non vérifié.
5. **P2 — Dérive d'images entre réplicas** : `api2/api3` exécutent un `dist`
   obsolète cuit dans l'image, `api1` monte le code hôte. Les correctifs ne sont
   pas appliqués partout et les réponses diffèrent selon le réplica.

### Les 3 correctifs à faire en priorité

1. **Réactiver le rate limiting** : retirer `RATE_LIMIT_DISABLED=true` de
   `docker-compose.override.yml:47`, et ajouter un garde-fou au démarrage qui
   refuse de booter si `NODE_ENV=production` et `RATE_LIMIT_DISABLED=true`
   (`server/src/config.ts`). Vérifier ensuite en live : 21e login → `429`.
2. **Mettre à jour les dépendances vulnérables** : `express` (→ `body-parser
   ≥ 2.4.0`), `multer 2.5.0`, `zod ≥ 4.6.7`, `nodemailer ≥ 10.2.1`,
   `@vercel/blob` (advisory) ; ajouter `npm audit --omit=dev --audit-level=high`
   en CI bloquante.
3. **Supprimer la confiance au `Host`** : construire les URL absolues uniquement
   depuis une allowlist de configuration (`SITE_URL` obligatoire en production,
   `PUBLIC_HOSTS`), ignorer `Host`/`X-Forwarded-Proto` pour ces URLs, et refuser
   le démarrage en production si `SITE_URL` est vide. Ajouter un test qui envoie
   `Host: evil.example` et attend une URL interne.

---

## 2. Méthodologie

1. **Revue de code ciblée** sur les surfaces à risque : auth, sessions, CSRF,
   rate limiting, uploads, sérialisation, OAuth, reset de mot de passe, nginx,
   Docker, `render.yaml`.
2. **Tests HTTP réels** avec `curl` (jar de cookies) sur la stack live et la stack
   e2e : en-têtes, cookies, CSRF, authn/authz, IDOR, validation, uploads.
3. **Simulation d'attaquant** : payloads SQLi, JSON invalide/géant, pollution de
   prototype, mass assignment, `Host` forgé, MIME spoof, traversal de nom de
   fichier, IDOR inter-utilisateurs.
4. **Analyse de dépendances** : `npm audit --omit=dev --json` (serveur, web,
   racine), versions installées via `npm ls`.
5. **Preuve par test unitaire** pour la logique de rate limiting non observable
   en live (38/38 tests verts).
6. **Nettoyage** : les artefacts créés (produits, favoris, fichiers) ont été
   supprimés via l'API ; les comptes de test `audit+…@example.com` n'ont pas de
   route de suppression et restent en base (à purger manuellement).

### Commandes de preuve utilisées

```bash
# En-têtes
curl -sSI http://127.0.0.1:8080/

# Cookies
curl -sS -c /tmp/opencode/revends-audit/j.jar -D - http://127.0.0.1:8080/api/products

# CSRF : mutation sans jeton
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  -H 'Content-Type: application/json' -d '{}' http://127.0.0.1:8080/api/auth/login

# Authz / IDOR (avec cookies de deux utilisateurs distincts)
curl -s -b e2e.jar http://127.0.0.1:4002/api/orders/146
curl -s -b e2e.jar -X PUT -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $TOKEN" -d '{}' http://127.0.0.1:4002/api/products/652

# Uploads
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' \
  http://127.0.0.1:8080/uploads/products/<uuid>.png
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' \
  http://127.0.0.1:4002/uploads/products/<uuid>.png

# Redirection ouverte
curl -s -o /dev/null -w '%{redirect_url}\n' -H 'Host: evil.example' \
  http://127.0.0.1:4001/api/auth/google/callback

# Dépendances
cd server && npm audit --omit=dev --json

# Rate limiting (logique)
cd server && node --import tsx --import ./test/env.ts --test \
  --test-concurrency=1 --test-force-exit test/unit-utils.test.ts
```

---

## 3. Tableau des contrôles

| ID | Contrôle | Attendu | Observé | Preuve | Statut |
| --- | --- | --- | --- | --- | --- |
| C01 | HSTS | `max-age` long | `max-age=31536000; includeSubDomains` | `curl -sSI /` | PASS |
| C02 | CSP | Restrictive, pas de `unsafe-eval` | `default-src 'self'`, script hash, `object-src 'none'`, `frame-ancestors 'self'` | idem | PASS |
| C03 | X-Frame-Options | `SAMEORIGIN`/`DENY` | `SAMEORIGIN` | idem | PASS |
| C04 | X-Content-Type-Options | `nosniff` | `nosniff` | idem | PASS |
| C05 | Referrer-Policy | Restrictive | `strict-origin-when-cross-origin` | idem | PASS |
| C06 | X-Powered-By | Absent | Absent | `curl -sSI / \| grep -i x-powered` → vide | PASS |
| C07 | Permissions-Policy | Présent (camera/mic/geo) | **Absent** sur `/`, `/api/products`, `/api/health` | idem → vide | **FAIL** |
| C08 | Cookie de session | `HttpOnly`, `SameSite=Lax` | `HttpOnly; SameSite=Lax; Path=/` | `Set-Cookie` | PASS |
| C09 | Cookie `Secure` | Présent en production | Absent en live (`COOKIE_SECURE=false`), présent dans `render.yaml:89-90` | `Set-Cookie` + config | PARTIAL |
| C10 | Fixation de session | Régénération au login/register | `req.session.regenerate` | `auth.routes.ts:62,78` | PASS |
| C11 | Logout | Session détruite + cookie effacé | `destroy` + `clearCookie` ; flag `secure` incohérent (`isProduction` vs `cookieSecure`) | `auth.routes.ts:118-122` | PASS |
| C12 | CSRF sans jeton | 403 | `403 CSRF_INVALID` | `curl POST /api/auth/login` | PASS |
| C13 | CSRF mauvais jeton | 403 | 403 | idem avec `X-CSRF-Token: bad` | PASS |
| C14 | CSRF origine croisée | 403 même avec jeton valide | 403 | `Origin: https://evil.example` | PASS |
| C15 | CSRF nominal | Mutation acceptée | 201 (création produit) | Origin + jeton valides | PASS |
| C16 | Routes privées sans session | 401 | 401 | `GET /api/me` | PASS |
| C17 | Utilisateur sur `/api/admin/*` | 403 | 403 | session user | PASS |
| C18 | Admin hors de son périmètre | 403 | 403 | admin sur `/api/me` | PASS |
| C19 | IDOR commande | 404 | 404 | user 1054 → `GET /api/orders/146` | PASS |
| C20 | IDOR écriture produit | 404 | 404 | user 1054 → `PUT /api/products/652` | PASS |
| C21 | IDOR notification | 404 | 404 | `POST /api/me/notifications/1/read` | PASS |
| C22 | Favoris | Scopés à l'utilisateur | Scopés | lecture/écriture par session | PASS |
| C23 | Route API inconnue | 404 JSON neutre | 404 JSON | `GET /api/unknown` | PASS |
| C24 | Injection SQL | Inopérante | `q` injecté → `total=0` ; id énorme → 400/404 | payloads `' OR 1=1--`, `1;DROP…` | PASS |
| C25 | JSON invalide | 400 | 400 | `-d '{bad'` | PASS |
| C26 | JSON géant | 413 | 413 | > 2 Mo | PASS |
| C27 | Pollution de prototype | Ignorée | `__proto__` ignoré, 401 | body `{"__proto__":{"role":"admin"}}` | PASS |
| C28 | Mass assignment | Champs serveur ignorés | `status/role/ownerId` ignorés | création produit → `PENDING` | PASS |
| C29 | XSS stocké | Contenu neutralisé | API renvoie le HTML brut ; React échappe ; 1 seul `dangerouslySetInnerHTML` (sprite statique) | produit 674 (supprimé) + revue web | PASS |
| C30 | MIME spoof upload | Rejet | 400 `PHOTO_INVALID_TYPE` | `<?php` renommé `.png` | PASS |
| C31 | Taille upload | Rejet > 5 Mo | 400 `PHOTO_TOO_LARGE` | fichier 6 Mo | PASS |
| C32 | Nom de fichier traversal | Neutralisé | UUID aléatoire | `../../escape.png` | PASS |
| C33 | Service des uploads via nginx | 200 image | **404** via 8080 ; 200 via 4001/4002 | `curl /uploads/products/<uuid>.png` | **FAIL** |
| C34 | `.env` versionné | Aucun | Aucun (seulement `.env.example`) | `git ls-files \| grep .env` | PASS |
| C35 | Secrets d'exemple | Placeholders | Placeholders majuscules, différents du runtime | `.env.example` | PASS |
| C36 | Secrets dans l'historique git | Aucun | Aucun motif clé/token sur 27 commits | `git log -p` + regex | PASS |
| C37 | Secrets dans le bundle web | Aucun | Aucun `SESSION_SECRET/DATABASE_URL/...` | grep `web/dist/assets` | PASS |
| C38 | Redirection ouverte (`Host`) | URL interne | `Host: evil.example` → `Location: http://evil.example/?oauth=error` | curl 4001 et 8080 | **FAIL** |
| C39 | `state` OAuth | Aléatoire, lié à la session | 32 octets, comparaison en session | `oauth` + session | PASS |
| C40 | `redirect`/`returnUrl` OAuth | Ignorés | Ignorés | paramètres forgés | PASS |
| C41 | Liaison OAuth | Vérifier `email_verified` + `(provider,id)` | Liaison par email seul, pas de vérification | `oauth.service.ts:93-98` | **FAIL** |
| C42 | Documentation API exposée | Non exposée | `/api-docs`, `/docs`, `/openapi.json`, `/swagger` → fallback SPA HTML | curl | PASS |
| C43 | Énumération par reset | Réponse identique | 202 identique (corps et statut) | emails existant/inexistant | PASS |
| C44 | Jeton de reset | Hashé, aléatoire, TTL, usage unique | SHA-256, 32 octets, 1 h, usage unique, jetons précédents invalidés | `password-reset.service.ts` | PASS |
| C45 | Timing du reset | Constant | ~68 ms (existant) vs ~31 ms (inexistant), faible échantillon | mesures | PARTIAL |
| C46 | Politique de mot de passe | ≥ 12 (ASVS) + hash cost à jour | min 8, bcrypt cost 10 | `validation.ts:23`, `users.service.ts:10` | PARTIAL |
| C47 | Rate limit auth (20/10 min) | 429 au-delà | 25 logins erronés consécutifs → 25 × 401, aucun 429 ; logique prouvée 429 + `Retry-After` | live + test unitaire | PARTIAL |
| C48 | Rate limit global (300/min) | 429 | Idem | idem | PARTIAL |
| C49 | Rate limit admin (60/min, skipAdmin) | 429 / skip admin | Idem | idem | PARTIAL |
| C50 | CORS | Allowlist stricte, pas de `*` | Origine inconnue → aucun `ACAO` ; origine autorisée → `ACAO` exact + credentials | curl Origin | PASS |
| C51 | Dépendances serveur (prod) | 0 high | 3 high + 1 moderate | `npm audit --omit=dev` | **FAIL** |
| C52 | Dépendances racine/Vercel | 0 high | 6 high + 1 moderate | `npm audit` racine | **FAIL** |
| C53 | Dépendances web (prod) | 0 high | 1 high (`zod`) | `npm audit --omit=dev` web | **FAIL** |
| C54 | Health enrichi | Minimal en public | Expose `rateLimit.backend`, uptime, Redis, DB | `GET /api/system/health` | **FAIL** |
| C55 | Cohérence des réplicas | Code identique partout | `api2/api3` = image obsolète, `api1` = code hôte | réponses OAuth différentes 4001/4002/8080 | **FAIL** |
| C56 | Fallback SPA | Pas de fuite de fichiers | Fallback `index.html` uniquement | chemins testés | PASS |

---

## 4. Vulnérabilités

### 4.1 P1 — Rate limiting désactivé sur la stack auditée

- **Fichier** : `docker-compose.override.yml:47` (`RATE_LIMIT_DISABLED=true`),
  hérité par `api1`, `api2`, `api3` et `api_e2e` via `docker-compose.yml:41`.
- **Preuve** :
  ```json
  GET /api/system/health
  {"status":"ok","redis":{"used":true,"ready":true},
   "rateLimit":{"backend":"disabled"},...}
  ```
  **Preuve comportementale** : 25 `POST /api/auth/login` consécutifs avec un
  mot de passe erroné → **25 × `401`**, aucun `429`, alors que le seuil
  revendiqué est de 20 requêtes / 10 minutes / IP.
  ```text
  401 401 401 401 401 401 401 401 401 401 401 401 401
  401 401 401 401 401 401 401 401 401 401 401 401
  ```
- **Impact** : brute-force de mots de passe, credential stuffing, énumération,
  déni de service applicatif (uploads, recherche, emails) sans plafond. Le
  limiteur admin (`skipAdmin`) est également neutralisé.
- **Correction** :
  - Retirer la variable de l'override de recette, ou la limiter à
    `NODE_ENV=test` ;
  - Garde-fou dans `server/src/config.ts` : si `NODE_ENV=production` et
    `RATE_LIMIT_DISABLED=true` → refuser le démarrage ;
  - Test d'intégration : 21e `POST /api/auth/login` → `429` + `Retry-After`,
    sur un stack avec limiteurs actifs ;
  - Vérifier `render.yaml:96-97` (`false`) au déploiement.

### 4.2 P1 — Dépendances vulnérables

Preuves réelles (`npm audit`, 2026-10-27) :

| Périmètre | Sévérité | Paquet | Advisory / plage |
| --- | --- | --- | --- |
| `server` prod | high | `body-parser` 2.3.0 | GHSA-27r3-jxmh-p828 (DoS, `< 2.4.0`) |
| `server` prod | high | `multer` 2.4.0 | GHSA-q7qp-rjg7-q26m (DoS, `< 2.5.0`) |
| `server` prod | high | `zod` 4.6.5 | GHSA-mrhx-c7xc-m3w5 (`< 4.6.6`) |
| `server` prod | moderate | `nodemailer` 10.0.12 | GHSA-8c8m-p3m8-cjg8 (addressparser) |
| `web` prod | high | `zod` 4.6.5 | même advisory |
| racine / Vercel | high ×6 | `@vercel/blob` 2.8.2, `@vercel/oidc`, `@vercel/cli-config`, + `body-parser`, `multer`, `zod` | advisory `@vercel/*`, plages `< correctif` |

- **Impact** : dénis de service (body-parser, multer), validation Zod contournable
  selon l'usage, parsing d'adresses email incorrect. Pas d'exécution de code
  observée.
- **Correction** :
  - `express@^5.2.2` (ou override `body-parser@^2.4.0`), `multer@2.5.0`,
    `zod@^4.6.7`, `nodemailer@^10.2.1` ;
  - `@vercel/blob` : appliquer le correctif (montée majeure) ou retirer le
    paquet s'il n'est pas indispensable ;
  - CI : `npm audit --omit=dev --audit-level=high` bloquant sur `server`,
    `web` et la racine.

### 4.3 P2 — Confiance au `Host` / `X-Forwarded-Proto` (redirection ouverte)

- **Fichier** : `server/src/routes/auth.routes.ts:25-44` (`publicBaseUrl`),
  utilisé par `oauthCallbackUrl` pour le `redirect_uri` et les redirections
  d'erreur.
- **Configuration aggravante** : `render.yaml:125-129` définit `SITE_URL: ''`
  et `CORS_ORIGINS: ''`. Avec `SITE_URL` vide, la seule source d'URL absolue
  devient l'en-tête `Host`.
- **Preuve** :
  ```text
  $ curl -s -o /dev/null -w '%{redirect_url}\n' \
      -H 'Host: evil.example' http://127.0.0.1:4001/api/auth/google/callback
  http://evil.example/?oauth=error
  # idem via nginx (8080)
  $ curl -s -o /dev/null -w '%{redirect_url}\n' \
      -H 'Host: evil.example' http://127.0.0.1:8080/api/auth/google/callback
  http://evil.example/?oauth=error
  # départ OAuth sur 4001
  redirect_uri=http%3A%2F%2Fevil.example%2Fapi%2Fauth%2Fgoogle%2Fcallback
  ```
  Sur 8080 et 4002, le départ OAuth renvoie encore `localhost:8080` à cause de
  la dérive d'images (§4.7) : la preuve d'injection du `redirect_uri` n'est
  donc établie que sur `api1` (4001).
- **Impact** : redirection de l'utilisateur vers un domaine attaquant après
  échec OAuth (hameçonnage), construction d'URL absolues non fiables. Le
  `redirect_uri` OAuth est heureusement validé côté fournisseur, ce qui limite
  la fuite de code ; le lien de reset de mot de passe, lui, utilise `SITE_URL`
  (non injectable).
- **Correction** :
  - Ne jamais dériver une URL publique de `Host` ou `X-Forwarded-Proto` ;
  - `SITE_URL` obligatoire (validation `z.string().url()` non vide) en
    production, échec au boot sinon ;
  - Allowlist `PUBLIC_HOSTS` si plusieurs domaines sont nécessaires ;
  - Test : `Host: evil.example` doit produire l'URL configurée, jamais
    `evil.example`.

### 4.4 P2 — Liaison de compte OAuth par email non vérifié

- **Fichier** : `server/src/services/oauth.service.ts:93-98`.
- **Constat** : `findOrCreateOAuthUser` cherche un compte par email
  (`findByEmail`) et le retourne tel quel. Aucun contrôle de `email_verified`
  n'est fait, et aucun couple `(provider, provider_id)` n'est persisté pour
  lier le compte au fournisseur.
- **Impact** : si un fournisseur accepte un email non vérifié (ou si son
  contrôle change), un attaquant peut s'inscrire avec l'email d'une victime et
  être connecté à son compte existant → prise de contrôle. Risque dépendant du
  fournisseur ; Google vérifie généralement l'email, Facebook non.
- **Correction** :
  - Exiger `email_verified === true` dans le profil du fournisseur ;
  - Stocker `(provider, provider_id)` dans une table `oauth_accounts` et ne
    lier un compte existant que sur ce couple ;
  - Pour une première liaison par email, exiger une confirmation par email ou
    une session déjà authentifiée.

### 4.5 P2 — Dérive de configuration des cookies / logout

- **Fichiers** : `docker-compose.override.yml:49` (`COOKIE_SECURE=false`),
  `server/src/routes/auth.routes.ts:118-122`.
- **Constat** : le cookie de session live n'a pas `Secure` (attendu en HTTP
  local), mais le logout efface le cookie avec `secure: config.isProduction`
  alors que la session utilise `config.cookieSecure`. En production, les deux
  valent `true` ; en recette, le cookie a été posé sans `Secure` et effacé avec
  `Secure` — incohérence de flag.
- **Impact** : en cas de déploiement avec `COOKIE_SECURE=false` (override
  recopié), session transmise en clair → interception. L'incohérence de logout
  peut empêcher l'effacement effectif du cookie.
- **Correction** :
  - Utiliser `config.cookieSecure` dans `clearCookie` ;
  - Refuser `COOKIE_SECURE=false` lorsque `NODE_ENV=production` ;
  - Test : cookie et clearCookie portent les mêmes attributs.

### 4.6 P3 — Permissions-Policy absent

- **Fichiers** : `server/nginx/nginx.conf:97-115` (bloc `location = /index.html`
  et assets), `server/src/app.ts:79-83` (helmet).
- **Preuve** : `curl -sSI http://127.0.0.1:8080/` → aucun en-tête
  `Permissions-Policy` sur `/`, `/api/products`, `/api/health`.
- **Impact** : accès caméra/micro/géolocalisation non restreint par politique
  (défense en profondeur ; le navigateur demande déjà le consentement).
- **Correction** : ajouter
  `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`
  dans nginx **et** via helmet (`permissionsPolicy` ou `res.setHeader` global),
  puis vérifier sur toutes les `location` (les `add_header` ne s'héritent pas).

### 4.7 P3 — Uploads inaccessibles via nginx (et en-têtes incohérents)

- **Fichier** : `server/nginx/nginx.conf:107` vs `:131`.
- **Preuve** :
  ```text
  F=0048b565-…png
  8080 /uploads/products/$F -> 404 text/html
  4001 /uploads/products/$F -> 200 image/png
  4002 /uploads/products/$F -> 200 image/png
  ```
- **Cause** : la regex `location ~* \.(png|jpg|…)$` est évaluée avant le préfixe
  `location /uploads/` et tente de servir le fichier depuis la racine du SPA,
  d'où un 404. Les 200 directs prouvent que l'API sert bien les fichiers.
- **Impact** : images cassées en production derrière nginx ; en-têtes de
  sécurité/cache appliqués par la mauvaise `location`. Pas d'exécution de code
  (types statiques, `nosniff` sur les assets).
- **Correction** : déclarer `location ^~ /uploads/ { … }` (le modificateur `^~`
  court-circuite l'évaluation des regex) avant le bloc regex, et y recopier les
  en-têtes de sécurité.

### 4.8 P3 — Dérive d'images / réplicas non homogènes

- **Constat** : `api1` monte le code hôte (`server/`), `api2` et `api3`
  exécutent un `dist` cuit dans une image plus ancienne. Preuve : sur le même
  `Host: evil.example`, 4001 renvoie `evil.example` tandis que 4002 renvoie
  `localhost:8080` ; le départ OAuth via 8080 reste sur `localhost:8080`.
- **Impact** : un correctif de sécurité peut n'être actif que sur 1 réplica sur
  3 ; comportements imprévisibles, tests non représentatifs. C'est un risque de
  **gestion de patch**, pas une vulnérabilité directe.
- **Correction** : reconstruire et redéployer les 3 réplicas à chaque
  changement, supprimer le bind-mount de code des environnements prod-like,
  exposer la version/commit dans `/api/system/health` et vérifier l'identité
  des instances (`X-Instance-Id`) après déploiement.

### 4.9 P3 — Canal temporel sur le reset de mot de passe

- **Fichier** : `server/src/services/password-reset.service.ts:40-60`.
- **Preuve** : requêtes répétées → ~68 ms pour un email existant, ~31 ms pour
  un email inexistant (échantillon faible, mesures bruitées).
- **Impact** : énumération d'emails malgré la réponse 202 identique.
- **Correction** : exécuter un travail constant dans les deux branches
  (recherche + `bcrypt` factice ou délai aléatoire borné), puis re-mesurer avec
  un échantillon suffisant.

### 4.10 P3 — Politique de mot de passe et coût bcrypt

- **Fichiers** : `server/src/utils/validation.ts:23` (min 8),
  `server/src/services/users.service.ts:10` (`BCRYPT_COST = 10`).
- **Impact** : résistance limitée au brute-force hors ligne ; 8 caractères est
  le minimum OWASP uniquement avec MFA.
- **Correction** : minimum 12 caractères (ou 8 + MFA), maximum 72 conservé,
  vérification contre les listes de mots de passe compromis (k-anonymat),
  `bcrypt` cost 12 ou migration vers Argon2id.

### 4.11 P3 — `/api/system/health` expose des détails d'infrastructure

- **Fichier** : `server/src/routes/system.routes.ts` (route montée
  `app.ts:132`), réponse observée :
  `{"status":"ok","uptimeSeconds":12087,"redis":{...},"rateLimit":{"backend":"disabled"},"cache":{...},"db":{...}}`.
- **Impact** : aide à la reconnaissance (Redis actif, rate limiting coupé,
  uptime). Faible.
- **Correction** : réserver le détail à un réseau interne ou à un jeton
  d'administration ; réponse publique minimale `{"status":"ok"}`.

### 4.12 P3 — `SITE_URL` vide dans `render.yaml`

- **Fichier** : `render.yaml:125-129`.
- **Impact** : en production, `config.siteUrl = ''` →
  - les liens des emails (`internalLink`, `server/src/mail/templates.ts:111-121`)
    deviennent **relatifs** (liens de reset et de commande cassés) ;
  - `corsOrigins` retombe sur `['']` : toute origine cross-origin est refusée
    (le front doit être same-origin) ;
  - `publicBaseUrl` bascule entièrement sur `Host` (§4.3).
- **Correction** : renseigner `SITE_URL` (URL HTTPS réelle) et `CORS_ORIGINS`
  au déploiement ; valider au boot que `SITE_URL` est une URL absolue en
  production.

### 4.13 P3 — Défense en profondeur XSS

- **Constat** : l'API stocke et renvoie le HTML brut (`<script>…</script>`)
  pour les champs libres ; la neutralisation repose uniquement sur l'échappement
  React. Un seul `dangerouslySetInnerHTML` existe
  (`web/src/components/IconSprite.tsx`, sprite statique).
- **Impact** : toute nouvelle surface (email, mobile WebView, export, futur
  rendu HTML) réintroduit un XSS stocké. Risque de régression, pas exploitable
  dans le client actuel.
- **Correction** : assainir/valider les champs libres côté serveur (allowlist
  de caractères ou `sanitize-html`), et ajouter un test qui vérifie l'encodage
  dans chaque consommateur.

### 4.14 P3 — Absence de verrouillage / CAPTCHA sur le login

- **Constat** : seule la limitation par IP protège le login (et elle est
  désactivée en live, §4.1). Pas de verrouillage par compte ni de CAPTCHA.
- **Impact** : brute-force distribué (botnet) contournant une limite par IP.
- **Correction** : après N échecs par compte, délai progressif ou challenge
  (CAPTCHA) ; journaliser et alerter ; conserver la limite par IP.

---

## 5. Non testé / bloqué

| Élément | Raison | Ce qu'il faudrait |
| --- | --- | --- |
| Seuils réels de rate limiting (auth 20/10 min, global 300/min, admin 60/min) | `RATE_LIMIT_DISABLED=true` sur les 4 conteneurs ; aucun 429 observable | Relancer une stack avec limiteurs actifs, puis tester 21 logins, 301 req/min, 61 mutations admin, et le skip admin |
| Comportement derrière un vrai HTTPS/proxy de production | Stack locale HTTP, `COOKIE_SECURE=false` | Déployer sur Render et vérifier `Secure`, HSTS, redirections HTTP→HTTPS, `trust proxy` |
| Envoi réel d'emails | Un seul envoi déclenché (reset admin), puis arrêt pour ne pas spammer | Bac à sable SMTP (MailHog) et vérifier liens/échappement |
| Paiement | Aucun flux de paiement réel dans le périmètre testé | Audit dédié du prestataire et des webhooks (signature, idempotence) |
| Tests de charge / DoS | Interdits (non destructifs) | Environnement isolé + scénarios bornés |
| Mobile (APK) | Non couvert par cet audit | Revue du stockage des jetons, certificate pinning, deep links |
| Dépendances : correctifs réellement appliqués | Audit en lecture seule | PR de mise à jour + CI `npm audit` |
| Comptes de test | Pas de route de suppression | Purge SQL manuelle de `audit+…@example.com` |
| `npm audit` web complet (dev) | Bruit dev (lighthouse/vitest/vite) | Prioriser le périmètre `--omit=dev` |
| Rotation des secrets | Non observable sans accès au gestionnaire | Vérifier la politique de rotation Render/Supabase |

### Points non concluants (à ne pas présenter comme sûrs)

- **Timing du reset** : mesure au faible échantillon, non reproductible de
  façon stable → à confirmer.
- **Redirection ouverte** : prouvée sur `api1` (4001) et sur le callback via
  nginx ; le départ OAuth via 8080 reste sur `localhost` à cause de la dérive
  d'images. L'exploitabilité réelle dépend d'un `Host` contrôlé par l'attaquant
  (DNS rebinding / proxy mal configuré) — sévérité P2, pas P1.
- **CORS** : testé sur une origine inconnue et l'origine same-origin ; pas de
  test exhaustif de toutes les combinaisons de `CORS_ORIGINS`.

---

## 6. Constats positifs notables

- Aucun secret versionné (`.env`, clés, tokens) sur les 27 commits ; les
  `.env.example` ne contiennent que des placeholders.
- Hachage bcrypt avec hash factice pour égaliser le login d'un compte inexistant
  (`users.service.ts:12-14,54`) — bonne défense contre l'énumération temporelle.
- Jetons de reset : 32 octets aléatoires, SHA-256 en base, TTL 1 h, usage unique,
  invalidation des jetons précédents.
- CSRF double soumission + contrôle d'`Origin` : les trois variantes d'attaque
  testées échouent.
- Contrôles d'accès cohérents sur les ressources privées (commandes, produits,
  notifications, favoris) : aucun IDOR trouvé.
- Uploads : limite 5 Mo, sniff des magic bytes, nom UUID, rejet des types
  usurpés.
- Réponses d'erreur API neutres (404 JSON, pas de fuite de pile).
- `render.yaml` active `COOKIE_SECURE=true`, `RATE_LIMIT_DISABLED=false` et
  génère `SESSION_SECRET` — la production est correctement configurée sur ces
  points ; c'est l'environnement local qui dérive.

---

## 7. Plan de remédiation suggéré

| Priorité | Action | Effort | Vérification |
| --- | --- | --- | --- |
| 1 | Réactiver le rate limiting + garde-fou de boot | S | 21e login → 429 |
| 2 | Corriger les dépendances (`express`, `multer`, `zod`, `nodemailer`, `@vercel/blob`) + CI audit | M | `npm audit --omit=dev` à 0 high |
| 3 | Supprimer la confiance au `Host`, rendre `SITE_URL` obligatoire | S | `Host: evil.example` → URL interne |
| 4 | Lier OAuth par `(provider, provider_id)` + `email_verified` | M | Test d'un email non vérifié |
| 5 | Aligner `clearCookie` sur `cookieSecure` | XS | Attributs identiques |
| 6 | Ajouter `Permissions-Policy` | XS | En-tête présent partout |
| 7 | Corriger `location ^~ /uploads/` | XS | 200 image via 8080 |
| 8 | Homogénéiser les réplicas / versions | M | 3/3 même commit |
| 9 | Durcir la politique de mot de passe (12+, bcrypt 12) | S | Tests de validation |
| 10 | Réduire `/api/system/health` public | XS | Réponse minimale |

---

*Rapport généré en lecture seule. Les preuves brutes (jars de cookies, JSON
`npm audit`, réponses HTTP) sont conservées dans `/tmp/opencode/revends-audit/`
et ne contiennent aucun mot de passe en clair.*
