# CAHIER DES CHARGES V7 — « Hébergement des vendeurs — Abonnements & boutique dédiée »

| | |
|---|---|
| **Projet** | ReVends — marketplace de revente d'articles d'occasion (Sénégal, cf. PO-V7-07) |
| **Version document** | 1.0 — **17/11/2026** |
| **Auteur** | Agent `@cahier-des-charges` (Big Pickle), sur instruction du chef de projet et de l'utilisateur |
| **Statut** | **Validé par le chef de projet le 17/11/2026 — base de cadrage V7** — spécification seule, aucune implémentation réalisée |
| **Nature** | **Cahier additif** : il s'ajoute à V1→V6 sans les amender. Aucun verrou existant n'est modifié. |
| **Cible** | Web (React + Vite, `revends/web`) + API (Node + Express + Postgres, `revends/server`). Aucune cible mobile native. |
| **Contexte de production** | https://revends.vercel.app — branche `fix/v6-on-799a7ab` (HEAD `8a8357a` au 17/11/2026) |
| **Références amont** | `docs/cahier-des-charges.md` · `-v2.md` · `-v3.md` · `-v4-accueil.md` · `-v5.md` · `docs/architecture.md` · `docs/api.md` **v2.6** · `docs/design-system.md` · `docs/journal.md` |
| **Références de non-régression** | `docs/cahier-des-charges-v5.md:399` (CA-V5-069) · `:400` (CA-V5-070) · `:114-115` (ARB-V5-05) · `:620` et `:719` (CA-V5-150, commission 10 %) · `:498` (CA-V5-101) · `docs/api.md:2003` (parrainage) · `docs/cahier-des-charges.md:40` (D2, coordonnées privées) |

> **Convention de lecture (identique à V5, `cahier-des-charges-v5.md:12-14`).** Chaque critère `CA-V7-xxx` est **binaire** : conforme ou non conforme. Modes de preuve : `[TEST]` = test automatisé nommé et rejouable · `[EXEC]` = requête SQL / curl / mesure exécutable · `[AUDIT]` = revue de code avec référence `fichier:ligne`. **Aucun critère ne peut être validé sur une intention annoncée : la preuve est obligatoire.**

> **Avertissement de périmètre (point clé, non négociable).** Le quota porte **uniquement sur le nombre d'annonces actives affichées DANS LA BOUTIQUE DÉDIÉE** (`/boutique/:slug`), jamais sur la publication dans le catalogue principal. Le contrôle n'intervient **que** à l'ajout d'une annonce à la boutique, via une **nouvelle route dédiée**. Un article qui dépasse le quota de la boutique reste normalement visible et **vendable** dans le catalogue. `POST /api/products`, `/vendre`, `/mes-articles`, catalogue, fiche produit, commandes, checkout, paiement, commission 10 %, payouts et notifications existants n'ont **aucun changement de comportement**.

---

## 1. Contexte et objectifs

### 1.1 Contexte métier

ReVends est en production fonctionnelle (https://revends.vercel.app). Le programme de parrainage **« Le Cercle des 10 »** (16 nov. → 16 déc. 2026) récompense 10 filleuls validés par un badge **Ambassadeur** (1 an) et **30 jours de Vitrine** (priorité au tri par défaut du catalogue), sans modifier la commission vendeur de **10 %** (`docs/api.md:2003`, `docs/journal.md:4269`).

V7 ajoute un **service d'hébergement des vendeurs** : un vendeur choisit un forfait, l'admin l'active manuellement, et le vendeur dispose alors d'une **boutique publique** `/boutique/:slug` avec un quota d'annonces dédié, ainsi que d'un **espace abonné privé** `/mon-abonnement`. C'est un **ajout** : aucun parcours existant n'est modifié, aucun article n'est vendu différemment.

### 1.2 Objectifs mesurables

| # | Objectif | Mesure de réussite |
|---|---|---|
| O1 | Offrir une vitrine dédiée aux vendeurs abonnés | `/boutique/:slug` répond `200` pour un abonnement `ACTIVE`, `404` sinon (CA-V7-023/024) |
| O2 | Borner le nombre d'annonces **de la boutique**, sans borner le catalogue | Forfait 10 : 10 ajouts → `201`, 11e → `409` ; le 11e produit créé via `POST /api/products` reste `201` et vendable (CA-V7-031/033) |
| O3 | Gouverner la souscription sans paiement en ligne | `PENDING` → `ACTIVE` uniquement par action admin ; 403 pour un `user` (CA-V7-012/013/014) |
| O4 | Préserver l'identité et la vie privée des vendeurs | 0 `phone`/`whatsapp`/`email`/`mailto:`/`tel:` dans la réponse boutique (CA-V7-026/046) |
| O5 | Garantir une zéro-régression stricte | CA-V5-069, CA-V5-070, CA-V5-150 verts **sans amendement** (§8) |
| O6 | Livrer une interface utilisable par tous | 0 violation axe critique, navigation clavier complète, 0 erreur JS (CA-V7-027/061/062) |

### 1.3 Parties prenantes

| Rôle | Intérêt | Attentes |
|---|---|---|
| Vendeur abonné | Vitrine distincte du catalogue | boutique dédiée, quota clair, contact interne sans exposition de ses coordonnées |
| Vendeur non abonné | Continuité du service | publication illimitée inchangée, bouton « Vendre » jamais conditionné |
| Administrateur | Activation et modération des abonnements | file `PENDING`, action d'activation manuelle, traçabilité |
| Acheteur / visiteur | Découvrir la boutique | page publique lisible, accessible, sans donnée privée |
| `@architecte` / `@backend` / `@frontend` | Implémentation | nouvelles tables/routes uniquement, contrat documenté en `docs/api.md` v2.7 |
| `@tester` | Recette | 45 critères binaires rejouables (§6, §9) |
| `@cahier-des-charges` | Conformité | démonstration de non-régression (§8), verdict (§11) |

### 1.4 Personas

- **Vendeur non abonné** — publie sans limite dans le catalogue, ne voit aucun nouveau verrou, ne peut pas accéder à `/boutique/:slug` tant qu'il n'a pas d'abonnement `ACTIVE`.
- **Vendeur abonné** — a choisi un forfait, attend l'activation admin, gère ses annonces de boutique dans `/mon-abonnement`, peut retirer une annonce de boutique sans toucher à son produit catalogue.
- **Administrateur** — active manuellement les souscriptions, conserve ses rôles et permissions inchangés (`user`/`admin` uniquement).
- **Visiteur anonyme** — consulte la boutique publique, contacte le vendeur via formulaire interne, ne doit jamais voir de coordonnée privée.
- **Ambassadeur « Cercle des 10 »** — cumule sans conflit badge, Vitrine gagnée et boutique abonnée ; aucun écrasement de `vitrine_until`.

---

## 2. Périmètre

### 2.1 Dans le périmètre (enablement)

| ID | Fonctionnalité | Contenu |
|---|---|---|
| **F1** | Boutique publique `/boutique/:slug` | Page publique listant les seules annonces de boutique actives d'un vendeur abonné `ACTIVE` |
| **F2** | Espace abonné privé `/mon-abonnement` | État de l'abonnement, forfait, quota consommé, gestion des annonces de boutique |
| **F3** | Souscription | Choix du forfait par le vendeur → abonnement `PENDING` → activation **manuelle** par l'admin |
| **F4** | Forfaits | 3 paliers définitifs (prix **validé par l'utilisateur le 17/11/2026**), stockés en base, aucun prix écrit en dur dans le JSX |
| **F5** | Quota de boutique | Annonces actives simultanées dont le statut est **dérivé de `products.status`** (`PENDING|AVAILABLE|RESERVED`), comptées **dans la boutique uniquement** ; `SOLD`/`REJECTED`/retrait libèrent une place ; pas de reset mensuel |
| **F6** | Nouvelle route d'ajout à la boutique | Route dédiée, distincte de `POST /api/products`, réservée au propriétaire abonné `ACTIVE` |
| **F7** | Retrait d'annonce de boutique | Retrait de la vitrine uniquement ; le produit catalogue et les commandes en cours restent intacts |
| **F8** | Contact vendeur (boutique) | Formulaire interne boutique-scopé → notification interne ; jamais de numéro direct |
| **F9** | Gouvernance admin | Liste des abonnements `PENDING`, activation, traçabilité `activated_by`/`activated_at` |
| **F10** | Schéma additif | **Uniquement de nouvelles tables** (forfaits, abonnements, annonces de boutique) et de nouvelles routes/pages |

### 2.2 Hors-périmètre détaillé — explicite et non négociable

| Sujet intouché | Raison / verrou |
|---|---|
| `POST /api/products`, `/vendre`, `/mes-articles` | Aucun contrôle de quota, aucun changement de validation ni de statut (CA-V5-069, CA-V5-070) |
| Catalogue, recherche, catégories, fiche produit | Aucune URL, forme de réponse, filtre, tri ou libellé modifié ; la fiche ne réintroduit aucun canal de contact (CA-V5-101, `cahier-des-charges-v5.md:498`) |
| Panier, commandes, checkout, paiement, payouts | Aucun changement de comportement ; la commission vendeur reste **10 %** depuis la source de vérité (CA-V5-150, `:620`) ; **aucune écriture** dans `storefront_listings`, aucun trigger sur `products` |
| Notifications existantes | Aucune notification supprimée, déplacée ou modifiée ; seule une **nouvelle** notification de contact boutique peut être ajoutée |
| `users`, `products`, `orders` et toute table existante | **Aucune colonne ajoutée** ; aucun `ALTER TABLE` ; uniquement de nouvelles tables (CA-V7-001) |
| Rôles `user` / `admin` | Aucun nouveau rôle, aucun changement de RBAC, aucune élévation de privilège (CA-V7-002/052) |
| Parrainage « Le Cercle des 10 » | Aucune écriture dans `referred_by`, `ambassador_until`, `vitrine_until`, `referral_qualifications` ; badge et priorité Vitrine inchangés (`docs/api.md:2003`) |
| Vitrine gagnée (`vitrine_until`) | Aucune interaction avec le quota boutique ; les deux mécanismes sont indépendants |
| Paiement en ligne / abonnement récurrent automatique | Aucun checkout abonnement, aucune carte, aucun webhook de paiement dans cette phase (CA-V7-014) |
| Application mobile native | Hors périmètre, cohérent V1→V6 |
| CRUD admin des forfaits | Les forfaits sont configurés en base (seed/migration) ; aucune interface de création de forfait en V7 |
| Bannir un utilisateur / changer un rôle via l'admin | Inchangé : aucun endpoint d'écriture utilisateur n'est ajouté |
| Envoi d'e-mails de campagne / newsletter | Hors périmètre, cohérent avec V5 |
| Suppression définitive (hard delete) d'un produit | Inchangé : soft delete admin-only conservé |
| Numéro de téléphone / WhatsApp / e-mail du vendeur | Jamais exposé (D2, `docs/cahier-des-charges.md:40`) |

### 2.3 Interprétation à consigner explicitement

1. **Le quota s'applique au nombre d'annonces affichées dans la boutique dédiée, pas au nombre de produits du vendeur.** Un vendeur au quota boutique atteint peut continuer à publier autant de produits qu'il veut dans le catalogue principal.
2. **Le contrôle de quota a lieu à un seul endroit** : l'ajout d'une annonce à la boutique via la nouvelle route dédiée (F6). Aucun autre point d'entrée ne consulte le quota.
3. **Un dépassement n'empêche jamais une vente.** L'annonce refusée par la boutique reste une annonce catalogue normale, visible, réservable et payable selon le parcours existant.
4. **Aucune modification de table existante.** L'abonnement et les annonces de boutique vivent dans de nouvelles tables reliées par clé étrangère à `users` et `products` en lecture seule. Le statut d'une annonce de boutique est **dérivé de `products.status`** : la table de liaison n'a **aucune colonne `status`**.
5. **Conséquence directe** : CA-V5-069 (10 créations → 201) et CA-V5-070 (bouton Vendre jamais conditionné) restent verts **sans amendement** (§8).

---

## 3. Décisions utilisateur (déjà prises, non renégociables)

| # | Décision | Conséquence dans ce cahier |
|---|---|---|
| D1 | Espace dédié = **boutique publique `/boutique/:slug` + espace abonné privé `/mon-abonnement`** | F1, F2 ; aucune autre page n'est ajoutée |
| D2 | Quota = **annonces actives simultanées** (`PENDING|AVAILABLE|RESERVED`) ; `SOLD`/`REJECTED`/supprimées libèrent une place ; **pas de reset mensuel** | F5, CA-V7-031/036/037 |
| D3 | Vendeurs actuels / non-abonnés = **comportement inchangé, illimité** ; CA-V5-069 et CA-V5-070 non modifiés | CA-V7-003/004, §8 |
| D4 | Souscription = **choix du forfait par le vendeur puis activation manuelle par l'admin** (`PENDING → ACTIVE`) ; **aucun paiement en ligne** dans cette phase | F3, CA-V7-012/013/014 |
| D5 | « Ça ne doit pas impacter ni changer les fonctionnalités existantes, ni vendre un article ; tu l'ajoutes juste comme nouvelle fonctionnalité. » | §2.2, §2.3, §8, CA-V7-001/002/005/038 |

---

## 4. Règles métier

### 4.1 Paliers de forfaits définitifs — **VALIDÉ PAR L'UTILISATEUR LE 17/11/2026**

> Les valeurs ci-dessous sont **définitives et validées par l'utilisateur le 17/11/2026** (PO-V7-01/02, désormais tranchés). Elles restent stockées en base (champ entier FCFA) et ne sont **jamais codées en dur dans le front** (CA-V7-010 inchangé).

| Palier | Prix (FCFA / mois) | Quota (annonces **de boutique**) | Statut |
|---|---|---|---|
| Découverte | 2 000 | 10 | **validé par l'utilisateur le 17/11/2026** |
| Boutique | 5 000 | 30 | **validé par l'utilisateur le 17/11/2026** |
| Atelier | 10 000 | 100 | **validé par l'utilisateur le 17/11/2026** |

### 4.2 Règles de cycle de vie et de données

| Règle | Énoncé vérifiable |
|---|---|
| **Slug unique** | Un slug ne peut appartenir qu'à un seul vendeur, même après expiration de l'abonnement. Deux demandes identiques → la seconde est refusée (`409 SLUG_TAKEN`). Normalisation : minuscules, espaces → `-`, suppression des accents. |
| **Mots réservés** | Liste proposée (à confirmer, PO-V7-06) : `admin`, `api`, `boutique`, `catalogue`, `vendre`, `mes-articles`, `mon-abonnement`, `parrainage`, `panier`, `profil`, `login`, `register`, `search`, `static`, `assets`, `health`, `www`, `help`, `contact`, `legal`. Refus `400 SLUG_RESERVED`. |
| **Format slug** | `^[a-z0-9]+(?:-[a-z0-9]+)*$`, longueur 3 à 40 caractères. Aucun `/`, `.`, `_`, accent ni tiret consécutif. |
| **Un seul abonnement actif par vendeur** | Contrainte d'unicité sur `(seller_id) WHERE status = 'ACTIVE'`. Une seconde activation échoue (`409 SUBSCRIPTION_ALREADY_ACTIVE`). |
| **Souscription** | Le vendeur choisit un forfait → création d'un abonnement `PENDING`. Aucun accès abonné, aucune boutique publique tant que l'admin n'a pas activé. |
| **Activation manuelle** | Seul un `admin` peut passer `PENDING → ACTIVE` ; l'action est tracée (`activated_by`, `activated_at`). Aucun webhook, cron ou paiement ne peut lever le statut. |
| **Changement de forfait** | Proposition (PO-V7-04) : création d'un nouvel abonnement `PENDING` ; l'abonnement `ACTIVE` reste actif jusqu'à activation du nouveau, puis passe `CANCELLED` ; jamais deux `ACTIVE` simultanés. L'historique est conservé. |
| **Expiration** | Durée **définitive : 30 jours glissants après activation** (PO-V7-03 validé le 17/11/2026). À l'échéance `ends_at`, l'abonnement passe `EXPIRED` : `/boutique/:slug` est masqué (**404**), les annonces de boutique sont **conservées, pas supprimées**, le catalogue reste intact, et un **message clair** s'affiche dans `/mon-abonnement`. Re-souscription possible. |
| **Comptage du quota** | Le statut d'une annonce de boutique est **dérivé en lecture** de `products.status` par jointure, jamais stocké. Requête : `SELECT COUNT(*) FROM storefront_listings l JOIN products p ON p.id = l.product_id WHERE l.subscription_id = $1 AND l.withdrawn_at IS NULL AND p.status IN ('PENDING','AVAILABLE','RESERVED') AND p.deleted_at IS NULL`. La table de liaison ne contient **que** `(product_id, subscription_id, created_at, withdrawn_at)` et **aucun `status`** : aucune écriture dans le pipeline de commande/paiement, aucun trigger sur `products`, aucun compteur dénormalisé, aucun reset mensuel, aucun cron. `SOLD`/`REJECTED` (via `products.status`) et retrait (via `withdrawn_at`) libèrent une place. |
| **Retrait d'une annonce de boutique** | Pose `withdrawn_at` sur la ligne de liaison (aucun `status` n'est écrit) : le listing disparaît de la boutique et libère une place ; le produit catalogue, ses commandes et son historique restent inchangés. |
| **Contact via formulaire interne** | Tout contact avec le vendeur abonné passe par un formulaire interne boutique-scopé générant une notification interne. **Jamais** de numéro de téléphone, WhatsApp, e-mail direct, `tel:` ou `mailto:` exposé (D2, `docs/cahier-des-charges.md:40`). Ce formulaire ne réintroduit aucun canal sur la fiche produit (CA-V5-101). |
| **Indépendance du parrainage** | L'abonnement ne lit ni n'écrit `referred_by`, `ambassador_until`, `vitrine_until` ni `referral_qualifications`. Le badge Ambassadeur et la Vitrine gagnée restent priorisés au tri par défaut. |

---

## 5. User stories

**US-V7-01** — *En tant que vendeur, je veux choisir un forfait et soumettre une demande d'abonnement, afin d'obtenir une boutique dédiée sans payer en ligne.*
- Exigences : écran de choix des 3 paliers dans `/mon-abonnement` ; statut `PENDING` affiché ; message « En attente d'activation par l'administration ».
- Contraintes : aucun champ de paiement, aucun prix codé en dur, prix définitif affiché depuis la base (validé le 17/11/2026), accessibilité clavier.

**US-V7-02** — *En tant qu'administrateur, je veux voir les demandes en attente et activer manuellement un abonnement, afin de contrôler l'ouverture des boutiques.*
- Exigences : liste `PENDING` avec vendeur, forfait, date ; action « Activer » ; traçabilité.
- Contraintes : accès admin uniquement, aucun changement de rôle, aucun octroi automatique.

**US-V7-03** — *En tant que vendeur abonné, je veux ajouter une annonce à ma boutique, afin de la mettre en avant dans ma vitrine dédiée.*
- Exigences : nouvelle route dédiée ; produit existant du vendeur ; contrôle de quota à cet endroit seulement.
- Contraintes : quota = annonces actives de boutique ; dépassement → message clair ; le produit reste vendable dans le catalogue.

**US-V7-04** — *En tant que vendeur au quota atteint, je veux retirer une annonce de ma boutique ou changer de forfait, afin de libérer une place sans perdre mon produit.*
- Exigences : retrait boutique-scopé ; demande de changement de forfait `PENDING`.
- Contraintes : le retrait ne supprime aucun produit ni commande ; pas de reset mensuel.

**US-V7-05** — *En tant que visiteur, je veux consulter la boutique publique d'un vendeur abonné, afin de découvrir ses annonces dédiées.*
- Exigences : `/boutique/:slug` public, responsive, lisible au clavier, uniquement les annonces actives de la boutique.
- Contraintes : `404` si non abonné / `PENDING` / `EXPIRED` ; aucune coordonnée privée ; 0 erreur JS.

**US-V7-06** — *En tant que visiteur, je veux contacter le vendeur via un formulaire interne, afin de l'interroger sans obtenir son numéro.*
- Exigences : message 10–2000 caractères, e-mail d'échange optionnel, notification interne au vendeur, toast de succès.
- Contraintes : boutique uniquement ; aucun `tel:`/`mailto:` ; absent de la fiche produit ; auto-contact refusé.

**US-V7-07** — *En tant qu'Ambassadeur « Le Cercle des 10 », je veux cumuler ma Vitrine gagnée et ma boutique abonnée, afin de conserver mes avantages sans conflit.*
- Exigences : badge Ambassadeur et priorité Vitrine au tri par défaut inchangés.
- Contraintes : aucune écriture de `vitrine_until` par V7 ; commission 10 % inchangée.

---

## 6. Critères d'acceptation (45 critères, binaires)

> Chaque critère indique sa **donnée mesurable** et la **preuve à produire par `@tester`**. Un critère non prouvé est non conforme.

### 6.1 Schéma additif et isolation (CA-V7-001 → 006)

- **CA-V7-001** `[EXEC]` **Aucune colonne ajoutée aux tables existantes.** Avant et après la migration V7, la requête `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' ORDER BY 1,2` retourne un résultat **identique** pour `users`, `products`, `orders`, `notifications`, `referral_qualifications` et toute autre table préexistante. Seules apparaissent **3 nouvelles tables** (forfaits, abonnements, annonces de boutique). Aucun `ALTER TABLE ... ADD COLUMN` dans les migrations V7.
- **CA-V7-002** `[AUDIT]` **Aucun changement de rôle.** Le type `role` ne contient que `user` et `admin` ; aucun `role = 'seller'|'subscriber'` ; `requireUser` / `requireAdmin` existants réutilisés. Preuve : revue de la migration et des middlewares, 0 nouvelle valeur de rôle.
- **CA-V7-003** `[TEST]` **Non-abonné : 10 produits → 201 (verrou CA-V5-069 intact).** Un vendeur sans abonnement crée **10 produits successivement** via `POST /api/products` : les 10 réponses sont `201`, `SELECT COUNT(*) FROM products WHERE owner_id = $1` = **10**. Après passage du produit n°1 en `SOLD`, la publication du produit n°11 répond **201**. Aucune vérification d'abonnement n'est exécutée dans ce handler.
- **CA-V7-004** `[TEST]` **Bouton « Vendre » jamais conditionné (verrou CA-V5-070 intact).** Le point d'entrée de vente est présent pour un vendeur non abonné ayant **0, 1 et ≥ 10** articles, depuis la navbar, le profil, « Mes articles » et l'accueil. Aucun `status`, `role`, compteur ou abonnement ne conditionne son affichage. Contrôle positif **et** négatif (présence dans les 3 cas, absence de toute logique de désactivation).
- **CA-V7-005** `[TEST]` **Parité comportementale des routes existantes.** Pour chaque route inchangée (`POST /api/products`, `GET /mes-articles`, catalogue, fiche produit, commandes, checkout, paiement, payouts, notifications), la réponse avant/après V7 est **identique** pour un même jeu de données (codes HTTP, corps JSON, statuts persistés). Preuve : suite de tests V5 existante rejouée intégralement, **0 test en échec**, 0 amendement de test.
- **CA-V7-006** `[TEST]` **Commission 10 % inchangée.** Sur une commande créée après déploiement V7, la commission affichée et persistée vaut exactement `COMMISSION_RATE` (source de vérité), égale à **10 %** du prix, et le net vendeur = prix − commission. Aucun « 10 % » codé en dur dans le JSX, aucun frais d'abonnement prélevé sur une vente (CA-V5-150, `cahier-des-charges-v5.md:620`).

### 6.2 Forfaits et abonnement (CA-V7-010 → 016)

- **CA-V7-010** `[EXEC]` **3 paliers définitifs, prix et quotas stockés en base.** `SELECT * FROM subscription_plans` retourne **3 lignes** : `Découverte` (**2 000 FCFA/mois, 10 annonces**), `Boutique` (**5 000 FCFA/mois, 30**) et `Atelier` (**10 000 FCFA/mois, 100**), **validées par l'utilisateur le 17/11/2026**. Le champ `price_fcfa` est un entier ≥ 0 non nul, alimenté par seed/migration ; **aucune valeur tarifaire n'est écrite en dur dans le front** (exigence inchangée). Preuve : requête SQL + `grep -rn "2000\|5000\|10000" web/src` → 0 occurrence liée aux forfaits.
- **CA-V7-011** `[TEST]` **Un seul abonnement `ACTIVE` par vendeur.** Une contrainte d'unicité partielle interdit deux `ACTIVE` pour le même `seller_id`. Test : activation d'un 2e abonnement du même vendeur → `409 SUBSCRIPTION_ALREADY_ACTIVE`, `SELECT COUNT(*) ... WHERE status='ACTIVE'` = **1**.
- **CA-V7-012** `[TEST]` **Souscription = `PENDING`, sans accès abonné.** Le vendeur choisit un forfait → création `PENDING`. Avant activation : `/mon-abonnement` affiche « En attente d'activation par l'administration », `GET /boutique/:slug` → **404**, et tout appel à la route d'ajout boutique → **403 SUBSCRIPTION_REQUIRED**.
- **CA-V7-013** `[TEST]` **Activation manuelle par l'admin uniquement.** `POST /api/admin/subscriptions/:id/activate` par un `admin` → `200`, statut `ACTIVE`, `activated_by` = admin connecté, `activated_at` non nul ; le même appel par un `user` → **403** ; la boutique devient publique immédiatement (`GET /boutique/:slug` → **200**). Aucun autre chemin ne modifie le statut.
- **CA-V7-014** `[AUDIT]` + `[TEST]` **Aucun paiement en ligne.** Aucune route de paiement, aucun champ de carte, aucun webhook, aucun cron ne peut passer un abonnement en `ACTIVE`. Un test tente les chemins alternatifs (payload client avec `status: 'ACTIVE'`, appel direct au dépôt) : tous sont rejetés. Aucune donnée bancaire stockée.
- **CA-V7-015** `[TEST]` **Changement de forfait sans double `ACTIVE`.** Un vendeur `ACTIVE` sur `Boutique` demande `Atelier` → nouvel abonnement `PENDING` ; l'ancien reste `ACTIVE` ; `COUNT(ACTIVE)` = **1** ; après activation du nouveau, `COUNT(ACTIVE)` = **1** (le nouveau) et l'ancien passe `CANCELLED` ; l'historique conserve les 2 enregistrements. Le quota appliqué est celui du forfait `ACTIVE`.
- **CA-V7-016** `[TEST]` **Expiration (30 jours glissants, PO-V7-03 validé le 17/11/2026).** Un abonnement activé à T0 passe `EXPIRED` à T0+30 jours (`ends_at = activated_at + 30 jours`). Avec `ends_at` fixé dans le passé en test : `GET /boutique/:slug` → **404**, les annonces de boutique ne sont plus affichées mais **toujours conservées en base**, `/mon-abonnement` affiche un **message clair** d'expiration avec possibilité de re-souscription, et les **mêmes produits restent visibles et vendables dans le catalogue**.

### 6.3 Slug et boutique publique (CA-V7-020 → 027)

- **CA-V7-020** `[TEST]` **Unicité du slug.** Deux vendeurs demandent `mode-dakar` : le premier obtient `201`, le second `409 SLUG_TAKEN`. La normalisation est vérifiée : `Mode Dakar` et `mode-dakar` sont considérés identiques. Le slug reste réservé après expiration de l'abonnement du premier vendeur.
- **CA-V7-021** `[TEST]` **Mots réservés.** Pour chacun des 20 mots de la liste §4.2, une demande de slug retourne `400 SLUG_RESERVED` et aucun abonnement n'est créé. Preuve : test paramétré 20 cas, 20 refus.
- **CA-V7-022** `[TEST]` **Validation du format.** `^[a-z0-9]+(?:-[a-z0-9]+)*$`, 3–40 caractères. Cas valides : `mode-dakar`, `shop123`. Cas invalides refusés `400` : `a`, `ab`, `--x`, `x--y`, `mode_dakar`, `mode.dakar`, `république`, `a/b`, 41 caractères.
- **CA-V7-023** `[TEST]` **Boutique publique accessible sans compte.** Pour un abonnement `ACTIVE`, `GET /boutique/:slug` (visiteur anonyme) → **200** et n'affiche **que** les annonces de boutique actives du vendeur. Aucune session n'est requise.
- **CA-V7-024** `[TEST]` **Non-divulgation des boutiques inexistantes.** Pour un vendeur non abonné, `PENDING` ou `EXPIRED`, `GET /boutique/:slug` → **404** avec une réponse identique à celle d'un slug inconnu (aucune indication d'existence du vendeur).
- **CA-V7-025** `[EXEC]` **Isolation des listings.** Un vendeur abonné possède **3 annonces de boutique** et **12 produits catalogue** : la page boutique affiche exactement **3 cartes**, le catalogue affiche **15 produits** (inchangé). Preuve : comptage DOM + requête SQL.
- **CA-V7-026** `[TEST]` **Aucune coordonnée privée exposée.** La réponse HTML/JSON de `/boutique/:slug` ne contient **aucune** occurrence de `phone`, `whatsapp`, `email` du vendeur, ni de `tel:`, ni de `mailto:`. Le sérialiseur public utilisé n'inclut pas `users.phone` (D2, `docs/cahier-des-charges.md:40`). Test : regex sur la réponse + revue du sérialiseur, 0 fuite.
- **CA-V7-027** `[TEST]` **Accessibilité clavier de la boutique.** Tab/Entrée permettent d'atteindre et d'activer **tous** les liens et boutons ; indicateur de focus visible ; `alt` sur chaque image ; contrastes AA ; `aria-label` sur les contrôles iconographiques. Outil : axe/Playwright → **0 violation critique ou sérieuse**.

### 6.4 Quota et annonces de boutique (CA-V7-030 → 039)

- **CA-V7-030** `[TEST]` **Nouvelle route dédiée, distincte du catalogue.** `POST /api/storefront/listings` (nom définitif à confirmer, PO-V7-09) exige un utilisateur authentifié, **propriétaire** du produit et un abonnement `ACTIVE`. `POST /api/products` reste inchangé. Un appel avec un produit d'autrui → **403** ; sans abonnement → **403 SUBSCRIPTION_REQUIRED**.
- **CA-V7-031** `[TEST]` **Quota = annonces actives simultanées de la boutique.** Avec le forfait `Découverte` (10) : ajouts n°1→n°10 → `201` ; n°11 → `409 STOREFRONT_QUOTA_EXCEEDED`. Le comptage **dérive les statuts de `products.status` par jointure en lecture** (`PENDING|AVAILABLE|RESERVED`, `deleted_at IS NULL`, listing non retiré), sans statut stocké sur la liaison. Après passage du **produit** n°1 en `SOLD`, l'ajout n°11 → **201**. Après `REJECTED` du **produit** n°2, un nouvel ajout → **201**. Aucun reset mensuel (CA-V7-036).
- **CA-V7-032** `[TEST]` **Dépassement → message clair, sans effet de bord.** Le `409` contient un message explicite indiquant le quota et l'action possible (« Quota de votre forfait atteint (10/10). Retirez une annonce de votre boutique ou changez de forfait. »). Aucune annonce de boutique n'est créée, aucun produit n'est modifié, aucune vente n'est bloquée.
- **CA-V7-033** `[TEST]` **L'annonce refusée par la boutique reste vendable dans le catalogue.** Au quota atteint, créer un produit via `POST /api/products` → **201** ; le produit apparaît dans le catalogue et sa fiche ; une commande avec checkout et paiement aboutit selon le parcours existant ; la commission reste **10 %**. Ce critère est le garde-fou central de l'interprétation §2.3.
- **CA-V7-034** `[TEST]` **Retrait boutique-scopé.** Retirer un listing de la boutique (poser `withdrawn_at` sur la ligne de liaison, **sans écrire de statut**) → il disparaît de `/boutique/:slug`, une place est libérée (nouvel ajout → `201`), mais le produit reste dans le catalogue, sa fiche répond `200` et ses commandes en cours sont intactes.
- **CA-V7-035** `[TEST]` **Cohérence des deux vues.** Un produit peut être simultanément dans la boutique et dans le catalogue ; les deux vues affichent le **même `id`, le même titre et le même prix**. Aucune duplication de produit (une seule ligne dans `products`).
- **CA-V7-036** `[TEST]` **Pas de reset mensuel.** À T0, quota 10/10 ; à T0+35 jours sans retrait ni changement, le quota est **toujours 10/10** et l'ajout suivant est refusé. Aucun cron, job ou colonne `reset_at` ne réinitialise le compteur.
- **CA-V7-037** `[TEST]` **Une vente libère une place par dérivation en lecture, sans toucher au pipeline.** Après checkout et paiement d'un produit présent dans la boutique (`products.status = SOLD`, écrit uniquement par le pipeline existant), le quota passe de **10/10 à 9/10** et l'ajout suivant répond **201**. Mesure : la requête avec `JOIN products p ON p.id = l.product_id`, `l.withdrawn_at IS NULL`, `p.status IN ('PENDING','AVAILABLE','RESERVED')` et `p.deleted_at IS NULL`, exécutée avant/après. Preuve obligatoire : (a) test qui passe le produit en `SOLD` via le parcours de commande existant puis relit le quota ; (b) `grep -rnE 'storefront_listings|subscription_id|STOREFRONT_QUOTA|withdrawn_at' server/src --include='*order*' --include='*payment*' --include='*checkout*'` → **0 occurrence** ; (c) `git diff` des fichiers du pipeline de commande/paiement = **0 ligne modifiée** ; (d) aucune écriture de statut dans la table de liaison.
- **CA-V7-038** `[AUDIT]` **Aucune logique de quota ni écriture V7 hors de la nouvelle route.** `grep -rn "quota\|STOREFRONT_QUOTA\|subscription" server/src` ne retourne **aucune** occurrence dans les handlers `POST /api/products`, `/vendre`, `/mes-articles`, catalogue, fiche produit, commandes, checkout, paiement. Preuve complémentaire : `grep -rnE 'storefront_listings|CREATE TRIGGER' server/src --include='*order*' --include='*payment*' --include='*checkout*'` → **0 occurrence** ; `grep -rn 'CREATE TRIGGER' migrations` → **0 trigger sur `products`**. Le statut est dérivé en lecture (CA-V7-037) ; revue ciblée : 0 accès au quota, 0 écriture de listing.
- **CA-V7-039** `[TEST]` **Non-abonné : catalogue illimité, boutique inaccessible.** Un vendeur sans abonnement crée **15 produits** → 15 × `201` ; toute tentative d'ajout à une boutique → `403`. Son bouton « Vendre » reste présent (CA-V7-004).

### 6.5 Contact interne boutique (CA-V7-045 → 048)

- **CA-V7-045** `[TEST]` **Formulaire interne fonctionnel.** Depuis la boutique, un visiteur envoie un message de **10 à 2000 caractères** avec un e-mail d'échange optionnel → `201 { ok: true, notificationId }` et **une** notification interne au vendeur abonné. Message hors bornes → `400`. Aucune donnée d'un autre vendeur n'est transmise.
- **CA-V7-046** `[TEST]` **Aucun numéro direct.** Ni la réponse, ni la notification, ni le HTML de la boutique ne contient `phone`, `whatsapp`, `tel:` ou `mailto:`. Aucun bouton d'appel ni lien WhatsApp n'est rendu (D2, `docs/cahier-des-charges.md:40`).
- **CA-V7-047** `[TEST]` **Aucune réintroduction sur la fiche produit.** `/catalogue/:slug` ne contient aucun libellé « Contacter », « Écrire au vendeur », ni `mailto:`/`tel:`. Le verrou CA-V5-101 (`cahier-des-charges-v5.md:498`) reste vert : le formulaire est **strictement boutique-scopé**, il ne modifie pas la fiche produit.
- **CA-V7-048** `[TEST]` **Auto-contact refusé.** Le vendeur propriétaire de la boutique ne peut pas s'envoyer de message via le formulaire → `400 CONTACT_SELF`.

### 6.6 Gouvernance admin (CA-V7-050 → 054)

- **CA-V7-050** `[TEST]` **Accès admin uniquement.** `GET /api/admin/subscriptions` et l'écran `/admin/abonnements` répondent `200` pour un `admin` ; un `user` authentifié est redirigé vers l'accueil sans voir de page 403 (convention ARB-V5-02) et reçoit `403` sur l'API.
- **CA-V7-051** `[TEST]` **File `PENDING` et traçabilité.** La liste affiche vendeur, forfait, date de demande pour chaque `PENDING`. Après activation, `activated_by` et `activated_at` sont renseignés et visibles dans l'historique. Test : 3 demandes `PENDING` → 3 lignes affichées → activation de la 2e → 2 lignes restent.
- **CA-V7-052** `[AUDIT]` **Aucun changement de rôle ni d'élévation de privilège.** Aucun endpoint n'écrit `users.role` ; aucun rôle supplémentaire n'est introduit ; les permissions admin existantes sont inchangées.
- **CA-V7-053** `[AUDIT]` **Pas de CRUD forfait dans l'UI.** Aucun écran ni endpoint de création/modification/suppression de forfait en V7 ; les paliers proviennent de la migration/seed.
- **CA-V7-054** `[TEST]` **Parrainage et Vitrine préservés.** Après souscription et activation d'un vendeur Ambassadeur, `users.referred_by`, `users.ambassador_until`, `users.vitrine_until` et `referral_qualifications` sont **bit à bit identiques** à leur état avant V7. Le badge Ambassadeur apparaît toujours sur la fiche produit et la priorité Vitrine au tri par défaut reste effective (`docs/api.md:2003`, `docs/journal.md:4269`).

### 6.7 Qualité transverse (CA-V7-060 → 064)

- **CA-V7-060** `[EXEC]` **Gates verts.** `cd server && npx tsc --noEmit` → 0 erreur ; `cd web && npx tsc -b` → 0 erreur ; suites de tests existantes + nouveaux tests → **0 échec** ; build web OK. Commandes et outputs cités dans la grille de recette (§9).
- **CA-V7-061** `[TEST]` **Aucune erreur JavaScript.** Sur `/boutique/:slug` et `/mon-abonnement`, en visiteur anonyme et en vendeur connecté, un test Playwright `pageerror` et `console.error` relève **0 erreur**.
- **CA-V7-062** `[TEST]` **Accessibilité de l'espace abonné.** Navigation clavier complète, focus visible, tous les champs étiquetés, messages d'état annoncés (`aria-live`) ; axe/Playwright → **0 violation critique ou sérieuse**.
- **CA-V7-063** `[AUDIT]` **Contrat documenté.** Chaque nouvelle route est décrite dans `docs/api.md` (version **2.7**) avec ses codes de réponse, son corps et ses erreurs (`SLUG_TAKEN`, `SLUG_RESERVED`, `SUBSCRIPTION_REQUIRED`, `SUBSCRIPTION_ALREADY_ACTIVE`, `STOREFRONT_QUOTA_EXCEEDED`, `CONTACT_SELF`). **Ce cahier ne modifie pas `docs/api.md`** : sa mise à jour est un livrable de `@backend`.
- **CA-V7-064** `[TEST]` **Responsive mobile.** À 375 px de large, `/boutique/:slug` et `/mon-abonnement` n'ont **aucun débordement horizontal** (`document.documentElement.scrollWidth <= 375`) et tous les contrôles restent atteignables au toucher.

### 6.8 Récapitulatif des critères

| Groupe | Plage | Nombre |
|---|---|---|
| 6.1 Schéma additif et isolation | CA-V7-001 → 006 | 6 |
| 6.2 Forfaits et abonnement | CA-V7-010 → 016 | 7 |
| 6.3 Slug et boutique publique | CA-V7-020 → 027 | 8 |
| 6.4 Quota et annonces de boutique | CA-V7-030 → 039 | 10 |
| 6.5 Contact interne boutique | CA-V7-045 → 048 | 4 |
| 6.6 Gouvernance admin | CA-V7-050 → 054 | 5 |
| 6.7 Qualité transverse | CA-V7-060 → 064 | 5 |
| **TOTAL** | | **45** |

---

## 7. Matrice de risques (actionnable)

> Format : **ID — risque** · impact×probabilité · **statut** · action / propriétaire · plan B. Un risque sans action n'existe pas.

| ID | Risque | Niveau | Action (propriétaire) | Plan B / attendu |
|---|---|---|---|---|
| **R-V7-01** | Prix et quotas désormais **validés** : risque résiduel uniquement si un tarif est codé en dur dans le front | ✅ Clos (PO-V7-01/02 validés le 17/11/2026) | Maintenir CA-V7-010 : prix et quotas stockés en base, **0 tarif en dur** ; @backend | Aucun arbitrage restant ; tout écart tarifaire est détecté par la requête SQL et le `grep` du critère |
| **R-V7-02** | Fuite du quota dans `POST /api/products` → régression du catalogue (CA-V5-069/070) | 🔴 Critique | Exécuter CA-V7-003/004/033/038 **avant chaque merge** ; @tester + @backend | Feature flag désactivant V7 ; rollback immédiat ; aucun test V5 amendé |
| **R-V7-03** | Activation manuelle = goulot d'étranglement (admin seul, file `PENDING` qui s'accumule) | ⚠️ Important | Écran admin avec filtre `PENDING` + notification admin à la souscription ; @backend/@frontend. **Attend : PO-V7-08 (SLA)** | SLA annoncé aux vendeurs ; file traitée par lot |
| **R-V7-04** | Le formulaire de contact réintroduit un canal supprimé en V5 (C6, CA-V7-047) | ⚠️ Important | Périmètre strictement boutique + CA-V7-047 en test de non-régression ; @cahier-des-charges | Retirer F8 ; conserver uniquement la vitrine, sans formulaire |
| **R-V7-05** | Slug non normalisé → collision, injection de chemin ou caractères spéciaux | ⚠️ Important | Regex stricte + normalisation + mots réservés (CA-V7-020/021/022) + échappement React ; @backend | Whitelist serveur + rejection `400` avant toute écriture |
| **R-V7-06** | Tentation de dupliquer le statut du listing → écriture interdite dans le pipeline de commande | ⚠️ Important | Dériver le statut **en lecture** par jointure sur `products.status` (CA-V7-031/037/038) ; @backend | Aucun job de réconciliation nécessaire : la lecture reflète toujours `products.status` ; test de non-écriture en garde-fou |
| **R-V7-07** | Expiration désormais arbitrée : 30 jours glissants, `EXPIRED`, `/boutique/:slug` → 404, annonces conservées, message clair | ✅ Clos (PO-V7-03 validé le 17/11/2026) | Appliquer la règle §4.2 et CA-V7-016 ; @backend/@frontend | Aucun plan B nécessaire : l'arbitrage est acté dans le cadrage V7 |
| **R-V7-08** | Confusion entre abonnement et paiement produit : risque de prélever des frais sur une vente | ⚠️ Important | Aucun code d'abonnement dans le pipeline de commande ; CA-V7-006/014 ; @backend | Audit du calcul de commission avant recette |
| **R-V7-09** | Incohérence géographique (V7 « Sénégal », V1–V5 « Côte d'Ivoire ») | ℹ️ Mineur | Clarifier **PO-V7-07** ; aucun impact fonctionnel | Conserver la mention existante dans les docs antérieurs, non modifiés |
| **R-V7-10** | Nouvelles pages non accessibles (clavier, contraste, erreurs JS) | ℹ️ Mineur | CA-V7-027/061/062/064 dès le développement ; @frontend | Correctifs ciblés avant recette, sans toucher aux pages existantes |

**Risques ouverts à ce jour** : R-V7-03 (SLA d'activation, PO-V7-08) et R-V7-09 (PO-V7-07), qui attendent une décision. R-V7-01 et R-V7-07 sont **clos** (décisions du 17/11/2026) ; les autres sont **atténués par un critère de recette** et non bloquants pour l'architecture.

---

## 8. Conformité avec l'existant — démonstration de non-régression

> **Verrou central : CA-V5-069 et CA-V5-070 restent verts SANS amendement.** Aucun texte de ces critères n'est modifié, aucune condition n'est ajoutée, aucun test n'est assoupli. Le tableau ci-dessous démontre, référence à l'appui, pourquoi V7 ne peut pas les faire tomber.

| Élément existant | Référence exacte | Ce que V7 change | Résultat / preuve |
|---|---|---|---|
| **CA-V5-069** — 10 créations → 201, aucune limite de produits | `docs/cahier-des-charges-v5.md:399` | **Rien.** Le quota est dérivé en lecture de `products.status` via la table de liaison et contrôlé uniquement dans la nouvelle route (§2.3) | Vert sans amendement. Preuve : CA-V7-003 + CA-V7-039 rejoués |
| **CA-V5-070** — bouton « Vendre » jamais conditionné | `docs/cahier-des-charges-v5.md:400` | **Rien.** Aucun `status`, `role`, compteur ni abonnement n'est lu par le composant de vente | Vert sans amendement. Preuve : CA-V7-004 |
| **ARB-V5-05** — après une vente, le vendeur peut toujours vendre | `docs/cahier-des-charges-v5.md:114-115` | **Rien.** Le passage `SOLD` modifie `products.status` dans le pipeline existant ; la table de liaison n'est **pas écrite**, son statut est dérivé en lecture ; le droit de publier reste intact | Vert. Preuve : CA-V7-003 (11e produit après `SOLD`) |
| **CA-V5-150** — commission **10 %** exacte depuis la source de vérité, création en 5 étapes | `docs/cahier-des-charges-v5.md:620`, récap `:719` | **Rien.** Aucun tarif d'abonnement n'entre dans le calcul de commande ; la création d'annonce en 5 étapes de `POST /api/products` est inchangée | Vert. Preuve : CA-V7-005 + CA-V7-006 + CA-V7-033 |
| **Parrainage « Le Cercle des 10 »** — 10 filleuls → badge 1 an + 30 j de Vitrine, commission inchangée | `docs/api.md:2003`, `docs/journal.md:4269` | **Rien.** Aucune écriture dans `referred_by`, `ambassador_until`, `vitrine_until`, `referral_qualifications` | Vert. Preuve : CA-V7-054 + CA-V7-001 (0 colonne ajoutée à `users`) |
| **Vitrine gagnée** (`vitrine_until`) | `docs/api.md:2033` | **Rien.** Mécanisme indépendant de la boutique abonnée | Vert. Preuve : CA-V7-054 |
| **D2 — coordonnées privées jamais exposées** | `docs/cahier-des-charges.md:40` | **Rien.** Le formulaire interne ne transmet que message + e-mail d'échange au vendeur | Vert. Preuve : CA-V7-026 + CA-V7-046 |
| **CA-V5-101** — aucun canal de contact sur la fiche produit | `docs/cahier-des-charges-v5.md:498` | **Rien.** Le formulaire est boutique-scopé ; `mailto:`/`tel:`/`Contacter` restent absents de la fiche | Vert. Preuve : CA-V7-047 |
| **Rôles `user`/`admin`, RBAC** | `docs/cahier-des-charges-v5.md:105` (ARB-V5-02) | **Rien.** Aucun nouveau rôle ; redirection des non-admin conservée | Vert. Preuve : CA-V7-002 + CA-V7-050 |
| **Schéma de base existant** | `docs/architecture.md` · migrations 001→009 | **Aucune colonne ajoutée** ; 3 nouvelles tables seulement | Vert. Preuve : CA-V7-001 (`information_schema` identique avant/après) |
| **Parcours d'achat, payouts, notifications existantes** | `docs/cahier-des-charges-v5.md` (C8, §5.8) | **Rien.** Aucune route existante modifiée | Vert. Preuve : CA-V7-005 (suite V5 rejouée, 0 amendement) |

**Conclusion de conformité** : V7 est une **extension additive**. Aucun verrou existant n'est amendé ; la non-régression est démontrée par 11 références croisées et 11 critères de preuve. Si l'un des critères CA-V7-003/004/006/033/054 échoue, V7 est **non conforme** et doit être désactivé par feature flag, sans modifier les cahiers antérieurs.

---

## 9. Grille de recette prévisionnelle (à exécuter par `@tester` après livraison)

> Statut à ce jour : **NON EXÉCUTÉE** — aucun code V7 n'est implémenté, conformément à la consigne. Les cases sont à cocher sur preuve, pas sur intention.

| # | Scénario de bout en bout | Critères | Preuve attendue | Résultat |
|---|---|---|---|---|
| 1 | Vendeur non abonné : 10 × `POST /api/products`, puis `SOLD`, puis 11e publication | CA-V7-003, 004, 039 | 11 × `201`, `COUNT=11`, bouton Vendre présent | ☐ |
| 2 | Choix forfait → `PENDING` → tentative d'accès boutique → activation admin → boutique `200` | CA-V7-012, 013, 014, 023, 024 | `403` avant, `200` après, `activated_by` renseigné | ☐ |
| 3 | Slug : doublon, 20 mots réservés, 9 formats invalides | CA-V7-020, 021, 022 | `409` + 20 × `400` + 9 × `400` | ☐ |
| 4 | Quota Découverte : 10 ajouts, 11e refusé, message clair, `SOLD` libère une place par lecture jointive | CA-V7-031, 032, 037, 038 | `409 STOREFRONT_QUOTA_EXCEEDED` puis `201` ; 0 écriture dans le pipeline de commande | ☐ |
| 5 | Au quota : créer un produit catalogue et le vendre jusqu'au paiement | CA-V7-033, 006, 005 | commande OK, commission = `COMMISSION_RATE`, suite V5 verte | ☐ |
| 6 | Retrait d'un listing, T0+35 jours sans reset, changement de forfait | CA-V7-034, 035, 036, 015 | place libérée, 10/10 à J+35, 1 seul `ACTIVE` | ☐ |
| 7 | Boutique publique : 3 listings / 12 produits catalogue, coordonnées, clavier, responsive | CA-V7-025, 026, 027, 064 | 3 cartes / 15 produits, 0 fuite, 0 violation axe | ☐ |
| 8 | Formulaire interne : envoi, auto-contact, absence sur fiche produit | CA-V7-045, 046, 047, 048 | `201` + notification, `400 CONTACT_SELF`, 0 `tel:`/`mailto:` | ☐ |
| 9 | Admin : liste `PENDING`, accès `user` refusé, traçabilité, forfaits non éditables | CA-V7-050, 051, 052, 053 | 3 lignes, `403`/redirect, 0 écriture de rôle | ☐ |
| 10 | Ambassadeur : badge, Vitrine, commission après souscription | CA-V7-054 | champs parrainage bit à bit identiques | ☐ |
| 11 | Gates techniques et erreurs JS | CA-V7-060, 061, 062, 063 | `tsc` 0 erreur, tests 0 échec, 0 `pageerror`, api.md v2.7 | ☐ |
| 12 | Schéma additif | CA-V7-001, 002 | `information_schema` identique + 3 nouvelles tables | ☐ |

---

## 10. Points ouverts et décisions validées le 17/11/2026

| ID | Point | Statut | Décision / proposition par défaut |
|---|---|---|---|
| **PO-V7-01** | Prix des 3 paliers | ✅ **Validé le 17/11/2026** | Découverte **2 000 FCFA/mois**, Boutique **5 000**, Atelier **10 000** ; stockés en base, jamais codés en dur dans le front (CA-V7-010) |
| **PO-V7-02** | Noms et quotas des paliers | ✅ **Validé le 17/11/2026** | **Découverte 10**, **Boutique 30**, **Atelier 100** annonces de boutique (§4.1) |
| **PO-V7-03** | Durée et expiration | ✅ **Validé le 17/11/2026** | **30 jours glissants** après activation ; `EXPIRED`, `/boutique/:slug` → 404, annonces conservées, message clair dans `/mon-abonnement` (§4.2, CA-V7-016) |
| **PO-V7-04** | Changement de forfait : **nouvel abonnement `PENDING`** ou modification de l'enregistrement courant ? | 🔓 Ouvert | Nouvel abonnement `PENDING`, ancien maintenu `ACTIVE`, historique conservé (F3, CA-V7-015) |
| **PO-V7-05** | Maintien du formulaire de contact boutique | ✅ **Validé le 17/11/2026 — tranché** | **Conservé**, strictement boutique-scopé, notification interne, **aucun canal sur la fiche produit** (CA-V7-047) |
| **PO-V7-06** | La liste des **20 mots réservés** (§4.2) est-elle la liste définitive ? faut-il ajouter des marques ou noms de catégories ? | 🔓 Ouvert | Liste §4.2 (CA-V7-021) |
| **PO-V7-07** | Le projet est-il bien « marketplace **Sénégal** » alors que V1–V5 mentionnent « Côte d'Ivoire » ? | 🔓 Ouvert | Conserver les docs antérieurs inchangés ; V7 mentionne Sénégal |
| **PO-V7-08** | Quel **SLA d'activation** admin (ex. < 24 h ouvrées) et faut-il notifier l'admin à chaque nouvelle demande ? | 🔓 Ouvert | Notification admin à la souscription ; SLA à définir (R-V7-03) |
| **PO-V7-09** | Le nom définitif de la route d'ajout (`POST /api/storefront/listings` proposé) et le mode de rattachement au produit (table de liaison, sans duplication) | 🔓 Ouvert | Table de liaison `storefront_listings(product_id, subscription_id)` |

---

## 11. Définition de Done — verdict

> Portée du verdict : **ce document de spécification**, pas l'implémentation V7 (aucune ligne de code n'a été écrite dans cette mission).

| # | Exigence de la mission | État | Preuve |
|---|---|---|---|
| 1 | Un seul nouveau fichier créé, aucun autre modifié | ✅ | `revends/docs/cahier-des-charges-v7-hebergement-vendeurs.md` ; `git status --porcelain` = 1 seul fichier modifié (ce cahier), 0 autre fichier touché |
| 2 | Version/date 17/11/2026, auteur, statut « Validé par le chef de projet le 17/11/2026 — base de cadrage V7 » | ✅ | En-tête du document |
| 3 | Objectifs, cibles, personas, fonctionnalités (enablement) | ✅ | §1, §2.1 |
| 4 | User stories au format « En tant que…, je veux…, afin de… » | ✅ | §5 (7 stories) |
| 5 | Hors-périmètre détaillé (liste explicite de tout ce qui est intouché) | ✅ | §2.2 (15 lignes) |
| 6 | Paliers définitifs, prix explicitement « validé par l'utilisateur le 17/11/2026 » | ✅ | §4.1, PO-V7-01/02 (tranchés) |
| 7 | Règles métier (slug, unicité, changement, expiration, retrait, contact interne) | ✅ | §4.2 |
| 8 | 45 critères `[TEST]`/`[EXEC]`/`[AUDIT]` avec données mesurables, dont tous les critères imposés | ✅ | §6.1 → §6.8 ; non-abonné 10→201 §6.1, quota boutique §6.4, dépassement + vendable §6.4, activation admin §6.2, unicité slug §6.3, coordonnées §6.3/6.5, clavier §6.3/6.7, 0 erreur JS §6.7 |
| 9 | Matrice de risques actionable | ✅ | §7 (10 risques, actions et plans B) |
| 10 | Section « Conformité avec l'existant » (CA-V5-069/070/150, parrainage) | ✅ | §8 (11 références croisées) |
| 11 | Auto-revue relue et corrigée | ✅ | Corrections de frappe et cohérence des numéros de critères vérifiées avant verdict |
| 12 | Aucune implémentation, test de code ou déploiement lancé | ✅ | Aucune commande de build/test/deploy exécutée ; lecture seule des docs |

### Preuves matérielles

- **Fichier** : `revends/docs/cahier-des-charges-v7-hebergement-vendeurs.md`
- **Sections** : 11 sections principales (en-tête + §1 à §11), dont 8 sous-sections de critères
- **Critères d'acceptation** : **45** (CA-V7-001 à CA-V7-064, répartis en 7 groupes)
- **User stories** : 7 · **Risques** : 10 · **Points suivis** : 9 (**4 validés** : PO-V7-01/02/03/05 ; **5 ouverts** : PO-V7-04/06/07/08/09) · **Scénarios de recette** : 12
- **Références V5 citées** : `cahier-des-charges-v5.md:114-115`, `:399`, `:400`, `:498`, `:620`, `:719`, `:105` ; `api.md:2003`, `:2033` ; `journal.md:4269` ; `cahier-des-charges.md:40`

### VERDICT

**PRÊT POUR VALIDATION** — le cahier est complet, binaire, prouvable et additif ; **validé par le chef de projet le 17/11/2026 comme base de cadrage V7**.

**Points désormais validés** : **PO-V7-01/02** (paliers et tarifs définitifs), **PO-V7-03** (30 jours glissants et expiration) et **PO-V7-05** (formulaire de contact conservé, strictement boutique-scopé) sont **tranchés et intégrés au cadrage V7** depuis le 17/11/2026. Seuls les points ouverts restants (**PO-V7-04/06/07/08/09**) disposent d'une proposition par défaut et **n'empêchent pas l'architecture**. Aucun livrable V7 n'est déclaré Done : la grille de recette §9 reste **non exécutée** tant que le code n'existe pas.




