import { createHmac, timingSafeEqual } from 'node:crypto'
import { Router } from 'express'
import { applyProviderPaymentStatus, type PaymentStatus } from './billing.js'
import { env } from './env.js'

export const paymentWebhookRouter = Router()

paymentWebhookRouter.get('/', (_req, res) => {
  return res.json({
    status: 'ok',
    service: 'Agenda Sport payment webhooks',
    endpoints: ['/asaas', '/mercado-pago'],
  })
})

paymentWebhookRouter.get('/asaas', (_req, res) => {
  return res.json({
    status: env.ASAAS_API_KEY && env.ASAAS_WEBHOOK_TOKEN ? 'ready' : 'configuration_required',
    provider: 'ASAAS',
    accepts: 'POST',
  })
})

paymentWebhookRouter.get('/mercado-pago', (_req, res) => {
  return res.json({
    status: env.MERCADO_PAGO_ACCESS_TOKEN && env.MERCADO_PAGO_WEBHOOK_SECRET ? 'ready' : 'configuration_required',
    provider: 'MERCADO_PAGO',
    accepts: 'POST',
  })
})

paymentWebhookRouter.post('/asaas', async (req, res) => {
  if (!env.ASAAS_WEBHOOK_TOKEN) {
    console.error('[billing:webhook] ASAAS_WEBHOOK_TOKEN is not configured')
    return res.status(503).json({ error: 'Webhook Asaas nao configurado.' })
  }
  const receivedToken = firstValue(req.headers['asaas-access-token'])
  if (!receivedToken || !constantTimeEquals(receivedToken, env.ASAAS_WEBHOOK_TOKEN)) {
    return res.status(401).json({ error: 'Assinatura invalida.' })
  }

  const paymentId = stringValue(req.body?.payment?.id)
  const status = mapAsaasStatus(stringValue(req.body?.payment?.status), stringValue(req.body?.event))
  if (!paymentId || !status) return res.status(200).json({ received: true, ignored: true })

  try {
    const payment = await applyProviderPaymentStatus('ASAAS', paymentId, status)
    return res.status(200).json({ received: true, matched: Boolean(payment) })
  } catch (error) {
    console.error('[billing:webhook] Asaas payment sync failed', error)
    return res.status(500).json({ error: 'Falha ao sincronizar pagamento.' })
  }
})

paymentWebhookRouter.post('/mercado-pago', async (req, res) => {
  if (!env.MERCADO_PAGO_WEBHOOK_SECRET || !env.MERCADO_PAGO_ACCESS_TOKEN) {
    console.error('[billing:webhook] Mercado Pago webhook credentials are not configured')
    return res.status(503).json({ error: 'Webhook Mercado Pago nao configurado.' })
  }

  const dataId = mercadoPagoDataId(req.query, req.body)
  const signatureValid = validateMercadoPagoSignature({
    xSignature: firstValue(req.headers['x-signature']),
    xRequestId: firstValue(req.headers['x-request-id']),
    dataId,
    secret: env.MERCADO_PAGO_WEBHOOK_SECRET,
  })
  if (!signatureValid) return res.status(401).json({ error: 'Assinatura invalida.' })

  const eventType = stringValue(req.body?.type) || stringValue(req.query.type)
  if (eventType && eventType !== 'payment') {
    return res.status(200).json({ received: true, ignored: true })
  }
  if (!dataId) return res.status(200).json({ received: true, ignored: true })

  try {
    const response = await fetch(`${env.MERCADO_PAGO_API_URL}/v1/payments/${encodeURIComponent(dataId)}`, {
      headers: { Authorization: `Bearer ${env.MERCADO_PAGO_ACCESS_TOKEN}` },
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(payload.message || payload.error || response.statusText)
    }
    const status = mapMercadoPagoStatus(stringValue(payload.status))
    if (!status) return res.status(200).json({ received: true, ignored: true })
    const payment = await applyProviderPaymentStatus('MERCADO_PAGO', String(payload.id ?? dataId), status)
    return res.status(200).json({ received: true, matched: Boolean(payment) })
  } catch (error) {
    console.error('[billing:webhook] Mercado Pago payment sync failed', error)
    return res.status(500).json({ error: 'Falha ao sincronizar pagamento.' })
  }
})

export function validateMercadoPagoSignature(input: {
  xSignature?: string
  xRequestId?: string
  dataId?: string
  secret: string
}) {
  if (!input.xSignature) return false
  const signatureParts = new Map(
    input.xSignature
      .split(',')
      .map((part) => part.trim().split('=', 2))
      .filter((part): part is [string, string] => part.length === 2 && Boolean(part[0]) && Boolean(part[1]))
      .map(([key, value]) => [key.toLowerCase(), value]),
  )
  const timestamp = signatureParts.get('ts')
  const receivedHash = signatureParts.get('v1')
  if (!timestamp || !/^\d+$/.test(timestamp) || !receivedHash) return false

  const manifest = [
    input.dataId ? `id:${input.dataId}` : null,
    input.xRequestId ? `request-id:${input.xRequestId}` : null,
    `ts:${timestamp}`,
  ].filter(Boolean).join(';') + ';'
  const expectedHash = createHmac('sha256', input.secret).update(manifest).digest('hex')
  return constantTimeEquals(expectedHash, receivedHash)
}

function mapAsaasStatus(status?: string, event?: string): PaymentStatus | null {
  if (['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED_IN_CASH'].includes(event ?? '')) return 'PAGO'
  if (['PAYMENT_OVERDUE'].includes(event ?? '')) return 'ATRASADO'
  if (['PAYMENT_REFUNDED', 'PAYMENT_DELETED', 'PAYMENT_CHARGEBACK_REQUESTED'].includes(event ?? '')) return 'CANCELADO'
  if (['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(status ?? '')) return 'PAGO'
  if (status === 'OVERDUE') return 'ATRASADO'
  if (['REFUNDED', 'DELETED', 'CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE'].includes(status ?? '')) return 'CANCELADO'
  if (status) return 'PENDENTE'
  return null
}

function mapMercadoPagoStatus(status?: string): PaymentStatus | null {
  if (status === 'approved') return 'PAGO'
  if (['cancelled', 'rejected', 'refunded', 'charged_back'].includes(status ?? '')) return 'CANCELADO'
  if (status) return 'PENDENTE'
  return null
}

function mercadoPagoDataId(query: Record<string, unknown>, body: unknown) {
  const payload = body as { data?: { id?: unknown } } | null
  return stringValue(query['data.id'])
    || stringValue(query.data_id)
    || stringValue(query.id)
    || stringValue(payload?.data?.id)
}

function firstValue(value: string | string[] | undefined) {
  const first = Array.isArray(value) ? value[0] : value
  return first?.trim() || undefined
}

function stringValue(value: unknown) {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim() || undefined
  return undefined
}

function constantTimeEquals(left: string, right: string) {
  if (left.length !== right.length) return false
  return timingSafeEqual(Buffer.from(left), Buffer.from(right))
}
