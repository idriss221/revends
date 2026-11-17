import { fmt } from '../site/SiteBits'
import type { SubscriptionPlan } from '../../lib/storefront.types'

/**
 * Choix du forfait (design §3.1, `PlanPicker`).
 *
 * `fieldset` + `legend` + radios NATIFS (visuellement masqués par la carte
 * entière — clavier/flèches gratuits, `input:checked`/`:focus-visible` pilotés
 * par `.rv-shop-plan`). Prix, quotas et durées sont lus EXCLUSIVEMENT dans
 * `plans` (réponse de l'API) — aucune valeur tarifaire figée dans le bundle.
 */
export function PlanPicker({
  plans,
  value,
  onChange,
  name,
  legend = 'Choisissez votre forfait',
}: {
  plans: SubscriptionPlan[]
  /** id du plan choisi, `null` = aucun (CTA bloqué, jamais un bouton muet) */
  value: number | null
  onChange: (planId: number) => void
  name: string
  legend?: string
}) {
  return (
    <fieldset className="rv-shop-plans">
      <legend className="sr">{legend}</legend>
      {plans.map((plan) => {
        const featured = plan.name === 'Boutique'
        return (
          <label key={plan.id} className="rv-shop-plan">
            <input
              type="radio"
              className="sr"
              name={name}
              value={plan.id}
              checked={value === plan.id}
              onChange={() => onChange(plan.id)}
              aria-label={`${plan.name} — ${fmt(plan.priceFcfa)} par mois, ${plan.quota} annonces`}
            />
            <span className="rv-shop-plan-card">
              {featured ? <span className="rv-shop-plan-pill">Le plus choisi</span> : null}
              <span className="rv-shop-plan-name">{plan.name}</span>
              <span className="rv-shop-plan-price">
                {fmt(plan.priceFcfa)} <small>/ mois</small>
              </span>
              <span className="rv-shop-plan-detail">
                {plan.quota} annonces de boutique
                <br />
                {plan.durationDays} jours — activation par l’administration
              </span>
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}
