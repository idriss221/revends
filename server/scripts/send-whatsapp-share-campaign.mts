/**
 * Campagne WhatsApp — « Partagez ReVendsen avec vos proches ».
 *
 * Objectif : demander aux utilisateurs réels de partager ReVendsen sur
 * WhatsApp (statut, groupe, discussion), avec un message prêt à copier-coller.
 *
 * Usage :
 *   npx tsx scripts/send-whatsapp-share-campaign.mts            # dry-run
 *   npx tsx scripts/send-whatsapp-share-campaign.mts --send     # envoi réel
 *   npx tsx scripts/send-whatsapp-share-campaign.mts --send --only 16,22
 *
 * Garde-fous (volontaires, à ne pas retirer) :
 *  - seuls les numéros STRICTEMENT conformes `+2217` + 8 chiffres sont ciblés ;
 *  - les comptes de test (`@revends.test`, `@maxxspace.com`) sont exclus : leurs
 *    numéros sont fictifs et pourraient appartenir à de vraies personnes ;
 *  - les numéros-placeholders (`+221700000000`, `+221700000099`) sont exclus ;
 *  - le numéro émetteur est exclu (on ne s'écrit pas à soi-même) ;
 *  - dédoublonnage par numéro (un seul message par personne) ;
 *  - anti-doublon en base : `notification_deliveries` (canal `whatsapp`,
 *    clé `share-whatsapp-2026-11:<userId>`) → relancer ne renvoie jamais ;
 *  - délai de 3 s entre deux envois (limite anti-spam de WhatsApp) ;
 *  - les numéros ne sont JAMAIS affichés en clair dans la sortie.
 */
import { pool } from '../src/db/pool.js';
import { sendWhatsAppMessage } from '../src/whatsapp/whatsapp.service.js';
import { normalizePhone } from '../src/utils/phone.js';

const CAMPAIGN_KEY = 'share-whatsapp-2026-11';
const DELAY_MS = 3_000;
/** Numéro émetteur Whapi : inutile de s'envoyer la campagne à soi-même. */
const SENDER_PHONE = '+221770673233';
const EXCLUDED_EMAILS = [
  'aissatoubarrysow2@gmail.com',
  'cissemamy21@gmail.com',
  'p0846714@gmail.com',
];
const PLACEHOLDER_PHONES = ['+221700000000', '+221700000099'];
const TEST_DOMAINS = ['@revends.test', '@maxxspace.com'];

function maskPhone(phone: string): string {
  return `${phone.slice(0, 4)} ••• •• ${phone.slice(-2)}`;
}

function firstName(displayName: string | null): string | null {
  const raw = (displayName ?? '').trim();
  if (raw === '') return null;
  const first = raw.split(/\s+/)[0]!;
  if (first.length < 2) return null;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

function message(first: string | null): string {
  const hello = first ? `Bonjour ${first},` : 'Bonjour,';
  return [
    hello,
    '',
    'ReVendsen grandit grâce à ses membres — et aujourd’hui, un simple partage peut aider beaucoup.',
    '',
    'Partagez ReVendsen sur WhatsApp avec vos proches : celui qui a un objet à vendre y trouvera une nouvelle maison, celui qui cherche une bonne affaire y trouvera peut-être la sienne.',
    '',
    'Voici un message prêt à copier-coller :',
    '',
    '« Je te partage ReVendsen, la plateforme sénégalaise pour vendre ce que tu n’utilises plus et acheter d’occasion en toute confiance. Publier est gratuit, 10 % seulement à la vente. 👉 https://revends.vercel.app »',
    '',
    'Un ami, un groupe, une story : chaque partage compte et fait vivre la communauté.',
    '',
    'Merci pour votre confiance.',
    'L’équipe ReVendsen — Dakar',
    'revendsen@gmail.com',
  ].join('\n');
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface Target {
  id: number;
  email: string;
  phone: string;
  displayName: string | null;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const doSend = args.includes('--send');
  const onlyIdx = args.indexOf('--only');
  const only =
    onlyIdx >= 0 && args[onlyIdx + 1]
      ? new Set(
          args[onlyIdx + 1]!
            .split(',')
            .map((v) => Number(v.trim()))
            .filter((v) => Number.isInteger(v) && v > 0),
        )
      : null;

  const { rows } = await pool.query<{
    id: number;
    email: string;
    phone: string;
    display_name: string | null;
  }>(`SELECT id, email, phone, display_name FROM users ORDER BY id`);

  const excluded: Array<{ id: number; reason: string }> = [];
  const seenPhones = new Set<string>();
  const targets: Target[] = [];

  for (const row of rows) {
    const email = (row.email ?? '').trim().toLowerCase();
    if (email === '' || !email.includes('@')) {
      excluded.push({ id: row.id, reason: 'e-mail absent' });
      continue;
    }
    if (EXCLUDED_EMAILS.includes(email)) {
      excluded.push({ id: row.id, reason: 'exclusion demandée' });
      continue;
    }
    if (TEST_DOMAINS.some((domain) => email.endsWith(domain))) {
      excluded.push({ id: row.id, reason: 'compte de test' });
      continue;
    }
    const phone = normalizePhone(row.phone);
    if (!phone) {
      excluded.push({ id: row.id, reason: 'numéro invalide' });
      continue;
    }
    if (PLACEHOLDER_PHONES.includes(phone)) {
      excluded.push({ id: row.id, reason: 'numéro-placeholder' });
      continue;
    }
    if (phone === SENDER_PHONE) {
      excluded.push({ id: row.id, reason: 'numéro émetteur' });
      continue;
    }
    if (seenPhones.has(phone)) {
      excluded.push({ id: row.id, reason: 'numéro en doublon' });
      continue;
    }
    if (only !== null && !only.has(row.id)) {
      excluded.push({ id: row.id, reason: 'hors sélection --only' });
      continue;
    }
    seenPhones.add(phone);
    targets.push({ id: row.id, email, phone, displayName: row.display_name });
  }

  console.log(
    `CAMPAGNE=${CAMPAIGN_KEY} COMPTES=${rows.length} CIBLES=${targets.length} ENVOI=${doSend}`,
  );
  console.log('--- cibles (numéros masqués) ---');
  for (const t of targets) {
    console.log(
      `  id=${t.id} tel=${maskPhone(t.phone)} prenom=${firstName(t.displayName) ?? '-'}`,
    );
  }
  console.log(`--- exclues : ${excluded.length} ---`);
  const byReason = new Map<string, number>();
  for (const e of excluded) byReason.set(e.reason, (byReason.get(e.reason) ?? 0) + 1);
  for (const [reason, count] of byReason) console.log(`  ${reason} : ${count}`);

  if (!doSend) {
    console.log('\nDRY-RUN : aucun message envoyé. Ajoutez --send pour envoyer.');
    console.log('--- aperçu du message (1er destinataire) ---');
    console.log(message(firstName(targets[0]?.displayName ?? null)));
    await pool.end();
    return;
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const target of targets) {
    const idempotencyKey = `${CAMPAIGN_KEY}:${target.id}`;
    // Idempotent, mais rejouable : une livraison FAILED peut être retentée
    // (3 tentatives max). Une livraison SENT/SKIPPED n'est jamais renvoyée.
    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO notification_deliveries
         (idempotency_key, channel, user_id, event, status, attempts)
       VALUES ($1, 'whatsapp', $2, 'share_whatsapp_campaign', 'PENDING', 0)
       ON CONFLICT (idempotency_key, channel) DO UPDATE
          SET status = 'PENDING', updated_at = now()
        WHERE notification_deliveries.status = 'FAILED'
          AND notification_deliveries.attempts < 3
       RETURNING id`,
      [idempotencyKey, target.id],
    );

    const delivery = inserted.rows[0];
    if (!delivery) {
      skipped++;
      console.log(`SKIP id=${target.id} déjà envoyé`);
      continue;
    }

    const body = message(firstName(target.displayName));
    const result = await sendWhatsAppMessage(target.phone, body);

    const status = result.ok ? 'SENT' : result.skipped ? 'SKIPPED' : 'FAILED';
    try {
      await pool.query(
        `UPDATE notification_deliveries
            SET status = $2::text,
                attempts = attempts + 1,
                last_error = $3,
                sent_at = CASE WHEN $2::text = 'SENT' THEN now() ELSE sent_at END,
                updated_at = now()
          WHERE id = $1`,
        [delivery.id, status, result.ok ? null : (result.error ?? 'inconnu')],
      );
    } catch (err) {
      console.warn(
        `WARN id=${target.id} trace non écrite :`,
        err instanceof Error ? err.message : String(err),
      );
    }

    if (result.ok) {
      sent++;
      console.log(`SENT id=${target.id} tel=${maskPhone(target.phone)} msg=${result.messageId ?? '-'}`);
    } else if (result.skipped) {
      skipped++;
      console.log(`SKIP id=${target.id} raison=${result.error ?? '-'}`);
    } else {
      failed++;
      console.log(`FAIL id=${target.id} tel=${maskPhone(target.phone)} raison=${result.error ?? '-'}`);
    }

    await sleep(DELAY_MS);
  }

  console.log(`RÉSUMÉ envoyés=${sent} échecs=${failed} ignorés=${skipped}`);
  await pool.end();
}

main().catch(async (err) => {
  console.error('ERREUR', err);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
