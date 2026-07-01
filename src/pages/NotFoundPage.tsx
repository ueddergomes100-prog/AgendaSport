import { Link } from 'react-router-dom'
import { ArrowLeft, Goal, SearchX } from 'lucide-react'
import { Button } from '../components/ui/button'
import { SportBackground } from '../components/login/SportBackground'

export function NotFoundPage() {
  return (
    <main className="login-arena min-h-screen overflow-x-hidden text-white">
      <SportBackground />
      <div className="relative z-10 mx-auto grid min-h-screen max-w-4xl place-items-center px-4 py-10">
        <section className="login-score-card w-full text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-white/10 text-yellow-300">
            <SearchX size={30} />
          </div>
          <p className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-[0.22em] text-yellow-300">
            <Goal size={14} />
            Fora da agenda
          </p>
          <h1 className="mt-4 text-4xl font-black md:text-5xl">Pagina nao encontrada</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-white/70">
            Essa rota nao existe ou saiu da escalação. Volte para o painel e continue organizando a rodada.
          </p>
          <Button asChild className="mt-6">
            <Link to="/">
              <ArrowLeft size={16} />
              Voltar ao painel
            </Link>
          </Button>
        </section>
      </div>
    </main>
  )
}
