create table if not exists confirmation_schedules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references companies(id) on delete cascade,
  stage_number integer not null check (stage_number between 1 and 5),
  days_before integer not null default 0 check (days_before between 0 and 30),
  send_time time not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, stage_number)
);

create table if not exists billing_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references companies(id) on delete cascade,
  monthly_billing_day integer not null default 2 check (monthly_billing_day between 1 and 28),
  default_provider text not null default 'MANUAL_PIX' check (default_provider in ('MANUAL_PIX','ASAAS','MERCADO_PAGO','STONE','VINDI')),
  auto_charge_casual_players boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id)
);

create table if not exists finance_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references companies(id) on delete cascade,
  player_id uuid references players(id) on delete set null,
  match_id uuid references matches(id) on delete set null,
  payment_id uuid references payments(id) on delete set null,
  kind text not null check (kind in ('RECEITA','DESPESA')),
  category text not null,
  description text not null,
  amount numeric(12,2) not null check (amount >= 0),
  occurred_on date not null default current_date,
  status text not null default 'CONFIRMADO' check (status in ('CONFIRMADO','PENDENTE','CANCELADO')),
  created_at timestamptz not null default now()
);

create index if not exists confirmation_schedules_tenant_idx on confirmation_schedules(tenant_id, stage_number);
create index if not exists finance_transactions_tenant_date_idx on finance_transactions(tenant_id, occurred_on desc);
create index if not exists finance_transactions_tenant_kind_idx on finance_transactions(tenant_id, kind, status);

alter table confirmation_schedules enable row level security;
alter table billing_settings enable row level security;
alter table finance_transactions enable row level security;

drop policy if exists "confirmation schedules tenant" on confirmation_schedules;
create policy "confirmation schedules tenant" on confirmation_schedules
for all
using (tenant_id = current_tenant_id() or is_super_admin())
with check (tenant_id = current_tenant_id() or is_super_admin());

drop policy if exists "billing settings tenant" on billing_settings;
create policy "billing settings tenant" on billing_settings
for all
using (tenant_id = current_tenant_id() or is_super_admin())
with check (tenant_id = current_tenant_id() or is_super_admin());

drop policy if exists "finance transactions tenant" on finance_transactions;
create policy "finance transactions tenant" on finance_transactions
for all
using (tenant_id = current_tenant_id() or is_super_admin())
with check (tenant_id = current_tenant_id() or is_super_admin());

insert into confirmation_schedules (tenant_id, stage_number, days_before, send_time, enabled)
select id, stage.stage_number, stage.days_before, stage.send_time::time, stage.enabled
from companies
cross join (values
  (1, 2, '16:00', true),
  (2, 0, '09:00', true),
  (3, 0, '12:00', false),
  (4, 0, '15:00', false),
  (5, 0, '18:00', false)
) as stage(stage_number, days_before, send_time, enabled)
on conflict (tenant_id, stage_number) do nothing;

insert into billing_settings (tenant_id)
select id from companies
on conflict (tenant_id) do nothing;
