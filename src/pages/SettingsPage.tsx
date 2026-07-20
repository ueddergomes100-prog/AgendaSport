import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BellRing, CheckCircle2, Copy, CreditCard, LoaderCircle, MessageCircle, Pencil, Plus, Save, Settings, ShieldCheck, SlidersHorizontal, Trash2, TriangleAlert, UserCog } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Card, CardTitle } from '../components/ui/card'
import { Field, Input, Select } from '../components/ui/field'
import { AnimatedPage, PremiumModal } from '../components/ui/sport'
import {
  createCompanyTeamUser,
  getBillingProviderStatus,
  getBillingSettings,
  getCompanyIntegration,
  getCompanyTeamUsers,
  getConfirmationSchedules,
  getProfile,
  saveBillingSettings,
  saveCompanyIntegration,
  saveConfirmationSchedules,
  updateCompanyTeamUser,
} from '../lib/data'
import type { BillingSettings, CompanyIntegration, ConfirmationSchedule, PermissionKey, TeamPermissions, TeamUser, UserRole } from '../lib/types'
import { getErrorMessage } from '../lib/utils'

type EditableSchedule = Pick<ConfirmationSchedule, 'stage_number' | 'days_before' | 'send_time' | 'enabled'>

const defaultSchedules: EditableSchedule[] = [
  { stage_number: 1, days_before: 2, send_time: '16:00', enabled: true },
  { stage_number: 2, days_before: 2, send_time: '18:00', enabled: true },
  { stage_number: 3, days_before: 1, send_time: '16:00', enabled: true },
  { stage_number: 4, days_before: 0, send_time: '09:00', enabled: true },
  { stage_number: 5, days_before: 0, send_time: '18:00', enabled: false },
]

export function SettingsPage() {
  const schedules = useQuery({ queryKey: ['confirmation-schedules'], queryFn: getConfirmationSchedules })
  const billing = useQuery({ queryKey: ['billing-settings'], queryFn: getBillingSettings })
  const gatewayStatus = useQuery({ queryKey: ['billing-provider-status'], queryFn: getBillingProviderStatus })
  const integration = useQuery({ queryKey: ['company-integration'], queryFn: getCompanyIntegration })
  const profile = useQuery({ queryKey: ['profile'], queryFn: getProfile })
  const canManageTeamUsers = profile.data?.role === 'ADMINISTRADOR' || profile.data?.role === 'SUPER_ADMIN'
  const teamUsers = useQuery({
    queryKey: ['company-team-users'],
    queryFn: getCompanyTeamUsers,
    enabled: canManageTeamUsers,
  })
  const [scheduleDraft, setScheduleDraft] = useState<EditableSchedule[] | null>(null)
  const [billingDraft, setBillingDraft] = useState<Pick<
    BillingSettings,
    'monthly_billing_day' | 'default_provider' | 'auto_charge_casual_players' | 'auto_suspend_overdue' | 'overdue_grace_days'
  > | null>(null)
  const [integrationDraft, setIntegrationDraft] = useState<Pick<CompanyIntegration, 'whatsapp_group_enabled' | 'whatsapp_group_id'> | null>(null)
  const [editingTeamUser, setEditingTeamUser] = useState<TeamUser | null>(null)
  const [editingPermissions, setEditingPermissions] = useState<TeamPermissions>({})
  const [editingRole, setEditingRole] = useState<Extract<UserRole, 'ADMINISTRADOR' | 'ORGANIZADOR' | 'OPERADOR'>>('OPERADOR')
  const [savingSchedules, setSavingSchedules] = useState(false)
  const [savingBilling, setSavingBilling] = useState(false)
  const [savingTeamUser, setSavingTeamUser] = useState(false)
  const [savingIntegration, setSavingIntegration] = useState(false)
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
      auto_suspend_overdue: billing.data?.auto_suspend_overdue ?? false,
      overdue_grace_days: billing.data?.overdue_grace_days ?? 5,
    } satisfies Pick<
      BillingSettings,
      'monthly_billing_day' | 'default_provider' | 'auto_charge_casual_players' | 'auto_suspend_overdue' | 'overdue_grace_days'
    >
  }, [billing.data])

  const savedIntegrationForm = useMemo(() => ({
    whatsapp_group_enabled: integration.data?.whatsapp_group_enabled ?? false,
    whatsapp_group_id: integration.data?.whatsapp_group_id ?? '',
  }), [integration.data])

  const scheduleRows = scheduleDraft ?? savedScheduleRows
  const billingForm = billingDraft ?? savedBillingForm
  const integrationForm = integrationDraft ?? savedIntegrationForm
  const activeScheduleRows = scheduleRows.filter((row) => row.enabled)
  const nextDisabledSchedule = scheduleRows.find((row) => !row.enabled)

  function updateSchedule(stageNumber: number, patch: Partial<EditableSchedule>) {
    setScheduleDraft(scheduleRows.map((row) => row.stage_number === stageNumber ? { ...row, ...patch } : row))
  }

  function removeSchedule(stageNumber: number) {
    if (activeScheduleRows.length <= 4) {
      setFeedback('Mantenha pelo menos 4 etapas de convocacao ativas.')
      return
    }
    updateSchedule(stageNumber, { enabled: false })
  }

  function addNextSchedule() {
    if (!nextDisabledSchedule) return
    updateSchedule(nextDisabledSchedule.stage_number, { enabled: true })
  }

  async function submitSchedules(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSavingSchedules(true)
    setFeedback('')
    try {
      const enabledCount = scheduleRows.filter((row) => row.enabled).length
      if (enabledCount < 4) throw new Error('Mantenha pelo menos 4 etapas de convocacao ativas.')
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
      if (billingForm.default_provider !== 'MANUAL_PIX') {
        if (billingForm.default_provider !== 'ASAAS' && billingForm.default_provider !== 'MERCADO_PAGO') {
          throw new Error('O gateway salvo anteriormente nao possui integracao ativa. Selecione Asaas ou Mercado Pago.')
        }
        const provider = gatewayStatus.data?.providers[billingForm.default_provider]
        if (!provider?.ready) {
          throw new Error('Complete as credenciais do gateway no servidor antes de ativa-lo.')
        }
      }
      if (billingForm.auto_charge_casual_players && billingForm.default_provider === 'MANUAL_PIX') {
        throw new Error('Selecione e configure Asaas ou Mercado Pago para cobrar automaticamente.')
      }
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

  async function submitIntegration(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSavingIntegration(true)
    setFeedback('')
    try {
      if (integrationForm.whatsapp_group_enabled && !integrationForm.whatsapp_group_id?.trim()) {
        throw new Error('Informe o ID oficial do grupo antes de ativar a integracao.')
      }
      await saveCompanyIntegration({
        whatsapp_group_enabled: integrationForm.whatsapp_group_enabled,
        whatsapp_group_id: integrationForm.whatsapp_group_id?.trim() || null,
      })
      await integration.refetch()
      setIntegrationDraft(null)
      setFeedback('Configuracao do grupo salva com sucesso.')
    } catch (error) {
      setFeedback(getErrorMessage(error, 'Nao foi possivel salvar a configuracao do grupo.'))
    } finally {
      setSavingIntegration(false)
    }
  }

  async function submitTeamUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSavingTeamUser(true)
    setFeedback('')
    try {
      const form = new FormData(event.currentTarget)
      const role = String(form.get('role') || 'OPERADOR') as Extract<UserRole, 'ADMINISTRADOR' | 'ORGANIZADOR' | 'OPERADOR'>
      const permissions: TeamPermissions = role === 'ADMINISTRADOR'
        ? fullPermissions()
        : Object.fromEntries(permissionEntries.map((item) => [item.key, form.get(item.key) === 'on']))

      await createCompanyTeamUser({
        fullName: String(form.get('full_name') || '').trim(),
        email: String(form.get('email') || '').trim(),
        password: String(form.get('password') || ''),
        role,
        permissions,
      })
      await teamUsers.refetch()
      event.currentTarget.reset()
      setFeedback('Acesso da equipe criado com sucesso.')
    } catch (error) {
      setFeedback(getErrorMessage(error, 'Nao foi possivel criar o acesso.'))
    } finally {
      setSavingTeamUser(false)
    }
  }

  function openTeamUserEditor(user: TeamUser) {
    setEditingTeamUser(user)
    setEditingRole(user.role as Extract<UserRole, 'ADMINISTRADOR' | 'ORGANIZADOR' | 'OPERADOR'>)
    setEditingPermissions(user.permissions ?? {})
  }

  async function saveTeamUserAccess() {
    if (!editingTeamUser) return
    setSavingTeamUser(true)
    setFeedback('')
    try {
      await updateCompanyTeamUser({
        id: editingTeamUser.id,
        role: editingRole,
        permissions: editingRole === 'ADMINISTRADOR' ? fullPermissions() : editingPermissions,
      })
      await teamUsers.refetch()
      setEditingTeamUser(null)
      setFeedback('Permissoes atualizadas. Elas serao aplicadas no proximo carregamento do usuario.')
    } catch (error) {
      setFeedback(getErrorMessage(error, 'Nao foi possivel atualizar as permissoes.'))
    } finally {
      setSavingTeamUser(false)
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
            4 etapas obrigatorias, 5 no maximo
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
            {activeScheduleRows.map((row) => (
              <div key={row.stage_number} className="grid gap-3 rounded-xl border border-border bg-white/70 p-3 dark:bg-slate-950/40 md:grid-cols-[130px_1fr_1fr_140px] md:items-end">
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">Etapa</p>
                  <p className="mt-2 text-lg font-black">{row.stage_number}</p>
                  <p className="text-xs font-semibold text-muted-foreground">{stageRoleLabel(row.stage_number)}</p>
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
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-12"
                  disabled={activeScheduleRows.length <= 4}
                  onClick={() => removeSchedule(row.stage_number)}
                >
                  <Trash2 size={16} />
                  Remover
                </Button>
              </div>
            ))}

            <div className="flex flex-wrap gap-2">
              {nextDisabledSchedule && (
                <Button type="button" variant="secondary" className="min-h-12" onClick={addNextSchedule}>
                  <Plus size={16} />
                  Adicionar etapa {nextDisabledSchedule.stage_number}
                </Button>
              )}
              <Button className="min-h-12 w-full sm:w-fit" disabled={savingSchedules || schedules.isLoading}>
                {savingSchedules ? <LoaderCircle className="animate-spin" size={16} /> : <Save size={16} />}
                {savingSchedules ? 'Salvando...' : 'Salvar convocacoes'}
              </Button>
            </div>
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
                <option value="ASAAS" disabled={gatewayStatus.data?.providers.ASAAS.ready === false}>
                  Asaas{gatewayStatus.data?.providers.ASAAS.ready === false ? ' - nao configurado' : ''}
                </option>
                <option value="MERCADO_PAGO" disabled={gatewayStatus.data?.providers.MERCADO_PAGO.ready === false}>
                  Mercado Pago{gatewayStatus.data?.providers.MERCADO_PAGO.ready === false ? ' - nao configurado' : ''}
                </option>
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
            <label className="flex items-start gap-3 rounded-xl border border-border bg-muted/50 p-4 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-5 accent-green-700"
                checked={billingForm.auto_suspend_overdue}
                onChange={(event) => setBillingDraft({ ...billingForm, auto_suspend_overdue: event.currentTarget.checked })}
              />
              <span>
                <strong className="block">Suspender mensalista inadimplente</strong>
                <span className="mt-1 block text-muted-foreground">A suspensao automatica ocorre depois do prazo de tolerancia e e retirada quando nao houver pendencia vencida.</span>
              </span>
            </label>
            <Field label="Dias de tolerancia apos o vencimento">
              <Input
                type="number"
                min={0}
                max={90}
                value={billingForm.overdue_grace_days}
                onChange={(event) => setBillingDraft({ ...billingForm, overdue_grace_days: clampNumber(event.target.value, 0, 90) })}
              />
            </Field>

            <Button className="min-h-12" disabled={savingBilling || billing.isLoading}>
              {savingBilling ? <LoaderCircle className="animate-spin" size={16} /> : <SlidersHorizontal size={16} />}
              {savingBilling ? 'Salvando...' : 'Salvar regras financeiras'}
            </Button>
          </form>

          <div className="mt-5 border-t border-border pt-5">
            <p className="text-sm font-black">Status dos gateways</p>
            <div className="mt-3 grid gap-3">
              {(['ASAAS', 'MERCADO_PAGO'] as const).map((provider) => {
                const status = gatewayStatus.data?.providers[provider]
                const label = provider === 'ASAAS' ? 'Asaas' : 'Mercado Pago'
                return (
                  <div key={provider} className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {status?.ready ? <CheckCircle2 className="text-green-700" size={17} /> : <TriangleAlert className="text-amber-700" size={17} />}
                        <strong className="text-sm">{label}</strong>
                        <span className="text-xs font-semibold text-muted-foreground">{status?.ready ? 'Pronto' : 'Pendente'}</span>
                      </div>
                      {status?.webhook_url && <p className="mt-2 truncate font-mono text-xs text-muted-foreground">{status.webhook_url}</p>}
                      {status?.missing.length ? <p className="mt-1 text-xs text-amber-800">Faltando no servidor: {status.missing.join(', ')}</p> : null}
                    </div>
                    {status?.webhook_url && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-9 px-3"
                        onClick={async () => {
                          await navigator.clipboard.writeText(status.webhook_url ?? '')
                          setFeedback(`Webhook ${label} copiado.`)
                        }}
                      >
                        <Copy size={15} />
                        Copiar
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
            {gatewayStatus.data && !gatewayStatus.data.whatsapp_billing_template_configured && (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                O template de cobranca do WhatsApp ainda nao foi configurado para mensagens iniciadas pela empresa.
              </p>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex items-start gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-100">
            <MessageCircle size={20} />
          </div>
          <div>
            <CardTitle>Grupo oficial do WhatsApp</CardTitle>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Atualiza confirmacoes, fila e sorteio no grupo quando a conta Meta estiver habilitada para a API oficial de grupos.
            </p>
          </div>
        </div>

        <form className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_220px] md:items-end" onSubmit={submitIntegration}>
          <Field label="ID oficial do grupo">
            <Input
              value={integrationForm.whatsapp_group_id ?? ''}
              onChange={(event) => setIntegrationDraft({ ...integrationForm, whatsapp_group_id: event.target.value })}
              placeholder="Ex.: 123456789012345@g.us ou ID fornecido pela Meta"
            />
          </Field>
          <label className="flex min-h-12 items-center gap-3 rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm font-bold">
            <input
              type="checkbox"
              className="size-5 accent-green-700"
              checked={integrationForm.whatsapp_group_enabled}
              onChange={(event) => setIntegrationDraft({ ...integrationForm, whatsapp_group_enabled: event.currentTarget.checked })}
            />
            Integracao ativa
          </label>
          <Button className="min-h-12 md:col-span-2 md:w-fit" disabled={savingIntegration || integration.isLoading}>
            {savingIntegration ? <LoaderCircle className="animate-spin" size={16} /> : <Save size={16} />}
            {savingIntegration ? 'Salvando...' : 'Salvar grupo'}
          </Button>
        </form>
      </Card>

      {canManageTeamUsers && <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="grid size-11 place-items-center rounded-xl bg-slate-950 text-white dark:bg-white dark:text-slate-950">
              <UserCog size={20} />
            </div>
            <div>
              <CardTitle>Acessos da equipe</CardTitle>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Crie administradores auxiliares para ajudar na chamada, lancamento de sumula, sorteio e financeiro.
              </p>
            </div>
          </div>
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-black text-muted-foreground">
            {teamUsers.data?.length ?? 0} acesso(s)
          </span>
        </div>

        <form className="mt-5 grid gap-4 rounded-xl border border-border bg-white/70 p-4 dark:bg-slate-950/40" onSubmit={submitTeamUser}>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Nome">
              <Input name="full_name" required minLength={2} placeholder="Pedro Silva" />
            </Field>
            <Field label="E-mail">
              <Input name="email" required type="email" placeholder="pedro@email.com" />
            </Field>
            <Field label="Senha inicial">
              <Input name="password" required minLength={6} type="password" placeholder="Minimo 6 caracteres" />
            </Field>
            <Field label="Perfil">
              <Select name="role" defaultValue="OPERADOR">
                <option value="OPERADOR">Operador</option>
                <option value="ORGANIZADOR">Organizador</option>
                <option value="ADMINISTRADOR">Administrador total</option>
              </Select>
            </Field>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {permissionEntries.map((item) => (
              <PermissionCheckbox
                key={item.key}
                name={item.key}
                label={item.label}
                defaultChecked={item.key === 'confirmations'}
              />
            ))}
          </div>

          <Button className="min-h-12 w-full sm:w-fit" disabled={savingTeamUser}>
            {savingTeamUser ? <LoaderCircle className="animate-spin" size={16} /> : <ShieldCheck size={16} />}
            {savingTeamUser ? 'Criando acesso...' : 'Criar acesso'}
          </Button>
        </form>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {(teamUsers.data ?? []).map((user) => (
            <div key={user.id} className="rounded-xl border border-border bg-white/75 p-4 dark:bg-slate-950/40">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-black">{user.full_name}</p>
                  <p className="mt-1 text-sm font-semibold text-muted-foreground">{user.email ?? 'Sem email retornado'}</p>
                </div>
                <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-black text-green-800 dark:bg-green-900/50 dark:text-green-100">{user.role}</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {permissionEntries.map((item) => (
                  <span key={item.key} className={`rounded-full px-3 py-1 text-xs font-black ${user.role === 'ADMINISTRADOR' || user.permissions?.[item.key] ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-100' : 'bg-muted text-muted-foreground'}`}>
                    {item.label}
                  </span>
                ))}
              </div>
              <Button type="button" variant="secondary" className="mt-4 h-10 w-full" onClick={() => openTeamUserEditor(user)}>
                <Pencil size={15} />
                Editar permissoes
              </Button>
            </div>
          ))}
          {!teamUsers.isLoading && !teamUsers.data?.length && (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground md:col-span-2">
              Nenhum acesso auxiliar cadastrado ainda.
            </p>
          )}
        </div>
      </Card>}

      {canManageTeamUsers && editingTeamUser && (
        <PremiumModal title={`Permissoes de ${editingTeamUser.full_name}`} kicker="Acesso da equipe" icon={UserCog} onClose={() => setEditingTeamUser(null)}>
          <div className="grid gap-4">
            <Field label="Perfil">
              <Select value={editingRole} onChange={(event) => setEditingRole(event.target.value as typeof editingRole)}>
                <option value="OPERADOR">Operador</option>
                <option value="ORGANIZADOR">Organizador</option>
                <option value="ADMINISTRADOR">Administrador total</option>
              </Select>
            </Field>
            <div className="grid gap-2 sm:grid-cols-2">
              {permissionEntries.map((item) => (
                <label key={item.key} className="flex min-h-12 items-center gap-3 rounded-xl border border-border bg-muted/35 px-3 py-2 text-sm font-bold">
                  <input
                    type="checkbox"
                    checked={editingRole === 'ADMINISTRADOR' || Boolean(editingPermissions[item.key])}
                    disabled={editingRole === 'ADMINISTRADOR'}
                    onChange={(event) => setEditingPermissions({
                      ...editingPermissions,
                      [item.key]: event.currentTarget.checked,
                    })}
                    className="size-5 accent-green-700"
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setEditingTeamUser(null)}>Cancelar</Button>
              <Button type="button" onClick={saveTeamUserAccess} disabled={savingTeamUser}>
                {savingTeamUser ? <LoaderCircle className="animate-spin" size={16} /> : <Save size={16} />}
                {savingTeamUser ? 'Salvando...' : 'Salvar permissoes'}
              </Button>
            </div>
          </div>
        </PremiumModal>
      )}
    </AnimatedPage>
  )
}

const permissionEntries: Array<{ key: PermissionKey; label: string }> = [
  { key: 'confirmations', label: 'Convocacoes e agenda' },
  { key: 'players', label: 'Cadastro de participantes' },
  { key: 'suspensions', label: 'Suspensoes' },
  { key: 'draw', label: 'Sorteio' },
  { key: 'results', label: 'Sumula e resultados' },
  { key: 'stats', label: 'Relatorios estatisticos' },
  { key: 'finance', label: 'Financeiro' },
  { key: 'settings', label: 'Configuracoes e acessos' },
]

function fullPermissions(): TeamPermissions {
  return Object.fromEntries(permissionEntries.map((item) => [item.key, true]))
}

function PermissionCheckbox({ name, label, defaultChecked }: { name: PermissionKey; label: string; defaultChecked?: boolean }) {
  return (
    <label className="flex min-h-12 items-center gap-3 rounded-xl border border-border bg-muted/35 px-3 py-2 text-sm font-bold">
      <input name={name} type="checkbox" defaultChecked={defaultChecked} className="size-5 accent-green-700" />
      <span>{label}</span>
    </label>
  )
}

function clampNumber(value: string, min: number, max: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return min
  return Math.max(min, Math.min(max, parsed))
}

function stageRoleLabel(stageNumber: number) {
  if (stageNumber === 1) return 'Prioridade mensalistas'
  return stageNumber === 5 ? 'Chamada geral opcional' : 'Chamada geral'
}
