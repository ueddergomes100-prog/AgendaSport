import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Clock, DollarSign, LoaderCircle, MapPin, Pencil, Plus, ShieldCheck, Trash2, Users } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Field, Input, Select } from '../components/ui/field'
import { AnimatedPage, PremiumModal } from '../components/ui/sport'
import { createMatches, createPickup, deletePickup, getPickups, updatePickup } from '../lib/data'
import { getErrorMessage, money } from '../lib/utils'
import type { Pickup } from '../lib/types'

const weekdays = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado']

export function PickupsPage() {
  const queryClient = useQueryClient()
  const pickups = useQuery({ queryKey: ['pickups'], queryFn: getPickups })
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState('')
  const [feedback, setFeedback] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingPickup, setEditingPickup] = useState<Pickup | null>(null)
  const [pickupToDelete, setPickupToDelete] = useState<Pickup | null>(null)
  const formOpen = showForm || Boolean(editingPickup)
  const modalOpen = formOpen || Boolean(pickupToDelete)

  const list = useMemo(() => pickups.data ?? [], [pickups.data])
  const totalCapacity = list.reduce((sum, pickup) => sum + Number(pickup.max_players ?? 0), 0)
  const averageCasualPrice = useMemo(() => {
    if (!list.length) return 0
    return list.reduce((sum, pickup) => sum + Number(pickup.casual_price ?? 0), 0) / list.length
  }, [list])
  const nextPickup = list[0]

  useEffect(() => {
    if (!modalOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [modalOpen])

  function openNewPickup() {
    setEditingPickup(null)
    setShowForm(true)
    setFeedback('')
  }

  function closeForm() {
    setShowForm(false)
    setEditingPickup(null)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    setSaving(true)
    setFeedback('')
    try {
      const form = new FormData(formElement)
      const payload = readPickupForm(form)

      if (editingPickup) {
        await updatePickup(editingPickup.id, payload)
        setFeedback('Evento atualizado com sucesso.')
      } else {
        const pickup = await createPickup(payload)
        const recurrenceMonths = Number(form.get('schedule_months') || 1)
        const scheduledDates = recurrenceMonths > 0 ? buildWeeklySchedule(getNextPickupDateObject(pickup.weekday, pickup.start_time), recurrenceMonths) : []
        if (scheduledDates.length) {
          await createMatches(scheduledDates.map((scheduledAt) => ({
            pickup_id: pickup.id,
            scheduled_at: scheduledAt.toISOString(),
            status: 'AGENDADA',
            notes: `Agenda automatica: ${pickup.name}`,
          })))
        }
        setFeedback(scheduledDates.length ? `Evento cadastrado e ${scheduledDates.length} datas agendadas.` : 'Evento cadastrado com sucesso.')
      }

      await pickups.refetch()
      await invalidateGameFlow(queryClient)
      formElement.reset()
      closeForm()
    } catch (error) {
      setFeedback(getErrorMessage(error, 'Nao foi possivel salvar o evento.'))
    } finally {
      setSaving(false)
    }
  }

  async function removePickup(pickup: Pickup) {
    setDeletingId(pickup.id)
    setFeedback('')
    try {
      await deletePickup(pickup.id)
      await pickups.refetch()
      await invalidateGameFlow(queryClient)
      setPickupToDelete(null)
      setFeedback('Evento e agendamentos vinculados excluidos com sucesso.')
    } catch (error) {
      setFeedback(getErrorMessage(error, 'Nao foi possivel excluir o evento.'))
    } finally {
      setDeletingId('')
    }
  }

  return (
    <AnimatedPage>
      <section className="premium-panel overflow-hidden rounded-2xl p-6">
        <div className="grid gap-6 xl:grid-cols-[1fr_auto] xl:items-center">
          <div>
            <span className="page-kicker"><MapPin size={14} /> Eventos</span>
            <h1 className="mt-4 max-w-3xl text-3xl font-black tracking-tight md:text-4xl">Locais, horarios e valores em um so lugar</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Configure cada encontro esportivo com capacidade, preco, prioridade de mensalista e local.
            </p>
          </div>
          <Button type="button" className="h-12 px-5" onClick={openNewPickup}>
            <Plus size={18} />
            Novo evento
          </Button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <PickupStat icon={<CalendarDays size={18} />} label="Eventos cadastrados" value={list.length} />
          <PickupStat icon={<Users size={18} />} label="Capacidade total" value={totalCapacity} />
          <PickupStat icon={<DollarSign size={18} />} label="Avulso medio" value={money(averageCasualPrice)} />
          <PickupStat icon={<Clock size={18} />} label="Proxima grade" value={nextPickup ? weekdays[nextPickup.weekday] : '-'} />
        </div>
      </section>

      {feedback && <p className="rounded-lg border border-border bg-white/80 px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm dark:bg-slate-950/70 dark:text-slate-200">{feedback}</p>}

      <section className="grid gap-4 lg:grid-cols-2">
        {list.map((pickup) => (
          <PickupCard
            key={pickup.id}
            pickup={pickup}
            deleting={deletingId === pickup.id}
            onDelete={() => { setPickupToDelete(pickup); setFeedback('') }}
            onEdit={() => { setEditingPickup(pickup); setShowForm(false); setFeedback('') }}
          />
        ))}
        {!list.length && (
          <Card className="grid min-h-80 place-items-center text-center lg:col-span-2">
            <div>
              <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-100">
                <MapPin size={24} />
              </div>
              <h2 className="mt-4 text-xl font-black">Nenhum evento cadastrado</h2>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">Cadastre o primeiro evento para criar agenda, chamada e sorteio.</p>
              <Button type="button" className="mt-5" onClick={openNewPickup}>
                <Plus size={16} />
                Novo evento
              </Button>
            </div>
          </Card>
        )}
      </section>

      {formOpen && (
        <PickupModal title={editingPickup ? 'Editar evento' : 'Novo evento'} onClose={closeForm}>
          <form className="grid gap-4" onSubmit={submit}>
            <div className="rounded-xl border border-border bg-muted/50 p-4">
              <div className="flex items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary text-white"><ShieldCheck size={18} /></div>
                <div>
                  <p className="font-black">Configuracao do evento</p>
                  <p className="mt-1 text-sm text-muted-foreground">Esses dados aparecem na agenda e na convocacao dos participantes.</p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Nome"><Input name="name" required placeholder="Treino de quarta, society, volei..." defaultValue={editingPickup?.name ?? ''} /></Field>
              <Field label="Local"><Input name="place" required placeholder="Arena, clube ou campo" defaultValue={editingPickup?.place ?? ''} /></Field>
              <Field label="Endereco"><Input name="address" defaultValue={editingPickup?.address ?? ''} /></Field>
              <Field label="Link Google Maps"><Input name="maps_url" defaultValue={editingPickup?.maps_url ?? ''} /></Field>
              <Field label="Dia">
                <Select name="weekday" defaultValue={editingPickup?.weekday ?? 0}>{weekdays.map((day, index) => <option value={index} key={day}>{day}</option>)}</Select>
              </Field>
              <Field label="Horario"><Input name="start_time" type="time" required defaultValue={formatTimeInput(editingPickup?.start_time)} /></Field>
              <Field label="Valor avulso"><Input name="casual_price" type="number" min={0} defaultValue={editingPickup?.casual_price ?? 0} /></Field>
              <Field label="Valor mensalista"><Input name="monthly_price" type="number" min={0} defaultValue={editingPickup?.monthly_price ?? 0} /></Field>
              <Field label="Maximo de participantes"><Input name="max_players" type="number" min={1} required defaultValue={editingPickup?.max_players ?? ''} /></Field>
              <Field label="Horas exclusivas mensalistas"><Input name="mensalista_priority_hours" type="number" min={0} defaultValue={editingPickup?.mensalista_priority_hours ?? 48} /></Field>
            </div>

            {!editingPickup && (
              <Field label="Agenda automatica semanal">
                <Select name="schedule_months" defaultValue="1">
                  <option value="0">Nao agendar agora</option>
                  <option value="1">Agendar toda semana por 1 mes</option>
                  <option value="2">Agendar toda semana por 2 meses</option>
                  <option value="3">Agendar toda semana por 3 meses</option>
                </Select>
              </Field>
            )}

            <div className="sticky bottom-0 z-10 -mx-5 -mb-5 flex flex-wrap justify-end gap-2 border-t border-border bg-white/95 p-5 backdrop-blur dark:bg-slate-950/95">
              <Button type="button" variant="ghost" onClick={closeForm}>
                Cancelar
              </Button>
              <Button disabled={saving}>
                {saving ? <LoaderCircle className="animate-spin" size={16} /> : <Plus size={16} />}
                {saving ? 'Salvando...' : editingPickup ? 'Salvar alteracoes' : 'Salvar evento'}
              </Button>
            </div>
          </form>
        </PickupModal>
      )}

      {pickupToDelete && (
        <DeletePickupModal
          pickup={pickupToDelete}
          deleting={deletingId === pickupToDelete.id}
          onCancel={() => setPickupToDelete(null)}
          onConfirm={() => removePickup(pickupToDelete)}
        />
      )}
    </AnimatedPage>
  )
}

async function invalidateGameFlow(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
    queryClient.invalidateQueries({ queryKey: ['matches'] }),
    queryClient.invalidateQueries({ queryKey: ['attendance'] }),
    queryClient.invalidateQueries({ queryKey: ['latest-team-draw'] }),
    queryClient.invalidateQueries({ queryKey: ['match-player-stats'] }),
    queryClient.invalidateQueries({ queryKey: ['player-stats'] }),
    queryClient.invalidateQueries({ queryKey: ['player-stats-dashboard'] }),
  ])
}

function readPickupForm(form: FormData): Partial<Pickup> {
  return {
    name: String(form.get('name')).trim(),
    place: String(form.get('place')).trim(),
    address: String(form.get('address') || '').trim(),
    maps_url: String(form.get('maps_url') || '').trim(),
    weekday: Number(form.get('weekday')),
    start_time: String(form.get('start_time')),
    casual_price: Number(form.get('casual_price') || 0),
    monthly_price: Number(form.get('monthly_price') || 0),
    max_players: Number(form.get('max_players')),
    mensalista_priority_hours: Number(form.get('mensalista_priority_hours') || 0),
  }
}

function getNextPickupDateObject(weekday: number, startTime: string, from = new Date()) {
  const [hours, minutes] = startTime.split(':').map(Number)
  const date = new Date(from)
  const daysAhead = (weekday - date.getDay() + 7) % 7
  date.setDate(date.getDate() + daysAhead)
  date.setHours(hours || 0, minutes || 0, 0, 0)
  if (date <= from) date.setDate(date.getDate() + 7)
  return date
}

function buildWeeklySchedule(firstDate: Date, months: number) {
  const end = new Date(firstDate)
  end.setMonth(end.getMonth() + months)
  const dates: Date[] = []
  const current = new Date(firstDate)
  while (current <= end) {
    dates.push(new Date(current))
    current.setDate(current.getDate() + 7)
  }
  return dates
}

function formatTimeInput(value?: string | null) {
  return value ? value.slice(0, 5) : ''
}

function PickupCard({ pickup, deleting, onDelete, onEdit }: { pickup: Pickup; deleting: boolean; onDelete: () => void; onEdit: () => void }) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="football-surface min-h-40 p-5 text-white">
        <div className="relative z-10 flex h-full flex-col justify-between gap-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="rounded-md bg-white/15 px-2 py-1 text-xs font-black uppercase tracking-wide text-yellow-200">{weekdays[pickup.weekday]}</p>
              <h2 className="mt-3 text-2xl font-black">{pickup.name}</h2>
              <p className="mt-2 flex items-center gap-2 text-sm text-white/75"><MapPin size={15} /> {pickup.place}</p>
            </div>
            <div className="rounded-xl bg-white/12 px-3 py-2 text-right">
              <p className="text-xs text-white/65">Horario</p>
              <p className="text-lg font-black">{formatTimeInput(pickup.start_time)}</p>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" className="bg-white/90 text-slate-950 hover:bg-white" onClick={onEdit}>
              <Pencil size={16} />
              Editar
            </Button>
            <Button type="button" variant="danger" onClick={onDelete} disabled={deleting}>
              {deleting ? <LoaderCircle className="animate-spin" size={16} /> : <Trash2 size={16} />}
              Excluir
            </Button>
          </div>
        </div>
      </div>
      <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
        <Info label="Capacidade" value={`${pickup.max_players} participantes`} />
        <Info label="Avulso" value={money(pickup.casual_price)} />
        <Info label="Mensalista" value={money(pickup.monthly_price)} />
        <Info label="Prioridade" value={`${pickup.mensalista_priority_hours}h`} />
      </div>
      {(pickup.address || pickup.maps_url) && (
        <div className="border-t border-border px-5 py-4">
          <p className="text-sm font-semibold text-muted-foreground">{pickup.address || 'Endereco nao informado'}</p>
          {pickup.maps_url && (
            <a className="mt-2 inline-flex text-sm font-black text-primary hover:underline" href={pickup.maps_url} target="_blank" rel="noreferrer">
              Abrir mapa
            </a>
          )}
        </div>
      )}
    </Card>
  )
}

function PickupStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-border bg-white/76 px-4 py-3 shadow-sm dark:bg-slate-950/50">
      <div className="flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-lg bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-100">{icon}</div>
        <div className="min-w-0">
          <p className="text-xs font-bold text-muted-foreground">{label}</p>
          <p className="truncate text-2xl font-black">{value}</p>
        </div>
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-white/70 p-3 dark:bg-slate-950/40">
      <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-black">{value}</p>
    </div>
  )
}

function PickupModal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <PremiumModal title={title} kicker="Cadastro" icon={MapPin} onClose={onClose} maxWidth="max-w-3xl">
      {children}
    </PremiumModal>
  )
}

function DeletePickupModal({
  pickup,
  deleting,
  onCancel,
  onConfirm,
}: {
  pickup: Pickup
  deleting: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <PremiumModal title="Excluir evento" kicker="Acao permanente" icon={Trash2} onClose={onCancel} maxWidth="max-w-xl">
      <div className="grid gap-4">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-100">
          <p className="font-black">Tem certeza que deseja excluir {pickup.name}?</p>
          <p className="mt-2 leading-6">
            Esta acao remove o evento e tambem todos os agendamentos vinculados a ele, incluindo presencas, sorteios e estatisticas.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-muted/50 p-4">
          <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">Resumo</p>
          <p className="mt-2 font-black">{weekdays[pickup.weekday]} as {formatTimeInput(pickup.start_time)}</p>
          <p className="mt-1 text-sm text-muted-foreground">{pickup.place}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={deleting}>
            Cancelar
          </Button>
          <Button type="button" variant="danger" onClick={onConfirm} disabled={deleting}>
            {deleting ? <LoaderCircle className="animate-spin" size={16} /> : <Trash2 size={16} />}
            {deleting ? 'Excluindo...' : 'Excluir evento e agendamentos'}
          </Button>
        </div>
      </div>
    </PremiumModal>
  )
}
