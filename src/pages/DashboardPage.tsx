import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AlertCircle, Building2, CalendarClock, CheckCircle2, Copy, DollarSign, Goal, LockKeyhole, MessageCircle, Shield, Trophy, Users } from 'lucide-react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '../components/ui/button'
import { Card, CardTitle } from '../components/ui/card'
import { AnimatedNumber } from '../components/ui/animated-number'
import { AnimatedPage } from '../components/ui/sport'
import { getCompanies, getDashboardStats, getMatches, getPlayerStats, getProfile } from '../lib/data'
import { money } from '../lib/utils'

export function DashboardPage() {
  const profile = useQuery({ queryKey: ['profile'], queryFn: getProfile })
  const stats = useQuery({ queryKey: ['dashboard'], queryFn: getDashboardStats })
  const matches = useQuery({ queryKey: ['matches'], queryFn: getMatches })
  const companies = useQuery({ queryKey: ['companies'], queryFn: getCompanies, enabled: profile.data?.role === 'SUPER_ADMIN' })
  const playerStats = useQuery({ queryKey: ['player-stats-dashboard'], queryFn: getPlayerStats, enabled: Boolean(profile.data) && profile.data?.role !== 'SUPER_ADMIN' })
  const chartData = (matches.data ?? []).slice(0, 8).reverse().map((match) => ({
    name: new Date(match.scheduled_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    presencas: (playerStats.data ?? []).filter((row) => row.match_id === match.id && row.present).length,
    pontos: (playerStats.data ?? []).filter((row) => row.match_id === match.id).reduce((sum, row) => sum + (row.goals ?? 0), 0),
  }))

  if (profile.data?.role === 'SUPER_ADMIN') {
    const allCompanies = companies.data ?? []
    const active = allCompanies.filter((company) => company.status === 'ATIVA').length
    const blocked = allCompanies.filter((company) => company.status === 'BLOQUEADA').length
    const withLinks = allCompanies.filter((company) => company.registration_token).length
    const planData = ['Starter', 'Pro', 'Elite'].map((plan) => ({
      plan,
      empresas: allCompanies.filter((company) => company.plan_code === plan).length,
    }))
    const values = [
      { label: 'Total de empresas', value: allCompanies.length, icon: Building2 },
      { label: 'Empresas ativas', value: active, icon: Shield },
      { label: 'Links prontos', value: withLinks, icon: Copy },
      { label: 'Bloqueadas', value: blocked, icon: LockKeyhole },
    ]

    return (
      <AnimatedPage>
        <section className="premium-panel overflow-hidden rounded-2xl p-6">
          <div className="grid gap-6 xl:grid-cols-[1fr_440px] xl:items-center">
            <div>
              <span className="page-kicker"><Trophy size={14} /> Painel da plataforma</span>
              <h1 className="mt-4 max-w-3xl text-3xl font-black tracking-tight md:text-4xl">Cadastre empresas e coloque participantes entrando pelo WhatsApp</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                O Agenda Sport fica mais simples quando o Super Admin cuida de empresas e links. A operacao esportiva acontece dentro de cada empresa.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button asChild>
                  <Link to="/admin">
                    <Building2 size={16} />
                    Gerenciar empresas
                  </Link>
                </Button>
                <Button asChild variant="ghost">
                  <Link to="/admin">
                    <MessageCircle size={16} />
                    Copiar convites
                  </Link>
                </Button>
              </div>
            </div>
            <div className="rounded-2xl bg-slate-950 p-5 text-white shadow-2xl shadow-slate-950/20">
              <p className="text-xs font-black uppercase tracking-wide text-yellow-300">Progresso do setup</p>
              <div className="mt-4 grid gap-3">
                {[
                  { label: 'Empresas cadastradas', done: allCompanies.length > 0 },
                  { label: 'Links de inscricao gerados', done: withLinks > 0 },
                  { label: 'Convite pronto para WhatsApp', done: withLinks > 0 },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-3 rounded-xl bg-white/8 p-3">
                    <CheckCircle2 className={item.done ? 'text-yellow-300' : 'text-white/35'} size={18} />
                    <span className="text-sm font-semibold">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {values.map((item) => {
            const Icon = item.icon
            return (
              <Card key={item.label} className="relative overflow-hidden">
                <div className="absolute right-0 top-0 h-full w-1 bg-accent" />
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-muted-foreground">{item.label}</p>
                    <p className="mt-2 text-2xl font-black">{typeof item.value === 'number' ? <AnimatedNumber value={item.value} /> : item.value}</p>
                  </div>
                  <Icon className="text-primary" />
                </div>
              </Card>
            )
          })}
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <Card>
            <CardTitle>Empresas por plano</CardTitle>
            <div className="mt-4 h-72">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={planData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="plan" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="empresas" fill="#166534" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card>
            <CardTitle>Proxima acao</CardTitle>
            <div className="mt-4 grid gap-3">
              <div className="rounded-xl border border-border bg-muted/60 p-4">
                <p className="text-sm font-black">1. Abra Empresas e links</p>
                <p className="mt-1 text-sm text-muted-foreground">Cada empresa tem um botao principal para copiar a mensagem do WhatsApp.</p>
              </div>
              <div className="rounded-xl border border-border bg-muted/60 p-4">
                <p className="text-sm font-black">2. Envie para os participantes</p>
                <p className="mt-1 text-sm text-muted-foreground">Eles entram direto como cadastro da empresa certa.</p>
              </div>
              <Button asChild>
                <Link to="/admin">Ir para empresas</Link>
              </Button>
            </div>
          </Card>
        </section>
      </AnimatedPage>
    )
  }

  const values = [
    { label: 'Proximo evento', value: stats.data?.next_match ? new Date(stats.data.next_match).toLocaleString('pt-BR') : '-', icon: CalendarClock },
    { label: 'Participantes confirmados', value: stats.data?.confirmed ?? 0, icon: Users },
    { label: 'Fila de espera', value: stats.data?.waitlist ?? 0, icon: AlertCircle },
    { label: 'Receita do mes', value: money(stats.data?.monthly_revenue), icon: DollarSign },
    { label: 'Inadimplentes', value: stats.data?.overdue ?? 0, icon: AlertCircle },
    { label: 'Destaque do mes', value: stats.data?.monthly_top_scorer ?? '-', icon: Trophy },
  ]

  return (
    <AnimatedPage>
      <section className="football-surface overflow-hidden rounded-2xl p-6 text-white shadow-xl shadow-green-950/15">
        <div className="stadium-lights" />
        <div className="relative z-10 grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-md bg-white/12 px-3 py-1 text-xs font-bold uppercase tracking-wide text-yellow-200">
              <Goal size={15} />
              Central esportiva
            </div>
            <h1 className="text-3xl font-black">Dashboard</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/75">Indicadores de agenda, presenca, desempenho e financeiro para diferentes modalidades.</p>
          </div>
          <div className="scoreboard rounded-2xl p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-yellow-200">Proximo evento</p>
            <p className="mt-2 text-lg font-black">{stats.data?.next_match ? new Date(stats.data.next_match).toLocaleString('pt-BR') : 'Sem evento marcado'}</p>
          </div>
        </div>
      </section>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {values.map((item) => {
          const Icon = item.icon
          return (
            <Card key={item.label} className="relative overflow-hidden">
              <div className="absolute right-0 top-0 h-full w-1 bg-primary" />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">{item.label}</p>
                  <p className="mt-2 text-2xl font-black">{typeof item.value === 'number' ? <AnimatedNumber value={item.value} /> : item.value}</p>
                </div>
                <div className="grid size-11 place-items-center rounded-xl bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-100">
                  <Icon size={19} />
                </div>
              </div>
            </Card>
          )
        })}
      </section>
      <Card className="overflow-hidden p-0">
        <div className="border-b border-border p-5">
          <CardTitle className="text-xl font-black">Participacao e pontos</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">Historico recente dos eventos encerrados com estatisticas individuais.</p>
        </div>
        <div className="h-80 p-5">
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Area dataKey="presencas" stroke="#0f766e" fill="#99f6e4" />
              <Area dataKey="pontos" stroke="#d97706" fill="#fed7aa" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </AnimatedPage>
  )
}
