# Écarts V8.1 — volet web « Contrôle boutique » (`fix/v6-on-799a7ab`)

> Date : 2026-11-18 · Auteur : `@frontend` (web) · Portée : `revends/web` uniquement — `server/` NON touché (déjà livré par `@backend`). Prod NON touchée, aucun déploiement.
> Référence : contrats backend V8.1 (`server/src/routes/admin-storefront-ctl.routes.ts`, `me-products.routes.ts`) — `requireAdmin` / `requireAuth`, POST `{}`, 204/200/404/409 `PRODUCT_ORDER_ACTIVE`, erreurs humanisées côté serveur.

## Écarts consignés

1. **Classes `.btn.rm` / `.rm-solid` inexistantes dans ce système.** La consigne autorisait « `.btn.rm` / `.rm-solid` ou `.btn.danger` (suivant le système existant) » : seule la famille `danger` existe (variant `Button variant="danger"`, Tailwind héritée de l'admin legacy). Retenu : `Button variant="danger" size="sm" icon="trash"` (`<Ico name="trash" />`), identique entre `/admin/abonnements` (Actions) et `/mes-articles` (par ligne). Aucune classe CSS nouvelle créée.
2. **« Confirmation en inline » (Désactiver) interprétée comme confirmation simple dans `ConfirmAction`** (modal déjà en place, boutons Annuler/Désactiver, `urgency="warning"`), au lieu d'un nouveau « inline en cellule » — zéro composant nouveau, zéro divergence avec la convention `ConfirmAction` existante (activate). Si le chef de projet voulait une confirmation inline en cellule, c'est un écart à résorber.
3. **`ToastKind` étendu à `'warning'`** (`lib/toast.tsx`, icône sprite `triangle-exclamation`) pour le 409 `PRODUCT_ORDER_ACTIVE` demandé (« toast warning humanisé »). Extension **additive** : aucune page existante modifiée ; le toast n'a qu'un ton (icône champagne) — aucun style ajouté.
4. **Message `PRODUCT_ORDER_ACTIVE` côté serveur non réutilisé** : la page affiche exactement le texte demandé par le contrat produit (« Cet article est impliqué dans une commande en cours, supprimez-le seulement une fois réceptionnée/soldée. ») et n'affiche JAMAIS le `code` machine. Les autres erreurs passent par `friendlyError` (jamais de code, jamais de fuite technique).
5. **`storefrontError` (NOT_FOUND) héritée telle quelle** pour les 404 des routes Contrôle boutique : son texte est boutique-scopé (« Cette boutique n'est plus ouverte… ») — comportement identique à `adminActivate` (déjà en prod), volontairement non modifié (« Zéro modification de comportement des pages existantes »).
6. **Invalidation `['my-products']` + `['my-articles']`** sur `/mes-articles` : la page et les autres consommateurs partagent `['my-products']` (AccountView, MonAbonnement) — seule `['my-articles']` était exigée ; les deux sont invalidées. Écart nommage spec (la page n'utilise pas `['my-articles']` comme clé de lecture).
7. **Test invariant CA-V5-054/055 réécrit** (`sellerDeleteRemoved.test.ts`) : V8.1 ouvre la suppression au propriétaire — l'assertion « MyArticlesPage ne doit pas proposer Supprimer » est invalidée par le contrat V8.1 ; remplacée par les invariants V8.1 (jamais de méthode client littérale interdite, route propriétaire uniquement, saisie « Supprimer »). Le nom interdit reste assemblé à l'exécution.
8. **`docs/` V8.1 non créés côté serveur** (le contrat vit dans le code + `server/test/storefront-admin-ctl.test.ts`) ; ce fichier est la seule doc écart. Aucun token design modifié (design-exceptionnel appliqué par réutilisation de composants existants ; aucun rayon/couleur hors charte).
9. **Modal titre** : « Cette action est irréversible » (préréglage ConfirmDelete/RG-V5-08) plutôt qu'un libellé dupliqué du message ; la question exacte « Supprimer définitivement la boutique « slug » ? » est portée par le corps (comme demandé), pas par le `h2`.
10. **E2E non exécuté** (nécessite stack API + base seedée + comptes admin) — du ressort de `@tester`. Vérifications locales : `npx tsc -b` exit 0 · `npm test` 273/273 · `npm run build` exit 0 · `/mes-articles` non authentifié redirige bien vers `/login?next=…` (preview statique, API locale absente ⇒ `/api/auth/me` 500 attendu, aucune erreur JS).

## Ce qui a été livré

- `/admin/abonnements` (onglet « Tous ») : colonne **Actions** (ACTIVE : « Désactiver » secondaire + chevron-down ; ACTIVE/CANCELLED : « Supprimer définitivement » danger + trash) ; modales `ConfirmAction` (désactivation une étape ; suppression deux temps avec saisie « Supprimer » et `confirmDisabled`) ; invalidation `['admin','subscriptions',…]`.
- `/mes-articles` : bouton danger « Supprimer » par ligne (aria-label contextualisé), confirmation deux temps (« Supprimer l'article ? » + saisie), toast warning humanisé sur 409, invalidation `['my-products']` + `['my-articles']`.
- `lib/storefront.ts`/`storefront.types.ts` : `adminDeactivate` / `adminDelete` (POST `{}`) + `SubscriptionCtlResponse` ; `lib/api.ts` : `deleteOwnerProduct` (DELETE, 204) ; toast `warning` ; tests `v81-web.test.ts` (2 nouveaux) ; invariant `sellerDeleteRemoved.test.ts` réécrit V8.1.

## Reste pour @tester / @reviewer

- Recette E2E : les 3 parcours (désactiver, supprimer, supprimer article + 409) en admin + vendeur seedés ; axe-core sur les deux pages.
- Vérifier côté serveur (déjà livré) : comportement 409 en conditions réelles de commande active.
- Workers à vérifier : `['my-products']` invalidé → compteurs / badges ailleurs dans l'app (`AccountView`, `MonAbonnement`) reflètent bien la suppression sans hard refresh.
