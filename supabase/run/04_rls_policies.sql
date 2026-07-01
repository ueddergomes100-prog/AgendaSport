alter table plans enable row level security;
alter table companies enable row level security;
alter table profiles enable row level security;
alter table players enable row level security;
alter table pickups enable row level security;
alter table matches enable row level security;
alter table attendance enable row level security;
alter table team_draws enable row level security;
alter table match_player_stats enable row level security;
alter table payments enable row level security;
alter table message_logs enable row level security;
alter table audit_logs enable row level security;
alter table backup_jobs enable row level security;

create policy "plans readable" on plans for select using (true);
create policy "plans super admin manage" on plans for all using (is_super_admin()) with check (is_super_admin());

create policy "super admin manages companies" on companies for all using (is_super_admin()) with check (is_super_admin());
create policy "tenant users read company" on companies for select using (id = current_tenant_id() or is_super_admin());

create policy "profiles self or same tenant" on profiles for select using (id = auth.uid() or tenant_id = current_tenant_id() or is_super_admin());
create policy "profiles managed by admins" on profiles for all using (is_super_admin() or (tenant_id = current_tenant_id() and can_manage_tenant())) with check (is_super_admin() or tenant_id = current_tenant_id());

create policy "players tenant read" on players for select using (tenant_id = current_tenant_id() or is_super_admin());
create policy "players tenant manage" on players for all using (tenant_id = current_tenant_id() and can_manage_tenant() or is_super_admin()) with check (tenant_id = current_tenant_id() or is_super_admin());

create policy "pickups tenant read" on pickups for select using (tenant_id = current_tenant_id() or is_super_admin());
create policy "pickups tenant manage" on pickups for all using (tenant_id = current_tenant_id() and can_manage_tenant() or is_super_admin()) with check (tenant_id = current_tenant_id() or is_super_admin());

create policy "matches tenant read" on matches for select using (tenant_id = current_tenant_id() or is_super_admin());
create policy "matches tenant manage" on matches for all using (tenant_id = current_tenant_id() and can_manage_tenant() or is_super_admin()) with check (tenant_id = current_tenant_id() or is_super_admin());

create policy "attendance tenant read" on attendance for select using (tenant_id = current_tenant_id() or is_super_admin());
create policy "attendance tenant manage" on attendance for all using (tenant_id = current_tenant_id() or is_super_admin()) with check (tenant_id = current_tenant_id() or is_super_admin());

create policy "team draws tenant" on team_draws for all using (tenant_id = current_tenant_id() or is_super_admin()) with check (tenant_id = current_tenant_id() or is_super_admin());
create policy "stats tenant" on match_player_stats for all using (tenant_id = current_tenant_id() or is_super_admin()) with check (tenant_id = current_tenant_id() or is_super_admin());
create policy "payments tenant" on payments for all using (tenant_id = current_tenant_id() or is_super_admin()) with check (tenant_id = current_tenant_id() or is_super_admin());
create policy "messages tenant" on message_logs for all using (tenant_id = current_tenant_id() or is_super_admin()) with check (tenant_id = current_tenant_id() or is_super_admin());
create policy "audit tenant" on audit_logs for select using (tenant_id = current_tenant_id() or is_super_admin());
create policy "backup super admin" on backup_jobs for all using (is_super_admin()) with check (is_super_admin());
