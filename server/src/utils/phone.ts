/**
 * Normalisation stricte des numéros WhatsApp — Sénégal uniquement.
 *
 * Règles (demande 09/11/2026, chiffres sensibles : ne jamais inventer
 * ni déformer un numéro d'abonné) :
 *   1. indicatif international obligatoire `+221` (Sénégal) ;
 *   2. après l'indicatif, exactement 9 chiffres ;
 *   3. le 1er chiffre après l'indicatif est `7` (mobile) → `+2217…`.
 *
 * Accepte :
 *   - `+221 77 123 45 67` (déjà conforme) ;
 *   - `00221 77 123 45 67` → `+221…` ;
 *   - `77 123 45 67` (9 chiffres / 7) → `+221…` ;
 *   - `0771234567` (10 chiffres, 0 de tronc + 9 / 7) → `+221…` sans le 0 ;
 *   - `221771234567` (12 chiffres sans +) → `+221…`.
 * Tout le reste (autre indicatif, longueur ≠ 9, 1er chiffre ≠ 7)
 * → `null` (saisie à corriger avec l'abonné, jamais corrigée en douce).
 */

const STRICT_E164 = /^\+2217\d{8}$/;
const E164 = /^\+\d{8,15}$/;
const SENEGAL_MOBILE_LOCAL = /^7\d{8}$/;
const SENEGAL_TRUNK = /^07\d{8}$/;

/** Retire les séparateurs de saisie (espaces, tirets, points, parenthèses). */
function compact(raw: string): string {
  return raw.trim().replace(/[\s().\-/]/g, '');
}

/**
 * Normalise un numéro saisi. Retourne `null` si le format n'est pas
 * strictement `+221` + 9 chiffres / 7 — jamais une valeur silencieusement
 * fausse ou inventée.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const value = compact(raw);
  if (value === '') return null;

  // 1. International explicite : doit déjà être +2217… (9 chiffres / 7).
  if (value.startsWith('+')) {
    return STRICT_E164.test(value) ? value : null;
  }

  // 2. Préfixe international composé 00 221… → +221…
  if (value.startsWith('00')) {
    const candidate = `+${value.slice(2)}`;
    return STRICT_E164.test(candidate) ? candidate : null;
  }

  // 3. Numéro local sénégalais (9 chiffres commençant par 7).
  if (SENEGAL_MOBILE_LOCAL.test(value)) return `+221${value}`;

  // 4. Numéro local avec le 0 de tronc (10 chiffres : 0 + 9 / 7).
  if (SENEGAL_TRUNK.test(value)) return `+221${value.slice(1)}`;

  // 5. Numéro déjà composé sans + : 221 + 9 chiffres / 7 = 12 chiffres.
  if (/^2217\d{8}$/.test(value)) return `+${value}`;

  return null;
}

/** Vrai si la valeur est déjà un E.164 valide (historique, audit). */
export function isE164(value: string): boolean {
  return E164.test(value);
}

/** Vrai si la valeur est strictement +221 + 9 chiffres / 7. */
export function isStrictSenegalMobile(value: string): boolean {
  return STRICT_E164.test(value);
}

/**
 * Indicatif pays d'un numéro E.164 (sans le `+`), ou `null`.
 * Utilisé par les migrations +225 → +221 et les rapports d'audit.
 */
export function countryCode(value: string): string | null {
  if (!isE164(value)) return null;
  return value.slice(1, 4);
}

/** Le numéro est-il un mobile sénégalais plausible (7…) ? */
export function isSenegalMobile(value: string): boolean {
  return STRICT_E164.test(value);
}

export const PHONE_ERROR_MESSAGE =
  'Numéro WhatsApp invalide. Saisissez 9 chiffres commençant par 7 avec +221, ex. 77 123 45 67 ou +221 77 123 45 67.';

export const PHONE_REQUIRED_MESSAGE = 'Le numéro WhatsApp est requis.';
