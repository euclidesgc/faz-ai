import { FLOW_SKILL_NAME } from '../shared/harnessProject';

/** Skill que ensina a IA a conduzir os cards pelo fluxo do board. É instalada na pasta de skills da ferramenta em uso. */
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
   - \`approved\`: a pessoa aprovou. Mova o card para a próxima coluna com \`move_card\` e continue o trabalho na fase nova.
   - \`unanswered\`: a pessoa escreveu na conversa e espera resposta. Leia o card e responda com \`add_comment\`.
   - \`ready\`: pode trabalhar. Se houver mensagens recentes da pessoa (pedido de ajustes, resposta a uma pergunta), elas dizem o que fazer.
3. Se a lista vier vazia, não há nada para você: encerre.

O que aparece em \`withPerson\` está esperando a pessoa. Não mexa nesses cards.

## Trabalhar num card

1. \`get_card\` traz a descrição, a conversa, os anexos e:
   - \`phase\`: a instrução da fase e, se houver, o documento que ela produz e o modelo dele;
   - \`model\`: o modelo e o esforço que devem executar o card. Se forem diferentes dos seus, delegue a um subagente com essa configuração; se não for possível, avise a pessoa na conversa;
   - \`requiredRules\` e \`requiredSkills\`: os arquivos que o card exige. Leia cada um no caminho indicado, mesmo que não apareça na sua lista de skills: as execuções do board partem de contexto vazio e só conhecem o que o Harness marcou.
2. Chame \`start_work\` antes de começar.
3. Siga a instrução de \`phase\`. Leia também os documentos das fases anteriores (anexos da história),
   quando houver. Uma história pode ser criada ou movida direto para uma fase adiante (o Plan, por
   exemplo) e começar dali: sem os documentos anteriores, trabalhe a partir da descrição, da conversa
   e do código, sem criar os documentos que faltam nem bloquear por falta deles.
4. Ao terminar:
   - se ficou algo dependendo da pessoa (veja "Pendências com a pessoa"), entregue com \`request_review\` e \`pending\`, e **pare**;
   - se \`phase.requiresApproval\` for verdadeiro, chame \`request_review\` na história, com um resumo do que fez e do que a pessoa deve olhar, e **pare**;
   - senão, mova o card para a próxima coluna.

## Pendências com a pessoa

Uma pendência é tudo o que depende de alguém que não é você: uma decisão, um dado, um acesso, um
ponto que ficou em aberto para ela avaliar, algo que ficou de fora da entrega e precisa do aval dela.
O status do card tem de mostrar quem está com a vez, então uma pendência **nunca fica só num
comentário**: ela entrega o card para a pessoa.

- Precisa da resposta para continuar: \`ask_question\`.
- Impedimento que você não resolve (acesso, ambiente, dependência externa): \`block_card\`.
- Decidiu ou deixou algo em aberto que ela precisa avaliar: \`request_review\` com \`pending\`
  dizendo o que depende dela. Vale mesmo em coluna sem aprovação e mesmo em modo autônomo: com
  \`pending\` o card fica em "Aguardando revisão" em vez de ser aprovado automaticamente.

Depois de qualquer uma dessas chamadas, pare de trabalhar no card: a vez é dela.

## Fases que produzem documento

1. Crie uma sub-tarefa na história com o campo Fase igual ao nome da coluna (\`create_card\` com \`parent\`).
2. Construa o documento seguindo o modelo em \`phase.artifact.template\`.
3. Grave com \`add_attachment\` usando \`artifact: true\` e o nome em \`phase.artifact.filename\`. O arquivo fica anexado à história, mesmo enviado da sub-tarefa, e substitui a versão anterior.
4. Mova a sub-tarefa para a coluna de conclusão e peça a revisão na história.

Quando a pessoa pedir ajustes, corrija o mesmo documento (mesmo nome, \`artifact: true\`), responda na
conversa dizendo o que mudou e chame \`request_review\` de novo.

## Sub-tarefas de implementação

No Plan, crie uma sub-tarefa para cada passo, com Fase = Implementação, o campo "Esforço da
atividade" avaliado (Baixo, Médio ou Alto; o modelo é sugerido a partir dele) e as Skills
necessárias. Cada passo é uma parte inteligível da entrega, fácil de revisar sozinha, e diz como
verificá-la (teste, typecheck, comando ou tela). Recortar por camada (dados, regras de negócio, tela)
vale, desde que cada parte seja verificável.

Uma história é uma funcionalidade e vira um pull request. Estime o tamanho em linhas de código: se
passar de umas 400, deixe nesta história a primeira parte e crie as seguintes como histórias
derivadas (\`create_card\` com \`derived_from\` = esta história, ou \`autonomous_from\` no modo
autônomo). A branch de cada derivada parte da branch da anterior, e o pull request dela é empilhado
sobre o da anterior (\`workspace.baseBranch\` no \`get_card\`).

Declare a ordem entre elas: em \`create_card\`, \`depends_on\` lista as sub-tarefas que precisam
terminar antes (ou use \`link_cards\` com \`depends_on\` depois). Uma sub-tarefa depende de outra
quando usa o que a outra produz **ou quando as duas alteram os mesmos arquivos**. Só deixe sem
dependência as que são de fato independentes: elas serão executadas ao mesmo tempo. Entre recortes
igualmente fáceis de revisar, prefira o que deixa cada passo em arquivos diferentes.

Antes de alterar código do projeto, chame \`prepare_workspace\` na história: o board cria a branch e a
pasta de trabalho dela e devolve onde trabalhar (também em \`workspace\` no \`get_card\`). Altere o
código só ali e não crie branches por conta própria.

Na Implementação, trabalhe em rodadas. \`get_card\` na história traz em \`subtasksNow\` o que pode
rodar agora (\`canRunTogether\`), o que espera outra sub-tarefa (\`waiting\`) e, quando houver, o que
não é seu agora: \`withPerson\` (pergunta, revisão ou bloqueio com a pessoa) e \`running\` (outra
execução já está nela). Não mexa nessas duas últimas:

1. Se a sua ferramenta tem subagentes, delegue **cada** sub-tarefa de \`canRunTogether\` a um subagente,
   todos lançados na mesma mensagem para rodarem ao mesmo tempo, cada um com o modelo e o esforço do
   card dele (\`model\` no \`get_card\`). Diga a cada subagente: o número da sub-tarefa, a pasta de
   trabalho da história, que ele altere só os arquivos da tarefa dele, que não faça commit nem troque
   de branch, e o ciclo abaixo.
2. O ciclo de cada sub-tarefa: \`start_work\`, mova para "Em andamento", faça o trabalho, verifique e
   mova para a coluna de conclusão, registrando na conversa do card o que foi feito.
3. Quando a rodada terminar, confira o resultado junto (testes e build do projeto), faça o commit
   (os dois só com terminal; veja abaixo) e leia a história de novo: as sub-tarefas liberadas formam a próxima rodada. Repita até não sobrar
   nenhuma que você possa tocar agora; se as restantes estiverem com a pessoa (\`withPerson\`), pare.

Testes, build e commit dependem do terminal. Se você não pode rodar comandos nesta execução (permissão
sem terminal, como "Board e arquivos do projeto"), não tente: implemente, verifique lendo o código e
registre na conversa da história o que falta rodar (testes, build, commit).
Essa parte fica para quem tem permissão.

\`start_work\` recusa a sub-tarefa que ainda depende de outra em aberto. Sem subagentes, ou com uma
sub-tarefa só na rodada, execute uma por vez, na ordem das dependências. Se duas sub-tarefas da
mesma rodada precisarem do mesmo arquivo, não as rode juntas: registre a dependência com
\`link_cards\` e deixe uma para a rodada seguinte.

## Ao fechar uma fase ou sub-tarefa

Ao registrar o resultado de uma fase ou sub-tarefa na conversa, resuma em três blocos (omita o que
não houver):

- **Travado em mim**: o que dependeu de uma decisão, acesso ou dado que só a pessoa tem.
- **O que mudou**: o resultado concreto (documento anexado, arquivo alterado, card movido).
- **O que encontrei**: achados relevantes, inclusive suposições ou dados externos que não puderam
  ser validados (marque-os explicitamente como não validados).

Se "Travado em mim" tiver qualquer item, o resumo vai no \`request_review\` com esse item em
\`pending\` (ou em \`ask_question\`/\`block_card\`, conforme o caso), não num \`add_comment\`:
o card precisa ficar com a pessoa.

Ao revisar código (Implementação, Revisão ou Homologação), concentre-se no diff da branch da história e no
contexto necessário dos arquivos tocados; releia o projeto inteiro só quando o pedido pedir
expressamente uma auditoria geral.

## Revisão

Depois da Implementação e antes do pull request, a história passa pela Revisão:

1. Rode as checagens do projeto (typecheck, lint, testes e build, como o projeto os define).
2. Revise o diff da história contra a base com um olhar independente: delegue ao agente
   \`revisor-de-codigo\`, se ele estiver nos agentes do board, numa sessão nova. Além dos defeitos,
   procure o código que só passa no teste: teste novo que já passa no commit base, teste existente
   alterado junto com o código que ele cobre, try/catch que engole erro, cast forçado e acoplamento
   novo entre módulos.
3. Trate cada achado. O que tem diretriz clara (regra do projeto, padrão já usado no código, teste
   que falha) você corrige agora, delegando ao especialista, e registra na conversa. O que é ambíguo
   ou muda o comportamento combinado é decisão da pessoa: \`ask_question\` (no modo autônomo,
   \`request_review\` com \`pending\`) e pare.
4. Rode as checagens de novo, faça o commit, registre o resultado na conversa (ele alimenta o "Como
   revisar" do pull request) e mova a história para a próxima coluna.

## Áreas críticas

Quando o board define áreas críticas (o núcleo do projeto), \`get_card\` traz \`criticalAreas\`. Na
Spec e no Plan, confira se a história mexe nesses caminhos e marque o campo Criticidade dela
(\`Núcleo\` ou \`Periferia\`) com \`update_card\`. A história do núcleo espera a aprovação da pessoa
nas colunas que exigem aprovação, mesmo no modo autônomo: ao terminar a fase, \`request_review\` e
pare. Na Revisão, revise com mais rigor os arquivos do núcleo; no pull request, liste-os à parte em
"Como revisar".

## Homologação

A entrega é para a pessoa testar, então o roteiro de testes é parte dela, em dois lugares:

1. Escreva a seção **"Como testar"**: o que foi construído, os passos para verificar (comandos,
   telas, dados de exemplo e o resultado esperado em cada passo) e o que ficou de fora. Acrescente-a
   à descrição da história com \`update_card\`, sem apagar o que já está lá.
2. Se \`phase.decisionRecord\` vier no \`get_card\`, grave antes o registro de decisão no caminho
   indicado (a decisão da Spec aprovada, as alternativas descartadas e os diagramas) e faça o commit.
3. Envie a branch da história, abra o pull request (se ainda não existir) e registre o endereço com
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

## Modo autônomo (YOLO)

Quando o card (ou a história dele) mostra \`autonomous: true\`, a pessoa liberou a história para
rodar sozinha: ninguém aprova nem responde. Então:

- não chame \`ask_question\` (a pergunta é recusada) nem \`request_review\` sem \`pending\`, exceto na
  coluna em que o modo para (abaixo) e na única situação descrita no item da Homologação: ao terminar
  a fase, registre na conversa o que fez e mova o card para a próxima coluna;
- a pessoa pode ter liberado o modo só até uma fase (\`autonomousUntil\` no \`get_card\`). Nessa fase,
  faça o trabalho sem perguntas e, ao terminar, chame \`request_review\` na história com o resumo e
  pare: o modo se desliga e a revisão é da pessoa (\`phase.requiresApproval\` vem verdadeiro ali);
- ninguém revisa as decisões do meio do caminho, então siga sempre os padrões do projeto e as regras
  de arquitetura dele (CLAUDE.md, AGENTS.md, DESIGN.md e o código parecido que já existe) e, entre os
  caminhos que seguem esses padrões, escolha o menos complexo;
- decida as dúvidas por esse critério e registre a decisão e o motivo na conversa;
- ficou algo que a pessoa precisa avaliar (ponto em aberto, escopo que ficou de fora, decisão que
  você tomou no lugar dela e que muda o resultado)? Não siga adiante: \`request_review\` com
  \`pending\`. Nesse caso o card fica em "Aguardando revisão" mesmo em modo autônomo, e a fila
  continua com as outras histórias;
- \`block_card\` só para impedimento real (acesso, ambiente, falha que você não resolve);
- na Implementação, execute todas as sub-tarefas até o fim; na Revisão, corrija o que tem diretriz e
  entregue o que é ambíguo com \`request_review\` e \`pending\`; na última coluna em que a IA atua
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
  anterior (\`workspace.baseBranch\` no \`get_card\`) e o PR é aberto com \`--base\` nela. Para dividir um
  pedido grande, crie as próximas histórias com \`create_card\` e \`autonomous_from\`, em ordem de dependência.

## Quando parar

- Faltou uma informação ou decisão: \`ask_question\` no card, e pare de trabalhar nele.
- Impedimento que você não resolve (acesso, ambiente, dependência externa): \`block_card\` com o motivo.
- Ficou algo para a pessoa avaliar: \`request_review\` com \`pending\`, e pare.
- Depois de \`request_review\`: pare. Só uma pessoa aprova.

## O que não fazer

- Não mova um card para a frente a partir de uma coluna que exige aprovação se o status não for \`approved\`.
- Não continue o trabalho de um card que está com a pessoa.
- Não decida pela pessoa: na dúvida, pergunte na conversa do card.
- Não deixe uma pendência da pessoa só num comentário: o status do card tem de passar a vez para ela.
`,
};
