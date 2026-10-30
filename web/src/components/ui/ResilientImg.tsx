import { useEffect, useState, type ImgHTMLAttributes } from 'react'

/**
 * `<img>` qui ne reste jamais « cassée » :
 * - en cas d'erreur de chargement (réseau mobile, instance froide…), 2 nouvelles
 *   tentatives automatiques avec un paramètre anti-cache (`_r`), plus besoin de
 *   rafraîchir la page ;
 * - si l'image est vraiment introuvable, on affiche un pictogramme neutre au lieu
 *   de l'icône « image cassée » et du texte alternatif brut.
 */
const RETRY_DELAYS_MS = [700, 1800]

function withRetryParam(src: string, attempt: number): string {
  if (attempt === 0 || src.startsWith('data:') || src.startsWith('blob:')) return src
  return `${src}${src.includes('?') ? '&' : '?'}_r=${attempt}`
}

export function ResilientImg({
  src,
  alt,
  className,
  ...rest
}: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & { src: string; alt: string }) {
  const [attempt, setAttempt] = useState(0)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setAttempt(0)
    setFailed(false)
  }, [src])

  if (failed) {
    return (
      <span
        role="img"
        aria-label={alt || 'Photo indisponible'}
        className={className}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(127,127,127,.12)' }}
      >
        <i className="fas fa-image" aria-hidden="true" style={{ opacity: 0.45 }} />
      </span>
    )
  }

  return (
    <img
      {...rest}
      src={withRetryParam(src, attempt)}
      alt={alt}
      className={className}
      onError={() => {
        if (attempt < RETRY_DELAYS_MS.length) {
          const delay = RETRY_DELAYS_MS[attempt]!
          window.setTimeout(() => setAttempt((a) => a + 1), delay)
        } else {
          setFailed(true)
        }
      }}
    />
  )
}
