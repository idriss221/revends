import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { query } from '../db/pool.js';
import { pool } from '../db/pool.js';
import { findByEmail } from '../repositories/users.repository.js';
import { sendMail } from '../mail/mailer.js';
import type { UserRow } from '../utils/serializers.js';

const BCRYPT_COST = 10;
const PHONE_REGEX = /^\+?[0-9 ]{8,20}$/;

function generateSyntheticPhone(): string {
  // Generate +225 followed by 8 random digits
  let digits = '';
  for (let i = 0; i < 8; i++) {
    digits += Math.floor(Math.random() * 10).toString();
  }
  return `+225${digits}`;
}

function sanitizeDisplayName(name: string | undefined, email: string): string {
  const base = name?.trim() || email.split('@')[0] || 'Utilisateur';
  // Remove non-allowed chars, keep alphanumeric and spaces, convert to chars preserving accents? regex says A-Za-zÀ-ÿ0-9 space
  const cleaned = base
    .replace(/[^A-Za-zÀ-ÿ0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  let result = cleaned;
  if (result.length < 2) {
    result = 'Utilisateur';
  }
  if (result.length > 50) {
    result = result.slice(0, 50);
  }
  return result;
}

function sanitizeName(name: string | undefined): string {
  const base = name?.trim() || 'Utilisateur';
  if (base.length > 100) {
    return base.slice(0, 100);
  }
  if (base.length < 1) {
    return 'Utilisateur';
  }
  return base;
}

async function generateUniquePhone(): Promise<string> {
  for (let attempts = 0; attempts < 10; attempts++) {
    const phone = generateSyntheticPhone();
    const { rows } = await pool.query('SELECT id FROM users WHERE phone = $1', [phone]);
    if (rows.length === 0) {
      return phone;
    }
  }
  // Fallback: add random chars if still colliding (rare)
  for (let attempts = 0; attempts < 50; attempts++) {
    const phone = generateSyntheticPhone();
    // try to insert - if unique violation, retry
    if (PHONE_REGEX.test(phone)) {
      const { rows } = await pool.query('SELECT id FROM users WHERE phone = $1', [phone]);
      if (rows.length === 0) {
        return phone;
      }
    }
  }
  // Last resort
  return generateSyntheticPhone();
}

async function generateUniqueDisplayName(base: string): Promise<string> {
  let candidate = base;
  for (let i = 1; i <= 20; i++) {
    const { rows } = await pool.query('SELECT id FROM users WHERE display_name = $1', [candidate]);
    if (rows.length === 0) {
      return candidate;
    }
    const suffix = i.toString();
    const maxLen = 50 - suffix.length - 1;
    candidate = `${base.slice(0, maxLen)}_${suffix}`;
  }
  return `${base.slice(0, 40)}_${Date.now()}`;
}

export interface OAuthUserInput {
  provider: string;
  providerId: string;
  email: string;
  name?: string;
}

export async function findOrCreateOAuthUser(input: OAuthUserInput): Promise<UserRow> {
  const email = input.email.trim().toLowerCase();
  const existing = await findByEmail(email);
  if (existing) {
    return existing;
  }

  const baseDisplayName = sanitizeDisplayName(input.name, email);
  const displayName = await generateUniqueDisplayName(baseDisplayName);
  const name = sanitizeName(input.name);
  const phone = await generateUniquePhone();
  const randomPassword = crypto.randomBytes(32).toString('hex');
  const passwordHash = await bcrypt.hash(randomPassword, BCRYPT_COST);

  const { rows } = await query<UserRow>(
    `INSERT INTO users (display_name, name, email, phone, password_hash, accepted_cgu, role)
     VALUES ($1, $2, $3, $4, $5, TRUE, 'user')
     RETURNING id, display_name, name, email, phone, role, created_at`,
    [displayName, name, email, phone, passwordHash],
  );
  const created = rows[0]!;
  // E1 — email de bienvenue, comme pour l'inscription classique
  // (`users.service.ts`). Un compte OAuth est une inscription : l'utilisateur
  // doit recevoir le même accueil. Best-effort : `sendMail` ne lève jamais.
  void sendMail(created.id, created.email, 'welcome', { linkPath: '/' });
  return created;
}
