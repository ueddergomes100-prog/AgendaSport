export type UserRole = 'SUPER_ADMIN' | 'ADMINISTRADOR' | 'ORGANIZADOR' | 'OPERADOR' | 'JOGADOR'
export type PlanCode = 'Starter' | 'Pro' | 'Elite'
export type CompanyStatus = 'ATIVA' | 'BLOQUEADA' | 'TRIAL' | 'CANCELADA'
export type PlayerStatus = 'ATIVO' | 'INATIVO'
export type PlayerType = 'MENSALISTA' | 'AVULSO'
export type Position = 'Goleiro' | 'Linha' | 'Zagueiro' | 'Lateral' | 'Volante' | 'Meio Campo' | 'Atacante'
export type AttendanceStatus = 'CONVIDADO' | 'CONFIRMADO' | 'RECUSOU' | 'ESPERA' | 'COMPARECEU' | 'FALTOU'

export type Profile = {
  id: string
  tenant_id: string | null
  full_name: string
  role: UserRole
  phone: string | null
}

export type Company = {
  id: string
  registration_token: string
  registration_enabled: boolean
  name: string
  responsible_name: string
  phone: string | null
  whatsapp: string | null
  email: string
  city: string | null
  state: string | null
  plan_code: PlanCode
  due_date: string | null
  status: CompanyStatus
}

export type Player = {
  id: string
  tenant_id: string
  photo_url: string | null
  name: string
  phone: string | null
  whatsapp: string | null
  birth_date: string | null
  email: string | null
  notes: string | null
  status: PlayerStatus
  type: PlayerType
  technical_score: number
  primary_position: Position
  secondary_position: Position | null
}

export type Pickup = {
  id: string
  tenant_id: string
  name: string
  place: string
  address: string | null
  maps_url: string | null
  weekday: number
  start_time: string
  casual_price: number
  monthly_price: number
  max_players: number
  mensalista_priority_hours: number
}

export type Match = {
  id: string
  tenant_id: string
  pickup_id: string | null
  scheduled_at: string
  team_a_name: string
  team_b_name: string
  team_a_score: number | null
  team_b_score: number | null
  team_results: MatchTeamResult[] | null
  notes: string | null
  status: 'AGENDADA' | 'ABERTA' | 'ENCERRADA' | 'CANCELADA'
}

export type Attendance = {
  id: string
  tenant_id: string
  match_id: string
  player_id: string
  status: AttendanceStatus
  responded_at: string | null
  queue_position: number | null
  player?: Player
}

export type TeamDrawPlayer = Player & { attendance_id?: string }
export type TeamDrawTeam = {
  id: string
  name: string
  players: TeamDrawPlayer[]
  score: number
  targetSize: number
}
export type TeamDraw = {
  teams: TeamDrawTeam[]
  unassigned: TeamDrawPlayer[]
  scoreSpread: number
  percentageDiff: number
}

export type TeamDrawRecord = {
  id: string
  tenant_id: string
  match_id: string
  payload: TeamDraw
  created_at: string
}

export type MatchTeamResult = {
  id: string
  name: string
  score: number
  playerIds: string[]
}

export type DashboardStats = {
  next_match: string | null
  confirmed: number
  waitlist: number
  monthly_revenue: number
  annual_revenue: number
  overdue: number
  monthly_top_scorer: string | null
  most_frequent_player: string | null
}

export type PlayerStatRow = {
  id: string
  tenant_id: string
  match_id: string
  player_id: string
  goals: number
  assists: number
  wins: number
  draws: number
  losses: number
  present: boolean
  created_at: string
  player?: Pick<Player, 'id' | 'name' | 'primary_position' | 'photo_url'>
  match?: Pick<Match, 'id' | 'scheduled_at' | 'team_a_name' | 'team_b_name'>
}
