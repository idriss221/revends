# CAHIER DES CHARGES V2 — Plateforme de revente d'articles d'occasion « ReVends »

| | |
|---|---|
| **Version** | 2.0 (issue de l'audit du cahier V1 du 20/09/2026) |
| **Auteur** | Agent cahier-des-charges, pour l'équipe projet |
| **Statut** | À valider par le chef de projet et le client |
| **Documents liés** | `docs/cahier-des-charges.md` (V1 brute client) · `reference/maquette-revends.html` (maquette illustrative) |

Ce document **remplace** le V1 comme source de vérité du périmètre. Toute
différence entre le V1 et la V2 est un **arbitrage explicite**, signalé comme
tel (voir §5. Décisions structurantes et §12. Points ouverts).

---

## 1. Contexte et objectifs

ReVends est une plateforme web de revente d'articles d'occasion entre
particuliers (Côte d'Ivoire, prix en FCFA). La plateforme est un
**intermédiaire obligatoire** :

- l'acheteur **ne reçoit jamais** les coordonnées du vendeur (et inversement) ;
- tous les flux d'argent passent par la plateforme : l'acheteur paie la
  plateforme, la plateforme reverse ensuite au vendeur ;
- l'administrateur contrôle la publication des articles, les commandes, les
  paiements reçus et les paiements effectués aux vendeurs.

**Objectifs de la V1 (MVP)**
1. Publier un catalogue d'articles approuvés par l'admin, consultable par tous.
2. Permettre à un utilisateur de proposer un article, de l'acheter et de suivre
   ses commandes et ventes, sans jamais être mis en relation directe.
3. Assurer la **traçabilité complète** de chaque transaction (qui a fait quoi,
   quand) : c'est le cœur du système (V1 §39).
4. Garantir qu'un article unique ne peut jamais être vendu deux fois.

**Cible** : application **Web** (responsive desktop/mobile). Pas de mobile natif
en V1.

---

## 2. Acteurs

| Acteur | Description |
|---|---|
| **Visiteur** | Non connecté. Consulte le catalogue et les fiches articles. Ne peut ni acheter ni revendre. |
| **Utilisateur** | Compte créé par inscription. Acheteur **et** vendeur (un seul type de compte, V1 §2.1). |
| **Administrateur** | Compte pré-créé (seed), **jamais** créé par inscription publique. Gère articles, commandes, paiements, utilisateurs, catégories. |
| **Plateforme** | Entité qui encaisse et reverse. L'admin en est le mandataire, pas le propriétaire de l'argent (V1 §33). |

**Deux connexions uniquement** (Utilisateur / Administrateur), conformément
au V1 §2 et §39.

---

## 3. Personas

**P1 — Aïcha, acheteuse occasionnelle (28 ans).** Cherche un iPhone d'occasion
à Abidjan. Veut vérifier l'état, le prix, la localisation, la fiabilité du
vendeur, sans échanger ses coordonnées. Exige que la plateforme garantisse le
sérieux des annonces (pré-validation admin) et un paiement sûr.

**P2 — Jean-Marc, vendeur (35 ans).** Revend ses meubles après un déménagement.
Veut mettre son article en ligne rapidement, savoir où il en est (attente /
validé / refusé), être payé de son dû moins la commission, et connaître le
montant exact à recevoir.

**P3 — Fatou, admin (40 ans).** Garant de la qualité du catalogue et de
l'argent qui circule. Veut un flux simple : valider/refuser des articles avec
motif, confirmer les paiements reçus, payer les vendeurs, et pouvoir retracer
chaque action (historique horodaté).

---

## 4. Périmètre V1

### 4.1 Dans le périmètre (détails au §6 User stories et §7 Règles de gestion)

| Domaine | Fonctionnalités |
|---|---|
| **Comptes** | Inscription utilisateur, connexion, déconnexion, mot de passe sécurisé (min 8 caractères), session persistante, case CGU obligatoire. |
| **Catalogue** | Liste des articles approuvés, recherche par mot-clé (nom), filtre par catégorie, tri (récent / prix croissant / prix décroissant), fiche article (photos, description, état, prix, localisation, info vendeur limitée), badge disponibilité. |
| **Revendre** | Formulaire complet (nom, catégorie, sous-catégorie, état, prix, localisation, photos, description, champs complémentaires), suivi du statut, raison de refus visible, modification / suppression limitées. |
| **Achat** | Achat d'un article unique, création de commande, réservation temporaire (15 min), protection anti-double-commande. |
| **Transactions** | Confirmation manuelle du paiement acheteur par l'admin, commission 10 %, paiement vendeur séparé et tracé, historique admin de chaque action. |
| **Admin** | Dashboard (4 compteurs), articles en attente (approuver / refuser + motif), commandes (+ détail), paiements vendeurs, utilisateurs (liste), catégories (activer / désactiver / renommer), historique. |
| **Notifications** | **In-app uniquement** (page + badge) sur les 8 événements définis au §10. |

### 4.2 Hors périmètre V1 (explicite — signalé mais **non développé**)

- Paiement **en ligne** (Mobile Money / carte / webhook) : le paiement V1 est
  **hors-ligne, confirmé manuellement** par l'admin (décision D1).
- Reversement automatique au vendeur.
- Livraison et suivi de livraison. V1 = **remise physique** : le libellé
  « Livrée » de la maquette est décoratif et hors périmètre.
- Notifications SMS / WhatsApp / e-mail.
- Messagerie interne acheteur ↔ vendeur.
- Favoris (le cœur de la maquette est décoratif).
- Avis et notation (les étoiles « 4.8 » des cartes produits de la maquette sont
  décoratives et ne doivent pas être implémentées en V1).
- Signalements et système de litiges (le motif de refus « Produit interdit »
  couvre l'illicite en V1).
- Produits sponsorisés, comptes professionnels, recommandations intelligentes,
  détection d'annonces similaires, vérification automatique des photos.
- Statistiques avancées (le graphique « ventes 7 jours » de la maquette est
  décoratif et hors périmètre).
- Création de nouvelles catégories par l'admin (seulement
  activer / désactiver / renommer, D7).

---

## 5. Décisions structurantes (arbitrages de l'audit)

Chaque décision lève une ambiguïté du V1 et **prime sur lui**.

| # | Ambiguïté V1 (réf.) | Décision V2 |
|---|---|---|
| **D1** | **Paiement en ligne vs à la livraison** (V1 §12) | **V1 = paiement hors-ligne confirmé manuellement.** L'acheteur paie la plateforme hors-ligne (Mobile Money, espèces au point de retrait convenu, virement) ; l'admin clique « Paiement reçu » après vérification. Le paiement est tracé dans la table `payments` (méthode + référence si fournie). Seules les commandes au paiement confirmé passent dans « Paiements vendeurs ». |
| **D2** | **Pseudo vs nom complet affiché** (V1 §4 / §34 vs maquette « Jean Kouamé ») | **Le nom public est un `display_name` (pseudo), saisi obligatoirement à l'inscription.** Le nom complet (`name`) n'est jamais affiché côté public. La maquette affiche « Jean Kouamé » à titre décoratif : en V1, la fiche article affiche le pseudo + « Membre depuis <année d'inscription> » + « N ventes » (N = nombre d'articles de ce vendeur passés `SOLD`). Ni l'acheteur ni le vendeur ne voient les coordonnées de l'autre. |
| **D3** | **Durée d'expiration de la réservation** (V1 §23 « définie plus tard ») | **15 minutes**, `reserved_until = now + 15 min`. Mécanisme : (a) vérification paresseuse à chaque accès (clic « Acheter », ouverture fiche, listing) ET (b) tâche planifiée toutes les minutes qui libère les réservations expirées. Libération **uniquement** si la commande est encore en `WAITING_PAYMENT` (pas de course entre confirmation admin et expiration). |
| **D4** | **Statuts produit** (V1 §5, §8, §20) | Une seule valeur de statut : `PENDING → AVAILABLE (approuvé) → RESERVED → SOLD`, plus `REJECTED`. **Pas de statut « APPROVED » distinct** : approuver = passer à `AVAILABLE`. Traçabilité conservée par `approved_at` / `approved_by`. |
| **D5** | **Statuts commande** (V1 §19 vs §17 vs §36) | Workflow à 6 états persistants (mapping exact au §7.2). Le produit passe **`SOLD` quand le paiement vendeur est confirmé** (`SELLER_PAID`), la commande passe alors `COMPLETED` — conforme au cycle V1 §36 (étapes 11→12). |
| **D6** | **Dualité paiement acheteur / statut commande** (V1 §14, §16, §32) | `orders.status` pilote le workflow ; le paiement acheteur est dans `payments` ; le paiement vendeur dans `seller_payouts`. L'action admin « Paiement reçu » passe `orders.status` → `WAITING_SELLER_PAYMENT` **et** valide `payments.status = PAID` **dans la même transaction**. Pas de champ `buyer_payment_status` séparé sur `orders` (information dérivable — D6 supprime ce doublon du V1 §14). |
| **D7** | **Catégories / sous-catégories** (V1 §6 vs §30) | Table `categories` **hiérarchique** : `parent_id` permet un niveau de sous-catégories (niveau 1 = catégories, niveau 2 = sous-catégories). 5 catégories + sous-catégories pré-chargées par seed. L'admin peut activer / désactiver / renommer. Création = hors périmètre. |
| **D8** | **Champs complémentaires du formulaire** (V1 §7 vs §30) | Colonnes ajoutées à `products` : `brand, model, age_years, defects, accessories, notes` (nullable, cf. §8). Non affichées en carte catalogue ; affichées en fiche article et visibles admin. |
| **D9** | **Modification / suppression d'article** (présent en maquette, absent du V1) | Règle RG-PROD-4 (§7.6) : modifiable si `PENDING` ou `AVAILABLE` (une modification d'article publié **re-soumet à vérification** → `PENDING`) ; re-soumission possible si `REJECTED` ; supprimable si `PENDING`/`AVAILABLE` **sans commande active** ; immuable si `RESERVED`/`SOLD`. |
| **D10** | **Achat sans connexion** (maquette, absent du V1) | L'achat exige un compte connecté. Clic « Acheter » non connecté → redirection page de connexion, puis retour automatique sur la fiche article après connexion. |
| **D11** | **Numérotation des commandes** (V1 §13 « CMD-000125 » vs maquette « CMD-0012 ») | Format unique `CMD-%06d` (ex. `CMD-000125`), dérivé de l'auto-incrément global de la table `orders`. |
| **D12** | **Recherche** (V1 §37 « recherche ») | Recherche par mot-clé sur le **nom** de l'article (insensible à la casse) + filtre catégorie + tri (plus récent / prix croissant / prix décroissant). |

---

## 6. User stories et critères d'acceptation

Conventions : chaque critère est **binaire et testable** (recette manuelle §11).
Identifiant : `US-<DOMAINE>-<N>` ; critères `CA-<US>-<N>`.

### 6.1 Comptes et authentification

**US-AUTH-01 — S'inscrire**
En tant que **visiteur**, je veux **créer un compte avec un pseudo public, un
nom complet (privé), un e-mail, un téléphone et un mot de passe**, afin de
pouvoir acheter et revendre sans exposer mes coordonnées.

Critères d'acceptation :
- CA-AUTH01-01 : le formulaire d'inscription contient : pseudo (obligatoire,
  2 à 50 caractères, alphanumérique + espaces), nom complet (obligatoire, privé),
  e-mail (obligatoire, format valide, unique), téléphone (obligatoire, format
  +225 …), mot de passe (obligatoire, ≥ 8 caractères), case « J'accepte les
  conditions d'utilisation » (obligatoire, bloquante si non cochée).
- CA-AUTH01-02 : un e-mail déjà utilisé → message d'erreur « Un compte avec cet
  e-mail existe déjà », création impossible.
- CA-AUTH01-03 : le mot de passe est stocké **haché** (bcrypt/argon2), jamais
  en clair. (Vérifiable en base.)
- CA-AUTH01-04 : après inscription, l'utilisateur est connecté et redirigé vers
  le catalogue.

**US-AUTH-02 — Se connecter / se déconnecter**
En tant qu'**utilisateur**, je veux **me connecter avec mon e-mail ou mon
téléphone et mon mot de passe, et me déconnecter**, afin d'accéder à mon espace
et d'en sortir en toute sécurité.

- CA-AUTH02-01 : l'identifiant accepté est l'e-mail **ou** le téléphone ; mot de
  passe requis ; erreur générique « Identifiants incorrects » en cas d'échec
  (pas de fuite d'information).
- CA-AUTH02-02 : la session persiste au-delà de la fermeture de l'onglet
  (cookie de session HTTP-only, expiration serveur 7 jours).
- CA-AUTH02-03 : se déconnecter ferme la session côté serveur et ramène à la
  page d'accueil ; le menu utilisateur disparaît.
- CA-AUTH02-04 : un utilisateur connecté ne peut pas accéder aux routes admin
  (403), l'admin ne peut pas accéder aux routes utilisateur avec ses droits de
  simple user (voir §9 Sécurité).
- CA-AUTH02-05 : « Mot de passe oublié » est **hors périmètre** (lien présent
  dans la maquette = décoratif ; en V1, message « Contactez l'équipe »).

**US-AUTH-03 — Se connecter en administrateur**
En tant qu'**administrateur**, je veux **me connecter à une page dédiée avec
un compte pré-créé**, afin d'accéder à l'administration.

- CA-AUTH03-01 : la page `/admin/login` est accessible ; le compte admin est
  pré-créé par seed (pas d'inscription admin publique).
- CA-AUTH03-02 : après connexion, l'admin accède au dashboard admin ; les
  écrans admin sont inaccessibles à un utilisateur non-admin (403), y compris
  via l'API (autorisations vérifiées **côté serveur**, V1 §28).

### 6.2 Catalogue

**US-CAT-01 — Consulter le catalogue**
En tant qu'**utilisateur (ou visiteur)**, je veux **parcourir les articles
approuvés**, afin de trouver un bien à acheter.

- CA-CAT01-01 : seuls les articles `AVAILABLE` apparaissent dans le catalogue
  (jamais `PENDING`, `REJECTED`, `RESERVED`, `SOLD`). (V1 §5.)
- CA-CAT01-02 : la liste est triée par défaut du plus récent au plus ancien.
- CA-CAT01-03 : chaque carte affiche : photo principale, nom, prix (FCFA),
  localisation, état d'approbation (inutile en carte) — minimum : photo, nom,
  prix, localisation.
- CA-CAT01-04 : les catégories affichées sont celles **actives** dans
  l'administration ; une catégorie désactivée disparaît du filtre et ses
  articles en `AVAILABLE` restent visibles (le filtre ne les masque pas).
- CA-CAT01-05 : le catalogue reste consultable sans connexion.

**US-CAT-02 — Rechercher et filtrer**
En tant qu'**utilisateur**, je veux **chercher par mot-clé et filtrer par
catégorie et trier par prix/date**, afin de trouver rapidement l'article qui
m'intéresse.

- CA-CAT02-01 : la recherche porte sur le nom de l'article, insensible à la
  casse ; une recherche vide affiche tout le catalogue.
- CA-CAT02-02 : le filtre catégorie (et sous-catégorie) restreint les résultats ;
  combinaison recherche + filtre + tri fonctionnelle.
- CA-CAT02-03 : tri « prix croissant » et « prix décroissant » disponibles et
  corrects.

**US-CAT-03 — Consulter la fiche article**
En tant qu'**utilisateur**, je veux **ouvrir la fiche d'un article**, afin de
voir toutes ses informations et décider d'acheter.

- CA-CAT03-01 : la fiche affiche : galerie de photos (1re = principale, miniatures
  cliquables), nom, prix, état, disponibilité (badge), description, catégorie /
  sous-catégorie, localisation, champs complémentaires renseignés (marque,
  modèle, ancienneté, défauts, accessoires, remarques).
- CA-CAT03-02 : l'info vendeur affichée est limitée à : **pseudo**, « Membre
  depuis <année> » et « N ventes » (D2). Aucun nom complet, téléphone, e-mail,
  adresse ou coordonnée bancaire n'est affiché (V1 §4, §34).
- CA-CAT03-03 : si l'article est `RESERVED` (autre commande en cours) ou `SOLD`,
  le bouton « Acheter » est inactif et le badge l'indique (« Réservé » / « Vendu »).
- CA-CAT03-04 : si la réservation du produit a expiré sans confirmation, la fiche
  se rafraîchit sur `AVAILABLE` et le bouton « Acheter » redevient actif (D3).

### 6.3 Revendre un article

**US-SELL-01 — Proposer un article**
En tant qu'**utilisateur connecté**, je veux **remplir le formulaire « Revendre
un article »**, afin que mon annonce soit vérifiée puis publiée.

- CA-SELL01-01 : champs obligatoires : nom (3 à 120 caractères), catégorie,
  sous-catégorie, état (une des valeurs : Neuf, Très bon état, Bon état,
  Correct, À réparer), prix (entier FCFA, **entre 500 et 10 000 000**), 
  localisation (texte libre 3 à 100 caractères), description (10 à 2000
  caractères), **au moins 1 photo** (RG-MEDIA-1).
- CA-SELL01-02 : champs complémentaires optionnels : marque, modèle, ancienneté
  (années), défauts, accessoires fournis, remarques (D8).
- CA-SELL01-03 : liste des motifs de refus connus à l'avance (RG-REFUS) et prix
  invalides bloqués à la saisie (message explicite).
- CA-SELL01-04 : la soumission crée l'article en `PENDING` ; l'utilisateur est
  redirigé vers une page de confirmation « Article soumis avec succès » et
  reçoit une notification in-app (Événement N1, §10).
- CA-SELL01-05 : l'article n'est **jamais** visible dans le catalogue tant qu'il
  n'est pas approuvé (V1 §5).

**US-SELL-02 — Suivre mes articles**
En tant qu'**utilisateur**, je veux **voir le statut de mes articles**, afin de
savoir s'ils sont en attente, publiés, refusés, réservés ou vendus.

- CA-SELL02-01 : « Mes articles » liste tous mes articles avec : photo, nom,
  prix, statut (`En attente` = PENDING, `Publié` = AVAILABLE, `Réservé` =
  RESERVED, `Vendu` = SOLD, `Refusé` = REJECTED).
- CA-SELL02-02 : si l'article est `REJECTED`, la **raison** du refus est
  affichée (V1 §8).
- CA-SELL02-03 : le tableau de bord utilisateur affiche les compteurs :
  articles, en attente, vendus (alignés sur la maquette).

**US-SELL-03 — Modifier ou supprimer un article**
En tant qu'**utilisateur**, je veux **modifier ou retirer la mise en vente**,
afin de corriger une annonce ou ne plus la proposer.

- CA-SELL03-01 : un article `PENDING` est modifiable et supprimable (boutons
  présents, maquette page « Mes articles »).
- CA-SELL03-02 : un article `AVAILABLE` est modifiable : la modification le
  repasse en `PENDING` (re-vérification admin) et le retire du catalogue
  jusqu'à nouvelle approbation (D9) ; sa suppression est possible uniquement
  **sans commande active** (aucune commande `WAITING_PAYMENT` /
  `WAITING_SELLER_PAYMENT` liée).
- CA-SELL03-03 : un article `REJECTED` est re-soumissible : modifier + « re
  soumettre » → repasse `PENDING`, `rejection_reason` effacée. Il est aussi
  **supprimable sans commande** (statuts supprimables `PENDING`/`AVAILABLE`/`REJECTED`
  — api.md §3.3, I3).
- CA-SELL03-04 : un article `RESERVED` ou `SOLD` est **immuable** (ni
  modification ni suppression).

### 6.4 Achat et réservation

**US-BUY-01 — Acheter un article (création de commande + réservation)**
En tant qu'**utilisateur connecté**, je veux **cliquer « Acheter » sur une fiche
article**, afin de commander cet article unique avant de le payer.

- CA-BUY01-01 : le clic « Acheter » n'est possible que sur un article
  `AVAILABLE` et par un utilisateur **connecté** (sinon redirection connexion
  puis retour sur la fiche, D10).
- CA-BUY01-02 : l'achat crée une commande `CMD-%06d` au statut
  `WAITING_PAYMENT`, une ligne `payments` au statut `PENDING`, et passe le
  produit en `RESERVED` avec `reserved_until = now + 15 min` — **en une seule
  transaction SQL** (V1 §22).
- CA-BUY01-03 : double commande impossible : deux utilisateurs cliquent en
  parallèle sur le même article → un seul obtient la commande ; l'autre reçoit
  un message « Cet article vient d'être réservé » (protection anti-double-
  commande : SELECT … FOR UPDATE / verrou de ligne, V1 §22).
- CA-BUY01-04 : l'article réservé n'est plus commandable par personne d'autre
  (bouton désactivé + badge « Réservé »).
- CA-BUY01-05 : l'acheteur ne peut pas acheter **son propre article** (message
  « Vous ne pouvez pas acheter votre propre article »).
- CA-BUY01-06 : notifications : acheteur « Commande enregistrée » (N3) ;
  vendeur « Votre article est réservé » (N5).

**US-BUY-02 — Réservation expirée, article libéré**
En tant qu'**utilisateur**, je veux **que mon article ou ma commande se libère
après 15 minutes sans paiement**, afin de ne pas bloquer l'article.

- CA-BUY02-01 : aucune confirmation de paiement sous 15 min → la commande
  passe `PAYMENT_FAILED`, le produit repasse `AVAILABLE`, le paiement `PENDING`
  passe `FAILED` (D3 + RG-COMM-4).
- CA-BUY02-02 : la libération se produit par vérification paresseuse et par
  tâche planifiée (max 1 min de délai dans tous les cas).
- CA-BUY02-03 : l'acheteur dont la commande a expiré voit son statut
  « Expirée » dans « Mes commandes » et peut re-commander si le produit est à
  nouveau `AVAILABLE`.

**US-BUY-03 — Suivre mes commandes**
En tant qu'**acheteur**, je veux **voir l'état de mes commandes**, afin de
savoir où en est mon achat.

- CA-BUY03-01 : « Mes commandes » liste : n° de commande, date, article, prix,
  statut (libellé : `En attente de paiement` = WAITING_PAYMENT, `Paiement
  confirmé` = WAITING_SELLER_PAYMENT, `Terminée` = COMPLETED, `Expirée` =
  PAYMENT_FAILED).
- CA-BUY03-02 : le statut est mis à jour automatiquement après chaque action
  admin (paiement confirmé, vendeur payé).

### 6.5 Administration

**US-ADM-01 — Dashboard**
En tant qu'**admin**, je veux **voir 4 compteurs à jour**, afin de piloter
l'activité.

- CA-ADM01-01 : les 4 compteurs affichent : total utilisateurs, articles en
  attente, commandes (statut ≠ COMPLETED et ≠ CANCELLED/PAYMENT_FAILED),
  paiements en attente (commandes `WAITING_SELLER_PAYMENT` avec
  `seller_payouts.status = PENDING`).
- CA-ADM01-02 : les compteurs sont recalculés à chaque chargement de page
  (pas de valeur figée).

**US-ADM-02 — Examiner et approuver / refuser un article**
En tant qu'**admin**, je veux **examiner les articles en attente et les
approuver ou les refuser avec un motif**, afin de garantir la qualité du
catalogue et le respect des règles produits.

- CA-ADM02-01 : la liste « Articles en attente » affiche : article (photo + nom
  + prix), vendeur (identifié par `Utilisateur #id`), date de soumission.
- CA-ADM02-02 : « Approuver » passe l'article en `AVAILABLE` (visible
  catalogue), enregistre `approved_at` / `approved_by`, crée une action
  d'historique et notifie le vendeur (N2). Aucune deuxième saisie (V1 §5).
- CA-ADM02-03 : « Refuser » **exige** un motif choisi dans la liste
  prédéfinie (RG-REFUS, V1 §8) : sinon l'action est bloquée. L'article passe
  `REJECTED`, l'utilisateur voit le motif (US-SELL-02), notification N2bis.
- CA-ADM02-04 : le refus et l'approbation sont tracés dans `admin_actions`
  (date, admin, action, cible).

**US-ADM-03 — Gérer les commandes et confirmer le paiement acheteur**
En tant qu'**admin**, je veux **consulter les commandes et confirmer « Paiement
reçu » / « Non payé »**, afin de valider les paiements hors-ligne.

- CA-ADM03-01 : liste « Commandes » : N° (CMD-%06d), article, acheteur, vendeur,
  prix, date, statut paiement acheteur (`Payé`/`Non payé`), statut paiement
  vendeur, statut commande.
- CA-ADM03-02 : le détail d'une commande affiche les informations complètes
  (acheteur `Utilisateur #id`, vendeur `Utilisateur #id`, montant, date) et les
  boutons « Paiement reçu » / « Non payé ».
- CA-ADM03-03 : « Paiement reçu » est possible **uniquement** si
  `orders.status = WAITING_PAYMENT` ; sinon bouton inactif. L'action passe la
  commande en `WAITING_SELLER_PAYMENT` et `payments.status = PAID` (méthode et
  référence de paiement demandées, D6), déplace la commande dans « Paiements
  vendeurs », notifie l'acheteur (N4), trace l'action.
- CA-ADM03-04 : « Non payé » est hors périmètre d'action positive : si le
  paiement n'est pas reçu, la réservation expire (15 min, RG-COMM-4) ; aucun
  bouton « annuler » requis en V1. En V1, le bouton « Non payé » de la maquette
  est un simple affichage d'état, **non une action** (corrigé au §12).
- CA-ADM03-05 : deux admins ne peuvent pas confirmer deux fois la même commande
  (vérification de statut en transaction).

**US-ADM-04 — Payer les vendeurs**
En tant qu'**admin**, je veux **voir la liste des paiements vendeurs et
confirmer « Payer le vendeur »**, afin de reverser le dû (prix − commission).

- CA-ADM04-01 : « Paiements vendeurs » liste les commandes dont le paiement
  acheteur est confirmé : Commande, Article, Vendeur, **Montant à reverser**
  (prix − commission), statut paiement vendeur (`Payé`/`Non payé`).
- CA-ADM04-02 : « Payer le vendeur » : possible uniquement si
  `seller_payouts.status = PENDING`. L'action enregistre date, montant,
  commande, vendeur, admin, référence si fournie ; passe
  `seller_payouts.status = PAID`, `orders.status = SELLER_PAID` puis
  `COMPLETED`, `products.status = SOLD` (D5), notifie le vendeur (N6), trace
  l'action — une seule transaction.
- CA-ADM04-03 : la commission est calculée à l'affichage et enregistrée :
  `commission = floor(prix × 10 %)`, `seller_amount = prix − commission`
  (ex. 250 000 → 25 000 → 225 000, V1 §18 ; maquette page paiements cohérente).
- CA-ADM04-04 : impossible de payer un vendeur deux fois (statut vérifié en
  transaction).

**US-ADM-05 — Gérer les utilisateurs**
En tant qu'**admin**, je veux **lister les utilisateurs**, afin de disposer de
la vision complète du V1 §35.

- CA-ADM05-01 : la liste affiche : id, pseudo, nom complet, e-mail, téléphone,
  date d'inscription, nb articles, nb commandes. Sans modification possible en
  V1 (lecture seule) — signalé comme simplication vs V1 §2.2 (point ouvert 7).

**US-ADM-06 — Gérer les catégories**
En tant qu'**admin**, je veux **activer/désactiver ou renommer une catégorie
ou sous-catégorie**, afin d'ajuster le catalogue.

- CA-ADM06-01 : liste des catégories actives/inactives avec leur sous-catégories ;
  actions possibles : activer, désactiver, renommer (D7).
- CA-ADM06-02 : désactiver une catégorie la retire du formulaire de revente et
  du filtre du catalogue ; les articles déjà publiés restent visibles
  (CA-CAT01-04).
- CA-ADM06-03 : une sous-catégorie ne peut pas être activée si sa catégorie
  parente est inactive.

**US-ADM-07 — Consulter l'historique**
En tant qu'**admin**, je veux **voir l'historique horodaté des actions**,
afin de savoir qui a fait quoi et quand (V1 §27).

- CA-ADM07-01 : l'historique liste : date/heure, admin (e-mail), action, cible
  (article / commande), description (ex. « Article approuvé », « Paiement
  acheteur confirmé — CMD-000125 — 250 000 FCFA », « Vendeur payé —
  CMD-000125 — 225 000 FCFA »).
- CA-ADM07-02 : toute action importante est systématiquement enregistrée
  (approbation, refus, paiement confirmé, vendeur payé) — cohérent avec la page
  « Historique » de la maquette.

### 6.6 Notifications

**US-NOT-01 — Afficher mes notifications**
En tant qu'**utilisateur**, je veux **lire mes notifications in-app**, afin
d'être tenu informé sans autre canal (D3b : canal MVP = in-app seulement).

- CA-NOT01-01 : le menu « Notifications » liste les notifications par date
  décroissante, non lues en premier ; un badge affiche le nombre de non lues.
- CA-NOT01-02 : les 8 événements du §10 déclenchent une notification ; les
  champs sont : titre, message, date, lu/non lu.
- CA-NOT01-03 : aucune notification SMS/WhatsApp/e-mail n'est envoyée en V1
  (hors périmètre).

---

## 7. Règles de gestion

### 7.1 Statuts du produit — `products.status`

```
PENDING → AVAILABLE → RESERVED → SOLD
   └────→ REJECTED ──→ (re-soumission → PENDING)
```

| Statut | Signification | Règles |
|---|---|---|
| `PENDING` | Soumis, en attente de vérification admin | Non visible en catalogue. Modifiable / supprimable par le propriétaire. |
| `AVAILABLE` | Approuvé (visible catalogue) | = « Approuvé » (D4). `approved_at`/`approved_by` renseignés. Modifiable (→ PENDING pour re-vérification). Supprimable sans commande active. |
| `RESERVED` | Une commande en cours (`reserved_until`) | Attribué à l'achat. Immuable. |
| `SOLD` | Vendu définitivement (paiement vendeur confirmé) | Immuable. Compté dans « N ventes » du vendeur (D2). |
| `REJECTED` | Refusé (motif obligatoire) | `rejection_reason` renseigné. Modifiable → re-soumission (PENDING). |

Transitions autorisées (toute autre transition est un bug) :
`PENDING → AVAILABLE | REJECTED` ; `AVAILABLE → RESERVED | PENDING (modif)` ;
`RESERVED → AVAILABLE (expiration)` ; `RESERVED → SOLD (paiement vendeur)`.

### 7.2 Statuts de la commande — `orders.status`

Workflow simplifié (D5), **mapping avec le vocabulaire du V1 §19** :

| Statut V2 | Équivaut à (V1 §19) | Déclencheur | Libellé UI acheteur |
|---|---|---|---|
| `WAITING_PAYMENT` | CREATED / WAITING_PAYMENT | Clic « Acheter » (produit → RESERVED) | En attente de paiement |
| `PAYMENT_FAILED` | PAYMENT_FAILED | Expiration 15 min sans paiement (produit → AVAILABLE) | Expirée |
| `WAITING_SELLER_PAYMENT` | PAID / WAITING_SELLER_PAYMENT | Admin « Paiement reçu » (`payments` → PAID) | Paiement confirmé |
| `SELLER_PAID` | SELLER_PAID | Admin « Payer le vendeur » (produit → SOLD) | Terminée |
| `COMPLETED` | COMPLETED | Idem (état terminal immédiat après SELLER_PAID) | Terminée |
| `CANCELLED` | CANCELLED | Annulation manuelle (prévue, peu utilisée en V1 : pas de bouton « annuler » côté utilisateur) | Annulée |

Transitions autorisées :
`WAITING_PAYMENT → WAITING_SELLER_PAYMENT | PAYMENT_FAILED | CANCELLED` ;
`WAITING_SELLER_PAYMENT → SELLER_PAID` ; `SELLER_PAID → COMPLETED`.
Aucun retour en arrière possible après `WAITING_SELLER_PAYMENT`.

### 7.3 Commission

- Taux : **10 % fixe** en V1 (défaut, constantes de configuration).
- Calcul enregistré à la création de la commande : `commission =
  floor(prix × 0,10)` ; `seller_amount = prix − commission` (FCFA = entiers,
  pas de décimales). Exemple : 250 000 → 25 000 → 225 000 (V1 §18).
- La commission appartient à la **plateforme**, jamais à l'admin à titre
  personnel (V1 §33).

### 7.4 Réservation / expiration

- Délai : **15 minutes** (constante configurable côté serveur).
- À l'achat : `reserved_until = now + 15 min`, produit `RESERVED`.
- Mécanisme de libération (D3) :
  1. **Vérification paresseuse** : toute lecture du produit ou toute tentative
     d'achat vérifie d'abord `reserved_until` et libère si expirée.
  2. **Tâche planifiée** : toutes les minutes, chaque commande
     `WAITING_PAYMENT` dont `reserved_until < now` passe `PAYMENT_FAILED` et
     son produit repasse `AVAILABLE`.
  3. Sécurité anti-course : l'expiration ne libère que si la commande est
     toujours `WAITING_PAYMENT` **et** le produit toujours `RESERVED` (check en
     transaction) ; une confirmation admin déjà appliquée est prioritaire et
     ne peut pas être annulée par l'expiration.

### 7.5 Refus d'un article — motifs (RG-REFUS)

Liste fermée de motifs (V1 §8) : **Photos insuffisantes · Description
incorrecte · Article en trop mauvais état · Produit interdit · Informations
incomplètes · Prix incohérent**. Le motif est obligatoire pour refuser
(CA-ADM02-03) et affiché à l'utilisateur (CA-SELL02-02).

**Articles illicites (RG-PROD-3)** — refusés sous le motif « Produit interdit » :
armes, munitions, drogues et stupéfiants, médicaments et produits de santé,
produits contrefaits (faux de marque), animaux, denrées périssables alimentaires,
objets volés (détection déclarative via les CGU acceptées à l'inscription).

### 7.6 Règles produit et médias

- **RG-PROD-1 (prix)** : entier, 500 FCFA ≤ prix ≤ 10 000 000 FCFA.
- **RG-PROD-2 (champs)** : cf. CA-SELL01-01 et CA-SELL01-02.
- **RG-PROD-4 (modification/suppression)** : cf. CA-SELL03-01…04 (D9).
- **RG-MEDIA-1 (photos)** : **1 à 4 photos** par article ; formats acceptés
  JPEG, PNG, WebP ; **poids max 5 Mo par photo** ; la 1re photo est la photo
  principale (affichée en carte et en 1re de galerie) ; les fichiers sont
  stockés localement dans le répertoire serveur `uploads/products/` avec un nom
  de fichier aléatoire (pas le nom d'origine) ; aucune retouche/redimension
  automatique en V1 ; contrôle « photo lisible » = humain (admin), pas de
  vérification automatique (hors périmètre).
- **RG-PROD-5 (catégorie/sous-catégorie)** : la sous-catégorie doit appartenir
  à la catégorie choisie ; une catégorie/sous-catégorie inactive n'est plus
  proposée dans le formulaire.

### 7.7 Confidentialité et affichage public

- **Public (tous, connectés ou non)** : pseudo du vendeur, année d'inscription,
  nombre de ventes, localisation de l'article, prix, description, photos.
- **Jamais public** : nom complet, e-mail, téléphone, adresse, coordonnées
  bancaires / Mobile Money de quiconque (vendeur comme acheteur, V1 §4, §34).
- **Admin** : voit tout (V1 §35), y compris nom complet et coordonnées, pour
  la gestion des paiements hors-ligne.
- **Identifiants d'écran admin** : vendeurs/acheteurs affichés en
  `Utilisateur #id` côté admin (cohérent avec maquette et V1 §21 exemple
  « utilisateur #25 »).
- Vérifié côté serveur : **aucun endpoint ne renvoie les champs privés du
  vendeur à l'acheteur**, même en profondeur (V1 §28).

### 7.8 Numérotation et traçabilité

- Commandes : `CMD-%06d` (D11) — affiché dans toutes les listes, notifications
  et l'historique.
- Toute action admin sensible crée une ligne `admin_actions` (date, admin,
  action, cible, description) — obligatoire, dans la même transaction que
  l'action (V1 §27).

---

## 8. Modèle de données (schéma corrigé)

Base proposée (V1 §30) **corrigée** ; l'ERD est dérivé de ces tables.

**users** — `id, display_name (pseudo, public, 2–50 car.), name (nom complet,
privé), email (unique), phone, password_hash, role ('user'|'admin'), created_at,
updated_at`
> Corrections vs V1 : ajout de `display_name` (D2), `role` (deux connexions,
> V1 §2), `password_hash` (jamais de mot de passe en clair, V1 §28).
> `address` retirée : inutile en V1 (pas de livraison) — facultative
> ultérieurement.

**categories** — `id, parent_id (NULL = catégorie, sinon sous-catégorie), name,
slug, active, created_at, updated_at`
> Correction vs V1 : ajout de `parent_id` pour les sous-catégories (D7).

**products** — `id, owner_id FK users, category_id FK categories, name, slug,
description, condition ('Neuf'|'Très bon état'|'Bon état'|'Correct'|'À
réparer'), price (FCFA entier), location, status
('PENDING'|'AVAILABLE'|'RESERVED'|'SOLD'|'REJECTED'), rejection_reason
(oblig. si REJECTED), approved_at, approved_by FK users, brand, model,
age_years, defects, accessories, notes, reserved_at, reserved_until,
created_at, updated_at`
> Corrections vs V1 : ajout de `condition` contrôlée, `brand/model/age_years/
> defects/accessories/notes` (D8), `reserved_at/reserved_until` (D3).
> Suppression de la dualité « APPROVED/AVAILABLE » (statut unique, D4).

**product_images** — `id, product_id FK, path, is_primary, position, created_at`
> Correction vs V1 : ajout de `position` pour l'ordre des photos.

**orders** — `id, order_number `CMD-%06d`, product_id FK, buyer_id FK users,
seller_id FK users (copié depuis products.owner_id à la création — historique
conservé, V1 §21), amount (= prix), commission, seller_amount, status
('WAITING_PAYMENT'|'PAYMENT_FAILED'|'WAITING_SELLER_PAYMENT'|'SELLER_PAID'|
'COMPLETED'|'CANCELLED'), created_at, updated_at`
> Corrections vs V1 : `order_number` ajouté (D11) ; suppression de
> `buyer_payment_status` (dérivé de `payments.status`, D6) ; statuts
> simplifiés mais tous présents.

**payments** — `id, order_id FK, amount, method ('MOBILE_MONEY'|'CASH'|
'BANK_TRANSFER'|'OTHER'), status ('PENDING'|'PAID'|'FAILED'), paid_at,
reference (nullable), created_at, updated_at`
> Même structure que V1 ; `status` explicité et aligné sur le workflow.

**seller_payouts** — `id, order_id FK, seller_id FK, amount (= seller_amount),
status ('PENDING'|'PAID'), paid_at, reference (nullable), paid_by FK users,
created_at, updated_at`
> Inchangé vs V1 (déjà correct).

**admin_actions** — `id, admin_id FK users, action, target_type, target_id,
description, created_at`
> Inchangé vs V1 (déjà correct).

**notifications** — `id, user_id FK, type, title, message, read_at (NULL =
non lue), created_at`
> Nouvelle table (V1 §29 décrivait les notifications sans table associée).

Contraintes d'intégrité obligatoires :
- un produit `RESERVED` a exactement **une** commande `WAITING_PAYMENT` active ;
- un produit ne peut être `SOLD` que via une commande `SELLER_PAID`/`COMPLETED` ;
- `orders.seller_id` = propriétaire du produit **au moment** de la commande
  (fingerprint de vente, V1 §21) ;
- toute action admin sur argent est dans une **transaction SQL** avec
  verrouillage de ligne (V1 §22, CA-ADM03-05, CA-ADM04-04).

---

## 9. Sécurité

1. Mots de passe **hachés** (bcrypt/argon2), jamais stockés en clair (V1 §28).
2. Autorisations vérifiées **côté serveur** sur chaque route/endpoint : un
   utilisateur ne peut pas lire, écrire ou modifier les données d'autrui (ses
   propres articles seulement), ni accéder aux routes admin (CA-AUTH02-04,
   CA-AUTH03-02).
3. **L'API ne renvoie jamais** les coordonnées du vendeur à un acheteur, ni les
   coordonnées de l'acheteur au vendeur (V1 §28, RG 7.7).
4. Sessions : cookie HTTP-only + expiration 7 jours ; déconnexion invalide la
   session côté serveur.
5. Validation serveur de toutes les entrées (formats, longueurs, prix,
   photos) — la validation client n'est qu'un confort.
6. Photos : nom de fichier généré aléatoirement, vérification du type MIME
   réel, taille ≤ 5 Mo, stockage hors du dossier public exécutable.
7. Transactions SQL + verrou de ligne partout où l'argent ou le statut est
   modifié (double commande, double paiement, expiration).
8. Journal `admin_actions` : horodaté, inaltérable côté UI (insertion seule).
9. Aucun secret (clés, références) dans le code client.

---

## 10. Notifications — canal et moments (MVP : **in-app uniquement**)

Table `notifications` ; page « Notifications » + badge de non lues.

| # | Événement | Destinataire | Titre (exemple) | Déclencheur |
|---|---|---|---|---|
| N1 | Article soumis | Vendeur | « Article soumis » | Soumission du formulaire (US-SELL-01) |
| N2 | Article approuvé | Vendeur | « Votre article est en ligne » | Approbation admin (CA-ADM02-02) |
| N2b | Article refusé (+ motif) | Vendeur | « Article refusé : <motif> » | Refus admin (CA-ADM02-03) |
| N3 | Commande enregistrée | Acheteur | « Commande CMD-000125 enregistrée » | Clique Acheter (CA-BUY01-06) |
| N4 | Paiement confirmé | Acheteur | « Paiement confirmé pour CMD-000125 » | « Paiement reçu » admin (CA-ADM03-03) |
| N5 | Article réservé | Vendeur | « Votre article est réservé » | Clique Acheter (CA-BUY01-06) |
| N6 | Vente terminée / paiement reçu | Vendeur | « Paiement reçu : 225 000 FCFA pour CMD-000125 » | « Payer le vendeur » admin (CA-ADM04-02) |
| N7 | Réservation expirée | Acheteur | « Votre commande CMD-000125 a expiré » | Expiration 15 min (CA-BUY02-03) |
| N8 | Article vendu | Vendeur | « Votre article a été vendu » | Paiement vendeur confirmé (idem N6, deux entrées distinctes pour l'acheteur et le vendeur) |

Hors périmètre en V1 : notifications SMS, WhatsApp, e-mail et push
(§4.2).

---

## 11. Spec README de recette — tests d'acceptation manuels

Environnement : application web en local (données fraîches, compte admin seed,
2 comptes utilisateurs U1 et U2). Cocher chaque critère §6. Références : identifiants CA ci-dessus.

| # | Scénario de recette | Étapes | Résultat attendu | Critères couverts |
|---|---|---|---|---|
| T01 | Inscription | Créer U1 (pseudo, nom, e-mail, tél, mdp, CGU) | Compte créé, connecté, redirigé catalogue ; pseudo visible dans le menu | CA-AUTH01-01..04 |
| T02 | Duplicata e-mail | Re-créer un compte avec l'e-mail d'U1 | Message « e-mail déjà existant », création bloquée | CA-AUTH01-02 |
| T03 | Connexion par téléphone | Se déconnecter, se connecter avec le téléphone d'U1 | Connexion OK | CA-AUTH02-01..03 |
| T04 | Refus double rôle | Connecté en U1, tenter `/admin` ; connecté admin, tenter une route user privée | 403 systématiquement | CA-AUTH02-04, CA-AUTH03-02 |
| T05 | Soumission article | U1 remplit le formulaire complet (obligatoires + complémentaires) + 2 photos | Article en « En attente » ; notification N1 ; **absent du catalogue** côté visiteur | CA-SELL01-01..05 |
| T06 | Validation formulaire | Tester prix 100 FCFA, 0 photo, description < 10 car. | Messages d'erreur, envoi bloqué | CA-SELL01-01..03, RG-MEDIA-1 |
| T07 | Approbation | Admin ouvre « Articles en attente », clique « Approuver » | Article « Publié », visible catalogue, notification N2, historique tracé | CA-ADM02-01..02,04, CA-CAT01-01 |
| T08 | Refus avec motif | U2 soumet un article ; admin « Refuser » sans motif puis avec motif | Bloquer sans motif ; avec motif → « Refusé » + motif visible chez U2 + N2b | CA-ADM02-03, CA-SELL02-02 |
| T09 | Recherche/filtres/tri | Rechercher « iphone », filtrer catégorie, trier par prix asc/desc | Résultats cohérents | CA-CAT02-01..03 |
| T10 | Fiche article | Ouvrir la fiche | Galerie, prix, état, description, localisation, **pseudo** du vendeur (+ année, N ventes), **aucune coordonnée** | CA-CAT03-01..02 |
| T11 | Achat + double commande | U2 clique « Acheter » sur l'article ; une 2e session clique en parallèle | 1 seule commande CMD-000001, produit « Réservé », 2e message « vient d'être réservé » ; N3, N5 | CA-BUY01-01..06 |
| T12 | Auto-achat interdit | U1 (propriétaire) tente d'acheter son propre article | Message « Vous ne pouvez pas acheter votre propre article » | CA-BUY01-05 |
| T13 | Expiration 15 min | Ne rien faire pendant 16 min sur la commande T11 | Commande « Expirée », produit « Disponible » à nouveau, N7 | CA-BUY02-01..03 |
| T14 | Paiement reçu | U2 rachète l'article ; admin ouvre le détail CMD, clique « Paiement reçu », saisit méthode + référence | Commande passe « Paiements vendeurs », montant reversé = prix − 10 %, N4, historique | CA-ADM03-01..05, RG-COM 7.3 |
| T15 | Bouton inactif | Sur une commande déjà confirmée, vérifier que « Paiement reçu » est inactif | Action impossible | CA-ADM03-03 |
| T16 | Payer le vendeur | Admin clique « Payer le vendeur » | seller_payouts PAID, commande « Terminée », produit « Vendu », N6/N8, historique | CA-ADM04-01..04, CA-BUY03-01..02 |
| T17 | Dashboard compteurs | Vérifier les 4 compteurs après les scénarios | Valeurs cohérentes et actualisées | CA-ADM01-01..02 |
| T18 | Mes articles / commandes | Se connecter en U1 vendeur puis en U2 acheteur | Statuts corrects (« En attente/Publié/Vendu », « En attente de paiement/Terminée ») | CA-SELL02-01..03, CA-BUY03-01..02 |
| T19 | Modif. article publié | U1 modifie un article « Publié » | Repasse « En attente » (re-vérification), disparaît du catalogue | CA-SELL03-02 (D9) |
| T20 | Catégories | Admin désactive une catégorie | Absente du formulaire et du filtre ; articles déjà publiés toujours visibles | CA-ADM06-01..03, CA-CAT01-04 |
| T21 | Notifications | Vérifier le badge et la lecture/non-lecture | Badge décroît à la lecture | CA-NOT01-01..03 |
| T22 | Confidentialité API | (Développeur) Inspecter les réponses JSON catalogue/fiche | Aucun champ privé (name, email, phone) présent | §9.3 |

Remarque recette : la maquette HTML contient des éléments **décoratifs**
(favoris, étoiles, graphique, statut « Livrée », « mot de passe oublié »,
bouton « Non payé » agissant) qui ne sont **pas** des exigences V1 (§4.2,
CA-AUTH02-05, CA-ADM03-04) — ils ne font l'objet d'aucun test d'acceptation.

---

## 12. Points ouverts (à trancher avec le chef de projet / le client)

1. **Pseudo** : confirmer qu'un pseudo est acceptable pour le client (la
   maquette affiche « Jean Kouamé »). Si le client exige le nom réel, lever
   l'exception RG 7.7 (et D2) — nécessite arbitrage.
2. **Commission** : confirmer le taux **10 %** pour la V1 (V1 §18 le laissait
   « possible »).
3. **Plancher/plafond de prix** : confirmer 500 FCFA – 10 000 000 FCFA.
4. **Paiement hors-ligne** : valider la modalité concrete de paiement
   (Mobile Money vers quel numéro ? point de retrait ?) pour la notice
   affichée à l'acheteur à la création de commande.
5. **Motif de refus** : valider la liste fermée (RG 7.5) ; ajout possible de
   motifs.
6. **Sous-catégories seed** : liste initiale à fournir par le client pour le
   seed de la table `categories` (5 catégories : Mode, Maison, Électronique,
   Électroménager, Loisirs).
7. **Utilisateurs admin** : V2 restreint l'espace « Utilisateurs » à de la
   lecture (V1 §2.2 mentionnait « gérer ») — confirmer qu'aucune action
   (bannir, éditer) n'est requise en V1.
8. **Historique de paiement** : alimenté uniquement par les 4 actions admin
   définies (CA-ADM07-02) — valider qu'aucune autre action (connexion, refus
   de paiement...) n'a à être journalisée.
9. **Durée de session à 7 jours** : acceptable ? (alternative : session
   navigateur uniquement).