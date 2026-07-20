# Pagamentos e limites por funcao

## Fluxo de cobranca

1. O administrador total conecta a conta Asaas da propria empresa.
2. O sistema grava o `walletId` da empresa e habilita o Asaas somente para
   aquele tenant.
3. O participante avulso responde SIM pelo WhatsApp ou e confirmado pelo admin.
4. O banco reserva uma vaga da funcao do participante.
5. Se houver vaga, o sistema cria somente uma cobranca para aquele participante
   e evento.
6. A cobranca inclui o split para a carteira da empresa e o link/PIX e enviado
   no WhatsApp individual.
7. O webhook do gateway marca a cobranca como paga, atrasada ou cancelada.
8. O financeiro permite reenviar a cobranca, copiar o PIX e dar baixa manual.

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
supabase/migrations/016_tenant_payment_accounts.sql
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

A conta raiz do Asaas deve ser de pessoa juridica para criar subcontas. Depois
da ativacao do servidor, cada empresa abre `Configuracoes > Regras financeiras`
e conecta a propria conta recebedora. O sistema procura uma subconta existente
pelo CPF/CNPJ antes de criar outra.

As cobrancas sao emitidas pela conta raiz e levam um split de 100% do valor
liquido para o `walletId` da empresa. A tarifa do Asaas e descontada antes do
split. A Agenda Sport nao armazena a chave privada retornada na criacao da
subconta porque as operacoes desse fluxo usam a conta raiz e o identificador da
carteira.

## Mercado Pago

O Mercado Pago permanece desabilitado no modo multiempresa ate a implantacao
do OAuth individual por empresa. Uma unica credencial global nao deve ser usada
para receber valores de clientes diferentes.

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
