create index if not exists players_tenant_idx on players(tenant_id);
create index if not exists pickups_tenant_idx on pickups(tenant_id);
create index if not exists matches_tenant_scheduled_idx on matches(tenant_id, scheduled_at desc);
create index if not exists attendance_match_status_idx on attendance(match_id, status);
create index if not exists payments_tenant_status_idx on payments(tenant_id, status, due_date);
create index if not exists stats_tenant_player_idx on match_player_stats(tenant_id, player_id);
create unique index if not exists message_logs_reminder_unique_idx
on message_logs (tenant_id, match_id, player_id, type, template)
where match_id is not null
and player_id is not null
and template is not null;
