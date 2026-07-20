begin;

create table if not exists public.payment_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.companies(id) on delete cascade,
  provider text not null default 'ASAAS'
    check (provider in ('ASAAS', 'MERCADO_PAGO')),
  provider_account_id text,
  wallet_id text,
  status text not null default 'PENDENTE'
    check (status in ('PENDENTE', 'VINCULADA', 'BLOQUEADA', 'ERRO')),
  account_name text,
  account_email text,
  document_last4 text,
  split_percentage numeric(5,2) not null default 100
    check (split_percentage > 0 and split_percentage <= 100),
  last_error text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider)
);

create unique index if not exists payment_accounts_provider_account_idx
on public.payment_accounts(provider, provider_account_id)
where provider_account_id is not null;

create unique index if not exists payment_accounts_wallet_idx
on public.payment_accounts(provider, wallet_id)
where wallet_id is not null;

alter table public.payments
add column if not exists recipient_wallet_id text;

alter table public.payments
add column if not exists split_percentage numeric(5,2);

alter table public.payment_accounts enable row level security;

drop policy if exists "payment accounts permitted read" on public.payment_accounts;
create policy "payment accounts permitted read" on public.payment_accounts
for select
using (
  is_super_admin()
  or (
    tenant_id = current_tenant_id()
    and (
      public.has_tenant_permission('finance')
      or public.has_tenant_permission('settings')
    )
  )
);

drop policy if exists "payment accounts administrator manage" on public.payment_accounts;
create policy "payment accounts administrator manage" on public.payment_accounts
for all
using (
  is_super_admin()
  or public.is_tenant_administrator(tenant_id)
)
with check (
  is_super_admin()
  or public.is_tenant_administrator(tenant_id)
);

notify pgrst, 'reload schema';

commit;
