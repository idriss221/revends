import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { pool } from './pool.js';
import { logger, describeError } from '../utils/logger.js';

// Bannières par défaut du carrousel d'accueil (PO-ACC-4, D-ACC-1).
// Contenu figé par la chefferie de projet : ordre = position (1 premier).
const DEFAULT_BANNERS = [
  {
    title: 'Grande braderie de septembre',
    subtitle: 'Jusqu’à -30 % sur l’électronique',
    image_path: '/categories/electronique.jpg',
    link_url: '/search',
    position: 1,
  },
  { title: 'Vendez vos anciens téléphones', subtitle: null, image_path: null, link_url: '/vendre', position: 2 },
  { title: 'Nouveautés de la semaine', subtitle: null, image_path: null, link_url: '/category/electronique', position: 3 },
];

/**
 * Seed idempotent des bannières : insère les bannières par défaut SEULEMENT si
 * la table est vide (jamais d'écrasement — la future gestion admin prime,
 * PO-ACC-4). Appelé au démarrage du serveur ET par `npm run db:seed`.
 */
export async function seedBannersIfEmpty(): Promise<{ inserted: number; skipped: boolean }> {
  const { rows } = await pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM banners');
  if (Number(rows[0]?.count ?? 0) > 0) {
    return { inserted: 0, skipped: true };
  }
  let inserted = 0;
  for (const b of DEFAULT_BANNERS) {
    const res = await pool.query(
      `INSERT INTO banners (title, subtitle, image_path, link_url, position)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (position) DO NOTHING`,
      [b.title, b.subtitle, b.image_path, b.link_url, b.position],
    );
    if ((res.rowCount ?? 0) > 0) inserted++;
  }
  return { inserted, skipped: false };
}

/**
 * Seed idempotent du compte administrateur (jamais créé par inscription publique).
 * - ADMIN_EMAIL / ADMIN_PASSWORD (env) ; défauts : admin@revends.com + mot de passe généré et affiché.
 * - Le mot de passe est haché (bcryptjs cost 10).
 */
export async function seedAdmin(): Promise<{ email: string; password: string; created: boolean }> {
  const email = config.adminEmail.toLowerCase();
  let password = config.adminPassword;

  const existing = await pool.query<{ id: number }>('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows[0]) {
    logger.info('compte admin déjà présent', { email });
    return { email, password: password || '(inchangé)', created: false };
  }

  if (!password) {
    // En production : config.ts refuse déjà de démarrer (fail-fast >= 12 chars).
    // Hors prod uniquement, on génère un mot de passe dev (jamais en production).
    password = `Rev-${crypto.randomBytes(6).toString('hex')}!a1`;
  }
  const hashed = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO users (display_name, name, email, phone, password_hash, role, accepted_cgu)
     VALUES ('Administrateur', 'ReVends Admin', $1, '+225 00000000', $2, 'admin', TRUE)
     ON CONFLICT (email) DO NOTHING`,
    [email, hashed],
  );
  logger.info('compte admin créé', { email });
  return { email, password, created: true };
}

// Exécution directe : npm run db:seed — état COMPLET (admin + bannières).
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  Promise.all([seedAdmin(), seedBannersIfEmpty()])
    .then(([admin, banners]) => {
      // Bannière CLI DEV (une seule fois, hors runtime serveur) : le mot de passe
      // admin généré est volontairement affiché en clair pour permettre la
      // première connexion locale. On écrit via `process.stdout.write` et NON via
      // le logger structuré : un secret NE DOIT JAMAIS entrer dans un log JSON
      // (CA-V5-090 / RG-V5-07). Hors prod uniquement (config.ts refuse de démarrer
      // en production sans ADMIN_PASSWORD explicite).
      const lines = [
        '====================================================',
        `  ADMIN LOGIN : ${admin.email}`,
        process.env.ADMIN_PASSWORD
          ? '  ADMIN PASSWORD : définie via ADMIN_PASSWORD (non affichée)'
          : `  ADMIN PASSWORD : ${admin.password}`,
        banners.skipped
          ? '  Bannières     : table déjà remplie, seed ignoré'
          : `  Bannières     : ${banners.inserted} insérée(s) par défaut`,
        '====================================================',
        '',
      ];
      process.stdout.write(lines.join('\n'));
      process.exit(0);
    })
    .catch((err) => {
      logger.error('seed échoué', describeError(err));
      process.exit(1);
    });
}