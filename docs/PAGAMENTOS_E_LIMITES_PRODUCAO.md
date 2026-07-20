# Pagamentos e limites por funcao

## Fluxo de cobranca

1. O administrador escolhe Asaas ou Mercado Pago em Configuracoes.
2. O participante avulso responde SIM pelo WhatsApp ou e confirmado pelo admin.
3. O banco reserva uma vaga da funcao do participante.
4. Se houver vaga, o sistema cria somente uma cobranca para aquele participante
   e evento.
5. O link/PIX e enviado no WhatsApp individual.
6. O webhook do gateway marca a cobranca como paga, atrasada ou cancelada.
7. O financeiro permite reenviar a cobranca, copiar o PIX e dar baixa manual.

Participantes na fila nao recebem cobranca. Quando uma vaga e liberada, o
primeiro participante elegivel da mesma funcao e promovido e recebe sua
cobranca.

## Capacidade do evento

O administrador informa dois numeros independentes:

- limite confirmado de jogadores de linha;
- limite confirmado de goleiros.

Exemplo: 18 de linha e 3 goleiros permitem 21 confirmados no total, mas nunca
19 jogadores de linha ou 4 goleiros. Novas confirmacoes acima do limite ficam
em espera.

A regra e transacional e possui protecao adicional por gatilho no banco. Isso
impede excesso mesmo quando duas pessoas respondem ao mesmo tempo ou quando
algum fluxo tenta atualizar a presenca diretamente.

O limite pode ser editado na Agenda. Se for reduzido, os confirmados mais
recentes que excederem o novo valor voltam para a fila. O sistema nao permite
reduzir abaixo da quantidade de presencas reais ja registradas.

## Ativacao no Supabase

Execute no SQL Editor:

```text
supabase/migrations/015_capacity_and_billing_delivery.sql
```

Depois aguarde a atualizacao do cache do esquema e recarregue o sistema.

## Ativacao do Asaas

Preencha na Hostinger:

```env
PUBLIC_API_URL=https://agendasport.com.br
ASAAS_API_KEY=credencial_da_api
ASAAS_API_URL=https://api.asaas.com/v3
ASAAS_WEBHOOK_TOKEN=segredo_aleatorio_com_32_ou_mais_caracteres
```

Cadastre no Asaas:

```text
https://agendasport.com.br/api/webhooks/payments/asaas
```

Use no campo de token o mesmo `ASAAS_WEBHOOK_TOKEN`.

## Ativacao do Mercado Pago

Preencha na Hostinger:

```env
PUBLIC_API_URL=https://agendasport.com.br
MERCADO_PAGO_ACCESS_TOKEN=credencial_de_producao
MERCADO_PAGO_API_URL=https://api.mercadopago.com
MERCADO_PAGO_WEBHOOK_SECRET=assinatura_secreta_do_webhook
```

Cadastre na aplicacao do Mercado Pago:

```text
https://agendasport.com.br/api/webhooks/payments/mercado-pago
```

Assine o evento de pagamentos.

## WhatsApp de cobranca

Crie na Meta um template de utilidade com cinco variaveis, nesta ordem:

1. primeiro nome;
2. descricao;
3. valor;
4. vencimento;
5. link ou PIX.

Depois informe seu nome:

```env
WHATSAPP_BILLING_TEMPLATE_NAME=cobranca_agenda_sport
```

Mensagens enviadas dentro da janela ativa podem usar texto comum. Fora dela, a
Meta exige um template aprovado.
