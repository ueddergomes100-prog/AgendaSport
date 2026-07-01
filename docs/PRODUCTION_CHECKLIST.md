# Agenda Sport - Checklist de Producao

## Status atual validado

- Frontend React/Vite compila para producao.
- API Node/Express compila para producao.
- Supabase responde com as tabelas principais.
- Cadastro de participantes pelo banco/RPC funciona.
- Cadastro de evento fixo e agendamento funciona.
- Presenca aceita `SIM`, `NAO` e `ESPERA` via webhook.
- Fila de espera respeita limite do evento.
- Estatisticas individuais por participante salvam em `match_player_stats`.
- Sorteio de equipes salva em `team_draws`.
- Excluir uma partida remove presencas, estatisticas e sorteio vinculados.
- WhatsApp Cloud API ja enviou convocacao real e recebeu resposta real em teste.

## Bloqueadores antes de producao

1. Aplicar migrations pendentes no Supabase.
   - O banco atual ainda esta com `message_logs` sem `match_id`, `player_id`, `template` e `metadata`.
   - Aplicar pelo menos `supabase/migrations/008_message_logs_template_column.sql`.
   - Confirmar tambem `supabase/migrations/006_pickup_delete_cascade.sql` para exclusao direta de evento fixo no banco.

2. Trocar webhook temporario por URL fixa.
   - Hoje o webhook usa `trycloudflare.com`, que expira.
   - Configurar backend publicado com HTTPS, por exemplo:
     `https://api.agendasport.com.br/api/webhooks/whatsapp`
   - Atualizar a URL de callback na Meta.

3. Hospedar frontend e backend.
   - Frontend: Vercel/Netlify/Cloudflare Pages ou servidor proprio.
   - API: Render/Railway/Fly.io/VPS/Cloud Run ou similar.
   - Configurar `CORS_ORIGIN` com o dominio real.

4. Proteger variaveis de ambiente.
   - Nunca commitar `.env`.
   - Configurar `SUPABASE_SERVICE_ROLE_KEY` somente no backend.
   - Rotacionar tokens caso tenham sido expostos durante testes.

5. Confirmar templates WhatsApp.
   - Template aprovado: `confirmacao_pelada`.
   - Antes de escalar, criar template com texto 100% multi-esporte, sem "pelada".
   - Manter botoes: `Sim`, `Ficar na espera`, `Nao`.

6. Revisar plano comercial e limites.
   - Definir cobranca real.
   - Ativar controle de limites por plano.
   - Definir politica de bloqueio por inadimplencia.

## Recomendado antes do primeiro cliente real

- Criar tunnel fixo ou deploy real da API.
- Rodar um teste real com 3 participantes:
  - 1 responde `SIM`.
  - 1 responde `NAO`.
  - 1 responde `Ficar na espera`.
- Testar exclusao:
  - excluir agendamento individual;
  - excluir evento fixo;
  - verificar se sumiram da agenda.
- Testar lancamento no dia do evento:
  - marcar presenca real;
  - informar pontos/gols e assistencias;
  - encerrar evento;
  - conferir relatorio de estatisticas.
