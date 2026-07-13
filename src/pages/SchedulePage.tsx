import { useMemo, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  CalendarPlus,
  CheckCircle2,
  CircleDashed,
  ClipboardList,
  Copy,
  ExternalLink,
  LoaderCircle,
  MessageCircle,
  Save,
  Trophy,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react'
import { Button } from '../components/ui/button'
import { Card, CardTitle } from '../components/ui/card'
import { Field, Input, Select, Textarea } from '../components/ui/field'
import { AnimatedPage, ConfirmDialog } from '../components/ui/sport'
import {
  createMatch,
  deleteMatch,
  getAttendance,
  getLatestTeamDraw,
  getMatchPlayerStats,
  getMatches,
  getPickups,
  getPlayers,
  invitePlayersToMatch,
  savePostMatchStats,
  sendMatchConfirmations,
  updateMatch,
  upsertAttendance,
} from '../lib/data'
import { displayPosition, isGoalkeeperPosition } from '../lib/positions'
import type { Attendance, AttendanceStatus, Match, Pickup } from '../lib/types'
import { cn, getErrorMessage } from '../lib/utils'

const statusLabels: Record<AttendanceStatus, string> = {
  CONVIDADO: 'Convidado',
  CONFIRMADO: 'Confirmado',
  RECUSOU: 'Recusou',
  ESPERA: 'Espera',
  COMPARECEU: 'Compareceu',
  FALTOU: 'Faltou',
}

const statusStyles: Record<AttendanceStatus, string> = {
  CONVIDADO: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  CONFIRMADO: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-100',
  RECUSOU: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-100',
  ESPERA: 'bg-yellow-100 text-yellow-900 dark:bg-yellow-900/50 dark:text-yellow-100',
  COMPARECEU: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-100',
  FALTOU: 'bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100',
}

export function SchedulePage() {
  const matches = useQuery({ queryKey: ['matches'], queryFn: getMatches })
  const pickups = useQuery({ queryKey: ['pickups'], queryFn: getPickups })
  const players = useQuery({ queryKey: ['players'], queryFn: getPlayers })
  const [selectedMatchId, setSelectedMatchId] = useState('')
  const [savingMatch, setSavingMatch] = useState(false)
  const [savingInvite, setSavingInvite] = useState(false)
  const [savingStats, setSavingStats] = useState(false)
  const [deletingMatch, setDeletingMatch] = useState(false)
  const [matchToDelete, setMatchToDelete] = useState<Match | null>(null)
  const [feedback, setFeedback] = useState('')
  const effectiveSelectedMatchId = selectedMatchId || matches.data?.[0]?.id || ''

  const selectedMatch = useMemo(
    () => (matches.data ?? []).find((match) => match.id === effectiveSelectedMatchId) ?? null,
    [matches.data, effectiveSelectedMatchId],
  )
  const selectedPickup = useMemo(
    () => (pickups.data ?? []).find((pickup) => pickup.id === selectedMatch?.pickup_id) ?? null,
    [pickups.data, selectedMatch],
  )
  const pickupById = useMemo(
    () => new Map((pickups.data ?? []).map((pickup) => [pickup.id, pickup] as const)),
    [pickups.data],
  )
  const selectedMatchTitle = selectedMatch ? formatMatchTitle(selectedMatch, selectedPickup) : ''

  const attendance = useQuery({
    queryKey: ['attendance', effectiveSelectedMatchId],
    queryFn: () => getAttendance(effectiveSelectedMatchId),
    enabled: Boolean(effectiveSelectedMatchId),
  })

  const matchStats = useQuery({
    queryKey: ['match-player-stats', effectiveSelectedMatchId],
    queryFn: () => getMatchPlayerStats(effectiveSelectedMatchId),
    enabled: Boolean(effectiveSelectedMatchId),
  })

  const latestTeamDraw = useQuery({
    queryKey: ['latest-team-draw', effectiveSelectedMatchId],
    queryFn: () => getLatestTeamDraw(effectiveSelectedMatchId),
    enabled: Boolean(effectiveSelectedMatchId),
  })

  const activePlayers = useMemo(() => (players.data ?? []).filter((player) => player.status === 'ATIVO'), [players.data])
  const attendanceRows = attendance.data ?? []
  const statsByPlayerId = useMemo(
    () => new Map((matchStats.data ?? []).map((row) => [row.player_id, row] as const)),
    [matchStats.data],
  )
  const presentCandidates = attendanceRows.filter((row) => ['CONFIRMADO', 'COMPARECEU', 'FALTOU'].includes(row.status) && row.player)
  const invitedPlayerIds = new Set(attendanceRows.map((row) => row.player_id))
  const counts = countAttendance(attendanceRows)
  const roleCounts = countRoleAttendance(attendanceRows)
  const canLaunchStats = selectedMatch ? isSameLocalDate(new Date(selectedMatch.scheduled_at), new Date()) : false

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    setSavingMatch(true)
    setFeedback('')
    try {
      const form = new FormData(formElement)
      const pickupId = String(form.get('pickup_id') || '') || null
      const pickup = pickupId ? pickupById.get(pickupId) ?? null : null
      const scheduledAt = new Date(String(form.get('scheduled_at')))
      const recurrenceMonths = Number(form.get('recurrence_months') || 0)
      const maxLinePlayers = Number(form.get('max_line_players') || pickup?.max_line_players || pickup?.max_players || 0)
      const maxGoalkeepers = Number(form.get('max_goalkeepers') || pickup?.max_goalkeepers || 0)
      const recurrenceUntil = recurrenceMonths > 0 ? addMonthsDate(scheduledAt, recurrenceMonths) : null
      const baseInput = {
        pickup_id: pickupId,
        scheduled_at: scheduledAt.toISOString(),
        notes: String(form.get('notes') || ''),
        status: 'AGENDADA',
        max_line_players: maxLinePlayers,
        max_goalkeepers: maxGoalkeepers,
        recurrence_until: recurrenceUntil ? toDateOnly(recurrenceUntil) : null,
        recurrence_weekday: recurrenceMonths > 0 ? scheduledAt.getDay() : null,
        recurrence_start_time: recurrenceMonths > 0 ? toTimeOnly(scheduledAt) : null,
        recurrence_months: recurrenceMonths || null,
      } as const
      const match = await createMatch(baseInput)
      await matches.refetch()
      setSelectedMatchId(match.id)
      formElement.reset()
      setFeedback(recurrenceMonths > 0 ? 'Evento criado. A proxima data recorrente sera criada somente apos finalizar este evento.' : 'Evento criado. Agora voce pode abrir a convocacao.')
    } catch (error) {
      setFeedback(getErrorMessage(error, 'Nao foi possivel criar o evento.'))
    } finally {
      setSavingMatch(false)
    }
  }

  async function callPlayers() {
    if (!selectedMatch) return
    setSavingInvite(true)
    setFeedback('')
    try {
      const playerIds = activePlayers.filter((player) => !invitedPlayerIds.has(player.id)).map((player) => player.id)
      if (playerIds.length) await invitePlayersToMatch(selectedMatch.id, playerIds)
      if (selectedMatch.status === 'AGENDADA') await updateMatch(selectedMatch.id, { status: 'ABERTA' })
      const summary = await sendMatchConfirmations(selectedMatch.id)
      await Promise.all([matches.refetch(), attendance.refetch()])
      const parts = [
        summary.remindersSent ? `${summary.remindersSent} WhatsApp enviados` : null,
        summary.skippedAlreadySent ? `${summary.skippedAlreadySent} ja enviados antes` : null,
        summary.skippedWithoutWhatsapp ? `${summary.skippedWithoutWhatsapp} sem WhatsApp` : null,
        summary.errors.length ? `${summary.errors.length} falharam` : null,
      ].filter(Boolean)
      setFeedback(parts.length ? parts.join(', ') + '.' : 'Convocacao ja estava atualizada.')
    } catch (error) {
      setFeedback(getErrorMessage(error, 'Nao foi possivel convocar os participantes.'))
    } finally {
      setSavingInvite(false)
    }
  }

  async function setManualResponse(item: Attendance, status: AttendanceStatus) {
    if (!selectedMatch) return
    setFeedback('')
    try {
      await upsertAttendance(selectedMatch.id, item.player_id, status)
      await Promise.all([attendance.refetch(), matches.refetch()])
      setFeedback(`Resposta de ${item.player?.name ?? 'participante'} atualizada para ${statusLabels[status]}.`)
    } catch (error) {
      setFeedback(getErrorMessage(error, 'Nao foi possivel atualizar a resposta manualmente.'))
    }
  }

  async function copyInviteMessage() {
    if (!selectedMatch) return
    await copyText(buildInviteMessage(selectedMatch, selectedPickup))
    setFeedback('Mensagem da convocacao copiada.')
  }

  function openInviteWhatsApp() {
    if (!selectedMatch) return
    window.open(`https://wa.me/?text=${encodeURIComponent(buildInviteMessage(selectedMatch, selectedPickup))}`, '_blank', 'noopener,noreferrer')
  }

  async function copyStatsLink() {
    if (!selectedMatch) return
    await copyText(`${window.location.origin}/lancamento/${selectedMatch.id}`)
    setFeedback('Link de lancamento copiado.')
  }

  function openStatsLink() {
    if (!selectedMatch) return
    window.open(`/lancamento/${selectedMatch.id}`, '_blank', 'noopener,noreferrer')
  }

  async function removeMatch(match: Match) {
    setDeletingMatch(true)
    setFeedback('')
    try {
      await deleteMatch(match.id)
      setMatchToDelete(null)
      setSelectedMatchId('')
      await Promise.all([matches.refetch(), attendance.refetch(), matchStats.refetch(), latestTeamDraw.refetch()])
      setFeedback('Agendamento excluido com presencas, sorteio e estatisticas vinculadas.')
    } catch (error) {
      setFeedback(getErrorMessage(error, 'Nao foi possivel excluir o agendamento.'))
    } finally {
      setDeletingMatch(false)
    }
  }

  async function closeMatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedMatch) return
    if (!canLaunchStats) {
      setFeedback('O lancamento de presenca real e estatisticas so fica liberado no dia do evento.')
      return
    }
    const form = new FormData(event.currentTarget)
    const rows = presentCandidates.map((item) => {
      const present = form.get(`present-${item.player_id}`) === 'on'

      return {
        playerId: item.player_id,
        present,
        goals: Number(form.get(`goals-${item.player_id}`) || 0),
        assists: Number(form.get(`assists-${item.player_id}`) || 0),
        wins: 0,
        draws: 0,
        losses: 0,
      }
    })

    setSavingStats(true)
    setFeedback('')
    try {
      await Promise.all(rows.map((row) => upsertAttendance(selectedMatch.id, row.playerId, row.present ? 'COMPARECEU' : 'FALTOU')))
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
        rows,
      )
      let nextMatch: Match | null = null
      const nextDate = getNextRecurringDate(selectedMatch, selectedPickup)
      if (nextDate && window.confirm(`Evento encerrado. Deseja agendar a proxima data automaticamente para ${formatDate(nextDate.toISOString())} as ${formatTime(nextDate.toISOString())}?`)) {
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
            notes: `Agenda automatica: ${selectedPickup?.name ?? selectedMatchTitle}`,
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
      if (nextMatch) setSelectedMatchId(nextMatch.id)
      setFeedback(nextMatch ? 'Evento encerrado e proxima data agendada.' : 'Evento encerrado. Estatisticas liberadas no relatorio.')
    } catch (error) {
      setFeedback(getErrorMessage(error, 'Nao foi possivel salvar as estatisticas.'))
    } finally {
      setSavingStats(false)
    }
  }

  return (
    <AnimatedPage>
      <section className="premium-panel overflow-hidden rounded-2xl p-6">
        <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
              <span className="page-kicker"><ClipboardList size={14} /> Central do evento</span>
            <h1 className="mt-4 max-w-3xl text-3xl font-black tracking-tight md:text-4xl">Crie, convoque, confirme e lance o evento</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              A agenda acompanha o evento inteiro: chamada dos participantes, lista de presenca e estatisticas individuais.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <RoundNumber label="Convocados" value={attendanceRows.length} />
            <RoundNumber label="Confirmados" value={counts.CONFIRMADO + counts.COMPARECEU} />
            <RoundNumber label="Espera" value={counts.ESPERA} />
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <aside className="grid content-start gap-4">
          <Card>
            <CardTitle>Novo evento</CardTitle>
            <form className="mt-4 grid gap-3" onSubmit={submit}>
              <Field label="Evento fixo">
                <Select name="pickup_id">
                  <option value="">Sem evento fixo</option>
                  {(pickups.data ?? []).map((pickup) => <option value={pickup.id} key={pickup.id}>{pickup.name}</option>)}
                </Select>
              </Field>
              <Field label="Data e horario"><Input name="scheduled_at" type="datetime-local" required /></Field>
              <Field label="Recorrencia semanal">
                <Select name="recurrence_months" defaultValue="0">
                  <option value="0">Agendar somente esta data</option>
                  <option value="1">Criar proxima ao finalizar, por 1 mes</option>
                  <option value="2">Criar proxima ao finalizar, por 2 meses</option>
                  <option value="3">Criar proxima ao finalizar, por 3 meses</option>
                </Select>
                <p className="mt-2 text-xs font-semibold text-muted-foreground">Apenas este evento sera criado agora. Os proximos nascem apos a finalizacao.</p>
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Vagas linha"><Input name="max_line_players" type="number" min={0} defaultValue={18} /></Field>
                <Field label="Vagas goleiro"><Input name="max_goalkeepers" type="number" min={0} defaultValue={2} /></Field>
              </div>
              <Field label="Observacoes"><Textarea name="notes" /></Field>
              <Button disabled={savingMatch}>
                {savingMatch ? <LoaderCircle className="animate-spin" size={16} /> : <CalendarPlus size={16} />}
                {savingMatch ? 'Criando...' : 'Criar evento'}
              </Button>
            </form>
          </Card>

          <Card>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Agenda</CardTitle>
              <span className="rounded-md bg-muted px-2 py-1 text-xs font-black">{matches.data?.length ?? 0}</span>
            </div>
            <div className="mt-4 grid gap-2">
              {(matches.data ?? []).map((match) => (
                <button
                  key={match.id}
                  type="button"
                  onClick={() => setSelectedMatchId(match.id)}
                  className={cn(
                    'grid gap-2 rounded-lg border border-border p-3 text-left transition hover:border-primary/50 hover:bg-muted/70',
                    effectiveSelectedMatchId === match.id && 'border-primary bg-green-50 dark:bg-green-950/30',
                  )}
                >
                  <span className="flex items-start justify-between gap-3">
                    <span>
                      <span className="block text-sm font-black">{formatDate(match.scheduled_at)}</span>
                      <span className="text-xs text-muted-foreground">{formatTime(match.scheduled_at)} - {formatMatchTitle(match, match.pickup_id ? pickupById.get(match.pickup_id) ?? null : null)}</span>
                    </span>
                    <span className="rounded-md bg-muted px-2 py-1 text-[11px] font-black">{match.status}</span>
                  </span>
                </button>
              ))}
              {!matches.data?.length && <p className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">Nenhum evento agendado.</p>}
            </div>
          </Card>
        </aside>

        <section className="grid content-start gap-4">
          {!selectedMatch && (
            <Card className="grid min-h-80 place-items-center text-center">
              <div>
                <Trophy className="mx-auto text-primary" size={38} />
                <h2 className="mt-3 text-xl font-black">Selecione um evento</h2>
                <p className="mt-1 text-sm text-muted-foreground">Depois de criar o agendamento, o painel operacional aparece aqui.</p>
              </div>
            </Card>
          )}

          {selectedMatch && (
            <>
              <Card className="overflow-hidden p-0">
                <div className="football-surface min-h-56 p-5 text-white">
                  <div className="relative z-10 grid h-full gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
                    <div>
                      <span className="rounded-md bg-white/15 px-2 py-1 text-xs font-black uppercase tracking-wide">{selectedMatch.status}</span>
                      <h2 className="mt-4 text-3xl font-black">{selectedMatchTitle}</h2>
                      <p className="mt-2 text-sm text-white/75">{formatDate(selectedMatch.scheduled_at)} as {formatTime(selectedMatch.scheduled_at)}</p>
                      <p className="mt-1 text-sm text-white/75">{selectedPickup ? `${selectedPickup.place} - linha ${selectedMatch.max_line_players ?? selectedPickup.max_line_players ?? selectedPickup.max_players}, goleiros ${selectedMatch.max_goalkeepers ?? selectedPickup.max_goalkeepers ?? 0}` : 'Evento avulso'}</p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
                      <Button type="button" onClick={callPlayers} disabled={savingInvite || !activePlayers.length}>
                        {savingInvite ? <LoaderCircle className="animate-spin" size={16} /> : <Users size={16} />}
                        Enviar WhatsApp
                      </Button>
                      <Button type="button" variant="secondary" onClick={copyInviteMessage}>
                        <Copy size={16} />
                        Copiar chamada
                      </Button>
                      <Button type="button" variant="secondary" onClick={openInviteWhatsApp}>
                        <MessageCircle size={16} />
                        WhatsApp
                      </Button>
                      <Button type="button" variant="secondary" onClick={copyStatsLink}>
                        <Copy size={16} />
                        Link lancamento
                      </Button>
                      <Button type="button" variant="secondary" onClick={openStatsLink}>
                        <ExternalLink size={16} />
                        Abrir sumula
                      </Button>
                      <Button type="button" variant="danger" onClick={() => setMatchToDelete(selectedMatch)}>
                        <Trash2 size={16} />
                        Excluir data
                      </Button>
                    </div>
                  </div>
                </div>
                {feedback && <p className="m-5 rounded-md bg-muted px-3 py-2 text-sm text-slate-700 dark:text-slate-200">{feedback}</p>}
              </Card>

              <section className="grid gap-4 lg:grid-cols-4">
                <Card><RoundInline icon={<Users size={18} />} label="Convidados" value={attendanceRows.length} /></Card>
                <Card><RoundInline icon={<CheckCircle2 size={18} />} label="Linha confirmada" value={roleCounts.lineConfirmed} /></Card>
                <Card><RoundInline icon={<CircleDashed size={18} />} label="Goleiros confirmados" value={roleCounts.goalkeeperConfirmed} /></Card>
                <Card><RoundInline icon={<CircleDashed size={18} />} label="Fila de espera" value={counts.ESPERA} /></Card>
              </section>

              <Card>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle>Resposta da convocacao</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">Aqui aparecem as respostas recebidas pelo WhatsApp: Sim, Nao ou Espera.</p>
                  </div>
                  <Button type="button" variant="secondary" onClick={() => attendance.refetch()} disabled={attendance.isFetching}>
                    {attendance.isFetching ? <LoaderCircle className="animate-spin" size={16} /> : <UserCheck size={16} />}
                    Atualizar respostas
                  </Button>
                </div>
                <div className="mt-4 grid gap-2">
                  {attendanceRows.map((item) => (
                    <div key={item.id} className="grid gap-3 rounded-lg border border-border bg-white/70 p-3 dark:bg-slate-950/40 lg:grid-cols-[1fr_auto] lg:items-center">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-black">{item.player?.name ?? 'Participante'}</p>
                          <StatusPill status={item.status} />
                          {item.queue_position ? <span className="rounded-md bg-yellow-100 px-2 py-1 text-xs font-black text-yellow-900">Fila #{item.queue_position}</span> : null}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{displayPosition(item.player?.primary_position)} - {item.player?.whatsapp ?? 'Sem WhatsApp'}</p>
                      </div>
                      <div className="grid gap-2">
                        <ResponseHint status={item.status} />
                        {selectedMatch.status !== 'ENCERRADA' && selectedMatch.status !== 'CANCELADA' && (
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button type="button" variant="secondary" className="h-9 px-3" onClick={() => setManualResponse(item, 'CONFIRMADO')}>Sim</Button>
                            <Button type="button" variant="secondary" className="h-9 px-3" onClick={() => setManualResponse(item, 'RECUSOU')}>Nao</Button>
                            <Button type="button" variant="secondary" className="h-9 px-3" onClick={() => setManualResponse(item, 'ESPERA')}>Espera</Button>
                            <Button type="button" variant="ghost" className="h-9 px-3" onClick={() => setManualResponse(item, 'CONVIDADO')}>Aguardando</Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {!attendanceRows.length && (
                    <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                      Nenhuma convocacao enviada. Clique em Enviar WhatsApp para chamar os participantes ativos.
                    </p>
                  )}
                </div>
              </Card>

              <Card>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle>Lancamento individual</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">No dia do evento, marque quem realmente compareceu e informe pontos e assistencias.</p>
                  </div>
                  <span className="rounded-md bg-muted px-2 py-1 text-xs font-black">{canLaunchStats ? `${presentCandidates.length} participantes elegiveis` : 'Liberado no dia do evento'}</span>
                </div>
                {!canLaunchStats && (
                  <p className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm font-semibold text-yellow-950 dark:border-yellow-900/50 dark:bg-yellow-950/30 dark:text-yellow-100">
                    O lancamento real de presenca e estatisticas fica bloqueado ate o dia do evento.
                  </p>
                )}

                <form key={`${effectiveSelectedMatchId}-${matchStats.dataUpdatedAt}`} className="mt-4 grid gap-4" onSubmit={closeMatch}>
                  <div className="grid gap-3">
                    {presentCandidates.map((item) => {
                      const saved = statsByPlayerId.get(item.player_id)
                      return (
                        <div key={item.id} className="grid min-w-0 gap-4 rounded-xl border border-border bg-white/75 p-3 shadow-sm dark:bg-slate-950/40 sm:p-4 lg:grid-cols-[minmax(0,1fr)_150px_minmax(260px,360px)] lg:items-center">
                          <div className="min-w-0">
                            <p className="truncate text-lg font-black">{item.player?.name ?? 'Participante'}</p>
                            <p className="text-sm text-muted-foreground">{displayPosition(item.player?.primary_position)}</p>
                          </div>
                          <label className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm font-black lg:justify-start">
                            <input
                              name={`present-${item.player_id}`}
                              type="checkbox"
                              defaultChecked={saved?.present ?? item.status !== 'FALTOU'}
                              disabled={!canLaunchStats}
                              className="size-5 accent-green-700"
                            />
                            Presente
                          </label>
                          <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-3">
                            <label className="grid min-w-0 gap-1 text-sm font-black text-slate-700 dark:text-slate-200">
                              Pontos
                              <Input className="h-12 text-base font-black" name={`goals-${item.player_id}`} type="number" inputMode="numeric" min={0} defaultValue={saved?.goals ?? 0} disabled={!canLaunchStats} />
                            </label>
                            <label className="grid min-w-0 gap-1 text-sm font-black text-slate-700 dark:text-slate-200">
                              Assistencias
                              <Input className="h-12 text-base font-black" name={`assists-${item.player_id}`} type="number" inputMode="numeric" min={0} defaultValue={saved?.assists ?? 0} disabled={!canLaunchStats} />
                            </label>
                          </div>
                        </div>
                      )
                    })}
                    {!presentCandidates.length && (
                      <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                        Confirme participantes antes de lancar as estatisticas.
                      </div>
                    )}
                  </div>

                  <Button className="min-h-12 w-full" disabled={savingStats || !presentCandidates.length || !canLaunchStats}>
                    {savingStats ? <LoaderCircle className="animate-spin" size={16} /> : <Save size={16} />}
                    {savingStats ? 'Salvando...' : 'Salvar estatisticas individuais'}
                  </Button>
                </form>
              </Card>
            </>
          )}
        </section>
      </div>

      {matchToDelete && (
        <ConfirmDialog
          title="Excluir agendamento"
          description="Esta acao remove esta data da agenda e tambem apaga presencas, sorteio salvo e estatisticas individuais vinculadas a ela."
          onClose={() => setMatchToDelete(null)}
        >
          <div className="rounded-xl border border-border bg-muted/50 p-4">
            <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">Agendamento</p>
            <p className="mt-2 font-black">{formatMatchTitle(matchToDelete, matchToDelete.pickup_id ? pickupById.get(matchToDelete.pickup_id) ?? null : null)}</p>
            <p className="mt-1 text-sm text-muted-foreground">{formatDate(matchToDelete.scheduled_at)} as {formatTime(matchToDelete.scheduled_at)}</p>
          </div>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setMatchToDelete(null)} disabled={deletingMatch}>
              Cancelar
            </Button>
            <Button type="button" variant="danger" onClick={() => removeMatch(matchToDelete)} disabled={deletingMatch}>
              {deletingMatch ? <LoaderCircle className="animate-spin" size={16} /> : <Trash2 size={16} />}
              {deletingMatch ? 'Excluindo...' : 'Excluir agendamento'}
            </Button>
          </div>
        </ConfirmDialog>
      )}
    </AnimatedPage>
  )
}

function RoundNumber({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-white/80 px-4 py-3 dark:bg-slate-950/60">
      <p className="text-xs font-bold text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </div>
  )
}

function RoundInline({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-10 place-items-center rounded-lg bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-100">{icon}</div>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-black">{value}</p>
      </div>
    </div>
  )
}

function StatusPill({ status }: { status: AttendanceStatus }) {
  return <span className={cn('rounded-md px-2 py-1 text-xs font-black', statusStyles[status])}>{statusLabels[status]}</span>
}

function countAttendance(rows: Attendance[]) {
  return rows.reduce<Record<AttendanceStatus, number>>(
    (acc, row) => {
      acc[row.status] += 1
      return acc
    },
    { CONVIDADO: 0, CONFIRMADO: 0, RECUSOU: 0, ESPERA: 0, COMPARECEU: 0, FALTOU: 0 },
  )
}

function countRoleAttendance(rows: Attendance[]) {
  return rows.reduce(
    (acc, row) => {
      const confirmed = ['CONFIRMADO', 'COMPARECEU'].includes(row.status)
      if (confirmed && isGoalkeeperPosition(row.player?.primary_position)) acc.goalkeeperConfirmed += 1
      if (confirmed && !isGoalkeeperPosition(row.player?.primary_position)) acc.lineConfirmed += 1
      return acc
    },
    { lineConfirmed: 0, goalkeeperConfirmed: 0 },
  )
}

function ResponseHint({ status }: { status: AttendanceStatus }) {
  const text: Record<AttendanceStatus, string> = {
    CONVIDADO: 'Aguardando resposta',
    CONFIRMADO: 'Confirmou pelo WhatsApp',
    RECUSOU: 'Recusou pelo WhatsApp',
    ESPERA: 'Entrou na fila de espera',
    COMPARECEU: 'Presenca real marcada',
    FALTOU: 'Falta real marcada',
  }

  return <p className="rounded-lg bg-muted px-3 py-2 text-sm font-semibold text-muted-foreground">{text[status]}</p>
}

function buildInviteMessage(match: Match, pickup: Pickup | null) {
  const lines = [
    'Agenda Sport - CONVOCACAO DO EVENTO',
    '',
    `Evento: ${formatMatchTitle(match, pickup)}`,
    `Data: ${formatDate(match.scheduled_at)} as ${formatTime(match.scheduled_at)}`,
    pickup ? `Local: ${pickup.place}` : null,
    pickup?.address ? `Endereco: ${pickup.address}` : null,
    pickup?.maps_url ? `Mapa: ${pickup.maps_url}` : null,
    '',
    'Responda pelo WhatsApp: SIM, NAO ou ESPERA.',
    'ESPERA deixa voce na fila sem ocupar vaga confirmada.',
  ]
  return lines.filter(Boolean).join('\n')
}

function formatMatchTitle(match: Match, pickup: Pickup | null) {
  return pickup?.name || match.notes?.trim() || 'Evento avulso'
}

function getNextRecurringDate(match: Match, pickup: Pickup | null) {
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

function addMonthsDate(date: Date, months: number) {
  const next = new Date(date)
  next.setMonth(next.getMonth() + months)
  return next
}

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10)
}

function toTimeOnly(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function isSameLocalDate(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate()
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  textarea.remove()
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
