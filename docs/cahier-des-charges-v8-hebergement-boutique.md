# CAHIER DES CHARGES V8 — « Hébergement Boutique »

| | |
|---|---|
| **Projet** | ReVends — marketplace de revente d'articles d'occasion (Sénégal, cf. PO-V8-07) |
| **Version document** | 1.0 — **18/11/2026** |
| **Auteur** | Agent `@cahier-des-charges`, sur instruction du chef de projet et de l'utilisateur |
| **Statut** | **Validé par le chef de projet le 18/11/2026 — base de développement V8** — spécification seule, **aucune implémentation réalisée, aucune ligne de code écrite** |
| **Nature** | **Cahier additif** : il s'ajoute à V1→V7 sans les amender. Aucun verrou existant n'est modifié, à l'unique exception consignée au §8 (CA-V5-150, sous-clause « statut persisté = PENDING », pour les seuls vendeurs éligibles V8 — décision utilisateur V8-D2). |
| **Cible** | Web (React + Vite, `revends/web`) + API (Node + Express + Postgres, `revends/server`). Aucune cible mobile native. |
| **Contexte de production** | https://revends.vercel.app — branche `fix/v6-on-799a7ab` — V7 fusionné (`337da2e`, merge V7) et **déployé en production le 17/11/2026** ; HEAD courant `d81178e` (entrée journal V7) ; migrations `001`→`019_storefront.sql` **appliquées** ; smoke OK (comptes `*@test.revends`) |
| **Références amont** | `docs/cahier-des-charges.md` · `-v2.md` · `-v3.md` · `-v4-accueil.md` · `-v5.md` · `-v7-hebergement-vendeurs.md` · `docs/architecture.md` · `docs/api.md` **v2.7** · `docs/api-v7-hebergement-vendeurs.md` · `docs/design-system.md` · `docs/journal.md` |
| **Références de non-régression** | `docs/cahier-des-charges-v7-hebergement-vendeurs.md:192` (CA-V7-003) · `:193` (CA-V7-004) · `:194` (CA-V7-005) · `:215` (CA-V7-026) · `:223` (CA-V7-033) · `:227` (CA-V7-037, dont 037c) · `:228` (CA-V7-038) · `:233` (CA-V7-045) · `:240` (CA-V7-050) · `:244` (CA-V7-054) · `docs/cahier-des-charges-v5.md:399` (CA-V5-069) · `:400` (CA-V5-070) · `:498` (CA-V5-101) · `:620` et `:719` (CA-V5-150, commission 10 %) · `:114-115` (ARB-V5-05) · `:105` (ARB-V5-02) · `docs/api.md:130` (V6.4) · `docs/api.md:142` (V6.7) et `:2080-2122` (§3.8, parrainage « Le Cercle des 10 ») · `docs/cahier-des-charges.md:40` (D2, coordonnées privées) |

> **Convention de lecture (identique à V5/V7).** Chaque critère `CA-V8-xxx` est **binaire** : conforme ou non conforme. Modes de preuve : `[TEST]` = test automatisé nommé et rejouable · `[EXEC]` = requête SQL / curl / mesure exécutable · `[AUDIT]` = revue de code avec référence `fichier:ligne`. **Aucun critère ne peut être validé sur une intention annoncée : la preuve est obligatoire.**

> **Avertissement de périmètre (point clé, non négociable).** Trois verrous traversent tout le document et **ne peuvent être levés sous aucun prétexte** : (1) le bouton « Vendre un produit » reste **gratuit** et n'est jamais conditionné ; (2) le quota reste **boutique-only** (`storefront_listings`), jamais catalogue ; (3) à l'expiration, les annonces ne sont **jamais masquées du catalogue** (décision utilisateur V8-D6). La commission vendeur reste **10 %**, le parrainage « Le Cercle des 10 » reste inchangé, le pipeline de commande/paiement n'est **pas modifié** (V6.4 : aucune sollicitation vendeur avant le paiement). Tout changement d'une route existante est **interdit** ; V8 n'ajoute que de nouvelles tables/routes/champs **sur le périmètre V7/V8**.

---

## 1. Contexte et objectifs

### 1.1 Contexte métier

V7 (« Hébergement des vendeurs ») est **livré et en production** (`337da2e`, 17/11/2026) : 3 forfaits (Découverte **2 000 FCFA/mois — 10 annonces de boutique** · Boutique **5 000 — 30** · Atelier **10 000 — 100**), 30 jours glissants, activation **manuelle** admin (`PENDING → ACTIVE`), boutique publique `/boutique/:slug`, espace `/mon-abonnement`, quota dérivé en lecture de `products.status`. Aucun objet pré-V7 n'a été modifié. Le smoke est vert.

Le programme de parrainage **« Le Cercle des 10 »** récompense 10 filleuls validés par le badge **Ambassadeur** (1 an) et **30 jours de Vitrine** (priorité au tri par défaut du catalogue), sans toucher à la commission 10 % (`docs/api.md:142`, `:2080-2122`, `docs/journal.md:4269`).

**V8 « Hébergement Boutique »** renforce l'offre abonnée à la demande explicite de l'utilisateur (§3, décisions non négociables) :

1. Le bouton « Vendre un produit » reste **gratuit** — aucun quota pour les particuliers. *(V8-D1)*
2. **Publication directe** : un vendeur dont la boutique est `ACTIVE` **et** dont le compte porte un numéro `+221 7XXXXXXXX` **vérifié** publie directement en `AVAILABLE` — **personne ne voit `PENDING`** ; sinon, comportement inchangé. L'admin peut toujours rétrograder (rejet). *(V8-D2)*
3. **Badges de palier** — « Boutique » (Découverte), « Boutique Vérifiée » (Boutique), « Boutique Pro » (Atelier) — sur fiche produit et cartes catalogue, uniquement pendant l'abonnement `ACTIVE`, révoqués à l'expiration, coexistants avec le badge Ambassadeur. *(V8-D3)*
4. **Priorité d'affichage** au tri par défaut : **Atelier > Boutique > Découverte** — le payant passe **avant** la Vitrine parrainage (qui passe ensuite) ; les autres tris inchangés. *(V8-D4)*
5. **Boutique brandable** : logo + bannière (upload via le stockage Blob existant) + description + **adresse de collecte privée** (admin/logistique uniquement). *(V8-D5)*
6. À l'expiration : boutique en veille (404 publique, comportement V7 inchangé), badges et boosts disparaissent, **les annonces ne sont jamais masquées du catalogue**. *(V8-D6)*
7. **Bilan mensuel au 1er** : e-mail de bilan (PDF généré côté serveur joint) + page stats détaillée dans `/mon-abonnement`. Statistiques : vues d'articles (`view_count`), ventes, CA, meilleur article du catalogue, panier moyen, taux de conversion. *(V8-D7)*
8. Activation admin après vérification d'un paiement **Wave / Orange Money / virement** ; la souscription porte désormais une **référence de paiement** (saisie par le vendeur, visible du back-office). *(V8-D8)*
9. MAJ des verrous : **CA-V7-003 / CA-V7-004 / CA-V7-037c / CA-V7-038 restent verts** ; le quota reste **boutique-only**. *(V8-D9)*
10. Date du document : **18/11/2026**, auteur `@cahier-des-charges`, statut **« Validé par le chef de projet le 18/11/2026 — base de développement V8 »**. *(V8-D10)*

### 1.2 Objectifs mesurables et KPIs (15)

| # | Objectif / KPI | Mesure de réussite (binaire ou mesurable) |
|---|---|---|
| O1 | Supprimer la friction de modération pour les abonnés vérifiés | Éligibles : 100 % des articles créés passent `AVAILABLE` dès la création (CA-V8-010/011) |
| O2 | Garder la main de l'admin | Admin peut rétrograder un article auto-approuvé (CA-V8-014) ; % rétrogradés < 5 % à M+1 (K4) |
| O3 | Récompenser la fidélité payante sans tromper l'acheteur | Ordre tri par défaut = Atelier > Boutique > Découverte > Vitrine > reste (CA-V8-030/031/033) |
| O4 | Donner une identité aux boutiques | Logo + bannière + description publics ; adresse de collecte jamais publique (CA-V8-040..049) |
| O5 | Sécuriser le paiement manuel | 100 % des nouvelles souscriptions portent une référence Wave/OM/virement visible back-office (CA-V8-050..053) |
| O6 | Prouver la valeur de l'abonnement | Bilan e-mail + PDF au 1er à chaque `ACTIVE` (CA-V8-060/061) ; stats cohérentes page ⇄ e-mail ⇄ PDF (CA-V8-067) |
| O7 | Zéro-régression stricte | Suite V5+V6+V7 rejouée : **0 échec** (CA-V8-005/080) |
| O8 | Interdire la fuite de données | 0 occurrence de coordonnées privées ou d'adresse de collecte dans les réponses publiques (CA-V8-075/044/049) |

| KPI | Indicateur | Cible |
|---|---|---|
| K1 | Taux d'auto-approbation = articles de vendeurs éligibles publiés `AVAILABLE` sans modération | ≥ 90 % des créations d'éligibles |
| K2 | Part des abonnés `ACTIVE` éligibles (ACTIVE + `+2217…` strict) | mesure de base à J+30 ; cible ≥ 80 % |
| K3 | Volume d'articles auto-approuvés / mois | ≥ 50 à M+2 (volume abonnés) |
| K4 | Taux de rétrogradation admin des auto-approuvés | **< 5 %** (sinon : resserrer l'éligibilité, PO-V8-01) |
| K5 | Délai médian publication → visibilité catalogue (éligibles) | **0 minute** (immédiat, CA-V8-011) |
| K6 | Uplift de vues catalogue des vendeurs boostés vs non-boosting (mesure 30 j avant/après) | ≥ +15 % |
| K7 | Position médiane des articles Atelier / Boutique / Découverte au tri par défaut vs pré-V8 | amélioration ≥ 30 % |
| K8 | % de boutiques `ACTIVE` avec logo + bannière + description à J+90 | ≥ 40 % |
| K9 | Taux d'envoi réussi des bilans au 1er (livrés / `ACTIVE` éligibles au job) | ≥ 95 % |
| K10 | % d'abonnés `ACTIVE` ayant ouvert la page Stats de `/mon-abonnement` à J+30 | ≥ 50 % |
| K11 | Taux de conversion moyen catalogue (commandes PAID / vues) — référence puis comparaison à J+90 | baseline mesurée, cible +10 % relatif |
| K12 | % de nouvelles souscriptions avec référence de paiement renseignée | **100 %** (bloquante, CA-V8-050) |
| K13 | SLA d'activation admin (médiane, demande → ACTIVE) | < 24 h ouvrées ; ≥ 90 % en < 48 h |
| K14 | Taux de réclamations « payé mais pas activé » | < 2 % des souscriptions |
| K15 | Panier moyen et CA nets par abonné actif — suivi mensuel (benchmark M vs M-1) | M pub. vs M-1 ; benchmark interne ReVends (pas de benchmark marché public fiable au Sénégal) |

> **Note de benchmarks** : aucun benchmark public fiable n'existe pour des marketplaces sénégalaises d'occasion comparables ; les cibles K6/K7/K11/K15 sont des **benchmarks internes** (baseline = 30 jours avant déploiement V8, mesurée sur les mêmes cohortes). Elles sont des **objectifs de pilotage**, pas des critères de recette binaires.

### 1.3 Parties prenantes

| Rôle | Intérêt | Attentes |
|---|---|---|
| Vendeur éligible (`ACTIVE` + `+2217…`) | Publier sans attendre | Publication immédiate, badge, boost, bilan clair |
| Vendeur abonné non éligible (`ACTIVE` + téléphone hors format) | Continuité | Comportement V7 inchangé (modération `PENDING`) — aucun verrou levé à moitié |
| Vendeur non abonné / particulier | Gratuité | Bouton « Vendre » gratuit, catalogue illimité, aucune régression |
| Administrateur | Contrôle | Rétrogradation possible, file Wave/OM/virement avec référence, traçabilité |
| Acheteur / visiteur | Confiance | Badges = signal de palier, tri par défaut honnête (payant affiché avant, Vitrine ensuite), aucune coordonnée privée |
| `@architecte` / `@backend` / `@frontend` | Implémentation | Nouvelles tables/routes uniquement (§4, §6.1) ; contrat `docs/api.md` **v2.8** (livrable `@backend`) |
| `@tester` | Recette | 75 critères binaires (§6), grille de bout en bout (§9) |
| `@cahier-des-charges` | Conformité | Non-régression démontrée (§8), verdict (§11) |

### 1.4 Personas

- **Vendeur « Awa », éligible** — boutique `ACTIVE` Atelier, téléphone `+221770000001` vérifié. Publie un iPhone : `AVAILABLE` immédiatement, badge « Boutique Pro » visible, boost tri par défaut, bilan mensuel au 1er.
- **Vendeur « Moussa », abonné non éligible** — boutique `ACTIVE` Découverte, téléphone renseigné `+22133…` (fixe, hors format mobile strict) : ses articles passent **`PENDING`** comme avant V8 ; il ne perd rien, il n'attend que l'éligibilité téléphone.
- **Particulier « Fatou »** — jamais abonné. Son bouton « Vendre » est gratuit et actif ; ses articles `PENDING` suivent la modération normale ; elle ne voit aucun badge ni boost.
- **Ambassadeur « Ibrahima »** — Vitrine parrainage active + boutique `ACTIVE` Boutique : badge Ambassadeur **et** « Boutique Vérifiée » côte à côte ; au tri par défaut, les 3 payants (Atelier/Boutique/Découverte) passent avant sa Vitrine, qui reste devant les non-payants.
- **Administrateur « Chef »** — vérifie la référence Wave « WAVE-20261118-8392 » sur la demande, active, et, 3 jours plus tard, rétrograde un article auto-approuvé problématique via la route dédiée.
- **Visiteur anonyme** — voit le badge, pas les coordonnées ; la page boutique est accessible sans compte ; l'adresse de collecte reste invisible.

---

## 2. Périmètre

### 2.1 Dans le périmètre (enablement) — F1 à F9, avec « Fais / Ne fais pas »

**F1 — Publication directe (auto-approbation) des vendeurs éligibles**
- **Fais :** création d'article par un vendeur **éligible** (§4.1) → `products.status = 'AVAILABLE'` **dès l'insert** ; trace dans la nouvelle table `auto_approved_products` ; annonce immédiatement visible et vendable ; l'article compte dans le quota **boutique** dès son ajout à la boutique (comme tout article `AVAILABLE`).
- **Ne fais pas :** ne jamais auto-approuver un vendeur `PENDING`, `EXPIRED`, `CANCELLED`, non abonné, ou dont le téléphone n'est pas au format strict `+2217…` ; ne jamais auto-approuver rétroactivement des articles créés avant l'éligibilité ; ne jamais contourner la modération pour les non-éligibles ; ne jamais notifier le vendeur avant le paiement (V6.4).

**F2 — Badges de palier (« Boutique » · « Boutique Vérifiée » · « Boutique Pro »)**
- **Fais :** badge dérivé en lecture du palier de l'abonnement `ACTIVE` (JOIN) affiché sur la **fiche produit** et les **cartes catalogue** des vendeurs abonnés ; Ambassadeur coexiste, affiché **à côté** ; disparition à l'expiration.
- **Ne fais pas :** ne jamais stocker le badge (aucune colonne) ; ne jamais afficher de badge pour `PENDING`/`EXPIRED`/`CANCELLED`/non-abonné ; ne jamais écraser ou remplacer le badge Ambassadeur ; ne jamais afficher de badge sur les profils/admin/pages hors fiche et catalogue.

**F3 — Priorité d'affichage au tri par défaut (Atelier > Boutique > Découverte > Vitrine)**
- **Fais :** au tri par défaut uniquement (`sort` absent / `recent`), composer `tier_rank DESC, EXISTS(vitrine_until > now()) DESC, created_at DESC, id` ; boost actif seulement pendant `ACTIVE` ; les tris explicites de l'acheteur (`price_asc`, `price_desc`, `oldest`, `popular`, `relevance`, sections `promotions`/`best_offers`/`discover`) **inchangés**.
- **Ne fais pas :** ne pas injecter le boost dans les tris explicites ni dans les sections curées ; ne pas écrire dans `products`/`users` ; ne pas dégrader la pagination (clés `id` en tie-break) ; ne pas masquer la Vitrine (elle passe après le payant, pas disparaît).

**F4 — Boutique brandable (logo, bannière, description, adresse de collecte privée)**
- **Fais :** nouvelle table `storefront_profiles` (1:1 par vendeur) ; logo (**≤ 2 Mo**) + bannière (**≤ 4 Mo**) via **le Blob existant** (`storage.ts`, nouveau préfixe `uploads/storefront/`) ; description publique (0–500 caractères, échappée) affichée sur `/boutique/:slug` ; **adresse de collecte privée** visible **uniquement** dans le back-office admin (livraison/collecte) ; édition possible dès l'abonnement `PENDING` (préparation), rendu public seulement si `ACTIVE`.
- **Ne fais pas :** ne pas exposer l'adresse de collecte sur la page publique, le catalogue, la fiche, les PDF, les e-mails ni les logs ; ne pas accepter d'upload non-image, un logo > 2 Mo ou une bannière > 4 Mo (logo ≤ 2 Mo, bannière ≤ 4 Mo) ; ne pas créer un second backend de stockage ; ne pas modifier la page boutique existante au-delà de l'insertion du bloc branding.

**F5 — Référence de paiement à la souscription (Wave / Orange Money / virement)**
- **Fais :** migration `020_storefront_v8.sql` ajoute à `seller_subscriptions` deux colonnes **nullable** : **`payment_reference varchar(64)`** + **`payment_method varchar(32)`** (∈ `wave | orange_money | virement`) — périmètre V7/V8 uniquement, conforme CA-V7-001 (PO-V8-05 clos le 18/11/2026) ; **obligatoires à la souscription** (400 sinon) ; affichées dans le back-office (file `PENDING`, détail) ; jamais publiques.
- **Ne fais pas :** ne pas créer de checkout ni de webhook de paiement d'abonnement ; ne pas faire de la référence un déclencheur d'activation (seule la route admin active, CA-V7-013) ; ne pas journaliser la référence en clair ; ne pas réactiver/patcher le pipeline de paiement des commandes (V6.x).

**F6 — Bilan mensuel au 1er (e-mail + PDF serveur + page Stats dans `/mon-abonnement`)**
- **Fais :** en production, déclencheur externe **Vercel Cron** — `POST /api/cron/monthly-report`, secret `CRON_SECRET`, déclaré dans `vercel.json` (`crons`) ; **quotidien à 06:00 UTC**, dispatch bilan **le 1er** (envoi du bilan du mois précédent) **et le dernier jour** (clôture du relevé `views_sum`) ; en dev/tests, déclenchement in-process possible (mêmes fonctions métier), CA-V8-060 testable dans les deux modes (**PO-V8-06 RETENU le 18/11/2026**) ; pour chaque abonnement `ACTIVE` à l'instant T (`ends_at > T`) : e-mail « Bilan mensuel — {boutique} — {mois} » avec **PDF joint généré côté serveur** (génération `pdfkit` — dépendance acceptée, PDF **ré-généré à la demande** (GET /api/subscriptions/me/report) ; archivage R2 reportée V9, à arbitrer) ; insert idempotent dans **`monthly_metrics`** (`PK (subscription_id, period)`) ; relevés `views_baseline` (1er) et `views_sum` (dernier jour) capturés dans `monthly_metrics` ; page **Stats** dans `/mon-abonnement` (6 métriques + historique 12 mois) ; métriques : vues (`view_count`, delta `views_sum − views_baseline`), ventes, CA brut/net, meilleur article du catalogue, panier moyen, taux de conversion.
- **Ne fais pas :** ne pas envoyer à `PENDING`/`EXPIRED`/`CANCELLED`/non-abonnés ; ne pas déclencher la moindre écriture sur `products`, `orders`, `payments` ; ne pas laisser un double envoi (idempotence stricte) ; ne pas inclure de donnée d'un tiers (acheteur) ni les coordonnées du vendeur ; ne pas faire échouer une action métier si l'e-mail échoue (`FAILED` journalisé, le bilan est conservé) ; ne pas modifier les 11 templates V5 ni le contrat Mailer existant (extension **additive** : nouveau `MailEvent 'storefront_monthly_report'`, pièces jointes en paramètre optionnel).

**F7 — Veille à l'expiration (badges off, boosts off, catalogue intact)**
- **Fais :** à l'échéance (`ends_at`), comportement V7 inchangé (boutique publique → 404, listings conservés, catalogue intact) **plus** : badges et boosts disparaissent (dérivés en lecture — aucun traitement batch), le tri par défaut redevient le tri V6.7+V7, le bilan cesse (job exclut les non-`ACTIVE`), `/mon-abonnement` affiche le message d'expiration existant.
- **Ne fais pas :** ne jamais masquer, dépublier, déclasser hors boost les annonces du catalogue ; ne pas supprimer listings ni profil branding ; ne pas envoyer de bilan au 1er à un `EXPIRED` ; ne pas modifier la règle de réveil (re-souscription = nouveau `PENDING`, slug récupéré — V7 inchangé).

**F8 — Rétrogradation admin d'un article auto-approuvé (`AVAILABLE → REJECTED`)**
- **Fais :** nouvelle route admin **`POST /api/admin/products/:id/retrograde`** (body `{ reason }`, raison ≥ 10 caractères) : `AVAILABLE → REJECTED` réservé aux produits **tracés dans `auto_approved_products`** (sinon `409 NOT_AUTO_APPROVED`) ; notifie le vendeur (`article_rejected` existant) ; trace `admin_actions` (`product.auto_approved_retrograded`) ; le produit disparaît du catalogue (mécanisme existant) ; libère une place boutique par dérivation (`products.status = REJECTED`).
- **Ne fais pas :** ne pas modifier la route existante `POST /api/admin/products/:id/reject` (`PENDING → REJECTED`) ; ne pas permettre la rétrogradation d'un `PENDING` (utiliser la route existante) ni d'un `SOLD`/`RESERVED` (`409 INVALID_STATUS`) ; ne pas offrir la rétrogradation à un non-admin.

**F9 — Schéma additif V8 (migration `020_storefront_v8.sql`)**
- **Fais :** **3 nouvelles tables** : `storefront_profiles` (branding), `auto_approved_products` (traçabilité auto-approbation), **`monthly_metrics`** (bilan mensuel — fusion actée des propositions `storefront_monthly_reports` + `storefront_view_snapshots` : `views_sum`, `views_baseline`, `sales_count`, `ca_fcfa`, `email_status`, `sent_at`, `computed_at`, `PK (subscription_id, period)`) ; **2 colonnes nullable** sur `seller_subscriptions` (périmètre V7/V8 : `payment_reference varchar(64)`, `payment_method varchar(32)`) ; nouveaux index minimaux ; rejouable/idempotente (`IF NOT EXISTS`) ; aucune modification des migrations `001`→`019` déjà appliquées.
- **Ne fais pas :** aucune colonne sur `users`, `products`, `orders`, `payments`, `notifications`, `referral_qualifications`, `storefront_listings`, `subscription_plans` ; aucun `ALTER TYPE` ; aucun trigger ; aucun cron sur `products` ; **aucune nouvelle valeur** dans `notification_type` (réutilisation de valeurs existantes uniquement) ; `storefront_listings` reste **sans** `status` ni colonne V8.

### 2.2 Hors-périmètre détaillé — explicite et non négociable

| Sujet intouché | Raison / verrou |
|---|---|
| `POST /api/products`, `/vendre`, `/mes-articles` — **bouton « Vendre »** | **Gratuit, illimité, jamais conditionné** (CA-V5-069/070, CA-V7-003/004 ; décision V8-D1). Seule exception V8 : pour un vendeur **éligible**, le statut persisté à l'insert est `AVAILABLE` au lieu de `PENDING` (F1/V8-D2) — comportement de la modération inchangé pour tous les autres cas |
| Catalogue, recherche, catégories, fiche produit | **Aucune URL, forme de réponse, filtre ni tri modifié** ; seul le tri **par défaut** compose un rang payant dérivé (F3) ; les tris explicites restent identiques ; la fiche ne réintroduit aucun canal de contact (CA-V5-101, `cahier-des-charges-v5.md:498`) |
| Panier, commandes, checkout, paiement, payouts, commission **10 %** | **Aucun changement de comportement** ; aucun abonnement ne prélève de frais sur une vente ; `COMMISSION_RATE` = 10 % exact, depuis la source de vérité (CA-V5-150, `cahier-des-charges-v5.md:620`, `:719` ; CA-V7-006) ; **aucune écriture** V8 dans le pipeline (grep dédié, CA-V8-083) |
| **V6.4** — aucune sollicitation vendeur avant le paiement | `docs/api.md:130` — V8 ne crée aucun e-mail/notification vendeur avant `PAID` ; l'auto-approbation n'est pas un paiement et n'enclenche aucun envoi vendeur ; seul l'acheteur reste notifié à la création (`order_created`) |
| Parrainage « Le Cercle des 10 » | Aucune écriture dans `referred_by`, `ambassador_until`, `vitrine_until`, `referral_qualifications` ; badge Ambassadeur et priorité Vitrine (après le payant en V8) inchangés (`docs/api.md:142`, `:2080-2122` ; CA-V7-054) |
| Notifications existantes | Aucune supprimée, déplacée ou modifiée ; V8 **réutilise** `article_rejected` (rétrogradation) et ajoute un `MailEvent` applicatif pour le bilan (pas un nouveau `notification_type`) |
| `users`, `products`, `orders`, `payments`, `notifications` et toute table pré-V8 | **Aucune colonne ajoutée, aucun index modifié** (CA-V8-001/002) ; V8 n'ajoute que 4 tables neuves + 2 colonnes nullable **sur `seller_subscriptions`** (table V7, périmètre V7/V8 — décision V8-D5/D8, CA-V8-001) |
| Rôles `user` / `admin` | Aucun nouveau rôle, aucun changement RBAC, aucune élévation de privilège |
| Vitrine gagnée (`vitrine_until`) | Mécanisme indépendant ; V8 ne fait que la faire passer **après** les paliers payants au tri par défaut — priorité Vitrine inchangée pour les tris explicites et pour les non-payants |
| Paiement en ligne / abonnement récurrent | **Aucun** checkout, webhook, carte, PSP pour l'abonnement ; activation uniquement manuelle par l'admin après vérification du paiement Wave/OM/virement (CA-V7-014 inchangé) |
| Application mobile native | Hors périmètre, cohérent V1→V7 |
| Suppression (hard delete) d'un produit / d'un compte | Inchangé : soft delete admin-only conservé |
| E-mails de campagne / newsletter | Hors périmètre |
| CRUD admin des forfaits | Les forfaits restent seedés en base ; aucune UI de CRUD forfait en V8 |
| Numéro téléphone / WhatsApp / e-mail du vendeur | Jamais exposé (D2, `docs/cahier-des-charges.md:40`) |
| **L'annonce du catalogue jamais masquée par l'expiration** | Décision utilisateur V8-D6 (rappelée §4.6) — les annonces restent visibles et vendables, toujours |

### 2.3 Interprétations à consigner explicitement

1. **L'éligibilité à la publication directe est dérivée en lecture, à chaque création** — abonnement `ACTIVE` (`status = 'ACTIVE'`, `ends_at > now()`) **ET** numéro `+221 7XXXXXXXX` (format strict Sénégal, `users.phone ~ '^\+2217[0-9]{8}$'`, migration `016_phone_strict_9_chiffres.sql`) — **double verrou : format `+221 7XXXXXXXX` + activation admin (Wave / Orange Money / virement) — (a) RETENU, PO-V8-01 clos le 18/11/2026**. Aucun drapeau n'est persisté ; une révocation est immédiate (passage `EXPIRED`, correction du numéro).
2. **L'auto-approbation porte sur la création uniquement.** Les articles existants en `PENDING` au moment où le vendeur devient éligible **restent en modération** ; aucune bascule rétroactive.
3. **Badges et boosts sont dérivés en lecture** (JOIN palier + `status = 'ACTIVE'` + `ends_at > now()`) — jamais stockés, jamais mis en cache longue durée ; leur disparition à l'expiration ne nécessite **aucun job**.
4. **Le payant passe avant la Vitrine au tri par défaut uniquement.** L'ordre « Atelier > Boutique > Découverte » est piloté par le palier de l'abonnement `ACTIVE` ; la Vitrine (`vitrine_until > now()`) vient ensuite ; le reste du tri (`created_at DESC, id`) est inchangé. Les tris explicites ne changent pas (verrou V6.7).
5. **« Meilleur catalogue » (V8-D7) est interprété comme « meilleur article du catalogue du vendeur »** — **interprétation « meilleur article du catalogue du vendeur sur le mois » (ventes PAID, tie-break vues) — RETENUE, PO-V8-02 clos le 18/11/2026** : l'article du vendeur ayant généré le plus de ventes `PAID` sur le mois (tie-break : `view_count` décroissant).
6. **Le mois de rattachement d'une vente** = **mois de rattachement = `order_events.to_status = 'PAID'` — RETENU, PO-V8-03 clos le 18/11/2026** (événement horodaté, fiable) ; pas `orders.created_at`.
7. **Vues du mois = delta de snapshots (compteurs `view_count` capturés au 1er et au dernier jour) — RETENU, PO-V8-04 clos le 18/11/2026** ; au **premier bilan** (pas de relevé antérieur), la valeur affichée est le **cumul** (`view_count` courant) libellée « vues cumulées (1er relevé) ».
8. **2 colonnes sur `seller_subscriptions`** : **`ALTER TABLE seller_subscriptions ADD COLUMN payment_reference varchar(64)` + `payment_method varchar(32)` (périmètre V7/V8 uniquement, conforme CA-V7-001) — RETENU, plan B documenté conservé, PO-V8-05 clos le 18/11/2026** : `ALTER TABLE seller_subscriptions ADD COLUMN` (nullable, sans défaut), sur le périmètre V7/V8. Aucune autre table n'est altérée (CA-V8-001) ; plan B conservé au §7/R-V8-10 (table `subscription_payment_refs` 1:1, migration 021).
9. **Le quota n'est jamais consulté pour l'auto-approbation.** Un article auto-approuvé peut être refusé à l'ajout boutique (quota plein) : il reste `AVAILABLE` et vendable dans le catalogue (verrou CA-V7-033 inchangé).
10. **L'adresse de collecte est une donnée interne.** Sa seule surface : back-office admin (détail abonnement) et usage logistique ; **zéro** occurrence publique (CA-V8-044/049).

---

## 3. Décisions utilisateur V8 (déjà prises, non renégociables)

| # | Décision | Conséquence dans ce cahier |
|---|---|---|
| V8-D1 | Le bouton « Vendre un produit » reste **gratuit** — aucun quota pour les particuliers ; article `PENDING` à valider comme aujourd'hui ; verrou CA-V5-069 vert | CA-V8-003/004 ; §2.2 ; §8 |
| V8-D2 | **Publication directe** pour boutique `ACTIVE` + compte `+221 7XXXXXXXX` vérifié : article directement `AVAILABLE` ; sinon inchangé ; admin peut toujours rétrograder (rejet) | F1, F8 ; §4.1 ; CA-V8-010..019, 075..085 ; §8 (CA-V5-150, sous-clause PENDING — seule dérogation consignée) |
| V8-D3 | Badges « Boutique » / « Boutique Vérifiée » / « Boutique Pro » sur fiche produit et cartes catalogue, pendant `ACTIVE` uniquement ; révoqués à l'expiration ; Ambassadeur coexiste à côté | F2 ; §4.2 ; CA-V8-020..027 |
| V8-D4 | Tri par défaut : **Atelier > Boutique > Découverte** — le payant **avant** la Vitrine parrainage, qui passe ensuite ; autres tris inchangés | F3 ; §4.3 ; CA-V8-030..037 |
| V8-D5 | Boutique **brandable** : logo + bannière (Blob existant) + description + adresse de collecte privée (admin/logistique) | F4 ; §4.4 ; CA-V8-040..049 |
| V8-D6 | À l'expiration : veille, badges et boosts disparaissent, **les annonces ne sont JAMAIS masquées du catalogue** | F7 ; §4.6 ; CA-V8-021/031/076 ; §8 |
| V8-D7 | **Bilan mensuel au 1er** : e-mail (PDF généré côté serveur joint) + page stats détaillée dans `/mon-abonnement` — vues, ventes, CA, meilleur article du catalogue, panier moyen, taux de conversion | F6 ; §4.5 ; CA-V8-060..072 |
| V8-D8 | Activation admin après vérification d'un paiement **Wave / Orange Money / virement** ; la souscription porte une **référence de paiement** (saisie vendeur, visible back-office) | F5 ; §4.5 ; CA-V8-050..057 |
| V8-D9 | MAJ des verrous V7 : **CA-V7-003 / CA-V7-004 / CA-V7-037c / CA-V7-038 restent verts** ; quota **boutique-only**, jamais catalogue | §6.1/6.8 ; §8 |
| V8-D10 | Date **18/11/2026** ; auteur `@cahier-des-charges` ; statut **« Validé par le chef de projet le 18/11/2026 — base de développement V8 »** | En-tête ; §11 |

---

## 4. Règles métier

### 4.1 Éligibilité à la publication directe (dérivée en lecture — aucune colonne, aucun flag)

| Règle | Énoncé vérifiable |
|---|---|
| **Éligibilité** | Vendeur `S` est éligible à l'instant T ⟺ `∃` abonnement `s` de `S` tel que `s.status = 'ACTIVE'` **et** `s.ends_at > T` **et** `(SELECT phone FROM users WHERE id = S) ~ '^\+2217[0-9]{8}$'`. Sinon, comportement V7 strictement inchangé (`PENDING` + modération). |
| **Point d'application** | Uniquement à `INSERT` dans `products` (création d'article), dans la **même transaction**. Aucun autre chemin (édition, réactivation, import) ne consulte l'éligibilité. |
| **Statut persisté** | Éligible → `AVAILABLE` ; non éligible → `PENDING`. La création en 5 étapes et `POST /api/products` gardent leur flux ; seul le statut initial diffère, et uniquement pour les éligibles. |
| **Trace** | Chaque auto-approbation insère **exactement une ligne** dans `auto_approved_products(product_id PK/FK, seller_id, subscription_id, created_at)`. Aucune lecture de comportement ne s'appuie sur cette table (seule la rétrogradation F8 et l'audit la consultent). |
| **Visible par personne** | Le produit n'existe **jamais** en `PENDING` pour un éligible : aucune réponse API, aucune liste admin, aucune fiche ne peut le montrer en attente (K5 = 0 min). |
| **Réversibilité** | Admin seul : `POST /api/admin/products/:id/retrograde` (F8) `AVAILABLE → REJECTED`. Réservé aux produits tracés dans `auto_approved_products` (`409 NOT_AUTO_APPROVED` sinon). |
| **Hors champ** | Articles créés avant l'éligibilité ; articles d'un vendeur redevenu éligible après réactivation ; cas `RESERVED` → `AVAILABLE` (refus post-réservation) : restent sous contrôle pipeline existant. |
| **V6.4** | L'auto-approbation n'envoie **aucune** notification vendeur ; l'admin consulte la liste `GET /api/admin/auto-approvals` (nouvelle route, F8). |
| **Quota** | L'auto-approbation n'accorde **aucune** place boutique ; l'ajout à la boutique reste manuel et soumis au quota V7 (CA-V7-031). |

### 4.2 Badges de palier (dérivés en lecture — jamais stockés)

| Palier (ACTIVE) | Libellé exact du badge | Cible visuelle |
|---|---|---|
| Découverte | « Boutique » | Fiche produit + cartes catalogue des vendeurs du vendeur |
| Boutique | « Boutique Vérifiée » | Fiche produit + cartes catalogue |
| Atelier | « Boutique Pro » | Fiche produit + cartes catalogue |

- Rendu : `ACTIVE` uniquement (`status = 'ACTIVE'`, `ends_at > now()`), sinon **aucun badge** (révocation paresseuse à l'expiration, sans job).
- Le badge **Ambassadeur** (`users.ambassador`) **coexiste** : les deux badges sont affichés côte à côte ; aucun n'écrase l'autre (CA-V7-054 préservé).
- Aucune colonne badge nulle part ; sérialisation via `JOIN seller_subscriptions` + `subscription_plans` en lecture (même pattern que le quota V7).
- Le badge n'est **pas** un canal de contact et n'ajoute aucune PII (D2).

### 4.3 Priorité d'affichage au tri par défaut du catalogue

- **Périmètre** : tri par défaut uniquement (`GET /api/products` avec `sort` absent ou `recent`). Toute section curée (`promotions`, `best_offers`, `discover`, `popular`, `new`) et tout tri explicite (`price_asc`, `price_desc`, `oldest`, `popular`, `relevance`) sont **inchangés**.
- **Ordre composé** (au lieu de `EXISTS(vitrine) DESC, created_at DESC, id`) :
  ```
  CASE WHEN <palier ACTIVE du owner> = 'Atelier' THEN 3
       WHEN = 'Boutique' THEN 2
       WHEN = 'Découverte' THEN 1
       ELSE 0 END DESC,
  EXISTS (SELECT 1 FROM users wv WHERE wv.id = p.owner_id AND wv.vitrine_until > now()) DESC,
  p.created_at DESC, p.id
  ```
- La **Vitrine** reste affichée **avant les non-payants**, mais **après les trois paliers payants** (décision V8-D4).
- Boost actif uniquement pendant `ACTIVE` (`ends_at > now()`) — sinon le rang retombe à `0` sans aucune écriture (F7).
- Pagination stable : le tie-break final `p.id` reste obligatoire ; offset + id évite doublons/sauts inter-pages (critère CA-V8-035).
- Aucun produit n'est masqué, filtré ou exclu ; le nombre par page (`perPage`) est inchangé.

### 4.4 Boutique brandable

| Règle | Énoncé vérifiable |
|---|---|
| **Schéma** | `storefront_profiles(seller_id PK/FK→users, logo_url TEXT NULL, banner_url TEXT NULL, description TEXT NULL CHECK (char_length(description) ≤ 500), collection_address TEXT NULL, created_at, updated_at)` — 1:1 ; `ON DELETE CASCADE`. |
| **Upload** | Nouvelles routes `POST /api/storefront/profile/logo` et `POST /api/storefront/profile/banner` (multipart, `image/jpeg|png|webp` — **logo ≤ 2 Mo, bannière ≤ 4 Mo**, UUID serveur ; réutilise `storage.ts` — nouveau préfixe logique `uploads/storefront/`, **même** backend Blob ou disque que `savePhoto`). `DELETE` symétrique → retour au défaut. |
| **Description** | Publique sur `/boutique/:slug` ; rendu **échappé** (React, 0 HTML brut) ; 0–500 caractères (graphemes) ; jamais dans les réponses catalogue/fiche (uniquement la boutique et `GET /api/storefront/:slug`). |
| **Adresse de collecte privée** | `collection_address` : saisie vendeur dans `/mon-abonnement` (textarea 10–500 caractères), stockée, **publique nulle part** ; visible uniquement via la vue admin (détail abonnement) pour **admin/logistique** ; aucun export public ; 0 occurrence dans réponses publiques, PDF, e-mails, logs (CA-V8-044/049). |
| **Disponibilité** | Édition possible dès `PENDING` (préparation) ; rendu public seulement si `ACTIVE` (sinon page boutique 404 inchangée, V7). |
| **Contrastes** | Bannière = décorative (`alt=""` / `aria-hidden`) ; logo = `alt=« Logo de la boutique {nom} »` ; description lisible (contrastes AA, CA-V8-048). |

### 4.5 Référence de paiement et bilan mensuel

**Référence de paiement (F5)**
- Migration `020_storefront_v8.sql` : `ALTER TABLE seller_subscriptions ADD COLUMN IF NOT EXISTS payment_reference varchar(64) NULL, ADD COLUMN IF NOT EXISTS payment_method varchar(32) NULL CHECK (payment_method IN ('wave','orange_money','virement'));` (2 colonnes, nullable, périmètre V7/V8 uniquement, conforme CA-V7-001 — **RETENU le 18/11/2026, PO-V8-05 clos** ; plan B documenté conservé : table `subscription_payment_refs` 1:1, migration 021).
- `POST /api/subscriptions` exige désormais `paymentMethod` et `paymentReference` (trim, 4–64 caractères, regex `^[A-Za-z0-9][A-Za-z0-9 .\-_/]{2,62}$` — aucun CR/LF/HTML) ; sinon `400 PAYMENT_REFERENCE_REQUIRED` / `400 INVALID_PAYMENT_METHOD` / `400 INVALID_PAYMENT_REFERENCE`.
- Affichage : back-office file `PENDING` + détail (méthode, référence) ; l'espace vendeur affiche **sa propre** référence (jamais celle des autres).
- Legacy : les `PENDING` pré-V8 (référence NULL) restent activables (K13 non bloqué) ; la file les affiche « référence absente ».
- **Non déclenchant** : la référence n'active rien ; seule la route admin `POST /api/admin/subscriptions/:id/activate` (CA-V7-013) fait passer `PENDING → ACTIVE`.

**Bilan mensuel (F6)**
- **Job** : en production, déclencheur externe **Vercel Cron** — `POST /api/cron/monthly-report`, secret `CRON_SECRET` (header `x-cron-secret`), déclaré dans `vercel.json` (`crons`) — **06:00 UTC quotidien**, avec **dispatch bilan le 1er et le dernier jour du mois** (envoi du bilan du mois précédent le 1er à 06:00 UTC ; clôture du relevé `views_sum` le dernier jour) ; en dev/tests, déclenchement in-process possible (mêmes fonctions métier, `DISABLE_CRON` respecté) — **RETENU le 18/11/2026, PO-V8-06 clos** ; CA-V8-060 testable dans les deux modes. Le job est **additif** : la tâche minute-par-minute d'expiration des réservations n'est pas modifiée. Capture des compteurs dans `monthly_metrics` : `views_baseline` posée au 1er, `views_sum` rafraîchie/clôturée au dernier jour ; delta vues = `views_sum − views_baseline`.
- **Sélection** : `seller_subscriptions s WHERE s.status = 'ACTIVE' AND s.ends_at > :T` (`T` = début de la run). Exclus : `PENDING`, `EXPIRED`, `CANCELLED`, non-abonnés. **Envoi le 1er du mois à 06:00 UTC** (Vercel Cron quotidien en prod ; dispatch actif 1er/dernier jour).
- **Métriques du mois M** (M = mois précédent, ex. job du 1er décembre → novembre) — 6 métriques, CA affiché en brut et en net (7 lignes) :
  | Métrique | Définition exacte |
  |---|---|
  | Vues | **delta de compteurs capturés dans `monthly_metrics` (`views_baseline` au 1er, `views_sum` au dernier jour)** — delta = `views_sum − views_baseline` (premier bilan : cumul, libellé « vues cumulées (1er relevé) ») — PO-V8-04 clos · **stockées** |
  | Ventes | `COUNT(DISTINCT o.id)` tel que `∃ e ∈ order_events`, `e.order_id = o.id`, `e.to_status = 'PAID'`, `e.created_at ∈ M`, `o.seller_id = vendeur` · **stockées** (`sales_count`) |
  | CA brut | `Σ o.amount` (idem périmètre) · **stocké** (`ca_fcfa`) |
  | CA net vendeur | `Σ o.seller_amount` ; commission = `Σ o.commission` (10 % exact, CA-V5-150) · **dérivé au rendu** (recalcul `order_events`, jamais stocké) |
  | Panier moyen | `ca_fcfa / sales_count` (0 vente → « — ») · **dérivé au rendu** |
  | Meilleur article du catalogue | produit du vendeur avec le plus de ventes `PAID` dans M ; tie-break `view_count DESC` ; libellé « {nom} — {n} ventes » · **dérivé au rendu** (recalcul, jamais stocké) |
  | Taux de conversion | `sales_count / (views_sum − views_baseline)` (delta = 0 → « — ») à 2 décimales · **dérivé au rendu** |

> **Stockage vs dérivation.** Seules `views_sum`, `views_baseline`, `sales_count`, `ca_fcfa` (+ `email_status`, `sent_at`, `computed_at`) sont persistées dans `monthly_metrics`. CA net, panier moyen, meilleur article et taux de conversion sont **dérivés au rendu** (recalcul identique `order_events`/`orders` pour page ⇄ e-mail ⇄ PDF — CA-V8-067, valeurs égales sur fixture gelée).
- **Persistance idempotente** : `INSERT ... ON CONFLICT (subscription_id, period) DO NOTHING` dans `monthly_metrics(subscription_id BIGINT FK → seller_subscriptions(id) ON DELETE CASCADE, period TEXT ('YYYY-MM'), views_sum BIGINT, views_baseline BIGINT, sales_count INTEGER, ca_fcfa BIGINT, email_status TEXT NULL ('SENT'|'FAILED'), sent_at TIMESTAMPTZ NULL, computed_at TIMESTAMPTZ NOT NULL DEFAULT now(), PK (subscription_id, period))`. Rejouer la run ne renvoie **aucun** second e-mail.
- **PDF** : généré serveur (lib **pdfkit acceptée** — nouvelle dépendance, aucun service externe) ; PDF servi sur demande via `GET /api/subscriptions/me/report` (non archivé en V8 ; archivage R2 reporté V9, arbitré plus tard) ; pages A4 ; contenu : en-tête « Bilan mensuel ReVends — {boutique} — {mois} », les 7 lignes de métriques (vues, ventes, CA brut, CA net, panier moyen, meilleur article, taux de conversion), pied « ReVends — Hébergement Boutique » ; ≤ 2 Mo ; **aucune** donnée d'un tiers ; aucune coordonnée du vendeur ; le nom de fichier `bilan-{slug}-{YYYY-MM}.pdf`.
- **E-mail** : `MailEvent 'storefront_monthly_report'` ajouté à `templates.ts` (sujet « Votre bilan ReVends de {mois} — {boutique} ») ; `sendMail()` étendu d'un paramètre **optionnel** `attachments?: { filename, content, contentType }[]` — **aucun appel existant modifié** (CA-V8-071) ; échec d'envoi → `email_status = 'FAILED'`, log, **jamais** d'exception qui bloque le job (principe P8 V5).
- **Page Stats** : onglet « Statistiques » dans `/mon-abonnement` — dernier bilan (6 métriques, CA affiché brut et net = 7 lignes) + historique (12 derniers mois) + état d'envoi ; **propriétaire uniquement** ; 0 PII d'autrui.

### 4.6 Expiration — veille, jamais de masquage du catalogue

Inchangé depuis V7 (§4.2, CA-V7-016) et renforcé par V8 :
- `ends_at` atteint → `EXPIRED` (paresseux en lecture, V7) : `/boutique/:slug` → **404**, listings **conservés**, message clair dans `/mon-abonnement`, re-souscription possible (slug récupéré).
- **V8 ajoute** : badges et boosts **disparaissent** (dérivés, F7) au même instant de lecture ; le catalogue public n'est **pas** affecté — aucun produit du vendeur n'est filtré, déclassé hors règles F3, ni masqué. La Vitrine (le cas échéant) reprend son rang V6.7 (avant les non-payants).
- Le bilan du 1er **exclut** tout abonnement non `ACTIVE` au moment de la run (borne `ends_at > T`).

### 4.7 Règles de données et de cycle de vie (compléments V8)

| Règle | Énoncé vérifiable |
|---|---|
| **Trace d'auto-approbation** | `auto_approved_products(product_id PK REFERENCES products ON DELETE CASCADE, seller_id NOT NULL REFERENCES users, subscription_id NOT NULL REFERENCES seller_subscriptions, created_at DEFAULT now())` — aucune autre écriture métier ne la lit. |
| **Unicité du relevé de vues** | `monthly_metrics` — 1 ligne `(subscription_id, period)` par abonnement actif par mois ; `views_baseline` posée au 1er, `views_sum` clôturée au dernier jour ; `PK (subscription_id, period)`. |
| **Rétrogradation** | `POST /api/admin/products/:id/retrograde` — transaction : `products.status AVAILABLE → REJECTED` (sinon `409 INVALID_STATUS`) ; motif obligatoire (≥ 10 caractères) ; `admin_actions.action = 'product.auto_approved_retrograded'` ; notification `article_rejected` ; réponse `{ product }`. |
| **Pas d'auto-rétrogradation** | Le routeur admin est `requireAdmin` ; un `user` → `403` (convention ARB-V5-02 conservée). |
| **Historique immuable** | `monthly_metrics` : une ligne par (subscription_id, period) — jamais écrasée ; `email_status` seul peut transiter `SENT → FAILED`? Non : `SENT` est terminal ; `FAILED` terminal (**renvoi manuel = V9, hors V8 — PO-V8-08 RETENU le 18/11/2026**). |
| **Annulation par l'éligible** | Un vendeur éligible peut choisir de repasser en modération ? **Non** (hors périmètre) : l'auto-approbation est systématique pour les éligibles ; seule la rétrogradation admin corrige. |

---

## 5. User stories

**US-V8-01** — *En tant que vendeur éligible, je veux que mon article soit visible immédiatement à la publication, afin de ne pas attendre la modération pour vendre.*
- Exigences : création → `AVAILABLE` immédiat ; fiche et catalogue visibles ; aucune validation manuelle.
- Contraintes : éligibilité dérivée (§4.1) ; V6.4 respecté ; verrou CA-V5-150 conservé pour les non-éligibles ; rétrogradation admin possible.

**US-V8-02** — *En tant que vendeur abonné, je veux voir mon badge de palier sur ma fiche et mes cartes catalogue, afin que mes acheteurs identifient ma boutique.*
- Exigences : « Boutique » / « Boutique Vérifiée » / « Boutique Pro » ; rendu conditionnel `ACTIVE` ; coexistence avec Ambassadeur.
- Contraintes : badge dérivé en lecture ; jamais stocké ; révoqué à l'expiration.

**US-V8-03** — *En tant qu'acheteur, je veux voir en premier au tri par défaut les boutiques payantes puis la Vitrine, afin de découvrir l'offre mise en avant sans me laisser tromper.*
- Exigences : ordre Atelier > Boutique > Découverte > Vitrine > `created_at DESC, id` ; tris explicites inchangés.
- Contraintes : payant **avant** Vitrine uniquement au tri par défaut ; aucun article masqué ; pagination stable.

**US-V8-04** — *En tant que vendeur abonné, je veux personnaliser ma boutique (logo, bannière, description), afin d'avoir une présence reconnaissable.*
- Exigences : upload logo/bannière ; description 0–500 caractères ; aperçu public seulement si `ACTIVE`.
- Contraintes : stockage Blob existant ; adresse de collecte **jamais publique** ; échappement XSS.

**US-V8-05** — *En tant que vendeur, je veux saisir ma référence Wave/Orange Money/virement à la souscription, afin que l'admin vérifie mon paiement rapidement.*
- Exigences : champs obligatoires à la souscription ; affichage back-office file `PENDING`.
- Contraintes : aucun prélèvement automatique ; seule la route admin active ; référence jamais publique ni journalisée en clair.

**US-V8-06** — *En tant qu'administrateur, je veux activer une souscription après vérification du paiement, puis rétrograder un article auto-approuvé problématique, afin de garder le contrôle qualité.*
- Exigences : file `PENDING` avec méthode + référence ; route de rétrogradation dédiée ; traçabilité `admin_actions`.
- Contraintes : aucune élévation de privilège ; la route `reject` V5 inchangée ; `403` pour un `user`.

**US-V8-07** — *En tant que vendeur abonné, je veux recevoir le 1er du mois un bilan PDF de mes ventes, vues et conversion, afin de piloter ma boutique.*
- Exigences : e-mail + PDF joint le 1er à 06:00 ; 6 métriques (CA brut et CA net) ; page Stats dans `/mon-abonnement` avec historique.
- Contraintes : uniquement les `ACTIVE` ; idempotence ; aucune donnée d'un tiers ; échec d'envoi non bloquant.

**US-V8-08** — *En tant que vendeur dont l'abonnement expire, je veux que mon catalogue reste visible et vendable, afin de ne perdre aucune vente.*
- Exigences : `EXPIRED` → badges off, boost off, page boutique 404, **catalogue intact**, annonces conservées.
- Contraintes : aucun masquage ; message clair ; re-souscription possible (slug récupéré).

**US-V8-09** — *En tant qu'Ambassadeur « Le Cercle des 10 » et abonné Boutique, je veux voir et mon badge Ambassadeur et mon badge Boutique sur mes articles, afin de cumuler mes récompenses légitimes.*
- Exigences : deux badges côte à côte ; Vitrine derrière le payant au tri par défaut.
- Contraintes : aucune écriture dans `vitrine_until`/`ambassador_until` ; commission 10 % inchangée.

**US-V8-10** — *En tant que particulier non abonné, je veux publier gratuitement comme avant, afin de ne subir aucune nouvelle contrainte.*
- Exigences : bouton « Vendre » présent ; `PENDING` → modération ; catalogue illimité.
- Contraintes : CA-V5-069/070, CA-V7-003/004 verts, aucun contrôle d'abonnement sur le chemin de publication particulier.

---

## 6. Critères d'acceptation (75 critères, binaires)

> Chaque critère indique sa **donnée mesurable** et la **preuve à produire par `@tester`**. Un critère non prouvé est non conforme. `037c` désigne la sous-preuve (c) de CA-V7-037.

### 6.1 Schéma additif et isolation (CA-V8-001 → 006)

- **CA-V8-001** `[EXEC]` **Périmètre du schéma V8 respecté.** Avant et après `020_storefront_v8.sql`, `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' ORDER BY 1,2` montre : **0 colonne** ajoutée à `users`, `products`, `orders`, `payments`, `notifications`, `referral_qualifications`, `subscription_plans`, `storefront_listings` ; **exactement 2 colonnes nullable** ajoutées à `seller_subscriptions` (`payment_method`, `payment_reference`) ; **exactement 3 nouvelles tables** (`storefront_profiles`, `auto_approved_products`, `monthly_metrics`). Aucun `ALTER TABLE` hors `seller_subscriptions`.
- **CA-V8-002** `[AUDIT]` **Aucune migration existante modifiée.** `git diff --stat server/migrations/` : seul `020_storefront_v8.sql` ajouté ; `001`→`019` byte-identiques ; `grep -rn 'ALTER TYPE\|CREATE TRIGGER' server/migrations/020*` → **0**.
- **CA-V8-003** `[TEST]` **Non-abonné : 10 produits → 201 (verrous CA-V7-003 / CA-V5-069 intacts).** Vendeur sans abonnement : 10 × `POST /api/products` → 10 × `201`, `COUNT(*)=10` ; le 11e après `SOLD` sur le n°1 → **201** (CA-V7-003, `cahier-des-charges-v7-hebergement-vendeurs.md:192`).
- **CA-V8-004** `[TEST]` **Bouton « Vendre » jamais conditionné (verrous CA-V7-004 / CA-V5-070 intacts).** Présent pour 0 / 1 / ≥10 articles, pour abonné éligible, abonné non éligible, expiré, Ambassadeur, admin connecté ; aucune logique de désactivation (`grep -rn 'Vendre' web/src` : aucun `disabled` lié à un statut/abonnement). Contrôle positif **et** négatif.
- **CA-V8-005** `[TEST]` **Parité comportementale des routes existantes.** Suites V5 + V6 + V7 rejouées intégralement sur base de recette peuplée : **0 test amendé, 0 échec** ; réponses identiques (codes, corps) pour catalogue, fiche, commandes, checkout, paiement, payouts, notifications.
- **CA-V8-006** `[TEST]` **Commission 10 % inchangée.** Commande post-déploiement V8 : commission = `COMMISSION_RATE` = 10 % exact (arrondi `floor`), net vendeur = `amount − commission` ; aucun « 10 % » codé en dur ajouté par V8 (`grep -rn '0.10\|10 %' web/src server/src` : occurrences V8 = 0 liées au calcul) ; aucun frais d'abonnement prélevé sur la vente (CA-V5-150, `cahier-des-charges-v5.md:620`).

### 6.2 Publication directe — auto-approbation (CA-V8-010 → 019)

- **CA-V8-010** `[TEST]` **Éligible → `AVAILABLE` dès l'insert.** Vendeur `ACTIVE` + `phone = '+221770000001'` : `POST /api/products` → `201`, `products.status = 'AVAILABLE'` **persisté** ; une ligne créée dans `auto_approved_products` (produit, vendeur, `subscription_id`). Aucun produit du vendeur n'existe en `PENDING`.
- **CA-V8-011** `[TEST]` **Aucune fenêtre `PENDING` perceptible.** Pour le produit auto-approuvé : `GET /api/products/:id` → `AVAILABLE` immédiatement après le `201` ; `GET /mes-articles` montre l'article publié ; le catalogue le liste ; sa fiche répond `200` sans bandeau « en attente ».
- **CA-V8-012** `[TEST]` **Auto-approbation contradictoire (matrice 6 cas).** (a) `ACTIVE` + `+221770000001` → `AVAILABLE` ; (b) `ACTIVE` + `+221330000001` (fixe) → `PENDING` ; (c) `ACTIVE` + `+22170000001` (8 chiffres) → `PENDING` ; (d) `PENDING` (non activé) + `+221770000002` → `PENDING` ; (e) `EXPIRED` (`ends_at` passé en test) + `+221770000003` → `PENDING` ; (f) `CANCELLED` + `+221770000004` → `PENDING`. Les 6 statuts persistés sont lus directement en base — jamais via le front.
- **CA-V8-013** `[TEST]` **Le jour J+31.** Abonnement activé T0, test à T0+31 jours (`ends_at` forcé dans le passé) : la création passe **`PENDING`** — l'expiration paresseuse (V7) éteint l'auto-approbation sans job (K5 réversible).
- **CA-V8-014** `[TEST]` **Rétrogradation admin.** Admin `POST /api/admin/products/:id/retrograde { reason: 'Article non conforme …' }` sur un article auto-approuvé `AVAILABLE` → `200`, `products.status = 'REJECTED'`, vendeur notifié (`article_rejected`), ligne `admin_actions` (`product.auto_approved_retrograded`), article hors catalogue, **place boutique libérée par dérivation** (ajout suivant → `201`). Sur un article jamais auto-approuvé → `409 NOT_AUTO_APPROVED` ; sur un `PENDING` → `409 INVALID_STATUS` ; sur un `SOLD` → `409 INVALID_STATUS` ; par un `user` → `403`.
- **CA-V8-015** `[EXEC]` **Trace exhaustive.** `SELECT COUNT(*) FROM auto_approved_products` = nombre d'auto-approbations comptées en test ; chaque produit auto-approuvé y figure exactement 1 fois ; les articles `PENDING` n'y figurent pas ; la table n'est écrite que par le service de création (audit ciblé, `[AUDIT]` complémentaire : `grep -rn 'auto_approved_products' server/src` → occurrences uniquement dans le service de création, la route retrograde et le repository d'admin).
- **CA-V8-016** `[AUDIT]` **Logique d'auto-approbation isolée.** `grep -rnE 'eligib|AUTO_APPROV|autoApproved' server/src` → aucune occurrence hors (a) le module de décision de statut initial, (b) `auto_approved_products` (repo), (c) la route `retrograde` ; **0 occurrence** dans commandes, checkout, paiement, payouts, catalogue, fiche, notifications.
- **CA-V8-017** `[TEST]` **Non-éligible : flux V7 strict.** Vendeur `ACTIVE` téléphone hors format : création → `PENDING`, article en file admin `/admin/produits` (ou équivalent), **approbation manuelle** requise (`approve` → `AVAILABLE`) ; aucun badge non plus tant que non `ACTIVE`... (i.e., badge présent mais `PENDING` en modération) — comportement identique à V7 pour ce vendeur, vérifié par diff de fixtures avant/après V8.
- **CA-V8-018** `[TEST]` **V6.4 préservée.** Scénario création éligible → **aucune** notification/e-mail vendeur n'est émis avant `PAID` (compteur notifications vendeur = 0, `notification_deliveries` sans ligne vendeur liée à la création) ; seul l'admin peut consulter `GET /api/admin/auto-approvals` (nouvelle route, paginée, `requireAdmin`) ; aucun nouveau `notification_type` n'existe (`SELECT unnest(enum_range(NULL::notification_type))` ne contient **pas** de valeur V8).
- **CA-V8-019** `[TEST]` **États de vente préservés.** Article auto-approuvé → `SOLD` via parcours commande existant : la fiche affiche le bandeau « Article vendu », le catalogue ne le liste plus, la boutique (si ajouté) passe la place libérée ; **0 écart** vs articles modérés. Commission = 10 % (CA-V8-006).

### 6.3 Badges de palier (CA-V8-020 → 027)

- **CA-V8-020** `[TEST]` **Libellés exacts par palier en `ACTIVE`.** Découverte → badge « Boutique » ; Boutique → « Boutique Vérifiée » ; Atelier → « Boutique Pro » — rendus sur la fiche produit **et** les cartes catalogue du vendeur (fixture 3 vendeurs, 1 par palier).
- **CA-V8-021** `[TEST]` **Badges révoqués à l'expiration.** `ends_at` forcé dans le passé : le badge **disparaît** de la fiche et des cartes (après relecture, sans job) ; aucune carte ni fiche ne contient le libellé de badge ; re-souscription + activation → badge de retour au palier choisi.
- **CA-V8-022** `[TEST]` **Coexistence avec l'Ambassadeur.** Vendeur Ambassadeur (`ambassador_until > now()`) + Atelier `ACTIVE` : fiche et carte montrent « Ambassadeur » **et** « Boutique Pro » simultanément ; ordre/espacement stables ; aucun champ `vitrine_until` modifié (diff SQL bit à bit avant/après rendu, CA-V7-054).
- **CA-V8-023** `[AUDIT]` **Badge dérivé en lecture, jamais stocké.** `grep -rni 'badge' server/migrations/020*` → 0 colonne ; `grep -rnE 'badge' server/src --include='*repository*'` → aucune persistance ; sérialisation : badge calculé par JOIN `seller_subscriptions`/`subscription_plans` (revue `serializers.ts` ou module équivalent).
- **CA-V8-024** `[TEST]` **Réactivité de la révocation.** Activation admin à 10:00 → badge visible à 10:00:01 (lecture suivante) ; expiration en test → badge absent à la lecture suivante ; aucun cache HTTP public ne sert un badge périmé (`Cache-Control: private, no-store` ou revalidation sur les réponses portant le badge — revue de l'en-tête).
- **CA-V8-025** `[TEST]` **Non-abonné et `PENDING` sans badge.** Vendeur sans abonnement / `PENDING` / `EXPIRED` / `CANCELLED` : **0 badge** sur fiche et cartes ; la fiche d'un produit `PENDING` (modération) d'un non-abonné n'affiche aucun badge de palier.
- **CA-V8-026** `[EXEC]` **Libellés exacts dans le front.** `grep -rn 'Boutique Vérifiée\|Boutique Pro\|"Boutique"' web/src` → chaque libellé apparaît **uniquement** dans le module de badge V8 et dans les tests ; aucun libellé codé en dur pour un palier donné ailleurs ; le front lit le palier depuis l'API (aucune constante `5000`/`10000`/`2000` liée aux forfaits — CA-V7-010 inchangé).
- **CA-V8-027** `[TEST]` **Accessibilité des badges.** Chaque badge porte un `aria-label` complet (ex. « Vendeur {palier} — boutique {libellé} ») ; contraste texte/fond ≥ 4.5:1 ; axe/Playwright sur fiche + catalogue : **0 violation critique ou sérieuse** ; badge lisible sans distinction de couleur seule (libellé textuel).

### 6.4 Priorité d'affichage au tri par défaut (CA-V8-030 → 038)

- **CA-V8-030** `[TEST]` **Ordre composé exact.** Fixture 8 vendeurs (Atelier, Boutique, Découverte, Ambassadeur Vitrine non-abonné, non-abonné ×3, `PENDING`) avec articles `AVAILABLE` créés dans un ordre contrôlé : au tri par défaut, l'ordre de sortie est **Atelier → Boutique → Découverte → Vitrine → (created_at DESC, id)**, vérifié position par position (1er, 2e, …).
- **CA-V8-031** `[TEST]` **Boosts absents hors `ACTIVE`.** Atelier `EXPIRED` (`ends_at` passé) : ses articles retombent au tri `created_at DESC, id` ; la Vitrine reprend la tête devant les non-payants ; aucun `UPDATE` massif exécuté (comptage écritures = 0).
- **CA-V8-032** `[TEST]` **Tris explicites inchangés (golden master).** Même jeu de données, pré-V8 vs post-V8 : `price_asc`, `price_desc`, `oldest`, `popular`, `relevance`, sections `promotions`/`best_offers`/`discover`/`popular`/`new` → **mêmes séquences d'ids exactement** (comparaison byte à byte des tableaux de ids, 5 pages chacune).
- **CA-V8-033** `[TEST]` **Vitrine derrière le payant, devant le reste.** Ambassadeur non-abonné (Vitrine) vs Découverte `ACTIVE` : le Découverte passe **avant** ; Vitrine passe avant les non-payants ; Découverte `EXPIRED` → la Vitrine repasse devant (rang payant retombé à 0) ; prouvé par 3 fixtures distinctes.
- **CA-V8-034** `[EXEC]` **Plan SQL du tri.** `EXPLAIN (ANALYZE, BUFFERS)` de la requête catalogue `LIMIT 48` avec le nouveau `ORDER BY` (CASE palier + EXISTS vitrine) : temps < 2 ms (base peuplée 10k produits), index utilisés (`idx_products_view_count`/index partiel `AVAILABLE`/`orders` non requis), **0 seq scan** sur `products` ; la clause CASE n'introduit pas de tri disque.
- **CA-V8-035** `[TEST]` **Pagination stable.** Tri par défaut, 3 pages (perPage 10, 30 résultats) avec articles de paliers mélangés : **0 doublon** inter-pages, **0 saut**, `total` exact ; après expiration d'un Atelier entre deux pages, la relecture est cohérente (pas d'exception, pas de doublon).
- **CA-V8-036** `[AUDIT]` **Aucune écriture pour le boost.** `grep -rnE 'UPDATE products|INSERT INTO products' server/src --include='*catalog*' --include='*products.repository*'` : aucune ligne ajoutée par V8 pour le rang ; le rang est calculé en `SELECT` uniquement ; 0 trigger (`grep -rn 'CREATE TRIGGER' server/migrations/020*` → 0).
- **CA-V8-037** `[TEST]` **Parrainage préservé au tri par défaut.** `users.vitrine_until` inchangé après requêtes catalogue (diff SQL avant/après) ; CA-V7-054 rejoué vert ; en tri explicite `popular`, la Vitrine ne passe **pas** devant (comportement V6.7 conservé).
- **CA-V8-038** `[TEST]` **Verrous V7 sur le chemin du tri.** `grep -rnE 'storefront_listings|STOREFRONT_QUOTA' server/src --include='*product*' --include='*catalog*'` → **0 occurrence** (CA-V7-038 étendu au nouveau code de tri) ; le quota n'intervient jamais dans le catalogue (CA-V7-033/037c rejoués).

### 6.5 Boutique brandable (CA-V8-040 → 049)

- **CA-V8-040** `[TEST]` **Upload logo réel.** `POST /api/storefront/profile/logo` (multipart, PNG 800×800, 300 Ko) → `200`, `logoUrl` publique (Blob ou disque) ; relecture `GET /api/storefront/:slug` affiche le logo ; fichier traçé `uploads/storefront/<uuid>.png` (UUID serveur, jamais le nom client).
- **CA-V8-041** `[TEST]` **Upload bannière.** Idem bannière (JPEG 1600×400, 1,2 Mo) → `200` ; rendu responsive ≤ 100 % largeur sans débordement horizontal à 375 px ; `alt=""` (décorative) ou `aria-hidden="true"`.
- **CA-V8-042** `[TEST]` **Validation stricte des uploads.** MIME non-image (`application/pdf`) → `400` ; logo > 2 Mo → `400` (logo maintenu ≤ 2 Mo) ; bannière > 4 Mo → `400` (message clair) ; image corrompue (magic bytes ≠ en-tête) → `400` ; champ `collectionAddress` > 500 caractères → `400` ; description HTML brute conservée en base mais **rendue échappée** (test : `<script>alert(1)</script>` en description → visible inerte, `document.querySelectorAll('script')` inchangé, XSS = 0).
- **CA-V8-043** `[TEST]` **Description 0–500 caractères.** 0 caractère → OK (affiche défaut) ; 500 → OK ; 501 → `400` ; graphes combinants comptés correctement (test Unicode `👨‍👩‍👧` = 1 grapheme) ; retours art. "\n" conservés (0–500) ; rendu identique page ⇄ API.
- **CA-V8-044** `[EXEC]` **Adresse de collecte : 0 fuite publique.** Après avoir renseigné `collection_address` (« Marché Sandaga, box 42 — entrepôt … ») : `grep -i -F 'Sandaga'` sur **toutes** les réponses publiques (`GET /api/storefront/:slug`, catalogue, fiche, cartes, `/boutique/*` HTML) → **0 occurrence** ; visible uniquement dans la vue admin détail abonnement ; absente du PDF et des e-mails ; absente des logs (`grep -i Sandaga` logs → 0).
- **CA-V8-045** `[TEST]` **Branding sans article public / dès PENDING.** Vendeur `PENDING` téléverse logo+bannière+description → `200/201` ; boutique publique toujours `404` (CA-V7-012 intact) ; description et uploads **conservés** ; à l'activation admin, la boutique affiche aussitôt le branding (200).
- **CA-V8-046** `[AUDIT]` **Réutilisation du stockage Blob.** Aucune dépendance de stockage ajoutée (`package.json` : 0 nouveau SDK storage) ; `grep -rn 'put(' server/src/utils/storage.ts` couvre logo/bannière (même module) ; **0 occurrence** de `S3|cloudinary|supabase.storage` introduits ; si `BLOB_READ_WRITE_TOKEN` absent (dev/tests) → repli disque identique à `savePhoto` (comportement, pas seulement intention).
- **CA-V8-047** `[TEST]` **Cycle de vie du branding.** `DELETE /api/storefront/profile/logo` → logo retiré, retour à l'avatar/défaut ; `DELETE` bannière idem ; écrasement d'un logo existant → ancienne clé Blob tentée en suppression best-effort (n'échoue jamais la requête) ; après `CANCELLED`, branding conservé mais page publique `404` (aucune purge).
- **CA-V8-048** `[TEST]` **Accessibilité du bloc branding.** `alt` logo ≠ vide ; bannière décorative sans `alt` inutile ; description lisible contraste AA (axe) ; boutique rendue avec branding : **0 violation critique ou sérieuse** ; navigation clavier OK ; description annoncée par lecteur d'écran (`aria-label` ou texte normal, pas de `aria-hidden` sur un texte visible).
- **CA-V8-049** `[AUDIT]` **Aucune fuite de l'adresse dans le serveur.** `grep -rniE 'collection_address|collectionAddress' server/src web/src` → occurrences **uniquement** : (a) module profil boutique (service/repo V8), (b) vue admin détail abonnement, (c) tests/fixtures ; **0 occurrence** dans serializers publics, PDF, mail templates, front public ; `logger` : aucun champ `collection_address` journalisé (revue).

### 6.6 Souscription avec référence de paiement (CA-V8-050 → 057)

- **CA-V8-050** `[TEST]` **Référence obligatoire à la souscription.** `POST /api/subscriptions` sans `paymentReference` → `400 PAYMENT_REFERENCE_REQUIRED` ; sans `paymentMethod` → `400 INVALID_PAYMENT_METHOD` ; aucun abonnement créé ; avec les deux valides → `201` + `PENDING` tracé (CA-V7-012 intact).
- **CA-V8-051** `[TEST]` **Validation stricte de la référence.** `paymentMethod` ∈ `wave | orange_money | virement` (sinon `400`) ; `paymentReference` 4–64 caractères, regex `^[A-Za-z0-9][A-Za-z0-9 .\-_/]{2,62}$` (accepte `WAVE-20261118-8392`, `OM 11 22 33`, `VIR/2026/118`) ; rejette CR/LF/`<`/`>` (anti-injection) → `400 INVALID_PAYMENT_REFERENCE` ; trim automatique (espaces de bord supprimés).
- **CA-V8-052** `[EXEC]` **Visibilité back-office uniquement.** File admin `GET /api/admin/subscriptions?status=PENDING` : chaque ligne affiche `paymentMethod` + `paymentReference` ; réponse **publique** `GET /api/storefront/:slug` : 0 occurrence de la référence ; `GET /api/subscriptions/me` (propriétaire) : sa propre référence visible ; autre vendeur : 404/403 (non-divulgation).
- **CA-V8-053** `[TEST]` **Legacy `PENDING` sans référence activable.** Abonnement `PENDING` pré-V8 (référence `NULL`) : la file l'affiche « référence absente » ; admin `activate` → `200` (activation **non bloquée**, K13 préservé) ; aucune réécriture rétroactive de lignes `PENDING` par la migration (vérification `COUNT(*)` pré/post migration identique).
- **CA-V8-054** `[TEST]` **La référence ne déclenche rien.** Aucun endpoint, webhook ou job n'active un abonnement sur la base de la référence (tentatives : payload `status:'ACTIVE'`, header spoofé, rejeu de référence d'un autre vendeur → tous rejetés, `PENDING` inchangé, `COUNT(ACTIVE)` inchangé) ; CA-V7-014 rejoué vert.
- **CA-V8-055** `[AUDIT]` **La référence n'est jamais journalisée en clair.** `grep -rniE 'payment_reference|paymentReference' server/src` : occurrences limitées au service souscription, au repository admin, aux serializers admin/proprio ; champ **absent** de tout `logger.*` (revue) ; en cas de log d'erreur, la référence n'apparaît pas (test d'erreur simulée : fixture avec référence → log ne la contient pas).
- **CA-V8-056** `[EXEC]` **Migration 020 non destructive.** Sur base clonée pré-migration peuplée (seed V7) : migration rejouée **2 fois** sans erreur ; `seller_subscriptions` conserve **exactement** les mêmes lignes ; `payment_method`/`payment_reference` = `NULL` sur les lignes existantes ; aucun index cassé (`REINDEX` non requis) ; backup + restauration documentés dans `journal.md` (livrable).
- **CA-V8-057** `[TEST]` **Aucune confusion avec la preuve de commande.** L'abonnement (référence Wave/OM/virement) et la preuve de paiement de commande (`payment_proofs`, V6.3) restent **strictement disjoints** : aucun code partagé, aucun champ commun ; `POST /api/admin/orders/:id/confirm-payment` inchangé (V6.3/V6.4) ; une référence V8 ne peut pas servir à confirmer une commande (test : référence abonnement envoyée comme preuve → rejetée).

### 6.7 Bilan mensuel du 1er (CA-V8-060 → 072)

- **CA-V8-060** `[TEST]` **Envoi au 1er, uniquement aux `ACTIVE`, avec PDF joint.** Fixture : 3 abonnés (`ACTIVE` Atelier, `ACTIVE` Découverte avec `ends_at = T+2j`, `EXPIRED`) ; exécution du job (Vercel Cron quotidien `0 6 * * *`, dispatch bilan le 1er, ou appel manuel `runMonthlyReport(T)` en test) : **2 e-mails** émis (les 2 `ACTIVE`), **0** pour l'`EXPIRED` ; chaque e-mail contient **1 pièce jointe** `bilan-{slug}-{YYYY-MM}.pdf` (`Content-Type: application/pdf`, taille 20 Ko–2 Mo) ; aucun e-mail pour les non-abonnés.
- **CA-V8-061** `[TEST]` **6 métriques exactes (7 valeurs affichées) sur fixture gelée.** Ventes=4 (PAID dans M), CA brut = 120 000, commission = 12 000 (10 %, affichée dérivée), CA net = 108 000, panier moyen = 30 000, meilleur article = id fixé, vues delta = 1 234, taux de conversion = 4/1234 = 0,32 % : le **PDF**, l'**e-mail** et la **page Stats** affichent **exactement** ces valeurs (comparaison des 7 valeurs et libellés) ; aucune autre métrique de vente n'est révélée.
- **CA-V8-062** `[TEST]` **Division par zéro impossible.** Fixture vendeur `ACTIVE` sans aucune vue dans M (delta 0) : taux de conversion = `NULL` → affiché « — » partout (PDF/e-mail/page) ; panier moyen à 0 vente → « — » ; aucun `NaN`/`Infinity`/exception ; `NUMERIC(6,4)` stocke `NULL`.
- **CA-V8-063** `[EXEC]` **Idempotence stricte du bilan.** Job exécuté 2 fois le même mois : **1 seule** ligne dans `monthly_metrics` par (subscription_id, period) (`PK (subscription_id, period)` + `ON CONFLICT DO NOTHING`) ; **0 second e-mail** (compteur `notification_deliveries` ou mock Mailer = 1) ; `sent_at` inchangé.
- **CA-V8-064** `[TEST]` **Sélection `ACTIVE` à l'instant T.** `ends_at = T − 1 s` → exclu du bilan (aucun e-mail, aucune ligne) ; `ends_at = T + 1 s` → inclus ; `PENDING`/`CANCELLED` exclus ; borne `ends_at > T` testée explicitement (CA-V8-084 associé).
- **CA-V8-065** `[TEST]` **PDF généré serveur, sans service externe.** Rendu PDF en test **hors-ligne** (réseau coupé — aucun appel HTTP sortant ; `pdfkit` ou équivalent local) ; contenu = 7 lignes de métriques (6 métriques, CA brut et net) + en-têtes ReVends ; aucune donnée d'acheteur (nom/e-mail/téléphone) ; aucune coordonnée vendeur (phone/email) ; taille ≤ 2 Mo ; `%PDF-` magic bytes valides (revue bytes).
- **CA-V8-066** `[TEST]` **Page Stats dans `/mon-abonnement`.** Vendeur connecté → onglet « Statistiques » : dernier bilan (6 métriques, CA brut et net + période), historique des 12 derniers mois (ou moins), état d'envoi (SENT/FAILED) ; un autre vendeur authentifié sur la même URL → données absentes (403/redirect, aucune donnée fuite) ; anonyme → redirect login ; **0 erreur JS** (CA-V8-076 associé).
- **CA-V8-067** `[TEST]` **Cohérence page ⇄ e-mail ⇄ PDF.** Pour un mois fixé (fixture), les 7 valeurs affichées sont **strictement égales** entre la page Stats, l'e-mail et le PDF ; toute divergence → critère non conforme (un seul calcul partagé, `storefront_reports.ts`, aucun recalcul divergent).
- **CA-V8-068** `[EXEC]` **Performance des requêtes stats.** Sur base de recette peuplée (10 000 produits, 5 000 commandes, 100 vendeurs) : requête d'agrégation mensuelle par vendeur < **200 ms** (`EXPLAIN ANALYZE`) ; job complet (100 vendeurs) < 30 s ; aucune requête sans index sur `order_events`/`orders(seller_id)` (index existants suffisants, vérifié).
- **CA-V8-069** `[TEST]` **Échec d'envoi non bloquant et tracé.** SMTP simulé en échec : `email_status = 'FAILED'` persiste ; job **ne plante pas** (autres vendeurs traités) ; erreur journalisée **sans** référence de paiement ni coordonnées ; le bilan reste consultable en page Stats (statut FAILED affiché) ; renvoi manuel **hors périmètre V8** (PO-V8-08).
- **CA-V8-070** `[TEST]` **Sémantique des vues du mois.** Premier bilan : cumul `SUM(view_count)` capturé au 1er relevé, libellé « vues cumulées (1er relevé) » (PDF + page) ; bilan suivant : delta `views_sum − views_baseline` (fixture : `views_baseline` = 1000 → `views_sum` = 1234 ⇒ vues = 234) ; relevés capturés au 1er et au dernier jour (`monthly_metrics` : 1 ligne `(subscription_id, period)` par abonnement actif par mois).
- **CA-V8-071** `[AUDIT]` **Évolution Mailer strictement additive.** `grep -rn 'storefront_monthly_report' server/src` → `MailEvent` ajouté dans `templates.ts` + `mailer.ts` (paramètre `attachments?` optionnel, signature rétrocompatible) ; `grep -rn 'notification_type' server/migrations/020*` → **0** ; `enum_range(NULL::notification_type)` inchangé ; aucun template V5 modifié (`git diff server/src/mail/` : uniquement ajouts).
- **CA-V8-072** `[TEST]` **Aucune PII dans le bilan.** Regex `phone|whatsapp|@|mailto:` sur corps e-mail + texte extrait du PDF : le **domaine** ReVends est toléré (adresse d'expéditeur), **aucune** adresse/numéro **destinataire ou tiers** n'apparaît dans le corps ; aucun `tel:`/`mailto:` ; l'e-mail part vers `users.email` du **seul** vendeur abonné (jamais un autre).

### 6.8 Transverse et zéro-régression (CA-V8-075 → 085)

- **CA-V8-075** `[TEST]` **0 fuite PII — surface V8 complète.** Fixture « boutique atelier brandée » : regex `phone|whatsapp|email|mailto:|tel:|Sandaga` sur (a) HTML `/boutique/:slug`, (b) JSON `GET /api/storefront/:slug`, (c) cartes catalogue, (d) fiche produit, (e) `/mon-abonnement` d'un **autre** vendeur, (f) PDF du bilan, (g) réponses admin **hors** vue détail : **0 occurrence** ; vue admin détail : référence + adresse visibles (légitime), téléphone **non** (D2 — même l'admin n'a pas le téléphone vendeur en clair dans V8).
- **CA-V8-076** `[TEST]` **0 erreur JS + responsive.** Pages `/mon-abonnement` (onglet Stats), `/boutique/:slug` (brandée) à 375 px : `scrollWidth ≤ 375`, `pageerror`/`console.error` = **0**, contrôles atteignables au tactile ; branding sans débordement (bannière `max-width:100%`).
- **CA-V8-077** `[TEST]` **Accessibilité des nouvelles surfaces.** Onglet Stats + boutique brandée + badges : axe/Playwright → **0 violation critique ou sérieuse** ; focus visible ; `aria-current` sur l'onglet actif ; messages d'état (`aria-live`) pour upload réussi/échoué.
- **CA-V8-078** `[EXEC]` **Gates techniques.** `cd server && npx tsc --noEmit` → 0 erreur ; `cd web && npx tsc -b` → 0 erreur ; build web OK ; suites V5+V6+V7+V8 → **0 échec** ; `npm audit` : aucune vulnérabilité critique nouvelle introduite par la dépendance PDF (si `pdfkit`) — rapport joint à la recette.
- **CA-V8-079** `[TEST]` **Auto-approbation contradictoire — scénario combiné de bout en bout.** Base de recette : 4 couples (vendeur × palier) — (Atelier/éligible), (Atelier/téléphone fixe), (Découverte/éligible mais `EXPIRED`), (particulier non abonné/éligible mais sans abo) ; chacun publie 1 article : seul le 1er persiste `AVAILABLE` ; les 3 autres `PENDING` ; les 3 refusés restent **vendables** après modération (CA-V7-033) ; la rétrogradation admin du 1er → `REJECTED`, hors catalogue, quota dérivé décrémenté ; **0 violation CA-V5-069/070, CA-V7-003/004/033 dans chaque étape**.
- **CA-V8-080** `[TEST]` **Verdict « 0 violation CA-V7 ∧ CA-V5 ∧ CA-V6 » sur chaque scénario recette.** Les 14 scénarios du §9 sont exécutés sur base pré-peuplée **et** base vide : chaque scénario exige explicitement **0 test V5/V6/V7 amendé, 0 échec** ; un seul échec → V8 **non conforme** (désactivation par feature flag, sans toucher aux cahiers antérieurs).
- **CA-V8-081** `[TEST]` **Quota boutique-only, jamais catalogue.** Article auto-approuvé non ajouté à la boutique : `COUNT(storefront_listings actifs) = 0`, aucune erreur de quota ; ajouté manuellement à 10/10 (Découverte) : 11e ajout → `409 STOREFRONT_QUOTA_EXCEEDED` (message V7 inchangé) ; l'article reste `AVAILABLE` et **vendable** ; CA-V7-031/033/036 rejoués ; **0** écriture de quota dans `POST /api/products` (CA-V7-038).
- **CA-V8-082** `[TEST]` + `[EXEC]` **CA-V7-037c rejoué.** `grep -rnE 'storefront_listings|subscription_id|STOREFRONT|withdrawn_at' server/src --include='*order*' --include='*payment*' --include='*checkout*'` → **0 occurrence** ; `git diff` du pipeline commande/paiement/payout = **0 ligne** ; aucune notification vendeur avant `PAID` (V6.4) : compteur vendeur lié aux créations = 0.
- **CA-V8-083** `[EXEC]` **Aucune fuite V8 dans le pipeline.** `grep -rnE 'storefront|subscription|payment_reference|auto_approv' server/src --include='*order*' --include='*payment*' --include='*checkout*' --include='*payout*'` → **0 occurrence** ; les fichiers `orders.service.ts`, `payment-proofs.service.ts`, `cart.service.ts` etc. : diff limité à 0 ligne (preuve `git diff --stat` cité dans la grille de recette).
- **CA-V8-084** `[TEST]` **Borne temporelle du bilan.** Abonnement `ends_at = 01/12 00:00:00`, job lancé le 01/12 06:00 → exclu ; `ends_at = 01/12 07:00` → inclus (T = début de la run) ; test explicite des deux côtés de la borne ; aucune ligne de bilan pour l'abonnement expiré à 06:00.
- **CA-V8-085** `[AUDIT]` **Contrat documenté v2.8.** `docs/api.md` passe à **v2.8** (livrable `@backend`, hors ce cahier) : nouvelles routes `POST /api/storefront/profile/logo`, `POST /api/storefront/profile/banner`, `DELETE /api/storefront/profile/logo|banner`, `PUT /api/storefront/profile` (description + collectionAddress), `GET /api/admin/auto-approvals`, `POST /api/admin/products/:id/retrograde`, `GET /api/storefront/profile/stats` (ou `/mon-abonnement` côté front — route API de lecture stats), `POST /api/cron/monthly-report` (si retenue, PO-V8-06) + corps/réponses/codes (`PAYMENT_REFERENCE_REQUIRED`, `INVALID_PAYMENT_METHOD`, `INVALID_PAYMENT_REFERENCE`, `NOT_AUTO_APPROVED`, `INVALID_STATUS`) ; les 8 routes V7 inchangées sont listées « inchangées » ; **ce cahier ne modifie pas `docs/api.md`**.

### 6.9 Récapitulatif des critères

| Groupe | Plage | Nombre |
|---|---|---|
| 6.1 Schéma additif et isolation | CA-V8-001 → 006 | 6 |
| 6.2 Publication directe (auto-approbation) | CA-V8-010 → 019 | 10 |
| 6.3 Badges de palier | CA-V8-020 → 027 | 8 |
| 6.4 Priorité d'affichage au tri par défaut | CA-V8-030 → 038 | 9 |
| 6.5 Boutique brandable | CA-V8-040 → 049 | 10 |
| 6.6 Souscription avec référence de paiement | CA-V8-050 → 057 | 8 |
| 6.7 Bilan mensuel du 1er | CA-V8-060 → 072 | 13 |
| 6.8 Transverse et zéro-régression | CA-V8-075 → 085 | 11 |
| **TOTAL** | | **75** |

---

## 7. Matrice de risques (actionnable)

> Format : **ID — risque** · niveau · action (propriétaire) · plan B. Un risque sans action n'existe pas.

| ID | Risque | Niveau | Action (propriétaire) | Plan B / attendu |
|---|---|---|---|---|
| **R-V8-01** | Article indésirable publié en direct (auto-approbation trop large) → exposition catalogue | 🔴 Critique | Éligibilité stricte (ACTIVE + `+2217…`) évaluée à la création ; rétrogradation F8 ; **K4 < 5 %** surveillé ; bilan J+30 post-déploiement ; @backend + @cahier-des-charges | Feature flag `AUTO_APPROVE_V8=false` → retour modération `PENDING` immédiat, sans migration |
| **R-V8-02** | Vendeur ne comprend pas pourquoi son article est publié sans validation / ou inversement | ⚠️ Important | Message clair dans `/mon-abonnement` (« Publication directe active pour votre boutique vérifiée ») ; badge « Boutique Vérifiée » justement là pour ça ; FAQ admin ; @frontend | Bandeau informatif ; traitement via le support ReVends |
| **R-V8-03** | Boost payant au tri par défaut perçu comme injuste (Vitrine ambassadeurs « dégradée ») | ⚠️ Important | Communication explicite (payant d'abord, Vitrine ensuite, tris explicites inchangés) ; surveillance K6/K7 ; rappel « Le Cercle des 10 » inchangé sauf ordre par défaut ; @chef-de-projet + @frontend | Si contestation : Vitrine avant Découverte ? → arbitrage chef de projet uniquement |
| **R-V8-04** | Fuite de l'adresse de collecte (donnée interne) vers le public | 🔴 Critique | CA-V8-044/049 en pré-recette ; `grep` outillage CI ; adresse jamais dans serializers publics ; vue admin dédiée uniquement ; @securite + @tester | Retirer F4 adresse (garder branding) ; incident review si fuite constatée |
| **R-V8-05** | Référence de paiement (Wave/OM) journalisée ou exposée dans les réponses | ⚠️ Important | CA-V8-055 ; masquage logs ; revue `serializers.ts` V8 ; @securite | Rotation des références affectées ; purge logs |
| **R-V8-06** | Double envoi du bilan / PDF en double (relance cron, retry) | ⚠️ Important | `UNIQUE(seller_id, month)` + `ON CONFLICT DO NOTHING` ; CA-V8-063 ; `sent_at` terminal ; @backend | Renvoi manuel = V9, hors V8 (PO-V8-08 clos le 18/11/2026) |
| **R-V8-07** | Déclencheur Vercel Cron en prod non fiable (timeout, cold start) | ⚠️ Important | **PO-V8-06 clos le 18/11/2026** : déclencheur externe Vercel Cron (`POST /api/cron/monthly-report`, `CRON_SECRET`, `vercel.json` `crons`) — **06:00 UTC quotidien, dispatch 1er/dernier jour** ; CA-V8-060 testable dans les deux modes (in-process en dev/tests) ; vérification « email_status=SENT pour ≥95 % » (K9) le 1er | Fallback : endpoint admin de réémission (V9) + runbook `journal.md` |
| **R-V8-08** | XSS via description boutique ou alt/logo malveillant | ⚠️ Important | Rendu React échappé (jamais `dangerouslySetInnerHTML`) ; CA-V8-042 ; axe ; @frontend + @tester | CSP existante (helmet) bloque inline scripts |
| **R-V8-09** | Admin rétrograde massivement → la confiance des vendeurs abonnés s'effondre | ⚠️ Important | K4 monitoré ; traçabilité `admin_actions` ; motif montré au vendeur ; revue hebdo premier mois ; @cahier-des-charges + @chef-de-projet | Durcir l'éligibilité (ex. min. d'ancienneté de l'abonnement) — décision chef de projet |
| **R-V8-10** | ALTER sur `seller_subscriptions` perçu comme rupture d'« additive » (CA-V7-001) | ⚠️ Important | CA-V8-001/002 redéfinissent le périmètre **V7/V8** explicitement ; communication chef de projet ; 2 colonnes nullable, aucune ligne réécrite ; PO-V8-05 | Plan B : table `subscription_payment_refs` 1:1 séparée (migration 021) si l'arbitrage refuse le ALTER |
| **R-V8-11** | Pagination instable au nouveau tri (articles changent de page entre 2 requêtes) | ℹ️ Mineur | Tie-break `id` conservé ; CA-V8-035 ; @frontend/@backend | Pagination keyset (`id > :last`) si constat en recette |
| **R-V8-12** | CA-V5-150 de fait amendé (le « 5 étapes → PENDING » ne tient plus pour les éligibles) | ⚠️ Important | **Consigné au §8** comme seule dérogation (décision utilisateur V8-D2) ; double verrou test : éligible→`AVAILABLE`, non-éligible→`PENDING` (CA-V8-012/017/079) ; CA-V5-150 sinon intact (5 étapes, commission, récap) | Renier V8-D2 : revert total de F1 ; document amendé |

**Risques surveillés à ce jour** : R-V8-07 (fiabilité du déclencheur Vercel Cron — **PO-V8-06 clos le 18/11/2026**, cible K9 ≥ 95 %) et R-V8-03 (communication Vitrine) dépendent encore d'une communication chef de projet ; R-V8-04/R-V8-01 sont **atténués par des critères de recette** et une feature flag. Aucun risque n'est « accepté » sans action.

---

## 8. Conformité avec l'existant — démonstration de non-régression

> **Verrous centraux : CA-V7-003, CA-V7-004, CA-V7-033, CA-V7-037c, CA-V7-038, CA-V5-069, CA-V5-070 restent verts SANS amendement.** La **seule** dérogation consignée est CA-V5-150, sous-clause « le produit publié porte `PENDING` », **uniquement pour les vendeurs éligibles V8** (décision utilisateur V8-D2, non négociable). Tout le reste de CA-V5-150 (5 étapes, commission 10 % exacte, récapitulatif étape 5, ≥ 1 photo, focus visible) est **inchangé**.

| Élément existant | Référence exacte | Ce que V8 change | Résultat / preuve |
|---|---|---|---|
| **CA-V7-003** — non-abonné 10 × 201 | `cahier-des-charges-v7-hebergement-vendeurs.md:192` | **Rien.** L'auto-approbation exige un abonnement `ACTIVE` — un non-abonné n'est jamais éligible | Vert sans amendement. Preuve : CA-V8-003 |
| **CA-V7-004** — bouton « Vendre » jamais conditionné | `cahier-des-charges-v7-hebergement-vendeurs.md:193` | **Rien.** Aucun statut/role/compteur ne conditionne le bouton, y compris pour les éligibles | Vert sans amendement. Preuve : CA-V8-004 |
| **CA-V7-033** — l'article refusé par la boutique reste vendable dans le catalogue | `:223` | **Rien.** L'auto-approbation n'ajoute à aucune boutique ; le quota reste contrôlé uniquement à l'ajout boutique (V7) | Vert sans amendement. Preuve : CA-V8-081 + CA-V8-016 |
| **CA-V7-037c** — `grep storefront_listings` hors pipeline = 0 ; pipeline intact | `:227` (preuve c) | **Rien.** V8 n'écrit nulle part dans le pipeline ; le nouveau code (tri, stats, badges) est exclu par construction | Vert (sous-preuve c rejouée). Preuve : CA-V8-082 |
| **CA-V7-038** — aucune logique de quota/écriture hors nouvelle route | `:228` | **Rien pour le catalogue.** V8 **étend** le même `grep` au code V8 (tri, stats) : 0 occurrence | Vert étendu. Preuve : CA-V8-016/082/083 |
| **CA-V5-069** — 10 créations → 201, pas de quota | `cahier-des-charges-v5.md:399` | **Rien.** Le quota porte toujours sur la boutique uniquement ; catalogue illimité | Vert sans amendement. Preuve : CA-V8-003/081 |
| **CA-V5-070** — bouton Toujours disponible | `cahier-des-charges-v5.md:400` | **Rien** (ARB-V5-05, `:114-115`) | Vert sans amendement. Preuve : CA-V8-004 |
| **CA-V5-150** — 5 étapes, commission 10 %, **« produit publié porte `PENDING` »** | `cahier-des-charges-v5.md:620`, récap `:719` | **UNE sous-clause amendée, décision utilisateur V8-D2 :** pour un vendeur **éligible** (ACTIVE + `+2217…`), le produit publié en étape 5 porte `AVAILABLE` au lieu de `PENDING`. **Strictement rien d'autre** : création en 5 étapes inchangée, ≥ 1 photo requise, récapitulatif exact, commission `COMMISSION_RATE` = 10 % depuis la source de vérité, net vendeur = prix − commission | **Consigné comme seule dérogation V8.** Vert pour les non-éligibles (statut `PENDING` maintenu, CA-V8-012/017). Double verrou : éligible → `AVAILABLE` **uniquement** dans la création (CA-V8-079) |
| **V6.4** — aucune sollicitation vendeur avant le paiement | `docs/api.md:130` | **Rien.** L'auto-approbation n'est pas un événement de paiement et ne déclenche **aucun** message vendeur ; notification vendeur uniquement après validation du paiement (`payment_confirmed_seller`) ; la rétrogradation (F8) notifie `article_rejected` **après** publication — acte admin, pas avant-vente | Vert sans amendement. Preuve : CA-V8-018/082 |
| **CA-V7-026 / CA-V7-045** — 0 coordonnée privée, formulaire boutique strict | `cahier-des-charges-v7-hebergement-vendeurs.md:215`, `:233` | **Rien.** V8 n'ajoute aucun canal de contact ; le bilan ne contient aucune coordonnée (CA-V8-072) ; l'adresse de collecte est la **seule** nouvelle donnée sensible, confinée admin (CA-V8-044/049) | Vert sans amendement. Preuve : CA-V8-075 |
| **CA-V7-054** — parrainage/Vitrine bit à bit préservés | `:244` | **Rien.** Le boost payant ne touche pas `vitrine_until` ; Vitrine passe seulement **après** les paliers au tri par défaut ; tris explicites inchangés | Vert sans amendement. Preuve : CA-V8-022/032/033/037 |
| **CA-V5-101** — aucun canal de contact sur la fiche | `cahier-des-charges-v5.md:498` | **Rien.** Badges = signal visuel, pas un canal ; branding = images/description statiques | Vert sans amendement. Preuve : CA-V8-075 |
| **CA-V5-150 (commission)** — 10 % exact depuis la source de vérité | `:620`, `:719` | **Rien.** Le CA du bilan utilise `orders.amount`/`seller_amount` **persistés** (jamais recalculés) ; panier moyen et commission dérivés, pas réimplémentés | Vert sans amendement. Preuve : CA-V8-006/061 |
| **Parrainage « Le Cercle des 10 »** — 10 filleuls → Ambassadeur + Vitrine, commission inchangée | `docs/api.md:142`, `:2080-2122` ; `docs/journal.md:4269` | **Rien.** Aucune écriture dans `referred_by`/`ambassador_until`/`vitrine_until`/`referral_qualifications` ; aucun e-mail de palier ajouté ; commission inchangée | Vert sans amendement. Preuve : CA-V8-022/037/005 |
| **Schéma existant** — migrations 001→019 | `docs/architecture.md` ; 019 appliquée en prod | **Aucune table pré-V8 altérée** ; `seller_subscriptions` : 2 colonnes nullable ajoutées (périmètre V7/V8, décision consignée R-V8-10) | Vert. Les 45 critères V7 restent verts. Preuve : CA-V8-001/002 |
| **Expiration V7** — 404, listings conservés, message clair | CA-V7-016 inchangé | **Rien** ; V8 ajoute seulement badges/boosts hors-service (dérivés) | Vert sans amendement. Preuve : CA-V8-021/031/064 |
| **Test V7 `server/test/storefront-edge.test.ts:99` — dérogatoire explicite (CA-V7-014)** | `server/test/storefront-edge.test.ts` | **ARBITRAGE DÉROGATOIRE ACCEPTÉ PAR LE CHEF DE PROJET LE 18/11/2026.** Le test V7 (liste des colonnes bancaires interdites de `seller_subscriptions`, CA-V7-014 : `card`, `credit_card`, `cvv`, `iban`, `pan`, `stripe`) a **perdu `payment_method` de la liste interdite** — conséquence **obligatoire** de V8-D8 (`ALTER seller_subscriptions ADD COLUMN payment_method varchar(32)`) et de CA-V8-050 (référence/méthode **obligatoires** à la souscription). `payment_method` et `payment_reference` sont explicitement **autorisées** par cette dérogation — **aucune donnée de carte, aucune donnée financière, aucun nrf/secret n'est stocké** : `payment_reference` est une référence de transaction Wave/Orange Money/virement saisie par le vendeur, distincte de toute donnée bancaire. **No-go sur tout financier/nrf/clé secrète.** | **CANARY de recette** : ce verrou est re-vérifié comme **CANARY** à chaque recette (la recette échoue si une colonne bancaire apparaît dans `seller_subscriptions` hors dérogation — vérification `information_schema.columns` + `grep -i -E 'card|credit_card|cvv|iban|pan|stripe|swift|routing|nif|api_key|secret'` sur `server/migrations/020*` : seules les 2 colonnes de dérogation peuvent y figurer). Preuve croisée : CA-V8-001/002/050. |

**Conclusion de conformité** : V8 est une **extension additive** avec **deux dérogations explicitement consignées** : (1) CA-V5-150, sous-clause statut-initial, pour les éligibles uniquement — décision utilisateur V8-D2, non négociable ; (2) test V7 `server/test/storefront-edge.test.ts` (CA-V7-014) — `payment_method` retirée de la liste bancaire interdite, arbitrage du chef de projet le 18/11/2026, **CANARY de recette** (aucune colonne bancaire/financière/nrf/secret autorisée hors dérogation). Aucun verrou n'est contourné : la non-régression est démontrée par **17 références croisées** et couverte par les CA-V8-003/004/005/006/016/018/032/033/037/038/079/080/081/082/083/075. Si l'un de ces critères échoue, V8 est **non conforme** et doit être désactivé par feature flag (`AUTO_APPROVE_V8` / boost), sans modifier les cahiers antérieurs.

---

## 9. Grille de recette prévisionnelle (à exécuter par `@tester` après livraison)

> Statut à ce jour : **NON EXÉCUTÉE** — aucun code V8 n'est implémenté, conformément à la consigne. Les cases sont à cocher sur preuve, pas sur intention.

| # | Scénario de bout en bout | Critères | Preuve attendue | Résultat |
|---|---|---|---|---|
| 1 | Particulier non abonné : publier 11 articles, le 11e après `SOLD` | CA-V8-003, 004 | 11 × `201`, compteur = 11, bouton Vendre présent | ☐ |
| 2 | Vendeur éligible (Atelier, `+221770000001`, `ACTIVE`) publie : visibilité immédiate catalogue + badge « Boutique Pro » sur fiche et cartes | CA-V8-010, 011, 020, 026 | `AVAILABLE` persisté, 0 `PENDING`, badge rendu 2 surfaces | ☐ |
| 3 | Matrice éligibilité 6 cas (éligible, fixe, 8 chiffres, PENDING, EXPIRED, CANCELLED) | CA-V8-012, 013, 017 | 1 × `AVAILABLE`, 5 × `PENDING`, lus en base | ☐ |
| 4 | Rétrogradation admin d'un auto-approuvé → `REJECTED`, hors catalogue, place libérée ; puis contre-cas `PENDING`/`SOLD`/`NOT_AUTO_APPROVED`/user | CA-V8-014, 015, 016 | `200`/`409`/`403` selon cas, `admin_actions` tracé | ☐ |
| 5 | Expiration : abonnement `ends_at` passé → badges off, boost off, boutique 404, catalogue intact | CA-V8-021, 031, 064 | 0 badge, ordre tri = V6.7+V7, produit toujours listé/vendable | ☐ |
| 6 | Tri par défaut : fixture 8 vendeurs ; puis golden master des 5 tris explicites | CA-V8-030, 032, 033, 035 | ordre exact ; 5 tris identiques vs pré-V8 ; 3 pages sans doublon | ☐ |
| 7 | Vitrine : derrière Découverte ACTIVE, devant non-payants ; en `popular` : aucun reclassement | CA-V8-033, 037 | positions vérifiées ; `vitrine_until` inchangé | ☐ |
| 8 | Branding : upload logo/bannière (200), description XSS inerte, adresse collecte 0 fuite sur 7 surfaces | CA-V8-040..049 | fichiers tracés, regex PII = 0, vue admin seule voit l'adresse | ☐ |
| 9 | Souscription : sans référence → `400` ; avec `wave` + `WAVE-20261118-8392` → `201` ; file admin montre référence ; `activate` OK ; référence ne déclenche rien | CA-V8-050..057 | codes exacts ; `COUNT(ACTIVE)` stable | ☐ |
| 10 | Legacy PENDING (sans référence) activée → `200`, badge « référence absente » | CA-V8-053 | message file, activation OK | ☐ |
| 11 | Bilan du 1er : fixture 3 abonnés → 2 e-mails + PDF joints ; métriques exactes ; idempotence (2e run = 0 envoi) ; vues delta + 1er relevé | CA-V8-060..072 | 2 `SENT`, PDF ≤ 2 Mo, valeurs = fixture | ☐ |
| 12 | Bilan : expiration à la borne (`ends_at = T−1s` exclu, `T+1s` inclus) ; échec SMTP → `FAILED` persistant, job ne plante pas | CA-V8-064, 069, 084 | 0/1 envoi selon borne ; `email_status` tracé | ☐ |
| 13 | Gates + 0 violation V5/V6/V7 : suites rejouées, `git diff` pipeline = 0, axe 0 violation, responsive 375 px, 0 erreur JS | CA-V8-005, 076, 077, 078, 080, 082, 083 | 0 échec ; outputs cités ; captures | ☐ |
| 14 | Scénario contradictoire combiné : 4 couples (palier × éligibilité), 8 articles — seul l'éligible `ACTIVE` publié direct ; tous refusés vendables ; rétrogradation du 1er | CA-V8-079, 081 | matrice 4×2 complète, 0 violation verrous | ☐ |

---

## 10. Points ouverts — tous clos le 18/11/2026 et décisions finales

### 10.1 Points ouverts — **clos le 18/11/2026** (décisions définitives du chef de projet)

| ID | Point | Statut | Décision actée (18/11/2026) |
|---|---|---|---|
| **PO-V8-01** | Sens exact de « compte `+221 7XXXXXXXX` **vérifié** » : (a) format strict dérivé en lecture (proposition V8, §4.1) **ou** (b) attestation admin de l'activation **ou** (c) OTP SMS ? Aucun OTP n'existe aujourd'hui. | ✅ Clos 18/11/2026 | **(a) format `+221 7XXXXXXXX` + activation admin (Wave/Orange Money/virement) = double verrou suffisant — RETENU** (option (c) OTP SMS écartée, hors scope V8 ; option (b) couverte par l'activation admin, V8-D8) |
| **PO-V8-02** | « Meilleur **catalogue** » (V8-D7) : interprété « **meilleur article du catalogue du vendeur** » (plus de ventes PAID du mois, tie-break vues) — confirmer | ✅ Clos 18/11/2026 | **Interprétation « meilleur article du catalogue du vendeur sur le mois » (ventes PAID, tie-break vues) — RETENUE** (§2.3-5, §4.5) |
| **PO-V8-03** | Mois de rattachement d'une vente au bilan : **événement `order_events.to_status='PAID'`** (retenu, fiable et horodaté) vs `orders.created_at` | ✅ Clos 18/11/2026 | **Mois de rattachement = `order_events.to_status = 'PAID'` — RETENU** (§2.3-6, §4.5 ; aucune réécriture nécessaire) |
| **PO-V8-04** | Sémantique des **vues du mois** : delta de snapshots (retenu) vs comptage journalier dédié (`product_view_daily`) qui modifierait le chemin d'incrément existant | ✅ Clos 18/11/2026 | **Vues du mois = delta de snapshots (compteurs `view_count` capturés au 1er et au dernier jour) — RETENU** (§2.3-7, §4.5 ; premier bilan = cumul libellé « vues cumulées (1er relevé) ») |
| **PO-V8-05** | `ALTER TABLE seller_subscriptions` (2 colonnes, retenu, lettre de V8-D8) vs table `subscription_payment_refs` 1:1 séparée (plus « additive » au sens strict CA-V7-001) | ✅ Clos 18/11/2026 | **`ALTER TABLE seller_subscriptions ADD COLUMN payment_reference varchar(64)` + `payment_method varchar(32)` (périmètre V7/V8 uniquement, conforme CA-V7-001) — RETENU, plan B documenté conservé** (table `subscription_payment_refs` 1:1, migration 021 ; R-V8-10) |
| **PO-V8-06** | **Hébergement du job du 1er** : `node-cron` in-process (pattern `jobs/run.ts` existant, Render long-running) **ou** déclencheur externe → `POST /api/cron/monthly-report` + `CRON_SECRET` (recommandé si cible = Vercel serverless) | ✅ Clos 18/11/2026 | **En production, déclencheur externe Vercel Cron (`POST /api/cron/monthly-report`, secret `CRON_SECRET`, `vercel.json` `crons`) — 06:00 UTC quotidien, dispatch bilan le 1er et le dernier jour ; en dev/tests, déclenchement in-process possible (mêmes fonctions métier), CA-V8-060 testable dans les deux modes — RETENU** |
| **PO-V8-07** | Projet « marketplace Sénégal » — V1–V5 mentionnent la Côte d'Ivoire ; V7 et V8 mentionnent le Sénégal (format `+221`) | ✅ Clos 18/11/2026 | **Projet Sénégal (`+221`) — CONSERVÉ, docs antérieurs inchangés — RETENU** (hérité PO-V7-07, désormais clos) |
| **PO-V8-08** | Renvoi manuel d'un bilan `FAILED` par l'admin — inclus en V8 ou ultérieur ? | ✅ Clos 18/11/2026 | **Renvoi manuel d'un bilan FAILED = V9, hors V8 — RETENU (marquée « hors V8 » en §10.1)** ; traçage `FAILED` seulement en V8 (CA-V8-069) |

### 10.2 Décisions actées le 18/11/2026 (définitives)

- Date 18/11/2026, auteur `@cahier-des-charges`, statut **« Validé par le chef de projet le 18/11/2026 — base de développement V8 »** (V8-D10).
- Les 10 décisions V8-D1 → V8-D10 (§3) consignées comme non négociables.
- **Les 8 points ouverts sont clos** (décisions définitives du chef de projet, 18/11/2026) :
  - **PO-V8-01** — (a) format `+221 7XXXXXXXX` + activation admin (Wave/Orange Money/virement) = double verrou suffisant — **RETENU** ;
  - **PO-V8-02** — interprétation « meilleur article du catalogue du vendeur sur le mois » (ventes PAID, tie-break vues) — **RETENUE** ;
  - **PO-V8-03** — mois de rattachement = `order_events.to_status = 'PAID'` — **RETENU** ;
  - **PO-V8-04** — vues du mois = delta de snapshots (compteurs `view_count` capturés au 1er et au dernier jour) — **RETENU** ;
  - **PO-V8-05** — `ALTER TABLE seller_subscriptions ADD COLUMN payment_reference varchar(64)` + `payment_method varchar(32)` (périmètre V7/V8 uniquement, conforme CA-V7-001) — **RETENU**, plan B documenté conservé ;
  - **PO-V8-06** — en production, déclencheur externe **Vercel Cron** (`POST /api/cron/monthly-report`, secret `CRON_SECRET`, `vercel.json` `crons`) — 06:00 UTC quotidien, dispatch bilan le 1er et le dernier jour ; en dev/tests, déclenchement in-process possible (mêmes fonctions métier), CA-V8-060 testable dans les deux modes — **RETENU** ;
  - **PO-V8-07** — projet Sénégal (`+221`) — **CONSERVÉ**, docs antérieurs inchangés — **RETENU** ;
  - **PO-V8-08** — renvoi manuel d'un bilan FAILED = **V9**, hors V8 — **RETENU** (marquée « hors V8 » en §10.1).
- Verrous CA-V7-003/004/037c/038 + CA-V5-069/070 confirmés intouchables (V8-D9).
- 75 critères d'acceptation définis (§6), **inchangés** — aucun CA-V8-xxx modifié, renuméroté ou supprimé dans cette mise à jour.

### 10.3 État des livrables après arbitrages d'architecture (18/11/2026)

> **Encart (état final acté le 18/11/2026).**
>
> - **3 nouvelles tables** : `storefront_profiles` (branding) · **`auto_approved_products`** (traçabilité auto-approbation — F1/F8) · **`monthly_metrics`** (bilan mensuel — fusion actée des propositions `storefront_monthly_reports` + `storefront_view_snapshots`) :
>   `monthly_metrics(subscription_id, period TEXT, views_sum, views_baseline, sales_count, ca_fcfa, email_status TEXT NULL SENT/FAILED, sent_at TIMESTAMPTZ NULL, computed_at, PK(subscription_id, period))` ;
> - **1 table V7 altérée (périmètre V7/V8)** : `seller_subscriptions` — `ADD COLUMN payment_reference varchar(64)` + `payment_method varchar(32)` (conforme CA-V7-001) ;
> - **Vercel Cron = 06:00 UTC quotidien** : déclencheur externe en production (`POST /api/cron/monthly-report`, `CRON_SECRET`, `vercel.json` `crons`) ; **dispatch bilan le 1er et le dernier jour du mois** ; déclenchement in-process possible en dev/tests (mêmes fonctions métier) — CA-V8-060 testable dans les deux modes ;
> - **PDF non archivé en V8** (régénération `/me/report`) : archivage R2 reporté V9 (arbitrage PO-V8-08-like) ; **pdfkit accepté** (génération PDF côté serveur, sans service externe) ;
> - Les **75 critères CA-V8-xxx** sont inchangés en nombre et en numérotation ; seules des références nominatives de table/colonne ont été alignées sur cet arbitrage (CA-V8-001, 060, 063, 070).

---

## 11. Définition de Done — verdict

> Portée du verdict : **ce document de spécification**, pas l'implémentation V8 (aucune ligne de code n'a été écrite dans cette mission).

| # | Exigence de la mission | État | Preuve |
|---|---|---|---|
| 1 | Un seul nouveau fichier créé, aucun autre modifié | ✅ | `revends/docs/cahier-des-charges-v8-hebergement-boutique.md` ; `git status --porcelain` = 1 fichier (ce cahier) ; 0 autre fichier touché |
| 2 | Version/date 18/11/2026, auteur `@cahier-des-charges`, statut « Validé par le chef de projet le 18/11/2026 — base de développement V8 » | ✅ | En-tête du document |
| 3 | Contexte production exact (V7 en prod, `337da2e`, https://revends.vercel.app) et 10 décisions utilisateur non négociables intégrées et numérotées V8-D1..D10 | ✅ | En-tête, §1.1, §3 |
| 4 | Objectifs mesurables + **15 KPIs** explicites avec cibles | ✅ | §1.2 (O1–O8, K1–K15) |
| 5 | Personas et 10 user stories « En tant que…, je veux…, afin de… » | ✅ | §1.4, §5 (US-V8-01..10) |
| 6 | 9 fonctionnalités enablement numérotées F1..F9, chacune « Fais / Ne fais pas » + règles métier précises | ✅ | §2.1, §4 |
| 7 | Hors-périmètre explicite (bouton Vendre/catalogue/commandes/commission 10 %/parrainage intouchables) | ✅ | §2.2 (16 lignes) + §2.3 |
| 8 | 75 critères binaires `[TEST]`/`[EXEC]`/`[AUDIT]` avec données mesurables, dont : auto-approbation ACTIVE-uniquement, badges révoqués à l'expiration, boosts selon palier, bilan au 1er + PDF joint, auto-approbation contradictoire, 0 fuite PII, 0 violation CA-V7 ∧ CA-V5 ∧ CA-V6 | ✅ | §6.1→6.8 ; CA-V8-012/079 (contradictoire), CA-V8-021 (badges révoqués), CA-V8-030/031 (boosts), CA-V8-060 (bilan + PDF), CA-V8-075/044/049 (0 PII), CA-V8-080 (verdict combiné) |
| 9 | Matrice de risques actionnable avec plans B | ✅ | §7 (12 risques, actions et plans B, risques ouverts identifiés) |
| 10 | Section « Conformité avec l'existant » (CA-V7-003/004/033/037c/038, CA-V7-026/045/054, CA-V5-069/070/150, V6.4) | ✅ | §8 (17 références croisées ; **deux dérogations consignées** : CA-V5-150 sous-clause statut-initial (V8-D2) et `storefront-edge.test.ts` / CA-V7-014 — `payment_method` hors liste bancaire interdite (arbitrage chef de projet 18/11/2026, CANARY de recette)) |
| 11 | Auto-revue relue (cohérence identifiants, unicité des IDs, numérotation des sections et critères) | ✅ | §6.9 aligné sur les groupes ; F1..F9 uniques ; PO-V8-01..08 uniques ; US-V8-01..10 uniques ; R-V8-01..12 uniques ; CA-V8-001..085 sans doublon |
| 12 | Aucune implémentation, migration, test ou déploiement lancé | ✅ | Lecture seule des docs et du code ; aucune commande build/migrate/deploy exécutée ; 0 fichier modifié hors ce cahier |

### Preuves matérielles

- **Fichier** : `revends/docs/cahier-des-charges-v8-hebergement-boutique.md`
- **Sections** : 11 sections principales (en-tête + §1 à §11), 9 fonctionnalités (F1–F9), 9 sous-sections de critères
- **Critères d'acceptation** : **75** (CA-V8-001 → CA-V8-085, 8 groupes) — voir §6.9
- **User stories** : 10 · **Risques** : 12 · **KPIs** : 15 · **Scénarios de recette** : 14
- **Points ouverts** : **8 — tous clos le 18/11/2026** (PO-V8-01 → PO-V8-08, §10.1/10.2) · **Décisions validées** : 10 (V8-D1..D10) + 8 décisions PO finales
- **Nouvelles routes proposées** : 10 (dont `POST /api/cron/monthly-report` — Vercel Cron quotidien acté, PO-V8-06 clos) · **Nouvelles tables** : **3** (`storefront_profiles`, `auto_approved_products`, `monthly_metrics`) · **Colonnes ajoutées sur périmètre V7/V8** : 2 (`seller_subscriptions` : `payment_reference varchar(64)`, `payment_method varchar(32)`) · **Migration** : `020_storefront_v8.sql`
- **Références V5/V6/V7 citées** : `cahier-des-charges-v5.md:114-115`, `:399`, `:400`, `:498`, `:620`, `:719`, `:105` ; `cahier-des-charges-v7-hebergement-vendeurs.md:192-193`, `:215`, `:223`, `:227`, `:228`, `:233`, `:240`, `:244` ; `api.md:130`, `:142`, `:2080-2122` ; `journal.md:4269` ; `cahier-des-charges.md:40` ; `016_phone_strict_9_chiffres.sql` ; `019_storefront.sql`

### VERDICT

**VALIDÉ PAR LE CHEF DE PROJET LE 18/11/2026 — BASE DE DÉVELOPPEMENT V8** — le cahier est complet, binaire, prouvable et additif (une dérogation consignée et assumée : CA-V5-150 sous-clause statut-initial pour les éligibles, décision utilisateur V8-D2).

**Réserve initialement posée (8 points ouverts PO-V8-01 → PO-V8-08) — LEVÉE le 18/11/2026** : les 8 points sont clos (décisions définitives du chef de projet, §10.1/10.2). Les 75 critères CA-V8-xxx sont inchangés et restent la porte de recette ; toute déviation invalide la livraison V8.

Sur validation, `@backend`/`@frontend`/`@architecte` peuvent démarrer ; `@tester` exécute la §9 ; toute déviation des 75 critères invalide la livraison V8.
