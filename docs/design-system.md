# DESIGN SYSTEM — ReVends

| | |
|---|---|
| **Version** | 2.0 — « Maison Bordeaux » (réécrit sur l'état réel du code) |
| **Auteur** | Agent design (direction artistique + UI) — pour `@frontend` (web) et `@mobile` |
| **Statut** | Spécification. **Aucun changement de code n'a été appliqué** : ce document décrit l'état actuel, la direction cible et le plan de migration. |
| **Source de vérité visuelle** | `web/src/bureau/vendor/{styles,editorial,theme}.css` (copies verbatim de `/home/dioufidriss/Bureau/main/assets/`) — **c'est la maquette réellement portée**. |
| **Périmètre** | Site public (`.market-site`). L'admin (`.market-admin`) n'est **pas** re-skinné : il garde ses tokens REVENDS 2026 (`web/src/index.css:70-116`). |
| **Stack contrainte** | React 19 + Vite + TypeScript + **CSS vanilla**. Aucun nouveau framework UI, **aucun usage supplémentaire de Tailwind**. |
| **Règle d'or** | Une seule source de vérité (`tokens.css`), des valeurs mesurées, des contrastes vérifiés. Toute couleur/rayon/ombre/typo de ce document est **extraite du code existant ou calculée** — jamais inventée au cas par cas. |

> ⚠️ **Écart de périmètre à arbitrer (à confirmer par le PO).** Le brief initial décrit un *marketplace de pièces automobiles*. Le code, les données (`002_seed_categories.sql`), la navigation (`web/src/lib/menus.ts:25-32`) et les contenus sont un **marketplace général d'articles d'occasion** (Mode, Chaussures, Sacs, Tech, Maison, Loisirs) à Dakar, en FCFA. Ce document est donc écrit **sur le produit réellement implémenté**. Il est écrit **de façon agnostique** (tokens, composants, écrans, ton) pour qu'un pivot automobile reste possible : seuls les libellés de catégories et l'illustration produit changent.

---

## 0. Mode d'emploi

1. **§1 Diagnostic** — ce qui ne va pas aujourd'hui, avec les preuves `fichier:ligne`.
2. **§2 Principes** — les 5 règles qui arbitrent chaque décision.
3. **§3 Tokens** — la source de vérité à copier-coller (`tokens.css`).
4. **§4 Composants** — contrat visuel et états de chaque composant récurrent.
5. **§5 Écrans** — structure et hiérarchie écran par écran.
6. **§6 Micro-interactions** — courbes, durées, cascades.
7. **§7 Accessibilité** — contrastes mesurés, cibles, clavier, mouvement réduit.
8. **§8 Responsive web / mobile** — ce qui est identique, ce qui s'adapte.
9. **§9 Copy & ton** — la voix de la marque, en français.
10. **§10 Migration** — le plan de fichiers, ordonné, prêt à exécuter.
11. **§11 Auto-revue** — le contrôle de cohérence du système.

---

## 1. Diagnostic — 13 failles documentées

| # | Faille | Preuve | Impact |
|---|---|---|---|
| 1 | **Trois couches de tokens concurrentes**, mêmes noms, valeurs divergentes | `web/src/styles/bureau.css:21-39` (palette Bureau) · `web/src/index.css:70-116` (`@theme static` REVENDS 2026) · `web/src/styles/bureau.css:1540-1594` + `1599-1649` (tokens sémantiques) | `--color-champagne` = `#D8C5AB` (`index.css:439`) mais `--champagne` = `#CFCFCF` (`bureau.css:1566`) et `--champ` = `#CFCFCF` (`bureau.css:1579`). Le « champagne » du thème clair est **gris**. |
| 2 | **Le thème clair n'a aucune profondeur** | `bureau.css:1547-1552` : `--color-bg-primary`, `--color-bg-secondary`, `--color-surface`, `--color-surface-soft`, `--color-surface-elevated`, `--color-surface-hover` valent **tous** `#FFFFFF` (assumé en commentaire lignes 1545-1546) | Aucun plan, aucune hiérarchie : la page « plate », pas premium. Cartes, champs, modales et bandeaux sont indiscernables. |
| 3 | **Le texte d'accent est illisible en thème sombre** | `--terra` = `#8F2940` (`bureau.css:1631`) utilisé en **couleur de texte** : `bureau.css:203` (`.eyebrow`, 11 px gras), `:356` (`.card .cat-lbl`, 10,5 px gras), `:475` (`.buy .cat-lbl`), `bureau-fixes.css:153,183,439` | **2,18:1 à 2,32:1** — très loin du 4,5:1 AA. Le label de catégorie de **chaque carte** est illisible en sombre. |
| 4 | **L'anneau de focus ne passe pas le 1.4.11** | `bureau.css:96` `:focus-visible{outline:2px solid var(--terra)}` → `#8F2940` sur `#11100F` | **2,32:1** < 3:1 exigé pour un indicateur de focus. |
| 5 | **L'accent utilisé comme élément d'UI ne passe pas le 1.4.11** | `bureau.css:421` `input[type=range]{accent-color:var(--terra)}`, `bureau.css:158` (soulignement de nav), `bureau.css:176` (badge) | **2,32:1** < 3:1. |
| 6 | **L'initiale du vendeur est invisible en sombre** | `bureau.css:1408` `.seller .av{background:var(--bordeaux);color:var(--champagne)}` → sombre : `#8F2940` + `#352F2C` (`bureau.css:1642,1646`) | **1,61:1**. Rendu par `web/src/views/ProductView.tsx:357`. |
| 7 | **Deux systèmes de boutons concurrents** | `web/src/components/ui/Button.tsx:15-33` (Tailwind : `rounded-md` 16 px, `font-bold`, `active:scale-[0.98]`, 36/44/52 px) vs `web/src/styles/bureau.css:115-120` (`.btn` : rayon 12 px, `font:600 12px/1` uppercase `.15em`, 52 px) | Les deux coexistent à l'écran : `SiteBits.tsx:90,94` (`.btn`) et `States.tsx:40,44` (`buttonClasses`). Même action, deux hauteurs, deux rayons, deux registres typographiques. |
| 8 | **Trois grammaires d'icônes** | Sprite SVG public `web/src/components/brand/Ico.tsx:13` · Font Awesome dans le scope public `web/src/components/ui/Loading.tsx:143` et `Button.tsx:77-80` · glyphe texte `↓` `web/src/views/HomeView.tsx:188` | Iconographie hétérogène, poids visuel incohérent, dépendances inutiles. |
| 9 | **Couleurs plaquées en dur dans le JSX** | `web/src/views/HomeView.tsx:66-67,164-165,244-245` · `web/src/views/AuthView.tsx:96-97` · `web/src/components/site/SiteImage.tsx:20,44,50,64,123-124` · `web/src/views/SellView.tsx:370` (`color:'#fff'`) | Ces valeurs **ne suivent pas le thème** : l'illustration « champagne » reste crème en sombre ; `#fff` en dur casse le mode sombre. |
| 10 | **Six rayons pour six usages, sans règle** | `bureau.css:52` (`--r:12px`), `:53` (`--r-lg:18px`), `:1696` (`14px`), `:1702` (`10px`) · `bureau-fixes.css:129` (`8px`), `:288` (`10px`) · Tailwind `rounded-md` 16 px / `rounded-lg` 20 px (`index.css:107-108`) | Aucun langage de forme : deux boutons voisins peuvent avoir 12 et 16 px de rayon. |
| 11 | **Cibles tactiles sous 44 px** | `bureau.css:1722` `.card .fav{width:34px;height:34px}` · `bureau-fixes.css:39-42` `.link-arrow{min-height:24px}` · `.badge` (`bureau.css:175-178`) non dimensionné | Cible de 34 px sur l'élément le plus sollicité du catalogue (favori) ; liens de section à 24 px alors que le DA exige 44 px sous 768 px. |
| 12 | **Identité et copy incohérentes** | Marque écrite « REVENDS » (`Navbar.tsx:119`), « ReVends » (`web/index.html:35`), « Le Cœur couture » (`web/src/components/ui/SplashLoader.tsx:4`, commentaire source) · `HomeView.tsx:209` « **Cinq** familles, mille trouvailles » alors qu'il y a **six** univers (`lib/menus.ts:25-32`) · `Footer.tsx:85-92` et `Navbar.tsx:277-285` : liens sociaux pointant vers `/` | Promesse fausse sur l'accueil, trois graphies de marque, liens sociaux morts. |

| 13 | **En sombre, les bordures de tous les contrôles de formulaire sont invisibles** | Thème sombre : `--line` = `#292522` (`vendor/theme.css:95,120`), `--color-border-strong` = `--champagne` = `#352F2C` (`:96`, `:130`). Ces deux jetons bordent **tous** les contrôles : `.search input` (`vendor/styles.css:141` + `theme.css:151`), `.inp`/`.sel` (`styles.css:513` + `editorial.css:178`), `.cbtn`/`.chip` (`:393` + `editorial.css:182`), `.qty` (`styles.css:485` + `editorial.css:245`), `.drop` (`styles.css:522` + `editorial.css:258`) | **1,25:1 à 1,44:1** — la bordure est le **seul** indice d'existence du champ : **WCAG 1.4.11 non respecté** sur chaque formulaire du site. En plus, le thème sombre n'a **aucune structure visible** : les cartes se fondent dans le fond (`#352F2C` / `#211D1B` = **1,27:1**). |

**Bonus coherent avec le sujet :** le back-office est **terracotta** (`index.css:85` `--color-terracotta: #C85A2A`) quand le public est **bordeaux** (`bureau.css:1558` `#6B1728`). Deux identités dans un même produit.

---

## 2. Principes directeurs

1. **Le noir chaud est la scène, la photographie est le sujet.** Thème **sombre dominant** (c'est déjà le défaut en production, `web/index.html:15`) : le produit — une belle photo d'objet de seconde main — est le seul point lumineux de l'écran. Le fond n'est jamais du noir pur (`#0D0C0B`), jamais du gris froid : c'est du **noir chaud**, pour rester dans la famille ivoire/champagne.
2. **Un seul accent, le bordeaux. Il ne fait jamais que trois choses :** inciter (CTA), désigner (état actif / focus), authentifier (badge vendeur). Il ne décore jamais. Le **champagne** est le métal de la maison : filets, labels, liserés, icônes sur fond sombre — jamais un aplat de fond de page.
3. **La matière avant l'effet.** Ombres douces et courtes, bords nets, aucune glassmorphism généralisée, aucune animation qui « fait moderne ». Le luxe se lit dans la justesse des proportions, pas dans les effets.
4. **Hiérarchie par la taille et le poids, jamais par la couleur seule.** Le titre de produit est un serif ; le prix est un sans-serif gras avec `font-variant-numeric: tabular-nums` ; la méta est un sans-serif 13 px tertiaire. Aucun texte informatif ne repose sur une teinte seule.
5. **Deux familles, neuf tailles, un rythme.** Public = **Manrope** (lecture/actions) + **DM Serif Display** (voix). Rien d'autre. Échelle typographique fermée (9 tailles), espacements sur une échelle de 4 px, rayons sur 5 valeurs.

---

## 3. Tokens

### 3.1 Source de vérité et cascade

**Nouveau fichier : `web/src/styles/tokens.css`** — l'unique endroit où vivent les couleurs, les rayons, les ombres et le mouvement du site public.

Ordre d'import (à modifier dans `web/src/main.tsx:5-12`) :

```
index.css          → base globale + polices + socle ADMIN
bureau.css         → GÉNÉRÉ, scopé .market-site  (ne jamais éditer à la main)
tokens.css         → NOUVEAU — jetons du site public, écrase bureau.css
bureau-fixes.css   → correctifs a11y + éléments absents de la maquette
```

Règles de spécificité (indispensables, sinon les jetons ne passent pas) :

- Le clair doit être déclaré **deux fois** : `.market-site` (0,1,0) **et** `:root[data-theme="light"] .market-site` (0,3,0) — sinon la variante explicite de `bureau.css:1541` gagne sur un simple `.market-site`.
- Le sombre : `:root[data-theme="dark"] .market-site` (0,3,0), strictement **après** `bureau.css`.
- Ne **jamais** redéclarer un token déjà défini dans `tokens.css` ailleurs que dans `tokens.css`.

### 3.2 Palette — thème dominant « Bordeaux Nuit » (sombre)

| Token | Hex | Usage | Ratio vérifié |
|---|---|---|---|
| `--surface-base` | `#0D0C0B` | Fond de page, tiroirs, sheets | — |
| `--surface-raised` | `#151312` | Cartes, panneaux, lignes de liste | — |
| `--surface-overlay` | `#1C1917` | Champs, modales, popovers | — |
| `--surface-hover` | `#221E1C` | Survol de carte, chip actif | — |
| `--surface-sunken` | `#080707` | Images sans photo, piste de slider | — |
| `--text-primary` | `#F4F0E8` | Titre, prix, texte courant | **17,19:1** / base · 16,30:1 / carte |
| `--text-secondary` | `#C2B8AC` | Paragraphes, méta lisible | **10,00:1** / base · 9,48:1 / carte |
| `--text-tertiary` | `#8F857A` | Horodatage, compteur, légende | **5,40:1** / base · 5,12:1 / carte · 4,83:1 / overlay |
| `--accent` | `#8E2337` | Fond du CTA, badge, actif | **8,59:1** (blanc dessus) |
| `--accent-hover` | `#A62C42` | Survol du CTA | **6,86:1** (blanc dessus) |
| `--accent-ui` | `#C04A63` | Élément d'UI sur fond sombre (slider, puce, contour actif) | **4,10:1** / base · 3,88:1 / carte ✅ 1.4.11 |
| `--accent-text` | `#E39AA9` | **Texte** accent sur fond sombre | **8,81:1** / base · 7,76:1 / accent-soft |
| `--accent-soft` | `#2A1519` | Fond de badge / pastille douce | — |
| `--champagne` | `#D9C7AC` | Filets, labels sur sombre, icônes | **11,83:1** / base · 11,22:1 / carte |
| `--champagne-soft` | `#221E19` | Bandeau de section, aplat secondaire | — |
| `--line` | `#2A2622` | Filet de carte, séparateur, bordure de panneau (**jamais** sur un contrôle) | — |
| `--line-strong` | `#6E655C` | **Bordure de champ** (≥ 3:1) | **3,42:1** / base · 3,24:1 / carte ✅ 1.4.11 |
| `--focus` | `#E2C79E` | Anneau de focus | **12,00:1** / base · 11,38:1 / carte ✅ |
| `--success` | `#5FBF8E` | Payé, livré, réussi | 8,68:1 / base · 8,23:1 / carte ✅ |
| `--danger` | `#E5807A` | Erreur, suppression, hors stock | 7,17:1 / base · 6,79:1 / carte ✅ |

### 3.3 Palette — thème secondaire « Blanc Ivoire » (clair)

| Token | Hex | Usage | Ratio vérifié |
|---|---|---|---|
| `--surface-base` | `#FBF9F5` | Fond de page (**jamais `#FFFFFF`**) | — |
| `--surface-raised` | `#FFFFFF` | Cartes | — |
| `--surface-overlay` | `#FFFFFF` | Modales, champs (avec verre ivoire) | — |
| `--surface-hover` | `#F4F0E8` | Survol | — |
| `--surface-sunken` | `#F1EDE4` | Piste de slider, zone d'image | — |
| `--text-primary` | `#1A1714` | Titre, prix | **16,97:1** / base · 17,85:1 / carte |
| `--text-secondary` | `#5C554D` | Paragraphes | **6,98:1** / base · 7,34:1 / carte |
| `--text-tertiary` | `#756C62` | Méta, légende | **4,90:1** / base · 5,15:1 / carte |
| `--accent` | `#7A1B2E` | Fond du CTA | **10,38:1** (blanc dessus) |
| `--accent-hover` | `#5E1424` | Survol du CTA | **13,11:1** (blanc dessus) |
| `--accent-ui` | `#7A1B2E` | Élément d'UI | **9,87:1** ✅ |
| `--accent-text` | `#7A1B2E` | Texte accent | **9,87:1** / base · 8,79:1 / accent-soft |
| `--accent-soft` | `#F6E9EC` | Fond de badge | — |
| `--champagne` | `#8A6B39` | Texte/label doré sur clair | **4,71:1** / base · 4,95:1** / carte ✅ |
| `--champagne-soft` | `#F3EDE1` | Bandeau de section | — |
| `--line` | `#E6E0D6` | Filet de carte, séparateur | — |
| `--line-strong` | `#8E8373` | Bordure de champ | **3,54:1** / base · 3,72:1 / carte ✅ |
| `--focus` | `#7A1B2E` | Anneau de focus | **9,87:1** ✅ |
| `--success` | `#2F6B4F` | Payé, livré | 5,98:1 ✅ |
| `--danger` | `#A32C22` | Erreur | 6,79:1 ✅ |

> **Règle de bascule du thème.** Le thème sombre est **le thème par défaut** (`web/index.html:15` conserve ce comportement, clé `rv:theme`). Le clair n'est pas « le même design inversé » : c'est **Blanc Ivoire**, avec de vrais plans (base ivoire, cartes blanches) — la correction de la faille n° 2.

### 3.4 Correspondance ancien → nouveau (coupe-circuit)

| Ancien (à supprimer) | Nouveau | Où c'est utilisé aujourd'hui |
|---|---|---|
| `--terra`, `--terra-dark` | **selon le rôle** : `--accent-text` (texte) · `--accent` (fond) · `--accent-ui` (filet, icône) | 26 usages : `bureau.css:129,140,153,158,198,203,270,285,342,356,359,420,421,446,475,483,496,504,527,534,538,554,567,570,605,673,974` |
| `--bordeaux` | **selon le rôle** : `--accent-text` (texte) · `--accent` (fond) · `--accent-ui` (filet) | 44 usages : `bureau.css:796,797,800,1227,1235,1250,1253,1255,1265,1270,1276,1281,1315,1316,1320,1352,1360,1366,1369,1370,1371,1378,1380,1381,1390,1399,1401,1408,1411,1416,1426,1428,1429,1436,1441,1443,1458,1461,1474,1479,1510,1513` |
| `--champ` | `--champagne` | `bureau.css:95,147,229,232,254,314,320,374,376,452,476,498` |
| `--champagne` (hairline) | `--line` (filet) · `--champagne` (texte/métal) | 45 usages : `bureau.css:1225,1230,1232,1237,1252,1266,1275,1278,1280,1297,1305,1334,1340,1341,1346,1350,1357,1381,1386,1396,1406,1408,1421,1423,1424,1427,1434,1435,1440,1451,1456,1458,1463,1470,1472,1478,1490,1501,1503,1505,1506,1508,1509,1511` |
| `--brown`, `--brown-2` | `--text-secondary` / `--surface-overlay` | `bureau.css:498,502,504` |
| `--muted` | `--text-secondary` | `bureau.css:197, 207, 360, 501, 1413` |
| `--muted-2` | `--text-tertiary` | `bureau.css:199, 1748, 1751` |
| `--ivory` | `--surface-base` / `--surface-overlay` | `bureau.css:502, 534, 567` |
| `--ivory-2` | `--surface-sunken` | `bureau.css:570` |
| `--brown`, `--brown-2` | `--text-secondary` / `--surface-overlay` | `bureau.css:494, 498, 502, 505` |
| `--line`, `--line-2` | `--line`, `--line-strong` | `bureau.css:497` + blocs sémantiques `1540-1649` |
| `--color-accent` (sombre) | `--accent-ui` **quand c'est un élément d'UI**, `--accent` pour un fond | `bureau.css:158,421,1755,1832…` |
| `--color-terracotta`, `--color-terracotta-ink`, `--color-terracotta-soft` (admin) | **inchangés** — l'admin n'est pas re-skinné | `index.css:85-89` |

### 3.5 Dégradés

| Usage | Valeur exacte |
|---|---|
| Voile (modale, drawer) | `rgba(8, 7, 7, 0.72)` (sombre) · `rgba(26, 23, 20, 0.38)` (clair) |
| Héros — voile bas (lisibilité du H1 sur photo) | `linear-gradient(180deg, rgba(8,7,7,0) 0%, rgba(8,7,7,.72) 100%)` |
| Verre de champ | `rgba(244,240,232,.08)` + `backdrop-filter: blur(20px) saturate(1.1)` (sombre) · `rgba(255,255,255,.72)` + `blur(20px)` (clair) |
| Halo du CTA | `0 8px 28px -12px rgba(142,35,55,.55)` |
| Pastille or | `linear-gradient(135deg, #E7D6B8 0%, #C4A878 100%)` |

### 3.6 Typographie

**Deux familles, pas une de plus.**

| Rôle | Famille | Source |
|---|---|---|
| Texte, interface, chiffres | **Manrope** (variable 400–800, auto-hébergée) | `web/src/index.css:6-24` |
| Voix : titres de section, nom de produit, chiffres éditoriaux | **DM Serif Display** (400) | `web/src/index.css:25-43` |

> `Plus Jakarta Sans` (`index.css:44-63`) est **réservée à l'admin**. Elle ne doit plus être référencée dans le scope `.market-site` (actuellement réinjectée par `index.css:119` puis contredite par `index.css:394` — voir §10, étape 12).

**Échelle fermée — 9 tailles, rien d'autre.**

| Token | Taille | Famille / poids | Interligne | Usage |
|---|---|---|---|---|
| `--fs-display` | `clamp(38px, 5.2vw, 64px)` | Serif / 400 | 1.04 | H1 héros |
| `--fs-h1` | `clamp(30px, 3.4vw, 42px)` | Serif / 400 | 1.08 | Titre de page |
| `--fs-h2` | `clamp(24px, 2.2vw, 30px)` | Serif / 400 | 1.14 | Titre de section |
| `--fs-h3` | `20px` | Serif / 400 | 1.26 | Titre de carte / sous-titre |
| `--fs-body` | `16px` | Sans / 400 | 1.6 | Texte courant |
| `--fs-body-s` | `15px` | Sans / 400 | 1.55 | Texte secondaire, description |
| `--fs-meta` | `13px` | Sans / 500 | 1.45 | Méta, légende, date |
| `--fs-label` | `11px` | Sans / 700 | 1 | Eyebrow, uppercase, `letter-spacing:.22em` |
| `--fs-price` | `17px` | Sans / 700 | 1.2 | Prix (carte, ligne de panier) — `font-variant-numeric: tabular-nums` |
| `--fs-price-lg` | `22px` | Sans / 700 | 1.15 | Prix de mise en avant (fiche produit, total panier) — `tabular-nums` |

Règles : le **corps** ne descend jamais sous 13 px ; le **prix** est toujours ≥ 15 px (sinon il perd son rôle de point d'entrée) ; les majuscules sont réservées aux labels (`--fs-label`) ; `letter-spacing` négatif uniquement sur les titres serif (`-.015em`).

### 3.7 Espacements

Échelle unique de 4 px : `--s-1: 4px` · `--s-2: 8px` · `--s-3: 12px` · `--s-4: 16px` · `--s-5: 20px` · `--s-6: 24px` · `--s-8: 32px` · `--s-10: 40px` · `--s-14: 56px` · `--s-20: 80px`.

| Contexte | Valeur |
|---|---|
| Gouttière de page | `clamp(16px, 4vw, 44px)` (inchangé, `bureau.css:62`) |
| Largeur max | `1300px` (inchangé) |
| Padding de section | `clamp(44px, 7vw, 88px)` (inchangé) |
| Padding de section « tight » | `clamp(28px, 4vw, 48px)` |
| Padding de carte | `16px` (au lieu du `8px 8px 14px` de `bureau.css:1696`) |
| Écart entre cartes | `clamp(24px, 2.6vw, 40px)` colonne / `clamp(24px, 3vw, 48px)` ligne |
| Padding de champ | `12px 14px` |
| Hauteur de champ | `48px` |
| Bouton | `52px` (primaire) / `44px` (secondaire) / `36px` (tertiaire) |
| Icone seule | `44px` (voir §7, correction de la faille n° 11) |

### 3.8 Rayons — 5 valeurs, pas plus

| Token | Valeur | Usage |
|---|---|---|
| `--r-xs` | `8px` | Vignette, pastille, mini-avatar |
| `--r-sm` | `12px` | Champ, chip, bouton compact |
| `--r-md` | `16px` | **Carte**, bouton, section — valeur par défaut |
| `--r-lg` | `20px` | Modale, bottom sheet, tuile catégorie |
| `--r-pill` | `999px` | Badge, pastille, avatar |

Règle : **tout ce qui est cliquable en surface plate = `--r-md`**. Les angles « objets photographiques » (`.card .im`) = `--r-xs`.

### 3.9 Ombres — courtes, chaudes, jamais noires

| Token | Valeur | Usage |
|---|---|---|
| `--shadow-xs` | `0 1px 2px rgba(8,7,7,.30)` | Filet d'ombre sous une carte au repos |
| `--shadow-sm` | `0 2px 10px rgba(8,7,7,.28)` | Carte au repos |
| `--shadow-md` | `0 10px 28px -14px rgba(8,7,7,.55)` | Survol de carte, barre de filtre |
| `--shadow-lg` | `0 24px 60px -28px rgba(8,7,7,.70)` | Modale, bottom sheet |
| `--shadow-cta` | `0 8px 28px -12px rgba(142,35,55,.55)` | Bouton primaire au repos |

En thème clair, remplacer `rgba(8,7,7,x)` par `rgba(26,23,20,x)` avec des alpha plus faibles (`--shadow-sm: 0 2px 10px rgba(26,23,20,.07)`).

### 3.10 Mouvement

| Token | Valeur | Usage |
|---|---|---|
| `--ease` | `cubic-bezier(.2,.8,.2,1)` | Entrées, transitions standard |
| `--ease-out` | `cubic-bezier(.4,0,1,1)` | Sorties (fermeture de sheet) |
| `--ease-spring` | `cubic-bezier(.2,1.2,.35,1)` | Retour d'appui, pop de badge |
| `--t-fast` | `160ms` | Couleur, opacité, bordure |
| `--t` | `240ms` | Transformation, élévation |
| `--t-slow` | `400ms` | Révélation au défilement |

⚠️ Le `--ease` actuel est `cubic-bezier(.2,.75,.25,1)` (`bureau.css:45`) : à remplacer par la valeur ci-dessus (plus nette, moins «Translations »).

### 3.11 Fichier à créer — `web/src/styles/tokens.css`

```css
/* =====================================================================
   TOKENS REVENDS — SOURCE UNIQUE DE VRAIE (site public .market-site)
   ---------------------------------------------------------------------
   ÉCRASE les jetons homonymes de bureau.css (généré) ET de index.css.
   Ordre d'import : index.css → bureau.css → tokens.css → bureau-fixes.css
   Ne jamais dupliquer un token ailleurs que dans ce fichier.

   Les jetons de FORME (rayons, espacements, typographie, mouvement) sont
   identiques dans les deux thèmes : ils sont déclarés UNE SEULE FOIS sur
   `.market-site` en fin de fichier, hors des blocs par thème.
   ===================================================================== */

/* ---------- THÈME CLAIR « Blanc Ivoire » (par défaut) ---------- */
.market-site,
:root[data-theme="light"] .market-site {
  color-scheme: light;

  /* Surfaces */
  --surface-base: #FBF9F5;
  --surface-raised: #FFFFFF;
  --surface-overlay: #FFFFFF;
  --surface-hover: #F4F0E8;
  --surface-sunken: #F1EDE4;

  /* Texte */
  --text-primary: #1A1714;
  --text-secondary: #5C554D;
  --text-tertiary: #756C62;

  /* Accent bordeaux */
  --accent: #7A1B2E;
  --accent-hover: #5E1424;
  --accent-ui: #7A1B2E;
  --accent-text: #7A1B2E;
  --accent-soft: #F6E9EC;

  /* Champagne */
  --champagne: #8A6B39;
  --champagne-soft: #F3EDE1;

  /* États */
  --success: #2F6B4F;
  --success-soft: #E1EFE6;
  --danger: #A32C22;
  --danger-soft: #F7E4E1;

  /* Traits */
  --line: #E6E0D6;
  --line-strong: #8E8373;
  --focus: #7A1B2E;

  /* Voile & ombres */
  --overlay: rgba(26, 23, 20, 0.38);
  --shadow-xs: 0 1px 2px rgba(26,23,20,.05);
  --shadow-sm: 0 2px 10px rgba(26,23,20,.07);
  --shadow-md: 0 10px 28px -14px rgba(26,23,20,.22);
  --shadow-lg: 0 24px 60px -28px rgba(26,23,20,.28);
  --shadow-cta: 0 8px 28px -12px rgba(122,27,46,.42);

  /* Verre de champ */
  --field-glass-bg: rgba(255,255,255,.72);
  --field-glass-border: rgba(26,23,20,.48);        /* 3,19:1 ✅ 1.4.11 */
  --field-glass-border-strong: rgba(26,23,20,.62);
  --field-glass-placeholder: rgba(26,23,20,.62);   /* 4,97:1 ✅ AA */
  --field-glass-focus: #7A1B2E;

  /* Pont vers les anciens noms (migration) — à supprimer quand §10 est terminé */
  --terra: var(--accent);
  --terra-dark: var(--accent-hover);
  --bordeaux: var(--accent);
  --champ: var(--champagne);
  --ink: var(--text-primary);
  --muted: var(--text-secondary);
  --muted-2: var(--text-tertiary);
  --ivory: var(--surface-base);
  --ivory-2: var(--surface-sunken);
  --brown: var(--text-secondary);
  --brown-2: var(--surface-overlay);
  --line-2: var(--line);
}

/* ---------- THÈME SOMBRE « Bordeaux Nuit » (DOMINANT) ---------- */
:root[data-theme="dark"] .market-site {
  color-scheme: dark;

  --surface-base: #0D0C0B;
  --surface-raised: #151312;
  --surface-overlay: #1C1917;
  --surface-hover: #221E1C;
  --surface-sunken: #080707;

  --text-primary: #F4F0E8;
  --text-secondary: #C2B8AC;
  --text-tertiary: #8F857A;

  --accent: #8E2337;
  --accent-hover: #A62C42;
  --accent-ui: #C04A63;      /* élément d'UI : 4,10:1 base · 3,88:1 carte ✅ */
  --accent-text: #E39AA9;   /* texte accent : 8,81:1 ✅ */
  --accent-soft: #2A1519;

  --champagne: #D9C7AC;
  --champagne-soft: #221E19;

  --success: #5FBF8E;
  --success-soft: #16241C;
  --danger: #E5807A;
  --danger-soft: #2A1715;

  --line: #2A2622;
  --line-strong: #6E655C;   /* bordure de champ : 3,42:1 base · 3,24:1 carte ✅ */
  --focus: #E2C79E;         /* anneau de focus : 12,00:1 ✅ */

  --overlay: rgba(8, 7, 7, 0.72);
  --shadow-xs: 0 1px 2px rgba(0,0,0,.30);
  --shadow-sm: 0 2px 10px rgba(0,0,0,.28);
  --shadow-md: 0 10px 28px -14px rgba(0,0,0,.55);
  --shadow-lg: 0 24px 60px -28px rgba(0,0,0,.70);
  --shadow-cta: 0 8px 28px -12px rgba(142,35,55,.55);

  --field-glass-bg: rgba(244,240,232,.08);
  --field-glass-border: rgba(244,240,232,.40);     /* 3,47:1 ✅ 1.4.11 */
  --field-glass-border-strong: rgba(244,240,232,.58);
  --field-glass-placeholder: rgba(244,240,232,.52);/* 4,91:1 ✅ AA */
  --field-glass-focus: #E2C79E;

  /* Pont vers les anciens noms — TEMPORAIRE, À SUPPRIMER APRÈS LE CODEMOD
     (§3.12, §10 étape 4). Tant que le codemod n'a pas tourné, `--terra` et
     `--bordeaux` servent à la fois de fond et de texte : le codemod est
     OBLIGATOIRE, pas une option. */
  --terra: var(--accent);        /* fond : blanc dessus = 8,59:1 */
  --terra-dark: var(--accent-hover);
  --bordeaux: var(--accent);     /* idem — mélange fond/texte à résoudre */
  --champ: var(--champagne);
  --ink: var(--text-primary);
  --muted: var(--text-secondary);
  --muted-2: var(--text-tertiary);
  --ivory: var(--surface-overlay);
  --ivory-2: var(--surface-sunken);
  --brown: var(--text-secondary);
  --brown-2: var(--surface-overlay);
  --line-2: var(--line);
}

/* ---------- FORME, TYPO, ESPACEMENT, MOUVEMENT (identiques aux 2 thèmes) ---------- */
.market-site {
  /* Typographie — 2 familles publiques */
  --font-sans: "Manrope", system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --font-display: "DM Serif Display", Georgia, "Times New Roman", serif;

  --fs-display: clamp(38px, 5.2vw, 64px);
  --fs-h1:      clamp(30px, 3.4vw, 42px);
  --fs-h2:      clamp(24px, 2.2vw, 30px);
  --fs-h3:      20px;
  --fs-body:    16px;
  --fs-body-s:  15px;
  --fs-meta:    13px;
  --fs-label:   11px;
  --fs-price:   17px;
  --fs-price-lg:22px;

  /* Espacements (échelle de 4 px) */
  --s-1:4px;  --s-2:8px;  --s-3:12px; --s-4:16px; --s-5:20px;
  --s-6:24px; --s-8:32px; --s-10:40px; --s-14:56px; --s-20:80px;

  /* Rayons */
  --r-xs:8px; --r-sm:12px; --r-md:16px; --r-lg:20px; --r-pill:999px;

  /* Mouvement */
  --ease:        cubic-bezier(.2,.8,.2,1);
  --ease-out:    cubic-bezier(.4,0,1,1);
  --ease-spring: cubic-bezier(.2,1.2,.35,1);
  --t-fast:.16s; --t:.24s; --t-slow:.4s;

  /* Pont vers les noms consommés par bureau.css / editorial.css */
  --sans:  var(--font-sans);
  --serif: var(--font-display);
  --r:     var(--r-md);   /* le --r de bureau.css (12px) devient 16px */
}
```

> **Le pont `--terra` / `--bordeaux` ci-dessus est un pansement, pas une correction.**
> La cause racine n'est pas le token mais la **couche `editorial`** : `.eyebrow` (`vendor/editorial.css:102`), `.card .cat-lbl` (`:150`) et `.buy .cat-lbl` (`:198`) surchargent la maquette avec `color:var(--bordeaux)` — **et `--bordeaux` porte deux rôles** (fond du badge vendeur, texte du label). Aucun pont CSS ne peut trancher : il faut **remplacer le jeton à chaque usage** selon son rôle (§3.12). C'est l'objet du codemod `web/scripts/migrate-accent-tokens.mjs` (§10, étape 4), **à faire avant** toute vérification de contraste.

### 3.12 Règle de remplacement des jetons legacy (à appliquer par codemod)

> **Pourquoi un codemod ?** `--terra` et `--bordeaux` servent aujourd'hui **deux rôles opposés** : *fond* (`.btn.terra`, `.card .flag`, `.seller .av`) et *texte* (`.card .cat-lbl`, `.eyebrow`, `.buy .cat-lbl`). Aucun pont CSS ne peut les distinguer. Il faut donc **remplacer le jeton au bon endroit**, propriété par propriété. C'est mécanique : `web/scripts/migrate-accent-tokens.mjs` (à créer — §10, étape 4) applique la table ci-dessous sur `web/src/bureau/vendor/*.css`, puis `npm run css:scope` régénère `bureau.css`.

| Propriété d'origine | Legacy | Remplacement | Contrôle |
|---|---|---|---|
| `color:` | `--terra`, `--bordeaux` | `--accent-text` | texte ≥ 4,5:1 |
| `color:` | `--champagne`, `--champ` | `--champagne` | métal sur fond sombre |
| `background:` | `--terra`, `--bordeaux` | `--accent` | texte blanc dessus ≥ 4,5:1 |
| `border-color:`, `border:` | `--terra`, `--bordeaux` | `--accent-ui` | ≥ 3:1 |
| `border:` | `--champagne` | `--line` | filet décoratif |
| `accent-color:` | `--terra`, `--bordeaux` | `--accent-ui` | ≥ 3:1 |
| `box-shadow:`, `outline:` | `--terra` | `--focus` | anneau ≥ 3:1 |

**Cas particuliers (traités à la main, pas par le codemod) :**

- `.seller .av` / `.acct .who .av` (`vendor/editorial.css:226`) → `background:var(--accent); color:var(--text-primary)` : l'initiale du vendeur est du **texte sur aplat**, pas du texte accent.
- `.card .cat-lbl` / `.eyebrow` / `.buy .cat-lbl` → `--accent-text` : ces trois libellés sont du texte, pas des éléments d'UI.
- `.inp`/`.sel`, `.cbtn`/`.chip`, `.search input`, `.qty`, `.drop`, `.thumbs button` → bordure `--line-strong` (≥ 3:1), **jamais** `--line` ni `--champagne` : la bordure est le seul indice d'existence du contrôle (faille n° 13). Le codemod ne peut pas le deviner : ces règles se distinguent par leur **sélecteur**, pas par leur propriété → traitement manuel dans `vendor/styles.css` / `vendor/theme.css` / `vendor/editorial.css`.
- `.card .fav` → `background:var(--surface-overlay)` au lieu de `#FFFFFF` codé en dur (`vendor/theme.css:201`).

**Après codemod, le pont legacy de §3.11 n'est plus nécessaire** : `--terra`, `--bordeaux`, `--champagne` disparaissent des règles. On supprime alors les lignes de pont de `tokens.css` et le système n'a plus qu'une seule grammaire.

---

## 4. Composants

### 4.1 Bouton — une seule implémentation

**Source de vérité : la classe `.btn` de `bureau.css`.** `web/src/components/ui/Button.tsx` devient un wrapper qui émet `.btn` (+ `.terra`, `.ghost`, `.light`, `.quiet`) au lieu de classes Tailwind. Suppression de `buttonClasses()` comme générateur de classes utilitaires.

| Variante | Fond | Texte | Bordure | Usage |
|---|---|---|---|---|
| `.btn` (primaire) | `--accent` | `--text-primary` (blanc ivoire) | `--accent` | Action unique et décisive : « Ajouter au panier », « Voir les 12 articles » |
| `.btn.terra` | `--accent` | blanc | `--accent` | Variante accentuée, réservée à l'action du héros |
| `.btn.ghost` | transparent | `--text-primary` | `--line-strong` | Action secondaire : « Favori », « Filtrer » |
| `.btn.light` | `--surface-overlay` | `--text-primary` | `--line` | Action sur fond photographique (héros, éditorial) |
| `.btn.quiet` | transparent | `--accent-text` | none | Lien d'action : « Réessayer », « Voir tout » |

**Anatomie**

- Hauteur : `52px` (primaire) · `44px` (secondaire) · `36px` (tertiaire, desktop uniquement).
- Rayon : `--r-md` (16 px) — **plus de `rounded-md` Tailwind ni de `--r` 12 px**.
- Typographie : Manrope 700, `12px`, `letter-spacing:.14em`, **majuscules**, `text-transform: uppercase`.
- Padding horizontal : `26px` ; gap icône/texte : `10px`.
- Icône : sprite SVG `.i` 16 px, `fill: currentColor`.

**États (obligatoires, documentés pour le code)**

| État | Traitement |
|---|---|
| Repos | cf. ci-dessus |
| Hover | `--accent-hover` (ou `--surface-hover` pour ghost) + `translateY(-1px)` sur 240 ms |
| Press | `scale(.98)` + retour `--ease-spring` 180 ms + `shadow-cta` réduit |
| Focus clavier | `outline: 2px solid var(--focus)` · `outline-offset: 3px` · **jamais supprimé** |
| Disabled | `opacity: .45` · `cursor: not-allowed` · `pointer-events: none` |
| Loading | Texte **conservé** (pas de saut de largeur), spinner SVG inline à gauche, `aria-busy="true"` |
| Navigation (`<Link>`) | Mêmes classes, `min-height` identique, `aria-current` quand actif |

### 4.2 Champ de formulaire

| État | Traitement |
|---|---|
| Repos | Fond `--field-glass-bg` + `backdrop-filter: blur(20px)`, bordure `1px solid --field-glass-border`, rayon `--r-sm`, hauteur 48 px, padding `12px 14px` |
| Placeholder | `--field-glass-placeholder` (≥ 4,5:1 — mesuré : **4,97:1** clair, **4,91:1** sombre) |
| Hover | `--field-glass-border-strong` |
| Focus | `border-color: var(--focus)` + `box-shadow: 0 0 0 3px color-mix(in srgb, var(--focus) 28%, transparent)` + `outline: none` **uniquement** si `:focus-visible` est visuellement équivalent |
| Erreur | `border-color: var(--danger)` + halo `rgba(168,44,34,.16)` + message sous le champ en `--danger`, `role="alert"` |
| Disabled | `opacity: .55`, `cursor: not-allowed` |
| Sans `backdrop-filter` | Repli opaque via `@supports not (backdrop-filter: blur(1px))` (déjà en place, `bureau-fixes.css:614`) |

> **Verre de champ unifié.** La décision existante (`bureau-fixes.css:526-559` : verre ivoire teinté pour **tous** les champs) est **conservée**. Seules les valeurs changent : `--field-glass-*` passent dans `tokens.css` et `bureau-fixes.css:561-566` devient un simple renvoi.

### 4.3 Carte produit

`web/src/components/site/SiteCard.tsx` — anatomie cible :

```
┌──────────────────────────────┐
│  [photo 3/4]        (−24 %)  │  ← flag remise : badge bordeaux, 11px/700
│                      ( ♥ )   │  ← favori : cible 44×44, blanc, contour initial
├──────────────────────────────┤
│ MODE                          │  ← --fs-label, --accent-text  (8,35:1)
│ Manteau de laine gris         │  ← --fs-h3, serif, --text-primary
│ Excellent · Dakar            │  ← --fs-meta, --text-secondary
│ 45 000 FCFA   60 000 FCFA    │  ← --fs-price, tabular-nums ; prix barré --text-tertiary
└──────────────────────────────┘
```

- Fond `--surface-raised`, rayon `--r-md`, `padding: 16px`, bordure `1px solid var(--line)`, ombre `--shadow-sm`.
- Photo : `aspect-ratio: 3/4`, rayon `--r-xs`, fond `--surface-sunken`.
- **Survol** : élévation `--shadow-md` + `translateY(-3px)` (240 ms) + bordure `--line-strong`.
- Le **prix** est le point focal : 17 px / 700 / `tabular-nums`. Le titre produit passe à `--fs-h3` serif (20 px) pour créer un vrai contraste de registre avec le prix sans-serif.
- `.by` (mention du vendeur) : **supprimé de la carte** (le champ n'existe pas dans l'API — `SiteCard.tsx:17-18`). Le compteur de likes ne ment pas.
- Sur mobile (< 760 px) : la méta passe en `--fs-meta` 12 px au lieu d'être masquée (`bureau.css:1717` la masque aujourd'hui → perte d'information).

### 4.4 Badges, pastilles et étiquettes

| Élément | Fond | Texte | Rayon |
|---|---|---|---|
| Remise (`−24 %`) | `--accent` | blanc | `--r-pill` |
| État (`Excellent`) | `--surface-overlay` | `--text-primary` | `--r-pill` |
| Badge doux (attente) | `--champagne-soft` | `--champagne` (clair) / `--text-primary` (sombre) | `--r-pill` |
| Pastille non lue | `--accent` | — | `--r-pill`, 8 px |

Tous les badges : hauteur 24 px, `font: 700 11px/1 var(--sans)`, `letter-spacing: .12em`, uppercase. **Toujours** 2 indices quand un état est critique (couleur + texte + icône).

### 4.5 Navigation

- **Barre haute** (`top-strip`) : fond `--surface-raised`, texte `--text-secondary`, filet `--line`. Les accroches (`bureau.css:147` `color: var(--champ)`) passent en `--champagne` → **11,83:1** en sombre, plus de l'or `--champ` sur fond clair.
- **En-tête** : logo `REVENDS` (Manrope 700, `letter-spacing:.22em`, 20 px) + point bordeaux. Le point (`bureau.css:153`) passe en `--accent-ui` (3,20:1 ✅) au lieu de `--terra` (2,32:1 ❌).
- **Univers** (`nav.cats`) : 6 liens, 13 px, `--text-secondary` ; actif = `--text-primary` + soulignement `--accent-ui` 1,5 px ; focus = anneau `--focus`.
- **Recherche** : champ verre, largeur 320 px, icône `.i` 18 px, suggestions en popover `--surface-overlay` + `--shadow-lg` + rayon `--r-lg`.
- **Actions** : favoris, panier, compte, thème — **icônes seules, cible 44×44**, pastille de compteur `--accent` (10 px) en haut à droite, animation `pop` 400 ms.
- **Menu mobile** (`.mmenu`) : plein écran `--surface-base`, CTA « Vendre un article » en `--accent` en tête, univers en grille 2 colonnes (icônes 24 px), sections « Mon espace » et « Compte & préférences ».
- **Cibles** : `.ic` et `.burger` passent de ~34 px à **44×44 px** (faille n° 11).

### 4.6 Pied de page

- Fond `--surface-base` + filet `--line` ; **jamais** du noir dur en thème sombre (le footer sombre sur fond sombre « tombe »).
- 4 colonnes : identité+baseline / Découvrir / Vendre / Mon compte.
- Baseline : « Les belles choses méritent une nouvelle histoire. » (déjà dans `Footer.tsx:38` — à garder).
- Liens : `--text-secondary` (7,83:1+), survol `--text-primary`, focus anneau `--focus`, `min-height: 44px` (la correction actuelle `bureau-fixes.css:52-64` ne fixe que la zone de texte, pas la cible).
- Réseaux sociaux : **liens réels obligatoires** — tant que les URL ne sont pas fournies, les remplacer par un lien « Suivre ReVends » unique et non trompeur (au lieu de 3 liens morts vers `/`).

### 4.7 Tableau (Mes articles / Mes commandes)

`bureau-fixes.css:230-272` (`.rv-tab`) — conserver la table sémantique, mais :
- en-tête : `--fs-meta` 13 px / 700, `--text-tertiary`, `letter-spacing:.08em`, uppercase ;
- cellules : `--fs-body-s` 15 px, `--text-primary`, padding `14px 12px`, filet `--line` ;
- montant : `--fs-price` 17 px / 700 + `tabular-nums` ;
- ligne survolée : fond `--surface-hover` ;
- **mobile** : la table défile horizontalement (`overflow-x:auto`) avec un ombrage de bord — pas de `min-width:640px` qui casse la page (`bureau-fixes.css:232`).

### 4.8 États vides, chargement, erreur

| État | Gabarit | Contenu |
|---|---|---|
| **Vide** | `.empty` + mascotte « la Boucle » 64 px (`Mascotte.tsx:25`) | Titre `--fs-h2`, texte `--fs-body-s` `--text-secondary`, **une seule action** `.btn` |
| **Chargement** | `ProductGridSkeleton` (`Loading.tsx:37`) | Le squelette **reproduit la silhouette exacte** de la carte finale (photo 3/4 + 2 lignes + prix) — règle déjà posée, à conserver |
| **Chargement spinner** | `PageLoader` (`Loading.tsx:140`) | Remplacer Font Awesome (`Loading.tsx:143`) par le sprite `.i` (voir §10 étape 8) |
| **Erreur** | `.empty` + `role="alert"` | Titre factuel (« Impossible de charger les articles »), message de l'API (`ApiError.readableMessage()`), action « Réessayer » |
| **404** | `.empty` `level={1}` | « Cette page n'existe pas » + 2 actions (accueil / catalogue) |
| **Hors ligne** | `.note.warn` | « Vérifiez votre connexion et réessayez. » |

> Règle non négociable : **aucun écran vide sans action.** (`States.tsx:13-15` l'énonce déjà.)

### 4.9 Illustration de remplacement (photo manquante)

`web/src/components/site/SiteImage.tsx` — les valeurs `col` / `bg` plaquées (`SiteImage.tsx:20,123-124` et `HomeView.tsx:66-67,164-165,244-245`, `AuthView.tsx:96-97`) sont **remplacées par des tokens** :

| Contexte | Fond | Trait |
|---|---|---|
| Thème sombre | `--surface-sunken` `#080707` | `--champagne` `#D9C7AC` (11,83:1) |
| Thème clair | `--surface-sunken` `#F1EDE4` | `--champagne` `#8A6B39` (4,71:1) |

Le tracé du placeholder reste celui de `SiteImage.tsx:44-64` (il est lisible sur les deux fonds une fois les couleurs tokenisées). Les 6 genres (`coat`, `shoe`, `bag`, `phone`, `lamp`, `cam` — `SiteImage.tsx:20-70`) sont conservés : ils correspondent aux univers réels.

---

## 5. Écrans

### 5.1 Accueil `/` — `HomeView.tsx`

**Idée dominante : une accroche éditoriale pleine page, puis une sélection qui respire.**

1. **Héros** (`.masthead`) — photo plein cadre, voile `linear-gradient(180deg, transparent, rgba(8,7,7,.72))`, contenu calé à gauche sur grille 12 colonnes, largeur max 640 px.
   - Eyebrow `--fs-label` `--champagne` (11,83:1).
   - H1 `--fs-display` serif ivoire, un seul mot en italique champagne (`bureau.css:232`).
   - Lead `--fs-body` 17 px, `--text-secondary` sur la photo → **passer en blanc à 92 %** (`rgba(255,255,255,.92)`) pour rester lisible sur n'importe quelle image.
   - Deux actions : `.btn.terra` « Explorer la sélection » + `.btn.ghost` sur fond clair « Vendre un article ».
   - Le scroll `↓` (`HomeView.tsx:188`) → **icône sprite `chevron-down`** (faille n° 8).
2. **Pont éditorial** (`.mh-bridge`) — bande `--champagne-soft`, une phrase serif 28 px + un lien-flèche.
3. **Univers** (`.catgrid`) — 6 tuiles bento, ratio 3/4, image plein cadre, dégradé bas + libellé ivoire. La 1ʳᵉ est la signature (2×2). **Correction de copy : « Cinq familles, mille trouvailles » → « Six univers, mille trouvailles »** (6 univers réels, `menus.ts:25-32`).
4. **Nouveautés** — titre de section `--fs-h2` + lien-flèche à droite ; grille 4 colonnes desktop / 2 mobile.
5. **Éditorial** — bloc inversé `--surface-raised` : image 46 % + texte 54 %, H2 serif 30 px, un seul bouton.
6. **Petits prix** — bande `--champagne-soft` : titre + grille 4 colonnes, pastille « Sous 25 000 FCFA ».

**Ordre de priorité visuel (ce que l'œil voit en premier)** : photo du héros → H1 → CTA bordeaux → 6 univers → titre « Les nouveautés » → grille.

### 5.2 Catalogue `/shop`, `/search`, `/category` — `ShopView.tsx`

- **Barre de résultats** collante (`.result-bar`) : compteur à gauche, tri à droite, filet `--line`, fond `--surface-raised` translucide.
- **Rail de filtres** (desktop ≥ 1080 px) : 280 px, groupes `<h3>` `--fs-label` `--text-tertiary`, options `--fs-body-s` avec case à cocher bordeaux 20 px. **Chip actif** = fond `--accent-soft`, texte `--accent-text`, bordure `--accent-ui`.
- **Barre de chips mobiles** (`.chipbar`) : scroll horizontal, `scroll-snap`, chips 44 px de haut.
- **Grille** : 3 colonnes ≥ 1080 px, 2 en dessous.
- **Aucun résultat** : `.empty` avec la mascotte + « Voir tout le catalogue » + suggestion de retirer un filtre.
- **Chargement** : `ShopSkeleton` aligné sur la silhouette finale.
- **Erreur** : `.empty` `role="alert"` + « Réessayer ».

### 5.3 Fiche article `/catalogue/:slug` — `ProductView.tsx`

Grille 2 colonnes : **galerie 55 % / achat 45 %**, espace vertical 32 px.

- **Galerie** : photo principale `aspect-ratio 4/5`, fond `--surface-sunken`, zoom au clic, vignettes 72 px avec `aria-current` en bordure `--accent-ui`.
- **Bloc achat** (l'ordre est imperative) :
  1. Eyebrow `REVENDS · Pièce unique` `--fs-label` `--accent-text`.
  2. Label de catégorie + badge d'état.
  3. **H1 produit** `--fs-h1` serif (le nom du produit est le titre de la page).
  4. **Prix** `--fs-price-lg` 22 px / 700 `tabular-nums` + prix barré `--text-tertiary` + pastille « Économisez X ».
  5. Description `--fs-body-s` `--text-secondary`, largeur 60 ch.
  6. **Actions** : `.btn.terra` plein largeur « Ajouter au panier » (52 px) + `.btn.ghost` « Favori » 44 px côte à côte (le panier est l'action unique, elle occupe 2/3).
  7. Encart de confiance (`.confbox`) : 2 lignes, icône champagne, fond `--surface-overlay`.
  8. **Fiche technique** (`.spec`) : `dt` `--fs-meta` `--text-tertiary`, `dd` `--fs-body-s` `--text-primary`, filets `--line`.
  9. **Vendeur** : avatar `--r-pill` **fond `--accent` + lettrage ivoire** (corrige la faille n° 6 : 7,55:1), nom `--text-primary`, « Membre depuis… » `--text-tertiary`.
  10. Note honnête sur l'état réel de l'article (`ProductView.tsx:370`) : `--fs-meta` `--text-tertiary`.
- **« Dans le même esprit »** : 4 cartes, même gabarit que l'accueil.

### 5.4 Panier `/panier` — `CartView.tsx`

- Titre `--fs-h1`, compteur `--fs-meta`.
- Liste : vignette 96 px + nom + méta + prix + contrôle de quantité (boutons 44×44, valeur centrée `tabular-nums`) + suppression (bouton texte `--text-tertiary` + confirmation).
- **Total** : panneau `--surface-raised` collé à droite (desktop) / pleine largeur (mobile) — montant `--fs-price-lg` 22 px / 700 `tabular-nums`, bouton `.btn.terra` 52 px pleine largeur.
- **Panier vide** : `.empty` + mascotte + « Explorer la sélection ».

### 5.5 Commande `/commande` — `CheckoutView.tsx`

3 étapes en haut (`1 · Votre panier / 2 · Livraison / 3 · Paiement`), l'étape courante marquée par `--accent` + pastille numérotée, les étapes faites par `--champagne`, les futures en `--text-tertiary`.

- Formulaire en 2 colonnes desktop (champs 240 px de haut max), 1 colonne mobile.
- Récap « Votre commande » à droite, sticky, `--surface-raised`.
- Erreur de paiement : bandeau `--danger-soft` + `role="alert"` + bouton « Réessayer ».
- Mention Mobile Money explicite, en clair, avant la validation.

### 5.6 Connexion / Inscription `/login`, `/register` — `AuthView.tsx`

- **Split 50/50** : photo plein cadre à gauche (avec parallaxe désactivée si `prefers-reduced-motion`), formulaire à droite sur `--surface-base`.
- Le verre de champ reste **unique** (décision existante conservée).
- Titre `--fs-h1` serif, intro `--fs-body-s`, formulaire 1 colonne, bouton pleine largeur 52 px.
- Les 3 arguments (`:112-137` : produits authentiques / paiement sécurisé / livraison) sont conservés **mais** réécrits sans promesse invérifiable : « Paiement Mobile Money sécurisé », « Livraison Dakar à convenir avec le vendeur », « Annonce vérifiée par l'équipe » — cette dernière **seulement** si l'admin valide réellement (sinon la retirer).

### 5.7 Espace personnel `/profil`, `/mes-articles`, `/mes-commandes`

- En-tête de compte : avatar 64 px, nom, date d'inscription, 3 statistiques (`--fs-h2` chiffre / `--fs-meta` libellé) sur `--surface-raised`.
- Onglets : `--fs-body-s`, actif `--text-primary` + filet `--accent-ui` 2 px.
- Liste de commandes : `.rv-tab` (§4.7), statut en badge (pastille + texte).
- États vides : `.empty` + mascotte + action contextualisée.

### 5.8 Publier un article `/sell` — `SellView.tsx`

- 3 sections numérotées : **Photos** → **Détails** → **Prix & livraison**.
- Zone d'upload : bordure pointillée `--line-strong`, survol `--accent-ui`, icône champagne 32 px, **zone cliquable ≥ 96 px**.
- Aperçu vivant de la fiche produit à droite (desktop) : la même carte que dans le catalogue → l'utilisateur voit exactement ce qu'il vendra.
- Bouton « Publier mon article » `.btn.terra` 52 px, sticky en bas sur mobile (avec `env(safe-area-inset-bottom)`).

### 5.9 Admin (hors périmètre de re-skin)

Le back-office garde **son** identité (terracotta) et ses composants (`components/admin/*`, `components/layout/DashboardLayout.tsx`). Seule correction admissible : aligner le **ton** et les **rayons** sur le système pour que l'admin n'ait pas l'air d'un autre produit. Aucune modification de palette sans arbitrage explicite.

---

## 6. Micro-interactions

Principe : **le mouvement explique, il ne décore pas.** Jamais plus de 400 ms, jamais de parallaxe sur mobile, jamais de mouvement si l'utilisateur l'a désactivé.

| Élément | Interaction | Durée / courbe |
|---|---|---|
| **Appui sur bouton** | `scale(.98)` + flash du halo | 180 ms `ease-spring` |
| **Survol de carte** | `translateY(-3px)` + ombre `--shadow-md` | 240 ms `--ease` |
| **Appui sur carte** | `scale(.985)` | 140 ms |
| **Ajout au panier** | Check qui remplace l'icône panier + badge qui pulse | 240 ms + pop 400 ms |
| **Badge compteur** | `scale(1) → 1.35 → 1` | 400 ms `ease-spring` |
| **Cœur favori** | `scale(1) → 1.35 → 1` + fond qui passe `--accent-soft` | 400 ms `ease-spring` |
| **Révélation au défilement** | `opacity 0→1` + `translateY(20px)→0`, cascade `--d × 70 ms` (déjà plafonnée à 4 par `index % 4` — `SiteCard.tsx:48`) | 600 ms `--ease` |
| **Ouverture de sheet** (filtres mobile) | `translateY(100%)→0` + fond flouté | 280 ms `--ease` / sortie 200 ms `--ease-out` |
| **Bascule de thème** | Transition des couleurs | 300 ms `--ease` (déjà en place, `bureau.css:1654-1660`) |
| **Menu mobile** | Voile `opacity` + panneau `translateY(-8px)` | 260 ms `--ease` |
| **Recherche — suggestions** | Apparition `opacity + translateY(-6px)` | 160 ms `--t-fast` |
| **Zoom produit** | `scale(.96)→1` + fond `opacity` | 220 ms `--ease` |
| **Toast** | Glissement `translateY(12px)→0` + fondu | 240 ms `--ease`, auto-fermeture 4 s |

**Cascade (stagger).** Un décalage de **70 ms** maximum, plafonné à 6 éléments (au-delà, les suivants apparaissent ensemble). Ne jamais faire cascader plus de 8 cartes : le délai cumulé dépasse 500 ms et l'utilisateur perçoit un retard.

**Retour haptique (mobile natif).** Sur ajout au panier, favori et changement d'étape de commande : `impactMedium`. Sur erreur de formulaire : `notificationWarning`. Sur paiement validé : `notificationSuccess`. Jamais sur un simple survol.

**`prefers-reduced-motion`.** Règle déjà présente dans `index.css:370-372` et `bureau.css` : toute transition, animation et parallaxe est neutralisée (`transition: none`, `animation: none`). À **généraliser** : toute animation ajoutée par ce document doit être écrite sous cette garde, et le `.rv` de révélation (`bureau.css:210-213`) doit basculer immédiatement en `opacity:1` quand le mouvement est réduit.

---

## 7. Accessibilité

### 7.1 Contrastes mesurés (WCAG 2.1)

**Avant → après** sur les combinaisons réellement rendues :

| Cas | Avant | Après | Verdict |
|---|---|---|---|
| Label de catégorie, carte, sombre (10,5 px gras) | `#8F2940` / `#191716` = **2,18:1** ❌ | `--accent-text` `#E39AA9` / `#151312` = **8,35:1** ✅ | AA |
| Eyebrow de section, sombre (11 px gras) | `#8F2940` / `#11100F` = **2,32:1** ❌ | `--accent-text` / `--surface-base` = **8,81:1** ✅ | AA |
| Initiale du vendeur, sombre | `#352F2C` / `#8F2940` = **1,61:1** ❌ | `#F4F0E8` / `#8E2337` = **7,55:1** ✅ | AA |
| Anneau de focus, sombre | `#8F2940` / `#11100F` = **2,32:1** ❌ | `--focus` `#E2C79E` = **12,00:1** ✅ | 1.4.11 ✅ |
| Élément d'UI accentué, sombre | `#8F2940` = **2,32:1** ❌ | `--accent-ui` `#C04A63` = **4,10:1** / base ✅ | 1.4.11 ✅ |
| Méta tertiaire, clair (13 px) | `#9A9A9A` / `#FFF` = **2,81:1** ❌ | `#756C62` = **5,15:1** ✅ | AA |
| Méta tertiaire, sombre (13 px) | `#766F69` / `#191716` = **3,61:1** ❌ | `#8F857A` = **5,12:1** ✅ | AA |
| Texte accent des suggestions, sombre (13 px gras) | `#8F2940` = **2,32:1** ❌ | `--accent-text` = **8,81:1** ✅ | AA |
| Bouton primaire | blanc / `#8E2337` = **8,59:1** ✅ | idem | AAA |
| Lien-flèche, clair | `#6B1728` = **11,81:1** ✅ | idem | AAA |
| Placeholder de champ | 4,97:1 clair · 4,91:1 sombre (composés sur le verre) | idem | AA |
| **Bordure de champ, sombre** (`.inp`, `.cbtn`, `.search input`, `.qty`, `.drop`) | `#352F2C` / `#11100F` = **1,44:1** ❌ (la bordure est le seul indice du contrôle) | `--line-strong` `#6E655C` = **3,42:1** / base ✅ | 1.4.11 ✅ |
| **Filet de carte, sombre** (`.card`, `.confbox`, `.box`) | `#352F2C` / `#211D1B` = **1,27:1** ❌ — structure invisible | `--line` `#2A2622` + ombre `--shadow-sm` : lisible par le relief, pas par le trait | Décoratif |
| Bordure de champ, clair | `#DEDEDE` / `#FFFFFF` = **1,35:1** ❌ | `--line-strong` `#8E8373` = **3,72:1** ✅ | 1.4.11 ✅ |
| Bordure de champ | `rgba(23,21,19,.48)` = 3,24:1 **sur blanc**, mais le champ est posé sur un verre translucide : le ratio réel sur le verre est à recalculer | `rgba(26,23,20,.48)` = **3,19:1** sur verre clair · `rgba(244,240,232,.40)` = **3,47:1** sur verre sombre | 1.4.11 ✅ |

### 7.2 Règles non négociables

1. **Texte** : ≥ 4,5:1 (≥ 3:1 uniquement pour le texte ≥ 18,66 px gras ou ≥ 24 px).
2. **Éléments d'UI et focus** : ≥ 3:1 contre la couleur adjacente.
3. **Un état n'est jamais signalé par la couleur seule** : couleur + texte + icône.
4. **Cible tactile ≥ 44×44 px** (`.fav`, `.ic`, `.burger`, `.qty button`, `.link-arrow`, `.col button` du footer).
5. **Focus visible partout** : `outline: 2px solid var(--focus); outline-offset: 3px` — jamais `outline: none` sans remplacement équivalent.
6. **Navigation clavier** : ordre de tabulation logique ; sheets et modales piégent le focus (`inert` sur le fond, déjà en place sur `.mmenu` — `Navbar.tsx:199`) ; `Échap` ferme (`Navbar.tsx:90`, `ShopView.tsx:170`) ; le focus **revient** au déclencheur (`ShopView.tsx:142`).
7. **Un seul `<h1>` par page** ; hiérarchie de titres sans saut (`SiteHead` gère `level` — `SiteBits.tsx:44`).
8. **Images** : `alt` toujours renseigné ; les illustrations décoratives portent `aria-hidden` (`SiteImage.tsx`, `AuthView.tsx:88`).
9. **Mouvement** : `prefers-reduced-motion` neutralise tout.
10. **Formulaires** : `<label>` associé, `aria-invalid` + message d'erreur relié par `aria-describedby`, `role="alert"` sur l'erreur d'un bloc.

### 7.3 Performance perçue

- **Polices** : `font-display: swap` (déjà en place), `preload` des 2 woff2 publics dans `web/index.html`, `unicode-range` latin + latin-ext (déjà en place). **Objectif : 0 shift de layout** → `size-adjust` / `ascent-override` à ajouter sur les `@font-face` (à mesurer avec l'outil Fontaine).
- **Images** : `SiteImage` charge en `loading="lazy"` + `decoding="async"` ; le héros est `eager` + `fetchpriority="high"` (`HomeView.tsx:162`).
- **LCP** : le splash (`SplashLoader.tsx:11-13`, 650 ms minimum + 2 600 ms de sécurité) **retarde le premier contenu**. Réduire `MIN_VISIBLE_MS` à **0** dès que l'image du héros est prête, et **supprimer le splash sur les sessions suivantes** (déjà vu en session : le splash n'a pas d'usage informationnel).
- **Parallaxe** (`HomeView.tsx:85-109`) : `root.offsetHeight` lu à chaque frame de scroll → *layout thrash*. Mesurer la hauteur **une seule fois** au montage et la conserver dans une ref.

---

## 8. Responsive — ce qui est identique, ce qui s'adapte

### 8.1 Web (règle commune avec le mobile natif)

| Identique | Adapté |
|---|---|
| Palette (tokens) | Navigation : barre haute → barre d'onglets (mobile) |
| Typographie (2 familles, 8 tailles) | Hit targets : 44 px sur mobile, 32–36 px sur desktop |
| Rayons, ombres, mouvement | Sheets : bottom sheet (mobile) vs panneau latéral (desktop) |
| Rythme vertical (`--s-*`) | Grille : 4 colonnes → 3 → 2 → 1 |
| Structure informationnelle | Barre d'onglets + safe areas (`env(safe-area-inset-*)`) |

### 8.2 Points de rupture

| Breakpoint | Grille catalogue | Filtres | Navigation |
|---|---|---|---|
| ≥ 1280 px | 4 colonnes | rail fixe 280 px | complète |
| 1080–1279 px | 3 colonnes | rail fixe 260 px | complète |
| 760–1079 px | 2 colonnes | bottom sheet | univers réduits (3 visibles + « Plus ») |
| < 760 px | 2 colonnes | bottom sheet | burger + menu plein écran |
| < 420 px | 1 colonne (fiche) | bottom sheet | burger |

### 8.3 Règles mobiles obligatoires

- `viewport-fit=cover` déjà présent (`web/index.html:5`) → toute barre fixe en bas applique `padding-bottom: env(safe-area-inset-bottom)`.
- Zone deCTA fixe en bas : hauteur `64px + env(safe-area-inset-bottom)`.
- Champs de formulaire : `font-size ≥ 16px` (sinon iOS zoome au focus).
- Le pull-to-refresh et le scroll horizontal sont désactivés sur les sheets.
- Le menu mobile `.mmenu` est `position: fixed; inset: 0; overflow-y: auto` et intercepte le scroll du body (déjà en place, `Navbar.tsx:92`).

---

## 9. Copy & ton

### 9.1 Voix de la marque

Sobre, concret, jamais exclamatif. On **décrit l'objet**, on ne **vend pas**. Pas de superlatifs creux, pas d'anglicisme unnecessary, pas de point d'exclamation.

| Règle | ✅ | ❌ |
|---|---|---|
| Une phrase = une idée | « Payez en Mobile Money à la commande. » | « Payez facilement et en toute sécurité ! » |
| Le chiffre avant la promesse | « 45 000 FCFA · Dakar · Excellent » | « Un prix imbattable ! » |
| L'honnêteté avant l'enthousiasme | « Cet article est actuellement réservé. » | « Oups, quelqu'un a été plus rapide ! » |
| Nommer le réel | « 6 univers » | « Cinq familles » (faux) |
| Majuscules | Uniquement les labels | « VENDRE UN ARTICLE » en bouton |

### 9.2 Règles de forme

- **Marque** : **ReVends** dans les textes (une seule graphie). Le logotype en majuscules `REVENDS.` est réservé au logo lui-même. Supprimer la mention « Le Cœur couture » du commentaire source (`SplashLoader.tsx:4`) — la caption visible est déjà « ReVends » (`SplashLoader.tsx:57`).
- **Devise** : « 45 000 FCFA » (espace fine insécable), jamais « 45000 FCFA » ni « 45 000 F » (`SiteBits.tsx:16-18` fait déjà bien).
- **Punctuation** : espaces insécables avant `:` `;` `!` `?` et autour de `« »`.
- ** Titres** : phrase case, jamais de majuscule initiale ni de point final.
- **Boutons** : verbe à l'infinitif, 2 à 4 mots (« Explorer la sélection », « Ajouter au panier », « Réessayer »).
- **États vides** : 1 titre (fait), 1 phrase d'explication, 1 action.

### 9.3 Corrections de copy à faire

| Emplacement | Actuel | Cible |
|---|---|---|
| `HomeView.tsx:209` | « Cinq familles, mille trouvailles » | « Six univers, mille trouvailles » |
| `HomeView.tsx:176` | « Des pièces uniques, choisies avec soin… » | « Des pièces uniques, choisies avec soin, qui méritent une nouvelle histoire. » (déjà bon — ne pas toucher) |
| `HomeView.tsx:255-256` | « Acheter d'occasion, c'est choisir la qualité sans le neuf » | Garder. C'est la meilleure phrase du site : elle doit devenir la **baseline** (footer + page « À propos »). |
| `SplashLoader.tsx:4` (commentaire) | « Splash d'ouverture « Le Cœur couture » » | Aligner sur « Splash d'ouverture ReVends » — ou supprimer le splash (cf. §7.3). La caption (`:57`) est déjà correcte. |
| `index.html:35` | « ReVends - Donnez une seconde vie aux belles choses » | « ReVends — Donnez une seconde vie aux belles choses · Dakar » |
| `index.html:29` | « …vendeurs vérifiés » | « …paiement Mobile Money, livraison à Dakar » (**ne pas annoncer une vérification qui n'existe pas**) |
| `Footer.tsx:85-92`, `Navbar.tsx:277-285` | 3 liens sociaux → `/` | Liens réels, ou un unique lien « Suivre ReVends » |
| `AuthView.tsx:123` | « Produits authentiques » | « Annonces validées par l'équipe » (uniquement si l'admin filtre réellement) |

---

## 10. Migration — plan de fichiers ordonné

> **Contraintes de build.** `web/src/styles/bureau.css` est **généré** (`bureau.css:5-8`) : ne jamais l'éditer à la main. Les corrections durables qui touchent la maquette vont dans `web/src/bureau/vendor/*.css`, puis `npm run css:scope` (script `web/scripts/bureau-css.mjs`). Les ajouts hors maquette vont dans `bureau-fixes.css`. Les **jetons** vont dans le nouveau `tokens.css`.

| # | Fichier | Action | Impact |
|---|---|---|---|
| 1 | `web/src/styles/tokens.css` | **Créer** — §3.11 complet (clair + sombre + forme + pont legacy temporaire). Source unique. | Nouveau |
| 2 | `web/src/main.tsx` (l. 5-12) | Ajouter `import './styles/tokens.css'` **entre** `bureau.css` et `bureau-fixes.css`. | 1 ligne |
| 3 | `web/scripts/migrate-accent-tokens.mjs` | **Créer** — codemod propriété-aware sur `web/src/bureau/vendor/*.css`, table §3.12. Dry-run obligatoire (`--check`), puis écriture. | Outil |
| 4 | `web/src/bureau/vendor/*.css` → codemod → `npm run css:scope` | Appliquer le codemod (étape 3) puis régénérer `bureau.css`. **Corrige les failles n° 3, 6 et 13.** | Lisibilité + structure (majeur) |
| 5 | `web/src/bureau/vendor/editorial.css:226` → `npm run css:scope` | `.seller .av` et `.acct .who .av` : `background:var(--accent); color:var(--text-primary)`. **Corrige la faille n° 6.** | Lisibilité (majeur) |
| 6 | `web/src/bureau/vendor/editorial.css:102,150,198` → `npm run css:scope` | `.eyebrow`, `.card .cat-lbl`, `.buy .cat-lbl` : `color:var(--accent-text)`. **Corrige la faille n° 3.** | Lisibilité (majeur) |
| 7 | `web/src/bureau/vendor/styles.css:75` → `npm run css:scope` | `:focus-visible` : `outline: 2px solid var(--focus)`. **Corrige la faille n° 4.** | A11y (majeur) |
| 8 | `web/src/bureau/vendor/theme.css:201` → `npm run css:scope` | `.card .fav` : `34px` → `44px`, fond `var(--surface-overlay)` au lieu de `#FFFFFF` codé en dur. **Corrige la faille n° 11.** | Tactile |
| 9 | `vendor/styles.css:141,393,485,513,522` + `vendor/theme.css:151` + `vendor/editorial.css:75,178,182,245,258` → `npm run css:scope` | Bordures de contrôle (`.search input`, `.inp`/`.sel`, `.cbtn`/`.chip`, `.qty`, `.drop`) → `var(--line-strong)` (≥ 3:1) au lieu de `--line` / `--champagne` / `--color-border-strong`. **Corrige la faille n° 13.** | A11y (majeur) |
| 10 | `web/src/bureau/vendor/theme.css:178` + `editorial.css:141` → `npm run css:scope` | `.card` : `border-radius:var(--r-md)` ; `.card .im` : `var(--r-xs)` ; padding 16 px. **Corrige la faille n° 10.** | Cohérence |
| 11 | `web/src/bureau/vendor/styles.css:94` + `editorial.css:83` → `npm run css:scope` | `.btn` : rayon `var(--r-md)`, hover `translateY(-1px)`, press `scale(.98)`, focus `var(--focus)`. | Cohérence |
| 12 | `web/src/styles/bureau-fixes.css` (l. 561-566) | Supprimer la déclaration locale des `--field-glass-*` : renvoi à `tokens.css`. | Aucun visuel |
| 13 | `web/src/styles/bureau-fixes.css` (l. 153, 183, 439) | `.sug-meta`, `.sug-note a`, `.rv-legal-num` : `--terra` → `--accent-text`. | Lisibilité |
| 14 | `web/src/styles/bureau-fixes.css` (l. 39-42, 52-64) | `.link-arrow` et `footer .col button` : `min-height: 44px`. | Tactile |
| 15 | `web/src/index.css` (l. 390-473) | **Supprimer** le bloc « RE-SKIN PUBLIC — PALETTE BUREAU/MAIN » (doublon de `tokens.css`). Garder `@theme static` (l. 70-116) pour l'admin. **Vérifier que l'admin ne perd rien.** | Nettoyage (risque moyen) |
| 16 | `web/src/index.css` (l. 119) | `--font-sans` de `@theme static` : ne plus s'appliquer au public (déjà neutralisé par l. 394 — à supprimer du bloc re-skin). | Nettoyage |
| 17 | `web/src/components/ui/Button.tsx` (l. 15-33, 77-80) | Remplacer les classes Tailwind par `.btn` + variantes ; remplacer `fas fa-spinner` par le sprite `.i`. **Corrige les failles n° 7 et 8.** | Cohérence |
| 18 | `web/src/components/ui/Loading.tsx` (l. 143) | `fas fa-spinner` → `<Ico name="refresh" />` animé. | Cohérence |
| 19 | `web/src/components/ui/States.tsx` (l. 40, 44) | `buttonClasses(...)` → classes `.btn`. | Cohérence |
| 20 | `web/src/components/site/SiteImage.tsx` (l. 20, 44, 50, 64, 123-124) | `col`/`bg` par défaut → tokens ; supprimer le `#fff` codé en dur. **Corrige la faille n° 9.** | Thème |
| 21 | `web/src/views/HomeView.tsx` (l. 66-67, 164-165, 244-245, 188, 209) | Hex → tokens ; `↓` → `<Ico name="chevron-down" />` ; « Cinq » → « Six ». | Thème + copy |
| 22 | `web/src/views/AuthView.tsx` (l. 96-97) | Hex → tokens. | Thème |
| 23 | `web/src/views/SellView.tsx` (l. 370) | `color:'#fff'` → token. | Thème |
| 24 | `web/src/components/site/SiteCard.tsx` (l. 72-82) | Hiérarchie : label `--accent-text`, nom `--fs-h3` serif, prix `--fs-price` + `tabular-nums`, méta visible sur mobile. | Hiérarchie |
| 25 | `web/src/views/ProductView.tsx` (l. 279-286, 356-369) | H1 `--fs-h1`, prix `--fs-price-lg`, avatar vendeur en tokens. | Hiérarchie |
| 26 | `web/src/components/layout/Navbar.tsx` (l. 119, 150-189) | Logo `REVENDS` + point `--accent-ui` ; cibles 44 px ; badges `--accent`. | A11y |
| 27 | `web/src/components/layout/Footer.tsx` (l. 38, 85-92) | Baseline + suppression des liens sociaux morts. | Copy |
| 28 | `web/index.html` (l. 26-35) | `<meta theme-color>` dynamique (déjà scripté l. 17-18) ; `title` et `description` §9.3 ; `<link rel="preload">` des 2 woff2 publics. | Perf + SEO |
| 29 | `web/src/components/ui/SplashLoader.tsx` (l. 11-13, 4, 57) | `MIN_VISIBLE_MS` → 0 après 1ʳᵉ visite ; commentaire « Le Cœur couture » → « ReVends ». | Perf |
| 30 | `web/src/styles/tokens.css` (pont legacy, §3.11) | **SUPPRIMER** le pont `--terra` / `--bordeaux` / `--champ` une fois le codemod passé. Dernière étape : le système n'a plus qu'une grammaire. | Nettoyage |

**Ordre de livraison recommandé** : 1 → 2 → 3 → 4 → 5 → 6 → 7 → 9 (lot « lisibilité, structure et a11y », le plus rentable) → 8, 14 (lot « tactile ») → 11, 17, 18, 19 (lot « un seul bouton ») → 10, 24, 25 (lot « hiérarchie ») → 20, 21, 22, 23 (lot « tokens dans le JSX ») → 12, 13 (lot « dérogations ») → 15, 16 (lot « nettoyage », en dernier : c'est le plus risqué) → 26, 27, 28, 29 (lot « chrome et perf ») → 30 (lot « suppression du pont »).

**Vérification à chaque lot** (obligatoire, `verifie-toujours`) : `npm run build` vert · `npm run css:scope` sans diff résiduel · re-measure des contrastes du §7.1 sur le rendu réel (pas sur le CSS) · un seul `<h1>` par route.

**Fichiers explicitement hors périmètre** : `web/src/pages/admin/**`, `web/src/components/admin/**`, `web/src/components/layout/DashboardLayout.tsx`, `web/src/components/layout/Sidebar.tsx` — l'admin n'est pas re-skinné.

---

## 11. Auto-revue — cohérence du design system

| # | Question | Réponse |
|---|---|---|
| 1 | **Chaque couleur est-elle déclarée dans un seul fichier, avec un rôle nommé ?** | ✅ Oui. `tokens.css` est l'unique source du scope public ; `index.css` ne garde que le socle admin ; `bureau.css` est généré et ne doit plus être édité à la main. Le pont legacy (`--terra` → `--accent-ui`) est **temporaire** et documenté comme tel (§3.11). |
| 2 | **Chaque couleur d'accent a-t-elle un rôle unique et non décoratif ?** | ✅ Oui : `--accent` (fond d'action), `--accent-hover` (survol), `--accent-ui` (élément d'UI ≥ 3:1), `--accent-text` (texte accent ≥ 4,5:1), `--accent-soft` (fond de badge). Une couleur = un rôle. |
| 3 | **Les contrastes sont-ils tous vérifiés, pas estimés ?** | ✅ Oui — 15 combinaisons mesurées (§7.1) avec la formule WCAG 2.1 (annexe), avant **et** après. Les valeurs sont consignées, y compris les cas décoratifs (filets) pour lesquels la norme n'impose pas de seuil mais où l'absence de contraste est un défaut de perception. |
| 4 | **Chaque famille de composants a-t-elle un état pour chaque interaction ?** | ✅ Oui — hover / press / focus / disabled / loading / navigation documentés par composant (§4.1, §4.2, §4.8). |
| 5 | **La direction tient-elle sur les deux plateformes ?** | ✅ Oui — palette, typo, rayons, ombres, mouvement identiques ; seuls la navigation, les hit targets, les sheets et les safe areas diffèrent (§8). |

**Checklist de conformité à vérifier après implémentation**

- [ ] Aucune couleur hexadécimale hors de `tokens.css` dans `web/src/**` (grep `#[0-9A-F]{6}`).
- [ ] Aucune classe utilitaire Tailwind nouvelle dans le scope public (`web/src/components/site/**`, `web/src/views/**`).
- [ ] Aucune occurrence de `var(--terra)` dans une propriété `color:` (grep).
- [ ] Toutes les cibles interactives ≥ 44×44 px sous 768 px.
- [ ] Un seul `<h1>` par page (audit des routes de `App.tsx:67-138`).
- [ ] `prefers-reduced-motion` neutralise toutes les animations.
- [ ] Contraste ≥ 4,5:1 vérifié sur les 15 combinaisons du §7.1, sur le **rendu réel** (pas sur le CSS).
- [ ] Aucun lien social ne pointe vers `/`.
- [ ] Le nombre d'univers annoncé correspond à `univers.length` (`menus.ts:25`).

---

## Annexe — Rapport de contraste (méthode)

Calculs réalisés avec la formule WCAG 2.1 de luminance relative (canal sRGB, seuil 0,03928 / 0,04045, exposant 2,4) :

```
ratio = (L1 + 0.05) / (L2 + 0.05),  L = 0.2126R + 0.7152G + 0.0722B
```

Seuil de texte courant : **4,5:1**. Grand texte (≥ 18,66 px gras ou ≥ 24 px) : **3:1**.
Éléments d'interface et indicateurs de focus (1.4.11) : **3:1**.
