create or replace function get_dashboard_stats_for_tenant(p_tenant_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  select jsonb_build_object(
    'next_match', (select min(scheduled_at) from matches where tenant_id = p_tenant_id and scheduled_at >= now() and status <> 'CANCELADA'),
    'confirmed', (select count(*) from attendance where tenant_id = p_tenant_id and status in ('CONFIRMADO','COMPARECEU')),
    'waitlist', (select count(*) from attendance where tenant_id = p_tenant_id and status = 'ESPERA'),
    'monthly_revenue', coalesce((select sum(amount) from payments where tenant_id = p_tenant_id and status = 'PAGO' and paid_at >= date_trunc('month', now())), 0),
    'annual_revenue', coalesce((select sum(amount) from payments where tenant_id = p_tenant_id and status = 'PAGO' and paid_at >= date_trunc('year', now())), 0),
    'overdue', (select count(*) from payments where tenant_id = p_tenant_id and status in ('PENDENTE','ATRASADO') and due_date < current_date),
    'monthly_top_scorer', (
      select p.name from match_player_stats s join players p on p.id = s.player_id
      where s.tenant_id = p_tenant_id and s.created_at >= date_trunc('month', now())
      group by p.name order by sum(s.goals) desc limit 1
    ),
    'most_frequent_player', (
      select p.name from match_player_stats s join players p on p.id = s.player_id
      where s.tenant_id = p_tenant_id and s.present = true
      group by p.name order by count(*) desc limit 1
    )
  );
$fn$;

create or replace function get_dashboard_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  select get_dashboard_stats_for_tenant(current_tenant_id());
$fn$;
