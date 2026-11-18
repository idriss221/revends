import { pool, type Queryable } from '../db/pool.js';
import { withTransaction } from '../utils/db.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { notFound } from '../utils/errors.js';
import { renderBilanPdf } from '../utils/bilan-pdf.js';
import {
  selectReportHistory,
  selectReportRow,
  selectViewSnapshot,
  setReportEmailStatus,
  upsertMonthlyReport,
  upsertViewSnapshot,
  upsertViewsSum,
} from '../repositories/monthly-metrics.repository.js';
import { sendAntiDuplicateMail, sendSubscriptionExpiryReminderMail } from './subscription-notifications.service.js';
import { materializeExpiredSubscriptions } from './storefront.service.js';

// ---------------------------------------------------------------------------
// V8-D7 / PO-V8-04 retenu — Bilan mensuel : module partagé unique (P12).
// Même calcul pour l'e-mail, le PDF, la page Stats et le 1er (aucun calcul
// divergent, CA-V8-061/067). AUCUNE écriture sur products/orders/order_events
// (P5, CA-V8-082/083) ; seul monthly_metrics est écrit.
// ---------------------------------------------------------------------------

const MONTHS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
] as const;

export function toPeriodUTC(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function periodLabelFr(period: string): string {
  const [y, m] = period.split('-');
  const month = MONTHS_FR[Number(m) - 1];
  return `${month ?? m} ${y}`;
}

export interface ReportMetrics {
  views: number;
  viewsLabel: 'vues du mois' | 'vues cumulées (1er relevé)';
  salesCount: number;
  caBrut: number;
  commissionFcfa: number;
  caNet: number;
  avgBasketFcfa: number | null;
  bestProduct: { id: number; name: string; sales: number } | null;
  conversionRate: number | null;
}

interface SubscriptionRef {
  id: number;
  seller_id: number;
  slug: string;
  plan_name: string;
}

async function selectActiveReportCandidates(q: Queryable, bound: Date): Promise<SubscriptionRef[]> {
  const { rows } = await q.query<SubscriptionRef>(
    `SELECT s.id, s.seller_id, s.slug, pl.name AS plan_name
       FROM seller_subscriptions s
       JOIN subscription_plans pl ON pl.id = s.plan_id
      WHERE s.status = 'ACTIVE' AND s.ends_at > $1`,
    [bound],
  );
  return rows;
}

/** Σ view_count des produits du vendeur (non supprimés) — base des 2 relevés. */
async function sumSellerViews(q: Queryable, sellerId: number): Promise<number> {
  const { rows } = await q.query<{ total: string }>(
    'SELECT COALESCE(SUM(p.view_count), 0)::int AS total FROM products p WHERE p.owner_id = $1 AND p.deleted_at IS NULL',
    [sellerId],
  );
  return Number(rows[0]?.total ?? 0);
}

/**
 * Calcul UNIQUE des métriques d'un bilan (P12). Appelé dans la transaction
 * du job et (pour les lectures Stats) en lecture seule.
 */
export async function computeMonthlyMetrics(
  subscriptionId: number,
  period: string,
  client: Queryable = pool,
): Promise<ReportMetrics> {
  const subRow = await client.query<{ seller_id: number }>(
    'SELECT seller_id FROM seller_subscriptions WHERE id = $1',
    [subscriptionId],
  );
  const sellerId = subRow.rows[0]?.seller_id;
  if (sellerId === undefined) throw notFound('NOT_FOUND', 'Abonnement introuvable');

  const [y, m] = period.split('-').map(Number);
  const periodStart = new Date(Date.UTC(y!, m! - 1, 1));
  const periodEnd = new Date(Date.UTC(y!, m!, 1)); // exclu

  const snap = await selectViewSnapshot(client, subscriptionId, period);
  const viewsNow = await sumSellerViews(client, sellerId);
  let views: number;
  let viewsLabel: ReportMetrics['viewsLabel'];
  if (snap && snap.viewsSum > 0) {
    // Relevés présents aux deux bornes (1er + dernier jour) : delta réel.
    views = Math.max(0, snap.viewsSum - snap.viewsBaseline);
    viewsLabel = 'vues du mois';
  } else if (snap && snap.viewsBaseline > 0) {
    // Baseline posée mais dernier relevé absent (mois courant, e.g. bilan en cours) : delta live.
    views = Math.max(0, viewsNow - snap.viewsBaseline);
    viewsLabel = 'vues du mois';
  } else {
    // Aucune baseline du mois : premier relevé connu — vues cumulées.
    views = viewsNow;
    viewsLabel = 'vues cumulées (1er relevé)';
  }

  const salesRes = await client.query<{
    sales: string;
    brut: string;
    commission: string;
    net: string;
  }>(
    `SELECT COUNT(DISTINCT o.id)::int AS sales,
            COALESCE(SUM(o.amount), 0)::bigint AS brut,
            COALESCE(SUM(o.commission), 0)::bigint AS commission,
            COALESCE(SUM(o.seller_amount), 0)::bigint AS net
       FROM orders o
       JOIN order_events e ON e.order_id = o.id AND e.to_status = 'PAID'
      WHERE o.seller_id = $1 AND e.created_at >= $2 AND e.created_at < $3`,
    [sellerId, periodStart, periodEnd],
  );
  const salesRow = salesRes.rows[0]!;
  const salesCount = Number(salesRow.sales);
  const caBrut = Number(salesRow.brut);
  const commissionFcfa = Number(salesRow.commission);
  const caNet = Number(salesRow.net);
  const avgBasketFcfa = salesCount > 0 ? Math.floor(caBrut / salesCount) : null;
  const conversionRate = views > 0 ? salesCount / views : null;

  const bestRes = await client.query<{ id: number; name: string; sales: string }>(
    `SELECT p.id, p.name, COUNT(DISTINCT o.id)::int AS sales
       FROM orders o
       JOIN order_events e ON e.order_id = o.id AND e.to_status = 'PAID'
       JOIN products p ON p.id = o.product_id
      WHERE o.seller_id = $1 AND e.created_at >= $2 AND e.created_at < $3 AND p.deleted_at IS NULL
      GROUP BY p.id, p.name
      ORDER BY sales DESC, MAX(p.view_count) DESC, p.id ASC
      LIMIT 1`,
    [sellerId, periodStart, periodEnd],
  );
  const best = bestRes.rows[0];

  return {
    views,
    viewsLabel,
    salesCount,
    caBrut,
    commissionFcfa,
    caNet,
    avgBasketFcfa,
    bestProduct: best ? { id: Number(best.id), name: best.name, sales: Number(best.sales) } : null,
    conversionRate,
  };
}

/** Relevé d'un mois : baseline (1er) ou sum (dernier jour) — upsert idempotent. */
export async function runViewSnapshot(now: Date, periodOverride?: string, kind: 'baseline' | 'sum' = 'baseline'): Promise<{ processed: number }> {
  const period = periodOverride ?? toPeriodUTC(now);
  return withTransaction(async (client) => {
    await materializeExpiredSubscriptions(client, { });
    const candidates = await selectActiveReportCandidates(client, now);
    let processed = 0;
    for (const candidate of candidates) {
      const viewsNow = await sumSellerViews(client, candidate.seller_id);
      if (kind === 'baseline') await upsertViewSnapshot(client, candidate.id, period, viewsNow);
      else await upsertViewsSum(client, candidate.id, period, viewsNow);
      processed += 1;
    }
    return { processed };
  });
}

/** Bilan du 1er de M+1 : calcul + upsert idempotent + e-mail/PDF. P8 partout. */
export async function runMonthlyReport(
  now: Date,
  periodOverride?: string,
): Promise<{ processed: number; sent: number; failed: number; skipped: number }> {
  const period = periodOverride ?? previousPeriod(toPeriodUTC(now));
  const periodLabel = periodLabelFr(period);

  const summary = { processed: 0, sent: 0, failed: 0, skipped: 0 };
  // Candidats résolus hors transaction longue : le verrouillage se fait ligne
  // par ligne à l'intérieur de chaque bilan.
  await materializeExpiredSubscriptions(pool, {});
  const candidates = await selectActiveReportCandidates(pool, now);

  for (const candidate of candidates) {
    summary.processed += 1;
    try {
      const outcome = await withTransaction(async (client) => {
        const existing = await selectReportRow(client, candidate.id, period);
        if (existing && existing.email_status !== null) return 'skipped' as const;

        const metrics = await computeMonthlyMetrics(candidate.id, period, client);
        // Bilan : la ligne montée persistée garde les relevés brut ; vues brutes
        // = dernier relevé connu (ou cumul live si le dernier relevé manque).
        const viewSnapshot = await selectViewSnapshot(client, candidate.id, period);
        const rawViews = viewSnapshot && viewSnapshot.viewsSum > 0 ? viewSnapshot.viewsSum : await sumSellerViews(client, candidate.seller_id);
        const viewsBaseline = viewSnapshot?.viewsBaseline ?? 0;
        const affected = await upsertMonthlyReport(client, {
          subscriptionId: candidate.id,
          period,
          viewsSum: rawViews,
          salesCount: metrics.salesCount,
          caFcfa: metrics.caBrut,
          viewsBaseline,
        });
        if (affected === 0) return 'skipped' as const; // un bilan concurrent a gagné la course
        return { metrics, viewsBaseline } as const;
      });

      if (outcome === 'skipped') {
        summary.skipped += 1;
        continue;
      }
      const { metrics } = outcome;

      const pdf = await renderBilanPdf({
        boutique: candidate.slug,
        period: periodLabel,
        periodIso: period,
        generatedAt: now,
        views: metrics.views,
        viewsLabel: metrics.viewsLabel,
        salesCount: metrics.salesCount,
        revenueFcfa: metrics.caBrut,
        netRevenueFcfa: metrics.caNet,
        commissionFcfa: metrics.commissionFcfa,
        avgBasketFcfa: metrics.avgBasketFcfa,
        bestProductName: metrics.bestProduct?.name ?? null,
        bestProductSales: metrics.bestProduct?.sales ?? null,
        conversionRate: metrics.conversionRate,
      });

      const delivery = await sendAntiDuplicateMail({
        userId: candidate.seller_id,
        idempotencyKey: `storefront-monthly-report:${candidate.seller_id}:${period}`,
        event: 'storefront_monthly_report',
        vars: {
          boutiqueName: candidate.slug,
          period: periodLabel,
          viewsCount: metrics.views,
          viewsLabel: metrics.viewsLabel,
          salesCount: metrics.salesCount,
          revenueFcfa: metrics.caBrut,
          netRevenueFcfa: metrics.caNet,
          commissionFcfa: metrics.commissionFcfa,
          avgBasketFcfa: metrics.avgBasketFcfa,
          bestProductName: metrics.bestProduct?.name,
          bestProductSales: metrics.bestProduct?.sales ?? null,
          conversionRate: metrics.conversionRate,
          linkPath: '/mon-abonnement',
        },
        attachments: [
          {
            filename: `bilan-${candidate.slug}-${period}.pdf`,
            content: pdf,
            contentType: 'application/pdf',
          },
        ],
      });

      // Doublon = exécution précédente interrompue avant l'envoi (fiche FAILED
      // ou PENDING orpheline dans notification_deliveries) : on NE marque PAS
      // SENT, et on trace, pour que K9/recette sachent que le bilan n'a pas
      // été reçu. L'utilisateur ne reçoit rien — le renvoi manuel est V9.
      const status = delivery === 'sent' ? 'SENT' : 'FAILED';
      if (delivery === 'duplicate') {
        logger.error('bilan mensuel : envoi ignoré — doublon (delivery orpheline)', {
          eventKey: `storefront-monthly-report:${candidate.id}:${period}`,
          subscriptionId: candidate.id, period,
        });
      }
      await setReportEmailStatus(pool, candidate.id, period, status);
      if (status === 'SENT') summary.sent += 1;
      else summary.failed += 1;
    } catch (err) {
      // P8 — le bilan ne fait jamais échouer le job ni (à la rigueur) une autre boutique.
      logger.error('bilan mensuel : échec pour une boutique', {
        subscriptionId: candidate.id,
        period,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      summary.failed += 1;
      await setReportEmailStatus(pool, candidate.id, period, 'FAILED').catch(() => {});
    }
  }
  return summary;
}

/** Rappel J-3 : abonnements ACTIVE expirant sous 3 jours. Idempotent (mois). */
export async function runExpiryReminders(now: Date): Promise<{ sent: number; duplicates: number }> {
  const horizon = new Date(now.getTime() + 3 * 86_400_000);
  const { rows } = await pool.query<{ id: number; seller_id: number; plan_name: string }>(
    `SELECT s.id, s.seller_id, pl.name AS plan_name
       FROM seller_subscriptions s
       JOIN subscription_plans pl ON pl.id = s.plan_id
      WHERE s.status = 'ACTIVE' AND s.ends_at > $1 AND s.ends_at <= $2`,
    [now, horizon],
  );
  const period = toPeriodUTC(now);
  let sent = 0;
  let duplicates = 0;
  for (const row of rows) {
    const outcome = await sendSubscriptionExpiryReminderMail(row.seller_id, row.plan_name, period);
    if (outcome === 'duplicate') duplicates += 1;
    else if (outcome === 'sent') sent += 1;
  }
  return { sent, duplicates };
}

export type CronDispatch =
  | { mode: 'report'; report: { processed: number; sent: number; failed: number; skipped: number }; reminders: { sent: number; duplicates: number } }
  | { mode: 'snapshot'; snapshot: { processed: number }; reminders: { sent: number; duplicates: number } }
  | { mode: 'noop'; reminders: { sent: number; duplicates: number } };

/**
 * Dispatch quotidien (cron 06:00 UTC) :
 *  - 1er du mois  → bilan du mois écoulé ;
 *  - dernier jour → relevé des vues (dernier jour de M, avant le bilan) ;
 *  - sinon        → noop ;
 *  - dans TOUS les cas → rappel J-3 (best-effort, idempotent).
 */
export async function runMonthlyReportIfDue(now: Date = new Date()): Promise<CronDispatch> {
  const reminders = await runExpiryReminders(now).catch((err: unknown) => {
    logger.error("rappel d'expiration impossible", { errorMessage: err instanceof Error ? err.message : String(err) });
    return { sent: 0, duplicates: 0 };
  });

  const tomorrow = new Date(now.getTime() + 86_400_000);
  const isFirstOfMonth = now.getUTCDate() === 1;
  const isLastDayOfMonth = tomorrow.getUTCDate() === 1;

  if (isFirstOfMonth) {
    const report = await runMonthlyReport(now);
    // Au premier du mois M : on pose aussi le relevé de BASE pour M (delta au bilan suivant).
    const snapshot = await runViewSnapshot(now, undefined, 'baseline');
    return { mode: 'report', report, reminders };
  }
  if (isLastDayOfMonth) {
    // Au dernier jour 06:00 de M : on pose le relevé final (views_sum) pour M.
    const snapshot = await runViewSnapshot(now, undefined, 'sum');
    return { mode: 'snapshot', snapshot, reminders };
  }
  return { mode: 'noop', reminders };
}

function previousPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(Date.UTC(y!, m! - 1, 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  return toPeriodUTC(d);
}

// ---------------------------------------------------------------------------
// GET /api/subscriptions/me/stats — vue vendeur (V8-D7).
// P12 : même module partagé pour les métriques ; vues/ca_fcfa persistés
// (immuables), net/commission/panier/best/conversion recalculés à la lecture.
// ---------------------------------------------------------------------------

export interface StatsSubscriptionBlock {
  id: number | null;
  status: string | null;
  plan: { name: string; quota: number } | null;
  endsAt: string | null;
  daysRemaining: number;
}

export interface StatsReportEntry {
  period: string;
  views: number;
  viewsLabel: 'vues du mois' | 'vues cumulées (1er relevé)';
  salesCount: number;
  revenueFcfa: number;
  netRevenueFcfa: number;
  commissionFcfa: number;
  avgBasketFcfa: number | null;
  bestProduct: { id: number; name: string; sales: number } | null;
  conversionRate: number | null;
  emailStatus: 'SENT' | 'FAILED';
  sentAt: string | null;
}

// ---------------------------------------------------------------------------
// GET /api/subscriptions/me/report?period=YYYY-MM — PDF du bilan persisté (V8).
// requireAuth « me » exclusivement (propriétaire — un admin appelle pour SON
// abonnement, aucun paramètre userId). 404 REPORT_NOT_AVAILABLE si aucune
// ligne monthly_metrics pour (subscription_id, period). P12 : mêmes données
// persistées que le cron + dérivés recalculés à la lecture (comme /me/stats).
// ---------------------------------------------------------------------------

export async function getMyReportPdf(sellerId: number, period: string): Promise<Buffer> {
  await materializeExpiredSubscriptions(pool, { sellerId });

  // Abonnement « courant » : ACTIVE en priorité, sinon le plus récent (idem /me/stats).
  const subRes = await pool.query<{ id: number; slug: string }>(
    `SELECT s.id, s.slug
       FROM seller_subscriptions s
      WHERE s.seller_id = $1
      ORDER BY (s.status = 'ACTIVE') DESC, s.created_at DESC, s.id DESC
      LIMIT 1`,
    [sellerId],
  );
  const sub = subRes.rows[0];
  if (!sub) {
    throw notFound('REPORT_NOT_AVAILABLE', 'Aucun bilan disponible pour cette période');
  }

  const row = await selectReportRow(pool, sub.id, period);
  if (!row) {
    throw notFound('REPORT_NOT_AVAILABLE', 'Aucun bilan disponible pour cette période');
  }

  const caBrut = Number(row.ca_fcfa);
  const salesCount = Number(row.sales_count);
  const views = Number(row.views_sum);

  const [y, m] = period.split('-').map(Number);
  const periodStart = new Date(Date.UTC(y!, m! - 1, 1));
  const periodEnd = new Date(Date.UTC(y!, m!, 1)); // exclu

  // Commission/brut recalculés depuis les commandes PAID de la période (immuables, P12) ;
  // repli sur 10 % du CA brut si la période n'a aucune vente persistée (idem /me/stats).
  const commissionRes = await pool.query<{ period: string; commission: string }>(
    `SELECT to_char(e.created_at, 'YYYY-MM') AS period,
            COALESCE(SUM(o.commission), 0)::bigint AS commission
       FROM orders o
       JOIN order_events e ON e.order_id = o.id AND e.to_status = 'PAID'
      WHERE o.seller_id = $1 AND e.created_at >= $2 AND e.created_at < $3
      GROUP BY 1`,
    [sellerId, periodStart, periodEnd],
  );
  const persisted = commissionRes.rows[0];
  const commissionFcfa = persisted ? Number(persisted.commission) : Math.floor(caBrut * config.commissionRate);
  const netRevenueFcfa = caBrut - commissionFcfa;
  const avgBasketFcfa = salesCount > 0 ? Math.floor(caBrut / salesCount) : null;
  const conversionRate = views > 0 ? salesCount / views : null;

  const bestRes = await pool.query<{ id: number; name: string; sales: string }>(
    `SELECT p.id, p.name, COUNT(DISTINCT o.id)::int AS sales
       FROM orders o
       JOIN order_events e ON e.order_id = o.id AND e.to_status = 'PAID'
       JOIN products p ON p.id = o.product_id
      WHERE o.seller_id = $1 AND e.created_at >= $2 AND e.created_at < $3 AND p.deleted_at IS NULL
      GROUP BY p.id, p.name
      ORDER BY sales DESC, MAX(p.view_count) DESC, p.id ASC
      LIMIT 1`,
    [sellerId, periodStart, periodEnd],
  );
  const best = bestRes.rows[0];

  // Libellé « 1er relevé » : même heuristique que /me/stats (P12).
  const historyRows = await selectReportHistory(sub.id, 12, pool);
  const sortedAsc = [...historyRows].sort((a, b) => a.period.localeCompare(b.period));
  const firstPeriod = sortedAsc[0]?.period ?? null;
  const viewsLabel: ReportMetrics['viewsLabel'] =
    row.period === firstPeriod && sortedAsc.length === 1 ? 'vues cumulées (1er relevé)' : 'vues du mois';

  return renderBilanPdf({
    boutique: sub.slug,
    period: periodLabelFr(period),
    periodIso: period,
    generatedAt: new Date(),
    views,
    viewsLabel,
    salesCount,
    revenueFcfa: caBrut,
    netRevenueFcfa,
    commissionFcfa,
    avgBasketFcfa,
    bestProductName: best?.name ?? null,
    bestProductSales: best ? Number(best.sales) : null,
    conversionRate,
  });
}

export async function getMyStats(sellerId: number): Promise<Record<string, unknown>> {
  await materializeExpiredSubscriptions(pool, { sellerId });

  const subRes = await pool.query<{
    id: number;
    status: string;
    ends_at: Date | string | null;
    plan_name: string;
    quota: number;
  }>(
    `SELECT s.id, s.status, s.ends_at, pl.name AS plan_name, pl.quota
       FROM seller_subscriptions s
       JOIN subscription_plans pl ON pl.id = s.plan_id
      WHERE s.seller_id = $1
      ORDER BY (s.status = 'ACTIVE') DESC, s.created_at DESC, s.id DESC
      LIMIT 1`,
    [sellerId],
  );
  const sub = subRes.rows[0];

  const subscription: StatsSubscriptionBlock | null = sub
    ? {
        id: sub.id,
        status: sub.status,
        plan: { name: sub.plan_name, quota: Number(sub.quota) },
        endsAt: sub.ends_at ? new Date(sub.ends_at).toISOString() : null,
        daysRemaining:
          sub.status === 'ACTIVE' && sub.ends_at
            ? Math.max(0, Math.ceil((new Date(sub.ends_at).getTime() - Date.now()) / 86_400_000))
            : 0,
      }
    : null;

  // ---------- Plage 30 jours (calcul à la volée) ----------
  const viewsCumulatedRes = await pool.query<{ total: string }>(
    'SELECT COALESCE(SUM(p.view_count), 0)::int AS total FROM products p WHERE p.owner_id = $1 AND p.deleted_at IS NULL',
    [sellerId],
  );
  const viewsCumulated = Number(viewsCumulatedRes.rows[0]?.total ?? 0);

  const since30 = new Date(Date.now() - 30 * 86_400_000);
  const currentRes = await pool.query<{
    sales: string;
    brut: string;
    commission: string;
    net: string;
  }>(
    `SELECT COUNT(DISTINCT o.id)::int AS sales,
            COALESCE(SUM(o.amount), 0)::bigint AS brut,
            COALESCE(SUM(o.commission), 0)::bigint AS commission,
            COALESCE(SUM(o.seller_amount), 0)::bigint AS net
       FROM orders o
       JOIN order_events e ON e.order_id = o.id AND e.to_status = 'PAID'
      WHERE o.seller_id = $1 AND e.created_at >= $2`,
    [sellerId, since30],
  );
  const c30 = currentRes.rows[0]!;
  const sales30 = Number(c30.sales);
  const brut30 = Number(c30.brut);
  const commission30 = Number(c30.commission);
  const net30 = Number(c30.net);

  const best30Res = await pool.query<{ id: number; name: string; sales: string }>(
    `SELECT p.id, p.name, COUNT(DISTINCT o.id)::int AS sales
       FROM orders o
       JOIN order_events e ON e.order_id = o.id AND e.to_status = 'PAID'
       JOIN products p ON p.id = o.product_id
      WHERE o.seller_id = $1 AND e.created_at >= $2 AND p.deleted_at IS NULL
      GROUP BY p.id, p.name
      ORDER BY sales DESC, MAX(p.view_count) DESC, p.id ASC
      LIMIT 1`,
    [sellerId, since30],
  );
  const best30 = best30Res.rows[0];

  const current = {
    windowDays: 30,
    viewsCumulated,
    salesCount: sales30,
    revenueFcfa: brut30,
    netRevenueFcfa: net30,
    commissionFcfa: commission30,
    avgBasketFcfa: sales30 > 0 ? Math.floor(brut30 / sales30) : null,
    bestProduct: best30
      ? { id: Number(best30.id), name: best30.name, sales: Number(best30.sales) }
      : null,
    // Numérateur 30 j / dénominateur cumulées — libellé affiche « vues cumulées ».
    conversionRateAllTime: viewsCumulated > 0 ? sales30 / viewsCumulated : null,
  };

  // ---------- Historique 12 mois (persisté + recomputé à la lecture) ----------
  const historyRows = sub ? await selectReportHistory(sub.id, 12, pool) : [];
  // Fenêtre exacte : depuis le 1er du mois le plus ancien de l'historique.
  const oldestPeriod = historyRows.length > 0
    ? historyRows.map((r) => r.period).sort()[0]!
    : toPeriodUTC(new Date());
  const [oldestY, oldestM] = oldestPeriod.split('-').map(Number);
  const history12Start = new Date(Date.UTC(oldestY!, oldestM! - 1, 1));

  const commissionsRes = await pool.query<{
    period: string;
    commission: string;
    brut: string;
    sales: string;
  }>(
    `SELECT to_char(e.created_at, 'YYYY-MM') AS period,
            COUNT(DISTINCT o.id)::int AS sales,
            COALESCE(SUM(o.amount), 0)::bigint AS brut,
            COALESCE(SUM(o.commission), 0)::bigint AS commission
       FROM orders o
       JOIN order_events e ON e.order_id = o.id AND e.to_status = 'PAID'
      WHERE o.seller_id = $1 AND e.created_at >= $2
      GROUP BY 1`,
    [sellerId, history12Start],
  );
  const commissionByPeriod = new Map(
    commissionsRes.rows.map((r) => [r.period, { sales: Number(r.sales), brut: Number(r.brut), commission: Number(r.commission) }]),
  );

  const bestRes = await pool.query<{ period: string; id: number; name: string; sales: string }>(
    `SELECT to_char(e.created_at, 'YYYY-MM') AS period, p.id, p.name, COUNT(DISTINCT o.id)::int AS sales
       FROM orders o
       JOIN order_events e ON e.order_id = o.id AND e.to_status = 'PAID'
       JOIN products p ON p.id = o.product_id
      WHERE o.seller_id = $1 AND e.created_at >= $2
      GROUP BY 1, p.id, p.name
      ORDER BY 1 DESC, sales DESC, MAX(p.view_count) DESC, p.id ASC`,
    [sellerId, history12Start],
  );
  const bestByPeriod = new Map<string, { id: number; name: string; sales: number }>();
  for (const row of bestRes.rows) {
    if (!bestByPeriod.has(row.period)) {
      bestByPeriod.set(row.period, { id: Number(row.id), name: row.name, sales: Number(row.sales) });
    }
  }

  // Libellé « 1er relevé » : la ligne portant le cumul n'existe que pour le tout 1er bilan d'une boutique.
  const sortedAsc = [...historyRows].sort((a, b) => a.period.localeCompare(b.period));
  const firstPeriod = sortedAsc[0]?.period ?? null;

  const history: StatsReportEntry[] = historyRows.map((row) => {
    const caBrut = Number(row.ca_fcfa);
    const persisted = commissionByPeriod.get(row.period);
    // commission/brut/sales recalculés (immuables) ; commission dérivée de ca brut − net si disponible.
    const commissionFcfa = persisted ? Number(persisted.commission) : Math.floor(caBrut * config.commissionRate);
    const netRevenueFcfa = caBrut - commissionFcfa;
    const views = row.views_sum;
    const salesCount = row.sales_count;
    const isFirst = row.period === firstPeriod && sortedAsc.length === 1;
    return {
      period: row.period,
      views,
      viewsLabel: isFirst ? 'vues cumulées (1er relevé)' : 'vues du mois',
      salesCount,
      revenueFcfa: caBrut,
      netRevenueFcfa,
      commissionFcfa,
      avgBasketFcfa: salesCount > 0 ? Math.floor(caBrut / salesCount) : null,
      bestProduct: bestByPeriod.get(row.period) ?? null,
      conversionRate: views > 0 ? salesCount / views : null,
      emailStatus: row.email_status as 'SENT' | 'FAILED',
      sentAt: row.sent_at ? new Date(row.sent_at).toISOString() : null,
    };
  });

  const latestReport = history[0] ?? null;
  const isFirstReport = history.length === 1;

  return { subscription, current, latestReport, history, isFirstReport };
}
