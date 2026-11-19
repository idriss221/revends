# Design V9 — « Wave Checkout » pour abonnements boutique : direction visuelle & parcours UX

| | |
|---|---|
| **Projet** | ReVends — marketplace de revente d'articles d'occasion (Sénégal) · **ReVendsen** |
| **Version document** | **1.0 — 19/11/2026** |
| **Auteur** | Agent `@design`, sur instruction du chef de projet et de l'utilisateur |
| **Statut** | **Proposé — à valider par le chef de projet**. Spécification seule : **0 ligne de code écrite, 0 commit créé, 0 secret posé, 0 écran implémenté**. |
| **Nature** | **Design additif** : 5 écrans/états V9 uniquement. Aucun restylage, aucun libellé existant modifié, aucun composant existant réécrit. |
| **Cible** | Web (React + Vite, `revends/web`) ; grille tactile **280 / 320 / 360 / 375 px**. **Aucune cible mobile native** (pas de webview, pas d'apk). |
| **Langue & voix** | Français. Voix ReVendsen : sobre, concrète, jamais exclamative — « La seconde vie a de la valeur. » (une fois par page maximum). « Vous » partout, zéro emoji. |
| **Références amont** | `docs/cahier-des-charges-v9-wave-checkout.md` (55 critères `CA-V9-xxx`, 12 scénarios) · `docs/architecture-v9-wave-checkout.md` (décisions `D-ARCH-1..10`, routes `N1..N6`) · `docs/design-system.md` (tokens publics) · `docs/design-v7-hebergement-vendeurs.md` (direction visuelle abonnements, source de vérité visuelle) · `docs/design-system-revends-v5.md` (scope admin). |
| **Fichiers réellement lus le 19/11/2026** | `web/src/App.tsx:74-154` (routes) · `web/src/styles/tokens.css:1-209` (source unique couleur `.market-site`) · `web/src/index.css:65-151, 189-251, 437-450, 473-562` (`@theme static` global, base, mouvement, RE-SKIN) · `web/src/lib/storefront.types.ts:7-59, 104-140` (types) · `web/src/pages/MonAbonnement.tsx:252-536` (3 visages d'insertion) · `web/src/components/storefront/SubscriptionStatusPanel.tsx:18-64` · `web/src/components/storefront/PaymentReferenceFields.tsx:33-94` · `web/src/pages/admin/Abonnements.tsx:52-71, 189-232, 466-528` · `web/src/components/ui/{StatusBadge,Notice,HeartLoader}.tsx`. |
| **Sources officielles Wave** | `https://docs.wave.com/checkout` — `POST /v1/checkout/sessions`, `amount` **chaîne**, `currency: "XOF"`, `client_reference` ≤ 255, `wave_launch_url` à ouvrir par le **navigateur**. · `https://docs.wave.com/webhook` — HMAC sur `t + rawBody`, multi-`v1`, rejet > 5 min, idempotence `event.id`, 2xx < 5 s. Aucune valeur réinventée. |

> **Avertissement de périmètre (non négociable).** Cinq écrans/états, **ni plus ni moins** : `WaveCheckoutPanel` dans `/mon-abonnement`, panneau PENDING Wave, `/paiement-wave/succes`, `/paiement-wave/echec`, vue admin `/admin/abonnements`. La production reste **`WAVE_ENABLED=false`** : le bouton automatique est **absent**, le formulaire manuel et les 3 liens Wave hébergés restent seuls visibles. Le webhook signé est la **seule** preuve d'activation. Aucun secret, aucun logo Wave sans source, aucune animation de succès avant webhook.

---

## 1. Principes directeurs (ancrés dans le code réel)

| # | Principe | Conséquence visuelle / UX | Source vérifiée |
|---|---|---|---|
| P1 | **Additivité stricte** | On ajoute un panneau, un libellé conditionnel, deux routes et une colonne admin. Zéro restylage de page, zéro changement de contrat existant. | `web/src/App.tsx:127-129` (route `/mon-abonnement`), `:151` (admin) ; `web/src/pages/MonAbonnement.tsx:255, 369, 469` (insertions) ; `web/src/pages/admin/Abonnements.tsx:472-499` (table inchangée) ; `web/src/styles/tokens.css:1-13` (source unique) |
| P2 | **Même skin, pas de sous-marque** | Les 5 écrans consomment les tokens `.market-site` existants (clair « Blanc Ivoire » / sombre « Bordeaux Nuit ») ou les tokens admin `.market-admin` existants. Aucun hex, aucune fonte, aucun rayon, aucune ombre nouveaux — **hors accent Wave unique** (P3). | `tokens.css:23-105, 107-173, 176-209` ; `index.css:489-562` ; `design-v7-hebergement-vendeurs.md:34-103` |
| P3 | **Wave = accent unique, jamais couleur d'action** | Un seul couple de tokens globaux (§1.1). Le CTA principal reste bordeaux `--accent` / `--color-terracotta-strong` ; Wave est un **chip d'identification**, pas un bouton d'action coloré. | `index.css:70-89` (`@theme static` global, point de déclaration) ; `tokens.css:41-45, 121-125` (accent bordeaux protégé) |
| P4 | **Le retour navigateur n'est pas une preuve** | `/paiement-wave/succes` n'écrit rien, ne lit aucun paramètre, n'affiche ni `ACTIVE` ni « Paiement reçu ». Le statut réel est relu via `/api/subscriptions/me`. | `cahier-des-charges-v9-wave-checkout.md:52, 223-225` (CA-V9-021/022) ; `architecture-v9-wave-checkout.md:308-309` |
| P5 | **Indicateur explicite, aucune déduction** | Le libellé Wave spécifique n'apparaît que si `wavePaymentPending === true`. Pour OM, virement et legacy, le libellé neutre existant reste **mot pour mot** inchangé. | `storefront.types.ts:19-33` (extension optionnelle) ; `SubscriptionStatusPanel.tsx:18-22, 31-64` ; `architecture-v9-wave-checkout.md:416-418` (D-ARCH-3) |
| P6 | **Navigation navigateur, jamais webview** | `wave_launch_url` = navigation top-level (`<a href>` ou `window.location.assign`). Aucun iframe, aucun in-app browser, aucune fenêtre modale hébergeant Wave. | `architecture-v9-wave-checkout.md:306-307, 307` ; CA-V9-020/024 |
| P7 | **Copy FR copier-coller, jamais de code** | Aucun code d'erreur, aucun `client_reference`, aucun `amount`, aucun `event.id` à l'écran. Les 3 prix affichés viennent de la configuration statique des liens (§3.1) ; aucun prix n'est une logique de tarification côté front. | `PaymentReferenceFields.tsx:50-53, 81-87` ; `MonAbonnement.tsx:268-270, 356-357` ; CA-V9-011/017 |
| P8 | **Accessibilité par les tokens, pas par l'à-peu-près** | Focus `--focus` (2 px, offset 3), cibles ≥ 44 px, `aria-live` sur le statut, `prefers-reduced-motion` neutralisé, 0 débordement horizontal de 280 à 375 px. | `index.css:197-199, 245-256, 437-450` ; `design-v7-hebergement-vendeurs.md:653-726` ; `Abonnements.tsx:421, 437` (onglets ≥ 44 px existants) |
| P9 | **Le mode désactivé est le mode de production** | `waveEnabled:false` ⇒ **aucun bouton rendu**, mais formulaire manuel + 3 liens hébergés toujours présents. Le booléen n'autorise aucune écriture. | `architecture-v9-wave-checkout.md:199-202` ; `MonAbonnement.tsx:317-332, 377-390, 478-491` ; CA-V9-001/002/003/074 |

### 1.1 Token unique Wave — déclaration, contraste, interdictions

Déclaration **unique**, ajoutée dans le bloc `web/src/index.css:70-151` (`@theme static`, déjà source globale selon `index.css:66-69`) :

```css
--color-wave: #1DC8FF;       /* accent d'IDENTIFICATION Wave — jamais un CTA */
--color-on-wave: #1A1714;    /* texte sur aplat Wave — identique aux 2 thèmes */
```

Aucune redéclaration dans `tokens.css`, aucun hex en dur dans un JSX, aucune classe utilitaire maison. `var(--color-wave)` est hérité aussi bien par `.market-site` (public) que par `.market-admin` (admin), car `@theme static` émet les variables sur `:root`.

| Combinaison mesurée (WCAG 2.1, formule relative luminance, 19/11/2026) | Ratio | Verdict |
|---|---|---|
| `--color-on-wave` `#1A1714` sur `--color-wave` `#1DC8FF` | **9,14:1** | AAA ✅ — seul couple texte/fond Wave autorisé |
| `#171513` (`--color-ink` admin) sur `#1DC8FF` | **9,33:1** | AAA ✅ |
| `#1DC8FF` sur `--surface-base` sombre `#0D0C0B` | **10,01:1** | AAA ✅ — filet/pastille autorisé **en sombre uniquement** |
| `#1DC8FF` sur `--surface-raised` sombre `#151312` | **9,49:1** | AAA ✅ |
| `#1DC8FF` sur `--surface-base` clair `#FBF9F5` | **1,86:1** | ❌ — **interdit** comme filet, bordure ou texte en clair |
| `#1DC8FF` sur `--surface-raised` clair `#FFFFFF` | **1,95:1** | ❌ — idem |
| `#FFFFFF` / `#F4F0E8` sur `#1DC8FF` | **1,95 / 1,72:1** | ❌ — **jamais** `--on-accent` ou `--color-white` sur Wave |

**Règle de forme déduite** : le chip Wave est **toujours un aplat plein** (`background: var(--color-wave)`, `color: var(--color-on-wave)`), dans les deux thèmes. Cela évite le filet cyan illisible en clair (1,86:1 < 3:1 pour 1.4.11). Le pourtour du panneau reste `--line`, le focus reste `--focus`, le texte reste `--text-*`. Le cyan n'est jamais la seule porteuse d'information : le chip porte le **mot « Wave »** (WCAG 1.4.1).

### 1.2 Échelle commune aux 5 écrans (tokens existants, aucune valeur plaquée)

| Rôle | Token réel | Valeur |
|---|---|---|
| Texte / secondaire / tertiaire | `--text-primary` / `--text-secondary` / `--text-tertiary` | `#1A1714` / `#5C554D` / `#756C62` (clair) · `#F4F0E8` / `#C2B8AC` / `#8F857A` (sombre) |
| Surfaces | `--surface-base` / `--surface-raised` / `--surface-sunken` | `#FBF9F5` / `#FFFFFF` / `#F1EDE4` (clair) · `#0D0C0B` / `#151312` / `#080707` (sombre) |
| CTA principal (bordeaux, inchangé) | `--accent` / `--accent-hover` / `--on-accent` | `#7A1B2E` / `#5E1424` / `#FFFFFF` (clair) · `#8E2337` / `#A62C42` / `#F4F0E8` (sombre) |
| Bandeaux | `--success` / `--success-soft` · `--danger` / `--danger-soft` | `#2F6B4F` / `#E1EFE6` · `#A32C22` / `#F7E4E1` (clair) · `#5FBF8E` / `#16241C` · `#E5807A` / `#2A1715` (sombre) |
| Focus | `--focus` | `#7A1B2E` clair (9,87:1 base) · `#E2C79E` sombre (12,00:1 base) |
| Typo | `--font-display` / `--font-sans` | `DM Serif Display` (titres) / `Manrope` (texte) — admin : `Plus Jakarta Sans` (`index.css:119`) |
| Échelle | `--fs-h1 / h2 / body / meta / label` | `clamp(30px,3.4vw,42px)` · `clamp(24px,2.2vw,30px)` · `16px` · `13px` · `11px` |
| Espacements / rayons | `--s-1…--s-20` · `--r-xs/sm/md/lg/pill` | `4·8·12·16·20·24·32·40·56·80` px · `8·12·16·20·999` px |
| Mouvement | `--ease` / `--t-fast` / `--t` / `--t-slow` | `cubic-bezier(.2,.8,.2,1)` · `.16s` · `.24s` · `.4s` |

Contrastes hérités V7 (déjà mesurés, réutilisés sans recalcul) : `--text-primary` 16,97 clair / 17,19 sombre ; `--text-secondary` 6,98 / 10,00 ; `--text-tertiary` 4,90 / 5,40 ; `--success`/`--success-soft` 5,30 / 7,16 ; `--danger`/`--danger-soft` 5,83 / 6,25 ; `--on-accent` sur CTA 10,38 / 7,55 (`design-v7-hebergement-vendeurs.md:679-713`).

---

## 2. Inventaire des 5 écrans/états et fil de décision

### 2.1 Les 5 écrans/états (périmètre fermé)

| ID | Écran / état | Route & contexte | Composant porteur | Comportement clé | CA-V9 |
|---|---|---|---|---|---|
| **E1** | Panneau de paiement Wave dans `/mon-abonnement` (3 visages : aucun / PENDING / EXPIRED) | `/mon-abonnement`, `RequireUser`, `SiteShell` | `WaveCheckoutPanel` (nouveau, 3 modes) | Bouton `Payer avec Wave` **uniquement si** `waveEnabled && PENDING && wavePaymentPending` ; 3 liens hébergés toujours visibles | 002, 003, 010-020, 060, 065 |
| **E2** | Panneau PENDING avec libellé Wave spécifique | `/mon-abonnement`, dans `SubscriptionStatusPanel` existant | Extension conditionnelle de `SubscriptionStatusPanel` | Chip + libellé exact « Wave — en attente de confirmation du paiement » ; aucun changement du libellé neutre | 019, 021, 022 |
| **E3** | Retour.navigateur « succès » | `/paiement-wave/succes`, `RequireUser`, `SiteShell`, **aucun query** | `WaveSucces` (nouveau) | 0 écriture, 0 paramètre lu, statut relu via `/me`, message d'attente | 021, 022, 024, 053 |
| **E4** | Retour navigateur « échec » | `/paiement-wave/echec`, `RequireUser`, `SiteShell`, **aucun query** | `WaveEchec` (nouveau) | 0 activation, repli manuel visible, contact support unique | 023, 024, 037 |
| **E5** | Vue admin des paiements Wave | `/admin/abonnements`, `RequireAdmin`, `DashboardLayout` | 1 colonne additive dans `Abonnements` existant | `GET /api/wave/admin/events`, états en attente / confirmé / échoué, trace `activated_by = 7` | 004, 050, 051, 052 |

### 2.2 Fil de décision (le seul chemin autorisé)

```
VENDEUR /mon-abonnement
   │
   ├─ GET /api/wave/config → waveEnabled ?
   │      ├─ NON (prod actuelle) ──────────────► E1 : bouton ABSENT
   │      │                                       formulaire manuel + 3 liens visibles
   │      │                                       fin du parcours automatique
   │      └─ OUI ─► souscription PENDING et wavePaymentPending = true ?
   │                    ├─ NON ─────────────────► E1 : 3 liens seuls, pas de bouton mort
   │                    └─ OUI ─► bouton « Payer avec Wave »
   │                                  │ clic → POST /api/wave/checkout/sessions
   │                                  │   ├─ erreur → E1 Notice danger + repli manuel
   │                                  │   └─ 200 { waveLaunchUrl }
   │                                  └─ navigation NAVIGATEUR vers pay.wave.com (E1)
   │                                             │
   │                        ┌────────────────────┴────────────────────┐
   │                        ▼ retour navigateur                       ▼ webhook machine
   │                  E3 /succes  ou  E4 /echec              POST /api/webhooks/wave
   │                  (aucun query, 0 écriture)               HMAC + 5 min + event.id
   │                        │                                        │
   │                        │  /me relu (PENDING)                     ├─ completed valide
   │                        │                                        │   → activateSubscription(7)
   │                        │                                        │   → ACTIVE, 30 j, 1 e-mail
   │                        └────────────► /me au prochain rendu ◄────┤
   │                                       E2 bascule « état ouvert » ├─ payment_failed → 2xx, 0 activation
   │                                       (aria-live, sans alarme)   └─ invalide/rejoué → rejet, 0 activation
   │
   └─ ADMIN /admin/abonnements → E5 : colonne « Paiement Wave » (lecture seule)
```

**Règle de lecture du fil** : le chemin « retour navigateur » et le chemin « webhook » ne se croisent jamais du côté writing. E3/E4 sont des **vues** ; seule la branche webhook peut écrire. Le bouton n'est pas une preuve, `waveEnabled` n'est pas une preuve, un `200` de création de session n'est pas une preuve.

---

## 3. Spécifications écran par écran

### 3.1 E1 — `WaveCheckoutPanel` dans `/mon-abonnement`

**Insertion** : un seul `<WaveCheckoutPanel />` ajouté dans chaque visage, **après** le titre/bloc d'intro et **avant** le formulaire manuel existant :
- visage AUCUN → après le paragraphe `L’administration examine votre demande…` (`MonAbonnement.tsx:268-271`), avant `<form>` (`:273`) ;
- visage EXPIRED → après `SubscriptionStatusPanel` (`:375`), avant le bloc `PaymentReferenceFields` (`:377`) ;
- visage PENDING → après `SubscriptionStatusPanel` (`:475`), avant le bloc changement de forfait (`:476`).

Aucun de ces blocs existants n'est édité. Le composant reçoit `{ waveEnabled, subscription, plans, config }` et n'appelle **jamais** directement l'API Wave : il passe par `POST /api/wave/checkout/sessions` (route serveur).

**Trois modes de rendu** (un seul à la fois) :

| Mode | Condition | Contenu |
|---|---|---|
| `liens-seuls` | aucune souscription, ou `EXPIRED`, ou `CANCELLED`, ou `waveEnabled=false` | Chip + titre + 3 liens hébergés + note de repli. **Aucun bouton**. |
| `session` | `waveEnabled=true` **et** `status==='PENDING'` **et** `wavePaymentPending=true` | Chip + titre + bouton + 3 liens hébergés + note de repli. |
| `indisponible` | `waveEnabled=true` mais souscription non éligible | Chip + titre + 3 liens hébergés + note neutre ; pas de bouton, pas d'erreur technique. |

**Maquette 280 px (mode `session`, thème clair — le plus contraignant)** :

```
┌──────────────────────────── 280 px ────────────────────────────┐
│  ← Mon abonnement                           (fil existant)     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  ┌────────┐                                              │  │  chip aplat Wave
│  │  │ Wave   │  Paiement Wave          h2 --font-display    │  │  #1DC8FF / #1A1714
│  │  └────────┘                                              │  │  9,14:1 ✅
│  │  [      Payer avec Wave        ]   .btn.terra.block      │  │  48 px de haut
│  │  Vous allez quitter ReVendsen pour régler votre           │  │  --text-secondary
│  │  abonnement sur Wave. L'activation intervient après       │  │  13 px / 1.5
│  │  confirmation du paiement.                                │  │
│  │  ──────────────────────────────────────────────────────   │  │  --line
│  │  Ou payer depuis un lien Wave                             │  │  --fs-body-s / 700
│  │  Découverte — 2 000 FCFA                          ↗      │  │  44 px de haut
│  │  Boutique   — 5 000 FCFA                          ↗      │  │  lien externe
│  │  Atelier    — 10 000 FCFA                         ↗      │  │  target=_blank
│  │  Ces liens sont un repli manuel : saisissez ensuite la    │  │  --text-tertiary
│  │  référence dans le formulaire ci-dessous.                 │  │
│  └──────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

**Libellés exacts (copier-coller)** :

| Emplacement | Texte |
|---|---|
| Chip | `Wave` |
| Titre de section (h2) | `Paiement Wave` |
| Bouton (mode `session`, repos) | `Payer avec Wave` |
| Bouton (en cours d'ouverture) | `Ouverture de Wave…` |
| Description sous le bouton | `Vous allez quitter ReVendsen pour régler votre abonnement sur Wave. L'activation intervient après confirmation du paiement.` |
| Sous-titre repli | `Ou payer depuis un lien Wave` |
| Liens (configuration statique, affichage seul) | `Découverte — 2 000 FCFA` · `Boutique — 5 000 FCFA` · `Atelier — 10 000 FCFA` |
| Note repli | `Ces liens sont un repli manuel : saisissez ensuite la référence dans le formulaire ci-dessous.` |
| Mode `liens-seuls`, note dédiée | `Après votre paiement, utilisez le formulaire ci-dessous pour indiquer la référence. L'administration vérifiera avant d'ouvrir votre boutique.` |
| Erreur de création de session | `Impossible d'ouvrir Wave pour le moment. Le paiement manuel reste disponible ci-dessous.` |

**URLs des 3 liens (configuration statique fournie par l'utilisateur, jamais calculée)** : `https://pay.wave.com/m/M_sn_nLXzUBh809Au/c/sn/?amount=2000` · `…?amount=5000` · `…?amount=10000`. Elles sont stockées dans une constante de configuration front **d'affichage uniquement** (`WAVE_HOSTED_LINKS`) : aucun montant n'en est extrait pour créer ou valider une session (CA-V9-011/017), aucun clic ne déclenche de requête (CA-V9-003). Libellé « Wave » en texte : **aucun logo, aucun sprite, aucune image Wave** (aucune source validée).

**États & variantes** :

| État | Spécification |
|---|---|
| Repos | Bouton bordeaux `--accent`, texte `--on-accent` (10,38 clair / 7,55 sombre), rayon `--r-md`, hauteur **48 px** mobile / 44 px desktop, largeur 100 % sous 480 px. |
| Hover | `--accent-hover`, ombre `--shadow-cta` existante, translation `translateY(-1px)` sur `--t-fast`. |
| Press | `scale(.98)`, `--t-fast`, `--ease` ; pas de halo coloré. |
| Focus | `--focus` 2 px + offset 3 px (inchangé) ; `outline:none` interdit sans remplacement. |
| Chargement | `aria-busy="true"`, libellé `Ouverture de Wave…`, bouton `disabled`, **aucun spinner de paiement** ; le reste du panneau reste lisible. |
| Erreur | `Notice tone="danger"` avec le texte exact ci-dessus ; formulaire manuel et 3 liens restent cliquables. |
| Désactivé (prod) | Bouton **non rendu** dans le DOM (pas de `disabled` « grisé » — CA-V9-002 vérifie son absence) ; aucun attribut `data-wave` révélateur. |
| Navigation | `window.location.assign(waveLaunchUrl)` ou `<a href>` natif ; `rel="noopener"` pour les 3 liens externes ; **jamais** d'iframe. |

### 3.2 E2 — Panneau PENDING avec libellé Wave

Le composant existant `SubscriptionStatusPanel.tsx` garde son `<h1>` `Votre boutique est en attente d’activation` (`:41`), son récap (`:45-62`), son `aria-live="polite"` (`:33`) et son mapping `STATUS_BADGE` (`:18-22`) **tels quels**. Une branche conditionnelle est ajoutée **avant** le `if (subscription.status === 'PENDING')` existant (`:31`), sans toucher au libellé `En attente d'activation` de `:19` :

```
Condition : subscription.status === 'PENDING' && subscription.wavePaymentPending === true
```

| Élément | Spécification |
|---|---|
| Chip | `Wave` (aplat `--color-wave`, texte `--color-on-wave`, 9,14:1) |
| Badge de statut | `StatusBadge kind="pending" dot` avec libellé exact **« Wave — en attente de confirmation du paiement »** (pastille + texte + mot : 3 indices, WCAG 1.4.1) |
| Paragraphe ajouté | `Votre paiement Wave est en cours de vérification. Vous pouvez fermer cette page : votre boutique s'ouvrira dès que Wave confirmera le paiement.` |
| Récap | Inchangé (forfait, quotité, adresse, demandé le) — aucune référence de paiement, aucun `client_reference`, aucun ID de session |
| Liens | `Retour au catalogue` existant (`:36-38`) conservé ; **aucun** lien « Voir ma boutique » (404 tant que PENDING) |
| OM / virement / legacy | `wavePaymentPending` absent ou `false` ⇒ **aucun changement visuel**, texte `:19` et `:41-44` strictement identiques |
| Après webhook valide | `/me` renvoie `ACTIVE` : le composant existant retourne `null` (`:27`) et la page ACTIVE déjà livrée prend le relais ; `aria-live` annonce la bascule, sans toast « marketing » |

**Proscrit ici** : barre de progression, chrono, « temps estimé », pastille clignotante, phrase « Paiement reçu », statut `ACTIVE` affiché avant webhook.

**Maquette 280 px (différence seule, le reste du panneau V7 est inchangé)** :

```
┌──────────────────────────── 280 px ────────────────────────────┐
│  ┌────────┐  ┌──────────────────────────────────────────────┐ │
│  │ Wave   │  │ ●  Wave — en attente de confirmation du       │ │
│  └────────┘  │      paiement                                 │ │
│              └──────────────────────────────────────────────┘ │
│  Votre boutique est en attente d’activation      (h1 inchangé)│
│  Votre paiement Wave est en cours de vérification. Vous       │
│  pouvez fermer cette page : votre boutique s'ouvrira dès que  │
│  Wave confirmera le paiement.                                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ Forfait       Découverte — 2 000 FCFA / mois   (API)     │ │
│  │ Quotité       10 annonces de boutique                    │ │
│  └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### 3.3 E3 — `/paiement-wave/succes`

Nouvelle route SPA ajoutée après `App.tsx:129`, dans le `SiteShell`, gardée par `RequireUser` comme `/mon-abonnement`. **Aucun paramètre de requête** : ni `id`, ni `reference`, ni `session`, ni `amount` ; l'URL est exactement `/paiement-wave/succes`.

| Bloc | Spécification / libellé exact |
|---|---|
| Fil | `Mon abonnement` (existant) |
| Eyebrow | `Paiement Wave` |
| h1 | `Retour de Wave` |
| Badge | `Wave — en attente de confirmation du paiement` (même libellé que E2) |
| Message | `Votre paiement est en attente de confirmation de la part de Wave. Votre abonnement reste en attente : il sera activé automatiquement dès que le paiement sera confirmé.` |
| Notice info | `Vous pouvez fermer cette page. Aucune action de votre part n'est nécessaire pour l'activation.` |
| Action primaire | `Voir mon abonnement` → `/mon-abonnement` |
| Action secondaire | `Retour au catalogue` → `/shop` |
| Si `/me` répond `ACTIVE` | Message remplacé par `Votre abonnement est à jour. Retrouvez votre boutique depuis « Mon abonnement ».` — **aucune mention de paiement reçu**, aucune date inventée |
| Chargement | `HeartLoader size="sm"` avec `Vérification de votre abonnement…` ; `aria-live="polite"` |
| Erreur `/me` | `SiteEmpty role="alert"` + bouton `Réessayer` ; aucun appel d'activation |
| Abonnement `null` | `Aucun abonnement en cours.` + `Voir mon abonnement` |

**Interdictions E3** : aucune écriture serveur au montage (0 POST hors `/me`), aucun paramètre lu dans l'URL, aucun « Paiement reçu », aucun `ACTIVE` avant webhook valide, aucun confetti, aucune redirection automatique vers une page d'activation.

### 3.4 E4 — `/paiement-wave/echec`

Nouvelle route SPA ajoutée juste après E3, même coquille, même garde, **aucun paramètre de requête**.

| Bloc | Spécification / libellé exact |
|---|---|
| h1 | `Le paiement Wave n’a pas abouti` |
| Chip | `Wave` |
| Notice danger (`role="alert"`) | `Wave n’a pas confirmé ce paiement. Votre abonnement reste en attente et aucune activation n’a été effectuée.` — **ne jamais affirmer qu'aucun montant n'a été débité** (seul Wave le sait) |
| Sous-titre | `Choisissez votre repli` |
| Action primaire | `Voir le paiement manuel` → `/mon-abonnement` |
| Action secondaire | `Retour au catalogue` → `/shop` |
| 3 liens hébergés | Réutilisés en mode `liens-seuls` (mêmes libellés que E1), plus le texte : `Si vous avez utilisé un lien Wave, indiquez ensuite sa référence dans le formulaire manuel.` |
| Support | `Si le montant a été débité, écrivez à revendsen@gmail.com en précisant la référence de votre paiement.` |
| Chargement / erreur / vide | Identiques à E3 (HeartLoader / SiteEmpty / message neutre) |
| Écriture | **Aucune** : ni activation, ni notification, ni `POST` au montage |

### 3.5 E5 — Vue admin `/admin/abonnements`

Une **seule colonne additive**, insérée après la colonne `Paiement` (`Abonnements.tsx:222-232`) et avant `Demande` (`:234`), alimentée par `GET /api/wave/admin/events` (jointure client-side par `subscriptionId`, `requireAdmin`).

| Élément | Spécification |
|---|---|
| En-tête de colonne | `Paiement Wave` |
| Chip | `Wave` (même aplat que le public ; `.market-admin` hérite de `--color-wave`) |
| Statut `en attente` | `StatusBadge kind="pending" dot` + `En attente` |
| Statut `confirmé` | `StatusBadge kind="approved" dot` + `Confirmé` |
| Statut `échoué` | `StatusBadge kind="rejected" dot` + `Échoué` |
| Aucun événement | `StatusBadge kind="neutral"` + `—` (jamais « erreur », jamais de case vide muette) |
| Trace (si confirmé) | `Activé par l’admin #7` — cohérent avec `activatedByLabel()` (`:186-187`) ; jamais un nom d'admin inventé |
| Données interdites | Aucun `client_reference`, aucun `event.id`, aucun `sessionId`, aucun `rawBody`, aucune signature, aucun secret ; la référence du paiement V8 existante reste masquée selon la note `:466-470` |
| Chargement | Cellule `—`, `aria-busy="true"` sur le `tabpanel` existant (`:476`) ; aucune ligne remplacée par un squelette |
| Erreur API Wave | `Indisponible` dans la cellule + toast `Réessayer` ; **les colonnes V8 restent utilisables** |
| Responsive | Table défilante `overflow-x:auto` sous 768 px (pattern V7 §7) ; **aucune carte-transit**, aucun changement de `AdminTable` |

**Intouchable** : onglets `En attente` / `Tous` (`:397-464`), colonnes V8, actions `Activer` / `Refuser` / `Désactiver` / `Supprimer définitivement`, banniers de confirmation, `AdminPageHeader` (`:353-361`) et cartes « Activations récentes » (`:501-527`). Aucune donnée Wave n'est exposée sur une page publique.

### 3.6 Micro-interactions — au service du statut, jamais du succès

| Moment | Courbe / durée | Déclencheur | Règle |
|---|---|---|---|
| Entrée du chip Wave | `fade-rise` existant, `--t` (240 ms), `--ease` | Montage du panneau | Une seule fois, aucun rebond |
| Lignes du récap E2 | `data-stagger="0..3"` existants (`index.css:268-280`), 50 ms par ligne | Montage du panneau | Cascade **max 4 lignes**, plafonnée à 200 ms |
| Pastille de statut PENDING Wave | pulsation douce `opacity 1 → .55 → 1`, **2,4 s**, `--ease` | Uniquement `status==='PENDING' && wavePaymentPending` | **S'arrête** dès que `/me` indique `ACTIVE` ; aucune explosion, aucun check animé |
| Bouton `Payer avec Wave` | hover `--accent-hover` + `--shadow-cta` / press `scale(.98)` `--t-fast` / focus `--focus` | Interaction clavier ou pointeur | Aucune animation « paiement en cours » après le clic : navigation immédiate |
| Bascule de statut en cours de session | `aria-live="polite"` déjà porté par le panneau (`:33`) | `/me` rafraîchi | Phrase simple, **aucun rechargement forcé**, aucune alarme sonore |
| Retours haptiques | Aucun | — | Cible web uniquement ; pas de API haptique, pas de mobile natif |
| `prefers-reduced-motion: reduce` | Toutes les animations ci-dessus neutralisées par la règle globale (`index.css:437-450`) | Préférence OS | Pastille statique, pas de stagger, transitions instantanées ; le texte reste identique |

> **Ligne rouge** : aucune animation ne peut suggérer un paiement réussi avant réception du webhook signé. Le moment de joie (la boutique qui s'ouvre) appartient au statut `ACTIVE` réel, pas au retour navigateur.

---

## 4. Table unique des textes, états et critères

| # | Écran | Condition / état | Libellé exact attendu | Contrôle visuel | CA-V9 |
|---|---|---|---|---|---|
| T01 | E1 | Production, `waveEnabled:false` | *(aucun bouton Wave automatique dans le DOM)* | `grep` DOM = 0 ; formulaire + 3 liens présents | 001, 002, 074 |
| T02 | E1 | `waveEnabled:true`, non éligible | `Ou payer depuis un lien Wave` | Chip + 3 liens, aucun bouton | 015, 060 |
| T03 | E1 | Éligible, repos | `Payer avec Wave` | CTA bordeaux, 48 px, focus `--focus` | 010, 014, 020 |
| T04 | E1 | Clic CTA | `Ouverture de Wave…` | `aria-busy`, navigation top-level, 0 iframe | 020, 024 |
| T05 | E1 | Erreur API session | `Impossible d'ouvrir Wave pour le moment. Le paiement manuel reste disponible ci-dessous.` | `Notice danger`, repli intact | 016 |
| T06 | E1 | 3 liens, clic quelconque | `Découverte — 2 000 FCFA` · `Boutique — 5 000 FCFA` · `Atelier — 10 000 FCFA` | 0 session API, 0 activation | 003, 011, 065 |
| T07 | E1 | Repli avec souscription | `Après votre paiement, utilisez le formulaire ci-dessous pour indiquer la référence. L'administration vérifiera avant d'ouvrir votre boutique.` | Formulaire existant inchangé | 060, 062 |
| T08 | E2 | `PENDING && wavePaymentPending` | **Wave — en attente de confirmation du paiement** | Chip + badge dot + `aria-live` | 019, 022 |
| T09 | E2 | `PENDING`, OM/virement/legacy | `En attente d'activation` (**existant, inchangé**) | Aucun chip Wave, aucun mot « Wave » ajouté | 019, 061 |
| T10 | E2 | Après webhook valide | *(retour au rendu ACTIVE existant)* | 0 texte de paiement, annonce polite | 040, 043 |
| T11 | E3 | Visite sans webhook | `Votre paiement est en attente de confirmation de la part de Wave. Votre abonnement reste en attente : il sera activé automatiquement dès que le paiement sera confirmé.` | `PENDING`, 0 écriture, 0 query | 021, 022, 053 |
| T12 | E3 | `/me` → `ACTIVE` | `Votre abonnement est à jour. Retrouvez votre boutique depuis « Mon abonnement ».` | Aucun « Paiement reçu » | 021, 040 |
| T13 | E3 | Chargement | `Vérification de votre abonnement…` | `HeartLoader sm`, `aria-live` | 022 |
| T14 | E4 | Retour `error_url` | `Le paiement Wave n’a pas abouti` | `PENDING`, 0 activation | 023, 037 |
| T15 | E4 | Notice d'échec | `Wave n’a pas confirmé ce paiement. Votre abonnement reste en attente et aucune activation n’a été effectuée.` | `role="alert"`, pas d'allégation de non-débit | 023, 037 |
| T16 | E4 | Repli visible | `Voir le paiement manuel` + 3 liens + `Si le montant a été débité, écrivez à revendsen@gmail.com en précisant la référence de votre paiement.` | Contact unique, aucun `tel:`/`mailto:` autre | 023, 064 |
| T17 | E5 | Événement en attente | `Paiement Wave` · `Wave` · `En attente` | Colonne additive, table V8 intacte | 051 |
| T18 | E5 | Événement confirmé | `Confirmé` · `Activé par l’admin #7` | Pas de `client_reference` à l'écran | 004, 050, 052 |
| T19 | E5 | Événement échoué / absent | `Échoué` · `—` | Aucune colonne supprimée | 051 |
| T20 | Toutes | Grille 280→375 px | *(aucun texte tronqué, aucun scroll horizontal)* | `scrollWidth <= viewport` | 064 (V7), 073 |

---

## 5. Système de composants

### 5.1 Réutilisés tels quels (aucune ligne modifiée)

| Composant / classe | Fichier réel | Rôle V9 |
|---|---|---|
| `SiteShell` / `Crumb` / `.rv-shop-panel` / `.rv-shop-recap` | `components/layout/*`, `components/site/SiteBits.tsx`, styles V7 | Coquille des 4 écrans publics ; mêmes cartes et même fil d'Ariane |
| `SubscriptionStatusPanel` | `components/storefront/SubscriptionStatusPanel.tsx:24-64` | E2 : **une branche ajoutée**, reste inchangé pour OM/virement/legacy |
| `PaymentReferenceFields` | `components/storefront/PaymentReferenceFields.tsx:33-94` | Repli manuel : **0 ligne modifiée** (options et placeholder conservés) |
| `StatusBadge` | `components/ui/StatusBadge.tsx:13-43` | Chip de statut admin, **aucun `kind` nouveau** ; `dot` forcé pour les états Wave |
| `Notice` | `components/ui/Notice.tsx:13-31` | Erreurs E1, notices E3/E4 (`role="status"`) ; danger E4 via `role="alert"` explicite |
| `HeartLoader` | `components/ui/HeartLoader.tsx:14-25` | Chargement des 3 nouveaux écrans publics — **jamais `PageLoader`** |
| `SiteEmpty` | `components/site/SiteBits.tsx` | Erreurs / données absentes des pages retour |
| `.btn.terra.block` | `styles/bureau.css` (consommé dans `MonAbonnement.tsx:342`) | CTA Wave : même bouton que « Soumettre ma demande » |
| `AdminTable` / `AdminColumn` / `Button` / `DashboardLayout` / `adminMenu` | `components/admin/*`, `components/ui/Button.tsx`, `lib/menus.ts` | E5 : 1 colonne, aucun changement de table ni de menu |
| `toast()` | `lib/toast.tsx` | Succès/erreur uniques (`aria-live` déjà géré) |
| `[data-stagger]` / `fade-rise` / `prefers-reduced-motion` | `index.css:268-280, 135-150, 437-450` | Micro-interactions sans nouvelle keyframe |
| `--color-wave` / `--color-on-wave` | `index.css:70-151` (1 déclaration) | Seuls nouveaux tokens du document |

### 5.2 Nouveaux (fichiers nouveaux uniquement)

| Nouveau fichier | Props / contenu | Notes d'implémentation |
|---|---|---|
| `web/src/components/storefront/WaveCheckoutPanel.tsx` | `{ waveEnabled: boolean, subscription: Subscription \| null, plans: SubscriptionPlan[] }` | 3 modes (§3.1) ; 3 liens depuis `WAVE_HOSTED_LINKS` ; `waveLaunchUrl` envoyé à `window.location.assign` ; aucun secret, aucun montant calculé |
| `web/src/pages/WaveSucces.tsx` | Aucune | E3 ; 0 query lue, 0 écriture, `/me` en lecture seule |
| `web/src/pages/WaveEchec.tsx` | Aucune | E4 ; réutilise `WaveCheckoutPanel` en mode `liens-seuls` |
| `web/src/lib/waveHostedLinks.ts` | `WAVE_HOSTED_LINKS` (3 URLs statiques + libellés) | Configuration d'**affichage** uniquement ; jamais utilisée pour tarifer ou valider (CA-V9-017) |

Aucun nouveau composant admin : la colonne E5 est une cellule additive dans `Abonnements.tsx` (aucun fichier admin nouveau). Aucun logo Wave, aucun sprite, aucune illustration.

### 5.3 Composants / comportements proscrits

- ❌ Bouton Wave bleu plein avec texte blanc (1,95:1 — échec AA) ; ≫ CTA principal remplacé par du cyan.
- ❌ Filet ou texte cyan sur fond clair (1,86:1 — échec 1.4.11) : le chip reste un aplat avec texte sombre.
- ❌ `Countdown`, `Timer`, `PaymentProgress`, confetti, check animé avant webhook.
- ❌ `iframe`, `webview`, `InAppBrowser`, modale hébergeant `pay.wave.com`.
- ❌ Nouveau `StatusBadgeKind`, nouveau spinner, `PageLoader`.
- ❌ Prix codé en dur comme logique ; champ `amount` lu depuis un formulaire ou une URL.
- ❌ Texte « Paiement reçu » ou statut `ACTIVE` sur les pages retour.
- ❌ Logo Wave embarqué sans source validée.

### 5.4 Matrice d'états des contrôles

| Contrôle | Repos | Hover | Press | Focus | Disabled / absent |
|---|---|---|---|---|---|
| CTA `Payer avec Wave` | `--accent` + `--on-accent`, `--shadow-cta` | `--accent-hover`, `translateY(-1px)`, `--t-fast` | `scale(.98)` | `--focus` 2 px / offset 3 | **Non rendu** si `waveEnabled:false` ; `disabled` + `aria-busy` pendant la création |
| Liens 3 forfaits | `--accent-text` souligné au survol | `--accent-hover` + soulignement | pas d'enfoncement | `--focus` 2 px / offset 3 | Toujours actifs (repli) |
| Chip Wave | Fond `--color-wave`, texte `--color-on-wave` | Aucun changement | Aucun | Non focusable (information, pas une action) | Remplacé par `—` en admin si aucun événement |
| Badge statut admin | Token du `kind` existant + `dot` | Aucun | Aucun | Non focusable | `neutral` + `—` |
| Lien `Voir mon abonnement` | `--accent-text` | Souligné | — | `--focus` | — |

---

## 6. Pièges UX et recette

### 6.1 Les 10 pièges à neutraliser

| # | Piège | Conséquence si non traité | Mitigation visuelle / UX | CA-V9 |
|---|---|---|---|---|
| 1 | Retour navigateur pris pour un paiement | Abonnement activé sans argent | E3 = 0 écriture, libellé d'attente, `/me` seul | 021, 022 |
| 2 | `waveEnabled:true` pris pour une preuve | Bouton ou badge « payé » avant webhook | Booléen pilote **uniquement** l'affichage du bouton | 002, 021 |
| 3 | 3 liens hébergés branchés sur l'auto | Activation sur montant modifiable, sans corrélation | Liens = repli manuel, 0 requête au clic | 003, 060, 065 |
| 4 | Libellé neutre appliqué à Wave | Vendeur ne comprend pas l'attente spécifique | Branche conditionnelle E2, texte exact | 019, 022 |
| 5 | Libellé Wave appliqué à OM/virement | Fausse information, contrat V8 cassé | `wavePaymentPending` strict, sinon texte `:19` inchangé | 019, 061 |
| 6 | Cyan utilisé comme CTA ou filet sur clair | Contraste 1,86–1,95:1 → illisible | Chip aplat + texte sombre 9,14:1 ; CTA bordeaux | — (AA) |
| 7 | Animation de succès au retour | Promesse fausse avant webhook | Pastille d'attente seulement ; joie au `ACTIVE` réel | 021 |
| 8 | `client_reference` / signature affichés en admin | Fuite de données de paiement | Colonne E5 = statut + `#7` uniquement | 052 |
| 9 | Nouvelle colonne casse la table admin | Régression V8.5 | 1 colonne additive, `AdminTable` et actions intacts | 051, 054, 073 |
| 10 | Champ prix déduit des URLs de repli | Tarification front, dérive des 3 prix | `WAVE_HOSTED_LINKS` affichage seul ; plans par l'API | 011, 017, 064 |

### 6.2 Recette visuelle et UX (binaire, à exécuter par `@tester`)

| # | Vérification | Preuve attendue | CA-V9 |
|---|---|---|---|
| R1 | `waveEnabled:false` en prod | DOM de `/mon-abonnement` : **0** bouton « Payer avec Wave » ; formulaire + 3 liens présents (screenshot + `grep` DOM) | 002, 074 |
| R2 | Clic sur chaque lien hébergé | 0 appel `POST /api/wave/checkout/sessions`, 0 webhook, `COUNT(ACTIVE)` inchangé | 003, 065 |
| R3 | Bouton en mode éligible | 1 clic = 1 navigation navigateur vers `pay.wave.com` ; `grep` iframe/webview = 0 | 020, 024 |
| R4 | Visite `/paiement-wave/succes` sans webhook | `PENDING`, champs d'activation NULL, 0 e-mail, 0 badge, boutique 404 ; aucun query dans l'URL | 021, 022 |
| R5 | Visite `/paiement-wave/echec` | Message exact T14/T15, 3 liens visibles, 0 activation | 023, 037 |
| R6 | Bascule après webhook valide | E2 disparaît au profit du rendu ACTIVE existant, annoncé par `aria-live`, sans rechargement | 040, 043 |
| R7 | Libellés OM / virement | `En attente d'activation` mot pour mot, aucun chip Wave | 019, 061 |
| R8 | Admin | Colonne `Paiement Wave` présente ; `Activé par l’admin #7` ; 0 `client_reference`/signature à l'écran ; onglets et refus V8.2 inchangés | 004, 050, 051, 052, 054 |
| R9 | Grille responsive | Pas de scroll horizontal à **280 / 320 / 360 / 375 px** sur les 5 écrans ; `scrollWidth <= viewport` ; chips et boutons non tronqués | 073 (et V7-064) |
| R10 | Contrastes | `--color-on-wave` sur `--color-wave` = **9,14:1** ; `--focus` clair 9,87:1 / sombre 12,00:1 ; 0 texte blanc sur cyan | AA / 1.4.11 |
| R11 | Clavier & tactile | Tab order : skipping → chip → CTA → 3 liens → formulaire ; cibles ≥ **44 px** ; focus visible partout ; `Enter`/`Espace` sur le CTA | P8 |
| R12 | Mouvement réduit | Avec `prefers-reduced-motion: reduce` : pastille statique, pas de stagger, libellés identiques | P8 |
| R13 | Conventions de contenu | Contact unique `revendsen@gmail.com` ; numéros `+221 7XXXXXXXX` ; prix 2 000 / 5 000 / 10 000 ; **0** occurrence du mot proscrit (`grep -rni 'r[an]ga' docs web server`) ; 0 ligne sur Gmail, Whapi, `REDIS_URL` | 063, 064 |
| R14 | Non-régression | 63/63 storefront, 273/273 web, builds et audits verts ; `git diff` = 0 ligne sur pipeline V6.4 | 073, 074 |

---

## 7. Risques design / UX

| ID | Risque | Niveau | Mitigation | Propriétaire |
|---|---|---|---|---|
| R-V9-D1 | Le vendeur croit que le retour Wave = paiement reçu | 🔴 Critique | Libellé d'attente exact E2/E3, 0 écriture, 0 animation de succès | `@design` + `@frontend` |
| R-V9-D2 | Cyan lu comme nouveau CTA de marque ou illisible en clair | ⚠️ Important | Token unique, chip aplat + texte sombre 9,14:1, CTA bordeaux inchangé (§1.1) | `@design` |
| R-V9-D3 | Bouton rendu avec `waveEnabled:false` → fail-closed violé | 🔴 Critique | Non-rendu (pas de `disabled`) ; contrôle R1 | `@frontend` + `@tester` |
| R-V9-D4 | Fuite du libellé Wave vers OM/virement | ⚠️ Important | Champ booléen explicite `wavePaymentPending`, branche strictement conditionnelle | `@frontend` |
| R-V9-D5 | Débordement à 280 px (libellé long du badge + chip) | ⚠️ Important | Badge sur 2 lignes autorisé, `min-width:0`, `white-space:normal` sur le libellé long ; `scrollWidth` mesuré à 4 largeurs | `@design` + `@frontend` |
| R-V9-D6 | La colonne admin modifie malencontreusement les actions V8 | ⚠️ Important | Cellule additive après `Paiement`, `AdminTable` et `columns` existants non réécrits ; recette R8 | `@frontend` + `@tester` |
| R-V9-D7 | Le support affiche un montant débité non confirmé | ⚠️ Important | E4 ne jamais affirmer l'absence de débit ; renvoi vers `revendsen@gmail.com` avec la référence | `@design` |
| R-V9-D8 | Animation perçue comme une confirmation | ⚠️ Important | Pastille d'attente uniquement, arrêt au `ACTIVE` réel, `prefers-reduced-motion` appliqué | `@design` |
| R-V9-D9 | Migration `023` absente en prod → colonne admin vide | INFO | `—` neutre et toast `Réessayer`, sans bloquer les colonnes V8 ; bascule et migration hors V9 | `@deploy-ops` |

---

## 8. Définition de fait — DoD binaire

| # | Critère | Preuve | État |
|---|---|---|---|
| D1 | 8 sections minimum, numérotées §1→§8 | Sommaire du fichier | ✅ |
| D2 | Exactement 5 écrans/états spécifiés | §2.1 (E1..E5), aucun 6e écran | ✅ |
| D3 | Principes ancrés sur des `fichier:ligne` réels | §1 (P1..P9) + §1.1/1.2 | ✅ |
| D4 | Libellés exacts copier-coller + états | §3.1, §3.2, §3.3, §3.4, §3.5 + §4 (T01..T20) | ✅ |
| D5 | Matrice textes/états avec `CA-V9` | §4 (20 lignes) | ✅ |
| D6 | Composants réutilisés / nouveaux | §5.1, §5.2, §5.3, §5.4 | ✅ |
| D7 | Pièges UX + recette + risques | §6.1, §6.2 (R1..R14), §7 (D1..D9) | ✅ |
| D8 | Grille 280/320/360/375, AA, focus, clavier, touch ≥ 44 px, reduced-motion, 0 débordement | §1.1, §1.2, §3.6, §6.2 (R9..R12) | ✅ |
| D9 | Additivité : 1 token unique, 0 restylage, 0 secret, 0 logo Wave, 0 iframe | §1 (P1/P3/P6), §1.1, §5.3 | ✅ |
| D10 | French, version/date/auteur/statut en en-tête | En-tête du fichier | ✅ |
| D11 | Un seul fichier créé, aucun autre document modifié | `git status --short` ci-dessous | ✅ |
| D12 | Auto-revue effectuée (cohérence des tokens, contrastes, 5 écrans, interdits) | §8 note d'auto-revue ci-dessous | ✅ |

**Commandes exécutées et résultats** (branche `fix/v6-on-799a7ab`) :

```text
$ wc -l docs/design-v9-wave-checkout.md
485 docs/design-v9-wave-checkout.md

$ git status --short
 M docs/journal.md
?? docs/architecture-v9-wave-checkout.md
?? docs/cahier-des-charges-v9-wave-checkout.md
?? docs/design-v9-wave-checkout.md
```

> Lecture du `git status` : **un seul fichier créé** par ce livrable (`?? docs/design-v9-wave-checkout.md`). Les 3 autres entrées (`M docs/journal.md`, les 2 `??` d'architecture et de cahier) sont **préexistantes et inchangées** — preuve par empreintes ci-dessous. Aucun code, aucun commit, aucun secret.

**Empreintes des 3 fichiers préexistants — avant / après (doivent être identiques)** :

```text
docs/journal.md                            d5429f9f05e2f29156a06a7b9e4c80e1b8513e6d58d286d28428ec5be4e763ff  →  d5429f9f05e2f29156a06a7b9e4c80e1b8513e6d58d286d28428ec5be4e763ff  ✅ identique
docs/architecture-v9-wave-checkout.md      52170472b7dffa54868cec3c18e5dff79b60831fb618c3ac6be87bc8614523bb  →  52170472b7dffa54868cec3c18e5dff79b60831fb618c3ac6be87bc8614523bb  ✅ identique
docs/cahier-des-charges-v9-wave-checkout.md c6de577c89dd6c05111b1102edcecbb15b5a8439bc28e818b672ec61f9b8ce89  →  c6de577c89dd6c05111b1102edcecbb15b5a8439bc28e818b672ec61f9b8ce89  ✅ identique
```

**Auto-revue** : relecture intégrale du document après rédaction — (a) chaque couleur, type, espacement, rayon, ombre et durée utilisé est déclaré en §1.1/§1.2 ou réutilisé d'un composant cité en §5.1 : **0 valeur plaquée** hors token Wave unique ; (b) contrastes Wave recalculés sur les valeurs réelles : le cyan est **interdit** comme filet/texte sur fond clair (1,86:1) et réservé à l'aplat avec texte `#1A1714` (9,14:1) — aucun CTA bleu ; (c) 5 écrans couverts, aucun 6e ; (d) 0 prix « 1 000 » : le seul résultat de `grep -n '1000'` est la **sous-chaîne de `?amount=10000`** (URL exacte du lien Atelier 10 000 FCFA, §3.1) — aucun montant erroné n'est affiché ni utilisé ; 0 occurrence du mot proscrit (`grep` = 0), contact unique, 0 secret, 0 iframe/webview mis en œuvre (11 mentions sont des **interdictions**) ; (e) le libellé neutre `En attente d'activation` est explicitement préservé pour OM/virement/legacy ; (f) portée de preuve limitée au document : les 55 `CA-V9` restent à valider par `@tester` sur le code. Commandes d'auto-revue exécutées : `grep -c '^## '` = **8** sections ; `grep -o '\*\*E[1-5]\*\*' | sort -u` = **E1 E2 E3 E4 E5** ; `grep -c -- '--color-wave:'` = **1** déclaration ; `grep -rni 'r[an]ga' <fichier>` = **0**.

**VERDICT : DONE** — direction visuelle V9 complète, additive, sourcée et directement implémentable par `@frontend`. Statut **proposé** : passage à l'implémentation **sous réserve de validation du chef de projet**. La production reste en `WAVE_ENABLED=false` ; aucune bascule Wave n'est incluse dans V9.
