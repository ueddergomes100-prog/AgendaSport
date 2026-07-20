import { Router } from 'express'
import { z } from 'zod'
import { createPaymentCharge, type BillingProvider } from './billing.js'
import { env } from './env.js'
import {
  getWaitlistPlayerIds,
  notifyGroupAttendanceUpdate,
  notifyPromotedWaitlistPlayers,
} from './group-notifications.js'
import { adminSupabase } from './supabase.js'
import { insertMessageLog, sendWhatsAppMessage } from './whatsapp.js'

export const whatsappWebhookRouter = Router()

type AttendanceReplyStatus = 'CONFIRMADO' | 'RECUSOU' | 'ESPERA'

type PlayerCandidate = {
  id: string
  tenant_id: string
  name: string
  whatsapp: string | null
}

type AttendanceCandidate = {
  id: string
  tenant_id: string
  match_id: string
  player_id: string
  status: string
  match: {
    id: string
    scheduled_at: string
    status: string
  } | null
}

type AttendanceProcessingResult = {
  tenantId?: string | null
  matchId?: string
  playerId?: string
  status: string
  response: string
  handled: boolean
  reason?: string
  replyStatus?: AttendanceReplyStatus
  ackStatus?: string
  chargeStatus?: string
}

const verificationQuerySchema = z.object({
  'hub.mode': z.string().optional(),
  'hub.verify_token': z.string().optional(),
  'hub.challenge': z.string().optional(),
})

const inboundMessageSchema = z.object({
  object: z.string().optional(),
  entry: z
    .array(
      z.object({
        changes: z
          .array(
            z.object({
              value: z.object({
                metadata: z.object({ phone_number_id: z.string().optional() }).optional(),
                messages: z
                  .array(
                    z.object({
                      from: z.string(),
                      id: z.string().optional(),
                      timestamp: z.string().optional(),
                      text: z.object({ body: z.string().optional() }).optional(),
                      button: z.object({ text: z.string().optional(), payload: z.string().optional() }).optional(),
                      interactive: z
                        .object({
                          button_reply: z.object({ id: z.string().optional(), title: z.string().optional() }).optional(),
                        })
                        .optional(),
                      context: z.object({ id: z.string().optional(), from: z.string().optional() }).optional(),
                      type: z.string().optional(),
                    }),
                  )
                  .optional(),
                statuses: z.array(z.unknown()).optional(),
              }),
            }),
          )
          .optional(),
      }),
    )
    .optional(),
})

whatsappWebhookRouter.get('/whatsapp', (req, res) => {
  const query = verificationQuerySchema.safeParse(req.query)
  if (!query.success) return res.sendStatus(400)

  const mode = query.data['hub.mode']
  const token = query.data['hub.verify_token']
  const challenge = query.data['hub.challenge']

  if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN && challenge) {
    return res.status(200).send(challenge)
  }

  return res.sendStatus(403)
})

whatsappWebhookRouter.post('/whatsapp', async (req, res) => {
  const parsed = inboundMessageSchema.safeParse(req.body)
  if (!parsed.success) {
    console.warn('[whatsapp:webhook] payload ignored: invalid shape', parsed.error.flatten())
    return res.sendStatus(200)
  }

  const entries = parsed.data.entry ?? []
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      const phoneNumberId = change.value.metadata?.phone_number_id
      if (change.value.statuses?.length) {
        console.info('[whatsapp:webhook] status update received', {
          phoneNumberId,
          count: change.value.statuses.length,
        })
      }

      for (const message of change.value.messages ?? []) {
        const replyText = getInboundReplyText(message)
        const messageText = replyText ?? `[${message.type ?? 'message'}]`
        const replyStatus = parseAttendanceReply(replyText)
        let processing: AttendanceProcessingResult | null = null

        console.info('[whatsapp:webhook] inbound message received', {
          from: maskPhone(message.from),
          type: message.type,
          replyText,
          replyStatus,
        })

        if (replyStatus) {
          try {
            processing = await processAttendanceReply(message.from, replyStatus)
            if (processing.handled && processing.tenantId && processing.matchId && processing.playerId && processing.replyStatus) {
              processing.ackStatus = await sendAttendanceAcknowledgement({
                tenantId: processing.tenantId,
                matchId: processing.matchId,
                playerId: processing.playerId,
                phone: message.from,
                replyStatus: processing.replyStatus,
              })
            }
          } catch (error) {
            console.error('[whatsapp:webhook] failed to process attendance reply', error)
            processing = {
              status: 'FAILED',
              response: error instanceof Error ? error.message : 'Failed to process inbound WhatsApp reply',
              handled: false,
              reason: 'processing_exception',
            }
          }
        }

        await insertMessageLog({
          tenant_id: processing?.tenantId ?? null,
          match_id: processing?.matchId ?? null,
          player_id: processing?.playerId ?? null,
          phone: message.from,
          type: 'WHATSAPP_INBOUND',
          template: null,
          message: messageText,
          status: processing?.status ?? 'RECEIVED',
          response: processing?.response ?? message.id ?? null,
          metadata: {
            phone_number_id: phoneNumberId,
            timestamp: message.timestamp,
            message_id: message.id,
            context: message.context,
            raw_type: message.type,
            button: message.button,
            interactive: message.interactive,
            text: message.text,
            attendance_reply: replyStatus,
            handled: processing?.handled ?? false,
            reason: processing?.reason,
            ack_status: processing?.ackStatus,
            charge_status: processing?.chargeStatus,
          },
        })

        console.info('[whatsapp:webhook] inbound message processed', {
          from: maskPhone(message.from),
          handled: processing?.handled ?? false,
          status: processing?.status ?? 'RECEIVED',
          reason: processing?.reason,
          matchId: processing?.matchId,
          playerId: processing?.playerId,
        })
      }
    }
  }

  return res.sendStatus(200)
})

function getInboundReplyText(message: {
  text?: { body?: string }
  button?: { text?: string; payload?: string }
  interactive?: { button_reply?: { id?: string; title?: string } }
}) {
  return (
    message.text?.body ??
    message.interactive?.button_reply?.id ??
    message.interactive?.button_reply?.title ??
    message.button?.payload ??
    message.button?.text ??
    null
  )
}

function parseAttendanceReply(body?: string | null): AttendanceReplyStatus | null {
  const normalized = normalizeReplyText(body)
  if (!normalized) return null

  const firstWord = normalized.split(' ')[0]
  if (
    ['nao', 'n', 'no', 'recuso', 'recusar', 'cancelar', 'cancela', 'btnnao', 'buttonnao', 'naovou'].includes(normalized) ||
    firstWord === 'nao' ||
    normalized.includes('nao') ||
    normalized.includes('recuso')
  ) {
    return 'RECUSOU'
  }

  if (
    ['espera', 'fila', 'lista', 'aguardar', 'btnespera', 'buttonespera', 'ficarnaespera'].includes(normalized) ||
    firstWord === 'espera' ||
    normalized.includes('espera') ||
    normalized.includes('fila')
  ) {
    return 'ESPERA'
  }

  if (
    ['sim', 's', 'yes', 'confirmo', 'confirmado', 'vou', 'presente', 'bora', 'btnsim', 'buttonsim'].includes(normalized) ||
    firstWord === 'sim' ||
    normalized.includes('confirmo') ||
    normalized.includes('confirmado')
  ) {
    return 'CONFIRMADO'
  }

  return null
}

function normalizeReplyText(value?: string | null) {
  return (value ?? '')
    .trim()
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
}

async function processAttendanceReply(fromPhone: string, replyStatus: AttendanceReplyStatus) {
  const players = await findPlayersByPhone(fromPhone)
  if (!players.length) {
    return {
      status: 'RECEIVED',
      response: 'No player found for inbound phone',
      handled: false,
      reason: 'player_not_found',
    }
  }

  const attendance = await findBestActiveAttendanceForPlayers(players)
  if (!attendance) {
    if (players.length > 1) {
      return {
        status: 'RECEIVED',
        response: 'Multiple players matched inbound phone and no active attendance could disambiguate',
        handled: false,
        reason: 'ambiguous_player_phone',
      }
    }

    const player = players[0]
    return {
      tenantId: player.tenant_id,
      playerId: player.id,
      status: 'RECEIVED',
      response: 'No active attendance found for player',
      handled: false,
      reason: 'attendance_not_found',
    }
  }

  const waitlistBefore = await getWaitlistPlayerIds(attendance.match_id)
  const updateResult = await updateAttendanceByRpc(attendance, replyStatus)

  if (updateResult.error) {
    return {
      tenantId: attendance.tenant_id,
      matchId: attendance.match_id,
      playerId: attendance.player_id,
      status: 'FAILED',
      response: updateResult.error.message,
      handled: false,
      reason: 'attendance_update_failed',
    }
  }

  const finalStatus = normalizeAttendanceResult(updateResult.data, replyStatus)
  await notifyPromotedWaitlistPlayers(attendance.match_id, waitlistBefore).catch((error) => {
    console.warn('[whatsapp:webhook] failed to notify promoted waitlist player', error)
  })
  await notifyGroupAttendanceUpdate({
    tenantId: attendance.tenant_id,
    matchId: attendance.match_id,
    playerId: attendance.player_id,
    status: finalStatus,
  }).catch((error) => {
    console.warn('[whatsapp:webhook] failed to update configured WhatsApp group', error)
  })

  const chargeStatus = finalStatus === 'CONFIRMADO'
    ? await ensureCasualChargeForConfirmation(attendance)
    : 'SKIPPED'

  return {
    tenantId: attendance.tenant_id,
    matchId: attendance.match_id,
    playerId: attendance.player_id,
    status: 'PROCESSED',
    response: `Attendance updated to ${finalStatus}`,
    handled: true,
    replyStatus: finalStatus,
    chargeStatus,
  }
}

async function ensureCasualChargeForConfirmation(attendance: AttendanceCandidate) {
  const { data: settings, error: settingsError } = await adminSupabase
    .from('billing_settings')
    .select('auto_charge_casual_players, default_provider')
    .eq('tenant_id', attendance.tenant_id)
    .maybeSingle()

  if (settingsError && isMissingBillingSettingsError(settingsError.message)) return 'SKIPPED_SETTINGS_TABLE_MISSING'
  if (settingsError) throw settingsError
  if (!settings?.auto_charge_casual_players) return 'SKIPPED_DISABLED'

  const { data: details, error: detailsError } = await adminSupabase
    .from('attendance')
    .select('player:players(id, name, type, whatsapp), match:matches(id, scheduled_at, pickup:pickups(name, casual_price))')
    .eq('id', attendance.id)
    .single()
  if (detailsError) throw detailsError

  const row = details as unknown as {
    player: { id: string; name: string; type: string; whatsapp: string | null } | null
    match: { id: string; scheduled_at: string; pickup: { name: string; casual_price: number } | null } | null
  }

  if (row.player?.type !== 'AVULSO') return 'SKIPPED_NOT_CASUAL'
  const amount = Number(row.match?.pickup?.casual_price ?? 0)
  if (!amount) return 'SKIPPED_ZERO_AMOUNT'

  const { data: existing, error: existingError } = await adminSupabase
    .from('payments')
    .select('id')
    .eq('tenant_id', attendance.tenant_id)
    .eq('match_id', attendance.match_id)
    .eq('player_id', attendance.player_id)
    .neq('status', 'CANCELADO')
    .limit(1)
  if (existingError) throw existingError
  if (existing?.length) return 'SKIPPED_ALREADY_EXISTS'

  await createPaymentCharge({
    tenantId: attendance.tenant_id,
    matchId: attendance.match_id,
    playerId: attendance.player_id,
    provider: normalizeBillingProvider(settings.default_provider),
    amount,
    dueDate: new Date().toISOString().slice(0, 10),
    description: `Pagamento - ${row.match?.pickup?.name ?? 'Evento esportivo'}`,
    sendMessage: true,
  })

  return 'CREATED'
}

async function sendAttendanceAcknowledgement({
  tenantId,
  matchId,
  playerId,
  phone,
  replyStatus,
}: {
  tenantId: string
  matchId: string
  playerId: string
  phone: string
  replyStatus: AttendanceReplyStatus
}) {
  const message = acknowledgementMessage(replyStatus)
  if (!message) return 'SKIPPED'

  const result = await sendWhatsAppMessage({
    tenant_id: tenantId,
    match_id: matchId,
    player_id: playerId,
    phone,
    type: 'LEMBRETE',
    template: null,
    message,
    metadata: {
      source: 'attendance_acknowledgement',
      reply_status: replyStatus,
    },
  })

  return result.status
}

function acknowledgementMessage(replyStatus: AttendanceReplyStatus) {
  if (replyStatus === 'CONFIRMADO') {
    return 'Confirmacao recebida! Bom jogo e ate o evento.'
  }

  if (replyStatus === 'RECUSOU') {
    return 'Resposta recebida. Que pena, fica para a proxima!'
  }

  if (replyStatus === 'ESPERA') {
    return 'Resposta recebida. Voce entrou na fila de espera; avisaremos se abrir vaga.'
  }

  return null
}

async function updateAttendanceByRpc(attendance: AttendanceCandidate, replyStatus: AttendanceReplyStatus) {
  const current = await adminSupabase.rpc('set_attendance_response', {
    p_match_id: attendance.match_id,
    p_player_id: attendance.player_id,
    p_status: replyStatus,
    p_source: 'WHATSAPP',
    p_responded_by: null,
  })
  if (current.error && current.error.message.includes('Could not find the function')) {
    return adminSupabase.rpc('set_attendance_response', {
      p_match_id: attendance.match_id,
      p_player_id: attendance.player_id,
      p_status: replyStatus,
    })
  }
  return current
}

function normalizeAttendanceResult(value: unknown, fallback: AttendanceReplyStatus): AttendanceReplyStatus {
  if (!value || typeof value !== 'object' || !('status' in value)) return fallback
  const status = String(value.status)
  if (status === 'CONFIRMADO' || status === 'RECUSOU' || status === 'ESPERA') return status
  return fallback
}

async function findPlayersByPhone(fromPhone: string): Promise<PlayerCandidate[]> {
  const inboundDigits = onlyDigits(fromPhone)
  const { data, error } = await adminSupabase
    .from('players')
    .select('id, tenant_id, name, whatsapp')
    .not('whatsapp', 'is', null)
    .eq('status', 'ATIVO')

  if (error) throw error

  const scored = ((data ?? []) as PlayerCandidate[])
    .map((player) => ({ player, score: phoneMatchScore(player.whatsapp, inboundDigits) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)

  const bestScore = scored[0]?.score ?? 0
  return scored.filter((item) => item.score === bestScore).map((item) => item.player)
}

function phoneMatchScore(playerPhone: string | null, inboundDigits: string) {
  const playerDigits = onlyDigits(playerPhone ?? '')
  if (playerDigits.length < 8 || inboundDigits.length < 8) return 0

  const playerVariants = phoneVariants(playerDigits)
  const inboundVariants = phoneVariants(inboundDigits)
  for (const playerVariant of playerVariants) {
    for (const inboundVariant of inboundVariants) {
      if (playerVariant === inboundVariant) return 5
      if (inboundVariant.endsWith(playerVariant) || playerVariant.endsWith(inboundVariant)) return 4
      if (inboundVariant.endsWith(playerVariant.slice(-10)) || playerVariant.endsWith(inboundVariant.slice(-10))) return 3
      if (inboundVariant.endsWith(playerVariant.slice(-8)) || playerVariant.endsWith(inboundVariant.slice(-8))) return 1
    }
  }

  return 0
}

function isMissingBillingSettingsError(message: string) {
  return message.includes('billing_settings') && (message.includes('schema cache') || message.includes('does not exist') || message.includes('relation'))
}

function normalizeBillingProvider(provider: string | null): BillingProvider {
  if (provider === 'ASAAS' || provider === 'MERCADO_PAGO') return provider
  return 'MANUAL_PIX'
}

function phoneVariants(digits: string) {
  const values = new Set<string>()
  const add = (value: string) => {
    if (value.length >= 8) values.add(value)
  }

  add(digits)

  const withoutCountry = digits.startsWith('55') ? digits.slice(2) : digits
  add(withoutCountry)
  add(`55${withoutCountry}`)

  if (withoutCountry.length === 11 && withoutCountry[2] === '9') {
    const withoutMobileNine = `${withoutCountry.slice(0, 2)}${withoutCountry.slice(3)}`
    add(withoutMobileNine)
    add(`55${withoutMobileNine}`)
  }

  if (withoutCountry.length === 10) {
    const withMobileNine = `${withoutCountry.slice(0, 2)}9${withoutCountry.slice(2)}`
    add(withMobileNine)
    add(`55${withMobileNine}`)
  }

  return Array.from(values)
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

function maskPhone(value: string) {
  const digits = onlyDigits(value)
  if (digits.length <= 6) return '***'
  return `${digits.slice(0, 4)}***${digits.slice(-4)}`
}

async function findBestActiveAttendanceForPlayers(players: PlayerCandidate[]): Promise<AttendanceCandidate | null> {
  if (!players.length) return null

  const playerIds = players.map((player) => player.id)
  const { data, error } = await adminSupabase
    .from('attendance')
    .select('id, tenant_id, match_id, player_id, status, match:matches!inner(id, scheduled_at, status)')
    .in('player_id', playerIds)
    .in('status', ['CONVIDADO', 'CONFIRMADO', 'ESPERA'])
    .neq('match.status', 'ENCERRADA')
    .neq('match.status', 'CANCELADA')

  if (error) throw error

  return ((data ?? []) as unknown as AttendanceCandidate[]).sort(compareAttendanceCandidates)[0] ?? null
}

function compareAttendanceCandidates(a: AttendanceCandidate, b: AttendanceCandidate) {
  const statusDelta = attendanceStatusPriority(a.status) - attendanceStatusPriority(b.status)
  if (statusDelta !== 0) return statusDelta

  const now = Date.now()
  const aTime = new Date(a.match?.scheduled_at ?? 0).getTime()
  const bTime = new Date(b.match?.scheduled_at ?? 0).getTime()
  const aFuture = aTime >= now
  const bFuture = bTime >= now

  if (aFuture !== bFuture) return aFuture ? -1 : 1
  return aFuture ? aTime - bTime : bTime - aTime
}

function attendanceStatusPriority(status: string) {
  if (status === 'CONVIDADO') return 0
  if (status === 'ESPERA') return 1
  if (status === 'CONFIRMADO') return 2
  return 3
}
