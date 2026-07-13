import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { Button } from './button'

type Props = {
  children: ReactNode
}

type State = {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Agenda Sport render error', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    const message = this.state.error.message
    const isDomMutationError = /insertBefore|removeChild|not a child/i.test(message)

    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 px-4 text-slate-950 dark:bg-slate-950 dark:text-white">
        <section className="max-w-xl rounded-2xl border border-border bg-white p-6 text-center shadow-xl dark:bg-slate-900">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-100">
            <AlertTriangle size={26} />
          </div>
          <h1 className="mt-5 text-2xl font-black">Nao foi possivel carregar esta tela</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {isDomMutationError
              ? 'O navegador alterou a pagina automaticamente. Recarregue a tela para abrir o Agenda Sport novamente.'
              : 'O Agenda Sport encontrou uma falha inesperada na interface. Tente recarregar a pagina.'}
          </p>
          <p className="mt-4 rounded-lg bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground">
            {isDomMutationError ? 'Se persistir, desative a traducao automatica nesta pagina.' : message}
          </p>
          <Button type="button" className="mt-5" onClick={() => window.location.reload()}>
            <RotateCcw size={16} />
            Recarregar
          </Button>
        </section>
      </main>
    )
  }
}
