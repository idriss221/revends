import type { PaymentFieldErrors } from '../../lib/v8'
import { Notice } from '../ui/Notice'

/* ============================================================================
   Référence de paiement à la souscription (V8-D8, contrat v2.8 E1 ; V9.1).

   Champs OBLIGATOIRES côté front : mode (Wave / Orange Money / virement) +
   référence (4–64 car.) SAUF pour Wave : la référence n'est pas rendue, le
   serveur la génère et le webhook signé active la souscription. Le serveur
   arbitre — toute erreur serveur est affichée en français, jamais un code.
   La référence n'est rendue nulle part ailleurs (file admin masquée via
   safeReference()).
   ========================================================================== */

export function PaymentReferenceFields({
  method,
  reference,
  onMethodChange,
  onReferenceChange,
  errors,
  idPrefix,
}: {
  method: string
  reference: string
  onMethodChange: (value: string) => void
  onReferenceChange: (value: string) => void
  errors: PaymentFieldErrors
  idPrefix: string
}) {
  const methodId = `${idPrefix}-payment-method`
  const refId = `${idPrefix}-payment-reference`
  const methodErrId = `${methodId}-err`
  const refErrId = `${refId}-err`
  const hintId = `${refId}-hint`

  return (
    <div role="group" aria-label="Paiement de l’abonnement">
      <div className="field">
        <label htmlFor={methodId}>
          Mode de paiement <span aria-hidden="true">*</span>
        </label>
        <select
          id={methodId}
          name="paymentMethod"
          className="field-input"
          required
          aria-required="true"
          aria-invalid={Boolean(errors.paymentMethod)}
          aria-describedby={errors.paymentMethod ? methodErrId : undefined}
          value={method}
          onChange={(event) => onMethodChange(event.target.value)}
        >
          <option value="">Choisissez votre mode de paiement…</option>
          <option value="wave">Wave</option>
          <option value="orange_money">Orange Money</option>
          <option value="virement">Virement bancaire</option>
        </select>
        {errors.paymentMethod ? (
          <p className="err show" id={methodErrId} role="alert">
            {errors.paymentMethod}
          </p>
        ) : null}
      </div>

      {method === 'wave' ? (
        <div className="field" style={{ marginTop: 14 }}>
          <Notice tone="success">
            Paiement Wave : aucune référence à saisir. Votre abonnement sera activé automatiquement dès que le paiement
            sera confirmé.
          </Notice>
        </div>
      ) : (
        <div className="field" style={{ marginTop: 14 }}>
          <label htmlFor={refId}>
            Référence de paiement <span aria-hidden="true">*</span>
          </label>
          <input
            id={refId}
            name="paymentReference"
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            maxLength={64}
            required
            aria-required="true"
            aria-invalid={Boolean(errors.paymentReference)}
            aria-describedby={`${hintId}${errors.paymentReference ? ` ${refErrId}` : ''}`}
            value={reference}
            onChange={(event) => onReferenceChange(event.target.value)}
            placeholder="WAVE-2026-01118 · OM 11 22 33 · VIR/2026/118"
            className="field-input"
          />
          <p className="hint" id={hintId}>
            La référence de votre paiement — l’administration s’en sert pour vérifier, rien d’autre. Elle n’est jamais
            affichée publiquement.
          </p>
          {errors.paymentReference ? (
            <p className="err show" id={refErrId} role="alert">
              {errors.paymentReference}
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}
