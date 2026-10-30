import crypto from 'node:crypto';
import path from 'node:path';
import { unlink, writeFile } from 'node:fs/promises';
import { put, del } from '@vercel/blob';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

/**
 * Stockage des photos produit — deux backends, une seule API.
 *
 * POURQUOI CE MODULE
 * ------------------
 * Le disque local ne survit pas en serverless : sur Vercel, `UPLOAD_DIR=/tmp/…`
 * est **éphémère** (perdu au cold start) et **propre à une instance** (une photo
 * écrite par l'instance A renvoie 404 si la requête suivante tombe sur B).
 * C'était la cause racine des photos perdues en production.
 *
 * Règle :
 *  · `BLOB_READ_WRITE_TOKEN` présent (Vercel / `vercel dev`) → Vercel Blob,
 *    URL publique absolue `https://<store>.public.blob.vercel-storage.com/…` ;
 *  · sinon (Docker, tests, dev local) → disque, chemin public relatif
 *    `uploads/products/<uuid>.<ext>` servi par `express.static` sous `/uploads`.
 *
 * Les deux formes sont acceptées par `imageUrl()` (serializers) et par
 * `resolveImageUrl()` (front) : aucune migration de données n'est nécessaire.
 */

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Dossier logique (aussi utilisé comme préfixe de chemin dans le store Blob). */
const PUBLIC_DIR = 'uploads/products';

export function blobStorageEnabled(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function extFor(mime: string): string {
  const ext = EXT_BY_MIME[mime];
  if (!ext) throw new Error(`MIME photo non supporté : ${mime}`);
  return ext;
}

/** Chemin absolu local d'un chemin public relatif (`uploads/products/x.jpg`). */
export function resolveUploadPath(publicPath: string): string {
  return path.resolve(process.cwd(), publicPath);
}

/**
 * Écrit un buffer photo et retourne son URL publique :
 *  · Blob  → URL absolue HTTPS (persistante, partagée entre instances) ;
 *  · disque → `uploads/products/<uuid>.<ext>` (relatif, servi sous `/uploads`).
 *
 * Le nom est **toujours** un UUID généré serveur (RG-MEDIA-1) : jamais le nom
 * fourni par le client.
 */
export async function savePhoto(buffer: Buffer, mime: string): Promise<string> {
  const filename = `${crypto.randomUUID()}.${extFor(mime)}`;

  if (blobStorageEnabled()) {
    const { url } = await put(`${PUBLIC_DIR}/${filename}`, buffer, {
      access: 'public',
      contentType: mime,
      addRandomSuffix: false,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    logger.info('photo écrite (blob)', { pathname: `${PUBLIC_DIR}/${filename}`, bytes: buffer.length });
    return url;
  }

  const absPath = path.join(config.uploadDir, filename);
  await writeFile(absPath, buffer);
  return `${PUBLIC_DIR}/${filename}`;
}

/** Supprime une photo (best effort) — utilisée en compensation et au retrait. */
export async function deletePhoto(publicPath: string): Promise<void> {
  if (!publicPath) return;
  if (/^https?:\/\//i.test(publicPath)) {
    if (!blobStorageEnabled()) return;
    await del(publicPath, { token: process.env.BLOB_READ_WRITE_TOKEN }).catch((err: unknown) => {
      logger.warn('suppression blob impossible', { errorMessage: (err as Error).message });
    });
    return;
  }
  await unlink(resolveUploadPath(publicPath)).catch(() => {});
}
