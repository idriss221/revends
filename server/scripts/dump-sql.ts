import '../test/env.js';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { resetDatabaseAndSeed } from '../test/bootstrap.js';
import type { Server } from 'node:http';

let on = false; const log: string[] = [];
const real = pool.query.bind(pool);
(pool as { query: unknown }).query = (t: unknown, p?: unknown) => {
  if (on) log.push(String(t).replace(/\s+/g, ' ').slice(0, 78));
  return (real as any)(t, p);
};
class C { private ck = new Map<string,string>();
  constructor(private b: string) {}
  async r(p: string, m='GET', j?: unknown) { const h: Record<string,string>={connection:'close'};
    if (this.ck.size) h['cookie']=[...this.ck].map(([k,v])=>`${k}=${v}`).join('; ');
    if (j!==undefined) h['content-type']='application/json';
    const r = await fetch(`${this.b}${p}`,{method:m,headers:h,body:j===undefined?undefined:JSON.stringify(j),redirect:'manual'});
    for (const c of r.headers.getSetCookie?.() ?? []) { const [kv]=c.split(';'); const i=kv!.indexOf('=');
      const k=kv!.slice(0,i), v=kv!.slice(i+1); if (v===''||/expires=thu, 01 jan 1970/i.test(c)) this.ck.delete(k); else this.ck.set(k,v); }
    const t = await r.text(); return { status: r.status, body: t?JSON.parse(t):null }; } }

await resetDatabaseAndSeed();
const app = createApp();
const server: Server = await new Promise(s => { const x = app.listen(0, () => s(x)); });
const base = `http://127.0.0.1:${(server.address() as any).port}`;
const admin = new C(base);
await admin.r('/api/auth/login','POST',{identifier:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD});
const s = new C(base);
const rr = await s.r('/api/auth/register','POST',{displayName:'Vendeur0',name:'Nom Complet Vendeur 0',email:'vendeur0@test.revends',phone:'+22507000000',password:'Motdepasse1!',acceptedCgu:true});
const uid = rr.body.user.id;
await pool.query(`INSERT INTO products (owner_id,category_id,name,slug,description,condition,price,location,status,created_at,approved_at,approved_by)
  SELECT $1,13,'Article'||i,'art-'||i,'Description suffisamment longue pour la validation.','Bon état',10000+i,'Abidjan','AVAILABLE',now(),now(),$1 FROM generate_series(1,3) i`,[uid]);
await pool.query(`INSERT INTO product_images (product_id,path,is_primary,position) SELECT p.id,'u/p'||p.id,pos=1,pos FROM products p, generate_series(1,2) pos`);
for (const [label, path, cli] of [
  ['GET /api/admin/stats', '/api/admin/stats', admin],
  ['GET /api/me/products (3 articles)', '/api/me/products', s],
] as const) {
  log.length = 0; on = true; const res = await cli.r(path); on = false;
  console.log(`\n### ${label} → HTTP ${res.status} — ${log.length} requêtes`);
  log.forEach((q,i)=>console.log(`  ${String(i+1).padStart(2)}. ${q}`));
}
server.close(); await pool.end();
