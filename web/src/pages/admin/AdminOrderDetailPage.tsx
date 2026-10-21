import { useState } from 'react'
import type { ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { api } from '../../lib/api'
import { formatDateTime, formatFcfa } from '../../lib/format'
import { resolveImageUrl } from '../../lib/catalogPhotos'
import { PAYMENT_METHODS, TOAST_COPY, orderStatusBadge, payoutStatusBadge } from '../../lib/constants'
import { adminMenu } from '../../lib/menus'
import { useAdminStats } from '../../hooks/useAdminStats'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { AdminPageHeader } from '../../components/admin/AdminPageHeader'
import { ConfirmAction } from '../../components/admin/ConfirmAction'
import { Field, FieldGrid } from '../../components/ui/Field'
import { Card } from '../../components/ui/States'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { Button, buttonClasses } from '../../components/ui/Button'
import { PageLoader } from '../../components/ui/Loading'
import { ErrorMessage } from '../../components/ui/ErrorMessage'
import { Notice } from '../../components/ui/Notice'
import { OrderTimeline } from '../../components/ui/OrderTimeline'
import { useToast } from '../../lib/toast'
import type { PaymentMethod, PaymentStatus } from '../../lib/types'

/** Panneau d'information — composant `Card` (classe `.card`, rayon token, p-6 / 16 px, spec-admin §6-8). */
function InfoBlock({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  // `Card` (D1) et non un `<section className="card">` brut : la même page
  // utilise déjà le composant `Card` (montant, Actions, Cycle) — la classe `.card`
  // ne doit jamais coexister avec le composant sur un même écran (CA-V5-035).
  // Rendu visuel identique : `Card` est le point d'entrée JSX de la classe `.card`.
  return (
    <Card>
      <h3 className="mb-4 flex items-center gap-2 text-base font-bold text-ink">
        <i className={`${icon} w-5 text-terracotta-ink`} aria-hidden="true" />
        {title}
      </h3>
      <FieldGrid>{children}</FieldGrid>
    </Card>
  )
}

/** Badge du paiement ACHETEUR : Payé (vert) / En attente (champagne) / Échoué (rouge). */
function paymentBadge(status: PaymentStatus) {
  if (status === 'PAID') return { kind: 'approved' as const, label: 'Payé' }
  if (status === 'FAILED') return { kind: 'rejected' as const, label: 'Échoué' }
  return { kind: 'pending' as const, label: 'En attente' }
}

/**
 * Détail commande admin — pilotage du cycle V3 (US-LIVRAISON, CA-ORD03..08) :
 * confirmer paiement → récupérer l'article → préparer → PRÊTE (mark-shipped) →
 * expédier (transporteur + suivi) → livrée → payer le vendeur (PENDING/DUE/PAID).
 *
 * Les 7 mutations passent toutes par `ConfirmAction` : aucune écriture
 * immédiate, chaque action annule explicitement.
 */
export function AdminOrderDetailPage() {
  const { id = '' } = useParams()
  const stats = useAdminStats()
  const toast = useToast()
  const qc = useQueryClient()

  // Modales
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [method, setMethod] = useState<PaymentMethod>('MOBILE_MONEY')
  const [reference, setReference] = useState('')
  const [receivedOpen, setReceivedOpen] = useState(false)
  const [receivedNote, setReceivedNote] = useState('')
  const [shippedOpen, setShippedOpen] = useState(false)
  const [deliveryOpen, setDeliveryOpen] = useState(false)
  const [carrier, setCarrier] = useState('')
  const [trackingNumber, setTrackingNumber] = useState('')
  const [deliveredOpen, setDeliveredOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelNote, setCancelNote] = useState('')
  const [payoutOpen, setPayoutOpen] = useState(false)
  const [payoutReference, setPayoutReference] = useState('')

  const order = useQuery({
    queryKey: ['admin', 'order', id],
    queryFn: () => api.adminOrderDetail(Number(id)),
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'orders'] })
    qc.invalidateQueries({ queryKey: ['admin', 'order', id] })
    qc.invalidateQueries({ queryKey: ['admin', 'stats'] })
    qc.invalidateQueries({ queryKey: ['admin', 'payouts'] })
  }

  /* Repli d’erreur : `fallback` vient toujours de `TOAST_COPY` (§7) —
     aucune chaîne écrite dans la page (§9.4) ; `err.message` = garde serveur. */
  const fail = (fallback: string) => (err: unknown) =>
    toast('error', err instanceof Error && err.message ? err.message : fallback)

  const confirmPayment = useMutation({
    mutationFn: () => api.confirmPayment(Number(id), { method, reference: reference.trim() || undefined }),
    onSuccess: () => {
      toast('success', TOAST_COPY.paymentConfirmed)
      setConfirmOpen(false)
      setReference('')
      invalidate()
    },
    onError: fail(TOAST_COPY.paymentConfirmationFailed),
  })

  const markProductReceived = useMutation({
    mutationFn: () => api.markProductReceived(Number(id), receivedNote.trim() || undefined),
    onSuccess: () => {
      toast('success', TOAST_COPY.orderReceived)
      setReceivedOpen(false)
      setReceivedNote('')
      invalidate()
    },
    onError: fail(TOAST_COPY.productReceiveFailed),
  })

  const markShipped = useMutation({
    mutationFn: () => api.markShipped(Number(id)),
    onSuccess: () => {
      toast('success', TOAST_COPY.orderMarkedReady)
      setShippedOpen(false)
      invalidate()
    },
    onError: fail(TOAST_COPY.updateFailed),
  })

  const startDelivery = useMutation({
    mutationFn: () =>
      api.startDelivery(Number(id), {
        carrier: carrier.trim() || undefined,
        trackingNumber: trackingNumber.trim() || undefined,
      }),
    onSuccess: () => {
      toast('success', TOAST_COPY.deliveryStarted)
      setDeliveryOpen(false)
      setCarrier('')
      setTrackingNumber('')
      invalidate()
    },
    onError: fail(TOAST_COPY.deliveryStartFailed),
  })

  const markDelivered = useMutation({
    mutationFn: () => api.markDelivered(Number(id)),
    onSuccess: () => {
      toast('success', TOAST_COPY.orderDelivered)
      setDeliveredOpen(false)
      invalidate()
    },
    onError: fail(TOAST_COPY.deliveryConfirmFailed),
  })

  const cancelOrder = useMutation({
    mutationFn: () => api.cancelOrder(Number(id), cancelNote.trim()),
    onSuccess: () => {
      toast('success', TOAST_COPY.orderCancelled)
      setCancelOpen(false)
      setCancelNote('')
      invalidate()
    },
    onError: fail(TOAST_COPY.orderCancelFailed),
  })

  const sellerPayout = useMutation({
    mutationFn: () => api.sellerPayout(Number(id), payoutReference.trim() || undefined),
    onSuccess: () => {
      toast('success', TOAST_COPY.payoutMarked)
      setPayoutOpen(false)
      setPayoutReference('')
      invalidate()
    },
    onError: fail(TOAST_COPY.payoutFailed),
  })

  return (
    <DashboardLayout items={adminMenu(stats.data?.pendingProducts ?? 0)}>
      <AdminPageHeader
        title={order.data?.order.orderNumber ?? 'Commande'}
        breadcrumb={[{ label: 'Commandes', to: '/admin/commandes' }]}
        subtitle={order.data ? `Créée le ${formatDateTime(order.data.order.createdAt)}` : undefined}
        meta={
          order.data ? <StatusBadge kind={orderStatusBadge(order.data.order.status).kind} label={orderStatusBadge(order.data.order.status).label} dot /> : undefined
        }
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(`/catalogue/${order.data?.order.product.slug ?? ''}`, '_blank', 'noopener')}
            disabled={!order.data}
            icon="fa-arrow-up-right-from-square"
          >
            Voir la fiche produit
          </Button>
        }
      />

      {order.isPending && <PageLoader label="Chargement de la commande…" />}

      {order.isError && (
        <ErrorMessage
          error={order.error}
          showCode
          action={{ label: 'Réessayer', onClick: () => void order.refetch() }}
          loading={order.isFetching}
        />
      )}

      {order.isSuccess && (() => {
        const o = order.data.order
        const methodLabel = PAYMENT_METHODS.find((m) => m.value === o.payment.method)?.label ?? o.payment.method
        const payTag = paymentBadge(o.payment.status)
        return (
          <>
            {/* Montant héros — D7 : 32 px/700 = grand texte, donc Terracotta
                acceptable en AA (3:1). Le numéro, le badge et la date sont
                portés par `AdminPageHeader` (titre / meta / subtitle). */}
            <Card className="mb-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-muted">Montant total</p>
                  <p className="tabular text-[32px] font-bold leading-tight text-terracotta-ink">{formatFcfa(o.amount)}</p>
                </div>
                <p className="text-sm text-muted">
                  Article : <span className="font-semibold text-ink">{o.product.name}</span>
                </p>
              </div>
            </Card>

            {/* Panneau ACTIONS — gros boutons contextuels, modale de confirmation systématique */}
            <Card className="mb-6">
              <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-ink">
                <i className="fas fa-bolt text-terracotta-ink" aria-hidden="true" /> Actions
              </h3>
              <div className="flex flex-col gap-3">
                {o.status === 'PAYMENT_PENDING' && (
                  <>
                    <Notice tone="warning">
                      Le paiement de l’acheteur doit être confirmé pour démarrer le cycle.
                    </Notice>
                    <Button variant="positive" size="lg" block onClick={() => setConfirmOpen(true)}>
                      <i className="fas fa-check" aria-hidden="true" /> Confirmer le paiement
                    </Button>
                  </>
                )}

                {o.status === 'PRODUCT_WAITING' && (
                  <>
                    <Notice tone="warning">
                      L’article doit être récupéré auprès du vendeur avant la préparation.
                    </Notice>
                    <Button variant="positive" size="lg" block onClick={() => setReceivedOpen(true)}>
                      <i className="fas fa-box-open" aria-hidden="true" /> Confirmer la réception de l’article
                    </Button>
                  </>
                )}

                {o.status === 'PREPARING' && (
                  <>
                    <Notice tone="warning">
                      Une fois le colis emballé, marquez-le comme prêt : vous pourrez ensuite l’expédier.
                    </Notice>
                    <Button variant="primary" size="lg" block onClick={() => setShippedOpen(true)}>
                      <i className="fas fa-box" aria-hidden="true" /> Marquer comme prête
                    </Button>
                  </>
                )}

                {o.status === 'SHIPPED' && (
                  <>
                    <Notice tone="info">
                      Le colis est prêt : renseignez le transporteur pour lancer l’expédition.
                    </Notice>
                    <Button variant="primary" size="lg" block onClick={() => setDeliveryOpen(true)}>
                      <i className="fas fa-paper-plane" aria-hidden="true" /> Expédier la commande
                    </Button>
                  </>
                )}

                {o.status === 'IN_DELIVERY' && (
                  <>
                    {o.deliveryCarrier || o.trackingNumber ? (
                      <Notice tone="info">
                        {o.deliveryCarrier ? `${o.deliveryCarrier} — ` : ''}
                        {o.trackingNumber ? `N° ${o.trackingNumber}` : 'En cours de transport'}
                      </Notice>
                    ) : null}
                    <Button variant="positive" size="lg" block onClick={() => setDeliveredOpen(true)}>
                      <i className="fas fa-check-double" aria-hidden="true" /> Marquer comme livrée
                    </Button>
                  </>
                )}

                {o.payout?.status === 'DUE' && (
                  <Button variant="secondary" size="lg" block onClick={() => setPayoutOpen(true)}>
                    <i className="fas fa-money-bill-wave" aria-hidden="true" /> Marquer comme payé ({formatFcfa(o.payout.amount)})
                  </Button>
                )}

                {o.status === 'COMPLETED' && o.payout?.status === 'PAID' && (
                  <Notice tone="success">
                    Tout est réglé : commande terminée et vendeur payé.
                  </Notice>
                )}

                {(o.status === 'CANCELLED' || o.status === 'PAYMENT_FAILED') && (
                  <Notice tone="danger">
                    Commande {o.status === 'CANCELLED' ? 'annulée' : 'échouée'} — aucune action requise.
                  </Notice>
                )}
              </div>

              {/* Action destructrice en SECOND PLAN (spec §6-8) : `outline sm`
                  aligné à droite sous l'action dominante — jamais un second
                  bouton pleine largeur, qui concurrencerait l'action principale.
                  Le serveur n'accepte l'annulation qu'à `PAYMENT_PENDING`
                  (`admin.service.ts:374` — `if (order.status !== 'PAYMENT_PENDING')`)
                  : la porte reste donc sur ce statut. */}
              {o.status === 'PAYMENT_PENDING' && (
                <div className="mt-5 flex justify-end border-t border-line pt-4">
                  <Button variant="outline" size="sm" onClick={() => setCancelOpen(true)}>
                    <i className="fas fa-ban" aria-hidden="true" /> Annuler la commande
                  </Button>
                </div>
              )}
            </Card>

            {/* Blocs d'information */}
            {/* D14 : `max-[…]` seul — la sidebar 260 px décale la largeur utile, donc
                le breakpoint `md` (768 px) serait trompeur (CA-V5-038, E8). */}
            <div className="mb-6 grid gap-5 max-[1279px]:grid-cols-2 max-[1024px]:grid-cols-1">
              {/* Article */}
              <InfoBlock icon="fas fa-box" title="Article">
                <div className="mb-4">
                  {o.product.image ? (
                    <img
                      src={resolveImageUrl(o.product.image.url)}
                      alt={o.product.name}
                      className="mb-3 h-40 w-full rounded-md object-cover"
                    />
                  ) : (
                    <div className="mb-3 flex h-40 w-full items-center justify-center rounded-md bg-ivory text-faint">
                      <i className="fas fa-image text-3xl" aria-hidden="true" />
                    </div>
                  )}
                  <p className="font-semibold text-ink">{o.product.name}</p>
                  <p className="text-sm text-muted">Prix unitaire : {formatFcfa(o.product.price)}</p>
                  {o.quantity > 1 ? <p className="text-sm text-muted">Quantité : {o.quantity}</p> : null}
                </div>
                <Link to={`/catalogue/${o.product.slug}`} className={buttonClasses('primary', 'md', true)}>
                  <i className="fas fa-arrow-up-right-from-square" aria-hidden="true" /> Voir l’article
                </Link>
              </InfoBlock>

              {/* Client (acheteur) */}
              <InfoBlock icon="fas fa-user" title="Client">
                <Field label="Nom">{o.buyer.displayName}</Field>
                <Field label="Téléphone">{o.buyer.phone}</Field>
                <Field label="E-mail">{o.buyer.email}</Field>
              </InfoBlock>

              {/* Propriétaire (vendeur) */}
              <InfoBlock icon="fas fa-store" title="Propriétaire">
                <Field label="Nom">{o.seller.displayName}</Field>
                <Field label="Téléphone">{o.seller.phone}</Field>
                <Field label="E-mail">{o.seller.email}</Field>
              </InfoBlock>

              {/* Paiement client */}
              <InfoBlock icon="fas fa-credit-card" title="Paiement client">
                <Field label="Méthode">{methodLabel}</Field>
                <Field label="Référence">{o.payment.reference ?? '—'}</Field>
                <Field label="Statut">
                  <StatusBadge kind={payTag.kind} label={payTag.label} dot />
                </Field>
                <Field label="Date de paiement">{o.payment.paidAt ? formatDateTime(o.payment.paidAt) : '—'}</Field>
              </InfoBlock>

              {/* Paiement propriétaire */}
              <InfoBlock icon="fas fa-money-bill-wave" title="Paiement propriétaire">
                {o.payout ? (
                  <>
                    <Field label="Montant vendeur">{formatFcfa(o.payout.amount)}</Field>
                    <Field label="Statut">
                      <StatusBadge
                        kind={payoutStatusBadge(o.payout.status).kind}
                        label={payoutStatusBadge(o.payout.status).label}
                        dot
                      />
                    </Field>
                    <Field label="Référence">{o.payout.reference ?? '—'}</Field>
                    <Field label="Date de paiement">{o.payout.paidAt ? formatDateTime(o.payout.paidAt) : '—'}</Field>
                  </>
                ) : (
                  <p className="text-sm text-muted">Aucun paiement vendeur enregistré pour cette commande.</p>
                )}
              </InfoBlock>

              {/* Livraison */}
              <InfoBlock icon="fas fa-truck-fast" title="Livraison">
                <Field label="Transporteur">{o.deliveryCarrier ?? '—'}</Field>
                <Field label="N° de suivi">{o.trackingNumber ?? '—'}</Field>
                {o.shipping ? (
                  <>
                    <Field label="Destinataire">{o.shipping.name ?? '—'}</Field>
                    <Field label="Téléphone">{o.shipping.phone ?? '—'}</Field>
                    <Field label="Ville">{o.shipping.city ?? '—'}</Field>
                    <Field label="Adresse">{o.shipping.address ?? '—'}</Field>
                  </>
                ) : null}
                {o.note ? <Field label="Note acheteur">{o.note}</Field> : null}
                {!o.deliveryCarrier && !o.trackingNumber ? (
                  <p className="mt-1 rounded-sm bg-white p-3 text-sm text-muted shadow-sm">
                    La livraison n’a pas encore été lancée.
                  </p>
                ) : null}
              </InfoBlock>
            </div>

            {/* Cycle de commande */}
            <Card className="mb-6">
              <h3 className="mb-4 text-lg font-bold text-ink">
                <i className="fas fa-truck-fast mr-2 text-terracotta-ink" aria-hidden="true" /> Cycle de commande
              </h3>
              <OrderTimeline events={o.events} />
            </Card>

          </>
        )
      })()}

      {/* Confirmation — paiement acheteur */}
      <ConfirmAction
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => confirmPayment.mutate()}
        title="Confirmer le paiement"
        confirmLabel="Confirmer le paiement"
        tone="positive"
        loading={confirmPayment.isPending}
        message="Confirmez-vous la réception du paiement de l’acheteur ?"
        consequences={[
          { icon: 'fa-box-open', text: 'La commande passe « À récupérer » auprès du vendeur.' },
          { icon: 'fa-bell', text: 'Le vendeur et l’acheteur sont notifiés.' },
        ]}
      >
        <div className="grid gap-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink" htmlFor="adm-method">
              Moyen de paiement
            </label>
            <select
              id="adm-method"
              className="field-input"
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink" htmlFor="adm-reference">
              Référence de transaction <span className="text-muted">(optionnel)</span>
            </label>
            <input
              id="adm-reference"
              type="text"
              className="field-input"
              placeholder="Ex : MTN-2026-1842"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>
        </div>
      </ConfirmAction>

      {/* Confirmation — article reçu (PRODUCT_WAITING → PRODUCT_RECEIVED) */}
      <ConfirmAction
        open={receivedOpen}
        onClose={() => setReceivedOpen(false)}
        onConfirm={() => markProductReceived.mutate()}
        title="Confirmer la réception de l’article"
        confirmLabel="Confirmer la réception"
        tone="positive"
        loading={markProductReceived.isPending}
        message="L’article a-t-il bien été confié à la plateforme ?"
        consequences={[
          { icon: 'fa-box', text: 'La commande passe « En préparation ».' },
          { icon: 'fa-bell', text: 'L’acheteur voit l’avancement de sa commande.' },
        ]}
      >
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink" htmlFor="adm-note">
            Note <span className="text-muted">(optionnel, visible par l’acheteur)</span>
          </label>
          <textarea
            id="adm-note"
            className="field-input min-h-24"
            placeholder="Ex : contrôle qualité effectué"
            value={receivedNote}
            onChange={(e) => setReceivedNote(e.target.value)}
          />
        </div>
      </ConfirmAction>

      {/* Confirmation — marquer comme prête (PREPARING → SHIPPED) */}
      <ConfirmAction
        open={shippedOpen}
        onClose={() => setShippedOpen(false)}
        onConfirm={() => markShipped.mutate()}
        title="Marquer comme prête"
        confirmLabel="Marquer comme prête"
        tone="primary"
        loading={markShipped.isPending}
        message="Confirmez-vous que le colis est prêt et emballé ?"
        consequences={[
          { icon: 'fa-paper-plane', text: 'Vous pourrez ensuite l’expédier au transporteur.' },
          { icon: 'fa-bell', text: 'L’acheteur est prévenu que sa commande est prête.' },
        ]}
      />

      {/* Confirmation — expédier (SHIPPED → IN_DELIVERY) */}
      <ConfirmAction
        open={deliveryOpen}
        onClose={() => setDeliveryOpen(false)}
        onConfirm={() => startDelivery.mutate()}
        title="Expédier la commande"
        confirmLabel="Expédier la commande"
        tone="primary"
        loading={startDelivery.isPending}
        message="Confirmez-vous la remise du colis au transporteur ?"
        consequences={[
          { icon: 'fa-truck-fast', text: 'La commande passe « En livraison ».' },
          { icon: 'fa-bell', text: 'Le suivi est visible par l’acheteur.' },
        ]}
      >
        <div className="grid gap-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink" htmlFor="adm-carrier">
              Transporteur <span className="text-muted">(optionnel)</span>
            </label>
            <input
              id="adm-carrier"
              type="text"
              className="field-input"
              placeholder="Ex : DHL, Chronopost…"
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink" htmlFor="adm-tracking">
              N° de suivi <span className="text-muted">(optionnel)</span>
            </label>
            <input
              id="adm-tracking"
              type="text"
              className="field-input"
              placeholder="Ex : 1ZXXXXXXXXX"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
            />
          </div>
        </div>
      </ConfirmAction>

      {/* Confirmation — livrée (IN_DELIVERY → DELIVERED → COMPLETED) */}
      <ConfirmAction
        open={deliveredOpen}
        onClose={() => setDeliveredOpen(false)}
        onConfirm={() => markDelivered.mutate()}
        title="Marquer comme livrée"
        confirmLabel="Marquer comme livrée"
        tone="positive"
        loading={markDelivered.isPending}
        message="Confirmez-vous que la commande a bien été remise au client ?"
        consequences={[
          { icon: 'fa-circle-check', text: 'La commande devient « Livrée » puis « Terminée ».' },
          { icon: 'fa-money-bill-wave', text: 'Le paiement vendeur passe « À payer ».' },
        ]}
      />

      {/* Confirmation — annulation */}
      <ConfirmAction
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => cancelOrder.mutate()}
        title="Annuler la commande"
        confirmLabel="Annuler définitivement"
        tone="danger"
        urgency="danger"
        loading={cancelOrder.isPending}
        confirmDisabled={!cancelNote.trim()}
        message="La commande sera annulée et l’article remis en vente. La raison est obligatoire et visible des deux parties."
        consequences={[
          { icon: 'fa-ban', text: 'Le cycle de la commande est interrompu.' },
          { icon: 'fa-rotate-left', text: 'L’article retourne dans le catalogue.' },
          { icon: 'fa-bell', text: 'L’acheteur et le vendeur sont notifiés.' },
        ]}
      >
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink" htmlFor="adm-cancel-note">
            Raison de l’annulation
          </label>
          <textarea
            id="adm-cancel-note"
            className="field-input min-h-24"
            placeholder="Ex : paiement non abouti"
            value={cancelNote}
            onChange={(e) => setCancelNote(e.target.value)}
          />
        </div>
      </ConfirmAction>

      {/* Confirmation — paiement vendeur (DUE → PAID) */}
      <ConfirmAction
        open={payoutOpen}
        onClose={() => setPayoutOpen(false)}
        onConfirm={() => sellerPayout.mutate()}
        title="Marquer le vendeur comme payé"
        confirmLabel="Marquer comme payé"
        tone="secondary"
        urgency="warning"
        loading={sellerPayout.isPending}
        message={
          <>
            Vous confirmez le paiement du vendeur pour{' '}
            <strong className="font-bold text-positive">
              {formatFcfa(order.data?.order.payout?.amount ?? order.data?.order.sellerAmount ?? 0)}
            </strong>
            .
          </>
        }
        consequences={[
          { icon: 'fa-circle-check', text: 'Le paiement vendeur passe « Payé ».' },
          { icon: 'fa-bell', text: 'Le vendeur reçoit une notification.' },
        ]}
      >
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink" htmlFor="adm-payout-ref">
            Référence du virement <span className="text-muted">(optionnel)</span>
          </label>
          <input
            id="adm-payout-ref"
            type="text"
            className="field-input"
            placeholder="Ex : VIRE-4421"
            value={payoutReference}
            onChange={(e) => setPayoutReference(e.target.value)}
          />
        </div>
      </ConfirmAction>
    </DashboardLayout>
  )
}
