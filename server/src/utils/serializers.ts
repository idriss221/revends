// ---------------------------------------------------------------------------
// Sérialisation RG 7.7 — TROIS vues utilisateur (api.md §1.6) et ressources.
// Un champ privé (name/email/phone) NE sort JAMAIS d'une vue PublicUser.
// ---------------------------------------------------------------------------

export interface UserRow {
  id: number;
  display_name: string;
  name: string;
  email: string;
  phone: string;
  role: 'user' | 'admin';
  created_at: Date | string;
  sales?: number;
  product_count?: number;
  order_count?: number;
  password_changed_at?: string | null;
}

export interface ProductRow {
  id: number;
  owner_id: number;
  name: string;
  slug: string;
  description: string;
  condition: string;
  price: number;
  old_price: number | null; // V4 — prix barré (RG-PROD-2), null = pas de réduction
  view_count: number; // V4 — compteur de consultations publiques (RG-PROD-3)
  location: string;
  status: string;
  rejection_reason: string | null;
  approved_at: Date | string | null;
  approved_by: number | null;
  brand: string | null;
  model: string | null;
  age_years: number | null;
  defects: string | null;
  accessories: string | null;
  notes: string | null;
  reserved_until: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  category_id: number; // id de la catégorie parente
  category_name: string;
  category_slug: string;
  subcategory_id: number;
  subcategory_name: string;
  subcategory_slug: string;
}

export interface ImageRow {
  id: number;
  /** Présent dans les résultats batch (`product_id = ANY(...)`) qui servent au groupement. */
  product_id: number;
  path: string;
  is_primary: boolean;
  position: number;
}

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
  | 'CANCELLED';

export interface OrderRow {
  id: number;
  order_number: string;
  amount: number;
  commission: number;
  seller_amount: number;
  quantity: number;
  status: OrderStatus;
  product_id: number;
  buyer_id: number;
  seller_id: number;
  delivery_carrier: string | null;
  tracking_number: string | null;
  shipping_name: string | null;
  shipping_phone: string | null;
  shipping_city: string | null;
  shipping_address: string | null;
  buyer_note: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

/** Ligne du journal `order_events` (1 changement de statut = 1 ligne, CA-ORD06). */
export interface OrderEventRow {
  id: number;
  order_id: number;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  actor: 'system' | 'admin' | 'user';
  note: string | null;
  created_at: Date | string;
}

export interface NotificationRow {
  id: number;
  type: string;
  title: string;
  message: string;
  read_at: Date | string | null;
  created_at: Date | string;
}

// ---------- Vues utilisateur ----------

export function serializePublicUser(row: UserRow, opts?: { sales: boolean }): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: row.id,
    displayName: row.display_name,
    memberSince: new Date(row.created_at).getUTCFullYear(),
  };
  if (opts?.sales) out.sales = row.sales ?? 0;
  return out;
}

export function serializeSelfUser(row: UserRow): Record<string, unknown> {
  return {
    id: row.id,
    displayName: row.display_name,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    memberSince: new Date(row.created_at).getUTCFullYear(),
    createdAt: toIso(row.created_at),
  };
}

export function serializeAdminUser(row: UserRow): Record<string, unknown> {
  return {
    id: row.id,
    displayName: row.display_name,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    memberSince: new Date(row.created_at).getUTCFullYear(),
    createdAt: toIso(row.created_at),
    ...(row.product_count !== undefined ? { productCount: row.product_count } : {}),
    ...(row.order_count !== undefined ? { orderCount: row.order_count } : {}),
  };
}

export function serializePublicUserSelfless(row: UserRow): Record<string, unknown> {
  return {
    id: row.id,
    displayName: row.display_name,
  };
}

// ---------- Images ----------

export function imageUrl(path: string): string {
  // Trois formes admises pour `product_images.path` :
  //  1. URL absolue (média hébergé : CDN, service de photos) → renvoyée telle quelle ;
  //  2. chemin absolu public ("/uploads/products/x.jpg")  → renvoyé tel quel ;
  //  3. chemin relatif ("uploads/products/x.jpg")         → préfixé par "/" car
  //     la colonne stocke déjà le chemin public servi par express.static sous /uploads/.
  //
  // ⚠️ Sans le cas (1), une URL absolue devenait "/https://…" et toutes les
  //    images renvoyaient 404 côté navigateur.
  if (/^(https?:)?\/\//.test(path)) return path;
  return path.startsWith('/') ? path : `/${path}`;
}

export function serializeImage(row: ImageRow): Record<string, unknown> {
  return {
    id: row.id,
    url: imageUrl(row.path),
    isPrimary: row.is_primary,
    position: row.position,
  };
}

// ---------- Produits ----------

function categorySection(row: ProductRow) {
  return {
    category: { id: row.category_id, name: row.category_name, slug: row.category_slug },
    subcategory: { id: row.subcategory_id, name: row.subcategory_name, slug: row.subcategory_slug },
  };
}

export interface SerializeProductOptions {
  admin?: boolean;
  owner?: boolean;
  seller?: Record<string, unknown> | null;
}

export function serializeProductDetail(row: ProductRow, images: ImageRow[], seller: Record<string, unknown> | null): Record<string, unknown> {
  return {
    ...baseProductFields(row),
    status: row.status,
    reservedUntil: toIsoOrNull(row.reserved_until),
    images: images.map(serializeImage),
    seller,
  };
}

export function serializeOwnerProduct(row: ProductRow, images: ImageRow[]): Record<string, unknown> {
  return {
    ...baseProductFields(row),
    status: row.status,
    rejectionReason: row.rejection_reason,
    approvedAt: toIsoOrNull(row.approved_at),
    reservedUntil: toIsoOrNull(row.reserved_until),
    images: images.map(serializeImage),
  };
}

/**
 * Vue produit ADMIN. `hasActiveOrder` (C4/PO-V5-15) est TOUJOURS présent — y
 * compris `false` — pour que le front puisse afficher l'état du bouton
 * supprimer sans logique supplémentaire. La forme de la charge utile ne change
 * donc pas par rapport à V4 : un champ booléen ajouté (api.md v2.4 §3.6).
 */
export function serializeProductAdmin(
  row: ProductRow,
  images: ImageRow[],
  owner: Record<string, unknown>,
  hasActiveOrder: boolean,
): Record<string, unknown> {
  return {
    ...baseProductFields(row),
    status: row.status,
    hasActiveOrder,
    rejectionReason: row.rejection_reason,
    approvedAt: toIsoOrNull(row.approved_at),
    reservedUntil: toIsoOrNull(row.reserved_until),
    images: images.map(serializeImage),
    owner,
  };
}

/**
 * Vendeur d'une carte catalogue, ou `null` si la source ne l'a pas joint.
 * `seller_display_name` n'est présent que sur les lignes de `queryCatalogPage`.
 */
function sellerOf(row: ProductRow): { displayName: string } | null {
  const name = (row as { seller_display_name?: string | null }).seller_display_name;
  return typeof name === 'string' && name.trim() !== '' ? { displayName: name } : null;
}

export function serializeProductCard(row: ProductRow, primaryImage: ImageRow | null): Record<string, unknown> {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    price: row.price,
    oldPrice: row.old_price,
    viewCount: row.view_count,
    brand: row.brand,
    location: row.location,
    condition: row.condition,
    createdAt: toIso(row.created_at),
    image: primaryImage ? { id: primaryImage.id, url: serializeImage(primaryImage).url } : null,
    // Le vendeur est exposé par `queryCatalogPage` (jointure users) ; absent sur
    // les autres sources (ex. mode `ids`), où le front retombe sur son repli.
    seller: sellerOf(row),
    ...categorySection(row),
  };
}

function baseProductFields(row: ProductRow): Record<string, unknown> {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    condition: row.condition,
    price: row.price,
    oldPrice: row.old_price,
    viewCount: row.view_count,
    location: row.location,
    brand: row.brand,
    model: row.model,
    ageYears: row.age_years,
    defects: row.defects,
    accessories: row.accessories,
    notes: row.notes,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    ...categorySection(row),
  };
}

// ---------- Commandes ----------

export interface OrderSerializeParts {
  order: OrderRow;
  product: ProductRow;
  primaryImage: ImageRow | null;
  buyer: UserRow;
  seller: UserRow;
  payment: { id: number; amount: number; method: string; status: string; reference: string | null; paid_at: Date | string | null };
  payout: { id: number; amount: number; status: string; reference: string | null; paid_at: Date | string | null } | null;
  events: OrderEventRow[];
}

function productSummary(product: ProductRow, primaryImage: ImageRow | null): Record<string, unknown> {
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    image: primaryImage ? serializeImage(primaryImage) : null,
  };
}

/**
 * Livraison + note acheteur — DONNÉES PRIVÉES de l'acheteur.
 * Exposées UNIQUEMENT dans les vues acheteur et admin (RG 7.7 / D2 :
 * la vue vendeur ne doit jamais recevoir les coordonnées de livraison).
 */
function buyerShippingFields(order: OrderRow): Record<string, unknown> {
  const hasShipping = order.shipping_name || order.shipping_phone || order.shipping_city || order.shipping_address;
  return {
    shipping: hasShipping
      ? {
          name: order.shipping_name,
          phone: order.shipping_phone,
          city: order.shipping_city,
          address: order.shipping_address,
        }
      : null,
    note: order.buyer_note,
  };
}

/** Elément du journal — forme §2.9 (fromStatus null = état initial). */
export function serializeOrderEvent(row: OrderEventRow): Record<string, unknown> {
  return {
    id: row.id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    actor: row.actor,
    note: row.note,
    createdAt: toIso(row.created_at),
  };
}

/**
 * Vue acheteur « détail » — POST /api/orders (201, api.md §3.3) : complète,
 * events[] inclus pour la timeline dès la création (CA-ORD01-02), statut
 * exposé PAYMENT_PENDING (CREATED transitoire, D-V3-2).
 */
export function serializeBuyerOrder(p: OrderSerializeParts): Record<string, unknown> {
  return {
    id: p.order.id,
    orderNumber: p.order.order_number,
    amount: p.order.amount,
    commission: p.order.commission,
    sellerAmount: p.order.seller_amount,
    quantity: p.order.quantity,
    status: p.order.status,
    role: 'buyer',
    buyer: serializePublicUser(p.buyer),
    seller: serializePublicUser(p.seller, { sales: true }),
    product: productSummary(p.product, p.primaryImage),
    payment: serializePaymentForBuyer(p.payment, { withAmount: true }),
    reservedUntil: toIsoOrNull(p.product.reserved_until),
    deliveryCarrier: p.order.delivery_carrier,
    trackingNumber: p.order.tracking_number,
    ...buyerShippingFields(p.order),
    events: p.events.map(serializeOrderEvent),
    createdAt: toIso(p.order.created_at),
  };
}

/** Vue vendeur « liste » — GET /api/me/sales : même principe que la vue acheteur,
 *  mais adaptée au rôle seller (D2 : buyer en vue publique SANS sales, payment SANS
 *  reference — la réf. de paiement de l'acheteur ne traverse jamais vers le vendeur). */
export function serializeSellerOrderSummary(p: OrderSerializeParts): Record<string, unknown> {
  return {
    id: p.order.id,
    orderNumber: p.order.order_number,
    amount: p.order.amount,
    commission: p.order.commission,
    sellerAmount: p.order.seller_amount,
    quantity: p.order.quantity,
    status: p.order.status,
    deliveryCarrier: p.order.delivery_carrier,
    trackingNumber: p.order.tracking_number,
    product: productSummary(p.product, p.primaryImage),
    buyer: serializePublicUser(p.buyer),
    payment: { id: p.payment.id, method: p.payment.method, status: p.payment.status, paidAt: toIsoOrNull(p.payment.paid_at) },
    createdAt: toIso(p.order.created_at),
  };
}

/** Vue acheteur « liste » — GET /api/me/orders (§2.7 / §3.4) : résumé sans events. */
export function serializeBuyerOrderSummary(p: OrderSerializeParts): Record<string, unknown> {
  return {
    id: p.order.id,
    orderNumber: p.order.order_number,
    amount: p.order.amount,
    commission: p.order.commission,
    sellerAmount: p.order.seller_amount,
    quantity: p.order.quantity,
    status: p.order.status,
    deliveryCarrier: p.order.delivery_carrier,
    trackingNumber: p.order.tracking_number,
    product: productSummary(p.product, p.primaryImage),
    seller: serializePublicUser(p.seller, { sales: true }),
    payment: serializePaymentForBuyer(p.payment),
    ...buyerShippingFields(p.order),
    createdAt: toIso(p.order.created_at),
  };
}

/** Vue détail commande (GET /api/orders/:id) — adaptée par role buyer/seller (CA-ORD09, PO-4). */
export function serializeOrderForParty(p: OrderSerializeParts, role: 'buyer' | 'seller'): Record<string, unknown> {
  return {
    id: p.order.id,
    orderNumber: p.order.order_number,
    amount: p.order.amount,
    commission: p.order.commission,
    sellerAmount: p.order.seller_amount,
    quantity: p.order.quantity,
    status: p.order.status,
    role,
    product: {
      ...productSummary(p.product, p.primaryImage),
      price: p.product.price,
      status: p.product.status,
    },
    /** fin de réservation (compte à rebours RESERVED → AVAILABLE) — nécessaire au front (reviewer V3-IMPORTANT-1) */
    reservedUntil: toIsoOrNull(p.product.reserved_until),
    buyer: serializePublicUser(p.buyer, { sales: false }),
    seller: serializePublicUser(p.seller, { sales: true }),
    payment:
      role === 'buyer'
        ? serializePaymentForBuyer(p.payment)
        : { id: p.payment.id, method: p.payment.method, status: p.payment.status, paidAt: toIsoOrNull(p.payment.paid_at) },
    deliveryCarrier: p.order.delivery_carrier,
    trackingNumber: p.order.tracking_number,
    // Coordonnées de livraison + note : PRIVÉS — jamais dans la vue vendeur (D2).
    ...(role === 'buyer' ? buyerShippingFields(p.order) : {}),
    events: p.events.map(serializeOrderEvent),
    createdAt: toIso(p.order.created_at),
  };
}

/** Vue admin — liste & détail (achat · §3.6). `events` fournis au détail uniquement. */
export function serializeAdminOrder(
  p: OrderSerializeParts,
  opts?: {
    buyer?: Record<string, unknown>;
    seller?: Record<string, unknown>;
    product?: Record<string, unknown>;
    events?: Record<string, unknown>[];
  },
): Record<string, unknown> {
  return {
    id: p.order.id,
    orderNumber: p.order.order_number,
    amount: p.order.amount,
    commission: p.order.commission,
    sellerAmount: p.order.seller_amount,
    quantity: p.order.quantity,
    status: p.order.status,
    createdAt: toIso(p.order.created_at),
    updatedAt: toIso(p.order.updated_at),
    product: opts?.product ?? productSummary(p.product, p.primaryImage),
    buyer: opts?.buyer ?? serializeAdminUser(p.buyer),
    seller: opts?.seller ?? serializeAdminUser(p.seller),
    payment: {
      id: p.payment.id,
      amount: p.payment.amount,
      method: p.payment.method,
      status: p.payment.status,
      reference: p.payment.reference,
      paidAt: toIsoOrNull(p.payment.paid_at),
    },
    payout: p.payout
      ? {
          id: p.payout.id,
          amount: p.payout.amount,
          status: p.payout.status,
          reference: p.payout.reference,
          paidAt: toIsoOrNull(p.payout.paid_at),
        }
      : null,
    deliveryCarrier: p.order.delivery_carrier,
    trackingNumber: p.order.tracking_number,
    ...buyerShippingFields(p.order),
    ...(opts?.events ? { events: opts.events } : {}),
  };
}

function serializePaymentForBuyer(
  pmt: OrderSerializeParts['payment'],
  opts?: { withAmount: boolean },
): Record<string, unknown> {
  return {
    id: pmt.id,
    ...(opts?.withAmount ? { amount: pmt.amount } : {}),
    method: pmt.method,
    status: pmt.status,
    reference: pmt.reference,
    paidAt: toIsoOrNull(pmt.paid_at),
  };
}

// ---------- Notifications ----------

export function serializeNotification(row: NotificationRow): Record<string, unknown> {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    read: row.read_at !== null,
    readAt: toIsoOrNull(row.read_at),
    createdAt: toIso(row.created_at),
  };
}

// ---------- Historique admin ----------

export function serializeHistoryRow(row: {
  id: number;
  admin_id: number;
  admin_display_name: string;
  admin_email: string;
  action: string;
  target_type: string;
  target_id: number;
  description: string;
  created_at: Date | string;
}): Record<string, unknown> {
  return {
    id: row.id,
    admin: {
      id: row.admin_id,
      displayName: row.admin_display_name,
      email: row.admin_email,
    },
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    description: row.description,
    createdAt: toIso(row.created_at),
  };
}

// ---------- Helpers ----------

function toIso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}
function toIsoOrNull(d: Date | string | null): string | null {
  return d ? toIso(d) : null;
}

// Les vues publics et internes utilisent le format de date ISO 8601 UTC.
export function formatFCFA(n: number): string {
  return n.toLocaleString('fr-FR').replace(/\u202f/g, ' ');
}