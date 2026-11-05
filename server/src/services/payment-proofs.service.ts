import { withTransaction } from '../utils/db.js';
import { badRequest, conflict, invalidTransition, notFound } from '../utils/errors.js';
import { sniffImageMime } from '../middleware/upload.js';
import { deletePhoto, savePaymentProof } from '../utils/storage.js';
import {
  insertPaymentProof,
  lockProofForReview,
  selectProofsByOrderId,
  serializePaymentProof,
  setProofReviewed,
  type PaymentProofRow,
} from '../repositories/payment-proofs.repository.js';
import {
  lockOrderWithPayment,
  selectOrderForUser,
} from '../repositories/orders.repository.js';
import { findAdminIds } from '../repositories/users.repository.js';
import { insertNotification } from './notifications.service.js';
import { confirmPaymentInTransaction } from './admin.service.js';
import {
  notifyUser,
  whatsappProofReceived,
  whatsappProofRejected,
} from './notification-dispatch.service.js';

/**
 * WORKFLOW DE PREUVE DE PAIEMENT
 * ==============================
 *
 * Règle absolue : **une preuve reçue n'est PAS un paiement validé**. La capture
 * n'est qu'une pièce justificative ; seul un administrateur peut l'approuver,
 * et c'est cette approbation qui déclenche le vrai `confirmPayment` (statut
 * PAYMENT_PENDING → PAID) puis les notifications vendeur.
 *
 * · L'acheteur propriétaire de la commande peut soumettre une preuve tant que
 *   la commande est en attente de paiement.
 * · Le vendeur ne reçoit AUCUNE notification avant l'approbation admin.
 * · Le frontend ne peut jamais modifier un statut de paiement : il ne peut que
 *   soumettre une image, le statut reste PENDING.
 */

export interface SubmitProofResult {
  proof: Record<string, unknown>;
}

/**
 * Soumet une preuve de paiement pour une commande de l'acheteur connecté.
 * Écrit d'abord le fichier (hors transaction), puis la ligne + notifications
 * dans la même transaction. Si l'INSERT échoue, le fichier est supprimé.
 */
export async function submitPaymentProof(
  buyerId: number,
  orderId: number,
  note: string | null,
  file: Express.Multer.File | undefined,
): Promise<SubmitProofResult> {
  if (!file || file.size === 0) {
    throw badRequest('PAYMENT_PROOF_FILE_REQUIRED', 'La capture de paiement est requise');
  }

  const order = await selectOrderForUser(orderId);
  // 404 (jamais 403) : un tiers ne doit pas apprendre l'existence de la commande.
  if (!order || order.buyer_id !== buyerId) {
    throw notFound('ORDER_NOT_FOUND', 'Commande introuvable');
  }
  if (order.status !== 'PAYMENT_PENDING') {
    throw invalidTransition(order.status, "Cette commande n'attend plus de preuve de paiement");
  }

  const mime = sniffImageMime(file.buffer);
  if (!mime) {
    throw badRequest('PAYMENT_PROOF_INVALID_TYPE', 'Formats acceptés : JPEG, PNG, WebP');
  }

  const fileUrl = await savePaymentProof(file.buffer, mime);

  try {
    let proof: PaymentProofRow | undefined;
    await withTransaction(async (client) => {
      proof = await insertPaymentProof(client, {
        orderId,
        submittedBy: buyerId,
        fileUrl,
        note,
      });

      await insertNotification(
        client,
        buyerId,
        'payment_proof_submitted',
        'Preuve de paiement reçue',
        `Votre preuve pour la commande ${order.order_number} est en cours de vérification.`,
      );

      // Les admins sont les SEULS destinataires d'une preuve : le vendeur reste
      // silencieux tant que le paiement n'est pas validé.
      const adminIds = await findAdminIds(client);
      for (const adminId of adminIds) {
        await insertNotification(
          client,
          adminId,
          'payment_proof_submitted',
          'Nouvelle preuve de paiement à vérifier',
          `Commande ${order.order_number} — ${order.amount.toLocaleString('fr-FR')} FCFA.`,
        );
      }
      notifyAdminsProofSubmitted(adminIds, proof!, order);
      notifyUser({
        event: 'payment_proof_received_buyer',
        idempotencyKey: `payment_proof_received_buyer:${proof!.id}:${buyerId}`,
        userId: buyerId,
        mail: {
          event: 'payment_proof_received_buyer',
          vars: { orderNumber: order.order_number, linkPath: `/mes-commandes/${order.id}` },
        },
        whatsapp: { body: whatsappProofReceived(order.order_number) },
      });
    });

    return {
      proof: serializePaymentProof(proof!),
    };
  } catch (err) {
    // Compensation : ne jamais laisser une capture orpheline sur le stockage.
    await deletePhoto(fileUrl);
    throw err;
  }
}

/** Notifications e-mail aux admins (une par admin, clé d'idempotence stable). */
function notifyAdminsProofSubmitted(
  adminIds: number[],
  proof: PaymentProofRow,
  order: { id: number; order_number: string; amount: number },
): void {
  for (const adminId of adminIds) {
    notifyUser({
      event: 'payment_proof_submitted_admin',
      idempotencyKey: `payment_proof_submitted_admin:${proof.id}:${adminId}`,
      userId: adminId,
      mail: {
        event: 'payment_proof_submitted_admin',
        vars: {
          orderNumber: order.order_number,
          amountFcfa: order.amount,
          linkPath: `/admin/commandes/${order.id}`,
        },
      },
    });
  }
}

export interface ReviewProofInput {
  decision: 'APPROVED' | 'REJECTED';
  reason?: string;
  reference?: string;
}

/**
 * Revue admin d'une preuve.
 * · APPROVED → validation RÉELLE du paiement (réutilise confirmPaymentInTransaction),
 *   donc statut PAID et notification vendeur APRÈS validation.
 * · REJECTED → la commande reste PAYMENT_PENDING, l'acheteur est invité à renvoyer.
 */
export async function reviewPaymentProof(
  adminId: number,
  orderId: number,
  proofId: number,
  input: ReviewProofInput,
): Promise<void> {
  await withTransaction(async (client) => {
    const proof = await lockProofForReview(client, proofId, orderId);
    if (!proof) throw notFound('PAYMENT_PROOF_NOT_FOUND', 'Preuve de paiement introuvable');
    if (proof.status !== 'PENDING') {
      throw conflict('PAYMENT_PROOF_ALREADY_REVIEWED', 'Cette preuve a déjà été traitée');
    }

    const order = await lockOrderWithPayment(client, orderId);
    if (!order) throw notFound('ORDER_NOT_FOUND', 'Commande introuvable');

    if (input.decision === 'APPROVED') {
      // Cœur unique de validation : transitions, produit vendu, payout, events.
      // Cette fonction notifie l'acheteur ET le vendeur (après validation).
      await confirmPaymentInTransaction(client, adminId, orderId, {
        method: order.payment_method,
        reference: input.reference,
      });
      await setProofReviewed(client, proofId, 'APPROVED', adminId, null);
      await insertNotification(
        client,
        order.buyer_id,
        'payment_proof_approved',
        'Paiement validé',
        `Votre preuve pour la commande ${order.order_number} a été acceptée. Le vendeur est prévenu.`,
      );
      return;
    }

    const reason = input.reason?.trim();
    if (!reason) throw badRequest('PAYMENT_PROOF_REASON_REQUIRED', 'Le motif du refus est requis');
    await setProofReviewed(client, proofId, 'REJECTED', adminId, reason);
    await insertNotification(
      client,
      order.buyer_id,
      'payment_proof_rejected',
      'Preuve de paiement refusée',
      `Commande ${order.order_number} : ${reason}`,
    );
    notifyUser({
      event: 'payment_proof_rejected_buyer',
      idempotencyKey: `payment_proof_rejected_buyer:${proof.id}:${order.buyer_id}`,
      userId: order.buyer_id,
      mail: {
        event: 'payment_proof_rejected_buyer',
        vars: {
          orderNumber: order.order_number,
          reason,
          linkPath: `/mes-commandes/${orderId}`,
        },
      },
      whatsapp: { body: whatsappProofRejected(order.order_number, reason) },
    });
  });
}

/** Preuves d'une commande, sérialisées (acheteur/admin uniquement). */
export async function listPaymentProofs(orderId: number): Promise<Record<string, unknown>[]> {
  const rows = await selectProofsByOrderId(orderId);
  return rows.map(serializePaymentProof);
}
