# ReVends — Scénarios d'envoi d'e-mail (transactionnels)

Source de vérité : `server/src/mail/{mailer,queue,templates}.ts` + appelants
(`users`, `oauth`, `password-reset`, `orders`, `admin`, `expiry` services).
Spec : C1 / US-V5-01, CA-V5-001 → CA-V5-018 (api.md §V5).

## 1. Architecture (à connaître avant la liste)

- **Deux points d'entrée uniquement** : `sendMail()` (synchrone, best-effort)
  et `queueMail()` (différé **après le commit** de la transaction). Aucun
  service métier n'envoie directement via Nodemailer.
- **Destinataire résolu par `id` en base** au moment de l'envoi — jamais une
  adresse saisie dans une requête (anti-spam, CA-V5-011).
- **Best-effort (P8)** : un échec d'envoi ne fait JAMAIS échouer l'action
  métier ; `sendMail` ne lève jamais.
- **Envoi après commit** : un rollback n'envoie rien (CA-V5-003).
- **Transports** : `smtp` (prod, `MAIL_ENABLED=true`) · `json` (test, aucun
  réseau) · `console` (dev) · `disabled` (commutateur coupé).
- **Journal** : événement + id destinataire + sujet + transport. Jamais le
  corps, jamais l'adresse du destinataire (RG-V5-07).
- **Templates** : 2 versions (HTML + texte), échappement HTML systématique,
  1 seul lien interne (`SITE_URL` + chemin validé), aucune donnée sensible
  (ni mot de passe, ni téléphone, ni nom complet).

## 2. Les 17 scénarios (exhaustif)

| # | Déclencheur | Destinataire | Événement | Sujet |
|---|---|---|---|---|
| 1 | Inscription classique (e-mail + mot de passe) | nouvel utilisateur | `welcome` | Bienvenue sur ReVends |
| 2 | Inscription via Google/Facebook (1ʳᵉ connexion) | nouvel utilisateur | `welcome` | Bienvenue sur ReVends |
| 3 | Demande « Mot de passe oublié » | le compte (si existant) | `password_reset` | Réinitialisation de votre mot de passe |
| 4 | Admin **approuve** un article | vendeur | `product_approved` | Votre article est approuvé |
| 5 | Admin **refuse** un article | vendeur | `product_rejected` | Votre article a été refusé |
| 6 | Acheteur **passe commande** | acheteur connecté | `order_created_buyer` | Votre commande est enregistrée |
| 7 | Admin **confirme le paiement** | acheteur **et** vendeur | `payment_confirmed_buyer` / `payment_confirmed_seller` | Votre paiement est confirmé / Un acheteur a payé votre article |
| 8 | Admin marque la commande **expédiée** | acheteur | `order_shipped` | Votre colis est prêt |
| 9 | Admin confirme la **livraison** | acheteur **et** vendeur | `order_delivered` / `payout_available` | Votre commande est livrée / Votre paiement vendeur est disponible |
| 10 | Admin **verse le paiement vendeur** | vendeur | `payout_paid` | Votre paiement vendeur a été versé |
| 11 | **Expiration** de la réservation (`RESERVATION_DAYS`, défaut 5 j, cron) | acheteur **et** vendeur | `reservation_expired_buyer` / `reservation_expired_seller` | Votre réservation a expiré / La réservation d'un de vos articles a expiré |
| 12 | Acheteur **réserve** l'article du vendeur | vendeur | `article_reserved` | Votre article a été réservé |
| 13 | Admin marque le produit **réceptionné** | acheteur | `order_product_received` | Votre produit a été réceptionné |
| 14 | Admin **annule** la commande | acheteur | `order_cancelled` | Votre commande a été annulée |
| 15 | **Vente terminée** (livraison confirmée) | acheteur | `order_completed_buyer` | Votre commande est terminée |

Soit **13 déclencheurs métier → 17 envois** (les scénarios 7, 9, 11 envoient à
2 destinataires) + 2 scénarios de compte (1, 2) + 3 nouveaux cycles de vie
(12, 13, 14) + 1 complétion (15).

> **Demande produit 2026-10-19** : les scénarios 12 à 15 ont été ajoutés
> pour couvrir tout le cycle de vie (réservation, réception, annulation,
> clôture) qui n'était jusque-là notifié qu'en in-app.

## 3. Détail par scénario

### Compte
1. **Inscription classique** — `users.service.registerUser()` : après INSERT du
   compte (bcrypt), `sendMail(..., 'welcome', { linkPath: '/' })`. Best-effort.
2. **Inscription OAuth** — `oauth.service` : création de compte au premier
   login Google/Facebook → même e-mail `welcome` (E1 : un compte OAuth est une
   inscription).
3. **Mot de passe oublié** — `password-reset.service.requestPasswordReset()` :
   jeton inséré en base **avant** l'envoi (sinon lien mort), lien valable
   **1 heure**, usage unique. ⚠️ Si l'e-mail n'existe pas : **aucun envoi** et
   réponse HTTP identique (anti-énumération).

### Modération (admin)
4. **Article approuvé** — `admin.service.approveProduct()` : transaction
   (verrouillage `PENDING`, action admin, notification in-app) puis
   `queueMail(vendeur, 'product_approved', { productName, linkPath: '/mes-articles' })`.
5. **Article refusé** — `admin.service.rejectProduct()` : idem avec
   `product_rejected` + `reason` (motif de refus, échappé).

### Cycle de vie de la commande (admin + acheteur)
6. **Commande créée** — `orders.service` : après réservation du produit
   (`RESERVED`, `reserved_until = now() + RESERVATION_DAYS`, défaut 5 j) et
   notification in-app, `queueMail(acheteur, 'order_created_buyer', ...)` **et**
   `queueMail(vendeur, 'article_reserved', { productName, linkPath: '/mes-articles' })`.
7. **Paiement confirmé** — `admin.service.confirmPayment()` : transitions
   `PAYMENT_PENDING → PAID → PRODUCT_WAITING`, produit `SOLD`, payout `PENDING`
   créé → **2 e-mails** : acheteur (montant total) + vendeur (montant net).
8. **Expédié** — `admin.service.markShipped()` : `PREPARING → SHIPPED` →
   e-mail acheteur.
9. **Livraison confirmée** — `admin.service.markDelivered()` (transition
   `IN_DELIVERY → DELIVERED → COMPLETED`, payout `DUE`) → **3 e-mails** : acheteur
   (`order_delivered`), vendeur (`payout_available`), acheteur
   (`order_completed_buyer` — vente terminée).
10. **Paiement vendeur versé** — `admin.service.sellerPayout()` : gardes
    (payout `DUE`, commande `DELIVERED|COMPLETED`) → e-mail vendeur (virement
    enregistré).
11. **Produit réceptionné** — `admin.service.markProductReceived()` :
    `PRODUCT_WAITING → PRODUCT_RECEIVED → PREPARING` → e-mail acheteur
    (`order_product_received`).
12. **Commande annulée** — `admin.service.cancelOrder()` : `PAYMENT_PENDING →
    CANCELLED`, paiement `FAILED`, produit redevenu `AVAILABLE` → e-mail acheteur
    (`order_cancelled`).

### Expiration (système)
13. **Réservation expirée** — cron toutes les minutes
    (`jobs/run.ts` → `expiry.service.expireExpiredReservations()`) ou libération
    paresseuse à la fiche produit : commande `PAYMENT_FAILED` (note
    « Réservation expirée (N jours) », N = `config.reservationDays`), produit
    redevenu `AVAILABLE`, notification in-app + **2 e-mails** (acheteur + vendeur).

## 4. Ce qui n'envoie PAS d'e-mail (notification in-app seulement)

- Produit en attente vendeur — `order_product_waiting`
- Commande annulée côté vendeur : le vendeur n'est **pas** prévenu par e-mail
  (seul l'acheteur reçoit `order_cancelled`) — le produit redevient simplement
  `AVAILABLE`, visible dans « Mes articles ».
- Produit reçu / préparation était en in-app seul, il a maintenant son e-mail
  (scénario 11 ci-dessus, demande 2026-10-19).
- Commande annulée par l'admin — `order.cancelled` → e-mail acheteur
  (`order_cancelled`), mais **pas** le vendeur.
- Formulaire « Contacter le vendeur » — notification `product.contact`
  uniquement (CA-V5-010)
- Paiement vendeur disponible est un e-mail (scénario 9) ; la vente terminée
  côté acheteur a aussi son e-mail (`order_completed_buyer`, scénario 9).

## 5. Configuration (env)

| Variable | Rôle |
|---|---|
| `MAIL_ENABLED` | Interrupteur global (`true` = SMTP réel en prod) |
| `MAIL_HOST` / `MAIL_PORT` / `MAIL_SECURE` | Transport SMTP (587 STARTTLS / 465 TLS) |
| `MAIL_USER` / `MAIL_PASSWORD` | Identifiants SMTP |
| `MAIL_FROM` | Adresse d'expédition (`ReVends <revendsen@gmail.com>`) |
| `SITE_URL` | Base des liens internes des e-mails |
| `RESET_TOKEN_TTL` | Durée de validité du lien de réinitialisation (1 h) |
| `RESERVATION_DAYS` | Durée de réservation avant expiration (défaut **5**) |

## 6. Tests

- `server` : chaque événement a un test (transport `json`, aucun réseau) ;
  `recentSentMails()` / `clearSentMails()` observent les envois.
- Règle : tout ajout d'événement **sans template** échoue bruyamment
  (`default:` de `renderTemplate`).
