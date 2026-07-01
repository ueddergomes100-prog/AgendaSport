import { motion } from 'framer-motion'
import { Activity, Banknote, CalendarClock, Medal, ShieldCheck, Trophy, UsersRound, type LucideIcon } from 'lucide-react'

const featureCards: Array<{ title: string; value: string; detail: string; icon: LucideIcon; tone: string }> = [
  { title: 'Hoje tem evento', value: '20:30', detail: 'Local confirmado', icon: CalendarClock, tone: 'text-yellow-300' },
  { title: 'Confirmados', value: '18/20', detail: 'Presenca em tempo real', icon: UsersRound, tone: 'text-emerald-200' },
  { title: 'Equipes montadas', value: '4 equipes', detail: 'Sorteio equilibrado', icon: ShieldCheck, tone: 'text-cyan-200' },
  { title: 'Caixa do evento', value: 'R$ 420', detail: 'Mensalistas e avulsos', icon: Banknote, tone: 'text-yellow-200' },
  { title: 'Ranking atualizado', value: 'Ao vivo', detail: 'Pontos e assistencias', icon: Medal, tone: 'text-amber-200' },
  { title: 'Portal do participante', value: 'Online', detail: 'Inscricao e agenda', icon: Activity, tone: 'text-green-200' },
]

export function FloatingMatchCards() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {featureCards.map((item, index) => {
        const Icon = item.icon
        return (
          <motion.div
            key={item.title}
            className="login-feature-card"
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.32 + index * 0.06, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            whileHover={{ y: -4, scale: 1.02 }}
          >
            <div className={`grid size-10 place-items-center rounded-lg bg-white/10 ${item.tone}`}>
              <Icon size={19} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-wide text-white/52">{item.title}</p>
              <p className="mt-1 truncate text-lg font-black text-white">{item.value}</p>
              <p className="text-xs font-semibold text-white/62">{item.detail}</p>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}

export function MatchStatusCard() {
  return (
    <motion.div
      className="login-score-card"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.18, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-yellow-300">Pre-evento</p>
          <h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">Organize seus eventos como um profissional.</h2>
        </div>
        <div className="hidden rounded-lg border border-white/12 bg-white/8 px-4 py-3 text-center sm:block">
          <Trophy className="mx-auto text-yellow-300" size={24} />
          <p className="mt-2 text-xs font-black uppercase text-white/58">Agenda</p>
          <p className="text-xl font-black">Sport</p>
        </div>
      </div>
      <p className="mt-4 max-w-xl text-sm leading-6 text-white/70">
        Controle presenca, monte equipes, cobre mensalidades e acompanhe campeonatos em uma unica plataforma.
      </p>
      <div className="mt-5 grid gap-2 sm:grid-cols-3">
        <MiniMetric label="Participantes" value="240+" />
        <MiniMetric label="Eventos" value="18" />
        <MiniMetric label="Pagamentos" value="99%" />
      </div>
    </motion.div>
  )
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/8 px-3 py-2">
      <p className="text-xs font-semibold text-white/55">{label}</p>
      <p className="text-xl font-black text-white">{value}</p>
    </div>
  )
}
