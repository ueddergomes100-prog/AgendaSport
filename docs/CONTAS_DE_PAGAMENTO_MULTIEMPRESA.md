# Contas de pagamento por empresa

## Regra principal

Cada empresa cadastrada na Agenda Sport possui uma unica conta recebedora.
Administradores auxiliares nao criam carteiras separadas: eles operam a mesma
conta financeira da empresa conforme suas permissoes.

- `SUPER_ADMIN`: administra clientes da Agenda Sport, mas nao recebe os valores
  dos eventos.
- `ADMINISTRADOR`: conecta e atualiza a conta Asaas da propria empresa.
- usuario com permissao `finance`: visualiza e opera cobrancas do proprio tenant.
- usuario sem permissao `finance`: nao acessa cobrancas nem dados da conta.

## Fluxo Asaas

1. A Agenda Sport configura uma conta raiz Asaas de pessoa juridica.
2. O administrador da empresa preenche os dados cadastrais em Configuracoes.
3. O backend consulta uma subconta existente pelo CPF/CNPJ.
4. Se nao existir, cria uma subconta Asaas.
5. O sistema salva somente `provider_account_id`, `walletId`, nome, e-mail e os
   quatro ultimos digitos do documento.
6. Cada nova cobranca recebe o `walletId` da empresa e split de 100% do valor
   liquido.
7. O webhook da conta raiz atualiza o pagamento local usando o ID da cobranca.

O saldo de uma empresa nao pode ser associado a outra: o banco possui unicidade
por tenant/provedor, por conta Asaas e por carteira.

## Banco de dados

Aplicar depois da migracao 015:

```text
supabase/migrations/016_tenant_payment_accounts.sql
```

A migracao cria:

- `payment_accounts`, isolada por `tenant_id`;
- politicas RLS de leitura para financeiro/configuracoes;
- escrita restrita ao administrador da empresa;
- `recipient_wallet_id` e `split_percentage` em `payments` para auditoria.

## Configuracao da Hostinger

```env
PUBLIC_API_URL=https://agendasport.com.br
ASAAS_API_KEY=chave_da_conta_raiz
ASAAS_API_URL=https://api.asaas.com/v3
ASAAS_WEBHOOK_TOKEN=segredo_com_32_ou_mais_caracteres
```

Webhook:

```text
https://agendasport.com.br/api/webhooks/payments/asaas
```

## Ativacao por cliente

1. Entrar com o administrador total da empresa.
2. Abrir `Configuracoes`.
3. Em `Conta de recebimento da empresa`, clicar `Conectar Asaas`.
4. Informar titular, documento, telefone, renda/faturamento e endereco.
5. Concluir eventual ativacao ou verificacao recebida por e-mail do Asaas.
6. Atualizar o status da conta.
7. Selecionar `Asaas` como provedor padrao.
8. Habilitar cobranca automatica de avulsos, se desejado.

## Seguranca

- Documento completo e endereco nao sao persistidos na Agenda Sport.
- A chave de API retornada pela subconta nao e salva nem exibida.
- O frontend recebe somente o final do documento e o final do `walletId`.
- A API recusa Mercado Pago compartilhado enquanto nao existir OAuth por tenant.
- A cobranca local registra a carteira recebedora e o percentual utilizado.

## Checklist de teste

1. Empresa A conecta a carteira A.
2. Empresa B conecta a carteira B.
3. Criar uma cobranca de valor baixo para cada empresa.
4. Confirmar no Asaas que cada cobranca possui o split da carteira correta.
5. Pagar em ambiente de teste e validar o webhook.
6. Confirmar que o Financeiro da empresa A nao lista dados da empresa B.
7. Confirmar que um operador sem permissao financeira recebe acesso negado.
