# Agenda Sport - melhorias apos a primeira rodada

Documento para alinhar as melhorias levantadas apos o primeiro uso real da plataforma.

## Ajustes aplicados neste pacote

### 1. Nomenclatura padrao de estatisticas

- O indicador principal passa a abrir como **Gols** por padrao.
- A opcao **Pontos** continua disponivel para outros esportes que nao usam gols.
- O relatorio e a sumula passam a respeitar a nomenclatura escolhida pelo administrador.

### 2. Resultado das equipes no fechamento

- Quando existir sorteio salvo para o evento, a tela de sumula exibe o placar de cada equipe.
- Ao finalizar o evento, o sistema calcula automaticamente:
  - vitoria;
  - empate;
  - derrota.
- Esse resultado alimenta o ranking dos participantes e permite acompanhar quem venceu mais eventos.

### 3. Sorteio pronto para WhatsApp

- A tela de sorteio agora permite copiar a lista das equipes.
- Tambem existe atalho para abrir o texto direto no WhatsApp.
- Isso evita print manual e padroniza o envio para o grupo.

## Pontos ja existentes e validados no sistema

### Cadastro publico

- O jogador pode se cadastrar pelo link da empresa.
- Nome e sobrenome sao obrigatorios.
- O WhatsApp e validado para evitar duplicidade dentro da mesma empresa.
- Quando o numero ja existe, o sistema informa que aquele WhatsApp ja possui cadastro.
- Apos cadastro concluido, a tela exibe confirmacao visual e o sistema tenta enviar mensagem de boas-vindas no WhatsApp.

### Suspensao de jogadores

- Jogadores com status diferente de ativo nao entram no envio de convocacao.
- A regra protege a lista automatica e o envio manual de convocacoes.

### Lancamento durante o evento

- Estatisticas individuais podem ser atualizadas durante o evento.
- Cada alteracao salva parcialmente e exibe confirmacao de sucesso.
- O botao de finalizar exibe confirmacao antes de marcar o evento como encerrado.

## Melhorias que exigem nova fase de implementacao

### 1. Integracao automatica com grupo de WhatsApp

Objetivo:

- Atualizar automaticamente o grupo quando alguem confirmar, recusar ou entrar na espera.
- Enviar lista de confirmados e sorteio das equipes no grupo.

Observacao tecnica:

- A API oficial do WhatsApp Cloud e voltada para conversas entre empresa e contatos individuais.
- Envio automatico para grupos comuns precisa ser validado com a Meta ou tratado como integracao separada, pois muitos bots de grupo usam mecanismos nao oficiais.

Alternativa segura para producao inicial:

- Manter copia/atalho WhatsApp para listas e sorteios.
- Automatizar mensagens individuais oficiais.
- Avaliar depois uma integracao especifica para grupos.

### 2. Horarios configuraveis de convocacao

Regra desejada:

- Minimo de 4 etapas.
- Maximo de 5 etapas.
- Cada etapa com data relativa e horario definido pelo administrador.

Exemplo:

- 2 dias antes, as 16h;
- 2 dias antes, as 18h;
- 1 dia antes, as 10h;
- dia do evento, horario definido;
- quinta etapa opcional.

Necessario:

- Criar tabela de configuracao por empresa ou por evento.
- Ajustar worker de lembretes para ler essa configuracao.
- Exibir tela de configuracao para o administrador.

### 3. Cobranca de mensalistas

Regra desejada:

- Administrador define o dia fixo de cobranca mensal.
- Mensalistas recebem cobranca automaticamente.
- Sistema mostra pagos, pendentes, atrasados e inadimplentes.

Necessario:

- Definir provedor de pagamento.
- Criar rotina mensal.
- Criar tela de baixa manual e conciliacao.
- Criar lembretes automaticos.

### 4. Cobranca de avulsos apos confirmacao

Regra desejada:

- Jogador confirmou presenca pelo WhatsApp.
- Sistema gera cobranca automaticamente.
- Jogador recebe link de pagamento no privado.

Possiveis provedores:

- Mercado Pago;
- Asaas;
- Stone;
- Vindi;
- outro provedor com API e webhooks.

Necessario:

- Escolher provedor principal.
- Configurar credenciais por empresa.
- Criar webhook de pagamento aprovado, vencido e cancelado.

### 5. Controle de receitas e despesas

Regra desejada:

- Lancar receitas.
- Lancar despesas.
- Visualizar saldo, historico, categorias e datas.

Exemplos de despesas:

- aluguel da quadra;
- bolas;
- coletes;
- arbitragem;
- materiais;
- outras despesas.

Necessario:

- Criar modelo de movimentacoes financeiras.
- Separar receitas, despesas e pagamentos.
- Criar filtros e relatorios financeiros.

## Fluxo recomendado para producao

1. Administrador cadastra ou compartilha link de cadastro.
2. Jogador se cadastra e recebe confirmacao.
3. Administrador cria o evento.
4. Administrador envia convocacao pelo WhatsApp.
5. Respostas do WhatsApp atualizam a lista: Sim, Nao ou Espera.
6. Administrador realiza o sorteio.
7. Administrador copia ou envia a lista do sorteio pelo WhatsApp.
8. No dia do evento, administrador abre a sumula.
9. Administrador lanca presenca real, gols e assistencias.
10. Administrador informa placar das equipes.
11. Administrador finaliza o evento.
12. Sistema calcula estatisticas, ranking e resultados.

## Prioridade sugerida

Alta:

- Resultado por equipe no fechamento.
- Sumula/ranking apos jogo.
- Copiar/enviar sorteio para WhatsApp.
- Padronizar nomenclatura como Gols.

Media:

- Horarios configuraveis de convocacao.
- Controle financeiro com despesas.

Alta, mas dependente de provedor:

- Cobranca automatica de mensalistas.
- Cobranca automatica de avulsos.
- Integracao real com grupo de WhatsApp.
