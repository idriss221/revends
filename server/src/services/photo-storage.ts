import crypto from 'node:crypto';
import { unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { del, put } from '@vercel/blob';
import { randomPhotoPath } from '../middleware/upload.js';
import { logger } from '../utils/logger.js';

/**
 * Stockage des photos d'articles.
 *
 * - Production (Vercel) : `BLOB_READ_WRITE_TOKEN` présent → Vercel Blob.
 *   Le système de fichiers d'une fonction serverless est éphémère et propre à
 *   chaque instance (`/tmp`) : une photo écrite là disparaît, d'où les images
 *   cassées. On stocke donc l'URL publique HTTPS du blob en base.
 * - Local / Docker / tests : pas de token → écriture disque comme avant
 *   (chemin « uploads/products/<uuid>.<ext> », servi par express.static).
 */

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function isBlobStorageEnabled(): boolean {
  return Boolean(process.env['BLOB_READ_WRITE_TOKEN']);
}

/** Enregistre une photo (MIME déjà vérifié) ; retourne la valeur à stocker en base. */
export async function storePhoto(buffer: Buffer, mime: string): Promise<string> {
  if (isBlobStorageEnabled()) {
    const pathname = `products/${crypto.randomUUID()}.${EXT_BY_MIME[mime]}`;
    const blob = await put(pathname, buffer, {
      access: 'public',
      contentType: mime,
      addRandomSuffix: false,
    });
    return blob.url;
  }
  const absPath = randomPhotoPath(mime);
  await writeFile(absPath, buffer);
  const idx = absPath.indexOf('uploads/products');
  return idx >= 0 ? absPath.slice(idx) : absPath;
}

/** Supprime une photo précédemment enregistrée (URL Blob ou chemin disque). Silencieux. */
export async function removePhoto(stored: string): Promise<void> {
  try {
    if (/^https?:\/\//i.test(stored)) {
      // Seules nos URLs Blob sont supprimables ; les URLs externes (démo) sont ignorées.
      if (isBlobStorageEnabled() && stored.includes('.blob.vercel-storage.com')) await del(stored);
      return;
    }
    await unlink(path.resolve(process.cwd(), stored));
  } catch (err) {
    logger.warn('suppression de photo ignorée', { errorMessage: (err as Error).message });
  }
}
