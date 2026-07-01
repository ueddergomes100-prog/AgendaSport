create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references companies(id) on delete cascade,
  pickup_id uuid references pickups(id) on delete set null,
  scheduled_at timestamptz not null,
  team_a_name text not null default 'Time A',
  team_b_name text not null default 'Time B',
  team_a_score integer,
  team_b_score integer,
  team_results jsonb not null default '[]'::jsonb,
  notes text,
  status match_status not null default 'AGENDADA',
  created_at timestamptz not null default now()
);

create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references companies(id) on delete cascade,
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  status attendance_status not null default 'CONVIDADO',
  responded_at timestamptz,
  queue_position integer,
  created_at timestamptz not null default now(),
  unique (match_id, player_id)
);

create table if not exists team_draws (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references companies(id) on delete cascade,
  match_id uuid not null references matches(id) on delete cascade,
  payload jsonb not null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists match_player_stats (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references companies(id) on delete cascade,
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  goals integer not null default 0,
  assists integer not null default 0,
  wins integer not null default 0,
  draws integer not null default 0,
  losses integer not null default 0,
  present boolean not null default true,
  created_at timestamptz not null default now(),
  unique (match_id, player_id)
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references companies(id) on delete cascade,
  player_id uuid references players(id) on delete set null,
  match_id uuid references matches(id) on delete set null,
  provider text not null default 'MANUAL_PIX',
  amount numeric(12,2) not null check (amount >= 0),
  due_date date not null,
  paid_at timestamptz,
  status payment_status not null default 'PENDENTE',
  checkout_url text,
  pix_code text,
  created_at timestamptz not null default now()
);

create table if not exists message_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references companies(id) on delete cascade,
  created_at timestamptz not null default now(),
  match_id uuid references matches(id) on delete set null,
  player_id uuid references players(id) on delete set null,
  phone text not null,
  type text not null,
  template text,
  message text not null,
  status text not null,
  response text,
  metadata jsonb not null default '{}'
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references companies(id) on delete set null,
  user_id uuid references profiles(id) on delete set null,
  ip inet,
  action text not null,
  entity text,
  entity_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists backup_jobs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'REQUESTED',
  requested_by text,
  result_url text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
