create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

create type user_role as enum ('SUPER_ADMIN','ADMINISTRADOR','ORGANIZADOR','OPERADOR','JOGADOR');
create type company_status as enum ('ATIVA','BLOQUEADA','TRIAL','CANCELADA');
create type player_status as enum ('ATIVO','INATIVO');
create type player_type as enum ('MENSALISTA','AVULSO');
create type player_position as enum ('Goleiro','Linha','Zagueiro','Lateral','Volante','Meio Campo','Atacante');
create type match_status as enum ('AGENDADA','ABERTA','ENCERRADA','CANCELADA');
create type attendance_status as enum ('CONVIDADO','CONFIRMADO','RECUSOU','ESPERA','COMPARECEU','FALTOU');
create type payment_status as enum ('PENDENTE','PAGO','ATRASADO','CANCELADO');

create table plans (
  code text primary key,
  name text not null,
  max_players integer,
  max_pickups integer,
  monthly_price numeric(12,2) not null default 0
);

insert into plans (code, name, max_players, max_pickups, monthly_price) values
('Starter','Starter',50,2,99.00),
('Pro','Pro',200,10,199.00),
('Elite','Elite',null,null,399.00)
on conflict do nothing;

create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  responsible_name text not null,
  phone text,
  whatsapp text,
  email text not null unique,
  city text,
  state text,
  plan_code text not null references plans(code),
  due_date date,
  status company_status not null default 'TRIAL',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid references companies(id) on delete set null,
  full_name text not null,
  role user_role not null default 'JOGADOR',
  phone text,
  created_at timestamptz not null default now()
);

create table players (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references companies(id) on delete cascade,
  profile_id uuid references profiles(id) on delete set null,
  photo_url text,
  name text not null,
  phone text,
  whatsapp text,
  birth_date date,
  email text,
  notes text,
  status player_status not null default 'ATIVO',
  type player_type not null default 'AVULSO',
  technical_score integer not null check (technical_score between 1 and 10),
  primary_position player_position not null,
  secondary_position player_position,
  confirmation_stage integer not null default 1 check (confirmation_stage between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, email)
);

create table pickups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references companies(id) on delete cascade,
  name text not null,
  place text not null,
  address text,
  maps_url text,
  weekday integer not null check (weekday between 0 and 6),
  start_time time not null,
  casual_price numeric(12,2) not null default 0,
  monthly_price numeric(12,2) not null default 0,
  max_players integer not null check (max_players > 0),
  mensalista_priority_hours integer not null default 48,
  created_at timestamptz not null default now()
);

create table matches (
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

create table attendance (
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

create table team_draws (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references companies(id) on delete cascade,
  match_id uuid not null references matches(id) on delete cascade,
  payload jsonb not null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table match_player_stats (
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

create table payments (
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

create table message_logs (
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

create table audit_logs (
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

create table backup_jobs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'REQUESTED',
  requested_by text,
  result_url text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index players_tenant_idx on players(tenant_id);
create index pickups_tenant_idx on pickups(tenant_id);
create index matches_tenant_scheduled_idx on matches(tenant_id, scheduled_at desc);
create index attendance_match_status_idx on attendance(match_id, status);
create index payments_tenant_status_idx on payments(tenant_id, status, due_date);
create index stats_tenant_player_idx on match_player_stats(tenant_id, player_id);
