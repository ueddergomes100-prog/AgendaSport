export type UserRole = 'SUPER_ADMIN' | 'ADMINISTRADOR' | 'ORGANIZADOR' | 'OPERADOR' | 'JOGADOR'
export type PlanCode = 'Starter' | 'Pro' | 'Elite'
export type CompanyStatus = 'ATIVA' | 'BLOQUEADA' | 'TRIAL' | 'CANCELADA'
export type PlayerStatus = 'ATIVO' | 'INATIVO' | 'SUSPENSO'
export type PlayerType = 'MENSALISTA' | 'AVULSO'
export type Position = 'GOLEIRO' | 'LINHA' | 'Goleiro' | 'Linha'
export type AttendanceStatus = 'CONVIDADO' | 'CONFIRMADO' | 'RECUSOU' | 'ESPERA' | 'COMPARECEU' | 'FALTOU'
export type PaymentStatus = 'PENDENTE' | 'PAGO' | 'ATRASADO' | 'CANCELADO'
export type FinanceTransactionKind = 'RECEITA' | 'DESPESA'
export type FinanceTransactionStatus = 'CONFIRMADO' | 'PENDENTE' | 'CANCELADO'

export type Profile = {
  id: string
  tenant_id: string | null
  full_name: string
  role: UserRole
  phone: string | null
  permissions?: TeamPermissions | null
}

export type PermissionKey = 'confirmations' | 'stats' | 'finance' | 'settings'

export type TeamPermissions = Partial<Record<PermissionKey, boolean>>

export type TeamUser = Pick<Profile, 'id' | 'tenant_id' | 'full_name' | 'role' | 'phone' | 'permissions'> & {
  email: string | null
  created_at: string
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
  first_name: string | null
  last_name: string | null
  name: string
  phone: string | null
  whatsapp: string | null
  birth_date: string | null
  email: string | null
  notes: string | null
  status: PlayerStatus
  suspension_reason: string | null
  suspended_until: string | null
  suspended_at: string | null
  whatsapp_normalized: string | null
  confirmation_stage: number | null
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
  max_line_players: number | null
  max_goalkeepers: number | null
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
  max_line_players: number | null
  max_goalkeepers: number | null
  recurrence_until: string | null
  recurrence_weekday: number | null
  recurrence_start_time: string | null
  recurrence_months: number | null
  recurrence_source_match_id: string | null
}

export type Attendance = {
  id: string
  tenant_id: string
  match_id: string
  player_id: string
  status: AttendanceStatus
  responded_at: string | null
  queue_position: number | null
  response_source: 'WHATSAPP' | 'MANUAL' | 'SYSTEM' | string
  responded_by: string | null
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
  match?: Pick<Match, 'id' | 'scheduled_at' | 'team_a_name' | 'team_b_name' | 'team_results' | 'notes'>
}

export type CompletedMatchSheet = {
  match: Match
  rows: PlayerStatRow[]
  hasSavedStats: boolean
}

export type Payment = {
  id: string
  tenant_id: string
  player_id: string | null
  match_id: string | null
  provider: string
  amount: number
  due_date: string
  paid_at: string | null
  status: PaymentStatus
  checkout_url: string | null
  pix_code: string | null
  created_at: string
  player?: Pick<Player, 'id' | 'name' | 'whatsapp'>
}

export type FinanceTransaction = {
  id: string
  tenant_id: string
  player_id: string | null
  match_id: string | null
  payment_id: string | null
  kind: FinanceTransactionKind
  category: string
  description: string
  amount: number
  occurred_on: string
  status: FinanceTransactionStatus
  created_at: string
  player?: Pick<Player, 'id' | 'name'>
}

export type ConfirmationSchedule = {
  id: string
  tenant_id: string
  stage_number: number
  days_before: number
  send_time: string
  enabled: boolean
  created_at: string
}

export type BillingSettings = {
  id: string
  tenant_id: string
  monthly_billing_day: number
  default_provider: 'MANUAL_PIX' | 'ASAAS' | 'MERCADO_PAGO' | 'STONE' | 'VINDI'
  auto_charge_casual_players: boolean
  created_at: string
  updated_at: string
}
