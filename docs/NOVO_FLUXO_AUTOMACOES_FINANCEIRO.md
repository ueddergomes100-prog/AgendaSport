# Agenda Sport - novo fluxo de automacoes e financeiro

Este documento resume as alteracoes implementadas apos a primeira rodada real.

## 1. Configuracoes da empresa

Foi criada a tela **Configuracoes** no menu lateral.

Nela o administrador controla:

- etapas de convocacao pelo WhatsApp;
- dia fixo da cobranca de mensalistas;
- provedor padrao de cobranca;
- ativacao futura da cobranca automatica para jogadores avulsos.

## 2. Etapas de convocacao

A empresa agora pode configurar de 4 a 5 etapas de convocacao.

Regras:

- etapas 1 a 4 sao obrigatorias;
- etapa 5 e opcional;
- cada etapa possui:
  - quantidade de dias antes do evento;
  - horario de envio;
  - status ativo/inativo.

Padrao inicial:

- Etapa 1: 2 dias antes, as 16:00;
- Etapa 2: 2 dias antes, as 18:00;
- Etapa 3: 1 dia antes, as 10:00;
- Etapa 4: no dia do evento, as 09:00;
- Etapa 5: opcional.

O worker de lembretes passa a ler essa configuracao e registra cada envio por etapa para evitar reenvio indevido.

## 3. Financeiro real

A tela **Financeiro** agora possui:

- receitas;
- despesas;
- saldo atual;
- cobrancas pendentes;
- historico de movimentacoes;
- baixa manual de pagamento;
- lancamento de despesas do grupo.

Exemplos de despesas:

- quadra;
- bolas;
- coletes;
- arbitragem;
- materiais;
- outras despesas.

## 4. Cobrancas

O administrador pode cadastrar uma cobranca manual com:

- participante;
- provedor;
- valor;
- vencimento;
- status.

Status disponiveis:

- pendente;
- pago;
- atrasado;
- cancelado.

Tambem existe botao para marcar uma cobranca pendente como recebida.

## 5. Mensalistas

Foi adicionada a acao **Gerar mensalidades**.

Fluxo:

1. O administrador configura o dia fixo da mensalidade.
2. O sistema busca jogadores ativos do tipo mensalista.
3. O sistema usa o maior valor mensal configurado nos eventos da empresa.
4. O sistema cria a cobranca do mes.
5. Se a cobranca daquele mensalista ja existir no mes, ela nao e duplicada.

Observacao:

- Para gerar mensalidades, pelo menos um evento precisa ter valor mensal maior que zero.

## 6. Avulsos

Foi criada a base da cobranca automatica para avulsos.

Quando a opcao **Cobrar avulso ao confirmar** estiver ativa:

1. jogador responde SIM no WhatsApp;
2. webhook registra a presenca;
3. sistema cria uma cobranca pendente para aquele jogador e evento;
4. sistema envia aviso de cobranca pelo WhatsApp.

Nesta fase o pagamento ainda e manual. A integracao com Asaas, Mercado Pago, Stone ou Vindi entra em uma etapa posterior.

## 7. Estatisticas pos-jogo

O relatorio de estatisticas passa a mostrar:

- artilharia;
- assistencias;
- campanhas individuais;
- ranking de equipes campeas;
- resultados recentes dos eventos.

Quando o evento possui sorteio salvo, o fechamento da sumula permite informar o placar das equipes. Ao finalizar, o sistema calcula vitorias, empates e derrotas para os participantes.

## 8. SQL necessario

Antes de publicar esta versao em producao, rode no Supabase a migration:

```sql
supabase/migrations/011_schedules_and_finance_transactions.sql
```

Ela cria:

- `confirmation_schedules`;
- `billing_settings`;
- `finance_transactions`;
- indices;
- RLS;
- configuracoes padrao para empresas existentes.

## 9. WhatsApp em grupo

A integracao automatica com grupo ficou fora desta etapa por decisao de produto.

Fluxo atual:

- confirmacoes individuais seguem pela API oficial;
- sorteio pode ser copiado/aberto no WhatsApp;
- envio automatico em grupos sera decidido depois.
