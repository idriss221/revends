/** Erreur applicative portant un statut HTTP + un code métier (format api.md §1.1). */
export class AppError extends Error {
  // `code` optionnel dans details : porté par CATEGORY_MISMATCH (api.md §3.2 —
  // le code métier figure sur l'élément de details en plus de field/message).
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Array<{ field: string; message: string; code?: string }>,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (code: string, message: string, details?: Array<{ field: string; message: string; code?: string }>) =>
  new AppError(400, code, message, details);
export const unauthorized = (code: string, message: string) => new AppError(401, code, message);
export const forbidden = (code: string, message: string) => new AppError(403, code, message);
export const notFound = (code: string, message: string) => new AppError(404, code, message);
export const conflict = (code: string, message: string) => new AppError(409, code, message);
export const gone = (code: string, message: string) => new AppError(410, code, message);

/** 409 INVALID_TRANSITION — précondition de transition non satisfaite (statut actuel exposé, api.md §1.1). */
export const invalidTransition = (
  currentStatus: string,
  message = 'Transition impossible : le statut actuel ne permet pas cette action',
) => new AppError(409, 'INVALID_TRANSITION', message, undefined, { currentStatus });

/** 409 ORDER_NOT_ALLOWED — paiement vendeur non autorisé pour le statut courant (CA-ORD07-05). */
export function orderNotAllowed(currentStatus: string, message = 'Paiement vendeur non autorisé pour cette commande') {
  return new AppError(409, 'ORDER_NOT_ALLOWED', message, undefined, { currentStatus });
}