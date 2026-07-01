import { useQuery } from '@tanstack/react-query'
import { CalendarCheck, CheckCircle2, Clock, Medal, Trophy, UserCheck, XCircle } from 'lucide-react'
import { Card, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { SportBackground } from '../components/login/SportBackground'
import { AnimatedPage } from '../components/ui/sport'
import { getMatches } from '../lib/data'

export function PortalPage() {
  const matches = useQuery({ queryKey: ['portal-matches'], queryFn: getMatches })
  const upcoming = matches.data ?? []

  return (
    <main className="login-arena min-h-screen overflow-x-hidden px-4 py-6 text-foreground dark:text-slate-100">
      <SportBackground />
      <AnimatedPage className="relative z-10 mx-auto max-w-6xl">
        <section className="football-surface overflow-hidden rounded-2xl p-6 text-white shadow-xl shadow-green-950/15">
          <div className="stadium-lights" />
          <div className="relative z-10 grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <span className="rounded-md bg-white/15 px-3 py-1 text-xs font-black uppercase tracking-wide text-yellow-200">Portal do participante</span>
              <h1 className="mt-4 max-w-3xl text-3xl font-black tracking-tight md:text-4xl">Confirme presenca e acompanhe seus eventos</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/75">
                Aqui o participante ve os proximos encontros, acompanha rankings e responde a chamada quando o evento estiver aberto.
              </p>
            </div>
            <img src="/agendasport.svg" alt="Agenda Sport" className="size-16 rounded-2xl" />
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <PortalStat icon={<CalendarCheck size={18} />} label="Proximos eventos" value={upcoming.length} />
          <PortalStat icon={<Medal size={18} />} label="Ranking" value="Ativo" />
          <PortalStat icon={<UserCheck size={18} />} label="Estatisticas" value="Pessoais" />
        </section>

        <Card className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
            <div>
              <CardTitle className="text-xl font-black">Confirmacao de presenca</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Os eventos abertos aparecem aqui para resposta rapida.</p>
            </div>
            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-black text-green-800 dark:bg-green-900/50 dark:text-green-100">{upcoming.length} eventos</span>
          </div>

          <div className="grid gap-3 p-4">
            {upcoming.map((match) => (
              <div key={match.id} className="grid gap-4 rounded-xl border border-border bg-white/70 p-4 dark:bg-slate-950/40 lg:grid-cols-[1fr_auto] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-black">{match.notes?.trim() || 'Encontro esportivo'}</p>
                    <span className="rounded-md bg-muted px-2 py-1 text-xs font-black">{match.status}</span>
                  </div>
                  <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock size={16} />
                    {new Date(match.scheduled_at).toLocaleString('pt-BR')}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex">
                  <Button type="button"><CheckCircle2 size={16} /> SIM</Button>
                  <Button type="button" variant="ghost"><XCircle size={16} /> NAO</Button>
                </div>
              </div>
            ))}
            {!upcoming.length && (
              <div className="grid place-items-center rounded-xl border border-dashed border-border bg-muted/25 px-5 py-10 text-center">
                <Trophy className="text-primary" size={32} />
                <p className="mt-3 text-lg font-black">Nenhum evento aberto</p>
                <p className="mt-1 text-sm text-muted-foreground">Quando o organizador abrir a chamada, ela aparece aqui.</p>
              </div>
            )}
          </div>
        </Card>
      </AnimatedPage>
    </main>
  )
}

function PortalStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className="grid size-11 place-items-center rounded-xl bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-100">{icon}</div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-black">{value}</p>
        </div>
      </div>
    </Card>
  )
}
