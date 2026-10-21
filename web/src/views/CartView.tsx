import { Link } from 'react-router'
import { Ico } from '../components/brand/Ico'
import { Crumb, SiteEmpty, SiteHead, fmt } from '../components/site/SiteBits'
import { SiteImage, artKindFor } from '../components/site/SiteImage'
import { useCart, type CartItem } from '../context/CartContext'
import { MAX_QTY } from '../lib/hybridStore'

/* ============================================================================
   Panier — `Cart()` de `Bureau/main/assets/app.js` (lignes 619-669), markup
   repris à l'identique (`.crumb` / `.head.rv` / `.two-col` / `.line` / `.box` /
   `.sum`), branché sur `useCart()` (panier hybride local + API).

   Écarts assumés (données réelles) :
   · `CartItem` ne porte ni état ni ville (le contrat `GET /api/cart` —
     `CartLineDto` — ne les renvoie pas) : la ligne `.sub` affiche la catégorie
     et le vendeur s'ils existent, sinon elle n'est pas rendue ;
   · « Livraison » : l'API n'expose AUCUN frais de livraison (le checkout prend
     une adresse, pas un montant) → libellé « à convenir », jamais un chiffre
     inventé (comme la référence, qui dit pareil) ;
   · le texte de démonstration « le paiement en ligne n'est pas encore
     activé » serait faux ici (checkout Mobile Money réel) : le `.note.info`
     est reformulé pour dire la vérité du parcours ;
   · bornes 1..9 : la référence borne en JS sans jamais désactiver les
     boutons (maquette statique). On désactive `−` à 1 et `+` à `MAX_QTY` :
     c'est ce que la recette exige (borne basse/haute) et un état que le
     lecteur d'écran doit pouvoir percevoir.
   ========================================================================== */

const PAGE_TITLE = 'Panier'
/** h1 de l'écran (maquette `#cart` : « Votre panier ») ; le fil d'Ariane affiche « Panier ». */
const H1_TITLE = 'Votre panier'

/** Une ligne du panier — `.line` de la référence (lignes 639-652). */
function CartLine({ item }: { item: CartItem }) {
  const { inc, dec, remove } = useCart()
  const to = `/catalogue/${item.slug}`
  const sub = [item.categoryName, item.sellerName ? `Vendu par ${item.sellerName}` : null]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="line">
      <Link className="t" to={to} aria-label={`Voir ${item.name}`}>
        <SiteImage src={item.imageUrl} alt={item.name} w={300} sizes="120px" kind={artKindFor(item.categoryName)} />
      </Link>
      <div>
        <div className="nm">
          <Link to={to}>{item.name}</Link>
        </div>
        {sub ? <div className="sub">{sub}</div> : null}
        <div className="qty" role="group" aria-label="Quantité">
          <button
            type="button"
            onClick={() => dec(item.id)}
            aria-label="Diminuer la quantité"
            disabled={item.qty <= 1}
          >
            −
          </button>
          <span aria-live="polite">{item.qty}</span>
          <button
            type="button"
            onClick={() => inc(item.id)}
            aria-label="Augmenter la quantité"
            disabled={item.qty >= MAX_QTY}
          >
            +
          </button>
        </div>
        <button className="linkbtn" type="button" onClick={() => remove(item.id)}>
          <Ico name="trash" cls="sm" />
          Retirer
        </button>
      </div>
      <div className="pr">{fmt(item.price * item.qty)}</div>
    </div>
  )
}

export function CartView() {
  const { items, total, ready } = useCart()

  // Panier serveur encore en cours de chargement : un `.empty` de chargement
  // plutôt qu'un faux « panier vide » (flash avant GET /api/cart).
  // Un `<h1>` UNIQUE par page, quel que soit l'état : la recette (et le helper
  // e2e `waitForContent`) attend un titre de page même sur un panier vide ou
  // en cours de chargement. La référence ne rendait `.head` que s'il y avait
  // des articles — accessibilité (§8) avant fidélité littérale ici.
  const head = (
    <SiteHead
      eyebrow={items.length > 0 ? `${items.length} article${items.length > 1 ? 's' : ''}` : undefined}
      title={H1_TITLE}
      level={1}
    />
  )

  if (!ready) {
    return (
      <div className="wrap">
        <Crumb items={[{ label: PAGE_TITLE }]} />
        <div className="section tight">
          {head}
          <SiteEmpty icon="refresh" title="Chargement de votre panier…" />
        </div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="wrap">
        <Crumb items={[{ label: PAGE_TITLE }]} />
        <div className="section tight">
          {head}
          <SiteEmpty
            icon="bag"
            title="Votre panier est vide"
            action={{ label: 'Découvrir le catalogue', to: '/shop' }}
          >
            Les belles choses n'attendent que vous. Parcourez le catalogue et ajoutez vos trouvailles.
          </SiteEmpty>
        </div>
      </div>
    )
  }

  return (
    <div className="wrap">
      <Crumb items={[{ label: PAGE_TITLE }]} />
      <div className="section tight">
        {head}
        <div className="two-col">
          <div>
            {items.map((item) => (
              <CartLine key={item.id} item={item} />
            ))}
            <p className="sub" style={{ marginTop: 16 }}>
              Les articles d'occasion sont souvent des pièces uniques : la quantité est ajustable pour les lots.
            </p>
          </div>
          <div className="box">
            <h3>Récapitulatif</h3>
            <div className="sum">
              <div className="r">
                <span>Sous-total</span>
                <span>{fmt(total)}</span>
              </div>
              <div className="r">
                <span>Livraison</span>
                <span className="muted">à convenir</span>
              </div>
              <div className="r total">
                <span>Total</span>
                <span>{fmt(total)}</span>
              </div>
            </div>
            <div className="note info" style={{ margin: '18px 0' }}>
              Les frais de livraison dépendent du vendeur : ils sont à convenir directement avec lui. Le paiement
              s'effectue à l'étape suivante.
            </div>
            <Link className="btn" to="/commande">
              Passer la commande <Ico name="arrow-right" cls="sm" />
            </Link>
            <Link className="linkbtn" to="/shop" style={{ marginTop: 14 }}>
              <Ico name="arrow-left" cls="sm" />
              Continuer mes achats
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
