/**
 * Infrastructure partagée des tests d'intégration :
 * - `ApiClient` : client HTTP avec cookie jar (session HTTP-only) — fetch natif.
 * - `startTestServer` : app Express sur port éphémère.
 * - Helpers fixtures (faux JPEG/PNG, inscription, produit multi-photos…).
 */
import './env.js';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { resetDatabaseAndSeed } from './bootstrap.js';

export { resetDatabaseAndSeed };

// ---------------------------------------------------------------------------
// Client HTTP avec gestion de session (cookies connect.sid)
// ---------------------------------------------------------------------------

export interface ApiResponse<T = any> {
  status: number;
  headers: Headers;
  body: T;
}

export class ApiClient {
  readonly baseUrl: string;
  private cookies = new Map<string, string>();

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async request<T = any>(
    path: string,
    method: string,
    opts: { json?: unknown; form?: FormData } = {},
  ): Promise<ApiResponse<T>> {
    const headers = new Headers({ connection: 'close' });
    const cookieStr = [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    if (cookieStr) headers.set('cookie', cookieStr);

    let body: BodyInit | undefined;
    if (opts.json !== undefined) {
      headers.set('content-type', 'application/json');
      body = JSON.stringify(opts.json);
    } else if (opts.form) {
      body = opts.form; // FormData fixe son propre multipart/boundary
    }

    const res = await fetch(`${this.baseUrl}${path}`, { method, headers, body, redirect: 'manual' });
    this.captureCookies(res.headers);

    let data: T | undefined;
    const text = await res.text();
    if (text) {
      try {
        data = JSON.parse(text) as T;
      } catch {
        data = text as T;
      }
    }
    return { status: res.status, headers: res.headers, body: data as T };
  }

  /** Cookies retirés (ex. logout → connect.sid vide) ou posés (login/register). */
  private captureCookies(headers: Headers): void {
    const raw = headers.get('set-cookie');
    if (!raw) return;
    // Format standard d'express-session : "connect.sid=abc; Path=/; HttpOnly" ; plusieurs cookies ", ".
    for (const chunk of raw.split(',')) {
      const pair = chunk.trim().split(';')[0];
      if (!pair) continue;
      const eq = pair.indexOf('=');
      if (eq <= 0) continue;
      const key = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (key && value) this.cookies.set(key, value);
      else if (key) this.cookies.delete(key);
    }
  }

  // Raccourcis
  get<T = any>(path: string) {
    return this.request<T>(path, 'GET');
  }
  post<T = any>(path: string, json?: unknown) {
    return this.request<T>(path, 'POST', json === undefined ? {} : { json });
  }
}

// ---------------------------------------------------------------------------
// Serveur de test
// ---------------------------------------------------------------------------

export interface ServerHandle {
  baseUrl: string;
  newClient: () => ApiClient;
  close: () => Promise<void>;
}

/** BDD fraîche (DDL + seed) PUIS serveur sur port éphémère. */
export async function bootTestServer(): Promise<ServerHandle> {
  await resetDatabaseAndSeed();
  return startTestServer();
}

/** Démarre l'app sur un port éphémère. `newClient` produit des ApiClient avec cookie jar. */
export async function startTestServer(): Promise<ServerHandle> {
  const app = createApp();
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const address = server.address();
  if (typeof address !== 'object' || !address) {
    throw new Error('listen(0) : adresse non résolue');
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const close = () =>
    new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections?.();
    });
  return { baseUrl, newClient: () => new ApiClient(baseUrl), close };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Vrai en-tête JPEG (magic bytes) — le serveur vérifie le MIME réel §9.6. */
export function jpegBuffer(extra = 4): Buffer {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(extra).fill(0x00)]);
}
export function pngBuffer(): Buffer {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}
export function webpBuffer(): Buffer {
  return Buffer.from([0x52, 0x49, 0x46, 0x46, 0x0, 0x0, 0x0, 0x0, 0x57, 0x45, 0x42, 0x50]);
}
export const invalidBuffer = Buffer.from('hello world, pas une image');

export interface TestUser {
  client: ApiClient;
  displayName: string;
  email: string;
  phone: string;
  password: string;
  id?: number;
}

const counter = (() => {
  let n = 0;
  return () => ++n;
})();

/** Inscription via l'API (session posée immédiatement). */
export async function registerUser(server: { baseUrl: string }, prefix = 'user'): Promise<TestUser> {
  const client = new ApiClient(server.baseUrl);
  const n = counter();
  // Le regex serveur du pseudo n'accepte que lettres/chiffres/espaces (RG-PROD) :
  // on assainit le préfixe (ex. 'role-user' → 'roleuser') pour ne jamais échouer.
  const label = prefix.replace(/[^a-zA-Z0-9]+/g, '');
  const user: TestUser = {
    client,
    displayName: `${label}${n}`,
    email: `${prefix}${n}@test.revends`,
    phone: `+225 07 00 00 ${String(n).padStart(4, '0')}`,
    password: `motdepasse${n}!`,
  };
  const res = await client.request('/api/auth/register', 'POST', {
    json: {
      displayName: user.displayName,
      name: `Nom ${prefix} ${n}`,
      email: user.email,
      phone: user.phone,
      password: user.password,
      acceptedCgu: true,
    },
  });
  if (res.status !== 201) {
    throw new Error(`register ${user.email} → ${res.status} ${JSON.stringify(res.body)}`);
  }
  user.id = (res.body as any).user?.id as number;
  return user;
}

/** Connexion admin (seed). */
export async function loginAdmin(server: { baseUrl: string }, password = 'AdminTestPass123!'): Promise<ApiClient> {
  const client = new ApiClient(server.baseUrl);
  const res = await client.request('/api/auth/login', 'POST', {
    json: { identifier: 'admin@revends.com', password },
  });
  if (res.status !== 200) {
    throw new Error(`login admin → ${res.status} ${JSON.stringify(res.body)}`);
  }
  return client;
}

export interface ProductFields {
  name: string;
  categoryId: number;
  subcategoryId: number;
  condition: string;
  price: number;
  oldPrice?: number; // V4 — prix barré (RG-PROD-2)
  location: string;
  description: string;
  brand?: string;
  model?: string;
  ageYears?: number;
}

export function productForm(fields: ProductFields, photos?: Buffer[]): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) fd.append(k, String(v));
  }
  const files = photos ?? [jpegBuffer(), jpegBuffer(), jpegBuffer()];
  files.forEach((buf, i) => {
    fd.append('photos', new Blob([buf], { type: 'image/jpeg' }), `photo-${i + 1}.jpg`);
  });
  return fd;
}

export const DEFAULT_FIELDS: ProductFields = {
  name: 'Article de test standard',
  categoryId: 3, // Électronique
  subcategoryId: 13, // Téléphones & tablettes (parent = 3)
  condition: 'Bon état',
  price: 100_000,
  location: 'Abidjan, Cocody',
  description: 'Article de test avec une description valide.',
};

/** Crée un produit (POST multipart), retourne id + slug. */
export async function createProduct(
  owner: ApiClient,
  fields: Partial<ProductFields> = {},
  photos?: Buffer[],
): Promise<{ id: number; slug: string; product: any }> {
  const res = await owner.request('/api/products', 'POST', {
    form: productForm({ ...DEFAULT_FIELDS, ...fields }, photos),
  });
  if (res.status !== 201) {
    throw new Error(`createProduct → ${res.status} ${JSON.stringify(res.body)}`);
  }
  const product = (res.body as any).product as any;
  return { id: product.id, slug: product.slug, product };
}

/** Crée un produit et l'approuve (PENDING → AVAILABLE). */
export async function createApprovedProduct(
  owner: ApiClient,
  admin: ApiClient,
  fields: Partial<ProductFields> = {},
  photos?: Buffer[],
): Promise<{ id: number; slug: string; product: any }> {
  const created = await createProduct(owner, fields, photos);
  const appr = await admin.request(`/api/admin/products/${created.id}/approve`, 'POST', { json: {} });
  if (appr.status !== 200) {
    throw new Error(`approve → ${appr.status} ${JSON.stringify(appr.body)}`);
  }
  return created;
}

/** Crée une commande (POST /api/orders) via l'API. */
export async function createOrder(
  buyer: ApiClient,
  productId: number,
  paymentMethod = 'MOBILE_MONEY',
): Promise<{ status: number; body: any }> {
  const res = await buyer.request('/api/orders', 'POST', { json: { productId, paymentMethod } });
  return { status: res.status, body: res.body as any };
}

/** Interroge la base de test. */
export async function dbQuery<T extends Record<string, any> = any>(text: string, params?: unknown[]): Promise<T[]> {
  const { rows } = await pool.query<T>(text, params);
  return rows;
}

/** Extrait le code erreur uniforme `{ error: { code } }`. */
export function errorCode(body: any): string {
  return body?.error?.code;
}

/** Vérifie que l'objet utilisateur public (seller/buyer) ne fuit pas de coordonnées. */
export function assertPublicUserClean(user: any, where: string): void {
  assert(user, `${where}: user absent`);
  const keys = Object.keys(user);
  for (const forbidden of ['name', 'email', 'phone']) {
    if (keys.includes(forbidden)) {
      throw new Error(`champ privé "${forbidden}" exposé dans ${where} : ${JSON.stringify(user)}`);
    }
  }
}