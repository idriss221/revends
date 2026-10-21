/**
 * Mesure du nombre de requêtes SQL par endpoint (CA-V5-071/072).
 * Instrumenté au niveau du pool singleton : `pool.query` est patché AVANT
 * la création de l'app, puis chaque endpoint est appelé avec deux tailles
 * de page (1 et 48) pour prouver que le budget ne CROÎT PAS.
 *
 * Usage : node --import tsx scripts/measure-queries.ts
 */
import './../test/env.js';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { resetDatabaseAndSeed } from '../test/bootstrap.js';
import type { Server } from 'node:http';

let counter = 0;
let on = false;
const realQuery = pool.query.bind(pool);
(pool as { query: unknown }).query = (...args: unknown[]) => {
  if (on) counter++;
  return (realQuery as (...a: unknown[]) => unknown)(...args);
};

class Client {
  private cookies = new Map<string, string>();
  constructor(private baseUrl: string) {}
  async req(path: string, method = 'GET', json?: unknown): Promise<{ status: number; body: any }> {
    const headers: Record<string, string> = { connection: 'close' };
    if (this.cookies.size) headers['cookie'] = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    if (json !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: json === undefined ? undefined : JSON.stringify(json),
      redirect: 'manual',
    });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [kv] = c.split(';');
      const i = kv!.indexOf('=');
      const k = kv!.slice(0, i);
      const v = kv!.slice(i + 1);
      if (v === '' || /expires=thu, 01 jan 1970/i.test(c)) this.cookies.delete(k);
      else this.cookies.set(k, v);
    }
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }
}

async function measure(
  label: string,
  client: Client,
  pathFor: (perPage: number) => string,
): Promise<void> {
  const out: string[] = [];
  for (const perPage of [1, 48]) {
    on = false;
    counter = 0;
    on = true;
    const res = await client.req(pathFor(perPage));
    on = false;
    const n = res.status === 200 ? counter : -1;
    out.push(`per_page=${String(perPage).padStart(2)} → ${n === -1 ? `HTTP ${res.status}` : `${n} req`}`);
  }
  console.log(`  ${label.padEnd(34)} ${out.join('   |   ')}`);
}

async function main(): Promise<void> {
  await resetDatabaseAndSeed();
  const app = createApp();
  const server: Server = await new Promise((r) => {
    const s = app.listen(0, () => r(s));
  });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

  const admin = new Client(base);
  await admin.req('/api/auth/login', 'POST', {
    identifier: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  });

  // 5 vendeurs + 5 acheteurs via l'API (session réelle)
  const ids: number[] = [];
  for (let s = 0; s < 5; s++) {
    const c = new Client(base);
    const r = await c.req('/api/auth/register', 'POST', {
      displayName: `Vendeur${s}`,
      name: `Nom Complet Vendeur ${s}`,
      email: `vendeur${s}@test.revends`,
      phone: `+2250700000${String(s).padStart(2, '0')}`,
      password: 'Motdepasse1!',
      acceptedCgu: true,
    });
    ids.push(r.body.user.id);
    if (s === 0) ids.push(-1); // place-holder
    if (s === 0) ids.length = 1;
  }
  // acheteur
  const buyer = new Client(base);
  const br = await buyer.req('/api/auth/register', 'POST', {
    displayName: 'Acheteur',
    name: 'Nom Complet Acheteur',
    email: 'acheteur@test.revends',
    phone: '+22507999999',
    password: 'Motdepasse1!',
    acceptedCgu: true,
  });
  const buyerId = br.body.user.id as number;

  // 60 produits APPROUVES (direct SQL : photos, catégories, etc.)
  await pool.query(
    `INSERT INTO products (owner_id, category_id, name, slug, description, condition, price, old_price,
                           location, status, view_count, created_at, approved_at, approved_by)
     SELECT $1 + (i % 5), 13, 'Article '||i, 'art-'||i,
            'Description suffisamment longue pour la validation serveur du produit.',
            'Bon état', 10000 + i*100,
            CASE WHEN i % 4 = 0 THEN 10000 + i*100 + 4000 ELSE NULL END,
            'Abidjan', 'AVAILABLE', i, now() - (i || ' hours')::interval, now(), $2
     FROM generate_series(1,60) i`,
    [ids[0], ids[0]],
  );
  // 2 photos par produit (dont 1 principale)
  await pool.query(
    `INSERT INTO product_images (product_id, path, is_primary, position)
     SELECT p.id, 'uploads/products/x'||p.id||'-'||n, n = 1, n
     FROM products p, generate_series(1,2) n`,
  );
  // 60 commandes réparties, avec events/paiements/payouts
  await pool.query(
    `INSERT INTO orders (product_id, buyer_id, seller_id, amount, commission, seller_amount, status, created_at)
     SELECT p.id, $1, p.owner_id, p.price, floor(p.price*0.1), p.price - floor(p.price*0.1),
            (ARRAY['CREATED','PAYMENT_PENDING','PAID','PRODUCT_WAITING','PRODUCT_RECEIVED','PREPARING',
                   'SHIPPED','IN_DELIVERY','DELIVERED','COMPLETED']::order_status[])[1 + (p.id % 10)],
            now() - (p.id || ' hours')::interval
     FROM products p`,
    [buyerId],
  );
  await pool.query(
    `INSERT INTO order_events (order_id, from_status, to_status, actor)
     SELECT id, NULL, status, 'system' FROM orders`,
  );
  await pool.query(
    `INSERT INTO payments (order_id, amount, method, status)
     SELECT id, amount, 'MOBILE_MONEY', 'PENDING' FROM orders`,
  );
  await pool.query(
    `INSERT INTO seller_payouts (order_id, seller_id, amount, status)
     SELECT id, seller_id, seller_amount, 'DUE' FROM orders WHERE status IN ('DELIVERED','COMPLETED')`,
  );
  await pool.query(
    `INSERT INTO notifications (user_id, type, title, message, read_at, created_at)
     SELECT $1, 'order_created', 'N'||i, 'message', CASE WHEN i % 2 = 0 THEN now() END, now()
     FROM generate_series(1,20) i`,
    [buyerId],
  );

  const seller = new Client(base);
  await seller.req('/api/auth/login', 'POST', { identifier: 'vendeur0@test.revends', password: 'Motdepasse1!' });

  console.log('\n=== Budget de requêtes SQL par endpoint (avant V5, code actuel) ===');
  console.log('    endpoint                              per_page=1 vs 48\n');
  await measure('GET /api/products (recent)', new Client(base), (p) => `/api/products?per_page=${p}`);
  await measure('GET /api/products?ids=…', new Client(base), (p) =>
    `/api/products?ids=${Array.from({ length: Math.min(p, 10) }, (_, i) => i + 1).join(',')}`,
  );
  await measure('GET /api/products/:slug', new Client(base), () => '/api/products/art-1');
  await measure('GET /api/me/products', seller, () => '/api/me/products');
  await measure('GET /api/admin/products', admin, (p) => `/api/admin/products?status=AVAILABLE&per_page=${p}`);
  await measure('GET /api/admin/orders', admin, (p) => `/api/admin/orders?per_page=${p}`);
  await measure('GET /api/me/orders', buyer, () => '/api/me/orders');
  await measure('GET /api/me/sales', seller, () => '/api/me/sales');
  await measure('GET /api/admin/stats', admin, () => '/api/admin/stats');
  await measure('GET /api/admin/orders/:id', admin, () => '/api/admin/orders/1');

  server.close();
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
