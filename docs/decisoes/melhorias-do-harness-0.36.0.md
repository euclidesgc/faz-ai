> Registro de decisão da versão 0.36.0 ([PR #216](https://github.com/euclidesgc/faz-ai/pull/216)): as melhorias que a análise do vídeo trouxe para o board, com a decisão e as observações da pessoa em cada item.

# Melhorias do board a partir de "Harness engineering não basta"

**Fontes:** o [vídeo do Pasquadev](https://youtu.be/NY5Y2v-Z1tA) e a palestra que ele comenta,
[*Why Software Factories Fail*](https://www.youtube.com/watch?v=Ib5GBkD555M), do Dex Horthy
(HumanLayer), no AI Engineer.

**A tese:** o modelo é treinado para fazer o teste passar, não para manter o código sustentável.
Nenhum harness remove esse teto, então a revisão humana continua. Para ela caber no dia, é preciso
alinhar antes (PRD, documento técnico, desenho do programa, plano em fatias) e entregar PRs pequenos.

**Como usar este documento:** cada item tem um código (P = parar de fazer, C = começar a fazer), o
motivo, o que encontrei no código e uma proposta. Escreva embaixo de **Observações** e marque a decisão.

**Alcance:**

- **Produto:** muda o que o Faz AI entrega a todo board (modelos de fase, skill do fluxo, YOLO,
  métricas).
- **Projeto:** muda só o nosso repositório.

---

## Parar de fazer

### P1. O YOLO aprovar sozinho a Spec e o Plan

- **Por quê:** o alinhamento antes do código é a parte barata e é o que torna a revisão do PR rápida
  ("30 min de alinhamento poupam horas de revisão"). O YOLO corta essa parte, deixa só a revisão do
  PR, que é a mais cara, e ainda empilha vários PRs para revisar.
- **Onde está:** em modo autônomo, o pedido de revisão sem `pending` vira aprovação na hora
  ([cards.ts:19](src/extension/panel/handlers/cards.ts:19)). O README diz o mesmo em
  [README.md:678](README.md:678).
- **Proposta** (escolher uma):
  - a) No YOLO, o Plan (ou a Spec) continua exigindo aprovação. A IA corre até ali, para, e depois
    da aprovação segue sozinha até o PR.
  - b) O YOLO fica só para histórias de esforço Baixo ou de periferia (ver C6).
  - c) Uma opção por história, "parar no Plan", ligada por padrão.
- **Alcance:** Produto.

**Decisão:** [ ] fazer  [ ] não fazer  [x] ajustar

**Observações:**
Vamos fazer o modo autônomo como sempre, mas ao ligar o modo autônomo o usuário deve decidir até onde o modo autônomo vai rodar, deixando o processo mais flexível.
Preciso de uma interface simples definir isso. Quero que vc me de sugestões de como será essa interface.
>

### P2. Recortar sub-tarefas por arquivo ou por camada

- **Por quê:** o Dex diz que os modelos tendem a planos horizontais (primeiro o banco, depois a API,
  depois a tela), que só podem ser verificados no fim. Na fatia vertical, cada passo entrega um
  pedaço que funciona de ponta a ponta e pode ser testado sozinho.
- **Onde está:**
  - a skill do fluxo pede que cada passo mexa em arquivos diferentes, para rodarem em paralelo
    ([flowSkill.ts:72](src/extension/flowSkill.ts:72));
  - os agentes são por camada (frontend-web, backend-node), e o condutor escolhe um por sub-tarefa.
- **Proposta:** inverter a prioridade na instrução do Plan e na skill: primeiro a fatia vertical
  verificável; paralelismo só entre fatias independentes. Uma fatia que precisa de mais de um
  especialista tem as partes delegadas em sequência pelo condutor.
- **Alcance:** Produto.

**Decisão:** [ ] fazer  [ ] não fazer  [x] ajustar

**Observações:**
A quewstão do paralelismo tem relação com a velocidade da implementação. Geralmente abrimos exatamente um PR por feature, refatoração ou resoluçao de bug.
A questão vários PRs empilhados está relacoinado a entrega tardia das features prontas, não com o plano em si. Cada PR foi uma história que passou por todas as etapas do board.
Em uma feature que é dividida em camadas, com a que acessa os dados, aplica regras de negócio, constrói a tela na camada de apresentação etc, os PRs podem não ser testáveis, mas podem ser verificáveis e fáceis de revisar. Acho que vc pode considerar isso.
Analise novamente se ainda é preciso inverter a prioridade na intrução do plan?
>

### P3. Juntar PRs empilhados num PR grande na main

- **Por quê:** o ganho do PR pequeno é a revisão. Quando o merge final é um bloco, o histórico do git
  e um eventual revert ficam do tamanho do bloco.
- **Onde está:** o #213 juntou #202–#211 num commit de +3149/−1211 em 60 arquivos.
- **Proposta:** fazer o merge de cada PR da pilha na ordem, sem consolidar. Se a consolidação teve um
  motivo (o release, por exemplo), vale anotar aqui.
- **Alcance:** Projeto.

**Decisão:** [ ] fazer  [x] não fazer  [ ] ajustar

**Observações:**
Não vamos fazer devido ao que foi discutido no ite anterior.

>

### P4. Tratar o "Como testar" como a revisão

- **Por quê:** o roteiro valida o comportamento, o que a pessoa vê. O vídeo fala de ler o código: um
  comportamento certo com desenho ruim passa no roteiro e cobra a conta meses depois.
- **Onde está:** a instrução da Homologação pede o roteiro "Como testar" e o resumo, e nada sobre
  como ler o diff ([phaseDefaults.ts:152](src/shared/phaseDefaults.ts:152)).
- **Proposta:** manter o roteiro e acrescentar o guia de leitura (C4).
- **Alcance:** Produto.

**Decisão:** [ ] fazer  [ ] não fazer  [x] ajustar

**Observações:**
Acho que o PR deve descrever bem qual é o objetivo devl e como o desenvolvedor pode analisar o código.
Deve mencionar porque algumas descisões foram tomadas e quais foram descartadas.
Por exemplo, se existe alguma forma semelhante de obter uma informação mas que faria com que a implementação ficasse mais complexa e por isso ela foi descartada, iso deve ser mencionado na descriçÃo do PR. Vale mencionar que as descrições atuais estão muito boas, entÃo pode melhorar, mas nÃo descarte tudo.

>

### P5. Acrescentar mais regras de autonomia na skill do fluxo

- **Por quê:** "o harness tem um teto". Cada caso de borda do YOLO vira mais texto na skill, com
  ganho cada vez menor.
- **Onde está:**
  - o modo autônomo é a segunda maior seção da skill: 27 linhas, algumas com um parágrafo inteiro
    ([flowSkill.ts](src/extension/flowSkill.ts));
  - pelo título, 15 dos últimos 150 commits mexem no modo autônomo.
- **Proposta:** congelar novas regras de autonomia até decidir o P1 e levar o esforço para os itens C.
- **Alcance:** Produto.

**Decisão:** [ ] fazer  [ ] não fazer  [x] ajustar

**Observações:**
Durante o modo autônomo a i.a. deve procurar seguir sempre os padrões do projeto, as decisões menos complexas, os caminhos mais adequados que sigam o padrão utilizado pelo projeto ou as regras definidas pela arquitetura. 
>

---

## Começar a fazer

Em ordem de impacto pelo custo.

### C1. CI mínimo no GitHub

- **Por quê:** na fábrica de software da palestra, o PR passa por checagens automáticas antes de
  chegar à pessoa. Hoje dependemos de o agente lembrar de rodá-las.
- **Onde está:**
  - o `.github/` só tem os modelos de issue e não há `.github/workflows`;
  - os scripts já existem: `npm run typecheck` e `npm test`, que roda build, lint, format:check e
    vitest ([package.json:352](package.json:352)).
- **Proposta:**
  - um `ci.yml` em `pull_request` e em push na main com `npm ci`, `npm run typecheck` e `npm test`;
  - depois, torná-lo obrigatório na proteção da main. O merge automático do board já bloqueia o card
    quando um check obrigatório falha.
- **Alcance:** Projeto.

**Decisão:** [ ] fazer  [x] não fazer  [ ] ajustar

**Observações:**
Não vamos fazer um CI mínimo. Mas precisamos adicionar as checagens, e revisão de código e tudo mais logo após a conclusão da implementações do plano, antes de abrir o PR. Nesse momento, se problemas forem encontrados, devem ser resolvidos. Questões ambiguas devem ser tratadas com o desenvolvedor, questões menos ambiguas que já tem diretrizes sobre como devem ser resolvidas, devem apenas reportadas e resolvidas diretamente sem demora.
>

### C2. Seção "Desenho do programa" na Spec

- **Por quê:** o Dex diz que esta é a etapa mais negligenciada: as pessoas acham que, com a
  arquitetura certa, o modelo resolve o resto. Revisar tipos e assinaturas antes custa muito menos do
  que revisar o código depois.
- **Onde está:** o modelo da Spec vai de "Arquitetura e componentes afetados" direto a "Interfaces
  (APIs, mensagens, telas)" ([phaseDefaults.ts:97](src/shared/phaseDefaults.ts:97)).
- **Proposta:** uma seção nova no modelo, entre Arquitetura e Interfaces:

  ```markdown
  ## Desenho do programa
  Tipos e assinaturas novos ou alterados, o arquivo em que cada um fica
  e o fluxo de chamadas do caminho principal (quem chama quem).
  ```

  E na instrução da Spec: "Use o grafo de chamadas do projeto, quando houver, para mostrar o fluxo."
- **Questão:** os boards existentes recebem o modelo novo? Hoje o upgrade troca as instruções que
  ainda estão no padrão antigo ([boardTemplate.ts](src/extension/db/boardTemplate.ts)).
- **Alcance:** Produto.

**Decisão:** [x] fazer  [ ] não fazer  [ ] ajustar

**Observações:**
Diagramas em Mermaid, explicando todo o fluxo da feature de forma clara para quem esta lendo o documento será ótimo!
>

### C3. Plan em fatias verticais, com limite de tamanho

- **Por quê:** no vídeo, os PRs têm até 300–400 linhas; acima disso vira o "PR Megazord". O tamanho
  se decide no Plan, não na Homologação.
- **Onde está:**
  - um PR por história, e as sub-tarefas viram commits na mesma branch;
  - nos últimos 40 merges na main: mediana de 116 linhas de código (sem testes e docs), 75% até 283
    e 5 acima de 400;
  - nada no fluxo estima ou avisa o tamanho.
- **Proposta:**
  - a instrução do Plan ordena os passos em fatias verticais, cada uma verificável de ponta a ponta,
    e estima as linhas de código da história;
  - acima de ~400 linhas, a IA propõe dividir em histórias empilhadas, aproveitando a pilha de PRs
    que o YOLO já monta, em vez de um PR só;
  - uma coluna "Linhas estimadas" na tabela do PLAN.md;
  - opcional: o limite configurável em Configurações → Regras.
- **Alcance:** Produto.

**Decisão:** [ ] fazer  [ ] não fazer  [x] ajustar

**Observações:**
Todo plano é referente a uma única feature. Ao plenajar e entrega vc pode separar os PRs em partes menores, fáceis de revisar, com uma descrição clara do que o PR entrega. Se a feture for muito longa, podemos sim criar outras histórias derivadas para concluir a feature e fazer a entrega em Prs empilhados. 
Então ao planejar uma feature nova, vc pode fazer as entregas pequenas se separar o código por partes inteligíveis, fáceis de entender e revisar.

>

### C4. Guia de leitura do PR na Homologação

- **Por quê:** "um bom PR é um prazer de revisar: é o que a gente combinou". Quem revisa precisa
  conferir o que foi feito contra o que foi aprovado.
- **Proposta:** a Homologação acrescenta ao corpo do PR, e ao card, uma seção "Como revisar" com:
  - o que foi combinado (resumo da Spec e do Plan aprovados) e o que foi feito;
  - os desvios do plano e o motivo de cada um;
  - por onde começar a ler e a ordem dos commits (um por sub-tarefa);
  - o que é núcleo e o que é periferia (ver C6);
  - o tamanho do diff: linhas de código, de testes e de docs.
- **Onde mexer:** [phaseDefaults.ts:152](src/shared/phaseDefaults.ts:152) e a seção Homologação da
  skill do fluxo ([flowSkill.ts](src/extension/flowSkill.ts)).
- **Alcance:** Produto.

**Decisão:** [x] fazer  [ ] não fazer  [ ] ajustar

**Observações:**

>

### C5. Revisor de IA como passo fixo, procurando "código que só passa"

- **Por quê:** um revisor de IA melhora o mínimo, pegando o óbvio antes da pessoa, mas não a
  substitui. Os vícios que o treino produz são conhecidos e dá para procurá-los.
- **Onde está:** o `revisor-de-codigo` existe e tem um bom checklist
  ([agentSeeds.ts:118](src/extension/agentSeeds.ts:118)), mas nenhuma instrução de fase o chama.
- **Proposta:**
  - a Implementação termina chamando o revisor no diff da história. O que bloqueia volta para a
    sub-tarefa antes da Homologação, e o resultado entra no guia (C4);
  - novos itens no checklist do revisor:
    - teste novo que já passa no commit base, ou seja, que não testa nada (rodar os testes novos
      contra a base);
    - teste existente alterado no mesmo commit que o código que ele cobre;
    - try/catch novo que engole erro, cast forçado (`as`, `any`, `!`);
    - acoplamento novo entre módulos que não se falavam (o code-review-graph mostra);
  - comentários curtos: só o que bloqueia e no máximo algumas sugestões. O vídeo cita comentários
    longos de IA que ninguém lê.
- **Alcance:** Produto (o seed e a instrução da fase) e Projeto (o nosso revisor em
  `~/.claude/agents`).

**Decisão:** [x] fazer  [ ] não fazer  [ ] ajustar

**Observações:**

>

### C6. Criticidade por área

- **Por quê:** o Pasquadev quer deixar a IA revisar sozinha a periferia do sistema e manter uma pessoa
  no núcleo (arquitetura hexagonal).
- **Onde está:** a aprovação é por coluna, igual para qualquer história, e o YOLO é liga/desliga.
- **Proposta:** regras de criticidade no mesmo estilo das regras de modelo
  ([models.ts:175](src/shared/models.ts:175)). Neste repositório, por exemplo:
  - núcleo: `src/extension/db/**`, `src/extension/mcp/**` e `src/extension/runner.ts`, com aprovação
    humana na Spec, no Plan e na Homologação, mesmo no YOLO;
  - periferia: `docs/**`, `src/webview/i18n/**`, README e CHANGELOG, que podem seguir no YOLO com o
    revisor de IA.
- **Questão:** o motor de regras hoje compara campos do card. Comparar caminhos de arquivo seria novo,
  e os caminhos só são conhecidos depois do Plan. Antes disso, a criticidade viria de um campo do card
  (por exemplo, "Área").
- **Alcance:** Produto.

**Decisão:** [x] fazer  [ ] não fazer  [ ] ajustar

**Observações:**

>

### C7. Métricas de retrabalho

- **Por quê:** não existe benchmark de manutenibilidade. O board é o único lugar que vê o ciclo
  inteiro e pode medir sinais indiretos.
- **Onde está:** as métricas atuais são tokens, execuções, tempo de IA, lead time e tempo na fase
  ([metrics.ts](src/extension/mcp/tools/metrics.ts)). Nenhuma mede retrabalho.
- **Proposta**, no painel e no `get_metrics`:
  - aprovação de primeira por fase: quantas revisões foram aprovadas sem pedido de ajuste;
  - pedidos de ajuste por fase e por modelo;
  - bugs vinculados a histórias concluídas (pelos vínculos entre cards), por área;
  - PRs fechados sem merge e reverts.
- **Questão:** verificar se o log já guarda a volta de "aguardando revisão" para "pronto", que é o que
  marca um pedido de ajuste.
- **Alcance:** Produto.

**Decisão:** [x] fazer  [ ] não fazer  [ ] ajustar

**Observações:**

>

### C8. Versionar o conhecimento do harness

- **Por quê:** o vídeo fala de ilhas de conhecimento, e aqui a ilha é uma máquina. Quem clona o
  repositório, ou uma execução numa máquina nova, não recebe as regras do projeto nem as decisões
  tomadas.
- **Onde está:**
  - os documentos das fases (Discovery, PRD, Spec, Plan) ficam no banco da extensão, fora do
    repositório;
  - os agentes com regras deste repositório (sql.js, DESIGN.md, migrações) estão em
    `~/.claude/agents`, fora do git;
  - o repositório não tem CLAUDE.md nem AGENTS.md.
- **Proposta:**
  - Projeto: mover os agentes do projeto para a aba Projeto (`.claude/agents`) e criar um CLAUDE.md
    do repositório com as convenções (CHANGELOG e README nos dois idiomas, migrações, DESIGN.md).
  - Produto: uma opção para a Spec aprovada virar um registro de decisão no repositório (por
    exemplo, `docs/decisoes/<n>-<titulo>.md`), commitado na branch da história e incluído no PR.
- **Alcance:** Projeto e Produto.

**Decisão:** [x] fazer  [ ] não fazer  [ ] ajustar

**Observações:**

>

### C9. Caminho curto para histórias pequenas

- **Por quê:** o Dex diz que "coisa pequena ainda vai direto para o agente". Cinco aprovações para uma
  mudança de texto custam revisão sem retorno e incentivam a pular o processo.
- **Onde está:** o board padrão tem 6 fases e 5 aprovações para qualquer história
  ([boardTemplate.ts:30](src/extension/db/boardTemplate.ts:30)).
- **Proposta:** uma história com Esforço Baixo, ou de um tipo "Ajuste", pula Discovery, PRD e Spec e
  vai direto para Plan → Implementação → Homologação. Pode ser uma regra, como as de modelo, ou um
  workflow pronto no modelo do board.
- **Alcance:** Produto.

**Decisão:** [x] fazer  [ ] não fazer  [ ] ajustar

**Observações:**

>

---

## Observações gerais

>
