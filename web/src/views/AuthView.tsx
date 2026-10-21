import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Ico } from '../components/brand/Ico'
import { SiteImage } from '../components/site/SiteImage'
import { useAuth } from '../context/AuthContext'
import { useLogin, useRegister } from '../hooks/useAuth'
import { api, ApiError } from '../lib/api'
import { AUTH_PHOTO } from '../lib/catalogPhotos'
import { useToast } from '../lib/toast'

/* ============================================================================
   Authentification — `Auth()` de `Bureau/main/assets/app.js` (lignes 806-926)
   + `wireAuth()` (1248-1361) + `wireAuthMotion()` (1364-1379), convertis en
   UN SEUL composant à mode (`/login`, `/register`, `/reset-password`), comme
   la référence qui bascule inscription ↔ connexion dans le même `.auth`.

   Markup repris à l'identique : `.auth` (`.art` + `.panel`), `.switch`,
   `.intro`, `.form` (`.field` > `.ctl` > `.fi`/`.inp` + label flottant),
   `.rules`,
   `.check`, `.btn.block` (`.rv-mini` cœur pulsant + `.loading`), `.or`,
   `.oauth`, `.note` — toutes classes portées dans `bureau.css`.

   Écarts assumés (données réelles) :
   · champs requis par `RegisterPayload` absents de la maquette : `phone`
     (champ `.field` supplémentaire, markup identique) et `displayName`
     (dérivé du nom complet — le pseudo et le nom sont confondus ici) ;
   · OAuth : la maquette affiche Google + Apple (démo), le backend réel
     expose `/api/auth/google` et `/api/auth/facebook` (cf. LoginPage) →
     boutons Google + Facebook sur le markup `.oauth-btn` exact ;
   · « Mot de passe oublié ? » et « retour » (liens demandés par le brief,
     absents de la maquette) : markup `.linkbtn` / `.switch .link` du CSS
     porté ;
   · le disclaimer « Prototype visuel : aucune authentification réelle »
     de la référence est faux ici → non rendu ;
   · `rv-splash`/`rv-heart` (overlay de chargement de `theme.css`) ne sont
     PAS des vues : le cœur `rv-mini` du bouton submit est rendu (CSS
     porté), le splash global est déjà porté par `SplashLoader`.
   ========================================================================== */

export type AuthMode = 'login' | 'register' | 'reset'

type FieldKey = 'aName' | 'aPhone' | 'aMail' | 'aPass' | 'aPass2' | 'aTos'

/** `.art` de la référence (lignes 808-830) — visuel parallaxe à la souris. */
function AuthArt() {
  const artRef = useRef<HTMLElement>(null)
  const mediaRef = useRef<HTMLDivElement>(null)

  /* `wireAuthMotion()` (1364-1379) : léger déplacement du visuel de gauche. */
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion:reduce)').matches) return
    const art = artRef.current
    const media = mediaRef.current
    if (!art || !media) return

    let raf = 0
    let tx = 0
    let ty = 0
    const apply = () => {
      raf = 0
      media.style.transform = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0)`
    }
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(apply)
    }
    const onMouseMove = (e: MouseEvent) => {
      const r = art.getBoundingClientRect()
      tx = -((e.clientX - r.left) / r.width - 0.5) * 22
      ty = -((e.clientY - r.top) / r.height - 0.5) * 18
      schedule()
    }
    const onMouseLeave = () => {
      tx = 0
      ty = 0
      schedule()
    }
    art.addEventListener('mousemove', onMouseMove)
    art.addEventListener('mouseleave', onMouseLeave)
    return () => {
      art.removeEventListener('mousemove', onMouseMove)
      art.removeEventListener('mouseleave', onMouseLeave)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <aside className="art" ref={artRef}>
      <div className="art-media" id="artMedia" aria-hidden="true" ref={mediaRef}>
        <SiteImage
          src={AUTH_PHOTO}
          alt="Univers mode de seconde main"
          w={1600}
          sizes="100vw"
          eager
          kind="coat"
          col="#200F12"
          bg="#E7DED3"
        />
      </div>
      <span className="art-veil" aria-hidden="true" />
      <svg className="art-orn" viewBox="0 0 200 200" aria-hidden="true" focusable="false">
        <path d="M150 8c-30 30-46 62-46 100 0 22 8 44 24 64" />
        <path d="M188 50c-26 8-45 22-56 43" />
        <path d="M122 94c-16-10-30-12-44-8 10 14 26 20 44 8Z" />
        <path d="M98 146c-16-8-30-8-44-2 12 12 28 16 44 2Z" />
        <path d="M172 122c-18 4-31 14-38 30 18 2 34-6 38-30Z" />
      </svg>
      <Link className="logo" to="/">
        REVENDS<b>.</b>
      </Link>
      <div className="art-copy">
        <p className="art-line rv" style={{ ['--d' as string]: '0' }}>
          Rejoignez une communauté qui valorise le beau, le vrai et le local.
        </p>
        <p className="art-sub rv" style={{ ['--d' as string]: '1' }}>
          Vendez vos pièces, dénichez des trésors et donnez une seconde vie aux belles choses — simplement.
        </p>
        <ul className="perks rv" style={{ ['--d' as string]: '2' }}>
          <li>
            <span className="pk">
              <Ico name="shield" cls="sm" />
            </span>
            Produits authentiques
          </li>
          <li>
            <span className="pk">
              <Ico name="lock" cls="sm" />
            </span>
            Paiement sécurisé
          </li>
          <li>
            <span className="pk">
              <Ico name="truck" cls="sm" />
            </span>
            Livraison rapide au Sénégal
          </li>
        </ul>
      </div>
    </aside>
  )
}

/** Œil afficher/masquer un mot de passe — `data-toggle` de `wireAuth` (1283-1290). */
function PwToggle({
  target,
  shown,
  onToggle,
}: {
  target: string
  shown: boolean
  onToggle: () => void
}) {
  return (
    <button
      className="toggle"
      type="button"
      onClick={onToggle}
      aria-label={shown ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
      aria-pressed={shown}
      aria-controls={target}
    >
      <Ico name={shown ? 'eye-off' : 'eye'} />
    </button>
  )
}

/** Redirection post-login : `?redirect=` (puis `?next` pour rétro-compat), sûr (chemin interne uniquement). */
function safeRedirect(raw: string | null): string | null {
  if (!raw) return null
  if (!raw.startsWith('/') || raw.startsWith('//')) return null
  return raw
}

export function AuthView({ mode }: { mode: AuthMode }) {
  const { user, isLoading: sessionLoading, logout } = useAuth()
  const loginMutation = useLogin()
  const registerMutation = useRegister()
  const navigate = useNavigate()
  const toast = useToast()
  const [sp] = useSearchParams()
  const redirect = safeRedirect(sp.get('redirect') ?? sp.get('next'))
  const token = sp.get('token') ?? ''

  const up = mode === 'register'
  const resetting = mode === 'reset'
  const confirmNeeded = up || resetting

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [pass2, setPass2] = useState('')
  const [tos, setTos] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [showPass2, setShowPass2] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({})
  const [apiError, setApiError] = useState<string | null>(null)
  const [resetPending, setResetPending] = useState(false)

  const pending = mode === 'reset' ? resetPending : mode === 'login' ? loginMutation.isPending : registerMutation.isPending

  /* Basculer de mode = naviguer (les routes portent le mode, comme la maquette
     porte l'état `up`/`in`) — le paramètre `redirect` est conservé. */
  const qs = redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''

  /* Textes de `setMode()` (wireAuth 1257-1274) + ResetPasswordPage. */
  const COPY: Record<AuthMode, { title: string; intro: string; submit: string; switchLabel: string }> = {
    register: {
      title: 'Rejoignez Revends',
      intro: "Commencez votre aventure avec nous en quelques secondes. C'est rapide, sécurisé et gratuit.",
      submit: 'Créer mon compte',
      switchLabel: 'Déjà membre ?',
    },
    login: {
      title: 'Bon retour',
      intro: 'Connectez-vous pour retrouver vos favoris, votre panier et vos annonces.',
      submit: 'Se connecter',
      switchLabel: 'Nouveau chez Revends ?',
    },
    reset: {
      title: 'Nouveau mot de passe',
      intro: 'Choisissez un mot de passe pour votre compte ReVends',
      submit: 'Réinitialiser',
      switchLabel: 'Déjà un compte ?',
    },
  }
  const copy = COPY[mode]

  /* Règles vivantes du mot de passe (wireAuth 1293-1303) — calculées au rendu. */
  const pwOk = { len: pass.length >= 8, cap: /[A-Z]/.test(pass), num: /\d/.test(pass) }

  const togglePass = () => setShowPass((v) => !v)
  const togglePass2 = () => setShowPass2((v) => !v)

  /* Panel « déjà connecté » de la référence (lignes 831-848). */
  if (!resetting && !sessionLoading && user) {
    return (
      <div className="auth">
        <AuthArt />
        <section className="panel">
          <div className="panel-in">
            <div className="switch rv" style={{ ['--d' as string]: '0' }}>
              <span>Connecté·e</span>
            </div>
            <h1 className="rv" style={{ ['--d' as string]: '1' }}>
              Vous êtes connecté·e
            </h1>
            <p className="intro rv" style={{ ['--d' as string]: '2' }}>
              Ravi de vous revoir, {user.name || user.displayName || user.email}.
            </p>
            <div className="rvc" style={{ display: 'grid', gap: '10px' }}>
              <Link className="btn" to="/profil">
                Aller à mon compte
              </Link>
              <button className="btn ghost" type="button" onClick={() => void logout()}>
                Se déconnecter
              </button>
            </div>
            <p className="note rv" style={{ ['--d' as string]: '4' }}>
              Retrouvez vos favoris, votre panier et vos annonces depuis votre espace.
            </p>
          </div>
        </section>
      </div>
    )
  }

  /** Validation — messages exacts de `wireAuth` (1310-1318), + `aPhone` (API). */
  function validate(): Partial<Record<FieldKey, string>> {
    return {
      aName: up && name.trim().length < 2 ? 'Indiquez votre nom complet.' : '',
      aPhone: up && phone.trim().length < 1 ? 'Indiquez votre numéro de téléphone.' : '',
      aMail: resetting ? '' : !/^\S+@\S+\.\S+$/.test(email.trim()) ? 'Saisissez une adresse e-mail valide.' : '',
      aPass: pass.length < 8 ? '8 caractères minimum.' : up && !pwOk.cap ? 'Ajoutez au moins une majuscule.' : up && !pwOk.num ? 'Ajoutez au moins un chiffre.' : '',
      aPass2: confirmNeeded && pass2 !== pass ? 'Les mots de passe ne correspondent pas.' : '',
      aTos: up && !tos ? 'Veuillez accepter les conditions.' : '',
    }
  }

  function focusFirstBad(msgs: Partial<Record<FieldKey, string>>) {
    const order: FieldKey[] = ['aName', 'aPhone', 'aMail', 'aPass', 'aPass2', 'aTos']
    const ids: Record<FieldKey, string> = {
      aName: 'aName',
      aPhone: 'aPhone',
      aMail: 'aMail',
      aPass: 'aPass',
      aPass2: 'aPass2',
      aTos: 'aTos',
    }
    for (const key of order) {
      if (msgs[key]) {
        document.getElementById(ids[key])?.focus()
        return
      }
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setApiError(null)

    const msgs = validate()
    setErrors(msgs)
    if (Object.values(msgs).some(Boolean)) {
      focusFirstBad(msgs)
      return
    }

    try {
      if (mode === 'login') {
        const res = await loginMutation.mutateAsync({ identifier: email.trim(), password: pass })
        navigate(res.user.role === 'admin' ? '/admin' : (redirect ?? '/'), { replace: true })
      } else if (mode === 'register') {
        const trimmed = name.trim()
        await registerMutation.mutateAsync({
          // Le contrat exige un `displayName` (pseudo public) : dérivé du nom
          // complet, faute de champ dédié dans la maquette.
          displayName: trimmed || email.trim().split('@')[0] || 'Membre',
          name: trimmed,
          email: email.trim(),
          phone: phone.trim(),
          password: pass,
          acceptedCgu: true,
        })
        navigate(redirect ?? '/', { replace: true })
      } else {
        setResetPending(true)
        try {
          await api.resetPassword(token, pass)
          toast('success', 'Mot de passe réinitialisé ! Connectez-vous.')
          navigate('/login', { replace: true })
        } catch (err) {
          const message = err instanceof ApiError ? err.readableMessage() : 'Impossible de réinitialiser le mot de passe'
          setApiError(message)
          toast('error', message)
        } finally {
          setResetPending(false)
        }
      }
    } catch (err) {
      // Erreurs API : les hooks toast déjà ; on affiche le message lisible.
      setApiError(err instanceof ApiError ? err.readableMessage() : 'Une erreur est survenue. Réessayez.')
    }
  }

  /** Message d'erreur de champ — `.err.show` de la référence. */
  const err = (key: FieldKey, style?: React.CSSProperties) =>
    errors[key] ? (
      <div className="err show" style={style} role="alert">
        {errors[key]}
      </div>
    ) : (
      <div className="err" style={style} />
    )

  return (
    <div className="auth">
      <AuthArt />

      <section className="panel">
        <div className="panel-in">
          <div className="switch rv" style={{ ['--d' as string]: '0' }}>
            <span>{copy.switchLabel}</span>
            {mode === 'login' ? (
              <Link className="link" to={`/register${qs}`}>
                Créer un compte <Ico name="arrow-right" cls="sm" />
              </Link>
            ) : (
              <Link className="link" to={`/login${qs}`}>
                Se connecter <Ico name="arrow-right" cls="sm" />
              </Link>
            )}
          </div>

          <h1 id="authTitle" className="rv" style={{ ['--d' as string]: '1' }}>
            {copy.title}
          </h1>
          <p className="intro rv" id="authIntro" style={{ ['--d' as string]: '2' }}>
            {copy.intro}
          </p>

          <form className="form" onSubmit={onSubmit} noValidate>
            {up && (
              <div className="field rv" id="nameField" style={{ ['--d' as string]: '3' }}>
                <div className="ctl">
                  <span className="fi" aria-hidden="true">
                    <Ico name="user" cls="sm" />
                  </span>
                  <input
                    className="inp"
                    id="aName"
                    name="name"
                    type="text"
                    autoComplete="name"
                    placeholder=" "
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    aria-invalid={errors.aName ? 'true' : 'false'}
                  />
                  <label htmlFor="aName">Nom complet</label>
                </div>
                {err('aName')}
              </div>
            )}

            {up && (
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
                    placeholder=" "
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    aria-invalid={errors.aPhone ? 'true' : 'false'}
                  />
                  <label htmlFor="aPhone">Téléphone</label>
                </div>
                {err('aPhone')}
              </div>
            )}

            {!resetting && (
              <div className="field rv" style={{ ['--d' as string]: '3' }}>
                <div className="ctl">
                  <span className="fi" aria-hidden="true">
                    <Ico name="mail" cls="sm" />
                  </span>
                  <input
                    className="inp"
                    id="aMail"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder=" "
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-invalid={errors.aMail ? 'true' : 'false'}
                  />
                  <label htmlFor="aMail">Adresse e-mail</label>
                </div>
                {err('aMail')}
              </div>
            )}

            <div className="field rv" style={{ ['--d' as string]: '4' }}>
              <div className="ctl pw">
                <span className="fi" aria-hidden="true">
                  <Ico name="lock" cls="sm" />
                </span>
                <input
                  className="inp"
                  id="aPass"
                  name="password"
                  type={showPass ? 'text' : 'password'}
                  autoComplete={up ? 'new-password' : 'current-password'}
                  placeholder=" "
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  aria-invalid={errors.aPass ? 'true' : 'false'}
                />
                <label htmlFor="aPass">Mot de passe</label>
                <PwToggle target="aPass" shown={showPass} onToggle={togglePass} />
              </div>
              <ul className="rules" id="pwRules" aria-label="Règles du mot de passe" hidden={!up}>
                <li data-rule="len" className={pwOk.len ? 'ok' : undefined}>
                  <Ico name="check" cls="sm" />
                  <span>8 caractères minimum</span>
                </li>
                <li data-rule="cap" className={pwOk.cap ? 'ok' : undefined}>
                  <Ico name="check" cls="sm" />
                  <span>Une majuscule</span>
                </li>
                <li data-rule="num" className={pwOk.num ? 'ok' : undefined}>
                  <Ico name="check" cls="sm" />
                  <span>Un chiffre</span>
                </li>
              </ul>
              {err('aPass')}
            </div>

            {confirmNeeded && (
              <div className="field rv" id="confirmField" style={{ ['--d' as string]: '5' }}>
                <div className="ctl pw">
                  <span className="fi" aria-hidden="true">
                    <Ico name="lock" cls="sm" />
                  </span>
                  <input
                    className="inp"
                    id="aPass2"
                    name="password2"
                    type={showPass2 ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder=" "
                    value={pass2}
                    onChange={(e) => setPass2(e.target.value)}
                    aria-invalid={errors.aPass2 ? 'true' : 'false'}
                  />
                  <label htmlFor="aPass2">Confirmer le mot de passe</label>
                  <PwToggle target="aPass2" shown={showPass2} onToggle={togglePass2} />
                </div>
                {err('aPass2')}
              </div>
            )}

            {up && (
              <>
                <label className="check rv" id="tosField" htmlFor="aTos" style={{ ['--d' as string]: '6' }}>
                  <input
                    type="checkbox"
                    id="aTos"
                    name="acceptedCgu"
                    checked={tos}
                    onChange={(e) => setTos(e.target.checked)}
                    aria-invalid={errors.aTos ? 'true' : 'false'}
                  />
                  <span className="box">
                    <Ico name="check" cls="sm" />
                  </span>
                  <span className="txt">
                    J'accepte les <Link to="/conditions">Conditions d'utilisation</Link> et la{' '}
                    <Link to="/confidentialite">Politique de confidentialité</Link>
                  </span>
                </label>
                {err('aTos', { marginTop: -6 })}
              </>
            )}

            {resetting && !token && (
              <div className="note warn" role="alert">
                Lien de réinitialisation invalide ou expiré. Veuillez refaire la demande.
              </div>
            )}

            {apiError && (
              <div className="note warn" role="alert">
                {apiError}
              </div>
            )}

            <button
              className={`btn rv${pending ? ' loading' : ''}`}
              type="submit"
              id="authSubmit"
              style={{ ['--d' as string]: '7' }}
              disabled={pending || (resetting && !token)}
              aria-busy={pending}
            >
              <Ico name="heart" cls="rv-mini" />
              <span className="lbl">{pending ? 'Un instant…' : copy.submit}</span>
              <Ico name="arrow-right" cls="sm" />
            </button>
          </form>

          {mode === 'login' && (
            <Link className="linkbtn" to={`/reset-password${qs}`} style={{ marginTop: '14px' }}>
              Mot de passe oublié ?
            </Link>
          )}
          {mode === 'reset' && (
            <Link className="linkbtn" to={`/login${qs}`} style={{ marginTop: '14px' }}>
              <Ico name="arrow-left" cls="sm" />
              Retour à la connexion
            </Link>
          )}

          {!resetting && (
            <>
              <div className="or rv" style={{ ['--d' as string]: '8' }} aria-hidden="true">
                <span>Ou</span>
              </div>
              <div className="oauth rv" style={{ ['--d' as string]: '8' }}>
                <button
                  type="button"
                  className="btn ghost oauth-btn"
                  onClick={() => {
                    window.location.href = '/api/auth/google'
                  }}
                >
                  <Ico name="google" cls="g" />
                  <span className="oauth-txt">
                    <span className="oauth-pre">Continuer avec </span>Google
                  </span>
                </button>
                <button
                  type="button"
                  className="btn ghost oauth-btn"
                  onClick={() => {
                    window.location.href = '/api/auth/facebook'
                  }}
                >
                  <Ico name="facebook" cls="fill" />
                  <span className="oauth-txt">
                    <span className="oauth-pre">Continuer avec </span>Facebook
                  </span>
                </button>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  )
}
