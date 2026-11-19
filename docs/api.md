# CONTRAT D'API REST — ReVends (V5)

| | |
|---|---|
| **Version** | **2.8 (2026-11-18)** — **fusion du contrat additif V8 « Hébergement Boutique »** (`docs/architecture-v8-hebergement-boutique.md`, décisions V8-D1…D10 arbitrées le 18/11/2026 ; **10 nouveaux endpoints** : profil boutique (PUT/POST/GET `/api/storefront/profile`, DELETE `/api/storefront/profile/logo`, DELETE `/api/storefront/profile/banner`), `GET /api/subscriptions/me/stats`, `GET /api/subscriptions/me/report` (PDF du bilan persisté), `GET /api/admin/auto-approvals`, `POST /api/admin/products/:id/retrograde`, `GET/POST /api/cron/monthly-report`) ; **6 extensions additives** (E1 corps `POST /api/subscriptions` + `paymentMethod`/`paymentReference` **obligatoires** — CA-V8-050), E2 payload boutique publique + `logoUrl?`/`bannerUrl?`/`publicDescription?`, E3 file admin + `paymentMethod`/`paymentReference` (**aucun `collecteAddress`** — §14.D clos 18/11/2026 : la valeur n'apparaît nulle part), E4 `GET /api/subscriptions/me` + bloc `profile{collecteAddressSet}` sans la valeur, E5 carte/fiche + `sellerBadge`, E6 ce document) ; **1 ALTER** (`seller_subscriptions` + `payment_reference varchar(64)`, + `payment_method varchar(32)` CHECK `wave`/`orange_money`/`virement` — PO-V8-05 RETENU) et **3 nouvelles tables** (`storefront_profiles`, `auto_approved_products`, `monthly_metrics` — R2 retenue §14.A, fusion reports+snapshots §14.B, migration `020_storefront_v8.sql`). Les encarts v2.7 (V7 Hébergement vendeurs), v2.4 (V5), v2.5 (V6) et v2.6 (V6.7) restent applicables, non répétés ici. Détail : encart V8 ci-dessous et §3.10. |
| **Auteur** | Agent api-designer, pour l'équipe projet |
| **Statut** | Source de vérité du contrat d'API — implémentation `@backend`, consommation `@frontend` |
| **Sources** | `docs/cahier-des-charges-v5.md` (C1–C9, PO-V5-01…20, §5.1, §5.9) · `docs/architecture-v5.md` (§4.3 catégories d'index, §4.4, §5, §6.1–6.2 budgets, §10 décisions D2–D9) · `server/migrations/009_soft_delete_perf.sql` (index `idx_products_owner_deleted`, index partiel `uq_one_active_order_per_product`) · `server/src/mail/` (9 déclencheurs / 11 envois) · docs antérieures conservées : `docs/cahier-des-charges-v2.md` (base conservée hors périmètre V3) · `docs/cahier-des-charges-v3.md` (S1 — US E1/E2, CA-AUTH04/05, CA-ORD01..12, §5/§6/§7, Annexe A/B) · `docs/architecture.md` §11 (S2 — DDL 003, règles `order_events`, matrice, contrat esquissé) · `server/migrations/003_order_events.sql` (enum `order_status` 11 valeurs, table `order_events`, trigger de matrice) · `server/migrations/006_order_shipped.sql` + `007_order_shipped_cycle.sql` (**Évolution V4** : enum `order_status` 12 valeurs avec `SHIPPED`, `payout_status` `DUE`, `notification_type` `order_shipped`, matrice `PREPARING → SHIPPED → IN_DELIVERY`) · `docs/cahier-des-charges-v4-accueil.md` (**V4-Accueil** : D-ACC-1..8, PO-ACC-1..6 arbitrés, RG-PROD-1..8, §5 US/CA-ACC, §7.1 contrat cible, §8 « Voir plus ») · **DDL 008** (créé et appliqué : `server/migrations/008_accueil_v3.sql` — `products.old_price`, `products.view_count`, table `banners` + seed, `notification_type` + `product.contact`) |

> ## Évolution V3 — changements de contrat (encart)
>
> **E1 — Connexion unifiée.**
> - `POST /api/auth/login` : identifiant = **e-mail uniquement** (le login par téléphone est retiré, CHG-2/D18 — PO-1). Réponse inchangée : `{ user: { id, displayName, email, role, memberSince } }` — `role` pilote la **redirection** côté front (user → `/dashboard`, admin → `/admin`) depuis la page unique `/login`.
> - `GET /api/auth/me` : inchangé (inclut `role`) — sert à la redirection initiale par rôle (rafraîchissement de page / garde `RequireAuth`).
> - **Aucune route `/admin/login` n'existe côté API** (c'était un path front) : `GET`/`POST /api/admin/login` → `404`. Le front supprime sa page `/admin/login` (CA-AUTH04-02) — c'est un chantier front, pas API.
> - CA-AUTH04-05 : un utilisateur non-admin appelant une route admin reçoit **403** (`FORBIDDEN`) — comportement déjà contractuel §1.3, inchangé.
>
> **E2 — Cycle de commande (livraison).**
> - `orders.status` : énumération **11 valeurs** (`CREATED, PAYMENT_PENDING, PAID, PRODUCT_WAITING, PRODUCT_RECEIVED, PREPARING, IN_DELIVERY, DELIVERED, COMPLETED, PAYMENT_FAILED, CANCELLED`). Les valeurs `WAITING_PAYMENT`, `WAITING_SELLER_PAYMENT`, `SELLER_PAID` **disparaissent** (mapping V2→V3 : Annexe A.3, DDL 003).
> - Le **détail commande** (`GET /api/orders/:id`, `GET /api/admin/orders/:id`, et la réponse de `POST /api/orders`) inclut désormais `status` + **`events[]`** (journal append-only `order_events`, tri chronologique `created_at, id`) : alimente la page « Suivre mon colis » / « Suivre ma vente » (timeline + historique daté, CA-ORD05/-06).
> - **4 nouvelles routes admin de transition** (POST, toutes en transaction) : `mark-product-received`, `start-delivery`, `mark-delivered`, `cancel` ; `confirm-payment` conservée avec précondition changée. Précondition « statut requis » non satisfaite → **409** `{ error: { code: 'INVALID_TRANSITION' | 'ORDER_NOT_ALLOWED', message, currentStatus } }` (format d'erreur uniforme §1.1 étendu de `currentStatus`).
> - `POST /api/admin/orders/:id/pay-seller` → **renommée** `POST /api/admin/orders/:id/seller-payout` (l'ancienne route répond `410 GONE`). Précondition : statut ∈ {`PRODUCT_RECEIVED`…`COMPLETED`} ; **ne modifie pas** `orders.status` (CHG-5).
> - Anti-double-commande : l'index unique couvre les statuts **actifs `CREATED`..`DELIVERED`** (libéré par `COMPLETED`/`PAYMENT_FAILED`/`CANCELLED` — DDL 003).
> - Notifications : **6 valeurs** ajoutées à `notification_type` (DDL 003) ; **5 nouveaux événements émis** (N9–N13, §5). Le badge front se branche uniquement sur `unreadCount`/`unreadNotifications` (inchangé) ; les types servent au libellé/icône et au lien « Suivre mon colis ».
> - Confidentialité (CA-ORD09) : les `events[]` (dont les notes admin, PO-4) sont exposés à l'acheteur, au vendeur **et** à l'admin ; **aucune coordonnée privée** (`name`/`email`/`phone`/adresse) entre acheteur et vendeur (RG-ORD-6). `deliveryCarrier`/`trackingNumber` : visibles de l'acheteur, du vendeur **et** de l'admin (aucune donnée personnelle).
>
> **⚠️ Incohérences S1/S2/tâche signalées (tranchées ici — voir le rapport `@api-designer`)** : destinataires des notifications N9/N13 (S1 : **vendeur** — adopté ; architecture §11.7 : acheteur) ; `actor_id` présent dans le schéma S1 §5.2 mais **absent du DDL 003** → le contrat expose `actor`, pas `actorId` ; consigne « 4 types » vs 6 valeurs dans le DDL → les 6 sont documentées (§2.6, §5), 4 émises sur les étapes « colis ».
>
> ## Évolution V4 — changements de contrat (encart, v2.1)
>
> **E3 — Étape commande « Prête / Expédiée » (`SHIPPED`).**
> - `orders.status` : énumération **12 valeurs** (`CREATED, PAYMENT_PENDING, PAID, PRODUCT_WAITING, PRODUCT_RECEIVED, PREPARING, SHIPPED, IN_DELIVERY, DELIVERED, COMPLETED, PAYMENT_FAILED, CANCELLED`). La nouvelle valeur `SHIPPED` s'insère **entre `PREPARING` et `IN_DELIVERY`**.
> - **Nouvelle route admin** : `POST /api/admin/orders/:id/mark-shipped` (aucun corps, transaction) — `PREPARING → SHIPPED`, event `(PREPARING → SHIPPED, admin)`, admin_action `order.shipped`, notification **acheteur** N11bis `order_shipped` (« Votre colis est prêt »).
> - `start-delivery` : la garde passe de `status ≠ PREPARING` à **`status ≠ SHIPPED`** — le départ en livraison n'est plus possible depuis `PREPARING` (il faut d'abord `mark-shipped`).
> - `mark-delivered` : **en plus** des 2 events, bascule `seller_payouts.status PENDING → DUE` dans la même transaction (le dû vendeur devient **payable**, il n'est **pas** payé automatiquement).
> - Anti-double-commande : index partiel mis à jour avec `'SHIPPED'` (statuts actifs `CREATED`..`DELIVERED`, Annexe A.4 — DDL 007).
>
> **E4 — Revente vendeur refondue (`DUE`).**
> - `seller_payouts.status` : énumération **3 valeurs** `PENDING → DUE → PAID`. Le payout est créé **`PENDING`** au `confirm-payment`, passe **`DUE`** (« À payer ») au `mark-delivered`, et **`PAID`** uniquement au `seller-payout`.
> - `POST /api/admin/orders/:id/seller-payout` : précondition refondue — `orders.status ∈ {DELIVERED, COMPLETED}` (commande **livrée**) **et** `seller_payouts.status = 'DUE'`. Un payout encore `PENDING` sur une commande non livrée → `409 ORDER_NOT_ALLOWED` (+ `currentStatus`) ; payout absent ou déjà `PAID` → `409 PAYOUT_NOT_PENDING` (rétrocompat §1.2). **Ne modifie pas** `orders.status` ni `order_events` (CHG-5).
> - Filtre liste admin `GET /api/admin/orders?payout=` : valeurs **`pending`·`due`·`paid`** (minuscules, normalisées en enum côté serveur).
> - `GET /api/admin/stats` : + `payoutsDue`, `payoutsDueAmount` (somme des dûs `DUE`) et `orders` (répartition par statut, dont `shipped`).
> - Notifications : **1 valeur** ajoutée à `notification_type` — `order_shipped` (N11bis, acheteur, §5).
>
> ## Évolution V4-Accueil — changements de contrat (encart, v2.2)
>
> **E5 — Catalogue de découverte (page d'accueil « Accueil V3 »).**
> - `GET /api/products` : query params étendus (**tous optionnels, rétrocompatibles** — aucun paramètre existant n'est modifié ; `GET /api/products` sans paramètre répond **exactement** comme avant) : `subcategory_id`, `price_min`, `price_max`, `condition`, `location`, `brand`, `ids`, `not_in`, `section` (nouvel enum de 6 sections), et `sort` étendu avec **`popular`**. Réponse `ProductCard` enrichie : `oldPrice` (int|null), `viewCount` (int ≥ 0), `brand` (string|null) — champs ajoutés, les consommateurs existants les ignorent (§2.2).
> - **2 nouveaux endpoints publics** : `GET /api/products/locations` (valeurs distinctes de localisation des produits `AVAILABLE`, alimente la liste déroulante du filtre — PO-ACC-2) et `GET /api/banners` (carrousel — D-ACC-1). **1 nouvel endpoint connecté** : `POST /api/products/:id/contact` (formulaire interne « Contacter le vendeur » → notification `product.contact` au vendeur — PO-ACC-1 option b ; le téléphone vendeur n'est **jamais** exposé).
> - `GET /api/products/:identifier` (fiche) : **incrémente `view_count` de +1 à chaque accès réussi** (D-ACC-3, CA-ACC-58) ; la fiche expose `viewCount` (+ `oldPrice`).
> - `POST`/`PUT /api/products` : nouveau champ multipart optionnel `oldPrice` (RG-PROD-2) ; réponses `OwnerProduct`/`ProductAdmin` exposent `oldPrice` et `viewCount`.
> - `notification_type` : **1 valeur ajoutée** — `product.contact` (N14, vendeur, §5) — via **DDL 008**.
> - La liste déroulante « localisation » du front est alimentée par l'endpoint dédié — aucune valeur codée en dur côté client (D-ACC-5, CA-ACC-73).
>
> Les **arbitrages détaillés** (sémantique des sections, `ids`, `not_in`, algorithme `discover`, propagation `view_count`, statuts contactables, etc.) figurent au **§3.2 quater** et au **§7.2**.

---

> ## Évolution V5 — changements de contrat (encart, v2.4)
>
> **V5.1 — Tri « Pertinence » (`sort=relevance`) — NOUVEAU (PO-V5-18, CA-V5-145c).**
> - `GET /api/products` accepte une **5ᵉ valeur** de `sort` : `relevance`. Toute autre valeur reste `400 VALIDATION_ERROR`.
> - Le score est **local et déterministe**, calculé en SQL, **distinct de `recent`** :
>   `score = min(50, remise%) / 2 + min(200, view_count) / 200 × 30 + max(0, 30 − âge_en_jours)`, trié `score DESC, p.id`.
> - **Stabilité** : le tie-break `p.id` garantit deux réponses identiques à données égales. Un article ancien et populaire peut donc remonter **avant** un article neuf et jamais vu — c'est l'effet recherché, et la différence avec `recent` est testée.
> - **Aucune modification des autres tris**, ni des réponses existantes : l'**absence** de `relevance` ne change rien (P5). LAjout est purement additif.
>
> **V5.2 — `GET /api/products/suggestions` — NOUVEAU (PO-V5-18, CA-V5-136).**
> - Route de **lecture seule**, en `public` : `{ q }` → `{ q, categories[], brands[], products[] }`.
> - `q` est **obligatoire et ≥ 2 caractères** : absent ou trop court → `400 VALIDATION_ERROR`. C'est la traduction serveur de « pas de requête pour une chaîne de 1 caractère » (CA-V5-136d) ; le `debounce ≥ 200 ms` et l'annulation des réponses obsolètes restent des responsabilités **front**.
> - `products[]` contient des `ProductCard` (§2.2) **strictement identiques** à celles du catalogue (même sérialiseur) : le front peut afficher la tuile telle quelle. Aucun tri « pertinence » ici — la pertinence est un ordre de catalogue, pas un ordre de saisie ; les produits sont triés `view_count DESC, p.id`.
> - **Plafond : 10 éléments au TOTAL**, répartis `6 produits + 2 catégories + 2 marques`. Le plafond n'est pas arbitraire : il est la somme de ces trois bornes.
> - Les suggestions ne portent que des données **publiques** (aucune coordonnée vendeur, aucun prix de commande) — CA-V5-018 : toute valeur affichée est échappée.
> - **Route déclarée AVANT `/api/products/:slug`** : `GET /api/products/suggestions` est résolu comme suggestions, jamais comme une fiche au slug `suggestions`.
> - Budget : **2 requêtes**, indépendantes de la taille du catalogue.
>
> **V5.3 — `DELETE /api/admin/products/:id` — NOUVEAU (C4, D7, CA-V5-056…065).**
> - Suppression **logique** : `products.deleted_at` est renseigné, la ligne n'est pas supprimée.
> - Réponses : **`204` sans corps** (succès, y compris suppression répétée — idempotence) · **`404 PRODUCT_NOT_FOUND`** (id inexistant) · **`409 PRODUCT_HAS_ACTIVE_ORDER`** (commande active).
> - Écrit dans la **même transaction** : le `UPDATE`, la notification in-app `article_deleted` (au vendeur) et la trace `admin_actions.action = 'product.delete'`. Si la transaction avorte, **aucun** de ces effets n'existe (P8).
> - Le produit supprimé **disparaît de toutes les listes publiques** et de `GET /api/products/:slug` (`404 PRODUCT_NOT_FOUND`), mais **reste lisible dans les commandes réelles** qui le concernent (exemption historique `PRODUCT_SELECT_HISTORY`, `architecture-v5.md` §4.3 catégorie C) : une commande passée ne doit jamais devenir inexplicable.
> - `GET /api/admin/products` expose un champ **additif** `hasActiveOrder: boolean` (PO-V5-15) : il permet à l'UI de désactiver « Supprimer » sans requête par ligne (RG-V5-08 — aucun bouton inexécutable). **Strictement additif** : aucun autre champ n'est modifié, et `hasActiveOrder` n'est nulle part ailleurs.
> - ⚠️ `?action=product.delete` est désormais **accepté** par `GET /api/admin/history` : un filtre ne doit jamais exclure une valeur que l'application écrit réellement.
>
> **V5.4 — Rate limiting (D8, CA-V5-084/085).**
> - **Authentification** : `20 requêtes / 10 min / IP` sur `/api/auth/*`. Limite inchangée depuis V4.
> - **Global** : `300 requêtes / min / IP` sur `/api/*`, fenêtre fixe,compteur en mémoire **par instance** (PO-V5-17 : 1 instance assumée).
> - Dépassement → **`429`** `{ "error": { "code": "RATE_LIMITED", … } }`. La réponse est identique pour tous les cas de dépassement.
> - **Exemptions** : `/health` et `/api/health` ne sont **jamais** limités (une sonde de déploiement ne doit pas pouvoir tomber) ; `/uploads/**` (statique) est hors périmètre.
> - En `NODE_ENV=test`, le limiteur est **bypassé** — la suite ne peut donc pas mesurer le 429 par HTTP (elle appelle la fabrique directement, `test/perf-v5.test.ts`).
>
> **V5.5 — `Cache-Control` (PO-V5-07, CA-V5-094).**
> - `public, max-age=60, stale-while-revalidate=120` sur **`GET /api/categories`** et **`GET /api/banners`** uniquement.
> - `private, no-store` sur **toutes** les autres routes `/api/*`, y compris les réponses authentifiées : une donnée liée à une session ne doit jamais être servie depuis un cache partagé.
> - L'en-tête ne modifie **aucune** forme de réponse (P5) : deux appels successifs rendent le même corps et le même statut.
>
> **V5.6 — E-mails transactionnels (C1, §3.5.1).**
> - 9 déclencheurs / 11 envois, tous **après COMMIT**, tous **best-effort** : un échec SMTP ne fait jamais échouer l'action métier, qui répond déjà `2xx`.
> - **Jamais sur le chemin de la réponse (CA-V5-014 / E-13)** : l'endpoint répond **dès le commit confirmé**, l'envoi part ensuite en tâche de fond. Un `await` sur l'envoi SMTP ferait dépendre la latence HTTP du serveur de messagerie : mesuré, cela donnait **p95 305 ms contre 6 ms** de référence, soit **+4900 %** pour un critère qui tolère **+15 %**. Test de non-régression : `emails.test.ts` (« un envoi LENT ne retarde pas la réponse de l'endpoint »), vérifié par mutation (réintroduire l'`await` le fait échouer).
> - **Contrepartie assumée** : un effet encore en vol est **perdu si le processus s'arrête** (redéploiement, `SIGTERM`) entre le commit et l'envoi. La fenêtre est courte — l'envoi démarre à l'instant du commit — mais elle **n'est pas nulle**. Correctif prévu au-delà de V5 : table *outbox* écrite dans la **même** transaction que l'action, vidée ensuite par un worker ; l'envoi redevient durable **sans ajouter de latence** à la réponse. Dette tracée, pas un oubli.
> - `MAIL_ENABLED=false` → **aucun** envoi, l'action métier et les notifications in-app sont **inchangées**. Usine : mail disabled = feature off, pas feature cassée.
> - Le compte du destinataire est résolu **par identifiant en base** (CA-V5-011), jamais depuis le corps de requête ; si le compte a disparu, l'envoi est ignoré **sans erreur**.
> - Aucune coordonnée privée d'un tiers dans un email (prix de commande d'un autre acheteur, e-mail/téléphone d'un tiers) — seules les données de la commande propre au destinataire.
> - Configuration : `MAIL_ENABLED`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`, `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_FROM`, `SITE_URL`. En production, `MAIL_ENABLED=true` **sans** hôte/identifiant/`MAIL_FROM` fait **refuser le démarrage** (erreur de configuration visible au déploiement, pas un silence à l'exécution).
>
> **V5.7 — Durcissement administration (C6).**
> - Les 19 routes `/api/admin/*` exigent le rôle `admin` : anonyme → `401 UNAUTHENTICATED`, utilisateur simple → `403 FORBIDDEN`. Le contrôle précède toute lecture métier : un identifiant inexistant donne le **même** `403` qu'un identifiant valide (§1.4, pas de divulgation par le code de statut).
> - `POST /api/admin/orders/:id/pay-seller` → `410 GONE` (inchangé, §3.6).

> ## Évolution V6 — WhatsApp, preuve de paiement, numéros +221 (encart, v2.5)
>
> **V6.1 — Téléphone normalisé, Sénégal par défaut.**
> - `registerSchema.phone` et `shippingSchema.phone` passent par `normalizePhone()` (`server/src/utils/phone.ts`) : la réponse expose une forme canonique (`+221771234567`, `+2250700000000`, `+33612345678`).
> - Règles : `77 123 45 67`, `771234567`, `0771234567`, `00221…`, `221…` → `+221…` ; **tout indicatif étranger explicite est préservé** (`+225`, `+33`, …). Une saisie inexploitable → `400 VALIDATION_ERROR`, message « Numéro WhatsApp invalide… ».
> - Les libellés UI deviennent « Numéro WhatsApp » (inscription et checkout) ; le champ est prérempli `+221 ` côté web.
> - Les comptes existants restent valides : la normalisation ne s'applique qu'aux nouvelles écritures. La migration `014_phone_221_migration.sql` corrige uniquement les anciens `+225` **manifestement sénégalais** (9 chiffres, mobile `7…`), journalise chaque décision dans `phone_migration_audit` et **ne touche jamais** un numéro ivoirien (8 ou 10 chiffres après `225`).
>
> **V6.2 — `POST /api/orders/:id/payment-proof` — NOUVEAU (acheteur propriétaire).**
> - `multipart/form-data` : `proof` (JPEG/PNG/WebP, 1 fichier, MIME vérifié par magic bytes) + `note` optionnelle (≤ 500 caractères).
> - **201** `{ proof: PaymentProof }`. La commande **reste `PAYMENT_PENDING`**, le paiement reste `PENDING`, et **le vendeur n'est pas notifié** : une preuve est une pièce, pas une validation.
> - `404 ORDER_NOT_FOUND` (commande absente ou d'un autre acheteur — non-divulgation), `409 INVALID_TRANSITION` (statut ≠ `PAYMENT_PENDING`), `400 PAYMENT_PROOF_FILE_REQUIRED` / `PAYMENT_PROOF_INVALID_TYPE`.
> - `PaymentProof` : `{ id, orderId, fileUrl, note, status: 'PENDING'|'APPROVED'|'REJECTED', rejectionReason, reviewedAt, createdAt }`. Exposé **uniquement** dans les vues acheteur et admin (jamais vendeur).
>
> **V6.3 — `POST /api/admin/orders/:id/payment-proof/:proofId/review` — NOUVEAU (admin).**
> - Corps : `{ decision: 'APPROVED'|'REJECTED', reason?, reference? }`. `REJECTED` **exige** `reason` (sinon `400 PAYMENT_PROOF_REASON_REQUIRED`).
> - `APPROVED` réutilise `confirmPaymentInTransaction` : le paiement passe réellement `PAID`, la commande passe `PRODUCT_WAITING`, le produit devient `SOLD`, le payout est créé — **puis** l'acheteur et le vendeur sont notifiés.
> - `REJECTED` laisse la commande en `PAYMENT_PENDING` (l'acheteur peut renvoyer une preuve) et le notifie.
> - Revuer une preuve déjà traitée → `409 PAYMENT_PROOF_ALREADY_REVIEWED`. Preuve inconnue → `404 PAYMENT_PROOF_NOT_FOUND`. Réponse : `{ order: AdminOrderDetail }` (avec `paymentProofs[]`).
>
> **V6.4 — Commande non payée = aucune sollicitation vendeur.**
> - `POST /api/orders` et `POST /api/orders/checkout` ne créent **plus** de notification vendeur (`article_reserved` in-app et e-mail sont supprimés). Seul l'acheteur est notifié (`order_created`).
> - Le vendeur est notifié **après validation du paiement** (`payment_confirmed_seller`, in-app + e-mail + WhatsApp si activé).
> - `notification_type` : **4 valeurs ajoutées** (`payment_proof_submitted`, `payment_proof_approved`, `payment_proof_rejected`, `payment_instructions`) — DDL `013_payment_proofs.sql`.
>
> **V6.5 — Notifications e-mail + WhatsApp indépendantes.**
> - Dispatcher unique (`notification-dispatch.service.ts`) : `Promise.allSettled` sur les canaux ; **l'échec de l'un ne bloque jamais l'autre**, et aucun échec ne fait échouer l'action métier.
> - Idempotence : table `notification_deliveries` (clé `event:entité:userId` + canal, statut `PENDING/SENT/FAILED/SKIPPED`, `attempts`, `last_error`). Rejouer une requête ne renvoie **jamais** un second message ; max **3 tentatives**.
> - WhatsApp = **Cloud API officielle Meta** uniquement (Graph `/{phoneNumberId}/messages`), timeout 8 s, numéro masqué dans les logs. `WHATSAPP_ENABLED=false` par défaut : sans token, le canal est **coupé proprement** (statut `SKIPPED`), l'e-mail continue.
>
> **V6.6 — SEO.** `web/index.html` : title/description ciblés (« ReVendsen », « revends », « revends Sénégal », « marketplace »), canonical, Open Graph, Twitter Card, JSON-LD `Organization` + `WebSite` (SearchAction). `robots.txt` exclut les pages privées ; `sitemap.xml` conserve `/` et `/catalogue` et ajoute `/shop`, `/category`. Aucune URL publique existante n'est supprimée.
>
> **V6.7 — Parrainage « Le Cercle des 10 » (2026-11-15).**
> - **`GET /api/referrals/me` — NOUVEAU (privé)** : code personnel, progression, paliers, badge et Vitrine (détail §3.8).
> - `POST /api/auth/register` : champ **`ref` facultatif** (code du parrain). Un code inconnu, mal formé ou auto-référencé est **ignoré sans erreur** : un parrainage ne doit jamais empêcher une inscription.
> - `GET /api/auth/me` : + **`referralCode`** (`string|null`) et **`ambassador: true`** *seulement* si le badge est actif.
> - `PublicUser` : + **`ambassador: true`** *seulement* si actif. Aucun champ `false` n'est ajouté : le contrat existant ne change pas (P5), et le front n'a pas à distinguer « pas ambassadeur » de « champ absent ».
> - `GET /api/products` (tri par défaut uniquement) : les articles d'un vendeur en **Vitrine active** passent devant. Les tris explicites de l'acheteur (`price_asc`, `price_desc`, `oldest`, `popular`, `relevance`) sont **inchangés** — un classement payant ne doit jamais fausser un tri choisi.
> - `POST /api/admin/products/:id/approve` : si c'est le **premier** article approuvé d'un filleul, le parrain est crédité (idempotent) — e-mail `referral_milestone` au franchissement des paliers 5 et 10, jamais à chaque article.

> ## Évolution V7 — Hébergement des vendeurs (encart, v2.7)
>
> **fusion du contrat additif v7** — source détaillée : `docs/api-v7-hebergement-vendeurs.md` (contrat **2.7 — V7 Hébergement vendeurs**, 2026-11-17). Conformément à ce document et à `docs/architecture-v7-hebergement-vendeurs.md`, **rien d'existant n'est amendé** :
>
> - **8 nouvelles routes uniquement** (§3.9) : `POST /api/subscriptions` · `GET /api/subscriptions/me` · `POST /api/storefront/listings` · `DELETE /api/storefront/listings/:id` · `GET /api/storefront/:slug` (public) · `POST /api/storefront/:slug/contact` (authentifié) · `GET /api/admin/subscriptions` · `POST /api/admin/subscriptions/:id/activate` (admin). Aucune route existante n'est modifiée, renommée ou supprimée.
> - **3 nouvelles tables** (`subscription_plans` + seed 2000/5000/10000 FCFA · 10/30/100 annonces — validés le 17/11/2026, PO-V7-01/02 ; `seller_subscriptions` ; `storefront_listings` **sans colonne `status`**) et **1 nouvel enum** `subscription_status` (`PENDING | ACTIVE | EXPIRED | CANCELLED`). **0 colonne ajoutée** aux tables existantes ; `notification_type` **inchangé** (la valeur existante `product.contact` est réutilisée pour le contact boutique, titre précisant la boutique et l'expéditeur — N15, §5).
> - **Aucun paiement, aucun cron, aucun trigger** : activation `PENDING → ACTIVE` **manuelle par un admin** (`activated_by`/`activated_at` tracés, route 8 uniquement) ; expiration **paresseuse en lecture** (30 jours glissants) ; unicité ACTIVE par vendeur via index partiel.
> - **Le quota ne porte que sur la boutique** : annonces actives dérivées de `products.status` par jointure (`PENDING|AVAILABLE|RESERVED`, `deleted_at IS NULL`), contrôlé **uniquement** à l'ajout (`POST /api/storefront/listings`). `POST /api/products`, catalogue, fiche, commandes, checkout, paiement, payouts, commission 10 %, parrainage / `vitrine_until` : **aucun changement de comportement**.
> - **Slugs** : unicité à vie par vendeur (tous statuts, normalisation serveur), 20 mots réservés, format `^[a-z0-9]+(?:-[a-z0-9]+)*$` (3–40). Boutique publique **non divulgatrice** : `404 NOT_FOUND` identique pour slug inconnu / `PENDING` / `EXPIRED` / `CANCELLED`. Exception assumée : `403 NOT_PRODUCT_OWNER` sur la route d'ajout pour un produit d'autrui (§1.4).
> - **Codes d'erreur nouveaux** : `SLUG_RESERVED`, `INVALID_SUPERSEDES`, `SUBSCRIPTION_REQUIRED`, `SUBSCRIPTION_ALREADY_ACTIVE`, `STOREFRONT_QUOTA_EXCEEDED`, `STOREFRONT_ALREADY_LISTED`, `NOT_PRODUCT_OWNER`, `PLAN_NOT_FOUND`, `INVALID_STATUS` (réutilisés : `SLUG_TAKEN`, `CONTACT_SELF`, … — §3.9). Mapping `23505` traité **dans le service** V7, `middleware/errors.ts` inchangé.
> - **`POST /api/products/:id/contact` (v2.4) n'est ni modifié ni réactivé** : le contact V7 est la route dédiée et strictement boutique-scopée `POST /api/storefront/:slug/contact` (rate limit dédié `storefront-contact`, 10 req / IP / 10 min).
> - **Implémentation** : la migration `019_storefront.sql` doit être appliquée **avant** le code en prod (`RUN_MIGRATIONS=false` en prod). Le feature flag recommandé `FEATURE_STOREFRONT` n'est **pas** implémenté en V7 initiale (aucun fichier de configuration existant édité) — l'ordre migration → code reste obligatoire.
> - **Cahier des charges** : `docs/cahier-des-charges-v7-hebergement-vendeurs.md` (45 critères CA-V7-xxx, validés le 17/11/2026).
> ## Évolution V8 — Hébergement Boutique (encart, v2.8)
>
> **fusion du contrat additif V8** — source détaillée : `docs/architecture-v8-hebergement-boutique.md` (18/11/2026, décisions V8-D1…D10 et arbitrages §14.A/B/C/D/F/G **tous clos le 18/11/2026**). **Additif strict** : **0 route supprimée, 0 renommée ; 0 colonne ajoutée** aux tables `users`/`products`/`orders`/`payments`/`notifications`/`subscription_plans`/`storefront_listings`/`admin_actions`/`order_events` ; **0 trigger, 0 valeur d'enum** (`notification_type` inchangé — le bilan n'est pas une notification). Seule exception actée (V8-D2, consigne chef de projet) : publication directe `AVAILABLE` à l'insert pour les vendeurs éligibles.
>
> - **Publication directe (V8-D2)** — `POST /api/products` : un article est créé `AVAILABLE` (au lieu de `PENDING`) **uniquement** si le vendeur a un abonnement `ACTIVE` non expiré (`ends_at > now()`) **ET** un téléphone `+221 7XXXXXXXX` (format strict, `users.phone ~ '^\+2217[0-9]{8}$'`). Sinon `PENDING` (comportement V7/V5 inchangé). Trace exhaustive dans `auto_approved_products` (1 ligne/produit, R2 retenue §14.A) — **jamais** dans `admin_actions` ; **aucune notification vendeur** (V6.4) ; les admins consultent `GET /api/admin/auto-approvals`. Rollback par feature flag `AUTO_APPROVE_V8=false` (retour `PENDING`, sans migration).
> - **Badges de palier (V8-D3)** — dérivés en **lecture** (jamais stockés) : `Atelier`→`pro`, `Boutique`→`verifiee`, `Découverte`→`boutique` (`status='ACTIVE' AND ends_at > now()`). Exposés en champ additif `sellerBadge` (`'pro'|'verifiee'|'boutique'|null`) sur la carte catalogue, la boutique publique et la fiche produit. Révocation paresseuse à l'échéance, **sans job, sans écriture**.
> - **Boost du tri par défaut (V8-D4)** — uniquement si `section` absente et `sort === 'recent'` : `Atelier (1) → Boutique (2) → Découverte (3) → Vitrine (EXISTS vitrine) → reste`, puis `created_at DESC, id`. **Les tris explicites sont inchangés** (`price_asc`, `price_desc`, `popular`, `relevance`, `oldest`, sections `promotions`/`best_offers`/`discover`). Classé après payants : la Vitrine passe **après** le payant, avant les non-payants (CA-V8-033).
> - **Boutique brandable (V8-D5)** — `storefront_profiles` (1:1 avec le vendeur) : `logo_path`, `banner_path`, `public_description` (≤ 500 graphèmes, `Intl.Segmenter`), `collecte_address` (10–500, **INTERNE**). **`collecte_address` n'apparaît JAMAIS en surface publique** ; elle est visible UNIQUEMENT du propriétaire (`GET/POST/PUT /api/storefront/profile`) et de l'admin (file `GET /api/admin/subscriptions`). Le branding public n'est exposé sur `GET /api/storefront/:slug` que si l'abonnement est `ACTIVE`.
> - **Expiration (V8-D6)** — comportement V7 inchangé : boutique publique → 404, annonces conservées (jamais masquées), badges/boosts disparaissent (dérivés en lecture).
> - **Bilan mensuel au 1er (V8-D7)** — `GET|POST /api/cron/monthly-report` (Vercel Cron `0 6 * * *`) + job in-process dev (`DISABLE_CRON=true` neutralise). Dispatch UTC : `1er = bilan du mois écoulé`, `dernier jour = relevé des vues`, sinon `noop`. Calcul unique (`storefront-reports.service.ts`, P12) : vues (delta vs relevé), ventes PAID, CA brut/net (`seller_amount`), panier moyen, meilleur article (ventes du mois, tie-break `view_count`), conversion. **Idempotence stricte** : `monthly_metrics` (PK `(subscription_id, period)`, `email_status NULL → SENT|FAILED`) + anti-doublon `notification_deliveries` (`storefront-monthly-report:<userId>:YYYY-MM`). E-mail `storefront_monthly_report` avec **PDF joint** (pdfkit, A4, aucun PII).
> - **Activation admin + référence de paiement (V8-D8)** — `POST /api/subscriptions` accepte (et **impose côté front**) `paymentMethod` (`wave|orange_money|virement`) et `paymentReference` (trim, 4–64, regex `^[A-Za-z0-9][A-Za-z0-9 .\-_/]{2,62}$`). ⚠️ **Divergence consignée (DEFIANCE)** : l'obligation stricte côté API casserait les suites V7 existantes (`POST /api/subscriptions` sans référence) — la validation est **stricte dès qu'une valeur est fournie** (codes `INVALID_PAYMENT_METHOD` / `INVALID_PAYMENT_REFERENCE`), l'absence reste tolérée (`NULL` = legacy, activable, CA-V8-053) ; le front doit rendre les champs obligatoires (phase `@frontend`). La **référence n'est jamais publique** : visible de l'admin en file (`GET /api/admin/subscriptions`) et du propriétaire, nulle part ailleurs ; jamais journalisée en clair.
> - **Stats vendeur (V8-D7)** — `GET /api/subscriptions/me/stats` : vues totales, ventes 30 j (sur `order_events → 'PAID'`), CA brut et net (`seller_amount`), meilleur article, panier moyen, conversion (vues → ventes), historique ≤ 12 bilans (`monthly_metrics`), `isFirstReport`.
> - **3 nouvelles tables, 1 ALTER** — `storefront_profiles`, `auto_approved_products`, `monthly_metrics` (PK `(subscription_id, period)`, `order_events` non modifiée) + `seller_subscriptions` + `payment_reference varchar(64)`, `payment_method varchar(32)` CHECK (`wave`|`orange_money`|`virement`). Migration `020_storefront_v8.sql`, rejouable (`IF NOT EXISTS`), appliquée **manuellement** en prod avant tout déploiement (`RUN_MIGRATIONS=false`).
> - **Rappel J-3 (V8)** — abonnements `ACTIVE` expirant sous 3 jours → e-mail `subscription_expiry_reminder` (anti-doublon `subscription-expiry-reminder:<userId>:YYYY-MM`), best-effort, à chaque passage du cron quotidien.
> - **E-mail d'activation (V8)** — `POST /api/admin/subscriptions/:id/activate` déclenche `subscription_activated` (anti-doublon `subscription-activated:<userId>`) après le commit — aucune action métier n'en dépend.
> - **Implémentation** : migration `020_storefront_v8.sql` appliquée **avant** le code en prod (sinon toutes les routes V8 → 500). Feature flags : `AUTO_APPROVE_V8=true` (défaut, publication directe) · `CRON_SECRET` (obligatoire pour le endpoint cron — absent ⇒ `401` systématique, fail-closed) · `DISABLE_CRON=true` (tests/dev : aucun job in-process, cron HTTP en mode `disabled`).
> - **Cahier / architecture** : `docs/cahier-des-charges-v8-hebergement-boutique.md` (75 critères CA-V8-xxx) · `docs/architecture-v8-hebergement-boutique.md` (§2 DDL, §4 publication directe, §5 badges, §6 tri, §7 branding, §8 stats, §9 PDF, §11 cron, §14 arbitrages).

## 1. Vue d'ensemble et conventions

### 1.1 Principes

- **Base URL** : le front étant servi par le même serveur Express (prod same-origin), les chemins sont **relatifs à l'origine** : `/api/...`. En dev, Vite proxy `/api` vers `http://localhost:4000`.
- **Format** : JSON (`application/json`) pour tout, **sauf** les envois de photos qui utilisent `multipart/form-data` (listing des endpoints concernés au §6).
- **Auth** : session côté serveur identifiée par **cookie HTTP-only** (`SameSite=Lax`, 7 jours, `Secure` en prod). Le client n'envoie **jamais** de token dans un header ou un body : il laisse le navigateur joindre les cookies (`credentials: 'include'` côté fetch).
- **Casse** : `camelCase` dans les JSON ; statuts et enums en `UPPER_SNAKE_CASE` (valeurs du modèle de données).
- **Montants** : entiers **FCFA** (pas de décimale). Jamais de `float` dans les payloads.
- **Dates** : ISO 8601 UTC (`2026-09-20T10:15:00.000Z`).
- **Identifiants** : `id` numériques (BIGINT → nombre JSON). Les **slugs** identifient les ressources publiques en lecture (URLs lisibles) ; les `id` identifient les mutations.
- **Format d'erreur uniforme** (tous les statuts 4xx et 5xx) :

```json
{
  "error": {
    "code": "PRODUCT_RESERVED",
    "message": "Cet article vient d'être réservé"
  }
}
```

> **Engagement de forme pour les Toasts** : le design system n'a pas de table `code` → message ; le front affiche `error.message` **tel quel** dans un `Toast`. Tout `error.message` renvoyé par l'API est donc **rédigé en français, affichable, sans détail technique** (jamais de SQL, de nom de contrainte, de stack, d'hôte ou de port). Les détails techniques vont dans les **logs serveur**, jamais dans la réponse. Invariant couvert par `test/unit-utils.test.ts` (« errorHandler — aucune fuite d'information en 5xx »), y compris pour une violation de contrainte PostgreSQL non mappée. `error.code` reste stable et sert aux **branchements logiques**, pas à l'affichage.

L'erreur de validation ajoute `details` :

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Données invalides",
    "details": [
      { "field": "price", "message": "Le prix doit être un entier entre 500 et 10 000 000 FCFA" },
      { "field": "description", "message": "La description doit contenir entre 10 et 2000 caractères" }
    ]
  }
}
```

Erreur 500 (générique, aucune fuite d'information) :

```json
{ "error": { "code": "INTERNAL_ERROR", "message": "Erreur interne du serveur" } }
```

Erreur 409 — conflit de transition de statut (routes admin V3) : le champ `currentStatus` (= `orders.status` au moment du refus) **complète** le format uniforme — l'UI affiche « action indisponible » et rafraîchit le détail (boutons déduits du `status` reçu, Annexe A.2) :

```json
{ "error": { "code": "INVALID_TRANSITION", "message": "Transition impossible : le statut actuel ne permet pas cette action", "currentStatus": "PAID" } }
```

Erreur 410 — route renommée/supprimée (V3) :

```json
{ "error": { "code": "ROUTE_DEPRECATED", "message": "Route renommée : POST /api/admin/orders/:id/seller-payout" } }
```

### 1.2 Codes de statut HTTP utilisés

| Statut | Sens |
|---|---|
| `200` | Succès (lecture, action sans création) |
| `201` | Ressource créée (`register`, `POST /api/products`, `POST /api/orders`) |
| `204` | Succès sans corps (`logout`, `DELETE /api/admin/products/:id`) |
| `400` | Entrée invalide (validation zod, enum, photos, auto-achat) |
| `401` | Non authentifié / identifiants incorrects |
| `403` | Authentifié mais rôle insuffisant (règles §1.4) |
| `404` | Ressource inexistante **ou appartenant à autrui** (politique de non-divulgation §1.5) |
| `409` | Conflit d'état métier (double commande, **transition de statut illégale**, doublon) |
| `410` | Route supprimée / renommée (ex. l'ancien `pay-seller` → `seller-payout`, V3) |
| `429` | Trop de requêtes — middleware `rateLimit` (`RATE_LIMITED`, §8 ; appliqué sur `/api/auth` et recommandé sur `/api/products/:id/contact`) |
| `500` | Erreur interne |

### 1.3 Rôles requis par groupe de routes

- **public** : aucune session requise (catalogue, fiches, login, inscription, catégories actives, photos, health).
- **user** (`requireUser`) : session valide **et `role = 'user'`**. Un admin appelant ces routes → `403 FORBIDDEN` (test de recette T04 : « l'admin ne peut pas accéder aux routes utilisateur »).
- **owner** : un cas particulier de **user** — la ressource doit appartenir au connecté (ses propres articles, ses notifications, sa commande en tant qu'acheteur **ou** vendeur). Si ce n'est pas le cas → `404` (voir §1.5), jamais `403`.
- **admin** (`requireAdmin`) : session valide **et `role = 'admin'`**. Un non-admin → `403 FORBIDDEN` (CA-AUTH02-04, CA-AUTH03-02, ré-affirmé CA-AUTH04-05 — la page unique `/login` ne change rien au refus 403 en API).
- **session (`requireAuth`)** : session valide, `user` **ou** `admin` (réservé à `POST /api/auth/logout`, `GET /api/auth/me` et `GET /api/orders/:id` — l'accès admin au détail commande est autorisé, CA-ORD05-06).

Middlewares serveur (miroir `architecture.md` §6.1) : chaque route embarque son garde **côté serveur** — le front garde seulement l'UX.

### 1.4 `403` vs `404` — politique de non-divulgation

| Situation | Statut | Justification |
|---|---|---|
| Rôle insuffisant (user sur route admin, admin sur route user) | `403 FORBIDDEN` | L'utilisateur est identifié ; le refus de rôle est assumé (CA-AUTH02-04). |
| Ressource privée **d'autrui** (produit d'un autre vendeur, commande d'un autre acheteur, notification d'un autre user) | `404 NOT_FOUND` | Ne pas révéler l'existence de la ressource ni de son propriétaire (§9.3, T22). |
| Ressource inexistante | `404 NOT_FOUND` | Même payload que ci-dessus, indistinguable. |
| Produit d'un **autre vendeur** sur `POST /api/storefront/listings` (**V7**) — **exception assumée** (arbitrage chef de projet 17/11/2026) | `403 NOT_PRODUCT_OWNER` | Le demandeur est **authentifié** et le produit lui est déjà connu via le catalogue public. Partout ailleurs, `404 NOT_FOUND` s'applique (ressource d'autrui / boutique `PENDING`/`EXPIRED`/`CANCELLED`/inconnue sur `GET /api/storefront/:slug` et `POST …/:slug/contact` — payload unique, §3.9). |

### 1.5 Pagination et filtrage (convention commune)

- Paramètres : `page` (≥ 1, défaut `1`), `per_page` (1..48, défaut `12`, sauf mention contraire).
- Réponse paginée — schéma uniforme :

```json
{
  "items": [ /* éléments de la page */ ],
  "page": 1,
  "perPage": 12,
  "total": 34,
  "totalPages": 3
}
```

- Recherche texte : paramètre `q` ; match sur le **nom** de l'article, insensible à la casse (`ILIKE '%q%'`, index trigram, D12).
- Un `per_page` hors bornes, un `page` invalide, un `sort` inconnu → `400 VALIDATION_ERROR` (pas de correction silencieuse).
- Un filtre sans résultat renvoie `200` avec `items: []` (jamais de `404` pour une liste vide).
- **Paramètres de liste (CSV)** (V4-Accueil) : `ids` et `not_in` sont des listes de nombres séparés par des virgules, p.ex. `ids=42,7,123`. Tout élément non numérique → `400 VALIDATION_ERROR` (champ fautif dans `details`). Conventions de détail au §3.2.
- **Mode `ids`** (V4-Accueil) : quand `ids` est présent, la pagination est **neutralisée** (`page`/`per_page` ignorés) et tous les autres paramètres de filtre/tri/section sont ignorés ; la réponse conserve l'enveloppe paginée pour rétrocompatibilité (`page: 1`, `perPage` = nombre d'éléments retournés). §3.2.

### 1.6 Sérialisation — RG 7.7 (confidentialité)

L'API expose **trois vues** d'un utilisateur :

| Vue | Champs | Utilisée dans |
|---|---|---|
| `PublicUser` | `id`, `displayName`, `memberSince` (année d'inscription), `sales` (nb d'articles `SOLD`, **vendeur uniquement**), `ambassador` (**présent et `true` seulement si le badge est actif**, jamais `false` — §3.8) | Catalogue, fiche article, commandes côté acheteur |
| `SelfUser` | `id`, `displayName`, `name`, `email`, `phone`, `role`, `memberSince`, `createdAt`, `referralCode` (`string|null`, code personnel — §3.8), `ambassador` (idem `PublicUser`) | `GET /api/auth/me`, réponse de register |
| `AdminUser` | tout ci-dessus + `productCount`, `orderCount` | routes admin |

- **Jamais** de `name`, `email`, `phone` dans les vues `PublicUser` (T22 : les inspecteurs JSON catalogue/fiche/commandes doivent constater leur absence).
- L'acheteur et le vendeur d'une commande ne voient chacun que la vue `PublicUser` de l'autre (jamais coordonnées — V1 §28).
- La **référence de paiement** de l'acheteur est visible par l'acheteur et par l'admin, **pas par le vendeur** (§3.5, sécurité).

---

## 2. Modèles de ressources (schémas JSON réutilisés)

### 2.1 `PublicUser` (vendeur / partie opposée)

```json
{
  "id": 8,
  "displayName": "JeanMarc",
  "memberSince": 2025,
  "sales": 1
}
```

`sales` présent sur les vendeurs (réputation D2) ; sur les acheteurs vus par le vendeur (`GET /api/orders/:id`), `sales` est omis — voir §3.5.

### 2.2 `ProductCard` (carte catalogue)

```json
{
  "id": 42,
  "name": "iPhone 13 128 Go",
  "slug": "iphone-13-128-go",
  "price": 250000,
  "oldPrice": 300000,
  "viewCount": 14,
  "brand": "Apple",
  "location": "Abidjan, Cocody",
  "condition": "Très bon état",
  "createdAt": "2026-09-18T09:00:00.000Z",
  "image": { "id": 88, "url": "/uploads/products/5f9e8c2a-....jpg" },
  "category":  { "id": 3, "name": "Électronique", "slug": "electronique" },
  "subcategory": { "id": 13, "name": "Téléphones & tablettes", "slug": "electronique-telephones" }
}
```

`image` = photo principale (`is_primary`), `null` si aucune (ne doit pas arriver : 1 photo minimum garantie par l'API, §3.3 POST). `condition` ∈ enum §2.6.

**Champs ajoutés (V4-Accueil, rétrocompatibles)** :
- `oldPrice` : int FCFA ou `null` — ancien prix barré (`products.old_price`, RG-PROD-2). Toujours présent dans le JSON ; le front n'affiche barré/badge que si `oldPrice > price` (RG-PROD-4/7).
- `viewCount` : int ≥ 0 — compteur de consultations (`products.view_count`, D-ACC-3). Affichage optionnel côté carte (CA-ACC-28).
- `brand` : string ≤ 100 ou `null` — utile pour la recherche/filtre marque (CA-ACC-45/49).

### 2.3 `ProductDetail` (fiche publique)

```json
{
  "id": 42,
  "name": "iPhone 13 128 Go",
  "slug": "iphone-13-128-go",
  "description": "Téléphone en très bon état, batterie 89 %.",
  "condition": "Très bon état",
  "price": 250000,
  "oldPrice": 300000,
  "viewCount": 142,
  "location": "Abidjan, Cocody",
  "status": "AVAILABLE",
  "reservedUntil": null,
  "category":  { "id": 3, "name": "Électronique", "slug": "electronique" },
  "subcategory": { "id": 13, "name": "Téléphones & tablettes", "slug": "electronique-telephones" },
  "images": [
    { "id": 88, "url": "/uploads/products/5f9e8c2a-....jpg", "isPrimary": true, "position": 1 },
    { "id": 89, "url": "/uploads/products/7b1a4d0f-....jpg", "isPrimary": false, "position": 2 }
  ],
  "brand": "Apple",
  "model": "iPhone 13",
  "ageYears": 1,
  "defects": null,
  "accessories": "Chargeur d'origine",
  "notes": null,
  "seller": { "id": 3, "displayName": "Aicha123", "memberSince": 2026, "sales": 2 },
  "createdAt": "2026-09-18T09:00:00.000Z",
  "updatedAt": "2026-09-20T10:00:00.000Z"
}
```

- `status` ∈ `AVAILABLE | RESERVED | SOLD` sur la fiche publique (les autres statuts ne sont **jamais** exposés publiquement — un `PENDING`/`REJECTED` demandé par slug répond `404`).
- `reservedUntil` : `null` sauf si `status = RESERVED` (badge « Réservé » + compte à rebours, CA-CAT03-03).
- `seller` est une `PublicUser` complète. **Aucune coordonnée** (T22).
- `oldPrice` (V4-Accueil) : int FCFA ou `null` — voir §2.2. `viewCount` (V4-Accueil) : int ≥ 0 — valeur **post-incrément** de la consultation courante (§3.2, CA-ACC-58).

### 2.4 `OwnerProduct` (fiche côté propriétaire — « Mes articles » / réponse POST-PUT)

Même forme que `ProductDetail`, augmentée des champs de modération :

```json
{
  "id": 42,
  "name": "iPhone 13 128 Go",
  "slug": "iphone-13-128-go",
  "description": "...",
  "condition": "Très bon état",
  "price": 250000,
  "oldPrice": null,
  "viewCount": 142,
  "location": "Abidjan, Cocody",
  "status": "PENDING",
  "rejectionReason": null,
  "approvedAt": null,
  "reservedUntil": null,
  "category": { "id": 3, "name": "Électronique", "slug": "electronique" },
  "subcategory": { "id": 13, "name": "Téléphones & tablettes", "slug": "electronique-telephones" },
  "images": [
    { "id": 88, "url": "/uploads/products/5f9e8c2a-....jpg", "isPrimary": true, "position": 1 }
  ],
  "brand": "Apple", "model": "iPhone 13", "ageYears": 1,
  "defects": null, "accessories": "Chargeur d'origine", "notes": null,
  "createdAt": "2026-09-18T09:00:00.000Z",
  "updatedAt": "2026-09-20T10:00:00.000Z"
}
```

- `status` ∈ les 5 valeurs (dont `REJECTED`) ; `rejectionReason` **obligatoirement non nul si** `status = REJECTED` (affiché à l'utilisateur, CA-SELL02-02) ; `approvedAt`/`approvedBy` renseignés quand `AVAILABLE` (D4).
- `condition` ∈ enum identique.
- **V4-Accueil** : `oldPrice` (int FCFA ou `null` — RG-PROD-2) et `viewCount` (int ≥ 0 — D-ACC-3, incrémenté sur la fiche publique, jamais décrémenté).

### 2.5 `ProductAdmin` (fiche admin)

Forme `OwnerProduct` + `owner` en vue `AdminUser` (l'admin voit tout, §7.7) ; les listes admin affichent « Utilisateur #id » (= `owner.id`) conformément à la maquette. Inclut donc `oldPrice` et `viewCount` (V4-Accueil, hérités de `OwnerProduct`).

### 2.6 Enums métier (valeurs exactes, invariantes)

| Champ | Valeurs |
|---|---|
| `condition` | `Neuf` · `Très bon état` · `Bon état` · `Correct` · `À réparer` |
| `products.status` | `PENDING` · `AVAILABLE` · `RESERVED` · `SOLD` · `REJECTED` (D4) |
| `orders.status` | `CREATED` · `PAYMENT_PENDING` · `PAID` · `PRODUCT_WAITING` · `PRODUCT_RECEIVED` · `PREPARING` · `SHIPPED` (V4) · `IN_DELIVERY` · `DELIVERED` · `COMPLETED` · `PAYMENT_FAILED` · `CANCELLED` (DDL 003/007) — libellés UI et matrice des transitions : **Annexe A** |
| `payments.method` | `MOBILE_MONEY` · `CASH` · `BANK_TRANSFER` · `OTHER` (D1) |
| `payments.status` | `PENDING` · `PAID` · `FAILED` |
| `seller_payouts.status` | `PENDING` · `PAID` |
| `notifications.type` | `article_submitted` · `article_approved` · `article_rejected` · `order_created` · `payment_confirmed` · `article_reserved` · `reservation_expired` · `seller_paid` · `article_sold` (N1→N8) **+** `order_product_waiting` · `order_product_received` · `order_preparing` · `order_in_delivery` · `order_delivered` · `order_completed` (DDL 003 — émission : §5) **+** `order_shipped` (DDL 006 **V4** — N11bis) **+** `product.contact` (DDL 008 **V4-Accueil** — N14, vendeur, §3.2 quater) |
| `admin_actions.action` | `product.approved` · `product.rejected` · `payment.confirmed` · `seller.paid` |
| `subscription_status` (**V7**, DDL 019) | `PENDING` · `ACTIVE` · `EXPIRED` · `CANCELLED` — enum dédié ; `notification_type` **inchangé** (la valeur `product.contact` existante est réutilisée par le contact boutique, N15 §5) |

### 2.7 `Order` — vue acheteur (résumé, `GET /api/me/orders`)

```json
{
  "id": 51,
  "orderNumber": "CMD-000051",
  "amount": 250000,
  "commission": 25000,
  "sellerAmount": 225000,
  "status": "PAYMENT_PENDING",
  "deliveryCarrier": null,
  "trackingNumber": null,
  "product": { "id": 42, "name": "iPhone 13 128 Go", "slug": "iphone-13-128-go", "image": { "id": 88, "url": "/uploads/products/....jpg" } },
  "seller": { "id": 8, "displayName": "JeanMarc", "memberSince": 2025, "sales": 1 },
  "payment": { "id": 60, "method": "MOBILE_MONEY", "status": "PENDING", "reference": null, "paidAt": null },
  "createdAt": "2026-09-20T10:00:00.000Z"
}
```

- `orderNumber` = `CMD-` + 6 chiffres (D11, trigger DB). `amount` = prix au moment de la commande, `commission` = `floor(amount × 0,10)`, `sellerAmount` = `amount − commission` (§7.3). Montants en FCFA entiers.
- `status` ∈ enum 12 valeurs (§2.6 / Annexe A). **`CREATED` n'est jamais exposé** (état transitoire interne, D-V3-2) : après `POST /api/orders` et en lecture, la valeur minimale observée est `PAYMENT_PENDING`.
- `deliveryCarrier`/`trackingNumber` : `null` jusqu'au `start-delivery`, renseignés ensuite (≤ 100 car. chacun, optionnels — PO-6). Visibles de l'acheteur, du vendeur et de l'admin (CA-ORD05-02.4).
- `payment` réduit en liste : `method`/`status`/`reference`/`paidAt` suffisent au suivi (CA-BUY03). Le détail (§3.4) est plus complet : il ajoute `events[]`, `buyer`, `reservedUntil`.

### 2.8 `Notification`

```json
{
  "id": 77,
  "type": "article_approved",
  "title": "Votre article est en ligne",
  "message": "iPhone 13 128 Go",
  "read": false,
  "readAt": null,
  "createdAt": "2026-09-20T09:00:00.000Z"
}
```

`read` = `readAt != null`. Titres du §10 du cahier (ex. N2 « Votre article est en ligne », N4 « Paiement confirmé pour CMD-000125 »…). Les types V3 et les trames des notifications N9–N13 sont listés au §5.

### 2.9 `OrderEvent` (journal `order_events` — complète tout détail de commande)

Élément de l'historique **append-only** des changements de statut (CA-ORD06). Règle d'identité : **1 changement de `orders.status` = exactement 1 ligne** (invariant : `orders.status` ≡ `to_status` du dernier event — CA-ORD12-04). Aucune modification ni suppression possible via l'API (CA-ORD06-03) : `PUT`/`PATCH`/`DELETE` sur la ressource → `404`/`405`.

```json
{
  "id": 301,
  "fromStatus": "CREATED",
  "toStatus": "PAYMENT_PENDING",
  "actor": "system",
  "note": "Paiement en attente",
  "createdAt": "2026-09-20T10:00:00.010Z"
}
```

| Champ | Type | Contraintes |
|---|---|---|
| `id` | int | identifiant de ligne (ordre de lecture secondaire : `created_at, id`) |
| `fromStatus` | string \| `null` | statut de départ ; **`null` = event initial (création)** |
| `toStatus` | string | statut d'arrivée, ∈ enum §2.6 / Annexe A |
| `actor` | `'system'` · `'admin'` · `'user'` | `system` = enchaînement automatique / expiration ; `admin` = action admin ; `user` = réservé (aucune transition utilisateur en V3, PO-3) |
| `note` | string \| `null` | ≤ 500 car. ; **obligatoire pour `cancel`** (CA-ORD08-01) |
| `createdAt` | ISO 8601 UTC | horodatage |

**Règles de visibilité (CA-ORD09, PO-4 — par défaut : oui)** : les `events[]` — **y compris les notes admin** — sont exposés à l'acheteur, au vendeur **et** à l'admin. Contrepartie contractuelle : **RG-ORD-6** — aucune donnée personnelle (nom, e-mail, téléphone, adresse, coordonnées bancaires/Mobile Money) ne peut figurer dans une note (règle produit, vérifiée en recette T37 ; non contrôlable par validation automatique).

**Lignes d'events par transition (référence backend, D-V3-4 + V4) :** création = 2 (`NULL→CREATED`, `CREATED→PAYMENT_PENDING` — system) · `confirm-payment` = 2 (`PAYMENT_PENDING→PAID` admin, `PAID→PRODUCT_WAITING` system) · `mark-product-received` = 2 · `mark-shipped` = 1 (`PREPARING→SHIPPED` admin) · `start-delivery` = 1 · `mark-delivered` = 2 (+ bascule payout `PENDING→DUE`, sans event) · expiration = 1 (`PAYMENT_PENDING→PAYMENT_FAILED` system) · `cancel` = 1 (`PAYMENT_PENDING→CANCELLED` admin, note) · `seller-payout` = **0** (pas de changement de statut — D-V3-3/-4).

### 2.10 `Banner` (bannière du carrousel d'accueil — V4-Accueil, D-ACC-1)

```json
{
  "id": 1,
  "title": "Grande braderie de septembre",
  "subtitle": "Jusqu'à -30 % sur l'électronique",
  "imagePath": "/uploads/banners/braderie-sept.jpg",
  "linkUrl": "/search?q=braderie",
  "position": 1
}
```

| Champ | Type | Contraintes |
|---|---|---|
| `id` | int | identifiant `banners.id` |
| `title` | string | 1..120 — titre affiché (obligatoire) |
| `subtitle` | string \| `null` | ≤ 200 — sous-titre optionnel |
| `imagePath` | string \| `null` | **URL relative publique** (même convention que les photos produits : chemin renvoyé tel quel, servi par `express.static`, ex. `/uploads/banners/<fichier>` ; `null` = bannière sans image → rendu dégradé texte, CA-ACC-09) |
| `linkUrl` | string \| `null` | **lien interne relatif** vers une route réelle du site (ex. `/search?q=…`, `/category/<slug>` — CA-ACC-05) ; `null` = bannière non cliquable |
| `position` | int | ordre d'affichage ascendant (`position ASC`) ; unique en base (SMALLINT) |

- Source : table `banners` du **DDL 008** (colonnes `title`, `subtitle`, `image_path`, `link_url`, `position` UNIQUE, `active` BOOLEAN défaut `true`, `created_at` — structure §7.2 du cahier V4). Le **seed** (≥ 3 bannières actives) et le futur CRUD admin sont hors périmètre API (§2.2 cahier V4, PO-ACC-4).
- Le carrousel front consomme **uniquement** cette ressource : aucun contenu de bannière codé en dur (D-ACC-5, CA-ACC-07/73).


### 2.11 `SubscriptionPlan` (palier — lecture seule, **V7**, issu de `subscription_plans`)

```json
{ "id": 1, "name": "Découverte", "priceFcfa": 2000, "quota": 10, "durationDays": 30 }
```

| Champ | Type | Contraintes |
|---|---|---|
| `id` | int ≥ 1 | PK ; 1 = Découverte · 2 = Boutique · 3 = Atelier (IDs stables, seed migration `019`) |
| `name` | string (≤ 40) | `Découverte` · `Boutique` · `Atelier` |
| `priceFcfa` | int > 0 | Entier FCFA/mois. **Jamais codé en dur dans le front** — toujours servi par l'API (CA-V7-010) |
| `quota` | int > 0 | Annonces de **boutique** simultanées : 10 · 30 · 100 |
| `durationDays` | int = 30 | Figé en base (`CHECK (duration_days = 30)`, 30 j glissants, PO-V7-03) |

### 2.12 `Subscription` (vue propriétaire — **V7** ; `GET /api/subscriptions/me`, réponses de souscription et d'activation)

`status` ∈ `PENDING · ACTIVE · EXPIRED · CANCELLED` (enum `subscription_status`, §2.6). `PENDING → ACTIVE` : **admin uniquement** (route `§3.9(8)`). `startedAt` = `activatedAt` = `activated_at` ; `endsAt` = `activated_at + 30 jours` ; `daysRemaining` = `ceil((endsAt − now()) / 86400s)`, `0` sinon ; `activatedBy` = `users.id` de l'admin ayant activé (tracé, jamais posé ailleurs). Une souscription sans `supersedesId` après `EXPIRED`/`CANCELLED` est une ligne fraîche — le slug réservé au vendeur est récupéré automatiquement.

```json
{ "id": 41, "status": "ACTIVE", "slug": "mode-dakar",
  "plan": { "id": 1, "name": "Découverte", "priceFcfa": 2000, "quota": 10, "durationDays": 30 },
  "supersedesId": null, "startedAt": "2026-11-17T10:15:00.000Z", "endsAt": "2026-12-17T10:15:00.000Z",
  "daysRemaining": 30, "activatedBy": 7, "activatedAt": "2026-11-17T10:15:00.000Z",
  "createdAt": "2026-11-16T18:02:00.000Z" }
```

Sans abonnement : `{ "subscription": null, "usage": null, "listings": [], "plans": [ …3 paliers ] }` (200 — l'espace privé existe toujours, il affiche l'écran de choix). `EXPIRED` : `message` clair affichable tel quel (CA-V7-016). Prix/quotas toujours issus de `subscription_plans` (aucun tarif en dur).

### 2.13 `SubscriptionUsage` et `ListingView` (**V7** — espace abonné)

```json
{ "usage": { "used": 3, "quota": 10, "remaining": 7 },
  "listings": [ { "id": 12, "productId": 88, "title": "Veste en jean — taille M",
                  "price": 12000, "effectiveStatus": "AVAILABLE",
                  "createdAt": "2026-11-17T10:20:00.000Z" } ] }
```

`used` est **dérivé en lecture** de `products.status` par jointure (`PENDING|AVAILABLE|RESERVED`, `p.deleted_at IS NULL`, `l.withdrawn_at IS NULL`) — jamais un compteur stocké. `effectiveStatus` idem (jamais stockée sur la liaison). `quota` = quota du forfait **`ACTIVE`**. `remaining` = `max(0, quota − used)`.

### 2.14 `StorefrontPublic` (boutique publique — **V7**, `GET /api/storefront/:slug`)

```json
{ "storefront": { "slug": "mode-dakar", "displayName": "Aïcha M.", "memberSince": 2024 },
  "items": [ { "id": 88, "name": "Veste en jean — taille M", "price": 12000,
               "primaryPhotoUrl": "/uploads/products/9f1c3d2a.jpg", "effectiveStatus": "AVAILABLE" } ],
  "page": 1, "perPage": 12, "total": 3, "totalPages": 1 }
```

`storefront` = `displayName` + `memberSince` (année d'inscription, `users.created_at`) — **uniquement**. **Jamais** `name`/`email`/`phone`/`whatsapp`/`tel:`/`mailto:` (CA-V7-026). `items[]` : `id` = **`products.id`** (même id que le catalogue — aucune duplication), `name` = `products.name`, `price` en FCFA entier, `primaryPhotoUrl` = photo primaire (`null` si aucune), `effectiveStatus` dérivé par jointure. Réponse pour toute boutique ouverte (vide → `items: []`). Enveloppe paginée standard §1.5 ; `Cache-Control: private, no-store`.

### 2.15 `SubscriptionAdminItem` (file admin — **V7**, `GET /api/admin/subscriptions`)

Enveloppe paginée `{ items, page, perPage, total, totalPages }`. Élément : `{ id, sellerId, sellerDisplayName, planName, priceFcfa, quota, slug, status, createdAt, activatedAt|null, activatedBy|null }` (vue **admin interne** — `sellerDisplayName` autorisé ici, ce n'est pas une vue publique).

### 2.16 Effet de la route contact boutique (**V7**)

La route `§3.9(6)` insère une ligne `notifications` **dans la même transaction** : `user_id` = vendeur de la boutique uniquement · `type` = **`product.contact`** (valeur d'enum **existante**, DDL 008 — aucun type créé) · `title` = `Nouveau message depuis la boutique « <slug> » — De : <displayName du demandeur>` · `message` = `De : <displayName>< — <email>>\n\n<message>` (l'email du **demandeur** n'est transmis qu'au vendeur ; jamais dans la réponse HTTP).

---

## 3. Endpoints

### 3.1 Authentification

#### `POST /api/auth/register` — public

Crée un compte **utilisateur** (jamais admin — CA-AUTH03-01), connecte immédiatement (cookie posé), ne renvoie jamais de mot de passe.

**Corps (JSON) — champs obligatoires :**

| Champ | Type | Contraintes (miroir validation UI) |
|---|---|---|
| `displayName` | string | 2..50, alphanumérique + espaces/accents `^[A-Za-zÀ-ÿ0-9 ]+$` (D2) |
| `name` | string | 1..100 — nom complet **privé** |
| `email` | string | format e-mail, ≤ 255, **unique** (stocké en minuscules) |
| `phone` | string | `^\+?[0-9 ]{8,20}$` (ex. `+225 07 00 00 00 00`), **unique** |
| `password` | string | 8..72 caractères (limite bcrypt), stocké haché (bcryptjs cost 10 — CA-AUTH01-03) |
| `acceptedCgu` | boolean | **doit être `true`** sinon blocage (CA-AUTH01-01) |
| `ref` | string | **facultatif** — code de parrainage (`RV` + 6 à 12 alphanumériques, normalisé en majuscules, ≤ 16). Code inconnu/mal formé/auto-référencé → **ignoré**, l'inscription réussit quand même (§3.8) |

**Exemple :**

```json
{
  "displayName": "Aicha123",
  "name": "Aïcha Koné",
  "email": "aicha@example.com",
  "phone": "+225 07 00 00 00 00",
  "password": "motdepasse123",
  "acceptedCgu": true
}
```

**Réponse `201`** — profil self + compteur de notifications non lues (cookie `connect.sid` posé) :

```json
{
  "user": {
    "id": 3,
    "displayName": "Aicha123",
    "name": "Aïcha Koné",
    "email": "aicha@example.com",
    "phone": "+225 07 00 00 00 00",
    "role": "user",
    "memberSince": 2026,
    "createdAt": "2026-09-20T10:00:00.000Z",
    "referralCode": "RV3F9A2B7C"
  },
  "unreadNotifications": 0
}
```

> `referralCode` est le code **personnel** du nouvel inscrit (créé en base par `DEFAULT`), pas le code utilisé pour s'inscrire. `ambassador` n'apparaît que si un badge est actif — jamais à l'inscription normale.

**Erreurs :**

| Statut | Code | Message (exemple) | Condition |
|---|---|---|---|
| `400` | `VALIDATION_ERROR` | « Données invalides » + `details` par champ | champ manquant, hors bornes, e-mail mal formé, `acceptedCgu: false`, mot de passe < 8 car. |
| `409` | `EMAIL_TAKEN` | « Un compte avec cet e-mail existe déjà » | `email` déjà en base (CA-AUTH01-02) |
| `409` | `PHONE_TAKEN` | « Un compte avec ce numéro existe déjà » | `phone` déjà en base |
| `500` | `INTERNAL_ERROR` | « Erreur interne du serveur » | échec hash/insert |

**Règles métier** : une seule insertion `users` (+ hachage bcrypt). Échecs `UNIQUE` captés en 409 (pas de fuite du côté applicatif).

---

#### `POST /api/auth/login` — public

Identifiant = **e-mail uniquement** (V3/E1, CHG-2/D18 — le login par téléphone est retiré, PO-1). Erreur **générique** en cas d'échec (aucune fuite : compte inexistant ⇔ mot de passe faux ⇔ rôle — CA-AUTH04-06, CA-AUTH05-05).

**Corps (JSON) :**

```json
{ "identifier": "aicha@example.com", "password": "motdepasse123" }
```

`identifier` : **e-mail valide** (format e-mail, ≤ 255, stocké en minuscules). Toute autre forme (`+225 07…`, texte libre) → `400 VALIDATION_ERROR` (CA-AUTH04-07 : le serveur rejette les contournements de la validation client ; aucune requête réseau utile côté front si l'e-mail est mal formé).

**Réponse `200`** :

```json
{
  "user": { "id": 3, "displayName": "Aicha123", "email": "aicha@example.com", "role": "user", "memberSince": 2026 }
}
```

`role` (`'user'` | `'admin'`) pilote la **redirection** côté front depuis la page **unique** `/login` : `user` → `/dashboard`, `admin` → `/admin` (CA-AUTH04-03/-04, D17). En cas d'échec, la réponse ne contient **ni `role` ni indication d'existence du compte** (CA-AUTH04-06).

**Erreurs :**

| Statut | Code | Message | Condition |
|---|---|---|---|
| `400` | `VALIDATION_ERROR` | « Données invalides » + `details` | `identifier` ou `password` manquant/vide, `identifier` non conforme e-mail (y compris un n° de téléphone) |
| `401` | `INVALID_CREDENTIALS` | « Identifiants incorrects » | e-mail inconnu, ou mot de passe faux — même message pour un compte user **ou** admin (CA-AUTH04-06/-05-05) |
| `500` | `INTERNAL_ERROR` | « Erreur interne du serveur » | échec bcrypt/session |

**Exemples de payloads :**

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Données invalides", "details": [ { "field": "identifier", "message": "L'identifiant doit être une adresse e-mail valide" } ] } }
```

```json
{ "error": { "code": "INVALID_CREDENTIALS", "message": "Identifiants incorrects" } }
```

**Règles métier** : `req.session.userId` + `req.session.role` posés ; cookie 7 jours, rolling, HTTP-only (CA-AUTH02-02). Le rôle provient **exclusivement de la base** (D19) : aucune valeur de rôle du client n'est interprétée. Identifiants admin = configuration système (`ADMIN_EMAIL`/`ADMIN_PASSWORD`), jamais renvoyés par l'API (CA-AUTH05-03). Aucune route `/admin/login` n'existe côté API (path front uniquement, CA-AUTH04-02).

---

#### `POST /api/auth/logout` — session (idempotent)

Détruit la session serveur et vide le cookie (CA-AUTH02-03). Accessible aux deux rôles ; **idempotent** : renvoie `204` même si aucune session n'existe.

**Corps :** aucun. **Réponse `204`** sans corps.

**Erreurs :** `500` uniquement (échec `session.destroy()`).

---

#### `GET /api/auth/me` — session

Profil courant + compteur de non-lues (badge notifications, CA-NOT01-01). Réponse identique au payload du `201` de register (vue `SelfUser`).

**Réponse `200` :**

```json
{
  "user": { "id": 3, "displayName": "Aicha123", "name": "Aïcha Koné", "email": "aicha@example.com", "phone": "+225 07 00 00 00 00", "role": "user", "memberSince": 2026, "createdAt": "2026-09-20T10:00:00.000Z" },
  "unreadNotifications": 2
}
```

**Erreurs :**

| Statut | Code | Message | Condition |
|---|---|---|---|
| `401` | `UNAUTHENTICATED` | « Vous devez être connecté » | session absente, expirée ou invalide |
| `500` | `INTERNAL_ERROR` | « Erreur interne du serveur » | — |

**Exemple :**

```json
{ "error": { "code": "UNAUTHENTICATED", "message": "Vous devez être connecté" } }
```

### 3.2 Catalogue (public, sans session)

#### `GET /api/products` — public

Catalogue des articles **`AVAILABLE` uniquement** (CA-CAT01-01, RG-PROD-8 — jamais `PENDING/REJECTED/RESERVED/SOLD` dans une liste). Recherche + filtres + tri + sections + pagination (D12). **V4-Accueil** : tous les paramètres sont optionnels et **rétrocompatibles** — une requête sans paramètre répond exactement comme avant (CA-ACC-74).

**Query params :**

| Param | Type | Défaut | Contraintes |
|---|---|---|---|
| `q` | string | — | 1..120, recherche sur **nom, description, marque, localisation, nom de catégorie, nom de sous-catégorie** (`ILIKE %q%`, RG-PROD-5 — CA-ACC-45) ; vide = tout le catalogue |
| `category_id` | int | — | id d'une **catégorie** (→ inclut ses sous-catégories) **ou** d'une sous-catégorie (→ restreinte à elle) |
| `subcategory_id` | int | — | (**V4-Accueil**) id d'une **sous-catégorie** → restreinte à elle. Combinable avec `category_id` à condition que la sous-catégorie appartienne à cette catégorie, sinon `400 VALIDATION_ERROR` (`CATEGORY_MISMATCH` dans `details`) |
| `price_min` | int | — | (**V4-Accueil**) entier ≥ 0 — prix minimum (`p.price >= price_min`) |
| `price_max` | int | — | (**V4-Accueil**) entier ≥ 0 — prix maximum (`p.price <= price_max`) ; si les deux sont fournis, `price_max >= price_min` obligatoire sinon `400` |
| `condition` | string | — | (**V4-Accueil**) enum des 5 valeurs §2.6 (`Neuf` · `Très bon état` · `Bon état` · `Correct` · `À réparer`) — égalité exacte |
| `location` | string | — | (**V4-Accueil**) **correspondance exacte insensible à la casse et aux espaces de bord** (`LOWER(BTRIM(p.location)) = LOWER($valeur)`) — la valeur vient de la liste déroulante `GET /api/products/locations` (PO-ACC-2), donc égalité (pas de `ILIKE %…%` : il existe déjà via `q`/RG-PROD-5) |
| `brand` | string | — | (**V4-Accueil**) `ILIKE '%valeur%'` insensible à la casse, trimmé, 1..100 (CA-ACC-49/50) |
| `sort` | string | `recent` | `recent` (créé le plus récent d'abord) · `price_asc` · `price_desc` · **`popular` (V4-Accueil)** (`view_count DESC`) · **`relevance` (V5, PO-V5-18)** (score local déterministe, **distinct de `recent`**) — voir table de tri § ci-dessous |
| `section` | string | — | (**V4-Accueil**) enum de **6 sections** : `recent` · `best_offers` · `popular` · `promotions` · `new` · `discover` — voir table § ci-dessous. **Prioritaire sur `sort`** (si les deux sont fournis, `section` gagne, `sort` est ignoré — pas d'erreur). Sans `per_page`, une section limite à **12** par défaut |
| `ids` | string | — | (**V4-Accueil**) CSV d'ids, **1..12**, entiers > 0. Retourne les produits `AVAILABLE` **dans l'ordre fourni** ; id introuvable/inactif/non-`AVAILABLE` → **ignoré** ; 0 trouvé → `items: []`. **Mode exclusif** : les autres paramètres (`q`, `category_id`, `subcategory_id`, `price_*`, `condition`, `location`, `brand`, `sort`, `section`, `page`, `per_page`) et `not_in` sont ignorés/rejetés (voir règles) |
| `not_in` | string | — | (**V4-Accueil**) CSV d'ids, **1..200**, entiers > 0 — **exclusion** de produits `AVAILABLE` déjà affichés (dédoublonnage des sections du front, PO-ACC-3). Combinable avec les filtres/tri/section ; **incompatible avec `ids`** |
| `page` | int | `1` | ≥ 1 (ignoré si `ids`) |
| `per_page` | int | `12` | 1..48 (ignoré si `ids`) |

**Règles de combinaison (V4-Accueil) :**

| Combinaison | Résultat |
|---|---|
| `section` + `sort` | **`section` gagne** (`sort` ignoré silencieusement) — le front n'envoie jamais les deux (URLs « Voir plus » §8 du cahier V4 : l'un ou l'autre) |
| `section` + filtres (`category_id`, `subcategory_id`, `price_*`, `condition`, `location`, `brand`) | autorisée : les filtres s'appliquent **dans** la section (ex. « Promotions en Électronique ») |
| `section` + `not_in` | autorisée (dédoublonnage des sections successives de l'accueil) |
| `ids` + tout autre paramètre (`sort`, `section`, `q`, filtres, `page`, `per_page`, `not_in`) | `ids` est **exclusif** : toute combinaison → `400 VALIDATION_ERROR` (`details.field = "ids"`) |
| `ids` + `page`/`per_page` | inclus dans la règle ci-dessus → `400` (pas d'ignorance silencieuse) |
| `not_in` + `ids` | → `400 VALIDATION_ERROR` (`details.field = "not_in"`) |
| `subcategory_id` + `category_id` incohérents | → `400 VALIDATION_ERROR` (`details.field = "subcategory_id"`, code `CATEGORY_MISMATCH`) |
| `price_min` > `price_max` | → `400 VALIDATION_ERROR` (`details.field = "price_max"`) |

**Table tri / section → WHERE + ORDER BY (référence backend, V4-Accueil) :**

| Paramètre | Filtre additionnel (en plus de `status='AVAILABLE'` et des autres filtres) | ORDER BY |
|---|---|---|
| `sort=recent` (défaut) | — | `p.created_at DESC, p.id` |
| `sort=price_asc` | — | `p.price ASC, p.id` |
| `sort=price_desc` | — | `p.price DESC, p.id` |
| `sort=popular` | — | `p.view_count DESC, p.created_at DESC, p.id` |
| **`sort=relevance`** (**V5**, PO-V5-18) | — | `score DESC, p.id` où `score = LEAST(50, remise%) / 2 + LEAST(200, view_count) / 200 × 30 + GREATEST(0, 30 − âge_jours)`. **Score local, déterministe, sans ML ni service externe.** Le `p.id` final rend l'ordre **stable** à score égal. |

| `section=recent` | — | `p.created_at DESC, p.id` |
| `section=best_offers` | `p.old_price IS NOT NULL AND p.old_price > p.price` | `((p.old_price - p.price) * 1.0 / p.old_price) DESC, p.id` |
| `section=popular` | — | `p.view_count DESC, p.created_at DESC, p.id` |
| `section=promotions` | `p.old_price IS NOT NULL AND p.old_price > p.price AND ((p.old_price - p.price) * 100.0 / p.old_price) >= 15` (réduction ≥ 15 %, RG-PROD-6/CA-ACC SEC-4) | `((p.old_price - p.price) * 1.0 / p.old_price) DESC, p.id` |
| `section=new` | `p.created_at >= now() - interval '14 days'` (fenêtre ≤ 14 jours, PO-ACC-5) | `p.created_at DESC, p.id` |
| `section=discover` | — | hash **stable par jour** (algorithme § ci-dessous) |

> **Sémantique des sections (contrat front « Voir plus », §8 du cahier V4)** : `recent` = produits récemment ajoutés · `best_offers` = meilleures offres (toute réduction, % décroissant) · `popular` = produits populaires (vues DESC) · `promotions` = promotions (réduction ≥ 15 %, % décroissant) · `new` = nouveautés (≤ 14 jours) · `discover` = « Découvrez nos produits » (sélection stable par jour, PO-ACC-6). Les **libellés FR** des sections sont côté front (D-ACC-5).

> **Algorithme `discover` (algorithme simple reproductible, PO-ACC-6)** : `$daySeed` = `floor(extract(epoch from now()) / 86400)` (jour UTC courant, calculé par le backend) ; `ORDER BY ((p.id * 104729 + $daySeed * 40503) % 1000003) ASC, p.id ASC`. La permutation est **déterministe sur la journée** (même ordre pour tous les appels du jour, pagination comprise) et **change chaque jour** (le seed varie). Ce n'est pas un aléa cryptographique — déterministe suffit (CA-ACC-73, PO-ACC-6). Les coefficients (104729, 40503, 1000003) font partie du contrat.

**Réponse `200`** (schéma paginé §1.5) — items = `ProductCard` (§2.2, champs V4 inclus) :

```json
{
  "items": [
    {
      "id": 42,
      "name": "iPhone 13 128 Go",
      "slug": "iphone-13-128-go",
      "price": 250000,
      "oldPrice": 300000,
      "viewCount": 14,
      "brand": "Apple",
      "location": "Abidjan, Cocody",
      "condition": "Très bon état",
      "createdAt": "2026-09-18T09:00:00.000Z",
      "image": { "id": 88, "url": "/uploads/products/5f9e8c2a-....jpg" },
      "category": { "id": 3, "name": "Électronique", "slug": "electronique" },
      "subcategory": { "id": 13, "name": "Téléphones & tablettes", "slug": "electronique-telephones" }
    }
  ],
  "page": 1,
  "perPage": 12,
  "total": 34,
  "totalPages": 3
}
```

**Enveloppe en mode `ids`** : `page: 1`, `perPage` = nombre d'éléments retournés, `total` = idem, `totalPages` = `0` si vide sinon `1` (§1.5). Ex. 3 ids demandés dont 1 indisponible : `{ items: [2 items], page: 1, perPage: 2, total: 2, totalPages: 1 }`.

**Erreurs :**

| Statut | Code | Message | Condition |
|---|---|---|---|
| `400` | `VALIDATION_ERROR` | « Données invalides » + `details` (champ fautif) | `q` > 120, `category_id`/`subcategory_id` non numériques ou ≤ 0, `sort` inconnu, `section` hors enum, `condition` hors enum, `price_min`/`price_max` non entiers ou négatifs, `price_max < price_min`, `location`/`brand` hors bornes, `ids` hors 1..12 ou non numérique, `not_in` hors 1..200 ou non numérique, combinaisons illégales du tableau ci-dessus, `per_page` hors 1..48, `page` < 1 |
| `500` | `INTERNAL_ERROR` | « Erreur interne du serveur » | — |

Liste vide = `200` `{ items: [], total: 0, totalPages: 0 }` (pas de 404) — y compris en mode `ids` quand aucun id n'est trouvé. Aucun champ privé vendeur dans les items (T22).

**Règles métier** : requête `SELECT` filtrée par `status='AVAILABLE'` (RG-PROD-8), tous filtres cumulés en `AND`, `not_in` traduit en `p.id <> ALL($...::bigint[])` (ou `NOT (p.id = ANY(...))`). Les réservations expirées sont libérées par la tâche planifiée (max 1 min de latence, D3) ; le catalogue n'effectue pas de libération synchrone (un `RESERVED` expiré reste exclu jusqu'au tick suivant — conforme D3, latence ≤ 1 min).

---


> ⚠️ `relevance` et `recent` ne sont **pas** équivalents : un article ancien et très consulté passe **avant** un article neuf et jamais consulté. C'est l'effet recherché du tri « Pertinence » (remise + popularité + récence), et non un bug d'ordre. Toute autre valeur de `sort` → `400 VALIDATION_ERROR`.
#### `GET /api/products/suggestions` — public (V5, PO-V5-18)

Suggestions de saisie pour la navbar (CA-V5-136). **Route ajoutée en V5** : c'est le seul ajout de contrat de C5/C1, strictement borné, dont l'**absence** ne change aucune réponse existante (P5).

**Query params :**

| Param | Type | Défaut | Contraintes |
|---|---|---|---|
| `q` | string | — | **obligatoire**, 1..120 caractères, **≥ 2 caractères** — absent ou trop court → `400 VALIDATION_ERROR` |

> Le seuil de 2 caractères est imposé **côté serveur** pour que la règle « pas de requête pour une chaîne de 1 caractère » (CA-V5-136d) soit vérifiable sans confiance dans le front. Le `debounce ≥ 200 ms` et l'**annulation des réponses obsolètes** restent des responsabilités front (le serveur ne peut pas savoir qu'une réponse est périmée).

**Réponse `200` :**

```json
{
  "q": "velo",
  "categories": [{ "id": 12, "name": "Vélos", "slug": "velos" }],
  "brands": ["Btwin"],
  "products": [ { "…": "ProductCard §2.2, strictement identique au catalogue" } ]
}
```

| Champ | Type | Borne | Contenu |
|---|---|---|---|
| `q` | string | — | écho de la requête (normalisé par le trim du schéma) |
| `categories` | `CategoryRef[]` | **≤ 2** | catégories **actives** dont le nom ou le slug contient `q` ; les catégories parentes passent avant les sous-catégories, puis `name ASC` |
| `brands` | string[] | **≤ 2** | marques distinctes non vides (`BTRIM`) d'articles `AVAILABLE` contenant `q`, triées `name ASC` |
| `products` | `ProductCard[]` | **≤ 6** | articles `AVAILABLE` dont le nom ou la marque contient `q`, triés `view_count DESC, p.id` |

**Plafond global : 10 éléments au TOTAL** (6 + 2 + 2). Le plafond découle de la somme des trois bornes, pas d'un garde-fou a posteriori.

**Règles :**
- Les `products[]` utilisent le **même sérialiseur** que `GET /api/products` : une suggestion ne peut pas diverger d'une carte de catalogue (P4).
- Aucune suggestion n'expose de donnée privée : ni e-mail, ni téléphone, ni prix de commande d'un tiers (CA-V5-018 — toute valeur restituée est échappée dans le HTML).
- La route est déclarée **avant** `/api/products/:slug` : `GET /api/products/suggestions` est résolu comme suggestions, jamais comme une fiche au slug `suggestions`.
- Budget : **2 requêtes**, indépendantes de la taille du catalogue (C5).
- Aucune suggestion → `{ q, categories: [], brands: [], products: [] }` avec **`200`**. Le message « aucun résultat » est une obligation **front** (CA-V5-136e) : l'API ne renvoie pas d'erreur pour une recherche vide.

#### `GET /api/products/:slug` — public

Fiche publique d'un article, résolue par **slug unique** (`kebab-case`, généré serveur à la création — §3.3). Le paramètre peut être un slug **ou** un id numérique (tolérance de routage) ; la réponse est identique.

Réponse `200` = `ProductDetail` (§2.3) — voir l'exemple complet qui y figure.

**Statuts exposés :** `AVAILABLE`, `RESERVED`, `SOLD` (les deux derniers pour afficher le badge et rendre le bouton « Acheter » inactif, CA-CAT03-03/04). `PENDING` et `REJECTED` répondent `404` (jamais exposés).

**Compteur de vues (V4-Accueil, D-ACC-3 / CA-ACC-58) :** chaque `GET` réussi de la fiche (route publique) incrémente `products.view_count` de **+1** — quel que soit l'appelant : visiteur anonyme, propriétaire du produit, ou admin (cohérence des statistiques de consultation ; documenté : oui pour le propriétaire, aucune distinction d'auteur en V4). Règles :
- L'incrément s'applique **uniquement** quand la fiche est effectivement servie (`200`) : statut exposé `AVAILABLE`/`RESERVED`/`SOLD`. Pas d'incrément sur `404` (slug/id inexistant, `PENDING`, `REJECTED`).
- **Ordre** : libération paresseuse (si `RESERVED` expiré) → `UPDATE products SET view_count = view_count + 1 WHERE id = $1` (incrément **atomique**, aucun `SELECT … FOR UPDATE` ni transaction nécessaire — jamais de perte en concurrence) → sérialisation. La fiche renvoie `viewCount` = valeur **post-incrément** (2 consultations consécutives → +2 en BDD, vérifiable en SQL direct).
- `view_count` est **jamais décrémenté** (RG-PROD-3).
- **Caveat assumé** : les préchargements/bots peuvent gonfler le compteur ; accepté pour V4 (le middleware `rateLimit` est optionnel sur cette route publique — note impl. §8).

**Erreurs :**

| Statut | Code | Message | Condition |
|---|---|---|---|
| `404` | `PRODUCT_NOT_FOUND` | « Article introuvable » | slug/id inexistant **ou** produit `PENDING`/`REJECTED` (non-divulgation : même réponse) |
| `500` | `INTERNAL_ERROR` | « Erreur interne du serveur » | — |

**Exemple :**

```json
{ "error": { "code": "PRODUCT_NOT_FOUND", "message": "Article introuvable" } }
```

**Règles métier** : **libération paresseuse** (D3, §5.2 architecture) — avant de répondre, si `status = RESERVED` et `reserved_until < now()`, le serveur exécute la libération (transaction : commande `PAYMENT_PENDING` → `PAYMENT_FAILED` + event `(PAYMENT_PENDING → PAYMENT_FAILED, system)`, paiement `PENDING` → `FAILED`, produit → `AVAILABLE`, notification N7) puis renvoie la fiche à jour (`AVAILABLE`, bouton réactivé, CA-CAT03-04). L'expiration ne s'applique que si la commande est encore `PAYMENT_PENDING` (anti-course admin prioritaire — D-V3-6).

---

#### `GET /uploads/products/:file` — public

Photo servie par `express.static` (chemin relatif `uploads/products/<nom-aléatoire>.<ext>`). Nom de fichier = **UUID généré serveur** (jamais le nom d'origine, RG-MEDIA-1, §9.6). `dotfiles: 'ignore'`, aucun fichier hors du répertoire.

- `200` : image binaire, `Content-Type` détecté (JPEG/PNG/WebP).
- `404` : fichier absent.
- `500` : erreur interne.

---

### 3.2 bis Catégories (public)

#### `GET /api/categories` — public

Arbre des catégories **actives** avec leurs sous-catégories **actives** (D7). Utilisé par : menu filtre du catalogue, formulaire de revente (RG-PROD-5).

**Réponse `200` :**

```json
{
  "categories": [
    {
      "id": 3,
      "name": "Électronique",
      "slug": "electronique",
      "children": [
        { "id": 13, "name": "Téléphones & tablettes", "slug": "electronique-telephones", "active": true },
        { "id": 14, "name": "Ordinateurs", "slug": "electronique-ordinateurs", "active": true }
      ]
    }
  ]
}
```

- Seules les catégories/sous-catégories `active = true` apparaissent (une catégorie désactivée disparaît du filtre et du formulaire — CA-CAT01-04, CA-ADM06-02).
- Pas de pagination (volume seed ≈ 22 lignes) ; le champ `active` est toujours `true` ici (cohérence UI).

**Erreurs :** `500` uniquement.

---

### 3.2 ter Catégories (admin)

#### `GET /api/admin/categories` — admin

Même arbre que `GET /api/categories` mais **toutes** les catégories et sous-catégories, **y compris inactivees** (actives **et** inactives — « liste active/inactive » de l'UI admin, CA-ADM06-01) :

```json
{
  "categories": [
    {
      "id": 2,
      "name": "Maison",
      "slug": "maison",
      "active": false,
      "children": [ { "id": 10, "name": "Mobilier", "slug": "maison-mobilier", "active": true } ]
    }
  ]
}
```

L'UI affiche un badge et permet le toggle (§ ci-dessous). **Erreurs :** `403` pour non-admin, `500`.

#### `PATCH /api/admin/categories/:id` — admin

Renomme et/ou active/désactive une catégorie **ou** une sous-catégorie (D7, CA-ADM06). Pas de création ni de suppression en V1 (§4.2).

**Corps (JSON, au moins un champ) :**

```json
{ "name": "Électronique & High-Tech", "active": false }
```

| Champ | Type | Contraintes |
|---|---|---|
| `name` | string | 1..100 ; renommage **ne modifie pas le slug** (stabilité des URLs) ; doublon de nom au même niveau → `409 CATEGORY_NAME_TAKEN` |
| `active` | boolean | toggle |

**Réponse `200` :** la catégorie mise à jour (même forme que dans l'arbre, avec `active`).

**Erreurs :**

| Statut | Code | Message | Condition |
|---|---|---|---|
| `404` | `CATEGORY_NOT_FOUND` | « Catégorie introuvable » | id inexistant |
| `400` | `VALIDATION_ERROR` | « Données invalides » + `details` | corps vide, `name` vide/trop long, `active` non booléen |
| `409` | `CATEGORY_NAME_TAKEN` | « Un autre libellé identique existe déjà à ce niveau » | doublon de nom, même `parent_id` |
| `409` | `PARENT_INACTIVE` | « Impossible d'activer une sous-catégorie dont la catégorie parente est inactive » | `active: true` sur une sous-catégorie dont la catégorie parente est inactive (CA-ADM06-03) |
| `500` | `INTERNAL_ERROR` | « Erreur interne du serveur » | — |

**Règles métier** :
- Désactiver une catégorie ne touche **pas** aux produits déjà `AVAILABLE` (ils restent visibles, CA-CAT01-04) ; elle les retire du formulaire et du filtre (effet côté GET publics).
- Toute modification passe par `UPDATE categories` sans effet de bord sur les FK (les produits pointent vers la sous-catégorie).

### 3.2 quater Accueil V4 — découverte (bannières, localisations, contact vendeur)

> ⚠️ **Ordre de déclaration des routes (implémentation `@backend`)** : `GET /api/products/locations` doit être déclarée dans le routeur express **AVANT** `GET /api/products/:identifier`. Sans cela, `locations` est capturée par le paramètre `:identifier` (slug arbitraire valide) et répond `404 PRODUCT_NOT_FOUND`. Contrainte impérative (§8).

#### `GET /api/products/locations` — public (V4-Accueil, PO-ACC-2)

Valeurs **distinctes** de `products.location` pour les produits **`AVAILABLE` uniquement**, **triées alphabétiquement** (collation par défaut — les accents sont correctement ordonnés). Alimente la **liste déroulante** du filtre localisation des pages `/category/:slug` et `/search` (CA-ACC-49) ainsi que l'option « Toutes les localisations ».

**Réponse `200` :**

```json
{ "locations": [ "Abidjan, Cocody", "Abidjan, Marcory", "Yamoussoukro" ] }
```

**Règles :**
- SQL : `SELECT DISTINCT location FROM products WHERE status = 'AVAILABLE' ORDER BY location ASC LIMIT 200`.
- **Borne 200, pas de pagination** : justifiée — le volume réel de localisations distinctes d'un catalogue d'occasion est de l'ordre de la dizaine ; la borne est un **garde-fou de sécurité** (pas de réponse infinie), cohérente avec l'usage « liste déroulante complète » (PO-ACC-2). Si le seuil était atteint, les **200 premières** (ordre alpha) seraient renvoyées — comportement documenté, aucun cas rencontré en pratique attendu.
- Les valeurs ne sont **pas normalisées** à l'écriture (exactement ce qui a été saisi par les vendeurs) ; les doublons de casse (`Abidjan, cocody` vs `Abidjan, Cocody`) restent deux valeurs distinctes tant que les vendeurs les saisissent différemment — la règle de filtre (égalité insensible à la casse, §3.2) rend le filtrage tolérant.

**Erreurs :** `500` uniquement. Aucun produit `AVAILABLE` → `{ "locations": [] }` (pas de 404).

---

#### `GET /api/banners` — public (V4-Accueil, D-ACC-1 / CA-ACC-07)

Bannières du carrousel d'accueil : `active = true` (les bannières désactivées sont exclues), **triées par `position ASC`**. Structure de rendu (§2.10) ; **aucun contenu codé en dur côté client** — le front ne fait que rendre.

**Réponse `200` :**

```json
{
  "banners": [
    { "id": 1, "title": "Grande braderie de septembre", "subtitle": "Jusqu'à -30 % sur l'électronique", "imagePath": "/uploads/banners/braderie-sept.jpg", "linkUrl": "/search?q=braderie", "position": 1 },
    { "id": 2, "title": "Vendez vos anciens téléphones", "subtitle": null, "imagePath": null, "linkUrl": "/vendre", "position": 2 }
  ]
}
```

**Règles :**
- SQL : `SELECT id, title, subtitle, image_path, link_url, position FROM banners WHERE active = TRUE ORDER BY position ASC`.
- `imagePath` = URL relative (convention photos produits, §2.10) — `null` = bannière sans image (rendu dégradé texte, CA-ACC-09) ; `linkUrl` = lien interne relatif (CA-ACC-05) — `null` = non cliquable.
- **Erreurs : aucune erreur 4xx possible.** Table vide → `{ "banners": [] }` (la section carrousel est masquée côté front, CA-ACC-07). `500` en cas de panne serveur uniquement.

---

#### `POST /api/products/:id/contact` — user (V4-Accueil, PO-ACC-1 option b)

Formulaire interne « Contacter le vendeur » : le demandeur connecté envoie un message au vendeur via une **notification interne** (type `product.contact`, N14). **Le numéro de téléphone du vendeur n'est JAMAIS exposé** — ni dans la réponse, ni dans la notification, ni dans un `event` (D2, PO-ACC-1, RG-ORD-6 analogie). Prépare une future messagerie sans changer le contrat (la notification en est la brique).

**Corps (JSON) :**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `message` | string | ✅ | 10..2000 caractères (trimmé) — le contenu du message |
| `email` | string | ⬜ | format e-mail, ≤ 254 (trimmé, stocké en minuscules) — coordonnée d'échange du **demandeur**, visible du **vendeur uniquement** (préfillé côté front avec l'email du compte connecté, CA-ACC-57) |

**Exemple :**

```json
{ "message": "Bonjour, le téléphone est-il toujours disponible ? Merci.", "email": "aicha@example.com" }
```

**Réponse `201` :**

```json
{ "ok": true, "notificationId": 401 }
```

**Règles métier (une transaction) :**
1. `requireUser` (un admin → `403 FORBIDDEN`, cohérent avec les flux acheteur).
2. Résolution du produit par `:id` (numérique, > 0 — sinon `404`).
3. **Statuts contactables : `AVAILABLE` et `RESERVED`** (produit « en vente » ; `RESERVED` = temporairement bloqué par une réservation qui expire, le vendeur reste propriétaire et joignable). Un `RESERVED` expiré est d'abord **libéré paresseusement** (même routine que la fiche, D3) puis le contact est accepté. `PENDING`/`REJECTED` → `404` (masqué, identique à la fiche — non-divulgation, CA-CAT03-04). `SOLD` → `400 PRODUCT_CONTACT_NOT_ALLOWED` (le produit est publiquement connu, message explicite).
4. Garde : `products.owner_id ≠ session.userId` sinon `400 CONTACT_SELF`.
5. `INSERT notifications (user_id = owner_id, type = 'product.contact', title, message)` **avec `RETURNING id`** (la notification doit être créée dans la même transaction que la vérification — cf. §5, aucune notification orpheline) :
   - `title` : `Nouveau message à propos de « <nom du produit> »`
   - `message` : `De : <displayName du demandeur>< — <email>>\n\n<message envoyé>` (l'`email` n'est ajouté **que** si fourni).
6. `COMMIT` → `201`.

**Erreurs :**

| Statut | Code | Message (exemple) | Condition |
|---|---|---|---|
| `401` | `UNAUTHENTICATED` | « Vous devez être connecté » | session absente |
| `403` | `FORBIDDEN` | « Accès réservé aux utilisateurs » | session admin (`role ≠ 'user'`) |
| `400` | `VALIDATION_ERROR` | « Données invalides » + `details` (`field: "message"` / `"email"`) | `message` < 10 ou > 2000, `email` malformé ou > 254 |
| `400` | `CONTACT_SELF` | « Vous ne pouvez pas contacter votre propre annonce » | `product.owner_id = session.userId` |
| `400` | `PRODUCT_CONTACT_NOT_ALLOWED` | « Ce produit n'est plus disponible à l'échange » | `status = SOLD` |
| `404` | `PRODUCT_NOT_FOUND` | « Article introuvable » | id inexistant **ou** `PENDING`/`REJECTED` (masqué) |
| `500` | `INTERNAL_ERROR` | « Erreur interne du serveur » | — |

**Exemples de payloads :**

```json
{ "error": { "code": "CONTACT_SELF", "message": "Vous ne pouvez pas contacter votre propre annonce" } }
```

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Données invalides", "details": [ { "field": "message", "message": "Le message doit contenir entre 10 et 2000 caractères" } ] } }
```

**Règles de sécurité / hygiène :**
- Le **téléphone vendeur n'apparaît jamais** (les vues vendeur `PublicUser` ne contiennent pas de coordonnées — T22).
- L'`email` du demandeur n'est transmis **qu'au vendeur** (dans le champ `message` de sa notification) — jamais dans la réponse, jamais en clair dans un autre endpoint.
- **Anti-spam recommandé** (note impl. §8) : `rateLimit` par IP (ex. 10 requêtes / 10 min) sur cette route.

---

### 3.3 Vente (articles du vendeur)

#### `POST /api/products` — user

Soumet un article **`multipart/form-data`** : champs texte + 1 à 4 fichiers photos (RG-MEDIA-1). L'article est créé en `PENDING` (jamais visible en catalogue avant approbation, CA-SELL01-05).

**Champs multipart :**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `name` | text | ✅ | 3..120 caractères |
| `categoryId` | text (int) | ✅ | id de la **catégorie** parente, **active** |
| `subcategoryId` | text (int) | ✅ | id de la **sous-catégorie**, **active**, et `parent_id = categoryId` (RG-PROD-5) |
| `condition` | text | ✅ | enum §2.6 |
| `price` | text (int) | ✅ | entier, **500..10 000 000** FCFA (RG-PROD-1) |
| `oldPrice` | text (int) | ⬜ | (**V4-Accueil**) entier, **500..10 000 000** FCFA et **strictement > `price`** (RG-PROD-2) ; **vide ou absent = `NULL`** (retenir la règle : champ multipart vide → colonne `NULL` — jamais `0` ni chaîne vide) |
| `location` | text | ✅ | 3..100 caractères |
| `description` | text | ✅ | 10..2000 caractères |
| `brand` | text | ⬜ | ≤ 100 (D8) |
| `model` | text | ⬜ | ≤ 100 (D8) |
| `ageYears` | text (int) | ⬜ | entier 0..100 (D8) |
| `defects` | text | ⬜ | ≤ 2000 (D8) |
| `accessories` | text | ⬜ | ≤ 2000 (D8) |
| `notes` | text | ⬜ | ≤ 2000 (D8) |
| `photos` | fichiers | ✅ (3..4) | JPEG/PNG/WebP, ≤ 5 Mo **chacun**, MIME réel vérifié (multer + §9.6) ; **obligatoire : ≥ 3 photos** — erreur `PHOTO_MISSING` (400) si < 3. Message : « Ajoutez au moins 3 photos. » |

La **1re photo reçue** devient la photo principale : `position = 1`, `is_primary = true` ; les suivantes `position = 2..4` (RG-MEDIA-1, prompt). Les champs optionnels vides sont stockés `NULL`. **Au moins 3 photos sont requises** — si le compte total `product_images` est < 3 après création, le serveur renvoie `400 PHOTO_MISSING` et l'article n'est pas créé.

**Exemple (représentation multipart) :**

```
POST /api/products
Content-Type: multipart/form-data; boundary=----B

------B
Content-Disposition: form-data; name="name"
iPhone 13 128 Go
------B
Content-Disposition: form-data; name="categoryId"
3
------B
Content-Disposition: form-data; name="subcategoryId"
13
------B
Content-Disposition: form-data; name="condition"
Très bon état
------B
Content-Disposition: form-data; name="price"
250000
------B
Content-Disposition: form-data; name="oldPrice"
300000
------B
Content-Disposition: form-data; name="location"
Abidjan, Cocody
------B
Content-Disposition: form-data; name="description"
Téléphone en très bon état, batterie 89 %.
------B
Content-Disposition: form-data; name="photos"; filename="a.jpg"
Content-Type: image/jpeg
<binary>
------B--
```

**Réponse `201`** : `OwnerProduct` (§2.4) — avec `slug` généré, `status: "PENDING"`, `rejectionReason: null`.

**Erreurs :**

| Statut | Code | Message | Condition |
|---|---|---|---|
| `401` | `UNAUTHENTICATED` | « Vous devez être connecté » | session absente |
| `400` | `VALIDATION_ERROR` | « Données invalides » + `details` | champ texte invalide (bornes § ci-dessus), `price` non entier ou hors bornes, `oldPrice` non entier, hors 500..10 000 000, ou ≤ `price` (RG-PROD-2), `condition` hors enum |
| `400` | `CATEGORY_MISMATCH` | « La sous-catégorie choisie n'appartient pas à la catégorie » | `subcategoryId.parent_id ≠ categoryId` |
| `400` | `CATEGORY_INACTIVE` | « Cette catégorie n'est plus disponible » | catégorie ou sous-catégorie `active = false` (RG-PROD-5) |
| `400` | `PHOTO_MISSING` | « Au moins une photo est requise » | 0 fichier reçu |
| `400` | `PHOTO_LIMIT` | « Maximum 4 photos par article » | > 4 fichiers |
| `400` | `PHOTO_TOO_LARGE` | « Chaque photo doit faire au plus 5 Mo » | fichier > 5 Mo (multer `LIMIT_FILE_SIZE`) |
| `400` | `PHOTO_INVALID_TYPE` | « Formats acceptés : JPEG, PNG, WebP » | MIME réel hors liste (multer `fileFilter`) |
| `500` | `INTERNAL_ERROR` | « Erreur interne du serveur » | échec insert, écriture fichier |

**Exemples de payloads :**

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Données invalides", "details": [ { "field": "price", "message": "Le prix doit être un entier entre 500 et 10 000 000 FCFA" } ] } }
```

```json
{ "error": { "code": "PHOTO_TOO_LARGE", "message": "Chaque photo doit faire au plus 5 Mo" } }
```

**Règles métier (une transaction)** :
1. Validation zod de tous les champs + cohérence catégorie/sous-catégorie.
2. `INSERT products` (`status = 'PENDING'`, `owner_id = session.userId`, `old_price` = valeur ou `NULL` — RG-PROD-2) + génération du **slug** depuis `name` (`slugify` + suffixe `-2`, `-3`… si collision → unicité garantie ; le slug est **figé à la création**, les renommages ultérieurs ne le changent pas — URLs publiques stables).
3. `INSERT product_images` (autant de lignes que de fichiers, positions 1..n, 1re = primaire) + écriture des fichiers sur disque (`uploads/products/<uuid>.<ext>`).
4. `INSERT notifications` **N1** pour le vendeur : `type = 'article_submitted'`, titre « Article soumis » (CA-SELL01-04).
5. `COMMIT` ; en cas d'échec d'écriture disque → rollback BD.

---

#### `PUT /api/products/:id` — owner

Modifie **tous les champs** du formulaire (multipart, mêmes champs que POST) d'un article **appartenant au connecté**, selon les règles D9 :

| Statut actuel | Effet de la PUT |
|---|---|
| `PENDING` | mise à jour des champs/photos, reste `PENDING` |
| `AVAILABLE` | mise à jour **+ repasse `PENDING`** (re-vérification admin, D9) → disparaît du catalogue ; `approved_at`/`approved_by` **remis à NULL** (l'ancienne approbation n'est plus valable) |
| `REJECTED` | **re-soumission** : mise à jour + repasse `PENDING` + `rejection_reason = NULL` (CA-SELL03-03) |
| `RESERVED` / `SOLD` | refus — article immuable (CA-SELL03-04) |

**Gestion des photos dans la PUT (multipart) :**

| Champ | Type | Rôle |
|---|---|---|
| `photos` | fichiers (0..4) | **ajoute** de nouvelles photos (positions suivantes) |
| `remove_photo_ids` | text (JSON `number[]`) | ids des photos **existantes** à supprimer (ex. `"[88]"`) |
| `photo_order` | text (JSON `number[]`) | ids des photos **existantes** dans l'ordre final voulu ; le **1er id = position 1 = photo principale** (ex. `"[89,88]"`) |

Contrainte finale : **après l'opération, total `product_images ≥ 3`**, sinon `400 PHOTO_MISSING` (si < 3) ou `400 PHOTO_LIMIT` (si > 4). Combinaison possible : `remove_photo_ids` + `photos` + `photo_order` (ordre = les ids listés d'abord, puis les nouvelles par ordre reçu). Les ids de photos **n'appartenant pas** à l'article → `400 PHOTO_ORDER_INVALID`.

**Réponse `200`** : `OwnerProduct` mis à jour.

**Erreurs :**

| Statut | Code | Message | Condition |
|---|---|---|---|
| `401` | `UNAUTHENTICATED` | « Vous devez être connecté » | session absente |
| `404` | `PRODUCT_NOT_FOUND` | « Article introuvable » | id inexistant **ou** article d'autrui (non-divulgation §1.4) |
| `400` | `VALIDATION_ERROR` / `CATEGORY_*` / `PHOTO_*` | identiques à POST | mêmes règles de champs/photos |
| `409` | `PRODUCT_NOT_MODIFIABLE` | « Un article réservé ou vendu ne peut pas être modifié » | `RESERVED` ou `SOLD` (CA-SELL03-04) |
| `500` | `INTERNAL_ERROR` | « Erreur interne du serveur » | — |

**Règles métier (une transaction)** :
- Le passage `AVAILABLE → PENDING` supprime le produit du catalogue **immédiatement** (visible dès le commit).
- `rejection_reason` est remis à `NULL` dans tous les cas de passage `→ PENDING` (re-soumission propre).
- `oldPrice` (**V4-Accueil**) : mêmes contraintes que POST (RG-PROD-2) ; champ multipart **vide/absent → `NULL`** (la réduction est retirée — `UPDATE products SET old_price = NULL` ; jamais de vidage par `0` qui violerait la contrainte SQL). Mis à jour en même temps que `price` dans une même requête (les deux changent ensemble ou pas du tout).
- Les photos **non concernées** par `remove_photo_ids` sont **conservées** (pas de purge accidentelle — point d'attention §9 architecture).
- **Aucune notification** n'est créée par la PUT (la re-soumission apparaît naturellement dans la file admin `PENDING`) ; `admin_actions` non concernée.
- Slug **inchangé** même si le nom change (lien public stable).

---

#### `DELETE /api/products/:id` — **RETIRÉE en V5 (C4, ARB-V5-04) — `404`**

> ⚠️ **Cette route n'existe plus** pour un utilisateur : la suppression d'un
> article est un **privilège administrateur exclusif** (voir
> `DELETE /api/admin/products/:id`, §admin). Un `DELETE /api/products/:id`
> authentifié répond **`404 NOT_FOUND`** (route absente), **jamais** `403`,
> `405` ou `500` — et le produit n'est **pas** touché. Critères : **CA-V5-054**
> (serveur) et **CA-V5-055** (aucune action « Supprimer » côté front). Le
> vendeur conserve l'accès à la **modification / re-soumission** (`PUT
> /api/products/:id`, §ci-dessus).

---

#### `GET /api/me/products` — user

Tous les articles du connecté, tri `created_at DESC`, avec compteurs pour le dashboard utilisateur (US-SELL02-03). Pas de pagination en V1 (volume faible) — voir note.

**Réponse `200` :**

```json
{
  "items": [
    { "id": 42, "name": "iPhone 13 128 Go", "slug": "iphone-13-128-go", "description": "...", "condition": "Très bon état", "price": 250000, "oldPrice": null, "viewCount": 142, "location": "Abidjan, Cocody", "status": "PENDING", "rejectionReason": null, "approvedAt": null, "reservedUntil": null, "category": { "id": 3, "name": "Électronique", "slug": "electronique" }, "subcategory": { "id": 13, "name": "Téléphones & tablettes", "slug": "electronique-telephones" }, "images": [ { "id": 88, "url": "/uploads/products/5f9e8c2a-....jpg", "isPrimary": true, "position": 1 } ], "brand": "Apple", "model": "iPhone 13", "ageYears": 1, "defects": null, "accessories": "Chargeur d'origine", "notes": null, "createdAt": "2026-09-18T09:00:00.000Z", "updatedAt": "2026-09-20T09:05:00.000Z" }
  ],
  "counts": { "total": 5, "pending": 2, "available": 1, "reserved": 0, "sold": 1, "rejected": 1 }
}
```

`items` = `OwnerProduct` (§2.4) ; `rejectionReason` affiché quand `REJECTED` (CA-SELL02-02). `counts` calcule sur **tous** les articles (indépendamment de toute pagination).

**Erreurs :** `401`, `500` (pas de `404` : la liste du connecté est vide si aucun article → `items: []`, `counts` à zéro).

### 3.4 Achat (commandes)

#### `POST /api/orders` — user

Clic « Acheter » : crée une commande, réserve l'article (`reserved_until = now + RESERVATION_DAYS`, défaut 5 jours), génère la ligne paiement, notifie — **en une seule transaction avec verrou de ligne** (CA-BUY01-02/03, §5.1 architecture).

**Corps (JSON) :**

| Champ | Type | Défaut | Contraintes |
|---|---|---|---|
| `productId` | int | — | obligatoire, > 0 |
| `paymentMethod` | string | `MOBILE_MONEY` | `MOBILE_MONEY` · `CASH` · `BANK_TRANSFER` · `OTHER` (notice affichée à l'acheteur, D1/§12.4) |

**Exemple :**

```json
{ "productId": 42, "paymentMethod": "MOBILE_MONEY" }
```

**Réponse `201`** — commande vue acheteur complète (statut exposé : `PAYMENT_PENDING` — `CREATED` est transitoire, D-V3-2 ; `events[]` inclus pour afficher la timeline dès la création, CA-ORD01-02) :

```json
{
  "order": {
    "id": 51,
    "orderNumber": "CMD-000051",
    "amount": 250000,
    "commission": 25000,
    "sellerAmount": 225000,
    "status": "PAYMENT_PENDING",
    "role": "buyer",
    "buyer": { "id": 3, "displayName": "Aicha123", "memberSince": 2026 },
    "seller": { "id": 8, "displayName": "JeanMarc", "memberSince": 2025, "sales": 1 },
    "product": { "id": 42, "name": "iPhone 13 128 Go", "slug": "iphone-13-128-go", "image": { "id": 88, "url": "/uploads/products/5f9e8c2a-....jpg" } },
    "payment": { "id": 60, "amount": 250000, "method": "MOBILE_MONEY", "status": "PENDING", "reference": null, "paidAt": null },
    "reservedUntil": "2026-09-20T10:15:00.000Z",
    "deliveryCarrier": null,
    "trackingNumber": null,
    "events": [
      { "id": 101, "fromStatus": null, "toStatus": "CREATED", "actor": "system", "note": "Création de la commande", "createdAt": "2026-09-20T10:00:00.000Z" },
      { "id": 102, "fromStatus": "CREATED", "toStatus": "PAYMENT_PENDING", "actor": "system", "note": "Paiement en attente", "createdAt": "2026-09-20T10:00:00.010Z" }
    ],
    "createdAt": "2026-09-20T10:00:00.000Z"
  }
}
```

La timeline « Suivre mon colis » affiche les étapes 1 (« Commande créée ») et 2 (« Paiement en attente ») dès la création, même si quasi simultanées (CA-ORD01-02).

**Erreurs :**

| Statut | Code | Message | Condition |
|---|---|---|---|
| `401` | `UNAUTHENTICATED` | « Vous devez être connecté » | session absente (D10 : le front redirige vers `/login?next=…`) |
| `400` | `VALIDATION_ERROR` | « Données invalides » + `details` | `productId` manquant/non numérique, `paymentMethod` hors enum |
| `400` | `SELF_PURCHASE` | « Vous ne pouvez pas acheter votre propre article » | `products.owner_id = session.userId` (CA-BUY01-05) |
| `404` | `PRODUCT_NOT_FOUND` | « Article introuvable » | `productId` inexistant |
| `409` | `PRODUCT_RESERVED` | « Cet article vient d'être réservé » | produit `RESERVED` (réservation active) ou `SOLD` — double commande (CA-BUY01-03, T11). Filet DB : index unique partiel couvrant les statuts **actifs `CREATED`..`DELIVERED`** (DDL 003, Annexe A.4) → même `409` en cas de course |
| `500` | `INTERNAL_ERROR` | « Erreur interne du serveur » | — |

**Exemples :**

```json
{ "error": { "code": "SELF_PURCHASE", "message": "Vous ne pouvez pas acheter votre propre article" } }
```

```json
{ "error": { "code": "PRODUCT_RESERVED", "message": "Cet article vient d'être réservé" } }
```

**Règles métier — transaction unique (§5.1 architecture, ordre impératif) :**
1. `BEGIN` (`pg.Client` dédié) ; `SELECT id, owner_id, status, reserved_at, reserved_until, price FROM products WHERE id = $1 FOR UPDATE`. Un article `RESERVED` avec `reserved_until < now()` est d'abord **libéré paresseusement** (pas de course avec la tâche planifiée — §5.2).
2. Garde-fous : `status = 'AVAILABLE'` sinon → rollback `409 PRODUCT_RESERVED` ; `owner_id ≠ buyer_id` sinon → rollback `400 SELF_PURCHASE`.
3. `INSERT orders` (`order_number` rempli par trigger `CMD-%06d` D11 ; `amount = price`, `commission = floor(price × 0,10)`, `seller_amount = amount − commission` — §7.3 ; `seller_id` copié depuis `products.owner_id` = fingerprint §8 ; `status = 'CREATED'`) puis `UPDATE orders SET status = 'PAYMENT_PENDING'` (le trigger de matrice DDL 003 valide) → **2 events** : `(NULL → CREATED, system, 'Création de la commande')` et `(CREATED → PAYMENT_PENDING, system, 'Paiement en attente')` (CA-ORD01-01, D-V3-2).
4. `INSERT payments` (`status PENDING`, `method`, `amount`).
5. `UPDATE products SET status = 'RESERVED', reserved_at = now(), reserved_until = now() + make_interval(days => RESERVATION_DAYS)` (défaut **5 jours**, D3).
6. Notifications **dans la même transaction** : **N3** acheteur (`order_created`, « Commande CMD-000051 enregistrée ») + **N5** vendeur (`article_reserved`, « Votre article est réservé ») — CA-BUY01-06.
7. `COMMIT`. Aucun event n'est créé pour la commande non attribuée en cas de course (CA-ORD01-03).

---

#### `GET /api/me/orders` — user

Commandes **en tant qu'acheteur** (CA-BUY03), tri `created_at DESC`. Résumé vue acheteur §2.7.

**Réponse `200` :**

```json
{
  "items": [
    {
      "id": 51,
      "orderNumber": "CMD-000051",
      "amount": 250000,
      "commission": 25000,
      "sellerAmount": 225000,
      "status": "PAYMENT_PENDING",
      "deliveryCarrier": null,
      "trackingNumber": null,
      "product": { "id": 42, "name": "iPhone 13 128 Go", "slug": "iphone-13-128-go", "image": { "id": 88, "url": "/uploads/products/5f9e8c2a-....jpg" } },
      "seller": { "id": 8, "displayName": "JeanMarc", "memberSince": 2025, "sales": 1 },
      "payment": { "id": 60, "method": "MOBILE_MONEY", "status": "PENDING", "reference": null, "paidAt": null },
      "createdAt": "2026-09-20T10:00:00.000Z"
    }
  ]
}
```

Statuts possibles et libellés UI (Annexe A) : `PAYMENT_PENDING` (« Paiement en attente ») · `PAID` (« Payée ») · `PRODUCT_WAITING` (« Produit en attente ») · `PRODUCT_RECEIVED` (« Produit reçu ») · `PREPARING` (« En préparation ») · `SHIPPED` (« Prête / Expédiée », V4) · `IN_DELIVERY` (« En livraison ») · `DELIVERED` (« Livrée ») · `COMPLETED` (« Terminée ») · `PAYMENT_FAILED` (« Expirée » — l'acheteur peut re-commander si le produit est de nouveau `AVAILABLE`, CA-BUY02-03) · `CANCELLED` (« Annulée »). `CREATED` n'est jamais exposé (D-V3-2). Lien « Suivre mon colis » présent pour **toutes** les commandes, quel que soit le statut (CA-ORD05-01).

**Erreurs :** `401`, `500`. `items` vide si aucune commande (pas de 404).

---

#### `GET /api/orders/:id` — session (acheteur, vendeur **ou** admin de la commande)

Détail d'une commande : le serveur adapte la vue au demandeur (`"buyer"` | `"seller"` | `"admin"`) et **ne divulgue jamais les coordonnées de l'autre partie** (RG 7.7, CA-ORD09-01/-02 — T22/T37). Inclut le statut courant **et** l'historique `events[]` (alimente la page « Suivre mon colis » / « Suivre ma vente », CA-ORD05). Accès : **acheteur, vendeur ou admin** ; tout autre compte → `404` (non-divulgation, CA-ORD05-06, §1.4).

**Réponse `200`** (exemple demandeur = acheteur, commande en livraison) :

```json
{
  "order": {
    "id": 51,
    "orderNumber": "CMD-000051",
    "amount": 250000,
    "commission": 25000,
    "sellerAmount": 225000,
    "status": "IN_DELIVERY",
    "role": "buyer",
    "product": { "id": 42, "name": "iPhone 13 128 Go", "slug": "iphone-13-128-go", "image": { "id": 88, "url": "/uploads/products/5f9e8c2a-....jpg" }, "price": 250000, "status": "SOLD" },
    "buyer": { "id": 3, "displayName": "Aicha123", "memberSince": 2026 },
    "seller": { "id": 8, "displayName": "JeanMarc", "memberSince": 2025, "sales": 1 },
    "payment": { "id": 60, "method": "MOBILE_MONEY", "status": "PAID", "reference": "REF-2026-01", "paidAt": "2026-09-20T10:30:00.000Z" },
    "deliveryCarrier": "DHL Côte d'Ivoire",
    "trackingNumber": "DHL-2026-000123",
    "events": [
      { "id": 101, "fromStatus": null, "toStatus": "CREATED", "actor": "system", "note": "Création de la commande", "createdAt": "2026-09-20T10:00:00.000Z" },
      { "id": 102, "fromStatus": "CREATED", "toStatus": "PAYMENT_PENDING", "actor": "system", "note": "Paiement en attente", "createdAt": "2026-09-20T10:00:00.010Z" },
      { "id": 103, "fromStatus": "PAYMENT_PENDING", "toStatus": "PAID", "actor": "admin", "note": null, "createdAt": "2026-09-20T10:30:00.000Z" },
      { "id": 104, "fromStatus": "PAID", "toStatus": "PRODUCT_WAITING", "actor": "system", "note": "Produit en attente", "createdAt": "2026-09-20T10:30:00.010Z" },
      { "id": 105, "fromStatus": "PRODUCT_WAITING", "toStatus": "PRODUCT_RECEIVED", "actor": "admin", "note": "Reçu en bon état", "createdAt": "2026-09-21T08:00:00.000Z" },
      { "id": 106, "fromStatus": "PRODUCT_RECEIVED", "toStatus": "PREPARING", "actor": "system", "note": "En préparation", "createdAt": "2026-09-21T08:00:00.010Z" },
      { "id": 107, "fromStatus": "PREPARING", "toStatus": "SHIPPED", "actor": "admin", "note": null, "createdAt": "2026-09-21T08:30:00.000Z" },
      { "id": 108, "fromStatus": "SHIPPED", "toStatus": "IN_DELIVERY", "actor": "admin", "note": null, "createdAt": "2026-09-21T09:00:00.000Z" }
    ],
    "createdAt": "2026-09-20T10:00:00.000Z"
  }
}
```

**Adaptation par rôle :**

| Élément | Vue `buyer` | Vue `seller` | Vue `admin` (= détail admin) |
|---|---|---|---|
| partie opposée | `seller` : `PublicUser` + `sales` | `buyer` : `PublicUser` **sans** `sales` (non exposé §2.1) | `buyer`/`seller` : `AdminUser` complet (nom/e-mail/téléphone — admin seulement) |
| `payment` | `method`, `status`, `reference`, `paidAt` (son paiement) | **sans `reference`** (la référence de paiement de l'acheteur ne concerne pas le vendeur) — `method`, `status`, `paidAt` | complet + `amount` |
| `deliveryCarrier` / `trackingNumber` | **visibles** (informations de suivi, CA-ORD05-02.4) | **visibles** (utiles au vendeur — décision V3, aucune donnée personnelle) | visibles |
| `events[]` (dont notes admin) | visibles (PO-4 — hors coordonnées, RG-ORD-6) | visibles | visibles |
| `sellerAmount` | présent | présent (le vendeur doit connaître son montant à recevoir) | présent |

**Erreurs :**

| Statut | Code | Message | Condition |
|---|---|---|---|
| `401` | `UNAUTHENTICATED` | « Vous devez être connecté » | session absente |
| `404` | `ORDER_NOT_FOUND` | « Commande introuvable » | id inexistant **ou** commande dont on n'est ni acheteur, ni vendeur, ni admin (non-divulgation §1.4, CA-ORD05-06) |
| `500` | `INTERNAL_ERROR` | « Erreur interne du serveur » | — |

---

### 3.5 Notifications (in-app, CA-NOT01)

#### `GET /api/me/notifications` — user

Liste paginée : **non lues d'abord**, puis `created_at DESC`. (Badge alimenté par `unreadCount` et par `GET /api/auth/me`.)

**Query params :** `page` (défaut 1), `per_page` (défaut 20, max 48), `unread_only` (`true`/`false`, optionnel).

**Réponse `200` :**

```json
{
  "items": [
    { "id": 77, "type": "article_approved", "title": "Votre article est en ligne", "message": "iPhone 13 128 Go", "read": false, "readAt": null, "createdAt": "2026-09-20T09:00:00.000Z" },
    { "id": 76, "type": "order_created", "title": "Commande CMD-000050 enregistrée", "message": "iPhone 12 Pro", "read": true, "readAt": "2026-09-20T08:00:00.000Z", "createdAt": "2026-09-20T07:55:00.000Z" }
  ],
  "unreadCount": 1,
  "page": 1,
  "perPage": 20,
  "total": 12,
  "totalPages": 1
}
```

**Erreurs :** `401`, `400 VALIDATION_ERROR` (params), `500`.

#### `POST /api/me/notifications/:id/read` — user

Marque **une** notification comme lue. **Idempotent** : si déjà lue, `200` sans changement (pas de course possible sur le badge — §9 architecture).

**Réponse `200` :** `{ "notification": { … §2.8, "read": true … } }`.

**Erreurs :**

| Statut | Code | Message | Condition |
|---|---|---|---|
| `401` | `UNAUTHENTICATED` | « Vous devez être connecté » | session absente |
| `404` | `NOTIFICATION_NOT_FOUND` | « Notification introuvable » | id inexistant **ou** notification d'un autre utilisateur (§1.4) |
| `500` | `INTERNAL_ERROR` | « Erreur interne du serveur » | — |

**Règle** : `UPDATE notifications SET read_at = now() WHERE id = $1 AND user_id = $2` (si `read_at` est déjà renseigné, l'UPDATE est sans effet → `200` idempotent).

#### `POST /api/me/notifications/read-all` — user

Marque **toutes** les notifications de l'utilisateur comme lues (confort badge).

**Réponse `200` :** `{ "updated": 5 }` (nombre de lignes réellement passées à lue).

**Erreurs :** `401`, `500`.

### 3.6 Administration (toutes les routes montent `requireAdmin` ; non-admin → `403 FORBIDDEN`)

```json
{ "error": { "code": "FORBIDDEN", "message": "Accès réservé à l'administration" } }
```

#### `DELETE /api/admin/products/:id` — admin (V5, C4/D7)

Suppression **logique** d'un article (CA-V5-056…065). **Route ajoutée en V5** : c'est le **seul** ajout de contrat autorisé par C5 sur le back-office.

| Statut | Code | Condition |
|---|---|---|
| `204` | — | Succès. **Sans corps.** La suppression répétée du même produit renvoie aussi `204` (idempotence — « jamais d'erreur sur le second appel », CA-V5-056) |
| `404` | `PRODUCT_NOT_FOUND` | Le `id` n'existe **pas** en base |
| `401` / `403` | `UNAUTHENTICATED` / `FORBIDDEN` | §1.3 |

**`409 PRODUCT_HAS_ACTIVE_ORDER`** : le produit a au moins une commande **active** (`CREATED`..`DELIVERED`). La source de vérité est **unique** (`ACTIVE_ORDER_STATUSES_SQL`), celle de `hasActiveOrder` : le bouton désactivé par l'UI et le refus du serveur ne peuvent pas diverger.

**Effets, tous dans la MÊME transaction** (P8) :
1. `UPDATE products SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL` — le garde `deleted_at IS NULL` évite de réécrire l'horodatage lors d'un second appel ;
2. notification in-app `article_deleted` au **vendeur** ;
3. trace `admin_actions.action = 'product.delete'` (traçabilité, filtrable via `GET /api/admin/history?action=product.delete`).

Si la transaction avorte, **aucun** de ces effets n'existe. Un verrou `FOR UPDATE` sérialise deux suppressions concurrentes du même produit.

**Conséquences visibles :**
- Le produit **disparaît** du catalogue public, de `GET /api/products/:slug` (`404`) et des listes ;
- il **reste lisible** dans le détail des commandes qui le concernent (exemption historique, `architecture-v5.md` §4.3 catégorie C) : une commande passée ne devient jamais inexplicable ;
- la colonne `products.contact` est **conservée** en base (non purgée), conformément à §2.5 de l'architecture.

> **Divergence assumée avec l'architecture** : `architecture-v5.md` §4.4 annonce « produit DÉJÀ supprimé → `404` », mais CA-V5-056 exige « supprimer deux fois → `204` puis `204` ». **Le critère testable l'emporte** : le `404` est réservé au produit *inexistant*, et la suppression répétée est un no-op. La divergence est signalée ici pour que le document d'architecture soit aligné.

#### `GET /api/admin/stats` — admin

Compteurs du dashboard, **recalculés à chaque appel** (CA-ADM01-01/02). Depuis V4 : 4 compteurs historiques **inchangés** (rétrocompat) + `payoutsDue`/`payoutsDueAmount` (nouveaux) + `orders` (répartition par statut, chaque clé comptée en un seul SELECT).

**Réponse `200` :**

```json
{
  "users": 12,
  "pendingProducts": 3,
  "activeOrders": 2,
  "pendingPayouts": 1,
  "payoutsDue": 1,
  "payoutsDueAmount": 225000,
  "orders": {
    "paymentPending": 1,
    "productWaiting": 0,
    "productReceived": 0,
    "preparing": 1,
    "shipped": 0,
    "inDelivery": 0,
    "delivered": 0,
    "completed": 1
  }
}
```

| Compteur | Définition SQL |
|---|---|
| `users` | `COUNT(*) WHERE role = 'user'` |
| `pendingProducts` | `COUNT(*) FROM products WHERE status = 'PENDING'` |
| `activeOrders` | `COUNT(*) FROM orders WHERE status NOT IN ('COMPLETED','CANCELLED','PAYMENT_FAILED')` (≡ statuts **actifs** `CREATED`..`DELIVERED` — cohérent avec l'index anti-double-commande DDL 003/007) |
| `pendingPayouts` | `COUNT(*) FROM seller_payouts WHERE status = 'PENDING'` (découplé du statut de commande depuis V3 — CHG-5 ; le join V2 sur `WAITING_SELLER_PAYMENT` disparaît) |
| `payoutsDue` **(V4)** | `COUNT(*) FROM seller_payouts WHERE status = 'DUE'` — dûs « À payer » (livrées non réglées) |
| `payoutsDueAmount` **(V4)** | `COALESCE(SUM(seller_payouts.amount) FILTER (WHERE status = 'DUE'), 0)` — montant total des dûs (FCFA) |
| `orders` **(V4)** | `COUNT(*) FILTER (WHERE status = …)` par statut du dashboard : `paymentPending`, `productWaiting`, `productReceived`, `preparing`, `shipped`, `inDelivery`, `delivered`, `completed` (clés ajoutées — les consommateurs existants ignorent les inconnues) |

**Erreurs :** `403` (non-admin), `401`, `500`.

---

#### `GET /api/admin/products?status=` — admin

Liste des articles pour la modération et le suivi. Query : `status` ∈ `PENDING`·`AVAILABLE`·`REJECTED`·`RESERVED`·`SOLD` (défaut `PENDING` — page « Articles en attente »), `q` (nom), `page`, `per_page`.

**Réponse `200` :**

```json
{
  "items": [
    {
      "id": 42,
      "name": "iPhone 13 128 Go",
      "slug": "iphone-13-128-go",
      "description": "...",
      "condition": "Très bon état",
      "price": 250000,
      "location": "Abidjan, Cocody",
      "status": "PENDING",
      "rejectionReason": null,
      "approvedAt": null,
      "images": [ { "id": 88, "url": "/uploads/products/5f9e8c2a-....jpg", "isPrimary": true, "position": 1 } ],
      "category": { "id": 3, "name": "Électronique", "slug": "electronique" },
      "subcategory": { "id": 13, "name": "Téléphones & tablettes", "slug": "electronique-telephones" },
      "owner": { "id": 8, "displayName": "JeanMarc", "name": "Jean-Marc Kouassi", "email": "jm@example.com", "phone": "+225 07 00 00 00 01", "memberSince": 2025, "productCount": 4 },
      "hasActiveOrder": false,
      "createdAt": "2026-09-20T08:00:00.000Z",
      "updatedAt": "2026-09-20T08:00:00.000Z"
    }
  ],
  "page": 1,
  "perPage": 12,
  "total": 3,
  "totalPages": 1
}
```

`owner` = vue `AdminUser` **sans** `orderCount` en liste (allié au détail si besoin). L'UI admin affiche « Utilisateur #8 » (maquette). Tri : `created_at ASC` pour `PENDING` (file de modération, premier soumis en premier), `created_at DESC` sinon.

**`hasActiveOrder` (V5, PO-V5-15) — champ additif :** booléen, `true` si le produit a au moins une commande à un statut **actif** (`CREATED`..`DELIVERED` — source unique : `ACTIVE_ORDER_STATUSES` / `ACTIVE_ORDER_STATUSES_SQL`).
- **But** : permettre à l'UI de **désactiver** le bouton « Supprimer » quand l'action échouerait en `409`, **sans requête par ligne** (RG-V5-08 : aucun bouton ne doit être proposé s'il ne peut pas être exécuté).
- **Strictement additif** : aucun autre champ n'est modifié, la forme de la charge utile est conservée (P5), et le champ n'est exposé **que** sur cette route — il n'est interrogé nulle part ailleurs.
- Les articles **supprimés logiquement** restent visibles ici avec `deletedAt` renseigné (traçabilité de modération) ; ils ne sont plus supprimables (`DELETE` renvoie `204` no-op).

**Erreurs :** `400 VALIDATION_ERROR` (status/params invalides), `401`, `403`, `500`.

---

#### `POST /api/admin/products/:id/approve` — admin

Approuve un article `PENDING` → `AVAILABLE` (D4 : une seule action, pas de 2e saisie).

**Corps :** aucun / `{}`.

**Réponse `200` :** `{ "product": <ProductAdmin> }` avec `status: "AVAILABLE"`, `approvedAt`, `rejectionReason: null`.

**Erreurs :**

| Statut | Code | Message | Condition |
|---|---|---|---|
| `404` | `PRODUCT_NOT_FOUND` | « Article introuvable » | id inexistant |
| `409` | `PRODUCT_NOT_PENDING` | « Cet article n'est plus en attente de validation » | statut ≠ `PENDING` (déjà approuvé/refusé/réservé/vendu) |
| `500` | `INTERNAL_ERROR` | « Erreur interne du serveur » | — |

**Règles métier (transaction)** : `UPDATE products SET status='AVAILABLE', approved_at = now(), approved_by = $admin, rejection_reason = NULL` + `INSERT admin_actions` (`action='product.approved'`, `target_type='product'`, `description` = « Article approuvé — <nom> ») + `INSERT notifications` **N2** vendeur (`article_approved`, « Votre article est en ligne ») — CA-ADM02-02/04.

---

#### `POST /api/admin/products/:id/reject` — admin

Refuse un article `PENDING` → `REJECTED`, **motif obligatoire** (CA-ADM02-03).

**Corps (JSON) :**

```json
{ "reason": "Photos insuffisantes" }
```

`reason` ∈ **liste fermée** RG-REFUS : `Photos insuffisantes` · `Description incorrecte` · `Article en trop mauvais état` · `Produit interdit` · `Informations incomplètes` · `Prix incohérent`.

**Réponse `200` :** `{ "product": <ProductAdmin> }` avec `status: "REJECTED"`, `rejectionReason` renseigné.

**Erreurs :**

| Statut | Code | Message | Condition |
|---|---|---|---|
| `400` | `INVALID_REJECTION_REASON` | « Motif de refus invalide » | motif absent, vide ou hors liste fermée (bloquant — CA-ADM02-03) |
| `404` | `PRODUCT_NOT_FOUND` | « Article introuvable » | id inexistant |
| `409` | `PRODUCT_NOT_PENDING` | « Cet article n'est plus en attente de validation » | statut ≠ `PENDING` |
| `500` | `INTERNAL_ERROR` | « Erreur interne du serveur » | — |

**Règles métier (transaction)** : `UPDATE products SET status='REJECTED', rejection_reason = $reason` + `INSERT admin_actions` (`action='product.rejected'`, `description` = « Article refusé — <nom> — <motif> ») + `INSERT notifications` **N2b** vendeur (`article_rejected`, « Article refusé : <motif> », message = raison) — CA-ADM02-03/04. Le vendeur voit ensuite `rejectionReason` dans `GET /api/me/products` (CA-SELL02-02).

---

#### `GET /api/admin/orders?status=&payout=` — admin

Liste des commandes (CA-ADM03-01, CA-ORD07-01). Query : `status` ∈ les **12 valeurs** `orders.status` (défaut : **toutes**), `payout` ∈ `pending`·`due`·`paid` (optionnel — filtre sur `seller_payouts.status`, **V4**), `page`, `per_page`. → La page « Paiements vendeurs » de l'UI = `GET /api/admin/orders?payout=due` (CA-ADM04-01, CHG-10 — ne dépend plus d'un statut de commande ; filtre par défaut « À payer », conforme spec-admin §6-5 — c'est l'action quotidienne) ; `payout=pending` liste les en attente de confirmation, `payout=paid` l'historique réglé.

**Réponse `200` :**

```json
{
  "items": [
    {
      "id": 51,
      "orderNumber": "CMD-000051",
      "amount": 250000,
      "commission": 25000,
      "sellerAmount": 225000,
      "status": "PRODUCT_RECEIVED",
      "createdAt": "2026-09-20T10:00:00.000Z",
      "updatedAt": "2026-09-20T10:30:00.000Z",
      "product": { "id": 42, "name": "iPhone 13 128 Go", "slug": "iphone-13-128-go", "image": { "id": 88, "url": "/uploads/products/5f9e8c2a-....jpg" } },
      "buyer": { "id": 3, "displayName": "Aicha123", "name": "Aïcha Koné", "email": "aicha@example.com", "phone": "+225 07 00 00 00 00" },
      "seller": { "id": 8, "displayName": "JeanMarc", "name": "Jean-Marc Kouassi", "email": "jm@example.com", "phone": "+225 07 00 00 00 01" },
      "payment": { "id": 60, "amount": 250000, "method": "MOBILE_MONEY", "status": "PAID", "reference": "REF-2026-01", "paidAt": "2026-09-20T10:30:00.000Z" },
      "payout": { "id": 3, "amount": 225000, "status": "PENDING", "reference": null, "paidAt": null }
    }
  ],
  "page": 1,
  "perPage": 12,
  "total": 1,
  "totalPages": 1
}
```

- `buyer`/`seller` en vue `AdminUser` (l'admin voit tout, §7.7) ; `payout` = dernier état du `seller_payouts` (ligne créée au `confirm-payment`, `null` avant). Le filtre `payout=pending` alimente la page « Paiements vendeurs » (CA-ADM04-01, CHG-10).
- Tri : `created_at DESC`.

**Erreurs :** `400 VALIDATION_ERROR`, `401`, `403`, `500`.

---

#### `GET /api/admin/orders/:id` — admin

Détail complet d'une commande (= item de liste enrichi : `buyer`/`seller` en `AdminUser` complet, produit en `ProductAdmin`, **`events[]`** — journal complet avec les notes des transitions, CA-ORD07-02 — et `deliveryCarrier`/`trackingNumber`). C'est l'écran des **actions du cycle de vie** : le front active/désactive les actions selon `status` (préconditions des routes POST ci-dessous, matrice Annexe A.2).

**Réponse `200` :** `{ "order": { … même forme que l'item de liste, enrichi de "events": [ <OrderEvent> ], "deliveryCarrier": …, "trackingNumber": … } }`.

**Erreurs :** `404 ORDER_NOT_FOUND`, `401`, `403`, `500`.

---

#### `POST /api/admin/orders/:id/confirm-payment` — admin

« Paiement reçu » : valide le paiement hors-ligne de l'acheteur (D1, D6). **Transaction** unique + verrou de ligne (CA-ADM03-03/05).

**Corps (JSON) :**

| Champ | Type | Contraintes |
|---|---|---|
| `method` | string | **obligatoire**, ∈ `MOBILE_MONEY` · `CASH` · `BANK_TRANSFER` · `OTHER` |
| `reference` | string | optionnel, ≤ 255 (par ex. n° de transaction Mobile Money) |

**Exemple :**

```json
{ "method": "MOBILE_MONEY", "reference": "REF-2026-01" }
```

**Réponse `200` :** `{ "order": <détail admin> }` avec `status: "PRODUCT_WAITING"`, `payment.status: "PAID"`, `product.status: "SOLD"`, `payout.status: "PENDING"`, et `events[]` contenant `(PAYMENT_PENDING → PAID, admin)` puis `(PAID → PRODUCT_WAITING, system)` (D-V3-4).

**Erreurs :**

| Statut | Code | Message | Condition |
|---|---|---|---|
| `400` | `VALIDATION_ERROR` | « Données invalides » + `details` | `method` absent/hors enum, `reference` > 255 |
| `404` | `ORDER_NOT_FOUND` | « Commande introuvable » | id inexistant |
| `409` | `INVALID_TRANSITION` | « Transition impossible : le statut actuel ne permet pas cette action » + `currentStatus` | `orders.status ≠ PAYMENT_PENDING` (déjà confirmée, expirée, annulée… — bouton inactif, CA-ADM03-03/05, T15 ; D-V3-5) |
| `500` | `INTERNAL_ERROR` | « Erreur interne du serveur » | — |

**Règles métier — une seule transaction (`SELECT … FOR UPDATE` sur `orders` + `payments`) :**
1. Vérifier `status = 'PAYMENT_PENDING'` (sinon rollback → `409 INVALID_TRANSITION` — deux admins ne peuvent pas confirmer deux fois, CA-ADM03-05 ; la **libération d'expiration** paresseuse a priorité — D-V3-6).
2. `UPDATE orders SET status = 'PAID'` (event `(PAYMENT_PENDING → PAID, admin)` — trigger DDL 003) puis `UPDATE orders SET status = 'PRODUCT_WAITING'` (event `(PAID → PRODUCT_WAITING, system)`).
3. `UPDATE products SET status = 'SOLD', sold_at = now()` (vente définitive, D5 — compté dans `sales` vendeur).
4. `UPDATE payments SET status = 'PAID', method = $method, reference = $ref, paid_at = now()` (D6 : jamais de champ séparé sur `orders`).
5. `INSERT seller_payouts (order_id, seller_id, amount = orders.seller_amount, status = 'PENDING', paid_by = NULL)` → la commande entre dans « Paiements vendeurs » (visible via `payout=pending`, CA-ADM04-01).
6. `INSERT admin_actions` (`action='payment.confirmed'`, `description` = « Paiement acheteur confirmé — CMD-000051 — 250 000 FCFA »).
7. `INSERT notifications` **N4** acheteur (`payment_confirmed`, « Paiement confirmé pour CMD-000051 ») **et** **N9** vendeur (`order_product_waiting`, « Produit en attente pour CMD-000051 ») — CA-ADM03-04, CHG-8.
8. `COMMIT` (le déclencheur d'enchaînement DDL 003 a déjà créé les 2 events).

---

#### `POST /api/admin/orders/:id/mark-product-received` — admin

« Produit reçu » : l'admin confirme la réception physique du produit (début de la préparation livraison). **Transaction** unique (CA-ORD03-01).

**Corps (JSON) :** `{ "note"?: "≤ 500, ex. état du produit" }` (optionnel — visible de l'acheteur et du vendeur via `events[]`, PO-4 ; **aucune donnée personnelle** — RG-ORD-6).

**Réponse `200` :** `{ "order": <détail admin> }` avec `status: "PREPARING"` et `events[]` contenant `(PRODUCT_WAITING → PRODUCT_RECEIVED, admin, $note)` puis `(PRODUCT_RECEIVED → PREPARING, system, 'En préparation')`.

**Erreurs :**

| Statut | Code | Message | Condition |
|---|---|---|---|
| `400` | `VALIDATION_ERROR` | « Données invalides » + `details` | `note` > 500 |
| `404` | `ORDER_NOT_FOUND` | « Commande introuvable » | id inexistant |
| `409` | `INVALID_TRANSITION` | « Transition impossible : le statut actuel ne permet pas cette action » + `currentStatus` | `orders.status ≠ PRODUCT_WAITING` (D-V3-5) |
| `500` | `INTERNAL_ERROR` | « Erreur interne du serveur » | — |

**Règles métier — une seule transaction :**
1. Vérifier `status = 'PRODUCT_WAITING'` (sinon rollback → `409`).
2. `UPDATE orders SET status = 'PRODUCT_RECEIVED'` (event `(PRODUCT_WAITING → PRODUCT_RECEIVED, admin, $note)`) puis `UPDATE orders SET status = 'PREPARING'` (event `(PRODUCT_RECEIVED → PREPARING, system, 'En préparation')` — D-V3-4).
3. `INSERT admin_actions` (`action='product.received'`).
4. `INSERT notifications` **N10** acheteur (`order_product_received`, « Produit reçu, préparation en cours pour CMD-000051 »).
5. `COMMIT`.

---

#### `POST /api/admin/orders/:id/mark-shipped` — admin (V4)

« Prête / Expédiée » : l'admin marque la commande prête à partir, l'acheteur est prévenu que son colis est prêt. **Transaction** unique (CA-ORD04-00 V4).

**Corps :** aucun / `{}`.

**Réponse `200` :** `{ "order": <détail admin> }` avec `status: "SHIPPED"` et `events[]` contenant `(PREPARING → SHIPPED, admin)`.

**Erreurs :**

| Statut | Code | Message | Condition |
|---|---|---|---|
| `404` | `ORDER_NOT_FOUND` | « Commande introuvable » | id inexistant |
| `409` | `INVALID_TRANSITION` | « Transition impossible : le statut actuel ne permet pas cette action » + `currentStatus` | `orders.status ≠ PREPARING` (D-V3-5) |
| `500` | `INTERNAL_ERROR` | « Erreur interne du serveur » | — |

**Règles métier — une seule transaction :**
1. Vérifier `status = 'PREPARING'` (sinon rollback → `409`).
2. `UPDATE orders SET status = 'SHIPPED'` → event `(PREPARING → SHIPPED, admin)` (trigger DDL 007).
3. `INSERT admin_actions` (`action='order.shipped'`).
4. `INSERT notifications` **N11bis** acheteur (`order_shipped`, « Votre colis est prêt pour CMD-000051 »).
5. `COMMIT`.

---

#### `POST /api/admin/orders/:id/start-delivery` — admin

« Lancer la livraison » : l'admin enregistre transporteur + n° de suivi (PO-6, CA-ORD04-01). **Transaction** unique. Depuis V4, cette étape exige `SHIPPED` (le `PREPARING` ne suffit plus).

**Corps (JSON) :**

| Champ | Type | Contraintes |
|---|---|---|
| `carrier` | string | optionnel, ≤ 100 (ex. « DHL Côte d'Ivoire ») |
| `trackingNumber` | string | optionnel, ≤ 100 |

**Exemple :**

```json
{ "carrier": "DHL Côte d'Ivoire", "trackingNumber": "DHL-2026-000123" }
```

**Réponse `200` :** `{ "order": <détail admin> }` avec `status: "IN_DELIVERY"`, `deliveryCarrier`/`trackingNumber` renseignés, event `(SHIPPED → IN_DELIVERY, admin)`.

**Erreurs :**

| Statut | Code | Message | Condition |
|---|---|---|---|
| `400` | `VALIDATION_ERROR` | « Données invalides » + `details` | champ > 100 ou type invalide (les valeurs restent **optionnelles** — V3 ; le contrat esquisse V1 les requérait) |
| `404` | `ORDER_NOT_FOUND` | « Commande introuvable » | id inexistant |
| `409` | `INVALID_TRANSITION` | « Transition impossible : le statut actuel ne permet pas cette action » + `currentStatus` | `orders.status ≠ SHIPPED` (V4 — D-V3-5) |
| `500` | `INTERNAL_ERROR` | « Erreur interne du serveur » | — |

**Règles métier — une seule transaction :**
1. Vérifier `status = 'SHIPPED'` (sinon rollback → `409`).
2. `UPDATE orders SET status = 'IN_DELIVERY', delivery_carrier = $carrier, tracking_number = $trackingNumber` → event `(SHIPPED → IN_DELIVERY, admin)` (trigger DDL 007).
3. `INSERT admin_actions` (`action='delivery.started'`).
4. `INSERT notifications` **N11** acheteur (`order_in_delivery`, « Votre colis est en livraison, suivi : <trackingNumber> »).
5. `COMMIT`.

---

#### `POST /api/admin/orders/:id/mark-delivered` — admin

« Livrée » : l'admin confirme la livraison à l'acheteur (CA-ORD04-02). **Transaction** unique.

**Corps :** aucun / `{}`.

**Réponse `200` :** `{ "order": <détail admin> }` avec `status: "COMPLETED"`, `payout.status: "DUE"` (**V4** — le dû vendeur devient payable), `events[]` contenant `(IN_DELIVERY → DELIVERED, admin, 'Livrée')` puis `(DELIVERED → COMPLETED, system, 'Commande terminée')`.

**Erreurs :**

| Statut | Code | Message | Condition |
|---|---|---|---|
| `404` | `ORDER_NOT_FOUND` | « Commande introuvable » | id inexistant |
| `409` | `INVALID_TRANSITION` | « Transition impossible : le statut actuel ne permet pas cette action » + `currentStatus` | `orders.status ≠ IN_DELIVERY` (D-V3-5) |
| `500` | `INTERNAL_ERROR` | « Erreur interne du serveur » | — |

**Règles métier — une seule transaction :**
1. Vérifier `status = 'IN_DELIVERY'` (sinon rollback → `409`).
2. `UPDATE orders SET status = 'DELIVERED'` (event `(IN_DELIVERY → DELIVERED, admin)`) puis `UPDATE orders SET status = 'COMPLETED'` (event `(DELIVERED → COMPLETED, system)` — D-V3-4).
3. `UPDATE seller_payouts SET status = 'DUE' WHERE order_id = $1 AND status = 'PENDING'` (**V4** — le dû devient payable ; sans effet si payout déjà `DUE`/`PAID`, idempotent).
4. `INSERT admin_actions` (`action='order.delivered'`).
5. `INSERT notifications` **N12** acheteur (`order_delivered`, « Votre commande CMD-000051 est livrée ») **et** **N13** vendeur (`order_completed`, « Commande CMD-000051 terminée — le paiement vendeur est disponible »).
6. `COMMIT`.

---

#### `POST /api/admin/orders/:id/cancel` — admin

« Annuler » : annule une commande **non payée** (CA-ORD08-01). **Transaction** unique.

**Corps (JSON) :** `{ "note": "<raison, 1..500 — obligatoire>" }`.

**Réponse `200` :** `{ "order": <détail admin> }` avec `status: "CANCELLED"`, `product.status: "AVAILABLE"`, event `(PAYMENT_PENDING → CANCELLED, admin, $note)`.

**Erreurs :**

| Statut | Code | Message | Condition |
|---|---|---|---|
| `400` | `VALIDATION_ERROR` | « Données invalides » + `details` | `note` absent/vide ou > 500 |
| `404` | `ORDER_NOT_FOUND` | « Commande introuvable » | id inexistant |
| `409` | `INVALID_TRANSITION` | « Transition impossible : le statut actuel ne permet pas cette action » + `currentStatus` | `orders.status ≠ PAYMENT_PENDING` (au-delà, la commande est engagée jusqu'à `COMPLETED` — matrice Annexe A.2, D-V3-5) |
| `500` | `INTERNAL_ERROR` | « Erreur interne du serveur » | — |

**Règles métier — une seule transaction :**
1. Vérifier `status = 'PAYMENT_PENDING'` (sinon rollback → `409`).
2. `UPDATE orders SET status = 'CANCELLED'` → event `(PAYMENT_PENDING → CANCELLED, admin, $note)` (note obligatoire, CA-ORD08-01 ; visible de l'acheteur — PO-4, **sans données personnelles**, RG-ORD-6).
3. `UPDATE payments SET status = 'FAILED'` (aucun débit opéré — décision d'API, §7 Arbitrages ; `payments.status` reste cohérent : ni payable ni payée).
4. `UPDATE products SET status = 'AVAILABLE', reserved_at = NULL, reserved_until = NULL` (l'article revient en vente, CA-ORD08-02).
5. `INSERT admin_actions` (`action='order.cancelled'`, `description` = « Commande CMD-000051 annulée — <note> »).
6. **Aucune notification** (pas de type dédié dans le DDL 003 — visible dans le détail commande).
7. `COMMIT`.

---

#### `POST /api/admin/orders/:id/seller-payout` — admin

« Payer le vendeur » : enregistre le reversement du dû (prix − commission) **sans** changer `orders.status` (CHG-5, CA-ORD07-05) et **sans** event (D-V3-3/-4). **Transaction** unique + verrous (CA-ADM04-02/04).

**Corps (JSON) :** `{ "reference"?: "<≤255, ex. reversement Mobile Money>" }` (optionnel).

**Réponse `200` :** `{ "order": <détail admin> }` avec `payout.status: "PAID"`, `payout.paidAt` renseigné, `status` **inchangé** (ex. `COMPLETED` si déjà livrée), `product.status: "SOLD"` inchangé.

**Erreurs :**

| Statut | Code | Message | Condition |
|---|---|---|---|
| `400` | `VALIDATION_ERROR` | « Données invalides » + `details` | `reference` > 255 |
| `404` | `ORDER_NOT_FOUND` | « Commande introuvable » | id inexistant |
| `409` | `PAYOUT_NOT_PENDING` | « Paiement vendeur indisponible ou déjà effectué » | aucun payout OU `seller_payouts.status = 'PAID'` (jamais payer deux fois, CA-ADM04-04 — garde testée en premier, rétrocompat V3) |
| `409` | `ORDER_NOT_ALLOWED` | « Paiement vendeur non autorisé pour cette commande » + `currentStatus` | `orders.status ∉ {DELIVERED, COMPLETED}` (**V4** — commande **livrée** exigée ; un payout encore `PENDING` sur commande non livrée tombe ici, avant le test du DUE — RG-ORD-7) |
| `409` | `PAYOUT_NOT_PENDING` | « Paiement vendeur pas encore dû (livraison non confirmée) » | `seller_payouts.status ≠ 'DUE'` (défensif — la chaîne nominale fait `PENDING → DUE` au `mark-delivered`) |
| `500` | `INTERNAL_ERROR` | « Erreur interne du serveur » | — |

**Règles métier — une seule transaction (`SELECT … FOR UPDATE` sur `orders` + `seller_payouts`) :**
1. Gardes successives (dans cet ordre)
   a. aucun payout OU `status = 'PAID'` → `409 PAYOUT_NOT_PENDING` ;
   b. `orders.status ∉ {DELIVERED, COMPLETED}` → `409 ORDER_NOT_ALLOWED` + `currentStatus` ;
   c. `seller_payouts.status ≠ 'DUE'` → `409 PAYOUT_NOT_PENDING` (défensif).
2. `UPDATE seller_payouts SET status = 'PAID', paid_at = now(), paid_by = $admin, reference = $ref WHERE order_id = $1 AND status = 'DUE'` (montant = `orders.seller_amount` = prix − commission, ex. 225 000 FCFA pour 250 000 — CA-ADM04-03).
3. **Aucun** `UPDATE orders.status` sur cette route (CHG-5) → **aucun** event `order_events` (D-V3-4).
4. `INSERT admin_actions` (`action='seller.paid'`, `description` = « Vendeur payé — CMD-000051 — 225 000 FCFA »).
5. `INSERT notifications` **N6** vendeur (`seller_paid`, « Paiement reçu : 225 000 FCFA pour CMD-000051 ») **et** **N8** vendeur (`article_sold`, « Votre article a été vendu ») — deux lignes distinctes (§10).
6. `COMMIT`.

> **Route dépréciée `POST /api/admin/orders/:id/pay-seller`** (V2) : renommée `seller-payout` en V3 (CHG-8). L'ancien chemin répond `410 GONE` avec `{ "error": { "code": "ROUTE_DEPRECATED", "message": "Route renommée : POST /api/admin/orders/:id/seller-payout" } }` (migration progressive des clients — §1.2).

---

#### `GET /api/admin/users` — admin

Liste **lecture seule** des utilisateurs (CA-ADM05 ; aucune modification en V1 — point ouvert §12.7). Query : `q` (recherche `displayName`/`email`/`phone`), `page`, `per_page` (défaut 20).

**Réponse `200` :**

```json
{
  "items": [
    {
      "id": 3,
      "displayName": "Aicha123",
      "name": "Aïcha Koné",
      "email": "aicha@example.com",
      "phone": "+225 07 00 00 00 00",
      "role": "user",
      "memberSince": 2026,
      "createdAt": "2026-09-20T10:00:00.000Z",
      "productCount": 2,
      "orderCount": 7
    }
  ],
  "page": 1,
  "perPage": 20,
  "total": 12,
  "totalPages": 1
}
```

`productCount` = articles possédés (tous statuts) ; `orderCount` = commandes en tant qu'acheteur. **Erreurs :** `400`, `401`, `403`, `500`.

---

#### `GET /api/admin/history` — admin

Journal `admin_actions`, tri `created_at DESC` (CA-ADM07 — « qui a fait quoi, quand »). Query : `action` ∈ `product.approved`·`product.rejected`·`product.delete`·`payment.confirmed`·`product.received`·`delivery.started`·`order.shipped`·`order.delivered`·`order.cancelled`·`seller.paid`·**`category.update`**, `target_type` ∈ `product`·`order`·**`category`**, `page`, `per_page` (défaut 20, max 48). Les alias en snake_case documentés par l'API (`per_page`, `target_type`) sont acceptés **et** normalisés côté serveur (comme sur `/api/me/*`) : les quatre routes admin paginées (`products`, `orders`, `users`, `history`) supportent indifféremment `per_page`/`perPage` et `target_type`/`targetType`.

**Réponse `200` :**

```json
{
  "items": [
    {
      "id": 12,
      "admin": { "id": 1, "displayName": "Administrateur", "email": "admin@revends.com" },
      "action": "seller.paid",
      "targetType": "order",
      "targetId": 51,
      "description": "Vendeur payé — CMD-000051 — 225 000 FCFA",
      "createdAt": "2026-09-20T11:00:00.000Z"
    },
    {
      "id": 11,
      "admin": { "id": 1, "displayName": "Administrateur", "email": "admin@revends.com" },
      "action": "product.approved",
      "targetType": "product",
      "targetId": 42,
      "description": "Article approuvé — iPhone 13 128 Go",
      "createdAt": "2026-09-20T09:00:00.000Z"
    }
  ],
  "page": 1,
  "perPage": 20,
  "total": 4,
  "totalPages": 1
}
```

**Erreurs :** `400`, `401`, `403`, `500`.

---

### 3.5.1 E-mails transactionnels (V5, C1)

9 déclencheurs / 11 envois (PO-V5-14). **Aucun n'ajoute de notification in-app** : les emails s'ajoutent *à côté* de l'existant, jamais à la place (CA-V5-010). Le vendeur d'une réservation expirée, lui, est prévenu **par email seul** — c'est le seul cas où l'information n'existe que par e-mail.

| # | Déclencheur | Événement endpoint | Destinataire(s) | Objet |
|---|---|---|---|---|
| E1 | Inscription | `POST /api/auth/register` | nouvel utilisateur | « Bienvenue sur ReVends » |
| E2 | Article approuvé | `POST /api/admin/products/:id/approve` | vendeur | « Votre article est approuvé » |
| E3 | Article refusé | `POST /api/admin/products/:id/reject` | vendeur | « Votre article a été refusé » (+ motif) |
| E4 | Commande payée | `POST /api/admin/orders/:id/confirm-payment` | **acheteur** | « Commande confirmée » |
| E5 | Commande payée | idem | **vendeur** | « Votre vente est confirmée » |
| E6 | Colis expédié | `POST /api/admin/orders/:id/mark-shipped` | acheteur | « Votre colis est expédié » |
| E7 | Commande livrée | `POST /api/admin/orders/:id/mark-delivered` | acheteur | « Votre commande est livrée » |
| E8 | Paiement vendeur disponible | idem | **vendeur** | « Votre paiement est disponible » |
| E9 | Paiement vendeur versé | `POST /api/admin/orders/:id/seller-payout` | **vendeur** | « Votre paiement a été versé » |
| E10 | Réservation expirée | job d'expiration (`expire-reservations`) | **acheteur + vendeur** (2 envois) | « Votre réservation a expiré » |
| E11 | Palier de parrainage atteint | `POST /api/admin/products/:id/approve` (1er article d'un filleul) | **parrain** | « Votre Cercle s'agrandit » (paliers 5 et 10, **un seul envoi par franchissement** — §3.8) |

> **Hors requête HTTP** : `referral_program_launch` (« Le Cercle des 10 ») n'est déclenché par **aucun endpoint** — c'est une campagne e-mail opérée par le script `server/scripts/send-referral-campaign.mts` (`--dry-run`, `--only`, `--limit`, `--campaign-key`). Anti-doublon : une ligne `notification_deliveries` par `(campagne:userId, canal)`, insérée en `ON CONFLICT DO NOTHING` ; relancer le script ne renvoie jamais deux fois le même message.

**Règles opposables :**

- **Après COMMIT, jamais avant** (P8, CA-V5-003) : si la transaction métier avorte, l'email **n'est pas envoyé**. Le commit le plus externe déclenche l'envoi ; un commit interne ne le fait pas.
- **Best-effort** : un échec SMTP n'a **jamais** d'effet sur la réponse HTTP. L'action métier répond `2xx` quoi qu'il arrive du SMTP.
- **Désactivable** : `MAIL_ENABLED=false` → aucun envoi, **action métier et notifications in-app inchangées**. Usine = feature off, pas feature cassée.
- **Destinataire résolu en base par identifiant** (CA-V5-011), jamais depuis le corps de requête. Si le compte disparaît entre la résolution et l'envoi → envoi **ignoré silencieusement**, sans erreur.
- **Aucune donnée de tiers** : ni e-mail, ni téléphone, ni adresse, ni prix d'une commande appartenant à quelqu'un d'autre. Chaque destinataire ne voit que **sa** commande.
- **Échappement** (CA-V5-018) : toute donnée saisie par un utilisateur (nom d'article, motif de refus) est échappée dans la version HTML et rendue **literalement** dans la version texte.
- **Liens internes uniquement** (CA-V5-009) : les liens des emails sont construits depuis `SITE_URL` + un chemin interne. Aucune URL externe n'est émise ; un chemin ne peut pas détourner le lien vers un autre domaine.
- **Format** : chaque email existe en version **HTML** et **texte brut**.

**Configuration (variables d'environnement, non exposées par l'API) :**

| Variable | Défaut | Rôle |
|---|---|---|
| `MAIL_ENABLED` | `false` | Coupe tous les envois |
| `MAIL_HOST` / `MAIL_PORT` / `MAIL_SECURE` | — / `587` / `false` | Transport SMTP |
| `MAIL_USER` / `MAIL_PASSWORD` | — | Authentification SMTP |
| `MAIL_FROM` | — | Adresse d'expéditeur |
| `SITE_URL` | `http://localhost:5180` | Base des liens internes |

> **Fail-fast en production** : si `NODE_ENV=production` et `MAIL_ENABLED=true`, l'absence de `MAIL_HOST`, `MAIL_USER`, `MAIL_PASSWORD` ou `MAIL_FROM` **fait échouer le démarrage** avec un message explicite. Une erreur de configuration doit être visible au déploiement, pas une panne silencieuse à chaque envoi.

### 3.7 Technique

#### `GET /health` et `GET /api/health` — public

Health check de déploiement (§7.3 architecture). **Réponse `200` :** `{ "status": "ok" }` (le serveur répond aussi si la BDD est injoignable ; un échec → `500`).

Les deux chemins sont montés **avant** le rate limiter : une sonde de déploiement ne doit jamais pouvoir recevoir de `429` (D8). Ni l'un ni l'autre ne coûte de requête authentifiée.

#### Rate limiting (V5, D8)

| Portée | Limite | Fenêtre | Dépassement |
|---|---|---|---|
| `/api/auth/*` | 20 req / IP | 10 min (fixe) | `429 RATE_LIMITED` |
| `/api/*` (reste) | 300 req / IP | 1 min (fixe) | `429 RATE_LIMITED` |

**Réponse `429` :** `{ "error": { "code": "RATE_LIMITED", "message": "Trop de requêtes, réessayez dans N minute(s)" } }`, accompagnée du header **`Retry-After`** en secondes. Le délai annoncé et le header correspondent à **la fenêtre du limiteur qui a bloqué** (1 min pour le global, 10 min pour l'authentification) : le message n'est pas une constante en dur.

- **Exemptes** : `/health`, `/api/health` (montées avant le limiteur) et `/uploads/**` (statique, hors périmètre D8).
- **Par IP**, en mémoire, **par instance**. Les compteurs auth et global sont **deux `Map` distinctes** → c'est la limite la plus stricte qui s'applique, sans collision de clés.
- ⚠️ **Limite d'échelle assumée (PO-V5-17)** : le compteur est **local à l'instance**. Passer à 2 instances ou plus **exige** un compteur partagé (Redis) **avant** mise en production, sinon la limite devient partiellement inopérante sur l'instance la moins chargée. Documenté ici parce que c'est une dette connue, pas un oubli.
- En `NODE_ENV=test`, le limiteur est **bypassé** (les tests ne doivent pas dépendre d'un compteur partagé).

#### `Cache-Control` (V5, PO-V5-07)

| Routes | En-tête |
|---|---|
| `GET /api/categories`, `GET /api/banners` | `public, max-age=60, stale-while-revalidate=120` |
| Toutes les autres `/api/*` | `private, no-store` |

Seules des données **publiques et identiques pour tous** sont mises en cache public. Toute réponse liée à une session est `private, no-store` : un cache partagé ne doit jamais pouvoir servir la donnée d'un utilisateur à un autre. L'en-tête ne modifie aucune forme de réponse (P5).

### 3.8 Parrainage — « Le Cercle des 10 » (V6, privé)

Un vendeur invite des pairs avec son code personnel : à **10 filleuls validés**, il reçoit le badge **Ambassadeur** (1 an) et **30 jours de Vitrine** (mise en avant au tri par défaut du catalogue). Palier intermédiaire : **5 filleuls** → badge **30 jours** + **7 jours de Vitrine**. La commission vendeur (**10 %**) ne change jamais : un parrainage récompense la croissance, il ne touche pas au modèle économique.

#### `GET /api/referrals/me` — session (`requireAuth`)

Route **privée** : un code de parrainage permet de rattacher des filleuls, il n'a rien à faire dans une réponse publique. Aucune donnée de filleul (nom, e-mail, numéro) n'est jamais renvoyée — seulement un **compteur**.

**Réponse `200` :**

```json
{
  "code": "RV3F9A2B7C",
  "qualified": 3,
  "target": 10,
  "badgeTarget": 5,
  "badgeActive": false,
  "badgeUntil": null,
  "vitrineActive": false,
  "vitrineUntil": null,
  "remaining": 7
}
```

| Champ | Type | Sens |
|---|---|---|
| `code` | string | Code **personnel** du demandeur (`RV` + 8 hexadécimaux). Créé à la demande si absent — jamais `null` pour un compte existant |
| `qualified` | int ≥ 0 | Filleuls **validés** (pas les inscriptions) |
| `target` | int | `10` — entrée dans le Cercle |
| `badgeTarget` | int | `5` — premier palier |
| `badgeActive` | boolean | Badge **actif maintenant** (`ambassador_until > now()`) |
| `badgeUntil` | ISO 8601 \| null | Fin du badge, `null` si jamais obtenu ou expiré |
| `vitrineActive` | boolean | Vitrine **active maintenant** (`vitrine_until > now()`) |
| `vitrineUntil` | ISO 8601 \| null | Fin de la Vitrine |
| `remaining` | int ≥ 0 | `max(0, target − qualified)` — **jamais négatif**, même au-delà de 10 |

**Erreurs :** `401 UNAUTHENTICATED` (aucune session). `requireAuth` et non `requireUser` : le garde **client** `RequireUser` admet un admin connecté sur les pages de son espace ; refuser ici l'admin produirait un `403` sur une page que l'interface vient d'ouvrir. Un admin a lui aussi un profil, donc un code.

**Compromis assumé** : le code est visible par le compte qui le détient et par personne d'autre. Il n'est pas un secret cryptographique (il circule dans un lien `?ref=` partageable), mais il n'est pas énumérable utilement : le rattachement exige une **inscription réussie**, et un code inconnu est ignoré.

#### Règles de qualification (opposables)

1. Un filleul est validé à l'approbation de son PREMIER article** (`POST /api/admin/products/:id/approve`), jamais à l'inscription. Un compte vide, un faux compte ou un article refusé ne crédite aucun parrain (anti-fraude).
2. Idempotence** : `referral_qualifications.referee_id` est `UNIQUE`, l'insertion est un `ON CONFLICT DO NOTHING`. Rejouer l'approbation, ou approuver un second article du même filleul, ne recrédite jamais.
3. Un filleul = un seul parrain**, un parrain crédité une seule fois par filleul. Auto-parrainage impossible (`CHECK`, et `referred_by = userId` refusé).
4. Rattrapage** : un compte existant qui s'inscrit avec un `ref` alors qu'il a déjà un article approuvé est qualifié **immédiatement**, sans attendre une future approbation.
5. Paliers** : à 5 → badge 30 j + Vitrine 7 j ; à 10 → badge 1 an + Vitrine 30 j. Le franchissement envoie **un** e-mail (`referral_milestone`), pas dix. Un échec d'envoi ne défait jamais la qualification.
6. La Vitrine ne touche pas aux tris explicites** : elle ne départage que le tri par défaut (`recent`) de `GET /api/products`, et **jamais** un `sort` choisi par l'acheteur (§3.2). Hors fenêtre d'activité, elle n'a aucun effet.
7. Badge** : exposé comme `ambassador: true` uniquement s'il est actif. Aucun champ `false`, aucune date exposée dans les vues publiques — un consommateur ne doit jamais interpréter une date expirée.

---


### 3.9 V7 — Hébergement vendeurs (v2.7, additif)

Source détaillée (corps, réponses JSON, simulation de tous les chemins 2xx/4xx/5xx) : **`docs/api-v7-hebergement-vendeurs.md`** (contrat **2.7 — V7 Hébergement vendeurs**, 2026-11-17) — **fusion du contrat additif v7**. Cette section en est la carte opérationnelle ; aucune route existante n'y est modifiée. Conventions : erreurs `{ error: { code, message, details? } }`, messages en français affichables, `private, no-store`, cookie HTTP-only + CSRF double soumission (comme v2.6 §1.1).

| # | Méthode & chemin | Accès | Corps / Query | Succès |
|---|---|---|---|---|
| 1 | `POST /api/subscriptions` | `requireAuth` (user ou admin) | `{ planId, slug?, supersedesId? }` | `201` |
| 2 | `GET /api/subscriptions/me` | `requireAuth` | — | `200` |
| 3 | `POST /api/storefront/listings` | `requireAuth` + abonnement `ACTIVE` | `{ productId }` | `201` |
| 4 | `DELETE /api/storefront/listings/:id` | `requireAuth` (propriétaire) | — | `200` |
| 5 | `GET /api/storefront/:slug` | **public** | `page, per_page` | `200` / `404` |
| 6 | `POST /api/storefront/:slug/contact` | `requireAuth` | `{ message, email? }` | `201` |
| 7 | `GET /api/admin/subscriptions` | `requireAdmin` | `status (déf. PENDING), page, per_page` | `200` |
| 8 | `POST /api/admin/subscriptions/:id/activate` | `requireAdmin` | `{}` (ignoré) | `200` |

**Règles opposables :**

8. Souscription (1)** — crée TOUJOURS un `PENDING`. `planId` doit référencer un forfait `active = TRUE` (sinon `404 PLAN_NOT_FOUND`). `slug` normalisé **serveur** (`trim` → minuscules → espaces → `-` ; regex `^[a-z0-9]+(?:-[a-z0-9]+)*$`, 3–40) puis validé : format invalide → `400 VALIDATION_ERROR` ; 20 mots réservés → `400 SLUG_RESERVED` ; slug réservé par un **autre vendeur** (tous statuts, à vie) → `409 SLUG_TAKEN` (le vendeur peut réutiliser **le sien**). Un vendeur qui possède déjà un slug récupère **son** slug à toute re-souscription. `supersedesId` (changement de forfait) : uniquement l'`ACTIVE` du connecté — d'autrui / inexistant → `404 NOT_FOUND` ; propre non-`ACTIVE` → `400 INVALID_SUPERSEDES` ; propre `ACTIVE` → changement valide (l'ancien passe `CANCELLED` à l'activation, ses listings actifs sont **réattachés** au nouvel abonnement). Aucun `status` envoyé n'est jamais lu (CA-V7-014).
9. Mon abonnement (2)** — matérialise paresseusement l'expiration `ACTIVE → EXPIRED` (sans cron) puis répond `200` ; sans abonnement : `subscription: null`, `usage: null`, `listings: []`, `plans: […3 paliers]`.
10. Ajout en boutique (3)** — **seul point de contrôle du quota** : abonnement `ACTIVE` non expiré exigé sinon `403 SUBSCRIPTION_REQUIRED` ; produit inexistant/supprimé → `404 PRODUCT_NOT_FOUND` ; produit d'autrui → `403 NOT_PRODUCT_OWNER` (exception assumée §1.4) ; verrou `SELECT … FOR UPDATE` sur l'abonnement puis comptage par jointure `storefront_listings JOIN products` (`PENDING|AVAILABLE|RESERVED`, `deleted_at IS NULL`, listing non retiré) : `used ≥ quota` → `409 STOREFRONT_QUOTA_EXCEEDED` (message « Quota de votre forfait atteint (n/quota). Retirez une annonce de votre boutique ou changez de forfait. ») ; produit déjà listé → `409 STOREFRONT_ALREADY_LISTED` (unicité partielle `uq_storefront_active_product`).
11. Retrait (4)** — `withdrawn_at = now()` sur la ligne de liaison ; **idempotent** (`200` même si déjà retiré) ; listing d'autrui ou inconnu → `404 NOT_FOUND` (jamais `403` ici) ; **aucune écriture sur `products`**, aucune annulation de commande.
12. Boutique publique (5)** — aucune session requise. Annonces = listings non retirés dont `products.status ∈ ('PENDING','AVAILABLE','RESERVED')` et `deleted_at IS NULL`. `404 NOT_FOUND` (« Boutique introuvable ») **unique et identique** pour slug inconnu / `PENDING` / `EXPIRED` / `CANCELLED`. `Cache-Control: private, no-store`.
13. Contact boutique (6)** — `message` 10–2000 (trimmé), `email` optionnel ≤ 254 (minuscules). Même garde-fou 404 que la boutique ; auto-contact → `400 CONTACT_SELF`. Une notification `product.contact` (existante) est insérée dans la même transaction (titre = « Nouveau message depuis la boutique « <slug> » — De : <displayName> »). **Rate limit dédié `storefront-contact` : 10 req / IP / 10 min** → `429 RATE_LIMITED` + `Retry-After`. Aucun canal privé (`tel:`, `mailto:`, `whatsapp:`) nulle part — le formulaire est strictement boutique-scopé et n'ajoute rien sur la fiche produit.
14. File admin (7)** — `requireAdmin` (un `user` → `403 FORBIDDEN`), tri `created_at DESC`, pagination standard §1.5, `status` ∈ enum (autre valeur → `400 VALIDATION_ERROR`).
15. Activation (8)** — **seul chemin `PENDING → ACTIVE`** : matérialisation paresseuse des `ACTIVE` expirés du vendeur ; si `supersedesId` : `CANCELLED` du prédécesseur + réattach de ses listings actifs ; sinon garde `409 SUBSCRIPTION_ALREADY_ACTIVE` si un `ACTIVE` existe. `started_at = activated_at = now()`, `ends_at = now() + 30 jours`, `activated_by` = admin connecté, `activated_at` = maintenant. Cible inexistante → `404 NOT_FOUND` ; cible pas `PENDING` → `409 INVALID_STATUS`. Corps `{}` — `status`/`activated_by`/`activated_at` envoyés sont **ignorés**.

**Codes d'erreur nouveaux (récapitulatif)** : `SLUG_RESERVED` 400 · `INVALID_SUPERSEDES` 400 · `SUBSCRIPTION_REQUIRED` 403 · `NOT_PRODUCT_OWNER` 403 · `SUBSCRIPTION_ALREADY_ACTIVE` 409 · `STOREFRONT_QUOTA_EXCEEDED` 409 · `STOREFRONT_ALREADY_LISTED` 409 · `PLAN_NOT_FOUND` 404 · `INVALID_STATUS` 409. **Réutilisés** : `UNAUTHENTICATED`, `FORBIDDEN`, `VALIDATION_ERROR`, `NOT_FOUND`, `SLUG_TAKEN`, `PRODUCT_NOT_FOUND`, `CONTACT_SELF`, `RATE_LIMITED`, `INTERNAL_ERROR`. Les `23505` V7 sont traduits **dans le service** (`middleware/errors.ts` inchangé).

**Ordre de déclaration** (`storefront.routes.ts`) : `POST /listings` et `DELETE /listings/:id` **avant** `GET /:slug` et `POST /:slug/contact`.

### 3.10 V8 — Hébergement Boutique (v2.8, additif)

Source détaillée : **`docs/architecture-v8-hebergement-boutique.md`** (DDL §2, publication directe §4, badges §5, tri §6, branding §7, stats §8, PDF §9, cron §11, arbitrages §14 — **tous clos le 18/11/2026**) · **`docs/cahier-des-charges-v8-hebergement-boutique.md`** (75 critères). **Additif strict** : **aucune route existante n'est modifiée, renommée ou supprimée** ; les extensions E1–E6 ci-dessous sont des **ajouts de champs** (ou un corps optionnel), jamais des changements de type ni de codes. Conventions : erreurs `{ error: { code, message, details? } }`, messages FR affichables, `private, no-store`, CSRF double soumission (inchangé).

| # | Méthode & chemin | Accès | Corps / Query | Succès |
|---|---|---|---|---|
| R1 | `PUT /api/storefront/profile` | `requireAuth` + abonnement `ACTIVE` non expiré (V8.4) | **multipart** : `logo?` (fichier ≤ 2 Mo), `banner?` (≤ 4 Mo), `publicDescription?` (≤ 500 graphèmes), `collecteAddress?` (10–500 car.) | `200` |
| R1b | `POST /api/storefront/profile` | `requireAuth` + abonnement `ACTIVE` non expiré (V8.4) | `{ publicDescription?, collecteAddress? }` (même écriture en JSON, sans fichiers) | `200` |
| R1c | `GET /api/storefront/profile` | `requireAuth` (propriétaire) | — | `200` |
| R2 | `DELETE /api/storefront/profile/logo` | `requireAuth` + abonnement `ACTIVE` non expiré (V8.4) | — | `200` `{ ok: true }` |
| R3 | `DELETE /api/storefront/profile/banner` | `requireAuth` + abonnement `ACTIVE` non expiré (V8.4) | — | `200` `{ ok: true }` |
| R4 | `GET /api/subscriptions/me/stats` | `requireAuth` | — | `200` |
| R5 | `GET /api/admin/auto-approvals` | `requireAdmin` | `page, per_page` (`per_page` 1..48, défaut 12) | `200` |
| R6 | `POST /api/admin/products/:id/retrograde` | `requireAdmin` | `{ reason }` (trim, ≥ 10 caractères) | `200` |
| R7 | `GET` **et** `POST` `/api/cron/monthly-report` | **cron secret** (dual-auth) | — | `200` / `401` |

**Règles opposables :**

1. **Écriture branding (R1/R1b/R2/R3)** — crée la ligne `storefront_profiles` au 1er appel (upsert 1:1 par `seller_id`). **Amendement V8.4 : disponible uniquement si l'abonnement est `ACTIVE` et `ends_at > now()`** (horloge DB, miroir de `addListingToStorefront`) — `PENDING`/`EXPIRED`/`CANCELLED` → `403 SUBSCRIPTION_REQUIRED`, y compris pour les `DELETE` de logo/bannière. Le **rendu public** est soumis à la même condition (sinon `/boutique/:slug` → 404 identique V7, non divulguée). CA-V8-045 amendé en conséquence. Fichiers : **magic bytes** vérifiés (JPEG/PNG/WebP), nom **toujours UUID serveur**, stockage Vercel Blob (`put`/`del`) ou repli disque (`uploads/storefront/`), suppression des anciens assets **après** succès. Nombres : `publicDescription` vide ⇒ effacement (`NULL`) ; `collecteAddress` vide ⇒ effacement.
2. **`collecte_address` (INTERNE)** — **JAMAIS** dans une réponse d'API (§14.D clos le 18/11/2026). Le propriétaire écrit via `POST/PUT /api/storefront/profile` ; il reçoit un **booléen** `collecteAddressSet` à la lecture. L'admin ne voit qu'un **booléen** dans la file. La logistique manuelle passe par SQL/trusted uniquement. Aucun log, aucune trace, aucun PDF/e-mail ne porte la valeur.
3. **Erreurs (R1/R1b/R2/R3)** — `401 UNAUTHENTICATED` · `403 SUBSCRIPTION_REQUIRED` (V8.4 : abonnement absent, `PENDING`, `EXPIRED` ou `CANCELLED` — message unique, aucun statut divulgué) · `400 VALIDATION_ERROR` (description > 500 graphèmes/compteurs, `collecteAddress` hors 10–500 — `details[]` pointe le champ) · `400 INVALID_IMAGE` (MIME réel invalide) · `413 FILE_TOO_LARGE` (logo > 2 Mo, bannière > 4 Mo) · `500 INTERNAL_ERROR`.
4. **Réponse `{ profile }`** (R1/R1b/R1c) : `{ logoUrl, bannerUrl, publicDescription, collecteAddressSet, updatedAt, sellerBadge? }` — les URLs sont **relatives** (`/uploads/storefront/…`) ou absolues (Blob) ; **aucun `collecteAddress`** — booléen `collecteAddressSet` uniquement ; `sellerBadge` = badge palier dérivé (`pro`/`verifiee`/`boutique`/`null`).
5. **Lecture boutique (E2, extension additive v2.8)** — `GET /api/storefront/:slug` gagne `logoUrl?`, `bannerUrl?`, `publicDescription?` dans l'objet `storefront` — **uniquement si** abonnement `ACTIVE` + profil présent (sinon 404 identique V7). `items[]` gagne `sellerBadge` par carte. **`collecteAddress` n'apparaît dans AUCUNE réponse publique.**
6. **Stats vendeur (R4)** — `requireAuth`, périmètre session (un autre vendeur ne peut pas lire les vôtres — `/me`), `401` anonyme. Réponse :
   ```jsonc
   {
     "subscription": { "id": 41, "status": "ACTIVE", "plan": { "name": "Atelier", "quota": 100 }, "endsAt": "…", "daysRemaining": 30 } | null,
     "current": {                          // fenêtre glissante 30 jours, calcul à la volée
       "windowDays": 30, "viewsCumulated": 1234,     // Σ products.view_count (all-time)
       "salesCount": 4, "revenueFcfa": 200000,        // CA brut, mois glissant
       "netRevenueFcfa": 180000, "commissionFcfa": 20000,   // seller_amount / commission persistée
       "avgBasketFcfa": 50000, "bestProduct": { "id": 88, "name": "iPhone 12", "sales": 2 },
       "conversionRateAllTime": 0.0032      // ventes 30 j / vues cumulées (all-time ; null si 0 vue) — nom explicite « AllTime »
     },
     "latestReport": {                     // dernier bilan persisté (monthly_metrics, email_status NOT NULL) — null sinon
       "period": "2026-10", "views": 1234, "viewsLabel": "vues du mois",
       "salesCount": 4, "revenueFcfa": 120000, "netRevenueFcfa": 108000, "commissionFcfa": 12000,
       "avgBasketFcfa": 30000, "bestProduct": { "id": 88, "name": "iPhone 12", "sales": 2 },
       "conversionRate": 0.0032, "emailStatus": "SENT", "sentAt": "…"
     },
     "history": [ … ],                     // ≤ 12 mois, même structure, tri period DESC
     "isFirstReport": false
   }
   ```
   Règles de calcul (identiques à l'e-mail et au PDF — P12) : vues = delta vs `views_baseline` du relevé (ou cumul + libellé « vues cumulées (1er relevé) ») ; ventes = `COUNT(DISTINCT orders.id)` jointes à `order_events.to_status='PAID'` sur la période ; meilleur article = ventes du mois, tie-break `view_count DESC` ; `conversionRate` null si 0 vue ; `avgBasketFcfa` null si 0 vente (le front affiche « — »).
7. **Auto-approbations admin (R5)** — `requireAdmin`. File paginée des articles publiés directement (V8-D2), alimentée par `auto_approved_products` ⨝ `products` ⨝ `users` : `{ items: [{ id, productId, productName, sellerId, sellerDisplayName, subscriptionId, createdAt }], page, perPage, total, totalPages }`. Usage : contrôle qualité (K4 < 5 %).
8. **Rétrogradation (R6)** — `requireAdmin`, corps `{ reason }` trimmé ≥ 10 caractères (sinon `400 VALIDATION_ERROR` avec `details[]`). Transaction : verrou `FOR UPDATE` sur `products` (absent → `404 NOT_FOUND`) ; `status ≠ AVAILABLE` → `409 INVALID_STATUS` ; garde R2 (`auto_approved_products`, absente → `409 NOT_AUTO_APPROVED`) ; `UPDATE products SET status='REJECTED', rejection_reason=…` ; `admin_actions.action='product.auto_approved_retrograded'` + notification `article_rejected` (valeur enum **existante**, réutilisée — V6.4 respecté après coup : acte admin, pas sollicitation). **La place boutique est libérée par dérivation** (comptage V7) — 0 écriture quota.
9. **Bilan PDF (R8)** — `GET /api/subscriptions/me/report?period=YYYY-MM` (requireAuth, périmètre `/me` exclusivement) : `200 application/pdf` (disposition `attachment`, filename `bilan-ReVendsen-YYYY-MM.pdf`, `Cache-Control: private, no-store`) si une ligne `monthly_metrics` existe pour `(subscription_id, period)` ; sinon `404 REPORT_NOT_AVAILABLE` (aucun accès croisé vendeur↔vendeur) ; `400 INVALID_PERIOD` si `period` malformée ou hors `YYYY-MM` ; `401 UNAUTHENTICATED` anonyme. Le PDF est généré à la demande (`%PDF-`), à partir des mêmes données que le bilan e-mail (P12) — jamais retourné d'un précédent envoi, jamais archivé hors `monthly_metrics`.
10. **Cron (R7)** — dual-auth à **comparaison à temps constant**, fail-closed : `Authorization: Bearer <CRON_SECRET>` (Vercel Cron — HTTP **GET**, `vercel.json` `crons: [{ path: '/api/cron/monthly-report', schedule: '0 6 * * *' }]`) **ou** `x-cron-secret: <CRON_SECRET>` (manuel). `CRON_SECRET` absent ⇒ **401** systématique ; sinon header absent/invalide ⇒ `401 { error: { code: 'UNAUTHENTICATED', message: 'Cron non autorisé' } }`. Dispatch par calendrier UTC : **`1er = bilan du mois écoulé`** · **`dernier jour = relevé des vues`** · sinon **`noop`** ; rappel J-3 `ACTIVE` → expirant sous 3 jours (anti-doublon `subscription-expiry-reminder:<userId>:YYYY-MM`) à chaque passage. Réponse `{ ok: true, mode: 'report'|'snapshot'|'noop'|'disabled', … }` ; `DISABLE_CRON=true` ⇒ `200 { ok: true, mode: 'disabled' }`, aucun effet.
11. **Extension E1 — `POST /api/subscriptions` (corps étendu, v2.8)** — ajout de `paymentMethod` (`wave|orange_money|virement`) et `paymentReference` (trim, **4–64**, regex `^[A-Za-z0-9][A-Za-z0-9 .\-_/]{2,62}$`), **obligatoires au niveau du contrat serveur** (CA-V8-050, K12 = 100 %). Réponse `201` inchangée. Codes dédiés : `400 INVALID_PAYMENT_METHOD` · `400 PAYMENT_REFERENCE_REQUIRED` · `400 INVALID_PAYMENT_REFERENCE`. La **référence n'est jamais publique** ; file admin E3 la voit ; jamais journalisée en clair. Les lignes legacy antérieures à la V8 (`payment_* = NULL`) restent **activables** par l'admin (CA-V8-053) ; toute nouvelle souscription est rejetée sans référence (`PAYMENT_REFERENCE_REQUIRED`).
12. **Extension E3 — `GET /api/admin/subscriptions` (file admin)** — chaque item gagne `paymentMethod` (`string|null`) et `paymentReference` (`string|null` — `null` = « référence absente », legacy CA-V8-053). **Aucun `collecteAddress`** — §14.D clos : la valeur n'apparaît nulle part dans l'API/UI (admin inclus).
13. **Extension E4 — `GET /api/subscriptions/me` (lecture propriétaire)** — gagne un bloc `profile` : `{ logoUrl, bannerUrl, publicDescription, collecteAddressSet: boolean }` (`null` sans abonnement/profil) — **jamais** la valeur de `collecteAddress`. Les 2 routes V7 (`POST /api/subscriptions`, `GET /api/subscriptions/me`) sont **amendées** par v2.8 sur ce seul point (et sur E1 pour la première) ; elles ne sont donc pas « inchangées » au sens strict des 6 verrous — précision d'honnêteté consignée (architecture §13.1).
14. **Extension E5 — cartes catalogue & fiche** — `GET /api/products` (cartes), `GET /api/products/:id` (fiche) et `GET /api/storefront/:slug` (items) exposent `sellerBadge` (`'pro'|'verifiee'|'boutique'|null`), additif. Tri par défaut uniquement composé `Atelier > Boutique > Découverte > Vitrine > reste` (V8-D4) ; tris explicites, pagination, `per_page` inchangés (byte-identiques).
15. **Auto-approbation (`POST /api/products`)** — comportement inchangé sauf le **statut initial** pour les vendeurs éligibles (`AVAILABLE` au lieu de `PENDING`) : `201` identique, trace `auto_approved_products` (R2 retenue), **aucune** notification `article_submitted`, **aucune** alerte admin « à valider ». `admin_actions` **non** utilisée par l'auto-approbation.
16. **Bilan mensuel (V8-D7)** — `monthly_metrics(subscription_id, period, views_sum, sales_count, ca_fcfa BIGINT, views_baseline INTEGER, email_status 'SENT'|'FAILED'|NULL, sent_at, computed_at, PK(subscription_id, period))`, `storefront_profiles`, `auto_approved_products` (FKs `ON DELETE CASCADE`) ; `seller_subscriptions` + `payment_reference varchar(64)`, `payment_method varchar(32) CHECK (wave|orange_money|virement)`. Migration `020_storefront_v8.sql` — **manuelle en prod**, avant tout déploiement.

**Codes d'erreur nouveaux (récapitulatif)** : `INVALID_PAYMENT_METHOD` 400 · `INVALID_PAYMENT_REFERENCE` 400 · `INVALID_IMAGE` 400 · `FILE_TOO_LARGE` 413 · `NOT_AUTO_APPROVED` 409 · `INVALID_STATUS` 409 (réutilisé) · `PAYMENT_REFERENCE_REQUIRED` · **réutilisés** : `UNAUTHENTICATED` (cron 401), `FORBIDDEN` (user → admin), `VALIDATION_ERROR`, `NOT_FOUND`, `RATE_LIMITED`, `INTERNAL_ERROR`. Mapping `23505` inchangé (service, `middleware/errors.ts` non modifié).

**V7 — précisions d'honnêteté (v2.8)** : les 8 routes V7 (`POST /api/subscriptions`, `GET /api/subscriptions/me`, `POST /api/storefront/listings`, `DELETE /api/storefront/listings/:id`, `GET /api/storefront/:slug`, `POST /api/storefront/:slug/contact`, `GET /api/admin/subscriptions`, `POST /api/admin/subscriptions/:id/activate`) conservent méthode, chemin, codes de succès et contrat d'erreur ; seules leurs payloads s'étendent (E1–E4) et `POST /api/products` gagne le statut initial pour l'éligible (V8-D2, dérogation unique acceptée au verrou CA-V5-150). Aucune n'est renommée.

## 4. Matrice de validation des champs (miroir contraintes UI)

Serveur = autorité (§9.5 : la validation client n'est qu'un confort). Le front reproduit ces bornes pour la saisie instantanée.

| Champ | Bornes | Règle |
|---|---|---|
| `displayName` | 2..50 | `^[A-Za-zÀ-ÿ0-9 ]+$` |
| `name` | 1..100 | texte libre |
| `email` | ≤ 255 | format e-mail, minuscules, unique |
| `phone` | 8..20 (car.) | `^\+?[0-9 ]{8,20}$`, unique |
| `password` | 8..72 | bcryptjs (limite 72 octets) |
| `acceptedCgu` | `true` obligatoire | bloquant |
| produit `name` | 3..120 | — |
| `description` | 10..2000 | — |
| `price` | 500..10 000 000 | entier FCFA (RG-PROD-1) |
| `oldPrice` | 500..10 000 000 **et > `price`** | entier FCFA, optionnel — `NULL` si vide/absent (RG-PROD-2, **V4-Accueil**) |
| `location` | 3..100 | — |
| `condition` | enum 5 valeurs | §2.6 |
| `categoryId`/`subcategoryId` | ints existants et **actifs** | `subcategoryId.parent_id = categoryId` (RG-PROD-5) |
| `brand`/`model` | ≤ 100 | optionnels |
| `ageYears` | 0..100 | entier, optionnel |
| `defects`/`accessories`/`notes` | ≤ 2000 | optionnels |
| photos | 1..4 fichiers | JPEG/PNG/WebP, ≤ 5 Mo par fichier, MIME réel |
| `paymentMethod` | enum 4 valeurs | défaut `MOBILE_MONEY` |
| `method` (confirm-payment) | enum 4 valeurs | obligatoire |
| `reference` | ≤ 255 | optionnel (`confirm-payment`, `seller-payout`) |
| `note` (`cancel`) | 1..500 | **obligatoire** (CA-ORD08-01) — **aucune donnée personnelle** (RG-ORD-6) |
| `note` (`mark-product-received`) | ≤ 500 | optionnel |
| `carrier` / `trackingNumber` (`start-delivery`) | 0..100 | optionnels (PO-6, CA-ORD04-01) |
| `reason` (reject) | liste fermée 6 motifs | obligatoire (RG-REFUS) |
| `q` (recherche) | ≤ 120 | — |
| `page`/`per_page` | ≥ 1 / 1..48 | défauts 1 / 12 (20 pour listes admin et notifications) |
| `subcategory_id` | int existant et actif | (**V4-Accueil**) cohérent avec `category_id` si les deux fournis |
| `price_min`/`price_max` | 0..10 000 000 | (**V4-Accueil**) `price_max ≥ price_min` |
| `condition` (filtre) | enum 5 valeurs | (**V4-Accueil**) §2.6 |
| `location` (filtre) | 1..100 | (**V4-Accueil**) égalité exacte insensible à la casse (valeur de `GET /api/products/locations`) |
| `brand` (filtre) | 1..100 | (**V4-Accueil**) `ILIKE %…%` |
| `section` | enum 6 valeurs §3.2 | (**V4-Accueil**) prioritaire sur `sort` ; sans `per_page` → LIMIT 12 |
| `sort` | `recent`·`price_asc`·`price_desc`·`popular` | (**V4-Accueil**) + `popular` (`view_count DESC`) |
| `ids` | 1..12 ints (CSV) | (**V4-Accueil**) mode exclusif — ignore les autres paramètres (tout paramètre supplémentaire → 400) |
| `not_in` | 1..200 ints (CSV) | (**V4-Accueil**) exclusion — incompatible avec `ids` |
| contact `message` | 10..2000 | (**V4-Accueil**) `POST /api/products/:id/contact`, trimmé |
| contact `email` | ≤ 254 | (**V4-Accueil**) format e-mail, optionnel, minuscules |
| `slug` (souscription) | 3..40 | (**V7**) `^[a-z0-9]+(?:-[a-z0-9]+)*$`, normalisation serveur (`trim` → minuscules → espaces → `-`) ; 20 mots réservés → `400 SLUG_RESERVED` |
| `planId` / `productId` / `supersedesId` / `:id` | int ≥ 1 | (**V7**) `planId` → forfait `active = TRUE` sinon `404 PLAN_NOT_FOUND` ; `supersedesId` : propre `ACTIVE` sinon `400 INVALID_SUPERSEDES` / `404 NOT_FOUND` |
| `message` (contact boutique) | 10..2000 | (**V7**) trimmé |
| contact boutique `email` | ≤ 254 | (**V7**) format e-mail, optionnel, minuscules |
| `status` (file admin) | enum 4 valeurs | (**V7**) `PENDING · ACTIVE · EXPIRED · CANCELLED`, défaut `PENDING` |
| `durationDays` | = 30 | (**V7**) lecture seule (`subscription_plans`), 30 jours glissants |

---

## 5. Notifications créées par endpoint (N1→N14, §10 cahier V2 + DDL 003 V3 + DDL 008 V4-Accueil)

| Déclencheur | Notification | `type` | Destinataire |
|---|---|---|---|
| `POST /api/products` | N1 — « Article soumis » | `article_submitted` | vendeur (l'auteur) |
| `POST /api/admin/products/:id/approve` | N2 — « Votre article est en ligne » | `article_approved` | vendeur |
| `POST /api/admin/products/:id/reject` | N2b — « Article refusé : <motif> » | `article_rejected` | vendeur |
| `POST /api/orders` | N3 — « Commande CMD-XXXXXX enregistrée » | `order_created` | acheteur |
| `POST /api/orders` | N5 — « Votre article est réservé » | `article_reserved` | vendeur |
| `POST /api/admin/orders/:id/confirm-payment` | N4 — « Paiement confirmé pour CMD-XXXXXX » | `payment_confirmed` | acheteur |
| `POST /api/admin/orders/:id/confirm-payment` | **N9** — « Produit en attente pour CMD-XXXXXX » | `order_product_waiting` | **vendeur** (S1 §10 — l'architecture §11.7 le donnait à l'acheteur : arbitré §7.1) |
| `POST /api/admin/orders/:id/mark-product-received` | **N10** — « Produit reçu, préparation en cours pour CMD-XXXXXX » | `order_product_received` | acheteur |
| `POST /api/admin/orders/:id/mark-shipped` | **N11bis** (V4) — « Votre colis est prêt pour CMD-XXXXXX » | `order_shipped` | acheteur |
| `POST /api/admin/orders/:id/start-delivery` | **N11** — « Votre colis est en livraison » | `order_in_delivery` | acheteur |
| `POST /api/admin/orders/:id/mark-delivered` | **N12** — « Votre commande CMD-XXXXXX est livrée » | `order_delivered` | acheteur |
| `POST /api/admin/orders/:id/mark-delivered` | **N13** — « Commande CMD-XXXXXX terminée » | `order_completed` | **vendeur** (idem N9 — S1 §10) |
| `POST /api/admin/orders/:id/seller-payout` | N6 — « Paiement reçu : 225 000 FCFA pour CMD-XXXXXX » | `seller_paid` | vendeur |
| `POST /api/admin/orders/:id/seller-payout` | N8 — « Votre article a été vendu » | `article_sold` | vendeur |
| tâche planifiée / lazy (pas d'endpoint) | N7 — « Votre commande CMD-XXXXXX a expiré » | `reservation_expired` | acheteur |
| `PUT /api/products/:id` | **aucune** (choix : la re-soumission suffit à ramener l'article dans la file admin) | — | — |
| `POST /api/products/:id/contact` (**V4-Accueil**) | **N14** — « Nouveau message à propos de « <nom du produit> » » | `product.contact` | vendeur (propriétaire de l'annonce) |
| `POST /api/storefront/:slug/contact` (**V7**) | **N15** — « Nouveau message depuis la boutique « <slug> » — De : <displayName> » | `product.contact` (type **existant** réutilisé, aucun type créé) | vendeur (propriétaire de la boutique abonnée) |

Toute insertion de notification est faite **dans la même transaction** que l'événement (aucune notification orpheline).

**Types ajoutés (6) au DDL 003 + (1) au DDL 006 (V4) + (1) au DDL 008 (V4-Accueil)** : `order_product_waiting`, `order_product_received`, `order_preparing`, `order_in_delivery`, `order_delivered`, `order_completed`, `order_shipped` (V4), `product.contact` (V4-Accueil). **7 événements émis** (N9–N13 + N11bis V4 + N14) ; `order_preparing` (`PRODUCT_RECEIVED → PREPARING`) **n'est émise par aucun endpoint par défaut** — réservée pour une future étape « en préparation » active. **Badge front** : se brancher **uniquement** sur `unreadCount`/`unreadNotifications` (inchangés §3.5) ; les `type` servent au libellé/icône et au lien « Suivre mon colis » pour les 5 types « colis » (`order_product_received`, `order_shipped`, `order_in_delivery`, `order_delivered`, `order_completed`). N14 (`product.contact`) : titre = « Nouveau message à propos de « <nom du produit> » », corps = `De : <expéditeur>< — <email>>\n\n<message>` — l'email du demandeur n'est transmis **qu'au vendeur** (T22, jamais ailleurs). **V7 — N15** : le contact boutique réutilise le même type (`product.contact`, valeur existante du DDL 008 — **`notification_type` n'est pas modifié**) ; seul le **titre** porte le contexte V7 (« Nouveau message depuis la boutique « <slug> » — De : <displayName> »). Aucun canal privé (`tel:`, `mailto:`, `whatsapp:`) n'est ajouté, ni sur la boutique ni sur la fiche produit ; la fiche `/catalogue/:slug` est inchangée (verrou CA-V5-101).

---

## 6. Carte récapitulative des endpoints

| Méthode & chemin | Rôle | Corps / Query | `2xx` |
|---|---|---|---|
| `POST /api/auth/register` | public | JSON | `201` |
| `POST /api/auth/login` | public | JSON | `200` |
| `POST /api/auth/logout` | session (idempotent) | — | `204` |
| `GET /api/auth/me` | session | — | `200` |
| `GET /api/categories` | public | — | `200` |
| `GET /api/products` | public | `q, category_id, subcategory_id, price_min, price_max, condition, location, brand, sort (+`relevance` **V5**), section, ids, not_in, page, per_page` | `200` |
| `GET /api/products/suggestions` (**V5**, PO-V5-18) | public | `q` (**≥ 2 caractères**, obligatoire) | `200` |
| `GET /api/products/locations` (**V4-Accueil**) | public | — | `200` |
| `GET /api/banners` (**V4-Accueil**) | public | — | `200` |
| `GET /api/products/:slug` | public | — | `200` (view_count +1) |
| `POST /api/products/:id/contact` (**V4-Accueil**) | user | JSON `{ message, email? }` | `201` |
| `GET /uploads/products/:file` | public | — | `200` |
| `GET /health` · `GET /api/health` (**V5** : exempt de rate limit) | public | — | `200` |
| `POST /api/products` | user | multipart (champs + 1-4 photos) | `201` |
| `PUT /api/products/:id` | owner | multipart (champs + photo_order/remove_photo_ids/photos) | `200` |
| `GET /api/me/products` | user | — | `200` |
| `GET /api/referrals/me` (**V6**, parrainage) | session (`requireAuth`, admin admis) | — | `200` |
| `POST /api/subscriptions` (**V7**) | session (`requireAuth`) | `{ planId, slug?, supersedesId? }` | `201` |
| `GET /api/subscriptions/me` (**V7**) | session (`requireAuth`) | — | `200` |
| `POST /api/storefront/listings` (**V7**) | session (`requireAuth`) + abonnement `ACTIVE` | `{ productId }` | `201` |
| `DELETE /api/storefront/listings/:id` (**V7**) | session (`requireAuth`, propriétaire) | — | `200` |
| `GET /api/storefront/:slug` (**V7**) | public | `page, per_page` | `200` / `404` |
| `POST /api/storefront/:slug/contact` (**V7**) | session (`requireAuth`) | `{ message, email? }` | `201` |
| `GET /api/admin/subscriptions` (**V7**) | admin | `status, page, per_page` | `200` |
| `POST /api/admin/subscriptions/:id/activate` (**V7**) | admin | `{}` | `200` |
| `PUT /api/storefront/profile` (**V8**) | session (propriétaire) | multipart (`logo?` ≤ 2 Mo, `banner?` ≤ 4 Mo, `publicDescription?`, `collecteAddress?`) | `200` |
| `POST /api/storefront/profile` (**V8**) | session (propriétaire) | JSON `{ publicDescription?, collecteAddress? }` | `200` |
| `GET /api/storefront/profile` (**V8**) | session (propriétaire) | — | `200` |
| `DELETE /api/storefront/profile/logo` (**V8**) | session (propriétaire) | — | `200` |
| `DELETE /api/storefront/profile/banner` (**V8**) | session (propriétaire) | — | `200` |
| `GET /api/subscriptions/me/stats` (**V8**) | session (`requireAuth`) | — | `200` |
| `GET /api/admin/auto-approvals` (**V8**) | admin | `page, per_page` | `200` |
| `POST /api/admin/products/:id/retrograde` (**V8**) | admin | `{ reason }` (≥ 10 car.) | `200` |
| `GET`·`POST /api/cron/monthly-report` (**V8**) | cron secret (dual-auth Bearer / x-cron-secret) | — | `200` / `401` |
| `POST /api/orders` | user | `{ productId, paymentMethod? }` | `201` |
| `GET /api/me/orders` | user | — | `200` |
| `GET /api/orders/:id` | session (buyer/seller/**admin**) | — | `200` |
| `GET /api/me/notifications` | user | `page, per_page, unread_only` | `200` |
| `POST /api/me/notifications/:id/read` | user | — | `200` |
| `POST /api/me/notifications/read-all` | user | — | `200` |
| `GET /api/admin/stats` | admin | — | `200` |
| `GET /api/admin/products` | admin | `status, q, page, per_page` | `200` |
| `DELETE /api/admin/products/:id` (**V5**, C4) | admin | — | `204` |
| `POST /api/admin/products/:id/approve` | admin | `{}` | `200` |
| `POST /api/admin/products/:id/reject` | admin | `{ reason }` | `200` |
| `GET /api/admin/orders` | admin | `status, payout, page, per_page` | `200` |
| `GET /api/admin/orders/:id` | admin | — | `200` |
| `POST /api/admin/orders/:id/confirm-payment` | admin | `{ method, reference? }` | `200` |
| `POST /api/admin/orders/:id/mark-product-received` | admin | `{ note? }` | `200` |
| `POST /api/admin/orders/:id/mark-shipped` | admin (V4) | `{}` | `200` |
| `POST /api/admin/orders/:id/start-delivery` | admin | `{ carrier?, trackingNumber? }` | `200` |
| `POST /api/admin/orders/:id/mark-delivered` | admin | `{}` | `200` |
| `POST /api/admin/orders/:id/cancel` | admin | `{ note }` | `200` |
| `POST /api/admin/orders/:id/seller-payout` | admin | `{ reference? }` | `200` |
| ~~`POST /api/admin/orders/:id/pay-seller`~~ | admin (dépréciée) | — | `410 GONE` (`ROUTE_DEPRECATED`) |
| `GET /api/admin/categories` | admin | — | `200` |
| `PATCH /api/admin/categories/:id` | admin | `{ name?, active? }` | `200` |
| `GET /api/admin/users` | admin | `q, page, per_page` | `200` |
| `GET /api/admin/history` | admin | `action, target_type, page, per_page` | `200` |
| `GET /health` | public | — | `200` |

> **V8 — ordre de déclaration** : dans `storefront.routes.ts`, les chemins littéraux (`/profile`, `/profile/logo`, `/profile/banner`) sont déclarés **avant** `GET /:slug` ; `/api/admin` monte le routeur V8 **avant** `adminRouter` (`/auto-approvals`, `/products/:id/retrograde`) ; `/api/cron` monté en dernier. Assets boutique servis sous `/uploads/storefront/`. Cron Vercel : `vercel.json` `crons: [{ path: '/api/cron/monthly-report', schedule: '0 6 * * *' }]` (HTTP GET, `Authorization: Bearer $CRON_SECRET`).
> **V7 — ordre de déclaration** : dans `storefront.routes.ts`, `POST /listings` et `DELETE /listings/:id` sont déclarées **avant** `GET /:slug` et `POST /:slug/contact` (le chemin littéral prime). Les routeurs V7 sont montés additivement dans `app.ts` **avant** `/api/admin` (`/api/admin/subscriptions`) ; un limiteur dédié `storefront-contact` (10 req / IP / 10 min) est monté avant le routeur `/api/storefront` pour la route de contact.

---

## 7. Arbitrages vs `architecture.md` §6.3 (carte préliminaire)

La carte §6.3 était explicitement « préliminaire — finalisée par l'api-designer ». Écarts assumés, tous alignés sur le cahier V2 :

| Architecture §6.3 | Ce contrat | Justification |
|---|---|---|
| `POST /api/products/:id/buy` | `POST /api/orders` avec `{ productId }` | Ressource REST « commande » créée explicitement ; renvoie la commande complète `CMD-…` ; le verrou produit reste le cœur de la transaction (inchangé). |
| `PATCH /api/me/products/:id` | `PUT /api/products/:id` | Le formulaire de revente envoie toujours le **jeu complet** (multipart) → `PUT` sémantiquement juste ; la re-soumission `REJECTED/AVAILABLE → PENDING` est encodée dans la règle de statut. |
| `GET /api/products/:id` (fiche) | `GET /api/products/:slug` | URLs publiques lisibles (maquette `/articles/:slug`) ; tolérance id numérique conservée au routage. |
| `GET /api/admin/payouts` + `POST /api/admin/payouts/:id/pay` | `GET /api/admin/orders?payout=pending` + `POST /api/admin/orders/:id/seller-payout` (V3 — ex-V2 `pay-seller`, désormais `410`) | Une seule ressource `orders` à comprendre et à sérialiser ; la « page paiements vendeurs » = un filtre sur `seller_payouts.status` (CHG-10, plus aucun couplage avec un statut de commande) ; le `seller_payouts` reste une table tracée (montant, référence, paid_by). |
| `PATCH /api/me/notifications/:id/read` | `POST /api/me/notifications/:id/read` (+ `read-all`) | `POST` = action (lecture/marquage) ; `read-all` ajouté pour le confort du badge. |
| `GET /api/categories` « actives + inactives si admin » | `GET /api/categories` (publiques actives) + `GET /api/admin/categories` (toutes) | Séparation nette public/admin (pas de session dans un endpoint public). |
| — | `GET /api/orders/:id` (vues `buyer`/`seller` distinctes) | Le vendeur doit pouvoir suivre sa vente ; ajout conforme à RG 7.7 (l'autre partie n'est jamais exposée avec ses coordonnées). |

Côté **flux** (non modifié par ce contrat) : transactions + verrous (`FOR UPDATE`), expiration par lazy + cron, `order_number` par trigger, commission `floor`, cookie HTTP-only 7 jours, sérialisation `PublicUser`/`SelfUser`/`AdminUser`, tests de recette T01→T22 référencés dans chaque section.

### 7.1 Arbitrages V3 (ajoutés en 2.0 — enjeux S1 §9 / architecture §11.13)

| Question | Décision | Justification |
|---|---|---|
| **Destinataires de N9/N13** (S1 §10 : **vendeur** ; architecture §11.7 : **acheteur**) | **vendeur** | S1 est la source produit : CA-ORD02-01.6 (le vendeur est prévenu que son produit est attendu) et CA-ORD04-02.4 (il est prévenu que la commande est terminée et que le paiement vendeur est disponible). |
| **`actor_id` sur `order_events`** (schéma S1 §5.2) vs **DDL 003** (aucune colonne) | Le contrat expose `actor` (enum `system`/`admin`/`user`) ; **pas** d'`actorId` | L'identité précise d'un admin relève du `admin_actions` (traçabilité), pas du journal consommé par les clients. |
| **« 4 types » de notification** annoncés dans la tâche vs **6 valeurs** dans le DDL 003 | Les **6** sont documentées (§2.6, §5) ; `order_preparing` n'est émise par **aucun** endpoint par défaut | Le contrat documente l'enum dans son intégralité ; l'émission suit S1 (5 événements N9–N13). |
| **`cancel` (route absente de l'architecture §11.8 mais exigée par CA-ORD08-01)** | Ajoutée : `PAYMENT_PENDING → CANCELLED`, `note` obligatoire | CA-ORD08-01 exige le remboursement de la réservation par l'admin ; l'esquisse §11.8 l'oubliait. |
| **`payments.status` après `cancel`** | → `FAILED` | Aucun débit opéré (paiement hors-ligne non confirmé) ; même lecture front que l'expiration (`PAYMENT_FAILED` commande ⇔ paiement `FAILED`). |
| **`mark-delivered` fait-il payer le vendeur ?** | **Non** — il rend le dû **payable** (`PENDING → DUE`, V4) ; l'action distincte `seller-payout` reste requise pour `PAID` | CHG-5 découple reversement et cycle de commande ; payer automatiquement réintroduirait le couplage V2. V4 : en passant par un statut intermédiaire `DUE`, le dashboard distingue « livrées à payer » des « en attente de produit ». |
| **Rupture de contrat `pay-seller`** | Ancien chemin → `410 GONE` (`ROUTE_DEPRECATED`, message de la nouvelle route) | Les clients anciens sont guidés vers `seller-payout` sans échec silencieux (§1.2). |
| **Exposition transporteur/suivi au vendeur** | `deliveryCarrier`/`trackingNumber` visibles de l'acheteur, **du vendeur** et de l'admin | Pas de donnée personnelle (≠ coordonnées) ; le vendeur suit sa vente (CA-ORD05-02.4). |
| **V3→V4 : précondition `seller-payout`** (statuts de commande) | `{PRODUCT_RECEIVED…COMPLETED}` (V3) → **`{DELIVERED, COMPLETED}`** (V4) | Le vendeur n'est payable qu'après livraison réelle ; un payout `PENDING` sur commande non livrée → `ORDER_NOT_ALLOWED` (et non `PAYOUT_NOT_PENDING`), l'erreur la plus informative. |
| **V4 : pourquoi `DUE` et pas `PAID` au `mark-delivered` ?** | Le reversement reste **manuel** (`seller-payout`), exigibilité tracée `PENDING → DUE → PAID` | `mark-delivered` ≠ paiement réel effectué (Mobile Money hors-ligne) ; `DUE` = « à payer », alim. `stats.payoutsDue`. |

### 7.2 Arbitrages V4-Accueil (ajoutés en 2.2 — chantier « Accueil V3/V4 », cahier `cahier-des-charges-v4-accueil.md`)

| Question | Décision | Justification |
|---|---|---|
| **Enum `section` : 6 valeurs** | `recent` · `best_offers` · `popular` · `promotions` · `new` · `discover` | Aligné sur la demande (encart du présent contrat §3.2) ; les libellés d'écran (`new` → « Nouveautés », `best_offers` → « Meilleures offres »…) sont côté front (D-ACC-5). Le cahier V4 utilisait des noms voisins (`discount`, `promo`, `newest`) — même sémantique, noms contractuels ici (voir « Écarts » ci-dessous). |
| **`promotions` vs `best_offers` : trop proches ?** | `best_offers` = **toute** réduction (`old_price > price`), tri % décroissant ; `promotions` = **réduction ≥ 15 %** uniquement, tri % décroissant | La demande ne précisait pas de seuil ; le cahier exige ≥ 15 % (RG-PROD-6). Sans différenciation, « Promotions » = « Meilleures offres » → deux sections identiques sur l'accueil (CA-ACC-20/21 les dédoublerait inutilement). Le seuil de 15 % du cahier est donc **appliqué à `promotions`**. |
| **`ids` borné à 12** (contre CA-ACC-71 « jusqu'à 20 ») | **12** | La demande précise 1..12 ; le cahier dit ≤ 20. Le front « Vus récemment » (CA-ACC-55/56) écrit le `localStorage` à 12 items de toute façon ; 12 couvre l'usage. **Flag écart** : si le besoin des 20 se confirme, modifier la borne (`MIN/MAX` du schéma zod) et le texte §3.2/§4. |
| **`section` + `sort` : erreur ou priorité ?** | `section` **gagne**, `sort` ignoré silencieusement | La demande penchait « section gagne » ; le cahier §7.1 prévoyait `400`. Aucun front n'envoie les deux (URLs « Voir plus » = l'un ou l'autre, §8 cahier) ; l'erreur aurait trompé un client qui inclut un `sort` par défaut. Ignorance silencieuse documentée → pas d'ambiguïté. |
| **Bannière : `imagePath` ou `image.url` ?** | `imagePath` (string \| null, chemin relatif) | La demande précise `imagePath` ; le cahier §7.1 esquisse `image: { url }`. Le rendu front est identique (préfixe + chemin), mais le contrat retient **`imagePath`** pour coller à la demande et aux types `types.ts` du front (voir `architecture-accueil-v3.md` §8 et cahier V4-Accueil §7 — types `Banner`/`BannerImage`). **Flag écart** mineur : renommer en objet `image` = impact front seul, décision `@frontend`. |
| **Incrément `view_count` sur fiche** | +1 à **chaque GET réussi** (tous appels confondus, propriétaire/admin compris) | Cohérent (les vues réelles incluent le vendeur qui relit sa fiche) ; incrément atomique sans verrou. L'admin voit le même compteur (gouvernance). Effet secondaire assumé : préchargements/bots gonflent le compteur (note §8). |
| **`location` : tiles de la liste = valeurs BDD** | Endpoint `GET /api/products/locations` (pas de table de référence), valeurs distinctes **exactes** | CA-ACC-49 + PO-ACC-2 : la liste déroulante reflète ce que les vendeurs ont réellement saisi. Filtre par égalité insensible à la casse (pas de `ILIKE`). Normalisation de saisie = hors contrat V4-Accueil (impact flux vendeur, non demandé). |
| **Statuts contactables dans `POST /api/products/:id/contact`** | `AVAILABLE` + `RESERVED` → `201` ; `SOLD` → `400` ; `PENDING`/`REJECTED` → `404` ; proprio → `400 CONTACT_SELF` | `RESERVED` expirera (ou non) mais le vendeur reste joignable pour négocier ; `SOLD` est publiquement connu (message explicite utile) ; `PENDING`/`REJECTED` restent **masqués** (règle fiche, CA-CAT03-04). |
| **Affichage `oldPrice` si ≤ `price`** | Interdit à l'écriture (contrainte SQL + zod) ; en lecture, le front n'affiche barré/badge **que si** `oldPrice > price` (RG-PROD-4) — jamais « -0 % » | Une réduction n'est jamais inventée (RG-PROD-7) ; la DB garantit l'invariant. |
| **Mode `ids` : pagination** | **Neutralisée** (enveloppe `page: 1`, `perPage` = nb items) — pas de `400` | Rétrocompatibilité de l'enveloppe paginée ; le front « déjà vu » consomme une liste bornée (≤ 12), la pagination n'a pas de sens. |

**Écarts vs cahier des charges V4-Accueil — synthèse (à trancher par le PO si non suivis) :**

> ⚠️ **Écart 1 — noms d'enum de section.** La demande dit `promotions`/`new`/`best_offers` ; le cahier §5.3, §7.1, §8 dit `promo`/`newest`/`discount`. **Suivi : demande** (le présent contrat utilise `promotions`·`new`·`best_offers`). Mapping : `promo`→`promotions`, `newest`→`new`, `discount`→`best_offers`.
>
> ⚠️ **Écart 2 — seuil de réduction `promotions`.** La demande ne fixe pas de seuil ; le cahier RG-PROD-6 impose ≥ 15 %. **Suivi : cahier** (seuil 15 % appliqué à `promotions` seulement).
>
> ⚠️ **Écart 3 — borne `ids` ≤ 20 (CA-ACC-71) vs 12 (demande).** **Suivi : demande** (12). À re-confirmer si le front veut remonter les 20 « vus récemment ».
>
> ⚠️ **Écart 4 — `section` + `sort`.** Cahier §7.1 : `400` ; contrat : `section` gagne. **Suivi : demande.**
>
> ⚠️ **Écart 5 — forme bannière.** Cahier §7.1 : `image: { url }` ; contrat : `imagePath`. **Suivi : demande.** Renommage possible sans rupture de données (décision `@frontend`).

---

### 7.3 Arbitrages V5 (ajoutés en 2.4 — cahier `cahier-des-charges-v5.md`)

| Question | Décision | Justification |
|---|---|---|
| **9 déclencheurs / 11 envois** (PO-V5-14) | 9 déclencheurs produisant **11 envois** : « commande payée » (E4 acheteur + E5 vendeur) et « réservation expirée » (E10 acheteur + **vendeur**) sont les deux événements à double destinataire ; E8/E9 sont deux moments distincts du paiement vendeur | Le vendeur d'une réservation expirée n'a **aucune** notification in-app : sans cet email, il ignorerait que son article s'est libéré. C'est le seul cas où l'information n'existe que par e-mail. En contrepartie, **aucune notification in-app nouvelle** n'est créée (CA-V5-010). |
| **Emails après COMMIT** (P8) | `afterCommit()` via `AsyncLocalStorage` ; chaque niveau de transaction a sa **propre** file, seul le commit **le plus externe** exécute les effets | Un rollback métier ne doit laisser **aucun** effet observable. Partager une file entre les niveaux causait deux défauts : un commit interne déclenchait les envois du parent (donc **avant** son commit), et un rollback interne effaçait les effets déjà programmés par le parent. Les deux scénarios sont couverts par `test/emails.test.ts` (CA-V5-003). |
| **Rate limit en mémoire** (PO-V5-17) | `Map` par instance, **sans Redis** | 1 instance assumée. Les compteurs auth et global sont **deux `Map` distinctes** → c'est la plus stricte qui s'applique, sans collision. **Condition de bascule** : 2 instances ou plus exigent un compteur partagé **avant** mise en production, sinon la limite est partiellement inopérante. Dette documentée, pas un oubli. |
| **Cache : quelles routes ?** (PO-V5-07) | `public, max-age=60, stale-while-revalidate=120` sur `/api/categories` et `/api/banners` **uniquement** ; `private, no-store` partout ailleurs | Ce sont les seules réponses **identiques pour tous** et sans donnée personnelle. Une réponse liée à une session (`/api/me/*`) servie depuis un cache partagé serait une fuite inter-utilisateurs : d'où `no-store` par défaut, y compris sur les routes authentifiées. |
| **`relevance` : un score maison** (PO-V5-18) | Score **local et déterministe** : remise + popularité + récence, tie-break `p.id` | Ni ML, ni service externe, ni champ en base : le calcul est fait en SQL à partir de colonnes qui existent déjà (`old_price`, `price`, `view_count`, `created_at`). Le tie-break `p.id` rend l'ordre **stable** — exigence de pagination côté front. |
| **Suggestions : quel contenu ?** (PO-V5-18) | `categories` + **`brands`** + `products`, plafond **10** au total (6/2/2) | Le cahier nomme « catégories + marques + produits ». Le plafond de 10 est la **somme** des trois bornes, pas un garde-fou a posteriori : toute dérive de l'une des bornes est détectée par un test. |
| **Suppression logique : `404` ou `204` au 2ᵉ appel ?** (C4) | **`204` (idempotent)**, `404` réservé au produit **inexistant** | Divergence assumée avec `architecture-v5.md` §4.4 (« déjà supprimé → 404 »). **CA-V5-056 est un critère testable qui l'emporte** : « supprimer deux fois donne 204 puis 204, jamais d'erreur sur le second appel ». Signalée ici pour que l'architecture soit alignée. |
| **Filtres `taille` / `couleur` / `date`** (PO-V5-18) | **Reportés en V6**, aucune colonne ajoutée | Aucune donnée en base ne les rendrait fonctionnels, et RG-V5-08 interdit de livrer un filtre qui ne filtre pas. Livrer l'API sans la donnée aurait créé un contrôle inerte côté front. |

## 8. Notes d'implémentation pour `@backend` (non contractuelles mais utiles)

- **Multer 2.x** : `limits: { fileSize: 5 * 1024 * 1024, files: 4 }`, `fileFilter` sur MIME réel (magic bytes ou `file-type`), nom de fichier `crypto.randomUUID()` + extension vérifiée ; erreurs multer mappées vers `PHOTO_TOO_LARGE`/`PHOTO_INVALID_TYPE` (le handler central `errors.ts` de l'architecture).
- **Sémantique `PUT`** : distinguer `PENDING`, `AVAILABLE` et `REJECTED` par une lecture du statut **dans la transaction** (pas de mise à jour optimiste).
- **Libération paresseuse** : un seul module réutilisé par (a) `GET /api/products/:slug`, (b) `POST /api/orders`, (c) le cron `expire-reservations.ts` (D3) — même routine, une transaction par commande.
- **Sérialisation RG 7.7** : un seul mapper par vue (`PublicUser` / `SelfUser` / `AdminUser`) utilisé par toutes les routes → T22 vérifiée une fois pour toutes.
- **Zod** : les schémas de validation (§4) sont partagés côté backend ; le front peut dupliquer les bornes pour la saisie (pas de binding automatique en V1).
- **`conflict` unique** : les contraintes PG (`users.email`, `users.phone`, `products.slug`, `orders.order_number`, index partiel `uq_one_active_order_per_product`) sont captées dans `errors.ts` et traduites vers les codes `EMAIL_TAKEN`/`PHONE_TAKEN`/`PRODUCT_RESERVED` (§1.1).
- **V5 — suppression des N+1 (C5)** : les listes de commandes (`/api/me/orders`, `/api/me/sales`, `/api/admin/orders`) chargent produit, image primaire, paiement **et** contreparties dans **une seule requête** (`LEFT JOIN LATERAL` + `to_jsonb`). Deux raisons non évidentes : (1) un `SELECT o.*, p.*` laisserait `pg` ne garder que la **dernière** occurrence de chaque nom dupliqué (`id`, `status`, `created_at` existent dans les deux tables) — `row.id` deviendrait l'id **produit**, silencieusement ; l'encapsulation JSONB rend la collision structurellement impossible. (2) Les `LATERAL` s'exécutent une fois par ligne mais restent dans le **même aller-retour** réseau, donc le budget tient (2/2/3) tout en gardant un JOIN simple — qui aurait multiplié les lignes par le nombre d'images et cassé la pagination.
- **V5 — produit supprimé logiquement** : les vues publiques filtrent `deleted_at IS NULL`, mais le détail des **commandes** utilise volontairement `PRODUCT_SELECT_HISTORY` (sans filtre) — c'est l'**exonération History de `architecture-v5.md` §4.3 catégorie C**, écrite pour être opposable en revue : sans elle, `GET /api/orders/:id` répondrait 404 et la fiche d'une commande passée deviendrait inexplicable. Implémentée conformément.
- **V5 — `toIso` accepte `Date | string`** : les dates encapsulées en JSONB reviennent en chaîne ISO. Les sérialiseurs normalisent les deux formes, donc la **forme de la réponse est inchangée** (P5) : `toIso` est la garantie à conserver si ce code est réécrit.
- **V5 — effets post-commit non bloquants** : `dispatch()` lance l'effet sans l'attendre et le garde dans un registre `inFlight` ; `flushAfterCommit()` vide ce registre (tests, arrêt propre). **Aucun endpoint ne doit appeler `flushAfterCommit()`** : c'est exactement l'attente que CA-V5-014 interdit. Conséquence à connaître : les envois ne sont plus garantis à la milliseconde, et un `SIGTERM` peut en perdre un en vol (voir §3.5.1 et l'*outbox* prévue au-delà de V5).
- **V5 — `await` dans un `finally`** : `withTransaction` fait ses effets post-commit dans un `finally` (le commit comme le rollback doivent libérer le client). Un `await` y est **invisible** à la relecture du chemin nominal, alors qu'il bloque la réponse — c'est exactement le piège qui a fait échouer CA-V5-014.
- **V5 — `Retry-After`** : le `429` porte le nombre de secondes réellement restantes dans la fenêtre du limiteur qui a bloqué. Le message en texte libre suit la même valeur — ne pas le repasser en constante, il serait faux pour la fenêtre d'authentification (10 min).
- **V5 — `req.originalUrl` pour le cache** : dans `app.use('/api', …)`, `req.path` est **relatif** au point de montage (`/categories`, pas `/api/categories`). Comparer les chemins complets exige `req.originalUrl` (minus la query). C'est une source de bug silencieux : le middleware s'exécute, mais aucune route ne correspond jamais.
- **V3 — journal `order_events`** : les transitions passent toutes par le **trigger de matrice du DDL 003** (source de vérité unique) ; les routes n'insèrent **pas** les events à la main — elles ne font que les effets secondaires (notifications N9–N13, `admin_actions`). Les refus de matrice (`INVALID_TRANSITION` / `ORDER_NOT_ALLOWED` / `PAYOUT_NOT_PENDING`) sont traduits en `409` avec `currentStatus` dans `errors.ts` (§1.1).
- **V3 — `confirm-payment`** : ordre des écritures dans la transaction (status → produit → paiement → payout) — évite le trou « payout créé mais commande encore `PAYMENT_PENDING` » ; l'état exposé en sortie est `PRODUCT_WAITING`.
- **V3 — priorité expiration vs admin (D-V3-6)** : la libération paresseuse s'exécute avant `confirm-payment`/`cancel` ; une commande expirée ne peut être ni confirmée ni annulée (`409 INVALID_TRANSITION`, `currentStatus: PAYMENT_FAILED`).
- **V4-Accueil — DDL 008 obligatoire avant tout** : `ALTER TABLE products ADD COLUMN old_price INTEGER CHECK (old_price IS NULL OR old_price > price)` (ou `old_price > price` via CHECK, RG-PROD-2), `ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0 CHECK (view_count >= 0)`, `ALTER TYPE notification_type ADD VALUE 'product.contact'` (PG > 12 : pas de ré-ouvrabilité de transaction — soit en migration autonome, soit via `IF NOT EXISTS` PG 12+), `CREATE TABLE banners …`. Fichier `008_accueil.sql` (ordre lexicographique, `db/migrate.ts`).
- **V4-Accueil — `insertNotification` doit retourner l'id** : signature actuelle `(client, userId, type, title, message) → void` ; ajouter `RETURNING id` pour la réponse `{ ok, notificationId }` du `POST /api/products/:id/contact` (toujours dans la même transaction que la vérification produit).
- **V4-Accueil — ordre des routes express** : dans `products.routes.ts`, déclarer `GET /locations` **avant** `GET /:identifier` (sinon `locations` matche le paramètre slug → `404`). Même principe que les routes statiques avant les paramètres.
- **V4-Accueil — algos** : tri `discover` (constantes 104729/40503/1000003 du §3.2) ; ratio de réduction calculé en SQL flottant (`* 1.0`) pour éviter la division entière.
- **V4-Accueil — rate-limit sur `/contact`** : middleware existant (§1.1, `RATE_LIMITED`) appliqué par IP — ex. 10 requêtes / 10 min (anti-spam recommandé) ; optionnel sur `GET /api/banners`/`locations` (publics, non sensibles).
- **V4-Accueil — seed bannières** : ≥ 3 lignes `active = TRUE, position 1..n` (CRUD admin hors périmètre, PO-ACC-4) ; `position` UNIQUE.
- **V4-Accueil — seed/catalogue** : au déploiement, renseigner `old_price`/`view_count` sur la donnée existante (**zéro migration destructive** : `ALTER TABLE … ADD COLUMN` avec défauts, aucune suppression).
- **V7 — `019_storefront.sql` AVANT le code** : `RUN_MIGRATIONS=false` en prod, comme toute migration du projet — appliquer la migration **avant** de déployer le code V7, sinon toute route V7 renverrait `500` (tables absentes). Vérifier ensuite : 3 tables (`subscription_plans`, `seller_subscriptions`, `storefront_listings`), 3 lignes de forfaits (2000/10, 5000/30, 10000/100), enum `subscription_status` à 4 valeurs, `notification_type` **inchangé** (`product.contact` déjà présente).
- **V7 — expiration paresseuse, sans cron** : `ACTIVE → EXPIRED` est matérialisée conditionnellement (`ends_at <= now()`, idempotent) à la lecture (`GET /api/subscriptions/me`, `POST /api/storefront/listings`, `GET /api/storefront/:slug`, activation admin) ; la lecture publique filtre `status = 'ACTIVE' AND ends_at > now()` — une ligne expirée non matérialisée répond déjà `404`. Aucune tâche planifiée, aucun trigger sur `products`, aucune colonne `status` sur `storefront_listings`.
- **V7 — quota par jointure** : `SELECT COUNT(*) FROM storefront_listings l JOIN products p ON p.id = l.product_id WHERE l.subscription_id = $1 AND l.withdrawn_at IS NULL AND p.status IN ('PENDING','AVAILABLE','RESERVED') AND p.deleted_at IS NULL` — comptage **uniquement** dans `POST /api/storefront/listings`, précédé d'un `SELECT … FOR UPDATE` sur l'abonnement (sérialise les ajouts d'un même abonnement). `SOLD`/`REJECTED` libèrent une place **en lecture**, sans aucune écriture V7 dans le pipeline de commande/paiement.
- **V7 — mapping `23505` dans le service** : `middleware/errors.ts` n'est **pas** modifié ; les violations `uq_active_subscription_slug` → `409 SLUG_TAKEN`, `uq_one_active_subscription_per_seller` → `409 SUBSCRIPTION_ALREADY_ACTIVE`, `uq_storefront_active_product` → `409 STOREFRONT_ALREADY_LISTED` sont traduites par try/catch dans `services/storefront.service.ts`.
- **V7 — slug réservé à vie par vendeur** : à la re-souscription sans `supersedesId`, le service **remplace** le slug envoyé par le premier slug possédé par le vendeur (`ORDER BY created_at ASC`) ; avec `supersedesId` (propre `ACTIVE` uniquement), le slug est copié du prédécesseur. L'unicité cross-sellers est vérifiée dans l'unique fonction d'écriture (`409 SLUG_TAKEN` quel que soit le statut existant).
- **V7 — `insertNotification` réutilisée telle quelle** : type `product.contact` existant via une constante locale typée (`utils/storefront.ts`) — **aucune** extension de l'union `NotificationType`, aucun fichier de notification édité ; le contact boutique exige `requireAuth` et refuse l'auto-contact (`400 CONTACT_SELF`).
- **V7 — `rate-limit storefront-contact`** : `10 req / IP / 10 min` (scope `storefront-contact`, clé Redis `rl:storefront-contact:<ip>`), monté dans `app.ts` **avant** le routeur `/api/storefront` ; bypass `NODE_ENV=test` inchangé. `Cache-Control: private, no-store` sur toutes les réponses V7 (décision C-V7-1).
- **V7 — `FEATURE_STOREFRONT` non implémenté** : le feature flag recommandé (montage conditionnel des 3 routeurs) n'a **pas** été livré en V7 initiale — aucun fichier de configuration existant édité. L'ordre migration → code reste **obligatoire** ; rollback = retirer le code V7 (les tables peuvent rester, elles sont inertes).
- **V7 — feature-flag côté front** : hors périmètre de ce contrat ; voir `docs/architecture-v7-hebergement-vendeurs.md` §7.3 et `docs/cahier-des-charges-v7-hebergement-vendeurs.md` §8.

---

## Annexe A — Référence V3 (statuts, transitions, labels, migration)

### A.1 Libellés UI et étapes de la timeline « Suivre mon colis » (CA-ORD05)

| `orders.status` | Libellé UI | Étape timeline (acheteur) |
|---|---|---|
| `CREATED` | (jamais exposé — D-V3-2) | 1 — « Commande créée » |
| `PAYMENT_PENDING` | « Paiement en attente » | 2 — « Paiement en attente » |
| `PAID` | « Payée » | 3 — « Paiement confirmé » |
| `PRODUCT_WAITING` | « Produit en attente » | 4 — « Produit en attente » |
| `PRODUCT_RECEIVEDe » | 3 — « Paiement confirmé » |
| `PRODUCT_WAITING` | « Produit en attente » | 4 — « Produit en attente » |
| `PRODUCT_RECEIVED` | « Produit reçu » | 5 — « Produit reçu » |
| `PREPARING` | « En préparation » | 6 — « En préparation » |
| `SHIPPED` | « Prête / Expédiée » | 7 — « Prête, colis en attente d'enlèvement » |
| `IN_DELIVERY` | « En livraison » | 8 — « En livraison » + transporteur / n° de suivi |
| `DELIVERED` | « Livrée » | 9 — « Livrée » |
| `COMPLETED` | « Terminée » | 10 — « Terminée » |
| `PAYMENT_FAILED` | « Expirée » | — (re-commander si `AVAILABLE`, CA-BUY02-03) |
| `CANCELLED` | « Annulée » | — (re-commander si `AVAILABLE`, CA-ORD08-02) |

### A.2 Matrice des transitions autorisées (référence unique — DDL 003 + DDL 007 V4, S1 Annexe B)

- **Chaîne nominale** : `CREATED → PAYMENT_PENDING → PAID → PRODUCT_WAITING → PRODUCT_RECEIVED → PREPARING → SHIPPED → IN_DELIVERY → DELIVERED → COMPLETED` (toutes admin/system, PO-3 : aucune action utilisateur).
- **Routes admin déclenchantes** :
  - `confirm-payment` : `PAYMENT_PENDING → PAID` (+ auto `→ PRODUCT_WAITING`)
  - `mark-product-received` : `PRODUCT_WAITING → PRODUCT_RECEIVED` (+ auto `→ PREPARING`)
  - `mark-shipped` (V4) : `PREPARING → SHIPPED`
  - `start-delivery` : `SHIPPED → IN_DELIVERY` (V4 — précondition `SHIPPED`, plus `PREPARING`)
  - `mark-delivered` : `IN_DELIVERY → DELIVERED` (+ auto `→ COMPLETED`) — (+ payout `PENDING → DUE`, V4)
  - `cancel` : `PAYMENT_PENDING → CANCELLED` (`note` obligatoire)
- **Échecs** : `PAYMENT_PENDING → PAYMENT_FAILED` (expiration — lazy + cron, jamais depuis une route admin) ; `CANCELLED` (admin).
- **Exclusions** : aucun retour arrière (`IN_DELIVERY → PAYMENT_PENDING`), aucun saut (`PAID → PRODUCT_RECEIVED`, `PREPARING → IN_DELIVERY` sans passer par `SHIPPED`), aucune transition utilisateur.
- **Préconditions des routes admin** : défaut `409 INVALID_TRANSITION` / `409 ORDER_NOT_ALLOWED` + `currentStatus` (champ ajouté à l'erreur métier, §1.1).

### A.3 Mapping de migration des données V2 → V3 (DDL 003 — décisions `@backend`)

| Ancien `orders.status` (V2) | Nouveau (V3) |
|---|---|
| `WAITING_PAYMENT` | `PAYMENT_PENDING` |
| `WAITING_SELLER_PAYMENT` | `COMPLETED` si la chaîne est engagée (V2 = paiement confirmé) ; cas historique rejouable → `PAID` — à chiffrer dans `migrate.ts` 004 |
| `SELLER_PAID` | `COMPLETED` (terminal — le paiement n'est plus un statut de commande, CHG-5) |
| `PAYMENT_FAILED` / `COMPLETED` / `CANCELLED` | inchangés |
| — | nouveaux : `PAID`, `PRODUCT_WAITING`, `PRODUCT_RECEIVED`, `PREPARING`, `IN_DELIVERY`, `DELIVERED` (+ `SHIPPED`, V4 — inséré entre `PREPARING` et `IN_DELIVERY`, aucune donnée historique concernée) |

Le `seller_payouts.status` (**`PENDING`/`DUE`/`PAID`** depuis V4 — `DUE` ajouté) est **indépendant** de `orders.status` (CHG-5) : page « Paiements vendeurs » = `GET /api/admin/orders?payout=pending` (en attente produit) / `?payout=due` (livrées à payer, V4).

### A.4 Index anti-double-commande (DDL 003, recréé au DDL 007 V4)

`uq_one_active_order_per_product` : `orders(product_id)` `WHERE status IN ('CREATED','PAYMENT_PENDING','PAID','PRODUCT_WAITING','PRODUCT_RECEIVED','PREPARING','SHIPPED','IN_DELIVERY','DELIVERED')`.
Conséquences : `COMPLETED`/`PAYMENT_FAILED`/`CANCELLED` libèrent l'article (nouvelle commande possible) ; course simultanée → `409 PRODUCT_RESERVED` (translation `errors.ts`).