alter table public.profiles
add column if not exists permissions jsonb not null default '{}'::jsonb;

update public.profiles
set permissions = '{"confirmations": true, "stats": true, "finance": true, "settings": true}'::jsonb
where role = 'ADMINISTRADOR'
  and coalesce(permissions, '{}'::jsonb) = '{}'::jsonb;

create table if not exists public.confirmation_schedules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.companies(id) on delete cascade,
  stage_number integer not null check (stage_number between 1 and 5),
  days_before integer not null default 0 check (days_before between 0 and 30),
  send_time time not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, stage_number)
);

create index if not exists confirmation_schedules_tenant_idx
on public.confirmation_schedules(tenant_id, stage_number);

alter table public.confirmation_schedules enable row level security;

drop policy if exists "confirmation schedules tenant" on public.confirmation_schedules;
create policy "confirmation schedules tenant" on public.confirmation_schedules
for all
using (tenant_id = current_tenant_id() or is_super_admin())
with check (tenant_id = current_tenant_id() or is_super_admin());

insert into public.confirmation_schedules (tenant_id, stage_number, days_before, send_time, enabled)
select id, stage.stage_number, stage.days_before, stage.send_time::time, stage.enabled
from public.companies
cross join (values
  (1, 2, '16:00', true),
  (2, 2, '18:00', true),
  (3, 1, '16:00', true),
  (4, 0, '09:00', true),
  (5, 0, '18:00', false)
) as stage(stage_number, days_before, send_time, enabled)
on conflict (tenant_id, stage_number)
do update set
  days_before = excluded.days_before,
  send_time = excluded.send_time,
  enabled = excluded.enabled;

create table if not exists public.billing_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.companies(id) on delete cascade,
  monthly_billing_day integer not null default 2 check (monthly_billing_day between 1 and 28),
  default_provider text not null default 'MANUAL_PIX' check (default_provider in ('MANUAL_PIX','ASAAS','MERCADO_PAGO','STONE','VINDI')),
  auto_charge_casual_players boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id)
);

create table if not exists public.finance_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.companies(id) on delete cascade,
  player_id uuid references public.players(id) on delete set null,
  match_id uuid references public.matches(id) on delete set null,
  payment_id uuid references public.payments(id) on delete set null,
  kind text not null check (kind in ('RECEITA','DESPESA')),
  category text not null,
  description text not null,
  amount numeric(12,2) not null check (amount >= 0),
  occurred_on date not null default current_date,
  status text not null default 'CONFIRMADO' check (status in ('CONFIRMADO','PENDENTE','CANCELADO')),
  created_at timestamptz not null default now()
);

create index if not exists finance_transactions_tenant_date_idx
on public.finance_transactions(tenant_id, occurred_on desc);

create index if not exists finance_transactions_tenant_kind_idx
on public.finance_transactions(tenant_id, kind, status);

alter table public.billing_settings enable row level security;
alter table public.finance_transactions enable row level security;

drop policy if exists "billing settings tenant" on public.billing_settings;
create policy "billing settings tenant" on public.billing_settings
for all
using (tenant_id = current_tenant_id() or is_super_admin())
with check (tenant_id = current_tenant_id() or is_super_admin());

drop policy if exists "finance transactions tenant" on public.finance_transactions;
create policy "finance transactions tenant" on public.finance_transactions
for all
using (tenant_id = current_tenant_id() or is_super_admin())
with check (tenant_id = current_tenant_id() or is_super_admin());

insert into public.billing_settings (tenant_id)
select id from public.companies
on conflict (tenant_id) do nothing;

notify pgrst, 'reload schema';
