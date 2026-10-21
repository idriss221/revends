import type {
  AdminActionKind,
  Condition,
  OrderStatus,
  PaymentMethod,
  PayoutStatus,
  ProductStatus,
  SectionKind,
} from './types'

/** Enums métier — valeurs invariantes du contrat (§2.6). */
export const CONDITIONS: Condition[] = ['Neuf', 'Très bon état', 'Bon état', 'Correct', 'À réparer']

/**
 * Sections commerciales de l'accueil V3 (cahier V4 §12 / api.md §3.2).
 * Noms contractuels : recent · best_offers · popular · promotions · new · discover.
 */
export const SECTION_KINDS: SectionKind[] = ['recent', 'best_offers', 'popular', 'promotions', 'new', 'discover']

/** Libellés FR des sections (spec §5.2, D-ACC-5) — source unique partagée
 *  entre HomePage (titres de sections) et SearchPage (tri affiché si `section`). */
export const SECTION_TITLES: Record<SectionKind, string> = {
  recent: 'Produits récemment ajoutés',
  best_offers: 'Meilleures offres',
  popular: 'Produits populaires',
  promotions: 'Promotions',
  new: 'Nouveautés',
  discover: 'Découvrez nos produits',
}

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'MOBILE_MONEY', label: 'Mobile Money' },
  { value: 'CASH', label: 'Espèces' },
  { value: 'BANK_TRANSFER', label: 'Virement bancaire' },
  { value: 'OTHER', label: 'Autre' },
]

/** Liste fermée des motifs de refus (RG-REFUS, §7.5 cahier / §3.6 api). */
export const REJECTION_REASONS = [
  'Photos insuffisantes',
  'Description incorrecte',
  'Article en trop mauvais état',
  'Produit interdit',
  'Informations incomplètes',
  'Prix incohérent',
] as const

/* ------------------------------------------------------------------ */
/* Badges statuts — kinds V5 (design-system-revends-v5 §3.5)          */
/*                                                                     */
/* 6 kinds UNIQUEMENT, tous déclinés en tokens REVENDS. Plus aucun     */
/* `blue` / `purple` / `green` décoratif (interdit §9.5) :            */
/*   pending   → champagne-soft + chocolate (en attente / attention)   */
/*   approved  → positive-soft + positive   (publié, payé, livré)     */
/*   sold      → ink + on-dark               (vendu)                  */
/*   rejected  → danger-soft + danger        (refusé, annulé, échec)   */
/*   reserved  → terracotta-soft + terracotta-ink (réservé)            */
/*   neutral   → ivory + muted               (inactif, non applicable) */
/* ------------------------------------------------------------------ */

export type StatusBadgeKind = 'pending' | 'approved' | 'sold' | 'rejected' | 'reserved' | 'neutral'

export interface StatusBadgeSpec {
  kind: StatusBadgeKind
  label: string
}

const PRODUCT_STATUS_MAP: Record<ProductStatus, StatusBadgeSpec> = {
  PENDING: { kind: 'pending', label: 'En attente' },
  AVAILABLE: { kind: 'approved', label: 'Publié' },
  RESERVED: { kind: 'reserved', label: 'Réservé' },
  SOLD: { kind: 'sold', label: 'Vendu' },
  REJECTED: { kind: 'rejected', label: 'Refusé' },
}

/** Étapes nominales du cycle V3, dans l'ordre (timeline « Suivre mon colis »). */
export const ORDER_STEPS: OrderStatus[] = [
  'CREATED',
  'PAYMENT_PENDING',
  'PAID',
  'PRODUCT_WAITING',
  'PRODUCT_RECEIVED',
  'PREPARING',
  'SHIPPED',
  'IN_DELIVERY',
  'DELIVERED',
  'COMPLETED',
]

/** Libellés français des statuts commande V3 (vocabulaire métier FR de l'équipe). */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  CREATED: 'Commande créée',
  PAYMENT_PENDING: 'Paiement en attente',
  PAID: 'Payée',
  PRODUCT_WAITING: 'À récupérer',
  PRODUCT_RECEIVED: 'Article reçu',
  PREPARING: 'En préparation',
  SHIPPED: 'Prête / Expédiée',
  IN_DELIVERY: 'En livraison',
  DELIVERED: 'Livrée',
  COMPLETED: 'Terminée',
  PAYMENT_FAILED: 'Paiement échoué',
  CANCELLED: 'Annulée',
}

const ORDER_STATUS_MAP: Record<OrderStatus, StatusBadgeSpec> = {
  CREATED: { kind: 'pending', label: 'Commande créée' },
  PAYMENT_PENDING: { kind: 'pending', label: 'Paiement en attente' },
  PAID: { kind: 'approved', label: 'Payée' },
  PRODUCT_WAITING: { kind: 'pending', label: 'À récupérer' },
  PRODUCT_RECEIVED: { kind: 'approved', label: 'Article reçu' },
  PREPARING: { kind: 'pending', label: 'En préparation' },
  SHIPPED: { kind: 'pending', label: 'Prête / Expédiée' },
  IN_DELIVERY: { kind: 'pending', label: 'En livraison' },
  DELIVERED: { kind: 'approved', label: 'Livrée' },
  COMPLETED: { kind: 'approved', label: 'Terminée' },
  PAYMENT_FAILED: { kind: 'rejected', label: 'Paiement échoué' },
  CANCELLED: { kind: 'rejected', label: 'Annulée' },
}

/** Libellés des 3 états du paiement vendeur (PENDING → DUE → PAID). */
export const PAYOUT_STATUS_LABELS: Record<PayoutStatus, string> = {
  PENDING: 'En attente',
  DUE: 'À payer',
  PAID: 'Payé',
}

export function productStatusBadge(status: ProductStatus): StatusBadgeSpec {
  return PRODUCT_STATUS_MAP[status]
}

export function orderStatusBadge(status: OrderStatus): StatusBadgeSpec {
  return ORDER_STATUS_MAP[status]
}

/** Badge du paiement vendeur : PENDING « En attente » (ambre) / DUE « À payer » (ambre, à distinguer) / PAID « Payé » (vert). */
export function payoutStatusBadge(status: PayoutStatus): StatusBadgeSpec {
  switch (status) {
    case 'PAID':
      return { kind: 'approved', label: PAYOUT_STATUS_LABELS.PAID }
    case 'DUE':
      return { kind: 'pending', label: PAYOUT_STATUS_LABELS.DUE }
    default:
      return { kind: 'pending', label: PAYOUT_STATUS_LABELS.PENDING }
  }
}

/** Badge « état d'approbation » de la fiche publique : AVAILABLE/RESERVED/SOLD */
export function availabilityBadge(status: ProductStatus): StatusBadgeSpec {
  switch (status) {
    case 'RESERVED':
      return { kind: 'reserved', label: 'Réservé' }
    case 'SOLD':
      return { kind: 'sold', label: 'Vendu' }
    default:
      return { kind: 'approved', label: 'Disponible' }
  }
}

/* ------------------------------------------------------------------ */
/* Listes de filtres admin — DÉRIVÉES des libellés ci-dessus            */
/* (§9.4 règle anti-dérive : une seule source de vérité par libellé)    */
/* ------------------------------------------------------------------ */

export interface FilterOption {
  value: string
  label: string
}

/**
 * Filtre statut du back-office Articles : les **5 statuts produit** côté serveur.
 *
 * ⚠️ Pas d'option « Tous les statuts » : `GET /api/admin/products` applique
 * `status = $1` en dur et `adminProductsQuerySchema` le **défaut à `PENDING`**
 * (`server/src/utils/validation.ts:319`). Il n'existe donc aucune façon
 * d'exprimer « tous » — l'option affirmait un périmètre que l'API n'a jamais
 * renvoyé (elle affichait silencieusement les seuls articles en attente).
 * On ne propose que des valeurs réelles de l'enum `productStatuses`, sinon le
 * serveur répond 400 et l'écran bascule en état d'erreur.
 */
export const PRODUCT_STATUS_FILTERS: FilterOption[] = [
  { value: 'AVAILABLE', label: 'Publiés' },
  { value: 'PENDING', label: 'En attente' },
  { value: 'RESERVED', label: 'Réservés' },
  { value: 'SOLD', label: 'Vendus' },
  { value: 'REJECTED', label: 'Refusés' },
]

/**
 * Filtre statut du back-office Commandes : les **12** libellés de
 * `ORDER_STATUS_LABELS`, jamais une liste recopiée dans une page
 * (spec-admin §6-4 « source unique, aucun libellé dupliqué »).
 */
export const ORDER_STATUS_FILTERS: FilterOption[] = [
  { value: '', label: 'Tous les statuts' },
  ...(Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).map((status) => ({
    value: status,
    label: ORDER_STATUS_LABELS[status],
  })),
]

/** Filtre du back-office Paiements vendeurs (PayoutStatus, défaut « À payer »). */
export const PAYOUT_FILTERS: FilterOption[] = [
  { value: 'due', label: 'À payer' },
  { value: '', label: 'Tous' },
  { value: 'pending', label: 'En attente' },
  { value: 'paid', label: 'Payés' },
]

/* ------------------------------------------------------------------ */
/* Textes d'état vide — SOURCE UNIQUE (design-system-revends-v5 §3.12) */
/*                                                                     */
/* 8 textes imposés (4 tabulés + 4 compléments). Aucun écran ne réécrit */
/* un titre d'état vide : il choisit une clé et rend `EmptyState`.      */
/* ------------------------------------------------------------------ */

export type EmptyCopyKey =
  | 'search'
  | 'favorites'
  | 'orders'
  | 'sales'
  | 'cart'
  | 'notifications'
  | 'admin'
  | 'notFound'
  /* Back-office — spec-admin §6.2/§7 : « message SPÉCIFIQUE » par écran, jamais
     un texte générique réutilisé sur deux tables (§9.4 : EMPTY_COPY est la
     source unique des états vides). */
  | 'adminPending'
  | 'adminArticles'
  | 'adminArticlesFiltered'
  | 'adminOrders'
  | 'adminOrdersFiltered'
  | 'adminPayments'
  | 'adminUsers'
  | 'adminUsersFiltered'
  | 'adminCategories'
  | 'adminHistory'

export interface EmptyCopy {
  title: string
  description: string
}

export const EMPTY_COPY: Record<EmptyCopyKey, EmptyCopy> = {
  search: {
    title: 'Rien ici pour l’instant',
    description:
      'Aucun article ne correspond à votre recherche. Élargissez vos filtres ou explorez une autre catégorie.',
  },
  favorites: {
    title: 'Vos favoris sont vides',
    description: 'Touchez le cœur d’un article pour le retrouver ici. Vos favoris restent sur cet appareil.',
  },
  orders: {
    title: 'Aucune commande pour l’instant',
    description: 'Vos achats apparaîtront ici dès votre première commande.',
  },
  sales: {
    title: 'Aucune vente enregistrée',
    description: 'Dès qu’un de vos articles sera vendu, vous suivrez ici le paiement de votre commission.',
  },
  cart: {
    title: 'Votre panier est vide',
    description: 'Parcourez le catalogue et ajoutez vos premiers articles.',
  },
  notifications: {
    title: 'Aucune notification',
    description: 'Vous serez prévenu dès qu’un article sera approuvé ou qu’une commande avancera.',
  },
  admin: {
    title: 'Rien en attente',
    description: 'Aucun article, aucune commande, aucun paiement à traiter.',
  },
  notFound: {
    title: 'Cette page n’a pas trouvé de seconde vie',
    description: 'Le lien est peut-être erroné ou l’article a été retiré du catalogue.',
  },

  /* Back-office : un message par écran + une variante « filtré » quand la liste
     est vide à cause d'un filtre (sinon l'utilisateur croit que la donnée a
     disparu). */
  adminPending: {
    // Volontairement distinct de `admin` (« Rien en attente ») : le dashboard
    // annonce une absence d'action, la file de modération une absence d'article.
    title: 'Aucun article à modérer',
    description: 'Tous les articles soumis ont été traités. Rien à modérer pour le moment.',
  },
  adminArticles: {
    title: 'Aucun article',
    description: 'Le catalogue est vide pour le moment.',
  },
  adminArticlesFiltered: {
    title: 'Aucun article ne correspond',
    description: 'Élargissez la recherche ou réinitialisez les filtres pour revoir vos articles.',
  },
  adminOrders: {
    title: 'Aucune commande',
    description: 'Aucune commande n’a encore été passée.',
  },
  adminOrdersFiltered: {
    title: 'Aucune commande pour ce statut',
    description: 'Aucune commande ne correspond à ce filtre. Choisissez un autre statut.',
  },
  adminPayments: {
    title: 'Aucun paiement à traiter',
    description: 'Aucun paiement vendeur ne correspond à ce filtre.',
  },
  adminUsers: {
    title: 'Aucun utilisateur',
    description: 'La liste des utilisateurs est vide.',
  },
  adminUsersFiltered: {
    title: 'Aucun utilisateur trouvé',
    description: 'Aucun utilisateur ne correspond à cette recherche. Essayez un autre nom, e-mail ou téléphone.',
  },
  adminCategories: {
    title: 'Aucune catégorie',
    description: 'La liste des catégories est vide.',
  },
  adminHistory: {
    title: 'Aucune entrée',
    description: 'Aucune action ne correspond à ce filtre.',
  },
}

/* ------------------------------------------------------------------ */
/* Phrases de toast — SOURCE UNIQUE (design-system-revends-v5 §7)      */
/*                                                                     */
/* 37 formulations imposées. Aucune page n'écrit son propre texte de   */
/* toast : elle appelle `toast('success', TOAST_COPY.x)` (§9.4).       */
/* ------------------------------------------------------------------ */

export const TOAST_COPY = {
  /* Panier */
  addedToCart: (name: string) => `« ${name} » a été ajouté à votre panier.`,
  removedFromCart: 'Article retiré de votre panier.',
  /* Favoris */
  favoriteAdded: 'Ajouté à vos favoris.',
  favoriteRemoved: 'Retiré de vos favoris.',
  /* Commande */
  orderConfirmed: (count: number) => `Commande confirmée — ${count} article${count > 1 ? 's' : ''}. ✓`,
  invalidFields: 'Veuillez corriger les champs en rouge avant de confirmer.',
  loginRequired: 'Connectez-vous pour confirmer votre commande.',
  productSold: 'Ce produit vient d’être vendu.',
  /* Photos & publication */
  photosAdded: (count: number) => `${count} photo${count > 1 ? 's' : ''} ajoutée${count > 1 ? 's' : ''}.`,
  photosRequired: 'Ajoutez au moins 3 photos.',
  productSubmitted: 'Article envoyé — il sera visible après validation.',
  /* Administration (spec-admin §9.1 — 409 : garde serveur = vérité) */
  productDeleted: 'Article supprimé du catalogue. Le vendeur a été prévenu.',
  productHasActiveOrder: 'Suppression impossible : l’article est lié à une commande en cours.',
  orderReceived: 'Réception confirmée.',
  /* Confirmation du PAIEMENT acheteur (AdminOrderDetailPage) — distincte de
     `orderReceived` (réception de l’article) et de `payoutMarked` (vendeur). */
  paymentConfirmed: 'Paiement de l’acheteur confirmé.',
  payoutMarked: 'Paiement marqué comme payé.',
  /* Cycle de commande admin (AdminOrderDetailPage) — succès des 4
     transitions du V3 : prête → livraison → livrée → annulée. */
  orderMarkedReady: 'Commande marquée comme prête. Vous pouvez l’expédier.',
  deliveryStarted: 'Commande envoyée en livraison.',
  orderDelivered: 'Commande livrée et terminée.',
  orderCancelled: 'Commande annulée.',
  /* Modération (AdminPendingPage) */
  productApproved: 'Article approuvé et mis en ligne.',
  productRejected: 'Article refusé.',
  /* Catégories (AdminCategoriesPage) */
  categoryRenamed: 'Catégorie renommée.',
  categoryStatusUpdated: 'Statut mis à jour.',
  /* Replis d’erreur admin (`onError`) — source unique : aucune page ne
     réécrit son texte ; `err.message` (garde serveur) reste prioritaire. */
  paymentConfirmationFailed: 'Échec de la confirmation.',
  productReceiveFailed: 'Échec de l’opération.',
  updateFailed: 'Échec de la mise à jour.',
  deliveryStartFailed: 'Échec du lancement de la livraison.',
  deliveryConfirmFailed: 'Échec de la confirmation de livraison.',
  orderCancelFailed: 'Échec de l’annulation.',
  payoutFailed: 'Échec du paiement.',
  categoryRenameFailed: 'Échec du renommage.',
  productApprovalFailed: 'Échec de l’approbation.',
  productRejectionFailed: 'Échec du refus.',
  /* Repli d’erreur **générique** : tout `onError` qui n’a pas de copie dédiée
     passe par ici — jamais une chaîne écrite dans une page (§9.4). */
  actionFailed: 'Opération impossible. Réessayez dans un instant.',
  /* Divers */
  orderNumberCopied: 'Numéro de commande copié.',
  networkError: 'Connexion impossible. Vérifiez votre réseau et réessayez.',
} as const

/* ------------------------------------------------------------------ */
/* Journal d'actions admin — SOURCE UNIQUE (libellés + icônes + ton)    */
/* Utilisé par l'historique ; toute autre page lit cette table.        */
/* ------------------------------------------------------------------ */

export const ADMIN_ACTION_META: Record<AdminActionKind, { label: string; icon: string; kind: StatusBadgeKind }> = {
  'product.approved': { label: 'Article approuvé', icon: 'fa-check', kind: 'approved' },
  'product.rejected': { label: 'Article refusé', icon: 'fa-xmark', kind: 'rejected' },
  'product.delete': { label: 'Article supprimé', icon: 'fa-trash-can', kind: 'rejected' },
  'product.received': { label: 'Article reçu', icon: 'fa-box-open', kind: 'approved' },
  'payment.confirmed': { label: 'Paiement acheteur confirmé', icon: 'fa-wallet', kind: 'approved' },
  'seller.paid': { label: 'Vendeur payé', icon: 'fa-money-bill-wave', kind: 'approved' },
  'order.shipped': { label: 'Commande prête / expédiée', icon: 'fa-box', kind: 'neutral' },
  'delivery.started': { label: 'Livraison lancée', icon: 'fa-truck-fast', kind: 'neutral' },
  'order.delivered': { label: 'Commande livrée', icon: 'fa-check-double', kind: 'approved' },
  'order.cancelled': { label: 'Commande annulée', icon: 'fa-ban', kind: 'rejected' },
  // Écrit par `patchCategory` (categories.service.ts) — doit couvrir les 10
  // valeurs de `adminActionTypes`, sinon l’action est **infiltrable** depuis
  // l’écran Historique (adminApiContract.test.ts).
  'category.update': { label: 'Catégorie mise à jour', icon: 'fa-pen-to-square', kind: 'neutral' },
}

export const ADMIN_ACTION_FILTERS: FilterOption[] = [
  { value: '', label: 'Toutes les actions' },
  ...(Object.keys(ADMIN_ACTION_META) as AdminActionKind[]).map((action) => ({
    value: action,
    label: ADMIN_ACTION_META[action].label,
  })),
]
