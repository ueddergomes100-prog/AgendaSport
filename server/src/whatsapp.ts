import { adminSupabase } from './supabase.js'
import { env } from './env.js'

type MessagePayload = {
  tenant_id: string
  match_id?: string | null
  player_id?: string | null
  phone: string
  type: 'CONFIRMACAO' | 'COBRANCA' | 'LISTA_ESPERA' | 'LEMBRETE'
  template?: string | null
  message: string
  recipient_type?: 'individual' | 'group'
  metadata?: Record<string, unknown> & {
    template_parameters?: string[]
  }
}

export async function sendWhatsAppMessage(payload: MessagePayload) {
  let status = 'QUEUED'
  let response = 'Provider disabled'

  if (env.WHATSAPP_PROVIDER === 'meta') {
    if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
      status = 'FAILED'
      response = 'Meta WhatsApp credentials missing'
    } else {
      const body = buildMetaMessageBody(payload)
      const result = await fetch(
        `https://graph.facebook.com/${env.WHATSAPP_GRAPH_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
      )
      status = result.ok ? 'SENT' : 'FAILED'
      response = await result.text()
    }
  } else if (env.WHATSAPP_PROVIDER !== 'disabled' && env.WHATSAPP_API_URL && env.WHATSAPP_TOKEN) {
    const result = await fetch(env.WHATSAPP_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phone: payload.phone, message: payload.message }),
    })
    status = result.ok ? 'SENT' : 'FAILED'
    response = await result.text()
  }

  const logPayload = {
    tenant_id: payload.tenant_id,
    match_id: payload.match_id ?? null,
    player_id: payload.player_id ?? null,
    phone: payload.phone,
    type: payload.type,
    template: payload.template ?? null,
    message: payload.message,
    status,
    response,
    metadata: payload.metadata ?? {},
  }

  await insertMessageLog(logPayload)

  return { status, response }
}

export async function insertMessageLog(logPayload: {
  tenant_id: string | null
  match_id: string | null
  player_id: string | null
  phone: string
  type: MessagePayload['type'] | 'WHATSAPP_INBOUND'
  template: string | null
  message: string
  status: string
  response: string | null
  metadata: Record<string, unknown>
}) {
  let attempt: Record<string, unknown> = { ...logPayload }
  let lastError: Error | null = null
  for (let index = 0; index < 8; index += 1) {
    const { error } = await adminSupabase.from('message_logs').insert(attempt)
    if (!error) return
    lastError = error
    const missingColumn = getMissingLogColumn(error.message)
    if (!missingColumn || !(missingColumn in attempt)) break
    const nextAttempt = { ...attempt }
    delete nextAttempt[missingColumn]
    attempt = nextAttempt
  }

  if (lastError) throw lastError
}

function getMissingLogColumn(message: string) {
  if (!message.includes('column') && !message.includes('schema cache')) return null
  const optionalColumns = ['template', 'metadata', 'player_id', 'match_id', 'response'] as const
  return optionalColumns.find((column) => message.includes(column)) ?? null
}

function buildMetaMessageBody(payload: MessagePayload) {
  const recipientType = payload.recipient_type ?? 'individual'
  const base = {
    messaging_product: 'whatsapp',
    recipient_type: recipientType,
    to: recipientType === 'group' ? payload.phone.trim() : normalizeWhatsAppPhone(payload.phone),
  }

  const templateName = payload.type === 'CONFIRMACAO'
    ? env.WHATSAPP_CONFIRMATION_TEMPLATE_NAME
    : payload.type === 'COBRANCA'
      ? env.WHATSAPP_BILLING_TEMPLATE_NAME
      : null

  if (templateName && payload.metadata?.template_parameters?.length) {
    return {
      ...base,
      type: 'template',
      template: {
        name: templateName,
        language: {
          code: env.WHATSAPP_TEMPLATE_LANGUAGE,
        },
        components: [
          {
            type: 'body',
            parameters: payload.metadata.template_parameters.map((text) => ({
              type: 'text',
              text,
            })),
          },
        ],
      },
    }
  }

  return {
    ...base,
    type: 'text',
    text: {
      preview_url: false,
      body: payload.message,
    },
  }
}

function normalizeWhatsAppPhone(phone: string) {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('55')) return digits
  return `55${digits}`
}
