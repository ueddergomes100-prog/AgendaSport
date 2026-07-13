import { env } from './env.js'
import { adminSupabase } from './supabase.js'
import { sendWhatsAppMessage } from './whatsapp.js'

export const confirmationReminderStages = [
  { hoursBefore: 72, template: 'CONFIRMACAO_72H', label: '72h' },
  { hoursBefore: 48, template: 'CONFIRMACAO_48H', label: '48h' },
  { hoursBefore: 24, template: 'CONFIRMACAO_24H', label: '24h' },
] as const

const EVENT_TIME_ZONE = 'America/Sao_Paulo'

type ReminderStage = (typeof confirmationReminderStages)[number]

type PickupRow = {
  id: string
  name: string
  place: string
  address: string | null
  maps_url: string | null
  weekday: number
  start_time: string
  max_players: number
}

type MatchRow = {
  id: string
  tenant_id: string
  pickup_id: string | null
  scheduled_at: string
  notes: string | null
  status: 'AGENDADA' | 'ABERTA' | 'ENCERRADA' | 'CANCELADA'
  pickup?: PickupRow | null
}

type AttendanceRow = {
  id: string
  tenant_id: string
  match_id: string
  player_id: string
  status: string
  player?: {
    id: string
    name: string
    whatsapp: string | null
    status: string
    type: string
    primary_position: string
  } | null
}

export type ReminderRunSummary = {
  matchesChecked: number
  matchesOpened: number
  invitationsCreated: number
  remindersSent: number
  skippedAlreadySent: number
  skippedWithoutWhatsapp: number
  errors: Array<{ matchId?: string; playerId?: string; message: string }>
}

export type MatchConfirmationSummary = Omit<ReminderRunSummary, 'matchesChecked' | 'matchesOpened'> & {
  matchId: string
}

function currentReminderStage(scheduledAt: string, now: Date): ReminderStage | null {
  const diffHours = (new Date(scheduledAt).getTime() - now.getTime()) / 36e5
  if (diffHours <= 0 || diffHours > 72) return null
  if (diffHours <= 24) return confirmationReminderStages[2]
  if (diffHours <= 48) return confirmationReminderStages[1]
  return confirmationReminderStages[0]
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('pt-BR', {
    timeZone: EVENT_TIME_ZONE,
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('pt-BR', {
    timeZone: EVENT_TIME_ZONE,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  })
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString('pt-BR', {
    timeZone: EVENT_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
  })
}

function buildConfirmationMessage(match: MatchRow, attendance: AttendanceRow, stage: ReminderStage) {
  const playerName = attendance.player?.name?.split(' ')[0] ?? 'participante'
  const pickup = match.pickup
  const title = stage.template === 'CONFIRMACAO_24H' ? 'Ultima chamada' : stage.template === 'CONFIRMACAO_48H' ? 'Reforco de confirmacao' : 'Confirmacao aberta'
  const lines = [
    `Agenda Sport - ${title}`,
    '',
    `Oi, ${playerName}! Voce confirma presenca em ${pickup?.name ?? match.notes ?? 'evento'}?`,
    `Data: ${formatDateTime(match.scheduled_at)}`,
    pickup?.place ? `Local: ${pickup.place}` : null,
    pickup?.address ? `Endereco: ${pickup.address}` : null,
    pickup?.maps_url ? `Mapa: ${pickup.maps_url}` : null,
    '',
    'Responda com SIM, NAO ou ESPERA.',
    'ESPERA deixa voce na fila sem ocupar vaga confirmada.',
  ]

  return lines.filter(Boolean).join('\n')
}

function buildConfirmationTemplateParameters(match: MatchRow, attendance: AttendanceRow) {
  const pickup = match.pickup
  return [
    attendance.player?.name?.split(' ')[0] ?? 'participante',
    pickup?.name ?? match.notes ?? 'evento',
    formatDate(match.scheduled_at),
    formatTime(match.scheduled_at),
  ]
}

async function ensureInvitations(match: MatchRow) {
  const { data: existing, error: existingError } = await adminSupabase
    .from('attendance')
    .select('player_id')
    .eq('match_id', match.id)

  if (existingError) throw existingError
  const existingPlayerIds = new Set((existing ?? []).map((row) => row.player_id).filter(Boolean))

  const { data: players, error: playersError } = await adminSupabase
    .from('players')
    .select('id')
    .eq('tenant_id', match.tenant_id)
    .eq('status', 'ATIVO')

  if (playersError) throw playersError
  if (!players?.length) return 0

  const missingPlayers = players.filter((player) => !existingPlayerIds.has(player.id))
  if (!missingPlayers.length) return 0

  const payload = missingPlayers.map((player) => ({
    tenant_id: match.tenant_id,
    match_id: match.id,
    player_id: player.id,
    status: 'CONVIDADO',
  }))

  const { error } = await adminSupabase.from('attendance').upsert(payload, { onConflict: 'match_id,player_id' })
  if (error) throw error
  return payload.length
}

async function openMatchIfScheduled(match: MatchRow) {
  if (match.status !== 'AGENDADA') return false
  const { error } = await adminSupabase.from('matches').update({ status: 'ABERTA' }).eq('id', match.id)
  if (error) throw error
  match.status = 'ABERTA'
  return true
}

async function getPendingAttendance(matchId: string) {
  const { data, error } = await adminSupabase
    .from('attendance')
    .select('id, tenant_id, match_id, player_id, status, player:players(id, name, whatsapp, status, type, primary_position)')
    .eq('match_id', matchId)
    .eq('status', 'CONVIDADO')

  if (error) throw error
  return (data ?? []) as unknown as AttendanceRow[]
}

async function getMatchForConfirmation(matchId: string, tenantId?: string | null) {
  let query = adminSupabase
    .from('matches')
    .select('id, tenant_id, pickup_id, scheduled_at, notes, status, pickup:pickups(id, name, place, address, maps_url, weekday, start_time, max_players)')
    .eq('id', matchId)
    .neq('status', 'ENCERRADA')
    .neq('status', 'CANCELADA')

  if (tenantId) query = query.eq('tenant_id', tenantId)

  const { data, error } = await query.single()
  if (error) throw error
  return data as unknown as MatchRow
}

async function getAlreadySentPlayerIds(matchId: string, template: string) {
  const query = adminSupabase
    .from('message_logs')
    .select('player_id')
    .eq('match_id', matchId)
    .eq('type', 'CONFIRMACAO')

  const { data, error } = await query.eq('template', template)
  if (error && isMissingLogColumnError(error.message)) return new Set<string>()
  if (error && isMissingTemplateColumnError(error.message)) {
    const { data: legacyData, error: legacyError } = await adminSupabase
      .from('message_logs')
      .select('player_id')
      .eq('match_id', matchId)
      .eq('type', 'CONFIRMACAO')
    if (legacyError && isMissingLogColumnError(legacyError.message)) return new Set<string>()
    if (legacyError) throw legacyError
    return new Set((legacyData ?? []).map((row) => row.player_id).filter(Boolean) as string[])
  }
  if (error) throw error
  return new Set((data ?? []).map((row) => row.player_id).filter(Boolean) as string[])
}

async function wasConfirmationAlreadySent(match: MatchRow, attendance: AttendanceRow, template: string, message: string) {
  const { data, error } = await adminSupabase
    .from('message_logs')
    .select('id')
    .eq('match_id', match.id)
    .eq('player_id', attendance.player_id)
    .eq('type', 'CONFIRMACAO')
    .eq('template', template)
    .eq('status', 'SENT')
    .limit(1)

  if (!error) return Boolean(data?.length)
  if (!isMissingLogColumnError(error.message)) throw error

  const phone = attendance.player?.whatsapp?.replace(/\D/g, '')
  if (!phone) return false

  const { data: legacyData, error: legacyError } = await adminSupabase
    .from('message_logs')
    .select('id, phone')
    .eq('type', 'CONFIRMACAO')
    .eq('status', 'SENT')
    .eq('message', message)
    .limit(25)

  if (legacyError) throw legacyError
  return (legacyData ?? []).some((row) => normalizePhone(row.phone) === normalizePhone(phone))
}

function isMissingTemplateColumnError(message: string) {
  return message.includes('template') && (message.includes('column') || message.includes('schema cache'))
}

function isMissingLogColumnError(message: string) {
  return (message.includes('column') || message.includes('schema cache')) && (
    message.includes('match_id') ||
    message.includes('player_id') ||
    message.includes('template')
  )
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, '')
  return digits.startsWith('55') ? digits.slice(2) : digits
}

export async function runConfirmationReminderJob(options: { tenantId?: string | null; now?: Date } = {}): Promise<ReminderRunSummary> {
  const now = options.now ?? new Date()
  const upperBound = new Date(now.getTime() + 72 * 60 * 60 * 1000)
  const summary: ReminderRunSummary = {
    matchesChecked: 0,
    matchesOpened: 0,
    invitationsCreated: 0,
    remindersSent: 0,
    skippedAlreadySent: 0,
    skippedWithoutWhatsapp: 0,
    errors: [],
  }

  let query = adminSupabase
    .from('matches')
    .select('id, tenant_id, pickup_id, scheduled_at, notes, status, pickup:pickups(id, name, place, address, maps_url, weekday, start_time, max_players)')
    .gte('scheduled_at', now.toISOString())
    .lte('scheduled_at', upperBound.toISOString())
    .neq('status', 'ENCERRADA')
    .neq('status', 'CANCELADA')
    .order('scheduled_at', { ascending: true })

  if (options.tenantId) query = query.eq('tenant_id', options.tenantId)

  const { data: matches, error } = await query
  if (error) throw error

  for (const match of (matches ?? []) as unknown as MatchRow[]) {
    const stage = currentReminderStage(match.scheduled_at, now)
    if (!stage) continue

    summary.matchesChecked += 1

    try {
      if (stage.template === 'CONFIRMACAO_72H') {
        if (await openMatchIfScheduled(match)) summary.matchesOpened += 1
        summary.invitationsCreated += await ensureInvitations(match)
      }

      const pendingAttendance = await getPendingAttendance(match.id)
      const alreadySent = await getAlreadySentPlayerIds(match.id, stage.template)

      for (const attendance of pendingAttendance) {
        if (attendance.player?.status !== 'ATIVO') {
          summary.skippedWithoutWhatsapp += 1
          continue
        }

        if (alreadySent.has(attendance.player_id)) {
          summary.skippedAlreadySent += 1
          continue
        }

        const phone = attendance.player?.whatsapp?.replace(/\D/g, '')
        if (!phone) {
          summary.skippedWithoutWhatsapp += 1
          continue
        }

        try {
          const message = buildConfirmationMessage(match, attendance, stage)
          if (await wasConfirmationAlreadySent(match, attendance, stage.template, message)) {
            summary.skippedAlreadySent += 1
            continue
          }
          await sendWhatsAppMessage({
            tenant_id: match.tenant_id,
            match_id: match.id,
            player_id: attendance.player_id,
            phone,
            type: 'CONFIRMACAO',
            template: stage.template,
            message,
            metadata: {
              stage: stage.label,
              hours_before: stage.hoursBefore,
              scheduled_at: match.scheduled_at,
              pickup_id: match.pickup_id,
              template_parameters: buildConfirmationTemplateParameters(match, attendance),
            },
          })
          summary.remindersSent += 1
        } catch (sendError) {
          summary.errors.push({
            matchId: match.id,
            playerId: attendance.player_id,
            message: sendError instanceof Error ? sendError.message : 'Falha ao enviar lembrete.',
          })
        }
      }
    } catch (matchError) {
      summary.errors.push({
        matchId: match.id,
        message: matchError instanceof Error ? matchError.message : 'Falha ao processar evento.',
      })
    }
  }

  return summary
}

export async function sendConfirmationForMatch(matchId: string, tenantId?: string | null): Promise<MatchConfirmationSummary> {
  const match = await getMatchForConfirmation(matchId, tenantId)
  const template = `CONFIRMACAO_MANUAL_${Date.now()}`
  const summary: MatchConfirmationSummary = {
    matchId: match.id,
    invitationsCreated: 0,
    remindersSent: 0,
    skippedAlreadySent: 0,
    skippedWithoutWhatsapp: 0,
    errors: [],
  }

  if (await openMatchIfScheduled(match)) {
    // The manual sender opens the event before delivering the approved template.
  }

  summary.invitationsCreated = await ensureInvitations(match)
  const pendingAttendance = await getPendingAttendance(match.id)

  for (const attendance of pendingAttendance) {
    if (attendance.player?.status !== 'ATIVO') {
      summary.skippedWithoutWhatsapp += 1
      continue
    }

    const phone = attendance.player?.whatsapp?.replace(/\D/g, '')
    if (!phone) {
      summary.skippedWithoutWhatsapp += 1
      continue
    }

    try {
      const message = buildConfirmationMessage(match, attendance, confirmationReminderStages[0])
      await sendWhatsAppMessage({
        tenant_id: match.tenant_id,
        match_id: match.id,
        player_id: attendance.player_id,
        phone,
        type: 'CONFIRMACAO',
        template,
        message,
        metadata: {
          stage: 'manual',
          scheduled_at: match.scheduled_at,
          pickup_id: match.pickup_id,
          template_parameters: buildConfirmationTemplateParameters(match, attendance),
        },
      })
      summary.remindersSent += 1
    } catch (sendError) {
      summary.errors.push({
        matchId: match.id,
        playerId: attendance.player_id,
        message: getErrorMessage(sendError, 'Falha ao enviar convocacao.'),
      })
    }
  }

  return summary
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message
  }
  return fallback
}

let running = false
let timer: ReturnType<typeof setInterval> | null = null

export function startConfirmationReminderWorker() {
  if (!env.REMINDER_WORKER_ENABLED || timer) return

  const intervalMs = env.REMINDER_INTERVAL_MINUTES * 60 * 1000
  const tick = async () => {
    if (running) return
    running = true
    try {
      const summary = await runConfirmationReminderJob()
      if (summary.matchesChecked || summary.remindersSent || summary.errors.length) {
        console.log('Confirmation reminder job', summary)
      }
    } catch (error) {
      console.error('Confirmation reminder job failed', error)
    } finally {
      running = false
    }
  }

  timer = setInterval(tick, intervalMs)
  setTimeout(tick, 10_000)
}
