import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useMutation } from '@tanstack/react-query'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import { useToast } from '../lib/toast'
import { Crumb, SiteEmpty, SiteHead, SitePage, fmt } from '../components/site/SiteBits'
import { Ico } from '../components/brand/Ico'

/* ============================================================================
   Page « Commande » — `Checkout()` de `Bureau/main/assets/app.js` (L674-717),
   markup fidèle (`.crumb`, `.head.rv`, `.two-col`, `.form`, `.box .sum`).

   Données réelles : la même logique que l'ancienne `CheckoutPage`
   (POST /api/orders/checkout, contrat §3.4) — produits + quantités +
   shipping {name, phone, city, address} + paymentMethod MOBILE_MONEY.

   Écarts avec la maquette (démo statique sans backend) :
   · « Adresse e-mail » SUPPRIMÉE : l'API n'enregistre pas l'e-mail dans le
     shipping (l'acheteur est le compte connecté) → pas de champ mensonger.
   · « Téléphone » et « Ville » AJOUTÉS : `CheckoutShipping` les exige
     (l'ancienne CheckoutPage les validait déjà) — sans eux le serveur
     rejette la commande.
   · La note optionnelle de CheckoutPage n'apparaît PAS : absente de la
     maquette (fidélité markup) — l'API l'accepte mais on ne l'affiche pas.
   · La note démo « le paiement en ligne n'existe pas encore » disparaît :
     le checkout réel crée de vraies commandes.
   ========================================================================== */

type FieldKey = 'name' | 'phone' | 'city' | 'address'
type FieldErrors = Partial<Record<FieldKey, string>>

const INITIAL = { name: '', phone: '', city: '', address: '' }

/** Validations de l'ancienne CheckoutPage (inchangées — règles serveur). */
function validate(form: typeof INITIAL): FieldErrors {
  const errors: FieldErrors = {}
  if (form.name.trim().length < 2) errors.name = 'Veuillez saisir votre nom complet.'
  if (form.phone.trim().length < 8 || !/^[+\d][\d\s().+-]{5,}$/.test(form.phone.trim())) {
    errors.phone = 'Numéro de téléphone invalide (ex. 07 07 00 00 00).'
  }
  if (form.city.trim().length < 2) errors.city = 'Veuillez saisir votre ville.'
  if (form.address.trim().length < 5) errors.address = 'Veuillez saisir votre adresse de livraison.'
  return errors
}

export function CheckoutView() {
  const { user, logout } = useAuth()
  const { items, clear, total, ready } = useCart()
  const navigate = useNavigate()
  const toast = useToast()

  const [form, setForm] = useState(INITIAL)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [tried, setTried] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  // Après un checkout réussi, le panier est vide mais on ne redirige PAS
  // vers /panier : on vient d'arriver sur /mes-commandes.
  const skipEmptyRedirect = useRef(false)
  // Pré-remplissage une seule fois depuis le compte connecté.
  const prefilled = useRef(false)

  useEffect(() => {
    if (prefilled.current || !user) return
    prefilled.current = true
    setForm((f) => ({
      ...f,
      name: f.name || user.name || user.displayName || '',
      phone: f.phone || user.phone || '',
    }))
  }, [user])

  // Panier vide (arrivée directe, refresh…) → retour vers /panier. On attend
  // `ready` : sinon un deep-link /commande rebondit avant GET /api/cart.
  useEffect(() => {
    if (ready && items.length === 0 && !skipEmptyRedirect.current) navigate('/panier', { replace: true })
  }, [ready, items, navigate])

  const setField = (key: FieldKey, value: string) => {
    const next = { ...form, [key]: value }
    setForm(next)
    setApiError(null)
    // Validation « vivante » après la première tentative.
    if (tried) {
      const nextErrors = validate(next)
      setErrors((prev) => ({ ...prev, [key]: nextErrors[key] }))
    }
  }

  const checkout = useMutation({
    mutationFn: () =>
      api.checkout({
        productIds: items.map((i) => i.id),
        quantities: Object.fromEntries(items.map((i) => [String(i.id), i.qty])),
        paymentMethod: 'MOBILE_MONEY',
        shipping: {
          name: form.name.trim(),
          phone: form.phone.trim(),
          city: form.city.trim(),
          address: form.address.trim(),
        },
      }),
    onSuccess: (res) => {
      const plural = res.count > 1
      toast('success', `Commande${plural ? 's' : ''} confirmée${plural ? ` — ${res.count} articles` : ''}. ✓`)
      // Empêche le useEffect de rediriger vers /panier une fois le panier vidé.
      skipEmptyRedirect.current = true
      navigate('/mes-commandes')
      clear()
    },
    onError: (err) => {
      const message = err instanceof ApiError ? err.readableMessage() : 'Impossible de confirmer la commande.'
      setApiError(message)
      toast('error', message)
    },
  })

  const confirmOrder = () => {
    setTried(true)
    const errs = validate(form)
    setErrors(errs)
    if (Object.keys(errs).length > 0) {
      toast('error', 'Veuillez corriger les champs en rouge avant de confirmer.')
      return
    }
    if (!user) {
      toast('info', 'Connectez-vous pour confirmer votre commande.')
      navigate('/login?next=' + encodeURIComponent('/commande'))
      return
    }
    if (user.role !== 'user') {
      toast('info', 'Seuls les comptes utilisateurs peuvent confirmer une commande.')
      return
    }
    setApiError(null)
    checkout.mutate()
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    confirmOrder()
  }

  /* --- Chargement (session + GET /api/cart) : pas de flash « panier vide ». */
  if (!ready) {
    return (
      <SitePage>
        <SiteHead eyebrow="Étape finale" title="Finaliser la commande" level={1} />
        <p className="note info" role="status">
          Préparation de votre commande…
        </p>
      </SitePage>
    )
  }

  /* --- Panier vide → guichet + redirection /panier (comme CheckoutPage). */
  if (items.length === 0) {
    return (
      <SitePage>
        <Crumb items={[{ label: 'Panier', to: '/panier' }, { label: 'Commande' }]} />
        <SiteEmpty icon="bag" title="Votre panier est vide" action={{ label: 'Voir mon panier', to: '/panier' }}>
          Ajoutez des articles à votre panier avant de finaliser votre commande.
        </SiteEmpty>
      </SitePage>
    )
  }

  /* --- Compte non acheteur (admin…) : le serveur répondrait FORBIDDEN. */
  if (user && user.role !== 'user') {
    return (
      <SitePage>
        <Crumb items={[{ label: 'Panier', to: '/panier' }, { label: 'Commande' }]} />
        <div className="box" style={{ maxWidth: 640 }}>
          <h3>
            {user.role === 'admin'
              ? 'Le compte administrateur ne peut pas commander'
              : 'Ce compte ne peut pas commander'}
          </h3>
          <p className="note warn">
            Votre compte ({user.email}) a le rôle « {user.role} ». La confirmation d'une commande est
            réservée aux comptes acheteurs. Vos articles restent dans le panier : déconnectez-vous,
            puis connectez-vous avec un compte acheteur.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 18 }}>
            <Link className="btn" to="/panier">
              <Ico name="arrow-left" cls="sm" /> Retour au panier
            </Link>
            <button
              className="linkbtn"
              type="button"
              onClick={() => {
                logout()
                navigate('/login?next=' + encodeURIComponent('/commande'))
              }}
            >
              <Ico name="logout" cls="sm" /> Changer de compte
            </button>
          </div>
        </div>
      </SitePage>
    )
  }

  /* --- Vue principale : formulaire à gauche, récapitulatif à droite. */
  return (
    <SitePage>
      <Crumb items={[{ label: 'Panier', to: '/panier' }, { label: 'Commande' }]} />
      <SiteHead eyebrow="Étape finale" title="Finaliser la commande" level={1} />
      <div className="two-col">
        <form className="form" id="ckForm" noValidate onSubmit={onSubmit} style={{ maxWidth: 560 }}>
          <div className="field">
            <label htmlFor="ckName">Nom complet</label>
            <input
              className={`inp${errors.name ? ' bad' : ''}`}
              id="ckName"
              type="text"
              autoComplete="name"
              placeholder="Aminata Diallo"
              required
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              aria-invalid={Boolean(errors.name)}
            />
            <div className={`err${errors.name ? ' show' : ''}`} role="alert">
              {errors.name}
            </div>
          </div>

          <div className="field">
            <label htmlFor="ckPhone">Téléphone</label>
            <input
              className={`inp${errors.phone ? ' bad' : ''}`}
              id="ckPhone"
              type="tel"
              autoComplete="tel"
              placeholder="07 07 00 00 00"
              required
              value={form.phone}
              onChange={(e) => setField('phone', e.target.value)}
              aria-invalid={Boolean(errors.phone)}
            />
            <div className={`err${errors.phone ? ' show' : ''}`} role="alert">
              {errors.phone}
            </div>
          </div>

          <div className="field">
            <label htmlFor="ckCity">Ville</label>
            <input
              className={`inp${errors.city ? ' bad' : ''}`}
              id="ckCity"
              type="text"
              autoComplete="address-level2"
              placeholder="Abidjan, Cocody"
              required
              value={form.city}
              onChange={(e) => setField('city', e.target.value)}
              aria-invalid={Boolean(errors.city)}
            />
            <div className={`err${errors.city ? ' show' : ''}`} role="alert">
              {errors.city}
            </div>
          </div>

          <div className="field">
            <label htmlFor="ckAddr">Adresse de livraison</label>
            <textarea
              className={`inp${errors.address ? ' bad' : ''}`}
              id="ckAddr"
              rows={3}
              autoComplete="street-address"
              placeholder="Rue, ville, repère…"
              required
              value={form.address}
              onChange={(e) => setField('address', e.target.value)}
              aria-invalid={Boolean(errors.address)}
            />
            <div className={`err${errors.address ? ' show' : ''}`} role="alert">
              {errors.address}
            </div>
          </div>

          {apiError ? (
            <div className="note warn" role="alert">
              {apiError}
            </div>
          ) : null}

          {!user ? (
            <div className="note info">
              <Ico name="circle-info" cls="sm" /> La confirmation de la commande nécessite un compte
              connecté.
            </div>
          ) : null}

          <button className="btn" type="submit" disabled={checkout.isPending}>
            {checkout.isPending ? 'Confirmation…' : 'Confirmer la commande'}{' '}
            <Ico name="arrow-right" cls="sm" />
          </button>
        </form>

        <div className="box">
          <h3>Votre commande</h3>
          <div className="sum">
            {items.map((x) => (
              <div className="r" key={x.id}>
                <span>
                  {x.name}
                  {x.qty > 1 ? ` ×${x.qty}` : ''}
                </span>
                <span>{fmt(x.price * x.qty)}</span>
              </div>
            ))}
            <div className="r">
              <span>Livraison</span>
              <span className="muted">à convenir</span>
            </div>
            <div className="r total">
              <span>Total</span>
              <span>{fmt(total)}</span>
            </div>
          </div>
        </div>
      </div>
    </SitePage>
  )
}
