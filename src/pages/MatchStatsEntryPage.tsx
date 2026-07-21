import { useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2, ClipboardList, LoaderCircle, Plus, Save, Trash2, Trophy, Users } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Card, CardTitle } from '../components/ui/card'
import { Select } from '../components/ui/field'
import { NumberStepper } from '../components/ui/number-stepper'
import { AnimatedPage, ConfirmDialog } from '../components/ui/sport'
import {
  createMatch,
  getAttendance,
  getLatestTeamDraw,
  getMatchPlayerStats,
  getMatches,
  getPickups,
  saveMatchPlayerStat,
  savePostMatchStats,
  shareMatchWithConfiguredGroup,
  upsertAttendance,
} from '../lib/data'
import { displayPosition } from '../lib/positions'
import { clearMatchStatsDraft, readMatchStatsDrafts, writeMatchStatsDraft } from '../lib/match-stats-draft'
import { usePrimaryStatLabel } from '../lib/stats-labels'
import type { Attendance, Match, MatchGameResult, MatchTeamResult } from '../lib/types'
import { compareTextPtBr, getErrorMessage } from '../lib/utils'

export function MatchStatsEntryPage() {
  const { matchId = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const matches = useQuery({ queryKey: ['matches'], queryFn: getMatches })
  const pickups = useQuery({ queryKey: ['pickups'], queryFn: getPickups })
  const attendance = useQuery({ queryKey: ['attendance', matchId], queryFn: () => getAttendance(matchId), enabled: Boolean(matchId) })
  const matchStats = useQuery({ queryKey: ['match-player-stats', matchId], queryFn: () => getMatchPlayerStats(matchId), enabled: Boolean(matchId) })
  const latestTeamDraw = useQuery({ queryKey: ['latest-team-draw', matchId], queryFn: () => getLatestTeamDraw(matchId), enabled: Boolean(matchId) })
  const [saving, setSaving] = useState(false)
  const [savingProgress, setSavingProgress] = useState(false)
  const [savingPartialId, setSavingPartialId] = useState('')
  const [feedback, setFeedback] = useState('')
  const [toast, setToast] = useState('')
  const [confirmFinish, setConfirmFinish] = useState(false)
  const [gameDraft, setGameDraft] = useState<{ matchId: string; results: MatchGameResult[] } | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const { labels: primaryStatLabels } = usePrimaryStatLabel()

  const selectedMatch = useMemo(() => (matches.data ?? []).find((match) => match.id === matchId) ?? null, [matches.data, matchId])
  const selectedPickup = useMemo(() => (pickups.data ?? []).find((pickup) => pickup.id === selectedMatch?.pickup_id) ?? null, [pickups.data, selectedMatch])
  const statsByPlayerId = useMemo(() => new Map((matchStats.data ?? []).map((row) => [row.player_id, row] as const)), [matchStats.data])
  const drawTeams = useMemo(() => latestTeamDraw.data?.payload?.teams ?? [], [latestTeamDraw.data])
  const initialGameResults = useMemo(() => {
    if (selectedMatch?.game_results?.length) return selectedMatch.game_results
    if (drawTeams.length >= 2) return [createGameResult(drawTeams[0].id, drawTeams[1].id)]
    return []
  }, [selectedMatch, drawTeams])
  const gameResults = gameDraft?.matchId === matchId ? gameDraft.results : initialGameResults
  const localDrafts = readMatchStatsDrafts(matchId)
  const rows = useMemo(
    () => (attendance.data ?? [])
      .filter((row) => ['CONFIRMADO', 'COMPARECEU', 'FALTOU'].includes(row.status) && row.player)
      .sort((left, right) => compareTextPtBr(left.player?.name, right.player?.name)),
    [attendance.data],
  )
  const canLaunchStats = selectedMatch ? canLaunchStatsForMatch(selectedMatch) : false
  const totals = rows.reduce(
    (acc, item) => {
      const saved = statsByPlayerId.get(item.player_id)
      acc.points += saved?.goals ?? 0
      acc.assists += saved?.assists ?? 0
      if (saved?.present ?? item.status !== 'FALTOU') acc.present += 1
      return acc
    },
    { present: 0, points: 0, assists: 0 },
  )

  function notify(message: string) {
    setToast(message)
    window.setTimeout(() => setToast((current) => (current === message ? '' : current)), 2200)
  }

  function buildRowFromForm(item: Attendance, override: Partial<{ present: boolean; goals: number; assists: number }> = {}) {
    const form = formRef.current
    const row = {
      playerId: item.player_id,
      present: override.present ?? form?.querySelector<HTMLInputElement>(`[name="present-${item.player_id}"]`)?.checked ?? item.status !== 'FALTOU',
      goals: override.goals ?? Number(form?.querySelector<HTMLInputElement>(`[name="goals-${item.player_id}"]`)?.value || 0),
      assists: override.assists ?? Number(form?.querySelector<HTMLInputElement>(`[name="assists-${item.player_id}"]`)?.value || 0),
      wins: 0,
      draws: 0,
      losses: 0,
    }
    writeMatchStatsDraft(matchId, row)
    return row
  }

  function buildTeamResults(): MatchTeamResult[] {
    return drawTeams.map((team) => ({
      id: team.id,
      name: team.name,
      score: gameResults.filter((game) => getGameWinnerId(game) === team.id).length,
      playerIds: team.players.map((player) => player.id),
    }))
  }

  function applyGameResultsToRows<T extends { playerId: string; present: boolean; wins?: number; draws?: number; losses?: number }>(statRows: T[]) {
    return statRows.map((row) => {
      const team = drawTeams.find((teamResult) => teamResult.players.some((player) => player.id === row.playerId))
      if (!row.present || !team) return { ...row, wins: 0, draws: 0, losses: 0 }
      let wins = 0
      let draws = 0
      let losses = 0
      gameResults.forEach((game) => {
        if (![game.homeTeamId, game.awayTeamId].includes(team.id)) return
        const winnerId = getGameWinnerId(game)
        if (!winnerId) draws += 1
        else if (winnerId === team.id) wins += 1
        else losses += 1
      })
      return {
        ...row,
        wins,
        draws,
        losses,
      }
    })
  }

  function addGame() {
    if (drawTeams.length < 2) return
    updateGameResults((current) => [
      ...current,
      createGameResult(drawTeams[0].id, drawTeams[1].id),
    ])
  }

  function updateGame(gameId: string, patch: Partial<MatchGameResult>) {
    updateGameResults((current) => current.map((game) => (game.id === gameId ? { ...game, ...patch } : game)))
  }

  function updateGameResults(updater: (current: MatchGameResult[]) => MatchGameResult[]) {
    setGameDraft({
      matchId,
      results: updater(gameDraft?.matchId === matchId ? gameDraft.results : initialGameResults),
    })
  }

  async function savePartialRow(item: Attendance, override: Partial<{ present: boolean; goals: number; assists: number }> = {}) {
    if (!selectedMatch || !canLaunchStats) return
    const row = buildRowFromForm(item, override)
    const saved = statsByPlayerId.get(item.player_id)
    setSavingPartialId(item.player_id)
    setFeedback('')
    try {
      await saveMatchPlayerStat(selectedMatch.id, {
        ...row,
        wins: saved?.wins ?? 0,
        draws: saved?.draws ?? 0,
        losses: saved?.losses ?? 0,
      })
      await upsertAttendance(selectedMatch.id, row.playerId, row.present ? 'COMPARECEU' : 'FALTOU')
      clearMatchStatsDraft(selectedMatch.id, row.playerId)
      await Promise.all([attendance.refetch(), matchStats.refetch()])
      await queryClient.invalidateQueries({ queryKey: ['completed-match-sheets'] })
      notify('Atualizado com sucesso.')
    } catch (error) {
      setFeedback(getErrorMessage(error, 'Nao foi possivel atualizar este participante.'))
    } finally {
      setSavingPartialId('')
    }
  }

  async function saveProgress() {
    if (!selectedMatch || !formRef.current || !canLaunchStats) return
    const form = new FormData(formRef.current)
    const statRows = applyGameResultsToRows(rows.map((item) => ({
      playerId: item.player_id,
      present: form.get(`present-${item.player_id}`) === 'on',
      goals: Number(form.get(`goals-${item.player_id}`) || 0),
      assists: Number(form.get(`assists-${item.player_id}`) || 0),
      wins: 0,
      draws: 0,
      losses: 0,
    })))

    statRows.forEach((row) => writeMatchStatsDraft(selectedMatch.id, row))
    setSavingProgress(true)
    setFeedback('')
    try {
      await savePostMatchStats(
        selectedMatch.id,
        {
          team_a_score: selectedMatch.team_a_score,
          team_b_score: selectedMatch.team_b_score,
          team_results: buildTeamResults(),
          game_results: gameResults,
          status: selectedMatch.status,
        },
        statRows,
      )

      let attendanceWarning = ''
      try {
        await Promise.all(statRows.map((row) => upsertAttendance(selectedMatch.id, row.playerId, row.present ? 'COMPARECEU' : 'FALTOU')))
      } catch (error) {
        attendanceWarning = ` Os numeros foram gravados, mas a presenca nao sincronizou: ${getErrorMessage(error, 'tente novamente.')}`
      }

      clearMatchStatsDraft(selectedMatch.id)
      await Promise.all([
        attendance.refetch(),
        matchStats.refetch(),
        matches.refetch(),
        queryClient.invalidateQueries({ queryKey: ['completed-match-sheets'] }),
      ])
      setFeedback(`Progresso salvo sem encerrar o evento.${attendanceWarning}`)
      notify('Progresso salvo com sucesso.')
    } catch (error) {
      setFeedback(`${getErrorMessage(error, 'Nao foi possivel sincronizar agora.')} O rascunho continua salvo neste aparelho.`)
    } finally {
      setSavingProgress(false)
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedMatch) return
    if (!canLaunchStats) {
      setFeedback('O lancamento de presenca real e estatisticas fica liberado a partir do horario do evento.')
      return
    }
    setConfirmFinish(true)
  }

  async function finishMatch() {
    if (!selectedMatch || !formRef.current) return
    if (gameResults.some((game) => game.homeTeamId === game.awayTeamId)) {
      setFeedback('Cada partida precisa ter duas equipes diferentes.')
      setConfirmFinish(false)
      return
    }

    const form = new FormData(formRef.current)
    const teamResults = buildTeamResults()
    const statRows = applyGameResultsToRows(rows.map((item) => ({
      playerId: item.player_id,
      present: form.get(`present-${item.player_id}`) === 'on',
      goals: Number(form.get(`goals-${item.player_id}`) || 0),
      assists: Number(form.get(`assists-${item.player_id}`) || 0),
      wins: 0,
      draws: 0,
      losses: 0,
    })))

    setSaving(true)
    setFeedback('')
    try {
      statRows.forEach((row) => writeMatchStatsDraft(selectedMatch.id, row))
      await savePostMatchStats(
        selectedMatch.id,
        {
          team_a_score: null,
          team_b_score: null,
          team_results: teamResults,
          game_results: gameResults,
          status: 'ENCERRADA',
        },
        statRows,
      )

      let attendanceNotice = ''
      try {
        await Promise.all(statRows.map((row) => upsertAttendance(selectedMatch.id, row.playerId, row.present ? 'COMPARECEU' : 'FALTOU')))
      } catch (error) {
        attendanceNotice = ` A estatistica foi preservada, mas a presenca nao sincronizou: ${getErrorMessage(error, 'tente novamente pela Agenda.')}`
      }
      clearMatchStatsDraft(selectedMatch.id)

      let groupNotice = ''
      try {
        const groupResult = await shareMatchWithConfiguredGroup(
          selectedMatch.id,
          'REPORT',
          buildFinishedMatchMessage(selectedPickup?.name ?? selectedMatch.notes ?? 'Evento esportivo', gameResults, teamResults, statRows, rows),
        )
        if (groupResult.status !== 'SKIPPED_NOT_CONFIGURED') groupNotice = ' Resumo enviado ao grupo configurado.'
      } catch (groupError) {
        groupNotice = ` O evento foi encerrado, mas o grupo nao recebeu o resumo: ${getErrorMessage(groupError, 'verifique a integracao.')}`
      }

      let nextMatch: Match | null = null
      const nextDate = getNextRecurringDate(selectedMatch, selectedPickup)
      if (nextDate && window.confirm(`Estatisticas salvas. Deseja agendar a proxima data para ${formatDateTime(nextDate.toISOString())}?`)) {
        const alreadyExists = (matches.data ?? []).some((match) => (
          match.id !== selectedMatch.id &&
          match.pickup_id === selectedMatch.pickup_id &&
          new Date(match.scheduled_at).getTime() === nextDate.getTime()
        ))
        if (!alreadyExists) {
          nextMatch = await createMatch({
            pickup_id: selectedMatch.pickup_id,
            scheduled_at: nextDate.toISOString(),
            status: 'AGENDADA',
            notes: `Agenda automatica: ${selectedPickup?.name ?? selectedMatch.notes ?? 'evento'}`,
            max_line_players: selectedMatch.max_line_players,
            max_goalkeepers: selectedMatch.max_goalkeepers,
            recurrence_until: selectedMatch.recurrence_until,
            recurrence_weekday: selectedMatch.recurrence_weekday,
            recurrence_start_time: selectedMatch.recurrence_start_time,
            recurrence_months: selectedMatch.recurrence_months,
            recurrence_source_match_id: selectedMatch.id,
          })
        }
      }

      await Promise.all([
        matches.refetch(),
        attendance.refetch(),
        matchStats.refetch(),
        queryClient.invalidateQueries({ queryKey: ['completed-match-sheets'] }),
      ])
      setFeedback(`${nextMatch ? 'Estatisticas salvas e proximo evento agendado.' : 'Estatisticas salvas com sucesso.'}${attendanceNotice}${groupNotice}`)
      if (nextMatch) navigate(`/lancamento/${nextMatch.id}`)
    } catch (error) {
      setFeedback(getErrorMessage(error, 'Nao foi possivel salvar as estatisticas.'))
    } finally {
      setSaving(false)
      setConfirmFinish(false)
    }
  }

  if (matches.isLoading || pickups.isLoading) {
    return (
      <AnimatedPage>
        <Card className="grid min-h-80 place-items-center text-center">
          <LoaderCircle className="animate-spin text-primary" size={28} />
          <p className="font-black">Carregando sumula...</p>
        </Card>
      </AnimatedPage>
    )
  }

  if (!selectedMatch) {
    return (
      <AnimatedPage>
        <Card className="grid min-h-80 place-items-center text-center">
          <ClipboardList className="text-primary" size={36} />
          <h1 className="mt-3 text-2xl font-black">Evento nao encontrado</h1>
          <p className="mt-2 text-sm text-muted-foreground">Volte para a Agenda e abra um link de lancamento valido.</p>
          <Button asChild className="mt-5">
            <Link to="/agenda">
              <ArrowLeft size={16} />
              Voltar para Agenda
            </Link>
          </Button>
        </Card>
      </AnimatedPage>
    )
  }

  return (
    <AnimatedPage className="gap-4 sm:gap-6">
      <section className="football-surface overflow-hidden rounded-2xl p-4 text-white shadow-xl shadow-green-950/15 sm:p-6">
        <div className="stadium-lights" />
        <div className="relative z-10 grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="min-w-0">
            <span className="rounded-md bg-white/15 px-2 py-1 text-xs font-black uppercase tracking-wide">Sumula digital</span>
            <h1 className="mt-4 break-words text-2xl font-black leading-tight sm:text-3xl">{selectedPickup?.name || selectedMatch.notes || 'Evento avulso'}</h1>
            <p className="mt-2 text-sm text-white/75">{formatDateTime(selectedMatch.scheduled_at)}</p>
            <p className="mt-1 text-sm text-white/75">{selectedPickup ? `${selectedPickup.place} - linha ${selectedMatch.max_line_players ?? selectedPickup.max_line_players ?? selectedPickup.max_players}, goleiros ${selectedMatch.max_goalkeepers ?? selectedPickup.max_goalkeepers ?? 0}` : 'Lancamento individual'}</p>
          </div>
          <Button asChild variant="secondary" className="w-full bg-white/90 text-slate-950 hover:bg-white sm:w-auto">
            <Link to="/agenda">
              <ArrowLeft size={16} />
              Agenda
            </Link>
          </Button>
        </div>
      </section>

      <section className="grid grid-cols-3 gap-2 sm:gap-4">
        <Card><Summary icon={<Users size={18} />} label="Participantes" value={rows.length} /></Card>
        <Card><Summary icon={<CheckCircle2 size={18} />} label="Presentes" value={totals.present} /></Card>
        <Card><Summary icon={<ClipboardList size={18} />} label={primaryStatLabels.plural} value={totals.points} /></Card>
      </section>

      <Card className="p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-xl font-black">Lancamento dos participantes</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Informe presenca, {primaryStatLabels.lowerPlural} e assistencias. Serve para diferentes modalidades esportivas.</p>
          </div>
          <span className="rounded-md bg-muted px-2 py-1 text-xs font-black">{canLaunchStats ? `${rows.length} elegiveis` : 'Liberado apos o horario'}</span>
        </div>

        {feedback && <p className="mt-4 rounded-md bg-muted px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200">{feedback}</p>}
        {!canLaunchStats && (
          <p className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm font-semibold text-yellow-950 dark:border-yellow-900/50 dark:bg-yellow-950/30 dark:text-yellow-100">
            Este link ja pode ser compartilhado, mas o lancamento real so abre a partir do horario do evento.
          </p>
        )}

        <form ref={formRef} key={matchId} className="mt-4 grid gap-4" onSubmit={submit}>
          {drawTeams.length > 0 && (
            <div className="rounded-xl border border-green-200 bg-green-50/70 p-3 dark:border-green-900/50 dark:bg-green-950/20 sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-black text-green-950 dark:text-green-100">Partidas entre as equipes</h3>
                  <p className="mt-1 text-sm text-green-900/70 dark:text-green-100/70">Registre cada confronto. As vitorias, empates e derrotas serao calculados automaticamente.</p>
                </div>
                <Button type="button" variant="secondary" className="h-10" onClick={addGame} disabled={!canLaunchStats || saving || drawTeams.length < 2}>
                  <Plus size={16} />
                  Adicionar partida
                </Button>
              </div>
              <div className="mt-3 grid gap-3">
                {gameResults.map((game, index) => (
                  <div key={game.id} className="grid gap-3 rounded-xl border border-green-200 bg-white p-3 dark:border-green-900/50 dark:bg-slate-950/60 lg:grid-cols-[minmax(0,1fr)_140px_auto_140px_minmax(0,1fr)_44px] lg:items-end">
                    <label className="grid gap-1.5 text-sm font-black">
                      Equipe 1
                      <Select value={game.homeTeamId} onChange={(event) => updateGame(game.id, { homeTeamId: event.target.value })} disabled={!canLaunchStats || saving}>
                        {drawTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                      </Select>
                    </label>
                    <NumberStepper
                      key={`${game.id}-home-${game.homeScore}`}
                      name={`game-home-${game.id}`}
                      label="Gols"
                      defaultValue={game.homeScore}
                      disabled={!canLaunchStats || saving}
                      onValueChange={(value) => updateGame(game.id, { homeScore: value })}
                    />
                    <span className="pb-4 text-center text-sm font-black text-green-900 dark:text-green-100">x</span>
                    <NumberStepper
                      key={`${game.id}-away-${game.awayScore}`}
                      name={`game-away-${game.id}`}
                      label="Gols"
                      defaultValue={game.awayScore}
                      disabled={!canLaunchStats || saving}
                      onValueChange={(value) => updateGame(game.id, { awayScore: value })}
                    />
                    <label className="grid gap-1.5 text-sm font-black">
                      Equipe 2
                      <Select value={game.awayTeamId} onChange={(event) => updateGame(game.id, { awayTeamId: event.target.value })} disabled={!canLaunchStats || saving}>
                        {drawTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                      </Select>
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      className="size-11 p-0 text-red-700"
                      title={`Remover partida ${index + 1}`}
                      onClick={() => updateGameResults((current) => current.filter((item) => item.id !== game.id))}
                      disabled={!canLaunchStats || saving}
                    >
                      <Trash2 size={17} />
                    </Button>
                  </div>
                ))}
                {!gameResults.length && (
                  <button type="button" onClick={addGame} className="rounded-xl border border-dashed border-green-300 p-5 text-sm font-black text-green-900 dark:border-green-800 dark:text-green-100">
                    <Trophy className="mx-auto mb-2" size={22} />
                    Adicione a primeira partida da rodada
                  </button>
                )}
              </div>
            </div>
          )}
          <div className="grid gap-3">
            {rows.map((item) => {
              const saved = statsByPlayerId.get(item.player_id)
              const draft = localDrafts[item.player_id]
              return (
                <div key={item.id} className="grid min-w-0 gap-3 rounded-xl border border-border bg-white/80 p-3 shadow-sm dark:bg-slate-950/40 sm:p-4">
                  <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_160px] sm:items-center">
                    <div className="min-w-0">
                      <p className="truncate text-lg font-black">{item.player?.name ?? 'Participante'}</p>
                      <p className="text-sm text-muted-foreground">{displayPosition(item.player?.primary_position)} - {item.player?.whatsapp ?? 'Sem WhatsApp'}</p>
                    </div>
                    <label className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm font-black sm:justify-start">
                      <input
                        name={`present-${item.player_id}`}
                        type="checkbox"
                        defaultChecked={draft?.present ?? saved?.present ?? item.status !== 'FALTOU'}
                        disabled={!canLaunchStats || savingPartialId === item.player_id}
                        className="size-5 accent-green-700"
                        onChange={(event) => savePartialRow(item, { present: event.currentTarget.checked })}
                      />
                      Presente
                    </label>
                  </div>
                  <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-3">
                    <NumberStepper name={`goals-${item.player_id}`} label={primaryStatLabels.plural} defaultValue={draft?.goals ?? saved?.goals ?? 0} disabled={!canLaunchStats || savingPartialId === item.player_id} onValueChange={(value) => savePartialRow(item, { goals: value })} />
                    <NumberStepper name={`assists-${item.player_id}`} label="Assistencias" defaultValue={draft?.assists ?? saved?.assists ?? 0} disabled={!canLaunchStats || savingPartialId === item.player_id} onValueChange={(value) => savePartialRow(item, { assists: value })} />
                  </div>
                </div>
              )
            })}
            {!rows.length && (
              <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                Confirme participantes na Agenda antes de lancar as estatisticas.
              </div>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" variant="secondary" className="min-h-12 w-full" onClick={saveProgress} disabled={saving || savingProgress || !rows.length || !canLaunchStats}>
              {savingProgress ? <LoaderCircle className="animate-spin" size={16} /> : <Save size={16} />}
              {savingProgress ? 'Salvando...' : 'Salvar progresso'}
            </Button>
            <Button type="submit" className="min-h-12 w-full" disabled={saving || savingProgress || !rows.length || !canLaunchStats}>
              {saving ? <LoaderCircle className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
              {saving ? 'Finalizando...' : 'Finalizar evento e calcular estatisticas'}
            </Button>
          </div>
        </form>
      </Card>
      {toast && (
        <div className="fixed bottom-5 left-1/2 z-[120] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-center text-sm font-black text-green-900 shadow-2xl shadow-green-950/20 dark:border-green-900/60 dark:bg-green-950 dark:text-green-100">
          <CheckCircle2 className="mr-2 inline" size={16} />
          {toast}
        </div>
      )}
      {confirmFinish && (
        <ConfirmDialog
          title="Finalizar evento?"
          description="Ao confirmar, o sistema vai salvar a presenca real, calcular as estatisticas individuais e marcar este evento como finalizado."
          onClose={() => setConfirmFinish(false)}
        >
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setConfirmFinish(false)} disabled={saving}>Continuar lancando</Button>
            <Button type="button" onClick={finishMatch} disabled={saving}>
              {saving ? <LoaderCircle className="animate-spin" size={16} /> : <Save size={16} />}
              {saving ? 'Finalizando...' : 'Confirmar finalizacao'}
            </Button>
          </div>
        </ConfirmDialog>
      )}
    </AnimatedPage>
  )
}

function Summary({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-11 place-items-center rounded-xl bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-100">{icon}</div>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-black">{value}</p>
      </div>
    </div>
  )
}

function createGameResult(homeTeamId: string, awayTeamId: string): MatchGameResult {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `game-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    homeTeamId,
    awayTeamId,
    homeScore: 0,
    awayScore: 0,
  }
}

function getGameWinnerId(game: MatchGameResult) {
  if (game.homeScore === game.awayScore) return null
  return game.homeScore > game.awayScore ? game.homeTeamId : game.awayTeamId
}

function buildFinishedMatchMessage(
  eventName: string,
  games: MatchGameResult[],
  teams: MatchTeamResult[],
  stats: Array<{ playerId: string; present: boolean; goals: number; assists: number }>,
  attendanceRows: Attendance[],
) {
  const names = new Map(attendanceRows.map((row) => [row.player_id, row.player?.name ?? 'Participante']))
  const ranking = stats
    .filter((row) => row.present)
    .sort((left, right) => right.goals - left.goals || right.assists - left.assists || (names.get(left.playerId) ?? '').localeCompare(names.get(right.playerId) ?? '', 'pt-BR'))
  const champion = teams.length
    ? teams.filter((team) => team.score === Math.max(...teams.map((item) => item.score)))
    : []

  return [
    `Agenda Sport - sumula finalizada`,
    eventName,
    '',
    games.length ? 'Resultados:' : null,
    ...games.map((game, index) => {
      const home = teams.find((team) => team.id === game.homeTeamId)?.name ?? 'Equipe 1'
      const away = teams.find((team) => team.id === game.awayTeamId)?.name ?? 'Equipe 2'
      return `${index + 1}. ${home} ${game.homeScore} x ${game.awayScore} ${away}`
    }),
    champion.length === 1 ? `Campeao: ${champion[0].name}` : null,
    '',
    'Artilharia:',
    ...ranking.slice(0, 10).map((row, index) => `${index + 1}. ${names.get(row.playerId)} - ${row.goals} gols, ${row.assists} assist.`),
  ].filter(Boolean).join('\n')
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function getNextRecurringDate(match: Match, pickup: { weekday: number; start_time: string } | null) {
  if (!match.recurrence_until) return null
  const weekday = match.recurrence_weekday ?? pickup?.weekday
  const startTime = match.recurrence_start_time ?? pickup?.start_time
  if (weekday == null || !startTime) return null
  const next = getNextDateForWeekday(weekday, startTime, new Date(match.scheduled_at))
  const end = new Date(`${match.recurrence_until}T23:59:59`)
  return next <= end ? next : null
}

function getNextDateForWeekday(weekday: number, startTime: string, from: Date) {
  const [hours, minutes] = startTime.split(':').map(Number)
  const date = new Date(from)
  const daysAhead = (weekday - date.getDay() + 7) % 7
  date.setDate(date.getDate() + daysAhead)
  date.setHours(hours || 0, minutes || 0, 0, 0)
  if (date <= from) date.setDate(date.getDate() + 7)
  return date
}

function canLaunchStatsForMatch(match: Pick<Match, 'scheduled_at' | 'status'>) {
  if (match.status === 'CANCELADA') return false
  return new Date(match.scheduled_at).getTime() <= Date.now()
}
