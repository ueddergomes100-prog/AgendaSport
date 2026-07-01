drop trigger if exists on_auth_user_created on auth.users;

drop table if exists public.backup_jobs cascade;
drop table if exists public.audit_logs cascade;
drop table if exists public.message_logs cascade;
drop table if exists public.payments cascade;
drop table if exists public.match_player_stats cascade;
drop table if exists public.team_draws cascade;
drop table if exists public.attendance cascade;
drop table if exists public.matches cascade;
drop table if exists public.pickups cascade;
drop table if exists public.players cascade;
drop table if exists public.profiles cascade;
drop table if exists public.companies cascade;
drop table if exists public.plans cascade;

drop function if exists public.handle_new_auth_user() cascade;
drop function if exists public.current_profile() cascade;
drop function if exists public.is_super_admin() cascade;
drop function if exists public.current_tenant_id() cascade;
drop function if exists public.can_manage_tenant() cascade;
drop function if exists public.promote_waitlist(uuid) cascade;
drop function if exists public.get_dashboard_stats() cascade;
drop function if exists public.get_dashboard_stats_for_tenant(uuid) cascade;
drop function if exists public.set_team_draw_tenant() cascade;

drop type if exists public.payment_status cascade;
drop type if exists public.attendance_status cascade;
drop type if exists public.match_status cascade;
drop type if exists public.player_position cascade;
drop type if exists public.player_type cascade;
drop type if exists public.player_status cascade;
drop type if exists public.company_status cascade;
drop type if exists public.user_role cascade;
