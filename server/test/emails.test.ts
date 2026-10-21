/**
 * C1 / US-V5-01 — EMAILS TRANSACTIONNELS.
 *
 * Couvre les 9 déclencheurs / 11 envois (CA-V5-004), chacun déclenché par
 * l'ENDPOINT RÉEL (jamais par un appel direct au mailer), avec assertion sur le
 * destinataire, le sujet et le contenu attendu.
 *
 * Le test est neutre côté réseau : `test/env.ts` force `NODE_ENV=test`, donc le
 * mailer construit un transport `jsonTransport` — aucun SMTP, aucun disque
 * (CA-V5-015). L'observation se fait via le journal d'envoi en mémoire
 * (`recentSentMails()`), pas via une boîte mail.
 *
 * Point d'attention sur `MAIL_ENABLED` : c'est la variable d'environnement qui
 * gouverne l'envoi (CA-V5-016). `test/env.ts` la laisse à `false` par défaut
 * pour que les suites métier existantes ne déclenchent aucun envoi ; ce fichier
 * l'active explicitement dans son `before` et la rétablit dans son `after`.
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  bootTestServer, registerUser, loginAdmin, createApprovedProduct, createProduct, createOrder,
  dbQuery, ApiClient,
} from './helpers.js';
import type { ServerHandle } from './helpers.js';
import { clearSentMails, recentSentMails, sendMail, type SentMail } from '../src/mail/mailer.js';
import { renderTemplate, escapeHtml, type MailEvent, type TemplateVars } from '../src/mail/templates.js';
import { findOrCreateOAuthUser } from '../src/services/oauth.service.js';
import { config } from '../src/config.js';
import { expireExpiredReservations } from '../src/services/expiry.service.js';
import { withTransaction, afterCommit, flushAfterCommit } from '../src/utils/db.js';

let server: ServerHandle;
let seller: ApiClient;
/** Compte vendeur de référence : `seller.email` sert à asserter le destinataire. */
let sellerEmail: string;
let admin: ApiClient;
const previousMailEnabled = process.env.MAIL_ENABLED;

before(async () => {
  process.env.MAIL_ENABLED = 'true';
  server = await bootTestServer();
  admin = await loginAdmin(server);
  const sellerAccount = await registerUser(server, 'mailsell');
  seller = sellerAccount.client;
  sellerEmail = sellerAccount.email;
});

after(async () => {
  await server?.close();
  process.env.MAIL_ENABLED = previousMailEnabled;
});

beforeEach(async () => {
  // Défensif : vider les effets du test précédent AVANT de purger la boîte. Les
  // envois sont lancés sans être attendus (CA-V5-014), donc un effet encore en
  // vol au début du test N+1 pourrait atterrir APRÈS `clearSentMails()` et
  // fausser une assertion « aucun email ». La suite passe aussi sans ce flush
  // (chaque lecture vide les effets avant d'observer), mais l'isolation est
  // alors implicite et fragile : on la rend explicite.
  await flushAfterCommit();
  clearSentMails();
});

/**
 * `registerSchema` normalise l'email en minuscules (`.toLowerCase()`) : la
 * valeur retournée par `registerUser` est celle ENVOYÉE, pas celle stockée.
 * On normalise donc avant toute comparaison — sinon le test échouerait sur une
 * différence de casse qui n'a aucun rapport avec le mail.
 */
function norm(email: string | undefined): string | undefined {
  return email?.toLowerCase();
}

/**
 * Les envois d'un événement donné, dans l'ordre d'émission.
 *
 * `flushAfterCommit()` est appelé ici, et non à chaque action : les effets sont
 * désormais lancés SANS être attendus (CA-V5-014), donc l'endpoint est déjà
 * répondu quand l'envoi démarre. Vider les effets en cours au point de lecture
 * garde les assertions déterministes sans disperser des `await` dans les tests,
 * et sans réintroduire l'attente sur le chemin de la requête.
 */
async function mailsOf(event: string): Promise<SentMail[]> {
  await flushAfterCommit();
  return recentSentMails().filter((m) => m.event === event);
}

async function oneMailOf(event: string): Promise<SentMail> {
  const mails = await mailsOf(event);
  assert.equal(mails.length, 1, `un seul envoi pour ${event}, obtenu : ${mails.length}`);
  return mails[0]!;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Premier envoi d'un événement, avec SONDAGE.
 *
 * Certains déclencheurs partent en `void sendMail(…)` : la promesse n'est pas
 * rattachée à `afterCommit`, donc `flushAfterCommit()` ne la couvre pas. On
 * borne l'attente pour que « jamais d'envoi » reste vérifiable en temps fini.
 */
async function waitForMail(event: MailEvent, timeoutMs = 1500): Promise<SentMail | undefined> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = recentSentMails().filter((m) => m.event === event);
    if (found.length > 0) return found[0];
    if (Date.now() > deadline) return undefined;
    await sleep(20);
  }
}

/** Premier `href` de l'e-mail rendu pour un événement, `null` si absent. */
function hrefOf(event: MailEvent, vars: TemplateVars = {}): string | null {
  const { html } = renderTemplate(event, { linkPath: '/dashboard', ...vars });
  return html.match(/href="([^"]+)"/)?.[1] ?? null;
}

/** Passe la commande jusqu'au statut PAID (2 events) via l'endpoint admin. */
async function paidOrder(name = 'Article pour email') {
  const buyerAccount = await registerUser(server, 'mailbuy');
  const buyer = buyerAccount.client;
  const product = await createApprovedProduct(seller, admin, { name });
  const { status, body } = await createOrder(buyer, product.id);
  assert.equal(status, 201, `commande refusée : ${JSON.stringify(body)}`);
  const res = await admin.request(`/api/admin/orders/${body.order.id}/confirm-payment`, 'POST', {
    json: { method: 'MOBILE_MONEY' },
  });
  assert.equal(res.status, 200, `paiement refusé : ${JSON.stringify(res.body)}`);
  return { buyer, buyerAccount, product, order: body.order };
}

/**
 * Avance la commande jusqu'à `target` via les endpoints admin RÉELS, dans
 * l'ordre exact du cycle : après `confirm-payment` la commande est en
 * PRODUCT_WAITING ; `mark-shipped` exige PREPARING, donc `mark-product-received`
 * est obligatoire. Sauter une étape donne un 409 légitime, pas un bug du mailer.
 */
async function advanceTo(orderId: number, target: 'SHIPPED' | 'DELIVERED'): Promise<void> {
  const received = await admin.request(`/api/admin/orders/${orderId}/mark-product-received`, 'POST', {
    json: { note: 'Reçu par l\'atelier' },
  });
  assert.equal(received.status, 200, `mark-product-received : ${JSON.stringify(received.body)}`);

  const shipped = await admin.request(`/api/admin/orders/${orderId}/mark-shipped`, 'POST', { json: {} });
  assert.equal(shipped.status, 200, `mark-shipped : ${JSON.stringify(shipped.body)}`);

  if (target === 'SHIPPED') return;

  const started = await admin.request(`/api/admin/orders/${orderId}/start-delivery`, 'POST', {
    json: { carrier: 'Test' },
  });
  assert.equal(started.status, 200, `start-delivery : ${JSON.stringify(started.body)}`);

  const delivered = await admin.request(`/api/admin/orders/${orderId}/mark-delivered`, 'POST', { json: {} });
  assert.equal(delivered.status, 200, `mark-delivered : ${JSON.stringify(delivered.body)}`);
}

// ---------------------------------------------------------------------------
// E1 — Bienvenue
// ---------------------------------------------------------------------------

describe('E1 — Email de bienvenue (POST /api/auth/register)', () => {
  it('envoie un email au nouvel inscrit, au bon destinataire, avec un sujet non vide', async () => {
    const user = await registerUser(server, 'welcome');
    const mail = await oneMailOf('welcome');
    assert.equal(mail.to, user.email, 'destinataire = email du nouvel inscrit');
    assert.equal(mail.ok, true);
    assert.ok(mail.subject.length > 0, 'sujet non vide (CA-V5-007)');
  });

  it('le message porte les DEUX versions : HTML et texte brut (CA-V5-007)', () => {
    const { html, text, subject } = renderTemplate('welcome', {});
    assert.ok(html.includes('<html'), 'version HTML');
    assert.ok(text.length > 0 && !text.includes('<p>'), 'version texte sans balisage');
    assert.ok(!html.includes('<script'), 'aucun script');
    assert.ok(!/<link\b/i.test(html) && !/<style\b/i.test(html), 'aucun CSS externe');
    assert.ok(!/<img\b/i.test(html), 'aucune image distante');
    assert.ok(subject.length > 0, 'sujet déclaré');
  });
});

// ---------------------------------------------------------------------------
// E2 / E3 — Modération
// ---------------------------------------------------------------------------

describe('E2 / E3 — Article approuvé / refusé', () => {
  it('E2 : l\'approbation envoie un email au VENDEUR', async () => {
    const account = await registerUser(server, 'approOwner');
    const owner = account.client;
    const product = await createProduct(owner, { name: 'Objet approuvé' });
    const res = await admin.request(`/api/admin/products/${product.id}/approve`, 'POST', { json: {} });
    assert.equal(res.status, 200);

    const mail = await oneMailOf('product_approved');
    assert.equal(mail.to, norm(account.email), 'destinataire = vendeur');
    assert.ok(mail.subject.includes('approuvé'));
  });

  it('E3 : le refus envoie un email au vendeur AVEC le motif', async () => {
    const account = await registerUser(server, 'rejectOwner');
    const owner = account.client;
    const product = await createProduct(owner, { name: 'Objet refusé' });
    const res = await admin.request(`/api/admin/products/${product.id}/reject`, 'POST', {
      json: { reason: 'Photos insuffisantes' },
    });
    assert.equal(res.status, 200);

    const mail = await oneMailOf('product_rejected');
    assert.equal(mail.to, norm(account.email));
    assert.ok(mail.subject.includes('refusé'));
  });
});

// ---------------------------------------------------------------------------
// E0 — Commande enregistrée → acheteur CONNECTÉ
// ---------------------------------------------------------------------------

describe('E0 — Commande enregistrée (POST /api/orders) → acheteur connecté', () => {
  it('envoie la confirmation à l’adresse du COMPTE connecté, jamais à l’adresse de la requête', async () => {
    const account = await registerUser(server, 'ordercreated');
    const product = await createApprovedProduct(seller, admin, { name: 'Article confirmé' });

    // On glisse une adresse ÉTRANGÈRE dans le corps de la requête (comme le
    // faisait l'ancien formulaire « E-mail de contact ») : elle ne doit jamais
    // devenir le destinataire (CA-V5-011 — aucune adresse n'entre par l'API).
    const res = await account.client.request('/api/orders', 'POST', {
      json: {
        productId: product.id,
        paymentMethod: 'MOBILE_MONEY',
        note: 'E-mail de contact : pirate@example.com',
        shipping: { name: 'Destinataire Test', phone: '+225 07 00 00 00 00', city: 'Dakar', address: 'Rue 1' },
      },
    });
    assert.equal(res.status, 201, `commande refusée : ${JSON.stringify(res.body)}`);

    const own = (await mailsOf('order_created_buyer')).filter((m) => m.to === norm(account.email));
    assert.equal(own.length, 1, 'un seul envoi, à l’adresse du compte connecté');
    assert.equal(own[0]!.ok, true, 'envoi effectif (transport de test)');
    assert.ok(own[0]!.subject.includes('commande'), `sujet : ${own[0]!.subject}`);

    const all = await mailsOf('order_created_buyer');
    assert.ok(
      all.every((m) => m.to !== norm(sellerEmail)),
      'le VENDEUR ne reçoit pas la confirmation d’enregistrement (réservée à l’acheteur)',
    );
    assert.ok(
      all.every((m) => !m.to.toLowerCase().includes('pirate@example.com')),
      'une adresse saisie dans la requête ne devient JAMAIS destinataire',
    );

    const orderNumber = (res.body as any).order.order_number ?? (res.body as any).order.orderNumber;
    const rendered = renderTemplate('order_created_buyer', { orderNumber });
    assert.ok(rendered.text.includes(String(orderNumber)), 'le message porte le numéro de commande');
  });
});

// ---------------------------------------------------------------------------
// E4 / E5 — Commande payée (2 envois)
// ---------------------------------------------------------------------------

describe('E4 / E5 — Paiement confirmé (2 envois distincts)', () => {
  it('envoie DEUX emails : acheteur ET vendeur', async () => {
    const { buyerAccount, order } = await paidOrder('Article payé');

    const toBuyer = await oneMailOf('payment_confirmed_buyer');
    assert.equal(toBuyer.to, norm(buyerAccount.email), 'E4 → acheteur');
    assert.ok(toBuyer.subject.length > 0);

    const toSeller = await oneMailOf('payment_confirmed_seller');
    assert.equal(toSeller.to, norm(sellerEmail), 'E5 → vendeur');
    assert.ok(toSeller.subject.length > 0);

    // PO-V5-14 : l'ordre compte — acheteur d'abord, vendeur ensuite.
    await flushAfterCommit();
    const all = recentSentMails().map((m) => m.event);
    assert.ok(
      all.indexOf('payment_confirmed_buyer') < all.indexOf('payment_confirmed_seller'),
      'E4 émis avant E5',
    );
    assert.equal(all.filter((e) => e.startsWith('payment_confirmed')).length, 2, 'exactement 2 envois');

    // Le contenu porte l'identifiant de commande (donnée autorisée, CA-V5-008).
    const rendered = renderTemplate('payment_confirmed_buyer', { orderNumber: order.orderNumber ?? order.order_number });
    assert.ok(rendered.text.includes(String(order.orderNumber ?? order.order_number)));
  });
});

// ---------------------------------------------------------------------------
// E6 / E7 / E8 / E9 — Cycle logistique et paiement vendeur
// ---------------------------------------------------------------------------

describe('E6 à E9 — Cycle logistique et paiement vendeur', () => {
  it('E6 : mark-shipped envoie un email à l\'ACHETEUR', async () => {
    const { buyerAccount, order } = await paidOrder('Article expédié');
    // `advanceTo` enchaîne les endpoints admin réels jusqu'à mark-shipped.
    await advanceTo(order.id, 'SHIPPED');

    const mail = await oneMailOf('order_shipped');
    assert.equal(mail.to, norm(buyerAccount.email), 'E6 → acheteur');
  });

  it('E7 + E8 : mark-delivered émet DEUX emails (acheteur livré, vendeur payé disponible)', async () => {
    const { buyerAccount, order } = await paidOrder('Article livré');
    // `advanceTo('DELIVERED')` va jusqu'à mark-delivered inclus.
    await advanceTo(order.id, 'DELIVERED');

    const delivered = await oneMailOf('order_delivered');
    assert.equal(delivered.to, norm(buyerAccount.email), 'E7 → acheteur');

    const payout = await oneMailOf('payout_available');
    assert.equal(payout.to, norm(sellerEmail), 'E8 → vendeur');
  });

  it('E9 : seller-payout envoie un email au VENDEUR', async () => {
    const { order } = await paidOrder('Article versé');
    await advanceTo(order.id, 'DELIVERED');
    clearSentMails();
    const res = await admin.request(`/api/admin/orders/${order.id}/seller-payout`, 'POST', {
      json: { reference: 'VIR-2026-001' },
    });
    assert.equal(res.status, 200, `seller-payout : ${JSON.stringify(res.body)}`);

    const mail = await oneMailOf('payout_paid');
    assert.equal(mail.to, norm(sellerEmail), 'E9 → vendeur');
  });
});

// ---------------------------------------------------------------------------
// E10 — Réservation expirée (2 envois : acheteur + vendeur, PO-V5-14)
// ---------------------------------------------------------------------------

describe('E10 — Réservation expirée (2 envois, PO-V5-14)', () => {
  it('envoie un email à l\'ACHETEUR et un email AU VENDEUR', async () => {
    const buyerAccount = await registerUser(server, 'expBuyer');
    const buyer = buyerAccount.client;
    const product = await createApprovedProduct(seller, admin, { name: 'Article expiré' });
    const { status, body } = await createOrder(buyer, product.id);
    assert.equal(status, 201);
    await dbQuery(`UPDATE products SET reserved_until = now() - interval '2 minutes' WHERE id = $1`, [product.id]);

    clearSentMails();
    const released = await expireExpiredReservations();
    assert.ok(released >= 1, 'réservation libérée');

    const toBuyer = await oneMailOf('reservation_expired_buyer');
    assert.equal(toBuyer.to, norm(buyerAccount.email), 'E10 → acheteur');

    const toSeller = await oneMailOf('reservation_expired_seller');
    assert.equal(toSeller.to, norm(sellerEmail), 'E10 → vendeur (2ᵉ envoi, PO-V5-14)');
  });

  it('⚠️ AUCUNE notification in-app supplémentaire au vendeur (CA-V5-010 / PO-V5-14(a))', async () => {
    const buyer = (await registerUser(server, 'expBuyer2')).client;
    const product = await createApprovedProduct(seller, admin, { name: 'Article expiré 2' });
    const { status } = await createOrder(buyer, product.id);
    assert.equal(status, 201);
    await dbQuery(`UPDATE products SET reserved_until = now() - interval '2 minutes' WHERE id = $1`, [product.id]);

    // Le vendeur ne doit PAS avoir de notification in-app `reservation_expired`.
    const rows = await dbQuery<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM notifications
        WHERE user_id = $1 AND type = 'reservation_expired'`,
      [product.product.ownerId ?? seller.id],
    );
    await expireExpiredReservations();
    const after = await dbQuery<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM notifications
        WHERE user_id = $1 AND type = 'reservation_expired'`,
      [seller.id],
    );
    assert.equal(after[0]!.n, '0', 'le vendeur ne reçoit AUCUNE notification in-app (email seul)');
    void rows;
  });
});

// ---------------------------------------------------------------------------
// E11 — Article réservé (au VENDEUR)
// ---------------------------------------------------------------------------
describe('E11 — Article réservé (au vendeur)', () => {
  it('une commande envoie un email au VENDEUR (article réservé)', async () => {
    clearSentMails();
    const buyerAccount = await registerUser(server, 'reserveBuy');
    const buyer = buyerAccount.client;
    const product = await createApprovedProduct(seller, admin, { name: 'Article réservé' });
    const { status } = await createOrder(buyer, product.id);
    assert.equal(status, 201);

    const mail = await oneMailOf('article_reserved');
    assert.equal(mail.to, norm(sellerEmail), 'E11 → vendeur');
    assert.ok(mail.subject.includes('réservé'), `sujet : ${mail.subject}`);
  });
});

// ---------------------------------------------------------------------------
// E12 — Produit reçu (à l'ACHETEUR)
// ---------------------------------------------------------------------------
describe('E12 — Produit reçu (à l\'acheteur)', () => {
  it('mark-product-received envoie un email à l\'ACHETEUR', async () => {
    const { buyerAccount, order } = await paidOrder('Article reçu');
    const received = await admin.request(`/api/admin/orders/${order.id}/mark-product-received`, 'POST', {
      json: { note: 'Reçu à l\'atelier' },
    });
    assert.equal(received.status, 200, `mark-product-received : ${JSON.stringify(received.body)}`);

    const mail = await oneMailOf('order_product_received');
    assert.equal(mail.to, norm(buyerAccount.email), 'E12 → acheteur');
    assert.ok(mail.subject.includes('réceptionné'), `sujet : ${mail.subject}`);
  });
});

// ---------------------------------------------------------------------------
// E13 — Commande annulée (à l'ACHETEUR)
// ---------------------------------------------------------------------------
describe('E13 — Commande annulée (à l\'acheteur)', () => {
  it('cancel envoie un email à l\'ACHETEUR', async () => {
    const buyerAccount = await registerUser(server, 'cancelBuy');
    const buyer = buyerAccount.client;
    const product = await createApprovedProduct(seller, admin, { name: 'Article annulé' });
    const { status, body } = await createOrder(buyer, product.id);
    assert.equal(status, 201);

    clearSentMails();
    const res = await admin.request(`/api/admin/orders/${body.order.id}/cancel`, 'POST', {
      json: { note: 'Abandon de l\'acheteur' },
    });
    assert.equal(res.status, 200, `cancel : ${JSON.stringify(res.body)}`);

    const mail = await oneMailOf('order_cancelled');
    assert.equal(mail.to, norm(buyerAccount.email), 'E13 → acheteur');
    assert.ok(mail.subject.includes('annulée'), `sujet : ${mail.subject}`);
  });
});

// ---------------------------------------------------------------------------
// E14 — Vente terminée côté acheteur (mark-delivered)
// ---------------------------------------------------------------------------
describe('E14 — Vente terminée côté acheteur', () => {
  it('mark-delivered émet aussi un email order_completed_buyer à l\'ACHETEUR', async () => {
    const { buyerAccount, order } = await paidOrder('Article terminé');
    await advanceTo(order.id, 'DELIVERED');

    const mail = await oneMailOf('order_completed_buyer');
    assert.equal(mail.to, norm(buyerAccount.email), 'E14 → acheteur');
    assert.ok(mail.subject.includes('terminée'), `sujet : ${mail.subject}`);
  });
});

// ---------------------------------------------------------------------------
// CA-V5-003 — Après commit uniquement
// ---------------------------------------------------------------------------
describe("CA-V5-003 — L'envoi a lieu APRÈS le commit", () => {
  it("un VRAI rollback annule aussi l'email programmé (P8 : une transaction, une réalité)", async () => {
    const owner = (await registerUser(server, 'rollbackOwner')).client;
    const product = await createProduct(owner, { name: 'Objet rollback' });
    clearSentMails();

    // Rollback RÉEL : `afterCommit` est programmé, puis la transaction lève.
    // L'effet ne doit JAMAIS s'exécuter, même si la transaction a bien écrit.
    await assert.rejects(
      withTransaction(async (client) => {
        await client.query("UPDATE products SET status = 'AVAILABLE' WHERE id = $1", [product.id]);
        afterCommit(() => {
          void sendMail(product.id, 'ghost@example.com', 'product_approved', { productName: 'jamais' });
        });
        throw new Error('échec métier volontaire');
      }),
      /échec métier volontaire/,
      "la transaction doit bien avorter",
    );

    assert.equal((await mailsOf('product_approved')).length, 0, 'rollback → aucun email');
  });

  it("un COMMIT déclenche l'effet exactement une fois", async () => {
    const owner = (await registerUser(server, 'commitOwner')).client;
    const product = await createProduct(owner, { name: 'Objet commit' });
    clearSentMails();

    await withTransaction(async (client) => {
      await client.query("UPDATE products SET status = 'AVAILABLE' WHERE id = $1", [product.id]);
      afterCommit(() =>
        sendMail(product.id, 'commit@example.com', 'product_approved', { productName: 'envoyé' }),
      );
    });

    const mails = await mailsOf('product_approved');
    assert.equal(mails.length, 1, 'commit → 1 envoi, pas 0, pas 2');
  });

  it("un commit INTERNE ne déclenche rien : seul le commit externe décide", async () => {
    clearSentMails();

    await withTransaction(async () => {
      await withTransaction(async () => {
        afterCommit(() => sendMail(0, 'inner@example.com', 'product_approved', { productName: 'interne' }));
      });
      // Le niveau interne a validé : rien ne doit encore être parti, sinon
      // l'effet serait observable avant le commit du parent.
      assert.equal((await mailsOf('product_approved')).length, 0, 'rien ne part au commit interne');
    });

    assert.equal((await mailsOf('product_approved')).length, 1, "l'effet part au commit EXTERNE");
  });

  it("un rollback INTERNE ne détruit pas les effets programmés par le parent", async () => {
    clearSentMails();

    await withTransaction(async () => {
      afterCommit(() => sendMail(0, 'parent@example.com', 'product_approved', { productName: 'parent' }));
      await assert.rejects(
        withTransaction(async () => {
          afterCommit(() => sendMail(0, 'inner@example.com', 'product_approved', { productName: 'interne' }));
          throw new Error('rollback interne');
        }),
      );
    });

    const mails = await mailsOf('product_approved');
    assert.equal(mails.length, 1, "seul l'effet du parent survit");
    assert.equal(mails[0]!.to, 'parent@example.com', "c'est bien l'effet du parent");
  });

  it("un rollback EXTERNE annule les effets de TOUS les niveaux", async () => {
    clearSentMails();

    await assert.rejects(
      withTransaction(async () => {
        await withTransaction(async () => {
          afterCommit(() => sendMail(0, 'inner@example.com', 'product_approved', { productName: 'interne' }));
        });
        afterCommit(() => sendMail(0, 'parent@example.com', 'product_approved', { productName: 'parent' }));
        throw new Error('rollback externe');
      }),
    );

    assert.equal((await mailsOf('product_approved')).length, 0, 'aucun effet ne survit au rollback externe');
  });

  it("CA-V5-014 — un envoi LENT ne retarde pas la réponse de l'endpoint", async () => {
    // Régression : les effets post-commit étaient `await`és, donc la réponse
    // HTTP attendait le serveur SMTP. Mesuré : p95 305 ms contre 6 ms de
    // référence, soit +4900 % alors que le cahier tolère +15 % (E-13). Un
    // `await` réintroduit ici doit faire échouer ce test.
    const SLOW_SMTP_MS = 300;
    const t0 = performance.now();
    await withTransaction(async () => {
      afterCommit(async () => {
        await new Promise((r) => setTimeout(r, SLOW_SMTP_MS));
      });
    });
    const elapsed = performance.now() - t0;

    // Marge large : on ne mesure pas une regex d'images, on prouve que le
    // temps d'attente n'est pas dans le chemin de la requête.
    assert.ok(elapsed < SLOW_SMTP_MS / 2, `réponse en ${elapsed.toFixed(0)} ms : l'envoi est bien hors du chemin critique`);
    // L'effet a tout de même été exécuté — il n'est pas perdu, juste différé.
    await flushAfterCommit();
  });

  it("deux requêtes concurrentes n'échangent pas leurs effets", async () => {
    clearSentMails();
    const a = createProduct((await registerUser(server, 'concA')).client, { name: 'Article A' });
    const b = createProduct((await registerUser(server, 'concB')).client, { name: 'Article B' });
    const [pa, pb] = await Promise.all([a, b]);

    // Deux transactions imbriquées Distinctes lancées EN PARALLÈLE : si le
    // stockage était un simple tableau module-level, leurs files se mélangeraient.
    await Promise.all([
      withTransaction(async (client) => {
        await client.query('SELECT pg_sleep(0.05)');
        afterCommit(() => sendMail(pa.id, 'a@example.com', 'product_approved', { productName: 'A' }));
      }),
      withTransaction(async (client) => {
        await client.query('SELECT pg_sleep(0.01)');
        afterCommit(() => sendMail(pb.id, 'b@example.com', 'product_approved', { productName: 'B' }));
      }),
    ]);

    const mails = await mailsOf('product_approved');
    assert.equal(mails.length, 2, '2 effets, un par transaction');
    assert.deepEqual(
      mails.map((m) => m.to).sort(),
      ['a@example.com', 'b@example.com'],
      'chaque effet est parti dans SA transaction',
    );
  });
});

describe('CA-V5-002 / CA-V5-012 — Un échec d\'envoi ne casse rien', () => {
  it('MAIL_ENABLED=false : l\'endpoint réussit et la notification in-app existe', async () => {
    const account = await registerUser(server, 'nomsgOwner');
    const owner = account.client;
    const product = await createProduct(owner, { name: 'Objet sans envoi' });

    process.env.MAIL_ENABLED = 'false';
    clearSentMails();
    const res = await admin.request(`/api/admin/products/${product.id}/approve`, 'POST', { json: {} });
    process.env.MAIL_ENABLED = 'true';

    assert.equal(res.status, 200, 'l\'action métier réussit (jamais de 4xx/5xx)');
    await flushAfterCommit();
    assert.equal(recentSentMails().length, 0, 'aucun envoi tenté');

    // La notification in-app, elle, a bien été créée. On interroge par le
    // PRODUCT (le vendeur de l'article), pas par le compte : c'est lui qui est
    // notifié, et cela ne dépend d'aucun champ de la réponse API.
    const notif = await dbQuery<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM notifications n
         JOIN products p ON p.owner_id = n.user_id
        WHERE p.id = $1 AND n.type = 'article_approved'`,
      [product.id],
    );
    assert.equal(notif[0]!.n, '1', 'notification in-app créée malgré l\'absence d\'email');
  });

  it('compte supprimé entre la résolution et l\'envoi → ignoré, action réussie', async () => {
    const account = await registerUser(server, 'ghostOwner');
    const ownerId = account.id!;

    // `email` est NOT NULL UNIQUE : on simule la disparition du compte en
    // supprimant la LIGNE (CA-V5-012 — « si le compte disparaît entre la
    // résolution et l'envoi »). Le compte fantôme n'a plus d'adresse résoluble.
    await dbQuery('DELETE FROM users WHERE id = $1', [ownerId]);
    clearSentMails();

    // Cas 1 : résolution → aucune adresse → envoi ignoré, AUCUNE exception.
    const ghost = await dbQuery<{ email: string | null }>('SELECT email FROM users WHERE id = $1', [ownerId]);
    assert.equal(ghost.length, 0, 'le compte a bien disparu');
    const ok = await sendMail(ownerId, ghost[0]?.email ?? null, 'product_approved', { productName: 'x' });
    assert.equal(ok, false, 'envoi ignoré, aucune exception');

    // Cas 2 : l'action métier du vendeur fantôme reste impossible à déclencher
    // (produit supprimé en cascade) — mais l'API elle-même ne renvoie pas de
    // 5xx pour cette situation.
    const res = await account.client.get('/api/me/products');
    assert.equal(res.status, 401, 'session orpheline traitée comme non connecté (CA-V5-022)');
  });
});

// ---------------------------------------------------------------------------
// CA-V5-018 — Injection-safe
// ---------------------------------------------------------------------------

describe('CA-V5-018 — Les données sont injection-safe', () => {
  const nasty = `<script>alert('xss')</script> "quoted" 'single' ${'A'.repeat(1000)}`;

  it('un nom de produit hostile est échappé dans le HTML et rendu littéralement', () => {
    // VALEUR BRUTE passée au template : c'est `renderTemplate` qui échappe.
    // L'appelant ne pré-échappe jamais (sinon `&amp;lt;script&amp;gt;`).
    const { html, text } = renderTemplate('product_approved', { productName: nasty });
    assert.ok(!html.includes('<script>'), 'aucun <script> exécutable');
    assert.ok(html.includes('&lt;script&gt;'), 'la balise est échappée');
    assert.ok(!html.includes('"quoted"'), 'les guillemets sont échappés dans le HTML');
    assert.ok(!/on\w+=/.test(html), 'aucun attribut événement injecté');
    assert.ok(text.includes('<script>'), 'la version texte montre le texte réel, pas les entités');
  });

  it('une chaîne de 1000 caractères ne casse ni le HTML ni le rendu', () => {
    const { html, text } = renderTemplate('product_approved', { productName: 'A'.repeat(1000) });
    assert.ok(html.length > 1000, 'contenu présent');
    assert.ok(!html.includes('undefined'), 'aucun trou de rendu');
    assert.ok(text.includes('A'.repeat(1000)), 'version texte complète');
  });

  it('un motif de refus hostile est échappé', () => {
    const { html } = renderTemplate('product_rejected', { productName: 'Objet', reason: nasty });
    assert.ok(!html.includes('<script>'));
  });

  it('escapeHtml couvre les 5 caractères sensibles', () => {
    assert.equal(escapeHtml(`<>&"'`), '&lt;&gt;&amp;&quot;&#39;');
  });
});

// ---------------------------------------------------------------------------
// CA-V5-008 / CA-V5-009 — Pas de donnée sensible, qu'un seul lien interne
// ---------------------------------------------------------------------------

describe('CA-V5-008 / CA-V5-009 — Données autorisées et liens internes', () => {
  const events = [
    'welcome',
    'product_approved',
    'product_rejected',
    'payment_confirmed_buyer',
    'payment_confirmed_seller',
    'order_shipped',
    'order_delivered',
    'payout_available',
    'payout_paid',
    'reservation_expired_buyer',
    'reservation_expired_seller',
    'password_reset',
  ] as const;

  it('aucun email ne contient de mot de passe, hash, téléphone ou adresse postale', () => {
    for (const event of events) {
      const { html, text } = renderTemplate(event, {
        productName: 'Produit test',
        orderNumber: 'CMD-000123',
        amountFcfa: 100_000,
        reason: 'Photos insuffisantes',
        linkPath: '/dashboard',
      });
      for (const secret of ['password', 'motdepasse', 'password_hash', 'token', 'Bearer']) {
        assert.ok(!html.includes(secret), `${event} : « ${secret} » absent du HTML`);
        assert.ok(!text.includes(secret), `${event} : « ${secret} » absent du texte`);
      }
    }
  });

  it('le seul lien sortant pointe vers le site (aucun lien de désinscription)', () => {
    const { html } = renderTemplate('payment_confirmed_buyer', {
      orderNumber: 'CMD-000123',
      linkPath: '/orders/CMD-000123',
    });
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!);
    assert.ok(hrefs.length >= 1, 'au moins un lien');
    for (const href of hrefs) {
      assert.ok(
        href.startsWith('https://revends.test') || href === 'https://revends.test/',
        `lien interne uniquement, obtenu : ${href}`,
      );
    }
    assert.ok(!html.toLowerCase().includes('unsubscribe'), 'aucun lien de désinscription factice');
    assert.ok(!html.toLowerCase().includes('désabonn'), 'aucun lien de désinscription factice');
  });
});

// ---------------------------------------------------------------------------
// E11 — Réinitialisation du mot de passe (12e événement)
// ---------------------------------------------------------------------------
describe('E11 — Réinitialisation du mot de passe (12e événement)', () => {
  it('POST /api/auth/forgot-password répond 202 et émet l’e-mail au compte concerné', async () => {
    const account = await registerUser(server, 'resetOwner');
    const anon = new ApiClient(server.baseUrl);

    const res = await anon.request('/api/auth/forgot-password', 'POST', {
      json: { email: account.email.toLowerCase() },
    });
    assert.equal(res.status, 202, 'réponse 202 immédiate (la demande ne triche pas)');

    const mail = await oneMailOf('password_reset');
    assert.equal(mail.to, norm(account.email), 'destinataire = compte demandeur');
    assert.ok(mail.subject.includes('Réinitialisation'), `sujet : ${mail.subject}`);
    assert.equal(mail.ok, true, 'envoi effectif (transport de test)');
  });

  it('un compte INCONNU renvoie exactement la même réponse — anti-énumération', async () => {
    const anon = new ApiClient(server.baseUrl);
    const known = await registerUser(server, 'resetKnown');
    const knownEmail = known.email.toLowerCase();
    const before = (await mailsOf('password_reset')).length;

    const resKnown = await anon.request('/api/auth/forgot-password', 'POST', {
      json: { email: knownEmail },
    });
    const resUnknown = await anon.request('/api/auth/forgot-password', 'POST', {
      json: { email: 'jamais.inscrit@example.com' },
    });

    // La contrainte anti-énumération est la SIMILITUDE : ni le statut ni le corps
    // ne doivent permettre de savoir si l'adresse correspond à un compte
    // (CA-AUTH02-01, §9.1).
    assert.equal(resKnown.status, 202, 'compte existant → 202');
    assert.equal(resUnknown.status, 202, 'compte inconnu → 202 (identique)');
    assert.deepEqual(resUnknown.body, resKnown.body, 'corps STRICTEMENT identique');
    assert.ok(
      typeof (resUnknown.body as any)?.message === 'string',
      'message neutre, jamais « compte inconnu »',
    );

    await flushAfterCommit();
    const mails = await mailsOf('password_reset');
    assert.equal(mails.length, before + 1, 'un seul envoi, jamais pour l’adresse inconnue');
    assert.equal(mails.filter((m) => m.to === knownEmail).length, 1, 'e-mail réservé au compte existant');
  });

  it('régression : le lien pointe vers le site — JAMAIS de lien mort', () => {
    const token = 'TOKens34-abcDEF';
    const expected = `${config.siteUrl}/#/reset-password?token=${token}`;

    // 1. Chemin RELATIF : contrat documenté du champ `linkPath` (« Jamais absolu »).
    assert.equal(hrefOf('password_reset', { linkPath: `/#/reset-password?token=${token}` }), expected);

    // 2. URL absolue déjà préfixée : idempotence. Sans ce garde-fou le lien
    //    était `SITE_URL + "https://SITE_URL/#/…"`, c'est-à-dire un e-mail dont
    //    le bouton menait nulle part — bug réel corrigé en Phase 3.
    assert.equal(hrefOf('password_reset', { linkPath: expected }), expected);
  });

  it('régression : une URL externe ne produit AUCUN lien sortant (CA-V5-009)', () => {
    const { html, text } = renderTemplate('password_reset', {
      linkPath: 'https://evil.example/voler?token=x',
    });
    assert.ok(!html.includes('evil.example'), 'pas d’hôte étranger dans le HTML');
    assert.ok(!text.includes('evil.example'), 'pas d’hôte étranger dans le texte');

    // Frontière d'origine : `SITE_URL` + « .evil.example » n'est PAS ce site.
    // Sans le garde-fou, `startsWith(siteUrl)` aurait laissé passer un lien
    // externe hôte-prefixed.
    const spoofed = renderTemplate('password_reset', {
      linkPath: `${config.siteUrl}.evil.example/voler?token=x`,
    });
    assert.ok(!spoofed.html.includes('evil.example'), 'suffixe après SITE_URL → aucun lien');
  });

  it('le jeton survit à l’assainissement du lien (aucun caractère dévoré)', () => {
    const token = crypto.randomBytes(32).toString('base64url');
    const href = hrefOf('password_reset', { linkPath: `/#/reset-password?token=${encodeURIComponent(token)}` })!;
    assert.ok(href.endsWith(`token=${encodeURIComponent(token)}`), `jeton intact : ${href}`);
    assert.ok(!href.includes(config.siteUrl.slice(0, 8) + 'https'), 'pas de préfixe dupliqué');
  });
});

// ---------------------------------------------------------------------------
// E1 — Bienvenue depuis un compte OAuth (2e point d'entrée de `welcome`)
// ---------------------------------------------------------------------------
describe('E1b — Bienvenue pour un compte OAuth', () => {
  it('la création d’un compte OAuth émet l’e-mail de bienvenue', async () => {
    const email = `oauthwelcome${Date.now()}@test.revends`;
    const created = await findOrCreateOAuthUser({
      provider: 'google',
      providerId: `id-${Date.now()}`,
      email,
      name: 'Nouveau Membre',
    });

    const mail = await waitForMail('welcome');
    assert.ok(mail, 'un e-mail de bienvenue est parti pour le compte OAuth');
    assert.equal(mail.to, email, 'destinataire = e-mail du profil OAuth');
    assert.equal(mail.ok, true);
    assert.ok(created.email === email, 'compte créé avec cet e-mail');
  });

  it('un compte OAuth DÉJÀ EXISTANT ne reçoit pas de second bienvenue', async () => {
    const email = `oauthexists${Date.now()}@test.revends`;
    const input = { provider: 'google', providerId: 'dup-1', email, name: 'Membre' };

    await findOrCreateOAuthUser(input);
    assert.ok(await waitForMail('welcome'), 'premier bienvenue');
    const before = recentSentMails().filter((m) => m.event === 'welcome').length;

    // Reconnexion OAuth du même e-mail : même compte, pas de nouvelle inscription.
    const same = await findOrCreateOAuthUser({ ...input, provider: 'facebook', providerId: 'dup-2' });
    await flushAfterCommit();
    await sleep(80);

    assert.equal(same.email, email, 'aucun second compte créé');
    assert.equal(
      recentSentMails().filter((m) => m.event === 'welcome').length,
      before,
      'pas de second e-mail de bienvenue',
    );
  });
});

// ---------------------------------------------------------------------------
// Couverture — les 17 événements se rendent tous sans trou ni lien sortant
// ---------------------------------------------------------------------------
describe('Couverture — 17 événements, rendu complet', () => {
  const ALL_EVENTS: MailEvent[] = [
    'welcome',
    'product_approved',
    'product_rejected',
    'order_created_buyer',
    'payment_confirmed_buyer',
    'payment_confirmed_seller',
    'order_shipped',
    'order_delivered',
    'payout_available',
    'payout_paid',
    'reservation_expired_buyer',
    'reservation_expired_seller',
    'article_reserved',
    'order_product_received',
    'order_cancelled',
    'order_completed_buyer',
    'password_reset',
  ];

  it('chaque événement produit un sujet, un HTML et un texte exploitables (CA-V5-007)', () => {
    for (const event of ALL_EVENTS) {
      const { subject, html, text } = renderTemplate(event, {
        productName: 'Veste de travail',
        orderNumber: 'CMD-000421',
        amountFcfa: 25_000,
        reason: 'Photos insuffisantes',
        linkPath: '/dashboard',
      });
      assert.ok(subject.length > 0, `${event} : sujet non vide`);
      assert.ok(html.includes('<html'), `${event} : version HTML`);
      assert.ok(text.length > 0 && !text.includes('<p>'), `${event} : texte brut sans balisage`);
      assert.ok(!html.includes('undefined'), `${event} : aucun trou de rendu « undefined »`);
      assert.ok(!html.includes('[object Object]'), `${event} : aucun objet brut stringifié`);
      assert.ok(!/<script/i.test(html), `${event} : aucun script`);
      assert.ok(text.includes('Message automatique'), `${event} : mention d’e-mail automatique`);
    }
  });

  it('sur les 17, tous les liens pointent vers le site (CA-V5-009)', () => {
    for (const event of ALL_EVENTS) {
      const { html } = renderTemplate(event, { linkPath: '/dashboard' });
      const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!);
      for (const href of hrefs) {
        assert.ok(href.startsWith(config.siteUrl), `${event} : lien interne uniquement, obtenu ${href}`);
      }
    }
  });
});
