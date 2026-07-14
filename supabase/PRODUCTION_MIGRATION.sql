-- Agenda Sport - production patch
-- Safe to run more than once. Does not delete business data.

alter table public.message_logs
add column if not exists match_id uuid references public.matches(id) on delete set null;

alter table public.message_logs
add column if not exists player_id uuid references public.players(id) on delete set null;

alter table public.message_logs
add column if not exists template text;

alter table public.message_logs
add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.players
add column if not exists confirmation_stage integer not null default 1;

alter table public.players
drop constraint if exists players_confirmation_stage_check;

alter table public.players
add constraint players_confirmation_stage_check
check (confirmation_stage between 1 and 5);

update public.players
set confirmation_stage = 1
where confirmation_stage is null;

create index if not exists players_tenant_confirmation_stage_idx
on public.players(tenant_id, confirmation_stage);

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

create index if not exists confirmation_schedules_tenant_idx
on public.confirmation_schedules(tenant_id, stage_number);

alter table public.confirmation_schedules enable row level security;

drop policy if exists "confirmation schedules tenant" on public.confirmation_schedules;
create policy "confirmation schedules tenant" on public.confirmation_schedules
for all
using (tenant_id = current_tenant_id() or is_super_admin())
with check (tenant_id = current_tenant_id() or is_super_admin());

insert into public.confirmation_schedules (tenant_id, stage_number, days_before, send_time, enabled)
select id, stage.stage_number, stage.days_before, stage.send_time::time, stage.enabled
from public.companies
cross join (values
  (1, 2, '16:00', true),
  (2, 0, '09:00', true),
  (3, 0, '12:00', false),
  (4, 0, '15:00', false),
  (5, 0, '18:00', false)
) as stage(stage_number, days_before, send_time, enabled)
on conflict (tenant_id, stage_number)
do update set
  days_before = excluded.days_before,
  send_time = excluded.send_time,
  enabled = excluded.enabled;

create index if not exists message_logs_match_template_idx
on public.message_logs(match_id, type, template);

create unique index if not exists message_logs_reminder_unique_idx
on public.message_logs (tenant_id, match_id, player_id, type, template)
where match_id is not null
  and player_id is not null
  and template is not null
  and type = 'CONFIRMACAO';

alter table public.matches drop constraint if exists matches_pickup_id_fkey;

alter table public.matches
  add constraint matches_pickup_id_fkey
  foreign key (pickup_id)
  references public.pickups(id)
  on delete cascade;

-- Keep set_attendance_response current for direct SIM/NAO/ESPERA responses.
-- PostgreSQL cannot change an existing function return type with CREATE OR REPLACE,
-- so we drop only this function signature before recreating it.
drop function if exists public.set_attendance_response(uuid, uuid, attendance_status);

create or replace function public.set_attendance_response(p_match_id uuid, p_player_id uuid, p_status attendance_status)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match matches;
  v_pickup pickups;
  v_confirmed_count integer;
  v_queue_position integer;
  v_previous_status attendance_status;
  v_final_status attendance_status;
begin
  select * into v_match from matches where id = p_match_id;
  if not found then
    raise exception 'Partida nao encontrada';
  end if;

  select * into v_pickup from pickups where id = v_match.pickup_id;
  select status into v_previous_status from attendance where match_id = p_match_id and player_id = p_player_id;
  v_final_status := p_status;

  if p_status = 'CONFIRMADO' then
    select count(*) into v_confirmed_count
    from attendance
    where match_id = p_match_id
      and player_id <> p_player_id
      and status in ('CONFIRMADO','COMPARECEU');

    if v_pickup.id is not null and v_confirmed_count >= v_pickup.max_players then
      select coalesce(max(queue_position), 0) + 1 into v_queue_position
      from attendance
      where match_id = p_match_id
        and status = 'ESPERA';
      v_final_status := 'ESPERA';
    else
      v_final_status := 'CONFIRMADO';
      v_queue_position := null;
    end if;
  elsif p_status = 'ESPERA' then
    select coalesce(max(queue_position), 0) + 1 into v_queue_position
    from attendance
    where match_id = p_match_id
      and status = 'ESPERA';
    v_final_status := 'ESPERA';
  else
    v_queue_position := null;
  end if;

  insert into attendance (tenant_id, match_id, player_id, status, responded_at, queue_position)
  values (v_match.tenant_id, p_match_id, p_player_id, v_final_status, now(), v_queue_position)
  on conflict (match_id, player_id)
  do update set status = excluded.status, responded_at = now(), queue_position = excluded.queue_position;

  if p_status in ('RECUSOU','FALTOU')
     or (v_previous_status in ('CONFIRMADO','COMPARECEU') and v_final_status not in ('CONFIRMADO','COMPARECEU')) then
    perform promote_waitlist(p_match_id);
  end if;

  return jsonb_build_object('status', v_final_status, 'queue_position', v_queue_position);
end;
$$;

notify pgrst, 'reload schema';
