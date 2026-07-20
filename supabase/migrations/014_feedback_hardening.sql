-- Agenda Sport - feedback hardening
-- Safe to run more than once. Does not remove business data.

alter table public.profiles
add column if not exists permissions jsonb not null default '{}'::jsonb;

update public.profiles
set permissions = '{
  "confirmations": true,
  "players": true,
  "draw": true,
  "stats": true,
  "results": true,
  "finance": true,
  "settings": true,
  "suspensions": true
}'::jsonb
where role = 'ADMINISTRADOR';

alter table public.players
add column if not exists confirmation_stage integer not null default 2;

update public.players
set confirmation_stage = 1
where type::text = 'MENSALISTA'
  and confirmation_stage = 2;

alter table public.players
drop constraint if exists players_confirmation_stage_check;

alter table public.players
add constraint players_confirmation_stage_check
check (confirmation_stage between 1 and 5);

alter table public.matches
add column if not exists team_results jsonb not null default '[]'::jsonb;

alter table public.matches
add column if not exists game_results jsonb not null default '[]'::jsonb;

alter table public.payments
add column if not exists provider_payment_id text;

drop index if exists public.payments_provider_reference_idx;

create unique index payments_provider_reference_idx
on public.payments(provider, provider_payment_id)
where provider_payment_id is not null;

create table if not exists public.confirmation_schedules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.companies(id) on delete cascade,
  stage_number integer not null check (stage_number between 1 and 5),
  days_before integer not null default 0 check (days_before between 0 and 30),
  send_time time not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, stage_number)
);

create table if not exists public.billing_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.companies(id) on delete cascade,
  monthly_billing_day integer not null default 2 check (monthly_billing_day between 1 and 28),
  default_provider text not null default 'MANUAL_PIX'
    check (default_provider in ('MANUAL_PIX','ASAAS','MERCADO_PAGO','STONE','VINDI')),
  auto_charge_casual_players boolean not null default false,
  auto_suspend_overdue boolean not null default false,
  overdue_grace_days integer not null default 5 check (overdue_grace_days between 0 and 90),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id)
);

alter table public.billing_settings
add column if not exists auto_suspend_overdue boolean not null default false;

alter table public.billing_settings
add column if not exists overdue_grace_days integer not null default 5;

create table if not exists public.finance_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.companies(id) on delete cascade,
  player_id uuid references public.players(id) on delete set null,
  match_id uuid references public.matches(id) on delete set null,
  payment_id uuid references public.payments(id) on delete set null,
  kind text not null check (kind in ('RECEITA','DESPESA')),
  category text not null,
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  occurred_on date not null default current_date,
  status text not null default 'CONFIRMADO'
    check (status in ('CONFIRMADO','PENDENTE','CANCELADO')),
  payment_method text not null default 'OUTRO',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.finance_transactions
add column if not exists payment_method text not null default 'OUTRO';

alter table public.finance_transactions
add column if not exists created_by uuid references public.profiles(id) on delete set null;

create table if not exists public.company_integrations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.companies(id) on delete cascade,
  whatsapp_group_enabled boolean not null default false,
  whatsapp_group_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id)
);

create index if not exists confirmation_schedules_tenant_idx
on public.confirmation_schedules(tenant_id, stage_number);

create index if not exists finance_transactions_tenant_date_idx
on public.finance_transactions(tenant_id, occurred_on desc);

create index if not exists finance_transactions_tenant_kind_idx
on public.finance_transactions(tenant_id, kind, status);

insert into public.confirmation_schedules (tenant_id, stage_number, days_before, send_time, enabled)
select id, stage.stage_number, stage.days_before, stage.send_time::time, stage.enabled
from public.companies
cross join (values
  (1, 2, '16:00', true),
  (2, 2, '18:00', true),
  (3, 1, '16:00', true),
  (4, 0, '09:00', true),
  (5, 0, '18:00', false)
) as stage(stage_number, days_before, send_time, enabled)
on conflict (tenant_id, stage_number) do nothing;

insert into public.billing_settings (tenant_id)
select id from public.companies
on conflict (tenant_id) do nothing;

insert into public.company_integrations (tenant_id)
select id from public.companies
on conflict (tenant_id) do nothing;

create or replace function public.is_goalkeeper_position(p_position public.player_position)
returns boolean
language sql
immutable
as $$
  select upper(p_position::text) = 'GOLEIRO'
$$;

create or replace function public.promote_waitlist(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches;
  v_pickup public.pickups;
  v_candidate record;
  v_is_goalkeeper boolean;
  v_capacity integer;
  v_confirmed integer;
begin
  select * into v_match from public.matches where id = p_match_id;
  if not found then
    raise exception 'Evento nao encontrado';
  end if;

  select * into v_pickup from public.pickups where id = v_match.pickup_id;

  for v_candidate in
    select a.id, a.player_id, p.primary_position
    from public.attendance a
    join public.players p on p.id = a.player_id
    where a.match_id = p_match_id
      and a.status = 'ESPERA'
      and p.status = 'ATIVO'
    order by a.queue_position asc nulls last, a.responded_at asc nulls last, a.created_at asc
  loop
    v_is_goalkeeper := public.is_goalkeeper_position(v_candidate.primary_position);

    if v_match.max_line_players is null and v_match.max_goalkeepers is null then
      v_capacity := case
        when v_is_goalkeeper then coalesce(v_pickup.max_goalkeepers, 0)
        else coalesce(v_pickup.max_line_players, v_pickup.max_players, 999999)
      end;
    else
      v_capacity := case
        when v_is_goalkeeper then coalesce(v_match.max_goalkeepers, 0)
        else coalesce(v_match.max_line_players, 999999)
      end;
    end if;

    select count(*) into v_confirmed
    from public.attendance a
    join public.players p on p.id = a.player_id
    where a.match_id = p_match_id
      and a.status in ('CONFIRMADO','COMPARECEU')
      and (
        (v_is_goalkeeper and public.is_goalkeeper_position(p.primary_position))
        or (not v_is_goalkeeper and not public.is_goalkeeper_position(p.primary_position))
      );

    if v_confirmed < v_capacity then
      update public.attendance
      set status = 'CONFIRMADO',
          queue_position = null,
          responded_at = now(),
          response_source = 'SYSTEM'
      where id = v_candidate.id;
      exit;
    end if;
  end loop;

  with ordered as (
    select id, row_number() over (
      order by queue_position asc nulls last, responded_at asc nulls last, created_at asc
    ) as next_position
    from public.attendance
    where match_id = p_match_id and status = 'ESPERA'
  )
  update public.attendance a
  set queue_position = ordered.next_position
  from ordered
  where a.id = ordered.id;
end;
$$;

drop function if exists public.set_attendance_response(uuid, uuid, attendance_status);
drop function if exists public.set_attendance_response(uuid, uuid, attendance_status, text, uuid);

create function public.set_attendance_response(
  p_match_id uuid,
  p_player_id uuid,
  p_status attendance_status,
  p_source text,
  p_responded_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches;
  v_pickup public.pickups;
  v_player public.players;
  v_previous_status attendance_status;
  v_final_status attendance_status := p_status;
  v_is_goalkeeper boolean;
  v_capacity integer;
  v_confirmed integer;
  v_queue_position integer;
begin
  select * into v_match from public.matches where id = p_match_id;
  if not found then raise exception 'Evento nao encontrado'; end if;

  select * into v_player
  from public.players
  where id = p_player_id and tenant_id = v_match.tenant_id;
  if not found then raise exception 'Participante nao encontrado nesta empresa'; end if;

  if v_player.status = 'SUSPENSO' then
    raise exception 'Participante suspenso nao pode confirmar presenca ate regularizar a pendencia';
  end if;

  select * into v_pickup from public.pickups where id = v_match.pickup_id;
  select status into v_previous_status
  from public.attendance
  where match_id = p_match_id and player_id = p_player_id;

  v_queue_position := null;

  if p_status = 'CONFIRMADO' then
    v_is_goalkeeper := public.is_goalkeeper_position(v_player.primary_position);
    perform pg_advisory_xact_lock(hashtext(p_match_id::text || ':' || case when v_is_goalkeeper then 'goalkeeper' else 'line' end));

    if v_match.max_line_players is null and v_match.max_goalkeepers is null then
      v_capacity := case
        when v_is_goalkeeper then coalesce(v_pickup.max_goalkeepers, 0)
        else coalesce(v_pickup.max_line_players, v_pickup.max_players, 999999)
      end;
    else
      v_capacity := case
        when v_is_goalkeeper then coalesce(v_match.max_goalkeepers, 0)
        else coalesce(v_match.max_line_players, 999999)
      end;
    end if;

    select count(*) into v_confirmed
    from public.attendance a
    join public.players p on p.id = a.player_id
    where a.match_id = p_match_id
      and a.player_id <> p_player_id
      and a.status in ('CONFIRMADO','COMPARECEU')
      and (
        (v_is_goalkeeper and public.is_goalkeeper_position(p.primary_position))
        or (not v_is_goalkeeper and not public.is_goalkeeper_position(p.primary_position))
      );

    if v_confirmed >= v_capacity then
      select coalesce(max(queue_position), 0) + 1 into v_queue_position
      from public.attendance
      where match_id = p_match_id and status = 'ESPERA';
      v_final_status := 'ESPERA';
    else
      v_final_status := 'CONFIRMADO';
    end if;
  elsif p_status = 'ESPERA' then
    select coalesce(max(queue_position), 0) + 1 into v_queue_position
    from public.attendance
    where match_id = p_match_id and status = 'ESPERA';
    v_final_status := 'ESPERA';
  end if;

  insert into public.attendance (
    tenant_id, match_id, player_id, status, responded_at,
    queue_position, response_source, responded_by
  )
  values (
    v_match.tenant_id, p_match_id, p_player_id, v_final_status, now(),
    v_queue_position, coalesce(p_source, 'SYSTEM'), p_responded_by
  )
  on conflict (match_id, player_id)
  do update set
    status = excluded.status,
    responded_at = excluded.responded_at,
    queue_position = excluded.queue_position,
    response_source = excluded.response_source,
    responded_by = excluded.responded_by;

  if p_status in ('RECUSOU','FALTOU')
     or (
       v_previous_status in ('CONFIRMADO','COMPARECEU')
       and v_final_status not in ('CONFIRMADO','COMPARECEU')
     ) then
    perform public.promote_waitlist(p_match_id);
  end if;

  return jsonb_build_object(
    'status', v_final_status,
    'queue_position', v_queue_position
  );
end;
$$;

create function public.set_attendance_response(
  p_match_id uuid,
  p_player_id uuid,
  p_status attendance_status
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.set_attendance_response(
    p_match_id,
    p_player_id,
    p_status,
    'WHATSAPP',
    null
  )
$$;

create or replace function public.has_tenant_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.role::text in ('SUPER_ADMIN','ADMINISTRADOR')
        or coalesce((p.permissions ->> p_permission)::boolean, false)
        or (
          p.permissions = '{}'::jsonb
          and p_permission in ('confirmations','stats')
        )
      )
  )
$$;

create or replace function public.is_tenant_administrator(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.tenant_id = p_tenant_id
      and p.role::text = 'ADMINISTRADOR'
  )
$$;

create or replace function public.enforce_profile_management()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_super_admin() then
    return new;
  end if;

  if new.role::text = 'SUPER_ADMIN'
     or (tg_op = 'UPDATE' and old.role::text = 'SUPER_ADMIN') then
    raise exception 'Somente o SUPER_ADMIN pode gerenciar outro SUPER_ADMIN';
  end if;

  if tg_op = 'UPDATE'
     and (
       new.id is distinct from old.id
       or new.tenant_id is distinct from old.tenant_id
     ) then
    raise exception 'Nao e permitido mover o usuario para outra empresa';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_enforce_management on public.profiles;
create trigger profiles_enforce_management
before insert or update on public.profiles
for each row execute function public.enforce_profile_management();

create or replace function public.enforce_player_update_permission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or public.is_super_admin()
     or public.has_tenant_permission('players') then
    return new;
  end if;

  if public.has_tenant_permission('suspensions') then
    if new.id is distinct from old.id
       or new.tenant_id is distinct from old.tenant_id
       or new.profile_id is distinct from old.profile_id
       or new.photo_url is distinct from old.photo_url
       or new.first_name is distinct from old.first_name
       or new.last_name is distinct from old.last_name
       or new.name is distinct from old.name
       or new.phone is distinct from old.phone
       or new.whatsapp is distinct from old.whatsapp
       or new.whatsapp_normalized is distinct from old.whatsapp_normalized
       or new.birth_date is distinct from old.birth_date
       or new.email is distinct from old.email
       or new.type is distinct from old.type
       or new.technical_score is distinct from old.technical_score
       or new.primary_position is distinct from old.primary_position
       or new.secondary_position is distinct from old.secondary_position
       or new.confirmation_stage is distinct from old.confirmation_stage then
      raise exception 'Seu acesso permite alterar somente a suspensao do participante';
    end if;
    return new;
  end if;

  raise exception 'Voce nao tem permissao para alterar participantes';
end;
$$;

drop trigger if exists players_enforce_update_permission on public.players;
create trigger players_enforce_update_permission
before update on public.players
for each row execute function public.enforce_player_update_permission();

create or replace function public.enforce_match_update_permission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or public.is_super_admin()
     or public.has_tenant_permission('confirmations') then
    return new;
  end if;

  if public.has_tenant_permission('results') then
    if new.id is distinct from old.id
       or new.tenant_id is distinct from old.tenant_id
       or new.pickup_id is distinct from old.pickup_id
       or new.scheduled_at is distinct from old.scheduled_at
       or new.notes is distinct from old.notes
       or new.max_line_players is distinct from old.max_line_players
       or new.max_goalkeepers is distinct from old.max_goalkeepers
       or new.recurrence_until is distinct from old.recurrence_until
       or new.recurrence_weekday is distinct from old.recurrence_weekday
       or new.recurrence_start_time is distinct from old.recurrence_start_time
       or new.recurrence_months is distinct from old.recurrence_months
       or new.recurrence_source_match_id is distinct from old.recurrence_source_match_id then
      raise exception 'Seu acesso permite alterar somente resultados e o encerramento do evento';
    end if;
    return new;
  end if;

  raise exception 'Voce nao tem permissao para alterar eventos';
end;
$$;

drop trigger if exists matches_enforce_update_permission on public.matches;
create trigger matches_enforce_update_permission
before update on public.matches
for each row execute function public.enforce_match_update_permission();

alter table public.confirmation_schedules enable row level security;
alter table public.billing_settings enable row level security;
alter table public.finance_transactions enable row level security;
alter table public.company_integrations enable row level security;

drop policy if exists "profiles managed by admins" on public.profiles;
drop policy if exists "profiles managed by allowed admins" on public.profiles;
create policy "profiles managed by allowed admins" on public.profiles
for all
using (
  is_super_admin()
  or public.is_tenant_administrator(tenant_id)
)
with check (
  is_super_admin()
  or public.is_tenant_administrator(tenant_id)
);

drop policy if exists "players tenant read" on public.players;
drop policy if exists "players tenant manage" on public.players;
drop policy if exists "players permitted read" on public.players;
drop policy if exists "players permitted manage" on public.players;
drop policy if exists "players permitted insert" on public.players;
drop policy if exists "players permitted update" on public.players;
drop policy if exists "players permitted delete" on public.players;
create policy "players permitted read" on public.players
for select
using (
  is_super_admin()
  or (
    tenant_id = current_tenant_id()
    and (
      public.has_tenant_permission('players')
      or public.has_tenant_permission('confirmations')
      or public.has_tenant_permission('draw')
      or public.has_tenant_permission('stats')
      or public.has_tenant_permission('results')
      or public.has_tenant_permission('finance')
      or public.has_tenant_permission('suspensions')
    )
  )
);
create policy "players permitted insert" on public.players
for insert
with check (
  is_super_admin()
  or (
    tenant_id = current_tenant_id()
    and public.has_tenant_permission('players')
  )
);
create policy "players permitted update" on public.players
for update
using (
  is_super_admin()
  or (
    tenant_id = current_tenant_id()
    and (
      public.has_tenant_permission('players')
      or public.has_tenant_permission('suspensions')
    )
  )
)
with check (
  is_super_admin()
  or (
    tenant_id = current_tenant_id()
    and (
      public.has_tenant_permission('players')
      or public.has_tenant_permission('suspensions')
    )
  )
);
create policy "players permitted delete" on public.players
for delete
using (
  is_super_admin()
  or (
    tenant_id = current_tenant_id()
    and public.has_tenant_permission('players')
  )
);

drop policy if exists "pickups tenant read" on public.pickups;
drop policy if exists "pickups tenant manage" on public.pickups;
drop policy if exists "pickups permitted read" on public.pickups;
drop policy if exists "pickups permitted manage" on public.pickups;
create policy "pickups permitted read" on public.pickups
for select
using (
  is_super_admin()
  or (
    tenant_id = current_tenant_id()
    and (
      public.has_tenant_permission('confirmations')
      or public.has_tenant_permission('draw')
      or public.has_tenant_permission('stats')
      or public.has_tenant_permission('results')
      or public.has_tenant_permission('finance')
    )
  )
);
create policy "pickups permitted manage" on public.pickups
for all
using (
  is_super_admin()
  or (
    tenant_id = current_tenant_id()
    and public.has_tenant_permission('confirmations')
  )
)
with check (
  is_super_admin()
  or (
    tenant_id = current_tenant_id()
    and public.has_tenant_permission('confirmations')
  )
);

drop policy if exists "matches tenant read" on public.matches;
drop policy if exists "matches tenant manage" on public.matches;
drop policy if exists "matches permitted read" on public.matches;
drop policy if exists "matches permitted manage" on public.matches;
drop policy if exists "matches permitted insert" on public.matches;
drop policy if exists "matches permitted update" on public.matches;
drop policy if exists "matches permitted delete" on public.matches;
create policy "matches permitted read" on public.matches
for select
using (
  is_super_admin()
  or (
    tenant_id = current_tenant_id()
    and (
      public.has_tenant_permission('confirmations')
      or public.has_tenant_permission('draw')
      or public.has_tenant_permission('stats')
      or public.has_tenant_permission('results')
      or public.has_tenant_permission('finance')
    )
  )
);
create policy "matches permitted insert" on public.matches
for insert
with check (
  is_super_admin()
  or (
    tenant_id = current_tenant_id()
    and public.has_tenant_permission('confirmations')
  )
);
create policy "matches permitted update" on public.matches
for update
using (
  is_super_admin()
  or (
    tenant_id = current_tenant_id()
    and (
      public.has_tenant_permission('confirmations')
      or public.has_tenant_permission('results')
    )
  )
)
with check (
  is_super_admin()
  or (
    tenant_id = current_tenant_id()
    and (
      public.has_tenant_permission('confirmations')
      or public.has_tenant_permission('results')
    )
  )
);
create policy "matches permitted delete" on public.matches
for delete
using (
  is_super_admin()
  or (
    tenant_id = current_tenant_id()
    and public.has_tenant_permission('confirmations')
  )
);

drop policy if exists "attendance tenant read" on public.attendance;
drop policy if exists "attendance tenant manage" on public.attendance;
drop policy if exists "attendance permitted read" on public.attendance;
drop policy if exists "attendance permitted manage" on public.attendance;
drop policy if exists "attendance confirmations manage" on public.attendance;
create policy "attendance permitted read" on public.attendance
for select
using (
  is_super_admin()
  or (
    tenant_id = current_tenant_id()
    and (
      public.has_tenant_permission('confirmations')
      or public.has_tenant_permission('draw')
      or public.has_tenant_permission('stats')
      or public.has_tenant_permission('results')
    )
  )
);
create policy "attendance confirmations manage" on public.attendance
for all
using (
  is_super_admin()
  or (
    tenant_id = current_tenant_id()
    and public.has_tenant_permission('confirmations')
  )
)
with check (
  is_super_admin()
  or (
    tenant_id = current_tenant_id()
    and public.has_tenant_permission('confirmations')
  )
);

drop policy if exists "team draws tenant" on public.team_draws;
drop policy if exists "team draws permitted" on public.team_draws;
drop policy if exists "team draws permitted read" on public.team_draws;
drop policy if exists "team draws permitted manage" on public.team_draws;
create policy "team draws permitted read" on public.team_draws
for select
using (
  is_super_admin()
  or (
    tenant_id = current_tenant_id()
    and (
      public.has_tenant_permission('draw')
      or public.has_tenant_permission('results')
      or public.has_tenant_permission('stats')
    )
  )
);
create policy "team draws permitted manage" on public.team_draws
for all
using (
  is_super_admin()
  or (
    tenant_id = current_tenant_id()
    and public.has_tenant_permission('draw')
  )
)
with check (
  is_super_admin()
  or (
    tenant_id = current_tenant_id()
    and public.has_tenant_permission('draw')
  )
);

drop policy if exists "stats tenant" on public.match_player_stats;
drop policy if exists "stats permitted read" on public.match_player_stats;
drop policy if exists "stats permitted manage" on public.match_player_stats;
create policy "stats permitted read" on public.match_player_stats
for select
using (
  is_super_admin()
  or (
    tenant_id = current_tenant_id()
    and (
      public.has_tenant_permission('stats')
      or public.has_tenant_permission('results')
    )
  )
);
create policy "stats permitted manage" on public.match_player_stats
for all
using (
  is_super_admin()
  or (
    tenant_id = current_tenant_id()
    and public.has_tenant_permission('results')
  )
)
with check (
  is_super_admin()
  or (
    tenant_id = current_tenant_id()
    and public.has_tenant_permission('results')
  )
);

drop policy if exists "payments tenant" on public.payments;
drop policy if exists "payments finance" on public.payments;
create policy "payments finance" on public.payments
for all
using (
  is_super_admin()
  or (
    tenant_id = current_tenant_id()
    and public.has_tenant_permission('finance')
  )
)
with check (
  is_super_admin()
  or (
    tenant_id = current_tenant_id()
    and public.has_tenant_permission('finance')
  )
);

drop policy if exists "messages tenant" on public.message_logs;
drop policy if exists "messages permitted read" on public.message_logs;
create policy "messages permitted read" on public.message_logs
for select
using (
  is_super_admin()
  or (
    tenant_id = current_tenant_id()
    and (
      public.has_tenant_permission('confirmations')
      or public.has_tenant_permission('finance')
    )
  )
);

drop policy if exists "confirmation schedules tenant" on public.confirmation_schedules;
drop policy if exists "confirmation schedules permitted read" on public.confirmation_schedules;
drop policy if exists "confirmation schedules settings manage" on public.confirmation_schedules;
create policy "confirmation schedules permitted read" on public.confirmation_schedules
for select
using (
  is_super_admin()
  or (
    tenant_id = current_tenant_id()
    and (
      public.has_tenant_permission('confirmations')
      or public.has_tenant_permission('settings')
    )
  )
);
create policy "confirmation schedules settings manage" on public.confirmation_schedules
for all
using (
  is_super_admin()
  or (
    tenant_id = current_tenant_id()
    and public.has_tenant_permission('settings')
  )
)
with check (
  is_super_admin()
  or (
    tenant_id = current_tenant_id()
    and public.has_tenant_permission('settings')
  )
);

drop policy if exists "billing settings tenant" on public.billing_settings;
drop policy if exists "billing settings finance" on public.billing_settings;
create policy "billing settings finance" on public.billing_settings
for all
using (
  is_super_admin()
  or (
    tenant_id = current_tenant_id()
    and (
      public.has_tenant_permission('finance')
      or public.has_tenant_permission('settings')
    )
  )
)
with check (
  is_super_admin()
  or (
    tenant_id = current_tenant_id()
    and (
      public.has_tenant_permission('finance')
      or public.has_tenant_permission('settings')
    )
  )
);

drop policy if exists "finance transactions tenant" on public.finance_transactions;
drop policy if exists "finance transactions finance" on public.finance_transactions;
create policy "finance transactions finance" on public.finance_transactions
for all
using (
  is_super_admin()
  or (
    tenant_id = current_tenant_id()
    and public.has_tenant_permission('finance')
  )
)
with check (
  is_super_admin()
  or (
    tenant_id = current_tenant_id()
    and public.has_tenant_permission('finance')
  )
);

drop policy if exists "company integrations settings" on public.company_integrations;
create policy "company integrations settings" on public.company_integrations
for all
using (
  is_super_admin()
  or (
    tenant_id = current_tenant_id()
    and public.has_tenant_permission('settings')
  )
)
with check (
  is_super_admin()
  or (
    tenant_id = current_tenant_id()
    and public.has_tenant_permission('settings')
  )
);

notify pgrst, 'reload schema';
