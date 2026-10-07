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
   - \`requiredSkills\`: skills obrigatórias do card. Leia o SKILL.md de cada uma no caminho indicado, mesmo que ela não apareça na sua lista de skills.
2. Chame \`start_work\` antes de começar.
3. Siga a instrução de \`phase\`. Leia também os documentos das fases anteriores (anexos da história).
4. Ao terminar:
   - se \`phase.requiresApproval\` for verdadeiro, chame \`request_review\` na história, com um resumo do que fez e do que a pessoa deve olhar, e **pare**;
   - senão, mova o card para a próxima coluna.

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
necessárias.

Declare a ordem entre elas: em \`create_card\`, \`depends_on\` lista as sub-tarefas que precisam
terminar antes (ou use \`link_cards\` com \`depends_on\` depois). Uma sub-tarefa depende de outra
quando usa o que a outra produz **ou quando as duas alteram os mesmos arquivos**. Só deixe sem
dependência as que são de fato independentes: elas serão executadas ao mesmo tempo. Prefira recortar
os passos de modo que cada um mexa em arquivos diferentes.

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

## Homologação

A entrega é para a pessoa testar, então o roteiro de testes é parte dela, em dois lugares:

1. Escreva a seção **"Como testar"**: o que foi construído, os passos para verificar (comandos,
   telas, dados de exemplo e o resultado esperado em cada passo) e o que ficou de fora. Acrescente-a
   à descrição da história com \`update_card\`, sem apagar o que já está lá.
2. Envie a branch da história, abra o pull request (se ainda não existir) com o resumo do que foi
   feito e a mesma seção "Como testar" no corpo, e registre o endereço com \`set_pull_request\`.
3. Resuma na conversa o que foi feito, aponte o roteiro e chame \`request_review\`.

Não faça o merge: ele depende da aprovação da pessoa. Com o merge automático ligado (Configurações →
Git), a aprovação dela faz o merge e leva a história a Concluído; desligado, a IA move o card aprovado.

## Modo autônomo (YOLO)

Quando o card (ou a história dele) mostra \`autonomous: true\`, a pessoa liberou a história para
rodar sozinha: ninguém aprova nem responde. Então:

- não chame \`request_review\` nem \`ask_question\` (a pergunta é recusada): ao terminar a fase,
  registre na conversa o que fez e mova o card para a próxima coluna;
- decida as dúvidas pela opção mais razoável e registre a decisão e o motivo na conversa;
- \`block_card\` só para impedimento real (acesso, ambiente, falha que você não resolve);
- na Implementação, execute todas as sub-tarefas até o fim; na última coluna em que a IA atua
  (Homologação, no board padrão) não há aprovação nem próxima fase: grave o "Como testar" na
  descrição da história, abra o pull request com ele no corpo, registre-o com \`set_pull_request\`
  (é o registro que entrega a história e a passa para a pessoa), resuma na conversa o que foi feito,
  e pare: não avance o card. Nunca faça o merge: a aprovação da pessoa faz o merge pelo board;
- histórias em modo autônomo formam uma fila e uma pilha de pull requests: cada uma parte da branch da
  anterior (\`workspace.baseBranch\` no \`get_card\`) e o PR é aberto com \`--base\` nela. Para dividir um
  pedido grande, crie as próximas histórias com \`create_card\` e \`autonomous_from\`, em ordem de dependência.

## Quando parar

- Faltou uma informação ou decisão: \`ask_question\` no card, e pare de trabalhar nele.
- Impedimento que você não resolve (acesso, ambiente, dependência externa): \`block_card\` com o motivo.
- Depois de \`request_review\`: pare. Só uma pessoa aprova.

## O que não fazer

- Não mova um card para a frente a partir de uma coluna que exige aprovação se o status não for \`approved\`.
- Não continue o trabalho de um card que está com a pessoa.
- Não decida pela pessoa: na dúvida, pergunte na conversa do card.
`,
};
