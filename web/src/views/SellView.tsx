import { useMemo, useRef, useState, type FormEvent, type DragEvent } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../lib/toast'
import { TOAST_COPY } from '../lib/constants'
import { Crumb, SiteHead, SitePage, fmt } from '../components/site/SiteBits'
import { Ico } from '../components/brand/Ico'
import type { Condition } from '../lib/types'

/* ============================================================================
   Page « Vendre » — `Sell()` de `Bureau/main/assets/app.js` (L718-805) +
   `wireSell()` (L1168-1247), markup fidèle : `.crumb`, `.head.rv`, `.steps`,
   `.two-col`, `.form` (`.drop` + `.pv`), `.box` (`.preview-card` + `.commission`).

   Données réelles : même mécanique que l'ancienne `SellPage` —
   POST /api/products en multipart FormData, 3..4 photos JPEG/PNG/WebP de
   5 Mo max (RG-MEDIA-1), catégorie + sous-catégorie obligatoires.

   Écarts avec la maquette (démo statique sans backend) :
   · « Sous-catégorie » AJOUTÉE : `subcategoryId` est obligatoire côté API.
   · « Localisation » AJOUTÉE : `location` est obligatoire côté API (3..100).
   · États : la maquette propose « Comme neuf / Très bon état / Bon état /
     État correct » mais le backend valide un enum fermé
     « Neuf / Très bon état / Bon état / Correct / À réparer » → enum réel.
   · Photos : la maquette dit « JPG ou PNG » sans limite ; la réalité est
     3 photos minimum (design-system §7, `TOAST_COPY.photosRequired`),
     4 photos max, JPEG/PNG/WebP, 5 Mo max par photo → contraintes réelles.
   · La maquette valide description ≥ 3 car. (pas d'erreur affichée) ; l'API
     exige ≥ 10 → règle réelle + message d'erreur.
   ========================================================================== */

const CONDITIONS: readonly Condition[] = ['Neuf', 'Très bon état', 'Bon état', 'Correct', 'À réparer'] as const

/** Commission REVENDS de la maquette (`RV.COMMISSION = 0.10`). */
const COMMISSION = 0.1

/* Contraintes réelles du backend (ancienne PhotoPicker / SellPage). */
/** Minimum exigé par le design-system (§7) : message unique `photosRequired`. */
const MIN_PHOTOS = 3
const MAX_PHOTOS = 4
const MAX_PHOTO_SIZE = 5 * 1024 * 1024
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']

const MAX_TITLE = 70 // maxlength de la maquette (l'API accepte 120)

interface DraftPhoto {
  key: string
  url: string
  file: File
}

interface FormValues {
  name: string
  categoryId: string
  subcategoryId: string
  condition: string
  price: string
  location: string
  description: string
}

const EMPTY: FormValues = {
  name: '',
  categoryId: '',
  subcategoryId: '',
  condition: '',
  price: '',
  location: '',
  description: '',
}

type ErrorMap = Partial<Record<keyof FormValues | 'photos', string>>

const STEP_LABELS = ['Photos', 'Titre & catégorie', 'État', 'Description', 'Prix', 'Publier'] as const

export function SellView() {
  const navigate = useNavigate()
  const toast = useToast()
  const { user, loading: authLoading } = useAuth()

  const [values, setValues] = useState<FormValues>(EMPTY)
  const [photos, setPhotos] = useState<DraftPhoto[]>([])
  const [fieldErrors, setFieldErrors] = useState<ErrorMap>({})
  const [apiError, setApiError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api.categories() })

  const selectedParent = categories.data?.categories.find((c) => String(c.id) === values.categoryId)
  const subcategories = useMemo(() => selectedParent?.children ?? [], [selectedParent])

  const set = (key: keyof FormValues, value: string) => {
    setValues((v) => {
      const next = { ...v, [key]: value }
      if (key === 'categoryId') next.subcategoryId = ''
      return next
    })
    setFieldErrors((e) => {
      const n = { ...e }
      delete n[key]
      return n
    })
    setApiError(null)
  }

  /* --- Photos : mécanique réelle (File + createObjectURL), habillage `.drop`. */

  const addFiles = (files: FileList | File[]) => {
    setApiError(null)
    const list = Array.from(files)
    const remaining = MAX_PHOTOS - photos.length
    if (remaining <= 0) {
      setFieldErrors((e) => ({ ...e, photos: `Maximum ${MAX_PHOTOS} photos par article.` }))
      return
    }
    const ok: DraftPhoto[] = []
    let error: string | null = null
    for (const f of list) {
      if (!PHOTO_TYPES.includes(f.type)) {
        error = 'Formats acceptés : JPEG, PNG, WebP.'
        continue
      }
      if (f.size > MAX_PHOTO_SIZE) {
        error = 'Chaque photo doit faire au plus 5 Mo.'
        continue
      }
      ok.push({ key: `${f.name}-${f.size}-${Date.now()}-${ok.length}`, url: URL.createObjectURL(f), file: f })
    }
    const accepted = ok.slice(0, remaining)
    if (ok.length > remaining) error = `Maximum ${MAX_PHOTOS} photos par article.`
    setFieldErrors((e) => {
      const n = { ...e }
      if (error) n.photos = error
      else if (photos.length + accepted.length >= MIN_PHOTOS) delete n.photos
      // Sous le minimum : on conserve le message déjà affiché (ex.
      // `photosRequired` après une suppression) ; il disparaît dès que le
      // minimum est atteint.
      return n
    })
    if (accepted.length > 0) setPhotos((p) => [...p, ...accepted])
  }

  const removePhoto = (key: string) => {
    const next = photos.filter((x) => x.key !== key)
    setPhotos(next)
    setFieldErrors((e) => {
      const n = { ...e }
      // Recalcul immédiat : retirer une photo peut repasser sous le minimum,
      // sans attendre une nouvelle soumission du formulaire.
      if (next.length < MIN_PHOTOS) n.photos = TOAST_COPY.photosRequired
      else delete n.photos
      return n
    })
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files)
  }

  /* --- Étapes (wireSell L1177-1190) : seuils alignés sur les règles réelles. */

  /** Le bouton reste inactif tant que le minimum de photos n'est pas atteint. */
  const canSubmit = photos.length >= MIN_PHOTOS

  const filled = [
    canSubmit,
    values.name.trim().length >= 3 && !!values.categoryId && !!values.subcategoryId,
    !!values.condition,
    values.description.trim().length >= 10,
    Number(values.price) > 0,
  ]
  const done: boolean[] = []
  let reached = true
  for (const v of filled) {
    reached = reached && v
    done.push(reached)
  }
  const firstUndone = done.indexOf(false)

  /* --- Aperçu en direct (wireSell L1200-1215). */

  const priceValue = Number(values.price)
  const previewPhoto = photos[0]?.url

  /* --- Soumission : mêmes règles que l'ancienne SellPage (zod serveur). */

  const validate = (): ErrorMap => {
    const errs: ErrorMap = {}
    if (!canSubmit) errs.photos = TOAST_COPY.photosRequired
    if (values.name.trim().length < 3) errs.name = "Donnez un titre d'au moins 3 caractères."
    if (values.name.trim().length > MAX_TITLE) errs.name = `Maximum ${MAX_TITLE} caractères.`
    if (!values.categoryId) errs.categoryId = 'Choisissez une catégorie.'
    if (!values.subcategoryId) errs.subcategoryId = 'Choisissez une sous-catégorie.'
    if (!CONDITIONS.includes(values.condition as Condition)) errs.condition = "Indiquez l'état de l'article."
    const price = Number(values.price)
    if (!(price > 0)) errs.price = 'Fixez un prix supérieur à 0.'
    else if (!Number.isInteger(price) || price < 500) errs.price = 'Le prix minimum est 500 FCFA (entier).'
    else if (price > 10_000_000) errs.price = 'Le prix maximum est 10 000 000 FCFA.'
    if (values.location.trim().length < 3) errs.location = 'Indiquez votre localisation.'
    if (values.description.trim().length < 10) errs.description = 'Décrivez votre article (10 caractères minimum).'
    return errs
  }

  const submit = useMutation({
    mutationFn: () => {
      const fd = new FormData()
      fd.append('name', values.name.trim())
      fd.append('categoryId', values.categoryId)
      fd.append('subcategoryId', values.subcategoryId)
      fd.append('condition', values.condition)
      fd.append('price', String(Number(values.price)))
      fd.append('location', values.location.trim())
      fd.append('description', values.description.trim())
      photos.forEach((p) => fd.append('photos', p.file))
      return api.createProduct(fd)
    },
    onSuccess: () => {
      toast('success', 'Article soumis avec succès !')
      navigate('/confirmation', { replace: true })
    },
    onError: (err) => {
      const message = err instanceof ApiError ? err.readableMessage() : "Impossible de publier l'article."
      setApiError(message)
      toast('error', message)
    },
  })

  const onFormSubmit = (e: FormEvent) => {
    e.preventDefault()
    const errs = validate()
    setFieldErrors(errs)
    const FOCUS_ID: Record<keyof ErrorMap, string> = {
      photos: 'sPhotosDrop',
      name: 'sTitle',
      categoryId: 'sCat',
      subcategoryId: 'sSubcat',
      condition: 'sCond',
      price: 'sPrice',
      location: 'sLoc',
      description: 'sDesc',
    }
    const firstKey = (Object.keys(errs) as (keyof ErrorMap)[]).find((k) => errs[k])
    if (firstKey) {
      document.getElementById(FOCUS_ID[firstKey])?.focus()
      return
    }
    setApiError(null)
    submit.mutate()
  }

  /* --- Auth : la référence redirige vers `#/login` — ici `/login`. */
  if (authLoading) {
    return (
      <SitePage>
        <p className="note info" role="status">
          Chargement…
        </p>
      </SitePage>
    )
  }
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent('/sell')}`} replace />

  return (
    <SitePage>
      <Crumb items={[{ label: 'Vendre' }]} />
      <SiteHead
        eyebrow="Espace vendeur"
        title="Publier un article"
        sub="Six étapes simples, un aperçu fidèle avant publication. La commission REVENDS est de 10 %."
        level={1}
      />

      <div className="steps" role="list" aria-label="Étapes de publication">
        {STEP_LABELS.map((s, i) => (
          <span
            key={s}
            role="listitem"
            className={`s${done[i] ? ' done' : ''}${i === (firstUndone < 0 ? 5 : firstUndone) ? ' cur' : ''}`}
          >
            <i>{i + 1}</i>
            <span>{s}</span>
          </span>
        ))}
      </div>

      <div className="two-col">
        <form className="form" id="sellForm" noValidate onSubmit={onFormSubmit}>
          {/* 1 · Photos */}
          <div className="field">
            <label htmlFor="sPhotos">1 · Photos de l'article</label>
            <div
              className="drop"
              id="sPhotosDrop"
              role="button"
              tabIndex={0}
              aria-label="Ajouter des photos"
              aria-describedby="sPhotosHint"
              aria-invalid={Boolean(fieldErrors.photos)}
              onClick={() => fileRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  fileRef.current?.click()
                }
              }}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              style={dragOver ? { borderColor: 'var(--terra)', background: 'var(--ivory-2)' } : undefined}
            >
              <Ico name="camera" />
              <div>
                Glissez vos photos ici ou{' '}
                <label
                  htmlFor="sPhotos"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    fileRef.current?.click()
                  }}
                >
                  parcourez vos fichiers
                </label>
              </div>
              <div className="hint" id="sPhotosHint">
                JPEG, PNG ou WebP · {MIN_PHOTOS} photos minimum · {MAX_PHOTOS} photos max · 5 Mo
                max par photo · la première photo sert de visuel principal.
              </div>
              <input
                id="sPhotos"
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                hidden
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files)
                  e.target.value = ''
                }}
              />
            </div>
            {photos.length > 0 ? (
              <div className="pv">
                {photos.map((p, i) => (
                  <span key={p.key} style={{ position: 'relative', display: 'inline-block' }}>
                    <img src={p.url} alt={`Photo ${i + 1}${i === 0 ? ' (principale)' : ''}`} />
                    <button
                      type="button"
                      aria-label={`Supprimer la photo ${i + 1}`}
                      onClick={() => removePhoto(p.key)}
                      style={{
                        position: 'absolute',
                        top: 4,
                        right: 4,
                        width: 24,
                        height: 24,
                        padding: 0,
                        border: 'none',
                        borderRadius: '50%',
                        background: 'rgba(23,21,19,.72)',
                        color: '#fff',
                        cursor: 'pointer',
                        display: 'grid',
                        placeItems: 'center',
                      }}
                    >
                      <Ico name="trash" style={{ width: 12, height: 12 }} />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            <div className={`err${fieldErrors.photos ? ' show' : ''}`} id="sPhotosErr" role="alert">
              {fieldErrors.photos}
            </div>
          </div>

          {/* 2 · Titre */}
          <div className="field">
            <label htmlFor="sTitle">2 · Titre de l'annonce</label>
            <input
              className={`inp${fieldErrors.name ? ' bad' : ''}`}
              id="sTitle"
              type="text"
              maxLength={MAX_TITLE}
              placeholder="Ex. Manteau long en laine chocolat"
              required
              value={values.name}
              onChange={(e) => set('name', e.target.value)}
              aria-invalid={Boolean(fieldErrors.name)}
            />
            <div className="hint">
              <span>{values.name.length}</span>/{MAX_TITLE} caractères
            </div>
            <div className={`err${fieldErrors.name ? ' show' : ''}`} role="alert">
              {fieldErrors.name}
            </div>
          </div>

          {/* Catégorie (+ sous-catégorie, obligatoire côté API) */}
          <div className="field">
            <label htmlFor="sCat">Catégorie</label>
            <select
              className={`sel${fieldErrors.categoryId ? ' bad' : ''}`}
              id="sCat"
              required
              value={values.categoryId}
              onChange={(e) => set('categoryId', e.target.value)}
              aria-invalid={Boolean(fieldErrors.categoryId)}
            >
              <option value="">
                {categories.isPending ? 'Chargement des catégories…' : 'Choisir une catégorie…'}
              </option>
              {categories.data?.categories.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </select>
            <div className={`err${fieldErrors.categoryId ? ' show' : ''}`} role="alert">
              {fieldErrors.categoryId}
            </div>
            {categories.isError ? (
              <div className="note warn" role="alert" style={{ marginTop: 9 }}>
                Impossible de charger les catégories.{' '}
                <button className="linkbtn" type="button" onClick={() => categories.refetch()}>
                  <Ico name="refresh" cls="sm" /> Réessayer
                </button>
              </div>
            ) : null}
          </div>

          <div className="field">
            <label htmlFor="sSubcat">Sous-catégorie</label>
            <select
              className={`sel${fieldErrors.subcategoryId ? ' bad' : ''}`}
              id="sSubcat"
              required
              disabled={subcategories.length === 0}
              value={values.subcategoryId}
              onChange={(e) => set('subcategoryId', e.target.value)}
              aria-invalid={Boolean(fieldErrors.subcategoryId)}
            >
              <option value="">
                {subcategories.length === 0 ? 'Choisissez d’abord une catégorie…' : 'Choisir une sous-catégorie…'}
              </option>
              {subcategories.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </select>
            <div className={`err${fieldErrors.subcategoryId ? ' show' : ''}`} role="alert">
              {fieldErrors.subcategoryId}
            </div>
          </div>

          {/* 3 · État (enum réel du backend) */}
          <div className="field">
            <label htmlFor="sCond">3 · État de l'article</label>
            <select
              className={`sel${fieldErrors.condition ? ' bad' : ''}`}
              id="sCond"
              required
              value={values.condition}
              onChange={(e) => set('condition', e.target.value)}
              aria-invalid={Boolean(fieldErrors.condition)}
            >
              <option value="">Choisir un état…</option>
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <div className={`err${fieldErrors.condition ? ' show' : ''}`} role="alert">
              {fieldErrors.condition}
            </div>
          </div>

          {/* 4 · Description */}
          <div className="field">
            <label htmlFor="sDesc">4 · Description et défauts éventuels</label>
            <textarea
              className={`inp${fieldErrors.description ? ' bad' : ''}`}
              id="sDesc"
              rows={4}
              placeholder="Matière, taille, points forts, défauts à signaler…"
              required
              value={values.description}
              onChange={(e) => set('description', e.target.value)}
              aria-invalid={Boolean(fieldErrors.description)}
            />
            <div className="hint">Un article honnêtement décrit se vend mieux.</div>
            <div className={`err${fieldErrors.description ? ' show' : ''}`} role="alert">
              {fieldErrors.description}
            </div>
          </div>

          {/* 5 · Prix */}
          <div className="field">
            <label htmlFor="sPrice">5 · Prix de vente (FCFA)</label>
            <input
              className={`inp${fieldErrors.price ? ' bad' : ''}`}
              id="sPrice"
              type="number"
              min={500}
              max={10_000_000}
              step={500}
              placeholder="Ex. 25000"
              required
              value={values.price}
              onChange={(e) => set('price', e.target.value)}
              aria-invalid={Boolean(fieldErrors.price)}
            />
            <div className="hint">Minimum 500 FCFA.</div>
            <div className={`err${fieldErrors.price ? ' show' : ''}`} role="alert">
              {fieldErrors.price}
            </div>
          </div>

          {/* Localisation — obligatoire côté API, absente de la maquette */}
          <div className="field">
            <label htmlFor="sLoc">Localisation</label>
            <input
              className={`inp${fieldErrors.location ? ' bad' : ''}`}
              id="sLoc"
              type="text"
              maxLength={100}
              autoComplete="address-level2"
              placeholder="Ex. Abidjan, Cocody"
              required
              value={values.location}
              onChange={(e) => set('location', e.target.value)}
              aria-invalid={Boolean(fieldErrors.location)}
            />
            <div className={`err${fieldErrors.location ? ' show' : ''}`} role="alert">
              {fieldErrors.location}
            </div>
          </div>

          {apiError ? (
            <div className="note warn" role="alert">
              {apiError}
            </div>
          ) : Object.keys(fieldErrors).length > 0 ? (
            // Avertissement global — la référence n'en a pas (son backend
            // fictif ne se trompe jamais) ; un vrai formulaire doit résumer
            // l'échec pour les lecteurs d'écran, au-delà des erreurs par champ.
            <div className="note warn" role="alert">
              Veuillez corriger les champs marqués en rouge.
            </div>
          ) : null}

          <button className="btn" type="submit" disabled={!canSubmit || submit.isPending}>
            {submit.isPending ? 'Publication…' : '6 · Publier l’article'} <Ico name="arrow-right" cls="sm" />
          </button>
        </form>

        {/* Aperçu en direct (markup de la référence) */}
        <div className="box">
          <h3>Aperçu en direct</h3>
          <article className="card preview-card" style={{ marginTop: 14 }}>
            <div className="im">
              {previewPhoto ? (
                <img src={previewPhoto} alt="" />
              ) : (
                <span className="hint" style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
                  Photo principale
                </span>
              )}
            </div>
            <div className="body">
              <h3 className="name">{values.name.trim() || "Titre de l'article"}</h3>
              <div className="meta">
                {values.condition || 'État'} · {values.location.trim() || 'Ville'}
              </div>
              <div className="price">{priceValue > 0 ? fmt(priceValue) : ''}</div>
            </div>
          </article>
          <div className="commission" style={{ marginTop: 18 }}>
            {priceValue > 0 ? (
              <>
                Commission REVENDS : <b>{fmt(priceValue * COMMISSION)}</b> (10 %).
                <span className="net">Vous recevrez {fmt(priceValue * (1 - COMMISSION))}</span>
                <br />
                <small>Estimation indicative, pas un paiement reçu.</small>
              </>
            ) : (
              <>
                Commission REVENDS : <b>10 %</b>. Saisissez un prix pour estimer le montant qui vous
                reviendrait.
              </>
            )}
          </div>
        </div>
      </div>
    </SitePage>
  )
}
