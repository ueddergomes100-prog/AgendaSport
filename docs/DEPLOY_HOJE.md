# Agenda Sport - publicacao hoje

Este roteiro coloca o MVP em producao inicial usando:

- Frontend: Vercel em `agendasport.com.br`
- Backend/API: Render em `api.agendasport.com.br`
- Banco/Auth: Supabase
- WhatsApp: Meta Cloud API

## 1. Supabase

Abra o projeto Supabase e rode no SQL Editor:

```sql
-- arquivo do projeto:
-- supabase/PRODUCTION_MIGRATION.sql
```

Depois confirme que `message_logs` possui:

- `match_id`
- `player_id`
- `template`
- `metadata`

Sem isso o sistema ate envia/recebe WhatsApp, mas producao fica fraca para auditoria, deduplicacao e rastreio por evento.

## 2. Backend no Render

Crie um Web Service apontando para este repositorio.

Config:

- Build command: `npm ci && npm run build:api`
- Start command: `npm run start:api`
- Health check: `/api/health`
- Runtime: Node

Variaveis:

```bash
NODE_ENV=production
PORT=10000
SUPABASE_URL=https://wrkqwkxdmqptrhuxjzcx.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
CORS_ORIGIN=https://agendasport.com.br,https://www.agendasport.com.br
WHATSAPP_PROVIDER=meta
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_GRAPH_API_VERSION=v25.0
WHATSAPP_VERIFY_TOKEN=agendasport_webhook_2026
WHATSAPP_CONFIRMATION_TEMPLATE_NAME=confirmacao_pelada
WHATSAPP_TEMPLATE_LANGUAGE=pt_BR
REMINDER_WORKER_ENABLED=true
REMINDER_INTERVAL_MINUTES=15
```

Quando o Render gerar a URL, teste:

```text
https://SUA-URL-DO-RENDER/api/health
```

Depois configure o DNS:

```text
api.agendasport.com.br -> CNAME da URL do Render
```

## 3. Frontend na Vercel

Crie o projeto Vercel apontando para este repositorio.

Config:

- Framework: Vite
- Build command: `npm run build`
- Output directory: `dist`

Variaveis:

```bash
VITE_SUPABASE_URL=https://wrkqwkxdmqptrhuxjzcx.supabase.co
VITE_SUPABASE_ANON_KEY=...
VITE_API_BASE_URL=https://api.agendasport.com.br
```

Configure o dominio:

```text
agendasport.com.br
www.agendasport.com.br
```

## 4. Meta WhatsApp

No app da Meta, configure o webhook:

```text
Callback URL:
https://api.agendasport.com.br/api/webhooks/whatsapp

Verify token:
agendasport_webhook_2026
```

Assine o campo:

```text
messages
```

Teste real:

1. Cadastre 3 participantes com WhatsApp.
2. Crie um evento futuro.
3. Clique em convocar.
4. Um responde SIM.
5. Um responde NAO.
6. Um responde FICAR NA ESPERA/ESPERA.
7. Confirme na Agenda se os status mudaram.

## 5. Check final

Antes de abrir para cliente:

```bash
npm run predeploy:check
```

Checklist:

- Supabase migration aplicada.
- `/api/health` responde em producao.
- Frontend abre em `https://agendasport.com.br`.
- Login funciona.
- Convocacao WhatsApp envia.
- Resposta WhatsApp retorna para a Agenda.
- CORS sem erro no console.
- Meta webhook usando URL definitiva, nao trycloudflare.

