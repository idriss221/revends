import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import type { ReactNode } from 'react'
import { api } from '../lib/api'
import { formatCountdown, formatDateTime, formatFcfa } from '../lib/format'
import { orderStatusBadge, PAYMENT_METHODS } from '../lib/constants'
import { useToast } from '../lib/toast'
import { friendlyError } from '../lib/errors'
import type { PaymentProof } from '../lib/types'
import { Crumb, SiteHead } from '../components/site/SiteBits'
import { StatusBadge } from '../components/ui/StatusBadge'
import { PageLoader } from '../components/ui/Loading'
import { ErrorMessage } from '../components/ui/ErrorMessage'
import { OrderTimeline } from '../components/ui/OrderTimeline'
import { Ico } from '../components/brand/Ico'

/**
 * Ligne dt/dd d'un bloc `.spec` — la maquette attend un SEUL `<dl class="spec">`
 * par fiche (motif de `ProductView`), avec les paires dt/dd en enfants directs.
 */
function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  )
}

/** Libellé/badge d'une preuve de paiement (une pièce, pas une validation). */
function proofStatus(proof: PaymentProof): { kind: 'pending' | 'approved' | 'rejected'; label: string } {
  if (proof.status === 'APPROVED') return { kind: 'approved', label: 'Acceptée' }
  if (proof.status === 'REJECTED') return { kind: 'rejected', label: 'Refusée' }
  return { kind: 'pending', label: 'En vérification' }
}

/** Détail d'une commande — vocabulaire Bureau. */
export function MyOrderDetailPage() {
  const { id = '' } = useParams()
  const qc = useQueryClient()
  const toast = useToast()
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [proofNote, setProofNote] = useState('')
  const order = useQuery({
    queryKey: ['my-order', id],
    queryFn: () => api.myOrderDetail(id),
  })

  const submitProof = useMutation({
    mutationFn: () => api.submitPaymentProof(Number(id), proofFile!, proofNote),
    onSuccess: () => {
      toast('success', 'Preuve envoyée. La commande reste en attente jusqu’à validation par notre équipe.')
      setProofFile(null)
      setProofNote('')
      qc.invalidateQueries({ queryKey: ['my-order', id] })
      qc.invalidateQueries({ queryKey: ['my-orders'] })
    },
    onError: (err) => {
      toast('error', friendlyError(err, 'Envoi de la preuve impossible.'))
    },
  })

  return (
    <div className="wrap">
      <Crumb items={[{ label: 'Mes commandes', to: '/mes-commandes' }, { label: 'Détail' }]} />
      <SiteHead level={1} title="Détail de la commande" />

      {order.isPending && <PageLoader label="Chargement de la commande…" />}

      {order.isError && <ErrorMessage error={order.error} showCode />}

      {order.isSuccess && (() => {
        const o = order.data.order
        const badge = orderStatusBadge(o.status)
        const methodLabel = PAYMENT_METHODS.find((m) => m.value === o.payment.method)?.label ?? o.payment.method
        return (
          <>
            <div className="box">
              <div className="head">
                <div>
                  <div className="eyebrow">{o.orderNumber}</div>
                  <h2>{o.orderNumber}</h2>
                </div>
                <div>
                  <StatusBadge kind={badge.kind} label={badge.label} />
                </div>
              </div>
              <div className="sum">
                <div className="r">
                  <div className="muted">{o.product.name}</div>
                  <div className="rv-price">{formatFcfa(o.amount)}</div>
                </div>
              </div>

              <div>
                <p className="ink">
                  {o.role === 'buyer' ? 'Acheté auprès de ' : 'Acheté par '}
                  <strong>{o.role === 'buyer' ? o.seller.displayName : o.buyer.displayName}</strong>
                </p>
                {o.reservedUntil && ['PAYMENT_PENDING'].includes(o.status) && (
                  <div className="note info">
                    <Ico name="clock" cls="sm" /> Délai de paiement restant : {formatCountdown(o.reservedUntil)}
                  </div>
                )}
              </div>

              <div className="two-col">
                <div className="box">
                  <h3>Informations</h3>
                  <dl className="spec">
                    <InfoRow label="Numéro" value={o.orderNumber} />
                    <InfoRow label="Date" value={formatDateTime(o.createdAt)} />
                    <InfoRow label="Prix article" value={formatFcfa(o.amount - o.commission)} />
                    <InfoRow label="Commission" value={formatFcfa(o.commission)} />
                    <InfoRow label="Total" value={formatFcfa(o.amount)} />
                  </dl>
                </div>
                <div className="box">
                  <h3>Paiement</h3>
                  <dl className="spec">
                    <InfoRow label="Moyen de paiement" value={methodLabel} />
                    <InfoRow
                      label="Statut"
                      value={<StatusBadge kind={o.payment.status === 'PAID' ? 'approved' : 'pending'} label={o.payment.status === 'PAID' ? 'Payé' : 'Non payé'} />}
                    />
                    {o.payment.reference && o.role === 'buyer' && <InfoRow label="Référence" value={o.payment.reference} />}
                    {o.payment.paidAt && <InfoRow label="Payé le" value={formatDateTime(o.payment.paidAt)} />}
                  </dl>
                </div>
              </div>

              {o.role === 'buyer' && (
                <div className="box">
                  <h3>Preuve de paiement</h3>
                  {(o.paymentProofs?.length ?? 0) === 0 && (
                    <p className="muted">
                      Aucune preuve envoyée. Tant que le paiement n’est pas validé par notre équipe,
                      la commande n’est pas confirmée et le vendeur n’est pas prévenu.
                    </p>
                  )}
                  {o.paymentProofs && o.paymentProofs.length > 0 && (
                    <ul className="proof-list">
                      {o.paymentProofs.map((proof) => {
                        const badge = proofStatus(proof)
                        return (
                          <li key={proof.id} className="proof-item">
                            <a href={proof.fileUrl} target="_blank" rel="noopener noreferrer">
                              <Ico name="camera" cls="sm" /> Voir la capture
                            </a>
                            <StatusBadge kind={badge.kind} label={badge.label} />
                            <span className="muted">{formatDateTime(proof.createdAt)}</span>
                            {proof.status === 'REJECTED' && proof.rejectionReason && (
                              <span className="err show">Motif : {proof.rejectionReason}</span>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  )}

                  {o.status === 'PAYMENT_PENDING' && o.payment.status !== 'PAID' && (
                    <form
                      className="form proof-upload"
                      onSubmit={(e) => {
                        e.preventDefault()
                        if (proofFile) submitProof.mutate()
                      }}
                    >
                      <div className="field">
                        <label htmlFor="proofFile">Capture du paiement (JPEG, PNG ou WebP)</label>
                        <input
                          className="inp"
                          id="proofFile"
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                          required
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="proofNote">Référence / note (optionnel)</label>
                        <input
                          className="inp"
                          id="proofNote"
                          type="text"
                          maxLength={500}
                          value={proofNote}
                          onChange={(e) => setProofNote(e.target.value)}
                          placeholder="Ex. transaction Orange Money 123456"
                        />
                      </div>
                      <button className="btn" type="submit" disabled={!proofFile || submitProof.isPending}>
                        <Ico name="camera" cls="sm" />{' '}
                        {submitProof.isPending ? 'Envoi…' : 'Envoyer la preuve de paiement'}
                      </button>
                    </form>
                  )}
                </div>
              )}

              {(o.deliveryCarrier || o.trackingNumber) && (
                <div className="box">
                  <h3>Livraison</h3>
                  <dl className="spec">
                    <InfoRow label="Transporteur" value={o.deliveryCarrier ?? '—'} />
                    <InfoRow label="N° de suivi" value={o.trackingNumber ?? '—'} />
                  </dl>
                </div>
              )}

              <div className="rv-foot">
                <Link to="/mes-commandes" className="link-arrow">
                  <Ico name="arrow-left" cls="sm" /> Retour à mes commandes
                </Link>
                <Link to={`/commandes/${o.id}/suivi`} className="btn">
                  <Ico name="truck" cls="sm" /> Suivre mon colis
                </Link>
              </div>
            </div>

            <div className="box">
              <div className="head">
                <h3><Ico name="truck" cls="sm" /> Suivi de commande</h3>
              </div>
              <OrderTimeline events={o.events} />
            </div>
          </>
        )
      })()}
    </div>
  )
}
