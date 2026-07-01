drop trigger if exists on_auth_user_created on auth.users;

create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  insert into profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'JOGADOR')
  on conflict (id) do nothing;
  return new;
end;
$fn$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function handle_new_auth_user();

create or replace function current_profile()
returns profiles
language sql
stable
security definer
set search_path = public
as $fn$
  select * from profiles where id = auth.uid();
$fn$;

create or replace function is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists(select 1 from profiles where id = auth.uid() and role = 'SUPER_ADMIN');
$fn$;

create or replace function current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $fn$
  select tenant_id from profiles where id = auth.uid();
$fn$;

create or replace function can_manage_tenant()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists(
    select 1 from profiles
    where id = auth.uid()
    and role in ('SUPER_ADMIN','ADMINISTRADOR','ORGANIZADOR','OPERADOR')
  );
$fn$;
