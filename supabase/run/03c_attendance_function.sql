create or replace function set_attendance_response(p_match_id uuid, p_player_id uuid, p_status attendance_status)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
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
$fn$;
