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

drop trigger if exists on_auth_user_created on auth.users;

create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'JOGADOR')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function handle_new_auth_user();

create index players_tenant_idx on players(tenant_id);
create index pickups_tenant_idx on pickups(tenant_id);
create index matches_tenant_scheduled_idx on matches(tenant_id, scheduled_at desc);
create index attendance_match_status_idx on attendance(match_id, status);
create index payments_tenant_status_idx on payments(tenant_id, status, due_date);
create index stats_tenant_player_idx on match_player_stats(tenant_id, player_id);

create or replace function current_profile()
returns profiles
language sql
stable
security definer
set search_path = public
as $$
  select * from profiles where id = auth.uid();
$$;

create or replace function is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from profiles where id = auth.uid() and role = 'SUPER_ADMIN');
$$;

create or replace function current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from profiles where id = auth.uid();
$$;

create or replace function can_manage_tenant()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from profiles
    where id = auth.uid()
    and role in ('SUPER_ADMIN','ADMINISTRADOR','ORGANIZADOR','OPERADOR')
  );
$$;

create or replace function set_attendance_response(p_match_id uuid, p_player_id uuid, p_status attendance_status)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match matches;
  v_pickup pickups;
  v_player players;
  v_previous_status attendance_status;
  v_confirmed_count integer;
  v_queue_position integer;
  v_final_status attendance_status;
begin
  select * into v_match from matches where id = p_match_id;
  if v_match.id is null then
    raise exception 'Partida ou jogador invalido';
  end if;

  select * into v_player from players where id = p_player_id and tenant_id = v_match.tenant_id;
  if v_player.id is null then
    raise exception 'Partida ou jogador invalido';
  end if;

  select * into v_pickup from pickups where id = v_match.pickup_id;
  select status into v_previous_status from attendance where match_id = p_match_id and player_id = p_player_id;

  if p_status = 'CONFIRMADO' then
    select count(*) into v_confirmed_count
    from attendance
    where match_id = p_match_id
      and player_id <> p_player_id
      and status in ('CONFIRMADO','COMPARECEU');

    if v_confirmed_count >= coalesce(v_pickup.max_players, 999999) then
      select coalesce(max(queue_position), 0) + 1 into v_queue_position from attendance where match_id = p_match_id and status = 'ESPERA';
      v_final_status := 'ESPERA';
    else
      v_final_status := 'CONFIRMADO';
      v_queue_position := null;
    end if;
  else
    v_final_status := p_status;
    v_queue_position := null;
  end if;

  insert into attendance (tenant_id, match_id, player_id, status, responded_at, queue_position)
  values (v_match.tenant_id, p_match_id, p_player_id, v_final_status, now(), v_queue_position)
  on conflict (match_id, player_id)
  do update set status = excluded.status, responded_at = now(), queue_position = excluded.queue_position;

  if p_status in ('RECUSOU','FALTOU') or (v_previous_status in ('CONFIRMADO','COMPARECEU') and v_final_status not in ('CONFIRMADO','COMPARECEU')) then
    perform promote_waitlist(p_match_id);
  end if;
end;
$$;

create or replace function promote_waitlist(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match matches;
  v_pickup pickups;
  v_next attendance;
  v_confirmed_count integer;
  v_capacity integer;
begin
  select * into v_match from matches where id = p_match_id;
  if v_match.id is null then
    raise exception 'Partida invalida';
  end if;

  select * into v_pickup from pickups where id = v_match.pickup_id;
  v_capacity := coalesce(v_pickup.max_players, 999999);

  select count(*) into v_confirmed_count
  from attendance
  where match_id = p_match_id and status in ('CONFIRMADO','COMPARECEU');

  if v_confirmed_count >= v_capacity then
    return;
  end if;

  select * into v_next
  from attendance
  where match_id = p_match_id and status = 'ESPERA'
  order by queue_position asc
  limit 1;

  if v_next.id is not null then
    update attendance set status = 'CONFIRMADO', queue_position = null, responded_at = now()
    where id = v_next.id;
  end if;
end;
$$;

create or replace function get_dashboard_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select get_dashboard_stats_for_tenant(current_tenant_id());
$$;

create or replace function get_dashboard_stats_for_tenant(p_tenant_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'next_match', (select min(scheduled_at) from matches where tenant_id = p_tenant_id and scheduled_at >= now() and status <> 'CANCELADA'),
    'confirmed', (select count(*) from attendance where tenant_id = p_tenant_id and status in ('CONFIRMADO','COMPARECEU')),
    'waitlist', (select count(*) from attendance where tenant_id = p_tenant_id and status = 'ESPERA'),
    'monthly_revenue', coalesce((select sum(amount) from payments where tenant_id = p_tenant_id and status = 'PAGO' and paid_at >= date_trunc('month', now())), 0),
    'annual_revenue', coalesce((select sum(amount) from payments where tenant_id = p_tenant_id and status = 'PAGO' and paid_at >= date_trunc('year', now())), 0),
    'overdue', (select count(*) from payments where tenant_id = p_tenant_id and status in ('PENDENTE','ATRASADO') and due_date < current_date),
    'monthly_top_scorer', (
      select p.name from match_player_stats s join players p on p.id = s.player_id
      where s.tenant_id = p_tenant_id and s.created_at >= date_trunc('month', now())
      group by p.name order by sum(s.goals) desc limit 1
    ),
    'most_frequent_player', (
      select p.name from match_player_stats s join players p on p.id = s.player_id
      where s.tenant_id = p_tenant_id and s.present = true
      group by p.name order by count(*) desc limit 1
    )
  );
$$;

create or replace function set_team_draw_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tenant_id is null then
    select tenant_id into new.tenant_id from matches where id = new.match_id;
  end if;
  new.created_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists team_draws_set_tenant on team_draws;

create trigger team_draws_set_tenant
before insert on team_draws
for each row execute function set_team_draw_tenant();

alter table plans enable row level security;
alter table companies enable row level security;
alter table profiles enable row level security;
alter table players enable row level security;
alter table pickups enable row level security;
alter table matches enable row level security;
alter table attendance enable row level security;
alter table team_draws enable row level security;
alter table match_player_stats enable row level security;
alter table payments enable row level security;
alter table message_logs enable row level security;
alter table audit_logs enable row level security;
alter table backup_jobs enable row level security;

create policy "plans readable" on plans for select using (true);
create policy "plans super admin manage" on plans for all using (is_super_admin()) with check (is_super_admin());

create policy "super admin manages companies" on companies for all using (is_super_admin()) with check (is_super_admin());
create policy "tenant users read company" on companies for select using (id = current_tenant_id() or is_super_admin());

create policy "profiles self or same tenant" on profiles for select using (id = auth.uid() or tenant_id = current_tenant_id() or is_super_admin());
create policy "profiles managed by admins" on profiles for all using (is_super_admin() or (tenant_id = current_tenant_id() and can_manage_tenant())) with check (is_super_admin() or tenant_id = current_tenant_id());

create policy "players tenant read" on players for select using (tenant_id = current_tenant_id() or is_super_admin());
create policy "players tenant manage" on players for all using (tenant_id = current_tenant_id() and can_manage_tenant() or is_super_admin()) with check (tenant_id = current_tenant_id() or is_super_admin());

create policy "pickups tenant read" on pickups for select using (tenant_id = current_tenant_id() or is_super_admin());
create policy "pickups tenant manage" on pickups for all using (tenant_id = current_tenant_id() and can_manage_tenant() or is_super_admin()) with check (tenant_id = current_tenant_id() or is_super_admin());

create policy "matches tenant read" on matches for select using (tenant_id = current_tenant_id() or is_super_admin());
create policy "matches tenant manage" on matches for all using (tenant_id = current_tenant_id() and can_manage_tenant() or is_super_admin()) with check (tenant_id = current_tenant_id() or is_super_admin());

create policy "attendance tenant read" on attendance for select using (tenant_id = current_tenant_id() or is_super_admin());
create policy "attendance tenant manage" on attendance for all using (tenant_id = current_tenant_id() or is_super_admin()) with check (tenant_id = current_tenant_id() or is_super_admin());

create policy "team draws tenant" on team_draws for all using (tenant_id = current_tenant_id() or is_super_admin()) with check (tenant_id = current_tenant_id() or is_super_admin());
create policy "stats tenant" on match_player_stats for all using (tenant_id = current_tenant_id() or is_super_admin()) with check (tenant_id = current_tenant_id() or is_super_admin());
create policy "payments tenant" on payments for all using (tenant_id = current_tenant_id() or is_super_admin()) with check (tenant_id = current_tenant_id() or is_super_admin());
create policy "messages tenant" on message_logs for all using (tenant_id = current_tenant_id() or is_super_admin()) with check (tenant_id = current_tenant_id() or is_super_admin());
create policy "audit tenant" on audit_logs for select using (tenant_id = current_tenant_id() or is_super_admin());
create policy "backup super admin" on backup_jobs for all using (is_super_admin()) with check (is_super_admin());

insert into storage.buckets (id, name, public)
values ('player-photos','player-photos', true), ('match-gallery','match-gallery', true)
on conflict (id) do nothing;
