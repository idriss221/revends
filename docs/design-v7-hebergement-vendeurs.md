# Design V7 — « Hébergement des vendeurs » : direction visuelle & parcours UX

| | |
|---|---|
| **Projet** | ReVends — marketplace de revente d'articles d'occasion (Sénégal, cf. PO-V7-07) · **ReVendsen** |
| **Version document** | 1.1 — **17/11/2026** |
| **Journal des arbitrages** | **v1.1 — 17/11/2026** : intégration des deux arbitrages du chef de projet — **R-V7-D1 clos** (`memberSince` **déjà exposé** par la vue publique `PublicUser` : `id`, `displayName`, `memberSince`, `sales` — la boutique affiche « Membre depuis `<année>` » ; **aucun ajout au sérialiseur**) et **R-V7-D2 clos** (la boutique rend le **même skin** que le reste du site public : les tokens existants du scope `.market-site` — « Blanc Ivoire » clair dominant / « Bordeaux Nuit » clair/sombre, accent bordeaux `#7A1B2E`, surfaces `#FBF9F5`, texte `#1A1714`, typo « TOKENS REVENDS » de `docs/design-system.md`). La palette crème/terracotta mail est purgée de ce document (e-mails uniquement). |
| **Auteur** | Agent `@design` (Inkling 2 Small Free), sur instruction du chef de projet et de l'utilisateur |
| **Statut** | **Soumis à validation** — spécification visuelle et interaction. Aucune ligne de code écrite, aucun écran implémenté |
| **Nature** | **Design additif** : il spécifie les 3 nouveaux écrans V7 uniquement. **Aucune page existante n'est refondue, aucun composant existant n'est modifié** |
| **Cible** | Web (React + Vite, `revends/web`). Aucune cible mobile native |
| **Langue** | Français. Voix ReVendsen : sobre, concrète, jamais exclamative — **« La seconde vie a de la valeur. »** |
| **Références amont** | `docs/cahier-des-charges-v7-hebergement-vendeurs.md` (45 critères) · `docs/architecture-v7-hebergement-vendeurs.md` (8 routes, 3 tables) · `docs/api-v7-hebergement-vendeurs.md` · `docs/design-system.md` · `docs/journal.md` (17/11/2026) |
| **Références réelles lues le 17/11/2026** | `web/src/styles/bureau.css` (jetons forme/mouvement, `.market-site`) · `web/src/styles/tokens.css` (**source unique de couleur `.market-site`**) · `docs/design-system.md` (§ « TOKENS REVENDS — SOURCE UNIQUE DE VRAI ») · `web/src/index.css` (`@theme static` REVENDS 2026, bloc RE-SKIN `.market-site` — non édité) · `web/src/components/site/{SiteCard,SiteBits,SiteImage}.tsx` · `web/src/components/ui/{HeartLoader,Loading,Notice,StatusBadge,States}.tsx` · `web/src/lib/{toast.tsx,menus.ts,format.ts}` |

---

## 0. Avertissement additif-only (non négociable)

> **Ce document ne refonde AUCUNE page existante.** Il spécifie 3 écrans nouveaux et des composants nouveaux, posés *à côté* de l'existant. Les règles ci-dessous sont des verrous, pas des préférences.

1. **Zéro modification des pages existantes.** `/`, `/shop`, `/catalogue/:slug`, `/vendre`, `/mes-articles`, `/panier`, `/commande`, `/profil`, `/login`, `/register`, le catalogue, la fiche produit, le checkout, l'admin existant : **aucune ligne, aucun libellé, aucun token, aucun comportement** n'est changé.
2. **Nouvelle charte interdite.** Les écrans V7 consomment **exclusivement** les jetons déjà déclarés (§0.1) et les composants déjà en production. Aucune couleur, aucune fonte, aucun rayon, aucune ombre nouvelle n'est introduite par ce document.
3. **Réutilisation prioritaire, création minimale.** Chaque besoin est d'abord servi par un composant existant (cartes catalogue `SiteCard`, `SiteEmpty`, `HeartLoader`, `.btn`, Notice, Toast, StatusBadge, Modal, DashboardLayout, sprite `Ico`, Font Awesome côté admin). Les composants nouveaux sont listés en §5 et uniquement dans `components/storefront/**` (nouveaux fichiers).
4. **`HeartLoader` reste l'état de chargement des nouveaux écrans.** Aucun spinner anonyme n'est introduit. `PageLoader` (spinner) **n'est pas utilisé** sur les écrans V7.
5. **Erreurs humaines, jamais techniques.** Aucun code d'erreur (`STOREFRONT_QUOTA_EXCEEDED`, `403`, `500`…) n'est jamais affiché à l'utilisateur. Chaque erreur API est traduite en phrase française (table §11.3).
6. **`/boutique/:slug` inexistante, `PENDING` ou `EXPIRED` = la même page 404**, identique au slug inconnu (CA-V7-024). Aucune indication d'existence du vendeur.
7. **Aucun canal de contact direct.** Ni téléphone, ni WhatsApp, ni e-mail, ni `tel:`, ni `mailto:`, nulle part sur la boutique (CA-V7-026/046/047). Le seul contact est le formulaire interne boutique-scopé.
8. **Le bouton « Vendre » n'est jamais conditionné** et reste présent pour les non-abonnés : V7 n'y touche pas (CA-V7-004).
9. **Le quota n'apparaît que dans `/mon-abonnement`** et à l'ajout à la boutique — jamais dans le catalogue, jamais sur `/vendre`.

---

## 0.1 Note de jetons — tokens réels du scope `.market-site` (arbitrage 17/11/2026)

> **Arbitrage R-V7-D2 (clos)** : la boutique publique est rendue par le **même skin** que le reste du site public — les tokens existants du scope `.market-site` (thèmes « Blanc Ivoire » CLAIR dominant / « Bordeaux Nuit » sombre). La palette crème/terracotta mail (`server/src/mail/templates.ts`) est l'**ancienne direction, réservée aux e-mails** : **elle ne s'applique pas au web et n'apparaît nulle part dans les écrans de ce document**. Les 3 écrans V7 réutilisent exactement les jetons, rayons, ombres et typographies définis dans `docs/design-system.md` (§ « TOKENS REVENDS — SOURCE UNIQUE DE VRAI ») et réellement déclarés dans `web/src/styles/tokens.css` (consommés par `bureau.css`). **Aucun hexadécimal ni fonte nouveau n'est introduit.**

- **Scope public** : `/boutique/:slug` et `/mon-abonnement` vivent dans `SiteShell` (`.market-site`). Ce scope rend la palette « Blanc Ivoire » (clair) / « Bordeaux Nuit » (sombre) de `tokens.css`. **On n'édite ni `tokens.css`, ni `index.css`, ni le RE-SKIN.** Les classes V7 (nouvelles, préfixe `.rv-shop-`) consomment `var(--surface-*)`, `var(--text-*)`, `var(--accent*)` comme le reste de l'app.
- **Scope admin** : `/admin/abonnements` vit dans `DashboardLayout` (`.market-admin`) : identité **REVENDS 2026 `@theme static`** conservée (`--color-terracotta-strong`, terracotta admin légitime — scope distinct déjà en production, pas un skin nouveau), composants admin (`AdminTable`, `Sidebar`, `menus.ts`). 1 ligne additive (§5.6).
- **Focus** : `:focus-visible { outline: 2px solid var(--focus); outline-offset: 3px }` — clair `#7A1B2E` (**9,87:1** sur `#FBF9F5` ✅ 1.4.11) · sombre `#E2C79E` (**12,00:1** sur `#0D0C0B` ✅ 1.4.11). Déjà global dans `tokens.css`/`bureau.css`.

### 0.1.1 Thème CLAIR « Blanc Ivoire » — valeurs réelles (`tokens.css`)

| Rôle | Token réel | Valeur |
|---|---|---|
| Fond de page | `--surface-base` | `#FBF9F5` |
| Surface (cartes) | `--surface-raised` / `--surface-overlay` | `#FFFFFF` |
| Hover | `--surface-hover` | `#F4F0E8` |
| Enfoncement | `--surface-sunken` | `#F1EDE4` |
| Texte primaire / secondaire / tertiaire | `--text-primary` / `--text-secondary` / `--text-tertiary` | `#1A1714` / `#5C554D` / `#756C62` |
| Accent (action) | `--accent` / `--accent-hover` | `#7A1B2E` / `#5E1424` |
| Élément d'UI accentué | `--accent-ui` | `#7A1B2E` |
| Texte accent | `--accent-text` | `#7A1B2E` |
| Accent doux (badge) | `--accent-soft` | `#F6E9EC` |
| Texte sur accent | `--on-accent` | `#FFFFFF` (10,38:1 ✅) |
| Champagne (icônes/filets sur sombre déco.) | `--champagne` / `--champagne-soft` | `#8A6B39` / `#F3EDE1` |
| Positif | `--success` / `--success-soft` | `#2F6B4F` / `#E1EFE6` |
| Danger | `--danger` / `--danger-soft` | `#A32C22` / `#F7E4E1` |
| Filets / bordure de champ | `--line` / `--line-strong` | `#E6E0D6` / `#8E8373` |
| Focus | `--focus` | `#7A1B2E` |
| Ombres | `--shadow-xs/sm/md/cta` | `0 1px 2px rgba(26,23,20,.05)` · `0 2px 10px rgba(26,23,20,.07)` · `0 10px 28px -14px rgba(26,23,20,.22)` · `0 8px 28px -12px rgba(122,27,46,.42)` |

### 0.1.2 Thème SOMBRE « Bordeaux Nuit » — valeurs réelles (`tokens.css`)

| Rôle | Token réel | Valeur |
|---|---|---|
| Fond de page | `--surface-base` | `#0D0C0B` |
| Surface (cartes) | `--surface-raised` / `--surface-overlay` | `#151312` / `#1C1917` |
| Hover | `--surface-hover` | `#221E1C` |
| Enfoncement | `--surface-sunken` | `#080707` |
| Texte primaire / secondaire / tertiaire | `--text-primary` / `--text-secondary` / `--text-tertiary` | `#F4F0E8` / `#C2B8AC` / `#8F857A` |
| Accent (action) | `--accent` / `--accent-hover` | `#8E2337` / `#A62C42` |
| Élément d'UI accentué | `--accent-ui` | `#C04A63` (4,10:1 base · 3,88:1 carte ✅ 1.4.11) |
| Texte accent | `--accent-text` | `#E39AA9` (8,81:1 base ✅) |
| Accent doux (badge) | `--accent-soft` | `#2A1519` |
| Texte sur accent | `--on-accent` | `#F4F0E8` (7,55:1 ✅) |
| Champagne (icônes/filets sur sombre) | `--champagne` / `--champagne-soft` | `#D9C7AC` (11,83:1 base ✅) / `#221E19` |
| Positif | `--success` / `--success-soft` | `#5FBF8E` / `#16241C` |
| Danger | `--danger` / `--danger-soft` | `#E5807A` / `#2A1715` |
| Filets / bordure de champ | `--line` / `--line-strong` | `#2A2622` / `#6E655C` (3,42:1 base ✅) |
| Focus | `--focus` | `#E2C79E` (12,00:1 ✅) |
| Ombres | `--shadow-xs/sm/md/cta` | `0 1px 2px rgba(0,0,0,.30)` · `0 2px 10px rgba(0,0,0,.28)` · `0 10px 28px -14px rgba(0,0,0,.55)` · `0 8px 28px -12px rgba(142,35,55,.55)` |

### 0.1.3 Forme, typographie, espacement, mouvement — communs aux 2 thèmes (`tokens.css`)

| Rôle | Token réel | Valeur |
|---|---|---|
| Police de texte | `--font-sans` | `"Manrope", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` |
| Police de titre | `--font-display` | `"DM Serif Display", Georgia, "Times New Roman", serif` |
| Échelle typo | `--fs-display/h1/h2/h3/body/body-s/meta/label/price/price-lg` | `clamp(38px,5.2vw,64px)` · `clamp(30px,3.4vw,42px)` · `clamp(24px,2.2vw,30px)` · `20px` · `16px` · `15px` · `13px` · `11px` · `17px` · `22px` |
| Espacements | `--s-1…--s-20` | `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80` px |
| Rayons | `--r-xs/sm/md/lg/pill` | `8 · 12 · 16 · 20 · 999` px (carte = `--r-md`, photo 3/4 = `--r-xs`, champ = `--r-sm`, modale/sheet = `--r-lg`) |
| Mouvement | `--ease` / `--ease-out` / `--ease-spring` · `--t-fast` / `--t` / `--t-slow` | `cubic-bezier(.2,.8,.2,1)` · `cubic-bezier(.4,0,1,1)` · `cubic-bezier(.2,1.2,.35,1)` · `.16s` / `.24s` / `.4s` |
| Mesure | `--maxw` / `--gut` | `1300px` · `clamp(16px,4vw,44px)` |

### 0.1.4 Règles d'implémentation des jetons

- **Aucun hexadécimal nouveau** dans les 3 écrans ; **aucune fonte nouvelle** ; **aucun rayon/ombre nouveau**. Les valeurs mail sont des valeurs d'e-mails : hors du web.
- **Jamais en dur dans le JSX** : les prix/forfaits viennent de l'API (CA-V7-010), les couleurs passent par les classes/jetons existants (`.btn`, `.empty`, `var(--surface-*)`, `var(--text-*)`, `var(--accent*)`).
- **La boutique n'est pas un skin séparé** : même chrome (`SiteShell`/`Navbar`/`Footer`), mêmes cartes, mêmes états — c'est la cohérence produit, pas une sous-marque.
- **Scope public** : rendu selon le thème courant (`data-theme="light|dark"`) — les maquettes §2–§4 montrent le **clair** ; la version sombre est **automatique** (mêmes jetons) et doit être vérifiée en recette (0 violation axe sur les deux thèmes, CA-V7-027/062).
- **Scope admin** : `.market-admin` conservé tel quel (REVENDS 2026 `@theme static`, terracotta y est la charte admin existante).

---

## 0.2 Voix & langage

- **Marque** : « ReVendsen » en texte courant ; logotype `REVENDS.` réservé au logo.
- **Baseline** : « La seconde vie a de la valeur. » — peut clôturer le héros boutique et `/mon-abonnement` (une seule fois par page).
- **Tutoiement interdit**, « vous » partout. **Zéro point d'exclamation.** **Zéro emoji.**
- Les 3 forfaits se nomment **exactement** : `Découverte` (10 annonces) · `Boutique` (30) · `Atelier` (100). Prix affichés **depuis l'API**, jamais saisis en dur (CA-V7-010).
- FCFA : « 5 000 FCFA » (espace insécable). Jamais « 5000 FCFA ».
- Dates : « 17 novembre 2026 » en toutes lettres (FR), « 17 nov. 2026 » en méta. **Dates statiques** — aucun compte à rebours ne tique (§10).

---

## 1. Le parcours V7 en 3 gestes

```
VISITEUR (anonyme)                    VENDEUR                            ADMIN
─────────────────                     ─────────                          ─────────
Découvre la boutique              Choisit un forfait               Voit la file PENDING
  /boutique/:slug                  /mon-abonnement                  /admin/abonnements
        │                              │                                  │
        ├─ parcourt les annonces       ├─ PENDING : attente admin         ├─ confirme, active
        ├─ ouvre une fiche produit     ├─ ACTIVE : gère ses annonces      ├─ traçabilité posée
        │  (catalogue existant)        │  (quota, retrait, échéance)      │  (activated_by/at)
        └─ contacte le vendeur ───────►│  ACTIVE : reçoit la notification ◄┘
           (formulaire interne)        └─ EXPIRED : message + re-souscription
```

**Principes directeurs (ce que le design doit garantir)**

1. **La boutique est un lieu, pas un argument de vente** : on y entre pour regarder, pas pour être converti. Aucune urgence, aucune rareté.
2. **L'attente d'activation est digne** : un vendeur qui vient de souscrire ne voit pas un spinner infini, mais un état clair, chaleureux et actionnable.
3. **La jauge de quota est un fait, pas une épée** : information honnête (« 3 sur 10 »), jamais anxiogène. Dépasser le quota n'est jamais une punition — le catalogue reste ouvert et illimité (CA-V7-033).
4. **L'admin est rapide et tracé** : activer = 1 confirmation, 0 ambiguïté, 1 ligne d'historique.

---

## 2. Écran 1 — `/boutique/:slug` (publique, anonyme, dans `SiteShell`)

### 2.1 Maquette mobile-first 375 px

```
┌───────────────────────────────── 375 px ─────────────────────────┐
│  REVENDS.            [search]     [♥] [panier] [compte]          │  ← Navbar existante (inchangée)
├──────────────────────────────────────────────────────────────────┤
│  Accueil / mode-dakar                                           │  ← Crumb existant (.crumb)
├──────────────────────────────────────────────────────────────────┤
│  .wrap                                                            │
│                                                                  │
│  BOUTIQUE                                   ← eyebrow --fs-label │
│  Aïcha M.                                  ← --font-display, --text-primary │
│  La seconde vie a de la valeur.            ← --font-display italique 15     │
│  Membre depuis 2024                        ← --fs-meta, --text-secondary   │
│  Dakar · 3 annonces                        ← --fs-meta, --text-secondary │
│                                                                  │
│  ┌────────────────────────────────────┐                          │
│  │  i-store  Écrivez à la boutique    │  ← .btn.ghost 44px, bloc │
│  └────────────────────────────────────┘                          │
│  Aucune coordonnée personnelle n'est affichée.                   │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│  Les annonces de la boutique             ← h2 --fs-h2      │
│  ─── filet --line-strong -------------------------               │
│  ┌──────────┐ ┌──────────┐                                       │
│  │ photo    │ │ photo    │   .card catalogue réutilisée          │
│  │          │ │          │   (aspect 3/4, flag, favori 44×44)    │
│  ├──────────┤ ├──────────┤                                       │
│  │ MODE     │ │ MODE     │   ← cat-lbl accent-text               │
│  │ Veste…   │ │ Sac…     │   ← --fs-h3                          │
│  │ Exc·Dakar│ │ Exc·Dakar│   ← --fs-meta                         │
│  │ 12 000   │ │ 8 500    │   ← --fs-price tabular-nums           │
│  └──────────┘ └──────────┘                                       │
│  ┌──────────┐                                                     │
│  │ …        │   (3 annonces → 3 cartes exactement, CA-V7-025)    │
│  └──────────┘                                                     │
│  [ Charger plus ]  ← .btn.quiet, si total > perPage              │
├──────────────────────────────────────────────────────────────────┤
│  Écrivez à la boutique                  ← h2 --fs-h2             │
│  Un message interne, jamais un numéro.  ← --fs-body-s --text-secondary    │
│  ┌──────────────────────────────────┐                            │
│  │ Votre message                    *│  ← FormField, verre champ │
│  │ ┌──────────────────────────────┐ │                            │
│  │ │                              │ │  ← textarea 10–2000 car.   │
│  │ │                              │ │                            │
│  │ └──────────────────────────────┘ │                            │
│  │ 10 caractères minimum      0/2000 │  ← hint + compteur         │
│  ├──────────────────────────────────┤                            │
│  │ Votre e-mail (facultatif)        │                            │
│  │ ┌──────────────────────────────┐ │                            │
│  │ │ vous@exemple.com             │ │  ← input type=email        │
│  │ └──────────────────────────────┘ │                            │
│  │ Uniquement pour que la boutique  │  ← hint, --fs-meta         │
│  │ puisse vous répondre             │                            │
│  ├──────────────────────────────────┤                            │
│  │  Envoyer mon message             │  ← .btn.terra 52 px, bloc  │
│  └──────────────────────────────────┘                            │
├──────────────────────────────────────────────────────────────────┤
│  Footer existant (inchangé)                                      │
└──────────────────────────────────────────────────────────────────┘
```

**Comportement / contenu**

- **Hero boutique** : eyebrow `BOUTIQUE` (`.eyebrow`), nom `displayName` (`--font-display`, `--fs-h1` clamp), baseline italique (une fois), puis méta `Membre depuis <année>` + ville si connue + `<n> annonces`. **Rien d'autre** : pas de slogan publicitaire, pas de stats commerciales, pas de badge Vitrine (le badge Ambassadeur est une mécanique catalogue, hors boutique).
- **« Membre depuis »** : source **`memberSince` de `PublicUser`, déjà exposé par la vue publique** (`PublicUser` : `id`, `displayName`, `memberSince`, `sales` — arbitrage 17/11/2026, **aucun ajout au sérialiseur**). Format affiché : **année seule** — « Membre depuis 2024 ». Jamais de date précise, jamais de mois. **Toujours présent** dans la réponse publique : pas de repli, pas de placeholder.
- **Annonces** : **3 cartes = 3 listings** (CA-V7-025). Toujours `SiteCard` (mêmes `image`, `flag`, favori, lien vers `/catalogue/:slug`). Le produit boutique et le produit catalogue sont **le même objet** (même `id`, même titre, même prix — CA-V7-035) : la carte ne le sait pas, et c'est très bien.
- **Formulaire contact** : ordre de tabulation (nom → message → email → submit), `aria-describedby` sur chaque champ, compteur `0 / 2000` (`aria-hidden`, l'info vit dans le hint), textarea en verre de champ existant (`.inp` pattern), hauteur min 108 px, `font-size ≥ 16px` (no iOS zoom).
- **Bouton « Écrivez à la boutique » du hero** : ancre `#contact` vers le formulaire (pas un second canal). Pour un visiteur déconnecté, le formulaire reste **lisible** mais à l'envoi : panneau de connexion inline (§2.3), jamais un redirect muet.
- **Pagination** : `Charger plus` (.btn.quiet) si `total > 12` ; jamais de pagination chiffrée sur mobile.
- **Aucun** `tel:`, `mailto:`, `wa.me`, lien WhatsApp, aucun bouton d'appel — **vérifié en QA** (grep §11).

### 2.2 États

| État | Traitement (composants réutilisés) |
|---|---|
| **Chargement page** | `HeartLoader size="lg" label="Ouverture de la boutique…"` centré, `role="status"` (existant `.rv-heartloader`) |
| **Chargement du formulaire d'envoi** | Bouton `.btn.terra` en état `loading` : libellé conservé, mini-cœur `.rv-mini` à gauche, `aria-busy="true"` (pattern existant `.btn.block.loading`) |
| **Boutique `ACTIVE`, 0 annonce** | `SiteEmpty icon="store" title="Cette boutique prépare sa première pièce" body="Revenez très vite — ou parcourez le catalogue en attendant." action={ label:'Voir tout le catalogue', to:'/shop' }` |
| **Inconnue / PENDING / EXPIRED / CANCELLED** | **404 identique** (CA-V7-024) : `SiteEmpty level={1} icon="search" title="Cette boutique n'existe pas" body="Le lien est peut-être erroné, ou la boutique n'est pas ouverte pour le moment." actions=[Accueil, Voir le catalogue]` — `role="status"`. Même HTML/JSON, même copie, même statut. **Aucune** mention « en attente » / « expirée ». |
| **Erreur réseau/API** | `SiteEmpty role="alert" icon="triangle-exclamation" title="Impossible d'ouvrir cette boutique" body={friendlyError(e)} action={Réessayer → refetch}` |
| **Message envoyé (201)** | Toast succès (existant `toast('success', …)`) : « Votre message est envoyé à la boutique. » + formulaire **réinitialisé** + focus renvoyé sur le titre du formulaire (`#contact h2` tabindex=-1) |
| **Auto-contact (400 `CONTACT_SELF`)** | Toast : « Vous êtes le vendeur de cette boutique — ce formulaire sert aux visiteurs. » |
| **Trop de messages (429)** | Toast : « Trop de messages envoyés. Réessayez dans quelques minutes. » |
| **Boutique fermée entre temps (404 au submit)** | Toast : « Cette boutique n'est plus ouverte. Aucun message n'a été envoyé. » |
| **Erreur de validation (400)** | Erreur **par champ** sous le champ, `role="alert"`, `aria-invalid="true"` : « Votre message doit faire au moins 10 caractères. » / « L'adresse e-mail ne semble pas correcte. » |

### 2.3 Visiteur déconnecté — formulaire verrouillé (jamais un mur)

```
│  Écrivez à la boutique                                          │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  i-lock  Connectez-vous pour écrire à la boutique.        │   │  ← Notice tone="info", role="status"
│  │  Un message, pas un numéro.                               │   │
│  │  [ Se connecter ]   [ Créer un compte ]                   │   │  ← .btn.ghost + .link-arrow
│  └──────────────────────────────────────────────────────────┘   │
```

### 2.4 Desktop ≥ 1024 px

- Grille **2 colonnes** sous le hero : **contenu 8 / sidebar contact 4** (sticky, `top: calc(var(--header-h) + 24px)`).
- Les annonces passent en **4 colonnes** (≥ 1080 px).
- La sidebar contact porte exactement le même formulaire (même `id="contact"`), jamais dupliqué dans le DOM (un seul `#contact`).

### 2.5 Ordre de tabulation (mobile → desktop)

`Crumb → .fav des cartes (dans l'ordre) → liens cartes → Charger plus → #contact : (notice de connexion si déconnecté | message → e-mail → Envoyer) → footer`. Le lien de saut `.skip` existant reste premier. **Aucun élément hors écran tabulable.**

---

## 3. Écran 2 — `/mon-abonnement` (privé, `RequireUser`, dans `SiteShell`)

> Un seul écran, **5 visages**. Le choix du visage se fait sur `GET /api/subscriptions/me` : `subscription === null` → état **AUCUN** ; sinon `status`.

### 3.1 État **AUCUN** — « Ouvrez votre boutique » (choix du forfait)

```
┌───────────────────────────────── 375 px ─────────────────────────┐
│  Mon abonnement                              ← h1 --font-display 26 px │
│  La seconde vie a de la valeur — votre boutique aussi.           │
│                                                                  │
│  Choisissez votre forfait                 ← h2 --fs-h2           │
│  Activation par l'administration sous 24 h ouvrées.               │
│  Sans paiement en ligne pour le moment.                          │
│                                                                  │
│  ┌─────────────────────────────┐                                 │
│  │ DÉCOUVERTE                  │   ← PlanPicker, radio natif     │
│  │ 2 000 FCFA / mois           │      (fieldset + legend)        │
│  │ 10 annonces de boutique     │                                 │
│  │ Pour commencer              │                                 │
│  └─────────────────────────────┘                                 │
│  ┌─────────────────────────────┐                                 │
│  │ BOUTIQUE          ◆ le plus… │  ← pastille champagne-soft     │
│  │ 5 000 FCFA / mois           │      (pas « POPULAIRE » criard) │
│  │ 30 annonces de boutique     │                                 │
│  └─────────────────────────────┘                                 │
│  ┌─────────────────────────────┐                                 │
│  │ ATELIER                     │                                 │
│  │ 10 000 FCFA / mois          │                                 │
│  │ 100 annonces de boutique    │                                 │
│  └─────────────────────────────┘                                 │
│                                                                  │
│  Votre adresse de boutique                     ← label           │
│  revends…/boutique/ [ mode-dakar________ ]     ← préfixe fixe    │
│  Minuscules, chiffres et tirets — 3 à 40 caractères              │
│  ┌───────────────────────────────┐                               │
│  │ Soumettre ma demande          │  ← .btn.terra 52 px, bloc      │
│  └───────────────────────────────┘                               │
│  L'activation est manuelle : rien à payer maintenant.            │
└──────────────────────────────────────────────────────────────────┘
```

- **PlanPicker** : `fieldset`/`legend`, `input[type=radio]` **natifs** visually-hidden + carte label (pattern segmenté, clavier natif gratuit : flèches = choix). Prix/quota/duration **lus depuis `plans[]` de l'API** — **aucune valeur tarifaire dans le bundle** (CA-V7-010). Erreurs slug (400 `SLUG_RESERVED`, 409 `SLUG_TAKEN`) : message humain sous le champ (§11.3). CTA désactivé tant qu'aucun forfait (`aria-disabled`, jamais `disabled` muet sans texte).
- Succès (201) → l'écran passe en état **PENDING** (§3.2) + Toast « Votre demande est envoyée. L'administration ouvre votre boutique sous peu. »

### 3.2 État **PENDING** — « Votre boutique est en attente d'activation »

```
┌───────────────────────────────── 375 px ─────────────────────────┐
│  Mon abonnement                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │   (cœur)   ●  En attente d'activation                    │    │  ← StatusBadge pending (dot)
│  │                                                          │    │     + HeartMark contour
│  │   Votre boutique est en attente                          │    │  ← h1 --font-display 26 px
│  │   d'activation                                           │    │
│  │   L'administration examine votre demande. Vous serez      │    │
│  │   notifié dès l'ouverture — rien d'autre à faire.         │    │
│  │                                                          │    │
│  │   ┌────────────────────────────────────────────────────┐ │    │
│  │   │ Forfait        Boutique — 5 000 FCFA / mois        │ │    │  ← récap .rv-tab-like
│  │   │ Quotité        30 annonces de boutique             │ │    │
│  │   │ Adresse        boutique/mode-dakar                 │ │    │
│  │   │ Demandé le     17 novembre 2026 à 10:15            │ │    │
│  │   └────────────────────────────────────────────────────┘ │    │
│  └──────────────────────────────────────────────────────────┘    │
│  [ Changer de forfait ]  ← .btn.ghost (re-souscription PENDING)  │
│  [ Retour au catalogue ] ← .link-arrow                           │
└──────────────────────────────────────────────────────────────────┘
```

- **Aucune** barre de progression fictive, **aucun** « temps estimé ». Le badge `pending` (champagne-soft + chocolat, 11,26:1) + pastille + libellé (triple indice, WCAG 1.4.1). `aria-live="polite"` sur le panneau : si le statut bascule en cours de session, le lecteur l'annonce.
- « Changer de forfait » ici = nouvelle souscription (nouvel abonnement PENDING avec `supersedesId` du PENDING courant) → écran se rafraîchit sur le nouveau récap.
- Le lien « Voir ma boutique » est **absent** (la boutique est un 404 tant que PENDING — CA-V7-012/024). Le montrer serait un mensonge.

### 3.3 État **ACTIVE** — « Votre boutique est ouverte » (le tableau vivant)

```
┌───────────────────────────────── 375 px ─────────────────────────┐
│  Mon abonnement                                    [Voir ma      │
│                                                     boutique →]  │ ← .btn.ghost sm
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ ●  Boutique ouverte                     ← StatusBadge     │    │
│  │    /boutique/mode-dakar                 ← lien, --fs-meta │    │
│  │                                                          │    │
│  │  BOUTIQUE — 5 000 FCFA / mois           ← h2 --font-display  │    │
│  │  Membre depuis le 17 novembre 2026                        │    │  ← = `startedAt` (date d'activation de l'abonnement), distincte du « Membre depuis <année> » public (PublicUser.memberSince)
│  │  Échéance le 17 décembre 2026 · plus que 30 jours         │    │  ← STATIQUE, jamais un chrono qui tique
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Annonces dans votre boutique            ← h2 --fs-h2             │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  3 / 30                          ← --fs-price-lg tabular  │    │
│  │  █████░░░░░░░░░░░░░░░░░ 10 %              ← QuotaGauge     │    │  role=progressbar
│  │  Il reste 27 places dans votre boutique.                  │    │  ← phrase exacte
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Mes annonces de boutique (3)            [+ Ajouter] ← .btn.terra│
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ [img] Veste de laine grise      12 000 FCFA  [Disponible]│    │  ← ligne .rv-listing
│  │       Ajoutée le 3 nov.                    [Retirer ⋯]   │    │
│  ├──────────────────────────────────────────────────────────┤    │
│  │ [img] Sac en cuir …              8 500 FCFA   [Réservé]  │    │
│  │                                                   [Retirer]│   │
│  ├──────────────────────────────────────────────────────────┤    │
│  │ [img] Vélo vintage               45 000 FCFA  [Disponible]│    │
│  │                                                   [Retirer]│   │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Forfait                                                         │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  Boutique — 5 000 FCFA/mois · quota 30                   │    │
│  │  [ Passer à Atelier — 10 000 FCFA/mois · quota 100 ]     │    │  ← .btn.ghost
│  │  [ Passer à Découverte — 2 000 FCFA/mois · quota 10 ]    │    │
│  └──────────────────────────────────────────────────────────┘    │
│  La seconde vie a de la valeur.                                  │
└──────────────────────────────────────────────────────────────────┘
```

- **QuotaGauge** (§5) : `role="progressbar"` · `aria-valuemin={0}` · `aria-valuemax={quota}` · `aria-valuenow={used}` · `aria-label="Annonces dans votre boutique : {used} sur {quota}"` · phrase compagne visible (« Il reste 27 places… ») — **la jauge n'est jamais seule** (1.4.1). Couleur de la barre : `var(--accent)` sur piste `--surface-sunken` (clair `#7A1B2E` sur `#F1EDE4` = **8,88:1** ✅ · sombre `#8E2337` sur `#080707` = 2,34:1 — la barre étant aussi délimitée par la phrase compagne, l'info ne repose jamais sur la seule couleur ; si besoin la piste sombre passe en `#151312` + filet `--line-strong` 3,24 ✅, 1.4.11) — aplat, pas de dégradé ; si `used === quota`, la barre reste accent **et** un Notice warning s'affiche (§3.5) — jamais de rouge alarmiste.
- **« Retirer »** : bouton texte + icône `i-trash`/`×`, `aria-label="Retirer « Veste de laine grise » de la boutique"`. Confirmation **inline à deux temps** (le bouton devient « Confirmer le retrait ? » + « Annuler », 3 s d'armement, `Escape` désarme) — pas de modale pour une action réversible. Rappel sous la liste : « Retirer ne supprime ni l'article, ni vos commandes — il libère une place de boutique. » (CA-V7-034).
- **« + Ajouter »** : ouvre le panneau de sélection (§3.6). **Désactivé si quota atteint** : `aria-disabled="true"` + texte visible « Quota atteint (10/10) » + Notice (§3.5). L'ajout n'échoue jamais silencieusement.
- **Changement de forfait** : uniquement vers les paliers différents de l'actuel ; chacun affiche son prix **reçu de l'API**. Ouvre la confirmation (§3.7).
- **Échéance** : texte statique « Échéance le 17 décembre 2026 · plus que 30 jours » (source `endsAt`/`daysRemaining` de l'API, recalculés à chaque chargement — **aucun timer JS** n'écoule les secondes).

**Desktop ≥ 1024 px — 2 colonnes** : à gauche (5/12) : carte forfait + jauge + échéance (panneau « Votre forfait ») ; à droite (7/12) : « Mes annonces de boutique ». Colonne gauche `sticky` sous l'en-tête. L'écran ne dépasse jamais `--maxw`.

### 3.4 État **EXPIRED** — « Votre abonnement a expiré »

```
┌───────────────────────────────── 375 px ─────────────────────────┐
│  Mon abonnement                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ ⚠  Votre abonnement a expiré                             │    │  ← Notice warning, role="status"
│  │    le 17 décembre 2026.                                  │    │
│  │                                                          │    │
│  │    Vos 3 annonces de boutique sont conservées, mais      │    │
│  │    n'apparaissent plus sur votre boutique. Vos produits  │    │
│  │    restent visibles et vendables sur le catalogue.       │    │
│  └──────────────────────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  Pour rouvrir votre vitrine                              │    │
│  │  [ Re-souscrire à Boutique — élements conservés ]        │    │  ← .btn.terra (slug conservé)
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Annonces conservées (3)                     ← lecture seule,     │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ [img] Veste de laine grise      12 000 FCFA  [Conservée] │    │  ← badge neutre, --fs-meta
│  │                                                   [Retirer]│   │  ← retrait encore possible
│  ...                                                             │
└──────────────────────────────────────────────────────────────────┘
```

- **Message exact (CA-V7-016)**, jamais : « Votre abonnement n'est plus valide » ni un code. Re-souscription = nouvel abonnement PENDING, **slug conservé** (il reste réservé — CA-V7-020), l'ancien passe en historique. Les listings sont **conservées** (aucun `DELETE`), affichées avec badge `Conservée` (neutre, pas d'alerte lue).
- Après re-souscription → écran bascule sur l'état **PENDING** avec Toast « Votre demande est envoyée. »

### 3.5 Quota atteint — le moment délicat

```
┌──────────────────────────────────────────────────────────┐
│ ⚠  Quota de votre forfait atteint (10/10).               │
│    Retirez une annonce de votre boutique, ou passez à    │  ← Notice warning
│    un forfait supérieur.                                  │
└──────────────────────────────────────────────────────────┘
[ + Ajouter une annonce ]   ← bouton visible mais aria-disabled, texte conservé, jamais masqué
```

- Le message reprend **mot pour mot** l'esprit de la réponse API `409 STOREFRONT_QUOTA_EXCEEDED` (« Quota de votre forfait atteint (10/10). Retirez une annonce de votre boutique ou changez de forfait. ») — **sans le code**. La vente catalogue n'est pas bloquée et **l'écran le dit** : sous la liste, en `--fs-meta` : « Vos articles restent vendables sur le catalogue, quota atteint ou non. » (CA-V7-033 — une annonce refusée par la boutique reste vendable).

### 3.6 Panneau « + Ajouter une annonce » (Modal, existant `components/ui/Modal.tsx`)

```
┌───────────────────────────────┐
│  Ajouter à votre boutique   × │  ← Modal existant (piège de focus, Échap, focus rendu)
│                               │
│  Choisissez un article :      │  ← list des produits éligibles du vendeur
│  ┌───────────────────────────┐│     (statut PENDING|AVAILABLE|RESERVED, pas déjà listés,
│  │[img] Veste…      [Ajouter]││      pas SOLD/REJECTED) — source : données déjà chargées
│  │[img] Sac…        [Ajouter]││      sur /mes-articles, aucun nouvel endpoint
│  └───────────────────────────┘│
│  3 places sur 10 après ajout  │  ← aperçu quota si ajout
└───────────────────────────────┘
```

- Aucun article éligible → état vide local : « Tous vos articles éligibles sont déjà dans votre boutique — ou aucun n'est en ligne pour le moment. » + lien `/vendre` (« Publier un article », jamais conditionné — CA-V7-004).
- Erreur 409 au moment du POST (course concurrente) → le Modal ferme + Notice warning avec le message quota §3.5 (jamais « erreur 409 »).

### 3.7 Confirmation « Changer de forfait » (Modal)

```
┌───────────────────────────────┐
│  Changer de forfait          ×│
│                               │
│  Découverte  →  Atelier       │  ← --font-display 20 px, la flèche suffit
│  2 000 FCFA/mois → 10 000     │
│  10 → 100 annonces            │
│                               │
│  • Votre forfait actuel reste │
│    actif jusqu'à l'activation │
│    du nouveau.                │
│  • Votre slug et vos annonces │
│    sont conservés.            │
│  • Aucune double facturation  │
│    d'annonces : le quota
 │    appliqué sera celui du    │  ← phrase issue de CA-V7-015
│    forfait actif.             │
│                               │
│  [ Confirmer la demande ]     │  ← .btn.terra
│  [ Annuler ]                  │  ← .btn.ghost
└───────────────────────────────┘
```

- `role="dialog"` + `aria-modal` + `aria-labelledby`, focus trappé (patron Modal existant), Échap ferme, focus renvoyé au bouton déclencheur.
- Confirmation (201) → Notice success « Votre demande de changement est envoyée. Votre forfait actuel reste actif jusqu'à l'activation du nouveau. » + écran recalculé.

### 3.8 Erreurs — table de traduction en messages humains (aucun code jamais affiché)

| Code API (jamais rendu) | Message affiché (toujours français, toujours actionnable) |
|---|---|
| `STOREFRONT_QUOTA_EXCEEDED` | « Quota de votre forfait atteint (X/X). Retirez une annonce de votre boutique ou changez de forfait. » |
| `SUBSCRIPTION_REQUIRED` | « Cette action demande une boutique active — votre abonnement est en attente d'activation ou a expiré. » |
| `SLUG_TAKEN` | « Cette adresse est déjà prise. Essayez une variante — par exemple mode-dakar-shop. » |
| `SLUG_RESERVED` | « Cette adresse est réservée par ReVendsen. Choisissez-en une autre. » |
| `SUBSCRIPTION_ALREADY_ACTIVE` | « Vous avez déjà une boutique active. Un seul abonnement à la fois — retirez le précédent avant d'en demander un autre. » |
| `STOREFRONT_ALREADY_LISTED` | « Cet article est déjà dans votre boutique. » |
| `NOT_PRODUCT_OWNER` | « Cet article ne vous appartient pas — seuls vos articles peuvent rejoindre votre boutique. » |
| `CONTACT_SELF` | « Vous êtes le vendeur de cette boutique — ce formulaire sert aux visiteurs. » |
| `PLAN_NOT_FOUND` | « Ce forfait n'est plus proposé. Rechargez la page et réessayez. » |
| `NETWORK_ERROR` | « La connexion a échoué. Rien n'a été envoyé — vérifiez votre réseau et réessayez. » |
| autre / 500 | « Quelque chose n'a pas marché de notre côté. Réessayez dans un instant. » |

Source unique : `friendlyError()` existant (`lib/errors.ts`), étendu de ces cas (fichiers V7 uniquement).

---

## 4. Écran 3 — `/admin/abonnements` (privé admin, `RequireAdmin`, dans `DashboardLayout`)

> Scope **`.market-admin`** : identité terracotta REVENDS 2026 **inchangée**, composants admin (`AdminTable`, `Sidebar`, `DashboardLayout`, toasts, FA icons). Seul ajout : 1 ligne « Abonnements » dans `adminMenu` (§5.6).

### 4.1 Maquette 375 px (les tables admin défilent horizontalement sous 768 px — pattern `.rv-tab` existant)

```
┌───────────────────────────────── 375 px ─────────────────────────┐
│ ▤ REVENDS — Admin                                    [menu]      │  ← DashboardLayout existant
├──────────────────────────────────────────────────────────────────┤
│  Abonnements                                                     │  ← h1 admin existant
│  3 demandes en attente d'activation            ← --color-muted   │
│                                                                  │
│  [ En attente (3) ]  [ Tous ]                    ← onglets liés  │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ Vendeur      Forfait      Slug          Demande    Action  │  │  ← table, overflow-x auto
│  ├────────────────────────────────────────────────────────────┤  │
│  │ Aïcha M.     Boutique     mode-dakar    17 nov.   [Activer]│  │  ← .btn terra sm
│  │  #12         5 000 FCFA   /boutique/…   10:15               │  │
│  │ ─────────────────────────────────────────────                │  │
│  │ Fatou D.     Découverte   fatou-dakar   16 nov.   [Activer]│  │
│  │  #18         2 000 FCFA                 18:02               │  │
│  │ ─────────────────────────────────────────────                │  │
│  │ Moussa T.    Atelier      atelier-mous… 16 nov.   [Activer]│  │
│  │  #23         10 000 FCFA                09:41               │  │
│  └────────────────────────────────────────────────────────────┘  │
│  ← la table se défile horizontalement < 768 px (pattern .rv-tab) │
│                                                                  │
│  Activations récentes                            ← titre section │
│  mode-dakar — activée le 12 nov. par Idrissa                     │  ← traçabilité visible
│  fatou-shop — activée le 10 nov. par Idrissa                     │
└──────────────────────────────────────────────────────────────────┘
```

### 4.2 Flux d'activation (1 confirmation, 0 ambiguïté, 1 trace)

```
        Clic « Activer » (ligne Aïcha M.)
                 │
                 ▼
┌─────────────────────────────────┐
│  Activer la boutique ?          │  ← Modal admin existant
│                                 │
│  « mode-dakar » — Aïcha M.      │
│  Boutique — 5 000 FCFA / mois   │
│  30 annonces                    │
│                                 │
│  • La boutique devient publique │
│    immédiatement.               │
│  • Votre nom et la date seront  │  ← traçabilité explicite (CA-V7-013/051)
│    enregistrés (activated_by,   │
│    activated_at).               │
│                                 │
│  [ Activer la boutique ]        │  ← .btn (admin primary)
│  [ Annuler ]                    │
└─────────────────────────────────┘
                 │ confirme (POST /api/admin/subscriptions/:id/activate)
                 ▼
  Toast succès : « « mode-dakar » est ouverte. Notifié au vendeur. »
  Notice role="status" aria-live="polite" (en haut de liste) :
  « 1 abonnement activé — « mode-dakar » (Aïcha M.) »
  La ligne quitte la file (hauteur → 0, 200 ms, prefers-reduced-motion respecté)
  La section « Activations récentes » gagne la ligne en tête.
```

- **Traçabilité affichée** : chaque activation affiche `activated_by` (displayName de l'admin, jamais l'e-mail) + `activated_at` absolu (« 12 nov. 2026 à 14:03 »). L'historique survit au rafraîchissement.
- **Succès** : message **toujours humain** : « « mode-dakar » est ouverte. Aïcha M. peut maintenant gérer ses annonces. » — jamais « 200 OK » ni « activated ».
- **File vide** : état vide admin existant : « Rien en attente » + « Aucune demande d'abonnement à activer — la file est à jour. » + lien « Retour au tableau de bord ».
- **Erreur** : `role="alert"` + « Impossible de charger la file. » + [Réessayer]. **Non-admin** : redirection accueil (convention ARB-V5-02 — **pas de page 403**).
- **Onglet « Tous »** : `?status=` (`ACTIVE`/`EXPIRED`/`CANCELLED`/tous), badges StatusBadge (`approved`/« Active », `neutral`/« Expirée », `neutral`/« Annulée »).
- **Aucun CRUD forfait**, aucun bouton d'édition de prix (CA-V7-053) : la page n'a pas d'autre bouton que « Activer » et la navigation.
- **Desktop ≥ 1024 px** : 2 colonnes `grid-cols-[1fr_340px]` : table à gauche, « Activations récentes » à droite (sticky). Sous 1024 px : pile.

---

## 5. Système de composants — réutilisés et nouveaux

### 5.1 Réutilisés tels quels (zéro ligne modifiée)

| Composant / classe | Fichier | Rôle V7 |
|---|---|---|
| `SiteShell` / `Navbar` / `Footer` | `components/layout/*` | Chrome des 2 pages publiques-privées. Le lien « Mon abonnement » (1 ligne additive dans le menu utilisateur) est de `@frontend`, pas de ce document — **aucun** autre lien, « Vendre » inchangé (CA-V7-004) |
| `SiteCard` / `SiteCardGrid` | `components/site/SiteCard.tsx` | **La** carte des annonces de boutique (§2). Aucune variante |
| `SiteEmpty` | `components/site/SiteBits.tsx` | États vides/erreurs/404 des 2 écrans publics |
| `HeartLoader` | `components/ui/HeartLoader.tsx` | **Chargement de tous les écrans V7** (lg page / md liste / sm local) |
| `PageLoader` | `components/ui/Loading.tsx` | **Non utilisé** sur V7 (décision §0.4) |
| `.btn` `.btn.terra` `.btn.ghost` `.btn.quiet` `.btn.sm` `.btn.block` | `styles/bureau.css` | Toutes les actions |
| `FormField` / `.inp` (verre de champ) | `components/ui/FormField.tsx` | Champs du formulaire contact, forfaits, slug |
| `StatusBadge` | `components/ui/StatusBadge.tsx` | Statuts abonnement (mapping §5.3) — **aucun kind ajouté** |
| `Notice` | `components/ui/Notice.tsx` | Bandeaux (info/warning/danger/success) |
| `toast()` | `lib/toast.tsx` | Succès/erreur uniques (montés à la racine, `aria-live` géré) |
| `Modal` | `components/ui/Modal.tsx` | Changement de forfait, ajout d'annonce, confirmation admin |
| `DashboardLayout` / `Sidebar` / `adminMenu` | `components/admin/*`, `lib/menus.ts` | Shell admin — **1 ligne additive** `{ to: '/admin/abonnements', icon: 'fas fa-store', label: 'Abonnements', badge: pending, exact: true }` (+ `adminMenuLabels`) |
| Sprite `Ico` (`store`, `clock`, `tag`, `trash`, `x`, `check`, `circle-check`, `triangle-exclamation`) | `components/brand/IconSprite.tsx` | Icônes scope public (aucune icône nouvelle) |
| `ResilientImg` | `components/ui/ResilientImg.tsx` | Vignettes lignes de retrait |
| `fmt` / `formatFcfa` | `components/site/SiteBits.tsx`, `lib/format` | Prix « 12 000 FCFA » |
| `friendlyError` | `lib/errors.ts` | Traduction codes → messages (§3.8) |

### 5.2 Nouveaux — **uniquement** dans `components/storefront/` (nouveaux fichiers)

| Nouveau composant | Props clés | Notes d'implémentation |
|---|---|---|
| `StorefrontHero` | `{ displayName, memberSince, listingCount, slug }` | §2. Eyebrow + h1 `--font-display`. `memberSince` = **`PublicUser.memberSince`, déjà exposé** — champ requis, année seule (« 2024 »), aucun ajout au sérialiseur |
| `StorefrontListingsGrid` | `{ items, page, total, onLoadMore }` | Wrapper `SiteCardGrid` + `.btn.quiet`. Comptage DOM = `items.length` (CA-V7-025) |
| `ContactForm` | `{ slug, displayName }` | §2. Gère l'état déconnecté (§2.3), erreurs par champ, succès Toast |
| `PlanPicker` | `{ plans, value, onChange, name }` | `fieldset/legend`, radios natifs, **prix/quota de l'API** uniquement |
| `SubscriptionStatusPanel` | `{ subscription }` | §3.2/3.3/3.4 selon `status`. `aria-live="polite"`. Badge + récap + échéance **statique** |
| `QuotaGauge` | `{ used, quota }` | §3.3. `role="progressbar"`, `aria-valuemin/max/now`, phrase compagne visible, **aucune donnée distante** |
| `ListingManager` | `{ listings, quota, onAdd, onWithdraw }` | §3.3/3.4. Retire via deux temps inline (armement 3 s, Échap désarme) |
| `PlanChangeConfirm` | `{ current, target, onConfirm, onCancel }` | §3.7. Modal existant en interne |
| `AddListingSheet` | `{ products, onPick }` | §3.6. Sélection d'un produit éligible |
| `BazaarNotice`* | — | **Non créé** : le tell « quota atteint » est un `Notice` existant (§3.5), pas un composant |
| Admin : `PendingSubscriptionsTable` | `{ rows, onActivate }` | §4. Réutilise `AdminTable` + badge count |

\* Nom d'évitement : tout besoin de réassurance passe par `Notice` — pas de nouveau composant « marketing ».

### 5.3 Statuts abonnement → StatusBadge (mapping, aucun kind nouveau)

| Statut API | Kind existant | Libellé affiché | Pastille |
|---|---|---|---|
| `PENDING` | `pending` | « En attente d'activation » | dot champagne ✅ (couleur + texte) |
| `ACTIVE` | `approved` | « Boutique ouverte » | dot ✓ |
| `EXPIRED` | `neutral` | « Expirée » | dot |
| `CANCELLED` | `neutral` | « Annulée » | dot |

> `approved` sert ici de "positif" faute de kind `active` ; le vert existant (`--positive`) convient (5,30:1 sur soft). Aucun changement de `StatusBadge.tsx`.

### 5.4 Composants retirés/évités (à ne jamais créer)

- ❌ `PageLoader` (spinner) — HeartLoader partout.
- ❌ Tout composant avec **compte à rebours** (`Countdown`, `Timer`…).
- ❌ Toast « marketing » / confetti / badge « VIP » / « meilleur prix ».
- ❌ Cartes « forfait populaire » criarde — une seule pastille sobre sur `Boutique`, couleur **champagne-soft**, texte chocolat (`#3A2923` sur `#F1E7D5` = 11,26:1 ✅, tokens admin REVENDS 2026).
- ❌ Numéro de téléphone cliquable — **jamais** (D2).

### 5.5 Silhouettes typographiques V7 (toutes dans les familles existantes)

| Rôle | Spécification (tokens réels `.market-site`) |
|---|---|
| Titre page | `var(--font-display)` 26–30 px / 400, `--text-primary` |
| Nom boutique (hero) | `var(--font-display)` `var(--fs-h1)` `clamp(30px,3.4vw,42px)` / `letter-spacing:-.015em`, `--text-primary` |
| Section h2 | `var(--font-display)` `var(--fs-h2)` 24–30 px |
| Body | `var(--font-sans)` Manrope 16 px / 1.6, `--text-primary` |
| Prix | `var(--font-sans)` 700 `var(--fs-price)` 17 px / `tabular-nums` |
| Jauge `used/quota` | `var(--font-sans)` 700 `var(--fs-price-lg)` 22 px / `tabular-nums` |
| Eyebrow/labels | `var(--fs-label)` 11 px / 700 / uppercase / `letter-spacing:.22em`, `--accent-text` |
| Méta | `var(--fs-meta)` 13 px / 500, `--text-tertiary` (4,90 clair / 5,40 sombre sur base ✅ sur base/raised uniquement) |

### 5.6 Fichiers touchés (pour `@frontend` — aucun n'existe encore)

```
web/src/components/storefront/{StorefrontHero,ContactForm,PlanPicker,SubscriptionStatusPanel,QuotaGauge,ListingManager,PlanChangeConfirm,AddListingSheet}.tsx
web/src/views/StorefrontView.tsx                    (page publique)
web/src/pages/MySubscriptionPage.tsx                 (espace abonné)
web/src/pages/admin/AdminSubscriptionsPage.tsx       (file PENDING)
web/src/lib/storefront.{ts,types.ts}                 (client API V7)
web/src/App.tsx                                      (3 lignes de routes, additif)
web/src/lib/menus.ts                                 (1 ligne + 1 label admin, additif)
web/src/components/layout/Navbar.tsx                 (menu utilisateur : 1 entrée « Mon abonnement »)
```

**Aucun** fichier existant hors liste n'est modifié. `git status` en fin d'implémentation doit ne montrer que ces chemins + migration/019 (backend).

---

## 6. Accessibilité (CA-V7-027, CA-V7-062)

### 6.1 Ordre de tabulation — récapitulatif par écran

| Écran | Ordre (tab) | Gestion spéciale |
|---|---|---|
| `/boutique/:slug` | skip → Crumb → (notice connexion si déconnecté) → cartes (1..n, lien photo puis titre) → favoris → Charger plus → `#contact` → submit → footer | 404 : ordre = skip → actions Accueil/Catalogue → footer |
| `/mon-abonnement` (aucun) | skip → legend radios (flèches) → slug → submit → liens | Radiogroup natif = navigation native |
| `/mon-abonnement` (PENDING) | skip → Changer de forfait → Retour catalogue | `aria-live="polite"` sur le panneau statut |
| `/mon-abonnement` (ACTIVE) | skip → Voir ma boutique → retraits (1..n) → Ajouter → forfaits alternatifs → panneau sélection (piège Modal) → confirmations | Modal : piège de focus + retour au déclencheur |
| `/admin/abonnements` | skip → onglets En attente/Tous → Activer (1..n) → Activations récentes → sidebar | Modal confirmation : piège + retour |

### 6.2 focus visible

`:focus-visible { outline: 2px solid var(--focus); outline-offset: 3px }` (déjà global, `.market-site`) — **étendu explicitement** aux contrôles V7 : jamais `outline: none` sans remplacement équivalent. Valeurs réelles : clair `#7A1B2E` sur `--surface-base` `#FBF9F5` = **9,87:1** ✅ · sur `--surface-raised` `#FFFFFF` = **10,38:1** ✅ (1.4.11, ≥ 3:1) · sombre `#E2C79E` sur `#0D0C0B` = **12,00:1** ✅ (et **3,88–4,10:1** pour `--accent-ui` sombre sur raised/base, tokens vérifiés dans `tokens.css`). Le mode sombre public conserve `--focus` existant — aucune surcharge V7.

### 6.3 Labels & structure

- Un `<h1>` par page (`var(--font-display)`). `SiteHead level={1}` ou structure locale équivalente.
- Chaque champ : `<label htmlFor>` explicite (pas de placeholder-label), `aria-describedby` → hint + erreur liée, `aria-invalid` en cas d'erreur, message d'erreur `role="alert"` relié par `id`.
- `alt` **toujours renseigné** sur les photos (nom du produit) ; images décoratives `alt=""` / `aria-hidden`.
- Contrôles iconographiques seuls (favori, retrait) : `aria-label` complet ; bouton retrait = nom du produit inclus.
- Régions : `<nav aria-label="Fil d'Ariane">` (existant), sections `aria-labelledby` vers leur h2 quand pertinent.
- Formulaire contact : pas de `<fieldset>` inutile ; textarea `aria-describedby="msg-hint msg-err"`.
- `aria-busy="true"` pendant chargement des boutons (libellé conservé).

### 6.4 Contrastes mesurés sur les tokens réels `.market-site` — clair **et** sombre (formule WCAG 2.1, 17/11/2026)

**Thème CLAIR « Blanc Ivoire »** (`#FBF9F5` base · `#FFFFFF` raised) :

| Combinaison | Ratio | Verdict |
|---|---|---|
| `--text-primary` `#1A1714` / base · / raised | **16,97 · 17,85** | AAA ✅ |
| `--text-secondary` `#5C554D` / base · / raised | **6,98 · 7,34** | AA ✅ |
| `--text-tertiary` `#756C62` / base · / raised | **4,90 · 5,15** | AA ✅ |
| `--on-accent` `#FFFFFF` / `--accent` `#7A1B2E` (CTA primaire) | **10,38** | AAA ✅ |
| `--accent-text` `#7A1B2E` / base · / raised · / `--accent-soft` `#F6E9EC` | **9,87 · 10,38 · 8,79** | AAA ✅ |
| `--accent-ui` `#7A1B2E` / `--surface-hover` `#F4F0E8` | **9,13** | 1.4.11 ✅ |
| `--champagne` `#8A6B39` / base · / raised · / `--champagne-soft` `#F3EDE1` | **4,71 · 4,95 · 4,25** | AA ✅ · AA ✅ · AA grand texte uniquement (labels ≥ 18,66 px gras ou icônes déco) |
| `--success` `#2F6B4F` / `--success-soft` `#E1EFE6` | **5,30** | AA ✅ |
| `--danger` `#A32C22` / `--danger-soft` `#F7E4E1` | **5,83** | AA ✅ |
| Focus `--focus` `#7A1B2E` / base · / raised | **9,87 · 10,38** | 1.4.11 ✅ |
| Bordure de champ `--line-strong` `#8E8373` / base · / raised | **3,54 · 3,72** | 1.4.11 ✅ |

**Thème SOMBRE « Bordeaux Nuit »** (`#0D0C0B` base · `#151312` raised) :

| Combinaison | Ratio | Verdict |
|---|---|---|
| `--text-primary` `#F4F0E8` / base · / raised | **17,19 · 16,30** | AAA ✅ |
| `--text-secondary` `#C2B8AC` / base · / raised | **10,00 · 9,48** | AAA ✅ |
| `--text-tertiary` `#8F857A` / base · / raised | **5,40 · 5,12** | AA ✅ |
| `--on-accent` `#F4F0E8` / `--accent` `#8E2337` (CTA primaire) | **7,55** | AAA ✅ |
| `--accent-text` `#E39AA9` / base · / raised · / `--accent-soft` `#2A1519` | **8,81 · 8,35 · 7,76** | AAA ✅ |
| `--accent-ui` `#C04A63` / base · / raised | **4,10 · 3,88** | 1.4.11 ✅ (tokens documentés dans `tokens.css`) |
| `--champagne` `#D9C7AC` / base · / raised · / sunken | **11,83 · 11,22 · 12,18** | AAA ✅ |
| `--success` `#5FBF8E` / `--success-soft` `#16241C` | **7,16** | AA ✅ |
| `--danger` `#E5807A` / `--danger-soft` `#2A1715` | **6,25** | AA ✅ |
| Focus `--focus` `#E2C79E` / base | **12,00** | 1.4.11 ✅ |
| Bordure de champ `--line-strong` `#6E655C` / base · / raised | **3,42 · 3,24** | 1.4.11 ✅ |

**Règles non négociables** : jamais la couleur seule (badge = pastille + texte) ; texte ≥ 4,5:1 ; indices d'UI/focus ≥ 3:1 ; `--text-tertiary` uniquement sur base/raised (4,90 clair · 5,12 sombre — jamais sur `--surface-hover` ni sur le champagne-soft) ; le champagne ne porte du texte que sur base/raised/sunken (≥ 4,7) — jamais sur `--champagne-soft` en petit texte clair (4,25 ❌, réservé au **texte ≥ 18,66 px gras** ou à la déco sombre) ; les états critiques gardent leur double indice (couleur + texte + icône). Les deux thèmes sont retestés en recette (axe, clair + sombre).

### 6.5 Jauge & messages dynamiques

- `QuotaGauge` : `role="progressbar"` · `aria-valuemin="0"` · `aria-valuemax={quota}` · `aria-valuenow={used}` · `aria-valuetext="3 annonces sur 10"` · `aria-label="Annonces dans votre boutique"`. Phrase compagne en texte visible.
- Toasts et bascules de statut : `aria-live="polite"` (existant `toast`, `Notice role="status"`). Erreurs bloquantes : `role="alert"` (existant).
- L'état PENDING→ACTIVE en cours de session : annonce polite, Toast « Boutique ouverte » — **aucun rechargement forcé**, aucune alarme.

### 6.6 Clavier & tactile

- Toutes les cibles ≥ **44×44 px** (favori, retrait, Activer, radios des forfaits = carte entière tabulable).
- Modal : piège de focus, `Échap` ferme, focus rendu au déclencheur (patterns existants).
- Deux temps de retrait : `Échap` désarme, le focus reste sur la ligne.
- `prefers-reduced-motion: reduce` : **toutes** les micro-animations V7 sont neutralisées (la barre de la jauge passe en `width` instantanée).

---

## 7. Responsive — 375 px → tablette → desktop

| Écran | 375 px | 768 px (tablette) | ≥ 1024/1280 px (desktop) |
|---|---|---|---|
| `/boutique/:slug` | 1 colonne ; hero compact ; cartes **2 col** ; contact pleine largeur ; CTA hero bloc | cartes 3 col ; hero en 2 col (nom + méta / bouton) | **2 col : contenu 8 / aside contact 4 sticky** ; cartes **4 col** ; contact dans l'aside, pas dupliqué dans le flux |
| `/mon-abonnement` (AUCUN) | cartes forfaits empilées ; radios pleine largeur | forfaits en 3 col ; slug sous les forfaits | forfaits en 3 col max-width 880 px centré ; slug + CTA centrés |
| `/mon-abonnement` (PENDING) | panneau unique pleine largeur | idem, max-width 640 px | 2 col : panneau statut / carte « Et ensuite ? » (checklist locale : « activation manuelle → notification → vos 30 jours démarrent à l'ouverture ») |
| `/mon-abonnement` (ACTIVE) | jauge pleine largeur ; lignes annonce empilées ; retraits en icône+texte | lignes en 2 col compactes | **2 col : 5/12 panneau forfait+jauge (sticky) / 7/12 liste annonces** |
| `/mon-abonnement` (EXPIRED) | bandeau warning + 1 CTA + liste lecture seule | idem 640 max | 2 col comme ACTIVE |
| `/admin/abonnements` | table `overflow-x:auto` avec ombrage de bord (pattern `.rv-tab`) ; cartes si < 480 px ? **Non : table défilante en T, jamais de carte-transit** | table complète 4 col visible | **2 col : 1fr table / 340 px « Activations récentes » sticky** |

Règles transversales : `document.documentElement.scrollWidth <= 375` (CA-V7-064) · aucun scroll horizontal de page · images `loading="lazy"` + `decoding="async"`, héros boutique si présent `eager` · champs `font-size ≥ 16px` · `env(safe-area-inset-bottom)` respecté pour tout CTA collant (aucun CTA collant en V7 : tout tient dans le flux).

---

## 8. États chargement / erreur / vide — matrice unique

| Écran | Chargement | Erreur | Vide | Succès |
|---|---|---|---|---|
| `/boutique/:slug` | `HeartLoader lg` « Ouverture de la boutique… » | `SiteEmpty role="alert"` + Réessayer | `SiteEmpty` « Cette boutique prépare sa première pièce » + Voir le catalogue | Toast « Votre message est envoyé à la boutique. » |
| `/mon-abonnement` AUCUN | `HeartLoader lg` « Préparation de votre espace… » | `SiteEmpty role="alert"` + Réessayer | n/a (toujours un CTA forfaits) | bascule PENDING + Toast |
| `/mon-abonnement` PENDING | `HeartLoader md` dans le panneau (liste des annonces masquée) | Notice danger + Réessayer | n/a | bascule ACTIVE (au retour d'une session) + mention |
| `/mon-abonnement` ACTIVE | `HeartLoader md` cartes squelette `.card` silhouette (3/4 + 2 lignes + prix) | `SiteEmpty role="alert"` + Réessayer | « Votre boutique est ouverte — ajoutez votre première annonce. » + [Ajouter] | Toast (ajout/retrait/changement) |
| `/mon-abonnement` EXPIRED | `HeartLoader md` | Notice danger + Réessayer | « Aucune annonce conservée. » | Toast re-souscription |
| `/admin/abonnements` | `HeartLoader md` « Chargement de la file… » | `role="alert"` + Réessayer | « Rien en attente » + lien Dashboard | Toast + Notice `aria-live` « 1 abonnement activé… » |

Jamais d'écran muet : chaque erreur dit **ce qui n'a pas marché** en français + **une action**.

---

## 9. Mouvement & micro-interactions — discrètes uniquement

> Principe ReVendsen : **le mouvement explique, il ne décore pas.** `HeartLoader` fait déjà le travail émotionnel (le cœur) — le reste se tait.

| Élément | Interaction | Durée / courbe |
|---|---|---|
| Appui `.btn` | `scale(.98)` | 180 ms `--ease-spring` |
| Survol carte boutique | `translateY(-3px)` + `--shadow-md` | 240 ms `--ease` |
| Remplissage jauge | `width` transition sur la valeur réelle | 400 ms `--ease` — **jamais** une animation en boucle |
| Ligne d'annonce retirée | hauteur 56→0 + opacité | 200 ms `--ease-out` |
| Ligne activée (admin) | hauteur → 0 + collapse | 200 ms `--ease-out` |
| Toast | déjà spécifié (240 ms, translateY 12 px) | hérité |
| Focus | aucun déplacement animé (outline instantané) | — |

**Interdits** : aucune donnée distante (fonts/CDN/analytics de mouvement), aucun parallax, aucune animation en boucle hors HeartLoader, aucun compte à rebours, aucun shimmy de badge, aucune confettis. `prefers-reduced-motion` neutralise tout, y compris la jauge (saut direct à la largeur finale).

---

## 10. Anti-patterns à proscrire (revue de chaque PR V7)

1. ❌ **Faux compte à rebours** (« 29 j 23 h 59 m » qui tique) — l'échéance est une date statique.
2. ❌ **Fausse rareté / urgence** (« Plus que 3 places ! », badges rouges pulsing) — le quota est un fait affiché, pas une pression.
3. ❌ **Numéro directe** : `tel:`, `mailto:`, WhatsApp, e-mail affiché ou `n'importe quel bouton « Appeler le vendeur »` — le seul canal est le formulaire (CA-V7-026/046/047/048).
4. ❌ **Carte Tailwind étrangère à la charte** : `rounded-2xl shadow-lg bg-blue-50`, dégradés, glassmorphisme violet — les écrans V7 n'utilisent que `.btn`, `.card`, `.empty`, `Notice` et les jetons §0.1.
5. ❌ **Prix codés en dur** (`2000`, `5000`, `10000`) dans le JSX — la recette `grep` de CA-V7-010 échoue alors.
6. ❌ **Codes techniques à l'écran** (`403`, `STOREFRONT_QUOTA_EXCEEDED`, « Internal Server Error ») — table §3.8 uniquement.
7. ❌ **Bouton « Vendre » conditionné** par l'abonnement — verrou CA-V7-004/005.
8. ❌ **Boutique partiellement divulguée** : message différent pour slug inconnu vs PENDING vs EXPIRED — 404 **byte-identique** (CA-V7-024).
9. ❌ **Mention « vérifié » / « vendeur certifié » non garantie** dans le hero — sauf si l'admin valide réellement (sinon : absent).
10. ❌ **Toast success « 200 OK »** / logs côté client — succès = phrase humaine.
11. ❌ **Disabled muet** : un bouton désactivé sans explication visible est un bug de design (quota atteint → texte + Notice).
12. ❌ **Nouvelle fonte, nouveau rayon, nouvelle ombre, nouveau hex** — §0.
13. ❌ **`dangerouslySetInnerHTML`** pour le message contact (texte brut uniquement).
14. ❌ **Auto-refresh / polling agressif** (le cœur et le toast suffisent ; revalidation TanStack Query au focus fenêtre seulement).
15. ❌ **Jauge sans `aria-valuenow`** ou badge statut sans texte.

---

## 11. Mapping vers les critères d'acceptation (CA-V7-023 → 027 · CA-V7-060 → 064)

### 11.1 Critères imposés par la consigne

| Critère | Exigence | Comment ce design la couvre | Preuve design |
|---|---|---|---|
| **CA-V7-023** | Boutique publique accessible sans compte, annonces boutique **uniquement** | Écran §2, anonyme, cartes `SiteCard` branchées sur `items[]` (littéralement les listings boutique, rien d'autre) | §2.1, §2.2 |
| **CA-V7-024** | 404 identique inexistant/PENDING/EXPIRED | État « Boutique introuvable » unique, **même `SiteEmpty level=1`**, pour les 4 causes ; aucun texte différencié | §2.2 |
| **CA-V7-025** | Isolation des listings (3 listings vs 15 catalogue) | `StorefrontListingsGrid` rend `items.length` cartes ; comptage DOM = comptage API ; grille 2 col mobile reste **strictement** les produits de la boutique | §2.1, §5.2 |
| **CA-V7-026** | Aucune coordonnée privée exposée | Hero = nom + « Membre depuis » + ville (si fournie) — **zéro** `phone/whatsapp/email/tel:/mailto:` ; revue grep à la recette | §2.1, §10.3 |
| **CA-V7-027** | Boutique accessible clavier, 0 violation axe, contrastes AA | Tab order §6.1, focus §6.2, contrastes §6.4 (table mesurée), `alt` partout, `aria-label` contrôles iconographiques | §6 |
| **CA-V7-060** | Gates verts (tsc, tests, build) | Hors design — consigné pour la recette : ce document n'introduit aucune dérogation TypeScript | §13 |
| **CA-V7-061** | 0 erreur JavaScript sur boutique et mon-abonnement | Design sans logique cachée : états tous rendus déterministiquement ; pas de `JSON.parse` non protégé ; états `.loading` gérés par patterns existants | §8 |
| **CA-V7-062** | Espace abonné accessible : clavier, focus, labels, `aria-live` | §6.1 (ordre), §6.2 (focus), §6.3 (labels), §6.5 (`aria-live` PENDING/ACTIVE), Jauge `aria-valuenow` | §6.5 |
| **CA-V7-063** | Contrat documenté (api.md v2.7) | Design s'appuie **exactement** sur les 8 routes §4 de l'architecture + le champ public **`memberSince`, déjà exposé par `PublicUser`** (`id`, `displayName`, `memberSince`, `sales`) pour la ligne « Membre depuis `<année>` » du hero — **aucune route ni aucun champ ajouté** | §3, §4 |
| **CA-V7-064** | Responsive 375 px, pas de débordement horizontal | §7 (grilles, tables défilantes `.rv-tab`, `scrollWidth <= 375`) | §7 |

### 11.2 Critères adjacents couverts par ce design (mêmes écrans)

| Critère | Écran | §  |
|---|---|---|
| CA-V7-012/016 (PENDING sans accès · expiration 30 j + message clair) | `/mon-abonnement` | §3.2, §3.4 |
| CA-V7-015 (changement de forfait sans double ACTIVE) | `/mon-abonnement` | §3.7 |
| CA-V7-031/032 (quota, message clair, aucune vente bloquée) | `/mon-abonnement` | §3.3, §3.5 |
| CA-V7-033 (annonce refusée reste vendable) | bandeau §3.5 | §3.5 |
| CA-V7-034 (retrait boutique-scopé) | retrait 2 temps + rappel | §3.3 |
| CA-V7-045/046/047/048 (formulaire interne scopé, pas de canal produit) | boutique | §2 |
| CA-V7-050/051 (file PENDING, activation tracée) | `/admin/abonnements` | §4 |
| CA-V7-010 (prix en base, jamais en dur) | PlanPicker | §3.1, §10.5 |
| CA-V7-004 (bouton Vendre) | menus public | §0.8 |
| CA-V7-061/062/064 | transversal | §6–§8 |

### 11.3 Auto-revue du mapping

- Chaque écran spécifie **ses trois états plus la 404** → CA-V7-024/061/062 couverts par construction.
- Aucun critère n'exige une couleur ou un libellé **contraire** à ce document : ex. CA-V7-062 exige `aria-live` — posé (§6.5) ; CA-V7-027 exige `alt` — posé (§6.3) ; CA-V7-064 exige ≤ 375 px — posé (§7).
- **memberSince** : déjà exposé par la vue publique (`PublicUser` : `id`, `displayName`, `memberSince`, `sales`) — le hero affiche « Membre depuis `<année>` », **aucun champ ni route ajouté** (arbitrage 17/11/2026).

---

## 12. Risques ouverts (gestion-risques — nouveau lot « design »)

| ID | Risque | Niveau | Action (propriétaire) | Plan B |
|---|---|---|---|---|
| **R-V7-D1** | ~~Le « Membre depuis » du hero exige un champ absent~~ — le contrat public expose déjà `memberSince` (`PublicUser` : `id`, `displayName`, `memberSince`, `sales`) | ✅ **Clos — arbitrage chef de projet 17/11/2026** | Le hero affiche « Membre depuis `<année>` » (année seule, jamais date précise) à partir de `PublicUser.memberSince` ; **aucun ajout au sérialiseur**, aucun repli, aucun placeholder | Aucun plan B : donnée déjà en production |
| **R-V7-D2** | ~~Double scope tokens (charte crème mail vs `.market-site`)~~ — la boutique est rendue par le **même skin** que le reste du site public | ✅ **Clos — arbitrage chef de projet 17/11/2026** | La boutique consomme `var(--surface-*)`, `var(--text-*)`, `var(--accent*)` du scope `.market-site` (« Blanc Ivoire » clair / « Bordeaux Nuit » sombre) ; **aucun hex nouveau** ; typo `var(--font-display)` (DM Serif Display, Georgia en repli) + Manrope ; la palette crème/terracotta mail n'est pas applicable au web | Aucun plan B : c'est la règle de production actuelle |
| **R-V7-D3** | Régression anti-D2 : un `mailto:`/`tel:` glissé dans le formulaire ou la notification | ⚠️ Important | Checklist QA §6/§10.3 : `grep -nE 'mailto:|tel:|wa\.me|whatsapp' web/src/components/storefront web/src/views/StorefrontView.tsx` → 0 occurrence ; revue notification côté backend (`product.contact`, titre boutique) | CA-V7-046/047 en recette |
| **R-V7-D4** | Jauge lue comme intimidation ; abandon silencieux au quota (10/10) sans compréhension | ⚠️ Important | Texte compagnon permanent + Notice warning + CTA alternatif visible (retirer **ou** monter de forfait) ; copy validée §3.3/3.5 | Le bandeau suffit : aucun modal bloquant |
| **R-V7-D5** | Débordement 375 px : table admin + jauge + lignes annonce | ⚠️ Important | §7 : table `overflow-x:auto` + ombrage ; lignes annonces `minmax(0,1fr)` + ellipsis ; `scrollWidth ≤ 375` mesuré en recette (CA-V7-064) | Correctifs CSS scopés V7, zéro impact ailleurs |
| **R-V7-D6** | `PageLoader` utilisé par erreur sur un écran V7 (spinner étranger au cœur) | ℹ️ Mineur | Revue de PR : `grep PageLoader web/src/views/StorefrontView.tsx web/src/pages/MySubscriptionPage.tsx web/src/pages/admin/AdminSubscriptionsPage.tsx` → 0 | HeartLoader systématique |
| **R-V7-D7** | Retrait accidentel (un tap de trop sur mobile) | ℹ️ Mineur | Deux temps inline avec armement 3 s + `Escape` + rappel textuel permanent (§3.3) | Le produit n'est jamais supprimé (CA-V7-034) — aucun dommage irréversible |
| **R-V7-D8 (hérité)** | SLA admin & file PENDING qui s'accumule (R-V7-03 cahier / R-V7-A10 archi) | ⚠️ Important (PO) | `@frontend` expose le badge `pending` dans la sidebar dès qu'il existe (1 ligne) ; SLA = PO-V7-08 | Traitement par lot admin |
| **R-V7-D9 (hérité)** | Liste des 20 mots réservés non définitive (PO-V7-06) | ℹ️ Mineur (PO) | Aucun impact design (le champ slug gère tout état d'erreur) | 1 ligne `utils/storefront.ts` |
| **R-V7-D10 (hérité)** | Incohérence géo Sénégal/Côte d'Ivoire (PO-V7-07) | ℹ️ Mineur (PO) | Copy V7 sans mention de pays (« Dakar » en exemple seulement, jamais de géo-assertion) | Docs antérieurs inchangés |

**Risques ouverts à ce jour** : R-V7-D8, R-V7-D9, R-V7-D10 (PO, existants). **R-V7-D1 et R-V7-D2 sont clos** par arbitrage du chef de projet le 17/11/2026 (memberSince déjà exposé ; skin `.market-site` unique). Les autres sont atténués par construction.

---

## 13. Définition de Done — verdict binaire (portée : ce document)

> La recette d'implémentation (45 critères, 12 scénarios) reste **non exécutée** : aucun code V7 n'existe à ce jour. Le verdict ci-dessous porte **uniquement sur le livrable demandé** : un document de design.

| # | Exigence de la mission | État | Preuve |
|---|---|---|---|
| 1 | Un seul fichier créé, aucun autre touché | ✅ | `docs/design-v7-hebergement-vendeurs.md` ; `git status --porcelain` au moment du verdict (voir §13.2) |
| 2 | (1) Avertissement additif-only : aucune page existante refondue | ✅ | §0 (9 verrous), §0.1.4 (`tokens.css`/RE-SKIN intouchables ; skin `.market-site` unique), §5.6 (fichiers = ajouts seulement) |
| 3 | (2a) `/boutique/:slug` : hero (nom, membre depuis), annonces boutique **uniquement**, cartes catalogue réutilisées, formulaire contact, état vide, 404 identique triple cause | ✅ | §2.1 (maquette), §2.2 (états dont 404 unique), §2.3 (déconnecté), §2.4–2.5 |
| 4 | (2b) `/mon-abonnement` : PENDING/ACTIVE/EXPIRED (attente, forfait, jauge quota, échéance 30 j, liste avec retrait, changement de forfait + confirmation, messages humains) | ✅ | §3.1 (AUCUN), §3.2 (PENDING), §3.3 (ACTIVE + QuotaGauge), §3.4 (EXPIRED), §3.5 (quota atteint), §3.6 (ajout), §3.7 (confirmation), §3.8 (erreurs humaines) |
| 5 | (2c) `/admin/abonnements` : file PENDING, bouton activer, traçabilité, succès | ✅ | §4.1 (maquette), §4.2 (flux 1 confirmation → Notice/Toast + « Activations récentes ») |
| 6 | (3) Composants réutilisés/nouveaux documentés | ✅ | §5 (réutilisés §5.1, nouveaux §5.2 dans `components/storefront/`, mapping statuts §5.3, proscrits §5.4, silhouettes §5.5, fichiers §5.6) |
| 7 | (4) Accessibilité : ordre de tabulation, focus visible, labels, AA, `aria-valuenow` jauge, `aria-live` messages | ✅ | §6.1 (tab order par écran), §6.2 (focus 2 px/offset 3, valeurs réelles **9,87/10,38/12,00** ✅), §6.3 (labels/roles), §6.4 (**22 combinaisons mesurées sur les tokens réels `.market-site` — clair + sombre —, 0 violation AA / 1.4.11**), §6.5 (`aria-valuemin/max/now` + phrase compagne ; `aria-live`), §6.6 (clavier/tactile) |
| 8 | (5) Responsive 375 px, tablette, desktop 2 colonnes | ✅ | §7 (matrice 6 contextes, `scrollWidth ≤ 375`, desktop 2 col sur boutique + mon-abonnement + admin) |
| 9 | (6) États chargement/erreur/vide | ✅ | §8 (matrice unique des 6 contextes, HeartLoader partout, `role="alert"` + Réessayer) |
| 10 | (7) Animations discrètes, aucune donnée distante | ✅ | §9 (table, durées ≤ 400 ms, aucune boucle hors cœur), §10 (interdits) |
| 11 | (8) Anti-patterns proscrits (faux compte à rebours, fausse rareté, numéro direct, carte Tailwind étrangère) | ✅ | §10 (15 anti-patterns) |
| 12 | (9) Mapping CA-V7-023 → 027 et CA-V7-060 → 064 | ✅ | §11.1 (table imposée), §11.2 (adjacents), §11.3 (auto-revue du mapping ; `memberSince` déjà exposé par `PublicUser`, 0 ajout) |
| 13 | (10) Définition de Done + verdict binaire | ✅ | §13 |
| 14 | Compétences appliquées (`design-exceptionnel`, `plan-le-first`, `gestion-risques`, `auto-revue`, `definition-done`) | ✅ | plan en §0/§1 · barème design (hiérarchie, tokens `.market-site` uniques §0.1 — 60/30/10 hérité de la charte publique, DM Serif Display/Manrope, ombres douces §5.5, polish §6) · risques §12 (R-V7-D1/D2 clos) · relecture §13.3 |

### 13.1 Preuves matérielles

- **Fichier unique** : `docs/design-v7-hebergement-vendeurs.md`
- **Écrans spécifiés** : 3 (`/boutique/:slug`, `/mon-abonnement`, `/admin/abonnements`) — **5 visages** de `/mon-abonnement` couverts
- **Maquettes textuelles** : 7 (boutique 375, déconnecté §2.3, mon-abonnement ×4 états, panel ajout, confirmation forfait, admin 375 + flux activation)
- **Composants nouveaux** : 9 (`StorefrontHero`, `StorefrontListingsGrid`, `ContactForm`, `PlanPicker`, `SubscriptionStatusPanel`, `QuotaGauge`, `ListingManager`, `PlanChangeConfirm`, `AddListingSheet`) — tous dans `components/storefront/`, aucun existant modifié
- **Contrastes mesurés** : 22 combinaisons (formule WCAG 2.1, tokens réels `.market-site` clair **et** sombre), **0 violation** AA / 1.4.11
- **Anti-patterns** : 15 · **Risques** : 10 (3 hérités PO ouverts · 7 design, dont **R-V7-D1 / R-V7-D2 clos par arbitrage le 17/11/2026**) · **Messages humains** : 11 (§3.8)

### 13.2 État git (à la date du verdict)

`git status --porcelain` →

```
?? docs/api-v7-hebergement-vendeurs.md     ← préexistant (autre mission, NON créé par ce livrable)
?? docs/design-v7-hebergement-vendeurs.md  ← ce livrable
```

**Un seul fichier ajouté par cette mission** : `docs/design-v7-hebergement-vendeurs.md`. Aucun autre fichier n'est créé, modifié ou supprimé ; aucune page existante n'est touchée ; aucun build/test/déploiement n'a été lancé.

### 13.3 Auto-revue (`auto-revue`)

Relecture complète du document après v1.1 (arbitrages 17/11/2026) : (a) purgé **toutes** les occurrences des cinq hex de l'ancienne direction (crème / terracotta mail / sable / blanc cassé / encre mail) — elles n'apparaissent nulle part dans les écrans ni dans les tokens de ce document ; (b) contrastes §6.4 entièrement recalculés sur les tokens réels `.market-site`, clair **et** sombre — 22 combinaisons, 0 violation ; (c) `memberSince` traité comme champ **déjà exposé** (`PublicUser`) : hero « Membre depuis `<année>` », risque R-V7-D1 supprimé des risques ouverts ; (d) aucune référence résiduelle au « skin crème » de la boutique. Vérifié ensuite : 0 `tel:`/`mailto:` dans les maquettes, 0 prix en dur hors exemples de paliers (« 2 000/5 000/10 000 FCFA » = valeurs **validées PO le 17/11/2026**, consommées via l'API), 1 seul `<h1>` par écran, 404 boutique unique, `aria-valuenow` présent, texte des maquettes et des 3 écrans intacts (seules les annotations de jetons/typos y ont été alignées). **Dernier contrôle** : les libellés d'action tiennent en 4 mots max, zéro point d'exclamation. Historique v1.0 → v1.1 : 1 section réécrite (§0.1), 22 contrastes remplacés, 2 risques clos, annotations de maquette alignées sur `--font-display`/`--text-*`/`--fs-*` réels.

### 13.4 VERDICT

**DONE — spécification visuelle et UX V7 complète, additive et actionnable.** Verdict binaire sur ce document : **✅ DONE**.

**Aucune réserve design.** Les deux arbitrages du chef de projet du 17/11/2026 sont intégrés — **R-V7-D1 clos** (`memberSince` déjà exposé par `PublicUser`, boutique = « Membre depuis `<année>` », 0 ajout au sérialiseur) et **R-V7-D2 clos** (la boutique rend le même skin `.market-site` que le reste du site public ; la palette crème/terracotta mail est purgée du web). Restent ouvertes, côté PO uniquement : R-V7-D8 (SLA admin, PO-V7-08), R-V7-D9 (mots réservés, PO-V7-06), R-V7-D10 (géo, PO-V7-07). La recette de 45 critères (grille §9 du cahier) reste **NON EXÉCUTÉE** tant que le code n'existe pas ; aucun critère n'est déclaré conforme sur intention.
