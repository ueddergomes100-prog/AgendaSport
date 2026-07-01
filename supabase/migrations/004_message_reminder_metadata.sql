alter table message_logs
add column if not exists match_id uuid references matches(id) on delete set null,
add column if not exists player_id uuid references players(id) on delete set null,
add column if not exists template text,
add column if not exists metadata jsonb not null default '{}';

create unique index if not exists message_logs_reminder_unique_idx
on message_logs (tenant_id, match_id, player_id, type, template)
where match_id is not null
and player_id is not null
and template is not null;

