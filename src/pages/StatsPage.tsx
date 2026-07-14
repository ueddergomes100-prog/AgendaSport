import { useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Award, CalendarDays, CheckCircle2, ClipboardList, Copy, Download, Handshake, Medal, MessageCircle, Trophy, XCircle } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Input, Select } from '../components/ui/field'
import { AnimatedPage } from '../components/ui/sport'
import { getCurrentCompany, getPlayerStats } from '../lib/data'
import { displayPosition } from '../lib/positions'
import { usePrimaryStatLabel, type PrimaryStatLabel } from '../lib/stats-labels'
import type { PlayerStatRow } from '../lib/types'

type Period = 'event' | 'week' | 'month' | 'date' | 'all'

const periodLabels: Record<Period, string> = {
  event: 'Evento selecionado',
  week: 'Semana',
  month: 'Mes',
  date: 'Data',
  all: 'Historico geral',
}

function isSameDay(dateValue: string, targetDate: string) {
  return toDateInputValue(new Date(dateValue)) === targetDate
}

function isSameMonth(dateValue: string, targetMonth: string) {
  return toMonthInputValue(new Date(dateValue)) === targetMonth
}

function isSameWeek(dateValue: string, targetWeek: string) {
  const range = weekInputToRange(targetWeek)
  if (!range) return true
  const date = new Date(dateValue)
  return date >= range.start && date <= range.end
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
  const [period, setPeriod] = useState<Period>('event')
  const [selectedMatchId, setSelectedMatchId] = useState('')
  const [selectedDate, setSelectedDate] = useState(() => toDateInputValue(new Date()))
  const [selectedWeek, setSelectedWeek] = useState(() => toWeekInputValue(new Date()))
  const [selectedMonth, setSelectedMonth] = useState(() => toMonthInputValue(new Date()))
  const primaryStat = usePrimaryStatLabel()
  const stats = useQuery({ queryKey: ['player-stats'], queryFn: getPlayerStats })
  const company = useQuery({ queryKey: ['current-company'], queryFn: getCurrentCompany })

  const availableMatches = useMemo(() => getAvailableMatches(stats.data ?? []), [stats.data])
  const effectiveMatchId = selectedMatchId || availableMatches[0]?.matchId || ''
  const filteredRows = useMemo(() => (stats.data ?? []).filter((row) => {
    const dateValue = row.match?.scheduled_at ?? row.created_at
    if (period === 'event') return row.match_id === effectiveMatchId
    if (period === 'week') return isSameWeek(dateValue, selectedWeek)
    if (period === 'month') return isSameMonth(dateValue, selectedMonth)
    if (period === 'date') return isSameDay(dateValue, selectedDate)
    return true
  }), [stats.data, period, effectiveMatchId, selectedWeek, selectedMonth, selectedDate])
  const ranking = useMemo(() => aggregate(filteredRows), [filteredRows])
  const scorers = [...ranking].sort((a, b) => b.goals - a.goals || b.assists - a.assists)
  const assistants = [...ranking].sort((a, b) => b.assists - a.assists || b.goals - a.goals)
  const topScorer = scorers[0]
  const topAssistant = assistants[0]
  const uniqueMatches = new Set(filteredRows.map((row) => row.match_id)).size
  const totalGoals = filteredRows.reduce((sum, row) => sum + (row.goals ?? 0), 0)
  const totalAssists = filteredRows.reduce((sum, row) => sum + (row.assists ?? 0), 0)
  const presentRows = useMemo(() => [...filteredRows].filter((row) => row.present).sort((a, b) => (a.player?.name ?? '').localeCompare(b.player?.name ?? '', 'pt-BR')), [filteredRows])
  const absentRows = useMemo(() => [...filteredRows].filter((row) => !row.present).sort((a, b) => (a.player?.name ?? '').localeCompare(b.player?.name ?? '', 'pt-BR')), [filteredRows])
  const chartData = scorers.slice(0, 8).map((player) => ({ name: player.name.split(' ')[0], indicador: player.goals, assistencias: player.assists }))
  const matchResults = useMemo(() => getUniqueMatchResults(filteredRows), [filteredRows])
  const teamRanking = useMemo(() => aggregateTeamWinners(matchResults), [matchResults])
  const selectedMatch = period === 'event' ? availableMatches.find((match) => match.matchId === effectiveMatchId) ?? null : null
  const periodDescription = getPeriodDescription(period, {
    selectedMatch,
    selectedDate,
    selectedWeek,
    selectedMonth,
  })

  const whatsappSummary = [
    `RELATORIO AGENDA SPORT - ${company.data?.name ?? 'Evento'}`,
    `Periodo: ${periodDescription}`,
    '',
    `Destaque em ${primaryStat.labels.lowerPlural}: ${topScorer ? `${topScorer.name} (${topScorer.goals})` : '-'}`,
    `Garcom: ${topAssistant ? `${topAssistant.name} (${topAssistant.assists} assist.)` : '-'}`,
    '',
    'Equipes campeas:',
    ...teamRanking.slice(0, 5).map((team, index) => `${index + 1}. ${team.name} - ${team.wins} vitoria(s)`),
    '',
    `Top ${primaryStat.labels.lowerPlural}:`,
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
            <h1 className="mt-4 max-w-3xl text-3xl font-black tracking-tight md:text-4xl">{primaryStat.labels.plural}, assistencias e presenca dos participantes</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Um painel para acompanhar desempenho individual em diferentes modalidades esportivas.
            </p>
          </div>
          <div className="grid w-full min-w-56 gap-2 sm:grid-cols-2 xl:w-[640px] xl:grid-cols-[1fr_1fr_auto_auto]">
            <Select value={period} onChange={(event) => setPeriod(event.target.value as Period)}>
              <option value="event">Evento</option>
              <option value="week">Semana</option>
              <option value="month">Mes</option>
              <option value="date">Data</option>
              <option value="all">Historico geral</option>
            </Select>
            {period === 'event' && (
              <Select value={effectiveMatchId} onChange={(event) => setSelectedMatchId(event.target.value)}>
                {availableMatches.map((match) => (
                  <option key={match.matchId} value={match.matchId}>{match.title} - {formatDate(match.scheduledAt)}</option>
                ))}
                {!availableMatches.length && <option value="">Nenhum evento finalizado</option>}
              </Select>
            )}
            {period === 'week' && <Input type="week" value={selectedWeek} onChange={(event) => setSelectedWeek(event.target.value)} />}
            {period === 'month' && <Input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} />}
            {period === 'date' && <Input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />}
            <Select value={primaryStat.preference} onChange={(event) => primaryStat.setPreference(event.target.value as PrimaryStatLabel)}>
              <option value="GOLS">Nomenclatura: Gols</option>
              <option value="PONTOS">Nomenclatura: Pontos</option>
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
              <p className="text-xs font-black uppercase tracking-[0.22em] text-yellow-300">Sumula oficial Agenda Sport</p>
              <h2 className="mt-3 text-3xl font-black">{period === 'event' ? selectedMatch?.title ?? 'Evento esportivo' : company.data?.name ?? 'Relatorio esportivo'}</h2>
              <p className="mt-2 text-sm text-white/65">Periodo: {periodDescription} - Gerado em {new Date().toLocaleDateString('pt-BR')}</p>
            </div>
            <img src="/agendasport.svg" alt="Agenda Sport" className="size-16 rounded-2xl" />
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-4">
            <ReportMeta icon={<CalendarDays size={22} />} label="Data" value={selectedMatch ? formatDate(selectedMatch.scheduledAt) : periodLabels[period]} />
            <ReportMeta icon={<ClockIcon />} label="Horario" value={selectedMatch ? formatTime(selectedMatch.scheduledAt) : '-'} />
            <ReportMeta icon={<ClipboardList size={22} />} label="Local" value={selectedMatch?.title ?? company.data?.name ?? 'Agenda Sport'} />
            <ReportMeta icon={<Trophy size={22} />} label="Formato" value={`${presentRows.length} presentes`} />
          </div>
        </div>

        <div className="grid gap-4 p-5 xl:grid-cols-[1fr_1fr]">
          <PresenceTable title="Quem compareceu" tone="present" rows={presentRows} />
          <PresenceTable title="Quem nao compareceu" tone="absent" rows={absentRows} />
        </div>

        <div className="grid gap-4 p-5 pt-0 xl:grid-cols-[1fr_1fr]">
          <SummaryPanel
            present={presentRows.length}
            absent={absentRows.length}
            goals={totalGoals}
            assists={totalAssists}
            statLabel={primaryStat.labels.plural}
            topScorer={topScorer}
            statLower={primaryStat.labels.lowerPlural}
          />
          <ReportRanking title={`Top ${primaryStat.labels.lowerPlural}`} label={primaryStat.labels.short} rows={scorers.slice(0, 10).map((player) => ({ name: player.name, meta: player.position, value: `${player.goals}` }))} />
        </div>

        <div className="grid gap-4 p-5 pt-0 xl:grid-cols-[420px_1fr]">
          <ReportRanking title="Equipes campeas" label="V" rows={teamRanking.slice(0, 10).map((team) => ({ name: team.name, meta: `${team.games} jogos com resultado`, value: `${team.wins}V` }))} />
          <div className="rounded-2xl border border-border bg-white p-4 dark:bg-slate-950">
            <h3 className="mb-4 text-lg font-black">Resultados dos eventos</h3>
            <div className="grid gap-2">
              {matchResults.slice(0, 8).map((match) => (
                <div key={match.matchId} className="rounded-xl border border-border bg-white/70 p-3 dark:bg-slate-950/40">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-black">{match.title}</p>
                    <span className="rounded-full bg-muted px-3 py-1 text-xs font-black text-muted-foreground">{new Date(match.scheduledAt).toLocaleDateString('pt-BR')}</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-muted-foreground">{formatTeamScore(match.results)}</p>
                </div>
              ))}
              {!matchResults.length && <EmptyStats />}
            </div>
          </div>
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
          <p className="mt-5 text-sm font-semibold text-muted-foreground">Dados aparecem apos o lancamento de {primaryStat.labels.lowerPlural} e assistencias dos eventos.</p>
        </Card>
      </section>

      <section className="no-print grid gap-4 xl:grid-cols-[1fr_420px]">
        <Card>
          <div className="mb-4 flex items-center gap-2">
            <Trophy className="text-primary" />
            <h2 className="text-lg font-black">Top {primaryStat.labels.lowerPlural}</h2>
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

      <section className="no-print grid gap-4 xl:grid-cols-[420px_1fr]">
        <Card>
          <div className="mb-4 flex items-center gap-2">
            <Medal className="text-primary" />
            <h2 className="text-lg font-black">Equipes campeas</h2>
          </div>
          <div className="grid gap-2">
            {teamRanking.slice(0, 10).map((team, index) => (
              <RankingRow key={team.name} index={index + 1} name={team.name} meta={`${team.games} jogos com resultado`} value={`${team.wins}V`} />
            ))}
            {!teamRanking.length && <EmptyStats />}
          </div>
        </Card>
        <Card>
          <div className="mb-4 flex items-center gap-2">
            <ClipboardList className="text-primary" />
            <h2 className="text-lg font-black">Resultados recentes</h2>
          </div>
          <div className="grid gap-2">
            {matchResults.slice(0, 8).map((match) => (
              <div key={match.matchId} className="rounded-xl border border-border bg-white/70 p-3 dark:bg-slate-950/40">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-black">{match.title}</p>
                  <span className="text-xs font-semibold text-muted-foreground">{new Date(match.scheduledAt).toLocaleDateString('pt-BR')}</span>
                </div>
                <p className="mt-2 text-sm font-semibold text-muted-foreground">{formatTeamScore(match.results)}</p>
              </div>
            ))}
            {!matchResults.length && <EmptyStats />}
          </div>
        </Card>
      </section>

      <Card className="no-print">
        <h2 className="text-lg font-black">{primaryStat.labels.plural} e assistencias por participante</h2>
        <div className="mt-4 h-80">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="indicador" name={primaryStat.labels.plural} fill="#166534" radius={[5, 5, 0, 0]} />
              <Bar dataKey="assistencias" name="Assistencias" fill="#eab308" radius={[5, 5, 0, 0]} />
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

function ReportMeta({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/8 px-3 py-3">
      <div className="text-green-300">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs font-black uppercase tracking-wide text-white/45">{label}</p>
        <p className="truncate text-sm font-black text-white">{value}</p>
      </div>
    </div>
  )
}

function PresenceTable({ title, tone, rows }: { title: string; tone: 'present' | 'absent'; rows: PlayerStatRow[] }) {
  const present = tone === 'present'
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white dark:bg-slate-950">
      <div className={`flex items-center gap-3 px-4 py-3 text-white ${present ? 'bg-green-700' : 'bg-red-700'}`}>
        {present ? <CheckCircle2 size={26} /> : <XCircle size={26} />}
        <h3 className="text-xl font-black uppercase tracking-wide">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead className="bg-slate-950 text-white">
            <tr>
              <th className="w-14 px-3 py-3 text-left">#</th>
              <th className="px-3 py-3 text-left">Participante</th>
              <th className="px-3 py-3 text-left">Funcao</th>
              <th className="px-3 py-3 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id} className="border-b border-border last:border-0">
                <td className={`px-3 py-2 font-black ${present ? 'bg-green-700 text-white' : 'bg-red-700 text-white'}`}>{index + 1}</td>
                <td className="px-3 py-2 font-black">{row.player?.name ?? 'Participante'}</td>
                <td className="px-3 py-2">{displayPosition(row.player?.primary_position)}</td>
                <td className={`px-3 py-2 font-black ${present ? 'text-green-700' : 'text-red-700'}`}>{present ? 'Presente' : 'Ausente'}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">Nenhum participante nesta lista.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SummaryPanel({
  present,
  absent,
  goals,
  assists,
  statLabel,
  topScorer,
  statLower,
}: {
  present: number
  absent: number
  goals: number
  assists: number
  statLabel: string
  topScorer?: { name: string; goals: number } | null
  statLower: string
}) {
  return (
    <div className="grid gap-4">
      <div className="overflow-hidden rounded-2xl border border-border bg-white dark:bg-slate-950">
        <div className="flex items-center gap-3 bg-slate-950 px-4 py-3 text-white">
          <ClipboardList className="text-green-300" size={24} />
          <h3 className="text-xl font-black uppercase tracking-wide">Resumo da partida</h3>
        </div>
        <div className="grid divide-y divide-border">
          <SummaryLine label="Presentes" value={present} tone="green" />
          <SummaryLine label="Ausentes" value={absent} tone="red" />
          <SummaryLine label={`Total de ${statLabel.toLowerCase()}`} value={goals} tone="green" />
          <SummaryLine label="Total de assistencias" value={assists} tone="green" />
        </div>
      </div>
      <div className="relative overflow-hidden rounded-2xl border border-green-200 bg-green-50 p-5 text-green-950 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-50">
        <div className="flex items-center gap-2">
          <Medal className="text-yellow-500" size={28} />
          <p className="text-xl font-black uppercase tracking-wide">Destaque da partida</p>
        </div>
        <div className="mt-4 grid grid-cols-[72px_1fr] items-center gap-4">
          <div className="grid size-16 place-items-center rounded-full bg-green-700 text-3xl font-black text-white">{topScorer?.goals ?? 0}</div>
          <div>
            <p className="text-2xl font-black">{topScorer?.name ?? '-'}</p>
            <p className="mt-1 text-sm font-black uppercase text-green-700 dark:text-green-300">{topScorer?.goals ?? 0} {statLower}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function SummaryLine({ label, value, tone }: { label: string; value: number; tone: 'green' | 'red' }) {
  return (
    <div className="grid grid-cols-[1fr_96px] items-center gap-3 px-4 py-3">
      <p className="font-black uppercase">{label}</p>
      <span className={`rounded-lg px-4 py-1.5 text-center text-lg font-black text-white ${tone === 'green' ? 'bg-green-700' : 'bg-red-700'}`}>{value}</span>
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

function getUniqueMatchResults(rows: PlayerStatRow[]) {
  const map = new Map<string, {
    matchId: string
    scheduledAt: string
    title: string
    results: NonNullable<PlayerStatRow['match']>['team_results']
  }>()

  rows.forEach((row) => {
    const results = row.match?.team_results ?? []
    if (!row.match || !results.length || map.has(row.match_id)) return
    map.set(row.match_id, {
      matchId: row.match_id,
      scheduledAt: row.match.scheduled_at,
      title: row.match.notes?.trim() || 'Evento esportivo',
      results,
    })
  })

  return [...map.values()].sort((left, right) => new Date(right.scheduledAt).getTime() - new Date(left.scheduledAt).getTime())
}

function aggregateTeamWinners(matches: ReturnType<typeof getUniqueMatchResults>) {
  const map = new Map<string, { name: string; wins: number; games: number }>()

  matches.forEach((match) => {
    const results = match.results ?? []
    if (!results.length) return
    const highestScore = Math.max(...results.map((team) => Number(team.score ?? 0)))
    const winners = results.filter((team) => Number(team.score ?? 0) === highestScore)

    results.forEach((team) => {
      const current = map.get(team.name) ?? { name: team.name, wins: 0, games: 0 }
      current.games += 1
      if (winners.length === 1 && winners[0]?.id === team.id) current.wins += 1
      map.set(team.name, current)
    })
  })

  return [...map.values()].sort((left, right) => right.wins - left.wins || right.games - left.games || left.name.localeCompare(right.name, 'pt-BR'))
}

function formatTeamScore(results: NonNullable<PlayerStatRow['match']>['team_results']) {
  if (!results?.length) return 'Sem resultado informado'
  return results.map((team) => `${team.name} ${team.score}`).join(' x ')
}

function getAvailableMatches(rows: PlayerStatRow[]) {
  const map = new Map<string, { matchId: string; scheduledAt: string; title: string }>()
  rows.forEach((row) => {
    if (!row.match || map.has(row.match_id)) return
    map.set(row.match_id, {
      matchId: row.match_id,
      scheduledAt: row.match.scheduled_at,
      title: row.match.notes?.trim() || 'Evento esportivo',
    })
  })
  return [...map.values()].sort((left, right) => new Date(right.scheduledAt).getTime() - new Date(left.scheduledAt).getTime())
}

function getPeriodDescription(period: Period, input: {
  selectedMatch: ReturnType<typeof getAvailableMatches>[number] | null
  selectedDate: string
  selectedWeek: string
  selectedMonth: string
}) {
  if (period === 'event') {
    return input.selectedMatch ? `${input.selectedMatch.title} - ${formatDate(input.selectedMatch.scheduledAt)}` : 'Evento selecionado'
  }
  if (period === 'date') return formatDate(`${input.selectedDate}T12:00:00`)
  if (period === 'month') {
    const [year, month] = input.selectedMonth.split('-').map(Number)
    if (!year || !month) return 'Mes selecionado'
    return new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  }
  if (period === 'week') {
    const range = weekInputToRange(input.selectedWeek)
    if (!range) return 'Semana selecionada'
    return `${formatDate(range.start.toISOString())} a ${formatDate(range.end.toISOString())}`
  }
  return 'Historico geral'
}

function toDateInputValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function toMonthInputValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function toWeekInputValue(date: Date) {
  const target = new Date(date)
  target.setHours(0, 0, 0, 0)
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7))
  const week1 = new Date(target.getFullYear(), 0, 4)
  const week = 1 + Math.round(((target.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
  return `${target.getFullYear()}-W${String(week).padStart(2, '0')}`
}

function weekInputToRange(value: string) {
  const match = value.match(/^(\d{4})-W(\d{2})$/)
  if (!match) return null
  const year = Number(match[1])
  const week = Number(match[2])
  if (!year || !week) return null
  const simple = new Date(year, 0, 1 + (week - 1) * 7)
  const day = simple.getDay()
  const monday = new Date(simple)
  monday.setDate(simple.getDate() - ((day + 6) % 7))
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  return { start: monday, end: sunday }
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}
