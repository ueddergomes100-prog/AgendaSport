# Agenda Sport

SaaS multiempresa para organizadores de eventos esportivos, treinos, jogos recreativos, campeonatos amadores e escolinhas.

## Stack

- Frontend: React, TypeScript, Vite, TailwindCSS, componentes no estilo ShadCN/UI.
- Backend: Node.js, TypeScript, Express, Helmet, CORS e rate limit.
- Banco e plataforma: Supabase PostgreSQL, Auth, Storage, Realtime e RLS.
- App: PWA instalavel, responsivo, dark mode e isolamento por `tenant_id`.

## Modulos Entregues

- Auth: login, cadastro, recuperacao de senha, logout e sessao persistente via Supabase Auth.
- Multi-Tenant: tabelas com `tenant_id`, funcoes auxiliares e policies RLS.
- Super Admin: empresas, planos, status, limites, assinaturas e backup manual.
- Participantes: cadastro, foto por Storage, status, mensalista/avulso, nota tecnica e funcoes.
- Eventos: local, endereco, Google Maps, horarios, valores, capacidade e prioridade de mensalistas.
- Agenda: criacao e listagem de eventos agendados.
- Confirmacao: RPC `set_attendance_response` com lista de espera e promocao automatica.
- Sorteio: algoritmo real de montagem de equipes por nota, funcao e equilibrio.
- Eventos e estatisticas: tabelas de resultados, pontos, assistencias, presenca e MVP.
- Financeiro: pagamentos, inadimplencia e preparacao para Asaas/Mercado Pago.
- WhatsApp: camada de envio preparada para Meta ou Evolution API e `message_logs`.
- Confirmacao automatica: worker da API envia lembretes de 72h, 48h e 24h para convocados sem resposta.
- Auditoria: tabela `audit_logs`.
- Backup: tabela `backup_jobs` e endpoint de solicitacao manual.

## Instalacao

```bash
npm install
cp .env.example .env
```

O `.env` ja aponta para `https://wrkqwkxdmqptrhuxjzcx.supabase.co`. Preencha apenas as chaves `anon` e `service_role` do Supabase.

## Supabase

1. Use o projeto `https://wrkqwkxdmqptrhuxjzcx.supabase.co`.
2. Execute a migration em `supabase/migrations/001_initial_schema.sql`.
3. Configure Auth com email/senha.
4. Crie o primeiro usuario pelo Supabase Auth.
5. Insira manualmente o perfil inicial `SUPER_ADMIN` em `profiles`, apontando para o `id` do usuario.

Exemplo:

```sql
insert into profiles (id, full_name, role)
values ('USER_UUID_DO_AUTH', 'Super Admin', 'SUPER_ADMIN');
```

## Desenvolvimento

Frontend:

```bash
npm run dev
```

Backend:

```bash
npm run dev:api
```

Ambos:

```bash
npm run dev:all
```

## WhatsApp Cloud API

Depois de validar a conta/app na Meta, configure o `.env`:

```bash
WHATSAPP_PROVIDER=meta
WHATSAPP_ACCESS_TOKEN=seu-token-da-meta
WHATSAPP_PHONE_NUMBER_ID=id-do-numero-do-whatsapp
WHATSAPP_GRAPH_API_VERSION=v25.0
WHATSAPP_VERIFY_TOKEN=agendasport_webhook_2026
WHATSAPP_CONFIRMATION_TEMPLATE_NAME=confirmacao_pelada
WHATSAPP_TEMPLATE_LANGUAGE=pt_BR
```

No painel da Meta, use a URL publica da API com o caminho:

```text
https://api.agendasport.com.br/api/webhooks/whatsapp
```

Assine o campo `messages` no webhook. As respostas recebidas como `SIM`, `S`, `CONFIRMO`, `NAO`, `N`, `NAO VOU`, `ESPERA` ou `FILA` atualizam automaticamente a resposta do participante no proximo evento ativo vinculado ao telefone cadastrado.

## Build

```bash
npm run build
npm run build:api
```

## Pagamentos individuais

O financeiro suporta PIX pelo Asaas e Mercado Pago. Quando um participante
avulso confirma presenca e a opcao de cobranca automatica esta ativa, o backend:

1. respeita o limite da funcao do participante;
2. gera uma unica cobranca vinculada ao evento;
3. salva o link e o PIX copia e cola;
4. envia a cobranca ao WhatsApp individual;
5. recebe o retorno do gateway e atualiza o pagamento.

Webhooks de producao:

```text
https://agendasport.com.br/api/webhooks/payments/asaas
https://agendasport.com.br/api/webhooks/payments/mercado-pago
```

Abrir esses enderecos no navegador deve retornar JSON com status `ready` ou
`configuration_required`. As notificacoes financeiras reais chegam por
`POST`. As credenciais ficam somente no backend.

Antes de ativar, execute tambem:

```text
supabase/migrations/015_capacity_and_billing_delivery.sql
```

Essa migracao blinda os limites independentes de jogadores de linha e goleiros,
mantem excedentes na fila da propria funcao e promove automaticamente quando
uma vaga e liberada.

## Docker

```bash
docker compose up --build
```

## Seguranca

- RLS habilitado nas tabelas operacionais.
- Isolamento por `tenant_id`.
- Perfis por papel: `SUPER_ADMIN`, `ADMINISTRADOR`, `ORGANIZADOR`, `OPERADOR`, `JOGADOR`.
- Backend com Helmet, rate limit, validacao Zod e JWT Supabase.
- Senhas sao gerenciadas pelo Supabase Auth.

## Proximos passos de producao

- Configurar SMTP/Auth no Supabase.
- Configurar webhook real do gateway escolhido.
- Configurar provider WhatsApp e webhooks de resposta.
- Configurar provider WhatsApp em producao para os lembretes automaticos sairem do modo log.
- Definir politica externa de backup do banco PostgreSQL.
