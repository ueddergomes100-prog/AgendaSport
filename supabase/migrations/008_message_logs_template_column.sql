alter table message_logs
add column if not exists match_id uuid references matches(id) on delete set null;

alter table message_logs
add column if not exists player_id uuid references players(id) on delete set null;

alter table message_logs
add column if not exists template text;

alter table message_logs
add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists message_logs_match_template_idx
on message_logs(match_id, type, template);
