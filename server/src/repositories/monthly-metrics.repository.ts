import { pool, type Queryable } from '../db/pool.js';

// ---------------------------------------------------------------------------
// V8-D7 / PO-V8-04 retenu — monthly_metrics (relevés de vues + bilan du 1er).
// 1 ligne par (subscription_id, period) ; idempotence par
//   (PK subscription_id, period) + garde `email_status IS NULL`.
// ---------------------------------------------------------------------------

export interface MonthlyMetricsRow {
  subscription_id: number;
  period: string;
  views_sum: number;
  sales_count: number;
  ca_fcfa: number | string;
  views_baseline: number;
  email_status: 'SENT' | 'FAILED' | null;
  sent_at: Date | string | null;
  computed_at: Date | string;
}

/** Relevé du dernier jour : pose/rafraîchit `views_baseline` (delta au bilan). */
export async function upsertViewSnapshot(
  client: Queryable,
  subscriptionId: number,
  period: string,
  viewsBaseline: number,
): Promise<void> {
  await client.query(
    `INSERT INTO monthly_metrics (subscription_id, period, views_baseline, views_sum, sales_count, ca_fcfa, computed_at)
     VALUES ($1, $2, $3, 0, 0, 0, now())
     ON CONFLICT (subscription_id, period) DO UPDATE
        SET views_baseline = EXCLUDED.views_baseline, computed_at = now()
      WHERE monthly_metrics.email_status IS NULL`,
    [subscriptionId, period, viewsBaseline],
  );
}

/**
 * Upsert du bilan (1er) : ne touche la ligne QUE si `email_status IS NULL`.
 * Retourne le nombre de lignes affectées — 0 ⇒ un bilan concurrent a gagné la course.
 */
export async function upsertMonthlyReport(
  client: Queryable,
  row: {
    subscriptionId: number;
    period: string;
    viewsSum: number;
    salesCount: number;
    caFcfa: number;
    viewsBaseline: number;
  },
): Promise<number> {
  const { rowCount } = await client.query(
    `INSERT INTO monthly_metrics
       (subscription_id, period, views_sum, sales_count, ca_fcfa, views_baseline, computed_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (subscription_id, period) DO UPDATE
        SET views_sum = EXCLUDED.views_sum,
            sales_count = EXCLUDED.sales_count,
            ca_fcfa = EXCLUDED.ca_fcfa,
            computed_at = now()
      WHERE monthly_metrics.email_status IS NULL`,
    [row.subscriptionId, row.period, row.viewsSum, row.salesCount, row.caFcfa, row.viewsBaseline],
  );
  return rowCount ?? 0;
}

/** Pose le statut d'envoi du bilan (SENT terminal — PO-V8-08). */
export async function setReportEmailStatus(
  client: Queryable,
  subscriptionId: number,
  period: string,
  status: 'SENT' | 'FAILED',
): Promise<void> {
  await client.query(
    `UPDATE monthly_metrics
        SET email_status = $3, sent_at = now()
      WHERE subscription_id = $1 AND period = $2 AND email_status IS NULL`,
    [subscriptionId, period, status],
  );
}

/** Ligne de bilan existante (pour la garde d'idempotence du job). */
export async function selectReportRow(
  q: Queryable,
  subscriptionId: number,
  period: string,
): Promise<MonthlyMetricsRow | null> {
  const { rows } = await q.query<MonthlyMetricsRow>(
    'SELECT * FROM monthly_metrics WHERE subscription_id = $1 AND period = $2',
    [subscriptionId, period],
  );
  return rows[0] ?? null;
}

/** Relevé (baseline) d'un mois donné — NULL si absent. */
export async function selectViewBaseline(
  q: Queryable,
  subscriptionId: number,
  period: string,
): Promise<{ viewsBaseline: number; viewsSum: number } | null> {
  const { rows } = await q.query<{ views_baseline: number; views_sum: number }>(
    'SELECT views_baseline, views_sum FROM monthly_metrics WHERE subscription_id = $1 AND period = $2',
    [subscriptionId, period],
  );
  const row = rows[0];
  return row ? { viewsBaseline: row.views_baseline, viewsSum: row.views_sum } : null;
}

/** Historique des bilans (email_status NOT NULL), ≤ 12, period DESC. */
export async function selectReportHistory(
  subscriptionId: number,
  limit: number,
  q: Queryable = pool,
): Promise<MonthlyMetricsRow[]> {
  const { rows } = await q.query<MonthlyMetricsRow>(
    `SELECT * FROM monthly_metrics
      WHERE subscription_id = $1 AND email_status IS NOT NULL
      ORDER BY period DESC
      LIMIT $2`,
    [subscriptionId, limit],
  );
  return rows;
}
