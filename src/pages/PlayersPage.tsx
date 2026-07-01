import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BadgeCheck, Copy, ExternalLink, Goal, LoaderCircle, MessageCircle, Pencil, Plus, Search, ShieldCheck, Star, Trash2, UserPlus, Users } from 'lucide-react'
import { Card, CardTitle } from '../components/ui/card'
import { Field, Input, Select, Textarea } from '../components/ui/field'
import { Button } from '../components/ui/button'
import { AnimatedPage, PremiumModal } from '../components/ui/sport'
import { createPlayer, deletePlayer, getCurrentCompany, getPlayers, updatePlayer } from '../lib/data'
import type { Company, Player, Position } from '../lib/types'
import { cn, getErrorMessage } from '../lib/utils'

const positions: Position[] = ['Goleiro', 'Meio Campo']

export function PlayersPage() {
  const players = useQuery({ queryKey: ['players'], queryFn: getPlayers })
  const company = useQuery({ queryKey: ['current-company'], queryFn: getCurrentCompany })
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState('')
  const [feedback, setFeedback] = useState('')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null)
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
  const mensalistas = roster.filter((player) => player.type === 'MENSALISTA').length
  const goalkeepers = roster.filter((player) => player.primary_position === 'Goleiro').length
  const linePlayers = roster.length - goalkeepers
  const topPlayer = [...roster].sort((a, b) => b.technical_score - a.technical_score)[0]

  useEffect(() => {
    if (!formOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [formOpen])

  function openNewPlayer() {
    setEditingPlayer(null)
    setShowForm(true)
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
      const payload: Partial<Player> = {
        name: String(form.get('name')).trim(),
        phone: null,
        whatsapp: String(form.get('whatsapp') || '').trim(),
        birth_date: null,
        email: null,
        status: editingPlayer?.status ?? 'ATIVO',
        type: form.get('mensalista') === 'on' ? 'MENSALISTA' : 'AVULSO',
        technical_score: Number(form.get('technical_score')),
        primary_position: String(form.get('primary_position')) as Position,
        secondary_position: null,
        notes: String(form.get('notes') || '').trim(),
      }

      if (editingPlayer) {
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
            <Button type="button" className="h-12 px-5" onClick={openNewPlayer}>
              <Plus size={18} />
              Novo participante
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <RosterStat icon={<Users size={18} />} label="Total no elenco" value={roster.length} />
          <RosterStat icon={<BadgeCheck size={18} />} label="Ativos" value={activeCount} />
          <RosterStat icon={<ShieldCheck size={18} />} label="Defesa/Goleiro" value={goalkeepers} />
          <RosterStat icon={<Goal size={18} />} label="Linha/Quadra" value={linePlayers} />
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

          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead className="bg-muted/80 text-left">
                <tr>
                  <th className="p-4">Participante</th>
                  <th className="p-4">Mensalista</th>
                  <th className="p-4">Nota</th>
                  <th className="p-4">Posicao</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">WhatsApp</th>
                  <th className="p-4 text-right">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {filteredPlayers.map((player) => (
                  <tr key={player.id} className="border-t border-border transition hover:bg-muted/45 dark:border-slate-800">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <PlayerAvatar player={player} />
                        <div className="min-w-0">
                          <p className="truncate font-black">{player.name}</p>
                          <p className="text-xs text-muted-foreground">{player.notes || 'Sem observacoes'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4"><TypePill type={player.type} /></td>
                    <td className="p-4">
                      <div className="flex min-w-28 items-center gap-2">
                        <span className="font-black">{player.technical_score}/10</span>
                        <div className="h-2 flex-1 rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(8, player.technical_score * 10)}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="p-4 font-semibold">{displayPosition(player.primary_position)}</td>
                    <td className="p-4"><StatusPill active={player.status === 'ATIVO'} /></td>
                    <td className="p-4 text-muted-foreground">{player.whatsapp || '-'}</td>
                    <td className="p-4">
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="ghost" className="size-9 p-0" onClick={() => { setEditingPlayer(player); setShowForm(false); setFeedback('') }} title="Editar participante">
                          <Pencil size={16} />
                        </Button>
                        <Button type="button" variant="danger" className="size-9 p-0" onClick={() => removePlayer(player)} disabled={deletingId === player.id} title="Excluir participante">
                          {deletingId === player.id ? <LoaderCircle className="animate-spin" size={16} /> : <Trash2 size={16} />}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!filteredPlayers.length && (
                  <tr>
                    <td colSpan={7} className="p-10">
                      <EmptyRoster onCreate={openNewPlayer} hasSearch={Boolean(search.trim())} />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 p-4 lg:hidden">
            {filteredPlayers.map((player) => (
              <PlayerMobileCard
                key={player.id}
                player={player}
                deleting={deletingId === player.id}
                onDelete={() => removePlayer(player)}
                onEdit={() => { setEditingPlayer(player); setShowForm(false); setFeedback('') }}
              />
            ))}
            {!filteredPlayers.length && <EmptyRoster onCreate={openNewPlayer} hasSearch={Boolean(search.trim())} />}
          </div>
        </Card>

        <aside className="grid gap-4">
          <RegistrationInviteCard
            company={company.data ?? null}
            loading={company.isLoading}
            registrationUrl={registrationUrl}
            onCopyLink={copyRegistrationLink}
            onCopyInvite={copyRegistrationInvite}
          />

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
              <CompositionRow label="Defesa/Goleiro" value={goalkeepers} total={Math.max(roster.length, 1)} />
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
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Nome"><Input name="name" required defaultValue={editingPlayer?.name ?? ''} /></Field>
              <Field label="WhatsApp"><Input name="whatsapp" required defaultValue={editingPlayer?.whatsapp ?? ''} /></Field>
              <Field label="Nota"><Input name="technical_score" type="number" min={1} max={10} defaultValue={editingPlayer?.technical_score ?? 5} /></Field>
              <Field label="Posicao">
                <Select name="primary_position" defaultValue={editingPlayer?.primary_position ?? 'Meio Campo'}>
                  {positions.map((item) => <option key={item} value={item}>{displayPosition(item)}</option>)}
                </Select>
              </Field>
            </div>

            <label className="flex min-h-11 items-center gap-3 rounded-md border border-border bg-white px-3 text-sm font-semibold text-slate-700 dark:bg-slate-900 dark:text-slate-200">
              <input name="mensalista" type="checkbox" defaultChecked={editingPlayer?.type === 'MENSALISTA'} className="size-4 accent-green-700" />
              Mensalista
            </label>

            <Field label="Observacoes"><Textarea name="notes" defaultValue={editingPlayer?.notes ?? ''} /></Field>
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

function displayPosition(position: Position) {
  return position === 'Goleiro' ? 'Defesa/Goleiro' : 'Linha/Quadra'
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
      {type === 'MENSALISTA' ? 'SIM' : 'NAO'}
    </span>
  )
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span className={cn('rounded-full px-3 py-1 text-xs font-black', active ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-100' : 'bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100')}>
      {active ? 'ATIVO' : 'INATIVO'}
    </span>
  )
}

function PlayerMobileCard({ player, deleting, onDelete, onEdit }: { player: Player; deleting: boolean; onDelete: () => void; onEdit: () => void }) {
  return (
    <div className="rounded-xl border border-border bg-white/70 p-4 dark:bg-slate-950/40">
      <div className="flex items-start gap-3">
        <PlayerAvatar player={player} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-black">{player.name}</p>
          <p className="text-sm text-muted-foreground">{displayPosition(player.primary_position)} - {player.technical_score}/10</p>
        </div>
        <StatusPill active={player.status === 'ATIVO'} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <TypePill type={player.type} />
        <span className="rounded-full bg-muted px-3 py-1 text-xs font-black text-muted-foreground">{player.whatsapp || 'Sem WhatsApp'}</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button type="button" variant="secondary" onClick={onEdit}>
          <Pencil size={16} />
          Editar
        </Button>
        <Button type="button" variant="danger" onClick={onDelete} disabled={deleting}>
          {deleting ? <LoaderCircle className="animate-spin" size={16} /> : <Trash2 size={16} />}
          Excluir
        </Button>
      </div>
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
