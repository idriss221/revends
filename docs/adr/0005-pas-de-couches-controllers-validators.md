# ADR 0005 — Pas de couches `controllers/` ni `validators/` séparées

- **Statut** : Accepté
- **Date** : 2026-10-12
- **Portée** : `server/src/routes/`, `server/src/utils/validation.ts`

## Contexte

La structure cible mentionnait `controllers/` (« à ajouter si pertinent ») et
`validators/`. Dans l'existant, les handlers de route (`routes/*.routes.ts`)
sont déjà **fins** : ils parsent/valident la requête (Zod), délèguent au
service, puis posent le statut HTTP. La validation Zod est centralisée dans
`utils/validation.ts` (schémas partagés, colocalisés).

## Décision

Ne pas introduire de couche `controllers/` ni un dossier `validators/`
artificiel :

- Ajouter des controllers vides de logique (pass-through vers les services)
  n'apporterait que de l'indirection, sans gain de testabilité — la logique
  métier est déjà dans les services et testable sans HTTP.
- Déplacer `utils/validation.ts` vers `validators/` casserait les imports sans
  bénéfice fonctionnel ; les schémas sont déjà regroupés et réutilisés.

La séparation effective est donc : **Routes → Services → Repositories → DB**,
avec `utils/` (validation, normalisation, erreurs, sérialisation) transverse.

## Conséquences

- **Positif** : KISS / DRY respectés, aucun refactor à risque sur 40+ endpoints.
- **Réversible** : si un besoin réel de controllers apparaît (ex. réutilisation
  d'un handler hors HTTP), on pourra les extraire à ce moment-là.
