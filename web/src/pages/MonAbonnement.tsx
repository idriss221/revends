import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Crumb, SiteEmpty } from '../components/site/SiteBits'
import { HeartLoader } from '../components/ui/HeartLoader'
import { Notice } from '../components/ui/Notice'
import { StatusBadge } from '../components/ui/StatusBadge'
import { Ico } from '../components/brand/Ico'
import { PlanPicker } from '../components/storefront/PlanPicker'
import { QuotaGauge } from '../components/storefront/QuotaGauge'
import { SubscriptionStatusPanel } from '../components/storefront/SubscriptionStatusPanel'
import { ListingManager } from '../components/storefront/ListingManager'
import { AddListingSheet } from '../components/storefront/AddListingSheet'
import { PlanChangeConfirm } from '../components/storefront/PlanChangeConfirm'
import { storefrontApi, storefrontError, formatFrLongDate } from '../lib/storefront'
import { waveApi } from '../lib/wave'
import { api } from '../lib/api'
import { resolveImageUrl } from '../lib/catalogPhotos'
import { useToast } from '../lib/toast'
import { ApiError } from '../lib/apiClient'
import { fmt } from '../components/site/SiteBits'
import { BrandingPanel } from '../components/storefront/BrandingPanel'
import { StatsPanel } from '../components/storefront/StatsPanel'
import { PaymentReferenceFields } from '../components/storefront/PaymentReferenceFields'
import { validatePaymentFields, type PaymentFieldErrors } from '../lib/v8'
import { WaveCheckoutPanel } from '../components/storefront/WaveCheckoutPanel'
import type { SubscriptionPlan, SubscribeWithPaymentBody } from '../lib/storefront.types'
import type { OwnerProduct } from '../lib/types'

/* ============================================================================
   `/mon-abonnement` — espace abonné (contrat v2.7 §7.2, design §3).

   Un seul écran, 5 visages — le visage se décide sur `GET /api/subscriptions/me` :
   `subscription === null` → AUCUN · PENDING · EXPIRED · CANCELLED · ACTIVE.
   Chaque mutation invalide la requête (pas de rechargement forcé) ; les prix
   et quotas affichés viennent EXCLUSIVEMENT de l’API ; aucune date ne tique.

   ⚠️ Hooks AVANT tout retour anticipé (règles des Hooks) : les deux requêtes,
   les dix `useState` et les trois `useMutation` sont déclarés inconditionnellement,
   les dérivés (isActive, used…) ensuite, et les retours anticipés APRÈS.
   ========================================================================== */

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const SLUG_MIN = 3
const SLUG_MAX = 40

export function MonAbonnement() {
  const qc = useQueryClient()
  const toast = useToast()

  /* ── Requêtes ─────────────────────────────────────────────────────── */
  const me = useQuery({
    queryKey: ['my-subscription'],
    queryFn: () => storefrontApi.mySubscription(),
    staleTime: 15_000,
    retry: false,
  })

  const products = useQuery({
    queryKey: ['my-products'],
    queryFn: () => api.myProducts(),
    staleTime: 30_000,
  })

  // V9 — disponibilité du bouton Wave. Fail-closed : une réponse absente,
  // erronée ou `false` masque le bouton sans toucher au formulaire manuel.
  const waveConfig = useQuery({
    queryKey: ['wave-config'],
    queryFn: () => waveApi.config(),
    staleTime: 60_000,
    retry: false,
  })
  const waveEnabled = waveConfig.data?.waveEnabled === true

  /* ── États (tous les hooks AVANT les retours anticipés) ──────────── */
  const [planId, setPlanId] = useState<number | null>(null)
  const [pendingPlanId, setPendingPlanId] = useState<number | null>(null)
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [changeTarget, setChangeTarget] = useState<SubscriptionPlan | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [quotaError, setQuotaError] = useState<string | null>(null)
  const [withdrawingId, setWithdrawingId] = useState<number | null>(null)
  const [addingId, setAddingId] = useState<number | null>(null)
  const [resouscribing, setResouscribing] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('')
  const [paymentReference, setPaymentReference] = useState('')
  const [paymentErrors, setPaymentErrors] = useState<PaymentFieldErrors>({})

  const data = me.data
  const subscription = data?.subscription ?? null
  const plans = data?.plans ?? []
  const listings = data?.listings ?? []
  const usage = data?.usage ?? null
  const isActive = subscription?.status === 'ACTIVE'
  const isExpired = subscription?.status === 'EXPIRED'
  const isPendingSub = subscription?.status === 'PENDING'
  const used = usage?.used ?? listings.length
  const quota = usage?.quota ?? subscription?.plan.quota ?? 0
  const quotaFull = isActive && usage !== null && usage.used >= usage.quota

  // V8 — référence de paiement (E1) : le bouton n'est actif que si les deux
  // champs sont valides côté client (le serveur reste l'arbitre).
  const paymentCheck = validatePaymentFields({ paymentMethod, paymentReference })
  const paymentValid = Object.keys(paymentCheck).length === 0
  const paymentPayload = (): Pick<SubscribeWithPaymentBody, 'paymentMethod' | 'paymentReference'> => ({
    paymentMethod: paymentMethod as SubscribeWithPaymentBody['paymentMethod'],
    paymentReference: paymentReference.trim(),
  })
  /** Valide au clic : pose paymentErrors si invalide ; sinon null. */
  const guardPayment = (): boolean => {
    const errors = validatePaymentFields({ paymentMethod, paymentReference })
    setPaymentErrors(errors)
    return Object.keys(errors).length === 0
  }

  /* ── Mutations ───────────────────────────────────────────────────── */
  const subscribe = useMutation({
    mutationFn: (body: SubscribeWithPaymentBody) => storefrontApi.subscribe(body),
    onSuccess: (_res, body) => {
      qc.invalidateQueries({ queryKey: ['my-subscription'] })
      toast(
        'success',
        body.supersedesId
          ? 'Votre demande de changement est envoyée. Votre forfait actuel reste actif jusqu’à l’activation du nouveau.'
          : isExpired
            ? 'Votre demande est envoyée.'
            : 'Votre demande est envoyée. L’administration ouvre votre boutique sous peu.',
      )
      setFormError(null)
      setFieldError(null)
      setSlug('')
      setPlanId(null)
      setPendingPlanId(null)
      setResouscribing(false)
      setChangeTarget(null)
      setPaymentMethod('')
      setPaymentReference('')
      setPaymentErrors({})
    },
    onError: (err) => {
      const message = storefrontError(err, 'La demande n’a pas pu être envoyée. Réessayez.')
      if (err instanceof ApiError && (err.code === 'SLUG_TAKEN' || err.code === 'SLUG_RESERVED')) {
        setFieldError(message)
        return
      }
      const slugDetail = err instanceof ApiError ? err.details?.find((d) => d.field === 'slug')?.message : undefined
      if (slugDetail) {
        setFieldError(slugDetail)
        return
      }
      setFormError(message)
    },
  })

  const addListing = useMutation({
    mutationFn: (product: OwnerProduct) => storefrontApi.addListing(product.id),
    onMutate: (product) => setAddingId(product.id),
    onSettled: () => setAddingId(null),
    onSuccess: (_res, product) => {
      qc.invalidateQueries({ queryKey: ['my-subscription'] })
      toast('success', `« ${product.name} » est dans votre boutique.`)
      setAddOpen(false)
      setQuotaError(null)
    },
    onError: (err) => {
      setAddOpen(false)
      const message = storefrontError(err, 'Impossible d’ajouter cet article. Réessayez.')
      if (err instanceof ApiError && err.code === 'STOREFRONT_QUOTA_EXCEEDED') {
        setQuotaError(message)
        return
      }
      toast('error', message)
    },
  })

  const withdraw = useMutation({
    mutationFn: (listing: { id: number; title: string }) =>
      storefrontApi.withdrawListing(listing.id).then(() => listing),
    onMutate: (listing) => setWithdrawingId(listing.id),
    onSettled: () => setWithdrawingId(null),
    onSuccess: (listing) => {
      qc.invalidateQueries({ queryKey: ['my-subscription'] })
      setQuotaError(null) // une place a été libérée — le bandeau quota précédent est obsolète
      toast('success', `« ${listing.title} » est retiré de votre boutique.`)
    },
    onError: (err) => toast('error', storefrontError(err, 'Retrait impossible pour le moment.')),
  })

  /* ── Helpers dérivés (pas de hooks) ─────────────────────────────── */
  const imageFor = (productId: number): string | null => {
    const p = products.data?.items.find((item) => item.id === productId)
    const url = p?.images[0]?.url
    return url ? resolveImageUrl(url) : null
  }

  const eligibleProducts: OwnerProduct[] = (products.data?.items ?? []).filter((p) => {
    if (p.status !== 'PENDING' && p.status !== 'AVAILABLE' && p.status !== 'RESERVED') return false
    return !listings.some((l) => l.productId === p.id)
  })

  const slugFormatError =
    slugTouched && slug.trim() !== '' && !SLUG_RE.test(slug.trim())
      ? 'Minuscules, chiffres et tirets — 3 à 40 caractères, sans tiret double.'
      : null
  const slugTooShort = slugTouched && slug.trim() !== '' && slug.trim().length < SLUG_MIN
    ? 'L’adresse doit contenir au moins 3 caractères.'
    : null

  const reSubscribe = () => {
    if (!subscription) return
    if (!guardPayment()) return
    subscribe.mutate({ planId: subscription.plan.id, slug: subscription.slug, ...paymentPayload() })
  }

  const onSubmitPlans = (e: FormEvent) => {
    e.preventDefault()
    setSlugTouched(true)
    setFormError(null)
    setFieldError(null)
    const normalized = slug.trim().toLowerCase().replace(/\s+/g, '-')
    if (!planId) return
    if (!guardPayment()) return
    if (!SLUG_RE.test(normalized) || normalized.length < SLUG_MIN || normalized.length > SLUG_MAX) {
      setFieldError('Minuscules, chiffres et tirets — 3 à 40 caractères, sans tiret double.')
      return
    }
    subscribe.mutate({ planId, slug: normalized, ...paymentPayload() })
  }

  /* ── Retours anticipés (hooks terminés) ─────────────────────────── */
  if (me.isPending) {
    return (
      <div className="wrap">
        <Crumb items={[{ label: 'Mon abonnement' }]} />
        <div className="section tight">
          <HeartLoader size="lg" label="Préparation de votre espace…" />
        </div>
      </div>
    )
  }
  if (me.isError) {
    return (
      <div className="wrap">
        <Crumb items={[{ label: 'Mon abonnement' }]} />
        <div className="section tight">
          <SiteEmpty
            icon="triangle-exclamation"
            level={1}
            role="alert"
            title="Impossible de charger votre abonnement"
            action={{ label: 'Réessayer', onClick: () => void me.refetch() }}
            style={{ maxWidth: '640px', marginInline: 'auto' }}
          >
            {storefrontError(me.error, 'Réessayez dans un instant.')}
          </SiteEmpty>
        </div>
      </div>
    )
  }

  /* ==================================================================== */
  /* Visage AUCUN — écran de choix                                         */
  /* ==================================================================== */
  if (!subscription) {
    const canSubmit = planId !== null && !subscribe.isPending && paymentValid
    return (
      <div className="wrap">
        <Crumb items={[{ label: 'Mon abonnement' }]} />
        <div className="section tight" style={{ maxWidth: 880, marginInline: 'auto' }}>
          <span className="eyebrow">Hébergement</span>
          <h1 className="rv-shop-h1">Mon abonnement</h1>
          <p className="rv-shop-sub" style={{ marginBottom: 26 }}>
            La seconde vie a de la valeur — votre boutique aussi.
          </p>

          <h2 className="rv-shop-h2">Choisissez votre forfait</h2>
          <p className="rv-shop-sub">
            L’administration examine votre demande après votre paiement hors ligne (Wave / Orange Money / virement).
            Vous pourrez suivre son état ici.
          </p>

          <WaveCheckoutPanel waveEnabled={waveEnabled} subscription={null} />

          <form onSubmit={onSubmitPlans} noValidate>
            <PlanPicker plans={plans} value={planId} onChange={setPlanId} name="plan" />
            {plans.length === 0 ? (
              <Notice tone="warning" className="mt-4">
                Les forfaits ne sont pas disponibles pour le moment — réessayez dans un instant.
              </Notice>
            ) : null}

            <div className="field" style={{ marginTop: 22 }}>
              <label htmlFor="shop-slug">Votre adresse de boutique</label>
              <div className={`rv-shop-slug${fieldError || slugFormatError || slugTooShort ? ' bad' : ''}`}>
                <span className="rv-shop-slug-prefix" aria-hidden="true">
                  revends…/boutique/
                </span>
                <input
                  id="shop-slug"
                  name="slug"
                  type="text"
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={SLUG_MAX}
                  placeholder="mode-dakar"
                  aria-describedby="slug-hint slug-err"
                  aria-invalid={Boolean(fieldError || slugFormatError || slugTooShort)}
                  value={slug}
                  onChange={(e) => {
                    setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))
                    setFieldError(null)
                  }}
                  onBlur={() => setSlugTouched(true)}
                />
              </div>
              <p className="hint" id="slug-hint">
                Minuscules, chiffres et tirets — 3 à 40 caractères
              </p>
              {(fieldError ?? slugFormatError ?? slugTooShort) && (
                <p className="err show" id="slug-err" role="alert">
                  {fieldError ?? slugFormatError ?? slugTooShort}
                </p>
              )}
            </div>

            <div style={{ marginTop: 18 }}>
              <PaymentReferenceFields
                idPrefix="subscribe"
                method={paymentMethod}
                reference={paymentReference}
                onMethodChange={(v) => {
                  setPaymentMethod(v)
                  setPaymentErrors((prev) => ({ ...prev, paymentMethod: undefined }))
                }}
                onReferenceChange={(v) => {
                  setPaymentReference(v)
                  setPaymentErrors((prev) => ({ ...prev, paymentReference: undefined }))
                }}
                errors={paymentErrors}
              />
            </div>

            {formError && (
              <Notice tone="danger" className="mt-2">
                {formError}
              </Notice>
            )}

            <button
              type="submit"
              className="btn terra block"
              style={{ marginTop: 18 }}
              aria-disabled={!canSubmit}
              disabled={!canSubmit}
              aria-busy={subscribe.isPending}
            >
              {subscribe.isPending ? 'Envoi…' : 'Soumettre ma demande'}
            </button>
            {planId === null ? (
              <p className="hint" style={{ marginTop: 10 }}>
                Choisissez un forfait pour continuer.
              </p>
            ) : (
              <p className="hint" style={{ marginTop: 10 }}>
                Réglez hors ligne (Wave / Orange Money / virement) — l’administration ouvre votre boutique après
                vérification.
              </p>
            )}
          </form>
        </div>
      </div>
    )
  }

  /* ==================================================================== */
  /* Visage EXPIRED                                                         */
  /* ==================================================================== */
  if (isExpired) {
    return (
      <div className="wrap">
        <Crumb items={[{ label: 'Mon abonnement' }]} />
        <div className="section tight" style={{ maxWidth: 880, marginInline: 'auto' }}>
          <h1 className="rv-shop-h1">Mon abonnement</h1>
          <SubscriptionStatusPanel subscription={subscription} />
          <WaveCheckoutPanel waveEnabled={waveEnabled} subscription={subscription} />
          <div style={{ marginTop: 18 }}>
            <PaymentReferenceFields
              idPrefix="resubscribe"
              method={paymentMethod}
              reference={paymentReference}
              onMethodChange={(v) => {
                setPaymentMethod(v)
                setPaymentErrors((prev) => ({ ...prev, paymentMethod: undefined }))
              }}
              onReferenceChange={(v) => {
                setPaymentReference(v)
                setPaymentErrors((prev) => ({ ...prev, paymentReference: undefined }))
              }}
              errors={paymentErrors}
            />
            <button
              type="button"
              className="btn terra block"
              style={{ marginTop: 16 }}
              onClick={reSubscribe}
              disabled={subscribe.isPending || !paymentValid}
              aria-busy={subscribe.isPending}
            >
              {subscribe.isPending ? 'Envoi…' : `Re-souscrire à ${subscription.plan.name}`}
            </button>
            <button
              type="button"
              className="link-arrow"
              style={{ marginTop: 14 }}
              aria-expanded={resouscribing}
              onClick={() => setResouscribing((v) => !v)}
            >
              Re-souscrire avec un autre forfait <Ico name="arrow-right" cls="sm" />
            </button>
          </div>

          {resouscribing && (
            <div style={{ marginTop: 14 }}>
              <PlanPicker plans={plans} value={planId} onChange={setPlanId} name="plan-expired" />
              <button
                type="button"
                className="btn terra block"
                style={{ marginTop: 12 }}
                disabled={planId === null || subscribe.isPending || !paymentValid}
                aria-busy={subscribe.isPending}
                onClick={() => {
                  if (planId !== null && guardPayment()) {
                    subscribe.mutate({ planId, slug: subscription.slug, ...paymentPayload() })
                  }
                }}
              >
                {subscribe.isPending ? 'Envoi…' : 'Envoyer la demande'}
              </button>
              <p className="hint" style={{ marginTop: 10 }}>
                Votre adresse /boutique/{subscription.slug} est conservée.
              </p>
            </div>
          )}

          <h2 className="rv-shop-h2" style={{ marginTop: 30 }}>
            Annonces conservées ({listings.length})
          </h2>
          {listings.length === 0 ? (
            <p className="rv-shop-sub">Aucune annonce conservée.</p>
          ) : (
            <ListingManager
              listings={listings}
              busyId={withdrawingId}
              onWithdraw={(id, title) => withdraw.mutate({ id, title })}
              imageFor={imageFor}
              badgeOverride={{ kind: 'neutral', label: 'Conservée' }}
            />
          )}
          <p className="rv-shop-recall">Votre slug /boutique/{subscription.slug} vous est réservé.</p>

          <div style={{ marginTop: 26, display: 'grid', gap: 22 }}>
            {/* V8.4 — EXPIRED : aucun usage de l'abonnement, y compris les
                statistiques et le bilan PDF (plus de StatsPanel ici). */}
            <Notice tone="info">
              Votre abonnement est expiré. Le branding, les annonces de boutique,
              les statistiques et le bilan ne seront accessibles qu’une fois votre
              nouvelle demande validée par l’administration. Vos annonces du
              catalogue restent en ligne.
            </Notice>
          </div>
        </div>
      </div>
    )
  }

  /* ==================================================================== */
  /* Visage PENDING / CANCELLED                                             */
  /* ==================================================================== */
  if (isPendingSub || subscription.status === 'CANCELLED') {
    return (
      <div className="wrap">
        <Crumb items={[{ label: 'Mon abonnement' }]} />
        <div className="section tight" style={{ maxWidth: 640, marginInline: 'auto' }}>
          <h1 className="rv-shop-h1">Mon abonnement</h1>
          <SubscriptionStatusPanel subscription={subscription} />
          <WaveCheckoutPanel waveEnabled={waveEnabled} subscription={subscription} />
          {isPendingSub && plans.length > 1 && (
            <div style={{ marginTop: 18 }}>
              <PaymentReferenceFields
                idPrefix="change-plan"
                method={paymentMethod}
                reference={paymentReference}
                onMethodChange={(v) => {
                  setPaymentMethod(v)
                  setPaymentErrors((prev) => ({ ...prev, paymentMethod: undefined }))
                }}
                onReferenceChange={(v) => {
                  setPaymentReference(v)
                  setPaymentErrors((prev) => ({ ...prev, paymentReference: undefined }))
                }}
                errors={paymentErrors}
              />
              <PlanPicker plans={plans} value={pendingPlanId} onChange={setPendingPlanId} name="plan-pending" />
              <button
                type="button"
                className="btn ghost"
                style={{ marginTop: 12 }}
                disabled={pendingPlanId === null || subscribe.isPending || !paymentValid}
                onClick={() => {
                  const target = plans.find((p) => p.id === pendingPlanId)
                  if (target && guardPayment()) setChangeTarget(target)
                }}
              >
                Demander le changement de forfait
              </button>
            </div>
          )}

          <div style={{ marginTop: 26, display: 'grid', gap: 22 }}>
            {/* V8.4 — tant que l'abonnement n'est pas activé, aucun usage de l'abonnement
                n'est accessible (logo, bannière, annonces, stats). Le serveur refuse
                aussi toute écriture branding tant que l'abonnement n'est pas ACTIVE. */}
            <Notice tone="info">
              Votre boutique n’est pas encore validée par l’administration. Tant qu’elle
              ne l’est pas, le logo, la bannière, les annonces et les statistiques ne
              seront pas accessibles.
            </Notice>
          </div>
        </div>

        {/* Changement de forfait en PENDING : nouvelle demande sans supersedesId
            (supersedesId d’un abonnement non ACTIVE → 400 INVALID_SUPERSEDES,
            arbitrage définitif C-V7-5) — la demande courante reste en file. */}
        {changeTarget && (
          <PlanChangeConfirm
            open
            context="pending"
            current={subscription.plan}
            target={changeTarget}
            loading={subscribe.isPending}
            onConfirm={() => subscribe.mutate({ planId: changeTarget.id, slug: subscription.slug, ...paymentPayload() })}
            onCancel={() => setChangeTarget(null)}
          />
        )}
      </div>
    )
  }

  /* ==================================================================== */
  /* Visage ACTIVE                                                          */
  /* ==================================================================== */
  const quotaMessage =
    quotaError ??
    `Quota de votre forfait atteint (${used}/${quota}). Retirez une annonce de votre boutique, ou passez à un forfait supérieur.`

  return (
    <div className="wrap">
      <Crumb items={[{ label: 'Mon abonnement' }]} />
      <div className="section tight">
        <div className="rv-shop-subhead" style={{ marginBottom: 22 }}>
          <h1 className="rv-shop-h1" style={{ margin: 0 }}>
            Mon abonnement
          </h1>
          <Link className="btn ghost sm" to={`/boutique/${subscription.slug}`}>
            Voir ma boutique <Ico name="arrow-right" cls="sm" />
          </Link>
        </div>

        <div className="rv-shop-layout">
          {/* ── Colonne gauche : forfait + jauge ── */}
          <div className="rv-shop-sticky" style={{ display: 'grid', gap: 18 }}>
            <section className="rv-shop-panel" aria-labelledby="active-plan-title">
              <div className="rv-shop-subhead">
                <StatusBadge kind="approved" label="Boutique ouverte" dot />
                <Link className="rv-shop-shop-link" to={`/boutique/${subscription.slug}`}>
                  /boutique/{subscription.slug}
                </Link>
              </div>
              <h2 id="active-plan-title" className="rv-shop-h2">
                {subscription.plan.name} — {fmt(subscription.plan.priceFcfa)} / mois
              </h2>
              <p className="rv-shop-deadline">
                Membre depuis le {formatFrLongDate(subscription.startedAt)}
                <br />
                Échéance le {formatFrLongDate(subscription.endsAt)} · plus que {subscription.daysRemaining} jour
                {subscription.daysRemaining > 1 ? 's' : ''}
              </p>
            </section>

            <QuotaGauge used={used} quota={quota} />

            {quotaFull && <Notice tone="warning">{quotaMessage}</Notice>}
            {quotaError && !quotaFull && <Notice tone="warning">{quotaError}</Notice>}

            {plans.length > 1 && (
              <PaymentReferenceFields
                idPrefix="switch-plan"
                method={paymentMethod}
                reference={paymentReference}
                onMethodChange={(v) => {
                  setPaymentMethod(v)
                  setPaymentErrors((prev) => ({ ...prev, paymentMethod: undefined }))
                }}
                onReferenceChange={(v) => {
                  setPaymentReference(v)
                  setPaymentErrors((prev) => ({ ...prev, paymentReference: undefined }))
                }}
                errors={paymentErrors}
              />
            )}

            <section aria-labelledby="alt-plans-title">
              <h2 id="alt-plans-title" className="rv-shop-h2" style={{ marginBottom: 12 }}>
                Forfait
              </h2>
              <div className="rv-shop-altplans">
                {plans
                  .filter((p) => p.id !== subscription.plan.id)
                  .map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="btn ghost"
                      disabled={!paymentValid}
                      onClick={() => {
                        if (guardPayment()) setChangeTarget(p)
                      }}
                    >
                      Passer à {p.name} — {fmt(p.priceFcfa)}/mois · quota {p.quota}
                    </button>
                  ))}
              </div>
            </section>
          </div>

          {/* ── Colonne droite : annonces ── */}
          <div>
            <div className="rv-shop-subhead" style={{ marginBottom: 12 }}>
              <h2 className="rv-shop-h2" style={{ margin: 0 }}>
                Mes annonces de boutique ({listings.length})
              </h2>
              <button
                type="button"
                className="btn terra sm"
                onClick={() => setAddOpen(true)}
                aria-disabled={quotaFull}
                disabled={quotaFull}
              >
                <Ico name="plus" cls="sm" />
                {quotaFull ? `Quota atteint (${used}/${quota})` : 'Ajouter'}
              </button>
            </div>

            {listings.length === 0 ? (
              <div className="rv-shop-addbox">
                <p className="rv-shop-sub" style={{ margin: 0 }}>
                  Votre boutique est ouverte — ajoutez votre première annonce.
                </p>
                <button
                  type="button"
                  className="btn terra"
                  onClick={() => setAddOpen(true)}
                  aria-disabled={quotaFull}
                  disabled={quotaFull}
                >
                  <Ico name="plus" cls="sm" /> Ajouter une annonce
                </button>
              </div>
            ) : (
              <ListingManager
                listings={listings}
                busyId={withdrawingId}
                onWithdraw={(id, title) => withdraw.mutate({ id, title })}
                imageFor={imageFor}
              />
            )}
            <p className="rv-shop-recall">Vos articles restent vendables sur le catalogue, quota atteint ou non.</p>
          </div>
        </div>

        <div style={{ marginTop: 26, display: 'grid', gap: 22 }}>
          <BrandingPanel profile={data?.profile} />
          <StatsPanel
            slug={subscription.slug}
            planName={subscription.plan.name}
            priceFcfa={subscription.plan.priceFcfa}
            activatedAt={subscription.activatedAt}
            endsAt={subscription.endsAt}
          />
        </div>

        <p className="rv-shop-sub" style={{ marginTop: 34, fontStyle: 'italic' }}>
          La seconde vie a de la valeur.
        </p>
      </div>

      <PlanChangeConfirm
        open={changeTarget !== null}
        current={subscription.plan}
        target={changeTarget ?? subscription.plan}
        loading={subscribe.isPending}
        context="active"
        onConfirm={() =>
          changeTarget &&
          subscribe.mutate({ planId: changeTarget.id, slug: subscription.slug, supersedesId: subscription.id, ...paymentPayload() })
        }
        onCancel={() => setChangeTarget(null)}
      />

      <AddListingSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        products={eligibleProducts}
        remainingAfterAdd={Math.max(0, quota - used - 1)}
        pendingId={addingId}
        onPick={(product) => addListing.mutate(product)}
      />
    </div>
  )
}
