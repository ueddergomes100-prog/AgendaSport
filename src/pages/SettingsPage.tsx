import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BellRing, CreditCard, LoaderCircle, Save, Settings, SlidersHorizontal } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Card, CardTitle } from '../components/ui/card'
import { Field, Input, Select } from '../components/ui/field'
import { AnimatedPage } from '../components/ui/sport'
import {
  getBillingSettings,
  getConfirmationSchedules,
  saveBillingSettings,
  saveConfirmationSchedules,
} from '../lib/data'
import type { BillingSettings, ConfirmationSchedule } from '../lib/types'
import { getErrorMessage } from '../lib/utils'

type EditableSchedule = Pick<ConfirmationSchedule, 'stage_number' | 'days_before' | 'send_time' | 'enabled'>

const defaultSchedules: EditableSchedule[] = [
  { stage_number: 1, days_before: 2, send_time: '16:00', enabled: true },
  { stage_number: 2, days_before: 2, send_time: '18:00', enabled: true },
  { stage_number: 3, days_before: 1, send_time: '10:00', enabled: true },
  { stage_number: 4, days_before: 0, send_time: '09:00', enabled: true },
  { stage_number: 5, days_before: 0, send_time: '12:00', enabled: false },
]

export function SettingsPage() {
  const schedules = useQuery({ queryKey: ['confirmation-schedules'], queryFn: getConfirmationSchedules })
  const billing = useQuery({ queryKey: ['billing-settings'], queryFn: getBillingSettings })
  const [scheduleDraft, setScheduleDraft] = useState<EditableSchedule[] | null>(null)
  const [billingDraft, setBillingDraft] = useState<Pick<BillingSettings, 'monthly_billing_day' | 'default_provider' | 'auto_charge_casual_players'> | null>(null)
  const [savingSchedules, setSavingSchedules] = useState(false)
  const [savingBilling, setSavingBilling] = useState(false)
  const [feedback, setFeedback] = useState('')

  const savedScheduleRows = useMemo(() => {
    if (!schedules.data) return defaultSchedules
    const map = new Map(schedules.data.map((row) => [row.stage_number, row]))
    return defaultSchedules.map((row) => {
      const saved = map.get(row.stage_number)
      return saved ? {
        stage_number: saved.stage_number,
        days_before: saved.days_before,
        send_time: saved.send_time.slice(0, 5),
        enabled: saved.enabled,
      } : row
    })
  }, [schedules.data])

  const savedBillingForm = useMemo(() => {
    return {
      monthly_billing_day: billing.data?.monthly_billing_day ?? 2,
      default_provider: billing.data?.default_provider ?? 'MANUAL_PIX',
      auto_charge_casual_players: billing.data?.auto_charge_casual_players ?? false,
    } satisfies Pick<BillingSettings, 'monthly_billing_day' | 'default_provider' | 'auto_charge_casual_players'>
  }, [billing.data])

  const scheduleRows = scheduleDraft ?? savedScheduleRows
  const billingForm = billingDraft ?? savedBillingForm

  function updateSchedule(stageNumber: number, patch: Partial<EditableSchedule>) {
    setScheduleDraft(scheduleRows.map((row) => row.stage_number === stageNumber ? { ...row, ...patch } : row))
  }

  async function submitSchedules(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSavingSchedules(true)
    setFeedback('')
    try {
      const enabledCount = scheduleRows.filter((row) => row.enabled).length
      if (enabledCount < 2) throw new Error('Mantenha pelo menos 2 etapas de convocacao ativas.')
      if (enabledCount > 5) throw new Error('O limite maximo e de 5 etapas de convocacao.')
      await saveConfirmationSchedules(scheduleRows)
      await schedules.refetch()
      setScheduleDraft(null)
      setFeedback('Horarios de convocacao salvos com sucesso.')
    } catch (error) {
      setFeedback(getErrorMessage(error, 'Nao foi possivel salvar os horarios.'))
    } finally {
      setSavingSchedules(false)
    }
  }

  async function submitBilling(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSavingBilling(true)
    setFeedback('')
    try {
      await saveBillingSettings(billingForm)
      await billing.refetch()
      setBillingDraft(null)
      setFeedback('Configuracoes financeiras salvas com sucesso.')
    } catch (error) {
      setFeedback(getErrorMessage(error, 'Nao foi possivel salvar as configuracoes financeiras.'))
    } finally {
      setSavingBilling(false)
    }
  }

  return (
    <AnimatedPage>
      <section className="premium-panel overflow-hidden rounded-2xl p-6">
        <div className="grid gap-6 xl:grid-cols-[1fr_auto] xl:items-center">
          <div>
            <span className="page-kicker"><Settings size={14} /> Configuracoes</span>
            <h1 className="mt-4 max-w-3xl text-3xl font-black tracking-tight md:text-4xl">Automacoes da empresa</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Ajuste os horarios de convocacao, regras de cobranca e comportamento financeiro antes de escalar a operacao.
            </p>
          </div>
          <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-950 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-100">
            2 etapas obrigatorias, 5 no maximo
          </div>
        </div>
      </section>

      {feedback && <p className="rounded-lg border border-border bg-white/80 px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm dark:bg-slate-950/70 dark:text-slate-200">{feedback}</p>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <Card>
          <div className="flex items-start gap-3">
            <div className="grid size-11 place-items-center rounded-xl bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-100">
              <BellRing size={20} />
            </div>
            <div>
              <CardTitle>Etapas de convocacao</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Defina quando o WhatsApp deve chamar quem ainda nao respondeu.</p>
            </div>
          </div>

          <form className="mt-5 grid gap-3" onSubmit={submitSchedules}>
            {scheduleRows.map((row) => (
              <div key={row.stage_number} className="grid gap-3 rounded-xl border border-border bg-white/70 p-3 dark:bg-slate-950/40 md:grid-cols-[130px_1fr_1fr_120px] md:items-end">
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">Etapa</p>
                  <p className="mt-2 text-lg font-black">{row.stage_number}</p>
                  {!row.enabled && <p className="text-xs font-semibold text-muted-foreground">Removida</p>}
                </div>
                <Field label="Dias antes">
                  <Input
                    type="number"
                    min={0}
                    max={30}
                    value={row.days_before}
                    onChange={(event) => updateSchedule(row.stage_number, { days_before: clampNumber(event.target.value, 0, 30) })}
                  />
                </Field>
                <Field label="Horario">
                  <Input
                    type="time"
                    value={row.send_time}
                    onChange={(event) => updateSchedule(row.stage_number, { send_time: event.target.value })}
                  />
                </Field>
                <label className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm font-black">
                  <input
                    type="checkbox"
                    className="size-5 accent-green-700"
                    checked={row.enabled}
                    onChange={(event) => updateSchedule(row.stage_number, { enabled: event.currentTarget.checked })}
                  />
                  {row.enabled ? 'Ativa' : 'Inativa'}
                </label>
              </div>
            ))}

            <Button className="min-h-12 w-full sm:w-fit" disabled={savingSchedules || schedules.isLoading}>
              {savingSchedules ? <LoaderCircle className="animate-spin" size={16} /> : <Save size={16} />}
              {savingSchedules ? 'Salvando...' : 'Salvar convocacoes'}
            </Button>
          </form>
        </Card>

        <Card>
          <div className="flex items-start gap-3">
            <div className="grid size-11 place-items-center rounded-xl bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-100">
              <CreditCard size={20} />
            </div>
            <div>
              <CardTitle>Regras financeiras</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Base para mensalistas, avulsos e futuras integracoes de pagamento.</p>
            </div>
          </div>

          <form className="mt-5 grid gap-4" onSubmit={submitBilling}>
            <Field label="Dia fixo da mensalidade">
              <Input
                type="number"
                min={1}
                max={28}
                value={billingForm.monthly_billing_day}
                onChange={(event) => setBillingDraft({ ...billingForm, monthly_billing_day: clampNumber(event.target.value, 1, 28) })}
              />
            </Field>
            <Field label="Provedor padrao">
              <Select
                value={billingForm.default_provider}
                onChange={(event) => setBillingDraft({ ...billingForm, default_provider: event.target.value as BillingSettings['default_provider'] })}
              >
                <option value="MANUAL_PIX">Manual PIX</option>
                <option value="ASAAS">Asaas</option>
                <option value="MERCADO_PAGO">Mercado Pago</option>
                <option value="STONE">Stone</option>
                <option value="VINDI">Vindi</option>
              </Select>
            </Field>
            <label className="flex items-start gap-3 rounded-xl border border-border bg-muted/50 p-4 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-5 accent-green-700"
                checked={billingForm.auto_charge_casual_players}
                onChange={(event) => setBillingDraft({ ...billingForm, auto_charge_casual_players: event.currentTarget.checked })}
              />
              <span>
                <strong className="block">Cobrar avulso ao confirmar</strong>
                <span className="mt-1 block text-muted-foreground">Quando o gateway for conectado, a confirmacao SIM podera gerar cobranca automaticamente.</span>
              </span>
            </label>

            <Button className="min-h-12" disabled={savingBilling || billing.isLoading}>
              {savingBilling ? <LoaderCircle className="animate-spin" size={16} /> : <SlidersHorizontal size={16} />}
              {savingBilling ? 'Salvando...' : 'Salvar regras financeiras'}
            </Button>
          </form>
        </Card>
      </div>
    </AnimatedPage>
  )
}

function clampNumber(value: string, min: number, max: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return min
  return Math.max(min, Math.min(max, parsed))
}
