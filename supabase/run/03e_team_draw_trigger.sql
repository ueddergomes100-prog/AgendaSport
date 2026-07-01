create or replace function set_team_draw_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.tenant_id is null then
    select tenant_id into new.tenant_id from matches where id = new.match_id;
  end if;
  new.created_by := auth.uid();
  return new;
end;
$fn$;

drop trigger if exists team_draws_set_tenant on team_draws;

create trigger team_draws_set_tenant
before insert on team_draws
for each row execute function set_team_draw_tenant();
