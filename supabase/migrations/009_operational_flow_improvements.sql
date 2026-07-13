-- Agenda Sport - operational flow improvements
-- Safe additive migration for production.

alter type player_status add value if not exists 'SUSPENSO';

alter table public.players
add column if not exists first_name text,
add column if not exists last_name text,
add column if not exists suspension_reason text,
add column if not exists suspended_until date,
add column if not exists suspended_at timestamptz,
add column if not exists whatsapp_normalized text;

alter table public.attendance
add column if not exists response_source text not null default 'SYSTEM',
add column if not exists responded_by uuid references public.profiles(id) on delete set null;

alter table public.pickups
add column if not exists max_line_players integer,
add column if not exists max_goalkeepers integer;

alter table public.matches
add column if not exists max_line_players integer,
add column if not exists max_goalkeepers integer,
add column if not exists recurrence_until date,
add column if not exists recurrence_weekday integer check (recurrence_weekday between 0 and 6),
add column if not exists recurrence_start_time time,
add column if not exists recurrence_months integer check (recurrence_months is null or recurrence_months between 1 and 12),
add column if not exists recurrence_source_match_id uuid references public.matches(id) on delete set null;

update public.pickups
set max_line_players = coalesce(max_line_players, max_players),
    max_goalkeepers = coalesce(max_goalkeepers, 0)
where max_line_players is null
   or max_goalkeepers is null;

update public.matches m
set max_line_players = coalesce(m.max_line_players, p.max_line_players, p.max_players),
    max_goalkeepers = coalesce(m.max_goalkeepers, p.max_goalkeepers, 0)
from public.pickups p
where m.pickup_id = p.id
  and (m.max_line_players is null or m.max_goalkeepers is null);

create index if not exists players_tenant_status_position_idx
on public.players(tenant_id, status, primary_position);

create index if not exists matches_recurrence_idx
on public.matches(tenant_id, recurrence_until, recurrence_weekday)
where recurrence_until is not null;

create or replace function public.normalize_whatsapp_br(p_phone text)
returns text
language plpgsql
immutable
as $$
declare
  v_digits text;
  v_local text;
begin
  v_digits := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if length(v_digits) < 8 then
    return null;
  end if;

  if left(v_digits, 2) = '55' then
    v_local := substr(v_digits, 3);
  else
    v_local := v_digits;
  end if;

  if length(v_local) = 11 and substr(v_local, 3, 1) = '9' then
    v_local := substr(v_local, 1, 2) || substr(v_local, 4);
  end if;

  return v_local;
end;
$$;

update public.players
set whatsapp_normalized = public.normalize_whatsapp_br(whatsapp)
where whatsapp is not null
  and whatsapp_normalized is null;

create unique index if not exists players_tenant_whatsapp_normalized_unique_idx
on public.players(tenant_id, whatsapp_normalized)
where whatsapp_normalized is not null;

drop function if exists public.set_attendance_response(uuid, uuid, attendance_status);

create or replace function public.set_attendance_response(
  p_match_id uuid,
  p_player_id uuid,
  p_status attendance_status,
  p_source text default 'WHATSAPP',
  p_responded_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match matches;
  v_player players;
  v_is_goalkeeper boolean;
  v_position_capacity integer;
  v_confirmed_count integer;
  v_queue_position integer;
  v_previous_status attendance_status;
  v_final_status attendance_status;
begin
  select * into v_match from matches where id = p_match_id;
  if not found then
    raise exception 'Evento nao encontrado';
  end if;

  select * into v_player from players where id = p_player_id and tenant_id = v_match.tenant_id;
  if not found then
    raise exception 'Participante nao encontrado neste evento';
  end if;

  if v_player.status = 'SUSPENSO' then
    raise exception 'Participante suspenso nao pode confirmar presenca ate regularizar pendencia.';
  end if;

  select status into v_previous_status
  from attendance
  where match_id = p_match_id and player_id = p_player_id;

  v_final_status := p_status;
  v_queue_position := null;

  if p_status = 'CONFIRMADO' then
    v_is_goalkeeper := v_player.primary_position = 'Goleiro';
    v_position_capacity := case
      when v_is_goalkeeper then coalesce(v_match.max_goalkeepers, 0)
      else coalesce(v_match.max_line_players, 0)
    end;

    if v_position_capacity <= 0 then
      v_position_capacity := coalesce(v_match.max_line_players, 999999) + coalesce(v_match.max_goalkeepers, 0);
    end if;

    select count(*) into v_confirmed_count
    from attendance a
    join players p on p.id = a.player_id
    where a.match_id = p_match_id
      and a.player_id <> p_player_id
      and a.status in ('CONFIRMADO','COMPARECEU')
      and (
        (v_is_goalkeeper and p.primary_position = 'Goleiro')
        or (not v_is_goalkeeper and p.primary_position <> 'Goleiro')
      );

    if v_confirmed_count >= v_position_capacity then
      select coalesce(max(queue_position), 0) + 1 into v_queue_position
      from attendance
      where match_id = p_match_id and status = 'ESPERA';
      v_final_status := 'ESPERA';
    else
      v_final_status := 'CONFIRMADO';
    end if;
  elsif p_status = 'ESPERA' then
    select coalesce(max(queue_position), 0) + 1 into v_queue_position
    from attendance
    where match_id = p_match_id and status = 'ESPERA';
    v_final_status := 'ESPERA';
  end if;

  insert into attendance (tenant_id, match_id, player_id, status, responded_at, queue_position, response_source, responded_by)
  values (v_match.tenant_id, p_match_id, p_player_id, v_final_status, now(), v_queue_position, coalesce(p_source, 'SYSTEM'), p_responded_by)
  on conflict (match_id, player_id)
  do update set
    status = excluded.status,
    responded_at = now(),
    queue_position = excluded.queue_position,
    response_source = excluded.response_source,
    responded_by = excluded.responded_by;

  if p_status in ('RECUSOU','FALTOU')
     or (v_previous_status in ('CONFIRMADO','COMPARECEU') and v_final_status not in ('CONFIRMADO','COMPARECEU')) then
    perform promote_waitlist(p_match_id);
  end if;

  return jsonb_build_object('status', v_final_status, 'queue_position', v_queue_position);
end;
$$;

create or replace function public.public_register_player(
  p_token uuid,
  p_name text,
  p_whatsapp text,
  p_position_kind text,
  p_last_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_company companies;
  v_player_id uuid;
  v_position player_position;
  v_first_name text;
  v_last_name text;
  v_full_name text;
  v_whatsapp text;
  v_whatsapp_normalized text;
begin
  select * into v_company
  from companies
  where registration_token = p_token
    and registration_enabled = true
    and status not in ('BLOQUEADA', 'CANCELADA');

  if v_company.id is null then
    raise exception 'Link de inscricao invalido ou indisponivel.';
  end if;

  v_first_name := trim(coalesce(p_name, ''));
  v_last_name := trim(coalesce(p_last_name, ''));
  if length(v_first_name) < 2 then
    raise exception 'Informe seu nome.';
  end if;
  if length(v_last_name) < 2 then
    raise exception 'Informe seu sobrenome.';
  end if;

  v_whatsapp := regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g');
  v_whatsapp_normalized := public.normalize_whatsapp_br(v_whatsapp);
  if v_whatsapp_normalized is null or length(v_whatsapp_normalized) < 10 then
    raise exception 'Informe um WhatsApp valido com DDD.';
  end if;

  if exists (
    select 1
    from players
    where tenant_id = v_company.id
      and public.normalize_whatsapp_br(whatsapp) = v_whatsapp_normalized
  ) then
    raise exception 'Este WhatsApp ja esta cadastrado nesta empresa. Se precisar alterar seus dados, fale com o organizador.';
  end if;

  v_position := case upper(coalesce(p_position_kind, 'LINHA'))
    when 'GOLEIRO' then 'Goleiro'::player_position
    else 'Linha'::player_position
  end;
  v_full_name := v_first_name || ' ' || v_last_name;

  insert into players (
    tenant_id,
    first_name,
    last_name,
    name,
    whatsapp,
    whatsapp_normalized,
    status,
    type,
    technical_score,
    primary_position,
    notes
  )
  values (
    v_company.id,
    v_first_name,
    v_last_name,
    v_full_name,
    v_whatsapp,
    v_whatsapp_normalized,
    'ATIVO',
    'AVULSO',
    5,
    v_position,
    case when v_position = 'Goleiro' then 'Autoinscricao: goleiro' else 'Autoinscricao: jogador de linha' end
  )
  returning id into v_player_id;

  return jsonb_build_object('player_id', v_player_id, 'company', v_company.name, 'name', v_full_name, 'whatsapp', v_whatsapp);
end;
$fn$;

grant execute on function public.public_register_player(uuid, text, text, text, text) to anon, authenticated;
