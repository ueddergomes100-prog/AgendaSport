import { supabase } from './supabase'
import type { Attendance, Company, DashboardStats, Match, MatchTeamResult, Pickup, Player, PlayerStatRow, Profile, TeamDrawRecord } from './types'

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
  const { data, error } = await supabase
    .from('match_player_stats')
    .select('*, player:players(id, name, primary_position, photo_url), match:matches(id, scheduled_at, team_a_name, team_b_name)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function getMatchPlayerStats(matchId: string): Promise<PlayerStatRow[]> {
  const { data, error } = await supabase
    .from('match_player_stats')
    .select('*, player:players(id, name, primary_position, photo_url), match:matches(id, scheduled_at, team_a_name, team_b_name)')
    .eq('match_id', matchId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
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

export async function saveTeamDraw(matchId: string, payload: unknown) {
  const tenantId = await getMatchTenantId(matchId)
  const { error } = await supabase.from('team_draws').insert({ tenant_id: tenantId, match_id: matchId, payload })
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
  })
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
  const { error } = await supabase.from('players').insert({ ...input, tenant_id: profile.tenant_id })
  if (error) throw error
}

export async function updatePlayer(id: string, input: Partial<Player>) {
  const { error } = await supabase.from('players').update(input).eq('id', id)
  if (error) throw error
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

export async function publicRegisterPlayer(input: { token: string; name: string; whatsapp: string; kind: 'GOLEIRO' | 'LINHA' }) {
  const { data, error } = await supabase.rpc('public_register_player', {
    p_token: input.token,
    p_name: input.name,
    p_whatsapp: input.whatsapp,
    p_position_kind: input.kind,
  })
  if (error) throw error
  return data
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
