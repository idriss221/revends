import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Ico } from '../components/brand/Ico'
import { SiteImage } from '../components/site/SiteImage'
import { api } from '../lib/api'
import { AUTH_PHOTO } from '../lib/catalogPhotos'
import { useToast } from '../lib/toast'
import { friendlyError } from '../lib/errors'

/**
 * Mise à jour du numéro WhatsApp via lien e-mail (`/update-phone?token=…`).
 * Le nouveau numéro (+221, 9 chiffres, 7…) **écrase l'ancien** côté serveur.
 * Jeton unique, 7 jours.
 */
export function UpdatePhoneView() {
  const toast = useToast()
  const [sp] = useSearchParams()
  const token = sp.get('token') ?? ''
  const [phone, setPhone] = useState('+221 ')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)

  // Règle stricte : 9 chiffres après +221, 1er chiffre 7.
  const compact = phone.replace(/[\s().\-/]/g, '')
  const localOk = /^\+2217\d{8}$/.test(compact) || /^7\d{8}$/.test(compact) || /^07\d{8}$/.test(compact)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!token) {
      setError('Lien invalide. Veuillez ouvrir le lien reçu par e-mail.')
      return
    }
    if (!localOk) {
      setError('Numéro invalide. Saisissez 9 chiffres commençant par 7 avec +221, ex. 77 123 45 67 ou +221 77 123 45 67.')
      return
    }
    setPending(true)
    try {
      const res = await api.updatePhoneReset(token, phone.trim())
      setDone(true)
      toast('success', res.message)
    } catch (err) {
      const message = friendlyError(err, 'Impossible de mettre à jour le numéro. Réessayez.')
      setError(message)
      toast('error', message)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="auth">
      <aside className="art" aria-hidden="true">
        <div className="art-media">
          <SiteImage src={AUTH_PHOTO} alt="" w={1600} sizes="100vw" eager kind="coat" col="#200F12" bg="#E7DED3" />
        </div>
        <span className="art-veil" aria-hidden="true" />
        <Link className="logo" to="/">
          REVENDS<b>.</b>
        </Link>
      </aside>

      <section className="panel">
        <div className="panel-in">
          <div className="switch rv" style={{ ['--d' as string]: '0' }}>
            <span>Mise à jour du numéro</span>
          </div>
          <h1 className="rv" style={{ ['--d' as string]: '1' }}>
            Votre numéro WhatsApp
          </h1>
          <p className="intro rv" style={{ ['--d' as string]: '2' }}>
            ReVends est au Sénégal : saisissez votre numéro **+221, 9 chiffres commençant par 7**. Enregistrer remplacera l&apos;ancien numéro.
          </p>

          {done ? (
            <div className="note rv" style={{ ['--d' as string]: '3' }} role="status">
              <strong>Numéro enregistré.</strong> Merci, à bientôt sur ReVends.
              <div style={{ marginTop: 12 }}>
                <Link className="btn" to="/login">
                  Se connecter <Ico name="arrow-right" cls="sm" />
                </Link>
              </div>
            </div>
          ) : (
            <form className="form" onSubmit={onSubmit} noValidate>
              {!token && (
                <div className="note warn" role="alert">
                  Lien de mise à jour invalide ou expiré. Veuillez ouvrir le lien reçu par e-mail.
                </div>
              )}
              <div className="field rv" style={{ ['--d' as string]: '3' }}>
                <div className="ctl">
                  <span className="fi" aria-hidden="true">
                    <Ico name="credit-card" cls="sm" />
                  </span>
                  <input
                    className="inp"
                    id="aPhone"
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    placeholder="77 123 45 67"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    aria-invalid={error ? 'true' : 'false'}
                  />
                  <label htmlFor="aPhone">Nouveau numéro WhatsApp</label>
                </div>
                {error && (
                  <div className="err show" role="alert">
                    {error}
                  </div>
                )}
              </div>
              <ul className="rules" aria-label="Règles du numéro">
                <li className={localOk ? 'ok' : undefined}>
                  <Ico name="check" cls="sm" />
                  <span>Indicatif +221, 9 chiffres, commence par 7 (ex. +221 77 123 45 67)</span>
                </li>
                <li>
                  <Ico name="check" cls="sm" />
                  <span>Enregistrer écrase l&apos;ancien numéro</span>
                </li>
              </ul>
              <button className={`btn rv${pending ? ' loading' : ''}`} type="submit" disabled={pending || !token} aria-busy={pending}>
                <Ico name="heart" cls="rv-mini" />
                <span className="lbl">{pending ? 'Un instant…' : 'Enregistrer mon numéro'}</span>
                <Ico name="arrow-right" cls="sm" />
              </button>
            </form>
          )}

          <Link className="linkbtn" to="/login" style={{ marginTop: '14px' }}>
            <Ico name="arrow-left" cls="sm" /> Retour à la connexion
          </Link>
        </div>
      </section>
    </div>
  )
}
