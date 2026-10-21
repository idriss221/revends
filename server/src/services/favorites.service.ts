import { pool, type DbClient, type Queryable } from '../db/pool.js';
import { withTransaction } from '../utils/db.js';
import { notFound } from '../utils/errors.js';
import { loadPrimaryImages, productExists } from '../repositories/products.repository.js';
import {
  getFavoritesWithImages,
  isFavorite,
  removeFavorite,
  toggleFavorite,
  type FavoriteWithImage,
} from '../repositories/favorites.repository.js';
import { serializeProductCard, imageUrl, type ImageRow } from '../utils/serializers.js';

// ---------------------------------------------------------------------------
// Types de sortie (alignés avec le contrat API)
// ---------------------------------------------------------------------------

export interface FavoriteProductResponse {
  productId: number;
  productName: string;
  productSlug: string;
  price: number;
  oldPrice: number | null;
  image: { id: number; url: string } | null;
  sellerId: number;
  sellerDisplayName: string;
  condition: string;
  location: string;
  addedAt: string; // ISO date
}

// ---------------------------------------------------------------------------
// Service: Favoris
// ---------------------------------------------------------------------------

/**
 * Récupère les favoris de l'utilisateur avec les produits joints et images.
 */
export async function getFavorites(userId: number, q: Queryable = pool): Promise<FavoriteProductResponse[]> {
  const favorites = await getFavoritesWithImages(userId, q);
  return favorites.map((fav) => mapFavorite(fav));
}

/**
 * Bascule un produit en favori (ajoute s'il n'y est pas, retire s'il y est).
 * Retourne { added: boolean }. Un produit inconnu ou supprimé → 404 (jamais 500).
 */
export async function toggleFavoriteService(
  userId: number,
  productId: number,
): Promise<{ added: boolean }> {
  if (!(await productExists(productId))) {
    throw notFound('PRODUCT_NOT_FOUND', 'Article introuvable');
  }
  return withTransaction((client) => toggleFavorite(client, userId, productId));
}

/**
 * Retire un produit des favoris (alias pour DELETE /api/favorites/:productId).
 */
export async function removeFromFavorites(userId: number, productId: number): Promise<void> {
  await withTransaction((client) => removeFavorite(client, userId, productId));
}

/**
 * Vérifie si un produit est dans les favoris de l'utilisateur.
 */
export async function isFavoriteService(userId: number, productId: number, q: Queryable = pool): Promise<boolean> {
  return isFavorite(userId, productId, q);
}

// ---------------------------------------------------------------------------
// Mapping interne → réponse API
// ---------------------------------------------------------------------------

function mapFavorite(fav: FavoriteWithImage): FavoriteProductResponse {
  const image = fav.primary_image
    ? { id: fav.primary_image.id, url: imageUrl(fav.primary_image.path) }
    : null;

  return {
    productId: fav.product_id,
    productName: fav.name,
    productSlug: fav.slug,
    price: fav.price,
    oldPrice: fav.old_price,
    image,
    sellerId: fav.owner_id,
    sellerDisplayName: fav.owner_display_name ?? '',
    condition: fav.condition,
    location: fav.location,
    addedAt: new Date(fav.created_at).toISOString(),
  };
}