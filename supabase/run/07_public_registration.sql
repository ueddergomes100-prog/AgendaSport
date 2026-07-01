alter table companies
add column if not exists registration_token uuid not null default gen_random_uuid(),
add column if not exists registration_enabled boolean not null default true;

create unique index if not exists companies_registration_token_idx on companies(registration_token);

create or replace function get_registration_company(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  select jsonb_build_object(
    'name', name,
    'status', status,
    'registration_enabled', registration_enabled
  )
  from companies
  where registration_token = p_token;
$fn$;

create or replace function public_register_player(
  p_token uuid,
  p_name text,
  p_whatsapp text,
  p_position_kind text
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
begin
  select * into v_company
  from companies
  where registration_token = p_token
  and registration_enabled = true
  and status not in ('BLOQUEADA', 'CANCELADA');

  if v_company.id is null then
    raise exception 'Link de inscricao invalido ou indisponivel.';
  end if;

  if length(trim(coalesce(p_name, ''))) < 2 then
    raise exception 'Informe seu nome.';
  end if;

  if length(regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g')) < 10 then
    raise exception 'Informe um WhatsApp valido com DDD.';
  end if;

  v_position := case upper(coalesce(p_position_kind, 'LINHA'))
    when 'GOLEIRO' then 'Goleiro'::player_position
    else 'Linha'::player_position
  end;

  insert into players (
    tenant_id,
    name,
    whatsapp,
    status,
    type,
    technical_score,
    primary_position,
    notes
  )
  values (
    v_company.id,
    trim(p_name),
    regexp_replace(p_whatsapp, '\D', '', 'g'),
    'ATIVO',
    'AVULSO',
    5,
    v_position,
    case when v_position = 'Goleiro' then 'Autoinscricao: goleiro' else 'Autoinscricao: jogador de linha' end
  )
  returning id into v_player_id;

  return jsonb_build_object('player_id', v_player_id, 'company', v_company.name);
end;
$fn$;

grant execute on function get_registration_company(uuid) to anon, authenticated;
grant execute on function public_register_player(uuid, text, text, text) to anon, authenticated;
