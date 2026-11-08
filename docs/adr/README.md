# ADR — Architecture Decision Records (backend ReVends)

Décisions structurantes du backend `server/`, au format court
(Contexte / Décision / Conséquences). Une décision par fichier, numérotée.

| N° | Titre | Statut |
|----|-------|--------|
| [0001](./0001-couche-repository.md) | Séparation de la couche Repository (SQL hors services) | Accepté |
| [0002](./0002-shard-router-fnv1a.md) | Routeur de shard FNV-1a isolé et testable | Superseded (WS2) |
| [0003](./0003-cors-explicite.md) | CORS explicite à liste blanche via `CORS_ORIGINS` | Accepté |
| [0004](./0004-pagination-me.md) | Pagination des listes `/api/me/*` | Accepté |
| [0005](./0005-pas-de-couches-controllers-validators.md) | Pas de couches `controllers/` ni `validators/` séparées | Accepté |
