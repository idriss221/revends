/**
 * Compression d'une photo avant envoi.
 *
 * Pourquoi : Vercel limite le corps d'une requête à ~4,5 Mo. Quatre photos de
 * téléphone (3 à 8 Mo chacune) dépassent cette limite → l'envoi échoue. On
 * redimensionne donc côté navigateur (côté long ≤ 1600 px, JPEG ~0,82), ce qui
 * donne en général 150 à 600 Ko par photo, sans perte visible sur un site de
 * petites annonces.
 */
const MAX_SIDE = 1600
const QUALITY = 0.82

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() }
    } catch {
      /* repli sur <img> ci-dessous */
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Retourne un JPEG compressé. En cas d'échec (navigateur ancien, fichier illisible)
 * retourne le fichier d'origine : la validation de taille se fait ensuite sur le résultat.
 */
export async function compressPhoto(file: File): Promise<File> {
  try {
    const { source, width, height, close } = await decode(file)
    if (!width || !height) {
      close()
      return file
    }
    const scale = Math.min(1, MAX_SIDE / Math.max(width, height))
    const w = Math.max(1, Math.round(width * scale))
    const h = Math.max(1, Math.round(height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      close()
      return file
    }
    // Fond blanc : un PNG/WebP transparent deviendrait noir en JPEG.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(source, 0, 0, w, h)
    close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY))
    if (!blob || blob.size === 0) return file
    // Si la photo était déjà légère et n'a pas été réduite, on garde l'originale.
    if (scale === 1 && blob.size >= file.size) return file
    const base = file.name.replace(/\.[^.]+$/, '') || 'photo'
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })
  } catch {
    return file
  }
}
