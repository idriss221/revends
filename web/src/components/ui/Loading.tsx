/**
 * Squelettes — DA §3.11.
 *
 * Règle : **un skeleton reproduit la silhouette exacte** du contenu final, sinon
 * la page saute au chargement. Aucun « Chargement… » seul au milieu d'une page
 * structurée.
 *
 * Fond + animation : DA §3.11 impose `.animate-skeleton bg-line rounded-sm`
 * (pulse 1.4 s via `skeleton-pulse`, keyframes déclarées dans `index.css`).
 * NB : les noms `.skeleton` / `.skeleton-shimmer` cités dans une version
 * antérieure de ce commentaire n'ont JAMAIS existé dans le CSS livré — les
 * blocs étaient donc transparents (pas de fond, pas de pulsation). Corrigé
 * ici ; ne pas réintroduire ces classes fantômes.
 *
 * Sémantique (I4 de la revue) : ces composants sont DA-pinés et rendus en
 * admin comme en public — c'est le DA qui prescrit Tailwind + Font Awesome
 * pour les écrans que la maquette ne couvre pas (§3.10 OrderTimeline,
 * §3.11 PageLoader/skeletons). L'interdiction Tailwind ne vaut que pour les
 * écrans couverts par `Bureau/main`.
 */

function Skeleton({ className }: { className?: string }) {
  const extra = className ?? ''
  // `rounded-sm` par défaut (DA) — seulement si l'appelant n'a pas choisi
  // son propre rayon (`rounded-none`, `rounded-lg`, `rounded-full`…) : dans
  // le doute, l'appelant gagne, la silhouette du contenu final prime.
  const hasRadius = /\brounded(-|$)/.test(extra)
  return (
    <div
      aria-hidden="true"
      className={`animate-skeleton bg-line ${hasRadius ? '' : 'rounded-sm'} ${extra}`.trim()}
    />
  )
}

/** Grille de skeletons « product-card » : média `aspect-[4/5]` + 2 lignes + prix. */
export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card overflow-hidden !p-0">
          <Skeleton className="aspect-[4/5] w-full rounded-none" />
          <div className="space-y-3 p-4">
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Tuile « catégorie » : photo `aspect-[3/4]` + 2 lignes (page `/category`). */
export function CategorySkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5 lg:gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-md bg-white shadow-sm">
          <Skeleton className="aspect-[3/4] w-full rounded-none" />
          <div className="space-y-2 p-4">
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function StatGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-4 gap-5 max-[1200px]:grid-cols-2 max-[560px]:grid-cols-1">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card">
          <div className="mb-3 flex items-center justify-between">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-10 rounded-md" />
          </div>
          <Skeleton className="h-8 w-16" />
        </div>
      ))}
    </div>
  )
}

/**
 * Squelette de tableau — **aligné sur les colonnes** de `AdminTable` (vignette
 * 50 px + 2 lignes + pastille) et rendu dans la carte : aucun saut de mise en
 * page entre chargement et données (spec-admin §4.6).
 */
export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div role="status" aria-label="Chargement en cours" className="space-y-1">
      <div className="flex gap-4 border-b border-line pb-3">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={`h${i}`} className="h-3 w-24" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 border-b border-line py-4">
          <Skeleton className="h-[50px] w-[50px] rounded-sm" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          {Array.from({ length: Math.max(1, columns - 2) }).map((_, c) => (
            <Skeleton key={c} className="h-6 w-16 shrink-0 rounded-full" />
          ))}
        </div>
      ))}
      <span className="sr-only">Chargement…</span>
    </div>
  )
}

/** Squelette de fiche (2 colonnes : média + texte). */
export function DetailSkeleton() {
  return (
    <div role="status" aria-label="Chargement en cours" className="grid gap-8 max-[834px]:grid-cols-1 lg:grid-cols-2">
      <Skeleton className="aspect-[4/5] w-full rounded-lg" />
      <div className="space-y-4">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-12 w-full rounded-md" />
      </div>
      <span className="sr-only">Chargement…</span>
    </div>
  )
}

/**
 * Loader de page — DA §3.11 (« `PageLoader` : spinner `text-terracotta`,
 * `min-h-[40vh]`, `role="status"` »). La maquette `Bureau/main` n'a PAS
 * d'écran de chargement de page : c'est le DA qui fait autorité ici, d'où
 * Font Awesome + Tailwind dans la zone publique (exception assumée, I4 revue).
 */
export function PageLoader({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div role="status" className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-muted">
      <i className="fas fa-spinner fa-spin text-3xl text-terracotta" aria-hidden="true" />
      <p className="text-sm">{label}</p>
    </div>
  )
}
