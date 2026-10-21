# Phase 5 - Sharding Migration - P0

## Tasks

### 1. products.repository.ts
- [ ] Replace import from pool to cluster (queryByKey, queryShard)
- [ ] Modify write operations to use queryByKey(ownerId, 'primary', ...)
  - insertProduct
  - insertImage
  - updateProductToPending
  - selectProductForUpdate (keep as is - used in transactions)
  - updateProductToAvailable (if exists)
  - markProductApproved
  - markProductRejected
  - softDeleteProduct
  - updateImagePosition
  - normalizePrimaryImage
  - deleteImage
  - selectProductForModerationLock (keep as is - used in transactions)
  - selectProductForDeleteLock (keep as is - used in transactions)
  - selectImagesForUpdate (keep as is - used in transactions)
  - slugExists (keep as is - used in transactions)
- [ ] Modify read operations by owner_id to use queryByKey(ownerId, 'replica', ...)
  - selectOwnProductsPage
  - countOwnerProducts
- [ ] Special handling for incrementViewCount:
  - SELECT owner_id via queryShard (replica)
  - UPDATE via queryByKey(ownerId, 'primary', ...)
- [ ] Catalog/public reads: keep using Queryable (pool) since they don't filter by owner

### 2. orders.repository.ts
- [ ] Replace import from pool to cluster (queryByKey, queryShard)
- [ ] Write operations for buyer → queryByKey(buyerId, 'primary', ...)
  - insertOrder
  - insertPendingPayment
  - createOrderInitialEvents
  - updateOrderStatus
  - insertOrderEvent
  - updatePaymentPaid
  - setOrderDelivery
  - failOrderIfPending
  - failPendingPayment
- [ ] Write operations for seller → queryByKey(sellerId, 'primary', ...)
  - insertPayout
  - markPayoutDue
  - payPayout
  - markProductSold (needs sellerId = product.owner_id)
  - reserveProduct (needs sellerId = product.owner_id)
  - releaseReservedProduct (needs sellerId = product.owner_id)
- [ ] Read operations by buyer_id/seller_id → queryByKey(userId, 'replica', ...)
  - selectBuyerOrderIds
  - selectSellerOrderIds
  - selectBuyerOrderIdsPage
  - selectSellerOrderIdsPage
  - countOrdersForUser
  - selectOrderForUser
- [ ] Admin/mixed operations → keep using pool or queryShard

### 3. users.repository.ts
- [ ] Replace import from pool to cluster (queryByKey, queryShard)
- [ ] insertUser → queryShard(0, 'primary', ...) (broadcast to shard 0)
- [ ] findById → queryByKey(id, 'replica', ...)
- [ ] findByEmail → keep using pool (unknown shard from email)
- [ ] findEmailById → queryByKey(id, 'replica', ...)
- [ ] findAdminUserById → queryByKey(id, 'replica', ...)
- [ ] countAdminUsers → keep using pool (broadcast/admin)
- [ ] selectAdminUsersPage → keep using pool (broadcast/admin)

### 4. notifications.repository.ts
- [ ] Replace import from pool to cluster (queryByKey, queryShard)
- [ ] Write operations → queryByKey(userId, 'primary', ...)
  - insertNotification
  - markRead
  - markAllRead
- [ ] Read operations → queryByKey(userId, 'replica', ...)
  - countUnread
  - countForUser
  - selectNotificationPage

### 5. Validation
- [ ] npm run build
- [ ] npm run typecheck
- [ ] npm run test (if tests exist)

### 6. Final Report
- [ ] Generate summary table