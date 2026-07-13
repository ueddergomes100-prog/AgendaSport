do $$
begin
  alter type public.player_position add value if not exists 'GOLEIRO';
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter type public.player_position add value if not exists 'LINHA';
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter type public.player_position add value if not exists 'Goleiro';
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter type public.player_position add value if not exists 'Linha';
exception
  when duplicate_object then null;
end $$;

create or replace function public.is_goalkeeper_position(p_position public.player_position)
returns boolean
language sql
immutable
as $$
  select upper(p_position::text) = 'GOLEIRO'
$$;

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
as $$
declare
  v_match matches;
  v_player players;
  v_final_status attendance_status := p_status;
  v_position_capacity integer;
  v_confirmed_count integer;
  v_queue_position integer;
  v_is_goalkeeper boolean := false;
begin
  select * into v_match from matches where id = p_match_id;
  if v_match.id is null then
    raise exception 'Evento nao encontrado';
  end if;

  select * into v_player from players where id = p_player_id and tenant_id = v_match.tenant_id;
  if v_player.id is null then
    raise exception 'Participante nao encontrado para esta empresa';
  end if;

  if v_player.status = 'SUSPENSO' then
    raise exception 'Participante suspenso nao pode confirmar presenca';
  end if;

  v_queue_position := null;

  if p_status = 'CONFIRMADO' then
    v_is_goalkeeper := public.is_goalkeeper_position(v_player.primary_position);
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
        (v_is_goalkeeper and public.is_goalkeeper_position(p.primary_position))
        or (not v_is_goalkeeper and not public.is_goalkeeper_position(p.primary_position))
      );

    if v_confirmed_count >= v_position_capacity then
      select coalesce(max(queue_position), 0) + 1 into v_queue_position
      from attendance
      where match_id = p_match_id and status = 'ESPERA';
      v_final_status := 'ESPERA';
    end if;
  elsif p_status = 'ESPERA' then
    select coalesce(max(queue_position), 0) + 1 into v_queue_position
    from attendance
    where match_id = p_match_id and status = 'ESPERA';
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

  if p_status = 'RECUSOU' then
    perform promote_waitlist(p_match_id);
  end if;

  return jsonb_build_object('status', v_final_status, 'queue_position', v_queue_position);
end;
$$;

create or replace function public.public_register_player(
  p_token uuid,
  p_first_name text,
  p_last_name text,
  p_whatsapp text,
  p_position_kind text
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_company companies;
  v_first_name text;
  v_last_name text;
  v_full_name text;
  v_whatsapp text;
  v_whatsapp_normalized text;
  v_position player_position;
  v_player_id uuid;
begin
  select * into v_company
  from companies
  where registration_token = p_token
    and registration_enabled is true
    and status not in ('BLOQUEADA','CANCELADA');

  if v_company.id is null then
    raise exception 'Link de inscricao invalido ou indisponivel.';
  end if;

  v_first_name := trim(coalesce(p_first_name, ''));
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

  v_full_name := concat_ws(' ', v_first_name, v_last_name);
  v_position := case upper(coalesce(p_position_kind, 'LINHA'))
    when 'GOLEIRO' then 'GOLEIRO'::player_position
    else 'LINHA'::player_position
  end;

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
    case when public.is_goalkeeper_position(v_position) then 'Autoinscricao: goleiro' else 'Autoinscricao: jogador de linha' end
  )
  returning id into v_player_id;

  return jsonb_build_object('player_id', v_player_id, 'company', v_company.name, 'name', v_full_name, 'whatsapp', v_whatsapp);
end;
$$;
