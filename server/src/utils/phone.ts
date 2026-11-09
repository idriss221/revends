/**
 * Normalisation des numéros de téléphone / WhatsApp.
 *
 * ReVends est destiné au marché sénégalais : l'indicatif par défaut est +221.
 * Règles (ne jamais écraser un indicatif étranger explicite) :
 *   1. `+XXX…` ou `00XXX…` → conservé tel quel (format international) ;
 *   2. numéro local sénégalais à 9 chiffres (`77 123 45 67`) → `+221…` ;
 *   3. numéro local à 10 chiffres commençant par 0 (`0771234567`) → `+221` + 9 chiffres ;
 *   4. numéro déjà préfixé par un indicatif (12-15 chiffres) → `+…` ;
 *   5. tout le reste → `null` (le schéma Zod produit un message clair).
 *
 * Le résultat est TOUJOURS au format E.164 (un `+`, des chiffres, 8 à 15).
 * Aucune exception : les appelants peuvent stocker la valeur telle quelle.
 */

const E164 = /^\+\d{8,15}$/;
const SENEGAL_LOCAL = /^[37]\d{8}$/;

/** Retire les séparateurs de saisie (espaces, tirets, points, parenthèses). */
function compact(raw: string): string {
  return raw.trim().replace(/[\s().\-/]/g, '');
}

/**
 * Normalise un numéro saisi ou stocké. Retourne `null` si le format est
 * inexploitable — jamais une valeur silencieusement fausse.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const value = compact(raw);
  if (value === '') return null;

  // 1. International explicite : +221… / +33… — on ne touche à rien.
  if (value.startsWith('+')) {
    return E164.test(value) ? value : null;
  }

  // 2. Préfixe international composé (00 221…).
  if (value.startsWith('00')) {
    const candidate = `+${value.slice(2)}`;
    return E164.test(candidate) ? candidate : null;
  }

  // 3. Numéro local sénégalais (9 chiffres : 77 123 45 67, 33 123 45 67).
  if (SENEGAL_LOCAL.test(value)) return `+221${value}`;

  // 4. Numéro local sénégalais avec le 0 initial (10 chiffres).
  if (/^0[37]\d{8}$/.test(value)) return `+221${value.slice(1)}`;

  // 5. Numéro déjà composé sans `+` mais avec un indicatif (221 77…). ReVends est
  //    sénégalais : l'indicatif par défaut est +221, jamais +225.
  //    12 à 15 chiffres : on suppose un indicatif pays en tête.
  if (/^\d{12,15}$/.test(value)) return `+${value}`;

  return null;
}

/** Vrai si la valeur est déjà un E.164 valide. */
export function isE164(value: string): boolean {
  return E164.test(value);
}

/**
 * Indicatif pays d'un numéro E.164 (sans le `+`), ou `null`.
 * Utilisé par la migration +225 → +221 et les rapports d'audit.
 */
export function countryCode(value: string): string | null {
  if (!isE164(value)) return null;
  // Les indicatifs utilisés par ReVends ont 2 ou 3 chiffres. On privilégie
  // les préfixes connus, puis on retombe sur 3 chiffres (Afrique de l'Ouest).
  if (value.startsWith('+221') || value.startsWith('+225') || value.startsWith('+33')) {
    return value.slice(1, 4);
  }
  return value.slice(1, 4);
}

/** Le numéro est-il un mobile sénégalais plausible (7…) ? */
export function isSenegalMobile(value: string): boolean {
  return /^\+2217\d{8}$/.test(value);
}

export const PHONE_ERROR_MESSAGE =
  'Numéro WhatsApp invalide. Saisissez un numéro sénégalais (ex. 77 123 45 67) ou un numéro international (ex. +221 77 123 45 67).';

export const PHONE_REQUIRED_MESSAGE = 'Le numéro WhatsApp est requis.';
