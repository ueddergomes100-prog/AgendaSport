create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

create type user_role as enum ('SUPER_ADMIN','ADMINISTRADOR','ORGANIZADOR','OPERADOR','JOGADOR');
create type company_status as enum ('ATIVA','BLOQUEADA','TRIAL','CANCELADA');
create type player_status as enum ('ATIVO','INATIVO');
create type player_type as enum ('MENSALISTA','AVULSO');
create type player_position as enum ('Goleiro','Linha','Zagueiro','Lateral','Volante','Meio Campo','Atacante');
create type match_status as enum ('AGENDADA','ABERTA','ENCERRADA','CANCELADA');
create type attendance_status as enum ('CONVIDADO','CONFIRMADO','RECUSOU','ESPERA','COMPARECEU','FALTOU');
create type payment_status as enum ('PENDENTE','PAGO','ATRASADO','CANCELADO');

create table plans (
  code text primary key,
  name text not null,
  max_players integer,
  max_pickups integer,
  monthly_price numeric(12,2) not null default 0
);

insert into plans (code, name, max_players, max_pickups, monthly_price) values
('Starter','Starter',50,2,99.00),
('Pro','Pro',200,10,199.00),
('Elite','Elite',null,null,399.00)
on conflict do nothing;
