# CAHIER DES CHARGES V5 — « Sprint Performance & Pro »

| | |
|---|---|
| **Projet** | ReVends — marketplace de revente d'articles d'occasion (Côte d'Ivoire) |
| **Version document** | 1.0 — **PRIME** sur `cahier-des-charges-v4-accueil.md` pour les points expressément arbitrés en §3 |
| **Statut** | Contrat de recette — prêt pour `@architecte`, `@backend`, `@frontend`, `@tester` |
| **Cible** | Web (React 19 + Vite 7 + Tailwind 4 — `revends/web`) + API (Node 22 + Express 5 + Postgres — `revends/server`) |
| **Références amont** | `docs/cahier-des-charges.md` · `-v2.md` · `-v3.md` · `-v4-accueil.md` · `docs/api.md` **v2.2** · `docs/design-system.md` · `docs/architecture.md` |
| **Socle de recette au 27/09/2026** | `server: tsc --noEmit` ✅ · `web: tsc -b` ✅ · `web: vitest` **52/52** ✅ · `server: node --test test/catalog.test.ts` **19/19** ✅ (Postgres `127.0.0.1:5433` joignable) |

> **Convention de lecture.** Chaque critère `CA-V5-xxx` est **binaire** : il est soit conforme, soit non conforme. Trois modes de preuve sont acceptés et indiqués entre crochets :
> `[TEST]` = test automatisé (nommé, rejouable) · `[AUDIT]` = revue de code avec référence `fichier:ligne` · `[EXEC]` = requête/mesure exécutable (curl, SQL, script de charge).
> Aucun critère ne peut être validé sur une intention annoncée : **la preuve est obligatoire**.

---

## 1. Contexte et objectifs

Le produit ReVends est en production fonctionnelle : l'accueil « V3 » (découverte marketplace), la recherche, les catégories, la fiche produit, le panier, le cycle de commande V3/V4 (12 statuts, logistique + paiement vendeur `DUE`), l'authentification et le back-office administrateur sont livrés et testés (`server/test/`, 3 526 lignes de tests d'intégration ; `web/src/lib/*.test.ts`, 52 tests unitaires).

L'utilisateur lance **8 chantiers** de consolidation, sans régression des parcours acquis. Ces chantiers relèvent de trois natures :

1. **Industrialisation** — C1 (emails transactionnels), C5 (scalabilité), C2 (durcissement RBAC) : ce qui manque pour un usage réel à plusieurs milliers d'utilisateurs.
2. **Professionalisation** — C3 (refonte des 9 écrans admin), C6 (retrait d'un use case devenu inutile), C7 (exigence de qualité code).
3. **Gouvernance du produit** — C4 (cycle de vie produit et suppression admin-only).

### 1.1 Objectifs mesurables du chantier

| # | Objectif | Mesure de réussite |
|---|---|---|
| O1 | L'utilisateur est informé par e-mail des événements métier clés | **9 déclencheurs / 11 envois** couverts par un test chacun (§5.1, PO-V5-14) |
| O2 | Aucun utilisateur non-admin n'atteint l'interface ni les données admin | 18/18 routes `/api/admin/*` verrouillées par test automatisé paramétré (CA-V5-019) |
| O3 | L'interface admin est homogène et sans dette de style | 0 style inline, 0 classe Tailwind inexistante, 0 `shadow-[…]` arbitraire, 0 couleur hexadécimale hors tokens |
| O4 | La suppression d'un produit est un acte administrateur, réversible, sans casser l'historique | Soft delete + historique commandes intact + notification vendeur |
| O5 | Le catalogue et le back-office répondent sous les seuils de latence à 50 000 produits | catalogue p95 < 100 ms, admin p95 < 150 ms (§6.1) |
| O6 | Le use case « Contacter le vendeur » est entièrement retiré, sans reliquat | 0 occurrence de `contact` / `product.contact` dans le code applicatif |
| O7 | Zéro code débutant | TypeScript strict sans `any` sauvage, zéro duplication, typecheck + build + tests verts |
| O8 | Zéro régression | 3 526 lignes de tests serveur existantes toujours vertes + parcours E2E manuels inchangés |

### 1.2 Parties prenantes

| Rôle | Intérêt | Attentes |
|---|---|---|
| Utilisateur final (acheteur / vendeur) | Fiabilité de la plateforme | notifications e-mail, aucun contenu choquant dans l'admin, vitesse |
| Administrateur modérateur | Outils de travail | écrans homogènes, suppression d'un produit douteux, tableau de bord exploitant |
| `@architecte` | Décisions techniques | contraintes d'acceptation claires, sans imposer de solution |
| `@backend` / `@frontend` | Implémentation | backlog trié, critères testables |
| `@tester` | Recette | 210 critères binaires, protocole de mesure fourni |
| `@cahier-des-charges` | Garantie de conformité | grille de recette §8, écarts référencés |

### 1.3 Personas

- **Acheteur** — parcourt l'accueil, recherche, réserve, paie, suit son colis. Attend des e-mails (confirmation, expédition, livraison) et ne doit **jamais** voir d'écran admin.
- **Vendeur** — publie des articles, les fait modérer, encaisse. Attend d'être informé (approbation, refus, réservation expirée, paiement). **Ne peut plus supprimer** ses articles (arbitrage §3.1, ARB-V5-04).
- **Administrateur** — modère, suit les commandes, paie les vendeurs, supprime les produits litigieux. Attend un back-office professionnel et rapide.
- **Non-admin authentifié** — la menace principale du chantier C2 : il doit être redirigé proprement, pas exposé.

---

## 2. Périmètre

### 2.1 Dans le périmètre (V5)

| Chantier | Intitulé | Contenu synthétique |
|---|---|---|
| **C1** | Emails transactionnels | 6 emails (bienvenue, approbation/refus, commande payée, expédition/livraison, paiement vendeur, réservation expirée) + couche d'envoi transposable dev/prod |
| **C2** | RBAC durci | Verrouillage par tests des 18 routes `/api/admin/*` ; redirections front propres ; non-affichage du lien admin |
| **C3** | Refonte interface admin | Homogénéisation des 9 pages admin sur le design system ; correction des dettes de style recensées ; extraction de composants partagés |
| **C4** | Cycle produit & suppression admin-only | Soft delete (`products.deleted_at`, migration 009) ; retrait du DELETE vendeur ; action Supprimer côté admin ; notification vendeur ; preuve de l'absence de quota de vente |
| **C5** | Scalabilité | Suppression des 8 N+1 recensés ; performance du `COUNT(*)` ; index manquants ; rate limit global ; robustesse ; gaines de rétrocompatibilité |
| **C6** | Retrait de « Contacter le vendeur » | Suppression de 13 blocs de code identifiés + 14 tests + mise à jour documentaire |
| **C7** | Qualité « vrai code pro » | Zéro style arbitraire, zéro classe inexistante, zéro `any`, zéro duplication, gates verts |
| **C8** | Non-régression | Les parcours acquis restent intacts |
| **C9** | **Identité visuelle « REVENDS 2026 »** | Palette 2026 par tokens, typographies, logo, navbar desktop 5 liens + **bottom nav mobile**, recherche à suggestions, hero et sections éditoriales, catalogue 8 filtres / 4 tris, page catégorie, fiche produit premium, checkout 4 étapes, création d'annonce 5 étapes, suivi de colis Terracotta, **une seule** page de connexion, admin sidebar sombre, **50 écrans** (US-V5-09, §5.9) |

### 2.2 Hors-périmètre (V5) — tranché, non négociable

| Sujet | Raison |
|---|---|
| **Emails de campagne / marketing / newsletter** | Pas de segmentation, pas d'envoi de masse, pas d'opt-out demandés. V5 = **transactionnel uniquement**. |
| **Notifications push navigateur / mobile** | Aucun service worker, pas de gestion de permission, hors budget. |
| **Vérification d'email / `email_verified`** | `users` n'a pas de colonne de vérification (`001_init.sql:23-34`) ; aucun envoi de code de validation. |
| **Hard delete produit** | Interdit — `orders.product_id REFERENCES products(id)` **sans `ON DELETE`** (`001_init.sql:116`) rend le hard delete impossible sans casser l'intégrité des commandes. Voir F4. |
| **Restauration / undelete d'un produit supprimé** | Réversible en base (ARB-V5-06), **pas d'UI** en V5. |
| **Messagerie acheteur↔vendeur** | Le use case contact est **retiré** (C6). Une vraie messagerie reste un chantier futur. |
| **Envoi de pièces jointes dans les emails** | Aucun stockage objet, aucun risque de fuite. |
| **Gestion des utilisateurs côté admin (bannir, changer un rôle)** | `GET /api/admin/users` est en lecture seule (`admin.routes.ts:142-146`) ; aucun endpoint d'écriture n'existe. Voir F6. |
| **CRUD admin des bannières** | Structure prête (table `banners` + `GET /api/banners`) mais aucun écran d'administration — hors périmètre comme en V4 (`cahier-des-charges-v4-accueil.md:54`). |
| **Application mobile native (Expo/React Native)** | Hors périmètre (web responsive uniquement, cohérent V1→V4). |
| **Refonte accueil / recherche / catégorie / fiche produit** | Hors périmètre — livrés et ne doivent pas changer (C8), **à l'exception** de la correction de style de CA-V5-031 et CA-V5-032. **AMENDÉ (CF-01)** : US-V5-09 (C9) rouvre ces écrans pour le **fond** (couleurs, typographie, mise en page) et **referme** le **fond** sur C8 : aucune URL, aucun code HTTP, aucune forme de réponse, aucun ordre de tri, aucun libellé métier et aucun parcours ne change (CA-V5-157). |
| **Migration de la valeur d'énumération `product.contact` hors de la base** | On **conserve** la valeur en base, on retire le code (ARB-V5-08). |
| **Nouveaux endpoints publics** (hors `DELETE /api/admin/products/:id`) | C5 est une optimisation **sans changement de contrat** ; le seul ajout de contrat est la route de suppression admin (C4). **À TRANCHER (CF-02, `PO-V5-18`)** : C9 demande 3 filtres (`taille`, `couleur`, `date`), 1 tri (`Pertinence`) et un endpoint de suggestions — **inexistants** aujourd'hui (F16, F17). Acceptation proposée : addition **bornée** et documentée (`docs/api.md` v2.4), dont l'absence de valeur ne change aucune réponse existante. **Repli** : livrés en V6, C9 reste conforme sur le contrat actuel. |

---

## 3. Arbitrages

### 3.1 Arbitrages du chef de projet (23→27/09/2026) — **PRIME sur toute section antérieure**

**ARB-V5-01 (C1)** — Les **6 emails transactionnels** sont : inscription → bienvenue ; produit approuvé/rejeté (vendeur) ; commande confirmée payée (acheteur + vendeur) ; commande expédiée/livrée (acheteur) ; paiement vendeur disponible puis payé (vendeur) ; réservation expirée.
**Pas de vérification d'email** ni de colonne `email_verified`. **Les emails ne remplacent pas les notifications in-app** : les deux canaux coexistent, et **aucune notification in-app existante n'est supprimée, déplacée ni changée** (C8). Choix technique libre mais professionnel ; **recommandation non contraignante** : interface `Mailer` + transporteur SMTP (console en dev, variables d'environnement en prod). Les emails sont **génériques** (aucune donnée sensible), HTML simple **et** version texte.
→ Critères : §5.1.

**ARB-V5-02 (C2)** — Un `user` connecté qui saisit une URL `/admin/*` est **redirigé vers l'accueil** ; il ne doit **jamais** voir de page 403 lui suggérant qu'il a un problème d'accès administrateur. Le lien/menu admin n'est **jamais** rendu pour un non-admin. Aucune donnée admin ne transite vers un front non-admin — garantie par l'API.
→ Critères : §5.2.

**ARB-V5-03 (C3)** — Les 9 pages admin sont homogénisées sur le design system existant (`web/src/index.css` `@theme` + `web/src/components/ui`). **Toutes** les incohérences recensées sont corrigées : classe inexistante `hover:bg-soft-primary` (`ProductPage.tsx:256`) ; ombre arbitraire `shadow-[0_4px_12px_rgba(0,0,0,0.08)]` (`ProductPage.tsx:147`) ; style inline (`AdminCategoriesPage.tsx:64`) ; `AdminCategoriesPage` sans `Pagination` ; `AdminUsersPage` sans `Button` ; `AdminDashboardPage` à compléter. Aucun style inline arbitraire, aucune couleur hexadécimale codée en dur : **tout passe par les tokens**. Écrans soignés et professionnels, **responsive desktop** (l'admin est desktop-first mais ne doit pas casser en dessous de 1024 px).
→ Critères : §5.3.

**ARB-V5-04 (C4)** — Un produit est retiré du catalogue dès qu'il n'est plus `AVAILABLE` (déjà le cas : `products.service.ts:285`). La **fiche publique** d'un produit `RESERVED` **reste visible** (réservation temporaire). Le catalogue public liste **uniquement** des produits `AVAILABLE` — un produit `SOLD` n'apparaît dans **aucune** liste ni dans aucune fiche publique ; ce comportement est **verrouillé par test**. La suppression de produit devient un **privilège administrateur exclusif** : le vendeur ne peut plus supprimer (route `DELETE /api/products/:id` retirée côté user ; `MyArticlesPage` ne propose plus « Supprimer »). L'admin dispose d'une action « Supprimer » qui : marque le produit supprimé (**soft delete** via la colonne `deleted_at` ajoutée par la **migration 009**) ; le retire immédiatement du catalogue **et** des recherches ; rend la fiche publique **404** ; **ne casse pas** l'historique des commandes ; **notifie le vendeur**.
→ Critères : §5.4.

**ARB-V5-05 (C4)** — Après une vente (produit `SOLD`), le vendeur **peut toujours vendre** : le bouton « Vendre un produit » est disponible en permanence et **aucune limite de produits par vendeur** n'existe. À **verrouiller par test**.
→ Critères : CA-V5-069, CA-V5-070.

**ARB-V5-06 (C4)** — **Soft delete uniquement** en V5, pour intégrité des commandes. **Pas de hard delete**, **pas de restauration côté UI** (réversible en base).
→ Critères : CA-V5-058, CA-V5-064.

**ARB-V5-07 (C5)** — Les N+1 recensés sont éliminés (table §5.5). Le `COUNT(*)` du catalogue est **évalué**. **Rate limiting global** modéré par IP (**300 req/min**), le rate limit par route de l'auth restant inchangé, avec **bypass en test**. Robustesse : pool jamais saturé, timeouts BD, pas de crash sur payload malformé, logger structuré minimal. **Toutes** les garanties de contrat sont conservées : filtres, paramètres, bornes de pagination et formes de réponse restent **identiques** (rétrocompatibilité stricte).
→ Critères : §5.5.

**ARB-V5-08 (C6)** — Le use case « Contacter le vendeur » est **intégralement supprimé** : route, validation, service, type de notification, tests serveur, et tout le front associé. La valeur d'énumération `'product.contact'` **reste en base** (migration 008) mais disparaît du code.
→ Critères : §5.6.

**ARB-V5-09 (C7)** — Exigence transversale : aucun style inline arbitraire, aucune classe Tailwind inexistante, aucun `any` sauvage (TypeScript strict), composants UI partagés, pas de duplication, **tous** les tests verts, typecheck + build verts, revue + sécurité passées. Toute fonction modifiée **garde sa sémantique existante**.
→ Critères : §5.7.

**ARB-V5-10 (C8)** — Non-régression sur l'intégralité des parcours acquis : accueil V3, recherche, catégorie, fiche produit, panier, commandes utilisateur, vente, notifications, admin V4 (paiements + étapes), authentification.
→ Critères : §5.8.

### 3.2 Arbitrages — **PRIME sur le cahier V4-Accueil** (collisions explicites)

| # | Collision | Arbitrage V5 |
|---|---|---|
| **COL-01** | `cahier-des-charges-v4-accueil.md:233` (CA-ACC-57) et `:377` (§12 pt 9) imposent le bouton + l'endpoint de contact ; `:356` (PO-ACC-1) l'arbitre ; `api.md` v2.2 (§3.2 quater, lignes 825-873) le contractualise. | **Supprimés.** `cahier-des-charges-v4-accueil.md` est explicitement **superseded** sur ce seul point. `docs/api.md` passe en **v2.3** (CA-V5-103) ; en attendant, le présent cahier **prime**. |
| **COL-02** | `cahier-des-charges-v4-accueil.md:378` (PO-ACC-6 / §12 pt 10) décrit `discover` comme un tri modulo sur toute la table. | **Maintenu** mais **borné et documenté** : C5 impose un `LIMIT` borné sur les produits `AVAILABLE` avant réordonnancement (CA-V5-083, arbitrage D4). Le caractère « stable sur 24 h » est **préservé** (CA-V5-083). |
| **COL-03** | `cahier-des-charges-v4-accueil.md:54` pose le CRUD admin des bannières en hors-périmètre. | **Confirmé hors périmètre** (§2.2). |

### 3.3 Arbitrages du rédacteur — décisions manquantes, documentées pour traçabilité

> Ces points n'étaient pas tranchés dans la demande initiale. Ils sont arbitrés ici **conformément à l'esprit** des arbitrages reçus (pragmatisme, zéro régression, intégrité des données) et sont **soumis à validation** en §7.

- **D1 — `deleted_at` est orthogonale à `status`.** La suppression **n'altère pas** `products.status` (le produit reste `AVAILABLE`, `SOLD` ou `RESERVED` en base). C'est un filtre supplémentaire `deleted_at IS NULL` appliqué **systématiquement** à toute lecture applicative. *Pourquoi* : évite deescalader les états métier, garde `status` exploitable pour l'historique et les statistiques, et rend l'oubli du filtre plus visible en revue de code.
- **D2 — Un produit soft-deleted conserve ses fichiers photo sur disque.** Pas de `unlink` lors de la suppression. *Pourquoi* : c'est la condition de la réversibilité (ARB-V5-06) ; le nettoyage disque est une tâche d'exploitation séparée (hors périmètre).
- **D3 — La suppression admin crée une trace `admin_actions`.** La table existe déjà (index `idx_admin_actions_created`, `001_init.sql:180`) et la page « Historique » la lit. *Pourquoi* : une suppression est un acte d'administration traçable. La notification au vendeur est **en plus**, pas **à la place**.
- **D4 — `section=discover` reste un « tirage parmi les `AVAILABLE` », mais borné.** L'ordre par expression modulo sur toute la table est incompatible avec l'objectif de performance (tri non indexable). Le comportement **observable** est préservé : ensemble stable sur 24 h, varié d'un jour à l'autre, rempli de produits réels `AVAILABLE`, taille bornée. L'implémentation exacte est une décision `@architecte` — le cahier impose le **résultat observable**, pas la méthode.
- **D5 — Le nouveau type de notification de suppression est `'article_deleted'`, ajouté par la migration 009.** On ne réutilise ni `article_rejected` (sémantique différente : refus ≠ suppression) ni `product.contact` (que C6 supprime du code). La migration 009 ajoute donc **deux** objets : `products.deleted_at` et la valeur d'énumération.
- **D6 — Le lien « Supprimer » de l'admin vit sur la page Articles** (`AdminArticlesPage`, la page de suivi/filtrage par statut), pas sur la page de modération « Articles en attente » (`AdminPendingPage`, qui n'accepte que `PENDING` par construction). L'action est **visible sur toute ligne** de la table Articles, quel que soit le statut, **sauf** si le produit porte une commande active (motif affiché, action désactivée — CA-V5-065).
- **D7 — La route de suppression admin est `DELETE /api/admin/products/:id`**, alignée sur le vocabulaire de `docs/api.md` §3.6 et sur les 17 autres routes admin (toutes préfixées `/api/admin`). Réponse `204` sans corps.
- **D8 — Le rate limit global est monté sur `/api` seulement.** Les photos statiques `/uploads` et le fallback SPA ne sont pas concernés ; les probes `/api/health` et `/health` sont **exemptés**. L'ordre de montage conserve le limiteur d'auth **en premier** (plus strict) : `app.ts:63` reste avant le limiteur global.
- **D9 — Le redéploiement de `RequireAdmin` ne doit pas créer de boucle de redirection.** Un `admin` connecté reste sur la page ; un anonyme est redirigé vers `/login` ; un `user` est redirigé vers `/`. Aucune de ces trois redirections ne peut produire un 404 ni une boucle (test automatisé sur les 9 routes).
- **D10 — La garantie « aucune donnée admin vers un front non-admin » est une propriété serveur.** Le front n'est qu'un confort d'UX. La preuve exigée est le test serveur paramétré sur les 18 routes.
- **D11 — Les 9 pages admin doivent partager au minimum 4 composants extraits** : table, cellule image, barre d'actions de ligne, modale de confirmation. C'est le seul moyen de sortir de la duplication constatée (6 pages dupliquent `table-scroll overflow-x-auto`, 5 importent `Modal`). Le composant `Card` de `States.tsx:44` fait autorité sur le `<div className="card">` brut.

### 3.4 Corrections factuelles (audit du code réel vs. l'énoncé du chantier)

> Ces écarts entre l'énoncé et le code ont été vérifiés **avant** rédaction. Ils sont signalés pour que les critères ne reposent pas sur des références fausses.

| # | Énoncé | Réalité vérifiée | Conséquence |
|---|---|---|---|
| **F1** | « tests `accueil-v3.test.ts:433-568` (13 cas) » | Le bloc `describe('POST /api/products/:id/contact (PO-ACC-1)')` s'étend de **:433 à :568** et contient **12** cas `it()` (lignes 450, 456, 462, 470, 476, 483, 491, 497, 521, 537, 546, 555). | La plage est exacte ; le nombre est **12**, pas 13. Corrigé dans CA-V5-102/104. |
| **F2** | « `AdminDashboardPage` minimaliste (3 composants) » | La page est **plus riche** que décrit : 4 `StatCard` (`:90-99`), grille « Actions à effectuer » (`:103-133`), grille « Accès rapides » (`:135-151`). Le **vrai** écart : elle **n'expose pas** les 8 compteurs par statut de commande que `getStats` renvoie déjà (`admin.service.ts:80-90`, `100-109`) et n'utilise **ni `Button` ni `EmptyState`**. | Critère **reformulé** sur l'écart réel (CA-V5-039/040), pas sur une description fausse. |
| **F3** | « vérifier menus.ts/Sidebar/DashboardLayout si le lien dépend du rôle » | **Déjà conforme.** Le lien `/admin` de la Navbar est conditionné : `Navbar.tsx:130`. `adminMenu` (`menus.ts:6-17`) n'est consommé que par les 9 pages admin via `DashboardLayout` (`:16-20`). | Le critère devient un **verrou de non-régression** (CA-V5-026/027). |
| **F4** | « soft delete … décision archi » | `orders.product_id BIGINT NOT NULL REFERENCES products(id)` **sans clause `ON DELETE`** (`001_init.sql:116`) → un hard delete d'un produit commandé est **impossible** en base. De plus `deleteProduct` actuel (`products.service.ts:690-714`) est un **hard delete + `unlink` des photos**. | Le soft delete est **techniquement obligatoire**. Arbitrage **renforcé** (ARB-V5-06). |
| **F5** | « retirer DELETE /api/products/:id côté user » | La route existe (`products.routes.ts:108-114`) et **4 tests** la couvrent : `sell.test.ts:231` (204 puis 404), `:243` (intrusion → 404), `:248` (`REJECTED` sans commande → 204), `:262` (`SOLD` → 409). | Le retrait **exige** la réécriture de 4 tests, pas leur suppression silencieuse. Critères CA-V5-054 et CA-V5-112. |
| **F6** | « `AdminUsersPage` sans `Button` » | Exact, mais **la page n'a aucune action** : tableau en lecture seule (`AdminUsersPage.tsx:65-95`) et **aucun endpoint d'écriture utilisateur** n'existe (`admin.routes.ts:142-146`). C'est la page la plus **conforme** de l'ensemble (TableSkeleton + ErrorMessage + EmptyState + Pagination, `:8-11`). | Critère reformulé : l'exigence porte sur la **cohérence des composants partagés**, pas sur l'obligation d'un `Button` sans déclencheur. Ajout au hors-périmètre §2.2. |
| **F7** | « classe inexistante `hover:bg-soft-primary` » | Confirmé et **unique dans tout le front** : 1 seule occurrence, `ProductPage.tsx:256`. Le bloc `@theme` (`index.css:7-35`) définit `soft-success`, `soft-info`, `soft-warning`, `soft-danger`, `soft-orange`, `soft-purple` — **pas** `soft-primary`. | Critère précis et borné à 1 occurrence. |
| **F8** | « shadow arbitraire » | Confirmé : `ProductPage.tsx:147`. La valeur est **strictement identique** au token `--shadow-card: 0 4px 12px rgba(0,0,0,0.08)` (`index.css:31`). | Le critère impose l'usage du token existant, sans nouveau design. |
| **F9** | « `getStats` : 7 requêtes parallèles » | Confirmé : `admin.service.ts:59-91` — `Promise.all` sur **7** requêtes. C'est **déjà parallèle et borné** (7 ≤ pool max 10). | Critère reformulé (CA-V5-081) : exiger la réduction **ou la justification par la mesure**, pas « paralléliser » (déjà fait). |
| **F10** | — (non évoqué) | `States.tsx:44` exporte un composant `Card` alors que **4** pages admin utilisent encore le `<div className="card">` brut (`AdminCategoriesPage` ×1, `AdminDashboardPage` ×2, `AdminOrderDetailPage` ×3) et **6** pages dupliquent `<div className="table-scroll overflow-x-auto">`. `AdminOrderDetailPage.tsx` (563 lignes) ne contient **aucune** classe responsive `max-[…]`. | Ajouté en CA-V5-035/036/038 — dette réelle non listée dans l'énoncé. |
| **F11** | — (non évoqué) | Le pool est `max: 10` (`pool.ts:12`). Le parallélisme des lectures exigé par C5 doit rester **borné** sous ce plafond. | Contrainte rendue explicite en RG-V5-7 et CA-V5-087. |
| **F12** | — (non évoqué) | `users` ne contient **aucune** colonne de vérification d'email (`001_init.sql:23-34`) ; `config.ts:11-36` ne déclare **aucune** variable SMTP ; `server/package.json` ne dépend d'**aucun** transporteur mail. | Confirme que C1 est intégralement à construire (pas de régression possible, pas d'existant à préserver). |
| **F13** | « le test d'accessibilité front » | **Inexistant.** Les seules suites front sont `web/src/lib/{api,constants,format,recentViews}.test.ts` (22 + 7 + 13 + 10 = **52** tests) ; aucun fichier ne teste `alt`/`aria`. | Corrige une belief répandue : l'accessibilité n'est **pas** couverte par un test aujourd'hui. Elle doit être **démontrée** en V5 (audit + test/contrôle minimal), pas supposée verte. Voir CA-V5-043 et CA-V5-117. |
| **F14** | « `npm test` lit `DATABASE_URL` du `.env` (base `revends`) et `resetDatabaseAndSeed()` fait `DROP SCHEMA public CASCADE` → chaque run efface la base de dev » (signalé par `@architecte`, `architecture-v5.md` §10 `D8tests`) | **REPRODUIT le 29/09/2026, pas seulement théorisé.** `server/test/env.ts:13` fige la base de test par `process.env.DATABASE_URL ??= '…/revends_test'` : l'opérateur `??=` **ne remplace rien** si la variable est déjà définie. `server/test/bootstrap.ts:61` se connecte alors à `config.databaseUrl` et exécute `DROP SCHEMA IF EXISTS public CASCADE` (`:65`) dessus. **Preuve** : sur une base témoin `revends_probe` contenant la table `produits_utilisateur` (3 lignes), un run de `test/catalog.test.ts` avec `DATABASE_URL` pointant sur cette base a rendu **19/19 verts** tout en **détruisant** `produits_utilisateur` et en la remplaçant par le schéma des migrations (14 tables). La base de développement `revends` a été **vérifiée intacte** après l'expérience (13 tables, 226 produits). Le garde `??=` protège donc **uniquement** le cas où aucun `DATABASE_URL` n'est présent dans l'environnement : il est **inopérant** dès qu'un shell, un CI ou un chargeur de `.env` définit la variable. | **Bug de criticité maximale** (destruction silencieuse de données de développement). Arbitrage **PO-V5-13**. Corrigé par CA-V5-126/127, pas par un commentaire. La table dédiée `revends_test` **existe déjà** et n'est simplement pas garantie. |
| **F15** | « la palette REVENDS 2026 » (direction artistique utilisateur) | **Zéro recouvrement** avec la palette en place. Tokens réels (`web/src/index.css:9-27`) : `--color-primary: #ff6b35` (orange vif), `--color-ink: #1a1a2e` (bleu nuit), `--color-secondary: #004e89` (bleu), `--color-bg: #f7f7f7` (gris), plus 6 teintes `soft-*`, `--color-purple-icon: #9333ea`, `--color-amber-deep: #d97706`. Aucun de ces codes n'appartient à la palette REVENDS 2026 (`#171513` / `#F7F3EC` / `#FFFFFF` / `#DCC8A8` / `#3A2923` / `#C85A2A`). `--font-sans` est un **pile système** (`"Segoe UI", Tahoma, …`, `index.css:37`) : ni Inter, ni Manrope, ni Plus Jakarta Sans, ni serif éditorial. | US-V5-09 n'est pas un **ajout** de tokens mais un **remplacement** de la marque. Le §2.2 (« refonte accueil/recherche/catégorie/fiche produit hors périmètre ») est **affecté** → conflit **CF-01**, tranché en tête de §5.9. |
| **F16** | « les 8 filtres du catalogue » et « les 4 tris » | Filtres **réellement** exposés par l'API (`server/src/utils/validation.ts:265-274`) : `q`, `categoryId`/`subcategory_id`, `price_min`/`price_max`, `condition`, `location`, `brand` → **6 familles**, pas 8 : **taille, couleur et date n'existent pas**. Tris : `catalogSorts = ['recent','price_asc','price_desc','popular']` (`validation.ts:246`) → **4 valeurs**, mais **pas de « Pertinence »**. | US-V5-09 exige **3 nouveaux filtres + 1 nouveau tri**, donc une **addition de contrat API** — ce que §2.2 et P5 excluent aujourd'hui. Conflit **CF-02**, tranché en tête de §5.9. |
| **F17** | « navbar Accueil/Découvrir/Catégories/Nouveautés/Vendre », « bottom nav Favoris », « recherche à suggestions » | Aucun des deux écrans **Découvrir** et **Favoris** n'existe : `web/src/App.tsx:53-86` déclare 27 routes et **aucune** `/decouvrir` ni `/favoris`. Le footer renvoie vers `/search` et `/panier`, pas vers « Découvrir ». La recherche est un `input` + bouton (`Navbar.tsx:70-80`), **zéro** suggestion : `grep -rn "suggest\|autocomplete" web/src/` ne retourne aucun composant (le seul `suggestion` du dépôt est le bloc « produits similaires » de `ProductPage.tsx:140`). | 2 écrans publics + 1 overlay de suggestions sont **à créer** (nouveau contrat pour les suggestions). Volatile mais **borné** : ces écrans sont listés dans l'inventaire des 50 écrans, §5.9.6. |
| **F18** | « panier/checkout **4 étapes**, création d'annonce **5 étapes** » | `web/src/pages/CheckoutPage.tsx` et `web/src/pages/SellPage.tsx` sont des pages **à flux unique** : `grep -n "step\|Étape" ` ne retourne **aucune** occurrence dans les deux fichiers. | La décomposition en étapes est un **travail de refonte d'écran**, pas un simple ajustement cosmétique. Elle touche deux écrans du périmètre de non-régression C8 (panier, vente) → les parcours doivent être prouvés inchangés (CA-V5-148). |

---

### 3.5 Arbitrages de conception du chef de projet (28→29/09/2026) — **PRIME sur §3.3 et sur `docs/architecture-v5.md` §10**

> **Numérotation — avertissement de lecture (collision réelle).** Les six décisions ci-dessous portent, dans les documents amont, des étiquettes `D1`, `D5`, `D6`, `D7`, `D8tests`, `D8-perf` qui **entrent en collision** avec deux séries déjà vivantes :
> - la série **`D1`→`D11` du §3.3** ci-dessus (décisions du rédacteur) — `D1` y signifie « `deleted_at` orthogonale à `status` », `D5` « enum `article_deleted` », `D6` « le lien Supprimer vit sur la page Articles », `D7` « `DELETE /api/admin/products/:id` », `D8` « le rate limit est monté sur `/api` seulement ». **Ces définitions sont inchangées et ne sont pas renumérotées** ;
> - la série **`D1`→`D8` de `docs/architecture-v5.md` §10** (points ouverts de `@architecte`), qui est la source de ces six décisions — et qui contient elle-même un **défaut de numérotation** : **`D8` y désigne deux sujets différents** (les tests qui ciblent la base de dev, et le rate limit en mémoire).
>
> **Règle de numérotation retenue dans le présent cahier** : les six décisions sont enregistrées dans la **série `PO-V5-xx`** (§7), poursuivie à partir de `PO-V5-12`. La colonne « Étiquette amont » ci-dessous fait le lien bidirectionnel. Aucun renumérotage des séries existantes : la traçabilité prime sur l'esthétique de la numérotation.

| # | Étiquette amont | Sujet | Arbitrage **ACTÉ** | Effet normatif | Critères |
|---|---|---|---|---|---|
| **PO-V5-12** | `D1` — `architecture-v5.md` §2.4 | Ordre de déploiement de la migration `009` vs. le code C4 | ✅ **Variante A actée** : Railway/Render applique les migrations **au démarrage du nouveau code** → C4 est actif **avant** `009` → ordre sûr. Les 6 index produits de `009` portent le prédicat `deleted_at IS NULL`. **Contrainte écrite et opposable** : ne **jamais** appliquer `009` (section 3, index) sur un environnement qui sert encore le code pré-C4 — régression mesurée **×106** sur le catalogue (0,205 ms → 22,564 ms, 1 881 pages lues) et **×35** sur la file de modération (0,471 ms → 16,579 ms). Repli documenté si l'ordre change : appliquer `009` **sans sa section 3**, déployer C4, puis rejouer la section 3. | §5.4 / §5.5 | CA-V5-143, 144, 145 |
| **PO-V5-13** | `D8tests` — `architecture-v5.md` §10 (**bug critique**) | `npm test` cible la base de **développement** | ✅ **Acté : les tests doivent pointer sur `revends_test`, jamais sur la base dev.** Constat **reproduit** (§3.4 F14) : `server/test/env.ts:13` utilise `??=`, qui **cède la main** à tout `DATABASE_URL` déjà présent dans l'environnement ; `server/test/bootstrap.ts:61` fait alors `DROP SCHEMA public CASCADE` sur `config.databaseUrl` — **la base de développement est effacée à chaque run**. Le garde `??=` est un garde **mou** : il ne protège que si rien n'a défini la variable. | §5.7 | CA-V5-126, 127 |
| **PO-V5-14** | `D5` — `architecture-v5.md` §10 | 9ᵉ déclencheur email « réservation expirée » | ✅ **Acté : oui**, la réservation expirée déclenche des emails **acheteur + vendeur**. Bascule de **10 → 11 envois** pour **9 déclencheurs** (l'événement 4 « commande payée » et l'événement « réservation expirée » ont chacun 2 destinataires). **Bornes fermes** : (a) **aucune notification in-app nouvelle** — `releaseExpiredReservation` continue de notifier **l'acheteur seul** (`expiry.service.ts:42`), sinon CA-V5-010 est violé ; (b) l'envoi reste **après COMMIT** (P8) ; (c) la **libération de réservation** et le statut `PAYMENT_FAILED` sont inchangés (CA-V5-106, CA-V5-096). | §5.1 | CA-V5-004 *(mis à jour)*, CA-V5-126 |
| **PO-V5-15** | `D6` — `architecture-v5.md` §10 | Champ `hasActiveOrder` sur le sérialiseur produit admin | ✅ **Acté : oui**, champ **additif** dans la vue produit admin. But : permettre de **désactiver l'action « Supprimer » sans requête par ligne** (RG-V5-08 : pas de bouton qui ne peut pas être exécuté), en supprimant le N+1 que `AdminArticlesPage` réintroduirait. Contraintes : **strictement additif** (P5 : `GET /api/admin/products` garde la forme de sa charge utile, tous les autres champs inchangés) et **ininterrogé** sur le reste des endpoints. | §5.4 / §5.5 | CA-V5-065 *(complété)*, CA-V5-071, 072, 074 |
| **PO-V5-16** | `D7` — `architecture-v5.md` §10 | Dette `sales: 0` | ✅ **Acté : hors périmètre V5**, ticket de dette documenté en §5.10 « Dette connue », **comportement conservé**. Rappel : `getPublicProduct` (`products.service.ts:434-438`) expose `seller.sales` ; le test `server/test/unit-utils.test.ts:47` fige ce comportement et CA-V5-074 interdit toute modification de charge utile. **Réserve explicite** : ce `COUNT(*)` lit `products` sans `deleted_at IS NULL` — voir le **conflit CF-03** en tête de §5.9 et l'exemption nommée inscrite dans CA-V5-063. | §5.7, §5.10 | CA-V5-063 *(amendé)*, 074, **CA-V5-210** |
| **PO-V5-17** | `D8-perf` — `architecture-v5.md` §10 (**libellé `D8` en doublon**) | Rate limit en mémoire, non partagé entre instances | ✅ **Acté : documenté, accepté pour 1 instance.** `middleware/rate-limit.ts` utilise un `Map` par instance (aucune dépendance Redis : vérifié, `server/package.json` n'en déclare aucune). Le limiteur d'auth et le limiteur global ont des `Map` **séparés** → c'est le plus strict qui s'applique, sans collision de clés. **Condition de bascule** : toute mise à l'échelle horizontale (2 instances ou plus) **exige** un compteur partagé (Redis) **avant** mise en production, sinon la limite de 300 req/min/IP devient partiellement inopérante. | §5.5 | CA-V5-084 *(complété)*, 146 |

---

## 4. Principes directeurs (transverses, opposables)

| # | Principe | Effet |
|---|---|---|
| **P1** | **Aucun style arbitraire** | Toute couleur, ombre, rayon et espacement provient d'un token (`index.css` `@theme`, classes `.card` / `.field-input`) ou d'un composant de `components/ui/`. Zéro `style={{…}}` métier, zéro `bg-[#…]`, zéro `shadow-[…]`. |
| **P2** | **Toute classe Tailwind utilisée existe** | Une classe qui ne correspond à aucun token/variant ne produit aucun style : c'est un bug silencieux. Vérifiable automatiquement (CA-V5-047). |
| **P3** | **TypeScript strict, zéro `any` sauvage** | `any` interdit hors cast de test et sérialisation de charge utile contrôlée. Les `unknown` sont réduits, pas propagés. |
| **P4** | **Zéro duplication** | Un comportement d'interface utilisé par ≥ 2 écrans vit dans un composant partagé. |
| **P5** | **Rétrocompatibilité stricte** | Toute optimisation C5 conserve la forme des réponses, les bornes et les codes d'erreur. Toute fonction modifiée garde sa sémantique (ARB-V5-09). |
| **P6** | **La preuve prime sur l'intention** | Un critère n'est validé que sur test vert, audit `fichier:ligne`, ou mesure exécutable reproductible. |
| **P7** | **Aucun 5xx sur entrée hostile** | Toute entrée invalide, tronquée, surdimensionnée ou hostile produit un 4xx documenté. Jamais de 500, jamais de fuite de pile d'appels. |
| **P8** | **Une transaction, une réalité** | Aucun effet observable ne doit exister si la transaction est annulée — y compris l'envoi d'un email (contrainte structurante de C1, CA-V5-003). |

---

## 5. User stories et critères d'acceptation

**Format.** *En tant que …, je veux …, afin de …* — puis des `CA-V5-xxx` binaires.
**Total : 9 user stories · 210 critères d'acceptation** (`CA-V5-001` → `CA-V5-210`, numérotation continue ; voir Annexe B).

---

### 5.1 US-V5-01 — Emails transactionnels (C1)

> **US-V5-01** — *En tant qu'utilisateur de ReVends, je veux recevoir un e-mail aux moments importants de mon activité (inscription, publication, commande, livraison, paiement), afin d'être informé même quand je ne consulte pas le site.*
>
> *En tant que plateforme, je veux que l'envoi d'e-mail ne puisse jamais faire échouer une action métier déjà validée, afin de préserver la disponibilité du service.*

**Portée fonctionnelle — les 6 emails et leur point de déclenchement réel (vérifié dans le code)**

| # | Email | Destinataire | Point de déclenchement existant à instrumenter |
|---|---|---|---|
| E1 | Bienvenue | nouvel inscrit | `routes/auth.routes.ts` (route `register`) — **nouveau** point d'accroche, aucun `insertNotification` aujourd'hui |
| E2 | Article approuvé | vendeur | `services/admin.service.ts:172` (`article_approved`) |
| E3 | Article refusé (motif inclus) | vendeur | `services/admin.service.ts:188` (`article_rejected`) |
| E4 | Commande payée — votre paiement est confirmé | acheteur | `services/admin.service.ts:276` (`payment_confirmed`) |
| E5 | Commande payée — l'acheteur a payé, préparez l'article | vendeur | `services/admin.service.ts:277` (`order_product_waiting`) |
| E6 | Votre colis est prêt | acheteur | `services/admin.service.ts:326` (`order_shipped`) |
| E7 | Votre commande est livrée | acheteur | `services/admin.service.ts:385` (`order_delivered`) |
| E8 | Votre paiement vendeur est disponible | vendeur | `services/admin.service.ts:386` (`order_completed`) |
| E9 | Votre paiement vendeur a été versé | vendeur | `services/admin.service.ts:458` (`seller_paid`) |
| E10 | Votre réservation a expiré | partie réservée | `services/expiry.service.ts:42` (`reservation_expired`) |

> E1→E10 = les **6 emails métier** de l'ARB-V5-01, déclinés en **11 envois** après PO-V5-14 (certains événements notifient deux destinataires, ou deux moments distincts : paiement vendeur *disponible* puis *versé* ; réservation expirée *acheteur* puis *vendeur*).

- **CA-V5-001** `[AUDIT]` Une **unique** interface d'envoi de courriel existe côté serveur (ex. `Mailer` avec une méthode d'envoi typée) et **tout** le code applicatif passe par elle. `grep -rn "createTransport\|nodemailer\|sendgrid\|mailgun" server/src/` ne retourne **que** ce fichier d'interface. Aucun envoi direct depuis un service métier. *(Emplacement proposé, **à créer** — le cahier n'impose pas ce nom de fichier : une seule interface d'envoi suffit.)*
- **CA-V5-002** `[TEST]` Un test d'exception simule un échec d'envoi (transporteur qui rejette) : la **notification in-app** correspondante est **bien créée** et l'endpoint répond **2xx**. Un échec de messagerie ne produit **jamais** de 4xx/5xx. (Principe P8.)
- **CA-V5-003** `[EXEC]` L'envoi est déclenché **après** le commit de la transaction métier. Preuve : une transaction métier annulée (rollback) **n'envoie aucun** email, alors que la même transaction validée en envoie un. Test automatisé sur au moins E2 (approbation) et E9 (paiement vendeur).
- **CA-V5-004** `[TEST]` Les **11 envois** des 9 déclencheurs E1→E10 sont couverts par **un test chacun**, déclenché par l'endpoint réel (pas par un appel direct au mailer), avec assertion sur le destinataire, l'objet et la présence du contenu attendu. **PO-V5-14** : l'événement « réservation expirée » (E10) produit **deux** envois distincts — **acheteur** et **vendeur** — ; l'événement « commande payée » reste **deux** envois (E4 acheteur, E5 vendeur). Aucune notification in-app supplémentaire n'est créée pour le vendeur (CA-V5-010).
- **CA-V5-005** `[EXEC]` En développement et en test, l'envoi est **écrit sur la sortie console** et n'est **jamais** tenté vers un SMTP réel ; l'absence de configuration SMTP en dev **ne provoque aucune erreur au démarrage** (le serveur démarre, `GET /api/health` répond 200 sans aucune variable mail configurée).
- **CA-V5-006** `[EXEC]` En production, l'envoi utilise un transport SMTP configuré **exclusivement** par variables d'environnement. Variables minimales déclarées et validées au démarrage : hôte, port, utilisateur, mot de passe, adresse d'expédition (`FROM`), booléen d'activation. Une configuration **invalide en production** provoque un **échec au démarrage explicite** (même logique que `SESSION_SECRET` en `config.ts:53-70`), et non un échec silencieux par e-mail.
- **CA-V5-007** `[AUDIT]` Chaque email existe en **deux** versions : **HTML** (balisage simple et valide, mise en page de base, pas de CSS externe, pas d'image distante, pas de script) et **texte brut** (contenu équivalent, aucun balisage). Chaque message déclare un sujet non vide et une adresse d'expédition de la plateforme.
- **CA-V5-008** `[AUDIT]` **Aucune donnée sensible** dans les 10 emails. Interdits : mot de passe, hash, jeton de session, numéro de téléphone (RG-ORD-6), adresse postale, nom complet privé (`users.name`, `001_init.sql:26`), contenu libre saisi par un tiers. Autorisés : identifiant de commande, nom du produit, montants en FCFA, statut, lien vers une page du site. *Vérification : revue de chaque template par `@tester` sur la liste ci-dessus.*
- **CA-V5-009** `[AUDIT]` Aucun email ne contient d'adresse email d'un **tiers** (autre que le destinataire) ni de lien de désinscription factice. Le seul lien sortant est un lien **interne** vers une page du site.
- **CA-V5-010** `[TEST]` **Les notifications in-app sont inchangées.** Le nombre de notifications créées par les événements E2→E10 est **strictement identique** avant/après V5 (référence : `server/test/notifications.test.ts` + `server/test/order-cycle-v3.test.ts`, tous verts) et **aucune** notification existante n'est supprimée, renommée ou retypée. (Application directe d'ARB-V5-01 : les deux canaux coexistent.)
- **CA-V5-011** `[AUDIT]` Le destinataire est résolu **par identifiant utilisateur** depuis la base, à l'intérieur de la transaction métier — pas depuis un corps de requête, pas depuis une donnée client. Aucune adresse email n'est acceptée en entrée d'API pour déclencher un envoi → **aucun vecteur d'envoi d'email arbitraire** (anti-spam).
- **CA-V5-012** `[TEST]` Cas limite d'adresse email : `email` est `NOT NULL UNIQUE` (`001_init.sql:27`), donc l'envoi ne peut pas être déclenché pour un compte sans adresse. En revanche, si le compte disparaît entre la résolution et l'envoi, l'envoi est **ignoré et journalisé** et l'action métier **réussit** — aucun crash, aucun 5xx.
- **CA-V5-013** `[EXEC]` Le mode développement journalise pour chaque envoi : **type d'événement**, **id utilisateur destinataire**, **sujet**, **transporteur** utilisé — **jamais** le corps complet du message ni le mot de passe SMTP. (RG-V5-13.)
- **CA-V5-014** `[EXEC]` L'envoi n'introduit **aucun** temps mort perceptible : le p95 des endpoints déclencheurs (`/api/auth/register`, `/api/admin/products/:id/approve`, `/api/admin/orders/:id/confirm-payment`, …) **ne dégrade pas de plus de 15 %** par rapport à la mesure de référence (protocole §9, comparaison avant/après sur la même base de 50 000 produits).
- **CA-V5-015** `[TEST]` En `NODE_ENV=test`, la gestion des emails est **neutre** : aucun réseau, aucun SMTP, aucun accès disque ; les tests existants (`server/test/*.test.ts`) ne sont **pas** ralentis de plus de 10 % et restent verts. (Le contournement du rate limit en test, `rate-limit.ts:15-17`, fournit le précédent.)
- **CA-V5-016** `[AUDIT]` Une **variable d'environnement dédiée** active/désactive l'envoi (ex. `MAIL_ENABLED`). En production sans configuration valide, le serveur **refuse de démarrer** (CA-V5-006) ; en développement, il démarre et journalise. Ce commutateur est **le seul** moyen de couper la messagerie — aucun `if (process.env.NODE_ENV === 'test')` dispersé dans le code métier.
- **CA-V5-017** `[EXEC]` `docs/api.md` est mis à jour : le contrat mentionne les emails comme **canal additionnel** et précise qu'**aucun endpoint** n'a été ajouté, modifié ou retiré pour C1. Le diff du contrat est **limité à la documentation** (pas de changement de forme de réponse).
- **CA-V5-018** `[TEST]` Chaque email est **injection-safe** : un nom de produit ou un numéro de commande contenant `<script>`, `"`, `'` ou une chaîne de 1 000 caractères est rendu sans exécution, sans casser le HTML (validé) et sans erreur 5xx. (Principe P7.)

---

### 5.2 US-V5-02 — RBAC durci : un `user` n'accède pas à l'interface admin (C2)

> **US-V5-02** — *En tant qu'administrateur, je veux que l'espace d'administration soit strictement réservé à mon rôle, afin qu'aucun utilisateur ne puisse consulter ni altérer les données de modération.*
>
> *En tant qu'utilisateur, je veux être redirigé proprement si je saisis par erreur une adresse d'administration, afin de ne pas avoir l'impression d'être bloqué ou d'y avoir accès.*

**État vérifié avant rédaction (F3)** — le backend est **déjà conforme** (`admin.routes.ts:39` : `adminRouter.use(requireAdmin)` ; `requireUser` exclut l'admin → 403, `middleware/auth.ts:38-45` ; `requireAdmin` refuse le non-admin → 403, `:48-55`). Le travail porte donc sur le **verrou par test** (pour qu'une régression future soit détectée) et sur le **confort front**.

- **CA-V5-019** `[TEST]` **Test paramétré couvrant les 18 routes `/api/admin/*`** déclarées dans `routes/admin.routes.ts:42-148` (`stats` GET ; `categories` GET ; `categories` PATCH ; `products` GET ; `products/:id/approve` ; `products/:id/reject` ; `orders` GET ; `orders/:id` GET ; `confirm-payment` ; `mark-product-received` ; `mark-shipped` ; `start-delivery` ; `mark-delivered` ; `cancel` ; `seller-payout` ; `pay-seller` ; `users` GET ; `history` GET). Pour **chacune**, les trois cas sont assertés :
  1. **sans session** → `401` + `error.code = "UNAUTHENTICATED"` ;
  2. **session `user`** → `403` + `error.code = "FORBIDDEN"` ;
  3. **session `admin`** → **jamais** `401`/`403` (statut métier attendu : `200`/`201`/`204`/`404`/`409`/`410` selon la route et ses préconditions).
- **CA-V5-020** `[TEST]` Le test de CA-V5-019 est **paramétré** (table de routes, boucle ou `it` généré) : **pas** de 18 blocs manuels. L'ajout d'une route admin sans cas de test doit être détectable — le test échoue si une route déclarée dans `admin.routes.ts` n'est pas couverte (comparaison automatique route déclarée ↔ route testée).
- **CA-V5-021** `[TEST]` Le corps d'erreur d'un `401`/`403` admin **ne contient** aucun nom de colonne, aucun nom de table, aucun identifiant produit/utilisateur, et **aucune** pile d'appels. (RG-V5-15.)
- **CA-V5-022** `[TEST]` Cas de **session invalide** : une session dont `userId` pointe vers un utilisateur supprimé est traitée comme non connecté → `401` (comportement existant `middleware/auth.ts:27-32`), y compris sur les routes admin. Non-régression de ce cas.
- **CA-V5-023** `[TEST]` Une session `user` **ne peut pas** atteindre les données admin par un chemin indirect : `GET /api/orders/:id` avec un rôle `user` ne renvoie jamais la vue administrateur (réservée au rôle `admin`, `orders.service.ts:336-338`) et un tiers non partie d'une commande obtient `404` (non-divulgation, `:342`). Ces deux cas sont assertés.
- **CA-V5-024** `[TEST]` `requireUser` reste strict : un **admin** qui appelle une route `user` (`POST /api/products`, `PUT /api/products/:id`, `POST /api/checkout`, `GET /api/me/orders`, …) obtient `403 FORBIDDEN`. Non-régression du comportement existant (`middleware/auth.ts:41-43`).
- **CA-V5-025** `[AUDIT]` `RequireAdmin` (`components/auth/RouteGuards.tsx:48-56`) applique **exactement** les trois cas de l'ARB-V5-02 : `loading` → page de chargement ; **anonyme** → redirection `/login` (avec conservation de la destination, forme `?next=…` ou équivalent) ; **rôle ≠ admin** → **redirection vers `/`**, et **plus** l'affichage de `ForbiddenPage`. Le composant `ForbiddenPage` (`RouteGuards.tsx:7-25`) n'est **plus** rendu par `RequireAdmin`.
- **CA-V5-026** `[AUDIT]` Le lien « Admin » de la navbar reste conditionné au rôle : `Navbar.tsx:130` (`user && user.role === 'admin' ? … : …`). **Zéro régression** (F3) — vérifié par relecture **et** par test automatisé du composant de navigation (utilisateur non-admin ⇒ aucun nœud dont la cible est `/admin`).
- **CA-V5-027** `[AUDIT]` `adminMenu` (`lib/menus.ts:6-17`) n'est importé et rendu **que** par les 9 pages de `pages/admin/*` via `DashboardLayout` (`DashboardLayout.tsx:16-20`). `grep -rn "adminMenu" web/src/` ne retourne **aucune** occurrence hors `pages/admin/`. Aucun menu, drawer, footer ou lien contextuel n'expose une entrée `/admin/*` à un non-admin.
- **CA-V5-028** `[TEST]` Les 9 routes `/admin/*` de `App.tsx:76-84` sont testées côté navigation pour les 3 rôles : **anonyme** → URL `/login` (jamais `/admin` affiché) ; **`user`** → URL `/` ; **`admin`** → la page s'affiche. **Aucune** des 27 combinaisons ne produit d'écran blanc, de boucle de redirection (navigation bornée à 10 sauts) ni d'erreur console.
- **CA-V5-029** `[TEST]` Un `user` ne peut **pas** atteindre un écran admin par **navigation programmatique** (route déclarée directement, `navigate('/admin')`, URL collée avec échappements) : le rendu obtenu est l'accueil, et **aucune** requête vers `/api/admin/*` n'est émise par le front pour un non-admin. Le test compte les requêtes réseau. (D10.)
- **CA-V5-030** `[EXEC]` Le taux de réponses `403 FORBIDDEN` dues à une tentative admin par un `user` sur l'API de production est **suivi** (journal structuré minimal, RG-V5-13) : toute augmentation anormale est un signal d'alerte. Critère de **télémétrie**, sans impact sur le parcours utilisateur.

---

### 5.3 US-V5-03 — Refonte de l'interface administration (C3)

> **US-V5-03** — *En tant qu'administrateur, je veux un back-office homogène, professionnel et rapide à parcourir, afin de traiter les articles, commandes et paiements sans jongler entre des écrans incohérents.*
>
> *En tant que plateforme, je veux que les écrans d'administration respectent le design system, afin que la qualité perçue de ReVends soit la même partout.*

**Dette relevée et vérifiée dans le code (F2, F6, F7, F8, F10)**

| # | Écart | Preuve |
|---|---|---|
| E1 | Classe Tailwind inexistante `hover:bg-soft-primary` (seule occurrence de tout le front) | `ProductPage.tsx:256` ; `@theme` sans `soft-primary` (`index.css:7-35`) |
| E2 | Ombre arbitraire dupliquant un token existant à l'identique | `ProductPage.tsx:147` ; token `--shadow-card` `index.css:31` |
| E3 | Style inline (padding conditionnel) | `AdminCategoriesPage.tsx:64` |
| E4 | `AdminCategoriesPage` : **ni `Pagination` ni `EmptyState`**, liste rendue d'un bloc, aucun état vide | `AdminCategoriesPage.tsx:95-119` (comparer `AdminUsersPage.tsx:54-58` qui traite les 3 états) |
| E5 | `AdminDashboardPage` : n'expose pas les 8 compteurs par statut déjà livrés par `getStats` ; n'utilise ni `Button` ni `EmptyState` | `AdminDashboardPage.tsx:86-151` ; `admin.service.ts:80-90`, `:100-109` |
| E6 | Convention de carte **mélangée** : `<div className="card">` brut **et** composant `Card` coexistent | 4 pages en `div.card` sans importer `States` ; `States.tsx:44` |
| E7 | Table **dupliquée** dans 6 pages | `table-scroll overflow-x-auto` × 6 ; largeurs `min-w-[…]` toutes différentes |
| E8 | `AdminOrderDetailPage` (563 lignes) : **aucune** classe responsive `max-[…]` | `grep -c "max-\[" ` = **0** |
| E9 | Modale de confirmation ad hoc | 5 pages importent `Modal` mais avec des structures et libellés divergents |

- **CA-V5-031** `[AUDIT]` **E1 corrigé** : `grep -rn "soft-primary" web/src/` ne retourne **aucune** occurrence. Le survol du bouton concerné utilise un **token existant** de `@theme` (`soft-orange`, `soft-info`, …). Le style est **réellement rendu** (vérification visuelle du `:hover`, pas seulement de la classe).
- **CA-V5-032** `[AUDIT]` **E2 corrigé** : `grep -rn "shadow-\[" web/src/` ne retourne **aucune** occurrence ; le rendu utilise un token d'ombre de `@theme` (`shadow-card`, `shadow-soft`, `shadow-hover`, `shadow-nav`, `shadow-floating` — `index.css:31-35`) ou une classe de composant. Le rendu visuel est **identique** à l'existant : pas de régression de design, pas de modification du design system. **Amendement CF-01** : l'identité de rendu est exigée **hors US-V5-09**. Le re-thème REVENDS 2026 (C9) modifie **délibérément** les couleurs, la typographie et la mise en page ; il ne peut donc **pas** être évalué par une comparaison pixel à pixel avec l'existant. Ce qui reste exigé, et qui est vérifiable : **aucune perte de hiérarchie visuelle** (le prix reste l'élément le plus saillant de la fiche, l'état reste identifiable, le CTA principal reste le seul accent fort de la zone) et **aucun** composant rendu sans style (CA-V5-156/159).
- **CA-V5-033** `[AUDIT]` **E3 corrigé** : `grep -rn "style={{" web/src/pages/admin/` ne retourne **aucune** occurrence, et `AdminCategoriesPage.tsx:64` n'existe plus. L'indentation hiérarchique est rendue par **classes** conditionnelles issues d'un espacement existant, ou par un style de liste (ex. ligne de tableau dédiée) — l'information « racine vs sous-catégorie » reste **visible et lisible**.
- **CA-V5-034** `[AUDIT]` **E4 corrigé** : `AdminCategoriesPage` gère les **trois** états comme les 5 pages conformes — chargement (`TableSkeleton`), erreur (`ErrorMessage`), **vide** (`EmptyState` avec message non générique). Aucun cas « succès + 0 résultat » ne rend un tableau vide sans explication.
- **CA-V5-035** `[AUDIT]` **E6 corrigé** : une **seule** convention de carte sur les 9 pages. La classe CSS `.card` (`index.css:134`) **et** le composant `Card` (`States.tsx:44`) ne sont pas utilisés en concurrence sur la même page. Décision documentée dans le code par un commentaire d'en-tête de `States.tsx`. (D11)
- **CA-V5-036** `[AUDIT]` **E7 corrigé** : un **composant table partagé** existe et est utilisé par **les 7 pages à tableau** ; `grep -rln "table-scroll overflow-x-auto" web/src/pages/admin/` ne retourne **qu'une** occurrence (le composant). Le composant gère : l'enveloppe scrollable, l'accessibilité (`aria-label` ou `<caption class="sr-only">` sur `<table>`), les en-têtes de colonne et la classe de largeur minimale. Aucun `min-w-[…]` divergent entre pages. (D11)
- **CA-V5-037** `[AUDIT]` **E9 corrigé** : les modales d'action (renommer une catégorie, confirmer un paiement, payer un vendeur, annuler une commande, **supprimer un produit**) passent par **un** composant de confirmation partagé, avec libellé d'action explicite et libellé du danger **cohérent** (le mot « Supprimer » n'est pas employé pour « Désactiver », et réciproquement).
- **CA-V5-038** `[EXEC]` **E8 corrigé** : les 9 pages admin sont **utilisables sans débordement horizontal** à **1024 px** et à **1280 px** de largeur (débordement = `document.documentElement.scrollWidth > clientWidth`), avec **au moins** un contenu de table à 5 colonnes. En dessous de 1024 px, le comportement est celui du `DashboardLayout` existant (`max-[968px]` → colonne unique + drawer) : aucune page ne devient inaccessible ni illisible.
- **CA-V5-039** `[AUDIT]` **E5 — tableau de bord.** `AdminDashboardPage` affiche :
  1. les **4** compteurs principaux existants (utilisateurs, articles en attente, commandes actives, paiements à payer) via le composant `StatCard` partagé, de **dimensions homogènes** (hauteur identique à ± 2 px dans la même rangée) ;
  2. les **8** compteurs par statut de commande **déjà fournis par l'API** (`getStats().orders` — `paymentPending`, `productWaiting`, `productReceived`, `preparing`, `shipped`, `inDelivery`, `delivered`, `completed` ; `admin.service.ts:100-109`) sous forme de **vue synthétique** (progression ou grille de pastilles), **sans** aucune requête réseau supplémentaire ;
  3. des **actions rapides** cliquables vers les écrans concernés, avec compteurs ;
  4. un **état vide** explicite quand tous les compteurs sont à 0 (« Tout est à jour »), et non 8 zéros nus.
- **CA-V5-040** `[AUDIT]` Le tableau de bord consomme **au moins 4** des composants partagés existants (`StatCard`, `Button`, `StatusBadge`, `Card`/`CardHeader`) et n'implémente plus de liste d'actions en `<div>` + `<Link>` artisanaux. Toute interaction du tableau de bord passe par un composant de `components/ui/`.
- **CA-V5-041** `[AUDIT]` `AdminUsersPage` conserve son comportement **en lecture seule** (F6 : aucun endpoint d'écriture n'existe, §2.2) mais adopte la convention de composants partagés des 8 autres pages (table partagée, `EmptyState`, `Pagination`, skeleton). Elle ne reçoit **pas** d'action `Button` artificielle.
- **CA-V5-042** `[EXEC]` Les 9 pages se chargent en moins de **1,5 s** (p95, cache navigateur froid) sur le jeu de recette, avec **zéro** erreur console de niveau `error` et **zéro** requête 4xx/5xx **inattendue** sur les 9 routes, en tant qu'admin. (Une requête 4xx doit être **attendue** — ex. 404 sur un détail inexistant.)
- **CA-V5-043** `[AUDIT]` **Accessibilité des écrans admin** : chaque tableau a un titre accessible ; chaque bouton icône a un `aria-label` explicite (« Supprimer l'article de <nom> ») ; chaque état de chargement a un libellé ; le focus clavier est visible sur **tous** les éléments interactifs ; la navigation clavier atteint la modale et en sort (`Échap` ferme, le focus revient au déclencheur).
- **CA-V5-044** `[AUDIT]` Les libellés **français** et les **formats** existants sont conservés à l'identique : `formatFcfa` pour les montants, `formatDate` pour les dates, statuts via `StatusBadge` (un seul libellé par statut), aucune nouvelle abréviation ni traduction automatique. (Non-régression de cohérence avec le front public.)
- **CA-V5-045** `[EXEC]` **Uniformité visuelle** : capture d'écran de chacune des 9 pages, mise en grille, revue conjointe `@frontend` + `@cahier-des-charges` : alignements de titre, marges de bloc, hauteur de ligne de tableau, rayon de carte et intensité d'ombre **identiques** d'une page à l'autre pour des éléments de même rôle. Toute divergence validée doit être **justifiée** dans le code. **Amendement CF-01** : ce critère s'applique **aux 9 écrans admin**, dont le style **reste** celui de l'existant — C9 ne re-thème **pas** l'admin au-delà du remplacement des tokens de couleur (l'admin consomme les mêmes tokens que le site public, CA-V5-152).
- **CA-V5-046** `[AUDIT]` Le style global de l'admin est résumé dans **une** section de `docs/design-system.md` (ou d'un addendum V5) : tokens utilisés, composants requis par écran, conventions de table, de modale et d'état vide. Cette documentation **précède** la recette et sert de référentiel à CA-V5-045.
- **CA-V5-047** `[TEST]` L'absence de `soft-primary` et de `shadow-[…]` est **protégée par un test automatisé** (pas seulement par une relecture) : un test lit les fichiers de `web/src/` et échoue si une classe hors tokens ou un `style={{` métier est détecté. Liste blanche éventuelle **explicite et justifiée en commentaire** (≤ 5 entrées).
- **CA-V5-048** `[EXEC]` Le lien « Supprimer » (C4) apparaît sur la **page Articles** (`AdminArticlesPage`) et **seulement** elle (arbitrage D6). La page de modération « Articles en attente » conserve son flux actuel (approuver / refuser) **inchangé**.

---

### 5.4 US-V5-04 — Cycle de vie produit et suppression administrateur uniquement (C4)

> **US-V5-04** — *En tant qu'administrateur, je veux pouvoir retirer définitivement un produit du catalogue, afin de répondre à une annonce frauduleuse, doublon ou litigieuse.*
>
> *En tant qu'acheteur, je veux que les produits hors marché ne m'apparaissent plus, afin de ne pas perdre de temps ni être induit en erreur.*
>
> *En tant que vendeur, je veux être informé si mon article est retiré, et pouvoir toujours vendre ensuite, afin de ne pas être bloqué ni laissé dans le silence.*

- **CA-V5-049** `[TEST]` **Catalogue = `AVAILABLE` uniquement.** `GET /api/products` (et ses variantes `section` / `sort` / `ids` / `q`) ne retourne **jamais** un produit `PENDING`, `REJECTED`, `RESERVED` ni `SOLD`. Vérifié sur les 4 statuts non `AVAILABLE` × les 6 sections × les 4 tris. Le filtre existe déjà (`products.service.ts:285`) : le critère est un **verrou de non-régression**.
- **CA-V5-050** `[TEST]` **Fiche publique d'un produit `RESERVED` : visible.** `GET /api/products/:slug` sur un produit `RESERVED` **non expiré** répond `200` avec la fiche complète. Une **réservation expirée** est libérée paresseusement **avant** la réponse et la fiche répond alors `200` en `AVAILABLE` (comportement existant, `products.service.ts:415-419` — non régressé).
- **CA-V5-051** `[TEST]` **Produit `SOLD` : invisible publiquement.** `GET /api/products/:slug` sur un produit `SOLD` répond `404 PRODUCT_NOT_FOUND` (le produit **sort des listes**, CA-V5-049) et son slug **n'apparaît dans aucun** résultat de `GET /api/products`, avec ou sans `q`. Non-régression du comportement existant.
- **CA-V5-052** `[TEST]` **Verrou de-cycle** : la matrice statut ↔ visibilité est assertée dans un **test de table unique** couvrant les 5 statuts × 3 surfaces (catalogue, recherche `q`, fiche publique) × 2 rôles (anonyme, `user`). Toute évolution future de la matrice casse ce test au lieu d'être découverte en production.
- **CA-V5-053** `[EXEC]` **Migration 009** — une **nouvelle** migration `server/migrations/009_*.sql` (jamais d'édition de `001_init.sql` ni de `008_accueil_v3.sql`) ajoutant :
  1. `products.deleted_at TIMESTAMPTZ NULL` (aucun `NOT NULL`, aucun `DEFAULT` non nul) ;
  2. la valeur d'énumération `'article_deleted'` sur `notification_type` (D5), avec la syntaxe idempotente `IF NOT EXISTS` déjà utilisée par `008_accueil_v3.sql:84`.

  La migration est **idempotente** (rejouable sans erreur) et s'applique sur une base déjà peuplée.
- **CA-V5-054** `[TEST]` **Retrait du DELETE vendeur.** `DELETE /api/products/:id` **n'existe plus** pour un `user` : la réponse est `404` + `NOT_FOUND` (route retirée) — et **jamais** `403`, `405` ou `500`. Vérifié pour un produit **dont l'utilisateur est le propriétaire** comme pour un produit qui ne lui appartient pas. Aucun `requireUser` ne subsiste sur cette route dans `products.routes.ts`. **Les 4 tests existants sont réécrits, pas supprimés** (F5) : `sell.test.ts:231`, `:243`, `:248`, `:262` sont re-paramétrés pour asserter `404 NOT_FOUND` (y compris le cas propriétaire et le cas intrusion), le compte de tests serveur reste donc **inchangé** du fait de C4 (contrairement à C6, CA-V5-102).
- **CA-V5-055** `[TEST]` **Aucun `deleteProduct` côté front.** `api.deleteProduct` (`lib/api.ts:198-200`) est supprimé ; `MyArticlesPage` ne propose **plus** l'action « Supprimer » (bouton, état `toDelete`, mutation, modale de confirmation : `MyArticlesPage.tsx:23`, `:28`, `:108`, `:129-146`) ; `grep -rn "deleteProduct" web/src/` ne retourne **aucune** occurrence. Un test vérifie qu'un vendeur voit la liste de ses articles **sans** action de suppression et **avec** toujours accès à la vente (CA-V5-070).
- **CA-V5-056** `[TEST]` **Endpoint admin de suppression.** `DELETE /api/admin/products/:id` existe, sous `requireAdmin` (donc couvert par CA-V5-019) et :
  - sans session → `401` ; en `user` → `403` ; en `admin` → **204** sans corps ;
  - produit inexistant → `404 PRODUCT_NOT_FOUND` ;
  - **idempotence** : supprimer deux fois le même produit donne `204` puis `204` (jamais d'erreur sur le second appel) ;
  - **idempotence en base** : `UPDATE … SET deleted_at = now()` ne réécrit pas un `deleted_at` déjà renseigné (pas de changement d'horodatage).
- **CA-V5-057** `[TEST]` **Effets immédiats de la suppression** — assertion en base **et** en API, dans la **même** requête de test :
  1. le produit disparaît de `GET /api/products` (toutes sections) ;
  2. il disparaît de `GET /api/products?q=<nom exact>` ;
  3. il disparaît de `GET /api/products?ids=<id>` (enveloppe de réponse inchangée, élément simplement absent) ;
  4. `GET /api/products/:slug` → `404` ; `GET /api/products/:id` → `404` ;
  5. il disparaît de `GET /api/me/products` du vendeur **et** des compteurs renvoyés dans la même réponse ;
  6. il disparaît de `GET /api/admin/products` (tous statuts) et de `total`/`totalPages`.
- **CA-V5-058** `[EXEC]` **Soft delete, pas hard delete.** Vérifiable en base après suppression :
  - la **ligne `products` existe toujours** (`SELECT … FROM products WHERE id = $1` renvoie 1 ligne) ;
  - `deleted_at IS NOT NULL` ;
  - **`status` est inchangé** (D1) : le statut métier d'origine est conservé ;
  - les **lignes `product_images` existent toujours** (aucun `ON DELETE CASCADE` déclenché : `001_init.sql:102`) ;
  - **les fichiers photo sont toujours présents sur le disque** (D2 : aucun `unlink`) ;
  - **les commandes liées sont intactes** : `SELECT COUNT(*) FROM orders WHERE product_id = $1` est **inchangé** avant/après.
- **CA-V5-059** `[TEST]` **Intégrité de l'historique des commandes.** Pour un produit supprimé **ayant** des commandes : le détail de commande est **exactement identique** avant et après la suppression pour les trois parties (acheteur, vendeur, admin) — même produit, même montant, même snapshot, même `events[]`. `GET /api/orders/:id` et `GET /api/admin/orders/:id` ne répondent **pas** `404`. Aucune vue de commande ne référence de champ supprimé.
- **CA-V5-060** `[TEST]` **Notification au vendeur.** La suppression crée **exactement une** notification `type = 'article_deleted'` chez le **propriétaire** du produit, dans la **même transaction** que l'`UPDATE`, avec un titre et un corps exploitables. Aucune notification ni email n'est envoyé aux autres utilisateurs. Si la transaction est annulée, **aucune** notification n'est orpheline (P8).
- **CA-V5-061** `[AUDIT]` **Traçabilité administrateur.** La suppression écrit **une** ligne dans `admin_actions` (D3), avec un `action_type` distinct et une cible `product` : la suppression est **retrouvable et lisible** dans `GET /api/admin/history` sans changer le contrat de cet endpoint. Le filtre `action` existant reste cohérent avec la nouvelle valeur.
- **CA-V5-062** `[TEST]` **Droits du vendeur après suppression.** Le vendeur **ne peut pas** agir sur son produit supprimé : `PUT /api/products/:id` → `404` ; soumission d'un nouveau produit → **201** (le compte n'est pas bloqué) ; la page « Mes articles » et le profil ne plantent pas. Le produit supprimé n'est ni restaurable ni modifiable par le front.
- **CA-V5-063** `[EXEC]` **Aucun accès direct non filtré.** Toute requête applicative lisant `products` applique `deleted_at IS NULL` : catalogue, recherche, sections, `ids`, fiche publique, `me/products`, `admin/products`, recherche admin, jointures de commande et statistiques. Vérifiable par **revue exhaustive** de chaque `FROM products` / `JOIN products` du dépôt, avec la liste complète des points de lecture jointe au compte rendu. *Ce critère est volontairement une revue : un oubli serait silencieux.*
  **Exemptions nommées et bornées (3, aucune autre n'est admise)** — chacune est une décision consciousnesse, pas un oubli :
  1. **Historique de commande** — `orders.service.ts:59` (`loadOrderParts`) et les 6 `JOIN products` d'`admin.service.ts` : filtrer rendrait **inaccessible** une commande historique dont le produit a été supprimé (régression plus grave qu'une lecture non filtrée). Justification `architecture-v5.md` §4.3.
  2. **Verrous d'écriture / préconditions de suppression** (`SELECT … FOR UPDATE`) : le filtre ne doit pas pouvoir contourner le verrou ni exposer l'existence d'un produit supprimé.
  3. **Dette `sales: 0`** (`getPublicProduct`, `products.service.ts:434-438`) — **`PO-V5-16` : hors périmètre V5, comportement conservé**. Ce `COUNT(*)` lit `products` sans `deleted_at IS NULL` : un produit `SOLD` supprimé comptabilise donc dans le badge « N ventes » du vendeur. Le corriger changerait la charge utile de la fiche produit et casserait `server/test/unit-utils.test.ts:47` (CA-V5-074). **Exemption assumée, dont le ticket de dette est **CA-V5-210**** ; elle est **provisoire** et disparaît dès que le ticket est traité. Le compteur `products.deleted_at` de CA-V5-057 et la lecture catégorie A restent, eux, filtrés.
  Toute **quatrième** lecture non filtrée discovered en revue **casse** ce critère.
- **CA-V5-064** `[TEST]` **Pas de hard delete, pas de restauration UI.** `grep -rn "deleted_at = NULL\|undelete\|restore" web/src/ server/src/` ne retourne **aucune** occurrence d'écriture de remise à `NULL`. La réversibilité est **une opération de base**, et la requête exacte de restauration est fournie au compte rendu.
- **CA-V5-065** `[TEST]` **Garde sur produit commandé.** Un produit **porteur d'une commande active** (statut de commande **non terminal** : tout statut qui n'est pas `COMPLETED`, `CANCELLED` ni `PAYMENT_FAILED` — l'enum `order_status` n'a que **6** valeurs, ne pas écrire une liste de 8 statuts inexistants sous peine de `invalid input value for enum` → HTTP 500, cf. F11) ne peut pas être supprimé : `409` avec un code d'erreur explicite ; l'action est **désactivée côté UI** avec un motif affiché (« lié à une commande en cours »). Un produit **dont toutes les commandes sont terminées** (`COMPLETED` / `CANCELLED` / `PAYMENT_FAILED`, ou aucune commande) **peut** être supprimé sans erreur. *Fait établi : l'ancienne garde `PRODUCT_HAS_ORDERS` (`products.service.ts:703-706`) interdisait toute suppression d'un produit commandé ; ce critère définit la nouvelle règle sans casser l'historique.*
  **Alimentation de la désactivation UI (PO-V5-15)** : la vue produit admin porte un champ **additif** `hasActiveOrder: boolean`, calculé côté serveur dans la **même** requête de liste (jamais une requête par ligne). L'UI l'utilise pour activer/désactiver « Supprimer » et afficher le motif. Le champ est **absent** de tous les autres endpoints ; la charge utile de `GET /api/admin/products` est identique à l'existant **plus** ce champ (P5).
- **CA-V5-066** `[TEST]` **Filtre `deleted_at` et mode `ids`.** `GET /api/products?ids=…` conserve son contrat exact (enveloppe `{ items, page, perPage, total, totalPages }`, ordre de la liste préservé, doublons ignorés, produits indisponibles ignorés — `products.service.ts:267-283`) : un produit supprimé est **simplement absent** de `items` et **absent** de `total`, sans erreur et sans champ supplémentaire.
- **CA-V5-067** `[EXEC]` **Performance du filtre.** Sur une base de 50 000 produits dont **5 %** sont supprimés, le catalogue reste sous le seuil de CA-V5-075 (le filtre ne dégrade pas la latence de plus de 15 % par rapport à une base sans produits supprimés). Le plan d'exécution montre que l'index catalogue reste utilisé (`EXPLAIN` consigné au compte rendu).
- **CA-V5-068** `[TEST]` **Migration 009 sur base peuplée.** La migration s'applique sur une base contenant des produits dans les 5 statuts, des commandes, des notifications `article_*` et une enum `notification_type` **contenant déjà** `'product.contact'` (état post-008). Elle réussit, est idempotente (2ᵉ exécution sans erreur) et **préserve** la valeur `'product.contact'` en base (ARB-V5-08).
- **CA-V5-143** `[EXEC]` **Migration 009 — ordre de déploiement (PO-V5-12, variante A).** Sur l'environnement cible, la migration `009` **complète** (section 3 comprise) n'est appliquée **qu'après** que le code C4 est déployé et actif. La preuve est la **trace ordonnée** du déploiement : (1) build du nouveau code, (2) démarrage de l'instance, (3) application de `009` **au démarrage**, avec les logs horodatés. Aucun environnement de production, de staging ni de recette ne reçoit `009` alors qu'il sert le code antérieur à C4. Le compte rendu nomme la plateforme de déploiement utilisée (Railway/Render) et **constate** que son pipeline applique les migrations au démarrage du nouveau code — si ce constat est faux pour la plateforme retenue, **ce critère échoue** et PO-V5-12 doit être re-tranché sur la variante B.
- **CA-V5-144** `[EXEC]` **Contrainte de régression ×106 / ×35 — testée, pas commentée.** Sur la base de mesure (50 000 produits, 5 % supprimés), le test mesure **les deux** configurations et consigne les deux plans :
  - code C4 actif (filtre `deleted_at IS NULL` **présent**) → catalogue tri récent `LIMIT 48` **< 1 ms**, Index Only Scan, **≤ 10 pages** lues ; file de modération `LIMIT 12` **< 1 ms** ;
  - contrôle négatif : requête **sans** le filtre → **plus de 15 ms** et **plus de 500 pages** lues sur le catalogue (valeurs de référence : 22,564 ms / 1 881 pages).
  Le contrôle négatif prouve que les index partiels de `009` **portent bien** le prédicat `deleted_at IS NULL` (que `pg_indexes.indexdef` le confirme est **insuffisant** : le prédicat peut être écrit et non être utilisé). Le rapport §9 porte ces deux mesures.
- **CA-V5-145** `[EXEC]` **Amorce du déploiement 009 + code C4 sur base peuplée.** L'ensemble est appliqué une **première** fois sur un environnement de recette contenant déjà des données représentatives (produits dans les 5 statuts, commandes dans les 6 statuts, notifications, enum `notification_type` contenant `'product.contact'`), dans l'ordre : `001`→`008` → **code C4** → `009`. Ensuite, `009` est rejouée **3 fois** sans erreur. Le cas **« 009 seule sur code pré-C4 »** est **interdit** et ne doit figurer dans aucun script de déploiement versionné.
- **CA-V5-069** `[TEST]` **Aucun quota de produits par vendeur (verrou).** Le même vendeur crée **10 produits successivement** (tous `PENDING`) : les 10 créations répondent `201` et `SELECT COUNT(*) FROM products WHERE owner_id = $1` = 10. Le scénario « produit vendu puis nouvelle publication » est couvert : après `SOLD` sur le produit n°1, la publication du produit n°11 réussit.
- **CA-V5-070** `[TEST]` **« Vendre un produit » toujours disponible.** Le point d'entrée de vente est atteignable en permanence pour un vendeur : depuis la navbar, le profil, la page « Mes articles » et l'accueil. Contrôle **positif et négatif** : le lien/bouton est présent pour un vendeur ayant 0, 1 et ≥ 10 articles, et il **n'est jamais** conditionné à un `status`, un `role` ou un compteur. Aucune logique de désactivation n'est introduite (ARB-V5-05).

---

### 5.5 US-V5-05 — Scalabilité : des milliers d'utilisateurs sans lenteur, bug ni crash (C5)

> **US-V5-05** — *En tant qu'utilisateur, je veux que le catalogue et le back-office restent rapides même quand la plateforme grossit, afin de ne pas changer de service.*
>
> *En tant que plateforme, je veux que la base de données ne soit jamais saturée par une seule page, afin que le service reste disponible pour tous.*

**Constat de départ — N+1 recensés et vérifiés (avant toute correction)**

| # | Point de départ | Ligne | Symptôme |
|---|---|---|---|
| N1 | `getCatalog` — boucle `serializeProductCard(…, await loadPrimaryImage(…))` | `products.service.ts:392-395` | 2 + N requêtes par page de catalogue |
| N2 | `getCatalog` — **mode `ids`** (accueil « vus récemment », favoris) | `products.service.ts:279` | 1 + N requêtes, appelé 1× par section de l'accueil |
| N3 | `listOwnProducts` — boucle `loadImages` | `products.service.ts:542-545` | 1 + N sur « Mes articles » |
| N4 | `listAdminProducts` — boucle `buildAdminProduct` | `admin.service.ts:140-143` | 1 + 3N sur le back-office articles |
| N5 | `listAdminOrders` — boucle `loadOrderParts` | `admin.service.ts:222-226` | 1 + 7N sur le back-office commandes |
| N6 | `listBuyerOrders` / `listSellerOrders` — boucle `loadOrderParts` | `orders.service.ts:282-286`, `:300-304` | 1 + 7N sur « Mes commandes » / « Mes ventes » |
| N7 | `getStats` — `Promise.all` sur 7 requêtes | `admin.service.ts:59-91` | 7 requêtes à **chaque** page admin (via `useAdminStats`) |
| N8 | `getPublicProduct` — 5 requêtes séquentielles + 1 recharge si réservation expirée | `products.service.ts:405-439` | 5 à 7 allers-retours par consultation de fiche |

- **CA-V5-071** `[TEST]` **Verrou du nombre de requêtes SQL.** Un compteur de requêtes instrumenté au niveau du pool permet d'affirmer, pour chaque endpoint de liste, un **budget de requêtes indépendant du nombre de lignes** :

  | Endpoint | Budget SQL maximal | Départ actuel |
  |---|---|---|
  | `GET /api/products` (toutes sections/tris) | **≤ 3** | N1 (2 + N) |
  | `GET /api/products?ids=…` | **≤ 2** | N2 (1 + N) |
  | `GET /api/products/:identifier` | **≤ 5** | N8 (5 à 7) |
  | `GET /api/me/products` | **≤ 2** | N3 (1 + N) |
  | `GET /api/admin/products` | **≤ 3** | N4 (1 + 3N) |
  | `GET /api/admin/orders` | **≤ 4** | N5 (1 + 7N) |
  | `GET /api/me/orders` | **≤ 3** | N6 acheteur (1 + 7N) |
  | `GET /api/me/sales` | **≤ 3** | N6 vendeur (1 + 7N) |
  | `GET /api/admin/stats` | **≤ 3** | N7 (7) |

  Le test est **paramétré sur la taille de page** (1, 12, 48) et vérifie que le budget **ne croît pas**.
- **CA-V5-072** `[TEST]` **Le N+1 a disparu, pas déplacé.** Pour chaque endpoint du tableau CA-V5-071, le nombre de requêtes est **identique** pour `per_page=1` et `per_page=48`. Une régression vers un chargement par ligne fait échouer le test.
- **CA-V5-073** `[TEST]` **Les lectures parallèles sont réellement parallèles ET sûres.** `loadOrderParts` accepte un client de transaction (`orders.service.ts:51`, `Queryable`) et le parallélisme y est **interdit** (pg interdit plusieurs requêtes en vol sur un même client — commentaire existant `:56-58`). Le test `checkout` (qui passe par un client de transaction, `orders.service.ts:214`) reste **vert** : aucune régression transactionnelle. *La stratégie d'exécution (une requête agrégée, un `JOIN`, un `Promise.all` conditionnel) est une décision `@architecte` ; le cahier impose le résultat et la sécurité.*
- **CA-V5-074** `[TEST]` **Ordre et lignes identiques après optimisation.** Pour les 8 endpoints de CA-V5-071, le corps de réponse est **rigoureusement identique** (mêmes clés, mêmes types, mêmes valeurs, même ordre) avant/après, sur un jeu de données figé. Le test compare la charge utile **entière**, pas un sous-ensemble.
- **CA-V5-075** `[EXEC]` **`GET /api/products` — seuil de latence.** Sur une base de **50 000** produits `AVAILABLE` (jeu reproductible, §9), `GET /api/products?per_page=48&page=1` répond en **p95 < 100 ms** et **p99 < 200 ms** (temps **serveur**, hors transfert réseau).
- **CA-V5-076** `[EXEC]` **Sections d'accueil.** Les 6 sections (`recent`, `best_offers`, `popular`, `promotions`, `new`, `discover`) répondent chacune en **p95 < 100 ms** sur la base de 50 000 produits avec `per_page=10`. Le chargement complet de l'accueil (6 requêtes de sections) reste **p95 < 400 ms** cumulés côté serveur.
- **CA-V5-077** `[EXEC]` **`OFFSET` borné.** `GET /api/products?per_page=48&page=1..20` répond en **p95 < 250 ms**. Au-delà, le comportement contractuel existant est conservé : `page=999999999` répond **`200`** avec `items: []` (verrouillé par `server/test/limits.test.ts:55-59`) et **jamais** d'erreur ni de timeout. Aucune nouvelle borne n'est introduite sur `page` (P5).
- **CA-V5-078** `[EXEC]` **`COUNT(*)` du catalogue — décision mesurée.** Sur la base de 50 000 produits, la requête de comptage dépasse **50 ms** de façon récurrente → une optimisation est requise (index adapté, comptage documenté), **et** `total` / `totalPages` reste **exact** pour toute page ≤ 20. Le plan d'exécution (`EXPLAIN (ANALYZE, BUFFERS)`) est consigné. *Seuil d'alerte mesuré, pas obligation d'index : la décision appartient à `@architecte` sur la base de la mesure.*
- **CA-V5-079** `[EXEC]` **Recherche `q` (ILIKE).** `GET /api/products?q=<terme>` répond en **p95 < 300 ms** sur 50 000 produits. L'**ensemble des résultats** est **inchangé** (mêmes produits, même ordre) par rapport à la mesure de référence pré-V5. Le support `pg_trgm` (index `idx_products_name_trgm`, `001_init.sql:97`) est vérifié actif ; s'il ne l'est pas, un index trigrammes supplémentaire est justifié par la mesure.
- **CA-V5-080** `[EXEC]` **Back-office — seuil de latence.** Sur la base de 50 000 produits et **5 000** commandes : `GET /api/admin/products?per_page=12`, `GET /api/admin/orders?per_page=12` et `GET /api/admin/stats` répondent chacun en **p95 < 150 ms**. Le détail `GET /api/admin/orders/:id` répond en **p95 < 100 ms**.
- **CA-V5-081** `[EXEC]` **`GET /api/admin/stats` — volume et fidélité.** Le nombre de requêtes SQL de `getStats` est ramené à **≤ 3** (CA-V5-071) ou, à défaut, chaque requête est **justifiée par la mesure** dans le compte rendu (F9 : le `Promise.all` actuel est déjà parallèle et borné). Le résultat **reste numériquement identique** pour les 15 champs du contrat (`users`, `pendingProducts`, `activeOrders`, `pendingPayouts`, `payoutsDue`, `payoutsDueAmount` + 8 statuts) — égalité stricte sur base de référence.
- **CA-V5-082** `[AUDIT]` **Index — couverture justifiée.** Pour chaque besoin listé dans l'ARB-V5-07, une **décision motivée** existe (index ajouté, index existant suffisant démontré par `EXPLAIN`, ou **non-indexabilité documentée**). Liste minimale à instruire : ratio de réduction (`best_offers` / `promotions`) ; `discover` (tri par modulo — **non indexable**, D4) ; `popular` ; `orders(status)`, `orders(seller_id)`, `orders(buyer_id)` ; `notifications(user_id)` filtrées sur non-lues ; purge de `session` (déjà couverte par `idx_session_expire`, `001_init.sql:201`) ; **et** `products.deleted_at` (migration 009). Chaque index ajouté est justifié par un `EXPLAIN` **avant** et **après**, consigné au compte rendu. Aucun index ajouté « au cas où ».
- **CA-V5-083** `[EXEC]` **`discover` — borné et documenté.** `section=discover` répond en **p95 < 100 ms** sur 50 000 produits et ne parcourt pas l'intégralité de la table (le plan d'exécution le démontre : lignes examinées ≤ **2 000**). Le comportement **observable** de V4 est préservé : **résultat identique sur 24 h**, **variation** d'un jour à l'autre, rempli de produits réels `AVAILABLE`, taille ≤ `per_page`. Ces propriétés sont couvertes par CA-V5-083 et CA-V5-074.
- **CA-V5-084** `[EXEC]` **Rate limit global.** Un limiteur global modéré par IP est actif sur `/api` : **300 requêtes/minute/IP**, fenêtre fixe, dépassement → `429` + `RATE_LIMITED` (même forme d'erreur que `rate-limit.ts:44`). Contraintes :
  - **le limiteur d'authentification reste inchangé et s'applique en premier** : `/api/auth` à 20 req/10 min (`app.ts:63`) ; un client qui dépasse 20 sur `/api/auth` reçoit `429` ;
  - **bypass intégral en `NODE_ENV=test`** : le contournement existant (`rate-limit.ts:15-17`) est **préservé** et s'applique aussi au limiteur global — sinon les 3 526 lignes de tests existants cassent ;
  - **exemptions** : `GET /api/health` et `GET /health` ne sont **jamais** limités ; `/uploads` (statique) et le fallback SPA ne sont **pas** concernés (montage sur `/api` uniquement, D8) ;
  - l'IP est déterminée par `req.ip` (jamais par un en-tête brut fourni par le client) ; `trust proxy` est déjà positionné en production (`app.ts:25-27`) — le limiteur ne le contourne pas.
  - **Contrainte de scalabilité (PO-V5-17, documentée et actée)** : le limiteur est **en mémoire, dans le processus** (`middleware/rate-limit.ts`, un `Map` par instance ; aucune dépendance Redis dans `server/package.json` — vérifié). C'est **accepté pour un déploiement à une seule instance**. **Avant toute mise à l'échelle horizontale (≥ 2 instances), un compteur partagé (Redis) est obligatoire** : sans lui, chaque instance compte ses propres 300 req/min et la limite effective est multipliée par le nombre d'instances. Ce point est un **livrable de clôture** (CA-V5-146), pas une note de bas de page.
- **CA-V5-085** `[TEST]` **Le limiteur global ne casse rien.** Après son introduction, la suite `server/test/*.test.ts` **entière** reste verte (contournement test) et un test dédié vérifie qu'un burst de 301 requêtes consécutives depuis une même IP reçoit `429` à la 301ᵉ, et que le compteur repart à zéro après la fenêtre.
- **CA-V5-086** `[EXEC]` **Charge concurrente.** Un scénario reproductible (≥ **50 utilisateurs virtuels** pendant ≥ **3 minutes**, mélange 60 % lectures catalogue, 20 % recherche, 10 % pages admin, 10 % écritures simulées) ne produit **aucune** erreur 5xx, **aucun** `timeout exceeded when trying to connect`, **aucun** deadlock, et respecte les seuils p95 de CA-V5-075/080. Script et rapport (p50/p95/p99, erreurs) fournis.
- **CA-V5-087** `[EXEC]` **Pool jamais saturé.** Le pool (`max: 10`, `db/pool.ts:12`) n'est **jamais** épuisé : sous la charge CA-V5-086, le nombre de clients en attente est **borné** et le délai d'attente d'un client du pool reste **p95 < 50 ms**. Le parallélisme des lectures est **borné** (jamais « une requête par ligne » simultanée — F11). Les timeouts existants (`connectionTimeoutMillis: 10_000`, `idleTimeoutMillis: 30_000`, `pool.ts:13-14`) sont **conservés**.
- **CA-V5-088** `[EXEC]` **Robustesse d'entrée.** Une charge utile malformée ne provoque **jamais** de 5xx sur aucun endpoint, y compris les nouveaux/optimisés : JSON invalide, `Content-Type` absent, corps > 2 Mo → `413 PAYLOAD_TOO_LARGE` (comportement existant verrouillé par `accueil-v3.test.ts:537-544`, **non régressé**) ; champs du mauvais type → `400 VALIDATION_ERROR` ; entrée SQL hostile (`q`, `location`, `brand`) → **aucune injection** (les paramètres restent liés : `products.service.ts:288-345`).
- **CA-V5-089** `[EXEC]` **Stabilité mémoire.** Sous la charge CA-V5-086, la consommation mémoire du processus **ne croît pas de plus de 15 %** entre le début et la fin, et le limiteur de débit ne fuit pas de mémoire (la purge périodique des buckets existe déjà, `rate-limit.ts:22-28` ; elle doit couvrir aussi le limiteur global).
- **CA-V5-090** `[AUDIT]` **Logging structuré minimal.** Toute erreur serveur est journalisée avec au minimum : horodatage ISO, niveau, message, **chemin de la route**, identifiant de corrélation, et le code d'erreur métier le cas échéant. **Aucun** secret ni donnée personnelle (mot de passe, token, corps de requête complet, email, téléphone). Le format est **homogène** (une seule fonction de journalisation), pas un mélange de `console.log` / `console.error` / `console.warn` libres. La justification de ne pas adopter un logger externe est **consignée**.
- **CA-V5-091** `[EXEC]` **`GET /api/health` reste un probe.** `GET /api/health` et `GET /health` répondent `200` `{ "status": "ok" }` **même si la base est injoignable** (`app.ts:75-82`) — comportement existant à ne pas casser, avec test de non-régression explicite.
- **CA-V5-092** `[TEST]` **`listAdminOrders` avec filtre `payout`.** Le chemin `EXISTS` sur `seller_payouts` (`admin.service.ts:207-210`) est optimisé sans changer le résultat : la page « Paiements vendeurs » renvoie **exactement** les mêmes commandes (mêmes ids, même ordre) et les mêmes `total` / `totalPages` avant/après, avec et sans filtre.
- **CA-V5-093** `[TEST]` **`loadOrderParts` — sérialisation et confidentialité inchangées.** Les 3 vues (acheteur, vendeur, admin) sont **inchangées**, y compris les champs optionnels (`payout: null` toléré, `deliveryCarrier` / `trackingNumber` absents) et la **section Confidentialité** : ni `name`, ni `email`, ni `phone` d'un tiers ne fuite vers l'acheteur ou le vendeur (RG-ORD-6). Le test de non-divulgation existant est rejoué.
- **CA-V5-094** `[EXEC]` **Cache HTTP / `ETag` — décision consignée.** L'introduction (ou l'absence) d'un cache HTTP ou d'un en-tête `Cache-Control` sur les lectures publiques est **explicitement motivée** dans le compte rendu. L'absence est acceptable si justifiée ; un cache mal conçu servant des produits périmés après modération ne l'est pas. *(Point non tranché par l'énoncé — PO-V5-07.)*
- **CA-V5-095** `[TEST]` **Pagination : bornes inchangées.** Aucune liste du site ne demande au navigateur de rendre **plus de 48 éléments**. Si l'optimisation introduit un `LIMIT` interne, la borne publique `per_page ≤ 48` (verrouillée par `limits.test.ts:50-53`) reste **inchangée**.
- **CA-V5-096** `[TEST]` **`getPublicProduct` — non-régression du `view_count`.** L'optimisation de N8 préserve l'intégralité du comptage de vues : `+1` à **chaque** consultation réussie, propriétaire et admin compris, `404` **sans** incrément, jamais décrémenté, valeur post-incrément renvoyée (RG-PROD-3, `products.service.ts:421-431`), et libération paresseuse d'une réservation expirée **avant** réponse. Ces 6 comportements sont couverts par des tests.
- **CA-V5-146** `[AUDIT]` **Limite d'instances documentée (PO-V5-17).** Un paragraphe explicite de `docs/architecture-v5.md` (ou d'un addendum) consigne : (1) le rate limit est **en mémoire et par instance** — `middleware/rate-limit.ts`, `Map` créé par appel à `rateLimit()`, **aucun** Redis (`server/package.json` n'en déclare aucune dépendance) ; (2) le déploiement courant est **mono-instance** ; (3) **la bascule horizontale est bloquante** : ≥ 2 instances ⇒ compteur partagé (Redis) **obligatoire avant** mise en production, faute de quoi la limite de 300 req/min/IP est multipliée par le nombre d'instances ; (4) les `Map` du limiteur d'auth et du limiteur global sont **séparés** — le plus strict s'applique, sans collision de clés. Le paragraphe est **lisible par un exploitant** et cité dans la procédure de déploiement. *Ce critère ne demande pas Redis : il interdit de prétendre que le rate limit est distribué.*

---

### 5.6 US-V5-06 — Retrait du use case « Contacter le vendeur » (C6)

> **US-V5-06** — *En tant que produit, je veux retirer la fonctionnalité « Contacter le vendeur », car elle n'est pas utilisée et alourdit la fiche produit, afin de recentrer l'expérience sur l'achat direct.*

**Liste exacte des suppressions — toutes les références ont été relues et confirmées avant rédaction**

| # | Emplacement | Ligne(s) confirmée | Nature |
|---|---|---|---|
| S1 | Route + limiteur de débit | `server/src/routes/products.routes.ts:66-82` | `POST /api/products/:id/contact` + `rateLimit(10/10 min)` |
| S2 | Imports devenus orphelins | `server/src/routes/products.routes.ts:5-20` | `contactSchema`, `contactSeller` |
| S3 | Schéma de validation | `server/src/utils/validation.ts:301-315` | `contactSchema` + son commentaire d'en-tête |
| S4 | Service métier | `server/src/services/products.service.ts:457-531` | en-tête de section, `ContactSellerInput`, `contactSeller` |
| S5 | Union de types | `server/src/services/notifications.service.ts:26-28` | membre `'product.contact'` + commentaire V4 |
| S6 | Tests serveur | `server/test/accueil-v3.test.ts:430-568` | `describe` complet — **12** cas `it()` (F1) |
| S7 | Client API | `web/src/lib/api.ts:178-184` | `api.contactSeller` |
| S8 | Contrats de types front | `web/src/lib/types.ts:398-407` | `ContactPayload`, `ContactResponse` |
| S9 | Fiche produit — logique | `web/src/pages/ProductPage.tsx:34`, `:49-52`, `:109-138` | commentaire d'en-tête, 3 états, `openContact`, `submitContact` |
| S10 | Fiche produit — rendu | `web/src/pages/ProductPage.tsx:252-260`, `:312-353` | bouton « Contacter le vendeur » (ligne 256 incluse, cf. CA-V5-031) **+** modale complète |
| S11 | Tests front | `web/src/lib/api.test.ts:177-192` | 2 cas `it()` |
| S12 | Documentation | `docs/api.md` §3.2 quater (`:780`, `:825-873`) et mentions `:49`, `:52`, `:55`, `:127`, `:314`, `:1815-1816`, `:1840`, `:1844`, `:1861`, `:1937`, `:1966-1967`, `:1970` | contrat à corriger en **v2.3** |
| S13 | Documentation amont | `docs/cahier-des-charges-v4-accueil.md:47`, `:59`, `:233` (CA-ACC-57), `:356` (PO-ACC-1), `:377` (§12 pt 9) | **superseded** par le présent cahier (§3.2 COL-01) |

- **CA-V5-097** `[EXEC]` **Zéro reliquat applicatif.** `grep -rn "contactSeller\|ContactPayload\|ContactResponse\|contactSchema\|product\.contact\|/contact" web/src/ server/src/` ne retourne **aucune** occurrence, à l'exception tolérée et explicitement listée en CA-V5-099.
- **CA-V5-098** `[EXEC]` **Zéro reliquat de route.** `POST /api/products/:id/contact` répond **`404`** + `NOT_FOUND` — jamais `405`, jamais `500`, jamais `401` (la route **n'existe plus**, elle n'est pas « fermée »). Vérifié pour : anonyme, `user`, `admin`, et sur un produit inexistant.
- **CA-V5-099** `[EXEC]` **La valeur d'énumération reste en base.** Après application des migrations (base neuve et base ayant subi 008) : `SELECT unnest(enum_range(NULL::notification_type))` **contient** `'product.contact'`. La valeur n'est **ni supprimée, ni renommée, ni dupliquée** (ARB-V5-08 : retirer une valeur d'un enum PostgreSQL impose une réécriture du type). Elle est simplement **inutilisée** : `SELECT COUNT(*) FROM notifications WHERE type = 'product.contact'` = 0 et le code applicatif ne produit plus ce type.
- **CA-V5-100** `[TEST]` **La fiche produit est intègre après retrait.** `ProductPage` rend toujours : la galerie, le prix, l'ancien prix barré, l'état, la localisation, le bloc vendeur, « Ajouter au panier », « Acheter maintenant », le bandeau « Article vendu » (`:262-266`), le bandeau « réservé » (`:267-270`) et « Vous aimerez aussi ». **Amendement CF-01** : la liste ci-dessus est l'exigence de **contenu** ; l'exigence de **rendu** est portée par CA-V5-147 (fiche premium) et CA-V5-159 (audit visuel). L'apparence de la fiche change en C9, son contenu et son comportement ne changent pas. **Aucun** import ne devient inutile (`useAuth`, `useNavigate`, `useLocation`, `Modal` restants sont réellement employés — vérifié par `tsc` et revue) : **zéro import mort, zéro état mort**.
- **CA-V5-101** `[TEST]` **Le parcours d'achat est intact.** Sur la fiche produit, pour un visiteur **anonyme** comme pour un `user` : ajout au panier (avec le flash vert existant) → panier → commande. Le retrait du bouton de contact **ne modifie** ni l'URL cible de « Ajouter au panier » (`/panier`, `ProductPage.tsx:105-107`) ni le calcul du panier. **Amendement CF-01/CF-04** : la refonte de la fiche produit en C9 (galerie, zoom, CTA, garanties) **ne réintroduit aucun canal de contact** — « Contacter », « Écrire au vendeur », `mailto:` et `tel:` restent absents (CF-04, arbitrag en §5.9.0).
- **CA-V5-102** `[EXEC]` **Les tests sont retirés, pas désactivés.** Le bloc `describe` S6 **et** les 2 cas S11 sont **supprimés** du code (ni `it.skip`, ni `it.todo`, ni `@ts-ignore`). Aucune suite ne devient vide. Le compte total de tests serveur **décroît de 12** et celui des tests front de **2** ; aucun autre test n'est supprimé ni modifié.
- **CA-V5-103** `[EXEC]` **Documentation mise à jour — `docs/api.md` v2.3.** Les 12 emplacements S12 sont corrigés : §3.2 quater est retiré ou marqué « retiré en V5 » ; la ligne de version passe à **v2.3** avec mention du chantier ; le tableau des routes (§1861) ne liste plus la route ; le tableau des types de notification (§1840/1844) précise que `'product.contact'` est **conservé en base et inutilisé**. Contrôle final : `grep -rn "contact" docs/api.md` ne retourne que des occurrences **explicitement** marquées comme historiques.
- **CA-V5-104** `[EXEC]` **Amont marqué superseded.** `docs/cahier-des-charges-v4-accueil.md` porte, sur CA-ACC-57, PO-ACC-1 et §12 pt 9, la mention « **SUPERSEDÉ par `cahier-des-charges-v5.md` §3.2 COL-01 (2026-09-27)** ». Le document V4 reste lisible et n'est pas réécrit. Le compte **12** cas (et non 13) est consigné au compte rendu (F1).
- **CA-V5-105** `[EXEC]` **Aucune dépendance orpheline.** `api.contactSeller` n'est appelé par **aucun** autre module du front et `contactSeller` n'est importé par **aucun** autre service (vérifié avant suppression). Le retrait ne laisse **aucune** importation orpheline dans les 6 fichiers touchés — `tsc --noEmit` (server) et `tsc -b` (web) le garantissent.
- **CA-V5-106** `[TEST]` **La libération paresseuse reste garantie.** La libération d'une réservation expirée (appelée notamment depuis `contactSeller:496-498`) reste assurée par la **fiche produit** (`products.service.ts:415-419`) et par le job d'expiration. Un produit `RESERVED` expiré redevient `AVAILABLE` sans dépendre du use case retiré (`expiry.test.ts` + test dédié sur la fiche).
- **CA-V5-107** `[AUDIT]` **Aucun autre use case n'est touché.** Le diff du chantier C6 est **borné** aux 13 emplacements S1→S13. Aucun autre endpoint, service, composant, test, migration ou route front n'est modifié. (Revue de diff obligatoire — le cahier fixe une frontière stricte.)
- **CA-V5-108** `[EXEC]` **La section « Vous aimerez aussi » fonctionne toujours.** La liste des produits similaires (même catégorie, produit courant exclu, ≤ 5) est alimentée par `GET /api/products?ids=…` et fonctionne après le retrait du bouton (le mécanisme `ids` est intact, tout en restant dans le budget de CA-V5-071).
- **CA-V5-109** `[EXEC]` **Pas de confusion avec C4.** Le retrait du use case contact **n'emporte aucune suppression de produit** : la suppression reste un sujet C4, avec soft delete (§5.4). Le compte rendu le rappelle explicitement.

---

### 5.7 US-V5-07 — Qualité, dette et non-régression (C7)

> **US-V5-07** — *En tant que mainteneur de ReVends, je veux un code sans dette visible ni erreur de compilation, afin que les évolutions futures restent sûres.*
>
> *En tant que chef de projet, je veux que la recette objective reste vérifiable par des commandes reproductibles, afin de ne pas valider sur la seule impression visuelle.*

**État de départ vérifié le 27/09/2026 (F1, F6, F9)**

| Indicateur | Mesure | Cible V5 |
|---|---|---|
| `server` — `npx tsc --noEmit` | 0 erreur | 0 |
| `web` — `npx tsc -b` | 0 erreur | 0 |
| `web` — `npx vitest run` | 4 fichiers, **52/52** verts | ≥ 52, tous verts |
| `server` — tests catalogue | **19/19** verts | ≥ 19, tous verts |
| `className="card"` dans `pages/admin` | 4 pages | 1 seule convention (C3) |
| `table-scroll overflow-x-auto` | 6 occurrences | 1 (composant partagé) |
| `any` en profil `tsc` serveur | 0 | 0 |

- **CA-V5-110** `[TEST]` **TypeScript strict** : `npx tsc --noEmit` (server) et `npx tsc -b` (web) sortent en code 0, sans erreur ni avertissement d'aucune des deux commandes. Zéro `@ts-ignore`, zéro `@ts-nocheck`, zéro `// @ts-expect-error` ajouté par le chantier.
- **CA-V5-111** `[TEST]` **Zéro `any` sauvage** : `grep -rn ":\s*any\b" server/src/ web/src/` ne retourne **aucune** occurrence hors liste blanche d'exceptions explicitly justifiées, existantes avant V5, ≤ **5 entrées**, citées en annexe du compte rendu. Aucun `any` n'est **ajouté** par le chantier ; toute conversion vers `unknown` + réduction typed est **complète**, jamais partielle.
- **CA-V5-112** `[TEST]` **Aucune régression de test.** Les 52 tests front — répartis sur les **4** fichiers de suite réellement présents (`web/src/lib/api.test.ts` 22, `constants.test.ts` 7, `format.test.ts` 13, `recentViews.test.ts` 10) — restent verts ; les tests serveur (`server/test/*.test.ts`) restent verts, **hormis** la décroissance attendue de 12 cas (C6, CA-V5-102). Aucun test existant n'est modifié, désactivé ou affaibli pour faire passer le chantier.
- **CA-V5-113** `[TEST]` **Dette de duplication mesurée** : `grep -rln "table-scroll overflow-x-auto" web/src/pages/admin/` → **1** fichier ; `grep -rln 'className="card"' web/src/pages/admin/` → **1** fichier ; aucun `min-w-[…]` divergent entre pages admin. Ces compteurs sont **revérifiés** en recette et consignés.
- **CA-V5-114** `[AUDIT]` **Zéro style arbitraire et zéro reliquat** : `grep -rn "soft-primary\|shadow-\[\|style={{" web/src/ server/src/` ne retourne **aucune** occurrence métier. Zéro import mort ; les composants partagés de `web/src/components/ui/` sont utilisés, pas recopiés.
- **CA-V5-115** `[EXEC]` **Zéro dette de migration** : `npx tsc --noEmit` côté serveur n'aboutit à **aucune** erreur Prisma/type et la migration 009 est idempotente ; la chaîne de migrations reste **strictement incrémentale** (aucun `ALTER` retroactif dans un fichier déjà appliqué en production).
- **CA-V5-116** `[EXEC]` **Aucun secret, aucun fichier parasite.** `git status` ne montre **ni** `.env` en clair, **ni** clé, **ni** URL SMTP avec mot de passe, **ni** fichier temporaire (`*.log`, `*.bak`, `*.orig`, captures d'écran non intentionnelles). Toute variable sensible est introduite par **exemple documenté** (`.env.example`) uniquement.
- **CA-V5-117** `[EXEC]` **Accessibilité — constat de départ à ne pas se tromper (F13).** La suite front ne contient **aucun** fichier de test d'accessibilité : les 4 suites existantes ne couvrent que `api`, `constants`, `format` et `recentViews` (mesuré : `find web/src -name '*.test.ts'` → 4 fichiers, aucun test `alt`/`aria`). L'accessibilité n'est donc **pas** prouvée par un test aujourd'hui. Critère V5 : (1) les 52 tests existants restent verts **et** leur périmètre n'est pas étendu silencieusement ; (2) l'accessibilité est démontrée par CA-V5-043 (audit des 9 écrans admin) **et** par une vérification automatisée nouvelle et minimale : un test vérifiant qu'aucune balise `<img>` de `web/src/` ne manque d'attribut `alt` et qu'aucun élément cliquable à icône ne rend un `button`/`a` sans nom accessible. Ce test est **livré en V5** ; s'il est impossible à écrire sans dépendance supplémentaire, il est remplacé par un contrôle `grep` consigné au compte rendu — **jamais** par l'invocation d'une suite inexistante.
- **CA-V5-118** `[EXEC]` **La preuve est reproductible** : chaque commande de recette du §9 (typecheck, tests, `build`, audit de classes, mesures p95, non-régression) est exécutable **en une commande**, avec sortie **code 0**, et son résultat est consigné au compte rendu final (commande, sortie, verdict) — pas de « ça marche » sans trace.

#### 5.7.1 Isolation de la base de test — **PRIORITÉ ABSOLUE** (PO-V5-13, bug F14)

> Un `npm test` qui détruit la base de développement est un **blocage de livraison**, pas une dette. Ces deux critères sont **antérieurs** à tous les autres critères du sprint : tant qu'ils ne sont pas verts, aucun autre `CA-V5-xxx` de C5 n'est recevable, car la mesure est faite sur une base que le test précédent a pu vider.

- **CA-V5-126** `[EXEC]` **Zéro effet de bord sur la base de développement.** Avant puis après un `npm test` complet (les 13 suites), la base désignée par `DATABASE_URL` dans `server/.env` (base `revends`) est **strictement inchangée** : `pg_database_size` identique, `information_schema.tables` identique (13 tables), et les comptages des tables métier (`products`, `users`, `orders`, `notifications`) **identiques**. La preuve est un avant/après consigné avec les valeurs exactes. **Contrôle négatif obligatoire** : le test est rejoué avec `DATABASE_URL` **explicitement forcée** sur la base de dev dans l'environnement du shell — le run doit rester vert **et** la base de dev doit rester intacte. *Sans ce contrôle négatif, CA-V5-126 est satisfait par hasard et ne prouve rien : le bug F14 ne se manifeste que dans ce cas.* **Interdit** : toute solution consistant à « ne pas tester sur la base de dev parce que le développeur n'en a pas besoin ».
- **CA-V5-127** `[TEST]` **Le bootstrap est lié à `revends_test` par construction, pas par défaut.** Trois exigences cumulatives :
  1. **Ciblage forcé, jamais conditionnel** : la valeur du nom de base de test est appliquée par **affectation inconditionnelle** (ex. `TEST_DB` en dur dans le bootstrap, ou une variable dédiée `TEST_DATABASE_URL` dont la valeur est calculée et non héritée), **jamais** par un opérateur de déférence conditionnel (`??=`, `||=`) appliqué à `DATABASE_URL`. Le commentaire d'avertissement de `env.ts:13` est remplacé par la garantie mécanique.
  2. **Garde-fou fail-fast** : si la base cible du `DROP SCHEMA` **ne se termine pas** par un suffixe de test documenté (`_test` / `_test_*`), le bootstrap **refuse de démarrer et écrit une erreur explicite** nommant la base visée et la base attendue. Il ne « continue pas en espérant ». Le `DROP SCHEMA public CASCADE` (`bootstrap.ts:65`) ne peut pas s'exécuter sur une base de production ni de développement, **même** si `DATABASE_URL` est mal configurée.
  3. **Création + schéma + seed** : la base `revends_test` est **créée si absente** (elle existe déjà dans l'environnement de recette : vérifié), le schéma est réinitialisé par les migrations `001`→`009` et le seed admin est appliqué, sans jamais requêter la base de dev. Le bootstrap échoue explicitement si les migrations n'appliquent rien (invariant existant conservé, `bootstrap.ts:74-76`).
  **Preuve attendue** : `grep -n "??=\|||=" server/test/env.ts server/test/bootstrap.ts` ne retourne plus aucune affectation conditionnelle portant sur une URL de base de données, **et** un test qui force `DATABASE_URL` sur la base de dev est vert sans dommage (voir aussi CA-V5-126).

---

### 5.8 US-V5-08 — Recette globale, livrable et Definition of Done (C8)

> **US-V5-08** — *En tant que chef de projet, je veux une recette de bout en bout reproductible et un livrable démontrable, afin de valider le sprint sur des faits et non sur des promesses.*
>
> *En tant qu'équipe, je veux que chaque exigence métier (C1 à C6) soit couverte par un test ou une vérification objective, afin qu'aucune fonctionnalité ne soit « livrée » sur la seule foi d'une intention.*

- **CA-V5-119** `[EXEC]` **Aucun critère orphelin.** Chaque exigence C1 à C6 est couverte par **au moins un** `CA-V5-xxx` de ce cahier, et chaque `CA-V5-xxx` est rattaché à **une** exigence et **une** user story. La matrice §8 est **complète** : aucune case « exigence sans critère », aucun « critère sans exigence ».
- **CA-V5-120** `[EXEC]` **Grille de recette de bout en bout** : la grille §8 est **exécutée intégralement** par `@tester`, chaque ligne portant un verdict binaire **PASS**/**FAIL**, une preuve (sortie de commande, capture, mesure) et une référence `fichier:ligne`. **Aucune** ligne « partielle », « à vérifier plus tard » ou « non applicable » n'est admise en clôture.
- **CA-V5-121** `[EXEC]` **Parcours complet demonstrable** en environnement de recette : (1) inscription → e-mail de bienvenue reçu ; (2) vendeur publie 1 produit → admin approuve → e-mail « article approuvé » reçu ; (3) acheteur réserve puis achète → e-mails de confirmation de paiement (acheteur et vendeur) reçus ; (4) vendeurexpédie → e-mail « colis prêt » reçu ; (5) livraison → e-mail « commande livrée » reçu ; (6) admin paie le vendeur → e-mails « paiement disponible » puis « payé » reçus ; (7) **sur les 6 étapes produit** : notifications in-app **présentes** (coexistence prouvée, CA-V5-010) ; (8) produit frauduleux supprimé par admin → vendeur reçoit la notification `article_deleted`, produit absent du catalogue, historique de commande intact ; (9) un `user` qui saisit `/admin` est renvoyé sur `/` sans voir de donnée admin.
- **CA-V5-122** `[EXEC]` **Performance démontrée** : le rapport de mesure (§9) fournit p50/p95/p99 pour le catalogue, les sections d'accueil, la recherche, le back-office et la charge concurrente, sur la base de 50 000 produits / 5 000 commandes, avec le **script reproductible** et la **méthode de génération de la base**.
- **CA-V5-123** `[EXEC]` **Robustesse démontrée** : le rapport de robustesse fournit la preuve de non-régression du rate limit (bypass test intact, burst → 429), du payload trop gros (413), du JSON invalide (400), de l'absence de 5xx sur entrée hostile et de la stabilité mémoire sous charge.
- **CA-V5-124** `[EXEC]` **Documentation livrée à jour** : `docs/api.md` (v2.3), `docs/design-system.md` (section admin) et `docs/cahier-des-charges-v4-accueil.md` (mentions superseded) sont **à jour** et cohérents avec le code livré ; aucun critère de CA-V5-103/104/046 ne reste ouvert.
- **CA-V5-125** `[EXEC]` **Definition of Done signée** : la checklist DoD §10 est **cochée** point par point par `@chef-de-projet` **et** `@cahier-des-charges`, avec **zéro** case cochée sur la foi d'une intention. Toute case non cochée **bloque** la clôture du sprint et figure dans le bilan avec un responsable et une échéance.

---

### 5.9 US-V5-09 — Identité visuelle « REVENDS 2026 » (nouveau chantier C9)

> **US-V5-09** — *En tant qu'utilisateur de ReVends, je veux que le site ait l'allure d'une vraie marque de la seconde vie (palette, typographie, logo, rythme éditorial), afin que je fasse confiance à la plateforme et que la seconde vie des belles choses soit le message du produit — pas une option.*
>
> *En tant que chef de produit, je veux une identité **vérifiable** (tokens, classes, contrastes, présence des écrans), afin que « ça fait premium » ne soit pas une question d'opinion.*

#### 5.9.0 Ce que cette US **n'est pas** — et les conflits qu'elle ouvre avec le V5 existant

> **Convention de lecture.** Les conflits ci-dessous sont **signalés, pas dissimulés**. Chacun reçoit : (1) l'état vérifié dans le code, (2) la règle existante qu'il contredit, (3) la **résolution proposée**, et (4) son statut : **RÉSOLU** (j'ai amendé le cahier) ou **À TRANCHER** (décision qui appartient au chef de projet, avec repli si non tranchée).

| # | Conflit | État vérifié | Règle contradicte | Résolution | Statut |
|---|---|---|---|---|---|
| **CF-01** | **Le re-thème 2026 remplace la marque actuelle ;** §2.2 interdit de refondre accueil / recherche / catégorie / fiche produit (C8) | **Zéro recouvrement** de palette : en place `primary #ff6b35` (orange vif), `ink #1a1a2e` (bleu nuit), `secondary #004e89`, `bg #f7f7f7` (F15). Aucune de ces valeurs n'est dans la palette REVENDS 2026. `--font-sans` est un **pile système** sans Inter/Manrope/Plus Jakarta ni serif éditorial | §2.2 (« refonte accueil/recherche/catégorie/fiche produit — hors périmètre ») ; CA-V5-032 (« rendu visuel **identique** ») ; CA-V5-045 (« intensité d'ombre **identique** ») ; CA-V5-100/101 (fiche et parcours « intacts ») | **RÉSOLU par amendement** : C9 est un chantier **d'habillage, pas de comportement**. Les écrans sont **ré-ouverts** pour le **fond** (couleurs, typographie, logo, mise en page) et **refermés** sur le **fond** de C8 : aucune URL, aucun code HTTP, aucune forme de réponse, aucun ordre de tri, aucun libellé métier, aucun parcours ne change. CA-V5-032, 045, 100 et 101 sont amendés en ce sens ; CA-V5-148 verrouille la non-régression. **Si le chef de projet ne veut pas rouvrir C8, US-V5-09 doit être repoussée en V6** : ce n'est pas un détail d'implémentation, c'est 50 écrans. | RÉSOLU |
| **CF-02** | **Filtres « taille », « couleur », « date » et tri « Pertinence » n'existent pas dans l'API** (F16) ; « recherche à suggestions » non plus (F17) | Filtres exposés : `q`, catégorie/sous-catégorie, `price_min/max`, `condition`, `location`, `brand` (**6 familles**). Tris : `recent`, `price_asc`, `price_desc`, `popular` — **pas de « Pertinence »** (`validation.ts:246, 265-274`). Zéro composant de suggestion dans `web/src/` | §2.2 (« le **seul** ajout de contrat est la route de suppression admin ») ; P5 (rétrocompatibilité stricte) ; P2 (« toute classe utilisée existe ») | **À TRANCHER — `PO-V5-18`**. Proposition (`@cahier-des-charges`) : accepter une **addition de contrat** explicitement bornée et documentée (`docs/api.md` **v2.4**) : 3 filtres et 1 tri **optionnels**, dont l'**absence de valeur ne change aucune réponse existante**, et 1 endpoint de suggestions en lecture seule. **Repli si non tranché avant le début de C9** : C9 est livré en **P0/P1** avec les 6 familles de filtres et 3 tris existants ; « taille », « couleur », « date », « Pertinence » et les suggestions passent en **V6** (priorité P2). **Aucun écran ne doit être livré avec un filtre qui ne filtre pas** (RG-V5-08). | À TRANCHER |
| **CF-03** | La dette `sales: 0` (PO-V5-16) lit `products` **sans** `deleted_at IS NULL` | `getPublicProduct`, `products.service.ts:434-438` ; `users` n'a pas de colonne `sales` | CA-V5-063 (« **toute** requête lisant `products` applique `deleted_at IS NULL` … et **statistiques** ») | **RÉSOLU** : CA-V5-063 est amendé avec une liste **fermée et nommée** de 3 exemptions (historique de commande, verrous d'écriture, dette `sales: 0`). Toute 4ᵉ lecture non filtrée **casse** le critère. La dette est suivie par CA-V5-210 (§5.10). | RÉSOLU |
| **CF-04** | « profil vendeur : Voir le profil **+ Contacter** » | Le use case « Contacter le vendeur » est **intégralement supprimé** (ARB-V5-08, C6, CA-V5-097 : `grep` ne doit **plus** rien retourner) | ARB-V5-08, CA-V5-097, COL-01 | **RÉSOLU — tranché par moi, à confirmer** : l'action **« Contacter » est HORS PÉRIMÈTRE FONCTIONNEL** et ne doit **pas** être réintroduite, même sous une autre libellé (« Écrire au vendeur », « Message », « Poser une question ») ni via un lien `mailto:`/`tel:`. **Action de remplacement retenue : « Voir le profil du vendeur »** — un **lien de navigation interne** vers une fiche vendeur **en lecture seule** (identité, biographie, avis si existants, articles en ligne), qui **n'ouvre aucun canal de contact**. C'est un **lien**, pas une action de messagerie : RG-V5-08 est respecté (l'action affichée est réellement exécutable). Cette fiche est l'écran **n° 39** de l'inventaire. *Si le chef de projet veut une vraie messagerie, c'est un chantier distinct (V6) : elle ne doit pas renaître par l'interface.* | RÉSOLU |
| **CF-05** | **« ~50 écrans » contre 27 routes existantes** (F17) et un sprint déjà chargé de 8 chantiers | `App.tsx:53-86` déclare 27 routes ; l'inventaire §5.9.6 en compte 50, dont **11 nouveaux** et 2 à refondre en flux multi-étapes (F18) — le spec de design en compte également 50 (§4) ; la ligne de coupe réelle est **34 écrans P0** (PO-V5-19) | Le sprint V5 porte déjà C1→C8 | **À TRANCHER — `PO-V5-19`**. Les 50 écrans sont **priorisés P0 / P1 / P2** (§5.9.6). **Règle de recette** : un écran P2 non livré est **un écart assumé et consigné**, jamais un « à vérifier plus tard » (RG-V5-10). **Le cahier ne valide pas la livraison de C9 tant que la ligne de coupe P0/P1 n'est pas confirmée par écrit.** | À TRANCHER |

| **CF-06** | **`docs/design-system-revends-v5.md` (550 lignes) existe et fait autorité sur la DA**, mais il **contredit le cahier sur 3 contenus** et imposait une palette à 20+ tokens, incompatible avec ma rédaction initiale | Le spec §1.1 définit les 6 couleurs de marque **+ ~20 tokens d'extension** et une liste de **20 hex interdits** ; §2 fige les polices (**Plus Jakarta Sans** + **DM Serif Display**) et le symbole « La Boucle » ; §4 détaille **les 50 écrans**. Divergences de contenu : (1) hero **« Donnez une seconde vie à ce que vous ne portez plus. »** (spec) vs **« …aux belles choses »** (cahier §5.9.2) ; (2) bande « Confiance » à **4 points** (spec) vs **3 garanties** (cahier) ; (3) footer : le spec impose des **mentions légales non cliquables**, le cahier exigeait des liens réels | §5.9.1 (palette limitée à 6 tokens, polices au choix, liste de serif ouverte) ; CA-V5-141 (« les **mêmes 3** que la fiche produit ») ; CA-V5-142 (« **zéro** lien mort ») | **DA RÉSOLUE, 3 contenus À TRANCHER — `PO-V5-20`.** (a) **Le spec devient la source unique** de la DA : CA-V5-128 à 134 sont **réécrits** pour s'y conformer (palette = 6 marques + extensions documentées, 20 interdits, polices figées, symbole imposé, liste de serif fermée du §1.6) — ce qui **supprime** le flou que j'avais moi-même introduit sur la « liste blanche de verts ». (b) Les **3 divergences de contenu** sont soumises au chef de projet ; en attendant, **le spec est appliqué** et le cahier s'y aligne. | À TRANCHER (DA RÉSOLUE) |

#### 5.9.1 Fondations — palette, typographie, logo (CA-V5-128 → 137)

- **CA-V5-128** `[AUDIT]` **La palette 2026 est définie EXCLUSIVEMENT par tokens — le bloc de référence est `docs/design-system-revends-v5.md` §1.1.** `web/src/index.css` (`@theme static`, lignes 7 à 85 à remplacer) déclare : (a) les **6 couleurs de marque, valeurs exactes** — Charcoal `--color-ink` `#171513`, Ivory `#F7F3EC`, Blanc `#FFFFFF`, Champagne `--color-champagne` `#DCC8A8`, Chocolat `#3A2923`, Terracotta `#C85A2A` ; (b) les **tokens d'extension documentés au même paragraphe** (`ink-2`, `muted`, `faint`, `line`, `line-strong`, `champagne-soft`, `champagne-deep`, `terracotta-strong/ink/deep/soft/wash/glow`, `positive*`, `danger*`, `on-dark*`, `overlay`), qui sont des **teintes de rôle**, pas des couleurs de marque. Chaque token porte un **nom sémantique** : usage par le **rôle** (`bg-ivory`, `text-ink`, `border-champagne`), jamais par la teinte. La palette **précédente** (`#ff6b35`, `#1a1a2e`, `#004e89`, `#f7f7f7`, `#9333ea`, `#d97706`, les 6 `soft-*`) est **remplacée**, pas conservée en doublon : un token qui ne sert plus est **supprimé**, sinon il devient une palette bis non gouvernée (cf. `soft-primary`, F7). *Décision de conception : l'ancien orange vif et l'ancien bleu nuit ne sont pas « des couleurs d'accent historicisées » — ils disparaissent, sinon le test de CA-V5-129 échoue.*
- **CA-V5-129** `[EXEC]` **Aucun hexadécimal hors palette dans le front.** `grep -rhoE '#[0-9a-fA-F]{3,8}\b' web/src/ | grep -v '#ffffff\|#fff'` ne retourne que des valeurs **du jeu de tokens de `docs/design-system-revends-v5.md` §1.1** (marque + extensions, tolérance de casse) — la « liste blanche de verts/erreurs » n'existe plus : le spec fournit déjà `--color-positive*` et `--color-danger*`, qui sont les **seules** couleurs d'état autorisées (vert = payé/livré/terminé/réussi/gain ; rouge = erreur/échec/suppression/annulation ; **aucun autre usage, jamais en décoration**). Les **20 valeurs hexadécimal interdites** énumérées au spec §1.3 (`#FF6B35`, `#004E89`, `#004980`, `#1A1A2E`, `#F7F7F7`, `#E5E7EB`, `#6B7280`, `#00C853`, `#FFD600`, `#FF1744`, `#D1FAE5`, `#DBEAFE`, `#FEF3C7`, `#FEE2E2`, `#FFEDD5`, `#E9D5FF`, `#9333EA`, `#D97706`) sont **absentes**, et **tout `#xxx` écrit en dur** l'est aussi. **Zéro** classe Tailwind arbitraire portant une couleur, une ombre ou un rayon (`bg-[#…]`, `text-[#…]`, `shadow-[…]`, `rounded-[…]`) et **zéro** `style={{}}` métier (`bg-[#…]`, `text-[#…]`, `border-[#…]`) et **zéro** hexadécimal en `style={{}}`. Un test automatisé échoue si une valeur hors liste blanche est détectée (analogue de CA-V5-047, qui doit être **étendu** à ce contrôle).
- **CA-V5-130** `[EXEC]` **Contrastes conformes (WCAG 2.1 AA), mesurés et non estimés.** Chaque paire réellement utilisée est mesurée avec son ratio : texte **normal ≥ 4.5:1**, texte **≥ 24 px ou gras ≥ 3:1**, bordure de champ ≥ 3:1, cible tactile ≥ 44×44 px. Paires **obligatoires** et leur résultat attendu : Charcoal sur Ivory (≈ 15:1), Blanc sur Charcoal (≈ 15:1), Chocolat sur Champagne (≥ 8:1), **Terracotta sur Ivory (≥ 4.5:1 — c'est le point de vigilance réel : un Terracotta trop clair échoue ici)**, et **le texte de statut jamais porté par la seule couleur** (RG-V5-08 : un libellé l'accompagne). Le rapport de contrastes (outil + sortie) est joint au compte rendu ; toute paire non conforme **bloque**, elle ne se « compense » pas par un autre choix.
- **CA-V5-131** `[AUDIT]` **Typographie : 3 sans + 2 serif, déclarées et réellement chargées.** **Les deux polices sont figées par `docs/design-system-revends-v5.md` §2 : `Plus Jakarta Sans` (interface) et `DM Serif Display` (éditorial) — le choix « Inter / Manrope / Plus Jakarta » n'est plus ouvert.** Contraintes : (a) **auto-hébergées** dans `web/public/fonts/` en `.woff2` + règles `@font-face` dans `index.css` — **pas** de CDN tiers (RG-V5-07) ; (b) `font-display: swap` sur les deux ; (c) `preload` **uniquement** pour `PlusJakartaSans-800` et `DMSerifDisplay-400`, **aucun autre** fichier préchargé ; (d) un **fallback** `system-ui` est déclaré pour chacune ; (e) `grep -rn "fonts.googleapis\|@import url(http" web/src/ web/index.html` ne retourne **aucune** occurrence ; (f) aucun FOIT et **CLS ≤ 0,02** (mesuré, pas estimé).
- **CA-V5-132** `[AUDIT]` **Le serif est un accent éditorial, pas une police générale.** Le serif n'est appliqué **que** à une **liste fermée et versionnée** de titres, prise **telle quelle** dans `docs/design-system-revends-v5.md` §1.6 (14 rôles typographiques, classes exactes) : hero éditorial, titre d'article/accroche, et `font-display` de `h2` de section éditoriale. **Zéro** usage du serif sur : corps de texte, lede, prix, boutons, champs, libellés de statut, menus, tableaux admin et **toute** la navigation. Règles du spec rendues **opposables** : (a) `font-display` **interdit sous 20 px** et **sur tout chiffre** (lisibilité) ; (b) **un seul** `font-display` par écran ; (c) `DM Serif Display` n'a **pas de graisse 700** → **zéro faux gras**, donc **zéro** `-webkit-text-stroke` ni `font-weight` ≥ 600 sur `font-display` ; (d) `tabular-nums` sur **tout** chiffre (prix, stats, montants). Un serif hors liste fermée, un `font-display` sous 20 px ou un faux gras est **un écart**, pas une variante.
- **CA-V5-133** `[AUDIT]` **Logo : typographique + symbole.** Le logotype **REVENDS** (tracking, graisse et casse conformes à la maquette) est rendu comme **texte stylé via tokens**, pas comme image bitmap : il est donc net à toute densité, accessible, et localisable. Le **symbole** est un composant SVG unique (pas d'`<img>` décoratif sans `alt`). le **symbole « La Boucle »** est le composant SVG unique défini par `docs/design-system-revends-v5.md` §2 (**2 primitives exactes** : arc de 290° + tête triangulaire, `viewBox="0 0 24 24"`, `currentColor`) — implémenté **à l'identique**, pas une approximation. Le logotype **ReVends** est rendu en `font-display`, avec le **V en Terracotta comme seule couleur du logotype**. Les **4 compositions** du spec sont présentes : navbar (symbole `ink` + wordmark 24/19 px), footer (symbole `champagne` + wordmark 28 px sur `ink`, V `on-dark-accent`), sidebar admin (symbole `champagne` + `REVENDS` sans 800 `tracking-[0.14em]` 20 px), page de connexion (symbole centré 56 px). Zone de protection **8 unités** respectée ; **jamais** de version « plate » à 1 couleur hors favicon ; **jamais** de dégradé sur le glyphe. Le logo est **lien vers `/`** avec `aria-label`, **seul** porteur du nom de la marque en navigation. Livrables associés : `favicon.svg` (32), `favicon.ico` (16/32), `apple-touch-icon.png` (180) et `<meta name="theme-color">` = `#171513` sur pages à navbar sombre, `#F7F3EC` sinon. La **mascotte** (même glyphe, 64 px) n'apparaît **que** dans les états vides et le 404, **une seule** rotation de 8° en 600 ms puis immobile, **jamais** de boucle.
- **CA-V5-134** `[AUDIT]` **Navbar desktop : 5 liens + recherche.** La navbar desktop affiche, dans cet ordre : **Accueil** (`/`), **Découvrir**, **Catégories**, **Nouveautés**, **Vendre** — plus le **champ de recherche avec suggestions** (CA-V5-136), le panier et la zone compte. Chaque lien est un `<Link>` réel vers une route qui **existe** (CA-V5-137) : **zéro lien mort** (RG-V5-08). La navbar est **collante** (comportement existant conservé) et son fond Ivory est **opaque** (pas de transparence illisible sur le contenu au défilement).
- **CA-V5-135** `[EXEC]` **Mobile : bottom nav, pas de navbar desktop.** En dessous de **768 px**, la navbar de liens est **masquée** (`hidden md:flex` ou équivalent — vérifié par rendu, pas par intention) et la **bottom nav** est affichée : 5 onglets **Accueil / Découvrir / Vendre / Favoris / Profil**, dans cet ordre, avec libellé textuel **visible** (pas une icône seule sans nom accessible). L'onglet courant est marqué par `aria-current="page"` et un traitement visuel non coloré seul. La barre est **fixée en bas**, ne recouvre jamais le contenu (marge basse appliquée), et respecte la zone sûre (`env(safe-area-inset-bottom)`). Au-dessus de 768 px, la bottom nav est **absente** du DOM rendu.
- **CA-V5-136** `[TEST]` **Recherche à suggestions : comportement et clavier.** Le champ de recherche de la navbar ouvre un panneau de suggestions **à la frappe** (≥ 2 caractères) : suggestions de **produits** (image, titre, prix `formatFcfa`) et de **catégories**, les deux types distinguables visuellement et pour l'accessibilité. Règles opposables : (a) **debounce ≥ 200 ms** et **annulation** des réponses obsolètes (une réponse arrivée après une frappe plus récente est **ignorée** — test avec réponses retardées hors ordre) ; (b) navigation **clavier** complète : `↓`/`↑` parcourent les suggestions, `Entrée` ouvre l'élément actif, `Échap` ferme et **rend le focus au champ**, `Tab` sort du panneau ; (c) chaque suggestion est un `<Link>` réel (navigation sans JavaScript supplémentaire) ; (d) **pas** de requête pour une chaîne de 1 caractère ; (e) **aucun** résultat → message explicite, jamais un panneau vide muet (CA-V5-143) ; (f) le panneau est annoncé (`role="listbox"` / `aria-activedescendant` ou équivalent) ; (g) la saisie dans le champ **ne déclenche pas** un envoi de formulaire au `Entrée` quand une suggestion est active.
- **CA-V5-137** `[TEST]` **Les 5 cibles de navigation existent et sont testées.** `Découvrir`, `Catégories`, `Nouveautés`, `Vendre` pointent chacun vers une route **déclarée** dans `App.tsx` qui **rend un écran** (pas un 404, pas une redirection silencieuse, pas un lien `href="#"`). Un test automatisé de navigation qui clique chacun des 5 liens depuis la navbar desktop **et** la bottom nav mobile et assert que : (a) l'URL change, (b) le titre de page (heading) principal existe et est unique, (c) **aucune** erreur console. Le menu public est centralisé dans `web/src/lib/menus.ts` (export `publicMenu`) comme `adminMenu` l'est déjà, et il est **le seul** endroit où la liste des liens publics est déclarée : aucune duplication de tableau de liens dans `Navbar.tsx` ou `Footer.tsx` (P4).

#### 5.9.2 Accueil, sections éditoriales et pied de page (CA-V5-138 → 142)

- **CA-V5-138** `[EXEC]` **Hero éditorial présent et exact.** L'accueil ouvre sur un hero typographique portant le message **« Donnez une seconde vie aux belles choses. »** — libellé **exact, point final compris** (libellé PO, tri tranché PO-V5-20 point 1 — « …à ce que vous ne portez plus » est rejeté pour le hero), le montage du spec §4.1 ① : hero `bg-ivory` d'une hauteur minimale **420 px**, **image plein cadre** avec voile `linear-gradient(90deg, ink/80, ink/40)`, **sur-titre Champagne** en capitales `text-xs` `tracking-[0.12em]`, `h1` en `font-display` **72 px** `on-dark`, lede **18 px** `on-dark-muted` borné à 560 px, et **deux** actions — `[Découvrir →]` primaire et `[Vendre un article]` en contour sur blanc — plus l'**encart produit** lifestyle (carte blanche translucide, 1 photo, prix, `[Ajouter]`) posé coin bas-droit **≥ 1280 px** seulement. Contraintes de couleur : le Terracotta est une **ponction** (sur-titre, action primaire, prix), **jamais** un aplat de fond ni un aplat décoratif. Le hero est **lisible sans JavaScript** et **sans débordement horizontal** à 360 px. Le message est présent **une seule fois** dans la page. Le hero est **lisible sans JavaScript** et **sans débordement horizontal** à 360 px. Le message est présent **une seule fois** dans la page.
- **CA-V5-139** `[TEST]` **Les sections « Catégories » et « Tendance » existent, sont alimentées et ne sont pas des coquilles.** L'accueil comporte une section **Catégories** (tuiles des catégories **réellement servies** par l'API, pas une liste codée en dur) et une section **Tendance** (produits réels, source `recent`/`best_offers`). Pour chacune : le contenu provient d'une **donnée réelle** (test : avec une base contenant 3 catégories et 10 produits `AVAILABLE`, les 3 tuiles et ≥ 1 carte sont rendues), l'état **vide** et l'état **erreur** sont traités (CA-V5-143), et l'ordre des sections est **stable** d'un rendu à l'autre. *Pourquoi binaire : une section « statique » qui affiche 0 produit en production est le défaut le plus courant d'un accueil reconstruit.*
- **CA-V5-140** `[TEST]` **La section éditoriale « Ce que vous ne portez plus… » existe et est un vrai contenu.** Une section éditoriale de tonalité éditoriale (titre de la forme « Ce que vous ne portez plus… », corps rédigé, lien « Lire » vers la page éditoriale) est présente sur l'accueil. Elle est **distincte** de la section Tendance : c'est du **contenu éditorial rédigé**, pas une grille de produits. Test : la section est présente dans le DOM, son titre et son corps sont **non vides** (≥ 120 caractères de texte réel, pas un lorem générique), et le lien mène à l'écran n° 21 (§5.9.6).
- **CA-V5-141** `[TEST]` **« Comment ça marche » et « Achetez en toute confiance » : contenu et renvois.** La section **Comment ça marche** présente les étapes en nombre **borné** (3 à 4) et renvoie à la page dédiée (écran n° 20, §5.9.6). La section **Confiance** présente les **4 points** des libellés PO (PO-V5-20 point 2), dans cet ordre et avec ces libellés **exacts** : **Paiement sécurisé** · **Livraison suivie** · **Vendeurs vérifiés** · **Support client**. La fiche produit (CA-V5-145) présente les **3 garanties** : **Paiement sécurisé · Livraison suivie · Protection acheteur** — libellés **identiques** entre bande et fiche pour les points communs (« Paiement sécurisé », « Livraison suivie »). Les deux sections ne contiennent **aucun** bouton inerte : chaque lien est un `<Link>` vers un écran qui existe.
- **CA-V5-142** `[EXEC]` **Footer sombre et complet.** Le pied de page utilise un fond **Charcoal** (ou Chocolat) sur l'ensemble de sa surface, avec un texte **Blanc/Ivory** conforme à CA-V5-130. Il contient **4 colonnes** de liens : **Catégories** (issues de l'API), **Acheter**, **Vendre**, et une colonne **informations/mentions** où **Conditions** et **Confidentialité** sont des **liens réels** vers `/conditions` et `/confidentialite` — créés comme **pages statiques** (PO-V5-20 point 3), contenu générique, accessibles, **zéro lien mort** (RG-V5-08). Le footer est le **seul** emplacement de la variante claire du logo (avec la sidebar admin) et il est atteint sans débordement horizontal à 360 px. **Zéro lien mort** : chaque `<Link>` pointe vers une route déclarée (CA-V5-137).

#### 5.9.3 Catalogue, filtres, tris et fiche produit (CA-V5-143 → 147)

- **CA-V5-143** `[TEST]` **Trois états sur chaque écran de liste — et pas de coquille vide.** Tout écran affichant une liste (catalogue, résultats, catégories, favoris, commandes, articles, ventes, notifications, admin : articles/commandes/paiements/utilisateurs/catégories/historique) traite **les trois états** : **chargement** (squelette ou spinner avec libellé), **vide** (message **spécifique** — « Aucun article dans cette catégorie » ≠ « Aucun résultat pour "chaussure" » — et **une action utile** : « Réinitialiser les filtres » ou « Voir tout » ; jamais « Aucune donnée » ni un tableau vide), **erreur** (message + action « Réessayer » qui **re-déclenche réellement** la requête). Test automatisé sur les 3 états d'au moins 5 écrans représentatifs (catalogue, favoris, mes commandes, mes articles, admin articles) : en état vide, le DOM contient le message spécifique **et** une action cliquable ; en état erreur, l'action Retry déclenche une nouvelle requête réseau (le compteur de requêtes du test augmente de 1).
- **CA-V5-144** `[EXEC]` **Filtres du catalogue — 8 familles, chacune réellement appliquée.** Les 8 familles exigées sont présentes : **catégorie** (et sous-catégorie), **prix** (min/max), **état**, **localisation**, **marque**, **taille**, **couleur**, **date**. Contraintes opposables : (a) chaque filtre **retourne réellement des résultats différents** — test automatisé : pour chaque famille, un filtre restrictif produit un **ensemble strictement plus petit** que le sans-filtre, et le sous-ensemble est **le sous-ensemble attendu** ; (b) une valeur **inconnue** ou hors plage ne provoque **jamais** de 5xx et **retombe** sur le catalogue non filtré (P7) ; (c) l'état des filtres est **réfléchi dans l'URL** (partageable, rechargeable) et **réinitialisable en un geste** ; (d) un filtre actif est **indistinguable** d'un filtre inactif sans couleur (P4 / accessibilité) ; (e) **si `PO-V5-18` n'est pas tranché**, les familles « taille », « couleur » et « date » ne sont **pas** livrées en P0/P1 : dans ce cas, ce critère est **exécuté sur les 6 familles existantes** et l'écart est consigné — **jamais** un filtre affiché qui ne filtre pas (RG-V5-08).
- **CA-V5-145** `[TEST]` **Tris du catalogue — 4 valeurs, ordre total et sans mélange.** Les 4 tris exigés sont disponibles : **Pertinence**, **Plus récent**, **Prix croissant**, **Prix décroissant**. Contraintes : (a) « Prix croissant » est **non décroissant** et « Prix décroissant » est **non croissant** sur une page de 12+ produits (assertion ordre, sur un jeu dont les prix sont distincts) ; (b) « Plus récent » est **non croissant** en `created_at` (assertion sur 12+ produits) ; (c) **« Pertinence » n'est pas un alias déguisé de « Plus récent »** : test qui construit un jeu où ces deux tris donnent des **ordres différents** (produit de sortie diverse, ancienneté inverse) ; (d) le tri et la **section** ne sont **jamais** envoyés ensemble (invariant existant `SearchPage.tsx:57-60`, non régressé) ; (e) le tri est **préservé** dans l'URL et au retour depuis la fiche produit ; (f) `PO-V5-18` non tranché ⇒ « Pertinence » est livré en **P2** et ce critère est exécuté sur les 3 tris existants, écart consigné.
- **CA-V5-146** `[TEST]` **Page catégorie : hero, filtres, pagination.** Une page catégorie affiche : un **hero** propre à la catégorie (nom de catégorie, nombre d'articles **réel**, visuel sobre — **pas** la même image que l'accueil), la **grille** de produits de cette catégorie (**bornée à cette catégorie et à ses sous-catégories**, jamais d'autres catégories — test : un produit d'une autre catégorie n'apparaît pas), les **filtres** (CA-V5-144) **restreints aux valeurs disponibles dans la catégorie**, et une **pagination** (composants partagés `Pagination`, pas une duplication — P4). Le compteur d'articles affiché est **égal** au nombre d'articles réellement listés (pas d'arrondi, pas de « + » trompeur). Une catégorie **inexistante** rend un état explicite, **jamais** une page vide sans explication.
- **CA-V5-147** `[TEST]` **Fiche produit premium — contenu obligatoire, Forbidden interaction absente.** La fiche affiche **tous** ces éléments, chacun **asserté par test** : galerie multi-photos avec **vue agrandie** (au clic et au survol, et **au clavier** — la vue agrandie est atteignable sans souris) ; **badges** d'état (neuf / comme neuf / bon / fair — valeurs de l'énumération existante) ; **prix** et **ancien prix barré** quand `old_price` existe ; **montant d'économie** en FCFA **et** en pourcentage (le badge « économie » est calculé, pas recopié) ; **localisation**, **marque**, **état** ; **deux CTA** — « Acheter maintenant » et « Ajouter au panier » — avec des **comportements distincts** (achat direct → checkout ; panier → panier, avec le flash vert existant **non régressé**) ; les **3 garanties** (Paiement sécurisé / Livraison suivie / Protection acheteur) ; la section **« Vous aimerez aussi »** (≤ 5 produits, **non vide** quand la catégorie a des frères) ; le **bloc vendeur** en lecture seule avec le lien « Voir le profil du vendeur » (CA-V5-189) et **sans aucun bouton « Contacter »** (CF-04 : `grep -rn "Contacter\|contacter\|mailto:\|tel:" web/src/pages/ProductPage.tsx` ne retourne **aucune** occurrence de contact — le use case est supprimé par C6, il ne ressuscite pas par l'interface) ; le **bandeau « Article vendu »** et le **bandeau « réservé »** (non régressés, CA-V5-100). Le prix est formaté par `formatFcfa` et **jamais** par un format maison (non-régression CA-V5-044).

#### 5.9.4 Panier, paiement en 4 étapes, suivi de colis, espaces client et vendeur (CA-V5-148 → 150)

- **CA-V5-148** `[TEST]` **Checkout en 4 étapes, parcours d'achat intact.** Le paiement se déroule en **4 étapes** : (1) **Livraison** (coordonnées, adresse,Instructions de livraison) · (2) **Paiement** (moyen de paiement, référence) · (3) **Vérification** (récapitulatif complet : articles, frais, commission si applicable, total, bouton « Retour » qui **reculent réellement** d'un cran dans la machine d'états) · (4) **Confirmation** (numéro de commande, prochaines étapes, liens « Suivre ma commande » / « Continuer mes achats »). Contraintes opposables : (a) un **fil d'étapes** visible avec l'étape courante marquée (`aria-current="step"`) ; (b) **retour arrière possible** de l'étape 3 vers 2 **et** de 2 vers 1 **sans perte de saisie** (test : remplir, revenir, avancer, la valeur est conservée) ; (c) **une étape ne peut pas être sautée** (accès direct à l'étape 3 sans les étapes précédentes ⇒ redirection vers l'étape 1) ; (d) la **validation d'une étape** est réelle (champs requis, format) et le bouton d'étape suivante est **désactivé avec un motif** tant que l'étape est invalide (jamais de bouton inerte sans explication — RG-V5-08) ; (e) **la commande créée est identique** à celle créée par le flux à page unique (même nombre de commande, même montant, même commission, même statut, mêmes notifications) — comparaison sur un jeu figé ; (f) **double soumission impossible** (le bouton passe en état « envoi… » et une seconde commande n'est pas créée).
- **CA-V5-149** `[EXEC]` **Suivi de colis : timeline Terracotta.** Le suivi affiche une **timeline verticale** des étapes de commande, avec : l'étape courante **mise en évidence en Terracotta** (et pas seulement en couleur — libellé + trait d'état), les étapes franchies visuellement distinctes des étapes à venir, la date de chaque étape franchie, et l'**état vide/erreur** traité. Contraintes : (a) la timeline est rendue par le **composant partagé** `OrderTimeline` (pas une duplication locale — P4) ; (b) l'ordre des étapes est celui de la **machine à états serveur** (12 statuts), pas un ordre décoratif ; (c) une commande **sans** événement de suivi affiche un état **explicite**, jamais une timeline vide sans texte ; (d) la progression est annoncée aux lecteurs d'écran (`aria-label` portant l'étape et la date, ou texte équivalent) ; (e) **aucune** donnée de tiers (nom, e-mail, téléphone) n'apparaît (RG-V5-06).
- **CA-V5-150** `[TEST]` **Espace vendeur : commission 10 % affichée et création d'annonce en 5 étapes.** L'espace vendeur affiche la **commission de 10 %** de façon **explicite et exacte** : l'écran « Mes ventes » et le détail de vente affichent le montant de commission et le **net vendeur**, et la **simulation** d'une vente affiche le même taux. La valeur provient de la **source de vérité** (configuration serveur `COMMISSION_RATE` / valeur persistée sur la commande) — **jamais** d'un « 10 % » écrit en dur dans le JSX (test : la valeur affichée suit la valeur de la commande, pas une constante d'affichage). La **création d'annonce** se déroule en **5 étapes** : (1) **Photos** · (2) **Catégorie & détails** · (3) **Prix & état** · (4) **Localisation & livraison** · (5) **Récapitulatif & publication**. Contraintes : retour arrière **sans perte de saisie** ; étape 5 affiche le **récapitulatif exact** de ce qui sera publié ; la publication depuis l'étape 5 crée **un seul** produit `PENDING` et le compte du vendeur augmente de 1 ; **une** photo est **au minimum** requise avec un message d'erreur clair ; le produit publié porte `PENDING` et **non** `AVAILABLE` (la modération C4 n'est pas contournée — test : statut persisté = `PENDING`).

#### 5.9.5 Connexion unique, admin, mobile, micro-interactions, accessibilité (CA-V5-151 → 159)

- **CA-V5-151** `[TEST]` **UNE SEULE page de connexion pour tous les rôles — verrou.** Il existe **exactement une** route et **un** écran de connexion : `/login`. `grep -rn "admin/login\|AdminLogin" web/src/` ne retourne **aucune** occurrence ; `App.tsx` ne déclare **qu'une** route de connexion. Le **rôle est déterminé après** la connexion : après `POST /api/auth/login`, la redirection dépend **exclusivement** du rôle renvoyé par l'API — `admin` → `/admin`, `user` → `/`, et **jamais** l'inverse. Test des **3 rôles × 3 points d'entrée** (connexion directe, `?next=` depuis une page protégée, `?next=` depuis `/admin/*`) : (a) chaque `user` atterrit sur `/`, **jamais** sur `/admin` ni sur un écran 403 (ARB-V5-02, CA-V5-025) ; (b) aucun `admin` n'est renvoyé vers une page qui tente une requête `user` interdite (CA-V5-024) ; (c) **aucune** boucle de redirection (navigation bornée à 10 sauts) ; (d) le paramètre `next` est **conservé** à la connexion pour un `user` qui tente `/admin` (retour sur `/`, pas sur `/admin`).
- **CA-V5-152** `[EXEC]` **Admin : sidebar sombre premium, 8 entrées, sans régression RBAC.** La sidebar de l'administration utilise un fond **Charcoal/Chocolat** (tokens, P1) et présente les **8 entrées** de `adminMenu` (`menus.ts:6-17`) : Dashboard, Articles en attente, Articles, Commandes, Paiements vendeurs, Utilisateurs, Catégories, Historique. Contraintes : (a) l'entrée active est marquée par `aria-current="page"` **et** un traitement visuel non coloré seul ; (b) la sidebar est **invisible** pour un non-admin — `grep -rn "adminMenu" web/src/` ne retourne que des occurrences sous `pages/admin/` (CA-V5-027 **non régressé**) ; (c) le badge « Articles en attente » conserve son compteur ; (d) le comportement existant sous 968 px (colonne unique + drawer) est **conservé** (CA-V5-038 **non régressé**) ; (e) les 9 pages admin restent utilisables à 1024 px et 1280 px (CA-V5-038 **non régressé**).
- **CA-V5-153** `[EXEC]` **Mobile-first réel : 3 largeurs de référence, zéro débordement.** Sur les **3** largeurs de référence demandées — **390×844**, **375×812**, **360×800** — et pour les **50** écrans de l'inventaire : (a) `document.documentElement.scrollWidth <= clientWidth` (**zéro** débordement horizontal) ; (b) **aucun** texte tronqué sans possibility de le lire (pas de `text-overflow: ellipsis` sur un libellé de prix, de bouton ou d'état) ; (c) **toute** cible interactive fait **≥ 44×44 px** de surface cliquable ; (d) la **bottom nav** et la **CTA sticky** ne masquent jamais le contenu ni un bouton (marge basse respectée) ; (e) les images de produit ont des **dimensions réservées** (`width`/`height` ou `aspect-ratio`) — **zéro** décalage de mise en page au chargement. La recette fournit une **capture par écran et par largeur** (150 captures) : c'est la preuve, pas l'absence de plainte.
- **CA-V5-154** `[TEST]` **Grille catalogue : 2 colonnes sur mobile, multi-colonnes sur desktop.** À 360/375/390 px, la grille de produits affiche **exactement 2 colonnes** (assertion sur la géométrie : 2 cartes sur une même ligne, largeur de carte ≥ 150 px) ; à 768 px, **3 colonnes** ; à 1280 px, **4 colonnes ou plus**. La carte est **entièrement** lisible sans zoom : image, titre sur **2 lignes maximum** avec repli, prix `formatFcfa`, état, localisation. **Aucune** carte ne déborde de son conteneur, **aucune** n'a une hauteur cassée par un titre de longueur extrême (test : un titre de 120 caractères ne déforme pas la carte — la hauteur de la rangée reste homogène à ± 2 px dans la rangée, exigence déjà posée pour le dashboard en CA-V5-039).
- **CA-V5-155** `[EXEC]` **Micro-interactions : une liste fermée, bornée et réspectant l'OS.** Les micro-interactions livrées sont **exactement** celles de la liste fermée : (1) apparition/disparition d'un élément (catégorie, overlay de suggestions) ; (2) survol/pression d'un bouton et d'une carte ; (3) changement d'état d'un favori (cœur) ; (4) badge panier mis à jour après ajout ; (5) toast de confirmation. Contraintes : (a) **durée ≤ 250 ms**, easing déclaré, **zéro** animation > 400 ms sur un chemin d'usage ; (b) **zéro** animation de surcharge (*deoyo*), de rebond élastique ou de parallaxe ; (c) `prefers-reduced-motion: reduce` **désactive** effectivement les animations non essentielles (vérifié par inspection de la règle, pas par intention) ; (d) **zéro** animation bloquante l'entrée (l'utilisateur peut valider un formulaire pendant l'animation) ; (e) une micro-interaction **n'est jamais le seul retour** d'une action (RG-V5-08) ; (f) **zéro** animation purement décorative qui consomme du CPU au repos (pas de boucle infinie hors du squelette de chargement, qui est borné et s'arrête à l'arrivée des données).
- **CA-V5-156** `[AUDIT]` **Accessibilité des 50 écrans.** Sur les **50** écrans : (a) **un seul** `<h1>` par écran, hiérarchie `h1→h2→h3` **sans saut** ; (b) toute image informative a un `alt` **décrivant le contenu** (le nom du produit), toute image décorative a `alt=""` + `aria-hidden` ; (c) tout bouton/ lien à icône a un **nom accessible** (CA-V5-043 étendu) ; (d) **focus visible** (contraste ≥ 3:1, contour non supprimé) sur **tous** les éléments interactifs, y compris dans la bottom nav et les overlays ; (e) le **focus est piégé** dans une modale et **restitué au déclencheur** à la fermeture ; (f) chaque état de chargement a un libellé ; (g) chaque message d'erreur de champ est associé à son champ (`aria-describedby`) ; (h) la **navigation clavier** permet d'**accomplir** le parcours critique (parcourir une liste → ouvrir une fiche → ajouter au panier → aller au panier → valider) **sans souris** ; (i) le zoom à 200 % ne supprime aucun contenu ni aucune action ; (j) `lang="fr"` sur `<html>`. Contrôle : audit manuel des 50 écrans **+** le test automatisé a11y de CA-V5-117 (étendu aux 50 écrans), avec la sortie versée au compte rendu.
- **CA-V5-157** `[EXEC]` **Non-régression C8 malgré le re-thème (CF-01).** Le re-thème **ne change aucun comportement**. Preuves exigées, sur le jeu de recette : (a) les **27 routes** déclarées avant C9 répondent **toujours** (HTTP et rendu) ; (b) les parcours **inscription → vente → modération → achat → paiement → livraison** sont rejoués de bout en bout et produisent les **mêmes** effets observables (mêmes statuts, mêmes notifications, mêmes emails, mêmes montants) — comparaison avec la référence pré-C9 ; (c) **zéro** changement de forme de réponse API : le diff des charges utiles sur les endpoints échantillonnés est **vide** hors `hasActiveOrder` (PO-V5-15) ; (d) les **52** tests front et les tests serveur restent verts ; (e) `docs/api.md` ne **subit** que les changements de CF-02, et **aucun autre**.
- **CA-V5-158** `[TEST]` **Les 50 écrans obéissent aux principes P1/P2 (zéro dette de style).** Sur l'ensemble du front livré en C9 : (a) `grep -rn "style={{" web/src/` ne retourne **aucune** occurrence métier ; (b) `grep -rn "shadow-\[\|bg-\[#\|text-\[#\|border-\[#" web/src/` ne retourne **aucune** occurrence ; (c) aucune classe Tailwind **inexistante** (le test anti-classe de CA-V5-047, **étendu à US-V5-09**, passe sur l'intégralité de `web/src/`) ; (d) **zéro** composant dupliqué pour un comportement présent sur **≥ 2** écrans (nav, footer, carte produit, empty state, skeleton, badge, stepper, bottom nav, sticky CTA) — la liste des **9** composants transversaux de C9 est celle de `docs/design-system.md` et chacun est importé par **au moins 2** écrans (P4) ; (e) `tsc -b` et `tsc --noEmit` en code 0.
- **CA-V5-159** `[EXEC]` **Audit visuel des 50 écrans — la preuve de « premium ».** Les **50** écrans sont capturés (3 largeurs mobiles + 1 desktop = 200 captures), montés en grille dans le compte rendu, et revus conjointement par `@frontend` + `@cahier-des-charges` avec une grille de contrôle **binaire** : (a) **zéro** hexadécimal hors palette (CA-V5-129) ; (b) **zéro** ratio de contraste en échec (CA-V5-130) ; (c) alignements, marges de bloc, rayons et ombres **identiques** pour des éléments de même rôle (critère déjà posé en CA-V5-045, **étendu aux écrans publics**) ; (d) **zéro** élément qui déborde, se chevauche ou est tronqué ; (e) **zéro** écran au style « par défaut de bibliothèque » (bouton sans traitement, tableau sans en-tête, carte sans ombre) ; (f) toute divergence **validée** est **justifiée par écrit** dans le code ou le compte rendu. Une variation **non justifiée** sur l'un des 6 points est un **FAIL**, même si le rendu est *agréable*.

#### 5.9.6 Inventaire des 50 écrans (CA-V5-160 → 209, un critère par écran)

> **Règle de présence.** Chaque écran de la direction artistique de l'utilisateur possède **un `CA-V5-xxx` propre**, borné à : *la route existe et rend un écran* + *les blocs exigés sont présents* + *les 3 états sont traités* (lorsque l'écran est une liste) + *le parcours principal fonctionne au clavier*. Un écran **P2** non livré est un **écart consigné** (PO-V5-19), pas un critère tacitement accepté.

| # | Écran | Route / état | Existant ? | Prio | Critère |
|---|---|---|---|---|---|
| 1 | Accueil (hero + sections) | `/` | oui | P0 | **CA-V5-160** |
| 2 | Découvrir | `/decouvrir` | **NON** (F17) | P0 | **CA-V5-161** |
| 3 | Index des catégories | `/categories` | **NON** | P0 | **CA-V5-162** |
| 4 | Page catégorie (hero + filtres) | `/category/:slug` | oui (à hero-ifier) | P0 | **CA-V5-163** |
| 5 | Catalogue / recherche (filtres + tri) | `/search` | oui | P0 | **CA-V5-164** |
| 6 | Recherche — panneau de suggestions | `/search` (état) | **NON** (F17) | P1 | **CA-V5-165** |
| 7 | Fiche produit premium | `/catalogue/:slug` | oui | P0 | **CA-V5-166** |
| 8 | Fiche — galerie agrandie (zoom) | état | **NON** | P1 | **CA-V5-167** |
| 9 | Panier | `/panier` | oui | P0 | **CA-V5-168** |
| 10 | Checkout étape 1 — Livraison | `/commande` | à refondre (F18) | P0 | **CA-V5-169** |
| 11 | Checkout étape 2 — Paiement | `/commande` | à refondre | P0 | **CA-V5-170** |
| 12 | Checkout étape 3 — Vérification | `/commande` | à refondre | P0 | **CA-V5-171** |
| 13 | Checkout étape 4 — Confirmation | `/confirmation` | oui | P0 | **CA-V5-172** |
| 14 | Suivi de colis (timeline Terracotta) | `/commandes/:id/suivi` | oui (à re-teinter) | P0 | **CA-V5-173** |
| 15 | Connexion (unique, tous rôles) | `/login` | oui (déjà unique) | P0 | **CA-V5-174** |
| 16 | Inscription | `/register` | oui | P0 | **CA-V5-175** |
| 17 | Page 404 | `*` | oui | P1 | **CA-V5-176** |
| 18 | Mentions légales / CGU | `/mentions` | **NON** | P2 | **CA-V5-177** |
| 19 | « Achetez en toute confiance » | `/confiance` | **NON** | P2 | **CA-V5-178** |
| 20 | « Comment ça marche » | `/comment-ca-marche` | **NON** | P2 | **CA-V5-179** |
| 21 | Éditorial « Ce que vous ne portez plus… » | `/journal/seconde-vie` | **NON** | P2 | **CA-V5-180** |
| 22 | Favoris | `/favoris` | **NON** (F17) | P1 | **CA-V5-181** |
| 23 | Vus récemment | `/vus-recemment` | à extraire | P2 | **CA-V5-182** |
| 24 | Accueil client (hub) | `/` (variante connecté) | oui | P0 | **CA-V5-183** |
| 25 | Mes commandes (liste) | `/mes-commandes` | oui | P0 | **CA-V5-184** |
| 26 | Détail de commande | `/mes-commandes/:id` | oui | P0 | **CA-V5-185** |
| 27 | Notifications | `/notifications` | oui | P1 | **CA-V5-186** |
| 28 | Profil | `/profil` | oui | P0 | **CA-V5-187** |
| 29 | Profil — sécurité (mot de passe) | `/profil` (onglet) | à vérifier | P1 | **CA-V5-188** |
| 30 | Tableau de bord vendeur (gains, commission) | `/mes-articles` (haut de page) | **NON** | P0 | **CA-V5-189** |
| 31 | Mes articles (liste + statuts) | `/mes-articles` | oui | P0 | **CA-V5-190** |
| 32 | Vendre étape 1 — Photos | `/vendre` | à refondre (F18) | P0 | **CA-V5-191** |
| 33 | Vendre étape 2 — Catégorie & détails | `/vendre` | à refondre | P0 | **CA-V5-192** |
| 34 | Vendre étape 3 — Prix & état | `/vendre` | à refondre | P0 | **CA-V5-193** |
| 35 | Vendre étape 4 — Localisation & livraison | `/vendre` | à refondre | P0 | **CA-V5-194** |
| 36 | Vendre étape 5 — Récapitulatif & publication | `/vendre` | à refondre | P0 | **CA-V5-195** |
| 37 | Modifier une annonce | `/mes-articles/:id/modifier` | **NON** (route) | P1 | **CA-V5-196** |
| 38 | Mes ventes | `/mes-ventes` | **NON** (route) | P0 | **CA-V5-197** |
| 39 | Profil vendeur public (**sans Contacter**, CF-04) | `/vendeur/:id` | **NON** | P1 | **CA-V5-198** |
| 40 | Admin — Dashboard | `/admin` | oui | P0 | **CA-V5-199** |
| 41 | Admin — Articles en attente | `/admin/articles-en-attente` | oui | P0 | **CA-V5-200** |
| 42 | Admin — Articles (dont « Supprimer ») | `/admin/articles` | oui | P0 | **CA-V5-201** |
| 43 | Admin — Commandes (liste) | `/admin/commandes` | oui | P0 | **CA-V5-202** |
| 44 | Admin — Commande (détail) | `/admin/commandes/:id` | oui | P0 | **CA-V5-203** |
| 45 | Admin — Paiements vendeurs | `/admin/paiements` | oui | P0 | **CA-V5-204** |
| 46 | Admin — Utilisateurs | `/admin/utilisateurs` | oui | P1 | **CA-V5-205** |
| 47 | Admin — Catégories | `/admin/categories` | oui | P1 | **CA-V5-206** |
| 48 | Admin — Historique | `/admin/historique` | oui | P1 | **CA-V5-207** |
| 49 | Bottom nav mobile (5 onglets) | composant transversal | **NON** | P0 | **CA-V5-208** |
| 50 | Accueil mobile (2 colonnes, sections empilées) | `/` @390 px | à faire | P0 | **CA-V5-209** |

> **Numérotation de la section.** Les critères de structure de C9 sont **CA-V5-128 → CA-V5-159** (32 critères : fondations, navigation, accueil, catalogue et fiche, parcours, mobile, a11y, non-régression, preuve d'audit — récapitulés en §5.9.7). L'inventaire des 50 écrans occupe **CA-V5-160 → CA-V5-209** (un critère par écran). Le dernier critère du cahier est **CA-V5-210** (§5.10, suivi de dette). Le tableau ci-dessus fait foi : toute référence de ce type doit être vérifiée contre lui.

#### 5.9.7 Résumé des 32 critères de structure (CA-V5-128 → 159)

| Critère | Objet | Preuve |
|---|---|---|
| CA-V5-128 | Palette = 6 marques + tokens d'extension du **spec §1.1**, ancienne palette supprimée | AUDIT |
| CA-V5-129 | Zéro hex hors du jeu de tokens du spec §1.1 ; les 20 interdits absents ; zéro classe `-[#…]` / `style={{}}` | EXEC |
| CA-V5-130 | Contrastes WCAG AA **mesurés** sur les paires obligatoires | EXEC |
| CA-V5-131 | `Plus Jakarta Sans` + `DM Serif Display` **figées par le spec §2**, woff2 auto-hébergées, sans CDN, sans FOIT | AUDIT |
| CA-V5-132 | Serif réservé à la liste fermée du spec §1.6 ; jamais < 20 px ni sur un chiffre ; pas de faux gras | AUDIT |
| CA-V5-133 | Symbole « La Boucle » **exact** (spec §2), 4 compositions, V Terracotta, favicons + `theme-color` | AUDIT |
| CA-V5-134 | Navbar desktop : 5 liens + recherche, aucun lien mort | AUDIT |
| CA-V5-135 | Mobile : bottom nav 5 onglets, navbar desktop absente | EXEC |
| CA-V5-136 | Recherche à suggestions : debounce, clavier, aria, annulation | TEST |
| CA-V5-137 | 5 cibles de nav existantes, `publicMenu` centralisé dans `menus.ts` | TEST |
| CA-V5-138 | Hero éditorial exact (message PO « Donnez une seconde vie aux belles choses. », voile, sur-titre, 2 actions, encart ≥ 1280) | EXEC |
| CA-V5-139 | Sections Catégories + Tendance alimentées par des données réelles | TEST |
| CA-V5-140 | Section éditoriale « Ce que vous ne portez plus… » (vrai contenu) | TEST |
| CA-V5-141 | « Comment ça marche » + « Confiance » (**4 points PO** : Paiement sécurisé · Livraison suivie · Vendeurs vérifiés · Support client) | TEST |
| CA-V5-142 | Footer sombre 4 colonnes, 0 lien mort ; liens **réels** vers `/conditions` et `/confidentialite` (PO-V5-20) | EXEC |
| CA-V5-143 | 3 états (vide/chargement/erreur) sur chaque écran de liste | TEST |
| CA-V5-144 | 8 familles de filtres, chacune réellement appliquée (taille/couleur/date → V6, PO-V5-18 : 6 familles en V5) | EXEC |
| CA-V5-145 | 4 tris (Pertinence inclus), ordre total, « Pertinence » ≠ « Plus récent » ; fiche produit = 3 garanties PO | TEST |
| CA-V5-146 | Page catégorie : hero, grille bornée, pagination, compteur exact | TEST |
| CA-V5-147 | Fiche produit premium, **sans** action « Contacter » (CF-04) | TEST |
| CA-V5-148 | Checkout 4 étapes, retour sans perte, commande identique | TEST |
| CA-V5-149 | Suivi de colis : timeline Terracotta, composant partagé, 3 états | EXEC |
| CA-V5-150 | Commission 10 % exacte + création d'annonce en 5 étapes | TEST |
| CA-V5-151 | **Une seule** page de connexion, rôle déterminé après login | TEST |
| CA-V5-152 | Admin : sidebar sombre, 8 entrées, RBAC et 968 px non régressés | EXEC |
| CA-V5-153 | Mobile 390×844 / 375×812 / 360×800, zéro débordement, 150 captures | EXEC |
| CA-V5-154 | 2 colonnes mobile / 3 à 768 / 4+ à 1280, hauteur de rangée homogène | TEST |
| CA-V5-155 | Micro-interactions : liste fermée, ≤ 250 ms, `prefers-reduced-motion` | EXEC |
| CA-V5-156 | Accessibilité des 50 écrans (h1 unique, alt, focus, clavier, zoom) | AUDIT |
| CA-V5-157 | Non-régression C8 : 27 routes, parcours identiques, contrats d'API inchangés hors CF-02 | EXEC |
| CA-V5-158 | P1/P2 sur tout le front, 9 composants transversaux partagés | TEST |
| CA-V5-159 | Audit visuel des 50 écrans en grille, 6 points de contrôle binaires | EXEC |

**Définition de chaque critère d'écran (CA-V5-160 → CA-V5-209).** Chaque écran est jugé par la **conjonction** de ces quatre vérifications, et par rien d'autre — pas d'appréciation :

1. **Présence** — la route est déclarée dans `App.tsx`, rend un écran (pas de 404, pas de redirection), et le titre de page principal existe et est unique (`<h1>` unique, CA-V5-156).
2. **Blocs exigés** — les blocs décrits pour cet écran dans §5.9.1 à §5.9.5 (hero, sections, filtres, galerie, garanties, étapes de checkout, timeline de suivi, commission, sidebar, bottom nav…) sont présents **et** alimentés par des **données réelles** (test : avec la base de recette, aucun bloc n'est vide en cas de succès). Un écran dont le contenu est décrit **uniquement** dans la direction artistique de l'utilisateur (ligne « Écran » du tableau) est jugé sur son **intitulé et son rôle fonctionnel** : route qui rend, blocs listés, parcours principal atteignable.
3. **États** — pour un écran de liste : chargement / vide (message **spécifique** + action utile) / erreur (+ Retry réelle) selon CA-V5-143. Pour un écran de formulaire : champs validés, message d'erreur associé, état d'envoi.
4. **Parcours** — l'action principale de l'écran est **réalisable entièrement au clavier** et aboutit à un résultat observable (CA-V5-156 h).

- **CA-V5-160 à CA-V5-209** `[TEST]` — **Les 50 écrans de l'inventaire §5.9.6 sont présents et conformes.** Le test d'inventaire est **paramétré** sur les 50 écrans (une ligne de table par écran, pas 50 blocs manuels, même exigence que CA-V5-020) et assert les 4 vérifications ci-dessus. Le compte rendu donne le verdict **individuel** des 50 lignes : `PASS` ou `FAIL` avec preuve. **Un écran P2 livré tardivement doit avoir été **préalablement** déclaré absent** (écart consigné) — un écran ni livré ni déclaré absent est un **FAIL**, pas un oubli. *Ce bloc est la matérialisation du « chaque écran majeur listé a son critère de présence » : la numérotation est 1 écran = 1 critère, sans regroupement opportuniste.*
- **Note de lecture (non numérotée).** Le cahier garantit une numérotation **continue et sans doublon** (Annexe B) : un critère surnommé « *bis* » est un critère **invalide** (RG-V5-10). Le tableau d'inventaire §5.9.6 fait foi de l'attribution `écran → CA`.

---

### 5.10 Dette connue, assumée et suivie (hors périmètre V5)

> Une dette **écrite** avec son propriétaire, son impact et sa condition de sortie n'est pas une dette perdue. Cette section est la preuve que les arbitrages « hors périmètre » ont laissé une **trace actionnable** et non un oubli silencieux.

| # | Dette | Impact connu | Décision | Ticket de sortie | Critère de suivi |
|---|---|---|---|---|---|
| **DET-01** | **Compteur `sales: 0`** — `getPublicUser`/`getPublicProduct` (`products.service.ts:434-438`) expose `seller.sales`, mais `users` n'a **aucune** colonne `sales` : la valeur est recalculée par un `COUNT(*)` qui **ne filtre pas** `deleted_at IS NULL`. Un produit `SOLD` **supprimé** continue donc de compter dans le badge « N ventes » du vendeur sur la fiche produit. Le comportement est **figé par test** (`server/test/unit-utils.test.ts:47`) et protégé par CA-V5-074 (identité de charge utile). | Faible et **borné** : uniquement l'exactitude d'un badge cosmétique sur la fiche produit. Aucun impact sur le tri, le filtre, le prix, la commande ni le paiement. **Aucun** impact sur les 28 points de lecture de la catégorie A. | **PO-V5-16 — hors périmètre V5, comportement conservé.** Correction = changer la charge utile d'un endpoint public → interdit par P5 sans version de contrat. | À ouvrir au premier chantier post-V5 ; correction par `deleted_at IS NULL` + alignement du test `unit-utils.test.ts:47` + version `docs/api.md`. | **CA-V5-210** |
| **DET-02** | **Enum `'product.contact'` conservée en base et inutilisée** — retrait impossible sans réécrire le type PostgreSQL. | Aucun impact fonctionnel ; une valeur morte dans le schéma. | **ARB-V5-08** — conservation volontaire. | Ticket de migration de schéma (hors V5) : recréer l'enum sur la liste filtrée. | CA-V5-099, 103 |
| **DET-03** | **Rate limit en mémoire, par instance** — non partagé entre instances. | **Nul** à 1 instance. **×N** dès 2 instances : la limite de 300 req/min/IP est comptée indépendamment par chaque instance. | **PO-V5-17 — documenté et accepté pour 1 instance.** | Compteur partagé (Redis) **obligatoire avant** toute mise à l'échelle horizontale. | CA-V5-146 |
| **DET-04** | **Pas d'UI de restauration d'un produit supprimé** — la réversibilité est une opération de base (`UPDATE products SET deleted_at = NULL WHERE id = $1`). | Un administrateur ne peut pas annuler une suppression depuis l'interface. | **ARB-V5-06, §2.2** — hors périmètre V5, assumé. | Écran de restauration dans l'admin (C10), avec la trace `admin_actions` et la notification vendeur. | CA-V5-064 |
| **DET-05** | **Cache HTTP / `ETag` sur les lectures publiques** — `Cache-Control: private, no-store` partout sauf `/api/categories` et `/api/banners` (`PO-V5-07`). | Chaque visite catalogue déclenche une requête API ; le seuil p95 de 100 ms tient (mesuré), mais le budget de requêtes est atteint sans mutualisation côté client. | **PO-V5-07** — décision actée. | Évaluation d'un cache applicatif après la mise en charge réelle. | CA-V5-094 |

- **CA-V5-210** `[EXEC]` **Chaque dette de ce §5.10 est suivie, pas seulement écrite.** Un **ticket de dette** existe pour chacune des 5 lignes `DET-01`→`DET-05`, avec : l'identifiant du ticket, la **condition de sortie** (ce qui devra être vrai pour le fermer), le **responsable** et l'**échéance** de traitement. Critère binaire au moment de la clôture du sprint : le nombre de dettes **sans ticket** est **zéro**, et le nombre de dettes **avec ticket** est **5**. Une dette rayée du §5.10 sans ticket et sans correctif livré **casse** ce critère (c'est le mode d'échec habituel : la dette disparaît du document et personne ne la reprend).

---

## 6. Règles de gestion (RG-V5)

| # | Règle | Contenu | Critères concernés |
|---|---|---|---|
| **RG-V5-01** | **Réversibilité des données** | Aucun `DELETE` physique sur une donnée métier. Toute suppression de produit est un `soft delete` (`deleted_at`), et la requête de restauration est fournie au compte rendu. L'historique des commandes est **immuable** : aucune suppression ne doit empêcher la lecture d'une commande passée. | CA-V5-058, 059, 062, 064 |
| **RG-V5-02** | **Traçabilité** | Toute action d'administration à effet durable (suppression de produit, paiement vendeur, annulation) produit une ligne dans `admin_actions` avec cible et acteur, retrouvable dans `GET /api/admin/history`. | CA-V5-061 |
| **RG-V5-03** | **Notification de l'intéressé** | Une action d'administration portant sur un bien d'un tiers notifie le propriétaire dans la **même transaction**, une et une seule fois, avec un message exploitable. | CA-V5-060 |
| **RG-V5-04** | **Protection de l'intégrité des commandes** | Un produit lié à une commande **active** ne peut pas être supprimé ; l'action est bloquée côté API **et** désactivée côté UI avec motif. Un produit dont toutes les commandes sont terminées peut l'être. | CA-V5-065 |
| **RG-V5-05** | **Champs fonctionnels = champs persistés** | Toute valeur d'énumération créée ou suggérée par le front doit exister dans le schéma. Le renommage d'une valeur d'énumération en base exige une migration **non destructive** ; ici, la valeur `'product.contact'` est **conservée** (inutilisée) pour éviter toute réécriture du type. | CA-V5-099, 068 |
| **RG-V5-06** | **Robustesse et propreté de l'API** | Toute entrée invalide, tronquée, surdimensionnée ou hostile produit un `4xx` documenté. Jamais de `5xx`, jamais de fuite de pile d'appels, jamais d'injection SQL. La surface publique (codes, formes de réponse, bornes) est **inchangée** sauf ajout explicite. | CA-V5-018, 021, 088 |
| **RG-V5-07** | **Journalisation utile et minimale** | Un seul format de log, structuré et minimal : horodatage, niveau, message, chemin, corrélation, code d'erreur. Aucun secret, aucune donnée personnelle (mot de passe, token, corps complet, email, téléphone). | CA-V5-013, 090, 021 |
| **RG-V5-08** | **Cohérence d'interface** | Toute action visible doit être **réellement** exécutable : pas de bouton sans effet, pas de champ sans validation, pas d'état vide non traité, pas de modale sans issue. Une action doit être possible **pour toutes** les valeurs d'énumération (ex. libellé « Supprimer » = « Désactiver »). | CA-V5-037, 034, 070 |
| **RG-V5-09** | **Perte de données interdite** | Un chemin d'interface ou une feature retirée ne doit jamais laisser de branche de code ou de migration produisant une perte de données. Le seul retrait acté (voir §3.2 COL-01) est sans effet de bord : le schéma conserve `'product.contact'`. | CA-V5-099, 107 |
| **RG-V5-10** | **Validation avant livraison** | Chaque `CA-V5-xxx` est **binaire** : il est soit démontré (test vert, audit `fichier:ligne`, ou mesure reproductible), soit **non satisfait**. Aucun « à peu près », aucun « globalement », aucun critère non mesurable. | CA-V5-119, 120, 125 |
| **RG-V5-11** | **Traçabilité exigence ↔ critère ↔ preuve** | Toute exigence C1→C8 a au moins un critère ; tout critère a une exigence et une story ; toute preuve est reproductible par une commande documentée. | CA-V5-119, 118, 125 |
| **RG-V5-12** | **Non-régression permanente** | Chaque bug corrigé dans V5 devient un test automatisé **vert en CI** : un test rouge sur un cas corrigé = blocage de livraison. | CA-V5-102, 112 |
| **RG-V5-13** | **Protection du démarrage** | Le serveur démarre en développement **sans aucune** configuration mail ; il **refuse de démarrer** en production si la configuration mail est invalide. Le bypass de rate limit en test est **préservé** (aucun test existant ne doit casser). | CA-V5-006, 016, 084, 085 |
| **RG-V5-14** | **Non-régression d'authentification** | Les limites d'authentification (20 req / 10 min sur `/api/auth`) restent inchangées et s'appliquent **avant** toute autre limite. Le profil de session administrateur (rotation, cookies, headers) n'est **pas** modifié par V5. | CA-V5-084 |
| **RG-V5-15** | **Divulgation minimale** | Un `403` ou un `404` ne révèle pas l'existence d'une ressource à un utilisateur non autorisé. Les réponses d'erreur ne contiennent ni nom de table, ni nom de colonne, ni identifiant interne, ni pile d'appels. | CA-V5-021, 023, 051 |

---

## 7. Points ouverts (à trancher avant clôture du sprint)

Aucun de ces points ne bloque la rédaction du code : ce sont des décisions **à confirmer**, listées pour que rien ne soit tranché implicitement.

| # | Question | Options | Recommandation | Effet si non tranché |
|---|---|---|---|---|
| **PO-V5-01** | **« Contacter le vendeur » : recrutement/utilisateur conservé ?** | (a) retrait définitif, (b) retour du use case au sprint suivant | **(a) retrait définitif** — décision actée en §3.2 COL-01 ; la question porte sur la **communication de sortie** | Mention `docs/api.md` v2.3 incomplète (CA-V5-103) |
| **PO-V5-02** | **L'e-mail E1 (bienvenue) est-il publié ?** | (a) publié immédiatement (V5), (b) reporté | **(a) publié** — compris dans les 6 emails métier | Le périmètre C1 est incomplet (CA-V5-004) |
| **PO-V5-03** | **L'e-mail E9 (`seller_paid`, « versement effectué ») est-il publié ?** | (a) publié, (b) fusionné avec E8 | **(a) publié** — « disponible » puis « versé » sont deux événements distincts | Décroît le nombre d'e-mails testés (CA-V5-004) |
| **PO-V5-04** | **Suppression d'un produit lié à une commande terminée** | (a) autorisée (recommandée, D4), (b) bloquée si **toute** commande existe | ✅ **(a) autorisée — ACTÉE par le chef de projet (28/09/2026)** : soft delete autorisé dès que toutes les commandes du produit sont terminées (`COMPLETED`/`CANCELLED`/`PAYMENT_FAILED`) ; toute commande active (`WAITING_PAYMENT`…) → 409 + UI désactivée (CA-V5-065, RG-V5-04) | L'utilisateur ne peut pas modérer un doublon historique (CA-V5-065) |
| **PO-V5-05** | **Soumission d'un produit supprimé par le vendeur** | (a) 404 (verrou actuel), (b) 403 | **(a) 404** — ne pas révéler l'existence (RG-V5-15) | Fuite d'information (CA-V5-062) |
| **PO-V5-06** | **Échec de la migration 009** | (a) échec au démarrage (recommandé, P7), (b) alerte en ligne | **(a) échec au démarrage** — pas d'état incohérent silencieux | DéploiementPartial silencieux (CA-V5-053) |
| **PO-V5-07** | **Cache HTTP / `ETag` sur les lectures publiques** | (a) aucun cache (simple), (b) `Cache-Control` court, (c) `ETag` | ✅ **(b) ACTÉE par le chef de projet (28/09/2026)** : `Cache-Control: private, no-store` sur toute l'API (aucune donnée personnelle en cache public) ; **sauf** `/api/categories` et `/api/banners` qui acceptent un `Cache-Control: public, max-age=60, stale-while-revalidate=120` (données publiques stables). Aucune donnée personnelle n'est jamais cachée publiquement (CA-V5-094) | Décision d'infrastructure non tracée (CA-V5-094) |
| **PO-V5-08** | **Périmètre de la purge `session`** | (a) V5, (b) V6 | **(b) V6** — index déjà en place (`idx_session_expire`, `001_init.sql:201`) | Index inutilisé (CA-V5-082) |
| **PO-V5-09** | **Courriels « commande annulée » / « produit refusé »** | (a) V5, (b) V6 | **(b) V6** — l'énoncé fixe 6 emails métier, pas 8 | Écart avec le périmètre annoncé (CA-V5-004) |
| **PO-V5-10** | **Page « Produits » de l'admin** : la suppression doit-elle être en masse ? | (a) non (recommandé), (b) oui | **(a) non** — la règle « suppression = action sensible unitaire » | Nouvelle surface non testée (CA-V5-056) |
| **PO-V5-11** | **Sauvegarde de la base de recette 50k/5k** | (a) oui, versionnée, (b) non | **(a) oui** — mesure reproductible (CA-V5-122) | Mesures non reproductibles (P6) |
| **PO-V5-12** *(étiquette amont `D1`)* | **Ordre de déploiement de la migration `009` vs. code C4** | (a) variante **A** (prédicats stricts `deleted_at IS NULL`), (b) variante **B** (prédicats inchangés, +5 % mesurés) | ✅ **(a) variante A — ACTÉE par le chef de projet (29/09/2026)** : Railway/Render applique les migrations au démarrage du **nouveau** code ⇒ C4 actif **avant** 009 ⇒ ordre sûr. **Contrainte** : ne jamais appliquer 009 seule sur un env pré-C4 (×106 catalogue / ×35 modération, mesuré). Détail, repli et preuves : §3.5 + CA-V5-143/144/145 | Régression ×106 en production si l'ordre s'inverse |
| **PO-V5-13** *(étiquette amont `D8tests`)* | **`npm test` cible la base de développement** | (a) tests sur `revends_test` uniquement, (b) statu quo | ✅ **(a) — ACTÉE par le chef de projet (29/09/2026)** : `revends_test` dédiée (création + schéma + seed), **jamais** la base dev. **Bug reproduit le 29/09/2026** (F14) : `env.ts:13` (`??=`) cède la main à un `DATABASE_URL` déjà défini et `bootstrap.ts:61-65` fait `DROP SCHEMA public CASCADE` dessus. Détail : §3.5 + §5.7.1 | **Perte silencieuse de données de développement** à chaque run |
| **PO-V5-14** *(étiquette amont `D5`)* | **9ᵉ déclencheur email « réservation expirée » : dans le périmètre ou non** | (a) oui, acheteur + vendeur, (b) non | ✅ **(a) — ACTÉE par le chef de projet (29/09/2026)** : **9 déclencheurs / 11 envois**. Bornes : **aucune** notification in-app nouvelle (le vendeur reste notifié par email seul, sinon CA-V5-010 est violé) ; envoi **après COMMIT** (P8) ; libération de réservation **inchangée**. Détail : §3.5 + CA-V5-004 | 2 emails non prévus (le vendeur ignore que sa réservation est tombée) |
| **PO-V5-15** *(étiquette amont `D6`)* | **Champ `hasActiveOrder` sur le sérialiseur produit admin** | (a) oui, additif, (b) non | ✅ **(a) — ACTÉE par le chef de projet (29/09/2026)** : champ **additif**, calculé dans la **même** requête de liste, pour désactiver « Supprimer » **sans requête par ligne** (RG-V5-08) et sans réintroduire de N+1 (CA-V5-071/072). Strictement additif, absent des autres endpoints (P5). Détail : §3.5 + CA-V5-065 | N+1 réintroduit sur `AdminArticlesPage`, ou bouton « Supprimer » non désactivable (RG-V5-08) |
| **PO-V5-16** *(étiquette amont `D7`)* | **Correction de la dette `sales: 0`** | (a) hors périmètre V5, (b) V5 | ✅ **(a) — ACTÉE par le chef de projet (29/09/2026)** : **hors périmètre V5**, ticket de dette documenté (§5.10, **CA-V5-210**), **comportement conservé** (CA-V5-074, `unit-utils.test.ts:47`). **Réserve** : ce `COUNT(*)` lit `products` sans `deleted_at IS NULL` → **exemption nommée** inscrite dans CA-V5-063. Détail : §3.5 | Dette oubliée, ou CA-V5-063 violé en silence |
| **PO-V5-17** *(étiquette amont `D8-perf`)* | **Rate limit en mémoire, non partagé entre instances** | (a) documenter, 1 instance, (b) Redis en V5 | ✅ **(a) — ACTÉE par le chef de projet (29/09/2026)** : accepté pour **1 instance**, condition de bascule Redis **écrite** comme livrable de clôture (CA-V5-146). *Note : dans `architecture-v5.md` §10, ce sujet porte le libellé `D8`, **en doublon** du précédent — défaut de numérotation amont signalé.* | Limite 300/min/IP **ineffective** dès la 2ᵉ instance, sans que personne ne le sache |
| **PO-V5-18** *(CF-02)* | **C9 exige 3 filtres + 1 tri + 1 endpoint qui n'existent pas** (`taille`, `couleur`, `date`, `Pertinence`, suggestions). F16/F17 : 6 familles de filtres et 4 tris seulement existent côté API. §2.2 et P5 excluent aujourd'hui tout ajout de contrat. | (a) **addition bornée** de contrat, `api.md` v2.4, (b) C9 livré sur le contrat actuel, le reste en V6 | ✅ **ACTÉE par le chef de projet (29/09/2026) — option (a) bornée** : **tri « Pertinence »** ajouté à l'API (score local déterministe : remise + popularité + récence, distinct de « recent » — CA-V5-145c) + **endpoint de suggestions** en lecture seule (catégories + marques + produits, borné ≤ 10). **Filtres `taille`/`couleur`/`date` → P2 → V6 consigné** (aucune donnée BDD ni colonne produit ; RG-V5-08 interdit tout filtre inerte). Mise à jour `docs/api.md` v2.4. Absence de valeur ne change aucune réponse existante (P5). | Écran livré avec des contrôles inertes (viol de RG-V5-08), ou blocage de C9 faute de décision |
| **PO-V5-19** *(CF-05)* | **« ~50 écrans » contre 27 routes existantes** et un sprint portant déjà C1→C8 + C9. F17 : `/decouvrir`, `/favoris`, `/mentions`, `/confiance`, `/comment-ca-marche`, `/journal/…`, `/mes-ventes`, `/vendeur/:id` **n'existent pas**. F18 : checkout et vente sont des flux uniques à refondre en 4 et 5 étapes. | (a) livrer les 50 en un sprint, (b) **ligne de coupe confirmée**, (c) repousser C9 en V6 | ✅ **ACTÉE par le chef de projet (29/09/2026) — option (b), ligne de coupe 34 P0, C9 en deux vagues** : *vague 1 — fondations, navigation, mobile, admin (CA-V5-128→159)* ; *vague 2 — écrans P0 restants*. **Les 11 P1 et 5 P2 non livrés sont déclarés absents par écrit** (écart consigné, jamais « à vérifier plus tard », RG-V5-10). La recette V5 exige 34 P0 + déclaration des absents. V-34 ✓. | C9 consommé en double, ou clôture sur une intention |

**Règle de traitement** : tout point marqué « non tranché » en fin de sprint devient soit un critère, soit une **décision consignée** — jamais une modification de code non documentée.

---

| **PO-V5-20** *(CF-06)* | **3 divergences de contenu** entre `docs/design-system-revends-v5.md` (DA REVENDS 2026, 550 l.) et ce cahier. La **DA est désormais alignée sur le spec** (CA-V5-128→134 réécrits), mais 3 textes/micro-comportements divergent. | (a) **appliquer le spec**, (b) **appliquer le cahier**, (c) trancher chaque point | ✅ **ACTÉE par le chef de projet (29/09/2026) — l'utilisateur PO prime sur le spec** (ses libellés sont sa « direction artistique » explicite dans la demande Sprint) : **(1) Hero** : « **Donnez une seconde vie aux belles choses.** » (message principal REVENDS, CA-V5-138 réécrit) ; la section éditoriale garde « Ce que vous ne portez plus… » (CA-V5-139) — pas de doublon, deux messages distincts. **(2) Confiance — bande 4 points utilisateur** : **Paiement sécurisé · Livraison suivie · Vendeurs vérifiés · Support client** (CA-V5-141) ; fiche produit = **3 garanties utilisateur** : Paiement sécurisé · Livraison suivie · Protection acheteur (CA-V5-145) — « Commission 10 % transparente » du spec tombe au profit des libellés PO. **(3) Mentions légales** : **créer `/conditions` et `/confidentialite`** (2 pages statiques réelles, contenu générique, zéro lien mort — CA-V5-142). | 3 textes divergents entre DA et cahier |

## 8. Grille de recette (bout en bout)

Légende : **A** = automatisé (test) · **M** = mesuré (exécuté) · **L** = lu (audit) · **V** = revue visuelle.
Chaque ligne doit porter un verdict **PASS** / **FAIL** et une preuve.

### 8.1 Vérifications transverses

| # | Vérification | Type | Référence | Verdict |
|---|---|---|---|---|
| T-01 | `cd server && npx tsc --noEmit` | A | §7 (baseline) | ☐ |
| T-02 | `cd web && npx tsc -b` | A | §7 (baseline) | ☐ |
| T-03 | `cd web && npx vitest run` → ≥ 52 tests verts | A | §5.7 | ☐ |
| T-04 | Suite `server/test/` verte (hors 12 retirés) | A | §5.7 | ☐ |
| T-05 | Zéro `any` sauvage (liste blanche ≤ 5) | L | CA-V5-111 | ☐ |
| T-06 | Zéro `soft-primary` / `shadow-[` / `style={{` métier | L | CA-V5-114 | ☐ |
| T-07 | Zéro import mort (`tsc` + revue) | L | CA-V5-100 | ☐ |
| T-08 | Zéro secret / fichier parasite (`git status`) | L | CA-V5-116 | ☐ |
| T-09 | `test` / `start` / `dev` de `server/package.json` OK | M | §5.7 | ☐ |
| T-10 | Migration 009 idempotente sur base peuplée | M | CA-V5-068 | ☐ |

### 8.2 C1 — Emails transactionnels (arbitrage n° 1)

| # | Vérification | Type | Référence | Verdict |
|---|---|---|---|---|
| E-01 | Interface d'envoi unique, aucun envoi direct en service | L | CA-V5-001 | ☐ |
| E-02 | Les 6 emails métier (E1→E10) sont implémentés | M | CA-V5-004 | ☐ |
| E-03 | Échec d'envoi → in-app toujours créée, 2xx | A | CA-V5-002 | ☐ |
| E-04 | Envoi après commit (rollback → aucun email) | A | CA-V5-003 | ☐ |
| E-05 | Dev = console, aucun SMTP réel, démarre sans config | M | CA-V5-005 | ☐ |
| E-06 | Prod = SMTP via env ; config invalide → échec démarrage | M | CA-V5-006 | ☐ |
| E-07 | Chaque email existe en HTML + texte | L | CA-V5-007 | ☐ |
| E-08 | Aucune donnée sensible (RG-ORD-6) | L | CA-V5-008 | ☐ |
| E-09 | Destinataire résolu par id, pas par l'entrée API | L | CA-V5-011 | ☐ |
| E-10 | Notifications in-app inchangées (comparaison avant/après) | A | CA-V5-010 | ☐ |
| E-11 | Test d'injection sur contenu utilisateur | A | CA-V5-018 | ☐ |
| E-12 | `docs/api.md` : canal ajouté, aucun endpoint modifié | L | CA-V5-017 | ☐ |
| E-13 | Latence endpoints déclencheurs ≤ +15 % | M | CA-V5-014 | ☐ |

### 8.3 C2 — RBAC durci (arbitrage n° 2)

| # | Vérification | Type | Référence | Verdict |
|---|---|---|---|---|
| R-01 | Paramétré sur **toutes** les routes `/api/admin/*` | A | CA-V5-019, 020 | ☐ |
| R-02 | Anonyme → 401 · user → 403 · admin → jamais 401/403 | A | CA-V5-019 | ☐ |
| R-03 | Aucune fuite d'info dans les 401/403 | A | CA-V5-021 | ☐ |
| R-04 | Session invalide → 401 | A | CA-V5-022 | ☐ |
| R-05 | Admin → 403 sur les routes user | A | CA-V5-024 | ☐ |
| R-06 | `RequireAdmin` : loading / /login / **/** (pas ForbiddenPage) | A | CA-V5-025 | ☐ |
| R-07 | `adminMenu` absent hors `pages/admin/` | L | CA-V5-027 | ☐ |
| R-08 | 9 routes × 3 rôles → aucune boucle ni écran blanc | A | CA-V5-028 | ☐ |
| R-09 | Aucune requête admin émise pour un `user` | A | CA-V5-029 | ☐ |
| R-10 | Lien navbar visible pour admin, invisible sinon | A | CA-V5-026 | ☐ |

### 8.4 C3 — Interface administration (arbitrage n° 3)

| # | Vérification | Type | Référence | Verdict |
|---|---|---|---|---|
| U-01 | Zéro `soft-primary` (survol du bouton réellement rendu) | L+V | CA-V5-031 | ☐ |
| U-02 | Zéro `shadow-[` ; rendu visuel identique | L+V | CA-V5-032 | ☐ |
| U-03 | Zéro `style={{` dans `pages/admin` | L | CA-V5-033 | ☐ |
| U-04 | Catégories : squelette + erreur + vide (EmptyState) | A+V | CA-V5-034 | ☐ |
| U-05 | Une seule convention de carte (`.card` ou `Card`) | L | CA-V5-035 | ☐ |
| U-06 | Une seule table partagée pour les 7 pages | L | CA-V5-036 | ☐ |
| U-07 | Modales de confirmation partagées | L+V | CA-V5-037 | ☐ |
| U-08 | Aucun débordement à 1024 et 1280 px | M | CA-V5-038 | ☐ |
| U-09 | Tableau de bord : 4 cartes + 8 statuts + actions + vide | A+V | CA-V5-039 | ☐ |
| U-10 | Tableau de bord ≥ 4 composants partagés | L | CA-V5-040 | ☐ |
| U-11 | Utilisateurs : lecture seule + composants partagés | A+V | CA-V5-041 | ☐ |
| U-12 | 9 pages chargées en < 1,5 s, 0 erreur console | M | CA-V5-042 | ☐ |
| U-13 | Accessibilité : titres, aria-label, focus, clavier | A | CA-V5-043 | ☐ |
| U-14 | Libellés et formats (Fcfa, dates, statuts) inchangés | L | CA-V5-044 | ☐ |
| U-15 | Uniformité visuelle validée page par page | V | CA-V5-045 | ☐ |
| U-16 | Section admin documentée dans `design-system.md` | L | CA-V5-046 | ☐ |
| U-17 | Test anti-classe-inexistante en place | A | CA-V5-047 | ☐ |
| U-18 | Lien « Supprimer » sur Articles uniquement | L | CA-V5-048 | ☐ |

### 8.5 C4 — Cycle de vie produit (arbitrage n° 4)

| # | Vérification | Type | Référence | Verdict |
|---|---|---|---|---|
| P-01 | Catalogue = `AVAILABLE` uniquement | A | CA-V5-049 | ☐ |
| P-02 | Fiche publique `RESERVED` visible | A | CA-V5-050 | ☐ |
| P-03 | Fiche publique `SOLD` → 404, invisible en recherche | A | CA-V5-051 | ☐ |
| P-04 | Matrice statut ↔ visibilité (verrou) | A | CA-V5-052 | ☐ |
| P-05 | Migration 009 : `deleted_at` + `article_deleted`, idempotente | M | CA-V5-053, 068 | ☐ |
| P-06 | `DELETE /api/products/:id` disparu (404, jamais 403/500) | A | CA-V5-054 | ☐ |
| P-07 | Zéro `deleteProduct` front, zero action vendeur | A | CA-V5-055 | ☐ |
| P-08 | `DELETE /api/admin/products/:id` : 401/403/204/404, idempotent | A | CA-V5-056 | ☐ |
| P-09 | Effets immédiats : catalogue, recherche, ids, fiches, compteurs | A | CA-V5-057 | ☐ |
| P-10 | Soft delete : lignes, images, disque intacts ; statut inchangé | M | CA-V5-058 | ☐ |
| P-11 | Historique des commandes identique avant/après | A | CA-V5-059 | ☐ |
| P-12 | Notification `article_deleted` unique, même transaction | A | CA-V5-060 | ☐ |
| P-13 | Ligne `admin_actions` + visible dans `/admin/history` | A | CA-V5-061 | ☐ |
| P-14 | Vendeur : produit supprimé invisible, vendre toujours possible | A | CA-V5-062, 070 | ☐ |
| P-15 | Aucun accès direct non filtré (revue exhaustive) | L | CA-V5-063 | ☐ |
| P-16 | Aucun undelete/restore UI | L | CA-V5-064 | ☐ |
| P-17 | Commande active → 409 + UI désactivée ; terminées → OK | A | CA-V5-065 | ☐ |
| P-18 | `?ids=` : contrat, ordre, `total` inchangés | A | CA-V5-066 | ☐ |
| P-19 | Filtre `deleted_at` : p95 catalogue, `EXPLAIN` | M | CA-V5-067 | ☐ |
| P-20 | Zéro quota vendeur (10 produits OK) | A | CA-V5-069 | ☐ |

### 8.6 C5 — Performance (arbitrage n° 5)

| # | Vérification | Type | Référence | Verdict |
|---|---|---|---|---|
| F-01 | Budgets SQL par endpoint, indépendants de la taille | A | CA-V5-071, 072 | ☐ |
| F-02 | Réponses identiques avant/après (charge utile entière) | A | CA-V5-074 | ☐ |
| F-03 | `getPublicProduct` ≤ 5 requêtes | A | CA-V5-071 | ☐ |
| F-04 | Catalogue p95 < 100 ms sur 50k | M | CA-V5-075 | ☐ |
| F-05 | 6 sections accueil p95 < 100 ms chacune | M | CA-V5-076 | ☐ |
| F-06 | `page=999999999` → 200 items [] (non régressé) | A | CA-V5-077 | ☐ |
| F-07 | `COUNT(*)` catalogue : mesuré, `total` exact ≤ page 20 | M | CA-V5-078 | ☐ |
| F-08 | Recherche `q` p95 < 300 ms, résultats identiques | M | CA-V5-079 | ☐ |
| F-09 | Admin produits/commandes/stats p95 < 150 ms | M | CA-V5-080 | ☐ |
| F-10 | `admin/stats` ≤ 3 requêtes ou justifié | A+M | CA-V5-081 | ☐ |
| F-11 | `discover` p95 < 100 ms, ≤ 2000 lignes examinées | M | CA-V5-083 | ☐ |
| F-12 | Rate limit global 300/min/IP, auth 20/10min inchangé | A | CA-V5-084, 085 | ☐ |
| F-13 | Bypass `test` intact ; suite serveur verte | A | CA-V5-085 | ☐ |
| F-14 | Charge 50 UV / 3 min : 0 5xx, 0 deadlock, p95 respectés | M | CA-V5-086 | ☐ |
| F-15 | Pool jamais saturé, attente p95 < 50 ms | M | CA-V5-087 | ☐ |
| F-16 | Entrée hostile : jamais 5xx (413/400/garded) | A | CA-V5-088 | ☐ |
| F-17 | Mémoire stable, pas de fuite de buckets | M | CA-V5-089 | ☐ |
| F-18 | Log structuré minimal, sans secret | L | CA-V5-090 | ☐ |
| F-19 | `/api/health` = 200 même base HS | A | CA-V5-091 | ☐ |
| F-20 | `loadOrderParts` : 3 vues + confidentialité | A | CA-V5-093 | ☐ |
| F-21 | `view_count` : 6 comportements non régressés | A | CA-V5-096 | ☐ |
| F-22 | `payout` filter : résultats identiques | A | CA-V5-092 | ☐ |

### 8.7 C6 — Retrait de « Contacter le vendeur » (arbitrage n° 6)

| # | Vérification | Type | Référence | Verdict |
|---|---|---|---|---|
| X-01 | Zéro reliquat applicatif (13 emplacements) | L | CA-V5-097 | ☐ |
| X-02 | Route contact → 404 (jamais 405/500) | A | CA-V5-098 | ☐ |
| X-03 | `'product.contact'` **conservé** en base, inutilisé | M | CA-V5-099 | ☐ |
| X-04 | Fiche produit : parcours d'achat intact | A+V | CA-V5-100, 101 | ☐ |
| X-05 | Tests retirés (−12 serveur, −2 front), aucun `skip` | L | CA-V5-102 | ☐ |
| X-06 | `api.md` v2.3 à jour, contacts marqués historiques | L | CA-V5-103 | ☐ |
| X-07 | V4 marqué superseded (CA-ACC-57, PO-ACC-1, §12) | L | CA-V5-104 | ☐ |
| X-08 | Aucune importation orpheline | A | CA-V5-105 | ☐ |
| X-09 | Réservation expirée libérée sans le use case retiré | A | CA-V5-106 | ☐ |
| X-10 | Diff borné aux 13 emplacements | L | CA-V5-107 | ☐ |
| X-11 | « Vous aimerez aussi » toujours alimenté | A | CA-V5-108 | ☐ |
| X-12 | Aucune confusion avec C4 (suppression = soft delete) | L | CA-V5-109 | ☐ |

### 8.8 C7–C8 — Qualité et livraison

| # | Vérification | Type | Référence | Verdict |
|---|---|---|---|---|
| D-01 | `tsc` server + web : 0 erreur, 0 `@ts-ignore` | A | CA-V5-110 | ☐ |
| D-02 | Aucune régression de test (≥ 52 front, hors 12 retirés) | A | CA-V5-112 | ☐ |
| D-03 | Table partagée unique, pas de `min-w-[…]` divergent | L | CA-V5-113 | ☐ |
| D-04 | Accessibilité prouvée (audit 9 écrans + test a11y V5 ou `grep` consigné) | A+L | CA-V5-117, 043 | ☐ |
| D-05 | Chaque exigence couverte, grille complète | L | CA-V5-119 | ☐ |
| D-06 | Grille §8 exécutée, 0 ligne partielle | M | CA-V5-120 | ☐ |
| D-07 | Parcours complet demonstrable (9 étapes) | M | CA-V5-121 | ☐ |
| D-08 | Rapport de performance reproductible (script + base) | M | CA-V5-122 | ☐ |
| D-09 | Rapport de robustesse (rate limit, 413, 400, mémoire) | M | CA-V5-123 | ☐ |
| D-10 | Docs à jour (api, design-system, V4) | L | CA-V5-124 | ☐ |
| D-11 | DoD §10 cochée, 0 case sur intention | L | CA-V5-125 | ☐ |
| D-12 | **Isolation base de test** : `npm test` laisse la base `.env` strictement intacte (avant/après) | M | CA-V5-126 | ☐ |
| D-13 | **Contrôle négatif** : `DATABASE_URL` forcée sur la base de dev → run vert **et** base intacte | M | CA-V5-126 | ☐ |
| D-14 | Bootstrap lié à `revends_test` par construction, garde-fou fail-fast, 0 affectation conditionnelle d'URL | A | CA-V5-127 | ☐ |
| D-15 | Les 5 dettes DET-01→DET-05 ont un ticket, un responsable, une échéance | L | CA-V5-210 | ☐ |

### 8.9 C9 — Identité visuelle REVENDS 2026 (US-V5-09)

> Rappel : **CF-01** (re-thème vs. C8) et **CF-04** (retrait de « Contacter ») sont **RÉSOLUS** en §5.9.0 et opposables ; **CF-02** (PO-V5-18), **CF-05** (PO-V5-19) et **CF-06** (PO-V5-20) sont **TRANCHÉS par le chef de projet (29/09/2026)** en §7 — voir les lignes PO-V5-18, PO-V5-19, PO-V5-20. Ligne de coupe : **34 écrans P0**, les 11 P1 et 5 P2 non livrés seront **déclarés absents** (RG-V5-10).

| # | Vérification | Type | Référence | Verdict |
|---|---|---|---|---|
| V-01 | Palette 2026 par tokens sémantiques, ancienne palette supprimée | L | CA-V5-128 | ☐ |
| V-02 | Zéro hexadécimal hors palette (liste blanche ≤ 3 verts/erreurs justifiés) | L+A | CA-V5-129 | ☐ |
| V-03 | Contrastes WCAG AA **mesurés** sur les 5 paires obligatoires | M | CA-V5-130 | ☐ |
| V-04 | Typographies déclarées, auto-hébergées, sans CDN, sans FOIT | L | CA-V5-131 | ☐ |
| V-05 | Serif éditorial : liste fermée respectée, zéro usage parasite | L | CA-V5-132 | ☐ |
| V-06 | Logo texte + symbole SVG, 2 variantes clair/sombre, `aria-label` | L | CA-V5-133 | ☐ |
| V-07 | Navbar desktop : 5 liens réels + recherche, aucun lien mort | L+A | CA-V5-134 | ☐ |
| V-08 | Bottom nav 5 onglets < 768 px, navbar desktop absente du rendu | M | CA-V5-135 | ☐ |
| V-09 | Suggestions : debounce, annulation, clavier, aria, 1 résultat vide explicite | A | CA-V5-136 | ☐ |
| V-10 | `publicMenu` centralisé, 5 cibles de nav testées desktop + mobile | A | CA-V5-137 | ☐ |
| V-11 | Hero « Donnez une seconde vie aux belles choses », ≤ 1 accent Terracotta | M | CA-V5-138 | ☐ |
| V-12 | Sections Catégories + Tendance alimentées par des données réelles | A | CA-V5-139 | ☐ |
| V-13 | Section éditoriale « Ce que vous ne portez plus… » : contenu réel ≥ 120 car. | A | CA-V5-140 | ☐ |
| V-14 | « Comment ça marche » + « Achetez en toute confiance » (3 garanties cohérentes) | A | CA-V5-141 | ☐ |
| V-15 | Footer Charcoal, 4 colonnes, aucun lien mort | L+M | CA-V5-142 | ☐ |
| V-16 | 3 états (vide spécifique + action, chargement, erreur + Retry) sur les listes | A | CA-V5-143 | ☐ |
| V-17 | 8 familles de filtres, chacune réduit réellement le jeu de résultats | A+EXEC | CA-V5-144 | ☐ |
| V-18 | 4 tris : ordre total, « Pertinence » ≠ « Plus récent » | A | CA-V5-145 | ☐ |
| V-19 | Page catégorie : hero, grille bornée à la catégorie, compteur exact | A | CA-V5-146 | ☐ |
| V-20 | Fiche premium : 13 blocs assertés, **zéro** action « Contacter » / `mailto:` / `tel:` | A+L | CA-V5-147 | ☐ |
| V-21 | Checkout 4 étapes : retour sans perte, étape non sautable, 1 seule commande | A | CA-V5-148 | ☐ |
| V-22 | Suivi colis : timeline Terracotta, composant partagé, progression annoncée | A+L | CA-V5-149 | ☐ |
| V-23 | Commission 10 % exacte (depuis la commande) + vente en 5 étapes, statut `PENDING` | A | CA-V5-150 | ☐ |
| V-24 | **Une seule** page de connexion, 3 rôles × 3 entrées, 0 boucle | A | CA-V5-151 | ☐ |
| V-25 | Admin : sidebar Charcoal, 8 entrées, RBAC et 968 px non régressés | L+A | CA-V5-152 | ☐ |
| V-26 | 3 largeurs mobiles × 50 écrans : 0 débordement, cibles ≥ 44 px, 0 CLS (150 captures) | M | CA-V5-153 | ☐ |
| V-27 | Grille 2 col. mobile / 3 à 768 / 4+ à 1280, hauteur de rangée homogène | A+M | CA-V5-154 | ☐ |
| V-28 | Micro-interactions : liste fermée, ≤ 250 ms, `prefers-reduced-motion` effectif | L | CA-V5-155 | ☐ |
| V-29 | Accessibilité des 50 écrans (h1, alt, focus, clavier, zoom 200 %, `lang`) | L+A | CA-V5-156 | ☐ |
| V-30 | Non-régression C8 : 27 routes, parcours identiques, charges utiles inchangées | M+A | CA-V5-157 | ☐ |
| V-31 | P1/P2 sur tout le front C9, 9 composants transversaux partagés | A+L | CA-V5-158 | ☐ |
| V-32 | Audit visuel des 50 écrans en grille : 6 points binaires, divergences justifiées | V | CA-V5-159 | ☐ |
| V-33 | **Inventaire des 50 écrans** : verdict individuel des 50 `CA-V5-160`→`209` | A | CA-V5-160→209 | ☐ |
| V-34 | Ligne de coupe P0 confirmée par écrit (PO-V5-19) | L | PO-V5-19 | ☐ |
| V-35 | Décision CF-02 consignée (PO-V5-18) : tri Pertinence + suggestions bornés, repli taille/couleur/date → V6 | L | PO-V5-18 | ☐ |
| V-36 | 3 contenus DA alignés sur les libellés PO (hero « aux belles choses », 4 points confiance, pages conditions/confidentialité) | A | PO-V5-20 | ☐ |

---

## 9. Protocole de mesure (reproductible)

| # | Paramètre | Valeur |
|---|---|---|
| M-01 | Base de mesure | 50 000 produits `AVAILABLE`, 5 000 commandes, 200 utilisateurs, pagination settée sur 48 |
| M-02 | Environnement | Node en production (`npm start`), machine dédiée ou CI runner, base locale ou Docker à caractéristiques constantes — le choix est **consigné** |
| M-03 | Méthode | Requêtes répétées (≥ 100 par endpoint), on garde **p50 / p95 / p99** du temps **serveur** (pas du temps d'affichage client) |
| M-04 | Seuils | catalogue p95 < 100 ms · recherche p95 < 300 ms · admin p95 < 150 ms · fiche p95 < 100 ms · sections p95 < 100 ms chacune |
| M-05 | Load test | ≥ 50 UV pendant ≥ 3 min, répartition 60 % catalogue / 20 % recherche / 10 % pages admin / 10 % écritures (cf. CA-V5-086) |
| M-06 | Requêtes SQL | Comptage via le pool ; le budget doit être **constant** quelle que soit la taille de page |
| M-07 | Plans d'exécution | `EXPLAIN (ANALYZE, BUFFERS)` avant/après pour chaque index ajouté (RG-V5-07) |
| M-08 | Rate limit | Vérification à 300 puis 301 requêtes/min depuis une IP ; bypass `test` vérifié par la suite verte |
| M-09 | Preuves | Script + sortie brute + rapport de mesures versés au compte rendu ; toute mesure non reproductible est **invalide** |

---

## 10. Définition de « Done » (barrage de livraison)

La livraison n'est **acceptée** que si **toutes** les cases sont cochées **sur preuve** (jamais sur intention).

- [ ] **Fonctionnel** — C1 à C6 livrés et testés ; chaque exigence couverte par au moins un critère vert.
- [ ] **Sécurité des données de développement** — `npm test` **n'a produit aucune modification** sur la base désignée par `server/.env` ; le bootstrap cible `revends_test` **par construction**, avec garde-fou fail-fast (CA-V5-126/127). *Case prioritaire : un non-coché ici bloque tout le reste.*
- [ ] **Typecheck** — `server: tsc --noEmit` et `web: tsc -b` en code 0.
- [ ] **Tests** — front ≥ 52 verts, serveur verts (hors 12 retirés en C6), aucun test désactivé.
- [ ] **Build** — `web: npm run build` réussit ; `server: npm start` démarre en dev sans configuration mail.
- [ ] **Performance** — seuils p95 du §9 atteints sur la base de 50k/5k ; rapport reproductible fourni.
- [ ] **Robustesse** — aucun 5xx sur entrée hostile ; 413/400/401/403/404/409 conformes ; rate limit global actif, bypass test intact.
- [ ] **Migration** — 009 appliquée sur base peuplée, idempotente, `'product.contact'` préservé.
- [ ] **Sécurité / confidentialité** — aucun secret, aucune fuite dans 401/403/404, `phone` jamais exposé hors vendeur/admin, aucun champ sensible dans les emails.
- [ ] **Dette** — zéro `any` sauvage, zéro import mort, zéro `soft-primary` / `shadow-[` / `style={{` métier, tables partagées.
- [ ] **Documentation** — `api.md` v2.3, `design-system.md` (section admin), `cahier-des-charges-v4-accueil.md` (superseded) à jour.
- [ ] **Grille** — §8 exécutée intégralement, 0 ligne partielle, 0 « à vérifier plus tard ».
- [ ] **Décisions** — les 20 points ouverts §7 (`PO-V5-01`→`PO-V5-20`) sont tranchés (décision consignée) ou explicitement reportés avec responsable et échéance.
- [ ] **Identité 2026 (C9)** — palette 2026 sans hexadécimal hors palette, contrastes AA mesurés, bottom nav mobile, checkout 4 étapes, vente 5 étapes, **une seule** page de connexion, inventaire des 50 écrans avec verdict individuel.
- [ ] **Ligne de coupe C9** — `PO-V5-18`, `PO-V5-19` et `PO-V5-20` tranchés **par écrit** ; tout écran non livré est **déclaré absent** (écart consigné), aucun « à vérifier plus tard ».
- [ ] **Dette suivie** — les 5 dettes `DET-01`→`DET-05` ont un ticket, un responsable et une échéance (CA-V5-210).
- [ ] **Déploiement** — migration `009` appliquée **après** activation du code C4 ; trace ordonnée du déploiement versée ; aucune application de `009` seule sur un environnement pré-C4 (CA-V5-143/144/145).
- [ ] **Signatures** — `@tester` (grille), `@frontend` (C3, C7, C9), `@architecte` (C5), `@chef-de-projet` + `@cahier-des-charges` (clôture).

---

## Annexe A — Inventaire d'audit (extraits vérifiés)

Cet inventaire fige les constats de l'audit du 27/09/2026. Il sert de **référence** pour la recette : toute ligne peut être re-vérifiée par `@tester` avec la commande indiquée.

| # | Fichier | Symbole / élément | Ligne | Constat | Critères |
|---|---|---|---|---|---|
| A-01 | `server/src/routes/admin.routes.ts` | `adminRouter.use(requireAdmin)` | 39 | RBAC global déjà en place | F3, CA-V5-019 |
| A-02 | `server/src/routes/admin.routes.ts` | 18 routes admin | 42-148 | À couvrir par un test paramétré | CA-V5-020 |
| A-03 | `server/src/middleware/auth.ts` | `requireUser` exclut l'admin | 38-45 | Conforme | CA-V5-024 |
| A-04 | `server/src/middleware/auth.ts` | `requireAdmin` refuse le non-admin | 48-55 | Conforme | CA-V5-019 |
| A-05 | `server/src/middleware/auth.ts` | session invalide → 401 | 27-32 | Non régresser | CA-V5-022 |
| A-06 | `web/src/components/auth/RouteGuards.tsx` | `RequireAdmin` | 48-56 | À refondre (interdit l'accès direct) | CA-V5-025 |
| A-07 | `web/src/components/auth/RouteGuards.tsx` | `ForbiddenPage` | 7-25 | Ne doit plus être rendu par `RequireAdmin` | CA-V5-025 |
| A-08 | `web/src/components/layout/Navbar.tsx` | lien Admin role-gated | 130-139 | Conforme | F3, CA-V5-026 |
| A-09 | `web/src/lib/menus.ts` | `adminMenu` | 6-17 | Importé seulement par les 9 pages admin | CA-V5-027 |
| A-10 | `web/src/pages/ProductPage.tsx` | `hover:bg-soft-primary` | 256 | Classe inexistante | CA-V5-031 |
| A-11 | `web/src/pages/ProductPage.tsx` | `shadow-[0_2px_12px_...]` | 147 | Ombre arbitraire dupliquant `--shadow-card` | CA-V5-032 |
| A-12 | `web/src/pages/ProductPage.tsx` | bouton « Contacter le vendeur » | 256, 312-353 | À retirer (C6) | CA-V5-100 |
| A-13 | `web/src/pages/ProductPage.tsx` | bandeaux vendu / réservé | 262-270 | Non régresser | CA-V5-100 |
| A-14 | `web/src/pages/admin/AdminCategoriesPage.tsx` | `style={{ paddingLeft }}` | 64 | Style inline | CA-V5-033 |
| A-15 | `web/src/pages/admin/AdminCategoriesPage.tsx` | ni Pagination ni EmptyState | 95-119 | Incomplet | CA-V5-034 |
| A-16 | `web/src/pages/admin/AdminDashboardPage.tsx` | tableau de bord | 86-151 | 8 compteurs non exposés | CA-V5-039 |
| A-17 | `server/src/services/admin.service.ts` | 8 statuts de commande | 100-109 | Données déjà disponibles | CA-V5-039 |
| A-18 | `server/src/services/admin.service.ts` | `Promise.all` 7 requêtes | 59-91 | Parallèle mais volumineux | F9, CA-V5-081 |
| A-19 | `server/src/services/admin.service.ts` | notifications de cycle | 172-458 | Points d'envoi email (E2→E9) | CA-V5-004 |
| A-20 | `server/src/services/admin.service.ts` | boucle `buildAdminProduct` | 140-143 | N+1 (N4) | CA-V5-071 |
| A-21 | `server/src/services/admin.service.ts` | boucle `loadOrderParts` | 222-226 | N+1 (N5) | CA-V5-071 |
| A-22 | `server/src/services/admin.service.ts` | filtre `payout` (EXISTS) | 207-210 | À optimiser sans changer le résultat | CA-V5-092 |
| A-23 | `server/src/services/products.service.ts` | boucle `serializeProductCard` | 392-395 | N+1 (N1) | CA-V5-071 |
| A-24 | `server/src/services/products.service.ts` | `ids` 1+N | 279 | N+1 (N2) | CA-V5-071 |
| A-25 | `server/src/services/products.service.ts` | filtre statut catalogue | 285 | Verrou « AVAILABLE » | CA-V5-049 |
| A-26 | `server/src/services/products.service.ts` | `getPublicProduct` | 405-439 | 5-7 requêtes (N8) | CA-V5-071 |
| A-27 | `server/src/services/products.service.ts` | `view_count` | 421-431 | Non régresser (RG-PROD-3) | CA-V5-096 |
| A-28 | `server/src/services/products.service.ts` | réservation expirée (lazy) | 415-419 | Non régresser | CA-V5-050 |
| A-29 | `server/src/services/products.service.ts` | `contactSeller` | 457-531 | À retirer (C6) | CA-V5-097 |
| A-30 | `server/src/services/products.service.ts` | boucle `loadImages` | 537-545 | N+1 (N3) | CA-V5-071 |
| A-31 | `server/src/services/products.service.ts` | garde `PRODUCT_HAS_ORDERS` | 703-706 | À redéfinir (D4) | CA-V5-065 |
| A-32 | `server/src/services/orders.service.ts` | `loadOrderParts` (client) | 51-58 | Parallélisme interdit en transaction | CA-V5-073 |
| A-33 | `server/src/services/orders.service.ts` | `loadOrderParts` N+1 | 282-286, 300-304 | N+1 (N6) | CA-V5-071 |
| A-34 | `server/src/services/orders.service.ts` | sérialisation 3 vues | 336-342 | Non régresser, confidentialité | CA-V5-023, 093 |
| A-35 | `server/src/services/notifications.service.ts` | `'product.contact'` dans l'union | 26-28 | Retirer du type, garder en base | CA-V5-099 |
| A-36 | `server/src/services/expiry.service.ts` | `reservation_expired` | 42 | Point d'envoi E10 | CA-V5-004 |
| A-37 | `server/src/routes/products.routes.ts` | `POST /:id/contact` + rateLimit | 66-82 | Route à retirer | CA-V5-098 |
| A-38 | `server/src/utils/validation.ts` | `contactSchema` | 301-315 | À retirer | CA-V5-097 |
| A-39 | `server/src/routes/admin.routes.ts` | rateLimit `/api/auth` | — | 20 req/10 min (`app.ts:63`) — non régresser | RG-V5-14 |
| A-40 | `server/src/middleware/rate-limit.ts` | bypass `test` | 15-17 | Non régresser | CA-V5-084 |
| A-41 | `server/src/db/pool.ts` | `max: 10`, timeouts | 12-14 | Non régresser, ne pas saturer | CA-V5-087 |
| A-42 | `server/src/app.ts` | mount `/api/auth` rateLimit | 63 | Non régresser | CA-V5-084 |
| A-43 | `server/src/app.ts` | `/api/health` (200 même base HS) | 75-82 | Non régresser | CA-V5-091 |
| A-44 | `server/src/app.ts` | `trust proxy` en prod | 25-27 | Non régresser (IP réelle) | CA-V5-084 |
| A-45 | `server/migrations/001_init.sql` | `products` / `order_items` FK | 102, 116 | Cascade images ; commandes sans cascade | CA-V5-058 |
| A-46 | `server/migrations/001_init.sql` | `notification_type` enum | — | `'product.contact'` à conserver | CA-V5-099 |
| A-47 | `server/migrations/001_init.sql` | index catalogue / trigrammes | 90-97 | Base pour CA-V5-082 | CA-V5-079, 082 |
| A-48 | `server/migrations/001_init.sql` | `idx_session_expire` | 201 | Purge session (PO-V5-08) | CA-V5-082 |
| A-49 | `server/migrations/008_accueil_v3.sql` | ajout enum idempotent | 84 | Modèle pour la migration 009 | CA-V5-053 |
| A-50 | `server/src/config.ts` | validation `SESSION_SECRET` | 53-70 | Modèle pour la validation mail en prod | CA-V5-006 |
| A-51 | `server/test/accueil-v3.test.ts` | bloc contact | 430-568 | **12** cas `it()` (F1) | CA-V5-102 |
| A-52 | `server/test/accueil-v3.test.ts` | payload > 2 Mo → 413 | 537-544 | Non régresser | CA-V5-088 |
| A-53 | `server/test/limits.test.ts` | `per_page ≤ 48` / `page` → 200 | 50-59 | Non régresser | CA-V5-077, 095 |
| A-54 | `web/src/lib/api.test.ts` | cas `contactSeller` | 177-192 | 2 cas `it()` (F1) | CA-V5-102 |
| A-55 | `web/src/lib/api.ts` | `api.contactSeller` | 178-184 | À retirer | CA-V5-097 |
| A-56 | `web/src/lib/api.ts` | `api.deleteProduct` | 198-200 | À retirer | CA-V5-055 |
| A-57 | `web/src/lib/types.ts` | `ContactPayload` / `ContactResponse` | 398-407 | À retirer | CA-V5-097 |
| A-58 | `web/src/pages/MyArticlesPage.tsx` | action « Supprimer » | 23, 28, 108, 129-146 | À retirer | CA-V5-055 |
| A-59 | `web/src/index.css` | tokens `@theme` | 7-35 | Source unique des styles | P1, CA-V5-032 |
| A-60 | `web/src/index.css` | `.card` | 134 | Ne pas coexister avec `Card` | CA-V5-035 |
| A-61 | `web/src/components/ui/States.tsx` | `Card` / `TableSkeleton` | 44 | Convention à trancher et documenter | CA-V5-035 |
| A-62 | `web/src/components/ui/` | `Button`, `EmptyState`, `Pagination`, `StatusBadge`, `Modal` | — | Composants à réutiliser (C3) | CA-V5-040, 043 |
| A-63 | `web/src/pages/admin/AdminOrderDetailPage.tsx` | page | 563 lignes, 0 classe responsive | Absence de `max-[…]` | CA-V5-038 |
| A-64 | `web/src/App.tsx` | 9 routes `/admin/*` | 76-84 | Cibles du test 3 rôles | CA-V5-028 |
| A-65 | `docs/api.md` | v2.2, §3.2 quater contact | 49-55, 780, 825-873 | Passer à v2.3 (C6) | CA-V5-103 |
| A-66 | `docs/cahier-des-charges-v4-accueil.md` | CA-ACC-57, PO-ACC-1, §12 | 47, 59, 233, 356, 377 | Marquer superseded | CA-V5-104 |
| A-67 | `docs/design-system.md` | tokens et composants | — | Ajouter la section admin | CA-V5-046 |
| A-68 | `server/test/env.ts` | garde `??=` sur `DATABASE_URL` | 13 | **F14** : garde mou, cède à un `DATABASE_URL` externe | CA-V5-127 |
| A-69 | `server/test/bootstrap.ts` | `DROP SCHEMA public CASCADE` sur `config.databaseUrl` | 61-67 | **F14** : destruction de la base visée par l'env | CA-V5-126, 127 |
| A-70 | `server/.env` | `DATABASE_URL=…/revends` | 2 | Base de développement, cible du risque F14 | CA-V5-126 |
| A-71 | `server/src/services/expiry.service.ts` | `insertNotification` acheteur seul | 42 | E10 notifie l'acheteur ; pas de vendeur | CA-V5-004, PO-V5-14 |
| A-72 | `server/src/services/products.service.ts` | `serializePublicUser(…, {sales:true})` + `COUNT(*) … status='SOLD'` | 434-438 | **DET-01** : pas de filtre `deleted_at` | CA-V5-063, 210 |
| A-73 | `server/src/services/products.service.ts` | `buildAdminProduct` — pas de `hasActiveOrder` | 210-217 | **PO-V5-15** : champ additif à créer | CA-V5-065, 071 |
| A-74 | `server/src/middleware/rate-limit.ts` | `Map` par instance, aucun Redis | 17 | **PO-V5-17** : limite mono-instance | CA-V5-084, 146 |
| A-75 | `web/src/index.css` | palette hors REVENDS 2026 | 9-27 | **F15** : re-thème, conflit CF-01 | CA-V5-128, 129 |
| A-76 | `web/src/index.css` | `--font-sans` pile système | 37 | **F15** : ni Inter/Manrope/Plus Jakarta ni serif | CA-V5-131, 132 |
| A-77 | `web/src/App.tsx` | 27 routes ; ni `/decouvrir` ni `/favoris` | 53-86 | **F17** : 2 écrans publics à créer | CA-V5-137, 161, 181 |
| A-78 | `web/src/lib/menus.ts` | `adminMenu` seul ; aucun menu public | 6-17 | Re-thème : la nav publique n'est pas centralisée | CA-V5-137 |
| A-79 | `server/src/utils/validation.ts` | `catalogSorts` (4 valeurs, pas de Pertinence) + 6 familles de filtres | 246, 265-274 | **F16** : CF-02 / PO-V5-18 | CA-V5-144, 145 |
| A-80 | `web/src/pages/CheckoutPage.tsx` / `SellPage.tsx` | aucun palier d'étape | — | **F18** : flux uniques à refondre (4 et 5 étapes) | CA-V5-148, 150 |
| A-81 | `web/src/pages/ProductPage.tsx` | « Contacter le vendeur » retiré (C6) | 256, 312-353 | **CF-04** : ne doit pas ressusciter par l'interface | CA-V5-147, 198 |
| A-82 | `docs/architecture-v5.md` | §2.4 variante A/B ; §10 six décisions ouvertes | 87-113, 341-348 | Source des PO-V5-12→17 ; `D8` en doublon | PO-V5-12→17 |

---

## Annexe B — Écart de numérotation (à lire)

Le plan de rédaction initial prévoyait « C3 = 19 critères, C4 = 21 ». Après reprise des bornes réelles :

| Story | Bornes | Nombre |
|---|---|---|
| US-V5-01 | CA-V5-001 → 018 | 18 |
| US-V5-02 | CA-V5-019 → 030 | 12 |
| US-V5-03 | CA-V5-031 → 048 | 18 |
| US-V5-04 | CA-V5-049 → 070 | 22 |
| US-V5-05 | CA-V5-071 → 096 | 26 |
| US-V5-06 | CA-V5-097 → 109 | 13 |
| US-V5-07 | CA-V5-110 → 118 **+ 126 → 127** | 9 + 2 = **11** |
| US-V5-08 | CA-V5-119 → 125 | 7 |
| US-V5-09 — C9 structure (§5.9.1 à §5.9.5) | CA-V5-128 → 159 | 32 |
| US-V5-09 — C9 inventaire 50 écrans (§5.9.6) | CA-V5-160 → 209 | 50 |
| US-V5-09 — dette connue (§5.10) | CA-V5-210 | 1 |
| **Total** | 001 → 210 | **210** |

**Répartition des 2 critères d'infrastructure de test** (PO-V5-13, ajoutés à US-V5-07) : `CA-V5-126` et `CA-V5-127` sont insérés **après** `CA-V5-125` et **avant** le bloc C9 ; ils appartiennent à **US-V5-07** (§5.7.1, *isolation de la base de test*), dont le total passe de 9 à **11**. La table ci-dessus fait foi.

Le §5.7 annonce « les 52 tests front restent verts » (état de départ) et non un total de critères cible : **125** est le total effectif de `CA-V5-xxx` (le plan initial de 140 incluait 15 `bis` non numérotés, abandonnés pour garantir une numérotation continue et sans doublon). Ce tableau fait foi.

