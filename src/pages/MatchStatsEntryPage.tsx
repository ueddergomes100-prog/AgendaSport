import { useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2, ClipboardList, LoaderCircle, Save, Users } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Card, CardTitle } from '../components/ui/card'
import { NumberStepper } from '../components/ui/number-stepper'
import { AnimatedPage, ConfirmDialog } from '../components/ui/sport'
import {
  createMatch,
  getAttendance,
  getLatestTeamDraw,
  getMatchPlayerStats,
  getMatches,
  getPickups,
  savePostMatchStats,
  upsertAttendance,
} from '../lib/data'
import { displayPosition } from '../lib/positions'
import { usePrimaryStatLabel } from '../lib/stats-labels'
import type { Attendance, Match } from '../lib/types'
import { compareTextPtBr, getErrorMessage } from '../lib/utils'

export function MatchStatsEntryPage() {
  const { matchId = '' } = useParams()
  const navigate = useNavigate()
  const matches = useQuery({ queryKey: ['matches'], queryFn: getMatches })
  const pickups = useQuery({ queryKey: ['pickups'], queryFn: getPickups })
  const attendance = useQuery({ queryKey: ['attendance', matchId], queryFn: () => getAttendance(matchId), enabled: Boolean(matchId) })
  const matchStats = useQuery({ queryKey: ['match-player-stats', matchId], queryFn: () => getMatchPlayerStats(matchId), enabled: Boolean(matchId) })
  const latestTeamDraw = useQuery({ queryKey: ['latest-team-draw', matchId], queryFn: () => getLatestTeamDraw(matchId), enabled: Boolean(matchId) })
  const [saving, setSaving] = useState(false)
  const [savingPartialId, setSavingPartialId] = useState('')
  const [feedback, setFeedback] = useState('')
  const [toast, setToast] = useState('')
  const [confirmFinish, setConfirmFinish] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const { labels: primaryStatLabels } = usePrimaryStatLabel()

  const selectedMatch = useMemo(() => (matches.data ?? []).find((match) => match.id === matchId) ?? null, [matches.data, matchId])
  const selectedPickup = useMemo(() => (pickups.data ?? []).find((pickup) => pickup.id === selectedMatch?.pickup_id) ?? null, [pickups.data, selectedMatch])
  const statsByPlayerId = useMemo(() => new Map((matchStats.data ?? []).map((row) => [row.player_id, row] as const)), [matchStats.data])
  const rows = useMemo(
    () => (attendance.data ?? [])
      .filter((row) => ['CONFIRMADO', 'COMPARECEU', 'FALTOU'].includes(row.status) && row.player)
      .sort((left, right) => compareTextPtBr(left.player?.name, right.player?.name)),
    [attendance.data],
  )
  const canLaunchStats = selectedMatch ? isSameLocalDate(new Date(selectedMatch.scheduled_at), new Date()) : false
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
    return {
      playerId: item.player_id,
      present: override.present ?? form?.querySelector<HTMLInputElement>(`[name="present-${item.player_id}"]`)?.checked ?? item.status !== 'FALTOU',
      goals: override.goals ?? Number(form?.querySelector<HTMLInputElement>(`[name="goals-${item.player_id}"]`)?.value || 0),
      assists: override.assists ?? Number(form?.querySelector<HTMLInputElement>(`[name="assists-${item.player_id}"]`)?.value || 0),
      wins: 0,
      draws: 0,
      losses: 0,
    }
  }

  async function savePartialRow(item: Attendance, override: Partial<{ present: boolean; goals: number; assists: number }> = {}) {
    if (!selectedMatch || !canLaunchStats) return
    const row = buildRowFromForm(item, override)
    setSavingPartialId(item.player_id)
    setFeedback('')
    try {
      await upsertAttendance(selectedMatch.id, row.playerId, row.present ? 'COMPARECEU' : 'FALTOU')
      await savePostMatchStats(
        selectedMatch.id,
        {
          team_a_score: selectedMatch.team_a_score,
          team_b_score: selectedMatch.team_b_score,
          team_results: selectedMatch.team_results ?? latestTeamDraw.data?.payload?.teams?.map((team) => ({
            id: team.id,
            name: team.name,
            score: 0,
            playerIds: team.players.map((player) => player.id),
          })) ?? [],
          status: selectedMatch.status,
        },
        [row],
      )
      await Promise.all([attendance.refetch(), matchStats.refetch()])
      notify('Atualizado com sucesso.')
    } catch (error) {
      setFeedback(getErrorMessage(error, 'Nao foi possivel atualizar este participante.'))
    } finally {
      setSavingPartialId('')
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedMatch) return
    if (!canLaunchStats) {
      setFeedback('O lancamento de presenca real e estatisticas so fica liberado no dia do evento.')
      return
    }
    setConfirmFinish(true)
  }

  async function finishMatch() {
    if (!selectedMatch || !formRef.current) return

    const form = new FormData(formRef.current)
    const statRows = rows.map((item) => ({
      playerId: item.player_id,
      present: form.get(`present-${item.player_id}`) === 'on',
      goals: Number(form.get(`goals-${item.player_id}`) || 0),
      assists: Number(form.get(`assists-${item.player_id}`) || 0),
      wins: 0,
      draws: 0,
      losses: 0,
    }))

    setSaving(true)
    setFeedback('')
    try {
      await Promise.all(statRows.map((row) => upsertAttendance(selectedMatch.id, row.playerId, row.present ? 'COMPARECEU' : 'FALTOU')))
      await savePostMatchStats(
        selectedMatch.id,
        {
          team_a_score: null,
          team_b_score: null,
          team_results: latestTeamDraw.data?.payload?.teams?.map((team) => ({
            id: team.id,
            name: team.name,
            score: 0,
            playerIds: team.players.map((player) => player.id),
          })) ?? [],
          status: 'ENCERRADA',
        },
        statRows,
      )

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

      await Promise.all([matches.refetch(), attendance.refetch(), matchStats.refetch()])
      setFeedback(nextMatch ? 'Estatisticas salvas e proximo evento agendado.' : 'Estatisticas salvas com sucesso.')
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
          <span className="rounded-md bg-muted px-2 py-1 text-xs font-black">{canLaunchStats ? `${rows.length} elegiveis` : 'Liberado no dia do evento'}</span>
        </div>

        {feedback && <p className="mt-4 rounded-md bg-muted px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200">{feedback}</p>}
        {!canLaunchStats && (
          <p className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm font-semibold text-yellow-950 dark:border-yellow-900/50 dark:bg-yellow-950/30 dark:text-yellow-100">
            Este link ja pode ser compartilhado, mas o lancamento real so abre no dia do evento.
          </p>
        )}

        <form ref={formRef} key={`${matchId}-${matchStats.dataUpdatedAt}`} className="mt-4 grid gap-4" onSubmit={submit}>
          <div className="grid gap-3">
            {rows.map((item) => {
              const saved = statsByPlayerId.get(item.player_id)
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
                        defaultChecked={saved?.present ?? item.status !== 'FALTOU'}
                        disabled={!canLaunchStats || savingPartialId === item.player_id}
                        className="size-5 accent-green-700"
                        onChange={(event) => savePartialRow(item, { present: event.currentTarget.checked })}
                      />
                      Presente
                    </label>
                  </div>
                  <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-3">
                    <NumberStepper name={`goals-${item.player_id}`} label={primaryStatLabels.plural} defaultValue={saved?.goals ?? 0} disabled={!canLaunchStats || savingPartialId === item.player_id} onValueChange={(value) => savePartialRow(item, { goals: value })} />
                    <NumberStepper name={`assists-${item.player_id}`} label="Assistencias" defaultValue={saved?.assists ?? 0} disabled={!canLaunchStats || savingPartialId === item.player_id} onValueChange={(value) => savePartialRow(item, { assists: value })} />
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
          <Button className="min-h-12 w-full" disabled={saving || !rows.length || !canLaunchStats}>
            {saving ? <LoaderCircle className="animate-spin" size={16} /> : <Save size={16} />}
            {saving ? 'Finalizando...' : 'Finalizar evento e calcular estatisticas'}
          </Button>
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

function isSameLocalDate(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate()
}
