# ADR 0002 — Routeur de shard FNV-1a isolé et testable

- **Statut** : Superseded (WS2 — pool unique, sharding supprimé) — 2026-10-16
- **Date** : 2026-10-12
- **Portée** : `server/src/db/shardRouter.ts`, `server/src/db/cluster.ts`

## Contexte

L'architecture distribuée place les données d'un même utilisateur sur un shard
déterminé par `user.id`. Le calcul de shard était mêlé au gestionnaire de
cluster (`db/cluster.ts`), lui-même dépendant de `config` et de `pg`, donc peu
testable sans base ni variables d'environnement.

## Décision

Extraire le calcul dans `src/db/shardRouter.ts` — **logique pure, sans I/O**,
sans dépendance à Express ni aux contrôleurs :

- `fnv1a32(string)` : FNV-1a 32 bits (offset `0x811c9dc5`, prime `0x01000193`,
  multiplications `Math.imul`). Déterministe et **stable entre processus**,
  contrairement au hash d'objets de Node (salé par process).
- `shardIndexFor(key, shardCount)` : `fnv1a32(String(key)) % shardCount`,
  avec repli sur le shard 0 si `shardCount <= 0`/non fini (jamais `NaN`).
- `shardOf(key)` : applique la configuration courante (`DB_SHARD_COUNT`).
- `SHARD_STRATEGY` : chaîne documentaire exposée à la probe `/api/cluster`.

**Stratégie** : clé = `user.id`. Toutes les lignes d'un utilisateur (produits,
commandes, événements, paiements, notifications) vivent sur `shardOf(user.id)`,
donc les FK intra-utilisateur ne traversent jamais de frontière : aucun JOIN
inter-shard. Les tables de référence (users, categories, banners,
admin_actions) sont en broadcast. `db/cluster.ts` ré-exporte pour compatibilité
et l'utilise via `queryByKey(key, …)`.

## Conséquences

- **Positif** : testable sans BDD (`test/unit-shard-router.test.ts`), utilisable
  par la probe cluster et par les jobs.
- **Risque R1 assumé** : changer `DB_SHARD_COUNT` remappe **toutes** les clés ;
  un changement exige une migration de données (documenté dans le module).
