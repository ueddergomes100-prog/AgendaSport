# Arquitetura

O Agenda Sport usa Supabase como fonte central de verdade. Todas as tabelas de negocio possuem `tenant_id` e RLS. O frontend usa o cliente anonimo, respeitando as policies. O backend usa JWT Supabase para identificar o usuario e service role apenas para operacoes controladas, como mensageria, cobrancas e backups.

## Fluxo multiempresa

1. Usuario autentica via Supabase Auth.
2. `profiles` resolve `role` e `tenant_id`.
3. Queries filtram automaticamente via RLS.
4. `SUPER_ADMIN` tem policies para enxergar todos os tenants.

## Sorteio

O algoritmo em `src/lib/team-draw.ts` ordena jogadores por nota e peso de posicao, distribui por menor penalidade e calcula diferenca percentual entre as pontuacoes finais.

## Lista de espera

A RPC `set_attendance_response` confirma o jogador se houver vaga. Quando a partida esta cheia, o jogador entra como `ESPERA` com `queue_position`. Ao recusar, `promote_waitlist` promove o proximo automaticamente.
