import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Copy, Goal, LoaderCircle, MessageCircle, RefreshCcw, Save, ShieldCheck, Sparkles, Trophy, Users } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Card, CardTitle } from '../components/ui/card'
import { Field, Input, Select } from '../components/ui/field'
import { AnimatedPage } from '../components/ui/sport'
import { getAttendance, getMatches, saveTeamDraw } from '../lib/data'
import { displayPosition, isGoalkeeperPosition } from '../lib/positions'
import { buildBalancedTeams } from '../lib/team-draw'
import type { TeamDraw, TeamDrawPlayer, TeamDrawTeam } from '../lib/types'
import { compareTextPtBr, getErrorMessage, percent } from '../lib/utils'

const accents = ['bg-primary text-white', 'bg-yellow-400 text-slate-950', 'bg-slate-950 text-white', 'bg-sky-500 text-white', 'bg-rose-500 text-white', 'bg-violet-500 text-white', 'bg-orange-500 text-white', 'bg-emerald-500 text-white']

export function DrawPage() {
  const matches = useQuery({ queryKey: ['matches'], queryFn: getMatches })
  const [matchId, setMatchId] = useState('')
  const [teamCount, setTeamCount] = useState(2)
  const [playersPerTeam, setPlayersPerTeam] = useState(5)
  const [draw, setDraw] = useState<TeamDraw | null>(null)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState('')
  const activeMatches = useMemo(() => (matches.data ?? []).filter((match) => match.status !== 'ENCERRADA' && match.status !== 'CANCELADA'), [matches.data])
  const effectiveMatchId = matchId || activeMatches[0]?.id || ''
  const attendance = useQuery({ queryKey: ['attendance', effectiveMatchId], queryFn: () => getAttendance(effectiveMatchId), enabled: Boolean(effectiveMatchId) })

  const selectedMatch = useMemo(() => (matches.data ?? []).find((match) => match.id === effectiveMatchId) ?? null, [matches.data, effectiveMatchId])
  const canManageDraw = Boolean(selectedMatch && selectedMatch.status !== 'ENCERRADA' && selectedMatch.status !== 'CANCELADA')
  const confirmedPlayers = useMemo(
    () => (attendance.data ?? [])
      .filter((item) => ['CONFIRMADO', 'COMPARECEU'].includes(item.status) && item.player)
      .map((item) => ({ ...item.player!, attendance_id: item.id }))
      .sort((left, right) => compareTextPtBr(left.name, right.name)),
    [attendance.data],
  )
  const goalkeepers = confirmedPlayers.filter((player) => isGoalkeeperPosition(player.primary_position)).length
  const drawCapacity = teamCount * playersPerTeam
  const teamSlots = draw?.teams ?? buildEmptyTeams(teamCount, playersPerTeam)

  function resetDraw() {
    setDraw(null)
    setFeedback('')
  }

  function makeDraw() {
    setFeedback('')
    if (!canManageDraw) {
      setFeedback('Este evento ja foi encerrado ou cancelado. Nao e possivel montar equipes.')
      return
    }
    const nextDraw = buildBalancedTeams(confirmedPlayers, teamCount, playersPerTeam)
    setDraw(nextDraw)
    if (nextDraw.unassigned.length) {
      setFeedback(`${nextDraw.unassigned.length} participante(s) ficaram como reserva porque a capacidade configurada e de ${drawCapacity}.`)
    }
  }

  async function persistDraw() {
    if (!draw || !effectiveMatchId || !canManageDraw) return
    setSaving(true)
    setFeedback('')
    try {
      await saveTeamDraw(effectiveMatchId, draw)
      setFeedback('Sorteio salvo com sucesso.')
    } catch (error) {
      setFeedback(getErrorMessage(error, 'Nao foi possivel salvar o sorteio.'))
    } finally {
      setSaving(false)
    }
  }

  async function copyDrawMessage() {
    if (!draw) return
    await copyText(buildDrawMessage(draw, selectedMatch))
    setFeedback('Lista do sorteio copiada para enviar no WhatsApp.')
  }

  function openDrawWhatsApp() {
    if (!draw) return
    window.open(`https://wa.me/?text=${encodeURIComponent(buildDrawMessage(draw, selectedMatch))}`, '_blank', 'noopener,noreferrer')
  }

  return (
    <AnimatedPage>
      <section className="premium-panel overflow-hidden rounded-2xl p-6">
        <div className="grid gap-6 xl:grid-cols-[1fr_auto] xl:items-center">
          <div>
            <span className="page-kicker"><Trophy size={14} /> Sorteio</span>
            <h1 className="mt-4 max-w-3xl text-3xl font-black tracking-tight md:text-4xl">Equipes equilibradas sem perder tempo</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              O sorteio usa nota tecnica, funcoes e limite por equipe para montar o evento do tamanho certo.
            </p>
          </div>
          <div className="grid w-full gap-2 sm:grid-cols-[minmax(220px,1fr)_auto] xl:w-[520px]">
            <Select value={effectiveMatchId} onChange={(event) => { setMatchId(event.target.value); resetDraw() }}>
              <option value="">Selecione o evento</option>
              {activeMatches.map((match) => (
                <option key={match.id} value={match.id}>{new Date(match.scheduled_at).toLocaleString('pt-BR')} - {match.status}</option>
              ))}
            </Select>
            <Button type="button" disabled={!canManageDraw || !confirmedPlayers.length || !drawCapacity} onClick={makeDraw}>
              <Sparkles size={16} />
              Montar equipes
            </Button>
          </div>
        </div>
      </section>

      {feedback && <p className="rounded-lg border border-border bg-white/80 px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm dark:bg-slate-950/70 dark:text-slate-200">{feedback}</p>}

      <Card>
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <Field label="Quantidade de equipes">
            <Input
              type="number"
              min={2}
              max={8}
              value={teamCount}
              onChange={(event) => { setTeamCount(clampNumber(event.target.value, 2, 8)); resetDraw() }}
            />
          </Field>
          <Field label="Participantes por equipe">
            <Input
              type="number"
              min={1}
              max={20}
              value={playersPerTeam}
              onChange={(event) => { setPlayersPerTeam(clampNumber(event.target.value, 1, 20)); resetDraw() }}
            />
          </Field>
          <div className="rounded-lg bg-muted px-4 py-3 text-sm">
            <p className="font-black">{drawCapacity} vagas</p>
            <p className="text-xs text-muted-foreground">{confirmedPlayers.length} confirmados</p>
          </div>
        </div>
      </Card>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DrawStat icon={<Users size={18} />} label="Confirmados" value={confirmedPlayers.length} />
        <DrawStat icon={<ShieldCheck size={18} />} label="Goleiros" value={goalkeepers} />
        <DrawStat icon={<Trophy size={18} />} label="Equipes" value={teamCount} />
        <DrawStat icon={<Goal size={18} />} label="Diferenca" value={percent(draw?.percentageDiff)} />
      </section>

      <Card className="overflow-hidden p-0">
        <div className="football-surface p-5 text-white">
          <div className="relative z-10 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-yellow-200">Evento selecionado</p>
              <h2 className="mt-3 text-2xl font-black">{selectedMatch ? 'Encontro esportivo' : 'Selecione um evento'}</h2>
              <p className="mt-2 text-sm text-white/70">
                {selectedMatch ? `${new Date(selectedMatch.scheduled_at).toLocaleString('pt-BR')} - ${selectedMatch.status}` : 'A lista de confirmados aparece depois da chamada na agenda.'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <Button type="button" variant="secondary" disabled={!canManageDraw || !confirmedPlayers.length} onClick={makeDraw}>
                <RefreshCcw size={16} />
                Refazer
              </Button>
              <Button type="button" variant="secondary" disabled={!draw} onClick={copyDrawMessage}>
                <Copy size={16} />
                Copiar
              </Button>
              <Button type="button" variant="secondary" disabled={!draw} onClick={openDrawWhatsApp}>
                <MessageCircle size={16} />
                WhatsApp
              </Button>
              <Button type="button" disabled={!canManageDraw || !draw || saving} onClick={persistDraw}>
                {saving ? <LoaderCircle className="animate-spin" size={16} /> : <Save size={16} />}
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </div>

        {!activeMatches.length && (
          <div className="grid place-items-center p-10 text-center">
            <div className="grid size-14 place-items-center rounded-2xl bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
              <Trophy size={24} />
            </div>
            <h3 className="mt-4 text-lg font-black">Nenhum evento liberado para sorteio</h3>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">Eventos encerrados ou cancelados ficam bloqueados. Crie ou selecione um evento agendado para montar equipes.</p>
          </div>
        )}

        {activeMatches.length > 0 && !confirmedPlayers.length && (
          <div className="grid place-items-center p-10 text-center">
            <div className="grid size-14 place-items-center rounded-2xl bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-100">
              <Users size={24} />
            </div>
            <h3 className="mt-4 text-lg font-black">Nenhum participante confirmado</h3>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">Va na Agenda, convoque participantes e marque quem confirmou presenca.</p>
          </div>
        )}
      </Card>

      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {teamSlots.map((team, index) => (
          <TeamCard key={team.id} team={team} accent={accents[index % accents.length]} />
        ))}
      </section>

      {draw?.unassigned.length ? <ReserveCard players={draw.unassigned} /> : null}
    </AnimatedPage>
  )
}

function buildEmptyTeams(teamCount: number, playersPerTeam: number): TeamDrawTeam[] {
  return Array.from({ length: teamCount }, (_, index) => ({
    id: `team-${index + 1}`,
    name: `Equipe ${String.fromCharCode(65 + index)}`,
    players: [],
    score: 0,
    targetSize: playersPerTeam,
  }))
}

function clampNumber(value: string, min: number, max: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return min
  return Math.max(min, Math.min(max, parsed))
}

function DrawStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
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

function TeamCard({ team, accent }: { team: TeamDrawTeam; accent: string }) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between gap-4 border-b border-border p-5">
        <div>
          <CardTitle className="text-xl font-black">{team.name}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{team.players.length}/{team.targetSize} participantes</p>
        </div>
        <div className="rounded-xl bg-muted px-4 py-3 text-right">
          <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">Nota</p>
          <p className="text-2xl font-black">{team.score}</p>
        </div>
      </div>

      <div className="grid gap-2 p-4">
        {team.players.map((player, index) => (
          <div key={player.id} className="grid grid-cols-[42px_1fr_auto] items-center gap-3 rounded-xl border border-border bg-white/70 p-3 dark:bg-slate-950/40">
            <span className={`grid size-9 place-items-center rounded-lg text-sm font-black ${accent}`}>{index + 1}</span>
            <div className="min-w-0">
              <p className="truncate font-black">{player.name}</p>
              <p className="text-xs text-muted-foreground">{displayPosition(player.primary_position)}</p>
            </div>
            <span className="rounded-full bg-muted px-3 py-1 text-sm font-black">{player.technical_score}/10</span>
          </div>
        ))}
        {!team.players.length && <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Clique em montar equipes para ver a distribuicao.</p>}
      </div>
    </Card>
  )
}

function ReserveCard({ players }: { players: TeamDrawPlayer[] }) {
  return (
    <Card>
      <CardTitle className="text-xl font-black">Reservas</CardTitle>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {players.map((player) => (
          <div key={player.id} className="rounded-lg border border-border bg-white/70 p-3 dark:bg-slate-950/40">
            <p className="font-black">{player.name}</p>
            <p className="text-xs text-muted-foreground">{displayPosition(player.primary_position)} - {player.technical_score}/10</p>
          </div>
        ))}
      </div>
    </Card>
  )
}

function buildDrawMessage(draw: TeamDraw, match: { scheduled_at: string; notes: string | null } | null) {
  const lines = [
    'Agenda Sport - SORTEIO DAS EQUIPES',
    match ? `Evento: ${match.notes?.trim() || new Date(match.scheduled_at).toLocaleString('pt-BR')}` : null,
    match ? `Data: ${new Date(match.scheduled_at).toLocaleString('pt-BR')}` : null,
    '',
    ...draw.teams.flatMap((team) => [
      `${team.name} (${team.players.length} participantes | nota ${team.score})`,
      ...team.players.map((player, index) => `${index + 1}. ${player.name} - ${displayPosition(player.primary_position)} - nota ${player.technical_score}`),
      '',
    ]),
    draw.unassigned.length ? 'Reservas:' : null,
    ...draw.unassigned.map((player, index) => `${index + 1}. ${player.name} - ${displayPosition(player.primary_position)}`),
  ]

  return lines.filter(Boolean).join('\n')
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
