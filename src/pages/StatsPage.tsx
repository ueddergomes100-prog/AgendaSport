import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Award, CalendarDays, Copy, Download, Handshake, Medal, MessageCircle, Trophy } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Select } from '../components/ui/field'
import { AnimatedPage } from '../components/ui/sport'
import { getCurrentCompany, getPlayerStats } from '../lib/data'
import { displayPosition } from '../lib/positions'
import type { PlayerStatRow } from '../lib/types'

type Period = 'day' | 'month' | 'year' | 'all'

const periodLabels: Record<Period, string> = {
  day: 'Hoje',
  month: 'Mes atual',
  year: 'Ano atual',
  all: 'Historico geral',
}

function isSamePeriod(dateValue: string, period: Period) {
  if (period === 'all') return true
  const date = new Date(dateValue)
  const now = new Date()
  if (period === 'day') return date.toDateString() === now.toDateString()
  if (period === 'month') return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
  return date.getFullYear() === now.getFullYear()
}

function aggregate(rows: PlayerStatRow[]) {
  const map = new Map<string, { playerId: string; name: string; position: string; goals: number; assists: number; games: number; wins: number; draws: number; losses: number }>()
  rows.forEach((row) => {
    const name = row.player?.name ?? 'Participante'
    const current = map.get(row.player_id) ?? {
      playerId: row.player_id,
      name,
      position: displayPosition(row.player?.primary_position),
      goals: 0,
      assists: 0,
      games: 0,
      wins: 0,
      draws: 0,
      losses: 0,
    }
    current.goals += row.goals ?? 0
    current.assists += row.assists ?? 0
    current.games += row.present ? 1 : 0
    current.wins += row.wins ?? 0
    current.draws += row.draws ?? 0
    current.losses += row.losses ?? 0
    map.set(row.player_id, current)
  })
  return [...map.values()]
}

export function StatsPage() {
  const [period, setPeriod] = useState<Period>('month')
  const stats = useQuery({ queryKey: ['player-stats'], queryFn: getPlayerStats })
  const company = useQuery({ queryKey: ['current-company'], queryFn: getCurrentCompany })

  const filteredRows = useMemo(() => (stats.data ?? []).filter((row) => isSamePeriod(row.match?.scheduled_at ?? row.created_at, period)), [stats.data, period])
  const ranking = useMemo(() => aggregate(filteredRows), [filteredRows])
  const scorers = [...ranking].sort((a, b) => b.goals - a.goals || b.assists - a.assists)
  const assistants = [...ranking].sort((a, b) => b.assists - a.assists || b.goals - a.goals)
  const topScorer = scorers[0]
  const topAssistant = assistants[0]
  const uniqueMatches = new Set(filteredRows.map((row) => row.match_id)).size
  const totalGoals = filteredRows.reduce((sum, row) => sum + (row.goals ?? 0), 0)
  const totalAssists = filteredRows.reduce((sum, row) => sum + (row.assists ?? 0), 0)
  const chartData = scorers.slice(0, 8).map((player) => ({ name: player.name.split(' ')[0], pontos: player.goals, assistencias: player.assists }))

  const whatsappSummary = [
    `RELATORIO AGENDA SPORT - ${company.data?.name ?? 'Evento'}`,
    `Periodo: ${periodLabels[period]}`,
    '',
    `Destaque em pontos: ${topScorer ? `${topScorer.name} (${topScorer.goals})` : '-'}`,
    `Garcom: ${topAssistant ? `${topAssistant.name} (${topAssistant.assists} assist.)` : '-'}`,
    '',
    'Top pontos:',
    ...scorers.slice(0, 5).map((player, index) => `${index + 1}. ${player.name} - ${player.goals}`),
    '',
    'Top assistentes:',
    ...assistants.slice(0, 5).map((player, index) => `${index + 1}. ${player.name} - ${player.assists} assist.`),
  ].join('\n')

  async function copyReportToWhatsApp() {
    await navigator.clipboard.writeText(whatsappSummary)
  }

  function openWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(whatsappSummary)}`, '_blank', 'noopener,noreferrer')
  }

  return (
    <AnimatedPage>
      <section className="premium-panel no-print overflow-hidden rounded-2xl p-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <span className="page-kicker"><Trophy size={14} /> Relatorio esportivo</span>
            <h1 className="mt-4 max-w-3xl text-3xl font-black tracking-tight md:text-4xl">Pontos, assistencias e presenca dos participantes</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Um painel para acompanhar desempenho individual em diferentes modalidades esportivas.
            </p>
          </div>
          <div className="grid w-full min-w-56 gap-2 sm:grid-cols-[1fr_auto_auto]">
            <Select value={period} onChange={(event) => setPeriod(event.target.value as Period)}>
              <option value="day">Hoje</option>
              <option value="month">Mes atual</option>
              <option value="year">Ano atual</option>
              <option value="all">Historico geral</option>
            </Select>
            <Button type="button" variant="secondary" onClick={() => window.print()}>
              <Download size={16} />
              Salvar PDF
            </Button>
            <Button type="button" onClick={openWhatsApp}>
              <MessageCircle size={16} />
              WhatsApp
            </Button>
          </div>
        </div>
      </section>

      <section className="print-report overflow-hidden rounded-3xl bg-white shadow-2xl shadow-slate-950/10 dark:bg-slate-950">
        <div className="bg-slate-950 p-6 text-white">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-yellow-300">Relatorio oficial Agenda Sport</p>
              <h2 className="mt-3 text-3xl font-black">{company.data?.name ?? 'Relatorio esportivo'}</h2>
              <p className="mt-2 text-sm text-white/65">Periodo: {periodLabels[period]} - Gerado em {new Date().toLocaleDateString('pt-BR')}</p>
            </div>
            <img src="/agendasport.svg" alt="Agenda Sport" className="size-16 rounded-2xl" />
          </div>
        </div>

        <div className="grid gap-4 p-5 lg:grid-cols-3">
          <div className="rounded-2xl border border-border bg-slate-950 p-5 text-white">
            <p className="text-sm text-white/65">Destaque em pontos</p>
            <p className="mt-2 text-2xl font-black">{topScorer?.name ?? '-'}</p>
            <p className="mt-5 text-4xl font-black text-yellow-300">{topScorer?.goals ?? 0}</p>
          </div>
          <div className="rounded-2xl border border-border bg-green-50 p-5 text-green-950">
            <p className="text-sm text-green-900/65">Maior assistente</p>
            <p className="mt-2 text-2xl font-black">{topAssistant?.name ?? '-'}</p>
            <p className="mt-5 text-4xl font-black text-primary">{topAssistant?.assists ?? 0} assist.</p>
          </div>
          <div className="rounded-2xl border border-border bg-yellow-50 p-5 text-yellow-950">
            <p className="text-sm text-yellow-900/65">Eventos com estatisticas</p>
            <p className="mt-2 text-2xl font-black">{uniqueMatches}</p>
            <p className="mt-5 text-sm font-semibold">{totalGoals} pontos e {totalAssists} assistencias lancados no periodo.</p>
          </div>
        </div>

        <div className="grid gap-4 p-5 pt-0 xl:grid-cols-[1fr_420px]">
          <ReportRanking title="Top pontos" label="Pts" rows={scorers.slice(0, 10).map((player) => ({ name: player.name, meta: player.position, value: `${player.goals}` }))} />
          <ReportRanking title="Maiores assistentes" label="Assist." rows={assistants.slice(0, 10).map((player) => ({ name: player.name, meta: player.position, value: `${player.assists} assist.` }))} />
        </div>

        <div className="no-print flex flex-wrap justify-end gap-2 border-t border-border p-5">
          <Button type="button" variant="ghost" onClick={copyReportToWhatsApp}>
            <Copy size={16} />
            Copiar resumo
          </Button>
          <Button type="button" onClick={() => window.print()}>
            <Download size={16} />
            Salvar em PDF
          </Button>
        </div>
      </section>

      <section className="no-print grid gap-4 lg:grid-cols-3">
        <Card className="bg-slate-950 text-white">
          <div className="flex items-center gap-3">
            <div className="grid size-12 place-items-center rounded-xl bg-yellow-300 text-slate-950"><Medal /></div>
            <div>
              <p className="text-sm text-white/65">Destaque</p>
              <p className="text-2xl font-black">{topScorer?.name ?? '-'}</p>
            </div>
          </div>
          <p className="mt-5 text-4xl font-black text-yellow-300">{topScorer?.goals ?? 0}</p>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="grid size-12 place-items-center rounded-xl bg-green-100 text-green-800"><Handshake /></div>
            <div>
              <p className="text-sm text-muted-foreground">Garcom</p>
              <p className="text-2xl font-black">{topAssistant?.name ?? '-'}</p>
            </div>
          </div>
          <p className="mt-5 text-4xl font-black text-primary">{topAssistant?.assists ?? 0} assist.</p>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="grid size-12 place-items-center rounded-xl bg-yellow-100 text-yellow-800"><CalendarDays /></div>
            <div>
              <p className="text-sm text-muted-foreground">Eventos com estatistica</p>
              <p className="text-2xl font-black">{uniqueMatches}</p>
            </div>
          </div>
          <p className="mt-5 text-sm font-semibold text-muted-foreground">Dados aparecem apos o lancamento de pontos e assistencias dos eventos.</p>
        </Card>
      </section>

      <section className="no-print grid gap-4 xl:grid-cols-[1fr_420px]">
        <Card>
          <div className="mb-4 flex items-center gap-2">
            <Trophy className="text-primary" />
            <h2 className="text-lg font-black">Top pontos</h2>
          </div>
          <div className="grid gap-2">
            {scorers.slice(0, 10).map((player, index) => (
              <RankingRow key={player.playerId} index={index + 1} name={player.name} meta={`${player.position} - ${formatCampaign(player)}`} value={`${player.goals}`} />
            ))}
            {!scorers.length && <EmptyStats />}
          </div>
        </Card>
        <Card>
          <div className="mb-4 flex items-center gap-2">
            <Award className="text-primary" />
            <h2 className="text-lg font-black">Maiores assistentes</h2>
          </div>
          <div className="grid gap-2">
            {assistants.slice(0, 10).map((player, index) => (
              <RankingRow key={player.playerId} index={index + 1} name={player.name} meta={`${player.position} - ${formatCampaign(player)}`} value={`${player.assists} assist.`} />
            ))}
            {!assistants.length && <EmptyStats />}
          </div>
        </Card>
      </section>

      <Card className="no-print">
        <h2 className="text-lg font-black">Pontos e assistencias por participante</h2>
        <div className="mt-4 h-80">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="pontos" fill="#166534" radius={[5, 5, 0, 0]} />
              <Bar dataKey="assistencias" fill="#eab308" radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </AnimatedPage>
  )
}

function ReportRanking({ title, label, rows }: { title: string; label: string; rows: Array<{ name: string; meta: string; value: string }> }) {
  return (
    <div className="rounded-2xl border border-border bg-white p-4 dark:bg-slate-950">
      <h3 className="mb-4 flex items-center gap-2 text-lg font-black">
        <span className="rounded-full bg-muted px-2 py-1 text-xs font-black text-muted-foreground">{label}</span>
        {title}
      </h3>
      <div className="grid gap-2">
        {rows.map((row, index) => (
          <RankingRow key={`${row.name}-${index}`} index={index + 1} name={row.name} meta={row.meta} value={row.value} />
        ))}
        {!rows.length && <EmptyStats />}
      </div>
    </div>
  )
}


function RankingRow({ index, name, meta, value }: { index: number; name: string; meta: string; value: string }) {
  return (
    <div className="grid grid-cols-[42px_1fr_auto] items-center gap-3 rounded-xl border border-border bg-white/70 p-3 dark:bg-slate-950/40">
      <span className="grid size-9 place-items-center rounded-lg bg-muted text-sm font-black">{index}</span>
      <div className="min-w-0">
        <p className="truncate font-black">{name}</p>
        <p className="text-xs text-muted-foreground">{meta}</p>
      </div>
      <span className="rounded-full bg-primary px-3 py-1 text-sm font-black text-white">{value}</span>
    </div>
  )
}

function EmptyStats() {
  return <p className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">Ainda nao ha estatisticas lancadas neste periodo.</p>
}

function formatCampaign(player: { wins: number; draws: number; losses: number; games: number }) {
  if (!player.games) return 'sem presenca'
  return `${player.games} eventos, ${player.wins}V ${player.draws}E ${player.losses}D`
}
