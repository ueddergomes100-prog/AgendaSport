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
