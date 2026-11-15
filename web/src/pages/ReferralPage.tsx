import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { friendlyError } from '../lib/errors'
import { useToast } from '../lib/toast'
import { useAuth } from '../context/AuthContext'
import { Crumb, SiteHead } from '../components/site/SiteBits'
import { HeartLoader } from '../components/ui/HeartLoader'
import { Ico } from '../components/brand/Ico'

/**
 * Page publique du parrainage « Le Cercle des 10 » (`/parrainage`).
 *
 * Trois règles de conception :
 * - **le chiffre d'abord** : la progression est lisible en un coup d'œil,
 *   sans avoir à lire les règles ;
 * - **le lien est l'action** : copier / partager, rien d'autre à comprendre ;
 * - **aucune promesse implicite** : le palier atteint est affiché, le palier
 *   suivant est nommé, et la commission (10 %, à la vente) est rappelée.
 */
export function ReferralPage() {
  const toast = useToast()
  const { user } = useAuth()
  const [copied, setCopied] = useState(false)

  const summary = useQuery({
    queryKey: ['referral-summary'],
    queryFn: () => api.referralSummary(),
    staleTime: 30_000,
  })

  // Un filleul qui arrive avec `?ref=` doit voir le code conservé même s'il
  // s'inscrit plus tard (le temps de lire le catalogue). On le mémorise ici en
  // plus de la capture globale (`App`), pour ne dépendre d'aucun ordre d'exécution.
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('ref')
    if (ref) localStorage.setItem('rv_ref', ref)
  }, [])

  const code = summary.data?.code ?? ''
  const link = code ? `${window.location.origin}/register?ref=${code}` : ''
  const whatsapp = link
    ? `https://wa.me/?text=${encodeURIComponent(
        `Je vends sur ReVendsen. Rejoins-moi et publie ton premier article : ${link}`,
      )}`
    : ''

  async function copy() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      toast('success', 'Lien de parrainage copié.')
      window.setTimeout(() => setCopied(false), 2400)
    } catch {
      toast('error', 'Copie impossible. Sélectionnez le lien et copiez-le à la main.')
    }
  }

  const qualified = summary.data?.qualified ?? 0
  const target = summary.data?.target ?? 10
  const pct = Math.min(100, Math.round((qualified / target) * 100))

  return (
    <div className="wrap">
      <Crumb items={[{ label: 'Mon compte', to: '/profil' }, { label: 'Parrainage' }]} />
      <div className="section tight">
        <SiteHead
          eyebrow="Parrainage"
          title="Le Cercle des 10"
          sub="Invitez des vendeurs. À 10 filleuls validés, votre badge Ambassadeur et un mois de Vitrine sont activés."
          level={1}
        />

        {summary.isPending ? (
          <HeartLoader size="md" label="Chargement de votre parrainage…" />
        ) : summary.isError ? (
          <div className="note warn" role="alert">
            {friendlyError(summary.error, 'Impossible de charger votre parrainage pour le moment.')}{' '}
            <button className="linkbtn" type="button" onClick={() => void summary.refetch()}>
              Réessayer
            </button>
          </div>
        ) : (
          <>
            <div className="rv-ref">
              <div className="rv-ref__head">
                <div>
                  <div className="rv-ref__n">
                    {qualified}
                    <span> / {target}</span>
                  </div>
                  <div className="rv-ref__l">filleuls validés</div>
                </div>
                <div className="rv-ref__badges">
                  <span className={`rv-ref__pill${summary.data?.badgeActive ? ' on' : ''}`}>
                    <Ico name="star" cls="sm" />
                    {summary.data?.badgeActive ? 'Badge Ambassadeur actif' : 'Badge à débloquer'}
                  </span>
                  <span className={`rv-ref__pill${summary.data?.vitrineActive ? ' on' : ''}`}>
                    <Ico name="spark" cls="sm" />
                    {summary.data?.vitrineActive ? 'Vitrine active' : 'Vitrine à débloquer'}
                  </span>
                </div>
              </div>

              <div
                className="rv-ref__bar"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={target}
                aria-valuenow={qualified}
                aria-label={`${qualified} filleuls validés sur ${target}`}
              >
                <span style={{ width: `${pct}%` }} />
              </div>

              <p className="rv-ref__hint">
                {qualified >= target
                  ? 'Vous êtes dans le Cercle : votre badge et votre Vitrine sont actifs.'
                  : `Encore ${target - qualified} filleul${target - qualified > 1 ? 's' : ''} validé${
                      target - qualified > 1 ? 's' : ''
                    } pour entrer dans le Cercle.`}
                {qualified >= (summary.data?.badgeTarget ?? 5) && qualified < target
                  ? ' Le badge est déjà acquis — la Vitrine 30 jours arrive au 10ᵉ.'
                  : ''}
              </p>
            </div>

            <div className="rv-ref__link">
              <label htmlFor="rv-ref-link">Votre lien de parrainage</label>
              <div className="rv-ref__row">
                <input id="rv-ref-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
                <button className="btn" type="button" onClick={() => void copy()}>
                  <Ico name={copied ? 'check' : 'plus'} cls="sm" />
                  {copied ? 'Copié' : 'Copier'}
                </button>
              </div>
              {whatsapp ? (
                <a className="btn ghost sm rv-ref__wa" href={whatsapp} target="_blank" rel="noopener noreferrer">
                  Partager sur WhatsApp <Ico name="arrow-up-right" cls="sm" />
                </a>
              ) : null}
              <p className="rv-ref__code">
                Code à donner : <strong>{code}</strong>
              </p>
            </div>

            <div className="rv-ref__grid">
              <div className="rv-ref__card">
                <h2>Comment ça marche</h2>
                <ol>
                  <li>
                    <b>Partagez votre lien</b> avec des personnes qui ont des articles à vendre.
                  </li>
                  <li>
                    <b>Votre filleul publie</b> : compte créé, numéro <span className="nowrap">+221</span> vérifié,
                    premier article approuvé.
                  </li>
                  <li>
                    <b>Le crédit est automatique</b> : dès que l'article est validé, votre compteur avance.
                  </li>
                </ol>
              </div>

              <div className="rv-ref__card">
                <h2>Ce que vous gagnez</h2>
                <div className={`rv-ref__tier${qualified >= 5 ? ' done' : ''}`}>
                  <div className="rv-ref__tier-n">5 filleuls</div>
                  <p>Badge Ambassadeur 30 jours + Vitrine 7 jours.</p>
                </div>
                <div className={`rv-ref__tier${qualified >= 10 ? ' done' : ''}`}>
                  <div className="rv-ref__tier-n">10 filleuls</div>
                  <p>
                    Badge Ambassadeur 1 an + <b>Vitrine 30 jours</b> : annonces en tête du catalogue, badge sur vos
                    fiches, validation prioritaire.
                  </p>
                </div>
              </div>
            </div>

            <div className="note">
              <b>Les règles, sans astérisque.</b> Un filleul validé = un compte avec numéro +221 vérifié et un
              article approuvé. Une seule récompense par vendeur, un seul parrain par filleul. La commission reste à
              10 %, due uniquement à la vente. Offre ouverte jusqu'au 16 décembre 2026.
              {user ? (
                <>
                  {' '}
                  Votre code est personnel : <Link className="link" to="/profil">retrouvez-le dans votre profil</Link>.
                </>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
