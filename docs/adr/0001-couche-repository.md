# ADR 0001 — Séparation de la couche Repository

- **Statut** : Accepté
- **Date** : 2026-10-12
- **Portée** : `server/src/repositories/`, `server/src/services/`, `server/src/mail/`

## Contexte

Le SQL était auparavant écrit directement dans les services et quelques modules
périphériques (`mail/queue.ts`). Cela mélangeait l'accès aux données et la
logique métier, rendait les requêtes difficiles à réutiliser/tester et faisait
diverger des fragments SQL partagés (colonnes produit, statuts de commande).

## Décision

Introduire une couche **Repository** dédiée (`src/repositories/*.repository.ts`)
qui concentre **tout** le SQL :

- `products`, `orders`, `users`, `categories`, `notifications`, `banners`,
  `admin`.
- Chaque repository expose des fonctions nommées recevant un `Queryable`
  (`Pick<DbClient, 'query'>`) optionnel — indispensable pour partager une
  **même transaction** entre plusieurs écritures.
- Les fragments SQL partagés (colonnes produit, `ACTIVE_ORDER_STATUSES_SQL`,
  score de pertinence) vivent dans le repository et sont ré-exportés pour la
  compatibilité.
- Les services ne contiennent **plus aucun SQL** et orchestrent : validation
  métier, transactions, sérialisation.
- Le programmeur d'e-mails (`mail/queue.ts`) résout l'adresse via
  `users.repository.findEmailById()` au lieu d'une requête ad hoc.

## Conséquences

- **Positif** : SQL centralisé et révisable en un point ; services testables
  par injection d'un faux `Queryable` ; fin des duplications de fragments.
- **Positif** : `SELECT ... FOR UPDATE`, variantes « historique » (sans filtre
  `deleted_at`) et agrégats de fenêtre documentés dans le repository.
- **Neutre** : les types de lignes restent dans `utils/serializers.ts`
  (contrat de sérialisation) et sont importés par les repositories.
- **Risque** : toute nouvelle requête doit atterrir dans un repository, sans
  exception, sous peine de recréer la dette.
