import { SiteEmpty } from '../components/site/SiteBits'

/* ============================================================================
   404 — `NotFound()` de `Bureau/main/assets/app.js` (lignes 988-1001).

   VISUEL : gabarit `.empty` repris à l'identique (max-width 640px centré,
   icône `search`, un seul bouton), comme la référence.

   CONTENU : la maquette statique (backend factice) dit « Cette page n'existe
   pas » et pointe vers la boutique ; le DA §3.12 (contrat produit approuvé)
   impose « Cette page n'a pas trouvé de seconde vie » + l'action secondaire
   « Retour à l'accueil ». Les textes sont un CONTRAT, le visuel est une
   fidélité : on garde donc le texte DA rendu dans le gabarit Bureau/main.
   Le second point du DA (« Voir mes commandes ») est volontairement omis :
   la route est derrière RequireUser et renverrait un 404 anonyme sur /login.
   ⚠️ écart signalé dans le rapport final.

   Accessibilité (§8) : une page = un `<h1>` → `SiteEmpty level={1}`.
   ========================================================================== */

export function NotFoundView() {
  return (
    <div className="wrap">
      <div className="section">
        <SiteEmpty
          icon="search"
          level={1}
          title="Cette page n'a pas trouvé de seconde vie"
          action={{ label: "Retour à l'accueil", to: '/' }}
          style={{ maxWidth: '640px', marginInline: 'auto' }}
        >
          Le lien est peut-être erroné ou l'article a été retiré du catalogue.
        </SiteEmpty>
      </div>
    </div>
  )
}
