# Audit exhaustif des images & médias — ReVends

- **Cible** : `http://127.0.0.1:8080`
- **Date** : 2026-10-27T00:06:59.749Z → 2026-10-27T00:07:37.196Z
- **Navigateur** : Chromium (Playwright n/a)
- **Périmètre** : 24 inventaires de page (24 routes × 1440 px), 0 passes thèmes, 0 mesures responsive (15 largeurs)
- **Admin** : connecté (session réelle)
- **Corrections appliquées** : 0 (mission d’audit en lecture seule)
- ⚠️ **Injection de panne contrôlée** : toutes les requêtes contenant `sac-a-main-en-cuir-1.jpg` ont été avortées côté navigateur — ce rapport prouve que le harnais **détecte** une image cassée (il ne décrit pas l’état nominal).

## 1. Synthèse chiffrée

| Indicateur | Valeur |
| --- | ---: |
| Pages auditées (inventaires) | 24 |
| Images `<img>` inspectées | 65 |
| Images chargées (naturalWidth > 0) | 63 |
| Images visibles | 65 |
| Images obligatoires | 65 |
| Images facultatives | 0 |
| Images cassées / non décodées (visibles) | 2 |
| Replis SVG « Illustration » affichés | 4 |
| URLs d’image en erreur HTTP | 0 |
| MIME non-image sur URL image | 0 |
| Pages avec scroll horizontal | 0 |
| Réponses réseau ≥ 400 (toutes) | 5 |
| Anomalies P0 / P1 / P2 / P3 | 2 / 4 / 3 / 0 |

> Lecture : une image « chargée » est une `<img>` dont `complete === true` et `naturalWidth > 0` après défilement complet. Un repli SVG signifie qu’une photo a échoué et a été **silencieusement remplacée** par l’illustration de secours de `SiteImage` : c’est une anomalie même si la page « semble » correcte.

## 2. Anomalies réelles (triées par gravité)

| # | Gravité | Page | Élément / URL | Problème | Cause probable | Type | Statut |
| ---: | --- | --- | --- | --- | --- | --- | --- |
| 1 | **P0** | `/admin/articles` (1440px) | `http://127.0.0.1:8080/catalog/sac-a-main-en-cuir-1.jpg` | Image affichée mais non décodée (naturalWidth = 0) | Fichier corrompu / réponse non-image | obligatoire | ouvert |
| 2 | **P0** | `/search?q=sac` (1440px) | `http://127.0.0.1:8080/catalog/sac-a-main-en-cuir-1.jpg` | Image affichée mais non décodée (naturalWidth = 0) | Fichier corrompu / réponse non-image | obligatoire | ouvert |
| 3 | **P1** | `/catalogue/chemise-lin-ecru` (1440px) | `(image remplacée par le SVG de secours)` | Photo attendue remplacée par l’illustration SVG de secours (onError de SiteImage) | URL d’image en erreur (404/403) ou fichier supprimé côté vendeur | obligatoire | ouvert |
| 4 | **P1** | `/category/mode` (1440px) | `(image remplacée par le SVG de secours)` | Photo attendue remplacée par l’illustration SVG de secours (onError de SiteImage) | URL d’image en erreur (404/403) ou fichier supprimé côté vendeur | obligatoire | ouvert |
| 5 | **P1** | `/search?q=sac` (1440px) | `(image remplacée par le SVG de secours)` | Photo attendue remplacée par l’illustration SVG de secours (onError de SiteImage) | URL d’image en erreur (404/403) ou fichier supprimé côté vendeur | obligatoire | ouvert |
| 6 | **P1** | `/shop` (1440px) | `(image remplacée par le SVG de secours)` | Photo attendue remplacée par l’illustration SVG de secours (onError de SiteImage) | URL d’image en erreur (404/403) ou fichier supprimé côté vendeur | obligatoire | ouvert |
| 7 | **P2** | `/catalogue/chemise-lin-ecru` (1440px) | `/catalog/sac-a-main-en-cuir-1.jpg` | Requête image échouée (net::ERR_FAILED) | Réseau / ressource indisponible | facultative | ouvert |
| 8 | **P2** | `/category/mode` (1440px) | `/catalog/sac-a-main-en-cuir-1.jpg` | Requête image échouée (net::ERR_FAILED) | Réseau / ressource indisponible | facultative | ouvert |
| 9 | **P2** | `/shop` (1440px) | `/catalog/sac-a-main-en-cuir-1.jpg` | Requête image échouée (net::ERR_FAILED) | Réseau / ressource indisponible | facultative | ouvert |

> Détail complet (sélecteur CSS, dimensions, en-têtes, réseau) : `docs/audit/images-inventory.json`.

## 3. Matrice responsive — 15 largeurs

Contrôles par largeur : `documentElement.scrollWidth === clientWidth`, et aucune image visible hors viewport.

- Largeurs testées : 320, 360, 375, 390, 414, 430, 480, 768, 834, 1024, 1280, 1366, 1440, 1600, 1920 px
- Mesures : **0**
- Débordements horizontaux : **0**
- Images débordantes : **0**

✅ Aucun débordement horizontal ni image hors viewport sur les 15 largeurs.

## 4. Thèmes sombre / clair

| Thème | Page | data-theme | Images | Chargées | Cassées | Anomalies |
| --- | --- | --- | ---: | ---: | ---: | ---: |

✅ Aucune anomalie image propre à un thème (mêmes ressources dans les deux modes).

## 5. Réseau image

| Statut | Occurrences |
| ---: | ---: |
| 0 | 5 |
| 200 | 54 |

| URL | Statut | Content-Type | Taille | Type | Page |
| --- | ---: | --- | ---: | --- | --- |
| `/catalog/sac-a-main-en-cuir-1.jpg` | net::ERR_FAILED | — | — | image | — |

## 6. Vérification croisée produits ↔ images (API réelles)

| Indicateur | Valeur |
| --- | ---: |
| Produits listés par l’API | 25 (récupérés : 25) |
| URLs d’image distinctes | 36 |
| URLs 200 + image/* | 36 |
| URLs cassées / non-image | 0 |
| Produits sans image | 0 |
| Produits avec image cassée | 0 |
| Photos identiques entre produits distincts | 12 |
| Familles de photos partagées | 0 |
| Suspicions sémantiques (nom ↔ fichier) | 14 |

### Photos strictement identiques entre produits distincts

| URL | Produits | HTTP | Content-Type |
| --- | --- | ---: | --- |
| `/catalog/smartphone-128-go-1.jpg` | `galaxy-s21fe-128go`, `iphone-12-64go-midnight` | 200 | image/jpeg |
| `/catalog/smartphone-128-go-2.jpg` | `galaxy-s21fe-128go`, `iphone-12-64go-midnight` | 200 | image/jpeg |
| `/catalog/montre-connectee-1.jpg` | `clavier-mecanique-azerty`, `chargeur-sans-fil-15w` | 200 | image/jpeg |
| `/catalog/montre-connectee-2.jpg` | `clavier-mecanique-azerty`, `chargeur-sans-fil-15w` | 200 | image/jpeg |
| `/catalog/lot-de-romans-1.jpg` | `jeu-societe-strategy`, `coffret-3-bd`, `lot-12-romans-francais` | 200 | image/jpeg |
| `/catalog/lot-de-romans-2.jpg` | `jeu-societe-strategy`, `coffret-3-bd`, `lot-12-romans-francais` | 200 | image/jpeg |
| `/catalog/lampe-de-table-terracotta-1.jpg` | `lampe-appoint-lin-chene`, `table-appoint-bois-massif` | 200 | image/jpeg |
| `/catalog/lampe-de-table-terracotta-2.jpg` | `lampe-appoint-lin-chene`, `table-appoint-bois-massif` | 200 | image/jpeg |
| `/catalog/miroir-mural-dore-1.jpg` | `service-table-18pieces`, `miroir-rond-chene-80` | 200 | image/jpeg |
| `/catalog/miroir-mural-dore-2.jpg` | `service-table-18pieces`, `miroir-rond-chene-80` | 200 | image/jpeg |
| `/catalog/fauteuil-chine-1.jpg` | `machine-cafe-piston-chromee`, `fauteuil-rotin-tresse` | 200 | image/jpeg |
| `/catalog/fauteuil-chine-2.jpg` | `machine-cafe-piston-chromee`, `fauteuil-rotin-tresse` | 200 | image/jpeg |

### Suspicions sémantiques (photo sans rapport lexical avec le produit)

| Produit | Photo principale | Recouvrement de mots |
| --- | --- | --- |
| `chemise-lin-ecru` | `/catalog/t-shirt-coton-blanc-1.jpg` | 0 |
| `galaxy-s21fe-128go` | `/catalog/smartphone-128-go-1.jpg` | 0 |
| `clavier-mecanique-azerty` | `/catalog/montre-connectee-1.jpg` | 0 |
| `jeu-societe-strategy` | `/catalog/lot-de-romans-1.jpg` | 0 |
| `tapis-yoga-antiderapant` | `/catalog/guitare-acoustique-1.jpg` | 0 |
| `robe-fleurie-seaside` | `/catalog/pull-maille-creme-1.jpg` | 0 |
| `iphone-12-64go-midnight` | `/catalog/smartphone-128-go-1.jpg` | 0 |
| `sandales-tressees-38` | `/catalog/bottines-en-cuir-1.jpg` | 0 |
| `service-table-18pieces` | `/catalog/miroir-mural-dore-1.jpg` | 0 |
| `coffret-3-bd` | `/catalog/lot-de-romans-1.jpg` | 0 |
| `chargeur-sans-fil-15w` | `/catalog/montre-connectee-1.jpg` | 0 |
| `macbook-air-13-m1-256go` | `/catalog/casque-audio-sans-fil-1.jpg` | 0 |
| `roue-entrainement-pliable` | `/catalog/appareil-photo-compact-1.jpg` | 0 |
| `machine-cafe-piston-chromee` | `/catalog/fauteuil-chine-1.jpg` | 0 |

> Ces écarts ne cassent pas l’affichage mais trompent l’acheteur (ex. clavier illustré par une montre). À traiter côté données de démonstration.

## 7. Pages non recettées / limites

Aucune page prévue n’a été sautée.

## 8. Méthode (reproductible)

```bash
# mot de passe lu depuis le conteneur, jamais affiché
cd web && AUDIT_ADMIN_PASSWORD="$(docker inspect revends_api1 --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^ADMIN_PASSWORD=' | cut -d= -f2-)" \
  node scripts/media-audit.mjs http://127.0.0.1:8080
```

1. Récupération d’un slug produit réel via `GET /api/products?per_page=48`.
2. Connexion admin via `POST /api/auth/login` (double soumission CSRF), cookie de session réutilisé.
3. Pour chaque route : `goto` → `load` + `networkidle` → défilement complet (lazy) → attente `complete`/`decode()` → extraction DOM + réseau.
4. Anomalies dérivées de mesures (pas d’heuristique d’apparence) : `naturalWidth`, `complete`, `decode()`, statut HTTP, `content-type`, `getBoundingClientRect()`, `scrollWidth/clientWidth`.
5. Matrice responsive 15 largeurs + 2 thèmes (`localStorage['rv:theme']`).
6. Cross-check produits via API + `HEAD` sur chaque URL d’image.

_Rapport généré automatiquement par `web/scripts/media-audit.mjs` — aucune correction appliquée._
