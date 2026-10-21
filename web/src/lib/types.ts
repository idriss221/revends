/**
 * Types miroir du contrat d'API (docs/api.md §2).
 * camelCase dans les JSON, enums en UPPER_SNAKE_CASE, montants FCFA entiers.
 */

export type Role = 'user' | 'admin'

export interface PublicUser {
  id: number
  displayName: string
  memberSince: number
  /** présent sur les vendeurs (réputation D2), omis pour les acheteurs vus par le vendeur */
  sales?: number
}

export interface SelfUser {
  id: number
  displayName: string
  name: string
  email: string
  phone: string
  role: Role
  memberSince: number
  createdAt: string
}

export type AdminUser = SelfUser & {
  productCount?: number
  orderCount?: number
}

export type ProductStatus = 'PENDING' | 'AVAILABLE' | 'RESERVED' | 'SOLD' | 'REJECTED'
/** Cycle V3 (cahier-des-charges-v3 §5.1 / api.md §2.6) — 9 étapes nominales + 2 échecs. */
export type OrderStatus =
  | 'CREATED'
  | 'PAYMENT_PENDING'
  | 'PAID'
  | 'PRODUCT_WAITING'
  | 'PRODUCT_RECEIVED'
  | 'PREPARING'
  | 'SHIPPED'
  | 'IN_DELIVERY'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'PAYMENT_FAILED'
  | 'CANCELLED'
export type PaymentMethod = 'MOBILE_MONEY' | 'CASH' | 'BANK_TRANSFER' | 'OTHER'
export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED'
/** Cycle du paiement vendeur : PENDING (En attente) → DUE (À payer, créé à la livraison) → PAID (Payé). */
export type PayoutStatus = 'PENDING' | 'DUE' | 'PAID'

/** Journal horodaté des changements de statut (order_events, §2.9 api.md). */
export interface OrderEvent {
  id: number
  fromStatus: OrderStatus | null
  toStatus: OrderStatus
  actor: 'system' | 'admin' | 'user'
  note: string | null
  createdAt: string
}

export type Condition = 'Neuf' | 'Très bon état' | 'Bon état' | 'Correct' | 'À réparer'

/**
 * Presets de section de l'accueil V3 (cahier V4 §12 / api.md §3.2).
 * Noms contractuels : recent · best_offers · popular · promotions · new · discover.
 * Les libellés FR (« Produits récemment ajoutés »…) sont côté front (D-ACC-5).
 */
export type SectionKind = 'recent' | 'best_offers' | 'popular' | 'promotions' | 'new' | 'discover'

/** Tri produits (api.md §3.2) : 'popular' ajouté par V4-Accueil (CA-ACC-51). */
export type ProductSort = 'recent' | 'price_asc' | 'price_desc' | 'popular'

export interface Category {
  id: number
  name: string
  slug: string
  active?: boolean
  children?: Category[]
}

export interface CategoryNode extends Category {
  children: CategoryNode[]
}

export interface ProductImageDto {
  id: number
  url: string
  isPrimary: boolean
  position: number
}

export interface MiniCategory {
  id: number
  name: string
  slug: string
}

export interface ProductCardItem {
  id: number
  name: string
  slug: string
  price: number
  location: string
  condition: Condition
  createdAt: string
  image: { id: number; url: string } | null
  category: MiniCategory
  subcategory: MiniCategory
  /** V4-Accueil : ancien prix (réduction) — renvoyé par l'API, options tolérantes ici (D-ACC-3, §7.3 cahier V4). */
  oldPrice?: number | null
  /** V4-Accueil : compteur de consultations publiques (badge « populaires »). */
  viewCount?: number
  /** V4-Accueil : marque (filtre marque, RG-PROD-5). */
  brand?: string | null
  /**
   * Statut du produit — **optionnel et tolérant** : le catalogue public ne
   * renvoie que des articles disponibles, mais la fiche (`ProductDetail`) en
   * porte toujours un. Pilote la variante `sold` et le CTA « Réservé »
   * (DA §3.3.7). Champ absent → comportement `default`.
   */
  status?: ProductStatus
}

export interface ProductDetail {
  id: number
  name: string
  slug: string
  description: string
  condition: Condition
  price: number
  location: string
  status: ProductStatus
  reservedUntil: string | null
  category: MiniCategory
  subcategory: MiniCategory
  images: ProductImageDto[]
  brand: string | null
  model: string | null
  ageYears: number | null
  defects: string | null
  accessories: string | null
  notes: string | null
  seller: PublicUser
  createdAt: string
  updatedAt: string
  /** V4-Accueil : ancien prix + compteur de vues (fiche publique, D-ACC-3). */
  oldPrice?: number | null
  viewCount?: number
}

/** Fiche côté propriétaire — « Mes articles » / réponse POST-PUT (§2.4) */
export interface OwnerProduct {
  id: number
  name: string
  slug: string
  description: string
  condition: Condition
  price: number
  location: string
  status: ProductStatus
  rejectionReason: string | null
  approvedAt: string | null
  reservedUntil: string | null
  category: MiniCategory
  subcategory: MiniCategory
  images: ProductImageDto[]
  brand: string | null
  model: string | null
  ageYears: number | null
  defects: string | null
  accessories: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

/** Fiche vue admin : OwnerProduct + owner en vue AdminUser (§2.5) */
export interface ProductAdmin extends OwnerProduct {
  owner: AdminUser
  /**
   * CA-V5-065 : l'article est lié à une commande en cours → suppression
   * impossible. Champ **absent → `false`** (le 409 serveur reste la vérité).
   */
  hasActiveOrder?: boolean
}

export interface OrderSummary {
  id: number
  orderNumber: string
  amount: number
  commission: number
  sellerAmount: number
  status: OrderStatus
  product: {
    id: number
    name: string
    slug: string
    image: { id: number; url: string } | null
  }
  seller: PublicUser
  payment: {
    id: number
    method: PaymentMethod
    status: PaymentStatus
    /** présente côté acheteur/admin uniquement — la vue vendeur l'omet volontairement (D2) */
    reference?: string | null
    paidAt: string | null
  }
  createdAt: string
}

/** Adresse de livraison du panier (POST /api/orders/checkout, logique « Jumia »). */
export interface CheckoutShipping {
  name: string
  phone: string
  city: string
  address: string
}

/** Corps de POST /api/orders/checkout — commande groupée (une commande par produit, transactionnelle). */
export interface CheckoutPayload {
  productIds: number[]
  /** Quantités par id produit (optionnel — défaut 1, bornées 1..9). Toujours envoyé par le panier. */
  quantities?: Record<string, number>
  paymentMethod?: string
  shipping?: CheckoutShipping
  note?: string
}

/** Réponse de POST /api/orders/checkout */
export interface CheckoutResponse {
  orders: OrderSummary[]
  count: number
}

/** Détail d'une commande, vue acheteur OU vendeur (GET /api/orders/:id, §3.4) */
export interface OrderDetail extends OrderSummary {
  role: 'buyer' | 'seller'
  buyer: PublicUser
  seller: PublicUser
  reservedUntil?: string | null
  /** champs de suivi de livraison (V3, PO-6) — visibles selon le rôle */
  deliveryCarrier?: string | null
  trackingNumber?: string | null
  /** historique complet des changements de statut (order_events, V3) */
  events: OrderEvent[]
}

export interface AdminOrderItem {
  id: number
  orderNumber: string
  amount: number
  commission: number
  sellerAmount: number
  /** Quantité du produit commandé, envoyée par serializeAdminOrder (liste ET détail). */
  quantity: number
  status: OrderStatus
  createdAt: string
  updatedAt: string
  product: {
    id: number
    name: string
    slug: string
    image: { id: number; url: string } | null
  }
  buyer: AdminUser
  seller: AdminUser
  payment: {
    id: number
    amount: number
    method: PaymentMethod
    status: PaymentStatus
    reference: string | null
    paidAt: string | null
  }
  payout: {
    id: number
    amount: number
    status: PayoutStatus
    reference: string | null
    paidAt: string | null
  } | null
}

export interface AdminOrderDetail extends AdminOrderItem {
  product: {
    id: number
    name: string
    slug: string
    image: { id: number; url: string } | null
    price: number
    status: ProductStatus
  }
  /** Coordonnées de livraison renseignées au checkout — null si achat sans adresse. */
  shipping: {
    name: string | null
    phone: string | null
    city: string | null
    address: string | null
  } | null
  /** Note laissée par l'acheteur au checkout — null si absente. */
  note: string | null
  deliveryCarrier?: string | null
  trackingNumber?: string | null
  events: OrderEvent[]
}

export interface Notification {
  id: number
  type: string
  title: string
  message: string
  read: boolean
  readAt: string | null
  createdAt: string
}

/**
 * Actions journalisées par le back-office. Doit être **strictement égal** à
 * `adminActionTypes` côté serveur (`server/src/utils/validation.ts`) : une
 * valeur manquante ici deviendrait un 400 sur `GET /api/admin/history?action=…`
 * et, pire, une action réellement écrite (ex. `product.delete`) resterait
 * **infiltrable** depuis l'écran Historique.
 */
export type AdminActionKind =
  | 'product.approved'
  | 'product.rejected'
  | 'product.delete'
  | 'product.received'
  | 'payment.confirmed'
  | 'seller.paid'
  | 'order.shipped'
  | 'delivery.started'
  | 'order.delivered'
  | 'order.cancelled'
  | 'category.update'

export interface AdminHistoryItem {
  id: number
  admin: { id: number; displayName: string; email: string }
  action: AdminActionKind
  targetType: 'product' | 'order' | 'category'
  targetId: number
  description: string
  createdAt: string
}

export interface AdminStats {
  users: number
  pendingProducts: number
  activeOrders: number
  pendingPayouts: number
  /** Paiements vendeurs « À payer » (status DUE) + montant cumulé — enrichis par le backend (rétrocompatible). */
  payoutsDue: number
  payoutsDueAmount: number
  /** Compteurs par état de commande (alimentent « Actions à effectuer » du dashboard). */
  orders: {
    paymentPending: number
    productWaiting: number
    productReceived: number
    preparing: number
    shipped: number
    inDelivery: number
    delivered: number
    completed: number
  }
}

export interface ProductsResponse {
  items: ProductCardItem[]
  page: number
  perPage: number
  total: number
  totalPages: number
}

/**
 * Paramètres de GET /api/products (api.md §3.2).
 * - `section` et `sort` sont mutuellement priorisés côté API (section gagne si les deux) ;
 *   le front n'envoie jamais les deux (cahier V4 §12 #3).
 * - `ids` : mode EXCLUSIF (aucun autre paramètre autorisé — dédup/vus récents, ≤ 20, ordre conservé).
 * - `not_in` : dédup entre sections de l'accueil (≤ 200, §12 #5).
 */
export interface ProductListParams {
  q?: string
  category_id?: number | string
  subcategory_id?: number | string
  section?: SectionKind
  sort?: ProductSort
  price_min?: number
  price_max?: number
  condition?: Condition
  location?: string
  brand?: string
  ids?: number[]
  not_in?: number[]
  page?: number
  per_page?: number
}

/** Bannière du carrousel accueil (api.md §3.2 quater, champ plat `imagePath` — cahier V4 §12 #7). */
export interface Banner {
  id: number
  title: string
  subtitle: string | null
  /** URL relative publique (/uploads/... ou /categories/...) — null = rendu texte (CA-ACC-09). */
  imagePath: string | null
  /** Route interne ou URL externe — null = non cliquable. */
  linkUrl: string | null
  position: number
}

export interface BannersResponse {
  banners: Banner[]
}

/** Valeurs distinctes de localisation (filtre, PO-ACC-2) — GET /api/products/locations. */
export interface LocationsResponse {
  locations: string[]
}

/** [C6-SUPPRIMÉ] Contact vendeur retiré (CA-V5-097). */
// export interface ContactPayload {
//   message: string
//   email?: string
// }
// export interface ContactResponse {
//   ok: true
//   notificationId: number
// }

export interface MyProductsResponse {
  items: OwnerProduct[]
  counts: {
    total: number
    pending: number
    available: number
    reserved: number
    sold: number
    rejected: number
  }
}

export interface Paged<T> {
  items: T[]
  page: number
  perPage: number
  total: number
  totalPages: number
}

export interface CategoriesResponse {
  categories: Category[]
}

export interface AdminCategoriesResponse {
  categories: (Category & { active: boolean; children: (Category & { active: boolean })[] })[]
}

export interface NotificationsResponse extends Paged<Notification> {
  unreadCount: number
}

export interface AuthResponse {
  user: SelfUser
  unreadNotifications: number
}

export interface RegisterPayload {
  displayName: string
  name: string
  email: string
  phone: string
  password: string
  acceptedCgu: boolean
}

export interface ValidationErrorDetail {
  field: string
  message: string
}

export interface ApiErrorBody {
  error: {
    code: string
    message: string
    details?: ValidationErrorDetail[]
  }
}
/* ------------------------------------------------------------------ */
/* Recherche à suggestions — CA-V5-136, contrat `GET /api/products/   */
/* suggestions` (docs/api.md v2.4 §3.2, endpoint V5 livré).           */
/*                                                                     */
/* `products[]` contient des `ProductCard` STRICTEMENT identiques à    */
/* celles du catalogue (même sérialiseur serveur) : on réutilise donc   */
/* `ProductCardItem` au lieu d'un DTO approximatif — une suggestion ne  */
/* peut pas diverger d'une carte de catalogue (P4).                    */
/* Plafond global 10 = 6 produits + 2 catégories + 2 marques.           */
/* ------------------------------------------------------------------ */
export interface SuggestCategoryDto {
  id: number
  name: string
  slug: string
}

/* ------------------------------------------------------------------ */
/* Panier (§3.4) — GET/POST/PATCH/DELETE /api/cart                    */
/* Le serveur renvoie un TABLEAU de lignes (cart.service.ts).         */
/* ------------------------------------------------------------------ */

export interface CartLineDto {
  productId: number
  productName: string
  productSlug: string
  price: number
  oldPrice: number | null
  image: { id: number; url: string } | null
  qty: number
  stock: number
  sellerId: number
}

export interface AddToCartPayload {
  productId: number
  qty?: number
}

export interface UpdateCartPayload {
  qty: number
}

/* ------------------------------------------------------------------ */
/* Favoris (§3.5) — GET/POST/DELETE /api/favorites                    */
/* Le serveur renvoie un TABLEAU (favorites.service.ts).              */
/* ------------------------------------------------------------------ */

export interface FavoriteProductDto {
  productId: number
  productName: string
  productSlug: string
  price: number
  oldPrice: number | null
  image: { id: number; url: string } | null
  sellerId: number
  sellerDisplayName: string
  condition: string
  location: string
  addedAt: string
}

export interface ToggleFavoritePayload {
  productId: number
}

/* ------------------------------------------------------------------ */
/* Recherche à suggestions — CA-V5-136, contrat `GET /api/products/   */
/* suggestions` (docs/api.md v2.4 §3.2, endpoint V5 livré).           */
/*                                                                     */
/* `products[]` contient des `ProductCard` STRICTEMENT identiques à    */
/* celles du catalogue (même sérialiseur serveur) : on réutilise donc   */
/* `ProductCardItem` au lieu d'un DTO approximatif — une suggestion ne  */
/* peut pas diverger d'une carte de catalogue (P4).                    */
/* Plafond global 10 = 6 produits + 2 catégories + 2 marques.           */
/* ------------------------------------------------------------------ */

export interface SearchSuggestionsResponse {
  /** écho de la requête, normalisé par le trim du schéma serveur */
  q: string
  /** ≤ 2 — catégories actives (parentes avant sous-catégories, puis `name ASC`) */
  categories: SuggestCategoryDto[]
  /** ≤ 2 — marques distinctes non vides, triées (`string[]`, pas des objets) */
  brands: string[]
  /** ≤ 6 — articles `AVAILABLE` triés `view_count DESC, id` */
  products: ProductCardItem[]
}
