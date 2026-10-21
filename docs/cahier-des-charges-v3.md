# CAHIER DES CHARGES V3 — Plateforme de revente d'articles d'occasion « ReVends »

| | |
|---|---|
| **Version** | 3.0 (évolution de la V2 du 20/09/2026) |
| **Auteur** | Agent cahier-des-charges, pour l'équipe projet |
| **Statut** | À valider par le chef de projet et le client |
| **Périmètre** | Évolutions **E1** (connexion unifiée) et **E2** (gestion de la livraison) uniquement |
| **Documents liés** | `docs/cahier-des-charges-v2.md` (V2, référence pour tout ce qui n'est pas modifié ici) · `docs/api.md` · `docs/architecture.md` |

> **Principe de lecture.** Ce document est la source de vérité produit pour le
> périmètre **restreint E1 + E2**. Il **remplace** la V2 sur trois points
> uniquement : (1) l'authentification et sa page front, (2) le cycle de statuts
> de commande et la livraison, (3) la traçabilité horodatée des statuts. Tout le
> reste de la V2 reste en vigueur tel quel (voir §3 Conservations). Chaque
> différence V2 → V3 est un **arbitrage explicite**, listé au §1.4.

---

## 1. Rappel de l'existant V2 et changements (CHANGES)

### 1.1 Synthèse de l'existant V2

- **Plateforme** : web (React/Vite) + API Express/PostgreSQL ; revente
  d'occasion en Côte d'Ivoire, prix FCFA ; **intermédiaire obligatoire** :
  acheteur et vendeur ne sont jamais mis en relation directe (D2).
- **Acteurs** : visiteur, utilisateur (acheteur **et** vendeur, compte
  unique), administrateur (compte seedé, pas d'inscription publique),
  plateforme (encaissement/reversement pilotés par l'admin).
- **Paiement** : hors-ligne, confirmé manuellement par l'admin (D1) ;
  commission **10 %** ; reversement vendeur via `seller_payouts`.
- **Réservation** : 5 jours à la création de commande (D3), libération
  paresseuse + tâche planifiée.
- **Auth V2** : un seul endpoint `POST /api/auth/login` (identifiant =
  e-mail **ou** téléphone) qui détecte le rôle (`role: 'user'|'admin'`),
  mais **deux pages front** : `/login` (utilisateur) et `/admin/login`
  (administrateur) avec des gardes `RequireAuth` / `RequireAdmin`.
- **Cycle commande V2** : `orders.status` ∈ {`WAITING_PAYMENT`,
  `PAYMENT_FAILED`, `WAITING_SELLER_PAYMENT`, `SELLER_PAID`, `COMPLETED`,
  `CANCELLED`} ; produit `SOLD` au paiement **vendeur** (D5) ; pas
  d'historique de statuts horodaté ; la « livraison » était déclarée **hors
  périmètre** (V2 §4.2 : remise physique, étiquette « Livrée » décorative).
- **Traçabilité V2** : `admin_actions` (journal des actions admin), tables
  `payments` et `seller_payouts`.

### 1.2 Décisions V2 conservées (rappel)

D1 paiement hors-ligne admin · D2 pseudo public, coordonnées jamais exposées ·
D3 réservation 5 jours · D4 statut produit unique · D5 (modifiée en V3, §5.3) ·
D6 paiement acheteur / statut commande liés en transaction · D7 catégories
hiérarchiques · D8 champs complémentaires · D9 modification/suppression
d'article · D10 achat = compte requis + retour après connexion · D11
`CMD-%06d` · D12 recherche. Sauf mention contraire §1.4, elles restent
inchangées.

### 1.3 État des lieux technique V2 touché par V3 (références `api.md`)

Routes existantes concernées : `POST /api/auth/login` · `POST /api/orders` ·
`GET /api/orders/:id` (vues `buyer`/`seller`) · `GET /api/admin/orders[:id]` ·
`POST /api/admin/orders/:id/confirm-payment` (sémantique V2 :
`WAITING_PAYMENT → WAITING_SELLER_PAYMENT`) · `POST
/api/admin/orders/:id/pay-seller`. Page admin « Paiements vendeurs » en attente
= filtre `orders.status = 'WAITING_SELLER_PAYMENT'` +
`seller_payouts.status = 'PENDING'`.

### 1.4 Tableau des CHANGEMENTS V2 → V3

| # | Domaine | V2 | V3 | Impact / référence |
|---|---|---|---|---|
| CHG-1 | **Connexion unifiée (E1)** | Deux pages `/login` et `/admin/login` ; l'API détecte le rôle mais l'UI sépare les accès | **Une seule page** `/login` (formulaire e-mail + mot de passe) ; redirection automatique selon le rôle ; `/admin/login` supprimé | §4 — remplace CA-AUTH03-01 |
| CHG-2 | **Identifiant de connexion** | E-mail **ou** téléphone (CA-AUTH02-01) | **E-mail** + mot de passe (texte contractuel E1) ; login par téléphone retiré (à confirmer, PO-1) | §4 — remplace CA-AUTH02-01 |
| CHG-3 | **Cycle de statuts commande (E2)** | 6 statuts (WAITING_PAYMENT … CANCELLED), sans historique | 9 statuts nominaux `CREATED → PAYMENT_PENDING → PAID → PRODUCT_WAITING → PRODUCT_RECEIVED → PREPARING → IN_DELIVERY → DELIVERED → COMPLETED` + `PAYMENT_FAILED` / `CANCELLED` ; historique horodaté complet | §5.1, §5.2, Annexe A/B |
| CHG-4 | **Moment du `SOLD`** | Produit `SOLD` au paiement vendeur (D5 V2) | Produit `SOLD` dès `PAID` (confirmation du paiement acheteur) ; jamais remis en vente après paiement | §5.3 — remplace D5 |
| CHG-5 | **Paiement vendeur** | `WAITING_SELLER_PAYMENT`/`SELLER_PAID` = statuts de commande ; paiement vendeur = fin du workflow | Paiement vendeur **plus** un statut de commande ; `seller_payouts` séparé ; payable à partir de `PRODUCT_RECEIVED` (recommandé : après `DELIVERED`) | §5.4 — remplace la fin du cycle V2 |
| CHG-6 | **Historique horodaté** | Implicite via `admin_actions` (actions admin seulement) | Nouvelle table **append-only** `order_events` : chaque changement de statut = 1 ligne (from, to, actor, note, created_at) ; exposée dans le détail commande (acheteur/vendeur/admin) | §5.2, §6.1, CA-ORD06 |
| CHG-7 | **Suivi de livraison** | Hors périmètre (« Livrée » décorative) | Cycle de livraison complet + page client « Suivre mon colis » (statut, timeline, historique daté, infos suivi) | §5.5 US-ORD-04/05 |
| CHG-8 | **Routes admin transitions** | `confirm-payment`, `pay-seller` | + `mark-product-received`, `start-delivery`, `mark-delivered`, `cancel` ; `confirm-payment`/`pay-seller` conservées, sémantique adaptée ; `GET /api/orders/:id` enrichi de `events` | §6.2 |
| CHG-9 | **Notifications** | 8 événements (N1–N8) | + 5 événements liés au cycle livraison (N9–N13) ; canal in-app inchangé | §5.5 US-ORD-10 |
| CHG-10 | **Dashboard admin** | Compteur « paiements en attente » = `WAITING_SELLER_PAYMENT` | Compteur recalculé sur les statuts V3 éligibles au paiement vendeur | §5.5 US-ORD-07, §6.2 |

---

## 2. Périmètre V3

### 2.1 Dans le périmètre

- **E1 — Connexion unifiée** : suppression des deux connexions séparées,
  formulaire unique e-mail + mot de passe, détection et redirection
  automatiques par rôle, sécurité de l'authentification admin (identifiants
  via configuration système, non exposés, non modifiables via l'UI, pas de
  création publique).
- **E2 — Gestion de la livraison** : nouveau cycle de statuts de commande,
  historique horodaté (`order_events`), page client « Suivre mon colis »,
  actions admin de transition, découplage du paiement vendeur, conservation
  de la confidentialité acheteur/vendeur.

### 2.2 Hors périmètre V3 (inchangé par rapport à V2)

- Paiement **en ligne** (Mobile Money/carte/webhook) : toujours **hors-ligne,
  confirmé manuellement** (D1).
- Notifications SMS / WhatsApp / e-mail / push (in-app uniquement).
- Messagerie interne acheteur ↔ vendeur ; favoris ; avis/notation ;
  signalements/litiges ; comptes professionnels ; recommandations ;
  statistiques avancées ; création de catégories par l'admin (D7 V2).
- **Ajouts V3 explicites** : aucune nouvelle méthode d'authentification
  (pas d'OAuth, pas de 2FA, pas d'inscription admin publique) ; aucune
  annulation **utilisateur** de commande ; aucune gestion de frais de
  livraison ni d'adresse de livraison en libre-service (PO-5).

---

## 3. Conservations — ce qui reste **identique à la V2** (ne pas toucher)

| Domaine | Éléments conservés | Référence V2 |
|---|---|---|
| **Comptes** | Inscription (pseudo, nom privé, e-mail, téléphone, mot de passe ≥ 8, CGU), déconnexion, session 7 jours HTTP-only, « Mot de passe oublié » hors périmètre | CA-AUTH01, CA-AUTH02-02/03/05 |
| **Catalogue** | Recherche, filtres, tri, fiche article, badge disponibilité, champs complémentaires | US-CAT-01..03 |
| **Revendre** | Formulaire complet, suivi de statut, motifs de refus, modification/suppression (D9) | US-SELL-01..03 |
| **Achat/réservation** | Réservation 5 jours (D3), anti-double-commande, auto-achat interdit, expiration → `AVAILABLE` | US-BUY-01/02 |
| **Transactions** | Paiement hors-ligne admin (D1), commission 10 % (`commission = floor(prix × 0,10)` ; `seller_amount = prix − commission`), numérotation `CMD-%06d` (D11) | §7.3 V2, D11 |
| **Admin** | Dashboard (4 compteurs — contenu adapté, CHG-10), modération articles (approuver/refuser + motif), utilisateurs (lecture seule), catégories (activer/désactiver/renommer), historique | US-ADM-01..07 |
| **Notifications** | Canal **in-app uniquement**, page + badge ; les 8 événements N1–N8 restent | US-NOT-01, §10 V2 |
| **Sécurité** | Mots de passe hachés, autorisations côté serveur, transactions SQL + verrou de ligne, secrets hors code client | §9 V2 |
| **Produit** | Statuts produit inchangés `PENDING/AVAILABLE/RESERVED/SOLD/REJECTED` (seul le **moment** du `SOLD` change, CHG-4) | D4 |

---

## 4. E1 — Connexion unifiée

### 4.1 Règles métier (texte contractuel intégré)

1. **Une seule page de connexion** pour tous : suppression des deux connexions
   séparées « Utilisateur » et « Administrateur ».
2. **Formulaire unique : e-mail + mot de passe** (CHG-2 ; le choix du rôle
   n'est pas proposé à l'utilisateur).
3. Après connexion, le système **détecte automatiquement le rôle** du compte
   et redirige : utilisateur → son espace utilisateur ; administrateur →
   dashboard administrateur.
4. **Identifiants admin fixes et sécurisés** définis dans la configuration du
   système (`ADMIN_EMAIL` / `ADMIN_PASSWORD` via variables d'environnement) :
   non modifiables via l'UI, **hors périmètre de création publique**, jamais
   exposés.
5. **Redirection contextuelle conservée** (D10 V2) : une visite non connectée
   sur une action protégée (ex. « Acheter ») redirige vers `/login` puis
   retour à la page d'origine après connexion — quel que soit le rôle.

### 4.2 Décisions V3 (E1)

| # | Décision |
|---|---|
| **D17** | **Connexion unifiée.** Suppression de la page `/admin/login` et de tout lien de connexion séparé. Une seule route front `/login`. Le rôle est détecté par l'API sur la session et pilote la redirection (règle 3). Remplace le §2 V2 (« Deux connexions uniquement ») et CA-AUTH03-01. |
| **D18** | **Identifiant de connexion = e-mail** (texte contractuel E1). Le login par téléphone (CA-AUTH02-01 V2) n'est plus proposé dans l'UI. L'endpoint `POST /api/auth/login` reste l'**unique** endpoint d'authentification. Confirmation client requise (PO-1). |
| **D19** | **Sécurité de la détection de rôle.** Le rôle provient exclusivement de la session/base de données : aucune valeur de rôle envoyée par le client n'est interprétée par le serveur à la connexion ; aucun message d'erreur ne révèle l'existence d'un compte admin (pas de fuite de rôle). |

### 4.3 User stories et critères d'acceptation (préfixe `CA-AUTH`)

**US-AUTH-04 — Se connecter via une page unique (E1)**
En tant que **visiteur / utilisateur / administrateur**, je veux **me connecter
à partir d'une seule page avec mon e-mail et mon mot de passe**, afin d'être
redirigé automatiquement vers l'espace correspondant à mon rôle, sans double
page de connexion.

- **CA-AUTH04-01** — La page `/login` affiche un **formulaire unique** : champ
  e-mail + champ mot de passe. Aucun bouton, onglet ou lien « Connexion
  administrateur » n'est présent sur la page, dans l'en-tête ni dans le pied
  de page.
  *(Vérif : ouvrir `/login` ; inspecter le DOM et les liens du site ; compter
  les formulaires → 1 ; rechercher « admin » → absent.)*
- **CA-AUTH04-02** — `GET /admin/login` ne renvoie plus la page de connexion
  admin : réponse **404** ou redirection vers `/login`. Aucune route/composant
  `/admin/login` ne subsiste dans le code front.
  *(Vérif : ouvrir `/admin/login` non connecté ; grep du code front : 0
  occurrence d'une route « /admin/login ».)*
- **CA-AUTH04-03** — Connexion avec les identifiants admin
  (`ADMIN_EMAIL`/`ADMIN_PASSWORD`) → redirection automatique vers le dashboard
  admin (`/admin`) ; l'utilisateur voit l'interface d'administration.
  *(Vérif : scénario de recette T24.)*
- **CA-AUTH04-04** — Connexion avec un compte utilisateur (`role: 'user'`) →
  redirection vers l'espace utilisateur par défaut ; s'il existait une page
  d'origine protégée demandée avant connexion (D10), retour sur cette page.
  *(Vérif : scénario T25 — déconnecté, cliquer « Acheter », se connecter,
  vérifier l'atterrissage sur la fiche article.)*
- **CA-AUTH04-05** — Après connexion, un utilisateur non-admin qui tente
  d'accéder à un écran ou une route admin (UI **et** API) reçoit **403** ;
  aucun contenu admin n'est rendu.
  *(Vérif : connecté en user, GET `/admin` → 403 ; `GET /api/admin/orders` →
  403. Comportement V2 CA-AUTH02-04 / CA-AUTH03-02 conservé, désormais via la
  session de la page unique.)*
- **CA-AUTH04-06** — En cas d'échec de connexion (e-mail inconnu, mauvais mot
  de passe, compte admin avec mauvais mot de passe), le message est
  **toujours** « Identifiants incorrects » : il ne révèle ni l'existence du
  compte, ni le rôle (pas de fuite de rôle).
  *(Vérif : 4 tentatives (e-mail inconnu ; bon e-mail + mauvais mot de passe ;
  e-mail admin + mauvais mot de passe ; e-mail mal formé) → mêmes statut HTTP
  et message ; aucun champ `role` dans la réponse d'échec.)*
- **CA-AUTH04-07** — Le formulaire bloque la soumission si l'e-mail ou le mot
  de passe est vide ou si l'e-mail est mal formé (message explicite «
  Veuillez renseigner votre e-mail et votre mot de passe ») ; aucune requête
  réseau n'est émise (validation client) **et** le serveur rejette
  pareillement tout contournement (400).
  *(Vérif : soumettre le formulaire vide ; `POST /api/auth/login` sans body →
  400 avec message de validation générique.)*

**US-AUTH-05 — Sécuriser l'authentification administrateur (E1)**
En tant qu'**équipe technique**, je veux **que le compte admin soit défini par
la configuration système, non exposé et non modifiable via l'UI/l'API**, afin
de garantir un accès d'administration sans faille publique.

- **CA-AUTH05-01** — Le compte admin est créé au démarrage du serveur à
  partir de `ADMIN_EMAIL` et `ADMIN_PASSWORD` (variables d'environnement). Si
  l'une des deux est absente : **échec du démarrage** (fail-fast) avec erreur
  explicite (défaut retenu, à valider PO-8).
  *(Vérif : relancer le serveur sans `ADMIN_EMAIL` → le process refuse de
  démarrer ; avec les deux variables → compte admin présent en base.)*
- **CA-AUTH05-02** — Aucune route publique ou authentifiée ne permet de créer
  ou modifier un compte administrateur : `POST /api/auth/register` ne crée que
  des `role='user'` ; toute valeur de rôle fournie par le client dans un
  payload d'inscription est **ignorée** (le rôle en base reste `user`) ;
  aucune route de modification du rôle admin n'existe.
  *(Vérif : `register` avec `role:'admin'` dans le payload → le compte créé a
  `role='user'` en base ; tenter une route de modification → 404/403.)*
- **CA-AUTH05-03** — `ADMIN_EMAIL`, `ADMIN_PASSWORD` et toute valeur de
  configuration ne sont **jamais** renvoyés par l'API (aucun endpoint
  `/api/config`, aucun champ dans `GET /api/auth/me` ni dans la réponse de
  login en succès) et ne sont **pas** présents dans le bundle front.
  *(Vérif : inspecter les réponses JSON ; rechercher les valeurs en clair dans
  le bundle JS de production → absentes.)*
- **CA-AUTH05-04** — Le mot de passe de l'administrateur est stocké **haché**
  (bcrypt/argon2), jamais en clair (même exigence que CA-AUTH01-03).
  *(Vérif : requête SQL sur `users`, ligne admin : `password_hash` commence
  par `$2b$…`/`$argon2…` ; la valeur en clair n'apparaît nulle part.)*
- **CA-AUTH05-05** — L'échec d'authentification ne permet pas de distinguer
  un e-mail admin d'un e-mail utilisateur : mêmes statuts HTTP et mêmes
  messages sur les 4 tentatives de CA-AUTH04-06.
  *(Vérif : comparer les réponses (« jetons ») des 4 tentatives.)*

### 4.4 Critères V2 rendus obsolètes ou modifiés (à appliquer par l'équipe)

| Réf. V2 | Sort en V3 | Remplacé par |
|---|---|---|
| CA-AUTH03-01 (page `/admin/login` accessible) | **Obsolète** (page supprimée) | CA-AUTH04-02, D17 |
| CA-AUTH02-01 (identifiant e-mail **ou** téléphone) | **Modifié** | CA-AUTH04-01, D18, PO-1 |
| CA-AUTH02-04 / CA-AUTH03-02 (403 sur routes admin, autorisations selon rôle) | **Conservé** | CA-AUTH04-05 (ré-affirmé avec la page unique) |

---

## 5. E2 — Gestion de la livraison

### 5.1 Nouveau cycle de statuts de commande (CHG-3)

Statuts `orders.status` (enum PostgreSQL, ordre normatif) :

```
CREATED → PAYMENT_PENDING → PAID → PRODUCT_WAITING → PRODUCT_RECEIVED
  → PREPARING → IN_DELIVERY → DELIVERED → COMPLETED
(+ PAYMENT_FAILED, CANCELLED — états terminaux d'échec)
```

Correspondance pas-à-pas avec le texte contractuel du client (étapes 1→10) :

| Étape client | Libellé UI | Statut V3 | Déclencheur |
|---|---|---|---|
| 1. Commande créée | « Commande créée » | `CREATED` | Clic « Acheter » (système) |
| 2. Paiement en attente | « Paiement en attente » | `PAYMENT_PENDING` | Système (instantané, même transaction) |
| 3. Payée | « Payée » | `PAID` | Admin « Confirmer le paiement » (`confirm-payment`) |
| 4. Produit en attente | « Produit en attente » | `PRODUCT_WAITING` | Système (automatique après `PAID`) |
| 5. Produit reçu | « Produit reçu » | `PRODUCT_RECEIVED` | Admin « Produit reçu » (`mark-product-received`) |
| 6. En préparation pour livraison | « En préparation » | `PREPARING` | Système (automatique après `PRODUCT_RECEIVED`) |
| 7. En livraison | « En livraison » | `IN_DELIVERY` | Admin « Lancer la livraison » (`start-delivery`) |
| 8. Suivre mon colis | (page client, §5.5 US-ORD-05) | — | Consultation par le client à tout moment |
| 9. Livrée | « Livrée » | `DELIVERED` | Admin « Confirmer livré » (`mark-delivered`) |
| 10. Terminée | « Terminée » | `COMPLETED` | Système (automatique après `DELIVERED`) |

États terminaux conservés : `PAYMENT_FAILED` (« Expirée », D3) et
`CANCELLED` (« Annulée »). Dictionnaire complet et matrice des transitions :
**Annexe A et Annexe B**.

### 5.2 Table `order_events` (CHG-6)

Nouvelle table **append-only** (insertions seules, aucune mise à jour ni
suppression) :

```
order_events: id, order_id FK orders, from_status (nullable), to_status,
              actor ('system'|'admin'|'user'), actor_id FK users (nullable),
              note (nullable, ≤ 500 caractères), created_at (horodaté)
```

Règles :
1. **Chaque** changement de `orders.status` insère une ligne `order_events`
   **dans la même transaction SQL** que le changement (cohérent avec la
   pratique V2 §7.8 / §9-7).
2. L'événement initial : `from_status = NULL`, `to_status = 'CREATED'`.
3. `actor_id` est renseigné quand `actor = 'admin'` (admin authentifié) ou
   `actor = 'user'` (prévu par le modèle ; **aucune** transition utilisateur
   n'existe en V3 — PO-3).
4. La note est optionnelle, **sauf** pour l'annulation (obligatoire,
   CA-ORD08-01).
5. **Invariant de cohérence** : `orders.status` ≡ `to_status` du dernier
   événement de la commande (contrôle SQL, CA-ORD12-04).

### 5.3 Produit « SOLD » dès le paiement (CHG-4, remplace D5 V2)

- La confirmation de paiement par l'admin (`PAYMENT_PENDING → PAID`) passe
  **simultanément** `products.status = 'SOLD'` (même transaction).
- L'article n'est **plus jamais remis en vente** une fois payé (même si la
  livraison s'étire ; exception d'annulation après paiement → PO-2).
- L'expiration de réservation (5 jours, D3) reste inchangée : **uniquement**
  si la commande est encore `PAYMENT_PENDING` ; le produit repasse alors
  `AVAILABLE`.
- Impact sur « N ventes » du vendeur (D2) : inchangé — compté lorsque le
  produit passe `SOLD` (désormais au paiement, pas à la livraison).

### 5.4 Paiement vendeur découplé (CHG-5)

- Les statuts de commande `WAITING_SELLER_PAYMENT` / `SELLER_PAID` sont
  **supprimés** : le paiement du vendeur n'est plus un état de la commande.
- `seller_payouts` (V2) est conservée telle quelle : 1 ligne par commande
  (`status PENDING|PAID`, `paid_by`, `reference`, `paid_at`).
- **Précondition** de « Payer le vendeur » : `orders.status` ∈
  {`PRODUCT_RECEIVED`, `PREPARING`, `IN_DELIVERY`, `DELIVERED`, `COMPLETED`}
  — la plateforme détient physiquement l'article. **Recommandation métier** :
  reverser **après** `DELIVERED`. Avant `PRODUCT_RECEIVED`, l'action est
  bloquée (UI **et** API).
- `seller_payouts.status = 'PAID'` ne modifie **pas** `orders.status`.
- La commission (10 %) et `seller_amount` restent inchangés (§3).

### 5.5 User stories et critères d'acceptation (préfixe `CA-ORD`)

---

**US-ORD-01 — Passer commande et entrer dans le cycle (E2)**
En tant qu'**acheteur connecté**, je veux **commander un article `AVAILABLE`**,
afin de réserver l'article et de démarrer le suivi de ma commande.

- **CA-ORD01-01** — Le clic « Acheter » (article `AVAILABLE`, acheteur
  connecté, auto-achat interdit — comportement V2 US-BUY-01 conservé) crée,
  **en une seule transaction** : une commande `CMD-%06d` au statut `CREATED`
  puis immédiatement `PAYMENT_PENDING`, un `payments.status = 'PENDING'`, le
  produit en `RESERVED` avec `reserved_until = now + 5 jours` (D3), et les
  **2 événements** :
  `(NULL → CREATED, system)` et `(CREATED → PAYMENT_PENDING, system)`.
  *(Vérif : scénario T27 ; requête SQL : statut commande = `PAYMENT_PENDING`,
  2 events, produit `RESERVED`.)*
- **CA-ORD01-02** — L'affichage de la commande chez l'acheteur montre
  « Étape 1 : Commande créée » puis « Étape 2 : Paiement en attente » sur la
  timeline (US-ORD-05), même si elles sont quasi simultanées.
  *(Vérif : ouvrir « Mes commandes » → détail.)*
- **CA-ORD01-03** — Anti-double-commande conservé : deux clics parallèles sur
  le même article → une seule commande créée ; l'autre reçoit « Cet article
  vient d'être réservé » (verrou de ligne, V2 CA-BUY01-03). Aucun event n'est
  créé pour la commande non attribuée.
  *(Vérif : scénario T11 V2 rejoué ; COUNT des events = 2 pour la commande
  créée.)*
- **CA-ORD01-04** — Aucune confirmation du paiement sous 5 jours (D3) :
  commande `PAYMENT_PENDING → PAYMENT_FAILED` avec event
  `(PAYMENT_PENDING → PAYMENT_FAILED, system)`, `payments → FAILED`, produit
  → `AVAILABLE`. La libération ne s'applique que si la commande est encore
  `PAYMENT_PENDING` (anti-course : admin prioritaire, V2 §7.4).
  *(Vérif : scénario T28 ; rejouer l'expiration après confirmation admin →
  aucun effet.)*

---

**US-ORD-02 — Confirmer le paiement (PAID)**
En tant qu'**admin**, je veux **confirmer le paiement reçu de l'acheteur**,
afin de débloquer le cycle de livraison et de considérer l'article vendu.

- **CA-ORD02-01** — `POST /api/admin/orders/:id/confirm-payment` (route
  existante, sémantique adaptée) : précondition **`orders.status =
  PAYMENT_PENDING`** ; en une transaction : `orders → PAID`,
  `payments → PAID` (méthode obligatoire, référence optionnelle — D6 V2
  conservé), `products → SOLD`, event `(PAYMENT_PENDING → PAID, admin)`,
  notification N4 acheteur (V2 conservé).
  *(Vérif : scénario T29 ; requête SQL post-action : statut `PAID`, payment
  `PAID`, produit `SOLD`, 1 event ; la fiche article affiche « Vendu ».)*
- **CA-ORD02-02** — Une fois `PAID`, l'article n'est **plus commandable ni
  remis en vente** : badge « Vendu », bouton « Acheter » désactivé, `POST
  /api/orders` sur ce produit → 409 ; même après expiration (5 jours), la
  commande payée reste `PAID`.
  *(Vérif : tenter un achat sur le produit payé depuis un autre compte ;
  attendre 5 jours et re-vérifier.)*
- **CA-ORD02-03** — Double confirmation impossible : deux admins confirment
  en parallèle → un seul succès, l'autre reçoit **409** ; un seul event créé
  (CA-ADM03-05 V2 conservé).
  *(Vérif : scénario de concurrence ; `COUNT(events)` = 1.)*

---

**US-ORD-03 — Gérer la réception du produit (PRODUCT_WAITING → RECEIVED → PREPARING)**
En tant qu'**admin**, je veux **enregistrer la réception de l'article auprès
de la plateforme**, afin que la commande passe automatiquement en préparation.

- **CA-ORD03-01** — Après `PAID`, le système passe la commande en
  **`PRODUCT_WAITING`** automatiquement : event `(PAID → PRODUCT_WAITING,
  system)`. L'admin n'a aucune action pour y entrer ; seul
  `mark-product-received` permet d'en sortir.
  *(Vérif : après T29, statut `PRODUCT_WAITING`, libellé « Produit en
  attente ».)*
- **CA-ORD03-02** — `POST /api/admin/orders/:id/mark-product-received` :
  précondition **`orders.status = PRODUCT_WAITING`** ; en une transaction :
  `orders → PRODUCT_RECEIVED`, event `(PRODUCT_WAITING → PRODUCT_RECEIVED,
  admin)`, note optionnelle (≤ 500 car.), notification N10 à l'acheteur
  (« Votre colis est en préparation »). Toute autre valeur de statut → **409**
  et aucun event créé.
  *(Vérif : scénario T30 ; tentative sur une commande `PAID` → 409.)*
- **CA-ORD03-03** — Dès `PRODUCT_RECEIVED`, le passage en **`PREPARING`** est
  automatique (texte client, étape 6) : event `(PRODUCT_RECEIVED → PREPARING,
  system)` dans la même transaction. L'admin voit la commande « En
  préparation » et le bouton « Lancer la livraison » s'active.
  *(Vérif : après mark-product-received, statut final = `PREPARING` + 2 events
  horodatés.)*

---

**US-ORD-04 — Livrer et clôturer (IN_DELIVERY → DELIVERED → COMPLETED)**
En tant qu'**admin**, je veux **lancer la livraison puis confirmer la
livraison**, afin que la commande se termine proprement.

- **CA-ORD04-01** — `POST /api/admin/orders/:id/start-delivery` :
  précondition **`orders.status = PREPARING`** ; body optionnel `{ carrier?,
  trackingNumber? }` ; en une transaction : `orders → IN_DELIVERY`, event
  `(PREPARING → IN_DELIVERY, admin)`, enregistrement de `delivery_carrier` et
  `tracking_number` si fournis, notification N11 acheteur (« Votre colis est
  en livraison »).
  *(Vérif : scénario T31 ; requête SQL : champs transporteur/n° renseignés si
  fournis dans le body.)*
- **CA-ORD04-02** — `POST /api/admin/orders/:id/mark-delivered` :
  précondition **`orders.status = IN_DELIVERY`** ; en une transaction :
  `orders → DELIVERED` avec event `(IN_DELIVERY → DELIVERED, admin)`, puis —
  automatiquement — `orders → COMPLETED` avec event `(DELIVERED → COMPLETED,
  system)` ; notifications N12 (acheteur) et N13 (vendeur).
  *(Vérif : scénario T32 ; commande « Terminée » avec timeline complète des 9
  étapes.)*
- **CA-ORD04-03** — Les boutons « Lancer la livraison » et « Confirmer livré »
  sont **inactifs** hors de leur précondition (CA-ORD04-01 / -02) et l'API
  répond **409** à toute tentative hors précondition.
  *(Vérif : pour chaque statut du cycle, appeler les routes avec un statut
  différent → 409.)*
- **CA-ORD04-04** — `DELIVERED` et `COMPLETED` ne sont atteints qu'à la fin
  du cycle nominal : une commande n'est « Terminée » que si les 9 étapes ont
  été franchies (pas de saut — CA-ORD12-01).
  *(Vérif : `COUNT(events)` = 9 sur une commande terminée.)*

---

**US-ORD-05 — Suivre mon colis (page client)**
En tant qu'**acheteur**, je veux **consulter une page « Suivre mon colis »**,
afin de connaître l'état en temps réel de ma commande, son historique daté et
les informations utiles à la livraison.

- **CA-ORD05-01** — L'acheteur accède à la page depuis « Mes commandes »
  (lien « Suivre mon colis » présent pour **toutes** ses commandes, quel que
  soit le statut). Route front dédiée, alimentée par `GET /api/orders/:id`
  (vue `buyer` enrichie de `events`).
  *(Vérif : ouvrir la page pour chaque commande de l'acheteur → CMD et
  article corrects.)*
- **CA-ORD05-02** — La page affiche **exactement** (minimum contractuel) :
  1. le **statut actuel** (libellé humain Annexe A + badge) ;
  2. une **timeline/barre de progression** des 9 étapes nominales : étapes
     passées marquées (cochées), étape courante mise en évidence, étapes
     futures grisées ;
  3. l'**historique des étapes** : pour chaque étape franchie, le libellé, la
     **date et l'heure** (`JJ/MM/AAAA HH:MM`, heure locale), l'origine
     (« Plateforme » = system / « Administration » = admin) et la note
     éventuelle (visibilité des notes → PO-4) ;
  4. les **informations utiles au suivi** dès qu'elles existent (transporteur,
     n° de suivi) ;
  5. le **récapitulatif** : n° `CMD-XXXXXX`, article (photo principale + nom +
     prix), date de commande.
  *(Vérif : recette T33 — cocher chacun des 5 éléments sur une commande en
  `IN_DELIVERY` avec transporteur renseigné.)*
- **CA-ORD05-03** — En état terminal d'échec (`PAYMENT_FAILED`, `CANCELLED`),
  la timeline s'interrompt avec une mention explicite (« Paiement non reçu,
  commande expirée » / « Commande annulée par la plateforme ») ; aucune étape
  de livraison n'est représentée comme franchie.
  *(Vérif : recette sur une commande expirée et une commande annulée.)*
- **CA-ORD05-04** — Le vendeur dispose d'une vue équivalente (« Suivre ma
  vente ») : même timeline et même historique, **sans aucune donnée de
  l'acheteur** (CA-ORD09-02).
  *(Vérif : vue `seller` de `GET /api/orders/:id`.)*
- **CA-ORD05-05** — Le statut affiché est issu de `orders.status` (source de
  vérité), toujours cohérent avec le dernier événement (CA-ORD12-04) ; tout
  rechargement de la page reflète l'état courant.
  *(Vérif : recharger la page après chaque transition du cycle.)*
- **CA-ORD05-06** — Accès strict : seuls l'acheteur de la commande, le
  vendeur et l'admin y accèdent ; tout autre compte → **404** (pas de fuite
  d'existence de la commande).
  *(Vérif : autre compte → `GET /api/orders/:id` → 404.)*

---

**US-ORD-06 — Consulter l'historique horodaté (order_events)**
En tant qu'**acheteur, vendeur ou admin**, je veux **consulter l'historique
complet des changements de statut de la commande**, afin de retracer chaque
étape avec sa date et son heure.

- **CA-ORD06-01** — Le détail de commande (`GET /api/orders/:id` pour
  acheteur/vendeur ; `GET /api/admin/orders/:id` pour l'admin) renvoie le
  statut actuel **et** la liste ordonnée `events` : chacun avec `from_status`,
  `to_status`, `actor`, `actor_id` (le cas échéant), `note`, `created_at` —
  tri chronologique croissant.
  *(Vérif : inspecter la réponse JSON après chaque étape du cycle.)*
- **CA-ORD06-02** — L'ordre de `events` correspond strictement à l'ordre des
  transitions effectuées ; deux événements simultanés (création ; transition
  auto + transition admin) sont ordonnés par `created_at` puis `id`.
  *(Vérif : comparer horodatages et id sur une commande complète.)*
- **CA-ORD06-03** — Aucun événement n'est modifiable ni supprimable via
  l'API (table append-only) : PUT/PATCH/DELETE sur `order_events` →
  404/405.
  *(Vérif : tester les verbes d'écriture interdits.)*

---

**US-ORD-07 — Piloter le cycle depuis le dashboard admin**
En tant qu'**admin**, je veux **disposer de boutons/actions contextuels**,
afin de faire avancer la commande étape par étape sans erreur.

- **CA-ORD07-01** — Le dashboard « Commandes » affiche pour chaque commande :
  n° `CMD-…`, article, acheteur (Utilisateur #id), vendeur (Utilisateur #id),
  montant, **statut courant V3** (libellé Annexe A), état du paiement acheteur
  (Payé / Non payé), état du **paiement vendeur** (Payé / Non payé — séparé du
  statut, CHG-5), et les **actions autorisées** selon la précondition
  (CA-ORD02-01, CA-ORD03-02, CA-ORD04-01/02, CA-ORD07-05).
  *(Vérif : scénario T34 parcourant les 9 statuts.)*
- **CA-ORD07-02** — Chaque bouton d'action est **inactif** quand sa
  précondition n'est pas remplie (libellé indiquant la condition manquante) ;
  en cas de tentative API, **409** (CA-ORD12-01).
  *(Vérif : parcourir le cycle et vérifier l'état actif/inactif des boutons.)*
- **CA-ORD07-03** — Le détail admin (`GET /api/admin/orders/:id`) expose le
  statut courant, les `events` (CA-ORD06-01), le paiement acheteur, le
  `seller_payouts` et les notes des transitions.
  *(Vérif : consulter le détail à chaque étape.)*
- **CA-ORD07-04** — Chaque action admin de transition est tracée dans
  `order_events` **et** journalisée dans `admin_actions` (CA-ADM07-02 V2
  adapté : la source des transitions commande devient `order_events`) — dans
  la même transaction.
  *(Vérif : après chaque transition, 1 event + 1 `admin_action`.)*
- **CA-ORD07-05** — L'action « Payer le vendeur » (bouton du dashboard et
  `POST /api/admin/orders/:id/pay-seller`) n'est **disponible que si**
  `orders.status` ∈ {`PRODUCT_RECEIVED`, `PREPARING`, `IN_DELIVERY`,
  `DELIVERED`, `COMPLETED`} ; sinon bouton inactif et API → **409**. Une fois
  faite : `seller_payouts.status = 'PAID'` (montant = `seller_amount` = prix −
  commission 10 %), `orders.status` **inchangé**, double paiement impossible
  (CA-ADM04-04 V2 conservé), notification N6 vendeur (V2 conservé).
  *(Vérif : scénario T36 — tenter `pay-seller` à chaque statut : actif à
  partir de `PRODUCT_RECEIVED`, puis `COUNT(seller_payouts PAID)` = 1.)*

---

**US-ORD-08 — Annuler une commande (état terminal CANCELLED)**
En tant qu'**admin**, je veux **pouvoir annuler une commande** dans les cas
prévus, afin de clôturer proprement une commande non payée.

- **CA-ORD08-01** — `POST /api/admin/orders/:id/cancel` : précondition
  **`orders.status = PAYMENT_PENDING`** uniquement (paiement non reçu ou
  acheteur renonçant) ; **note obligatoire** ; en une transaction :
  `orders → CANCELLED`, event `(PAYMENT_PENDING → CANCELLED, admin, note)`, le
  produit repasse `AVAILABLE` s'il est `RESERVED` (dé-réservation immédiate,
  `reserved_until` purgé).
  *(Vérif : scénario T35 ; commande annulée exclue des compteurs dashboard.)*
- **CA-ORD08-02** — Tentative d'annulation hors précondition (statut ≥
  `PAID`, y compris `PRODUCT_WAITING`) → **409** avec message citant la
  précondition. L'annulation **après paiement** (remboursement) est **hors
  périmètre** tant que PO-2 n'est pas validé.
  *(Vérif : tenter `cancel` à chaque statut du cycle ≥ `PAID` → 409.)*
- **CA-ORD08-03** — L'utilisateur (acheteur ou vendeur) n'a **aucune** action
  d'annulation : bouton absent des écrans utilisateur, route API utilisateur
  absente (404).
  *(Vérif : grep front « annuler » → absent des écrans utilisateur ; route
  utilisateur de cancel → 404.)*

---

**US-ORD-09 — Préserver la confidentialité vendeur/acheteur (E2)**
En tant qu'**acheteur ou vendeur**, je veux **ne jamais voir les coordonnées
personnelles de l'autre partie** pendant tout le cycle de livraison, afin de
conserver la garantie d'intermédiation (D2 V2).

- **CA-ORD09-01** — La vue `buyer` de `GET /api/orders/:id` (donc la page
  « Suivre mon colis » et les events) ne contient **aucun** champ privé du
  vendeur : ni `name`, `email`, `phone`, ni adresse/coordonnées. Présents
  uniquement : `display_name` (pseudo), éléments de réputation D2 (année,
  N ventes), article, prix, statuts, events relatifs à la commande, infos de
  suivi.
  *(Vérif : inspecter le JSON réponse ; grep des clés « name/email/phone »
  dans l'objet renvoyé à l'acheteur → absents.)*
- **CA-ORD09-02** — Symétriquement, la vue `seller` ne contient **aucun**
  champ privé de l'acheteur (nom, e-mail, téléphone, adresse de livraison,
  coordonnées) ; l'acheteur n'apparaît que comme « Utilisateur #id » côté
  admin, jamais par ses coordonnées côté vendeur.
  *(Vérif : inspecter le JSON réponse côté vendeur.)*
- **CA-ORD09-03** — La plateforme reste l'intermédiaire de la transaction
  **et de la livraison** : aucune donnée de contact (adresse, téléphone)
  n'est transmise de la plateforme au vendeur ou à l'acheteur dans l'UI, les
  notifications, ou les events (règle RG-ORD-6 : interdiction de coordonnées
  dans les notes admin).
  *(Vérif : recette de bout en bout V3 — aucun écran, notification ou event ne
  fait apparaître de coordonnées ; revue des libellés.)*

---

**US-ORD-10 — Notifier aux étapes clés du cycle**
En tant qu'**utilisateur**, je veux **être notifié in-app des changements de
statut de ma commande**, afin de suivre sans consulter la page.

- **CA-ORD10-01** — Les **5 nouveaux événements** de notification (canal
  **in-app uniquement**, inchangé V2) sont créés aux transitions suivantes :

  | # | Déclencheur (transition) | Destinataire | Titre (exemple) |
  |---|---|---|---|
  | N9 | `PAYMENT_PENDING → PAID` | Vendeur | « Vente confirmée pour CMD-… — apportez / envoyez votre article » |
  | N10 | `PRODUCT_WAITING → PRODUCT_RECEIVED` (+ auto `PREPARING`) | Acheteur | « Votre colis est en préparation » |
  | N11 | `PREPARING → IN_DELIVERY` | Acheteur | « Votre colis est en livraison » |
  | N12 | `IN_DELIVERY → DELIVERED` (+ auto `COMPLETED`) | Acheteur | « Votre commande CMD-… est livrée » |
  | N13 | `DELIVERED → COMPLETED` | Vendeur | « Votre vente CMD-… est terminée » |

  Les notifications N1–N8 V2 sont conservées (dont N4 acheteur sur `PAID`).
  *(Vérif : scénario bout en bout ; chaque transition produit la notification
  attendue chez le bon destinataire.)*
- **CA-ORD10-02** — Aucune notification ne contient de coordonnées de l'autre
  partie ; les libellés ne divulguent que des données publiques (pseudo,
  article, prix, transporteur / n° de suivi).
  *(Vérif : ouvrir l'ensemble des notifications du cycle.)*

---

**US-ORD-11 — Migrer les données V2 vers le nouveau cycle**
En tant qu'**équipe technique**, je veux **migrer les commandes V2 existantes
vers le cycle V3 avec un historique reconstitué**, afin de ne perdre aucune
trace au passage.

- **CA-ORD11-01** — Après migration, **toute** commande existante possède une
  suite d'events cohérente avec son nouveau statut, conforme au mapping de
  l'**Annexe C** ; l'invariant CA-ORD12-04 est vérifié sur 100 % des commandes
  (requête SQL de contrôle).
  *(Vérif : requête de contrôle après migration → 0 écart.)*
- **CA-ORD11-02** — Les commandes finalisées V2 (`SELLER_PAID` / `COMPLETED`)
  sont migrées en `COMPLETED` avec events reflétant les étapes réellement
  franchies (jusqu'à `PAID`), puis un event terminal
  `(PAID → COMPLETED, system)` avec `note = 'Migré depuis V2 : commande
  finalisée avant le suivi de livraison'` — **dérogation explicite** à la
  matrice (Annexe B), tracée par la note ; les produits liés passent `SOLD`.
  *(Vérif : échantillonnage des commandes finalisées migrées.)*

---

**US-ORD-12 — Garantir les transitions autorisées (anti-saut)**
En tant qu'**équipe technique**, je veux **un moteur de transitions qui refuse
toute transition hors matrice**, afin qu'aucune commande ne saute d'étape, ne
revienne en arrière ou ne se répète.

- **CA-ORD12-01** — Seules les transitions de la **matrice Annexe B** sont
  acceptées par l'API : toute autre transition (saut d'étape, retour en
  arrière, transition depuis/un état terminal non prévu) → **409 CONFLICT**,
  aucun event créé, aucun changement de statut.
  *(Vérif : tests API sur chaque transition interdite de la matrice, ex.
  `PAID → PRODUCT_RECEIVED` (saut), `IN_DELIVERY → PAYMENT_PENDING` (retour),
  `COMPLETED → …` (terminal).)*
- **CA-ORD12-02** — Aucun retour en arrière : après `PAID`, aucune transition
  ne ramène à `PAYMENT_PENDING`/`CREATED` ; `PAYMENT_FAILED` n'est jamais
  applicable après `PAID`.
  *(Vérif : même jeu de tests que CA-ORD12-01.)*
- **CA-ORD12-03** — Concurrence : deux transitions simultanées sur une même
  commande → une seule réussit ; l'autre reçoit **409** et son event n'est pas
  créé (verrou de ligne en transaction).
  *(Vérif : scénario de concurrence automatisé.)*
- **CA-ORD12-04** — **Invariant de contrôle** : `orders.status` ≡ `to_status`
  du dernier event de `order_events` pour 100 % des commandes.
  *(Vérif : requête SQL `LEFT JOIN` events/statut exécutée en recette et
  éventuellement en CI → 0 anomalie.)*

---

## 6. Évolutions techniques d'accompagnement (pour architecte / backend / frontend)

### 6.1 Modèle de données — delta V3 (vs V2 §8)

| Table / colonne | Changement |
|---|---|
| `orders.status` | **Enum remplacée** : `CREATED, PAYMENT_PENDING, PAID, PRODUCT_WAITING, PRODUCT_RECEIVED, PREPARING, IN_DELIVERY, DELIVERED, COMPLETED, PAYMENT_FAILED, CANCELLED` (CHG-3). Les valeurs `WAITING_SELLER_PAYMENT` / `SELLER_PAID` disparaissent. |
| `orders` | **+ `delivery_carrier`** (nullable, ≤ 100 car.), **+ `tracking_number`** (nullable, ≤ 100 car.) — renseignés au `start-delivery` (CA-ORD04-01). |
| **`order_events`** (nouvelle) | `id, order_id FK orders, from_status (nullable), to_status, actor ('system'\|'admin'\|'user'), actor_id FK users (nullable), note (nullable, ≤ 500 car.), created_at` — **append-only** (aucune UPDATE/DELETE), index `(order_id, created_at)`. |
| `products.status` | **Inchangé** (D4 V2) ; seule la **logique** du passage à `SOLD` change (déclenché par `PAID`, §5.3). |
| `seller_payouts` / `payments` | **Inchangés** ; `seller_payouts.status` reste `PENDING`/`PAID`, **découplé** du statut de commande (CHG-5). |
| `admin_actions` | Conservé : journal des actions admin **hors** transitions de commande (les transitions sont tracées par `order_events`), cf. CA-ORD07-04. |

### 6.2 API — delta V3 (noms alignés sur `api.md`)

| Route | Statut V3 | Comportement |
|---|---|---|
| `POST /api/auth/login` | **Conservée** | Endpoint unique (D18) ; identifiant = e-mail ; retourne `role` ; erreurs génériques (CA-AUTH04-06/07). |
| `/admin/login` (front) | **Supprimée** | Route front unique `/login` (CA-AUTH04-02). |
| `GET /api/orders/:id` | **Enrichie** | Vues `buyer`/`seller` + **`events`** (historique, CA-ORD06-01/05) ; confidentialité CA-ORD09-01/02. |
| `POST /api/admin/orders/:id/confirm-payment` | **Adaptée** (existante) | `PAYMENT_PENDING → PAID` + `payments → PAID` + produit `SOLD` + event (CA-ORD02-01) ; précondition changée (la cible n'est plus `WAITING_SELLER_PAYMENT`). |
| `POST /api/admin/orders/:id/mark-product-received` | **Nouvelle** | `PRODUCT_WAITING → PRODUCT_RECEIVED` (+ auto `PREPARING`) + events (CA-ORD03-02/03). |
| `POST /api/admin/orders/:id/start-delivery` | **Nouvelle** | `PREPARING → IN_DELIVERY`, body `{ carrier?, trackingNumber? }` + event (CA-ORD04-01). |
| `POST /api/admin/orders/:id/mark-delivered` | **Nouvelle** | `IN_DELIVERY → DELIVERED` (+ auto `COMPLETED`) + events (CA-ORD04-02). |
| `POST /api/admin/orders/:id/cancel` | **Nouvelle** | `PAYMENT_PENDING → CANCELLED`, note obligatoire (CA-ORD08-01). |
| `POST /api/admin/orders/:id/pay-seller` | **Adaptée** (existante) | Précondition : statut ∈ {`PRODUCT_RECEIVED`, `PREPARING`, `IN_DELIVERY`, `DELIVERED`, `COMPLETED`} ; ne modifie **pas** `orders.status` (CA-ORD07-05, §5.4). |
| `GET /api/admin/orders?status=` | **Adaptée** | Filtre sur la nouvelle enum ; page « Paiements vendeurs » = filtre statut éligible + `seller_payouts.status='PENDING'`. |
| Dashboard — compteur « paiements en attente » | **Adaptée** | `COUNT` des commandes éligibles au paiement vendeur (CHG-10). |

### 6.3 Sécurité — ajouts V3 (complètent §9 V2)

1. Rôle administrateur non devinable : erreurs génériques (CA-AUTH04-06),
   identifiants en configuration système (CA-AUTH05-01/03), jamais exposés.
2. `order_events` : append-only, aucun verbe d'écriture exposé
   (CA-ORD06-03) ; autorisation serveur systématique — acheteur/vendeur/admin
   uniquement (CA-ORD05-06).
3. Transitions vérifiées **côté serveur** avec verrou de ligne : pas de saut,
   pas de course, pas d'annulation hors précondition (CA-ORD12-01/02/03).
4. Confidentialité garantie au niveau des réponses JSON (CA-ORD09-01/02) et
   des notes admin (RG-ORD-6).

---

## 7. Règles de gestion nouvelles (complètent §7 V2)

- **RG-ORD-1** — Chaque changement de `orders.status` crée un event dans
  `order_events`, dans la même transaction (append-only).
- **RG-ORD-2** — Seules les transitions de l'**Annexe B** sont autorisées
  (anti-saut, anti-retour, anti-répétition).
- **RG-ORD-3** — Le produit passe `SOLD` à la transition `PAYMENT_PENDING →
  PAID` et n'est plus jamais remis en vente (sauf PO-2).
- **RG-ORD-4** — `PAYMENT_PENDING → PAYMENT_FAILED` (expiration (5 jours), D3)
  uniquement ; anti-course admin (V2 §7.4).
- **RG-ORD-5** — `PAYMENT_PENDING → CANCELLED` : note obligatoire ; produit →
  `AVAILABLE` si `RESERVED`.
- **RG-ORD-6 (CONF)** — Aucune donnée personnelle (nom, e-mail, téléphone,
  adresse, coordonnées bancaires/Mobile Money) dans les notes admin, les
  events, les notifications ou le contenu de la page « Suivre mon colis ».
- **RG-ORD-7** — Paiement vendeur découplé : précondition = produit
  physiquement détenu (statut ≥ `PRODUCT_RECEIVED`) ; recommandation métier :
  après `DELIVERED`.

---

## 8. Recette V3 — tests d'acceptation (complètent la recette V2, §11 V2)

Environnement : identique à la V2 (données fraîches, admin seed via env,
comptes U1/U2). Les scénarios V2 restent valables sauf ceux référencés §4.4.

| # | Scénario de recette | Étapes | Résultat attendu | Critères couverts |
|---|---|---|---|---|
| T23 | Connexion unifiée | Ouvrir `/login` ; chercher un accès admin séparé ; tenter `/admin/login` | Un seul formulaire ; aucun lien admin ; `/admin/login` → 404/redirection | CA-AUTH04-01/02 |
| T24 | Redirection admin | Se connecter sur `/login` avec `ADMIN_EMAIL`/`ADMIN_PASSWORD` | Arrivée automatique sur le dashboard admin | CA-AUTH04-03 |
| T25 | Redirection user + D10 | Déconnecté, cliquer « Acheter », se connecter en U1 | Retour sur la fiche article ; espace utilisateur après connexion directe | CA-AUTH04-04, D10 |
| T26 | Pas de fuite de rôle | 4 tentatives d'échec (e-mail inconnu, mauvais mdp user, mauvais mdp admin, e-mail mal formé) | Mêmes statut HTTP + message « Identifiants incorrects » ; pas de `role` dans la réponse d'échec ; 403 sur `/admin` en user | CA-AUTH04-05/06/07, CA-AUTH05-05 |
| T27 | Création commande V3 | U1 achète un article `AVAILABLE` | Commande `CREATED`→`PAYMENT_PENDING` (2 events) ; produit `RESERVED` 5 jours | CA-ORD01-01/02/03 |
| T28 | Expiration | Attendre 16 min sans paiement | `PAYMENT_FAILED` + event ; produit `AVAILABLE` | CA-ORD01-04 |
| T29 | Confirm-payment | Admin confirme le paiement (méthode + réf.) | `PAID`, payments `PAID`, produit `SOLD`, event, N4 ; puis auto `PRODUCT_WAITING` | CA-ORD02-01/02/03, CA-ORD03-01 |
| T30 | Produit reçu | Admin `mark-product-received` ; re-tester sur `PAID` | `PRODUCT_RECEIVED`→`PREPARING` (2 events) ; N10 ; tentative sur `PAID` → 409 | CA-ORD03-02/03 |
| T31 | Lancement livraison | Admin `start-delivery` avec transporteur + n° suivi | `IN_DELIVERY` ; champs renseignés ; N11 | CA-ORD04-01 |
| T32 | Livré + terminée | Admin `mark-delivered` | `DELIVERED` puis `COMPLETED` (2 events) ; N12, N13 ; timeline complète 9 étapes | CA-ORD04-02/04 |
| T33 | Suivre mon colis | Ouvrir la page dès `PAYMENT_PENDING` puis à chaque étape | Statut, timeline, historique daté, infos suivi, récapitulatif ; aucune coordonnée | CA-ORD05-01..06 |
| T34 | Dashboard admin | Parcourir les 9 statuts | Boutons contextuels actifs/inactifs ; compteurs à jour | CA-ORD07-01..04 |
| T35 | Annulation | Admin `cancel` sur une commande non payée (note) ; tentative après `PAID` | `CANCELLED` + produit `AVAILABLE` ; après `PAID` → 409 | CA-ORD08-01/02/03 |
| T36 | Paiement vendeur découplé | `pay-seller` avant `PRODUCT_RECEIVED` puis après `DELIVERED` | Avant → 409 / bouton inactif ; après → `seller_payouts = PAID`, `orders.status` **inchangé** (`COMPLETED`), montant = prix − 10 % | CA-ORD07-05, RG-ORD-7 |
| T37 | Confidentialité API | Inspecter les JSON vues buyer/seller à chaque étape | Aucun champ nom/email/phone/adresse de l'autre partie ; « Utilisateur #id » côté admin | CA-ORD09-01/02/03 |
| T38 | Anti-saut | Tester les transitions interdites de l'Annexe B via l'API | 409, aucun event créé | CA-ORD12-01/02/03 |
| T39 | Migration | Appliquer la migration sur un jeu de données V2 ; requête de contrôle | 100 % des commandes avec events cohérents ; invariant OK | CA-ORD11-01/02 |
| T40 | Notifications cycle | Rejouer un cycle complet (création → terminée) | N3, N9, N4, N10, N11, N12, N13 chez les bons destinataires ; in-app uniquement | CA-ORD10-01/02 |

---

## 9. Points ouverts V3 (à trancher avec le chef de projet / le client)

1. **Login par téléphone** : la V2 acceptait e-mail **ou** téléphone
   (CA-AUTH02-01) ; E1 impose « e-mail + mot de passe ». Le login par
   téléphone est-il abandonné ? (défaut V3 : oui, retiré — CHG-2).
2. **Annulation après paiement** : que faire si une commande payée (`PAID` et
   au-delà) doit être annulée (remboursement, livraison impossible) ? V3
   exclut l'annulation après `PAID`. Faut-il un processus de remboursement en
   V3 ? Sinon, quel process manuel l'admin suit-il ?
3. **Annulation utilisateur** : l'acheteur (ou le vendeur) doit-il pouvoir
   annuler lui-même une commande non payée ? V3 : non (acteur `user` prévu
   dans `order_events`, aucune transition utilisateur implémentée).
4. **Notes des events** : visibles par l'acheteur/vendeur sur la page
   « Suivre mon colis » ? (défaut V3 : oui, hors données personnelles —
   RG-ORD-6).
5. **Parcours physique de livraison** : comment l'article transite-t-il
   réellement (point de dépôt, transporteur, frais éventuels) ? V3 ne modélise
   que les **statuts** et les champs transporteur / n° de suivi — pas de frais,
   pas de calcul de prix de livraison.
6. **Transporteur / n° de suivi** : confirmés comme champs optionnels saisis
   par l'admin au `start-delivery` (CA-ORD04-01) ?
7. **Moment du reversement vendeur** : confirmer la précondition minimale
   `PRODUCT_RECEIVED` et la recommandation « après `DELIVERED` » (RG-ORD-7).
8. **Fail-fast au démarrage** : si `ADMIN_EMAIL` / `ADMIN_PASSWORD` absents,
   bloquer le démarrage du serveur (défaut V3) — acceptable ?
9. **Points ouverts V2 en attente** (pseudo vs nom réel, sous-catégories seed,
   durée de session, etc.) : **hors périmètre V3** — à trancher par ailleurs,
   sans impact sur E1/E2.

---

## Annexe A — Dictionnaire des statuts de commande (V3)

| Statut | Libellé UI | Signification | Entrée (via) | Sortie autorisée (Annexe B) |
|---|---|---|---|---|
| `CREATED` | Commande créée | Commande créée par le clic « Acheter » ; produit `RESERVED` (5 jours) | Création (1er event, `from = NULL`) | → `PAYMENT_PENDING` (system, auto) |
| `PAYMENT_PENDING` | Paiement en attente | Attente du paiement hors-ligne de l'acheteur (fenêtre 5 jours) | ← `CREATED` (system, auto) | → `PAID` (admin) · `PAYMENT_FAILED` (system) · `CANCELLED` (admin) |
| `PAID` | Payée | Paiement confirmé par l'admin ; produit `SOLD` ; article jamais remis en vente | ← `PAYMENT_PENDING` (admin) | → `PRODUCT_WAITING` (system, auto) |
| `PRODUCT_WAITING` | Produit en attente | La plateforme attend la réception/récupération de l'article | ← `PAID` (system, auto) | → `PRODUCT_RECEIVED` (admin) |
| `PRODUCT_RECEIVED` | Produit reçu | L'article est physiquement à la plateforme | ← `PRODUCT_WAITING` (admin) | → `PREPARING` (system, auto) |
| `PREPARING` | En préparation | Préparation pour la livraison | ← `PRODUCT_RECEIVED` (system, auto) | → `IN_DELIVERY` (admin) |
| `IN_DELIVERY` | En livraison | Colis expédié ; infos de suivi visibles par le client | ← `PREPARING` (admin) | → `DELIVERED` (admin) |
| `DELIVERED` | Livrée | Livraison confirmée par l'admin | ← `IN_DELIVERY` (admin) | → `COMPLETED` (system, auto) |
| `COMPLETED` | Terminée | État terminal nominal : livraison faite, commande close | ← `DELIVERED` (system, auto) | — (terminal) |
| `PAYMENT_FAILED` | Expirée | Échec : paiement non reçu sous la durée de réservation (D3) ; produit → `AVAILABLE` | ← `PAYMENT_PENDING` (system) | — (terminal) |
| `CANCELLED` | Annulée | Annulée par l'admin (note obligatoire) ; produit → `AVAILABLE` | ← `PAYMENT_PENDING` (admin uniquement) | — (terminal) |

## Annexe B — Matrice des transitions autorisées

Lignes = statut **actuel**, colonnes = statut **cible**. `✓` = transition
autorisée (entre parenthèses : déclencheur). Toute combinaison non `✓` = **409
CONFLICT** (aucun event créé, CA-ORD12-01).

| actuel \\ cible | CREATED | PAYMENT_PENDING | PAID | PRODUCT_WAITING | PRODUCT_RECEIVED | PREPARING | IN_DELIVERY | DELIVERED | COMPLETED | PAYMENT_FAILED | CANCELLED |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **—** (création) | ✓ (system, 1er event) | | | | | | | | | | |
| **CREATED** | | ✓ (system, auto) | | | | | | | | | |
| **PAYMENT_PENDING** | | | ✓ (admin, confirm-payment) | | | | | | | ✓ (system, expiration (5 jours)) | ✓ (admin, cancel, note oblig.) |
| **PAID** | | | | ✓ (system, auto) | | | | | | | |
| **PRODUCT_WAITING** | | | | | ✓ (admin, mark-product-received) | | | | | | |
| **PRODUCT_RECEIVED** | | | | | | ✓ (system, auto) | | | | | |
| **PREPARING** | | | | | | | ✓ (admin, start-delivery) | | | | |
| **IN_DELIVERY** | | | | | | | | ✓ (admin, mark-delivered) | | | |
| **DELIVERED** | | | | | | | | | ✓ (system, auto) | | |
| **COMPLETED** | | | | | | | | | | | |
| **PAYMENT_FAILED** | | | | | | | | | | | |
| **CANCELLED** | | | | | | | | | | | |

Notes complémentaires :
- **Statuts terminaux** (`COMPLETED`, `PAYMENT_FAILED`, `CANCELLED`) : aucune
  transition sortante.
- **Aucun retour en arrière** : le flux est strictement monotone.
- **Transitions automatiques** : `CREATED→PAYMENT_PENDING`,
  `PAID→PRODUCT_WAITING`, `PRODUCT_RECEIVED→PREPARING`, `DELIVERED→COMPLETED`
  (actor `system`) — l'admin ne les déclenche pas explicitement.
- **Actions admin** (actor `admin`) : `confirm-payment`,
  `mark-product-received`, `start-delivery`, `mark-delivered`, `cancel`.
- **Paiement vendeur** (hors matrice — n'est pas une transition de commande) :
  action `pay-seller` possible si statut ∈ {`PRODUCT_RECEIVED`, `PREPARING`,
  `IN_DELIVERY`, `DELIVERED`, `COMPLETED`} (RG-ORD-7).
- **Dérogation migration** : events de migration Annexe C non soumis à la
  matrice (tracés par note « Migré depuis V2… »).

## Annexe C — Mapping de migration V2 → V3

| Statut V2 | Statut V3 après migration | Events créés (historique reconstitué) | Produit associé |
|---|---|---|---|
| `WAITING_PAYMENT` | `PAYMENT_PENDING` | `(NULL→CREATED)`, `(CREATED→PAYMENT_PENDING)` à `@ order.created_at`, actor `system` | reste `RESERVED` (si dans la fenêtre) |
| `PAYMENT_FAILED` | `PAYMENT_FAILED` | `(NULL→CREATED)`, `(CREATED→PAYMENT_PENDING)`, `(PAYMENT_PENDING→PAYMENT_FAILED)` | `AVAILABLE` (déjà le cas V2) |
| `WAITING_SELLER_PAYMENT` | `PAID` (puis auto `PRODUCT_WAITING`) | `…→(PAYMENT_PENDING→PAID)` à `@ payments.paid_at`, `(PAID→PRODUCT_WAITING)` | `SOLD` (application de la règle CHG-4) |
| `SELLER_PAID` / `COMPLETED` | `COMPLETED` | events jusqu'à `PAID` (idem ci-dessus), puis `(PAID→COMPLETED, system)` avec `note = 'Migré depuis V2 : commande finalisée avant le suivi de livraison'` | `SOLD` |
| `CANCELLED` | `CANCELLED` | `(NULL→CREATED)`, `(CREATED→PAYMENT_PENDING)`, `(PAYMENT_PENDING→CANCELLED)` | `AVAILABLE` |

L'ordre des events de migration suit les horodatages réels disponibles
(`created_at`, `payments.paid_at`) puis l'`id` (CA-ORD06-02). L'invariant
CA-ORD12-04 s'applique immédiatement après migration (CA-ORD11-01).

---

*Fin du cahier des charges V3. À valider par le chef de projet et le client
avant transmission à l'architecte, au backend et au frontend.*