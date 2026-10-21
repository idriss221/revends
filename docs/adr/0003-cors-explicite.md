# ADR 0003 — CORS explicite à liste blanche

- **Statut** : Accepté
- **Date** : 2026-10-12
- **Portée** : `server/src/middleware/cors.ts`, `server/src/config.ts`

## Contexte

Le front (web + mobile) consomme l'API depuis une origine différente. Les
cookies de session (`connect.sid`, HTTP-only) exigent
`Access-Control-Allow-Credentials: true`, **incompatible** avec
`Access-Control-Allow-Origin: *`. Il fallait donc une politique d'origine
explicite, sans dépendance externe superflue.

## Décision

Middleware CORS maison, monté **après helmet** (les réponses preflight portent
les en-têtes de sécurité) et **avant** session/rate-limit (OPTIONS traité
localement en 204, sans solliciter le store ni le limiteur).

- Liste blanche via `CORS_ORIGINS` (CSV), repli sur `SITE_URL`. `*` est
  **ignoré** par `parseCorsOrigins` (incompatible credentials).
- On renvoie l'origine exacte demandée, jamais `*`, plus
  `Access-Control-Allow-Credentials: true`, méthodes et en-têtes autorisés,
  `Access-Control-Max-Age: 600`, et `Vary: Origin`.
- Requêtes **sans** en-tête `Origin` (same-origin, clients mobiles natifs,
  tests HTTP) : aucun en-tête CORS ajouté (comportement neutre).

## Conséquences

- **Positif** : politique auditable, configurable par environnement, aucun
  paquet `cors` à maintenir.
- **Opérationnel** : ajouter une origine = renseigner `CORS_ORIGINS`
  (jamais éditer le code).
