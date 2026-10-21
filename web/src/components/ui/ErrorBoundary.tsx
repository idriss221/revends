import { Component, type ErrorInfo, type ReactNode } from 'react'
import { EmptyState } from './States'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  message?: string
}

/**
 * ErrorBoundary racine.
 *
 * Sans lui, une exception levée dans un composant pendant le rendu démonte TOUT
 * l'arbre React → écran blanc, aucune récupération possible. On capture l'erreur,
 * on la journalise et on affiche un état de repli actionnable.
 *
 * Volontairement SANS dépendance à un contexte (qui pourrait être la source du
 * plantage) ni au routeur : le repli doit pouvoir s'afficher quoi qu'il arrive.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, message: error instanceof Error ? error.message : undefined }
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    // Point d'ancrage pour un futur remontage vers un service de logs.
    console.error('[ui] erreur de rendu interceptée par ErrorBoundary', error, info.componentStack)
  }

  private readonly reload = (): void => {
    window.location.reload()
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <EmptyState
          variant="card"
          title="Une erreur est survenue"
          description="L'affichage a rencontré un problème inattendu. Rechargez la page pour réessayer."
          action={{ label: 'Recharger la page', onClick: this.reload }}
        />
      </div>
    )
  }
}
