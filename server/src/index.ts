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
import { adminSupabase } from './supabase.js'
import { sendWhatsAppMessage } from './whatsapp.js'
import { whatsappWebhookRouter } from './whatsapp-webhook.js'
import { confirmationReminderStages, runConfirmationReminderJob, sendConfirmationForMatch, startConfirmationReminderWorker } from './reminders.js'

const app = express()
type AuthUser = { id: string; tenant_id: string | null; role: string }
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

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'Agenda Sport API' })
})

app.use('/api/webhooks', whatsappWebhookRouter)

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
    if (existingError) throw existingError

    const exists = (existingPlayers ?? []).some((player) => (player.whatsapp_normalized || normalizeWhatsApp(player.whatsapp ?? '')) === normalized)
    if (exists) {
      return res.status(409).json({ error: 'Este WhatsApp ja esta cadastrado nesta empresa. Se precisar alterar seus dados, fale com o organizador.' })
    }

    const firstName = input.first_name.trim()
    const lastName = input.last_name.trim()
    const fullName = `${firstName} ${lastName}`
    const position = input.position_kind === 'GOLEIRO' ? 'Goleiro' : 'Linha'

    const { data: player, error: insertError } = await adminSupabase
      .from('players')
      .insert({
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
        notes: position === 'Goleiro' ? 'Autoinscricao: goleiro' : 'Autoinscricao: jogador de linha',
      })
      .select('id, name, whatsapp')
      .single()

    if (insertError) throw insertError

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

    return res.status(201).json({
      player_id: player.id,
      name: player.name,
      company: company.name,
      whatsapp_status: whatsappResult.status,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message ?? 'Dados invalidos.' })
    }
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Nao foi possivel concluir sua inscricao.' })
  }
})

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
  const result = await sendWhatsAppMessage({ tenant_id: tenantId, phone: input.phone, type: input.type, message: input.message })
  return res.json(result)
})

app.get('/api/reminders/confirmation/status', requireAuth, (_req, res) => {
  return res.json({
    enabled: env.REMINDER_WORKER_ENABLED,
    interval_minutes: env.REMINDER_INTERVAL_MINUTES,
    stages: confirmationReminderStages,
  })
})

app.post('/api/reminders/confirmation/run', requireAuth, async (req, res) => {
  const tenantId = req.user!.role === 'SUPER_ADMIN' ? null : req.user!.tenant_id
  if (req.user!.role !== 'SUPER_ADMIN' && !tenantId) return res.status(400).json({ error: 'Usuario sem tenant.' })

  const summary = await runConfirmationReminderJob({ tenantId })
  return res.json(summary)
})

app.post('/api/matches/:matchId/confirmations/send', requireAuth, async (req, res) => {
  const paramsSchema = z.object({ matchId: z.string().uuid() })
  const { matchId } = paramsSchema.parse(req.params)
  const tenantId = req.user!.role === 'SUPER_ADMIN' ? null : req.user!.tenant_id
  if (req.user!.role !== 'SUPER_ADMIN' && !tenantId) return res.status(400).json({ error: 'Usuario sem tenant.' })

  try {
    const summary = await sendConfirmationForMatch(matchId, tenantId)
    return res.json(summary)
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Nao foi possivel enviar a convocacao.' })
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
  const { data, error } = await adminSupabase
    .from('payments')
    .insert({
      tenant_id: tenantId,
      player_id: input.player_id,
      amount: input.amount,
      due_date: input.due_date,
      provider: input.provider,
      status: 'PENDENTE',
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  return res.status(201).json({ payment: data, checkout_url: data.checkout_url })
})

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
