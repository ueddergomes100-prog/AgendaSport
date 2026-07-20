# Atualizacao das melhorias - 20/07/2026

Este documento registra o novo fluxo implementado a partir do feedback dos
clientes e os passos obrigatorios para ativacao em producao.

## Status funcional

1. **Resultados das partidas: concluido.** A sumula permite registrar varias
   partidas entre as equipes sorteadas, com placar individual por jogo. O
   sistema calcula vitorias, empates, derrotas, campeao da rodada e ranking de
   campeoes.
2. **Sumula e ranking: concluido.** A tela de Estatisticas lista somente eventos
   encerrados, exibe gols, assistencias, resultados, destaques e campeoes. O
   relatorio pode ser salvo em PDF e o resumo pode ser enviado ao WhatsApp.
3. **Confirmacao de cadastro: concluido.** O autocadastro informa sucesso e
   impede telefone duplicado no mesmo organizador.
4. **Grupo do WhatsApp: implementado e dependente da Meta.** Confirmacoes,
   recusas, fila, promocoes e lista completa atualizam o grupo configurado.
   Sorteio e sumula tambem possuem envio. A conta do WhatsApp Business precisa
   ter acesso ao recurso oficial de grupos da Meta, com o ID do grupo informado
   nas Configuracoes.
5. **Etapas de convocacao: concluido.** Sao permitidas de duas a cinco etapas,
   com dias e horarios configuraveis. Cada participante possui sua etapa.
6. **Suspensoes: concluido.** Participantes suspensos nao recebem convocacao e
   nao ocupam vaga.
7. **Mensalistas: concluido no sistema.** O dia fixo gera cobrancas mensais,
   envia lembretes, marca atraso, permite baixa manual, suspende por
   inadimplencia e libera apos pagamento.
8. **Avulsos: concluido no sistema.** Quando a resposta real fica como
   Confirmado, a cobranca e criada e enviada automaticamente. Quem entra na
   fila nao recebe cobranca antecipada.
9. **Envio do sorteio: concluido.** Ao salvar o sorteio, o sistema envia equipes,
   jogadores, goleiros, data, horario e local ao grupo configurado.
10. **Nomenclatura: concluido.** Para futebol, a interface usa Gols.
11. **Receitas e despesas: concluido.** O financeiro registra tipo, valor, data,
   categoria, forma de pagamento, descricao e responsavel, alem de calcular
   receitas, despesas, saldo e pendencias.
12. **Administradores e permissoes: concluido.** Os modulos sao independentes:
   financeiro, convocacoes, participantes, sorteio, estatisticas, resultados,
   configuracoes e suspensoes. Somente Administrador principal gerencia outros
   usuarios.
13. **Lista por funcao e fila: concluido.** Goleiros e jogadores de linha usam
   limites independentes. Excedentes entram na fila da propria funcao e a
   primeira pessoa elegivel e promovida quando uma vaga e liberada.
14. **Convocacao apos autocadastro: concluido.** Um novo participante e
   adicionado aos eventos futuros com convocacao ativa e recebe somente a
   convocacao correspondente, sem reenviar mensagens aos demais.

## Migração obrigatoria do Supabase

Executar no SQL Editor do Supabase, uma unica vez:

`supabase/migrations/014_feedback_hardening.sql`

Essa migracao cria as colunas e tabelas que sustentam permissoes, etapas,
financeiro, configuracao do grupo, resultados por partida e retorno dos
provedores. Ela tambem substitui a funcao de confirmacao para aplicar limites
separados de linha e goleiro, fila cronologica e promocao automatica.

Depois da execucao, aguardar alguns segundos para o PostgREST atualizar o cache
de esquema e recarregar o sistema.

## Variaveis novas de producao

```env
PUBLIC_API_URL=https://agendasport.com.br

# Asaas
ASAAS_API_KEY=
ASAAS_API_URL=https://api.asaas.com/v3
ASAAS_WEBHOOK_TOKEN=

# Mercado Pago
MERCADO_PAGO_ACCESS_TOKEN=
MERCADO_PAGO_API_URL=https://api.mercadopago.com
MERCADO_PAGO_WEBHOOK_SECRET=
```

`ASAAS_WEBHOOK_TOKEN` deve ter entre 32 e 255 caracteres e nao deve ser a chave
da API. Os segredos nunca devem ser colocados no frontend ou no Git.

## Webhooks financeiros

### Asaas

Cadastrar no painel do Asaas:

- URL: `https://agendasport.com.br/api/webhooks/payments/asaas`
- Token de autenticacao: o mesmo valor de `ASAAS_WEBHOOK_TOKEN`
- Eventos: cobranca recebida, confirmada, vencida, estornada e excluida

### Mercado Pago

Cadastrar em Suas integracoes, na aplicacao de producao:

- URL: `https://agendasport.com.br/api/webhooks/payments/mercado-pago`
- Evento: Pagamentos
- Assinatura secreta: salvar em `MERCADO_PAGO_WEBHOOK_SECRET`

O endpoint valida a assinatura HMAC recebida, consulta o pagamento diretamente
no Mercado Pago e atualiza a cobranca local. Pagamentos aprovados liberam
automaticamente participantes suspensos por inadimplencia, desde que nao exista
outra cobranca atrasada.

## Configuracao do WhatsApp

1. Manter o webhook de mensagens em
   `https://agendasport.com.br/api/webhooks/whatsapp`.
2. Criar e aprovar o template de cobranca com cinco variaveis:
   nome, descricao, valor, vencimento e link/PIX.
3. Informar o nome em `WHATSAPP_BILLING_TEMPLATE_NAME`.
4. Na tela Configuracoes, habilitar atualizacoes de grupo e informar o ID
   oficial do grupo fornecido pela Meta.

Sem template de cobranca aprovado, mensagens fora da janela de atendimento de
24 horas podem ser recusadas pela Meta.

## Validacao recomendada apos publicar

1. Criar um evento de teste com uma vaga de linha e uma de goleiro.
2. Confirmar tres participantes e validar a fila por funcao.
3. Recusar um confirmado e verificar promocao e aviso automaticos.
4. Entrar com um usuario auxiliar e conferir apenas os modulos permitidos.
5. Registrar receita e despesa com forma de pagamento e responsavel.
6. Salvar sorteio, registrar duas partidas e encerrar o evento.
7. Abrir Estatisticas, conferir campeao e gerar o PDF.
8. Gerar uma cobranca de baixo valor no ambiente de teste do provedor.
9. Confirmar que o webhook altera a cobranca para Pago e libera o participante.

