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
