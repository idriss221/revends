import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Fabrique d'images **neuves** pour la recette du cycle photo.
 *
 * Objectif : ne jamais réutiliser un fichier déjà présent dans le stockage.
 * Chaque exécution produit 4 fichiers jamais vus par le serveur (UUID neufs),
 * dans 3 formats réellement acceptés (JPEG / PNG / WebP), dont **un gros JPEG**
 * (2–4 Mo) qui déclenche la compression navigateur (> 700 Ko → ≤ 900 Ko), donc
 * la limite de corps de requête Vercel (4,5 Mo) est exercée pour de vrai.
 *
 * Génération : Python + Pillow quand disponible (pixels et couleurs uniques par
 * `runId`). Repli sans dépendance : les fixtures réelles de
 * `e2e/fixtures/new-images/` sont copiées sous un nom unique — elles restent des
 * images neuves au sens du stockage (aucune n'a jamais été uploadée).
 */

export interface NewImageFile {
  /** Nom envoyé au champ multipart. */
  name: string
  mimeType: string
  /** Chemin disque (pour `setInputFiles`). */
  path: string
  buffer: Buffer
  width: number
  height: number
  size: number
  /** true pour le fichier > 700 Ko : la preview doit être le JPEG recompressé. */
  needsCompression: boolean
}

const FIXTURES: { file: string; mimeType: string; width: number; height: number; needsCompression: boolean }[] = [
  { file: 'nouvelle-photo-1.jpg', mimeType: 'image/jpeg', width: 1200, height: 900, needsCompression: false },
  { file: 'nouvelle-photo-2.png', mimeType: 'image/png', width: 900, height: 1200, needsCompression: false },
  { file: 'nouvelle-photo-3.webp', mimeType: 'image/webp', width: 1024, height: 768, needsCompression: false },
  { file: 'nouvelle-photo-4.jpg', mimeType: 'image/jpeg', width: 2400, height: 1800, needsCompression: true },
]

const PYTHON = String.raw`
import json, os, random, sys
from PIL import Image, ImageDraw

out, run_id = sys.argv[1], sys.argv[2]
random.seed(run_id)

def finish(img, title):
    d = ImageDraw.Draw(img, 'RGBA')
    w, h = img.size
    for i in range(9):
        x = int(w * (i + 1) / 10)
        d.rectangle([x - 16, 0, x + 16, h], fill=(255, 255, 255, 22))
    d.rectangle([0, int(h * 0.72), w, h], fill=(24, 21, 18, 150))
    d.text((int(w * 0.05), int(h * 0.78)), title, fill=(255, 255, 255, 255))
    d.rectangle([8, 8, w - 8, h - 8], outline=(255, 255, 255, 160), width=6)

r = lambda: random.randint(0, 255)
tag = run_id[-7:].upper()
specs = [
    ('nouvelle-photo-1.jpg', 'JPEG', 1200, 900, (r(), r(), r())),
    ('nouvelle-photo-2.png', 'PNG', 900, 1200, (r(), r(), r())),
    ('nouvelle-photo-3.webp', 'WEBP', 1024, 768, (r(), r(), r())),
]
result = []
for name, fmt, w, h, bg in specs:
    if fmt == 'PNG':
        img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        d.rounded_rectangle([60, 80, w - 60, h - 80], radius=48, fill=bg + (255,))
        d.ellipse([int(w*0.2), int(h*0.2), int(w*0.8), int(h*0.65)], fill=(239, 230, 214, 255))
    else:
        img = Image.new('RGB', (w, h), bg)
        d = ImageDraw.Draw(img)
        for i in range(5):
            d.rectangle([40 + i*int(w/6), int(h*0.12), 40 + i*int(w/6) + int(w/9), int(h*0.68)], fill=(r(), r(), r()))
    finish(img, f'REVENDS {tag} {name}')
    path = os.path.join(out, name)
    img.save(path, fmt, quality=90)
    result.append({'name': name, 'format': fmt, 'width': w, 'height': h, 'size': os.path.getsize(path)})

# Gros JPEG (> 700 Ko) : dégradé + bruit modéré, comme une vraie photo — la
# compression navigateur doit le ramener sous 900 Ko sans perte visible.
w, h = 2400, 1800
grad = Image.linear_gradient('L').resize((w, h)).convert('RGB')
grad = ImageChops.multiply(grad, Image.new('RGB', (w, h), (255, 160, 120)))
grad = ImageChops.add(grad, Image.new('RGB', (w, h), (20, 30, 60)))
noise = Image.effect_noise((w, h), 38).convert('RGB')
img = Image.blend(grad, noise, 0.28)
d = ImageDraw.Draw(img, 'RGBA')
for i in range(8):
    x = int(w * (i + 1) / 9)
    d.ellipse([x - 110, 180 + ((i * 97) % 500), x + 110, 400 + ((i * 97) % 500)], fill=(239, 230, 214, 120))
finish(img, f'REVENDS {tag} GROS JPEG')
path = os.path.join(out, 'nouvelle-photo-4.jpg')
img.save(path, 'JPEG', quality=92)
result.append({'name': 'nouvelle-photo-4.jpg', 'format': 'JPEG', 'width': w, 'height': h, 'size': os.path.getsize(path)})

print(json.dumps(result))
`

const EXT_BY_FORMAT: Record<string, string> = { JPEG: 'jpg', PNG: 'png', WEBP: 'webp' }

/**
 * Crée 4 images neuves dans un dossier temporaire unique.
 * @param runId identifiant unique (timestamp + aléatoire) qui change les pixels.
 */
export function createNewImages(runId: string): NewImageFile[] {
  const dir = join(tmpdir(), 'revends-new-images', runId)
  mkdirSync(dir, { recursive: true })

  let generated: { name: string; format: string; width: number; height: number; size: number }[] | null = null
  try {
    const stdout = execFileSync('python3', ['-c', PYTHON, dir, runId], {
      encoding: 'utf8',
      timeout: 120_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    generated = JSON.parse(stdout.trim())
  } catch {
    generated = null
  }

  if (generated) {
    return generated.map((g) => {
      const path = join(dir, g.name)
      const buffer = readFileSync(path)
      return {
        name: g.name,
        mimeType: `image/${EXT_BY_FORMAT[g.format] === 'jpg' ? 'jpeg' : EXT_BY_FORMAT[g.format]}`,
        path,
        buffer,
        width: g.width,
        height: g.height,
        size: buffer.length,
        needsCompression: buffer.length > 700 * 1024,
      }
    })
  }

  // Repli : fixtures réelles déjà versionnées, recopiées sous un nom unique.
  const fixtureDir = join(process.cwd(), 'e2e', 'fixtures', 'new-images')
  return FIXTURES.map((f) => {
    const target = join(dir, `${runId}-${f.file}`)
    copyFileSync(join(fixtureDir, f.file), target)
    const buffer = readFileSync(target)
    return {
      name: `${runId}-${f.file}`,
      mimeType: f.mimeType,
      path: target,
      buffer,
      width: f.width,
      height: f.height,
      size: statSync(target).size,
      needsCompression: f.needsCompression,
    }
  })
}

/** Nettoie le dossier temporaire d'exécution (sans jamais toucher aux fixtures). */
export function cleanupNewImages(runId: string): void {
  rmSync(join(tmpdir(), 'revends-new-images', runId), { recursive: true, force: true })
}
