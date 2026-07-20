import { adminSupabase } from './supabase.js'
import { sendWhatsAppMessage } from './whatsapp.js'

export async function sendConfiguredGroupMessage(
  tenantId: string,
  message: string,
  metadata: Record<string, unknown> = {},
) {
  const { data: integration, error } = await adminSupabase
    .from('company_integrations')
    .select('whatsapp_group_enabled, whatsapp_group_id')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error && isMissingIntegrationTable(error.message)) return { status: 'SKIPPED_NOT_CONFIGURED' }
  if (error) throw error
  if (!integration?.whatsapp_group_enabled || !integration.whatsapp_group_id?.trim()) {
    return { status: 'SKIPPED_NOT_CONFIGURED' }
  }

  return sendWhatsAppMessage({
    tenant_id: tenantId,
    phone: integration.whatsapp_group_id.trim(),
    type: 'LEMBRETE',
    template: null,
    message,
    recipient_type: 'group',
    metadata: {
      ...metadata,
      source: 'official_whatsapp_group',
    },
  })
}

export async function notifyGroupAttendanceUpdate({
  tenantId,
  matchId,
  playerId,
  status,
}: {
  tenantId: string
  matchId: string
  playerId: string
  status: string
}) {
  const [{ data: player }, { data: match }, { data: attendance, error: attendanceError }] = await Promise.all([
    adminSupabase.from('players').select('name').eq('id', playerId).eq('tenant_id', tenantId).maybeSingle(),
    adminSupabase
      .from('matches')
      .select('scheduled_at, notes, pickup:pickups(name, place)')
      .eq('id', matchId)
      .eq('tenant_id', tenantId)
      .maybeSingle(),
    adminSupabase
      .from('attendance')
      .select('status, queue_position, player:players(name, primary_position)')
      .eq('match_id', matchId),
  ])

  if (attendanceError) throw attendanceError
  const rows = (attendance ?? []) as unknown as Array<{
    status: string
    queue_position: number | null
    player: { name: string; primary_position: string } | null
  }>
  const confirmed = rows
    .filter((row) => ['CONFIRMADO', 'COMPARECEU'].includes(row.status))
    .sort((left, right) => (left.player?.name ?? '').localeCompare(right.player?.name ?? '', 'pt-BR'))
  const waitlist = rows
    .filter((row) => row.status === 'ESPERA')
    .sort((left, right) => Number(left.queue_position ?? 9999) - Number(right.queue_position ?? 9999))

  const pickup = (match as unknown as { pickup?: { name?: string; place?: string } | null } | null)?.pickup
  const eventName = pickup?.name || match?.notes || 'Evento esportivo'
  const date = match?.scheduled_at
    ? new Date(match.scheduled_at).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
    : ''

  const message = [
    `Agenda Sport - ${eventName}`,
    date ? `Data: ${date}` : null,
    pickup?.place ? `Local: ${pickup.place}` : null,
    '',
    `${player?.name ?? 'Participante'}: ${statusLabel(status)}`,
    '',
    `Confirmados (${confirmed.length}):`,
    ...confirmed.map((row, index) => `${index + 1}. ${row.player?.name ?? 'Participante'}`),
    waitlist.length ? '' : null,
    waitlist.length ? `Fila de espera (${waitlist.length}):` : null,
    ...waitlist.map((row, index) => `${index + 1}. ${row.player?.name ?? 'Participante'}`),
  ].filter(Boolean).join('\n')

  return sendConfiguredGroupMessage(tenantId, message, {
    event: 'attendance_updated',
    match_id: matchId,
    player_id: playerId,
    attendance_status: status,
  })
}

export async function getWaitlistPlayerIds(matchId: string) {
  const { data, error } = await adminSupabase
    .from('attendance')
    .select('player_id')
    .eq('match_id', matchId)
    .eq('status', 'ESPERA')
  if (error) throw error
  return new Set((data ?? []).map((row) => row.player_id))
}

export async function notifyPromotedWaitlistPlayers(matchId: string, waitlistBefore: Set<string>) {
  if (!waitlistBefore.size) return
  const { data, error } = await adminSupabase
    .from('attendance')
    .select('tenant_id, player_id, status, player:players(name, whatsapp), match:matches(scheduled_at, notes, pickup:pickups(name))')
    .eq('match_id', matchId)
    .in('player_id', [...waitlistBefore])
    .eq('status', 'CONFIRMADO')
  if (error) throw error

  for (const row of data ?? []) {
    const typed = row as unknown as {
      tenant_id: string
      player_id: string
      player: { name: string; whatsapp: string | null } | null
      match: { scheduled_at: string; notes: string | null; pickup: { name: string } | null } | null
    }
    if (!typed.player?.whatsapp) continue
    const eventName = typed.match?.pickup?.name ?? typed.match?.notes ?? 'evento esportivo'
    const result = await sendWhatsAppMessage({
      tenant_id: typed.tenant_id,
      match_id: matchId,
      player_id: typed.player_id,
      phone: typed.player.whatsapp,
      type: 'LISTA_ESPERA',
      template: null,
      message: [
        'Agenda Sport - vaga liberada',
        '',
        `Ola, ${typed.player.name.split(' ')[0]}! Uma vaga foi liberada em ${eventName}.`,
        'Voce saiu da fila de espera e agora esta na lista principal de confirmados.',
      ].join('\n'),
      metadata: {
        source: 'automatic_waitlist_promotion',
      },
    })
    if (result.status === 'FAILED') {
      console.warn('[whatsapp] promoted player message failed', result.response)
    }
  }
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    CONFIRMADO: 'confirmou presenca',
    RECUSOU: 'nao vai participar',
    ESPERA: 'entrou na fila de espera',
    COMPARECEU: 'presenca registrada',
    FALTOU: 'falta registrada',
  }
  return labels[status] ?? status
}

function isMissingIntegrationTable(message: string) {
  return message.includes('company_integrations')
    && (message.includes('schema cache') || message.includes('does not exist') || message.includes('relation'))
}
