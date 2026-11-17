import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { storefrontApi, storefrontError } from '../../lib/storefront'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../lib/toast'
import { Ico } from '../brand/Ico'

/**
 * Formulaire de contact boutique (design §2.1 / §2.3, `ContactForm`).
 * Rendu uniquement sur `/boutique/:slug`, uniquement aux visiteurs qui ne
 * sont PAS le vendeur de la boutique (la décision vit dans la page).
 *
 * · message 10–2000 (trimmé — bornes contrat §7.6) · email optionnel ≤ 254,
 *   préfillé avec l’e-mail du compte connecté (coordonnée d’échange, jamais
 *   affichée ailleurs que dans la notification destinée au vendeur) ;
 * · aucun `tel:`/`mailto:`/`wa.me` nulle part — le formulaire est le seul
 *   canal (CA-V7-026/046/047) ; le message est envoyé en JSON et rendu
 *   comme texte côté vendeur ;
 * · jamais d’erreur JS nue : toute erreur API est retraduite (storefrontError).
 */
const MESSAGE_MIN = 10
const MESSAGE_MAX = 2000
const EMAIL_MAX = 254
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function ContactForm({ slug }: { slug: string }) {
  const { user } = useAuth()
  const toast = useToast()
  const titleRef = useRef<HTMLHeadingElement>(null)

  const [message, setMessage] = useState('')
  const [email, setEmail] = useState(() => user?.email ?? '')
  const [touched, setTouched] = useState<{ message?: boolean; email?: boolean }>({})

  useEffect(() => {
    // Préfill e-mail à la connexion (le champ est éditable ensuite).
    if (user?.email) setEmail((current) => (current.trim() === '' ? user.email : current))
  }, [user?.email])

  const messageTrim = message.trim()
  const messageError = touched.message
    ? messageTrim.length < MESSAGE_MIN
      ? `Votre message doit contenir au moins ${MESSAGE_MIN} caractères.`
      : messageTrim.length > MESSAGE_MAX
        ? `Votre message ne peut pas dépasser ${MESSAGE_MAX} caractères.`
        : undefined
    : undefined
  const emailTrim = email.trim()
  const emailError = touched.email && emailTrim !== '' && (!EMAIL_RE.test(emailTrim) || emailTrim.length > EMAIL_MAX)
    ? 'L’adresse e-mail ne semble pas correcte.'
    : undefined

  const submit = useMutation({
    mutationFn: () =>
      storefrontApi.contact(slug, {
        message: messageTrim,
        email: emailTrim === '' ? undefined : emailTrim.toLowerCase(),
      }),
    onSuccess: () => {
      toast('success', 'Votre message est envoyé à la boutique.')
      setMessage('')
      setEmail(user?.email ?? '')
      setTouched({})
      titleRef.current?.focus()
    },
    onError: (err) => {
      toast('error', storefrontError(err, 'Impossible d’envoyer votre message. Réessayez dans un instant.'))
    },
  })

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    setTouched({ message: true, email: true })
    if (messageTrim.length < MESSAGE_MIN || messageTrim.length > MESSAGE_MAX) return
    if (emailTrim !== '' && (!EMAIL_RE.test(emailTrim) || emailTrim.length > EMAIL_MAX)) return
    submit.mutate()
  }

  return (
    <form className="rv-shop-contact" onSubmit={onSubmit} noValidate aria-labelledby="contact-title">
      <h2 ref={titleRef} id="contact-title" tabIndex={-1} className="rv-shop-h2">
        Écrivez à la boutique
      </h2>
      <p className="sub rv-shop-sub">Un message interne, jamais un numéro.</p>

      <div className="field">
        <label htmlFor="shop-message">
          Votre message <span aria-hidden="true">*</span>
        </label>
        <textarea
          id="shop-message"
          name="message"
          className={`inp${messageError ? ' bad' : ''}`}
          rows={4}
          minLength={MESSAGE_MIN}
          maxLength={MESSAGE_MAX}
          required
          aria-label="Votre message"
          aria-describedby="msg-hint msg-err"
          aria-invalid={Boolean(messageError)}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, message: true }))}
        />
        <p className="hint" id="msg-hint">
          <span className="rv-shop-counter" aria-hidden="true">
            {message.length} / {MESSAGE_MAX}
          </span>
          {MESSAGE_MIN} caractères minimum
        </p>
        {messageError && (
          <p className="err show" id="msg-err" role="alert">
            {messageError}
          </p>
        )}
      </div>

      <div className="field">
        <label htmlFor="shop-email">Votre e-mail <span className="opt">(facultatif)</span></label>
        <input
          id="shop-email"
          name="email"
          className={`inp${emailError ? ' bad' : ''}`}
          type="email"
          autoComplete="email"
          maxLength={EMAIL_MAX}
          aria-describedby="email-hint email-err"
          aria-invalid={Boolean(emailError)}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, email: true }))}
        />
        <p className="hint" id="email-hint">
          Uniquement pour que la boutique puisse vous répondre
        </p>
        {emailError && (
          <p className="err show" id="email-err" role="alert">
            {emailError}
          </p>
        )}
      </div>

      <button type="submit" className={`btn terra block${submit.isPending ? ' loading' : ''}`} aria-busy={submit.isPending} disabled={submit.isPending}>
        <Ico name="heart" cls="rv-mini" />
        <span className="lbl">Envoyer mon message</span>
      </button>
    </form>
  )
}
