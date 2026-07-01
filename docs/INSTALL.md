# Manual de instalacao

1. Instale Node.js 24 ou superior.
2. Use o projeto Supabase `https://wrkqwkxdmqptrhuxjzcx.supabase.co`.
3. Rode `supabase/migrations/001_initial_schema.sql` no SQL Editor.
4. Copie `.env.example` para `.env`.
5. Preencha `VITE_SUPABASE_ANON_KEY`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`.
6. Execute `npm run dev:all`.
7. Acesse `http://localhost:5173`.

## Automacao de confirmacao

A API roda um worker a cada `REMINDER_INTERVAL_MINUTES` minutos quando `REMINDER_WORKER_ENABLED=true`.
Ele procura partidas nas proximas 72 horas, cria convocacoes para jogadores ativos quando necessario e envia lembretes de confirmacao em 72h, 48h e 24h para quem ainda estiver como `CONVIDADO`.

Com `WHATSAPP_PROVIDER=disabled`, os envios ficam registrados em `message_logs` com status `QUEUED`.
Para testar manualmente, chame `POST /api/reminders/confirmation/run` autenticado.

Para producao, publique o frontend estatico de `dist/` e o backend `server/src/index.ts` em um runtime Node com HTTPS.
