-- Capacity is enforced independently for line players and goalkeepers.
-- Run this migration after 014_feedback_hardening.sql.

alter table public.pickups
drop constraint if exists pickups_max_line_players_nonnegative;

alter table public.pickups
add constraint pickups_max_line_players_nonnegative
check (max_line_players is null or max_line_players >= 0);

alter table public.pickups
drop constraint if exists pickups_max_goalkeepers_nonnegative;

alter table public.pickups
add constraint pickups_max_goalkeepers_nonnegative
check (max_goalkeepers is null or max_goalkeepers >= 0);

alter table public.matches
drop constraint if exists matches_max_line_players_nonnegative;

alter table public.matches
add constraint matches_max_line_players_nonnegative
check (max_line_players is null or max_line_players >= 0);

alter table public.matches
drop constraint if exists matches_max_goalkeepers_nonnegative;

alter table public.matches
add constraint matches_max_goalkeepers_nonnegative
check (max_goalkeepers is null or max_goalkeepers >= 0);

create or replace function public.match_position_capacity(
  p_match_id uuid,
  p_is_goalkeeper boolean
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    case
      when p_is_goalkeeper then coalesce(m.max_goalkeepers, p.max_goalkeepers, 0)
      else coalesce(m.max_line_players, p.max_line_players, p.max_players, 999999)
    end,
    0
  )::integer
  from public.matches m
  left join public.pickups p on p.id = m.pickup_id
  where m.id = p_match_id
$$;

create or replace function public.enforce_attendance_position_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_goalkeeper boolean;
  v_capacity integer;
  v_confirmed integer;
begin
  if new.status not in ('CONFIRMADO', 'COMPARECEU') then
    return new;
  end if;

  select public.is_goalkeeper_position(primary_position)
  into v_is_goalkeeper
  from public.players
  where id = new.player_id;

  if v_is_goalkeeper is null then
    raise exception 'Participante nao encontrado para validar a capacidade';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(new.match_id::text || ':' || case when v_is_goalkeeper then 'goalkeeper' else 'line' end)
  );

  v_capacity := public.match_position_capacity(new.match_id, v_is_goalkeeper);
  if v_capacity is null then
    raise exception 'Evento nao encontrado para validar a capacidade';
  end if;

  select count(*)
  into v_confirmed
  from public.attendance a
  join public.players p on p.id = a.player_id
  where a.match_id = new.match_id
    and a.id is distinct from new.id
    and a.status in ('CONFIRMADO', 'COMPARECEU')
    and public.is_goalkeeper_position(p.primary_position) = v_is_goalkeeper;

  if v_confirmed >= v_capacity then
    raise exception using
      errcode = '23514',
      message = case
        when v_is_goalkeeper then 'Limite de goleiros confirmados atingido'
        else 'Limite de jogadores de linha confirmados atingido'
      end;
  end if;

  return new;
end;
$$;

drop trigger if exists attendance_position_capacity_guard on public.attendance;
create trigger attendance_position_capacity_guard
before insert or update of status, player_id, match_id
on public.attendance
for each row
execute function public.enforce_attendance_position_capacity();

create or replace function public.promote_waitlist(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate record;
  v_is_goalkeeper boolean;
  v_capacity integer;
  v_confirmed integer;
begin
  if not exists (select 1 from public.matches where id = p_match_id) then
    raise exception 'Evento nao encontrado';
  end if;

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
    perform pg_advisory_xact_lock(
      hashtext(p_match_id::text || ':' || case when v_is_goalkeeper then 'goalkeeper' else 'line' end)
    );

    v_capacity := public.match_position_capacity(p_match_id, v_is_goalkeeper);

    select count(*)
    into v_confirmed
    from public.attendance a
    join public.players p on p.id = a.player_id
    where a.match_id = p_match_id
      and a.status in ('CONFIRMADO', 'COMPARECEU')
      and public.is_goalkeeper_position(p.primary_position) = v_is_goalkeeper;

    if v_confirmed < v_capacity then
      update public.attendance
      set status = 'CONFIRMADO',
          queue_position = null,
          responded_at = now(),
          response_source = 'SYSTEM'
      where id = v_candidate.id
        and status = 'ESPERA';
    end if;
  end loop;

  with ordered as (
    select id, row_number() over (
      order by queue_position asc nulls last, responded_at asc nulls last, created_at asc
    ) as next_position
    from public.attendance
    where match_id = p_match_id
      and status = 'ESPERA'
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
  v_player public.players;
  v_previous_status attendance_status;
  v_existing_queue_position integer;
  v_final_status attendance_status := p_status;
  v_is_goalkeeper boolean;
  v_capacity integer;
  v_confirmed integer;
  v_queue_position integer;
begin
  select *
  into v_match
  from public.matches
  where id = p_match_id;
  if not found then
    raise exception 'Evento nao encontrado';
  end if;

  select *
  into v_player
  from public.players
  where id = p_player_id
    and tenant_id = v_match.tenant_id;
  if not found then
    raise exception 'Participante nao encontrado nesta empresa';
  end if;

  if v_player.status = 'SUSPENSO' then
    raise exception 'Participante suspenso nao pode confirmar presenca ate regularizar a pendencia';
  end if;

  if v_match.status in ('ENCERRADA', 'CANCELADA')
     and p_status not in ('COMPARECEU', 'FALTOU') then
    raise exception 'Evento encerrado ou cancelado nao aceita novas respostas';
  end if;

  select status, queue_position
  into v_previous_status, v_existing_queue_position
  from public.attendance
  where match_id = p_match_id
    and player_id = p_player_id;

  v_queue_position := null;

  if p_status in ('CONFIRMADO', 'COMPARECEU') then
    v_is_goalkeeper := public.is_goalkeeper_position(v_player.primary_position);
    perform pg_advisory_xact_lock(
      hashtext(p_match_id::text || ':' || case when v_is_goalkeeper then 'goalkeeper' else 'line' end)
    );

    v_capacity := public.match_position_capacity(p_match_id, v_is_goalkeeper);

    select count(*)
    into v_confirmed
    from public.attendance a
    join public.players p on p.id = a.player_id
    where a.match_id = p_match_id
      and a.player_id <> p_player_id
      and a.status in ('CONFIRMADO', 'COMPARECEU')
      and public.is_goalkeeper_position(p.primary_position) = v_is_goalkeeper;

    if v_confirmed >= v_capacity then
      if p_status = 'COMPARECEU' then
        raise exception using
          errcode = '23514',
          message = case
            when v_is_goalkeeper then 'Limite de goleiros confirmados atingido'
            else 'Limite de jogadores de linha confirmados atingido'
          end;
      end if;

      if v_existing_queue_position is not null then
        v_queue_position := v_existing_queue_position;
      else
        select coalesce(max(queue_position), 0) + 1
        into v_queue_position
        from public.attendance
        where match_id = p_match_id
          and status = 'ESPERA';
      end if;
      v_final_status := 'ESPERA';
    else
      v_final_status := p_status;
    end if;
  elsif p_status = 'ESPERA' then
    if v_existing_queue_position is not null then
      v_queue_position := v_existing_queue_position;
    else
      select coalesce(max(queue_position), 0) + 1
      into v_queue_position
      from public.attendance
      where match_id = p_match_id
        and status = 'ESPERA';
    end if;
  end if;

  insert into public.attendance (
    tenant_id,
    match_id,
    player_id,
    status,
    responded_at,
    queue_position,
    response_source,
    responded_by
  )
  values (
    v_match.tenant_id,
    p_match_id,
    p_player_id,
    v_final_status,
    now(),
    v_queue_position,
    coalesce(p_source, 'SYSTEM'),
    p_responded_by
  )
  on conflict (match_id, player_id)
  do update set
    status = excluded.status,
    responded_at = excluded.responded_at,
    queue_position = excluded.queue_position,
    response_source = excluded.response_source,
    responded_by = excluded.responded_by;

  if p_status in ('RECUSOU', 'FALTOU')
     or (
       v_previous_status in ('CONFIRMADO', 'COMPARECEU')
       and v_final_status not in ('CONFIRMADO', 'COMPARECEU')
     ) then
    perform public.promote_waitlist(p_match_id);
  end if;

  return jsonb_build_object(
    'status', v_final_status,
    'queue_position', v_queue_position,
    'position', case when public.is_goalkeeper_position(v_player.primary_position) then 'GOLEIRO' else 'LINHA' end,
    'capacity', public.match_position_capacity(
      p_match_id,
      public.is_goalkeeper_position(v_player.primary_position)
    )
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

create or replace function public.reconcile_match_capacity(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_goalkeeper boolean;
  v_capacity integer;
  v_present integer;
  v_next_queue integer;
begin
  foreach v_is_goalkeeper in array array[false, true]
  loop
    perform pg_advisory_xact_lock(
      hashtext(p_match_id::text || ':' || case when v_is_goalkeeper then 'goalkeeper' else 'line' end)
    );
    v_capacity := public.match_position_capacity(p_match_id, v_is_goalkeeper);

    select count(*)
    into v_present
    from public.attendance a
    join public.players p on p.id = a.player_id
    where a.match_id = p_match_id
      and a.status = 'COMPARECEU'
      and public.is_goalkeeper_position(p.primary_position) = v_is_goalkeeper;

    if v_present > v_capacity then
      raise exception using
        errcode = '23514',
        message = case
          when v_is_goalkeeper then 'O limite nao pode ser menor que os goleiros com presenca registrada'
          else 'O limite nao pode ser menor que os jogadores de linha com presenca registrada'
        end;
    end if;

    select coalesce(max(queue_position), 0)
    into v_next_queue
    from public.attendance
    where match_id = p_match_id
      and status = 'ESPERA';

    with ranked as (
      select
        a.id,
        row_number() over (
          order by
            case when a.status = 'COMPARECEU' then 0 else 1 end,
            a.responded_at asc nulls last,
            a.created_at asc
        ) as confirmed_order
      from public.attendance a
      join public.players p on p.id = a.player_id
      where a.match_id = p_match_id
        and a.status in ('CONFIRMADO', 'COMPARECEU')
        and public.is_goalkeeper_position(p.primary_position) = v_is_goalkeeper
    ),
    overflow as (
      select id, row_number() over (order by confirmed_order) as overflow_order
      from ranked
      where confirmed_order > v_capacity
    )
    update public.attendance a
    set status = 'ESPERA',
        queue_position = v_next_queue + overflow.overflow_order,
        responded_at = now(),
        response_source = 'SYSTEM'
    from overflow
    where a.id = overflow.id
      and a.status = 'CONFIRMADO';
  end loop;

  perform public.promote_waitlist(p_match_id);
end;
$$;

create or replace function public.reconcile_capacity_after_match_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.max_line_players is distinct from old.max_line_players
     or new.max_goalkeepers is distinct from old.max_goalkeepers then
    perform public.reconcile_match_capacity(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists matches_reconcile_capacity on public.matches;
create trigger matches_reconcile_capacity
after update of max_line_players, max_goalkeepers
on public.matches
for each row
execute function public.reconcile_capacity_after_match_update();

do $$
declare
  v_match record;
begin
  for v_match in
    select id
    from public.matches
    where status not in ('ENCERRADA', 'CANCELADA')
  loop
    perform public.reconcile_match_capacity(v_match.id);
  end loop;
end;
$$;

grant execute on function public.match_position_capacity(uuid, boolean) to authenticated, service_role;
grant execute on function public.promote_waitlist(uuid) to authenticated, service_role;
grant execute on function public.set_attendance_response(uuid, uuid, attendance_status) to anon, authenticated, service_role;
grant execute on function public.set_attendance_response(uuid, uuid, attendance_status, text, uuid) to authenticated, service_role;
grant execute on function public.reconcile_match_capacity(uuid) to authenticated, service_role;
