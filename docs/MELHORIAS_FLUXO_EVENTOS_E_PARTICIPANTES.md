# Agenda Sport - Melhorias de fluxo de eventos e participantes

Documento de analise e especificacao das melhorias solicitadas em 13/07/2026.

## Objetivo

Preparar o Agenda Sport para um fluxo mais seguro e profissional de operacao em producao, reduzindo erros de convocacao, evitando duplicidade de participantes, corrigindo recorrencia de eventos e melhorando o controle manual do organizador.

## Escopo resumido

As melhorias se concentram em:

- respostas de convocacao;
- status e bloqueio de participantes;
- carregamento das telas;
- limites separados por tipo de participante;
- recorrencia automatica de eventos;
- cadastro publico via link;
- simplificacao de campos obrigatorios;
- padronizacao de posicoes.

## Prioridade sugerida

| Prioridade | Item | Motivo |
| --- | --- | --- |
| P0 | Corrigir loop de carregamento / tela branca | Pode impedir uso do sistema em producao. |
| P0 | Corrigir agendamento recorrente | Pode criar eventos errados e confundir clientes. |
| P0 | Validar telefone e evitar duplicidade no cadastro por link | Evita base suja logo no inicio da operacao. |
| P1 | Confirmacao manual da resposta do jogador | Necessario para excecoes do dia a dia. |
| P1 | Jogador suspenso sem convocacao | Controle operacional importante para pendencias. |
| P1 | Separar limite de linha e goleiro | Regra central para eventos esportivos com vagas por funcao. |
| P1 | WhatsApp de cadastro concluido | Melhora experiencia do participante. |
| P2 | Sobrenome obrigatorio | Melhora identificacao e qualidade da base. |
| P2 | Posicoes somente Goleiro e Linha | Simplifica produto e remove inconsistencias. |

---

## 1. Confirmar manualmente a resposta do jogador

### Problema

Hoje a resposta do participante vem principalmente pelo WhatsApp. Porem, na operacao real, o admin pode receber resposta por outros meios: conversa direta, ligacao, grupo, pessoalmente ou erro temporario no webhook.

### Solucao proposta

Adicionar acao manual na area de resposta da convocacao para o admin alterar o status do participante.

### Status permitidos

- `Confirmado`
- `Nao vai`
- `Espera`
- `Convidado / aguardando resposta`

### Regras de negocio

- A alteracao manual deve registrar data/hora.
- Deve identificar que a origem foi manual.
- Se o jogador for marcado como `Nao vai`, deve liberar a vaga.
- Se for marcado como `Espera`, deve entrar na fila de espera.
- Se for marcado como `Confirmado`, deve ocupar vaga, respeitando limite do evento.
- Se o evento estiver finalizado, a resposta de convocacao nao deve ser alterada; nesse caso, usar presenca/estatisticas.

### Campos recomendados

Adicionar ou usar metadados em `attendance`:

- `response_source`: `WHATSAPP`, `MANUAL`, `SYSTEM`
- `responded_by`: id do usuario admin que alterou
- `responded_at`: data/hora da alteracao

### Interface

Na lista de respostas do evento:

- botao `Confirmar`;
- botao `Nao vai`;
- botao `Espera`;
- opcao discreta `Voltar para aguardando`.

### Criterios de aceite

- Admin consegue mudar resposta de um participante sem depender do WhatsApp.
- A tela atualiza os contadores imediatamente.
- A alteracao fica persistida no banco.
- A lista de confirmados e espera reflete a alteracao.

---

## 2. Jogador suspenso

### Problema

Alguns participantes podem estar com pendencia financeira, comportamento inadequado, falta recorrente ou qualquer bloqueio definido pelo organizador. Enquanto estiverem suspensos, nao devem receber convocacao.

### Solucao proposta

Adicionar status `SUSPENSO` ao participante.

### Regras de negocio

- Participante suspenso nao deve receber convocacao pelo WhatsApp.
- Participante suspenso nao deve ser incluido automaticamente ao sincronizar lista do evento.
- Participante suspenso deve continuar visivel para o admin.
- O admin deve poder informar motivo e, opcionalmente, data prevista de regularizacao.
- Ao regularizar, admin muda o status para `ATIVO`.

### Status sugeridos

Hoje o banco usa `ATIVO` e `INATIVO`. Evoluir para:

- `ATIVO`
- `INATIVO`
- `SUSPENSO`

### Campos recomendados

Na tabela `players`:

- `status`: incluir `SUSPENSO`;
- `suspension_reason`: texto opcional;
- `suspended_until`: data opcional;
- `suspended_at`: data/hora opcional.

### Interface

Na tela de participantes:

- filtro por status;
- selo visual `Suspenso`;
- botao `Suspender`;
- botao `Regularizar`;
- campo de motivo no modal.

### Criterios de aceite

- Participante suspenso nao recebe convocacao.
- Participante suspenso nao aparece como elegivel para evento.
- Ao voltar para ativo, pode ser convocado normalmente.

---

## 3. Conferir loop de carregamento e tela branca

### Problema

Algumas telas podem entrar em carregamento infinito ou tela branca. Isso costuma acontecer quando:

- erro de API nao e tratado;
- usuario esta sem tenant/empresa;
- query depende de dados ainda nao carregados;
- componente tenta acessar campo nulo;
- erro JS quebra a renderizacao da pagina.

### Solucao proposta

Revisar todas as telas principais e padronizar estados de carregamento, erro e vazio.

### Telas prioritarias

- Login / criacao de conta;
- Dashboard;
- Participantes;
- Agenda/Eventos;
- Sorteio/Times;
- Estatisticas;
- Admin/Super Admin;
- Cadastro publico por link.

### Regras de UX

Toda tela deve ter:

- estado de carregamento claro;
- estado de erro com mensagem util;
- botao de tentar novamente quando fizer sentido;
- estado vazio quando nao houver dados;
- fallback quando usuario estiver sem empresa/tenant.

### Regras tecnicas

- Usar error boundaries no app.
- Evitar acesso direto a propriedades opcionais sem validacao.
- Em queries, usar `enabled` somente quando os dados necessarios existirem.
- Padronizar mensagens vindas da API.

### Criterios de aceite

- Nenhuma tela deve ficar branca sem mensagem.
- Se a API falhar, o usuario ve uma mensagem clara.
- Se a sessao expirar, o usuario e orientado a entrar novamente.

---

## 4. Dividir limite entre jogadores de linha e goleiros

### Problema

Hoje o evento trabalha com limite geral de participantes. Em muitos esportes, principalmente futebol/futsal/society, e necessario controlar vagas separadas para goleiros e jogadores de linha.

### Solucao proposta

Adicionar limite separado no cadastro/configuracao do evento:

- maximo de jogadores de linha;
- maximo de goleiros.

### Regras de negocio

- O limite total pode ser calculado pela soma dos dois limites.
- Se o limite de linha estiver cheio, novo jogador de linha entra em espera.
- Se o limite de goleiro estiver cheio, novo goleiro entra em espera.
- O sistema deve mostrar contadores separados:
  - linha confirmados / limite;
  - goleiros confirmados / limite;
  - espera por tipo.

### Campos recomendados

Em `pickups` e/ou `matches`:

- `max_line_players`;
- `max_goalkeepers`.

Manter `max_players` temporariamente para compatibilidade, mas a nova regra deve usar os campos separados.

### Interface

Na criacao do evento:

- campo `Maximo jogadores de linha`;
- campo `Maximo goleiros`;
- texto auxiliar: `Total do evento: X participantes`.

Na tela do evento:

- card `Linha`;
- card `Goleiros`;
- card `Espera`.

### Criterios de aceite

- Evento respeita limites separados.
- Confirmacao via WhatsApp respeita a vaga correspondente.
- Admin consegue ver claramente onde ainda ha vaga.

---

## 5. Corrigir agendamento recorrente

### Problema

Ao marcar a opcao de agendar por 1 mes automaticamente, o sistema esta criando evento 1 mes a frente, em vez de criar o proximo evento da recorrencia. Alem disso, criar todas as semanas de uma vez pode poluir a agenda.

### Solucao proposta

Alterar o modelo de recorrencia para fluxo progressivo:

1. Criar somente o primeiro evento.
2. Ao finalizar esse evento, o sistema pergunta se deve agendar o proximo.
3. Se confirmado, cria apenas o proximo evento na data correta.
4. O fluxo se repete ate atingir o limite configurado.

### Nova regra de recorrencia

Ao criar um evento recorrente:

- o admin escolhe o dia da semana;
- escolhe horario;
- escolhe duracao da recorrencia: 1 mes, 2 meses, 3 meses ou personalizado;
- o sistema cria apenas o primeiro evento;
- salva uma configuracao de recorrencia vinculada ao evento/local.

### Exemplo

Configuracao:

- evento toda terca-feira;
- inicio em 16/07;
- duracao: 1 mes;
- horario: 20h.

Comportamento esperado:

- cria evento de 16/07;
- ao finalizar 16/07, sistema cria 23/07;
- ao finalizar 23/07, cria 30/07;
- continua ate o fim da janela de 1 mes.

### Campos recomendados

Criar tabela `event_recurrences` ou campos em `pickups`:

- `id`;
- `tenant_id`;
- `pickup_id`;
- `weekday`;
- `start_time`;
- `duration_months`;
- `start_date`;
- `end_date`;
- `last_created_match_id`;
- `active`;
- `created_at`.

### Regras de data

- Proximo evento deve ser o proximo dia da semana definido apos a data do evento encerrado.
- Nao criar evento no mesmo dia ja encerrado.
- Nao criar evento depois de `end_date`.
- Se ja existir evento na mesma data/horario/local, nao duplicar.

### Interface

Na criacao:

- checkbox `Deixar recorrente`;
- seletor `Por quanto tempo?` com 1, 2, 3 meses;
- aviso: `O sistema criara somente o proximo evento apos a finalizacao do atual.`

Na finalizacao:

- modal: `Evento finalizado. Deseja agendar o proximo automaticamente?`
- mostrar a data calculada antes de confirmar.

### Criterios de aceite

- Agendar por 1 mes nao cria evento 1 mes no futuro.
- O sistema cria apenas o proximo evento.
- Ao finalizar, calcula a proxima data correta.
- Nao cria eventos duplicados.

---

## 6. Mensagem no WhatsApp apos cadastro pelo link

### Problema

Quando o participante se cadastra pelo link publico, ele precisa receber confirmacao clara de que o cadastro foi concluido. Alem disso, o telefone deve ser validado para evitar duplicidade.

### Solucao proposta

Ao finalizar cadastro pelo link:

- validar telefone;
- verificar se ja existe participante com mesmo WhatsApp na empresa;
- se nao existir, criar cadastro;
- enviar mensagem de boas-vindas pelo WhatsApp;
- mostrar tela de sucesso no navegador.

### Mensagem sugerida

```text
Agenda Sport

Cadastro concluido com sucesso!
Ola, {nome}. Voce entrou na lista da {empresa}.

Quando houver um evento, voce recebera a convocacao por este WhatsApp.
```

### Regras de validacao

- Normalizar telefone antes de comparar.
- Considerar telefone com e sem `55`.
- Considerar celular com e sem nono digito quando aplicavel.
- Bloquear duplicidade por empresa.
- Se o telefone ja existir, mostrar mensagem amigavel:
  - `Este WhatsApp ja esta cadastrado nesta empresa. Se precisar alterar seus dados, fale com o organizador.`

### Campos do formulario publico

- Nome;
- Sobrenome obrigatorio;
- WhatsApp;
- posicao: Goleiro ou Linha;
- nota/nivel quando o cliente usar sorteio.

### Criterios de aceite

- Participante recebe WhatsApp de cadastro concluido.
- Cadastro duplicado pelo mesmo numero nao e criado.
- Tela publica mostra sucesso claro.
- Admin ve o novo participante na empresa correta.

---

## 7. Solicitar sobrenome obrigatorio

### Problema

Somente nome pode gerar participantes duplicados ou confusao na lista, principalmente em grupos grandes.

### Solucao proposta

Adicionar campo `Sobrenome` obrigatorio nos cadastros:

- cadastro manual;
- cadastro publico via link;
- criacao de usuario admin, se aplicavel.

### Regras

- Nome minimo: 2 caracteres.
- Sobrenome minimo: 2 caracteres.
- Nome exibido pode ser `Nome Sobrenome`.
- Para compatibilidade, o banco pode continuar usando `name`, mas a interface deve coletar separadamente.

### Campos recomendados

Opcoes:

1. Simples: salvar em `players.name` como `nome + sobrenome`.
2. Melhor: adicionar `first_name` e `last_name`, mantendo `name` como campo derivado/compatibilidade.

### Criterios de aceite

- Nao e possivel cadastrar participante sem sobrenome.
- Mensagem de erro e clara.
- Listas e convites continuam exibindo nome corretamente.

---

## 8. Posicoes somente Goleiro e Linha

### Problema

O sistema ainda possui posicoes antigas no banco e tipos TypeScript:

- Zagueiro;
- Lateral;
- Volante;
- Meio Campo;
- Atacante.

Na analise inicial havia ponto usando `Meio Campo` como opcao. Isso foi corrigido na interface para novos cadastros usarem apenas `Goleiro` e `Linha`.

### Solucao proposta

Padronizar o produto para duas posicoes:

- `Goleiro`;
- `Linha`.

### Ajustes necessarios

- Atualizar tipos TypeScript.
- Atualizar formularios de participante.
- Atualizar cadastro publico.
- Atualizar sorteio de times.
- Atualizar relatorios e filtros.
- Migrar jogadores existentes com posicoes antigas para `Linha`.
- Ajustar enum do banco com cuidado, pois remover valores de enum no PostgreSQL exige migracao planejada.

### Estrategia tecnica recomendada

Fase 1:

- Interface passa a exibir apenas `Goleiro` e `Linha`.
- Qualquer posicao antiga lida do banco aparece como `Linha`.
- Novos cadastros so salvam `Goleiro` ou `Linha`.

Fase 2:

- Rodar migracao para atualizar dados antigos:
  - Zagueiro -> Linha;
  - Lateral -> Linha;
  - Volante -> Linha;
  - Meio Campo -> Linha;
  - Atacante -> Linha.

Fase 3:

- Opcionalmente recriar enum do banco apenas com `Goleiro` e `Linha`.

### Criterios de aceite

- Nenhuma tela permite escolher posicao alem de Goleiro ou Linha.
- Cadastro publico salva corretamente.
- Sorteio continua funcionando.
- Relatorios nao quebram com dados antigos.

---

## Sequencia de implementacao recomendada

### Sprint 1 - Estabilidade e regras criticas

1. Corrigir tela branca/loops de carregamento.
2. Corrigir recorrencia progressiva.
3. Validar telefone e bloquear duplicidade no cadastro publico.
4. Padronizar posicoes na interface para Goleiro/Linha.

### Sprint 2 - Operacao do admin

1. Confirmacao manual de resposta.
2. Jogador suspenso.
3. Limites separados por linha/goleiro.
4. Mensagem WhatsApp de cadastro concluido.

### Sprint 3 - Refinamento e dados

1. Sobrenome obrigatorio.
2. Migracao de dados antigos de posicao.
3. Melhorias visuais em contadores e filtros.
4. Logs/auditoria das alteracoes manuais.

---

## Checklist geral de aceite

- O admin consegue cadastrar participante sem duplicidade de telefone.
- O participante recebe mensagem de cadastro concluido.
- O participante suspenso nao recebe convocacao.
- O admin consegue confirmar manualmente uma resposta.
- O evento respeita limite separado de linha e goleiro.
- O agendamento recorrente cria apenas o proximo evento apos finalizacao.
- Nenhuma tela fica branca sem mensagem de erro.
- Novos cadastros usam somente Goleiro ou Linha.
- Sobrenome e obrigatorio nos novos cadastros.

---

## Observacoes tecnicas iniciais encontradas no codigo

- `player_status` no schema inicial possui apenas `ATIVO` e `INATIVO`; sera necessario incluir `SUSPENSO`.
- `player_position` ainda possui valores antigos no banco.
- `src/lib/types.ts` ainda lista posicoes antigas.
- `src/pages/PlayersPage.tsx` foi ajustado para exibir apenas `Goleiro` e `Linha`.
- Cadastro publico ja converte valores para `Goleiro` ou `Linha`, mas precisa validar duplicidade por telefone.
- A recorrencia aparece em `SchedulePage` e `MatchStatsEntryPage`; os dois fluxos precisam seguir a mesma regra.
