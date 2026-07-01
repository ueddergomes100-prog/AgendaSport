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
