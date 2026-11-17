import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Ico } from '../brand/Ico'
import { Notice } from '../ui/Notice'
import { useToast } from '../../lib/toast'
import { storefrontApi, storefrontError } from '../../lib/storefront'
import { graphemeCount } from '../../lib/v8'
import { resolveImageUrl } from '../../lib/catalogPhotos'
import type { StorefrontProfileSummary } from '../../lib/storefront.types'

/* ============================================================================
   Branding de la boutique — espace vendeur (contrat v2.8, R1/R2/R3/E4).

   · Logo ≤ 2 Mo · bannière ≤ 4 Mo — indices CLIENT ; le serveur arbitre
     (magic bytes, tailles) — toute erreur serveur est affichée en humain.
   · État par asset : « Aucun… » (vide) → « Aperçu — pas encore enregistré »
     → actif (visuel serveur + Supprimer).
   · Description publique : 0–500 graphèmes (Intl.Segmenter), rendue échappée
     côté public — jamais de HTML.
   · Adresse de collecte (SECRÈTE) : saisie en écriture seule ; jamais
     réaffichée (on n'affiche qu'un indicateur « renseignée ✓ ») ;
     « Effacer » envoie une chaîne vide (effacement serveur).
   · Upload : multipart direct FormData (même pattern que les photos
     produit) — aucun framework de formulaires.
   ========================================================================== */

const MAX_LOGO_BYTES = 2 * 1024 * 1024
const MAX_BANNER_BYTES = 4 * 1024 * 1024
const MAX_DESC_GRAPHEMES = 500
const ACCEPT = 'image/png,image/jpeg,image/webp'

export function BrandingPanel({ profile }: { profile: StorefrontProfileSummary | null | undefined }) {
  const qc = useQueryClient()
  const toast = useToast()

  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [bannerFile, setBannerFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [bannerPreview, setBannerPreview] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [description, setDescription] = useState(() => profile?.publicDescription ?? '')
  const [collecte, setCollecte] = useState('')
  const [clearCollecte, setClearCollecte] = useState(false)
  const [liveMessage, setLiveMessage] = useState('')

  const logoInput = useRef<HTMLInputElement>(null)
  const bannerInput = useRef<HTMLInputElement>(null)

  const logoUrl = profile?.logoUrl ?? null
  const bannerUrl = profile?.bannerUrl ?? null
  const collecteSet = profile?.collecteAddressSet ?? false
  const descCount = graphemeCount(description)
  const descOver = descCount > MAX_DESC_GRAPHEMES

  const invalidate = () => qc.invalidateQueries({ queryKey: ['my-subscription'] })

  const cleanupPreviews = () => {
    if (logoPreview) URL.revokeObjectURL(logoPreview)
    if (bannerPreview) URL.revokeObjectURL(bannerPreview)
    setLogoPreview(null)
    setBannerPreview(null)
    setLogoFile(null)
    setBannerFile(null)
  }

  const save = useMutation({
    mutationFn: (fd: FormData) => storefrontApi.saveProfile(fd),
    onSuccess: () => {
      invalidate()
      cleanupPreviews()
      setCollecte('')
      setClearCollecte(false)
      setFormError(null)
      setFileError(null)
      setLiveMessage('Branding enregistré.')
      toast('success', 'Branding enregistré — visible dès que votre boutique est ouverte.')
    },
    onError: (err) => {
      const message = storefrontError(err, 'Le branding n’a pas pu être enregistré. Réessayez.')
      setFormError(message)
      setLiveMessage('Échec de l’enregistrement.')
      toast('error', message)
    },
  })

  const deleteLogo = useMutation({
    mutationFn: () => storefrontApi.deleteLogo(),
    onSuccess: () => {
      invalidate()
      setLiveMessage('Logo supprimé.')
      toast('success', 'Logo supprimé — votre avatar par défaut reprend la place.')
    },
    onError: (err) => {
      const message = storefrontError(err, 'Suppression impossible pour le moment.')
      setFormError(message)
      toast('error', message)
    },
  })

  const deleteBanner = useMutation({
    mutationFn: () => storefrontApi.deleteBanner(),
    onSuccess: () => {
      invalidate()
      setLiveMessage('Bannière supprimée.')
      toast('success', 'Bannière supprimée.')
    },
    onError: (err) => {
      const message = storefrontError(err, 'Suppression impossible pour le moment.')
      setFormError(message)
      toast('error', message)
    },
  })

  const pick = (kind: 'logo' | 'banner') => (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Autorise de re-choisir le même fichier après annulation.
    event.target.value = ''
    if (!file) return
    setFileError(null)
    setFormError(null)
    const max = kind === 'logo' ? MAX_LOGO_BYTES : MAX_BANNER_BYTES
    if (file.size > max) {
      setFileError(
        kind === 'logo'
          ? `Le logo doit faire au plus 2 Mo (le vôtre en fait ${(file.size / 1024 / 1024).toFixed(1)} Mo).`
          : `La bannière doit faire au plus 4 Mo (la vôtre en fait ${(file.size / 1024 / 1024).toFixed(1)} Mo).`,
      )
      return
    }
    if (file.type && !file.type.startsWith('image/')) {
      setFileError('Formats acceptés : JPEG, PNG ou WebP — le fichier choisi n’est pas une image.')
      return
    }
    const objectUrl = URL.createObjectURL(file)
    if (kind === 'logo') {
      if (logoPreview) URL.revokeObjectURL(logoPreview)
      setLogoFile(file)
      setLogoPreview(objectUrl)
      setLiveMessage('Logo choisi — aperçu affiché, pas encore enregistré.')
    } else {
      if (bannerPreview) URL.revokeObjectURL(bannerPreview)
      setBannerFile(file)
      setBannerPreview(objectUrl)
      setLiveMessage('Bannière choisie — aperçu affiché, pas encore enregistrée.')
    }
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)
    if (descOver) {
      setFormError(`La description dépasse 500 caractères (${descCount}). Réduisez-la.`)
      return
    }
    const fd = new FormData()
    if (logoFile) fd.append('logo', logoFile)
    if (bannerFile) fd.append('banner', bannerFile)
    fd.append('publicDescription', description.trim())
    if (clearCollecte) {
      fd.append('collecteAddress', '')
    } else if (collecte.trim().length > 0) {
      const value = collecte.trim()
      if (value.length < 10 || value.length > 500) {
        setFormError('L’adresse de collecte doit contenir entre 10 et 500 caractères.')
        return
      }
      fd.append('collecteAddress', value)
    }
    save.mutate(fd)
  }

  const busy = save.isPending || deleteLogo.isPending || deleteBanner.isPending

  return (
    <section className="rv-shop-panel rv-brand" aria-labelledby="branding-title">
      <div>
        <span className="eyebrow">Branding</span>
        <h2 id="branding-title">Votre boutique a une allure</h2>
        <p className="rv-shop-sub" style={{ marginBottom: 0 }}>
          Logo, bannière et description — affichés sur /boutique/… dès que la boutique est ouverte.
        </p>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {liveMessage}
      </p>

      <form onSubmit={onSubmit} noValidate>
        {/* ── Logo ─────────────────────────────────────────────────── */}
        <div className="rv-brand-row">
          <div className="rv-brand-figure">
            {logoPreview ? (
              <img className="rv-brand-logo" src={logoPreview} alt="Aperçu du logo — pas encore enregistré" />
            ) : logoUrl ? (
              <img className="rv-brand-logo" src={resolveImageUrl(logoUrl)} alt="Logo de votre boutique" />
            ) : (
              <span className="rv-brand-empty" aria-hidden="true">
                <Ico name="image" cls="lg" />
              </span>
            )}
          </div>
          <div className="rv-brand-fields">
            <span className="rv-brand-label" id="logo-label">
              Logo <span aria-hidden="true">·</span> 2 Mo max
            </span>
            <span className="hint">PNG, JPEG ou WebP — carré conseillé, fond transparent accepté.</span>
            <div className="rv-brand-actions" role="group" aria-labelledby="logo-label">
              <input ref={logoInput} type="file" accept={ACCEPT} className="sr-only" onChange={pick('logo')} tabIndex={-1} aria-hidden="true" />
              <button type="button" className="btn ghost sm" onClick={() => logoInput.current?.click()}>
                {logoUrl || logoPreview ? 'Remplacer' : 'Ajouter un logo'}
              </button>
              {logoUrl && !logoPreview ? (
                <button
                  type="button"
                  className="btn quiet sm"
                  onClick={() => deleteLogo.mutate()}
                  disabled={busy}
                  aria-busy={deleteLogo.isPending}
                  aria-label="Supprimer le logo de la boutique"
                >
                  {deleteLogo.isPending ? 'Suppression…' : 'Supprimer'}
                </button>
              ) : null}
            </div>
            {logoPreview ? <p className="hint">Aperçu — pas encore enregistré.</p> : null}
          </div>
        </div>

        {/* ── Bannière ─────────────────────────────────────────────── */}
        <div className="rv-brand-row rv-brand-row--banner">
          <div className="rv-brand-figure rv-brand-figure--banner">
            {bannerPreview ? (
              <img className="rv-brand-banner" src={bannerPreview} alt="" aria-hidden="true" />
            ) : bannerUrl ? (
              <img className="rv-brand-banner" src={resolveImageUrl(bannerUrl)} alt="" aria-hidden="true" />
            ) : (
              <span className="rv-brand-empty rv-brand-empty--banner" aria-hidden="true">
                <Ico name="image" cls="lg" />
              </span>
            )}
          </div>
          <div className="rv-brand-fields">
            <span className="rv-brand-label" id="banner-label">
              Bannière <span aria-hidden="true">·</span> 4 Mo max
            </span>
            <span className="hint">JPEG ou WebP, format large (ex. 1600×400). Décorative : aucun texte requis.</span>
            <div className="rv-brand-actions" role="group" aria-labelledby="banner-label">
              <input ref={bannerInput} type="file" accept={ACCEPT} className="sr-only" onChange={pick('banner')} tabIndex={-1} aria-hidden="true" />
              <button type="button" className="btn ghost sm" onClick={() => bannerInput.current?.click()}>
                {bannerUrl || bannerPreview ? 'Remplacer' : 'Ajouter une bannière'}
              </button>
              {bannerUrl && !bannerPreview ? (
                <button
                  type="button"
                  className="btn quiet sm"
                  onClick={() => deleteBanner.mutate()}
                  disabled={busy}
                  aria-busy={deleteBanner.isPending}
                  aria-label="Supprimer la bannière de la boutique"
                >
                  {deleteBanner.isPending ? 'Suppression…' : 'Supprimer'}
                </button>
              ) : null}
            </div>
            {bannerPreview ? <p className="hint">Aperçu — pas encore enregistrée.</p> : null}
          </div>
        </div>

        {fileError ? (
          <Notice tone="danger">{fileError}</Notice>
        ) : null}

        {/* ── Description publique ─────────────────────────────────── */}
        <div className="field">
          <label htmlFor="public-description">
            Description de votre boutique
            <span className="rv-shop-counter" aria-hidden="true">
              {descCount}/{MAX_DESC_GRAPHEMES}
            </span>
          </label>
          <textarea
            id="public-description"
            name="publicDescription"
            rows={3}
            maxLength={1200}
            aria-describedby="desc-hint"
            aria-invalid={descOver}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Mode éthique à Dakar — pièces choisies, remise en main propre possible."
            className={`field-input${descOver ? ' bad' : ''}`}
          />
          <p className="hint" id="desc-hint">
            0 à 500 caractères — les sauts de ligne sont conservés. Aucune balise HTML (affichée telle quelle).
          </p>
        </div>

        {/* ── Adresse de collecte (SECRÈTE) ─────────────────────────── */}
        <div className="field">
          <label htmlFor="collecte-address">Adresse de collecte (secrète)</label>
          <input
            id="collecte-address"
            name="collecteAddress"
            type="text"
            autoComplete="off"
            maxLength={500}
            aria-describedby="collecte-hint"
            value={collecte}
            disabled={clearCollecte}
            onChange={(event) => setCollecte(event.target.value)}
            placeholder={collecteSet ? '•••••••••• (renseignée — ressaisissez pour la remplacer)' : 'Marché Sandaga, box 42 — Dakar'}
            className="field-input"
          />
          <p className="hint" id="collecte-hint">
            {collecteSet ? 'Adresse renseignée ✓ — jamais affichée publiquement, jamais lue par les visiteurs.' : 'Jamais affichée publiquement — usage logistique interne uniquement.'}
            {' '}Saisissez-en une nouvelle pour la remplacer ; laissez vide pour la conserver.
          </p>
          {collecteSet ? (
            <label className="rv-brand-check">
              <input type="checkbox" checked={clearCollecte} onChange={(event) => setClearCollecte(event.target.checked)} />
              Effacer l’adresse de collecte
            </label>
          ) : null}
        </div>

        {formError ? <Notice tone="danger">{formError}</Notice> : null}

        <button type="submit" className="btn terra" disabled={busy || descOver} aria-busy={save.isPending}>
          {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </form>
    </section>
  )
}
