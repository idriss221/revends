import { pool, type DbClient, type Queryable } from '../db/pool.js';
import { imageUrl } from '../utils/serializers.js';

/**
 * Preuves de paiement. Une preuve est une PIÈCE soumise par l'acheteur :
 * elle ne vaut JAMAIS validation. Seul un administrateur peut passer le statut
 * à APPROVED, ce qui déclenche le vrai `confirmPayment`.
 */

export type PaymentProofStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface PaymentProofRow {
  id: number;
  order_id: number;
  submitted_by: number;
  file_url: string;
  note: string | null;
  status: PaymentProofStatus;
  reviewed_by: number | null;
  reviewed_at: Date | null;
  rejection_reason: string | null;
  created_at: Date;
}

const COLUMNS =
  'id, order_id, submitted_by, file_url, note, status, reviewed_by, reviewed_at, rejection_reason, created_at';

export async function insertPaymentProof(
  q: Queryable,
  input: { orderId: number; submittedBy: number; fileUrl: string; note: string | null },
): Promise<PaymentProofRow> {
  const { rows } = await q.query<PaymentProofRow>(
    `INSERT INTO payment_proofs (order_id, submitted_by, file_url, note)
     VALUES ($1, $2, $3, $4)
     RETURNING ${COLUMNS}`,
    [input.orderId, input.submittedBy, input.fileUrl, input.note],
  );
  return rows[0]!;
}

export async function selectProofsByOrderId(
  orderId: number,
  q: Queryable = pool,
): Promise<PaymentProofRow[]> {
  const { rows } = await q.query<PaymentProofRow>(
    `SELECT ${COLUMNS} FROM payment_proofs
      WHERE order_id = $1
      ORDER BY created_at DESC, id DESC`,
    [orderId],
  );
  return rows;
}

/** Verrouille une preuve pour revue admin (empêche une double décision). */
export async function lockProofForReview(
  client: DbClient,
  proofId: number,
  orderId: number,
): Promise<PaymentProofRow | undefined> {
  const { rows } = await client.query<PaymentProofRow>(
    `SELECT ${COLUMNS} FROM payment_proofs
      WHERE id = $1 AND order_id = $2
      FOR UPDATE`,
    [proofId, orderId],
  );
  return rows[0];
}

/** Nombre de preuves encore en attente pour une commande. */
export async function countPendingProofs(orderId: number, q: Queryable = pool): Promise<number> {
  const { rows } = await q.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM payment_proofs WHERE order_id = $1 AND status = 'PENDING'",
    [orderId],
  );
  return Number(rows[0]?.count ?? 0);
}

export async function setProofReviewed(
  client: DbClient,
  proofId: number,
  status: 'APPROVED' | 'REJECTED',
  adminId: number,
  reason: string | null,
): Promise<void> {
  await client.query(
    `UPDATE payment_proofs
        SET status = $2,
            reviewed_by = $3,
            reviewed_at = now(),
            rejection_reason = $4,
            updated_at = now()
      WHERE id = $1`,
    [proofId, status, adminId, reason],
  );
}

export function serializePaymentProof(row: PaymentProofRow): Record<string, unknown> {
  return {
    id: row.id,
    orderId: row.order_id,
    fileUrl: imageUrl(row.file_url),
    note: row.note,
    status: row.status,
    rejectionReason: row.rejection_reason,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
  };
}
