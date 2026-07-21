import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowUpRight, CalendarDays, ClipboardList, Copy, Download, Medal, MessageCircle, Trophy } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { AnimatedPage } from '../components/ui/sport'
import { getCompletedMatchSheets, getCurrentCompany, getProfile } from '../lib/data'
import { hasModuleAccess } from '../lib/permissions'
import { displayPosition } from '../lib/positions'
import { usePrimaryStatLabel } from '../lib/stats-labels'
import type { CompletedMatchSheet, Match, MatchGameResult, MatchTeamResult, PlayerStatRow } from '../lib/types'

type MatchSummary = {
  matchId: string
  scheduledAt: string
  title: string
  status: Match['status']
  rows: PlayerStatRow[]
  hasSavedStats: boolean
  teamResults: MatchTeamResult[]
  gameResults: MatchGameResult[]
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
  const [selectedMatchId, setSelectedMatchId] = useState('')
  const primaryStat = usePrimaryStatLabel()
  const sheets = useQuery({ queryKey: ['completed-match-sheets'], queryFn: getCompletedMatchSheets })
  const company = useQuery({ queryKey: ['current-company'], queryFn: getCurrentCompany })
  const profile = useQuery({ queryKey: ['profile'], queryFn: getProfile })

  const events = useMemo(() => buildMatchSummaries(sheets.data ?? []), [sheets.data])
  const championRanking = useMemo(() => buildChampionRanking(events), [events])
  const selectedEvent = events.find((event) => event.matchId === selectedMatchId) ?? events[0] ?? null
  const selectedEventFinalized = selectedEvent?.status === 'ENCERRADA'
  const canManageResults = profile.data ? hasModuleAccess(profile.data, 'results') : false
  const rows = useMemo(() => selectedEvent?.rows ?? [], [selectedEvent])
  const presentRows = useMemo(() => rows.filter((row) => row.present).sort(comparePlayerRows), [rows])
  const absentRows = useMemo(() => rows.filter((row) => !row.present).sort(comparePlayerRows), [rows])
  const ranking = useMemo(() => aggregate(rows), [rows])
  const scorers = [...ranking].sort((a, b) => b.goals - a.goals || b.assists - a.assists || a.name.localeCompare(b.name, 'pt-BR'))
  const assistants = [...ranking].sort((a, b) => b.assists - a.assists || b.goals - a.goals || a.name.localeCompare(b.name, 'pt-BR'))
  const topScorer = scorers[0]
  const topAssistant = assistants.find((player) => player.assists > 0) ?? assistants[0]
  const totalGoals = rows.reduce((sum, row) => sum + (row.goals ?? 0), 0)
  const totalAssists = rows.reduce((sum, row) => sum + (row.assists ?? 0), 0)
  const teamResults = selectedEvent?.teamResults ?? []
  const gameResults = selectedEvent?.gameResults ?? []
  const teamWinner = getTeamWinner(teamResults)

  const whatsappSummary = [
    `SUMULA AGENDA SPORT - ${company.data?.name ?? 'Evento'}`,
    selectedEvent ? `Evento: ${selectedEvent.title}` : null,
    selectedEvent ? `Data: ${formatDate(selectedEvent.scheduledAt)} as ${formatTime(selectedEvent.scheduledAt)}` : null,
    '',
    `Presentes: ${presentRows.length}`,
    `Ausentes: ${absentRows.length}`,
    `Total de ${primaryStat.labels.lowerPlural}: ${totalGoals}`,
    `Assistencias: ${totalAssists}`,
    `Destaque: ${topScorer ? `${topScorer.name} (${topScorer.goals})` : '-'}`,
    gameResults.length ? 'Resultados das partidas:' : null,
    ...gameResults.map((game, index) => `${index + 1}. ${formatGameResult(game, teamResults)}`),
    teamResults.length ? `Vitorias por equipe: ${formatTeamWins(teamResults)}` : null,
    teamWinner ? `Equipe campea: ${teamWinner.name}` : null,
    '',
    `Ranking de ${primaryStat.labels.lowerPlural}:`,
    ...scorers.map((player, index) => `${index + 1}. ${player.name} - ${player.goals} / ${player.assists} assist.`),
  ].filter(Boolean).join('\n')

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
            <span className="page-kicker"><Trophy size={14} /> Eventos e sumulas</span>
            <h1 className="mt-4 max-w-3xl text-3xl font-black tracking-tight md:text-4xl">Acompanhe o evento e veja a sumula</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Eventos ja iniciados aparecem aqui para o fechamento. O relatorio, PDF e compartilhamento sao liberados depois que a sumula for finalizada.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => window.print()} disabled={!selectedEventFinalized}>
              <Download size={16} />
              Salvar PDF
            </Button>
            <Button type="button" onClick={openWhatsApp} disabled={!selectedEventFinalized}>
              <MessageCircle size={16} />
              WhatsApp
            </Button>
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)] xl:items-start">
        <aside className="no-print grid gap-3 xl:sticky xl:top-20">
          <Card className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-black">Eventos realizados</h2>
                <p className="mt-1 text-sm text-muted-foreground">{events.length} evento(s) encontrado(s)</p>
              </div>
              <ClipboardList className="text-primary" size={22} />
            </div>
            <div className="mt-4 grid max-h-[70vh] gap-2 overflow-auto pr-1">
              {events.map((event) => (
                <button
                  key={event.matchId}
                  type="button"
                  onClick={() => setSelectedMatchId(event.matchId)}
                  className={`rounded-xl border p-3 text-left transition ${selectedEvent?.matchId === event.matchId ? 'border-primary bg-green-50 shadow-sm dark:bg-green-950/30' : 'border-border bg-white/70 hover:border-primary dark:bg-slate-950/40'}`}
                >
                  <p className="font-black">{event.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{formatDate(event.scheduledAt)} as {formatTime(event.scheduledAt)}</p>
                  {event.status !== 'ENCERRADA' ? (
                    <p className="mt-2 rounded-lg bg-blue-100 px-2 py-1 text-xs font-black text-blue-900">Em andamento - finalizar sumula</p>
                  ) : !event.hasSavedStats ? (
                    <p className="mt-2 rounded-lg bg-amber-100 px-2 py-1 text-xs font-black text-amber-900">Somente presenca</p>
                  ) : null}
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs font-black">
                    <span className="rounded-lg bg-green-100 px-2 py-1 text-green-800">{event.rows.filter((row) => row.present).length} {event.status === 'ENCERRADA' ? 'pres.' : 'conf.'}</span>
                    <span className="rounded-lg bg-red-100 px-2 py-1 text-red-800">{event.rows.filter((row) => !row.present).length} {event.status === 'ENCERRADA' ? 'aus.' : 'demais'}</span>
                    <span className="rounded-lg bg-yellow-100 px-2 py-1 text-yellow-900">{event.rows.reduce((sum, row) => sum + (row.goals ?? 0), 0)} gols</span>
                  </div>
                </button>
              ))}
              {!events.length && (
                <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  Nenhum evento iniciado ou finalizado encontrado.
                </p>
              )}
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-black">Ranking de campeoes</h2>
                <p className="mt-1 text-sm text-muted-foreground">Rodadas finalizadas com vencedor unico.</p>
              </div>
              <Trophy className="text-yellow-600" size={22} />
            </div>
            <div className="mt-4 grid gap-2">
              {championRanking.map((team, index) => (
                <div key={team.name} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-white/70 px-3 py-2 dark:bg-slate-950/40">
                  <p className="font-black">{index + 1}. {team.name}</p>
                  <span className="rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-black text-yellow-900">{team.titles} titulo(s)</span>
                </div>
              ))}
              {!championRanking.length && <p className="text-sm text-muted-foreground">Nenhum campeao registrado ainda.</p>}
            </div>
          </Card>
        </aside>

        {selectedEvent && selectedEvent.status !== 'ENCERRADA' ? (
          <ActiveMatchNotice event={selectedEvent} canManageResults={canManageResults} />
        ) : selectedEvent ? (
          <MatchSheet
            companyName={company.data?.name ?? 'Agenda Sport'}
            event={selectedEvent}
            presentRows={presentRows}
            absentRows={absentRows}
            scorers={scorers}
            topScorer={topScorer}
            topAssistant={topAssistant}
            totalGoals={totalGoals}
            totalAssists={totalAssists}
            teamResults={teamResults}
            gameResults={gameResults}
            teamWinner={teamWinner}
            hasSavedStats={selectedEvent.hasSavedStats}
            statPlural={primaryStat.labels.plural}
            statLower={primaryStat.labels.lowerPlural}
            copyReportToWhatsApp={copyReportToWhatsApp}
          />
        ) : (
          <Card className="grid min-h-96 place-items-center p-10 text-center">
            <ClipboardList className="text-primary" size={40} />
            <h2 className="mt-4 text-2xl font-black">Nenhuma sumula encontrada</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">Quando um evento iniciar, ele aparecera aqui para lancamento e finalizacao.</p>
          </Card>
        )}
      </div>
    </AnimatedPage>
  )
}

function ActiveMatchNotice({ event, canManageResults }: { event: MatchSummary; canManageResults: boolean }) {
  const confirmed = event.rows.filter((row) => row.present).length
  const otherResponses = event.rows.length - confirmed

  return (
    <Card className="overflow-hidden p-0">
      <div className="bg-slate-950 p-5 text-white sm:p-6">
        <span className="inline-flex rounded-lg bg-blue-100 px-2.5 py-1 text-xs font-black uppercase text-blue-900">Evento em andamento</span>
        <h2 className="mt-4 text-2xl font-black sm:text-3xl">{event.title}</h2>
        <p className="mt-2 text-sm font-bold text-white/70">{formatDate(event.scheduledAt)} as {formatTime(event.scheduledAt)}</p>
      </div>
      <div className="p-5 sm:p-6">
        <h3 className="text-xl font-black">A sumula ainda precisa ser finalizada</h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          As confirmacoes abaixo ainda nao representam a presenca real. Abra o lancamento, confira quem compareceu e informe gols ou pontos e assistencias antes de encerrar.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:max-w-md">
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-green-950">
            <p className="text-xs font-black uppercase">Confirmados</p>
            <p className="mt-1 text-3xl font-black">{confirmed}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-slate-950">
            <p className="text-xs font-black uppercase">Demais respostas</p>
            <p className="mt-1 text-3xl font-black">{otherResponses}</p>
          </div>
        </div>
        {canManageResults ? (
          <Button asChild className="mt-5 w-full sm:w-auto">
            <Link to={`/lancamento/${event.matchId}`}>
              Abrir lancamento
              <ArrowUpRight size={16} />
            </Link>
          </Button>
        ) : (
          <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-950">
            Um administrador com permissao de sumula precisa finalizar este evento.
          </p>
        )}
      </div>
    </Card>
  )
}

function MatchSheet({
  companyName,
  event,
  presentRows,
  absentRows,
  scorers,
  topScorer,
  topAssistant,
  totalGoals,
  totalAssists,
  teamResults,
  gameResults,
  teamWinner,
  hasSavedStats,
  statPlural,
  statLower,
  copyReportToWhatsApp,
}: {
  companyName: string
  event: MatchSummary
  presentRows: PlayerStatRow[]
  absentRows: PlayerStatRow[]
  scorers: ReturnType<typeof aggregate>
  topScorer?: ReturnType<typeof aggregate>[number]
  topAssistant?: ReturnType<typeof aggregate>[number]
  totalGoals: number
  totalAssists: number
  teamResults: MatchTeamResult[]
  gameResults: MatchGameResult[]
  teamWinner: MatchTeamResult | null
  hasSavedStats: boolean
  statPlural: string
  statLower: string
  copyReportToWhatsApp: () => Promise<void>
}) {
  return (
    <section className="print-report overflow-hidden rounded-2xl bg-white shadow-2xl shadow-slate-950/10 dark:bg-slate-950">
      <div className="report-header bg-slate-950 p-5 text-white sm:p-6">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-green-300">{companyName}</p>
            <h2 className="report-title mt-3 text-3xl font-black sm:text-4xl">Sumula do evento</h2>
            <p className="mt-2 text-lg font-black text-yellow-300">{event.title}</p>
          </div>
          <img src="/agendasport.svg" alt="Agenda Sport" className="size-16 rounded-2xl" />
        </div>
        <div className="report-meta-grid mt-6 grid gap-3 md:grid-cols-4">
          <ReportMeta icon={<CalendarDays size={22} />} label="Data" value={formatDate(event.scheduledAt)} />
          <ReportMeta icon={<ClockIcon />} label="Horario" value={formatTime(event.scheduledAt)} />
          <ReportMeta icon={<ClipboardList size={22} />} label="Evento" value={event.title} />
          <ReportMeta icon={<Trophy size={22} />} label="Presentes" value={`${presentRows.length}`} />
        </div>
      </div>

      {!hasSavedStats && (
        <div className="mx-4 mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-950 sm:mx-5">
          Este evento esta encerrado, mas ainda nao tem estatisticas individuais salvas. A sumula abaixo foi montada pela presenca real; {statLower} e assistencias aparecem zerados.
        </div>
      )}

      <div className="report-main-grid grid gap-4 p-4 sm:p-5 xl:grid-cols-[1.2fr_0.8fr]">
        <StatsRankingTable title={`Ranking de ${statLower}`} statPlural={statPlural} rows={scorers} />
        <div className="grid gap-4">
          <SummaryPanel
            present={presentRows.length}
            absent={absentRows.length}
            goals={totalGoals}
            assists={totalAssists}
            statLabel={statPlural}
            topScorer={topScorer}
            topAssistant={topAssistant}
            statLower={statLower}
          />
          <ResultPanel teamResults={teamResults} gameResults={gameResults} teamWinner={teamWinner} />
        </div>
      </div>

      <div className="no-print flex flex-wrap justify-end gap-2 border-t border-border p-5">
        <Button type="button" variant="ghost" onClick={copyReportToWhatsApp}>
          <Copy size={16} />
          Copiar resumo
        </Button>
        <Button type="button" onClick={() => window.print()}>
          <Download size={16} />
          Salvar PDF
        </Button>
      </div>
    </section>
  )
}

function ReportMeta({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
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

function SummaryPanel({
  present,
  absent,
  goals,
  assists,
  statLabel,
  topScorer,
  topAssistant,
  statLower,
}: {
  present: number
  absent: number
  goals: number
  assists: number
  statLabel: string
  topScorer?: { name: string; goals: number } | null
  topAssistant?: { name: string; assists: number } | null
  statLower: string
}) {
  return (
    <div className="grid gap-4">
      <div className="rounded-2xl border border-border bg-white p-4 dark:bg-slate-950">
        <h3 className="mb-4 flex items-center gap-2 text-lg font-black">
          <ClipboardList className="text-primary" size={20} />
          Resumo estatistico
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <MetricTile label="Presentes" value={present} tone="green" />
          <MetricTile label="Ausentes" value={absent} tone="red" />
          <MetricTile label={statLabel} value={goals} tone="green" />
          <MetricTile label="Assistencias" value={assists} tone="green" />
        </div>
      </div>
      <div className="relative overflow-hidden rounded-2xl border border-green-200 bg-green-50 p-5 text-green-950 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-50">
        <div className="flex items-center gap-2">
          <Medal className="text-yellow-500" size={28} />
          <p className="text-lg font-black uppercase tracking-wide sm:text-xl">Destaque da partida</p>
        </div>
        <div className="mt-4 grid grid-cols-[72px_1fr] items-center gap-4">
          <div className="grid size-16 place-items-center rounded-full bg-green-700 text-3xl font-black text-white">{topScorer?.goals ?? 0}</div>
          <div>
            <p className="text-2xl font-black">{topScorer?.name ?? '-'}</p>
            <p className="mt-1 text-sm font-black uppercase text-green-700 dark:text-green-300">{topScorer?.goals ?? 0} {statLower}</p>
          </div>
        </div>
        <div className="mt-4 rounded-xl bg-white/70 p-3 text-sm font-bold text-green-950 dark:bg-slate-950/40 dark:text-green-50">
          Garcom da rodada: {topAssistant?.name ?? '-'} ({topAssistant?.assists ?? 0} assist.)
        </div>
      </div>
    </div>
  )
}

function MetricTile({ label, value, tone }: { label: string; value: number; tone: 'green' | 'red' }) {
  return (
    <div className="report-metric rounded-xl border border-border bg-white/70 p-3 text-center dark:bg-slate-950/40">
      <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-3xl font-black ${tone === 'green' ? 'text-green-700' : 'text-red-700'}`}>{value}</p>
    </div>
  )
}

function StatsRankingTable({ title, statPlural, rows }: { title: string; statPlural: string; rows: ReturnType<typeof aggregate> }) {
  return (
    <div className="rounded-2xl border border-border bg-white p-4 dark:bg-slate-950">
      <h3 className="mb-3 text-lg font-black">{title}</h3>
      <div className="overflow-hidden rounded-xl border border-border">
        <table className="report-stats-table w-full border-collapse text-sm">
          <thead className="bg-slate-950 text-white">
            <tr>
              <th className="w-12 px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">Participante</th>
              <th className="w-24 px-3 py-2 text-center">{statPlural}</th>
              <th className="w-28 px-3 py-2 text-center">Assist.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.playerId} className="border-t border-border odd:bg-muted/35">
                <td className="px-3 py-2 font-black">{index + 1}</td>
                <td className="px-3 py-2 font-black">{row.name}</td>
                <td className="px-3 py-2 text-center font-black">{row.goals}</td>
                <td className="px-3 py-2 text-center font-black">{row.assists}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">Ainda nao ha estatisticas lancadas neste evento.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ResultPanel({
  teamResults,
  gameResults,
  teamWinner,
}: {
  teamResults: MatchTeamResult[]
  gameResults: MatchGameResult[]
  teamWinner: MatchTeamResult | null
}) {
  return (
    <div className="rounded-2xl border border-border bg-white p-4 dark:bg-slate-950">
      <h3 className="mb-4 flex items-center gap-2 text-lg font-black">
        <span className="rounded-full bg-muted px-2 py-1 text-xs font-black text-muted-foreground">Resultado</span>
        Equipes
      </h3>
      {teamResults.length ? (
        <div className="grid gap-3">
          {gameResults.length ? (
            <div className="grid gap-1.5">
              {gameResults.map((game, index) => (
                <p key={game.id} className="rounded-lg bg-slate-950 px-3 py-2 text-center text-sm font-black text-white">
                  Jogo {index + 1}: {formatGameResult(game, teamResults)}
                </p>
              ))}
            </div>
          ) : (
            <p className="rounded-xl bg-slate-950 px-4 py-3 text-center text-xl font-black text-white">{formatLegacyTeamScore(teamResults)}</p>
          )}
          <p className="rounded-lg bg-muted px-3 py-2 text-center text-sm font-black">{formatTeamWins(teamResults)}</p>
          <p className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-black text-green-900 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-100">
            Campeao: {teamWinner?.name ?? 'Empate'}
          </p>
        </div>
      ) : (
        <EmptyStats text="Nenhum resultado por equipe foi informado no fechamento." />
      )}
    </div>
  )
}

function EmptyStats({ text = 'Ainda nao ha estatisticas lancadas neste evento.' }: { text?: string }) {
  return <p className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">{text}</p>
}

function buildMatchSummaries(sheets: CompletedMatchSheet[]): MatchSummary[] {
  return sheets
    .map((sheet) => ({
      matchId: sheet.match.id,
      scheduledAt: sheet.match.scheduled_at,
      title: sheet.match.notes?.replace(/^Agenda automatica:\s*/i, '').trim() || 'Evento esportivo',
      status: sheet.match.status,
      rows: sheet.rows,
      hasSavedStats: sheet.hasSavedStats,
      teamResults: sheet.match.team_results ?? [],
      gameResults: sheet.match.game_results ?? [],
    }))
    .filter((event) => event.rows.length > 0)
    .sort((left, right) => new Date(right.scheduledAt).getTime() - new Date(left.scheduledAt).getTime())
}

function buildChampionRanking(events: MatchSummary[]) {
  const counts = new Map<string, number>()
  events.filter((event) => event.status === 'ENCERRADA').forEach((event) => {
    const winner = getTeamWinner(event.teamResults)
    if (!winner) return
    counts.set(winner.name, (counts.get(winner.name) ?? 0) + 1)
  })
  return [...counts.entries()]
    .map(([name, titles]) => ({ name, titles }))
    .sort((left, right) => right.titles - left.titles || left.name.localeCompare(right.name, 'pt-BR'))
}

function comparePlayerRows(left: PlayerStatRow, right: PlayerStatRow) {
  return (left.player?.name ?? '').localeCompare(right.player?.name ?? '', 'pt-BR', { sensitivity: 'base' })
}

function getTeamWinner(results: MatchTeamResult[]) {
  if (!results.length) return null
  const highestScore = Math.max(...results.map((team) => Number(team.score ?? 0)))
  const winners = results.filter((team) => Number(team.score ?? 0) === highestScore)
  return winners.length === 1 ? winners[0] : null
}

function formatLegacyTeamScore(results: MatchTeamResult[]) {
  if (!results.length) return 'Sem resultado informado'
  return results.map((team) => `${team.name} ${team.score}`).join(' x ')
}

function formatTeamWins(results: MatchTeamResult[]) {
  if (!results.length) return 'Sem vitorias registradas'
  return results.map((team) => `${team.name}: ${team.score} vit.`).join(' | ')
}

function formatGameResult(game: MatchGameResult, teams: MatchTeamResult[]) {
  const home = teams.find((team) => team.id === game.homeTeamId)?.name ?? 'Equipe 1'
  const away = teams.find((team) => team.id === game.awayTeamId)?.name ?? 'Equipe 2'
  return `${home} ${game.homeScore} x ${game.awayScore} ${away}`
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
