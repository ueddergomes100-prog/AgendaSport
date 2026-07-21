import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { env } from './env.js'
import { requireAuth, requireSuperAdmin } from './auth.js'
import {
  connectTenantAsaasAccount,
  createPaymentCharge,
  ensureCasualChargeForConfirmation,
  getTenantBillingProviderStatus,
  refreshTenantAsaasAccount,
  releasePlayerAfterPayment,
  runMonthlyBillingForTenant,
  sendPaymentChargeMessage,
  startBillingWorker,
  type AsaasSubaccountInput,
  type BillingProvider,
} from './billing.js'
import {
  getWaitlistPlayerIds,
  notifyGroupAttendanceUpdate,
  notifyPromotedWaitlistPlayers,
  sendConfiguredGroupMessage,
} from './group-notifications.js'
import { adminSupabase } from './supabase.js'
import { paymentWebhookRouter } from './payment-webhooks.js'
import { sendWhatsAppMessage } from './whatsapp.js'
import { whatsappWebhookRouter } from './whatsapp-webhook.js'
import {
  confirmationReminderStages,
  runConfirmationReminderJob,
  sendConfirmationForMatch,
  sendConfirmationForNewPlayer,
  startConfirmationReminderWorker,
} from './reminders.js'

const app = express()
type AuthUser = { id: string; tenant_id: string | null; role: string; permissions?: Record<string, boolean> | null }
type ModulePermission =
  | 'confirmations'
  | 'players'
  | 'draw'
  | 'stats'
  | 'results'
  | 'finance'
  | 'settings'
  | 'suspensions'
const corsOrigins = env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const clientDistPath = path.resolve(__dirname, '../../dist')
const clientIndexPath = path.join(clientDistPath, 'index.html')

type SignupCompanyInput = {
  name: string
  responsibleName: string
  email: string
}

type SignupCompany = {
  id: string
  name: string
}

app.use(helmet())
app.use(cors({ origin: corsOrigins.length > 1 ? corsOrigins : corsOrigins[0], credentials: true }))
app.use(express.json({ limit: '1mb' }))
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300 }))
const paymentAccountLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de conexao financeira. Aguarde e tente novamente.' },
})

const matchStatRowSchema = z.object({
  playerId: z.string().uuid(),
  goals: z.number().int().min(0).max(999),
  assists: z.number().int().min(0).max(999),
  present: z.boolean(),
  wins: z.number().int().min(0).max(999).optional().default(0),
  draws: z.number().int().min(0).max(999).optional().default(0),
  losses: z.number().int().min(0).max(999).optional().default(0),
})

const matchStatsSaveSchema = z.object({
  match: z.object({
    team_a_score: z.number().int().nullable(),
    team_b_score: z.number().int().nullable(),
    team_results: z.array(z.unknown()).optional(),
    game_results: z.array(z.unknown()).optional(),
    status: z.enum(['AGENDADA', 'ABERTA', 'ENCERRADA', 'CANCELADA']),
  }).optional(),
  rows: z.array(matchStatRowSchema).min(1).max(500),
})

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'Agenda Sport API' })
})

app.use('/api/webhooks', whatsappWebhookRouter)
app.use('/api/webhooks/payments', paymentWebhookRouter)

async function createSignupCompany(input: SignupCompanyInput): Promise<SignupCompany> {
  const currentSchemaPayload = {
    name: input.name,
    responsible_name: input.responsibleName,
    email: input.email,
    phone: null,
    whatsapp: null,
    city: null,
    state: null,
    plan_code: 'Starter',
    status: 'ATIVA',
  }

  const { data, error } = await adminSupabase
    .from('companies')
    .insert(currentSchemaPayload)
    .select('id, name')
    .single()

  if (!error && data) return data

  const legacySchemaPayload = {
    name: input.name,
    email: input.email,
    phone: null,
    plan: 'Starter',
    status: 'ATIVO',
  }

  const { data: legacyData, error: legacyError } = await adminSupabase
    .from('companies')
    .insert(legacySchemaPayload)
    .select('id, name')
    .single()

  if (legacyError) throw legacyError
  return legacyData
}

app.post('/api/onboarding/signup', async (req, res) => {
  const schema = z.object({
    full_name: z.string().min(2).max(120),
    email: z.string().email(),
    password: z.string().min(6).max(128),
  })
  const input = schema.parse(req.body)
  const companyName = `Agenda ${input.full_name}`.slice(0, 120)

  let companyId: string | null = null
  let userId: string | null = null

  try {
    const company = await createSignupCompany({
      name: companyName,
      responsibleName: input.full_name,
      email: input.email,
    })
    companyId = company.id

    const { data: created, error: createError } = await adminSupabase.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { full_name: input.full_name, company_name: company.name },
    })

    if (createError || !created.user) {
      throw new Error(createError?.message ?? 'Nao foi possivel criar o usuario.')
    }

    userId = created.user.id
    const { error: profileError } = await adminSupabase.from('profiles').upsert(
      {
        id: userId,
        tenant_id: companyId,
        full_name: input.full_name,
        role: 'ADMINISTRADOR',
      },
      { onConflict: 'id' },
    )

    if (profileError) throw profileError

    return res.status(201).json({
      user_id: userId,
      tenant_id: companyId,
      email: input.email,
      company_name: company.name,
    })
  } catch (error) {
    if (userId) await adminSupabase.auth.admin.deleteUser(userId).catch(() => null)
    if (companyId) {
      const { error: cleanupError } = await adminSupabase.from('companies').delete().eq('id', companyId)
      if (cleanupError) console.warn('Nao foi possivel limpar empresa apos falha no onboarding.', cleanupError)
    }
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Nao foi possivel criar o cadastro.' })
  }
})

function normalizeWhatsApp(value: string) {
  const digits = value.replace(/\D/g, '')
  if (digits.length < 10) return ''
  const local = digits.startsWith('55') ? digits.slice(2) : digits
  if (local.length === 11 && local[2] === '9') return `${local.slice(0, 2)}${local.slice(3)}`
  return local
}

async function getPublicRegistrationConfirmationStage(tenantId: string) {
  const { data, error } = await adminSupabase
    .from('confirmation_schedules')
    .select('stage_number, enabled')
    .eq('tenant_id', tenantId)
    .eq('enabled', true)
    .order('stage_number', { ascending: true })

  if (error && isMissingConfirmationSchedulesError(error.message)) return 2
  if (error) throw error

  const rows = data ?? []
  const selectedStage = Number(rows.find((row) => row.stage_number === 2)?.stage_number ?? rows[0]?.stage_number ?? 2)
  if (!Number.isFinite(selectedStage)) return 2
  return Math.max(1, Math.min(5, Math.trunc(selectedStage)))
}

app.post('/api/public-registration/:token/players', async (req, res) => {
  const paramsSchema = z.object({ token: z.string().uuid() })
  const bodySchema = z.object({
    first_name: z.string().trim().min(2, 'Informe seu nome.').max(80),
    last_name: z.string().trim().min(2, 'Informe seu sobrenome.').max(120),
    whatsapp: z.string().min(8),
    position_kind: z.enum(['GOLEIRO', 'LINHA']).default('LINHA'),
  })

  try {
    const { token } = paramsSchema.parse(req.params)
    const input = bodySchema.parse(req.body)
    const normalized = normalizeWhatsApp(input.whatsapp)
    if (!normalized) return res.status(400).json({ error: 'Informe um WhatsApp valido com DDD.' })

    const { data: company, error: companyError } = await adminSupabase
      .from('companies')
      .select('id, name, status, registration_enabled')
      .eq('registration_token', token)
      .single()

    if (companyError || !company || !company.registration_enabled || ['BLOQUEADA', 'CANCELADA'].includes(company.status)) {
      return res.status(404).json({ error: 'Link de inscricao invalido ou indisponivel.' })
    }

    const { data: existingPlayers, error: existingError } = await adminSupabase
      .from('players')
      .select('id, whatsapp, whatsapp_normalized')
      .eq('tenant_id', company.id)
    let existingRows: Array<{ id: string; whatsapp: string | null; whatsapp_normalized?: string | null }> | null = existingPlayers
    if (existingError && isMissingColumnError(existingError.message, 'whatsapp_normalized')) {
      const { data: legacyExistingPlayers, error: legacyExistingError } = await adminSupabase
        .from('players')
        .select('id, whatsapp')
        .eq('tenant_id', company.id)
      if (legacyExistingError) throw legacyExistingError
      existingRows = legacyExistingPlayers
    } else if (existingError) {
      throw existingError
    }

    const exists = (existingRows ?? []).some((player) => (player.whatsapp_normalized || normalizeWhatsApp(player.whatsapp ?? '')) === normalized)
    if (exists) {
      return res.status(409).json({ error: 'Este WhatsApp ja esta cadastrado nesta empresa. Se precisar alterar seus dados, fale com o organizador.' })
    }

    const firstName = input.first_name.trim()
    const lastName = input.last_name.trim()
    const fullName = `${firstName} ${lastName}`
    const position = input.position_kind === 'GOLEIRO' ? 'Goleiro' : 'Meio Campo'
    const confirmationStage = await getPublicRegistrationConfirmationStage(company.id)
    const basePlayerPayload = {
      tenant_id: company.id,
      first_name: firstName,
      last_name: lastName,
      name: fullName,
      whatsapp: input.whatsapp.replace(/\D/g, ''),
      whatsapp_normalized: normalized,
      status: 'ATIVO',
      type: 'AVULSO',
      technical_score: 5,
      primary_position: position,
      confirmation_stage: confirmationStage,
      notes: input.position_kind === 'GOLEIRO' ? 'Autoinscricao: goleiro' : 'Autoinscricao: jogador de linha',
    }

    const player = await insertPublicPlayer(basePlayerPayload)
    if (!player) throw new Error('Nao foi possivel criar o participante.')

    const message = [
      'Agenda Sport',
      '',
      'Cadastro concluido com sucesso!',
      `Ola, ${firstName}. Voce entrou na lista da ${company.name}.`,
      '',
      'Quando houver um evento, voce recebera a convocacao por este WhatsApp.',
    ].join('\n')

    const whatsappResult = await sendWhatsAppMessage({
      tenant_id: company.id,
      player_id: player.id,
      phone: player.whatsapp,
      type: 'LEMBRETE',
      template: null,
      message,
      metadata: { source: 'public_registration_success' },
    }).catch((error) => ({ status: 'FAILED', response: error instanceof Error ? error.message : 'Falha ao enviar WhatsApp de cadastro.' }))

    const confirmationSummaries = await sendConfirmationForNewPlayer(company.id, player.id).catch((error) => {
      console.warn('Nao foi possivel convocar automaticamente o novo participante.', error)
      return []
    })

    return res.status(201).json({
      player_id: player.id,
      name: player.name,
      company: company.name,
      whatsapp_status: whatsappResult.status,
      automatic_confirmations_sent: confirmationSummaries.reduce((total, summary) => total + summary.remindersSent, 0),
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message ?? 'Dados invalidos.' })
    }
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Nao foi possivel concluir sua inscricao.' })
  }
})

async function insertPublicPlayer(basePayload: Record<string, unknown>) {
  const optionalColumns = ['confirmation_stage', 'whatsapp_normalized', 'first_name', 'last_name'] as const
  const payload = { ...basePayload }

  for (let attempt = 0; attempt <= optionalColumns.length; attempt += 1) {
    const { data, error } = await adminSupabase
      .from('players')
      .insert(payload)
      .select('id, name, whatsapp')
      .single()

    if (!error) return data

    const missingColumn = optionalColumns.find((column) => column in payload && isMissingColumnError(error.message, column))
    if (!missingColumn) throw error
    delete payload[missingColumn]
  }

  throw new Error('Nao foi possivel criar o participante.')
}

function requireRequestTenantId(user: AuthUser) {
  if (user.tenant_id) return user.tenant_id
  if (user.role === 'SUPER_ADMIN') {
    throw new Error('Super Admin gerencia empresas. Entre com o admin da empresa para executar operacoes.')
  }
  throw new Error('Usuario sem tenant.')
}

app.get('/api/dashboard', requireAuth, async (req, res) => {
  let tenantId: string
  try {
    tenantId = requireRequestTenantId(req.user!)
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Usuario sem tenant.' })
  }
  const { data, error } = await adminSupabase.rpc('get_dashboard_stats_for_tenant', { p_tenant_id: tenantId })
  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

app.post('/api/messages/whatsapp', requireAuth, async (req, res) => {
  const schema = z.object({
    phone: z.string().min(8),
    type: z.enum(['CONFIRMACAO', 'COBRANCA', 'LISTA_ESPERA', 'LEMBRETE']),
    message: z.string().min(1).max(1600),
  })
  const input = schema.parse(req.body)
  let tenantId: string
  try {
    tenantId = requireRequestTenantId(req.user!)
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Usuario sem tenant.' })
  }
  const requiredModule = input.type === 'COBRANCA' ? 'finance' : 'confirmations'
  if (!canAccessModule(req.user!, requiredModule)) {
    return res.status(403).json({ error: 'Voce nao tem permissao para enviar esta mensagem.' })
  }
  const result = await sendWhatsAppMessage({ tenant_id: tenantId, phone: input.phone, type: input.type, message: input.message })
  return res.json(result)
})

app.get('/api/reminders/confirmation/status', requireAuth, (req, res) => {
  if (!canAccessModule(req.user!, 'confirmations')) return res.status(403).json({ error: 'Voce nao tem permissao para acessar convocacoes.' })
  return res.json({
    enabled: env.REMINDER_WORKER_ENABLED,
    interval_minutes: env.REMINDER_INTERVAL_MINUTES,
    stages: confirmationReminderStages,
  })
})

app.post('/api/reminders/confirmation/run', requireAuth, async (req, res) => {
  const tenantId = req.user!.role === 'SUPER_ADMIN' ? null : req.user!.tenant_id
  if (req.user!.role !== 'SUPER_ADMIN' && !tenantId) return res.status(400).json({ error: 'Usuario sem tenant.' })
  if (!canAccessModule(req.user!, 'confirmations')) return res.status(403).json({ error: 'Voce nao tem permissao para executar convocacoes.' })

  const summary = await runConfirmationReminderJob({ tenantId })
  return res.json(summary)
})

app.post('/api/matches/:matchId/confirmations/send', requireAuth, async (req, res) => {
  const paramsSchema = z.object({ matchId: z.string().uuid() })
  const { matchId } = paramsSchema.parse(req.params)
  const tenantId = req.user!.role === 'SUPER_ADMIN' ? null : req.user!.tenant_id
  if (req.user!.role !== 'SUPER_ADMIN' && !tenantId) return res.status(400).json({ error: 'Usuario sem tenant.' })
  if (!canAccessModule(req.user!, 'confirmations')) return res.status(403).json({ error: 'Voce nao tem permissao para enviar convocacoes.' })

  try {
    const summary = await sendConfirmationForMatch(matchId, tenantId)
    return res.json(summary)
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Nao foi possivel enviar a convocacao.' })
  }
})

app.put('/api/matches/:matchId/stats', requireAuth, async (req, res) => {
  const { matchId } = z.object({ matchId: z.string().uuid() }).parse(req.params)
  const input = matchStatsSaveSchema.parse(req.body)
  const tenantId = req.user!.role === 'SUPER_ADMIN' ? null : req.user!.tenant_id
  if (req.user!.role !== 'SUPER_ADMIN' && !tenantId) return res.status(400).json({ error: 'Usuario sem tenant.' })
  if (!canAccessModule(req.user!, 'results')) return res.status(403).json({ error: 'Voce nao tem permissao para salvar a sumula.' })

  let matchQuery = adminSupabase.from('matches').select('id, tenant_id').eq('id', matchId)
  if (tenantId) matchQuery = matchQuery.eq('tenant_id', tenantId)
  const { data: match, error: matchError } = await matchQuery.maybeSingle()
  if (matchError) return res.status(500).json({ error: matchError.message })
  if (!match) return res.status(404).json({ error: 'Evento nao encontrado.' })

  const playerIds = [...new Set(input.rows.map((row) => row.playerId))]
  const { data: players, error: playersError } = await adminSupabase
    .from('players')
    .select('id')
    .eq('tenant_id', match.tenant_id)
    .in('id', playerIds)
  if (playersError) return res.status(500).json({ error: playersError.message })
  if ((players ?? []).length !== playerIds.length) return res.status(400).json({ error: 'A sumula contem participante invalido para esta empresa.' })

  const statPayload = input.rows.map((row) => ({
    tenant_id: match.tenant_id,
    match_id: matchId,
    player_id: row.playerId,
    goals: row.goals,
    assists: row.assists,
    present: row.present,
    wins: row.wins,
    draws: row.draws,
    losses: row.losses,
  }))
  const { error: statsError } = await adminSupabase.from('match_player_stats').upsert(statPayload, { onConflict: 'match_id,player_id' })
  if (statsError) return res.status(500).json({ error: statsError.message })

  if (input.match) {
    const { error: updateError } = await adminSupabase.from('matches').update(input.match).eq('id', matchId).eq('tenant_id', match.tenant_id)
    if (updateError) return res.status(500).json({ error: updateError.message })
  }

  return res.json({ saved: input.rows.length, status: input.match?.status ?? null })
})

app.put('/api/matches/:matchId/attendance/:playerId', requireAuth, async (req, res) => {
  const paramsSchema = z.object({
    matchId: z.string().uuid(),
    playerId: z.string().uuid(),
  })
  const bodySchema = z.object({
    status: z.enum(['CONVIDADO', 'CONFIRMADO', 'RECUSOU', 'ESPERA', 'COMPARECEU', 'FALTOU']),
  })
  const { matchId, playerId } = paramsSchema.parse(req.params)
  const { status } = bodySchema.parse(req.body)
  const tenantId = req.user!.role === 'SUPER_ADMIN' ? null : req.user!.tenant_id
  if (req.user!.role !== 'SUPER_ADMIN' && !tenantId) return res.status(400).json({ error: 'Usuario sem tenant.' })

  const requiredPermission: ModulePermission = ['COMPARECEU', 'FALTOU'].includes(status) ? 'results' : 'confirmations'
  if (!canAccessModule(req.user!, requiredPermission)) {
    return res.status(403).json({ error: 'Voce nao tem permissao para alterar esta informacao.' })
  }

  let matchQuery = adminSupabase.from('matches').select('id, tenant_id, status').eq('id', matchId)
  if (tenantId) matchQuery = matchQuery.eq('tenant_id', tenantId)
  const { data: match, error: matchError } = await matchQuery.maybeSingle()
  if (matchError) return res.status(500).json({ error: matchError.message })
  if (!match) return res.status(404).json({ error: 'Evento nao encontrado.' })
  if (['ENCERRADA', 'CANCELADA'].includes(match.status) && !['COMPARECEU', 'FALTOU'].includes(status)) {
    return res.status(409).json({ error: 'Evento encerrado ou cancelado nao aceita novas respostas.' })
  }

  const waitlistBefore = await getWaitlistPlayerIds(matchId)
  let rpcResult = await adminSupabase.rpc('set_attendance_response', {
    p_match_id: matchId,
    p_player_id: playerId,
    p_status: status,
    p_source: 'MANUAL',
    p_responded_by: req.user!.id,
  })
  if (rpcResult.error && rpcResult.error.message.includes('Could not find the function')) {
    rpcResult = await adminSupabase.rpc('set_attendance_response', {
      p_match_id: matchId,
      p_player_id: playerId,
      p_status: status,
    })
  }
  if (rpcResult.error) return res.status(400).json({ error: rpcResult.error.message })

  const { data: attendance, error: attendanceError } = await adminSupabase
    .from('attendance')
    .select('*')
    .eq('match_id', matchId)
    .eq('player_id', playerId)
    .single()
  if (attendanceError) return res.status(500).json({ error: attendanceError.message })

  await notifyPromotedWaitlistPlayers(matchId, waitlistBefore).catch((error) => {
    console.warn('Nao foi possivel avisar o participante promovido da fila.', error)
  })
  if (status !== 'CONVIDADO') {
    await notifyGroupAttendanceUpdate({
      tenantId: match.tenant_id,
      matchId,
      playerId,
      status: attendance.status,
    }).catch((error) => {
      console.warn('Nao foi possivel atualizar o grupo configurado.', error)
    })
  }

  let chargeStatus = 'SKIPPED'
  if (attendance.status === 'CONFIRMADO') {
    try {
      chargeStatus = await ensureCasualChargeForConfirmation(match.tenant_id, matchId, playerId)
    } catch (error) {
      chargeStatus = `FAILED: ${error instanceof Error ? error.message : 'Falha ao gerar cobranca'}`
      console.error('[billing] manual confirmation charge failed', error)
    }
  }

  return res.json({ ...attendance, charge_status: chargeStatus })
})

app.post('/api/matches/:matchId/group/share', requireAuth, async (req, res) => {
  const paramsSchema = z.object({ matchId: z.string().uuid() })
  const bodySchema = z.object({
    kind: z.enum(['DRAW', 'LIST', 'REPORT']),
    message: z.string().min(1).max(4000),
  })
  const { matchId } = paramsSchema.parse(req.params)
  const input = bodySchema.parse(req.body)
  const tenantId = req.user!.role === 'SUPER_ADMIN' ? null : req.user!.tenant_id
  if (req.user!.role !== 'SUPER_ADMIN' && !tenantId) return res.status(400).json({ error: 'Usuario sem tenant.' })

  const hasPermission = input.kind === 'DRAW'
    ? canAccessModule(req.user!, 'draw')
    : input.kind === 'REPORT'
      ? canAccessModule(req.user!, 'stats') || canAccessModule(req.user!, 'results')
      : canAccessModule(req.user!, 'confirmations')
  if (!hasPermission) {
    return res.status(403).json({ error: 'Voce nao tem permissao para compartilhar esta informacao.' })
  }

  let matchQuery = adminSupabase.from('matches').select('id, tenant_id').eq('id', matchId)
  if (tenantId) matchQuery = matchQuery.eq('tenant_id', tenantId)
  const { data: match, error: matchError } = await matchQuery.maybeSingle()
  if (matchError) return res.status(500).json({ error: matchError.message })
  if (!match) return res.status(404).json({ error: 'Evento nao encontrado.' })

  try {
    const result = await sendConfiguredGroupMessage(match.tenant_id, input.message, {
      event: input.kind.toLowerCase(),
      match_id: matchId,
      requested_by: req.user!.id,
    })
    return res.json(result)
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : 'Nao foi possivel enviar ao grupo.' })
  }
})

app.post('/api/admin/companies/:companyId/admin-user', requireAuth, requireSuperAdmin, async (req, res) => {
  const paramsSchema = z.object({ companyId: z.string().uuid() })
  const bodySchema = z.object({
    full_name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(6),
    role: z.enum(['ADMINISTRADOR', 'ORGANIZADOR', 'OPERADOR']).default('ADMINISTRADOR'),
  })
  const { companyId } = paramsSchema.parse(req.params)
  const input = bodySchema.parse(req.body)

  const { data: company, error: companyError } = await adminSupabase.from('companies').select('id, name').eq('id', companyId).single()
  if (companyError || !company) return res.status(404).json({ error: 'Empresa nao encontrada.' })

  const { data: created, error: createError } = await adminSupabase.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.full_name, company_name: company.name },
  })

  if (createError || !created.user) {
    return res.status(400).json({ error: createError?.message ?? 'Nao foi possivel criar o usuario.' })
  }

  const { error: profileError } = await adminSupabase.from('profiles').upsert(
    {
      id: created.user.id,
      tenant_id: companyId,
      full_name: input.full_name,
      role: input.role,
    },
    { onConflict: 'id' },
  )

  if (profileError) return res.status(500).json({ error: profileError.message })

  return res.status(201).json({
    user_id: created.user.id,
    email: created.user.email,
    role: input.role,
    tenant_id: companyId,
  })
})

const teamPermissionsSchema = z.object({
  confirmations: z.boolean().default(false),
  players: z.boolean().default(false),
  draw: z.boolean().default(false),
  stats: z.boolean().default(false),
  results: z.boolean().default(false),
  finance: z.boolean().default(false),
  settings: z.boolean().default(false),
  suspensions: z.boolean().default(false),
})

const fullTeamPermissions = {
  confirmations: true,
  players: true,
  draw: true,
  stats: true,
  results: true,
  finance: true,
  settings: true,
  suspensions: true,
}

function canManageTeamUsers(user: AuthUser) {
  return user.role === 'SUPER_ADMIN' || user.role === 'ADMINISTRADOR'
}

function canAccessModule(user: AuthUser, module: ModulePermission) {
  if (user.role === 'SUPER_ADMIN' || user.role === 'ADMINISTRADOR') return true
  const permissions = user.permissions ?? {}
  const hasExplicitPermissionSet = Object.keys(permissions).length > 0
  if (!hasExplicitPermissionSet) return module === 'confirmations' || module === 'stats'
  return Boolean(permissions[module])
}

function normalizeTeamPermissions(value: unknown) {
  const parsed = teamPermissionsSchema.safeParse(value ?? {})
  if (!parsed.success) return teamPermissionsSchema.parse({})
  return parsed.data
}

app.get('/api/company/users', requireAuth, async (req, res) => {
  let tenantId: string
  try {
    tenantId = requireRequestTenantId(req.user!)
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Usuario sem tenant.' })
  }

  if (!canManageTeamUsers(req.user!)) return res.status(403).json({ error: 'Acesso restrito ao administrador da empresa.' })

  const { data, error } = await adminSupabase
    .from('profiles')
    .select('id, full_name, role, phone, permissions, created_at')
    .eq('tenant_id', tenantId)
    .in('role', ['ADMINISTRADOR', 'ORGANIZADOR', 'OPERADOR'])
    .order('created_at', { ascending: true })

  let rows = data
  if (error && isMissingColumnError(error.message, 'permissions')) {
    const { data: legacyRows, error: legacyError } = await adminSupabase
      .from('profiles')
      .select('id, full_name, role, phone, created_at')
      .eq('tenant_id', tenantId)
      .in('role', ['ADMINISTRADOR', 'ORGANIZADOR', 'OPERADOR'])
      .order('created_at', { ascending: true })
    if (legacyError) return res.status(500).json({ error: legacyError.message })
    rows = legacyRows?.map((row) => ({ ...row, permissions: {} }))
  } else if (error) {
    return res.status(500).json({ error: error.message })
  }

  const users = await Promise.all((rows ?? []).map(async (profile) => {
    const authResult = await adminSupabase.auth.admin.getUserById(profile.id).catch(() => null)
    return {
      id: profile.id,
      full_name: profile.full_name,
      role: profile.role,
      phone: profile.phone,
      created_at: profile.created_at,
      permissions: normalizeTeamPermissions(profile.permissions),
      email: authResult?.data?.user?.email ?? null,
    }
  }))

  return res.json(users)
})

app.post('/api/company/users', requireAuth, async (req, res) => {
  let tenantId: string
  try {
    tenantId = requireRequestTenantId(req.user!)
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Usuario sem tenant.' })
  }

  if (!canManageTeamUsers(req.user!)) return res.status(403).json({ error: 'Acesso restrito ao administrador da empresa.' })

  const bodySchema = z.object({
    full_name: z.string().min(2).max(120),
    email: z.string().email(),
    password: z.string().min(6).max(128),
    role: z.enum(['ADMINISTRADOR', 'ORGANIZADOR', 'OPERADOR']).default('OPERADOR'),
    permissions: teamPermissionsSchema.default({
      confirmations: true,
      players: false,
      draw: false,
      stats: false,
      results: false,
      finance: false,
      settings: false,
      suspensions: false,
    }),
  })
  const input = bodySchema.parse(req.body)

  const { data: company } = await adminSupabase.from('companies').select('name').eq('id', tenantId).single()
  const { data: created, error: createError } = await adminSupabase.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.full_name, company_name: company?.name ?? 'Agenda Sport' },
  })

  if (createError || !created.user) {
    return res.status(400).json({ error: createError?.message ?? 'Nao foi possivel criar o usuario.' })
  }

  const profilePayload = {
    id: created.user.id,
    tenant_id: tenantId,
    full_name: input.full_name,
    role: input.role,
    permissions: input.role === 'ADMINISTRADOR' ? fullTeamPermissions : input.permissions,
  }
  const { error: profileError } = await adminSupabase.from('profiles').upsert(profilePayload, { onConflict: 'id' })

  if (profileError && isMissingColumnError(profileError.message, 'permissions')) {
    await adminSupabase.auth.admin.deleteUser(created.user.id).catch(() => null)
    return res.status(500).json({ error: 'A coluna de permissoes ainda nao existe no Supabase. Rode o patch SQL de producao e tente novamente.' })
  }

  if (profileError) {
    await adminSupabase.auth.admin.deleteUser(created.user.id).catch(() => null)
    return res.status(500).json({ error: profileError.message })
  }

  return res.status(201).json({
    id: created.user.id,
    full_name: input.full_name,
    email: created.user.email,
    role: input.role,
    permissions: profilePayload.permissions,
    tenant_id: tenantId,
  })
})

app.patch('/api/company/users/:userId', requireAuth, async (req, res) => {
  let tenantId: string
  try {
    tenantId = requireRequestTenantId(req.user!)
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Usuario sem tenant.' })
  }

  if (!canManageTeamUsers(req.user!)) return res.status(403).json({ error: 'Acesso restrito ao administrador da empresa.' })

  const paramsSchema = z.object({ userId: z.string().uuid() })
  const bodySchema = z.object({
    full_name: z.string().min(2).max(120).optional(),
    role: z.enum(['ADMINISTRADOR', 'ORGANIZADOR', 'OPERADOR']).optional(),
    permissions: teamPermissionsSchema.optional(),
  })
  const { userId } = paramsSchema.parse(req.params)
  const input = bodySchema.parse(req.body)

  const { data: existing, error: existingError } = await adminSupabase
    .from('profiles')
    .select('id, tenant_id, role')
    .eq('id', userId)
    .eq('tenant_id', tenantId)
    .single()
  if (existingError || !existing) return res.status(404).json({ error: 'Usuario nao encontrado nesta empresa.' })

  const nextRole = input.role ?? existing.role
  const patch = {
    ...(input.full_name ? { full_name: input.full_name } : {}),
    ...(input.role ? { role: input.role } : {}),
    ...(input.permissions ? { permissions: nextRole === 'ADMINISTRADOR' ? fullTeamPermissions : input.permissions } : {}),
  }

  const { error } = await adminSupabase.from('profiles').update(patch).eq('id', userId).eq('tenant_id', tenantId)
  if (error && isMissingColumnError(error.message, 'permissions')) {
    return res.status(500).json({ error: 'A coluna de permissoes ainda nao existe no Supabase. Rode o patch SQL de producao e tente novamente.' })
  }

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  return res.json({ id: userId, ...patch })
})

app.get('/api/finance/transactions', requireAuth, async (req, res) => {
  let tenantId: string
  try {
    tenantId = requireRequestTenantId(req.user!)
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Usuario sem tenant.' })
  }

  if (!canAccessModule(req.user!, 'finance')) return res.status(403).json({ error: 'Voce nao tem permissao para acessar o financeiro.' })

  const { data, error } = await adminSupabase
    .from('finance_transactions')
    .select('*, player:players(id, name), responsible:profiles(full_name)')
    .eq('tenant_id', tenantId)
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })

  if (error && isMissingFinanceTransactionsError(error.message)) {
    return res.status(500).json({ error: 'A tabela de movimentacoes financeiras ainda nao existe no Supabase. Rode o patch SQL de producao e tente novamente.' })
  }
  if (error) return res.status(500).json({ error: error.message })

  return res.json(data ?? [])
})

app.post('/api/finance/transactions', requireAuth, async (req, res) => {
  let tenantId: string
  try {
    tenantId = requireRequestTenantId(req.user!)
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Usuario sem tenant.' })
  }

  if (!canAccessModule(req.user!, 'finance')) return res.status(403).json({ error: 'Voce nao tem permissao para lancar movimentacoes financeiras.' })

  const schema = z.object({
    player_id: z.string().uuid().nullable().optional(),
    match_id: z.string().uuid().nullable().optional(),
    payment_id: z.string().uuid().nullable().optional(),
    kind: z.enum(['RECEITA', 'DESPESA']),
    category: z.string().min(1).max(80),
    description: z.string().min(3).max(300),
    amount: z.coerce.number().positive(),
    occurred_on: z.string().min(10).max(10),
    status: z.enum(['CONFIRMADO', 'PENDENTE', 'CANCELADO']).default('CONFIRMADO'),
    payment_method: z.string().min(2).max(40).default('OUTRO'),
  })
  const input = schema.parse(req.body)

  const { data, error } = await adminSupabase
    .from('finance_transactions')
    .insert({ ...input, tenant_id: tenantId, created_by: req.user!.id })
    .select('*, player:players(id, name), responsible:profiles(full_name)')
    .single()

  if (error && isMissingFinanceTransactionsError(error.message)) {
    return res.status(500).json({ error: 'A tabela de movimentacoes financeiras ainda nao existe no Supabase. Rode o patch SQL de producao e tente novamente.' })
  }
  if (error) return res.status(500).json({ error: error.message })

  return res.status(201).json(data)
})

app.patch('/api/finance/transactions/:transactionId', requireAuth, async (req, res) => {
  let tenantId: string
  try {
    tenantId = requireRequestTenantId(req.user!)
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Usuario sem tenant.' })
  }

  if (!canAccessModule(req.user!, 'finance')) return res.status(403).json({ error: 'Voce nao tem permissao para alterar o financeiro.' })

  const paramsSchema = z.object({ transactionId: z.string().uuid() })
  const schema = z.object({
    player_id: z.string().uuid().nullable().optional(),
    match_id: z.string().uuid().nullable().optional(),
    payment_id: z.string().uuid().nullable().optional(),
    kind: z.enum(['RECEITA', 'DESPESA']).optional(),
    category: z.string().min(1).max(80).optional(),
    description: z.string().min(3).max(300).optional(),
    amount: z.coerce.number().positive().optional(),
    occurred_on: z.string().min(10).max(10).optional(),
    status: z.enum(['CONFIRMADO', 'PENDENTE', 'CANCELADO']).optional(),
    payment_method: z.string().min(2).max(40).optional(),
  })
  const { transactionId } = paramsSchema.parse(req.params)
  const input = schema.parse(req.body)

  const { error } = await adminSupabase
    .from('finance_transactions')
    .update(input)
    .eq('id', transactionId)
    .eq('tenant_id', tenantId)

  if (error && isMissingFinanceTransactionsError(error.message)) {
    return res.status(500).json({ error: 'A tabela de movimentacoes financeiras ainda nao existe no Supabase. Rode o patch SQL de producao e tente novamente.' })
  }
  if (error) return res.status(500).json({ error: error.message })

  return res.json({ id: transactionId })
})

app.delete('/api/finance/transactions/:transactionId', requireAuth, async (req, res) => {
  let tenantId: string
  try {
    tenantId = requireRequestTenantId(req.user!)
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Usuario sem tenant.' })
  }

  if (!canAccessModule(req.user!, 'finance')) return res.status(403).json({ error: 'Voce nao tem permissao para remover movimentacoes financeiras.' })

  const paramsSchema = z.object({ transactionId: z.string().uuid() })
  const { transactionId } = paramsSchema.parse(req.params)
  const { error } = await adminSupabase
    .from('finance_transactions')
    .delete()
    .eq('id', transactionId)
    .eq('tenant_id', tenantId)

  if (error && isMissingFinanceTransactionsError(error.message)) {
    return res.status(500).json({ error: 'A tabela de movimentacoes financeiras ainda nao existe no Supabase. Rode o patch SQL de producao e tente novamente.' })
  }
  if (error) return res.status(500).json({ error: error.message })

  return res.status(204).send()
})

app.post('/api/payments', requireAuth, async (req, res) => {
  let tenantId: string
  try {
    tenantId = requireRequestTenantId(req.user!)
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Usuario sem tenant.' })
  }
  if (!canAccessModule(req.user!, 'finance')) return res.status(403).json({ error: 'Voce nao tem permissao para gerar cobrancas.' })

  const schema = z.object({
    player_id: z.string().uuid().nullable().optional(),
    match_id: z.string().uuid().nullable().optional(),
    provider: z.enum(['MANUAL_PIX', 'ASAAS', 'MERCADO_PAGO']).default('MANUAL_PIX'),
    amount: z.coerce.number().positive(),
    due_date: z.string().min(10).max(10),
    status: z.enum(['PENDENTE', 'PAGO', 'ATRASADO', 'CANCELADO']).default('PENDENTE'),
    paid_at: z.string().datetime().nullable().optional(),
  })
  const input = schema.parse(req.body)
  if (!input.player_id) {
    return res.status(400).json({ error: 'Selecione o participante que recebera a cobranca.' })
  }

  try {
    if (input.player_id && input.status === 'PENDENTE') {
      const payment = await createPaymentCharge({
        tenantId,
        playerId: input.player_id,
        matchId: input.match_id,
        amount: input.amount,
        dueDate: input.due_date,
        provider: input.provider,
        description: input.match_id ? 'Pagamento do evento' : 'Cobranca avulsa',
        sendMessage: true,
      })
      return res.status(201).json(payment)
    }

    const { data, error } = await adminSupabase
      .from('payments')
      .insert({
        ...input,
        tenant_id: tenantId,
        paid_at: input.status === 'PAGO' ? input.paid_at ?? new Date().toISOString() : input.paid_at ?? null,
      })
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data)
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : 'Nao foi possivel gerar a cobranca.' })
  }
})

app.get('/api/billing/providers/status', requireAuth, async (req, res) => {
  if (!canAccessModule(req.user!, 'finance') && !canAccessModule(req.user!, 'settings')) {
    return res.status(403).json({ error: 'Voce nao tem permissao para consultar os gateways.' })
  }
  let tenantId: string
  try {
    tenantId = requireRequestTenantId(req.user!)
    return res.json(await getTenantBillingProviderStatus(tenantId))
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Nao foi possivel consultar os gateways.' })
  }
})

const asaasSubaccountSchema = z.object({
  name: z.string().trim().min(3).max(120),
  email: z.string().trim().email(),
  loginEmail: z.string().trim().email().optional().or(z.literal('')),
  cpfCnpj: z.string().min(11).max(18),
  birthDate: z.string().date().optional().or(z.literal('')),
  companyType: z.enum(['MEI', 'LIMITED', 'INDIVIDUAL', 'ASSOCIATION']).optional(),
  mobilePhone: z.string().min(10).max(20),
  incomeValue: z.coerce.number().positive().max(999999999),
  address: z.string().trim().min(3).max(120),
  addressNumber: z.string().trim().min(1).max(20),
  complement: z.string().trim().max(60).optional().or(z.literal('')),
  province: z.string().trim().min(2).max(80),
  postalCode: z.string().min(8).max(10),
}).superRefine((input, context) => {
  const document = input.cpfCnpj.replace(/\D/g, '')
  if (document.length !== 11 && document.length !== 14) {
    context.addIssue({ code: 'custom', path: ['cpfCnpj'], message: 'Informe um CPF ou CNPJ valido.' })
  }
  if (document.length === 11 && !input.birthDate) {
    context.addIssue({ code: 'custom', path: ['birthDate'], message: 'Informe a data de nascimento.' })
  }
  if (document.length === 14 && !input.companyType) {
    context.addIssue({ code: 'custom', path: ['companyType'], message: 'Informe o tipo da empresa.' })
  }
})

app.post('/api/billing/accounts/asaas', paymentAccountLimiter, requireAuth, async (req, res) => {
  let tenantId: string
  try {
    tenantId = requireRequestTenantId(req.user!)
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Usuario sem tenant.' })
  }
  if (req.user!.role !== 'ADMINISTRADOR') {
    return res.status(403).json({ error: 'Somente o administrador da empresa pode conectar a conta de recebimento.' })
  }

  const parsed = asaasSubaccountSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Revise os dados da conta.' })
  }

  try {
    return res.status(201).json(await connectTenantAsaasAccount(
      tenantId,
      req.user!.id,
      parsed.data as AsaasSubaccountInput,
    ))
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : 'Nao foi possivel conectar a conta Asaas.' })
  }
})

app.post('/api/billing/accounts/asaas/refresh', requireAuth, async (req, res) => {
  let tenantId: string
  try {
    tenantId = requireRequestTenantId(req.user!)
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Usuario sem tenant.' })
  }
  if (req.user!.role !== 'ADMINISTRADOR') {
    return res.status(403).json({ error: 'Somente o administrador da empresa pode atualizar a conta de recebimento.' })
  }

  try {
    return res.json(await refreshTenantAsaasAccount(tenantId))
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : 'Nao foi possivel atualizar a conta Asaas.' })
  }
})

app.post('/api/payments/:paymentId/send', requireAuth, async (req, res) => {
  let tenantId: string
  try {
    tenantId = requireRequestTenantId(req.user!)
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Usuario sem tenant.' })
  }
  if (!canAccessModule(req.user!, 'finance')) {
    return res.status(403).json({ error: 'Voce nao tem permissao para enviar cobrancas.' })
  }

  const { paymentId } = z.object({ paymentId: z.string().uuid() }).parse(req.params)
  try {
    const delivery = await sendPaymentChargeMessage(tenantId, paymentId)
    if (delivery.status !== 'SENT') {
      return res.status(502).json({ error: 'A cobranca existe, mas o WhatsApp nao conseguiu entregar a mensagem.', delivery })
    }
    return res.json({ delivery })
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : 'Nao foi possivel enviar a cobranca.' })
  }
})

app.patch('/api/payments/:paymentId', requireAuth, async (req, res) => {
  let tenantId: string
  try {
    tenantId = requireRequestTenantId(req.user!)
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Usuario sem tenant.' })
  }
  if (!canAccessModule(req.user!, 'finance')) return res.status(403).json({ error: 'Voce nao tem permissao para alterar cobrancas.' })

  const { paymentId } = z.object({ paymentId: z.string().uuid() }).parse(req.params)
  const input = z.object({
    status: z.enum(['PENDENTE', 'PAGO', 'ATRASADO', 'CANCELADO']).optional(),
    paid_at: z.string().datetime().nullable().optional(),
    due_date: z.string().min(10).max(10).optional(),
  }).parse(req.body)
  const { data: current, error: currentError } = await adminSupabase
    .from('payments')
    .select('id, player_id')
    .eq('id', paymentId)
    .eq('tenant_id', tenantId)
    .single()
  if (currentError || !current) return res.status(404).json({ error: 'Cobranca nao encontrada.' })

  const patch = {
    ...input,
    ...(input.status === 'PAGO' && input.paid_at === undefined ? { paid_at: new Date().toISOString() } : {}),
  }
  const { data, error } = await adminSupabase
    .from('payments')
    .update(patch)
    .eq('id', paymentId)
    .eq('tenant_id', tenantId)
    .select()
    .single()
  if (error) return res.status(500).json({ error: error.message })
  if (input.status === 'PAGO') {
    await releasePlayerAfterPayment(tenantId, current.player_id).catch((releaseError) => {
      console.warn('[billing] automatic release failed', releaseError)
    })
  }
  return res.json(data)
})

app.post('/api/billing/payment-link', requireAuth, async (req, res) => {
  const schema = z.object({
    player_id: z.string().uuid(),
    amount: z.number().positive(),
    due_date: z.string(),
    provider: z.enum(['ASAAS', 'MERCADO_PAGO', 'MANUAL_PIX']),
  })
  const input = schema.parse(req.body)
  let tenantId: string
  try {
    tenantId = requireRequestTenantId(req.user!)
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Usuario sem tenant.' })
  }
  if (!canAccessModule(req.user!, 'finance')) return res.status(403).json({ error: 'Voce nao tem permissao para gerar cobrancas.' })
  try {
    const payment = await createPaymentCharge({
      tenantId,
      playerId: input.player_id,
      amount: input.amount,
      dueDate: input.due_date,
      provider: input.provider as BillingProvider,
      description: 'Cobranca Agenda Sport',
      sendMessage: true,
    })
    return res.status(201).json({ payment, checkout_url: payment.checkout_url })
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : 'Nao foi possivel gerar a cobranca.' })
  }
})

app.post('/api/billing/monthly/run', requireAuth, async (req, res) => {
  let tenantId: string
  try {
    tenantId = requireRequestTenantId(req.user!)
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Usuario sem tenant.' })
  }
  if (!canAccessModule(req.user!, 'finance')) return res.status(403).json({ error: 'Voce nao tem permissao para gerar mensalidades.' })

  try {
    return res.json(await runMonthlyBillingForTenant(tenantId, { force: true }))
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Nao foi possivel gerar mensalidades.' })
  }
})

function isMissingFinanceTransactionsError(message: string) {
  return message.includes('finance_transactions') && (message.includes('schema cache') || message.includes('does not exist') || message.includes('relation'))
}

function isMissingColumnError(message: string, column: string) {
  return message.includes(column) && (message.includes('column') || message.includes('schema cache'))
}

function isMissingConfirmationSchedulesError(message: string) {
  return message.includes('confirmation_schedules') && (message.includes('schema cache') || message.includes('does not exist') || message.includes('relation'))
}

app.post('/api/backups/manual', requireAuth, requireSuperAdmin, async (_req, res) => {
  const { data, error } = await adminSupabase.from('backup_jobs').insert({ status: 'REQUESTED', requested_by: 'SUPER_ADMIN' }).select().single()
  if (error) return res.status(500).json({ error: error.message })
  return res.status(201).json(data)
})

if (fs.existsSync(clientIndexPath)) {
  app.use(express.static(clientDistPath))
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(clientIndexPath)
  })
}

app.listen(env.PORT, () => {
  console.log(`Agenda Sport API running on http://localhost:${env.PORT}`)
})

startConfirmationReminderWorker()
startBillingWorker()
