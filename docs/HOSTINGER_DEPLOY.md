# Agenda Sport na Hostinger

Este modo publica frontend React e backend Express no mesmo app Node.js.

## Configuracao do app Node.js

No hPanel da Hostinger, crie/import um Node.js App pelo GitHub.

Use:

```text
Branch: main
Node.js: 22 LTS
Build command: npm ci && npm run build:hostinger
Start command: npm start
Application URL: https://agendasport.com.br
```

Se `NODE_ENV=production` estiver configurado nas variaveis de ambiente, use este build command para garantir que TypeScript/Vite sejam instalados no build:

```text
npm ci --include=dev && npm run build:hostinger
```

Se a Hostinger pedir `Application root`, use a raiz do repositorio.

## Variaveis de ambiente

Configure no painel da Hostinger:

```bash
NODE_ENV=production
PORT=3000
SUPABASE_URL=https://wrkqwkxdmqptrhuxjzcx.supabase.co
SUPABASE_ANON_KEY=cole_a_anon_key_do_supabase
SUPABASE_SERVICE_ROLE_KEY=cole_a_service_role_key_do_supabase
CORS_ORIGIN=https://agendasport.com.br,https://www.agendasport.com.br

VITE_SUPABASE_URL=https://wrkqwkxdmqptrhuxjzcx.supabase.co
VITE_SUPABASE_ANON_KEY=cole_a_anon_key_do_supabase
VITE_API_BASE_URL=

WHATSAPP_PROVIDER=meta
WHATSAPP_ACCESS_TOKEN=cole_o_token_permanente_da_meta
WHATSAPP_PHONE_NUMBER_ID=cole_o_phone_number_id
WHATSAPP_GRAPH_API_VERSION=v25.0
WHATSAPP_VERIFY_TOKEN=agendasport_webhook_2026
WHATSAPP_CONFIRMATION_TEMPLATE_NAME=confirmacao_pelada
WHATSAPP_TEMPLATE_LANGUAGE=pt_BR

REMINDER_WORKER_ENABLED=true
REMINDER_INTERVAL_MINUTES=15
```

`VITE_API_BASE_URL` fica vazio porque o frontend e a API ficam no mesmo dominio.

## Supabase antes do primeiro deploy real

Rode no SQL Editor:

```text
supabase/PRODUCTION_MIGRATION.sql
```

## WhatsApp Meta

Callback URL:

```text
https://agendasport.com.br/api/webhooks/whatsapp
```

Verify token:

```text
agendasport_webhook_2026
```

Assine o campo:

```text
messages
```

## Teste pos-deploy

1. Abrir `https://agendasport.com.br/api/health`.
2. Abrir `https://agendasport.com.br`.
3. Fazer login.
4. Criar evento futuro.
5. Convocar participantes.
6. Responder SIM, NAO e ESPERA pelo WhatsApp.
7. Conferir a resposta na Agenda.
