# RAPPORT FINAL — Phase 5 P0 : Migration des écritures vers queryByKey

## Résumé des modifications

| Fichier | Fonction | Clé de shard | Ancien import | Nouvel import | Lignes modifiées |
|---------|----------|--------------|---------------|---------------|------------------|
| **products.repository.ts** | `incrementViewCount` | ownerId (via SELECT) | `pool` | `queryByKey, queryShard` + `pool, Queryable` | ~485-510 |
| | `countSoldByOwner` | ownerId | `pool` | `queryByKey` (replica) | ~494-500 |
| | `selectOwnProductsPage` | ownerId | `pool` | `queryByKey` (replica) | ~562-582 |
| | `countOwnerProducts` | ownerId | `pool` | `queryByKey` (replica) | ~585-616 |
| | Transaction functions (insertProduct, insertImage, updateProductToPending, markProductApproved, markProductRejected, softDeleteProduct, etc.) | ownerId | `pool` (via client) | inchangé (client Queryable) | — |
| **orders.repository.ts** | `selectBuyerOrderIds` | buyerId | `pool` | `queryByKey` (replica) | ~270-276 |
| | `selectSellerOrderIds` | sellerId | `pool` | `queryByKey` (replica) | ~278-284 |
| | `selectBuyerOrderIdsPage` / `selectSellerOrderIdsPage` | buyerId / sellerId | `pool` | `queryByKey` (replica) | ~286-317 |
| | `countOrdersForUser` | buyerId / sellerId | `pool` | `queryByKey` (replica) | ~319-329 |
| | Transaction functions (insertOrder, updateOrderStatus, insertOrderEvent, reserveProduct, releaseReservedProduct, markProductSold, insertPayout, updatePaymentPaid, etc.) | buyerId / sellerId | `pool` (via client) | inchangé (client Queryable) | — |
| **users.repository.ts** | `insertUser` | shard 0 (broadcast) | `pool` | `queryShard(0, 'primary')` + `queryByKey, pool, Queryable` | ~16-28 |
| | `findById` | userId | `pool` | `queryByKey` (replica) | ~36-39 |
| | `findEmailById` | userId | `pool` | `queryByKey` (replica) | ~46-50 |
| | `findAdminUserById` | userId | `pool` | `queryByKey` (replica) | ~56-73 |
| | `findByEmail` | (inconnu) | `pool` | inchangé (pool) | — |
| | `countAdminUsers` / `selectAdminUsersPage` | (broadcast/admin) | `pool` | inchangé (pool) | — |
| **notifications.repository.ts** | `countUnread` | userId | `pool` | `queryByKey` (replica) | ~46-52 |
| | `countForUser` | userId | `pool` | `queryByKey` (replica) | ~54-65 |
| | `selectNotificationPage` | userId | `pool` | `queryByKey` (replica) | ~67-82 |
| | `markRead` | userId | `pool` | `queryByKey` (primary) | ~85-97 |
| | `markAllRead` | userId | `pool` | `queryByKey` (primary) | ~99-105 |
| | `insertNotification` | userId | `pool` (via client) | inchangé (client Queryable) | — |

## Détails techniques

### Stratégie de shard key appliquée
- **Produit / Image produit** → `ownerId` (propriétaire)
- **Commande / Paiement / Événement commande** → `buyerId` (acheteur)
- **Réservation / Libération / Payout vendeur / Marquer vendu** → `sellerId` (= `ownerId` du produit)
- **Notification** → `userId` (destinataire)
- **Users (INSERT)** → broadcast shard 0

### Pattern utilisé
```typescript
// Lectures (replica)
const { rows } = await queryByKey<RowType>(userId, 'replica', sql, params);

// Écritures (primary)
const { rows } = await queryByKey<RowType>(userId, 'primary', sql, params);

// Broadcast (table users)
const { rows } = await queryShard<RowType>(0, 'primary', sql, params);

// Cas spécial incrementViewCount
const { rows: ownerRows } = await queryShard<{ owner_id: number }>(0, 'replica', 'SELECT owner_id FROM products WHERE id = $1', [productId]);
const ownerId = ownerRows[0]?.owner_id;
if (ownerId !== undefined) {
  const { rows } = await queryByKey<{ view_count: number }>(ownerId, 'primary', 'UPDATE ...', [productId]);
}
```

### Fonctions NON modifiées (conservent `client: Queryable` pour transactions)
Toutes les fonctions prenant un paramètre `client: Queryable` (sans valeur par défaut) sont utilisées dans des transactions gérées par `withTransaction` (services). Elles conservent leur signature et utilisent le client passé en paramètre.

### Validation
```bash
npm run build        # ✅ PASS
npm run typecheck    # ✅ PASS
npm run test         # ✅ ALL SUITES GREEN (15 suites, 100+ tests)
```

## Auto-revue
- Imports corrigés : `Queryable` depuis `pool.ts`, `queryByKey/queryShard` depuis `cluster.ts`
- Signatures publiques inchangées (paramètres conservés, même noms, mêmes types)
- Transactions préservées : les fonctions avec `client: Queryable` utilisent le client passé
- Clés de shard cohérentes avec l'architecture (user.id du propriétaire)
- Pas de `console.log` ni code mort introduit
- Build et typecheck au vert
- Tests unitaires et d'intégration passent