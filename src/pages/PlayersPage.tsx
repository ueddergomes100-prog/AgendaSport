import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BadgeCheck, Copy, ExternalLink, Goal, LoaderCircle, MessageCircle, Pencil, Plus, Search, ShieldCheck, Star, Trash2, UserPlus, Users } from 'lucide-react'
import { Card, CardTitle } from '../components/ui/card'
import { Field, Input, Select, Textarea } from '../components/ui/field'
import { Button } from '../components/ui/button'
import { AnimatedPage, PremiumModal } from '../components/ui/sport'
import { createPlayer, deletePlayer, getConfirmationSchedules, getCurrentCompany, getPlayers, getProfile, updatePlayer } from '../lib/data'
import { hasModuleAccess } from '../lib/permissions'
import { displayPosition, isGoalkeeperPosition, positionOptions } from '../lib/positions'
import type { Company, ConfirmationSchedule, Player, Position } from '../lib/types'
import { cn, getErrorMessage } from '../lib/utils'

const positions: Position[] = positionOptions

export function PlayersPage() {
  const players = useQuery({ queryKey: ['players'], queryFn: getPlayers })
  const company = useQuery({ queryKey: ['current-company'], queryFn: getCurrentCompany })
  const schedules = useQuery({ queryKey: ['confirmation-schedules'], queryFn: getConfirmationSchedules })
  const profile = useQuery({ queryKey: ['profile'], queryFn: getProfile })
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState('')
  const [feedback, setFeedback] = useState('')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null)
  const [selectedType, setSelectedType] = useState<Player['type']>('AVULSO')
  const formOpen = showForm || Boolean(editingPlayer)

  const roster = useMemo(() => players.data ?? [], [players.data])
  const filteredPlayers = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return roster
    return roster.filter((player) => {
      const haystack = [player.name, player.whatsapp, displayPosition(player.primary_position), player.type, player.status].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(term)
    })
  }, [roster, search])

  const activeCount = roster.filter((player) => player.status === 'ATIVO').length
  const suspendedCount = roster.filter((player) => player.status === 'SUSPENSO').length
  const mensalistas = roster.filter((player) => player.type === 'MENSALISTA').length
  const goalkeepers = roster.filter((player) => isGoalkeeperPosition(player.primary_position)).length
  const linePlayers = roster.length - goalkeepers
  const topPlayer = [...roster].sort((a, b) => b.technical_score - a.technical_score)[0]
  const scheduleRows = useMemo(() => normalizeScheduleRows(schedules.data ?? []), [schedules.data])
  const selectedStageNumber = selectedType === 'MENSALISTA' ? 1 : 2
  const selectedSchedule = scheduleRows.find((row) => row.stage_number === selectedStageNumber)
  const canManagePlayers = Boolean(profile.data && hasModuleAccess(profile.data, 'players'))
  const canManageSuspensions = Boolean(profile.data && hasModuleAccess(profile.data, 'suspensions'))

  useEffect(() => {
    if (!formOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [formOpen])

  function openNewPlayer() {
    if (!canManagePlayers) return
    setEditingPlayer(null)
    setSelectedType('AVULSO')
    setShowForm(true)
    setFeedback('')
  }

  function openEditPlayer(player: Player) {
    setEditingPlayer(player)
    setSelectedType(player.type ?? (clampStage(player.confirmation_stage) === 1 ? 'MENSALISTA' : 'AVULSO'))
    setShowForm(false)
    setFeedback('')
  }

  function closeForm() {
    setShowForm(false)
    setEditingPlayer(null)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    setSaving(true)
    setFeedback('')
    try {
      const form = new FormData(formElement)
      const type = String(form.get('type') || selectedType) as Player['type']
      let payload: Partial<Player> = {
        first_name: String(form.get('first_name')).trim(),
        last_name: String(form.get('last_name')).trim(),
        phone: null,
        whatsapp: String(form.get('whatsapp') || '').trim(),
        birth_date: null,
        email: null,
        status: String(form.get('status') || 'ATIVO') as Player['status'],
        suspension_reason: String(form.get('suspension_reason') || '').trim() || null,
        suspended_until: String(form.get('suspended_until') || '') || null,
        type,
        technical_score: Number(form.get('technical_score')),
        primary_position: String(form.get('primary_position')) as Position,
        secondary_position: null,
        confirmation_stage: type === 'MENSALISTA' ? 1 : 2,
        notes: String(form.get('notes') || '').trim(),
      }

      if (editingPlayer) {
        if (!canManagePlayers && canManageSuspensions) {
          payload = {
            first_name: editingPlayer.first_name ?? getNameParts(editingPlayer).firstName,
            last_name: editingPlayer.last_name ?? getNameParts(editingPlayer).lastName,
            whatsapp: editingPlayer.whatsapp,
            status: payload.status,
            suspension_reason: payload.suspension_reason,
            suspended_until: payload.suspended_until,
            type: editingPlayer.type,
            technical_score: editingPlayer.technical_score,
            primary_position: editingPlayer.primary_position,
            confirmation_stage: editingPlayer.confirmation_stage,
            notes: editingPlayer.notes,
          }
        }
        await updatePlayer(editingPlayer.id, payload)
        setFeedback('Participante atualizado com sucesso.')
      } else {
        await createPlayer(payload)
        setFeedback('Participante cadastrado com sucesso.')
      }

      await players.refetch()
      formElement.reset()
      closeForm()
    } catch (error) {
      setFeedback(getErrorMessage(error, 'Nao foi possivel salvar o participante.'))
    } finally {
      setSaving(false)
    }
  }

  async function removePlayer(player: Player) {
    if (!window.confirm(`Excluir ${player.name}? Historico de presenca e estatisticas vinculadas a ele tambem pode ser removido.`)) return
    setDeletingId(player.id)
    setFeedback('')
    try {
      await deletePlayer(player.id)
      await players.refetch()
      setFeedback('Participante excluido com sucesso.')
    } catch (error) {
      setFeedback(getErrorMessage(error, 'Nao foi possivel excluir o participante.'))
    } finally {
      setDeletingId('')
    }
  }

  function registrationUrl(token: string) {
    return `${window.location.origin}/inscricao/${token}`
  }

  async function copyText(text: string) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return
    }
    const textarea = document.createElement('textarea')
    textarea.value = text
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    textarea.remove()
  }

  async function copyRegistrationLink() {
    const token = company.data?.registration_token
    if (!token) return
    await copyText(registrationUrl(token))
    setFeedback('Link de inscricao copiado.')
  }

  async function copyRegistrationInvite() {
    const currentCompany = company.data
    if (!currentCompany?.registration_token) return
    const link = registrationUrl(currentCompany.registration_token)
    await copyText(`Entre na lista da ${currentCompany.name} pelo Agenda Sport: ${link}`)
    setFeedback('Mensagem de convite copiada para enviar aos participantes.')
  }

  return (
    <AnimatedPage>
      <section className="premium-panel overflow-hidden rounded-2xl p-6">
        <div className="grid gap-6 xl:grid-cols-[1fr_auto] xl:items-center">
          <div>
            <span className="page-kicker"><Users size={14} /> Elenco</span>
            <h1 className="mt-4 max-w-3xl text-3xl font-black tracking-tight md:text-4xl">Participantes organizados para o dia do evento</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Cadastre participantes com nome, WhatsApp, nota, mensalidade e funcao/modalidade.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 xl:justify-end">
            {canManagePlayers && (
              <Button type="button" className="h-12 px-5" onClick={openNewPlayer}>
                <Plus size={18} />
                Novo participante
              </Button>
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <RosterStat icon={<Users size={18} />} label="Total no elenco" value={roster.length} />
          <RosterStat icon={<BadgeCheck size={18} />} label="Ativos" value={activeCount} />
          <RosterStat icon={<ShieldCheck size={18} />} label="Goleiros" value={goalkeepers} />
          <RosterStat icon={<Goal size={18} />} label="Suspensos" value={suspendedCount} />
        </div>
      </section>

      {feedback && <p className="rounded-lg border border-border bg-white/80 px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm dark:bg-slate-950/70 dark:text-slate-200">{feedback}</p>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
        <Card className="overflow-hidden p-0">
          <div className="grid gap-4 border-b border-border p-5 lg:grid-cols-[1fr_320px] lg:items-center">
            <div>
              <CardTitle className="text-xl font-black">Lista de participantes</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{filteredPlayers.length} participantes encontrados</p>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <Input className="pl-9" placeholder="Buscar nome, posicao ou WhatsApp" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
          </div>

          <div className="grid gap-3 p-4">
            {filteredPlayers.map((player) => (
              <PlayerRosterCard
                key={player.id}
                player={player}
                deleting={deletingId === player.id}
                onDelete={() => removePlayer(player)}
                onEdit={() => openEditPlayer(player)}
                canDelete={canManagePlayers}
                canEdit={canManagePlayers || canManageSuspensions}
              />
            ))}
            {!filteredPlayers.length && (
              <div className="py-6">
                <EmptyRoster onCreate={openNewPlayer} hasSearch={Boolean(search.trim())} />
              </div>
            )}
          </div>
        </Card>

        <aside className="grid gap-4">
          {canManagePlayers && (
            <RegistrationInviteCard
              company={company.data ?? null}
              loading={company.isLoading}
              registrationUrl={registrationUrl}
              onCopyLink={copyRegistrationLink}
              onCopyInvite={copyRegistrationInvite}
            />
          )}

          <Card className="scoreboard">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-white/70">Destaque tecnico</p>
                <p className="mt-2 text-2xl font-black">{topPlayer?.name ?? '-'}</p>
              </div>
              <div className="grid size-12 place-items-center rounded-xl bg-yellow-300 text-slate-950">
                <Star size={22} />
              </div>
            </div>
            <p className="mt-6 text-5xl font-black text-yellow-300">{topPlayer?.technical_score ?? 0}/10</p>
          </Card>

          <Card>
          <CardTitle className="font-black">Composicao dos participantes</CardTitle>
            <div className="mt-4 grid gap-3">
              <CompositionRow label="Mensalistas" value={mensalistas} total={Math.max(roster.length, 1)} />
              <CompositionRow label="Avulsos" value={roster.length - mensalistas} total={Math.max(roster.length, 1)} />
              <CompositionRow label="Goleiros" value={goalkeepers} total={Math.max(roster.length, 1)} />
              <CompositionRow label="Linha" value={linePlayers} total={Math.max(roster.length, 1)} />
            </div>
          </Card>

          <Card className="border-primary/20 bg-green-50/70 dark:bg-green-950/20">
            <div className="flex items-start gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary text-white"><UserPlus size={18} /></div>
              <div>
                <p className="font-black">Cadastro rapido</p>
                <p className="mt-1 text-sm text-muted-foreground">Use apenas os dados que ajudam na chamada e no sorteio.</p>
              </div>
            </div>
          </Card>
        </aside>
      </div>

      {formOpen && (
        <PlayerModal title={editingPlayer ? 'Editar participante' : 'Novo participante'} onClose={closeForm}>
          <form className="grid gap-4" onSubmit={submit}>
            {(() => {
              const nameParts = getNameParts(editingPlayer)
              return (
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Nome"><Input name="first_name" required minLength={2} disabled={!canManagePlayers} defaultValue={nameParts.firstName} /></Field>
              <Field label="Sobrenome"><Input name="last_name" required minLength={2} disabled={!canManagePlayers} defaultValue={nameParts.lastName} /></Field>
              <Field label="WhatsApp"><Input name="whatsapp" required disabled={!canManagePlayers} defaultValue={editingPlayer?.whatsapp ?? ''} /></Field>
              <Field label="Nota"><Input name="technical_score" type="number" min={1} max={10} disabled={!canManagePlayers} defaultValue={editingPlayer?.technical_score ?? 5} /></Field>
              <Field label="Posicao">
                <Select name="primary_position" disabled={!canManagePlayers} defaultValue={isGoalkeeperPosition(editingPlayer?.primary_position) ? 'GOLEIRO' : 'LINHA'}>
                  {positions.map((item) => <option key={item} value={item}>{displayPosition(item)}</option>)}
                </Select>
              </Field>
              <Field label="Status">
                <Select name="status" defaultValue={editingPlayer?.status ?? 'ATIVO'}>
                  <option value="ATIVO">Ativo</option>
                  <option value="INATIVO">Inativo</option>
                  <option value="SUSPENSO">Suspenso</option>
                </Select>
              </Field>
              <Field label="Tipo do participante">
                <Select name="type" disabled={!canManagePlayers} value={selectedType} onChange={(event) => setSelectedType(event.target.value as Player['type'])}>
                  <option value="AVULSO">Avulso / geral</option>
                  <option value="MENSALISTA">Mensalista / prioridade</option>
                </Select>
              </Field>
            </div>
              )
            })()}

            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-950 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-100">
              {formatProfilePreview(selectedType, selectedSchedule)}
            </div>

            <Field label="Observacoes"><Textarea name="notes" disabled={!canManagePlayers} defaultValue={editingPlayer?.notes ?? ''} /></Field>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Motivo da suspensao"><Input name="suspension_reason" defaultValue={editingPlayer?.suspension_reason ?? ''} placeholder="Obrigatorio apenas se suspenso" /></Field>
              <Field label="Suspenso ate"><Input name="suspended_until" type="date" defaultValue={editingPlayer?.suspended_until ?? ''} /></Field>
            </div>
            {feedback && <p className="rounded-md bg-muted px-3 py-2 text-sm text-slate-700 dark:text-slate-200">{feedback}</p>}
            <div className="sticky bottom-0 z-10 -mx-5 -mb-5 flex flex-wrap justify-end gap-2 border-t border-border bg-white/95 p-5 backdrop-blur dark:bg-slate-950/95">
              <Button type="button" variant="ghost" onClick={closeForm}>
                Cancelar
              </Button>
              <Button disabled={saving}>
                {saving ? <LoaderCircle className="animate-spin" size={16} /> : <UserPlus size={16} />}
                {saving ? 'Salvando...' : editingPlayer ? 'Salvar alteracoes' : 'Salvar participante'}
              </Button>
            </div>
          </form>
        </PlayerModal>
      )}
    </AnimatedPage>
  )
}

function RegistrationInviteCard({
  company,
  loading,
  registrationUrl,
  onCopyLink,
  onCopyInvite,
}: {
  company: Company | null
  loading: boolean
  registrationUrl: (token: string) => string
  onCopyLink: () => Promise<void>
  onCopyInvite: () => Promise<void>
}) {
  const enabled = Boolean(company?.registration_token && company.registration_enabled)
  const link = company?.registration_token ? registrationUrl(company.registration_token) : ''

  return (
    <Card className="border-primary/25 bg-green-50/75 dark:bg-green-950/20">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary text-white">
          <UserPlus size={18} />
        </div>
        <div className="min-w-0">
          <CardTitle className="font-black">Link de auto cadastro</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">Envie este link para o participante preencher o proprio cadastro.</p>
        </div>
      </div>

      {loading && <p className="mt-4 rounded-lg bg-white/70 px-3 py-2 text-sm font-semibold text-muted-foreground dark:bg-slate-950/40">Carregando link...</p>}

      {!loading && enabled && (
        <div className="mt-4 grid gap-3">
          <p className="break-all rounded-lg border border-border bg-white/80 px-3 py-2 text-xs font-semibold text-slate-700 dark:bg-slate-950/50 dark:text-slate-200">{link}</p>
          <div className="grid gap-2">
            <Button type="button" onClick={onCopyInvite}>
              <MessageCircle size={16} />
              Copiar convite
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="secondary" onClick={onCopyLink}>
                <Copy size={16} />
                Link
              </Button>
              <Button asChild type="button" variant="secondary">
                <a href={link} target="_blank" rel="noreferrer">
                  <ExternalLink size={16} />
                  Abrir
                </a>
              </Button>
            </div>
          </div>
        </div>
      )}

      {!loading && !enabled && (
        <p className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm font-semibold text-yellow-900 dark:border-yellow-900/50 dark:bg-yellow-950/30 dark:text-yellow-100">
          Link indisponivel. Ative o cadastro publico desta empresa no Super Admin.
        </p>
      )}
    </Card>
  )
}

function getNameParts(player: Player | null) {
  if (!player) return { firstName: '', lastName: '' }
  const firstName = player.first_name?.trim()
  const lastName = player.last_name?.trim()
  if (firstName || lastName) return { firstName: firstName ?? '', lastName: lastName ?? '' }
  const [first = '', ...rest] = player.name.split(' ').filter(Boolean)
  return { firstName: first, lastName: rest.join(' ') }
}

function clampStage(value: unknown) {
  const parsed = Number(value ?? 1)
  if (!Number.isFinite(parsed)) return 1
  return Math.max(1, Math.min(5, Math.trunc(parsed)))
}

function normalizeScheduleRows(rows: ConfirmationSchedule[]) {
  const saved = new Map(rows.map((row) => [row.stage_number, row]))
  return [1, 2, 3, 4, 5].map((stageNumber) => {
    const row = saved.get(stageNumber)
    return {
      stage_number: stageNumber,
      days_before: row?.days_before ?? defaultStageDays(stageNumber),
      send_time: String(row?.send_time ?? defaultStageTime(stageNumber)).slice(0, 5),
      enabled: row?.enabled ?? stageNumber <= 4,
    }
  })
}

function defaultStageDays(stageNumber: number) {
  if (stageNumber === 1) return 2
  if (stageNumber === 2) return 2
  if (stageNumber === 3) return 1
  return 0
}

function defaultStageTime(stageNumber: number) {
  const defaults = ['16:00', '18:00', '16:00', '09:00', '18:00']
  return defaults[stageNumber - 1] ?? '16:00'
}

function formatProfilePreview(type: Player['type'], stage?: Pick<ConfirmationSchedule, 'stage_number' | 'days_before' | 'send_time' | 'enabled'>) {
  if (!stage) return 'Configure as etapas para ver quando este participante sera chamado.'
  const dayText = stage.days_before === 0 ? 'no dia do evento' : `${stage.days_before} dia${stage.days_before === 1 ? '' : 's'} antes do evento`
  if (type === 'MENSALISTA') {
    return `Mensalista recebe a prioridade na etapa 1: ${dayText}, as ${String(stage.send_time).slice(0, 5)}. Se nao responder, tambem continua nas chamadas gerais seguintes.`
  }
  return `Avulso entra nas chamadas gerais a partir da etapa 2: ${dayText}, as ${String(stage.send_time).slice(0, 5)}.`
}

function RosterStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-white/76 px-4 py-3 shadow-sm dark:bg-slate-950/50">
      <div className="flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-lg bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-100">{icon}</div>
        <div>
          <p className="text-xs font-bold text-muted-foreground">{label}</p>
          <p className="text-2xl font-black">{value}</p>
        </div>
      </div>
    </div>
  )
}

function PlayerAvatar({ player }: { player: Pick<Player, 'name' | 'primary_position'> }) {
  return (
    <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-slate-950 text-sm font-black text-white dark:bg-white dark:text-slate-950">
      {player.name.slice(0, 2).toUpperCase()}
    </div>
  )
}

function TypePill({ type }: { type: Player['type'] }) {
  return (
    <span className={cn('rounded-full px-3 py-1 text-xs font-black', type === 'MENSALISTA' ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-100' : 'bg-yellow-100 text-yellow-900 dark:bg-yellow-900/50 dark:text-yellow-100')}>
      {type === 'MENSALISTA' ? 'Mensalista' : 'Avulso'}
    </span>
  )
}

function StatusPill({ status }: { status: Player['status'] }) {
  const styles = {
    ATIVO: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-100',
    INATIVO: 'bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100',
    SUSPENSO: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-100',
  }
  return <span className={cn('rounded-full px-3 py-1 text-xs font-black', styles[status])}>{status}</span>
}

function PlayerRosterCard({
  player,
  deleting,
  onDelete,
  onEdit,
  canDelete,
  canEdit,
}: {
  player: Player
  deleting: boolean
  onDelete: () => void
  onEdit: () => void
  canDelete: boolean
  canEdit: boolean
}) {
  return (
    <div className="rounded-xl border border-border bg-white/75 p-4 shadow-sm transition hover:border-primary/35 hover:bg-green-50/35 dark:bg-slate-950/40 dark:hover:bg-green-950/15">
      <div className="grid gap-4 xl:grid-cols-[minmax(240px,1.2fr)_minmax(170px,0.8fr)_minmax(170px,0.8fr)_auto] xl:items-center">
        <div className="flex min-w-0 items-start gap-3">
          <PlayerAvatar player={player} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="max-w-full break-words text-lg font-black leading-tight">{player.name}</p>
              <StatusPill status={player.status} />
            </div>
            <p className="mt-1 break-words text-sm font-semibold text-muted-foreground">{player.whatsapp || 'Sem WhatsApp'}</p>
            <p className="mt-1 line-clamp-2 break-words text-xs text-muted-foreground">{player.notes || 'Sem observacoes'}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-1">
          <InfoPill label="Funcao" value={displayPosition(player.primary_position)} />
          <InfoPill label="Convocacao" value={player.type === 'MENSALISTA' ? 'Prioridade' : 'Geral'} />
          <div className="flex items-center">{<TypePill type={player.type} />}</div>
        </div>

        <div>
          <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">Nota</p>
          <div className="mt-2 flex items-center gap-3">
            <span className="text-lg font-black">{player.technical_score}/10</span>
            <div className="h-2 min-w-28 flex-1 rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(8, player.technical_score * 10)}%` }} />
            </div>
          </div>
        </div>

        {(canEdit || canDelete) && (
          <div className="grid grid-cols-2 gap-2 xl:w-28 xl:grid-cols-1">
            {canEdit && (
              <Button type="button" variant="secondary" onClick={onEdit}>
                <Pencil size={16} />
                Editar
              </Button>
            )}
            {canDelete && (
              <Button type="button" variant="danger" onClick={onDelete} disabled={deleting}>
                {deleting ? <LoaderCircle className="animate-spin" size={16} /> : <Trash2 size={16} />}
                Excluir
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/70 px-3 py-2">
      <p className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 break-words text-sm font-black">{value}</p>
    </div>
  )
}

function CompositionRow({ label, value, total }: { label: string; value: number; total: number }) {
  const percentage = Math.round((value / total) * 100)
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold">{label}</span>
        <span className="font-black">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  )
}

function EmptyRoster({ onCreate, hasSearch }: { onCreate: () => void; hasSearch: boolean }) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-border bg-muted/25 px-5 py-10 text-center">
      <div className="grid size-14 place-items-center rounded-2xl bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-100">
        <Users size={24} />
      </div>
      <p className="mt-4 text-lg font-black">{hasSearch ? 'Nenhum resultado encontrado' : 'Nenhum participante cadastrado'}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {hasSearch ? 'Ajuste a busca para encontrar outro participante.' : 'Cadastre o primeiro participante para comecar a montar presenca e sorteio.'}
      </p>
      {!hasSearch && (
        <Button type="button" className="mt-4" onClick={onCreate}>
          <Plus size={16} />
          Novo participante
        </Button>
      )}
    </div>
  )
}

function PlayerModal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <PremiumModal title={title} kicker="Cadastro" icon={UserPlus} onClose={onClose}>
      {children}
    </PremiumModal>
  )
}
