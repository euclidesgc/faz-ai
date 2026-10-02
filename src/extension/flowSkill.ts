/** Skill que ensina a IA a conduzir os cards pelo fluxo do board. É instalada na pasta de skills da ferramenta em uso. */
export const FLOW_SKILL = {
  name: 'faz-ai-fluxo',
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
   - \`requiredSkills\`: skills que você deve carregar antes de executar.
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
necessárias. Na Implementação, execute uma por vez: \`start_work\`, mova para "Em andamento", faça o
trabalho, verifique e mova para a coluna de conclusão, registrando na conversa o que foi feito.

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
