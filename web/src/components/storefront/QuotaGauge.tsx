/**
 * Jauge de quota (design §3.3, `QuotaGauge`).
 *
 * `role="progressbar"` + `aria-valuemin/max/now` + `aria-valuetext` — jamais
 * la seule couleur : une phrase compagne visible dit la valeur, et un quota
 * plein ajoute un Notice warning côté écran (jamais ici). Aucune donnée
 * distante : `used` et `quota` sont des nombres fournis par la page.
 */
export function QuotaGauge({ used, quota }: { used: number; quota: number }) {
  const safeQuota = Math.max(1, quota)
  const safeUsed = Math.min(Math.max(0, used), safeQuota)
  const percent = Math.round((safeUsed / safeQuota) * 100)
  const remaining = Math.max(0, safeQuota - safeUsed)
  const full = safeUsed >= safeQuota

  return (
    <div className={`rv-shop-gauge${full ? ' rv-shop-gauge--full' : ''}`}>
      <span className="rv-shop-gauge-value">
        {safeUsed} <span aria-hidden="true">/</span> {safeQuota}
      </span>
      <div
        className="rv-shop-gauge-track"
        role="progressbar"
        aria-label={`Annonces dans votre boutique : ${safeUsed} sur ${safeQuota}`}
        aria-valuemin={0}
        aria-valuemax={safeQuota}
        aria-valuenow={safeUsed}
        aria-valuetext={`${safeUsed} annonces sur ${safeQuota}`}
      >
        <div className="rv-shop-gauge-fill" style={{ width: `${percent}%` }} />
      </div>
      <p className="rv-shop-gauge-text">
        {full
          ? `Quota atteint — votre boutique affiche les ${safeQuota} annonces autorisées.`
          : `Il reste ${remaining} place${remaining > 1 ? 's' : ''} dans votre boutique.`}
      </p>
    </div>
  )
}
