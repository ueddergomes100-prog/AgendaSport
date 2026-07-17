import { supabase } from './supabase'
import { toDbPosition } from './positions'
import type {
  Attendance,
  BillingSettings,
  Company,
  CompletedMatchSheet,
  ConfirmationSchedule,
  DashboardStats,
  FinanceTransaction,
  Match,
  MatchTeamResult,
  Payment,
  Pickup,
  Player,
  PlayerStatRow,
  Profile,
  TeamDrawRecord,
  TeamPermissions,
  TeamUser,
  UserRole,
} from './types'

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

function apiUrl(path: string) {
  return `${apiBaseUrl}${path}`
}

export async function getProfile(): Promise<Profile | null> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return null
  const { data, error } = await supabase.from('profiles').select('*').eq('id', auth.user.id).single()
  if (error) throw error
  return data
}

async function requireTenantProfile() {
  const profile = await getProfile()
  if (!profile) throw new Error('Sessao expirada. Faca login novamente.')
  if (profile.role === 'SUPER_ADMIN') {
    throw new Error('Super Admin gerencia empresas. Entre com o admin da empresa para cadastrar participantes, eventos e equipes.')
  }
  if (!profile.tenant_id) throw new Error('Usuario sem empresa vinculada. Crie o acesso da empresa pelo Super Admin.')
  return profile
}

async function getMatchTenantId(matchId: string) {
  const { data, error } = await supabase.from('matches').select('tenant_id').eq('id', matchId).single()
  if (error) throw error
  return data.tenant_id
}

export async function getCompanies(): Promise<Company[]> {
  const { data, error } = await supabase.from('companies').select('*').order('name')
  if (error) throw error
  return data ?? []
}

export async function getCurrentCompany(): Promise<Company | null> {
  const profile = await getProfile()
  if (!profile?.tenant_id) return null
  const { data, error } = await supabase.from('companies').select('*').eq('id', profile.tenant_id).single()
  if (error) throw error
  return data
}

export async function getPlayers(): Promise<Player[]> {
  const { data, error } = await supabase.from('players').select('*').order('name')
  if (error) throw error
  return data ?? []
}

export async function getPickups(): Promise<Pickup[]> {
  const { data, error } = await supabase.from('pickups').select('*').order('weekday')
  if (error) throw error
  return data ?? []
}

export async function getMatches(): Promise<Match[]> {
  const { data, error } = await supabase.from('matches').select('*').order('scheduled_at', { ascending: false })
  if (error) throw error
  return (data ?? []).filter((match) => !isOrphanAutomaticMatch(match))
}

function isOrphanAutomaticMatch(match: Pick<Match, 'pickup_id' | 'notes'>) {
  return !match.pickup_id && (match.notes ?? '').trim().toLowerCase().startsWith('agenda automatica:')
}

export async function getPlayerStats(): Promise<PlayerStatRow[]> {
  return selectPlayerStats()
}

export async function getCompletedMatchSheets(): Promise<CompletedMatchSheet[]> {
  const { data: closedMatchesData, error: closedMatchesError } = await supabase
    .from('matches')
    .select('*')
    .eq('status', 'ENCERRADA')
    .order('scheduled_at', { ascending: false })
  if (closedMatchesError) throw closedMatchesError

  const stats = await selectPlayerStats()

  const closedMatches = (closedMatchesData ?? []) as Match[]
  const matchIds = unique([
    ...closedMatches.map((match) => match.id),
    ...stats.map((row) => row.match_id),
  ])
  if (!matchIds.length) return []

  const { data: matchesData, error: matchesError } = await supabase
    .from('matches')
    .select('*')
    .in('id', matchIds)
    .order('scheduled_at', { ascending: false })
  if (matchesError) throw matchesError

  const { data: attendanceData, error: attendanceError } = await supabase
    .from('attendance')
    .select('*, player:players(id, name, primary_position, photo_url)')
    .in('match_id', matchIds)
  if (attendanceError) throw attendanceError

  const matches = (matchesData ?? []) as Match[]
  const attendance = (attendanceData ?? []) as Array<Attendance & { player?: Pick<Player, 'id' | 'name' | 'primary_position' | 'photo_url'> }>
  const statsByMatch = groupBy(stats, (row) => row.match_id)
  const attendanceByMatch = groupBy(attendance, (row) => row.match_id)

  return matches.filter((match) => match.status === 'ENCERRADA' || (statsByMatch.get(match.id)?.length ?? 0) > 0).map((match) => {
    const savedRows = statsByMatch.get(match.id) ?? []
    const savedByPlayer = new Map(savedRows.map((row) => [row.player_id, row]))
    const consumedStats = new Set<string>()

    const rowsFromAttendance = (attendanceByMatch.get(match.id) ?? []).map((attendanceRow) => {
      const saved = savedByPlayer.get(attendanceRow.player_id)
      if (saved) {
        consumedStats.add(saved.player_id)
        return saved
      }

      return createStatsRowFromAttendance(match, attendanceRow)
    })

    const rowsOnlyInStats = savedRows.filter((row) => !consumedStats.has(row.player_id))
    const rows = [...rowsFromAttendance, ...rowsOnlyInStats].sort((left, right) =>
      (left.player?.name ?? '').localeCompare(right.player?.name ?? '', 'pt-BR', { sensitivity: 'base' }),
    )

    return {
      match,
      rows,
      hasSavedStats: savedRows.length > 0,
    }
  })
}

export async function getMatchPlayerStats(matchId: string): Promise<PlayerStatRow[]> {
  return selectPlayerStats(matchId)
}

async function selectPlayerStats(matchId?: string): Promise<PlayerStatRow[]> {
  let query = supabase
    .from('match_player_stats')
    .select('*, player:players(id, name, primary_position, photo_url), match:matches(id, scheduled_at, team_a_name, team_b_name, team_results, notes)')
    .order('created_at', { ascending: false })

  if (matchId) query = query.eq('match_id', matchId)

  const { data, error } = await query
  if (!error) return data ?? []
  if (!isMissingColumnError(error.message, 'team_results')) throw error

  let legacyQuery = supabase
    .from('match_player_stats')
    .select('*, player:players(id, name, primary_position, photo_url), match:matches(id, scheduled_at, team_a_name, team_b_name, notes)')
    .order('created_at', { ascending: false })

  if (matchId) legacyQuery = legacyQuery.eq('match_id', matchId)

  const { data: legacyData, error: legacyError } = await legacyQuery
  if (legacyError) throw legacyError
  return (legacyData ?? []).map((row) => ({
    ...row,
    match: row.match ? { ...row.match, team_results: null } : row.match,
  })) as PlayerStatRow[]
}

function createStatsRowFromAttendance(
  match: Match,
  attendance: Attendance & { player?: Pick<Player, 'id' | 'name' | 'primary_position' | 'photo_url'> },
): PlayerStatRow {
  return {
    id: `attendance-${attendance.id}`,
    tenant_id: attendance.tenant_id,
    match_id: match.id,
    player_id: attendance.player_id,
    goals: 0,
    assists: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    present: attendance.status === 'COMPARECEU' || attendance.status === 'CONFIRMADO',
    created_at: attendance.responded_at ?? match.scheduled_at,
    player: attendance.player,
    match: {
      id: match.id,
      scheduled_at: match.scheduled_at,
      team_a_name: match.team_a_name,
      team_b_name: match.team_b_name,
      team_results: match.team_results ?? null,
      notes: match.notes,
    },
  }
}

function groupBy<T, K>(items: T[], keyGetter: (item: T) => K) {
  const map = new Map<K, T[]>()
  items.forEach((item) => {
    const key = keyGetter(item)
    const group = map.get(key) ?? []
    group.push(item)
    map.set(key, group)
  })
  return map
}

function unique<T>(items: T[]) {
  return [...new Set(items)]
}

export async function getLatestTeamDraw(matchId: string): Promise<TeamDrawRecord | null> {
  const { data, error } = await supabase
    .from('team_draws')
    .select('id, tenant_id, match_id, payload, created_at')
    .eq('match_id', matchId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data as TeamDrawRecord | null
}

export async function getAttendance(matchId: string): Promise<Attendance[]> {
  const { data, error } = await supabase
    .from('attendance')
    .select('*, player:players(*)')
    .eq('match_id', matchId)
    .order('queue_position', { ascending: true, nullsFirst: false })
  if (error) throw error
  return data ?? []
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const { data, error } = await supabase.rpc('get_dashboard_stats')
  if (error) throw error
  return data
}

export async function getPayments(): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('*, player:players(id, name, whatsapp)')
    .order('due_date', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createPayment(input: Partial<Payment>) {
  const profile = await requireTenantProfile()
  const payload = { ...input, tenant_id: profile.tenant_id }
  const { data, error } = await supabase.from('payments').insert(payload).select().single()
  if (error) throw error
  return data as Payment
}

export async function updatePayment(id: string, input: Partial<Payment>) {
  const { error } = await supabase.from('payments').update(input).eq('id', id)
  if (error) throw error
}

export async function getFinanceTransactions(): Promise<FinanceTransaction[]> {
  const { data: session } = await supabase.auth.getSession()
  const token = session.session?.access_token
  if (!token) throw new Error('Sessao expirada. Faca login novamente.')

  const response = await fetch(apiUrl('/api/finance/transactions'), {
    headers: { Authorization: `Bearer ${token}` },
  })
  const payload = await response.json().catch(() => [])
  if (!response.ok) throw new Error(payload.error ?? 'Nao foi possivel carregar as movimentacoes financeiras.')
  return payload
}

export async function createFinanceTransaction(input: Partial<FinanceTransaction>) {
  const { data: session } = await supabase.auth.getSession()
  const token = session.session?.access_token
  if (!token) throw new Error('Sessao expirada. Faca login novamente.')

  const response = await fetch(apiUrl('/api/finance/transactions'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error ?? 'Nao foi possivel cadastrar a movimentacao financeira.')
  return payload as FinanceTransaction
}

export async function updateFinanceTransaction(id: string, input: Partial<FinanceTransaction>) {
  const { data: session } = await supabase.auth.getSession()
  const token = session.session?.access_token
  if (!token) throw new Error('Sessao expirada. Faca login novamente.')

  const response = await fetch(apiUrl(`/api/finance/transactions/${id}`), {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error ?? 'Nao foi possivel atualizar a movimentacao financeira.')
}

export async function deleteFinanceTransaction(id: string) {
  const { data: session } = await supabase.auth.getSession()
  const token = session.session?.access_token
  if (!token) throw new Error('Sessao expirada. Faca login novamente.')

  const response = await fetch(apiUrl(`/api/finance/transactions/${id}`), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload.error ?? 'Nao foi possivel remover a movimentacao financeira.')
  }
}

export async function getConfirmationSchedules(): Promise<ConfirmationSchedule[]> {
  const profile = await requireTenantProfile()
  const tenantId = profile.tenant_id as string
  const { data, error } = await supabase
    .from('confirmation_schedules')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('stage_number')
  if (error && isMissingRelationError(error.message, 'confirmation_schedules')) return defaultConfirmationSchedules(tenantId)
  if (error) throw error
  return data?.length ? data : defaultConfirmationSchedules(tenantId)
}

export async function saveConfirmationSchedules(rows: Array<Pick<ConfirmationSchedule, 'stage_number' | 'days_before' | 'send_time' | 'enabled'>>) {
  const profile = await requireTenantProfile()
  const payload = rows.map((row) => ({
    tenant_id: profile.tenant_id,
    stage_number: row.stage_number,
    days_before: row.days_before,
    send_time: row.send_time,
    enabled: row.enabled,
  }))
  const { error } = await supabase.from('confirmation_schedules').upsert(payload, { onConflict: 'tenant_id,stage_number' })
  if (error && isMissingRelationError(error.message, 'confirmation_schedules')) {
    throw new Error('A tabela de etapas de convocacao ainda nao existe no Supabase. Rode o patch SQL de producao e tente novamente.')
  }
  if (error) throw error
}

export async function getBillingSettings(): Promise<BillingSettings | null> {
  const profile = await requireTenantProfile()
  const { data, error } = await supabase
    .from('billing_settings')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle()
  if (error && isMissingRelationError(error.message, 'billing_settings')) return null
  if (error) throw error
  return data as BillingSettings | null
}

export async function saveBillingSettings(input: Pick<BillingSettings, 'monthly_billing_day' | 'default_provider' | 'auto_charge_casual_players'>) {
  const profile = await requireTenantProfile()
  const { data, error } = await supabase
    .from('billing_settings')
    .upsert({ ...input, tenant_id: profile.tenant_id, updated_at: new Date().toISOString() }, { onConflict: 'tenant_id' })
    .select()
    .single()
  if (error) throw error
  return data as BillingSettings
}

export async function runMonthlyBilling(): Promise<{ created: number; skipped: number; amount: number; due_date: string }> {
  const { data: session } = await supabase.auth.getSession()
  const token = session.session?.access_token
  if (!token) throw new Error('Sessao expirada. Faca login novamente.')
  const response = await fetch(apiUrl('/api/billing/monthly/run'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error ?? 'Nao foi possivel gerar mensalidades.')
  return data
}

export async function saveTeamDraw(matchId: string, payload: unknown) {
  const { data: match, error: matchError } = await supabase.from('matches').select('tenant_id, status').eq('id', matchId).single()
  if (matchError) throw matchError
  if (match.status === 'ENCERRADA' || match.status === 'CANCELADA') {
    throw new Error('Nao e possivel montar equipes para um evento encerrado ou cancelado.')
  }

  const { error } = await supabase.from('team_draws').insert({ tenant_id: match.tenant_id, match_id: matchId, payload })
  if (error) throw error
}

export async function upsertAttendance(matchId: string, playerId: string, status: Attendance['status']) {
  if (status === 'ESPERA') {
    await upsertWaitlistAttendance(matchId, playerId)
    return
  }

  const { error } = await supabase.rpc('set_attendance_response', {
    p_match_id: matchId,
    p_player_id: playerId,
    p_status: status,
    p_source: 'MANUAL',
  })
  if (error && error.message.includes('Could not find the function')) {
    const { error: legacyError } = await supabase.rpc('set_attendance_response', {
      p_match_id: matchId,
      p_player_id: playerId,
      p_status: status,
    })
    if (legacyError) throw legacyError
    return
  }
  if (error) throw error
}

async function upsertWaitlistAttendance(matchId: string, playerId: string) {
  const tenantId = await getMatchTenantId(matchId)
  const { data: current, error: currentError } = await supabase
    .from('attendance')
    .select('status')
    .eq('match_id', matchId)
    .eq('player_id', playerId)
    .maybeSingle()
  if (currentError) throw currentError

  const { data: queued, error: queueError } = await supabase
    .from('attendance')
    .select('queue_position')
    .eq('match_id', matchId)
    .eq('status', 'ESPERA')
    .order('queue_position', { ascending: false, nullsFirst: false })
    .limit(1)
  if (queueError) throw queueError

  const nextQueuePosition = Number(queued?.[0]?.queue_position ?? 0) + 1
  const { error } = await supabase.from('attendance').upsert(
    {
      tenant_id: tenantId,
      match_id: matchId,
      player_id: playerId,
      status: 'ESPERA',
      responded_at: new Date().toISOString(),
      queue_position: nextQueuePosition,
    },
    { onConflict: 'match_id,player_id' },
  )
  if (error) throw error

  if (['CONFIRMADO', 'COMPARECEU'].includes(current?.status ?? '')) {
    await supabase.rpc('promote_waitlist', { p_match_id: matchId })
  }
}

export async function invitePlayersToMatch(matchId: string, playerIds: string[]) {
  await Promise.all(playerIds.map((playerId) => upsertAttendance(matchId, playerId, 'CONVIDADO')))
}

export async function createPlayer(input: Partial<Player>) {
  const profile = await requireTenantProfile()
  const tenantId = profile.tenant_id!
  const payload = await preparePlayerPayload(input, tenantId)
  const { error } = await supabase.from('players').insert({ ...payload, tenant_id: tenantId })
  if (error && isMissingColumnError(error.message, 'confirmation_stage')) {
    const { error: legacyError } = await supabase.from('players').insert({ ...withoutConfirmationStage(payload), tenant_id: tenantId })
    if (legacyError) throw legacyError
    return
  }
  if (error) throw error
}

export async function updatePlayer(id: string, input: Partial<Player>) {
  const profile = await requireTenantProfile()
  const tenantId = profile.tenant_id!
  const payload = await preparePlayerPayload(input, tenantId, id)
  const { error } = await supabase.from('players').update(payload).eq('id', id)
  if (error && isMissingColumnError(error.message, 'confirmation_stage')) {
    const { error: legacyError } = await supabase.from('players').update(withoutConfirmationStage(payload)).eq('id', id)
    if (legacyError) throw legacyError
    return
  }
  if (error) throw error
}

async function preparePlayerPayload(input: Partial<Player>, tenantId: string, currentPlayerId?: string) {
  const firstName = (input.first_name ?? '').trim()
  const lastName = (input.last_name ?? '').trim()
  if (firstName.length < 2) throw new Error('Informe o nome do participante.')
  if (lastName.length < 2) throw new Error('Informe o sobrenome do participante.')

  const whatsapp = (input.whatsapp ?? '').trim()
  const normalized = normalizeWhatsApp(whatsapp)
  if (!normalized) throw new Error('Informe um WhatsApp valido com DDD.')
  await assertUniquePlayerPhone(tenantId, normalized, currentPlayerId)

  const status = input.status ?? 'ATIVO'
  return {
    ...input,
    first_name: firstName,
    last_name: lastName,
    name: `${firstName} ${lastName}`.trim(),
    whatsapp,
    whatsapp_normalized: normalized,
    confirmation_stage: clampConfirmationStage(input.confirmation_stage),
    primary_position: toDbPosition(input.primary_position),
    status,
    suspended_at: status === 'SUSPENSO' ? (input.suspended_at ?? new Date().toISOString()) : null,
    suspension_reason: status === 'SUSPENSO' ? (input.suspension_reason ?? input.notes ?? null) : null,
    suspended_until: status === 'SUSPENSO' ? (input.suspended_until ?? null) : null,
  }
}

function clampConfirmationStage(value: unknown) {
  const parsed = Number(value ?? 1)
  if (!Number.isFinite(parsed)) return 1
  return Math.max(1, Math.min(5, Math.trunc(parsed)))
}

function withoutConfirmationStage<T extends { confirmation_stage?: unknown }>(payload: T) {
  const { confirmation_stage: _confirmationStage, ...legacyPayload } = payload
  void _confirmationStage
  return legacyPayload
}

async function assertUniquePlayerPhone(tenantId: string, normalized: string, currentPlayerId?: string) {
  const { data, error } = await supabase
    .from('players')
    .select('id, whatsapp, whatsapp_normalized')
    .eq('tenant_id', tenantId)
  if (error) throw error

  const duplicate = (data ?? []).find((player) => {
    if (player.id === currentPlayerId) return false
    return (player.whatsapp_normalized || normalizeWhatsApp(player.whatsapp ?? '')) === normalized
  })

  if (duplicate) throw new Error('Este WhatsApp ja esta cadastrado nesta empresa.')
}

export async function deletePlayer(id: string) {
  const { error } = await supabase.from('players').delete().eq('id', id)
  if (error) throw error
}

export async function createPickup(input: Partial<Pickup>): Promise<Pickup> {
  const profile = await requireTenantProfile()
  const { data, error } = await supabase.from('pickups').insert({ ...input, tenant_id: profile.tenant_id }).select().single()
  if (error) throw error
  return data
}

export async function updatePickup(id: string, input: Partial<Pickup>) {
  const { error } = await supabase.from('pickups').update(input).eq('id', id)
  if (error) throw error
}

export async function deletePickup(id: string) {
  const { data: matches, error: matchListError } = await supabase.from('matches').select('id').eq('pickup_id', id)
  if (matchListError) throw matchListError

  const matchIds = (matches ?? []).map((match) => match.id)
  if (matchIds.length) {
    await deleteMatchChildren(matchIds)
  }

  const { error: matchesError } = matchIds.length
    ? await supabase.from('matches').delete().in('id', matchIds)
    : { error: null }
  if (matchesError) throw matchesError

  const { error: pickupError } = await supabase.from('pickups').delete().eq('id', id)
  if (pickupError) throw pickupError
}

export async function deleteMatch(id: string) {
  await deleteMatchChildren([id])

  const { error } = await supabase.from('matches').delete().eq('id', id)
  if (error) throw error
}

async function deleteMatchChildren(matchIds: string[]) {
  if (!matchIds.length) return

  for (const table of ['match_player_stats', 'team_draws', 'attendance'] as const) {
    const { error } = await supabase.from(table).delete().in('match_id', matchIds)
    if (error) throw error
  }

  const { error: messageLogError } = await supabase.from('message_logs').delete().in('match_id', matchIds)
  if (messageLogError && !isMissingColumnError(messageLogError.message, 'match_id')) throw messageLogError
}

function isMissingColumnError(message: string, column: string) {
  return message.includes(column) && (message.includes('column') || message.includes('schema cache'))
}

function isMissingRelationError(message: string, relation: string) {
  return message.includes(relation) && (message.includes('schema cache') || message.includes('does not exist') || message.includes('Could not find'))
}

function defaultConfirmationSchedules(tenantId: string): ConfirmationSchedule[] {
  return [
    { stage_number: 1, days_before: 2, send_time: '16:00', enabled: true },
    { stage_number: 2, days_before: 2, send_time: '18:00', enabled: true },
    { stage_number: 3, days_before: 1, send_time: '16:00', enabled: true },
    { stage_number: 4, days_before: 0, send_time: '09:00', enabled: true },
    { stage_number: 5, days_before: 0, send_time: '18:00', enabled: false },
  ].map((row) => ({
    id: `default-${row.stage_number}`,
    tenant_id: tenantId,
    created_at: new Date().toISOString(),
    ...row,
  }))
}

export async function createMatch(input: Partial<Match>): Promise<Match> {
  const profile = await requireTenantProfile()
  const { data, error } = await supabase.from('matches').insert({ ...input, tenant_id: profile.tenant_id }).select().single()
  if (error) throw error
  return data
}

export async function createMatches(inputs: Partial<Match>[]): Promise<Match[]> {
  if (!inputs.length) return []
  const profile = await requireTenantProfile()
  const payload = inputs.map((input) => ({ ...input, tenant_id: profile.tenant_id }))
  const { data, error } = await supabase.from('matches').insert(payload).select()
  if (error) throw error
  return data ?? []
}

export async function updateMatch(id: string, input: Partial<Match>) {
  const { error } = await supabase.from('matches').update(input).eq('id', id)
  if (error) throw error
}

export async function savePostMatchStats(
  matchId: string,
  matchInput: Pick<Match, 'team_a_score' | 'team_b_score' | 'status'> & { team_results?: MatchTeamResult[] },
  rows: Array<{ playerId: string; goals: number; assists: number; present: boolean; wins?: number; draws?: number; losses?: number }>,
) {
  const tenantId = await getMatchTenantId(matchId)

  const { error: matchError } = await supabase.from('matches').update(matchInput).eq('id', matchId)
  if (matchError) {
    const message = matchError.message ?? ''
    if (message.includes('team_results')) {
      const legacyMatchInput = { ...matchInput }
      delete legacyMatchInput.team_results
      const { error: legacyMatchError } = await supabase.from('matches').update(legacyMatchInput).eq('id', matchId)
      if (legacyMatchError) throw legacyMatchError
    } else {
      throw matchError
    }
  }

  if (!rows.length) return

  const payload = rows.map((row) => ({
    tenant_id: tenantId,
    match_id: matchId,
    player_id: row.playerId,
    goals: row.goals,
    assists: row.assists,
    present: row.present,
    wins: row.wins ?? 0,
    draws: row.draws ?? 0,
    losses: row.losses ?? 0,
  }))

  const { error } = await supabase.from('match_player_stats').upsert(payload, { onConflict: 'match_id,player_id' })
  if (error) throw error
}

export async function createCompany(input: Partial<Company>) {
  const { data, error } = await supabase.from('companies').insert(input).select().single()
  if (error) throw error
  return data as Company
}

export async function updateCompany(id: string, input: Partial<Company>) {
  const { error } = await supabase.from('companies').update(input).eq('id', id)
  if (error) throw error
}

export async function deleteCompanyData(id: string) {
  const { error: profilesError } = await supabase.from('profiles').delete().eq('tenant_id', id)
  if (profilesError) throw profilesError

  const { error } = await supabase.from('companies').delete().eq('id', id)
  if (error) throw error
}

export async function getPublicRegistrationCompany(token: string): Promise<Pick<Company, 'name' | 'status' | 'registration_enabled'> | null> {
  const { data, error } = await supabase.rpc('get_registration_company', { p_token: token })
  if (error) throw error
  return data
}

export async function publicRegisterPlayer(input: { token: string; firstName: string; lastName: string; whatsapp: string; kind: 'GOLEIRO' | 'LINHA' }) {
  const response = await fetch(apiUrl(`/api/public-registration/${input.token}/players`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      first_name: input.firstName,
      last_name: input.lastName,
      whatsapp: input.whatsapp,
      position_kind: input.kind,
    }),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error ?? 'Nao foi possivel concluir sua inscricao.')
  return payload
}

export async function createCompanyAdminUser(input: { companyId: string; fullName: string; email: string; password: string; role: 'ADMINISTRADOR' | 'ORGANIZADOR' | 'OPERADOR' }) {
  const { data: session } = await supabase.auth.getSession()
  const token = session.session?.access_token
  if (!token) throw new Error('Sessao expirada. Faca login novamente.')

  const response = await fetch(apiUrl(`/api/admin/companies/${input.companyId}/admin-user`), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      full_name: input.fullName,
      email: input.email,
      password: input.password,
      role: input.role,
    }),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error ?? 'Nao foi possivel criar o acesso.')
  return payload
}

export async function getCompanyTeamUsers(): Promise<TeamUser[]> {
  const { data: session } = await supabase.auth.getSession()
  const token = session.session?.access_token
  if (!token) throw new Error('Sessao expirada. Faca login novamente.')

  const response = await fetch(apiUrl('/api/company/users'), {
    headers: { Authorization: `Bearer ${token}` },
  })
  const payload = await response.json().catch(() => [])
  if (!response.ok) throw new Error(payload.error ?? 'Nao foi possivel carregar os acessos da equipe.')
  return payload
}

export async function createCompanyTeamUser(input: {
  fullName: string
  email: string
  password: string
  role: Extract<UserRole, 'ADMINISTRADOR' | 'ORGANIZADOR' | 'OPERADOR'>
  permissions: TeamPermissions
}) {
  const { data: session } = await supabase.auth.getSession()
  const token = session.session?.access_token
  if (!token) throw new Error('Sessao expirada. Faca login novamente.')

  const response = await fetch(apiUrl('/api/company/users'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      full_name: input.fullName,
      email: input.email,
      password: input.password,
      role: input.role,
      permissions: input.permissions,
    }),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error ?? 'Nao foi possivel criar o acesso.')
  return payload
}

export async function updateCompanyTeamUser(input: {
  id: string
  fullName?: string
  role?: Extract<UserRole, 'ADMINISTRADOR' | 'ORGANIZADOR' | 'OPERADOR'>
  permissions?: TeamPermissions
}) {
  const { data: session } = await supabase.auth.getSession()
  const token = session.session?.access_token
  if (!token) throw new Error('Sessao expirada. Faca login novamente.')

  const response = await fetch(apiUrl(`/api/company/users/${input.id}`), {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      full_name: input.fullName,
      role: input.role,
      permissions: input.permissions,
    }),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error ?? 'Nao foi possivel atualizar o acesso.')
  return payload
}

export async function sendMatchConfirmations(matchId: string): Promise<{
  invitationsCreated: number
  remindersSent: number
  skippedAlreadySent: number
  skippedWithoutWhatsapp: number
  errors: Array<{ matchId?: string; playerId?: string; message: string }>
}> {
  const { data: session } = await supabase.auth.getSession()
  const token = session.session?.access_token
  if (!token) throw new Error('Sessao expirada. Faca login novamente.')

  const response = await fetch(apiUrl(`/api/matches/${matchId}/confirmations/send`), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error ?? 'Nao foi possivel enviar a convocacao pelo WhatsApp.')
  return payload
}

export function normalizeWhatsApp(value: string) {
  const digits = value.replace(/\D/g, '')
  if (digits.length < 10) return ''
  const local = digits.startsWith('55') ? digits.slice(2) : digits
  if (local.length === 11 && local[2] === '9') return `${local.slice(0, 2)}${local.slice(3)}`
  return local
}
