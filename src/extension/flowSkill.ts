import { FLOW_SKILL_NAME } from '../shared/harnessProject';
import { BRIEF_SECTIONS, REQUIRED_BRIEF_SECTIONS } from '../shared/subtaskBrief';
import { skillTemplate } from './frontmatter';

const BRIEF_TITLES = REQUIRED_BRIEF_SECTIONS.map((name) => `"${name}"`).join(', ');

/** Skill que ensina a IA a conduzir os cards pelo fluxo do board. É servida pelo `get_skill`, sem arquivo instalado na pasta de skills de nenhuma ferramenta. */
export const FLOW_SKILL = {
  name: FLOW_SKILL_NAME,
  description:
    'Use sempre que for trabalhar em cards do board Faz AI: conduzir uma história pelas fases, construir o documento de uma fase, responder na conversa de um card, pedir revisão ou retomar o que está pendente.',
  body: `# Fluxo do board Faz AI

O board é acessado pelas ferramentas MCP do servidor \`faz-ai\`. Sua intenção é sempre levar cada
história até a conclusão, uma coluna por vez, parando nos pontos em que a decisão é da pessoa.
Toda conversa com a pessoa sobre um card acontece na conversa do card, não fora dela.

## Por onde começar

1. Chame \`get_pending_work\`. Ele devolve o que está com você, em três grupos.
2. Trate nesta ordem:
   - \`approved\`: a pessoa aprovou e o board já levou o card para a próxima coluna (o status \`approved\` só fica quando o board não pôde mover; aí mova com \`move_card\`). Continue o trabalho na fase nova.
   - \`unanswered\`: a pessoa escreveu na conversa e espera resposta. Leia o card e responda com \`add_comment\`.
   - \`ready\`: pode trabalhar. Se houver mensagens recentes da pessoa (pedido de ajustes, resposta a uma pergunta), elas dizem o que fazer.
3. Se a lista vier vazia, não há nada para você: encerre.

O que aparece em \`withPerson\` está esperando a pessoa. Não mexa nesses cards.

## Trabalhar num card

1. \`get_card\` traz a descrição, a conversa (a partir do último resumo, \`kind: "summary"\`: o que veio
   antes já está nele), os anexos e:
   - \`phase\`: a instrução da fase e, se houver, o documento que ela produz e o modelo dele;
   - \`model\`: o modelo e o esforço que devem executar o card. Se forem diferentes dos seus, avise a pessoa na conversa do card; as sub-tarefas e o fechamento da fase o board executa, cada um com o modelo do card;
   - \`requiredRules\` e \`requiredSkills\`: os arquivos que o card exige. Leia cada um no \`path\` indicado, mesmo que não apareça na sua lista de skills; a skill sem \`path\` se lê com \`get_skill <nome>\`. O que o card exige é o que está no board (Configurações → Harness).
2. Chame \`start_work\` antes de começar (numa sub-tarefa, ele já a leva para a coluna de andamento). Chame \`get_board\` só quando a fase precisa dele (no Plan, para os agentes, no refinar e ao editar o board); nas demais, \`get_card\` basta, e o inventário do Harness está em \`get_harness\`.
3. Siga a instrução de \`phase\`. Leia também os documentos das fases anteriores (anexos da história),
   quando houver. Uma história pode ser criada ou movida direto para uma fase adiante (o Plan, por
   exemplo) e começar dali: sem os documentos anteriores, trabalhe a partir da descrição, da conversa
   e do código, sem criar os documentos que faltam nem bloquear por falta deles.
   Com a regra Trilha curta ligada (Configurações → Regras), uma história de esforço Baixo ou do tipo
   Bug vai do Discovery direto ao Plan na aprovação ou pelo autopiloto, e o Plan parte do DISCOVERY;
   não crie o PRD nem a Spec. No Discovery, se ela for maior do que parecia, suba o esforço com
   \`update_card\`. Um \`move_card\` com a coluna PRD ou Spec continua valendo e força a trilha completa.
4. Ao terminar:
   - se ficou algo dependendo da pessoa (veja "Pendências com a pessoa"), entregue com \`request_review\` e \`pending\`, e **pare**;
   - se \`phase.requiresApproval\` for verdadeiro, chame \`request_review\` na história, com um resumo do que fez e do que a pessoa deve olhar, e **pare**;
   - senão, mova o card para a próxima coluna.

## Pendências com a pessoa

Uma pendência é tudo o que depende de alguém que não é você: uma decisão, um dado, um acesso, um
ponto que ficou em aberto para ela avaliar, algo que ficou de fora da entrega e precisa do aval dela.
O status do card tem de mostrar quem está com a vez, então uma pendência **nunca fica só num
comentário**: ela entrega o card para a pessoa.

- Precisa da resposta para continuar: \`ask_questions\` para pergunta com alternativas (inclusive o que iria
  em \`pending\`), \`ask_question\` para pergunta aberta. Faça as perguntas na história: a descrição dela é o
  insumo dos documentos. Pergunta sem resposta depois do envio: decida pelo padrão do projeto e registre
  a decisão na seção "Perguntas e respostas" (\`update_card\`) e na conversa.
- Impedimento que você não resolve (acesso, ambiente, dependência externa): \`block_card\`.
- A mensagem da pessoa devolve a vez à IA, com o card bloqueado ou não: leia, responda ou faça o pedido.
  Numa história parada por uma sub-tarefa, é ali que ela destrava: responda o que a sub-tarefa pediu e
  devolva-a à fila com \`release_card\`; quem a executa é o board.
- Decidiu ou deixou algo em aberto que ela precisa avaliar: \`request_review\` com \`pending\`
  dizendo o que depende dela. Vale mesmo em coluna sem aprovação. No modo autônomo, não: ali nada
  segura o card (veja "Modo autônomo"), você decide e registra.

Depois de qualquer uma dessas chamadas, pare de trabalhar no card: a vez é dela.

## Fases que produzem documento

1. Crie uma sub-tarefa na história com o campo Fase igual ao nome da coluna (\`create_card\` com \`parent\`).
2. Parta do que as fases anteriores já descobriram: o Discovery registra a seção **"Mapa do código"**
   (arquivos, funções, padrões e testes envolvidos) e a Spec a completa. PRD, Spec e Plan começam
   por esse mapa e leem só o que falta; use antes de Read e Grep as ferramentas de índice de código
   que o Harness liberou, se houver. O arquivo lido continua sendo a fonte de verdade.
   Construa o documento seguindo o modelo em \`phase.artifact.template\`. O que depende da pessoa
   vai por \`ask_questions\` antes de escrever o documento; o documento não repete as perguntas e usa as
   respostas da seção "Perguntas e respostas" da descrição em modo afirmativo.
3. Grave com \`add_attachment\` usando \`artifact: true\` e o nome em \`phase.artifact.filename\`. O arquivo fica anexado à história, mesmo enviado da sub-tarefa, e substitui a versão anterior.
4. Mova a sub-tarefa para a coluna de conclusão (\`move_card\` com \`comment\` dizendo o que fez) e peça a revisão na história.

Quando a pessoa pedir ajustes, corrija o mesmo documento (mesmo nome, \`artifact: true\`), responda na
conversa dizendo o que mudou e chame \`request_review\` de novo.

## Sub-tarefas de implementação

No Plan, crie uma sub-tarefa para cada passo, com Fase = Implementação, na descrição as seções ${BRIEF_TITLES} (e "${BRIEF_SECTIONS.decisions}", se houver; o board confere as quatro obrigatórias antes de executar e devolve ao condutor a sub-tarefa que não as tem), com os arquivos tirados do mapa do código, o campo "Esforço da
atividade" avaliado (Baixo, Médio ou Alto; o modelo é sugerido a partir dele) e os artefatos que a
execução pede: os campos Skills, Rules e MCPs, o agente (\`profile\` no \`create_card\`; \`set_card_profile\`
só para trocar depois) e os itens do checklist (\`checklist\`), tudo no mesmo \`create_card\`. Ele devolve o
card resumido: o detalhe do card criado vem pelo \`get_card\`. Escolha **só entre o
que está no board em modo "Pelo card"** (\`get_harness\`; o que está em "Sempre" já entra sozinho):
nada do catálogo do projeto ou da máquina existe para a execução. Vale o mínimo: no máximo uma skill
por assunto (a mais próxima do objetivo; pode haver mais de uma se forem de assuntos diferentes, como
navegação e acesso a dados) e só os servidores MCP de que a tarefa precisa. Excesso de artefatos
produz o efeito contrário. O mesmo vale para a história. Cada passo é a menor parte da entrega que se verifica sozinha e diz como
verificá-la (teste, typecheck, comando ou tela). Junte numa sub-tarefa as partes pequenas da mesma área e
do mesmo agente; separe quando o agente muda ou quando a parte é grande o bastante para ser revisada
sozinha. Recortar por camada (dados, regras de negócio, tela) vale quando cada camada se verifica sozinha.
A documentação pequena (entrada no changelog e um parágrafo) vai junto com a última sub-tarefa de código.

Uma história é uma funcionalidade e vira um pull request. Estime o tamanho em linhas de código: se
passar de umas 400, deixe nesta história a primeira parte e crie as seguintes como histórias
derivadas, em ordem, cada uma com \`derived_from\` = a parte anterior (a primeira derivada, desta
história; a segunda, da primeira derivada, e assim por diante). No modo autônomo, use
\`autonomous_from\` = esta história em todas, na ordem: a fila já empilha cada uma sobre a anterior. A
branch de cada derivada parte da branch da anterior, e o pull request dela é empilhado sobre o da
anterior (\`workspace.baseBranch\` e \`workspace.prBase\` no \`get_card\`). Quando a anterior é concluída, o board passa a base da seguinte (e a do pull request dela) para a base da anterior, normalmente a \`develop\`, e avisa na conversa: siga sempre o \`workspace.baseBranch\` atual e, se ele mudou, traga a nova base para a branch com \`git fetch origin <base>\` e \`git merge origin/<base>\`, sem rebase nem push forçado.

Declare a ordem entre elas: em \`create_card\`, \`depends_on\` lista as sub-tarefas que precisam
terminar antes (ou use \`link_cards\` com \`depends_on\` depois). Uma sub-tarefa depende de outra
quando usa o que a outra produz **ou quando as duas alteram os mesmos arquivos**. O board executa as
sub-tarefas de uma história uma de cada vez, na ordem das dependências, e cada uma é uma execução nova
da CLI: recortar mais fino não acelera nada e repete o custo de cada execução.

## Ao fechar uma fase ou sub-tarefa

Ao registrar o resultado de uma fase ou sub-tarefa na conversa, resuma em três blocos (omita o que
não houver):

- **Travado em mim**: o que dependeu de uma decisão, acesso ou dado que só a pessoa tem.
- **O que mudou**: o resultado concreto (documento anexado, arquivo alterado, card movido).
- **O que encontrei**: achados relevantes, inclusive suposições ou dados externos que não puderam
  ser validados (marque-os explicitamente como não validados).

Se "Travado em mim" tiver qualquer item, o resumo vai no \`request_review\` com esse item em
\`pending\` (ou em \`ask_questions\`/\`ask_question\`/\`block_card\`, conforme o caso), não num \`add_comment\`:
o card precisa ficar com a pessoa.

Ao revisar código (Implementação, Revisão ou Homologação), concentre-se no diff da branch da história e no
contexto necessário dos arquivos tocados; releia o projeto inteiro só quando o pedido pedir
expressamente uma auditoria geral.

## Quando parar

- Faltou uma informação ou decisão: \`ask_questions\` (com alternativas) ou \`ask_question\` (pergunta aberta)
  no card, e pare de trabalhar nele.
- Impedimento que você não resolve (acesso, ambiente, dependência externa): \`block_card\` com o motivo.
- Ficou algo para a pessoa avaliar: \`request_review\` com \`pending\`, e pare.
- Depois de \`request_review\`: pare. Só uma pessoa aprova.
- No modo autônomo, só a coluna escolhida ao ligar o modo para a história; o resto é decisão sua.

## O que não fazer

- Não mova um card para a frente a partir de uma coluna que exige aprovação se o status não for \`approved\`.
- Não continue o trabalho de um card que está com a pessoa.
- Não decida pela pessoa: na dúvida, pergunte na conversa do card.
- Não deixe uma pendência da pessoa só num comentário: o status do card tem de passar a vez para ela.

## Skills por assunto

Esta skill é o essencial. O detalhe de cada assunto fica em outra skill, que você lê só quando o
assunto aparece (o \`get_card\` aponta qual, numa nota curta). Leia com \`get_skill <nome>\`:

- \`faz-ai-harness-do-card\`: \`model\`, \`requiredRules\`, \`requiredSkills\` e a escolha de skills, rules e servidores do card;
- \`faz-ai-workspace-e-pr\`: \`prepare_workspace\`, a pasta de trabalho, a base do pull request, a pilha e o aviso de conflito com a base;
- \`faz-ai-implementacao-rodadas\`: as rodadas da Implementação (\`subtasksNow\`);
- \`faz-ai-revisao-e-homologacao\`: a Revisão e a Homologação;
- \`faz-ai-modo-autonomo\`: o que muda quando o card mostra \`autonomous: true\`.
`,
};

const HARNESS_BODY = `# Harness do card

O \`get_card\` devolve o que o card exige para a execução; leia antes de começar.

- \`model\`: o modelo e o esforço que devem executar o card. O valor usa \`<perfil>:<modelo>@<esforço>\` do perfil de CLI do board. \`tool\` é o perfil de CLI da execução (o do modelo do card, do agente ou da regra) e \`from\` diz de onde veio; sem modelo indicado vale o perfil padrão (\`set_ai_tool\`), e o bloco não aparece. Você não troca de CLI: a sub-tarefa roda no perfil dela, numa execução do board. Se o modelo da sua sessão for outro, avise a pessoa em vez de executar com outro. Não confunda com o campo "Esforço da atividade": ele é o tamanho da tarefa, e as regras do board sugerem o modelo a partir dele (\`get_models\`).
- \`requiredRules\`: leia cada arquivo em \`path\` antes de executar o card: são as instruções que o card exige, além do contexto fixo do board.
- \`requiredSkills\`: leia o SKILL.md de cada skill em \`path\`; a que vier sem \`path\` se lê com \`get_skill <nome>\`. Elas são obrigatórias mesmo que não apareçam na sua lista de skills: podem estar desligadas ou fora da invocação automática. Em \`files\` estão os arquivos de apoio (referências, modelos de código, scripts): leia os que o SKILL.md indicar e use os modelos como base para o que for criar.
- \`execution.cliLoads\`: o que a CLI da ferramenta carrega por conta própria (regras, skills, agentes, hooks e MCPs do projeto ou do usuário) e se o isolamento está imposto (\`contextEnforced\`). Lista vazia não prova isolamento. O que o board entregou pelo pedido e pelo MCP vale sobre o que a CLI leu sozinha; não afirme que a conversa começou sem artefatos externos sem \`contextEnforced\`.
- Skills, rules, servidores MCP e agente do card: escolha só entre o que está no board em modo "Pelo card" (\`get_harness\`). O mínimo necessário: no máximo uma skill por assunto (mais de uma só se forem de assuntos diferentes) e só os servidores de que a tarefa precisa.
`;

const WORKSPACE_BODY = `# Pasta de trabalho e base do pull request

Antes de alterar código do projeto, chame \`prepare_workspace\` na história: o board cria a branch e a
pasta de trabalho dela e devolve onde trabalhar (também em \`workspace\` no \`get_card\`). Altere o
código só ali e não crie branches por conta própria. A branch parte da base do fluxo (a develop, a
principal ou, na pilha, a branch da anterior); \`workspace.baseBranch\` diz qual foi e
\`workspace.prBase\` é a branch para a qual o pull request deve ser aberto.

Quando \`workspace.note\` trouxer uma pasta ou branch, ela vale. Abra o pull request com \`--base\` em \`workspace.prBase\`
(ex.: \`gh pr create --base <prBase>\`); se a base não vier no \`get_card\`, use a branch principal do repositório. Se
\`workspace.stackNote\` vier, diga na descrição do pull request de qual pull request ele depende. Numa pilha, a base
muda quando a anterior é concluída: siga sempre o \`workspace.baseBranch\` atual e, se ele mudou, traga a nova base
com \`git fetch origin <base>\` e \`git merge origin/<base>\`, sem rebase nem push forçado.

Se a conversa trouxer o aviso de que a branch tem conflito com a base, trate antes de abrir o pull request: na
pasta de trabalho, \`git fetch origin\` e \`git merge origin/<base>\`, resolva os conflitos, rode as checagens do
projeto e faça o commit, sem rebase nem push forçado. Se o conflito pedir uma decisão que é da pessoa, pergunte (no
modo autônomo, \`block_card\` com o motivo). Depois do pull request aberto, o conflito é do board: ele chama a IA
numa execução própria para resolvê-lo.
`;

const RODADAS_BODY = `# Rodadas da Implementação

Na Implementação, o **board** executa as sub-tarefas: cada uma numa execução própria da CLI, com o
agente, o modelo, as skills e os MCPs do card dela, uma depois da outra na pasta da história (um
escritor por vez), na ordem das dependências. Nenhuma sub-tarefa roda sozinha por você, e você não as
executa, nem por subagente (ferramenta \`Agent\`).

A sua sessão na história faz só o trabalho de planejar:

1. Se a história não tem sub-tarefas na fase, crie-as a partir da descrição e da conversa, cada uma
   com Fase = a coluna, os arquivos que vai tocar, o agente e o modelo (\`profile\` do \`create_card\`) e as
   dependências (\`depends_on\`, \`link_cards\`); as que mexem nos mesmos arquivos dependem uma da outra.
   Depois **pare**: o board começa a executar.
2. O \`get_card\` da história traz em \`subtasksNow\` o que o board executa (\`byBoard\`, na ordem),
   o que espera outra sub-tarefa (\`waiting\`) e o que não é do board agora: \`withPerson\` (pergunta,
   revisão ou bloqueio com a pessoa) e \`running\` (execução em curso).
3. Quando todas as sub-tarefas terminam, o board chama você de novo, **uma vez**, para o fechamento:
   verifique o conjunto como o projeto define (typecheck e testes, com terminal), faça o commit na
   branch da história e mova a história. Os resultados de cada sub-tarefa estão na conversa da
   história. Se a verificação falhar, corrija ou crie uma sub-tarefa de correção com Fase = esta coluna
   e pare: o board a executa e chama você de novo.

Quem executa **uma** sub-tarefa (o board chama você só nela) segue o ciclo: \`start_work\` (que já leva a sub-tarefa para "Em andamento"),
faça o trabalho na pasta da história (\`workspace\` no \`get_card\`), verifique só a sua
parte (o teste do que mudou e o \`typecheck\`; nada de suíte completa nem build), conclua com \`move_card\` para a coluna de conclusão com \`comment\` dizendo o que fez. Sem commit, sem trocar de branch e sem
executar outras sub-tarefas.

Testes, build e commit dependem do terminal. Se você não pode rodar comandos nesta execução (permissão
sem terminal, como "Board e arquivos do projeto"), não tente: implemente, verifique lendo o código e
registre na conversa o que falta rodar. Essa parte fica para quem tem permissão.

\`start_work\` recusa a sub-tarefa que ainda depende de outra em aberto. Se duas sub-tarefas precisarem
do mesmo arquivo, registre a dependência com \`link_cards\`: o board executa uma de cada vez de qualquer
forma, mas a ordem certa evita retrabalho.
`;

const REVISAO_BODY = `# Revisão e Homologação

## Revisão

Depois da Implementação e antes do pull request, a história passa pela Revisão:

1. Rode as checagens do projeto (typecheck, lint, testes e build, como o projeto os define).
2. Revise o diff da história contra a base com um olhar independente: crie uma
   sub-tarefa de revisão (Fase = Revisão) com o agente \`revisor-de-codigo\`, se ele estiver nos agentes
   do board, e pare: o board a executa e chama você de novo; sem o agente, revise você mesmo. Além dos defeitos,
   procure o código que só passa no teste: teste novo que já passa no commit base, teste existente
   alterado junto com o código que ele cobre, try/catch que engole erro, cast forçado e acoplamento
   novo entre módulos.
3. Trate cada achado. O que tem diretriz clara (regra do projeto, padrão já usado no código, teste
   que falha) você corrige agora (ou cria uma sub-tarefa de correção com o especialista e para, para o board executá-la) e registra na conversa. O que é ambíguo
   ou muda o comportamento combinado é decisão da pessoa: \`ask_questions\` e pare (no modo autônomo,
   decida pelo padrão do projeto e pelo caminho menos complexo, registre e siga).
4. Rode as checagens de novo, faça o commit, registre o resultado na conversa (ele alimenta o "Como
   revisar" do pull request) e mova a história para a próxima coluna.

## Homologação

A entrega é para a pessoa testar, então o roteiro de testes é parte dela, em dois lugares:

1. Escreva a seção **"Como testar"**: o que foi construído, os passos para verificar (comandos,
   telas, dados de exemplo e o resultado esperado em cada passo) e o que ficou de fora. Acrescente-a
   à descrição da história com \`update_card\`, sem apagar o que já está lá.
2. Se \`phase.decisionRecord\` vier no \`get_card\`, grave antes o registro de decisão no caminho
   indicado (a decisão da Spec aprovada, as alternativas descartadas e os diagramas) e faça o commit.
3. Envie a branch da história, abra o pull request (se ainda não existir) com \`--base\` em
   \`workspace.prBase\` do \`get_card\` (ex.: \`gh pr create --base <prBase>\`) e registre o endereço com
   \`set_pull_request\`. O corpo explica a entrega para quem vai revisar o código, nesta ordem:
   - **Objetivo**: o problema e o resultado, em poucas frases;
   - **O que foi feito**: o resumo das mudanças;
   - **Como revisar**: por onde começar a ler, a ordem dos commits e o tamanho do diff (linhas de
     código, de testes e de documentação);
   - **Decisões**: por que o caminho escolhido, as alternativas descartadas com o motivo de cada uma
     (ex.: um jeito parecido de obter a informação que deixaria a implementação mais complexa) e os
     desvios do plano aprovado;
   - a mesma seção **Como testar**.
4. Resuma na conversa o que foi feito, aponte o roteiro e chame \`request_review\`.

Não faça o merge: ele depende da aprovação da pessoa. Com o merge automático ligado (Configurações →
Git), a aprovação dela faz o merge e leva a história a Concluído; desligado, a IA move o card aprovado.

Todo trabalho parte da \`develop\` (feature e bugfix, inclusive o Bug); só o tipo Hotfix parte da principal, que é a
versão publicada. Num hotfix (pull request para a principal), suba a versão (patch) e registre a correção no
changelog na própria branch, e não abra pull request da principal para a \`develop\` nem a release: depois do
merge, o board leva a correção para a \`develop\` e cria a release a partir da principal.
`;

const AUTONOMO_BODY = `# Modo autônomo

## Modo autônomo (YOLO)

Quando o card (ou a história dele) mostra \`autonomous: true\`, a pessoa liberou a história para
rodar sozinha: ninguém aprova nem responde. Então:

- não chame \`ask_question\` (a pergunta aberta é recusada) nem \`request_review\`, com ou sem \`pending\`,
  exceto quando \`phase.requiresApproval\` vier verdadeiro (a coluna em que o modo para, abaixo) e na
  única situação descrita no item da Homologação: ao terminar a fase, registre na conversa o que fez e
  mova o card para a próxima coluna. Nada segura a história antes da coluna escolhida, nem uma
  pendência;
- \`ask_questions\` é aceita: o board responde cada pergunta com a indicada e a registra na seção
  "Perguntas e respostas" da descrição; use-a para as decisões com alternativas. A pessoa lê as
  decisões quando o modo parar;
- a pessoa pode ter liberado o modo só até uma fase (\`autonomousUntil\` no \`get_card\`). Nessa fase,
  faça o trabalho sem perguntas e, ao terminar, chame \`request_review\` na história com o resumo e
  pare: o modo se desliga e a revisão é da pessoa (\`phase.requiresApproval\` vem verdadeiro ali);
- ninguém revisa as decisões do meio do caminho, então siga sempre os padrões do projeto e as regras
  de arquitetura dele (CLAUDE.md, AGENTS.md, DESIGN.md e o código parecido que já existe) e, entre os
  caminhos que seguem esses padrões, escolha o menos complexo;
- decida as dúvidas por esse critério e registre a decisão e o motivo na conversa;
- ficou algo que a pessoa precisa avaliar (ponto em aberto, escopo que ficou de fora, decisão que
  você tomou no lugar dela e que muda o resultado)? Registre na conversa, em "Travado em mim", e siga:
  \`request_review\` com \`pending\` não segura o card no modo autônomo (vira aprovação na hora);
- \`block_card\` só para impedimento real (acesso, ambiente, falha que você não resolve);
- na Implementação, execute todas as sub-tarefas até o fim; na Revisão, corrija o que tem diretriz e
  decida o que é ambíguo pelo padrão do projeto, registrando; na última coluna em que a IA atua
  (Homologação, no board padrão) não há aprovação nem próxima fase: grave o "Como testar" na
  descrição da história, abra o pull request com ele no corpo, registre-o com \`set_pull_request\`
  (é o registro que entrega a história e a passa para a pessoa), resuma na conversa o que foi feito,
  e pare: não avance o card. Nunca faça o merge: a aprovação da pessoa faz o merge pelo board. Se a
  entrega não gera pull request (decisão de escopo documentada na conversa, ex.: mudança só fora do
  repositório git, sem nada para abrir PR), não há \`set_pull_request\` a chamar: nesse caso, e só
  nesse caso, chame \`request_review\` com o resumo da entrega — é o jeito de marcar a história como
  entregue (o status vai para "aguardando revisão", o mesmo estado da entrega com PR) e pare: não é
  uma alternativa ao fluxo normal com PR, só vale quando de fato não há PR a registrar;
- histórias em modo autônomo formam uma fila e uma pilha de pull requests: cada uma parte da branch da
  anterior (\`workspace.baseBranch\` no \`get_card\`) e o PR é aberto com \`--base\` em \`workspace.prBase\`
  (a branch da anterior). Quando a anterior é concluída, o board passa a base da seguinte (e a do pull request dela) para a base da anterior, normalmente a \`develop\`, e avisa na conversa: siga sempre o \`workspace.baseBranch\` atual e, se ele mudou, traga a nova base para a branch com \`git fetch origin <base>\` e \`git merge origin/<base>\`, sem rebase nem push forçado. Para dividir um pedido grande, crie as próximas histórias com \`create_card\` e \`autonomous_from\`, em ordem de dependência.
`;

export const FLOW_SKILLS: readonly { name: string; description: string; body: string }[] = [
  FLOW_SKILL,
  {
    name: 'faz-ai-harness-do-card',
    description:
      'Use ao ler um card com model, requiredRules, requiredSkills ou harnessNote: como executar com o modelo certo e quais rules, skills e servidores MCP usar.',
    body: HARNESS_BODY,
  },
  {
    name: 'faz-ai-workspace-e-pr',
    description:
      'Use ao alterar código de uma história: prepare_workspace, pasta de trabalho, branch, base do pull request, pilha de histórias e o aviso de conflito com a base.',
    body: WORKSPACE_BODY,
  },
  {
    name: 'faz-ai-implementacao-rodadas',
    description:
      'Use na fase de Implementação de uma história com sub-tarefas: a Implementação executada pelo board (subtasksNow), o ciclo de cada sub-tarefa, o fechamento e o que fazer sem terminal.',
    body: RODADAS_BODY,
  },
  {
    name: 'faz-ai-revisao-e-homologacao',
    description: 'Use nas fases de Revisão e Homologação: checagens, revisão do diff, Como testar, pull request e set_pull_request.',
    body: REVISAO_BODY,
  },
  {
    name: 'faz-ai-modo-autonomo',
    description: 'Use quando o card mostra autonomous: true ou autonomousNote: como seguir sem pedir aprovação nem fazer perguntas.',
    body: AUTONOMO_BODY,
  },
];

export const FLOW_SKILL_NAMES: readonly string[] = FLOW_SKILLS.map((k) => k.name);

/** Confere a lista exata: uma skill de projeto como `faz-ai-deploy` não é do fluxo só por causa do prefixo. */
export function isFlowSkill(name: string): boolean {
  return FLOW_SKILL_NAMES.includes(name);
}

/** SKILL.md de uma skill do fluxo, montado do texto do board; `undefined` se o nome não for do fluxo. */
export function flowSkillMarkdown(name: string): string | undefined {
  const k = FLOW_SKILLS.find((x) => x.name === name);
  return k ? skillTemplate(k.name, k.description, k.body) : undefined;
}
