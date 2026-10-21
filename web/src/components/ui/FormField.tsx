import type { ReactNode } from 'react'

interface FormFieldProps {
  label: string
  htmlFor: string
  error?: string
  hint?: string
  required?: boolean
  children: ReactNode
}

/** Champ de formulaire : label (600/#1A1A2E, mb 8px) + erreur sous le contrôle (14px danger). */
export function FormField({ label, htmlFor, error, hint, required, children }: FormFieldProps) {
  return (
    <div className="mb-5">
      <label htmlFor={htmlFor} className="mb-2 block font-semibold text-ink">
        {label}
        {required && <span className="text-terracotta-ink"> *</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1.5 text-sm text-muted">{hint}</p>}
      {error && (
        <p id={`${htmlFor}-error`} role="alert" className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}