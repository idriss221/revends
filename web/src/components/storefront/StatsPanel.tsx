import { useQuery } from '@tanstack/react-query'
import { Ico } from '../brand/Ico'
import { Notice } from '../ui/Notice'
import { StatusBadge } from '../ui/StatusBadge'
import { useToast } from '../../lib/toast'
import { ApiError } from '../../lib/apiClient'
import { storefrontApi, storefrontError, downloadReportPdf, formatFrShortDate, formatFrLongDate } from '../../lib/storefront'
import { formatFcfa, formatNumber } from '../../lib/format'
import { deltaPct, formatDeltaPct, formatMonthPeriod } from '../../lib/v8'
import type { StatsReportEntry } from '../../lib/storefront.types'

/* ============================================================================
   Onglet « Statistiques » — /mon-abonnement (contrat v2.8, R4, CA-V8-066/067).

   · 7 KPIs du dernier bilan (vues, ventes, CA brut, CA net, panier moyen,
     meilleur article, taux de conversion) + delta vs mois précédent ;
   · Historique ≤ 12 mois (tableau) — état d'envoi visible (« Réussite » /
     « Échec », 1.4.1 respecté par le libellé) ;
   · Téléchargement PDF du bilan (GET /api/subscriptions/me/report?period=) :
     ⚠️ route ABSENTE du contrat v2.8 aujourd'hui — dégradation propre ;
   · « Contrat d'abonnement » (bilatéral) : récapitulatif imprimable
     (client-side, navigateur → PDF) — fonctionne hors ligne, sans service.
   ========================================================================== */

const EMPTY = '—'

function formatRate(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) return EMPTY
  return `${(rate * 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`
}

function KpiTile({
  label,
  value,
  delta,
  sub,
}: {
  label: string
  value: string
  delta?: string | null
  sub?: string
}) {
  return (
    <div className="rv-kpi">
      <dt>{label}</dt>
      <dd>
        <span className="rv-kpi-value">{value}</span>
        {delta ? (
          <span className={`rv-kpi-delta${delta.startsWith('+') ? ' up' : delta.startsWith('−') ? ' down' : ''}`}>
            {delta}
          </span>
        ) : null}
      </dd>
      {sub ? <span className="rv-kpi-sub">{sub}</span> : null}
    </div>
  )
}

export interface StatsPanelProps {
  /** Visuel « contrat » : données vendeur connues de /mon-abonnement (absentes du payload stats). */
  slug: string
  planName: string
  priceFcfa: number
  activatedAt: string | null
  endsAt: string | null
}

export function StatsPanel({ slug, planName, priceFcfa, activatedAt, endsAt }: StatsPanelProps) {
  const toast = useToast()

  const stats = useQuery({
    queryKey: ['my-stats'],
    queryFn: () => storefrontApi.getMyStats(),
    // Bilan mensuel : cache « jour » (86 400 000 ms) — la donnée ne bouge qu'au 1er du mois ;
    // la fenêtre 30 jours est tolérée à la journée près (le 1er relevé rafraîchit via refetch on mount).
    staleTime: 86_400_000,
    retry: false,
  })

  const downloadPdf = async (period: string) => {
    try {
      await downloadReportPdf(period)
      toast('success', `Bilan de ${formatMonthPeriod(period)} téléchargé.`)
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        toast('error', 'Le téléchargement n’est pas encore disponible — le bilan vous est aussi envoyé par e-mail.')
        return
      }
      toast('error', storefrontError(err, 'Le bilan n’a pas pu être téléchargé.'))
    }
  }

  if (stats.isPending) {
    return (
      <section className="rv-shop-panel" aria-labelledby="stats-title" aria-busy="true">
        <span className="eyebrow">Statistiques</span>
        <h2 id="stats-title">Votre bilan, en clair</h2>
        <p className="rv-shop-sub">Chargement de vos statistiques…</p>
      </section>
    )
  }

  if (stats.isError) {
    return (
      <section className="rv-shop-panel" aria-labelledby="stats-title">
        <span className="eyebrow">Statistiques</span>
        <h2 id="stats-title">Votre bilan, en clair</h2>
        <Notice tone="danger">
          Impossible de charger vos statistiques.{' '}
          <button type="button" className="btn quiet sm" onClick={() => void stats.refetch()}>
            Réessayer
          </button>
        </Notice>
      </section>
    )
  }

  const data = stats.data
  const history = [...(data.history ?? [])].sort((a, b) => b.period.localeCompare(a.period)).slice(0, 12)
  const latest = data.latestReport ?? history[0] ?? null
  const previous: StatsReportEntry | null = latest ? (history.find((entry) => entry.period < latest.period) ?? null) : null

  const contractDate = endsAt ? formatFrLongDate(endsAt) : null

  return (
    <section className="rv-shop-panel rv-stats" aria-labelledby="stats-title">
      <div className="rv-shop-subhead">
        <div>
          <span className="eyebrow">Statistiques</span>
          <h2 id="stats-title">Votre bilan, en clair</h2>
        </div>
        {latest ? (
          <button type="button" className="btn ghost sm" onClick={() => void downloadPdf(latest.period)}>
            <Ico name="arrow-right" cls="sm rv-rotate-90" />
            Télécharger le PDF
          </button>
        ) : null}
      </div>

      {/* ── Dernier bilan (7 KPIs) ─────────────────────────────────── */}
      {latest ? (
        <>
          <div className="rv-stats-head">
            <h3 className="rv-stats-h3">Bilan de {formatMonthPeriod(latest.period)}</h3>
            <StatusBadge
              kind={latest.emailStatus === 'SENT' ? 'approved' : 'rejected'}
              label={latest.emailStatus === 'SENT' ? 'Réussite — envoi' : 'Échec — envoi'}
              dot
            />
            {latest.sentAt ? <span className="hint">Envoyé le {formatFrShortDate(latest.sentAt)}</span> : null}
          </div>

          <dl className="rv-kpi-grid">
            <KpiTile label="Vues" value={formatNumber(latest.views)} delta={formatDeltaPct(deltaPct(latest.views, previous?.views))} sub={latest.viewsLabel} />
            <KpiTile label="Ventes" value={formatNumber(latest.salesCount)} delta={formatDeltaPct(deltaPct(latest.salesCount, previous?.salesCount))} />
            <KpiTile label="CA brut" value={formatFcfa(latest.revenueFcfa)} delta={formatDeltaPct(deltaPct(latest.revenueFcfa, previous?.revenueFcfa))} />
            <KpiTile label="CA net" value={formatFcfa(latest.netRevenueFcfa)} delta={formatDeltaPct(deltaPct(latest.netRevenueFcfa, previous?.netRevenueFcfa))} sub="Commission déduite" />
            <KpiTile label="Panier moyen" value={latest.avgBasketFcfa === null ? EMPTY : formatFcfa(latest.avgBasketFcfa)} delta={formatDeltaPct(latest.avgBasketFcfa !== null && previous?.avgBasketFcfa ? deltaPct(latest.avgBasketFcfa, previous.avgBasketFcfa) : null)} />
            <KpiTile label="Meilleur article" value={latest.bestProduct?.name ?? EMPTY} sub={latest.bestProduct ? `${latest.bestProduct.sales} vente${latest.bestProduct.sales > 1 ? 's' : ''}` : undefined} />
            <KpiTile label="Taux de conversion" value={formatRate(latest.conversionRate)} sub="Ventes / vues" />
          </dl>
          {previous ? (
            <p className="hint">Comparé à {formatMonthPeriod(previous.period)} — les montants en FCFA sont des entiers.</p>
          ) : null}
        </>
      ) : (
        <Notice tone="info">
          Votre premier bilan sera envoyé le 1er du mois prochain — vues, ventes, CA, panier moyen et taux de conversion, en un coup d’œil.
        </Notice>
      )}

      {/* ── Fenêtre 30 jours (à la volée) ──────────────────────────── */}
      <p className="rv-stats-window" aria-label="Fenêtre des 30 derniers jours">
        <strong>Sur 30 jours</strong> — {formatNumber(data.current.salesCount)} vente{data.current.salesCount > 1 ? 's' : ''},{' '}
        {formatFcfa(data.current.netRevenueFcfa)} nets, {formatNumber(data.current.viewsTotal)} vues cumulées, conversion{' '}
        {formatRate(data.current.conversionRate)}.
      </p>

      {/* ── Historique 12 mois ─────────────────────────────────────── */}
      <h3 className="rv-stats-h3">Historique — 12 derniers mois</h3>
      {history.length === 0 ? (
        <p className="rv-shop-sub" style={{ marginBottom: 0 }}>
          Aucun bilan pour le moment — le premier sera calculé au 1er du mois prochain.
        </p>
      ) : (
        <div className="rv-stats-scroll">
          <table className="rv-stats-table">
            <caption className="sr-only">Historique des bilans mensuels — vues, ventes, CA net, panier moyen, taux de conversion et état d’envoi</caption>
            <thead>
              <tr>
                <th scope="col">Mois</th>
                <th scope="col" className="num">Vues</th>
                <th scope="col" className="num">Ventes</th>
                <th scope="col" className="num">CA net</th>
                <th scope="col" className="num">Panier moyen</th>
                <th scope="col" className="num">Taux</th>
                <th scope="col">État d’envoi</th>
                <th scope="col"><span className="sr-only">Télécharger</span></th>
              </tr>
            </thead>
            <tbody>
              {history.map((entry) => (
                <tr key={entry.period}>
                  <th scope="row">{formatMonthPeriod(entry.period)}</th>
                  <td className="num">{formatNumber(entry.views)}</td>
                  <td className="num">{formatNumber(entry.salesCount)}</td>
                  <td className="num">{formatFcfa(entry.netRevenueFcfa)}</td>
                  <td className="num">{entry.avgBasketFcfa === null ? EMPTY : formatFcfa(entry.avgBasketFcfa)}</td>
                  <td className="num">{formatRate(entry.conversionRate)}</td>
                  <td>
                    <StatusBadge
                      kind={entry.emailStatus === 'SENT' ? 'approved' : 'rejected'}
                      label={entry.emailStatus === 'SENT' ? 'Réussite' : 'Échec'}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn quiet sm"
                      onClick={() => void downloadPdf(entry.period)}
                      aria-label={`Télécharger le PDF du bilan de ${formatMonthPeriod(entry.period)}`}
                    >
                      <Ico name="arrow-right" cls="sm rv-rotate-90" />
                      PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Contrat d'abonnement (bilatéral) ─────────────────────────── */}
      <div className="rv-contract">
        <div className="rv-contract-text">
          <h3 className="rv-stats-h3">Votre contrat d’abonnement</h3>
          <p>
            Forfait <strong>{planName}</strong> — {formatFcfa(priceFcfa)} / mois. L’abonnement est un contrat
            bilatéral : vous réglez hors ligne (Wave, Orange Money ou virement), l’administration active la boutique
            après vérification.{endsAt ? ` Échéance le ${formatFrLongDate(endsAt)}.` : ''}
          </p>
        </div>
        <button type="button" className="btn ghost sm" onClick={() => window.print()}>
          <Ico name="arrow-right" cls="sm rv-rotate-90" />
          Télécharger le PDF
        </button>
      </div>

      {/* ── Feuille d'impression (contrat) — cachée à l'écran ─────────── */}
      <div className="rv-contract-print" aria-hidden="true">
        <h1>Contrat d’abonnement — ReVends</h1>
        <p>Boutique : /boutique/{slug}</p>
        <p>Forfait : {planName} — {formatFcfa(priceFcfa)} / mois</p>
        {activatedAt ? <p>Activé le : {formatFrLongDate(activatedAt)}</p> : null}
        {contractDate ? <p>Échéance : {contractDate}</p> : null}
        <p>
          Entre ReVends (plateforme de revente d’articles de seconde vie au Sénégal) et le vendeur abonné ci-dessus.
        </p>
        <ol>
          <li>Le paiement est externe (Wave, Orange Money ou virement bancaire) — aucun prélèvement automatique.</li>
          <li>L’activation est manuelle, après vérification du paiement par l’administration ReVends.</li>
          <li>L’abonnement court sur 30 jours glissants ; il n’est pas reconduit silencieusement.</li>
          <li>ReVends conserve 10 % de commission sur chaque vente réalisée via la plateforme.</li>
          <li>La boutique reste publique uniquement pendant l’abonnement ; les articles du catalogue ne sont jamais masqués.</li>
        </ol>
        <p>Fait à Dakar, le {new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}.</p>
      </div>
    </section>
  )
}
