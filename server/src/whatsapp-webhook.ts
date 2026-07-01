import { Router } from 'express'
import { z } from 'zod'
import { env } from './env.js'
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
            raw_type: message.type,
            attendance_reply: replyStatus,
            handled: processing?.handled ?? false,
            reason: processing?.reason,
            ack_status: processing?.ackStatus,
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

  if (players.length > 1) {
    return {
      status: 'RECEIVED',
      response: 'Multiple players matched inbound phone',
      handled: false,
      reason: 'ambiguous_player_phone',
    }
  }

  const player = players[0]
  const attendance = await findNextActiveAttendance(player.id)
  if (!attendance) {
    return {
      tenantId: player.tenant_id,
      playerId: player.id,
      status: 'RECEIVED',
      response: 'No active attendance found for player',
      handled: false,
      reason: 'attendance_not_found',
    }
  }

  const error = replyStatus === 'ESPERA'
    ? await updateAttendanceToWaitlist(attendance)
    : await updateAttendanceByRpc(attendance, replyStatus)

  if (error) {
    return {
      tenantId: attendance.tenant_id,
      matchId: attendance.match_id,
      playerId: attendance.player_id,
      status: 'FAILED',
      response: error.message,
      handled: false,
      reason: 'attendance_update_failed',
    }
  }

  return {
    tenantId: attendance.tenant_id,
    matchId: attendance.match_id,
    playerId: attendance.player_id,
    status: 'PROCESSED',
    response: `Attendance updated to ${replyStatus}`,
    handled: true,
    replyStatus,
  }
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
  const { error } = await adminSupabase.rpc('set_attendance_response', {
    p_match_id: attendance.match_id,
    p_player_id: attendance.player_id,
    p_status: replyStatus,
  })
  return error
}

async function updateAttendanceToWaitlist(attendance: AttendanceCandidate) {
  const { data: queued, error: queueError } = await adminSupabase
    .from('attendance')
    .select('queue_position')
    .eq('match_id', attendance.match_id)
    .eq('status', 'ESPERA')
    .order('queue_position', { ascending: false, nullsFirst: false })
    .limit(1)
  if (queueError) return queueError

  const nextQueuePosition = Number(queued?.[0]?.queue_position ?? 0) + 1
  const { error } = await adminSupabase.from('attendance').upsert(
    {
      tenant_id: attendance.tenant_id,
      match_id: attendance.match_id,
      player_id: attendance.player_id,
      status: 'ESPERA',
      responded_at: new Date().toISOString(),
      queue_position: nextQueuePosition,
    },
    { onConflict: 'match_id,player_id' },
  )
  if (error) return error

  if (['CONFIRMADO', 'COMPARECEU'].includes(attendance.status)) {
    const { error: promoteError } = await adminSupabase.rpc('promote_waitlist', { p_match_id: attendance.match_id })
    if (promoteError) return promoteError
  }

  return null
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
  if (playerDigits === inboundDigits) return 4
  if (inboundDigits.endsWith(playerDigits) || playerDigits.endsWith(inboundDigits)) return 3
  if (inboundDigits.endsWith(playerDigits.slice(-10))) return 2
  if (inboundDigits.endsWith(playerDigits.slice(-8))) return 1
  return 0
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

function maskPhone(value: string) {
  const digits = onlyDigits(value)
  if (digits.length <= 6) return '***'
  return `${digits.slice(0, 4)}***${digits.slice(-4)}`
}

async function findNextActiveAttendance(playerId: string): Promise<AttendanceCandidate | null> {
  const { data, error } = await adminSupabase
    .from('attendance')
    .select('id, tenant_id, match_id, player_id, status, match:matches!inner(id, scheduled_at, status)')
    .eq('player_id', playerId)
    .in('status', ['CONVIDADO', 'CONFIRMADO', 'ESPERA'])
    .gte('match.scheduled_at', new Date().toISOString())
    .neq('match.status', 'ENCERRADA')
    .neq('match.status', 'CANCELADA')

  if (error) throw error

  return ((data ?? []) as unknown as AttendanceCandidate[]).sort(
    (a, b) => new Date(a.match?.scheduled_at ?? 0).getTime() - new Date(b.match?.scheduled_at ?? 0).getTime(),
  )[0] ?? null
}
