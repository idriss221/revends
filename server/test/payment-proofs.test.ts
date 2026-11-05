/**
 * PREUVE DE PAIEMENT — workflow sécurisé.
 *
 * Ce que ces tests PROUVENT :
 *  · une capture soumise par l'acheteur laisse la commande en PAYMENT_PENDING ;
 *  · le vendeur ne reçoit AUCUNE notification tant que l'admin n'a pas validé ;
 *  · l'admin peut refuser (motif obligatoire) sans changer le statut ;
 *  · l'admin peut approuver → validation réelle du paiement + notification vendeur ;
 *  · une preuve déjà traitée ne peut pas être rejouée (409) ;
 *  · un tiers ne peut pas soumettre de preuve (404).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  bootTestServer,
  registerUser,
  loginAdmin,
  createApprovedProduct,
  createOrder,
  dbQuery,
  errorCode,
  jpegBuffer,
  invalidBuffer,
} from './helpers.js';
import type { ServerHandle, ApiClient } from './helpers.js';
import { flushAfterCommit } from '../src/utils/db.js';
import { clearSentMails, recentSentMails } from '../src/mail/mailer.js';

let server: ServerHandle;
let admin: ApiClient;
let seller: ApiClient;
let buyer: ApiClient;
let previousMailEnabled: string | undefined;

before(async () => {
  previousMailEnabled = process.env.MAIL_ENABLED;
  process.env.MAIL_ENABLED = 'true';
  server = await bootTestServer();
  admin = await loginAdmin(server);
  seller = (await registerUser(server, 'proofsell')).client;
  buyer = (await registerUser(server, 'proofbuy')).client;
});

after(async () => {
  await server?.close();
  if (previousMailEnabled === undefined) delete process.env.MAIL_ENABLED;
  else process.env.MAIL_ENABLED = previousMailEnabled;
});

async function freshOrder(name = 'Article preuve') {
  const product = await createApprovedProduct(seller, admin, { name, price: 150_000 });
  const { status, body } = await createOrder(buyer, product.id, 'MOBILE_MONEY');
  assert.equal(status, 201, `création commande : ${JSON.stringify(body)}`);
  return { product, order: body.order as { id: number; orderNumber: string } };
}

function proofForm(buffer = jpegBuffer(), note?: string): FormData {
  const form = new FormData();
  form.append('proof', new Blob([buffer], { type: 'image/jpeg' }), 'capture.jpg');
  if (note) form.append('note', note);
  return form;
}

async function submitProof(orderId: number, note?: string, buffer?: Buffer) {
  return buyer.request(`/api/orders/${orderId}/payment-proof`, 'POST', { form: proofForm(buffer, note) });
}

async function review(orderId: number, proofId: number, json: Record<string, unknown>) {
  return admin.request(`/api/admin/orders/${orderId}/payment-proof/${proofId}/review`, 'POST', { json });
}

describe('POST /api/orders/:id/payment-proof', () => {
  it('201 : preuve enregistrée, commande TOUJOURS en attente, vendeur silencieux', async () => {
    clearSentMails();
    const { order } = await freshOrder();

    const res = await submitProof(order.id, 'Orange Money 123456');
    assert.equal(res.status, 201, `soumission : ${JSON.stringify(res.body)}`);
    const proof = (res.body as any).proof;
    assert.equal(proof.status, 'PENDING');
    assert.equal(proof.note, 'Orange Money 123456');
    assert.match(proof.fileUrl, /^\/?uploads\/payment-proofs\//);

    // Statut métier inchangé : une preuve n'est PAS un paiement.
    const [row] = await dbQuery<{ status: string }>('SELECT status FROM orders WHERE id = $1', [order.id]);
    assert.equal(row!.status, 'PAYMENT_PENDING');

    const [payment] = await dbQuery<{ status: string }>('SELECT status FROM payments WHERE order_id = $1', [order.id]);
    assert.equal(payment!.status, 'PENDING');

    // Aucun email vendeur (ni article réservé, ni paiement confirmé).
    await flushAfterCommit();
    const sellerMails = recentSentMails().filter((m) => m.event === 'payment_confirmed_seller' || m.event === 'article_reserved');
    assert.equal(sellerMails.length, 0, 'le vendeur ne doit rien recevoir avant validation');

    // Journal d'idempotence : la livraison e-mail acheteur doit être SENT
    // (le paramètre $2 de `markDelivery` était mal typé → statut jamais écrit).
    const [delivery] = await dbQuery<{ status: string }>(
      `SELECT status FROM notification_deliveries
        WHERE event = 'payment_proof_received_buyer' AND channel = 'email'
        ORDER BY id DESC LIMIT 1`,
    );
    assert.equal(delivery?.status, 'SENT', 'la livraison e-mail doit être journalisée SENT');
  });

  it('404 : un autre acheteur ne peut pas soumettre de preuve', async () => {
    const { order } = await freshOrder('Article tiers');
    const intruder = (await registerUser(server, 'proofintruder')).client;
    const res = await intruder.request(`/api/orders/${order.id}/payment-proof`, 'POST', { form: proofForm() });
    assert.equal(res.status, 404);
    assert.equal(errorCode(res.body), 'ORDER_NOT_FOUND');
  });

  it('400 : un fichier non-image est refusé (magic bytes)', async () => {
    const { order } = await freshOrder('Article mauvais fichier');
    const res = await submitProof(order.id, undefined, invalidBuffer);
    assert.equal(res.status, 400);
    assert.equal(errorCode(res.body), 'PAYMENT_PROOF_INVALID_TYPE');
  });
});

describe('POST /api/admin/orders/:id/payment-proof/:proofId/review', () => {
  it('400 : refus sans motif', async () => {
    const { order } = await freshOrder('Article refus sans motif');
    const sent = await submitProof(order.id);
    const proofId = (sent.body as any).proof.id;
    const res = await review(order.id, proofId, { decision: 'REJECTED' });
    assert.equal(res.status, 400);
  });

  it('refus motivé : statut inchangé, acheteur notifié', async () => {
    const { order } = await freshOrder('Article refusé');
    const sent = await submitProof(order.id);
    const proofId = (sent.body as any).proof.id;

    const res = await review(order.id, proofId, { decision: 'REJECTED', reason: 'Capture illisible' });
    assert.equal(res.status, 200, `refus : ${JSON.stringify(res.body)}`);
    const proof = (res.body as any).order.paymentProofs.find((p: any) => p.id === proofId);
    assert.equal(proof.status, 'REJECTED');
    assert.equal(proof.rejectionReason, 'Capture illisible');

    const [row] = await dbQuery<{ status: string }>('SELECT status FROM orders WHERE id = $1', [order.id]);
    assert.equal(row!.status, 'PAYMENT_PENDING', 'un refus ne valide JAMAIS le paiement');

    await flushAfterCommit();
    const buyerMails = recentSentMails().filter((m) => m.event === 'payment_proof_rejected_buyer');
    assert.equal(buyerMails.length, 1, 'l’acheteur est informé du refus');
  });

  it('approbation : paiement réellement validé + vendeur notifié, rejeu refusé', async () => {
    clearSentMails();
    const { order } = await freshOrder('Article approuvé');
    const sent = await submitProof(order.id);
    const proofId = (sent.body as any).proof.id;

    const res = await review(order.id, proofId, { decision: 'APPROVED', reference: 'OM-APPROVED-1' });
    assert.equal(res.status, 200, `approbation : ${JSON.stringify(res.body)}`);

    const [row] = await dbQuery<{ status: string }>('SELECT status FROM orders WHERE id = $1', [order.id]);
    assert.equal(row!.status, 'PRODUCT_WAITING', 'l’approbation valide le paiement et démarre le cycle');

    const [payment] = await dbQuery<{ status: string; reference: string }>(
      'SELECT status, reference FROM payments WHERE order_id = $1',
      [order.id],
    );
    assert.equal(payment!.status, 'PAID');
    assert.equal(payment!.reference, 'OM-APPROVED-1');

    const proof = (res.body as any).order.paymentProofs.find((p: any) => p.id === proofId);
    assert.equal(proof.status, 'APPROVED');

    // Le vendeur est notifié APRÈS validation.
    await flushAfterCommit();
    const sellerMails = recentSentMails().filter((m) => m.event === 'payment_confirmed_seller');
    assert.equal(sellerMails.length, 1, 'le vendeur reçoit la confirmation de paiement');

    // Une seconde revue est refusée (409).
    const again = await review(order.id, proofId, { decision: 'APPROVED' });
    assert.equal(again.status, 409);
    assert.equal(errorCode(again.body), 'PAYMENT_PROOF_ALREADY_REVIEWED');
  });
});
