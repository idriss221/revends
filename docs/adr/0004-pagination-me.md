# ADR 0004 — Pagination des listes `/api/me/*`

- **Statut** : Accepté
- **Date** : 2026-10-12
- **Portée** : `server/src/routes/me.routes.ts`, `utils/validation.ts`,
  `utils/normalize.ts`, `repositories/*`, `services/*`

## Contexte

`GET /api/me/products`, `/api/me/orders` et `/api/me/sales` renvoyaient des
listes non bornées, coûteuses pour un compte volumineux. Le reste de l'API
(catalogue, admin) était déjà paginé.

## Décision

Appliquer la même pagination partout :

- Paramètres `page` (défaut 1) et `limit` (défaut 12, max 48), via
  `meListQuerySchema`. **Rétrocompatibilité** : `per_page` et `perPage` sont
  acceptés comme alias de `limit` (`normalizeMeListParams`), la clé canonique
  `limit` primant.
- Réponse uniforme : `{ items, page, limit, total, totalPages }`.
- **Budget constant** : page et total calculés en **une** requête par agrégat
  de fenêtre (`COUNT(*) OVER()`) dans le repository, indépendamment de `limit`.
  `OWN` (`me/products`) ajoute les compteurs par statut dans la même requête.

`me/products` est paginé ; `me/orders`/`me/sales` ajoutent leurs items après
résolution des produits/parties en batch.

## Conséquences

- **Positif** : charge bornée, contrat homogène entre endpoints.
- **Neutre** : le client qui n'envoie rien reçoit la première page (comportement
  par défaut inchangé pour de petites listes).
- **Test** : couvert par les tests unitaires de normalisation et par les suites
  d'intégration `buy`/`checkout`/`sell`.
