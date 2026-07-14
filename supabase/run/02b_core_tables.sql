create table if not exists companies (
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

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid references companies(id) on delete set null,
  full_name text not null,
  role user_role not null default 'JOGADOR',
  phone text,
  created_at timestamptz not null default now()
);

create table if not exists players (
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

create table if not exists pickups (
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
