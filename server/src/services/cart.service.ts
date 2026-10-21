import { pool, type DbClient, type Queryable } from '../db/pool.js';
import { withTransaction } from '../utils/db.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { loadPrimaryImages, productExistsAndAvailable } from '../repositories/products.repository.js';
import {
  clearCart,
  getCartLinesWithImages,
  removeCartLine,
  setCartQty,
  upsertCartLine,
  type CartLineWithImage,
} from '../repositories/cart.repository.js';
import { serializeProductCard, imageUrl, type ImageRow } from '../utils/serializers.js';

// ---------------------------------------------------------------------------
// Types de sortie (alignés avec le contrat API)
// ---------------------------------------------------------------------------

export interface CartLineResponse {
  productId: number;
  productName: string;
  productSlug: string;
  price: number;
  oldPrice: number | null;
  image: { id: number; url: string } | null;
  qty: number;
  stock: number; // Pour le front : quantité disponible (simplifié = 1 pour produit unique, ou stock réel si géré)
  sellerId: number;
}

// ---------------------------------------------------------------------------
// Service: Panier
// ---------------------------------------------------------------------------

/**
 * Récupère le panier complet de l'utilisateur avec les produits joints et images.
 */
export async function getCart(userId: number, q: Queryable = pool): Promise<CartLineResponse[]> {
  const lines = await getCartLinesWithImages(userId, q);
  return lines.map((line) => mapCartLine(line));
}

/**
 * Ajoute un produit au panier (ou incrémente la quantité si déjà présent).
 * Upsert avec ON CONFLICT, limite qty max 9.
 */
export async function addToCart(
  userId: number,
  productId: number,
  qty = 1,
): Promise<CartLineResponse> {
  if (!Number.isInteger(qty) || qty < 1 || qty > 9) {
    throw badRequest('INVALID_QUANTITY', 'La quantité doit être un entier entre 1 et 9');
  }

  // Vérifier que le produit existe et est disponible
  const available = await productExistsAndAvailable(productId);
  if (!available) {
    throw notFound('PRODUCT_NOT_FOUND', 'Article introuvable ou indisponible');
  }

  const line = await withTransaction((client) => upsertCartLine(client, { userId, productId, qty }));
  // Recharger la ligne complète avec produit joint + image
  const lines = await getCartLinesWithImages(userId);
  const found = lines.find((l) => l.product_id === productId);
  if (!found) throw notFound('CART_LINE_NOT_FOUND', 'Ligne de panier introuvable après ajout');
  return mapCartLine(found);
}

/**
 * Définit la quantité d'un produit dans le panier.
 * Si qty ≤ 0 → supprime la ligne.
 */
export async function setQty(
  userId: number,
  productId: number,
  qty: number,
): Promise<CartLineResponse | null> {
  if (!Number.isInteger(qty) || qty < 0 || qty > 9) {
    throw badRequest('INVALID_QUANTITY', 'La quantité doit être un entier entre 0 et 9');
  }

  const line = await withTransaction((client) => setCartQty(client, userId, productId, qty));

  if (!line) return null;

  // Recharger la ligne complète avec produit joint + image
  const lines = await getCartLinesWithImages(userId);
  const found = lines.find((l) => l.product_id === productId);
  if (!found) return null;
  return mapCartLine(found);
}

/**
 * Retire un produit du panier.
 */
export async function removeFromCart(userId: number, productId: number): Promise<void> {
  await withTransaction((client) => removeCartLine(client, userId, productId));
}

/**
 * Vide complètement le panier.
 */
export async function clearCartService(userId: number): Promise<void> {
  await withTransaction((client) => clearCart(client, userId));
}

// ---------------------------------------------------------------------------
// Mapping interne → réponse API
// ---------------------------------------------------------------------------

function mapCartLine(line: CartLineWithImage): CartLineResponse {
  // L'image primaire est déjà chargée dans line.primary_image.
  // `imageUrl()` gère les 3 formes de `path` (URL absolue CDN, chemin public
  // "/uploads/…", chemin relatif) : un simple `/${path}` transformait une URL
  // absolue en "/https://…" → image cassée dans le panier.
  const image = line.primary_image
    ? { id: line.primary_image.id, url: imageUrl(line.primary_image.path) }
    : null;

  return {
    productId: line.product_id,
    productName: line.name,
    productSlug: line.slug,
    price: line.price,
    oldPrice: line.old_price,
    image,
    qty: line.qty,
    stock: 1, // Produit unique (pas de gestion de stock multi-quantité)
    sellerId: line.owner_id,
  };
}