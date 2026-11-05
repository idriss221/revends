# Rapport final — ReVends V6 (WhatsApp, preuve de paiement, +221, SEO)

**Date** : 4 novembre 2026
**Production** : https://revends.vercel.app
**Déploiement** : `dpl_4fmrtSsFcbhtCMirUbRMYfZ333LR` (READY, alias production)
**Branche** : `fix/images-vercel-blob` (HEAD `974e47e` + changements V6)

---

## 1. Contexte et objectif

Finaliser ReVends sans jamais remplacer la version en production par une version locale ou
ancienne : la production reste la référence fonctionnelle et visuelle. Objectifs : notifications
WhatsApp Business **officielles** + e-mail, workflow « commande non payée = invalide » avec preuve
de paiement **validée côté serveur**, numéros sénégalais **+221** par défaut, SEO consolidé pour
« revends », « revendsen », « revendsen direct », « revends Sénégal », « revends marketplace ».

## 2. Périmètre livré

- Backend : normalisation téléphone, preuve de paiement, dispatcher e-mail/WhatsApp, notifications.
- Frontend web : inscription/checkout « Numéro WhatsApp », envoi de preuve acheteur, revue admin.
- SEO : index.html enrichi, robots.txt, sitemap.xml, route `/catalogue`.
- Base : migrations `013_payment_proofs.sql` et `014_phone_221_migration.sql` (test + production).
- Hors périmètre : aucun changement de design global, d'authentification, de panier, de commandes
  hors preuve, d'administration hors revue de preuve.

## 3. Production de référence préservée

- Aucune régression des routes publiques : `/`, `/shop`, `/catalogue`, `/category`, `/sell`,
  `/login`, `/mes-commandes` répondent **200**.
- Même structure d'index que la production : script de thème **externe** `/theme-init.js`,
  bundle hashé, CSP inchangée.
- Les URLs déjà indexées sont conservées ; `/sell` reste accessible mais retiré du sitemap (privé).
- Déploiement par output pré-construit (`vercel build --prebuilt --prod`), procédure validée
  `scripts/deploy-vercel.sh`.

## 4. WhatsApp Business — Cloud API officielle uniquement

- `server/src/whatsapp/whatsapp.service.ts` : Graph API `POST /{phoneNumberId}/messages`,
  timeout 8 s, numéro masqué dans les logs, **ne lève jamais**.
- Aucun WhatsApp Web, Puppeteer, Selenium ou API non officielle.
- Variables : `WHATSAPP_ENABLED`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
  `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`,
  `WHATSAPP_TEMPLATE_*` — documentées dans `.env.example`, jamais en dur.
- `WHATSAPP_ENABLED=false` par défaut → canal `SKIPPED`, l'e-mail continue.

## 5. E-mail — Gmail SMTP / système existant

- Chaîne existante conservée : `nodemailer` + templates, envoi **après COMMIT**, best-effort.
- 4 nouveaux templates : `payment_instructions_buyer`, `payment_proof_received_buyer`,
  `payment_proof_rejected_buyer`, `payment_proof_submitted_admin`.
- Sujets ajoutés dans `mailer.ts` ; aucune adresse ne provient du corps de requête.
- `MAIL_ENABLED=true` en production.

## 6. Workflow commande / paiement

- Création de commande → `PAYMENT_PENDING`, paiement `PENDING`, produit `RESERVED`.
- **Le vendeur ne reçoit AUCUNE notification à la création** : `article_reserved` (in-app + e-mail)
  supprimé. Seul l'acheteur est informé (`order_created`).
- Validation admin → `PAID` puis `PRODUCT_WAITING`, produit `SOLD`, payout créé, événements écrits,
  **puis** notifications acheteur + vendeur.
- Le frontend ne peut jamais modifier un statut de paiement : il ne soumet qu'une image.

## 7. Preuve de paiement sécurisée

- `POST /api/orders/:id/payment-proof` (acheteur propriétaire uniquement) :
  - 1 fichier, 5 Mo max, MIME réel vérifié par magic bytes (JPEG/PNG/WebP) ;
  - fichier écrit **hors transaction**, compensation (`deletePhoto`) si l'INSERT échoue ;
  - **201** : la preuve est `PENDING`, la commande reste `PAYMENT_PENDING`, le paiement reste
    `PENDING`, le vendeur reste silencieux.
  - `404` pour un tiers (non-divulgation), `409` si la commande n'attend plus de preuve.
- `POST /api/admin/orders/:id/payment-proof/:proofId/review` (admin) :
  - `APPROVED` → `confirmPaymentInTransaction` (validation **réelle**) puis `payment_proofs.status =
    APPROVED` ; notification acheteur + vendeur.
  - `REJECTED` → motif obligatoire, statut inchangé, acheteur notifié, nouvelle preuve possible.
  - Rejeu → `409 PAYMENT_PROOF_ALREADY_REVIEWED`.
- Vues : `paymentProofs[]` exposé **uniquement** acheteur et admin (jamais vendeur).

## 8. Notifications indépendantes, anti-doublons, retries

- Dispatcher unique : `Promise.allSettled([email, whatsapp])` — l'échec de l'un ne bloque pas l'autre,
  et aucun échec ne casse l'action métier.
- Idempotence : `notification_deliveries (idempotency_key, channel)` unique ; statuts
  `PENDING/SENT/FAILED/SKIPPED`, `attempts`, `last_error`, `sent_at`.
- Retries : **3 maximum**, backoff, aucun doublon à la reprise.
- Bug corrigé : `markDelivery` envoyait `$2` sans cast → `inconsistent types deduced for parameter $2`,
  les livraisons n'étaient jamais marquées `SENT`. Corrigé (`$2::text`) et couvert par un test.

## 9. Numéros +221 par défaut

- `normalizePhone()` : `77 123 45 67`, `771234567`, `0771234567`, `00221…`, `221…` → `+221…`.
- Un indicatif étranger **explicite** n'est jamais remplacé (`+225`, `+33`, …).
- `registerSchema` et `shippingSchema` exposent la forme canonique et un message clair
  « Numéro WhatsApp invalide (ex. 77 123 45 67 ou +221 77 123 45 67) ».
- Tests : `phone-221.test.ts` — **12/12**.

## 10. Migration prudente des données

- `014_phone_221_migration.sql` : seuls les `+225` **sénégalais** (9 chiffres après 225, mobile `7…`)
  sont candidats ; les numéros ivoiriens (8 ou 10 chiffres après 225) sont **préservés**.
- Anti-doublon renforcé : si deux lignes convergent vers le même `+221`, une seule est corrigée,
  l'autre est journalisée `skipped_duplicate` (aucune violation d'unicité possible).
- Journal `phone_migration_audit` (ancienne valeur, nouvelle, action, motif) → réversible à la main.
- **Production** : sauvegarde préalable des 28 téléphones, migration appliquée, **28 utilisateurs
  avant = 28 après**, 28 numéros distincts, **22 `skipped_foreign`**, **0 `corrected`**
  (aucun ancien `+225` sénégalais en base), aucune perte.

## 11. Inscription et checkout

- Libellé « Numéro WhatsApp » (inscription + checkout).
- Champ prérempli `+221 ` côté web, placeholder `77 123 45 67`, `type="tel"`, `autocomplete="tel"`.
- Vérifié en production : `/register` affiche le bon libellé et la valeur `+221 `.
- Anciens comptes inchangés et fonctionnels (connexion par e-mail).

## 12. SEO

- `web/index.html` : title « ReVendsen — Marketplace seconde main au Sénégal | ReVends »,
  description ciblée, keywords, canonical, OG complet, Twitter Card, JSON-LD Organization + WebSite
  (SearchAction), `robots: index, follow`.
- `robots.txt` : pages privées exclues (`/admin`, `/login`, `/panier`, `/mes-commandes`, `/api/`, …),
  sitemap déclaré.
- `sitemap.xml` : `/`, `/shop`, `/catalogue`, `/category`.
- Route SPA `/catalogue` ajoutée : l'URL du sitemap répond réellement (200) et affiche « Découvrir ».
- Vérifié en production : title, description, canonical, JSON-LD et `theme-init.js` présents.

## 13. Design et non-régression

- Identité « Maison Bordeaux » intacte : mêmes tokens, mêmes composants (`Card`, `StatusBadge`,
  `Button`, `Notice`), mêmes parcours.
- Ajouts UI cohérents : `.proof-list`, `.proof-item`, `.proof-upload` dans `bureau-fixes.css`,
  badges `dot` conformes à l'invariant design admin.
- Aucune erreur console sur `/` et `/catalogue` en production.

## 14. Tests réellement exécutés

- Serveur : `npm test` → **29 suites, 514/514, 0 échec, 0 skip** (`✅ ALL SUITES GREEN`).
- Web : `npx vitest run` → **235/235, 0 échec**.
- Nouvelles suites : `payment-proofs.test.ts` (6/6), `phone-221.test.ts` (12/12).
- Tests mis à jour pour la règle métier : vendeur non notifié avant paiement (`buy.test.ts`,
  `emails.test.ts`), téléphone normalisé (`checkout.test.ts`), budget de requêtes isolé des effets
  post-commit (`perf-v5.test.ts`), numéros de test dédiés (`helpers.ts`).
- Typecheck : `tsc --noEmit` serveur OK, `tsc -b` web OK.
- Build : `vite build` OK, `tsc -p` serveur OK.

## 15. Déploiement

- `scripts/deploy-vercel.sh` : garde-fou `.env*`, build web, copie `web/dist` → `public/` +
  `server/public/`, `vercel build --prod`, `vercel deploy --prebuilt --prod`.
- Résultat : **READY**, alias `https://revends.vercel.app`.
- Contrôles post-déploiement : `/` 200, `/api/health` 200 (`{"status":"ok"}`), `/robots.txt` 200,
  `/sitemap.xml` 200, assets JS/CSS 200, `/theme-init.js` 200.
- Migrations production appliquées manuellement (`RUN_MIGRATIONS=false` en prod) avec sauvegarde.

## 16. Sécurité

- Aucun secret dans le dépôt, le bundle client ou les logs : vérifié par grep sur
  `assets/index-C8qtnJ9D.js` (`smtp.gmail`, `revendsen@gmail`, `BLOB_READ_WRITE_TOKEN`,
  `SESSION_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `postgres://` → **0 occurrence**).
- Toutes les valeurs sensibles par variables d'environnement (Vercel / `.env.local` non versionné).
- Upload : magic bytes, 1 fichier, 5 Mo, nom UUID serveur, dossier dédié `payment-proofs`.
- Non-divulgation : tiers → `404` (jamais `403`), vendeur ne voit jamais la preuve ni les coordonnées.
- CSRF actif sur les routes mutantes (vérifié : `403 CSRF_INVALID` sans jeton), session HttpOnly.

## 17. Risques et actions utilisateur

| # | Risque | Statut | Action |
|---|---|---|---|
| 1 | Token WhatsApp Meta absent | **BLOCKED** | Fournir `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, puis `WHATSAPP_ENABLED=true` |
| 2 | Template WhatsApp business-initiated non approuvé | **BLOCKED** | Créer/approuver le template Meta et renseigner `WHATSAPP_TEMPLATE_*` |
| 3 | `RUN_MIGRATIONS=false` en production | Assumé | Appliquer toute nouvelle migration manuellement (sauvegarde + audit) |
| 4 | `013_product_image_repair.sql` (prod) absent du dépôt | Mineur | Rapatrier le fichier pour éviter une divergence |
| 5 | Test WhatsApp réel de bout en bout | **BLOCKED** (secrets) | À rejouer après fourniture du token |
| 6 | Validation Search Console | Manuel | Soumettre `https://revends.vercel.app/sitemap.xml` |

---

## Checklist de vérification finale

- [x] Production de référence non remplacée ; routes publiques 200.
- [x] WhatsApp = Cloud API officielle uniquement (aucun outil non officiel).
- [x] Aucun secret dans le code, les logs, le frontend ou les fichiers publics.
- [x] Commande non payée = invalide ; vendeur non notifié avant validation.
- [x] Frontend incapable de modifier un statut de paiement.
- [x] Preuve reçue ≠ paiement validé ; validation admin côté serveur.
- [x] Notifications e-mail et WhatsApp indépendantes, idempotentes, 3 retries.
- [x] +221 par défaut ; indicatif étranger explicite préservé.
- [x] Migration +225 → +221 contrôlée, journalisée, sans perte (28 = 28).
- [x] Champ « Numéro WhatsApp » + `+221 ` à l'inscription et au checkout.
- [x] SEO : title/description/canonical/OG/JSON-LD, robots, sitemap, `/catalogue` 200.
- [x] Design, identité, navigation, auth, panier, commandes, administration préservés.
- [x] Tests serveur 514/514, web 235/235, 0 échec (résultats réels).
- [x] Typecheck et builds serveur/web OK.
- [x] Déploiement READY + alias `revends.vercel.app`.
- [x] `/api/health` 200, `/robots.txt` 200, `/sitemap.xml` 200.
- [x] Tables `payment_proofs` et `notification_deliveries` présentes en production.
- [x] Migrations production appliquées avec sauvegarde préalable.
- [x] Journal `docs/journal.md` mis à jour ; contrat `docs/api.md` complété (V6).
- [ ] WhatsApp réellement envoyé — **bloqué** : token/template Meta manquants.

**Verdict** : 🟢 **GO PRODUCTION** pour l'e-mail, la preuve de paiement, +221 et le SEO.
🟡 **WHATSAPP EN ATTENTE** des secrets Meta (canal désactivé proprement, sans impact sur le reste).
