notify pgrst, 'reload schema';

select
  'tables' as section,
  table_name as name
from information_schema.tables
where table_schema = 'public'
and table_name in (
  'plans',
  'companies',
  'profiles',
  'players',
  'pickups',
  'matches',
  'attendance',
  'team_draws',
  'match_player_stats',
  'payments',
  'message_logs',
  'audit_logs',
  'backup_jobs'
)
order by table_name;

select
  'functions' as section,
  routine_name as name
from information_schema.routines
where routine_schema = 'public'
and routine_name in (
  'handle_new_auth_user',
  'current_profile',
  'is_super_admin',
  'current_tenant_id',
  'can_manage_tenant',
  'promote_waitlist',
  'set_attendance_response',
  'get_dashboard_stats',
  'get_dashboard_stats_for_tenant',
  'set_team_draw_tenant'
)
order by routine_name;
