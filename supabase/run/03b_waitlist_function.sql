create or replace function promote_waitlist(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
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
$fn$;
