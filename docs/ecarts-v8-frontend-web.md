# Écarts V8 — volet web (`feat/v8-hebergement-boutique`)

> Date : 2026-11-17 · Auteur : `@frontend` (web) · Portée : `revends/web` + interaction avec le contrat v2.8 (`docs/api.md`) et le code serveur en cours de fusion.
> Prod NON touchée. Aucun module hors V8 n'a été modifié (`SellView`, `Navbar`, home, catalogue hors cartes, pipeline commandes : 0 ligne).

## Écarts constatés (front vs back) — à traiter par `@backend`/chef de projet

1. **`GET /api/subscriptions/me/report?period=YYYY-MM` — route absente (livrable 1d/1e).**
   Le contrat v2.8 (`docs/api.md`) ne livre le PDF du bilan qu'en **pièce jointe de l'e-mail** (`bilan-{slug}-{YYYY-MM}.pdf`, pdfkit, job du 1er). Aucune route ne permet de re-télécharger le PDF depuis `/mon-abonnement`.
   **Livré** : boutons « Télécharger le PDF » (dernier bilan + par ligne d'historique) **câblés** sur cette route (`downloadReportPdf()` dans `lib/storefront.ts`), avec dégradation propre : 404/non-2xx ⇒ toast FR « Le téléchargement n'est pas encore disponible — le bilan vous est aussi envoyé par e-mail ». **À faire côté serveur** : exposer `GET /api/subscriptions/me/report?period=YYYY-MM` (propriétaire uniquement) en lisant `monthly_metrics` + regénérant via `renderBilanPdf` (module serveur existant).
   **Contrat bilatéral (1e)** : aucun artefact « contrat » n'existe côté back. Livré : bloc « Votre contrat d'abonnement » + bouton **« Télécharger le PDF »** → impression navigateur → "Enregistrer au format PDF" (feuille `.rv-contract-print`, `@media print`), 100 % client-side, hors ligne.
   **Écart vs maquette** : `<Image>` n'existe pas dans ce codebase (pas de Next) ; `components/site/SiteImage.tsx` est l'équivalent existant. Les visuels boutique (logo/bannière) utilisent `<img>` + `resolveImageUrl` : l'illustration de secours de `SiteImage` (gabarit vêtement) est inadaptée à un logo.

2. **Badge au niveau boutique (hero) — `sellerBadge` non exposé par `GET /api/storefront/:slug` (E2).**
   L'extension E2 ajoute `logoUrl?/bannerUrl?/publicDescription?` mais **pas** le badge sur l'objet `storefront`. **Livré** : le hero dérive le badge des annonces (`items[0].sellerBadge`, même vendeur ⇒ même valeur — jointure SQL serveur) ; **boutique avec 0 annonce ⇒ aucun badge** (documenté, jamais de badge inventé). Fiche produit et cartes catalogue/boutique portent le badge via leur propre sérialiseur ✓.

3. **`collecteAddress` — contradiction entre api.md v2.8 et l'architecture §14.D.**
   - `docs/api.md` v2.8 (E3/E4) : adresse visible de l'**admin** (file) et du **propriétaire** (`GET/PUT /api/storefront/profile`) ; le front `/mon-abonnement` (BrandingPanel) **n'affiche jamais la valeur** : saisie en **écriture seule** + indicateur `collecteAddressSet: boolean` (architecture §14.D actée, plus stricte). En cas d'erreur de saisie, l'adresse actuelle n'est ni lisible ni copiable depuis l'UI.
   - La **file admin** (`/admin/abonnements`) affiche la valeur complète (**uniquement admin** — écran hors espace public) + `paymentReference` **masquée** (`safeReference()` : préfixe + 3 derniers caractères ; « référence absente » pour les legacy PENDING, CA-V8-053).
   - Divergence consignée : l'architecture §7.4/§14.D (« aucune surface API/UI, SQL trusted only ») **n'a pas été suivie**, conformément à la consigne produit de la mission (« collecteAddress montré UNIQUEMENT ADMIN ») et à api.md v2.8. Si le chef de projet tranche pour §7.4, supprimer la colonne « Adresse de collecte » de la file admin — 5 lignes dans `pages/admin/Abonnements.tsx`.
   - Le propriétaire peut techniquement lire sa propre adresse via `GET /api/storefront/profile` (comportement serveur, hors notre contrôle) — le front ne l'appelle pas.

4. **Tailles max — logo 2 Mo / bannière 4 Mo.** api.md v2.8 + `middleware/upload.ts` (serveur) : multer 8 Mo global, arbitrage service (`MAX_LOGO_BYTES` 2 Mo / `MAX_BANNER_BYTES` 4 Mo, `413 FILE_TOO_LARGE`). Le front applique les mêmes plafonds en **hint client** ; le serveur reste l'arbitre. Conforme à la consigne (pas d'écart).

5. **Bilan côté admin — « dernier rapport + SENT/FAILED visible pour propriétaire/admin » (1c).**
   L'API n'expose **aucune** surface au rôle `admin` pour `monthly_metrics.email_status` (pas de route admin bilan en v2.8 ; l'admin ne voit pas le statut d'envoi). **Livré** : statut visible par le **propriétaire** (onglet Statistiques : badge « Réussite / Échec — envoi » + dates, `aria-live` respecté via `StatusBadge`). Côté admin : **non livrable sans route serveur** — écart à traiter en V9 ou par une extension E3 bis (`emailStatus` dans la file admin) si le chef de projet le décide.

6. **Référence Wave/OM/virement obligatoire — DEFIANCE consignée côté serveur.**
   Le serveur exige strictement dès qu'une valeur est fournie mais tolère l'absence (`NULL` = legacy activable) ; **le front rend les deux champs obligatoires** (validation miroir `lib/v8.ts#validatePaymentFields` + regex E1). `paymentReference` n'apparaît **jamais** dans une surface publique (vérifié par grep : fichiers publics = types + champs de saisie propriétaire + masquage admin).

7. **Contraste AA des badges (CA-V8-027).**
   `--champagne` sur `--champagne-soft` (clair) = **4,25:1** → refusé. Livré : « Boutique Pro » = `--champagne` sur `--surface-raised` + filet `--champagne` (**4,95:1** clair / ≈ 11:1 sombre) ; « Boutique Vérifiée » = `--accent-text` sur `--accent-soft` (≥ 7,7:1) ; « Boutique » = `--text-secondary` sur `--surface-sunken` (≥ 6,2:1). Aucune nouvelle palette.

8. **Ambassadeur absent des cartes catalogue et du hero boutique (E5).**
   `sellerBadge` est exposé sur les cartes (catalogue + boutique) et la fiche, mais **pas** `ambassador` sur les cartes/hero (non exposé par ces sérialisateurs). Le badge palier s'affiche seul là où l'API ne donne pas `ambassador` ; sur la fiche produit, les deux cohabitent (« Ambassadeur » + badge palier, ordre stable) conformément à CA-V8-022.

9. **`use react-query day cache` appliqué** : `['my-stats']` → `staleTime: 86_400_000` (bilan mensuel + fenêtre 30 j).

10. **Playwright E2E** : non exécuté (dépend d'un build API + base seedée — domaine `@tester`). La recette manuelle recommandée figure dans le rapport de livraison : 14 scénarios §9 du cahier (Badges #2, #8, Stats, Admin file) + axe sur fiche/catalogue/boutique/stats à 375 px.

## Ce qui a été livré (fichiers)

Voir le rapport de livraison (réponse de session). Aucune refonte, aucun mix de modules ; `SellView`, `Navbar`, home et pipeline de commande : **0 ligne** (`git diff --stat`).
