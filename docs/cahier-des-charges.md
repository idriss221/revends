# CAHIER DES CHARGES — Plateforme de revente d'articles d'occasion (« ReVends »)

Version du 20/09/2026 — Fourni par le client, à vérifier et améliorer par l'équipe.

## 1. Présentation du projet

L'application est une plateforme de revente d'articles entre particuliers.

Elle permet à un utilisateur de :
- consulter les articles disponibles ;
- acheter un article ;
- proposer un article qu'il souhaite revendre ;
- suivre ses commandes ;
- suivre les articles qu'il a proposés à la vente.

La plateforme joue le rôle **d'intermédiaire obligatoire** entre l'acheteur et la personne qui revend son article.
L'acheteur ne doit jamais avoir accès directement aux coordonnées du vendeur.
L'administrateur contrôle la publication des articles, les commandes, les paiements reçus et les paiements effectués aux vendeurs.

## 2. Types de comptes

Pour la première version, il existe uniquement **deux connexions**.

### 2.1 Utilisateur
Un seul type de compte utilisateur. Le même utilisateur peut : acheter, revendre, consulter ses commandes, proposer plusieurs articles, suivre ses ventes. Il n'existe donc pas de compte « Acheteur » et de compte « Vendeur ».

### 2.2 Administrateur
L'administrateur possède une interface séparée. Il peut : gérer les utilisateurs, examiner les articles proposés, approuver ou refuser un article, donner une raison en cas de refus, consulter les articles publiés, consulter les commandes, confirmer qu'un paiement acheteur a été reçu, déplacer une commande vers la liste des paiements vendeurs, confirmer que le vendeur a été payé, consulter les historiques, gérer les catégories, gérer les problèmes et signalements.

## 3. Principe fondamental de la plateforme

La plateforme est l'intermédiaire. Le vendeur et l'acheteur ne communiquent pas directement.

Flux général : UTILISATEUR propose un article → ADMIN vérifie → APPROUVÉ → CATALOGUE → achat → ACHETEUR paie la plateforme → ADMIN/PLATEFORME traite la commande → VENDEUR reçoit son paiement → COMMANDE TERMINÉE.

La plateforme doit conserver la relation : Article → Propriétaire/vendeur → Acheteur → Commande → Paiement → Paiement du vendeur.

## 4. Confidentialité entre acheteur et vendeur

L'acheteur ne doit jamais voir : nom complet du vendeur, numéro de téléphone, adresse, email, WhatsApp, coordonnées bancaires, informations personnelles inutiles. Le vendeur ne doit pas non plus recevoir directement les coordonnées personnelles de l'acheteur. L'application affiche uniquement les informations nécessaires à la transaction. La plateforme centralise les échanges et la gestion de la transaction.

## 5. Catalogue

Le catalogue contient uniquement les articles approuvés par l'administrateur. Un article soumis n'est jamais publié immédiatement.

États : PENDING → (APPROVED → AVAILABLE) | REJECTED. Lorsqu'un administrateur approuve l'article, il devient automatiquement visible dans le catalogue. Aucune deuxième saisie n'est nécessaire.

## 6. Catégories

- Mode : vêtements, chaussures, sacs, accessoires
- Maison : meubles, tables, chaises, canapés, lits, décoration, cuisine
- Électronique : téléphones, ordinateurs, tablettes, télévisions, appareils audio, accessoires
- Électroménager : réfrigérateurs, machines à laver, micro-ondes, ventilateurs, climatiseurs
- Loisirs : jeux, livres, instruments, équipements sportifs

Les catégories pourront être modifiées depuis l'administration.

## 7. Formulaire « Revendre un article »

Bouton « Revendre un article » → formulaire.

Informations obligatoires : nom, catégorie, sous-catégorie, description, état, prix, localisation, photos.
Informations complémentaires : marque, modèle, ancienneté, défauts éventuels, accessoires fournis, remarques.

Photos : plusieurs photos possibles (Photo principale, Photo 2, Photo 3, Photo 4...). Vérifications : au moins une photo, format accepté, taille maximale, photo lisible si possible.

## 8. Statut d'un article soumis

Envoyé → PENDING, apparaît dans Administration → Articles à vérifier.
- APPROUVER → AVAILABLE, visible dans le catalogue automatiquement.
- REFUSER → REJECTED, obligation de raison (ex : Photos insuffisantes, Description incorrecte, Article en trop mauvais état, Produit interdit, Informations incomplètes, Prix incohérent). L'utilisateur voit la raison du refus dans son espace.

## 9. Article = objet unique

Chaque article proposé représente un exemplaire précis (ex : iPhone 13, 250 000 FCFA, quantité 1, propriétaire #25). Ce n'est pas un produit vendu en plusieurs exemplaires. Essentiel pour empêcher deux personnes d'acheter le même article.

## 10. Achat

L'acheteur consulte le catalogue, ouvre la fiche d'un article (photos, nom, description, état, prix, catégorie, informations générales, disponibilité), clique « Acheter ». Le système vérifie immédiatement que l'article est toujours disponible.

## 11. Réservation de l'article

Lorsqu'un utilisateur commence une commande : AVAILABLE → RESERVED. Pendant cette période, les autres utilisateurs ne peuvent plus commander le même article. Le système doit empêcher les doubles commandes.

## 12. Paiement de l'acheteur

L'argent est destiné à la plateforme. L'acheteur ne paie jamais directement le vendeur. Modalités possibles : paiement en ligne, paiement à la livraison/physique, autre moyen intégré ultérieurement. Dans tous les cas, la transaction doit être enregistrée dans l'application.

## 13. Gestion des commandes par l'administrateur

Page « Commandes ». Chaque commande affiche : N° commande (ex CMD-000125), Article, Acheteur, Vendeur, Prix, Date, Paiement acheteur (Payé/Non payé), Paiement vendeur (Payé/Non payé), Statut.

## 14. Bouton « Payé / Non payé »

Élément central. Dans la liste des commandes, l'administrateur dispose d'une action « Paiement reçu » / « Non payé ». Au départ : Paiement acheteur = NON PAYÉ. L'administrateur confirme → clique « PAYÉ » → `buyer_payment_status = PAID`, la commande est déplacée automatiquement dans une autre liste.

## 15. Liste « Paiements vendeurs »

Deuxième page admin contenant uniquement les commandes dont le paiement acheteur a été confirmé. Colonnes : Commande, Article, Montant, Vendeur, Paiement vendeur.

## 16. Paiement du vendeur

L'administrateur a deux possibilités : « Payer le vendeur » / « Non payé ». Tant que non payé : Paiement vendeur = NON PAYÉ. Lorsqu'effectué : PAYÉ. Le système enregistre : date du paiement, montant, commande concernée, vendeur concerné, administrateur ayant fait l'action, référence du paiement si disponible.

## 17. Exemple complet

1. Proposition iPhone 13 (250 000 FCFA) → PENDING
2. Admin approuve → AVAILABLE (visible catalogue)
3. Acheteur clique ACHETER → Commande CMD-001, produit RESERVED
4. Acheteur paie la plateforme, admin confirme PAYÉ → passe dans Paiements vendeurs
5. Admin paie le vendeur → VENDEUR PAYÉ (date + référence enregistrées)
6. Commande terminée → SOLD

## 18. Commission de la plateforme

La plateforme peut prendre une commission sur chaque vente. Ex 10 % : Prix 250 000 → Commission 25 000 → À reverser vendeur 225 000. Dans l'administration : Prix / Commission / À reverser vendeur. La commission appartient à la plateforme, pas à l'administrateur personnellement.

## 19. États d'une commande

CREATED → WAITING_PAYMENT → PAID → WAITING_SELLER_PAYMENT → SELLER_PAID → COMPLETED. En cas de problème : CANCELLED ou PAYMENT_FAILED.

## 20. États du produit

PENDING → (REJECTED) | (AVAILABLE → RESERVED → SOLD). Ne pas confondre statut du produit et statut du paiement. Un produit peut être SOLD tandis que le paiement du vendeur possède son propre historique.

## 21. Relation entre utilisateur, produit et commande

- users.id = 25
- products.id = 100, owner_id = 25
- orders.id = 500, product_id = 100, buyer_id = 42, seller_id = 25

Le `seller_id` doit être enregistré dans la commande pour conserver l'historique de la vente.

## 22. Protection contre les doubles commandes

Règle obligatoire. Deux achats simultanés : un seul utilisateur obtient l'article. Utiliser : transaction SQL, verrouillage de la ligne du produit, vérification du statut, contrainte d'unicité adaptée.

Logique : BEGIN TRANSACTION → Vérifier produit → Si AVAILABLE : réserver → Sinon : refuser → COMMIT.

## 23. Expiration d'une réservation

Réservation ne doit pas bloquer éternellement le produit. RESERVED → paiement non effectué → expiration → AVAILABLE. Durée configurable via `RESERVATION_DAYS` (défaut **5 jours**, décision produit 2026-10-19). L'expiration libère le produit (`AVAILABLE`), fait basculer la commande en `PAYMENT_FAILED`, et notifie les deux parties (e-mail + notification in-app).

## 24. Tableau de bord utilisateur

Menu : Mon compte → Tableau de bord, Mes commandes, Mes articles, Revendre un article, Mes favoris, Notifications, Profil.
« Mes articles » : statut visible (En attente / Disponible / Vendu).

## 25. Tableau de bord administrateur

Vue simple orientée gestion : Utilisateurs (1 250), Articles attente (18), Commandes (42), Paiements attente (15).

## 26. Menu administrateur

Dashboard → Utilisateurs → Articles (En attente / Publiés / Refusés) → Commandes (Toutes / Non payées / Payées) → Paiements vendeurs (À payer / Payés) → Catégories → Historique.

## 27. Historique administratif

Chaque action importante enregistrée (date, admin, action, cible). Ex : Article approuvé ; Paiement acheteur confirmé (CMD-001, 250 000) ; Vendeur payé (CMD-001, 225 000). Savoir qui a fait quoi et quand.

## 28. Sécurité

Protéger : mots de passe, données personnelles, informations de paiement, coordonnées, actions administratives. L'acheteur ne doit jamais récupérer directement les infos privées du vendeur via l'API. Autorisations vérifiées côté serveur.

## 29. Notifications

- Article : en cours de vérification / approuvé / refusé (+ motif).
- Vente : article vendu / paiement en cours / paiement effectué.
- Achat : commande enregistrée / paiement confirmé.

## 30. Base de données proposée

Tables : users, categories, products, product_images, orders, payments, seller_payouts, admin_actions.

- users : id, name, email, password, phone, address, created_at, updated_at
- categories : id, name, slug, active, created_at, updated_at
- products : id, owner_id, category_id, name, slug, description, condition, price, location, status, rejection_reason, approved_at, approved_by, created_at, updated_at
- product_images : id, product_id, path, is_primary, created_at
- orders : id, product_id, buyer_id, seller_id, amount, commission, seller_amount, status, created_at, updated_at
- payments : id, order_id, amount, method, status, paid_at, reference, created_at, updated_at
- seller_payouts : id, order_id, seller_id, amount, status, paid_at, reference, paid_by, created_at, updated_at
- admin_actions : id, admin_id, action, target_type, target_id, description, created_at

## 31. Relations principales

Voir schéma ERD (users/products/orders/payments/seller_payouts) — cf. section 30.

## 32. Architecture du paiement

Séparer : Paiement acheteur (ACHETEUR → PLATEFORME → Payment) et Paiement vendeur (PLATEFORME → VENDEUR → SellerPayout). Deux boutons admin : « Paiement reçu » (Commandes) et « Vendeur payé » (Paiements vendeurs).

## 33. Règle importante concernant l'argent

L'administrateur n'est PAS propriétaire de l'argent : Plateforme = entité qui encaisse et gère les transactions ; Admin = personne autorisée à administrer. En production, brancher un moyen de paiement professionnel adapté.

## 34. Ce que l'utilisateur ne voit jamais

Dashboard admin, autres vendeurs, coordonnées des vendeurs, paiements internes, montants de commission internes, infos bancaires/Mobile Money du vendeur, actions de l'administration.

## 35. Ce que l'administrateur voit

Utilisateur, Article, Prix, Propriétaire, Acheteur, Commande, Paiement acheteur, Commission, Montant vendeur, Paiement vendeur, Historique. Vision complète de la transaction.

## 36. Cycle complet d'une vente

1. UTILISATEUR soumet article → 2. ADMIN (refuse → motif → FIN | approuve) → 3. CATALOGUE → 4. ACHETEUR commande → 5. PRODUIT RESERVED → 6. ACHETEUR paie la plateforme → 7. ADMIN confirme PAYÉ → 8. COMMANDE → liste « Paiements vendeurs » → 9. ADMIN paie le vendeur → 10. VENDEUR PAYÉ → 11. PRODUIT SOLD → 12. COMMANDE TERMINÉE.

## 37. MVP — Première version

- Connexion : inscription utilisateur ; connexion utilisateur ; connexion administrateur ; déconnexion ; mot de passe sécurisé.
- Utilisateur : catalogue ; recherche ; catégories ; fiche article ; acheter ; mes commandes ; revendre ; mes articles ; statut de mes articles.
- Administration : dashboard ; utilisateurs ; articles en attente ; approbation ; refus + motif ; catalogue ; commandes ; confirmation paiement acheteur ; liste paiements vendeurs ; confirmation paiement vendeur ; historique.
- Transaction : produit unique ; réservation ; commande ; paiement acheteur ; commission ; paiement vendeur ; protection contre les doubles commandes.

## 38. Fonctionnalités à garder pour plus tard

Paiement automatique, reversement automatique, livraison, suivi de livraison, notifications SMS/WhatsApp, messagerie interne, favoris, avis, notation, signalement, système de litiges, produits sponsorisés, comptes professionnels, recommandations intelligentes, détection d'annonces similaires, vérification automatique des photos, statistiques avancées.

## 39. Principe général du projet

> L'utilisateur propose, l'administration contrôle, la plateforme vend, l'acheteur paie la plateforme et la plateforme reverse ensuite l'argent au propriétaire de l'article.

Deux connexions uniquement (Utilisateur / Administrateur). Le cœur du système est la traçabilité : chaque article possède un propriétaire, chaque commande possède un acheteur et un vendeur, chaque paiement est enregistré, et chaque paiement du vendeur est séparé et traçable.