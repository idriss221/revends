import crypto from 'node:crypto';
import multer from 'multer';
import { mkdir } from 'node:fs/promises';
import { config } from '../config.js';

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 Mo (RG-MEDIA-1)
export const MIN_PHOTOS = 3;
export const MAX_PHOTOS = 4;

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Vérification du MIME RÉEL (magic bytes), pas du header déclaré (§9.6). */
export function sniffImageMime(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (
    buf.length >= 12 &&
    buf.toString('latin1', 0, 4) === 'RIFF' &&
    buf.toString('latin1', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/** "uploads/products/<uuid>.<ext>" — nom de fichier aléatoire serveur (RG-MEDIA-1). */
export function randomPhotoPath(mime: string): string {
  return `${config.uploadDir}/${crypto.randomUUID()}.${EXT_BY_MIME[mime]}`;
}

/** Nom relatif public (servi sous /uploads/products/). */
export function photoPublicPath(absPath: string): string {
  const idx = absPath.indexOf('uploads/products');
  return idx >= 0 ? absPath.slice(idx) : absPath;
}

// S'assure que le dossier d'upload existe (créé à l'import).
await mkdir(config.uploadDir, { recursive: true });

/**
 * Middleware multer 2.x — mémoire puis écriture contrôlée côté service.
 * - 1..4 fichiers max, 5 Mo max par fichier (RG-MEDIA-1)
 * - MIME RÉEL vérifié APRÈS réception complète : le buffer n'est pas encore
 *   disponible au moment du fileFilter (memoryStorage) → contrôle dans le
 *   service (products.service#assertValidPhotos, §9.6), mêmes codes d'erreur.
 */
export const uploadProductPhotos = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_PHOTO_BYTES,
    files: MAX_PHOTOS,
    // Bornes des champs texte multipart : 16 champs × 100 Ko max chacun.
    // Sans `fields`/`fieldSize`/`parts`, multer accepte un nombre illimité de
    // champs (déni de service mémoire / DoS, §9.5).
    fields: 16,
    fieldSize: 100_000,
    parts: 20, // champs (max 16) + photos (max 4)
  },
});