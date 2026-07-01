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

app.use(helmet())
app.use(cors({ origin: corsOrigins.length > 1 ? corsOrigins : corsOrigins[0], credentials: true }))
app.use(express.json({ limit: '1mb' }))
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300 }))

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'Agenda Sport API' })
})

app.use('/api/webhooks', whatsappWebhookRouter)

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
