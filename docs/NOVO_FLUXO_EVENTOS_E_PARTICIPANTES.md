# Agenda Sport - Novo fluxo de eventos e participantes

Documento atualizado apos implementacao do pacote de melhorias de participantes, convocacao, recorrencia e estabilidade.

## 1. Cadastro de participantes

### Cadastro manual pelo admin

O cadastro manual agora segue este fluxo:

1. Admin acessa `Participantes`.
2. Clica em `Novo participante`.
3. Preenche:
   - nome;
   - sobrenome;
   - WhatsApp;
   - nota tecnica;
   - posicao: `Linha` ou `Goleiro`;
   - mensalista ou avulso;
   - status;
   - observacoes.
4. O sistema valida o WhatsApp dentro da empresa.
5. Se o mesmo numero ja existir, o cadastro e bloqueado.

### Campos obrigatorios

- Nome.
- Sobrenome.
- WhatsApp.
- Nota.
- Posicao.

### Posicoes

O sistema passa a trabalhar somente com:

- `Linha`;
- `Goleiro`.

Posicoes antigas lidas do banco devem ser tratadas visualmente como `Linha`.

## 2. Participante suspenso

O admin pode alterar o status do participante para:

- `ATIVO`;
- `INATIVO`;
- `SUSPENSO`.

Quando o participante esta `SUSPENSO`:

- nao entra nas novas convocacoes automaticas;
- nao recebe WhatsApp de convocacao;
- continua visivel na tela de participantes;
- pode ter motivo e data prevista de regularizacao.

Ao regularizar, o admin muda o status de volta para `ATIVO`.

## 3. Cadastro pelo link publico

O link publico agora solicita:

- nome;
- sobrenome;
- WhatsApp;
- funcao: `Linha` ou `Goleiro`.

### Validacao por telefone

Antes de criar o participante, o sistema normaliza o WhatsApp e verifica duplicidade dentro da empresa.

Exemplos tratados como o mesmo numero:

- `33984056924`;
- `5533984056924`;
- variações com pontuacao, espaco ou parenteses.

Se o numero ja existir, o sistema mostra:

`Este WhatsApp ja esta cadastrado nesta empresa. Se precisar alterar seus dados, fale com o organizador.`

### Mensagem de cadastro concluido

Apos cadastrar, o backend tenta enviar uma mensagem de confirmacao pelo WhatsApp:

```text
Agenda Sport

Cadastro concluido com sucesso!
Ola, {nome}. Voce entrou na lista da {empresa}.

Quando houver um evento, voce recebera a convocacao por este WhatsApp.
```

Observacao: pela API oficial da Meta, mensagens livres podem depender da janela de atendimento ou de template aprovado. Se a Meta recusar o envio, o cadastro continua concluido e o status do WhatsApp fica registrado.

## 4. Eventos fixos e limites por funcao

Eventos fixos agora possuem capacidade separada:

- maximo de jogadores de linha;
- maximo de goleiros.

O total do evento e a soma dos dois campos.

Exemplo:

- Linha: 18;
- Goleiros: 2;
- Total: 20 participantes.

## 5. Criacao de evento na Agenda

Ao criar um evento na Agenda, o admin define:

- evento fixo, quando existir;
- data e horario;
- recorrencia semanal;
- vagas de linha;
- vagas de goleiro;
- observacoes.

### Recorrencia

O comportamento mudou.

Antes:

- ao selecionar 1 mes, o sistema podia criar varias semanas ou data errada no futuro.

Agora:

1. O sistema cria somente o evento atual.
2. Se houver recorrencia, grava ate quando ela deve valer.
3. Ao finalizar o evento, pergunta se deve criar a proxima data.
4. Se confirmado, cria apenas a proxima semana.
5. O fluxo continua ate chegar ao fim da recorrencia.

## 6. Finalizacao e proximo evento

Ao finalizar um evento recorrente:

1. O sistema salva presenca e estatisticas.
2. Calcula a proxima data correta pelo dia da semana e horario.
3. Mostra uma confirmacao com a data calculada.
4. Se o admin confirmar, cria o proximo evento.
5. Se ja existir evento na mesma data/horario/local, nao duplica.

Exemplo:

- Evento: toda terca-feira as 20h.
- Primeiro evento: 16/07.
- Recorrencia: 1 mes.
- Ao finalizar 16/07, cria 23/07.
- Ao finalizar 23/07, cria 30/07.
- Continua ate o limite configurado.

## 7. Convocacao pelo WhatsApp

O admin clica em `Enviar WhatsApp`.

O sistema:

1. Abre o evento se estiver agendado.
2. Cria convites para participantes ativos.
3. Ignora participantes suspensos.
4. Envia WhatsApp apenas para quem esta aguardando resposta.
5. Mostra resumo de enviados, sem WhatsApp e falhas.

## 8. Resposta manual da convocacao

Na tela do evento, cada participante agora tem acoes manuais:

- `Sim`;
- `Nao`;
- `Espera`;
- `Aguardando`.

### Quando usar

Use quando o jogador respondeu fora do botao do WhatsApp, por exemplo:

- respondeu no grupo;
- ligou para o admin;
- falou pessoalmente;
- houve instabilidade no webhook;
- o admin precisa corrigir uma resposta.

### Regras

- `Sim` tenta confirmar vaga respeitando limite por posicao.
- Se a capacidade da posicao estiver cheia, o jogador entra em espera.
- `Nao` libera vaga e pode promover alguem da espera.
- `Espera` coloca o jogador na fila.
- `Aguardando` volta para status de convidado.
- Eventos encerrados ou cancelados nao permitem alterar resposta de convocacao.

## 9. Limite de Linha e Goleiro na confirmacao

Ao confirmar presenca, o sistema considera a posicao do participante.

Se o participante for `Goleiro`:

- usa o limite de goleiros.

Se o participante for `Linha`:

- usa o limite de linha.

Quando o limite da posicao estiver cheio, a resposta `Sim` vira `Espera`.

## 10. Lancamento de presenca e estatisticas

O lancamento continua liberado somente no dia do evento.

O admin pode:

- marcar quem compareceu;
- marcar falta;
- lancar pontos/gols;
- lancar assistencias;
- finalizar o evento.

Apos finalizar, o evento passa para `ENCERRADA` e alimenta historico/relatorios.

## 11. Estabilidade das telas

Foi adicionado um Error Boundary global.

Se alguma tela quebrar por erro inesperado, o sistema nao deve ficar branco. Em vez disso, mostra uma tela com:

- mensagem de erro;
- orientacao para recarregar;
- botao `Recarregar`.

Tambem foram adicionados estados de erro nas protecoes de perfil/tenant.

## 12. Migracao necessaria no Supabase

Antes de usar esse fluxo em producao, aplicar a migracao:

`supabase/migrations/009_operational_flow_improvements.sql`

Ela adiciona:

- status `SUSPENSO`;
- campos de nome/sobrenome;
- campos de suspensao;
- normalizacao de WhatsApp;
- resposta manual em `attendance`;
- limites de linha/goleiro em eventos;
- campos de recorrencia;
- funcao atualizada de confirmacao respeitando capacidade por posicao;
- funcao atualizada de cadastro publico.

## 13. Checklist de teste recomendado

1. Criar empresa/admin novo.
2. Cadastrar participante manual com nome e sobrenome.
3. Tentar cadastrar outro com mesmo WhatsApp e confirmar bloqueio.
4. Suspender participante e tentar convocar.
5. Confirmar que suspenso nao recebe convocacao.
6. Criar evento com limite de linha e goleiro.
7. Enviar convocacao.
8. Confirmar manualmente `Sim`, `Nao`, `Espera` e `Aguardando`.
9. Confirmar que limite por posicao manda excedente para espera.
10. Cadastrar participante pelo link publico.
11. Verificar mensagem de sucesso na tela.
12. Verificar tentativa de WhatsApp de cadastro concluido.
13. Criar evento recorrente por 1 mes.
14. Confirmar que apenas um evento foi criado.
15. Finalizar evento e criar a proxima data.
16. Confirmar que nao houve duplicidade.
