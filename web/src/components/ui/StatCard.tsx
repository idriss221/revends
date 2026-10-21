import { useEffect, useState, type ReactNode } from 'react'

/**
 * Tuile statistique — spec-admin §4.6 + DA §3.9.
 *
 * · conteneur `flex h-full flex-col` + valeur en `mt-auto` : **hauteur homogène
 *   à ± 2 px** même si un titre passe à la ligne (CA-V5-039) ;
 * · `count-up` 0→n en 400 ms, **coupé si `prefers-reduced-motion`** (DA §7) ;
 * · 4 variantes, **toutes en tokens REVENDS** : le bleu et le violet décoratifs
 *   du back-office V4 sont interdits (DA §9.5).
 */
export type StatCardVariant = 'terracotta' | 'champagne' | 'chocolate' | 'positive'

const ICON_KINDS: Record<StatCardVariant, string> = {
  terracotta: 'bg-terracotta-soft text-terracotta-ink',
  champagne: 'bg-champagne-soft text-chocolate',
  chocolate: 'bg-chocolate text-on-dark',
  positive: 'bg-positive-soft text-positive',
}

/** Compteur 0→n par paliers — respecte la préférence « mouvement réduit ». */
function useAnimatedCount(target: number, duration = 400): number {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (target === 0) {
      setValue(0)
      return
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target)
      return
    }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration)
      setValue(Math.round(target * progress))
      if (progress < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return value
}

interface StatCardProps {
  title: string
  value: number
  variant: StatCardVariant
  icon: string
  /** sous-texte (montant cumulé, « tout est à jour »…) */
  subtitle?: ReactNode
}

export function StatCard({ title, value, variant, icon, subtitle }: StatCardProps) {
  const display = useAnimatedCount(value)
  return (
    <div className="card flex h-full flex-col">
      <div className="mb-3 flex items-start justify-between gap-3">
        <span className="text-sm font-medium text-muted">{title}</span>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-xl ${ICON_KINDS[variant]}`}>
          <i className={`fas ${icon}`} aria-hidden="true" />
        </div>
      </div>
      <div className="tabular mt-auto text-[32px] font-bold leading-none text-ink">{display}</div>
      {subtitle ? <div className="mt-1.5 text-sm font-semibold text-positive">{subtitle}</div> : null}
    </div>
  )
}
