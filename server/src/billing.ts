import { createHash } from 'node:crypto'
import { env } from './env.js'
import { adminSupabase } from './supabase.js'
import { sendWhatsAppMessage } from './whatsapp.js'

export type BillingProvider = 'MANUAL_PIX' | 'ASAAS' | 'MERCADO_PAGO'
export type PaymentStatus = 'PENDENTE' | 'PAGO' | 'ATRASADO' | 'CANCELADO'

type PaymentDeliveryStatus = 'NOT_REQUESTED' | 'SKIPPED_ALREADY_EXISTS' | 'SKIPPED_NO_WHATSAPP' | string

type CreateChargeInput = {
  tenantId: string
  playerId: string
  matchId?: string | null
  amount: number
  dueDate: string
  provider: BillingProvider
  description: string
  sendMessage?: boolean
}

export async function createPaymentCharge(input: CreateChargeInput) {
  let existingQuery = adminSupabase
    .from('payments')
    .select('*')
    .eq('tenant_id', input.tenantId)
    .eq('player_id', input.playerId)
    .eq('due_date', input.dueDate)
    .neq('status', 'CANCELADO')
    .order('created_at', { ascending: false })
    .limit(1)
  existingQuery = input.matchId
    ? existingQuery.eq('match_id', input.matchId)
    : existingQuery.is('match_id', null)
  const { data: existingPayments, error: existingError } = await existingQuery
  if (existingError) throw existingError
  if (existingPayments?.[0]) {
    return {
      ...existingPayments[0],
      delivery_status: input.sendMessage ? 'SKIPPED_ALREADY_EXISTS' : 'NOT_REQUESTED',
    }
  }

  const [{ data: player, error: playerError }, { data: company, error: companyError }] = await Promise.all([
    adminSupabase
      .from('players')
      .select('id, name, email, whatsapp')
      .eq('id', input.playerId)
      .eq('tenant_id', input.tenantId)
      .single(),
    adminSupabase
      .from('companies')
      .select('name, email')
      .eq('id', input.tenantId)
      .single(),
  ])
  if (playerError || !player) throw new Error('Participante nao encontrado para gerar a cobranca.')
  if (companyError || !company) throw new Error('Empresa nao encontrada para gerar a cobranca.')

  const providerResult = input.provider === 'ASAAS'
    ? await createAsaasCharge({
      name: player.name,
      email: player.email,
      phone: player.whatsapp,
      amount: input.amount,
      dueDate: input.dueDate,
      description: input.description,
      externalReference: `${input.tenantId}:${input.matchId ?? `monthly:${input.dueDate}`}:${input.playerId}`,
    })
    : input.provider === 'MERCADO_PAGO'
      ? await createMercadoPagoCharge({
        email: player.email || company.email,
        amount: input.amount,
        dueDate: input.dueDate,
        description: input.description,
        externalReference: `${input.tenantId}:${input.matchId ?? `monthly:${input.dueDate}`}:${input.playerId}`,
      })
      : { providerPaymentId: null, checkoutUrl: null, pixCode: null }

  const { data: payment, error } = await adminSupabase
    .from('payments')
    .insert({
      tenant_id: input.tenantId,
      player_id: input.playerId,
      match_id: input.matchId ?? null,
      provider: input.provider,
      provider_payment_id: providerResult.providerPaymentId,
      amount: input.amount,
      due_date: input.dueDate,
      status: 'PENDENTE',
      checkout_url: providerResult.checkoutUrl,
      pix_code: providerResult.pixCode,
    })
    .select()
    .single()
  if (error) throw error

  let deliveryStatus: PaymentDeliveryStatus = 'NOT_REQUESTED'
  if (input.sendMessage) {
    if (player.whatsapp) {
      const delivery = await deliverPaymentMessage({
        tenantId: input.tenantId,
        paymentId: payment.id,
        matchId: input.matchId ?? null,
        playerId: input.playerId,
        playerName: player.name,
        phone: player.whatsapp,
        description: input.description,
        provider: input.provider,
        amount: input.amount,
        dueDate: input.dueDate,
        checkoutUrl: providerResult.checkoutUrl,
        pixCode: providerResult.pixCode,
        source: input.matchId ? 'casual_confirmation_auto_charge' : 'monthly_billing',
      })
      deliveryStatus = delivery.status
    } else {
      deliveryStatus = 'SKIPPED_NO_WHATSAPP'
    }
  }

  return { ...payment, delivery_status: deliveryStatus }
}

export async function sendPaymentChargeMessage(tenantId: string, paymentId: string) {
  const { data, error } = await adminSupabase
    .from('payments')
    .select('id, match_id, player_id, provider, amount, due_date, checkout_url, pix_code, player:players(name, whatsapp)')
    .eq('tenant_id', tenantId)
    .eq('id', paymentId)
    .single()
  if (error || !data) throw new Error('Cobranca nao encontrada.')

  const payment = data as unknown as {
    id: string
    match_id: string | null
    player_id: string | null
    provider: BillingProvider
    amount: number
    due_date: string
    checkout_url: string | null
    pix_code: string | null
    player: { name: string; whatsapp: string | null } | null
  }
  if (!payment.player_id || !payment.player) throw new Error('A cobranca nao possui participante vinculado.')
  if (!payment.player.whatsapp) throw new Error('O participante nao possui WhatsApp cadastrado.')

  return deliverPaymentMessage({
    tenantId,
    paymentId: payment.id,
    matchId: payment.match_id,
    playerId: payment.player_id,
    playerName: payment.player.name,
    phone: payment.player.whatsapp,
    description: payment.match_id ? 'Pagamento do evento' : 'Cobranca Agenda Sport',
    provider: payment.provider,
    amount: Number(payment.amount),
    dueDate: payment.due_date,
    checkoutUrl: payment.checkout_url,
    pixCode: payment.pix_code,
    source: 'manual_payment_resend',
  })
}

export function getBillingProviderStatus() {
  const publicApiUrl = env.PUBLIC_API_URL?.replace(/\/$/, '') ?? null
  const asaasMissing = [
    !env.ASAAS_API_KEY ? 'ASAAS_API_KEY' : null,
    !env.ASAAS_WEBHOOK_TOKEN ? 'ASAAS_WEBHOOK_TOKEN' : null,
    !publicApiUrl ? 'PUBLIC_API_URL' : null,
  ].filter((value): value is string => Boolean(value))
  const mercadoPagoMissing = [
    !env.MERCADO_PAGO_ACCESS_TOKEN ? 'MERCADO_PAGO_ACCESS_TOKEN' : null,
    !env.MERCADO_PAGO_WEBHOOK_SECRET ? 'MERCADO_PAGO_WEBHOOK_SECRET' : null,
    !publicApiUrl ? 'PUBLIC_API_URL' : null,
  ].filter((value): value is string => Boolean(value))

  return {
    public_api_url: publicApiUrl,
    whatsapp_billing_template_configured: Boolean(env.WHATSAPP_BILLING_TEMPLATE_NAME),
    providers: {
      MANUAL_PIX: {
        charges_enabled: true,
        webhook_ready: true,
        ready: true,
        missing: [],
        webhook_url: null,
      },
      ASAAS: {
        charges_enabled: Boolean(env.ASAAS_API_KEY),
        webhook_ready: Boolean(env.ASAAS_WEBHOOK_TOKEN && publicApiUrl),
        ready: asaasMissing.length === 0,
        missing: asaasMissing,
        webhook_url: publicApiUrl ? `${publicApiUrl}/api/webhooks/payments/asaas` : null,
      },
      MERCADO_PAGO: {
        charges_enabled: Boolean(env.MERCADO_PAGO_ACCESS_TOKEN),
        webhook_ready: Boolean(env.MERCADO_PAGO_WEBHOOK_SECRET && publicApiUrl),
        ready: mercadoPagoMissing.length === 0,
        missing: mercadoPagoMissing,
        webhook_url: publicApiUrl ? `${publicApiUrl}/api/webhooks/payments/mercado-pago` : null,
      },
    },
  }
}

export async function runMonthlyBillingForTenant(tenantId: string, options: { force?: boolean } = {}) {
  const { data: settings, error: settingsError } = await adminSupabase
    .from('billing_settings')
    .select('monthly_billing_day, default_provider')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (settingsError) throw settingsError

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const dueDay = Math.max(1, Math.min(28, Number(settings?.monthly_billing_day ?? 2)))
  if (!options.force && now.getDate() < dueDay) {
    return { created: 0, skipped: 0, amount: 0, due_date: localDate(year, month, dueDay) }
  }
  const dueDate = localDate(year, month, dueDay)
  const periodStart = localDate(year, month, 1)
  const periodEnd = localDate(year, month + 1, 0)

  const { data: pickupPriceRows, error: pickupError } = await adminSupabase
    .from('pickups')
    .select('monthly_price')
    .eq('tenant_id', tenantId)
    .gt('monthly_price', 0)
    .order('monthly_price', { ascending: false })
    .limit(1)
  if (pickupError) throw pickupError
  const amount = Number(pickupPriceRows?.[0]?.monthly_price ?? 0)
  if (!amount) throw new Error('Configure o valor mensal em pelo menos um evento antes de gerar mensalidades.')

  const { data: players, error: playersError } = await adminSupabase
    .from('players')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .in('status', ['ATIVO', 'SUSPENSO'])
    .eq('type', 'MENSALISTA')
  if (playersError) throw playersError

  const { data: existing, error: existingError } = await adminSupabase
    .from('payments')
    .select('player_id')
    .eq('tenant_id', tenantId)
    .gte('due_date', periodStart)
    .lte('due_date', periodEnd)
    .neq('status', 'CANCELADO')
  if (existingError) throw existingError
  const existingPlayerIds = new Set((existing ?? []).map((payment) => payment.player_id).filter(Boolean))
  const missingPlayers = (players ?? []).filter((player) => !existingPlayerIds.has(player.id))

  let created = 0
  for (const player of missingPlayers) {
    await createPaymentCharge({
      tenantId,
      playerId: player.id,
      amount,
      dueDate,
      provider: normalizeProvider(settings?.default_provider),
      description: `Mensalidade ${String(month + 1).padStart(2, '0')}/${year}`,
      sendMessage: true,
    })
    created += 1
  }

  return {
    created,
    skipped: (players ?? []).length - created,
    amount,
    due_date: dueDate,
  }
}

export async function ensureCasualChargeForConfirmation(
  tenantId: string,
  matchId: string,
  playerId: string,
) {
  const { data: settings, error: settingsError } = await adminSupabase
    .from('billing_settings')
    .select('auto_charge_casual_players, default_provider')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (settingsError && isMissingTableError(settingsError.message, 'billing_settings')) {
    return 'SKIPPED_SETTINGS_TABLE_MISSING'
  }
  if (settingsError) throw settingsError
  if (!settings?.auto_charge_casual_players) return 'SKIPPED_DISABLED'

  const { data: details, error: detailsError } = await adminSupabase
    .from('attendance')
    .select('player:players(id, name, type, whatsapp), match:matches(id, scheduled_at, pickup:pickups(name, casual_price))')
    .eq('match_id', matchId)
    .eq('player_id', playerId)
    .single()
  if (detailsError) throw detailsError

  const row = details as unknown as {
    player: { id: string; name: string; type: string; whatsapp: string | null } | null
    match: { id: string; scheduled_at: string; pickup: { name: string; casual_price: number } | null } | null
  }
  if (row.player?.type !== 'AVULSO') return 'SKIPPED_NOT_CASUAL'

  const amount = Number(row.match?.pickup?.casual_price ?? 0)
  if (!amount) return 'SKIPPED_ZERO_AMOUNT'
  const provider = normalizeProvider(settings.default_provider)
  if (provider === 'MANUAL_PIX' || !getBillingProviderStatus().providers[provider].ready) {
    return 'SKIPPED_PROVIDER_NOT_CONFIGURED'
  }

  const payment = await createPaymentCharge({
    tenantId,
    matchId,
    playerId,
    provider,
    amount,
    dueDate: dateInSaoPaulo(new Date()),
    description: `Pagamento - ${row.match?.pickup?.name ?? 'Evento esportivo'}`,
    sendMessage: true,
  })
  if (payment.delivery_status === 'SKIPPED_ALREADY_EXISTS') return 'SKIPPED_ALREADY_EXISTS'
  if (payment.delivery_status === 'SENT') return 'CREATED_AND_SENT'
  return `CREATED_${payment.delivery_status}`
}

export async function runBillingMaintenance() {
  const today = localDate(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())
  await adminSupabase
    .from('payments')
    .update({ status: 'ATRASADO' })
    .eq('status', 'PENDENTE')
    .lt('due_date', today)

  const { data: settings, error } = await adminSupabase
    .from('billing_settings')
    .select('tenant_id, auto_suspend_overdue, overdue_grace_days')
  if (error && isMissingTableError(error.message, 'billing_settings')) return
  if (error) throw error

  for (const setting of settings ?? []) {
    await runMonthlyBillingForTenant(setting.tenant_id).catch((billingError) => {
      console.warn(`[billing] monthly generation failed for ${setting.tenant_id}`, billingError)
    })
    await sendPaymentReminders(setting.tenant_id, today).catch((reminderError) => {
      console.warn(`[billing] payment reminders failed for ${setting.tenant_id}`, reminderError)
    })
    if (!setting.auto_suspend_overdue) continue
    await syncOverdueSuspensions(setting.tenant_id, Number(setting.overdue_grace_days ?? 5), today)
  }
}

export async function releasePlayerAfterPayment(tenantId: string, playerId: string | null) {
  if (!playerId) return
  const { count, error } = await adminSupabase
    .from('payments')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('player_id', playerId)
    .eq('status', 'ATRASADO')
  if (error) throw error
  if ((count ?? 0) > 0) return
  await adminSupabase
    .from('players')
    .update({
      status: 'ATIVO',
      suspension_reason: null,
      suspended_until: null,
      suspended_at: null,
    })
    .eq('tenant_id', tenantId)
    .eq('id', playerId)
    .ilike('suspension_reason', 'Inadimplencia automatica%')
}

export async function applyProviderPaymentStatus(
  provider: Exclude<BillingProvider, 'MANUAL_PIX'>,
  providerPaymentId: string,
  status: PaymentStatus,
) {
  const { data: payment, error: findError } = await adminSupabase
    .from('payments')
    .select('id, tenant_id, player_id, status')
    .eq('provider', provider)
    .eq('provider_payment_id', providerPaymentId)
    .maybeSingle()
  if (findError) throw findError
  if (!payment) return null

  const currentStatus = payment.status as PaymentStatus
  const nextStatus = currentStatus === 'PAGO' && (status === 'PENDENTE' || status === 'ATRASADO')
    ? 'PAGO'
    : status
  if (currentStatus !== nextStatus) {
    const { error: updateError } = await adminSupabase
      .from('payments')
      .update({
        status: nextStatus,
        paid_at: nextStatus === 'PAGO' ? new Date().toISOString() : null,
      })
      .eq('id', payment.id)
    if (updateError) throw updateError
  }

  if (nextStatus === 'PAGO') {
    await releasePlayerAfterPayment(payment.tenant_id, payment.player_id)
  }

  return {
    id: payment.id,
    tenantId: payment.tenant_id,
    playerId: payment.player_id,
    status: nextStatus,
    changed: currentStatus !== nextStatus,
  }
}

let billingTimer: ReturnType<typeof setInterval> | null = null
let billingRunning = false

export function startBillingWorker() {
  if (!env.BILLING_WORKER_ENABLED || billingTimer) return
  const tick = async () => {
    if (billingRunning) return
    billingRunning = true
    try {
      await runBillingMaintenance()
    } catch (error) {
      console.error('[billing] maintenance failed', error)
    } finally {
      billingRunning = false
    }
  }
  billingTimer = setInterval(tick, env.BILLING_INTERVAL_MINUTES * 60 * 1000)
  setTimeout(tick, 20_000)
}

async function syncOverdueSuspensions(tenantId: string, graceDays: number, today: string) {
  const cutoff = new Date(`${today}T12:00:00`)
  cutoff.setDate(cutoff.getDate() - Math.max(0, graceDays))
  const cutoffDate = localDate(cutoff.getFullYear(), cutoff.getMonth(), cutoff.getDate())
  const { data: overdue, error } = await adminSupabase
    .from('payments')
    .select('player_id')
    .eq('tenant_id', tenantId)
    .eq('status', 'ATRASADO')
    .lte('due_date', cutoffDate)
    .not('player_id', 'is', null)
  if (error) throw error
  const overduePlayerIds = [...new Set((overdue ?? []).map((payment) => payment.player_id).filter(Boolean))]
  if (overduePlayerIds.length) {
    await adminSupabase
      .from('players')
      .update({
        status: 'SUSPENSO',
        suspension_reason: 'Inadimplencia automatica - pagamento vencido',
        suspended_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('type', 'MENSALISTA')
      .in('id', overduePlayerIds)
      .neq('status', 'SUSPENSO')
  }

  const { data: autoSuspended, error: suspendedError } = await adminSupabase
    .from('players')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('status', 'SUSPENSO')
    .ilike('suspension_reason', 'Inadimplencia automatica%')
  if (suspendedError) throw suspendedError
  for (const player of autoSuspended ?? []) {
    await releasePlayerAfterPayment(tenantId, player.id)
  }
}

async function sendPaymentReminders(tenantId: string, today: string) {
  const { data, error } = await adminSupabase
    .from('payments')
    .select('id, player_id, amount, due_date, status, checkout_url, pix_code, player:players(name, whatsapp)')
    .eq('tenant_id', tenantId)
    .in('status', ['PENDENTE', 'ATRASADO'])
    .lte('due_date', today)
  if (error) throw error

  for (const row of data ?? []) {
    const payment = row as unknown as {
      id: string
      player_id: string | null
      amount: number
      due_date: string
      status: string
      checkout_url: string | null
      pix_code: string | null
      player: { name: string; whatsapp: string | null } | null
    }
    if (!payment.player_id || !payment.player?.whatsapp) continue
    const reminderKey = `${payment.id}:${today}`
    const { count, error: logError } = await adminSupabase
      .from('message_logs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .contains('metadata', { billing_reminder_key: reminderKey })
    if (logError) throw logError
    if ((count ?? 0) > 0) continue

    const paymentLine = payment.checkout_url
      ? `Pague por aqui: ${payment.checkout_url}`
      : payment.pix_code
        ? `PIX copia e cola: ${payment.pix_code}`
        : 'Fale com o organizador para receber a chave PIX.'
    await sendWhatsAppMessage({
      tenant_id: tenantId,
      player_id: payment.player_id,
      phone: payment.player.whatsapp,
      type: 'COBRANCA',
      template: null,
      message: [
        'Agenda Sport - lembrete de pagamento',
        '',
        `Ola, ${payment.player.name.split(' ')[0]}!`,
        `Sua cobranca de ${formatCurrency(Number(payment.amount))} esta ${payment.status === 'ATRASADO' ? 'atrasada' : 'pendente'}.`,
        `Vencimento: ${formatDate(payment.due_date)}`,
        paymentLine,
      ].join('\n'),
      metadata: {
        source: 'automatic_billing_reminder',
        payment_id: payment.id,
        billing_reminder_key: reminderKey,
        template_parameters: [
          payment.player.name.split(' ')[0],
          payment.status === 'ATRASADO' ? 'Cobranca atrasada' : 'Cobranca pendente',
          formatCurrency(Number(payment.amount)),
          formatDate(payment.due_date),
          payment.checkout_url || payment.pix_code || 'Consulte o organizador',
        ],
      },
    })
  }
}

async function createAsaasCharge(input: {
  name: string
  email: string | null
  phone: string | null
  amount: number
  dueDate: string
  description: string
  externalReference: string
}) {
  if (!env.ASAAS_API_KEY) throw new Error('Asaas selecionado, mas ASAAS_API_KEY nao esta configurada no servidor.')
  const headers = {
    'Content-Type': 'application/json',
    access_token: env.ASAAS_API_KEY,
    'User-Agent': 'AgendaSport/1.0',
  }
  const phone = digits(input.phone)
  const existingPaymentResponse = await fetch(
    `${env.ASAAS_API_URL}/payments?externalReference=${encodeURIComponent(input.externalReference)}&limit=1`,
    { headers },
  )
  const existingPaymentPayload = await parseProviderResponse(existingPaymentResponse, 'consultar cobranca no Asaas')
  const existingPayment = existingPaymentPayload.data?.[0]
  if (existingPayment?.id) {
    const existingPix = await getAsaasPixCode(String(existingPayment.id), headers)
    return {
      providerPaymentId: String(existingPayment.id),
      checkoutUrl: existingPayment.invoiceUrl ?? null,
      pixCode: existingPix,
    }
  }

  const customerExternalReference = input.externalReference.split(':').filter(Boolean).slice(-1)[0] || input.externalReference
  const customerSearch = await fetch(
    `${env.ASAAS_API_URL}/customers?externalReference=${encodeURIComponent(customerExternalReference)}&limit=1`,
    { headers },
  )
  const customerSearchPayload = await parseProviderResponse(customerSearch, 'consultar cliente no Asaas')
  let customerId: string | null = customerSearchPayload.data?.[0]?.id ?? null
  if (phone) {
    const search = customerId
      ? null
      : await fetch(`${env.ASAAS_API_URL}/customers?mobilePhone=${encodeURIComponent(phone)}&limit=1`, { headers })
    if (search) {
      const searchPayload = await parseProviderResponse(search, 'consultar cliente no Asaas')
      customerId = searchPayload.data?.[0]?.id ?? null
    }
  }
  if (!customerId) {
    const customerResponse = await fetch(`${env.ASAAS_API_URL}/customers`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: input.name,
        email: input.email || undefined,
        mobilePhone: phone || undefined,
        externalReference: customerExternalReference,
      }),
    })
    const customer = await parseProviderResponse(customerResponse, 'criar cliente no Asaas')
    customerId = customer.id
  }
  const paymentResponse = await fetch(`${env.ASAAS_API_URL}/payments`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      customer: customerId,
      billingType: 'PIX',
      value: input.amount,
      dueDate: input.dueDate,
      description: input.description,
      externalReference: input.externalReference,
    }),
  })
  const payment = await parseProviderResponse(paymentResponse, 'criar cobranca no Asaas')
  const pixCode = await getAsaasPixCode(String(payment.id), headers)
  return {
    providerPaymentId: String(payment.id),
    checkoutUrl: payment.invoiceUrl ?? null,
    pixCode,
  }
}

async function createMercadoPagoCharge(input: {
  email: string
  amount: number
  dueDate: string
  description: string
  externalReference: string
}) {
  if (!env.MERCADO_PAGO_ACCESS_TOKEN) {
    throw new Error('Mercado Pago selecionado, mas MERCADO_PAGO_ACCESS_TOKEN nao esta configurado no servidor.')
  }
  const response = await fetch(`${env.MERCADO_PAGO_API_URL}/v1/payments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.MERCADO_PAGO_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': createHash('sha256').update(input.externalReference).digest('hex'),
    },
    body: JSON.stringify({
      transaction_amount: input.amount,
      description: input.description,
      payment_method_id: 'pix',
      external_reference: input.externalReference,
      date_of_expiration: `${input.dueDate}T23:59:59.000-03:00`,
      payer: { email: input.email },
      notification_url: env.PUBLIC_API_URL
        ? `${env.PUBLIC_API_URL.replace(/\/$/, '')}/api/webhooks/payments/mercado-pago`
        : undefined,
    }),
  })
  const payment = await parseProviderResponse(response, 'criar cobranca no Mercado Pago')
  const transactionData = payment.point_of_interaction?.transaction_data
  return {
    providerPaymentId: String(payment.id),
    checkoutUrl: transactionData?.ticket_url ?? null,
    pixCode: transactionData?.qr_code ?? null,
  }
}

async function getAsaasPixCode(paymentId: string, headers: Record<string, string>) {
  try {
    const response = await fetch(`${env.ASAAS_API_URL}/payments/${encodeURIComponent(paymentId)}/pixQrCode`, { headers })
    const payload = await parseProviderResponse(response, 'obter PIX copia e cola no Asaas')
    return typeof payload.payload === 'string' ? payload.payload : null
  } catch (error) {
    console.warn('[billing:asaas] charge created without PIX copy-and-paste code', {
      paymentId,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

async function deliverPaymentMessage(input: {
  tenantId: string
  paymentId: string
  matchId: string | null
  playerId: string
  playerName: string
  phone: string
  description: string
  provider: BillingProvider
  amount: number
  dueDate: string
  checkoutUrl: string | null
  pixCode: string | null
  source: string
}) {
  const paymentLine = input.checkoutUrl
    ? `Pague por aqui: ${input.checkoutUrl}`
    : input.pixCode
      ? `PIX copia e cola: ${input.pixCode}`
      : 'O pagamento esta pendente. Consulte o organizador para receber a chave PIX.'
  return sendWhatsAppMessage({
    tenant_id: input.tenantId,
    match_id: input.matchId,
    player_id: input.playerId,
    phone: input.phone,
    type: 'COBRANCA',
    template: null,
    message: [
      `Agenda Sport - ${input.description}`,
      '',
      `Ola, ${input.playerName.split(' ')[0]}!`,
      `Valor: ${formatCurrency(input.amount)}`,
      `Vencimento: ${formatDate(input.dueDate)}`,
      paymentLine,
    ].join('\n'),
    metadata: {
      source: input.source,
      payment_id: input.paymentId,
      provider: input.provider,
      template_parameters: [
        input.playerName.split(' ')[0],
        input.description,
        formatCurrency(input.amount),
        formatDate(input.dueDate),
        input.checkoutUrl || input.pixCode || 'Consulte o organizador',
      ],
    },
  })
}

async function parseProviderResponse(response: Response, action: string) {
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const description = payload.errors?.[0]?.description || payload.message || payload.error || response.statusText
    throw new Error(`Nao foi possivel ${action}: ${description}`)
  }
  return payload
}

function normalizeProvider(provider: string | null | undefined): BillingProvider {
  if (provider === 'ASAAS' || provider === 'MERCADO_PAGO') return provider
  return 'MANUAL_PIX'
}

function digits(value: string | null) {
  return (value ?? '').replace(/\D/g, '')
}

function localDate(year: number, month: number, day: number) {
  const date = new Date(year, month, day, 12, 0, 0)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function dateInSaoPaulo(date: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR')
}

function isMissingTableError(message: string, table: string) {
  return message.includes(table) && (message.includes('schema cache') || message.includes('does not exist') || message.includes('relation'))
}
