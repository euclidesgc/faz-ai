import { BRIEF_SECTIONS, REQUIRED_BRIEF_SECTIONS, briefSkeleton } from './subtaskBrief';

/**
 * Fases padrão do fluxo: o que a IA faz quando um card entra na coluna e o modelo do documento que
 * a fase produz. É só o ponto de partida; tudo é editável em Configurações → Workflows e colunas.
 */
export interface PhaseDefault {
  instruction: string;
  /** nome do arquivo do artefato, ex.: PRD.md; vazio quando a fase não gera documento */
  artifactName: string;
  /** modelo do documento, em markdown */
  artifactTemplate: string;
}

const NO_ARTIFACT = { artifactName: '', artifactTemplate: '' };

/** Instrução da Implementação antes de o board criar branches (versão 2 do padrão); boards que ainda a têm recebem a nova. */
export const IMPLEMENTATION_INSTRUCTION_V2 = [
  'Execute as sub-tarefas de implementação da história, uma por vez, na ordem do plano.',
  'Em cada uma: chame start_work, mova para "Em andamento", use o modelo e as skills indicados no card, verifique o resultado e mova para a coluna de conclusão, registrando na conversa o que foi feito.',
  'Quando todas estiverem concluídas, mova a história para a próxima coluna.',
].join('\n');

/** Instrução da Homologação antes do pull request (versões 2 e 3 do padrão). */
export const HOMOLOGATION_INSTRUCTION_V2 = [
  'Prepare a entrega para a validação da pessoa.',
  'Resuma na conversa o que foi construído, como testar passo a passo e o que ficou de fora, e peça a revisão.',
  'A conclusão depende da aprovação: depois de aprovado, mova a história para a coluna de conclusão.',
].join('\n');

/** Instrução da Homologação com o pull request, mas sem o roteiro de testes na descrição do card e do PR (versão 4 do padrão). */
export const HOMOLOGATION_INSTRUCTION_V4 = [
  'Prepare a entrega para a validação da pessoa.',
  'Envie a branch da história (git push) e abra o pull request dela, se ainda não existir (ex.: gh pr create), com um resumo do que foi feito. Registre o endereço com set_pull_request.',
  'Resuma na conversa o que foi construído, como testar passo a passo e o que ficou de fora, e peça a revisão.',
  'Não faça o merge: a conclusão depende da aprovação da pessoa. Depois de aprovado, se o card continuar nesta coluna, mova a história para a coluna de conclusão.',
].join('\n');

// Os textos padrão da versão 5 do board (até a 0.35.0), guardados para a atualização reconhecer a coluna
// que ainda está no padrão e trocá-la pelo atual (ver PHASE_HISTORY).

const PRD_INSTRUCTION_V5 = [
  'Escreva o documento de requisitos do produto a partir do Discovery aprovado e da conversa do card.',
  'Descreva o comportamento esperado do ponto de vista de quem usa, sem decidir a implementação.',
  'Cada requisito precisa de um critério de aceite verificável.',
].join('\n');

const SPEC_INSTRUCTION_V5 = [
  'Escreva a especificação técnica que atende ao PRD aprovado.',
  'Investigue o código existente e reaproveite o que já existe; descreva o que muda, onde e por quê.',
  'Aponte as alternativas descartadas e os riscos.',
].join('\n');

const SPEC_TEMPLATE_V5 = [
  '# Spec: <título>',
  '',
  '## Resumo da solução',
  '',
  '## Arquitetura e componentes afetados',
  '',
  '## Modelo de dados e migrações',
  '',
  '## Interfaces (APIs, mensagens, telas)',
  '',
  '## Casos de erro e limites',
  '',
  '## Estratégia de testes',
  '',
  '## Alternativas consideradas',
  '',
  '## Riscos',
].join('\n');

const PLAN_INSTRUCTION_V5 = [
  'Quebre a Spec aprovada em passos pequenos, que possam ser implementados e verificados um a um.',
  'Registre o plano no artefato e crie uma sub-tarefa para cada passo, com Fase = Implementação, o campo "Esforço da atividade" avaliado (o modelo é sugerido a partir dele) e as Skills necessárias.',
  'A descrição de cada sub-tarefa deve bastar para executá-la: o que fazer, onde e como verificar.',
].join('\n');

const PLAN_TEMPLATE_V5 = [
  '# Plano: <título>',
  '',
  '## Ordem de execução',
  '| # | Sub-tarefa | Esforço | Depende de | Como verificar |',
  '| --- | --- | --- | --- | --- |',
  '',
  '## Pontos de atenção',
  '',
  '## Verificação final',
].join('\n');

const IMPLEMENTATION_INSTRUCTION_V5 = [
  'Antes de alterar qualquer código, chame prepare_workspace na história: o board cria a branch e a pasta de trabalho dela. Altere o código só nessa pasta e nessa branch.',
  'Execute as sub-tarefas de implementação da história, uma por vez, na ordem do plano.',
  'Em cada uma: chame start_work, mova para "Em andamento", use o modelo e as skills indicados no card, verifique o resultado, faça o commit na branch da história e mova para a coluna de conclusão, registrando na conversa o que foi feito.',
  'Quando todas estiverem concluídas, mova a história para a próxima coluna.',
].join('\n');

const HOMOLOGATION_INSTRUCTION_V5 = [
  'Prepare a entrega para a validação da pessoa.',
  'Escreva o roteiro de testes: o que foi construído, como testar passo a passo (comandos, telas, dados de exemplo, resultado esperado em cada passo) e o que ficou de fora. Acrescente-o à descrição do card com update_card, numa seção "Como testar", sem apagar o que já está lá.',
  'Envie a branch da história (git push) e abra o pull request dela, se ainda não existir (ex.: gh pr create), com o resumo do que foi feito e o mesmo roteiro "Como testar" no corpo. Registre o endereço com set_pull_request.',
  'Resuma na conversa o que foi feito, aponte o roteiro e peça a revisão.',
  'Não faça o merge: a conclusão depende da aprovação da pessoa. Depois de aprovado, se o card continuar nesta coluna, mova a história para a coluna de conclusão.',
].join('\n');

// A instrução da Homologação da versão 9 do board (até a 0.39.0): a 10 manda abrir o pull request com --base na base do fluxo (gitflow, #462).
const HOMOLOGATION_INSTRUCTION_V9 = [
  'Prepare a entrega para a validação da pessoa.',
  'Escreva o roteiro de testes: o que foi construído, como testar passo a passo (comandos, telas, dados de exemplo, resultado esperado em cada passo) e o que ficou de fora. Acrescente-o à descrição do card com update_card, numa seção "Como testar", sem apagar o que já está lá.',
  'Envie a branch da história (git push) e abra o pull request dela, se ainda não existir (ex.: gh pr create). O corpo explica a entrega para quem vai revisar o código, nesta ordem: **Objetivo** (o problema e o resultado, em poucas frases); **O que foi feito** (o resumo das mudanças); **Como revisar** (por onde começar a ler, a ordem dos commits e o tamanho do diff em linhas de código, de testes e de documentação); **Decisões** (por que o caminho escolhido, as alternativas descartadas com o motivo de cada uma, ex.: um jeito parecido de obter a informação que deixaria a implementação mais complexa, e os desvios do plano aprovado); e o mesmo roteiro **Como testar**. Registre o endereço com set_pull_request.',
  'Resuma na conversa o que foi feito, aponte o roteiro e peça a revisão.',
  'Não faça o merge: a conclusão depende da aprovação da pessoa. Depois de aprovado, se o card continuar nesta coluna, mova a história para a coluna de conclusão.',
].join('\n');

// A instrução da Homologação da versão 14 do board (até a 0.48.0): a 15 acrescenta o passo do hotfix (versão e release).
const HOMOLOGATION_INSTRUCTION_V14 = [
  'Prepare a entrega para a validação da pessoa.',
  'Escreva o roteiro de testes: o que foi construído, como testar passo a passo (comandos, telas, dados de exemplo, resultado esperado em cada passo) e o que ficou de fora. Acrescente-o à descrição do card com update_card, numa seção "Como testar", sem apagar o que já está lá.',
  'Envie a branch da história (git push) e abra o pull request dela, se ainda não existir, com `gh pr create --base <workspace.prBase do get_card>` (a branch de onde a história partiu: a develop, a principal ou a branch anterior da pilha). O corpo explica a entrega para quem vai revisar o código, nesta ordem: **Objetivo** (o problema e o resultado, em poucas frases); **O que foi feito** (o resumo das mudanças); **Como revisar** (por onde começar a ler, a ordem dos commits e o tamanho do diff em linhas de código, de testes e de documentação); **Decisões** (por que o caminho escolhido, as alternativas descartadas com o motivo de cada uma, ex.: um jeito parecido de obter a informação que deixaria a implementação mais complexa, e os desvios do plano aprovado); e o mesmo roteiro **Como testar**. Registre o endereço com set_pull_request.',
  'Resuma na conversa o que foi feito, aponte o roteiro e peça a revisão.',
  'Não faça o merge: a conclusão depende da aprovação da pessoa. Depois de aprovado, se o card continuar nesta coluna, mova a história para a coluna de conclusão.',
].join('\n');

// A Homologação atual: a do hotfix sobe a versão para a release que o board cria a partir da principal.
const HOMOLOGATION_INSTRUCTION = [
  'Prepare a entrega para a validação da pessoa.',
  'Escreva o roteiro de testes: o que foi construído, como testar passo a passo (comandos, telas, dados de exemplo, resultado esperado em cada passo) e o que ficou de fora. Acrescente-o à descrição do card com update_card, numa seção "Como testar", sem apagar o que já está lá.',
  'Envie a branch da história (git push) e abra o pull request dela, se ainda não existir, com `gh pr create --base <workspace.prBase do get_card>` (a branch de onde a história partiu: a develop, a principal ou a branch anterior da pilha). O corpo explica a entrega para quem vai revisar o código, nesta ordem: **Objetivo** (o problema e o resultado, em poucas frases); **O que foi feito** (o resumo das mudanças); **Como revisar** (por onde começar a ler, a ordem dos commits e o tamanho do diff em linhas de código, de testes e de documentação); **Decisões** (por que o caminho escolhido, as alternativas descartadas com o motivo de cada uma, ex.: um jeito parecido de obter a informação que deixaria a implementação mais complexa, e os desvios do plano aprovado); e o mesmo roteiro **Como testar**. Registre o endereço com set_pull_request.',
  'Num hotfix (`workspace.hotfixNote` no get_card), antes do pull request suba a versão (patch) e registre a correção no changelog, na própria branch: depois do merge na principal, o board leva a correção para a develop e cria a release a partir da principal com essa versão.',
  'Resuma na conversa o que foi feito, aponte o roteiro e peça a revisão.',
  'Não faça o merge: a conclusão depende da aprovação da pessoa. Depois de aprovado, se o card continuar nesta coluna, mova a história para a coluna de conclusão.',
].join('\n');

/**
 * Tamanho, em linhas de código, a partir do qual o Plan propõe dividir a funcionalidade em histórias
 * derivadas, com os pull requests empilhados: acima disso a revisão fica pesada.
 */
export const PR_LINES_BUDGET = 400;

// Os modelos de documento da versão 8 do board (até a 0.38.0): a versão 9 acrescenta a seção "Perguntas para você".
const DISCOVERY_TEMPLATE_V8 = [
  '# Discovery: <título>',
  '',
  '## Problema',
  'O que motiva o pedido e quem é afetado.',
  '',
  '## Objetivo',
  'O resultado esperado, em uma ou duas frases.',
  '',
  '## O que precisa ser feito',
  'Visão macro da solução, sem detalhar requisitos.',
  '',
  '## Pré-requisitos e dependências',
  '',
  '## Riscos e pontos em aberto',
  '',
  '## Fora do escopo',
  '',
  '## Decisões tomadas na conversa',
].join('\n');

const PRD_TEMPLATE_V8 = [
  '# PRD: <título>',
  '',
  '## Contexto e problema',
  '',
  '## Objetivos',
  '',
  '## Fora do escopo',
  '',
  '## Usuários e cenários de uso',
  '',
  '## Requisitos funcionais',
  '| ID | Requisito | Critério de aceite |',
  '| --- | --- | --- |',
  '',
  '## Requisitos não funcionais',
  '',
  '## Métricas de sucesso',
  '',
  '## Questões em aberto',
].join('\n');

const SPEC_TEMPLATE_V8 = [
  '# Spec: <título>',
  '',
  '## Resumo da solução',
  '',
  '## Arquitetura e componentes afetados',
  '',
  '## Desenho do programa',
  'Tipos e assinaturas novos ou alterados, o arquivo de cada um e quem chama quem no caminho principal.',
  'Troque o exemplo abaixo pelo fluxo real; use um diagrama por caminho quando houver mais de um.',
  '',
  '```mermaid',
  'sequenceDiagram',
  '  participant Pessoa',
  '  participant Tela',
  '  participant Serviço',
  '  Pessoa->>Tela: ação',
  '  Tela->>Serviço: chamada(parâmetros)',
  '  Serviço-->>Tela: resultado',
  '```',
  '',
  '## Modelo de dados e migrações',
  '',
  '## Interfaces (APIs, mensagens, telas)',
  '',
  '## Casos de erro e limites',
  '',
  '## Estratégia de testes',
  '',
  '## Alternativas descartadas',
  'O que foi considerado, por que ficou de fora e o que custaria.',
  '',
  '## Riscos',
].join('\n');

const PLAN_TEMPLATE_V8 = [
  '# Plano: <título>',
  '',
  '## Ordem de execução',
  '| # | Sub-tarefa | Esforço | Linhas estimadas | Depende de | Como verificar |',
  '| --- | --- | --- | --- | --- | --- |',
  '',
  '## Tamanho da entrega',
  `Total estimado de linhas de código. Acima de umas ${PR_LINES_BUDGET}, as histórias derivadas e o que fica em cada uma.`,
  '',
  '## Pontos de atenção',
  '',
  '## Verificação final',
].join('\n');

// Os textos padrão da versão 11 do board (até a 0.43.0): a versão 12 acrescenta o "Mapa do código".
const QUESTIONS_SECTION_V9 = [
  '## ❓ Perguntas para você',
  '> **Responda aqui antes de aprovar.** Cada pergunta traz as alternativas, o impacto de cada uma e a recomendação da IA; escreva a sua resposta depois de `R. >`. Sem perguntas, a seção diz "Nenhuma".',
  '',
  '**P1.** <a pergunta, em uma frase>',
  '- **A)** <alternativa>: <o que custa, o que quebra, o que adia>',
  '- **B)** <alternativa>: <o que custa, o que quebra, o que adia>',
  '',
  '**Recomendação:** <A ou B>, porque <a justificativa>.',
  '',
  '**R.** > ',
].join('\n');

const DISCOVERY_INSTRUCTION_V11 = [
  'Entenda o problema de forma macro, antes de qualquer documento de requisitos.',
  'Leia a descrição e a conversa do card (inclusive as imagens anexadas) e investigue o código e a documentação do projeto.',
  'Esclareça o que precisa ser feito, qual é o objetivo, quem é afetado, os pré-requisitos e dependências, os riscos e o que fica de fora.',
  'Discuta com a pessoa pela conversa do card: para cada dúvida ou decisão em aberto use ask_question e pare até a resposta. Pesquise o que for preciso para responder ao que ela escreveu.',
  'Quando o entendimento estiver alinhado, registre-o no artefato e peça a revisão. Ele é o insumo do PRD.',
].join('\n');

const DISCOVERY_TEMPLATE_V11 = `${DISCOVERY_TEMPLATE_V8}\n\n${QUESTIONS_SECTION_V9}`;
const SPEC_TEMPLATE_V11 = `${SPEC_TEMPLATE_V8}\n\n${QUESTIONS_SECTION_V9}`;

const PRD_INSTRUCTION_V11 = [
  'Escreva o documento de requisitos do produto a partir do Discovery aprovado e da conversa do card. Se a história começou nesta fase, sem Discovery, parta da descrição e da conversa.',
  'Descreva o comportamento esperado do ponto de vista de quem usa, sem decidir a implementação.',
  'Cada requisito precisa de um critério de aceite verificável.',
].join('\n');

const SPEC_INSTRUCTION_V11 = [
  'Escreva a especificação técnica que atende ao PRD aprovado. Se a história começou nesta fase, sem PRD, parta da descrição e da conversa do card.',
  'Investigue o código existente e reaproveite o que já existe; descreva o que muda, onde e por quê, seguindo os padrões do projeto e as regras de arquitetura dele.',
  'Desenhe o programa antes do código: os tipos e as assinaturas novos ou alterados, o arquivo de cada um e quem chama quem no caminho principal. Mostre o fluxo da funcionalidade em diagramas Mermaid (sequência ou fluxograma) que alguém que não conhece o código consiga seguir. Se o projeto tem um grafo de chamadas (ex.: o code-review-graph), use-o para confirmar o fluxo.',
  'Registre as alternativas descartadas e o motivo de cada uma (ex.: um jeito parecido de obter a informação que deixaria a implementação mais complexa) e os riscos.',
].join('\n');

const PLAN_INSTRUCTION_V11 = [
  'Quebre a Spec aprovada em passos pequenos, que possam ser implementados e verificados um a um. Se a história começou nesta fase, sem Spec, parta da descrição e da conversa do card.',
  'Cada passo é uma parte inteligível da entrega, fácil de revisar sozinha, e diz como verificá-la (teste, typecheck, comando ou tela). Recortar por camada (dados, regras de negócio, tela) vale, desde que cada parte seja verificável e fácil de revisar.',
  `Estime o tamanho da entrega em linhas de código. A história é uma funcionalidade e vira um pull request; se a estimativa passar de umas ${PR_LINES_BUDGET} linhas, divida a funcionalidade: deixe nesta história a primeira parte e crie as seguintes como histórias derivadas, em ordem, cada uma com derived_from = a parte anterior (a primeira derivada, desta história; a segunda, da primeira derivada, e assim por diante), para cada pull request ficar empilhado sobre o da parte anterior. Registre no plano o que fica em cada uma.`,
  'Registre o plano no artefato e crie uma sub-tarefa para cada passo, com Fase = Implementação, o campo "Esforço da atividade" avaliado (o modelo é sugerido a partir dele) e as Skills necessárias.',
  'A descrição de cada sub-tarefa deve bastar para executá-la: o que fazer, onde e como verificar.',
].join('\n');

// Os textos padrão da versão 12 do board (até a 0.44.0): a versão 13 troca a seção "Perguntas para você" por ask_questions.
const PHASE_DEFAULTS_V12: Record<string, PhaseDefault> = {
  Discovery: {
    instruction: [
      'Entenda o problema de forma macro, antes de qualquer documento de requisitos.',
      'Leia a descrição e a conversa do card (inclusive as imagens anexadas) e investigue o código e a documentação do projeto.',
      'Esclareça o que precisa ser feito, qual é o objetivo, quem é afetado, os pré-requisitos e dependências, os riscos e o que fica de fora.',
      'Use as ferramentas de índice de código que o Harness liberou, se houver, antes de Read e Grep; o arquivo lido continua sendo a fonte de verdade. Registre na seção "Mapa do código" os arquivos, funções, padrões e testes envolvidos: as fases seguintes partem dele e leem só o que faltar.',
      'Discuta com a pessoa pela conversa do card: para cada dúvida ou decisão em aberto use ask_question e pare até a resposta. Pesquise o que for preciso para responder ao que ela escreveu.',
      'Quando o entendimento estiver alinhado, registre-o no artefato e peça a revisão. Ele é o insumo do PRD.',
    ].join('\n'),
    artifactName: 'DISCOVERY.md',
    artifactTemplate: [
      '# Discovery: <título>',
      '',
      '## Problema',
      'O que motiva o pedido e quem é afetado.',
      '',
      '## Objetivo',
      'O resultado esperado, em uma ou duas frases.',
      '',
      '## O que precisa ser feito',
      'Visão macro da solução, sem detalhar requisitos.',
      '',
      '## Mapa do código',
      'Arquivos, funções, padrões e testes envolvidos. As fases seguintes partem daqui.',
      '',
      '## Pré-requisitos e dependências',
      '',
      '## Riscos e pontos em aberto',
      '',
      '## Fora do escopo',
      '',
      '## Decisões tomadas na conversa',
      '',
      '## ❓ Perguntas para você',
      '> **Responda aqui antes de aprovar.** Cada pergunta traz as alternativas, o impacto de cada uma e a recomendação da IA; escreva a sua resposta depois de `R. >`. Sem perguntas, a seção diz "Nenhuma".',
      '',
      '**P1.** <a pergunta, em uma frase>',
      '- **A)** <alternativa>: <o que custa, o que quebra, o que adia>',
      '- **B)** <alternativa>: <o que custa, o que quebra, o que adia>',
      '',
      '**Recomendação:** <A ou B>, porque <a justificativa>.',
      '',
      '**R.** > ',
    ].join('\n'),
  },
  PRD: {
    instruction: [
      'Escreva o documento de requisitos do produto a partir do Discovery aprovado e da conversa do card. Se a história começou nesta fase, sem Discovery, parta da descrição e da conversa.',
      'Descreva o comportamento esperado do ponto de vista de quem usa, sem decidir a implementação.',
      'Cada requisito precisa de um critério de aceite verificável.',
      'Parta da seção "Mapa do código" do Discovery e leia só o que faltar. Use as ferramentas de índice de código que o Harness liberou, se houver, antes de Read e Grep; o arquivo lido continua sendo a fonte de verdade.',
    ].join('\n'),
    artifactName: 'PRD.md',
    artifactTemplate: [
      '# PRD: <título>',
      '',
      '## Contexto e problema',
      '',
      '## Objetivos',
      '',
      '## Fora do escopo',
      '',
      '## Usuários e cenários de uso',
      '',
      '## Requisitos funcionais',
      '| ID | Requisito | Critério de aceite |',
      '| --- | --- | --- |',
      '',
      '## Requisitos não funcionais',
      '',
      '## Métricas de sucesso',
      '',
      '## ❓ Perguntas para você',
      '> **Responda aqui antes de aprovar.** Cada pergunta traz as alternativas, o impacto de cada uma e a recomendação da IA; escreva a sua resposta depois de `R. >`. Sem perguntas, a seção diz "Nenhuma".',
      '',
      '**P1.** <a pergunta, em uma frase>',
      '- **A)** <alternativa>: <o que custa, o que quebra, o que adia>',
      '- **B)** <alternativa>: <o que custa, o que quebra, o que adia>',
      '',
      '**Recomendação:** <A ou B>, porque <a justificativa>.',
      '',
      '**R.** > ',
    ].join('\n'),
  },
  Spec: {
    instruction: [
      'Escreva a especificação técnica que atende ao PRD aprovado. Se a história começou nesta fase, sem PRD, parta da descrição e da conversa do card.',
      'Investigue o código existente e reaproveite o que já existe; descreva o que muda, onde e por quê, seguindo os padrões do projeto e as regras de arquitetura dele. Parta da seção "Mapa do código" do Discovery, leia só o que faltar e complete a mesma seção da Spec com o que descobrir. Use as ferramentas de índice de código que o Harness liberou, se houver, antes de Read e Grep; o arquivo lido continua sendo a fonte de verdade.',
      'Desenhe o programa antes do código: os tipos e as assinaturas novos ou alterados, o arquivo de cada um e quem chama quem no caminho principal. Mostre o fluxo da funcionalidade em diagramas Mermaid (sequência ou fluxograma) que alguém que não conhece o código consiga seguir. Se o projeto tem um grafo de chamadas liberado pelo Harness, use-o para confirmar o fluxo.',
      'Registre as alternativas descartadas e o motivo de cada uma (ex.: um jeito parecido de obter a informação que deixaria a implementação mais complexa) e os riscos.',
    ].join('\n'),
    artifactName: 'SPEC.md',
    artifactTemplate: [
      '# Spec: <título>',
      '',
      '## Resumo da solução',
      '',
      '## Mapa do código',
      'Parta do mapa do Discovery e acrescente só o que faltava: arquivos, funções, padrões e testes envolvidos.',
      '',
      '## Arquitetura e componentes afetados',
      '',
      '## Desenho do programa',
      'Tipos e assinaturas novos ou alterados, o arquivo de cada um e quem chama quem no caminho principal.',
      'Troque o exemplo abaixo pelo fluxo real; use um diagrama por caminho quando houver mais de um.',
      '',
      '```mermaid',
      'sequenceDiagram',
      '  participant Pessoa',
      '  participant Tela',
      '  participant Serviço',
      '  Pessoa->>Tela: ação',
      '  Tela->>Serviço: chamada(parâmetros)',
      '  Serviço-->>Tela: resultado',
      '```',
      '',
      '## Modelo de dados e migrações',
      '',
      '## Interfaces (APIs, mensagens, telas)',
      '',
      '## Casos de erro e limites',
      '',
      '## Estratégia de testes',
      '',
      '## Alternativas descartadas',
      'O que foi considerado, por que ficou de fora e o que custaria.',
      '',
      '## Riscos',
      '',
      '## ❓ Perguntas para você',
      '> **Responda aqui antes de aprovar.** Cada pergunta traz as alternativas, o impacto de cada uma e a recomendação da IA; escreva a sua resposta depois de `R. >`. Sem perguntas, a seção diz "Nenhuma".',
      '',
      '**P1.** <a pergunta, em uma frase>',
      '- **A)** <alternativa>: <o que custa, o que quebra, o que adia>',
      '- **B)** <alternativa>: <o que custa, o que quebra, o que adia>',
      '',
      '**Recomendação:** <A ou B>, porque <a justificativa>.',
      '',
      '**R.** > ',
    ].join('\n'),
  },
  Plan: {
    instruction: [
      'Quebre a Spec aprovada em passos pequenos, que possam ser implementados e verificados um a um. Se a história começou nesta fase, sem Spec, parta da descrição e da conversa do card. Parta da seção "Mapa do código" da Spec e leia só o que faltar. Use as ferramentas de índice de código que o Harness liberou, se houver, antes de Read e Grep; o arquivo lido continua sendo a fonte de verdade.',
      'Cada passo é uma parte inteligível da entrega, fácil de revisar sozinha, e diz como verificá-la (teste, typecheck, comando ou tela). Recortar por camada (dados, regras de negócio, tela) vale, desde que cada parte seja verificável e fácil de revisar.',
      `Estime o tamanho da entrega em linhas de código. A história é uma funcionalidade e vira um pull request; se a estimativa passar de umas ${PR_LINES_BUDGET} linhas, divida a funcionalidade: deixe nesta história a primeira parte e crie as seguintes como histórias derivadas, em ordem, cada uma com derived_from = a parte anterior (a primeira derivada, desta história; a segunda, da primeira derivada, e assim por diante), para cada pull request ficar empilhado sobre o da parte anterior. Registre no plano o que fica em cada uma.`,
      'Registre o plano no artefato e crie uma sub-tarefa para cada passo, com Fase = Implementação, o campo "Esforço da atividade" avaliado (o modelo é sugerido a partir dele) e as Skills necessárias.',
      'A descrição de cada sub-tarefa deve bastar para executá-la: o que fazer, os arquivos que ela vai tocar (tirados do mapa) e como verificar.',
    ].join('\n'),
    artifactName: 'PLAN.md',
    artifactTemplate: [
      '# Plano: <título>',
      '',
      '## Ordem de execução',
      '| # | Sub-tarefa | Esforço | Linhas estimadas | Depende de | Como verificar |',
      '| --- | --- | --- | --- | --- | --- |',
      '',
      '## Tamanho da entrega',
      `Total estimado de linhas de código. Acima de umas ${PR_LINES_BUDGET}, as histórias derivadas e o que fica em cada uma.`,
      '',
      '## Pontos de atenção',
      '',
      '## Verificação final',
      '',
      '## ❓ Perguntas para você',
      '> **Responda aqui antes de aprovar.** Cada pergunta traz as alternativas, o impacto de cada uma e a recomendação da IA; escreva a sua resposta depois de `R. >`. Sem perguntas, a seção diz "Nenhuma".',
      '',
      '**P1.** <a pergunta, em uma frase>',
      '- **A)** <alternativa>: <o que custa, o que quebra, o que adia>',
      '- **B)** <alternativa>: <o que custa, o que quebra, o que adia>',
      '',
      '**Recomendação:** <A ou B>, porque <a justificativa>.',
      '',
      '**R.** > ',
    ].join('\n'),
  },
  Implementação: {
    instruction: [
      'Antes de alterar qualquer código, chame prepare_workspace na história: o board cria a branch e a pasta de trabalho dela. Altere o código só nessa pasta e nessa branch.',
      'Execute as sub-tarefas de implementação da história, uma por vez, na ordem do plano. Se a história começou nesta fase e não tem sub-tarefas, crie uma a partir da descrição e da conversa do card.',
      'Em cada uma: chame start_work, mova para "Em andamento", use o modelo e as skills indicados no card, verifique o resultado, faça o commit na branch da história e mova para a coluna de conclusão, registrando na conversa o que foi feito.',
      'Quando todas estiverem concluídas, mova a história para a próxima coluna.',
    ].join('\n'),
    ...NO_ARTIFACT,
  },
  Revisão: {
    instruction: [
      'Revise a entrega antes do pull request, na branch e na pasta de trabalho da história (workspace no get_card).',
      '1. Rode as checagens do projeto: as que ele define para typecheck, lint, testes e build (package.json, Makefile, CLAUDE.md, AGENTS.md ou a documentação de desenvolvimento).',
      '2. Revise o diff da história contra a base (git diff <base>...HEAD) com um olhar independente: delegue ao agente revisor-de-codigo, se ele estiver nos agentes do board, numa sessão nova; senão, revise você mesmo pelo mesmo roteiro. Procure também o código que só passa no teste: teste novo que já passa no commit base (não testa nada), teste existente alterado junto com o código que ele cobre, try/catch que engole erro, cast forçado e acoplamento novo entre módulos.',
      '3. Trate cada achado. O que tem diretriz clara (regra do projeto, padrão já usado no código, teste que falha) você corrige agora, delegando ao especialista quando houver, e registra na conversa. O que é ambíguo ou muda o comportamento combinado é decisão da pessoa: ask_question (no modo autônomo, request_review com pending) e pare.',
      '4. Depois das correções, rode as checagens de novo e faça o commit na branch da história. Sem permissão para rodar comandos, revise lendo o código e registre na conversa o que falta rodar.',
      '5. Registre na conversa o resultado (o que foi checado, o que foi corrigido e as sugestões que ficaram de fora): ele alimenta o "Como revisar" do pull request. Depois mova a história para a próxima coluna.',
    ].join('\n'),
    ...NO_ARTIFACT,
  },
  Homologação: {
    instruction: HOMOLOGATION_INSTRUCTION,
    ...NO_ARTIFACT,
  },
};

const QUESTIONS_SECTION_START = '\n\n## ❓ Perguntas para você';
const withoutQuestions = (template: string): string => template.split(QUESTIONS_SECTION_START)[0]!;
const askQuestions = (text: string): string =>
  text
    .replace('use ask_question e pare', 'use ask_questions (ou ask_question, para pergunta aberta) e pare')
    .replace('`ask_question` e pare', '`ask_questions` e pare')
    .replace(
      'ask_question (no modo autônomo, request_review com pending) e pare',
      'ask_questions (no modo autônomo, o board responde com a indicada) e pare',
    );

/** Os textos padrão da versão 13: os da versão 12, sem a seção "Perguntas para você" e com ask_questions. */
const PHASE_DEFAULTS_V13: Record<string, PhaseDefault> = Object.fromEntries(
  Object.entries(PHASE_DEFAULTS_V12).map(([name, d]) => [
    name,
    { ...d, instruction: askQuestions(d.instruction), artifactTemplate: withoutQuestions(d.artifactTemplate) },
  ]),
);

// A versão 14 explica a trilha curta (regra shortTrack): o Discovery avisa que a história pequena vai direto ao
// Plan e como devolvê-la à trilha completa; o Plan parte do DISCOVERY quando não há PRD nem Spec.
const SHORT_TRACK_DISCOVERY =
  'Com a regra Trilha curta ligada, uma história de esforço Baixo ou do tipo Bug vai deste Discovery direto ao Plan, sem PRD nem Spec: deixe o Mapa do código completo, porque o Plan parte dele. Se descobrir que a história é maior do que parecia, suba o campo "Esforço da atividade" com update_card (ou corrija o tipo) e registre na conversa: o avanço seguinte segue a trilha completa.';
const shortTrack = (name: string, text: string): string => {
  if (name === 'Discovery') return text.replace('\nDiscuta com a pessoa', `\n${SHORT_TRACK_DISCOVERY}\nDiscuta com a pessoa`);
  if (name === 'Plan')
    return text.replace(
      'Se a história começou nesta fase, sem Spec, parta da descrição e da conversa do card. Parta da seção "Mapa do código" da Spec e leia só o que faltar.',
      'Se a história começou nesta fase, sem Spec, ou veio pela trilha curta (só com o Discovery), parta do DISCOVERY.md, da descrição e da conversa do card, sem criar os documentos que faltam. Parta da seção "Mapa do código" da Spec ou do Discovery e leia só o que faltar.',
    );
  return text;
};

/** Os textos padrão da versão 14: os da versão 13 com a trilha curta no Discovery e no Plan. */
const PHASE_DEFAULTS_V14: Record<string, PhaseDefault> = Object.fromEntries(
  Object.entries(PHASE_DEFAULTS_V13).map(([name, d]) => [name, { ...d, instruction: shortTrack(name, d.instruction) }]),
);

// A versão 16 recorta o Plan por entrega verificável (verifiableSlices): o board executa as sub-tarefas uma por vez,
// cada uma numa execução nova da IA; as partes pequenas da mesma área e do mesmo agente se juntam.
const VERIFIABLE_SLICES_PLAN_FIRST = 'Quebre a Spec aprovada em sub-tarefas, cada uma a menor parte da entrega que se verifica sozinha.';
const VERIFIABLE_SLICES_PLAN_RULE =
  'Cada sub-tarefa é uma parte inteligível da entrega, fácil de revisar sozinha, e diz como verificá-la (teste, typecheck, comando ou tela). O board executa as sub-tarefas de uma história uma por vez, na ordem das dependências, e cada uma é uma execução nova da IA: junte numa só as partes pequenas da mesma área e do mesmo agente, e separe quando o agente muda ou quando a parte é grande o bastante para ser revisada sozinha. Recortar por camada (dados, regras de negócio, tela) vale quando cada camada se verifica sozinha. A documentação pequena (uma entrada no changelog e um parágrafo) vai junto com a última sub-tarefa de código; só fica numa sub-tarefa própria quando é maior.';
const verifiableSlices = (name: string, text: string): string =>
  name === 'Plan'
    ? text
        .replace(
          'Quebre a Spec aprovada em passos pequenos, que possam ser implementados e verificados um a um.',
          VERIFIABLE_SLICES_PLAN_FIRST,
        )
        .replace(
          'Cada passo é uma parte inteligível da entrega, fácil de revisar sozinha, e diz como verificá-la (teste, typecheck, comando ou tela). Recortar por camada (dados, regras de negócio, tela) vale, desde que cada parte seja verificável e fácil de revisar.',
          VERIFIABLE_SLICES_PLAN_RULE,
        )
        .replace('crie uma sub-tarefa para cada passo', 'crie uma sub-tarefa para cada parte')
    : text;

/** Os textos padrão da versão 16: os da versão 14 com o Plan recortado por entrega verificável. */
const PHASE_DEFAULTS_V16: Record<string, PhaseDefault> = Object.fromEntries(
  Object.entries(PHASE_DEFAULTS_V14).map(([name, d]) => [name, { ...d, instruction: verifiableSlices(name, d.instruction) }]),
);

// A versão 17 pede a descrição da sub-tarefa em seções (subtaskBrief): o board confere as obrigatórias antes de executar.
const SUBTASK_BRIEF_PLAN_LAST =
  'A descrição de cada sub-tarefa deve bastar para executá-la: o que fazer, os arquivos que ela vai tocar (tirados do mapa) e como verificar.';
const SUBTASK_BRIEF_PLAN_RULE = `Escreva a descrição de cada sub-tarefa nas seções ${REQUIRED_BRIEF_SECTIONS.map((n) => `"${n}"`).join(', ')} (e "${BRIEF_SECTIONS.decisions}", se houver, opcional), no esqueleto do modelo do plano: "${BRIEF_SECTIONS.done}" é a checagem que diz que acabou, de preferência o comando; "${BRIEF_SECTIONS.may}" e "${BRIEF_SECTIONS.mayNot}" saem do mapa do código. O board confere as quatro obrigatórias antes de executar e devolve ao condutor a sub-tarefa que não as tem.`;
const SUBTASK_BRIEF_PLAN_SECTION = `## Descrição de cada sub-tarefa\nCada sub-tarefa leva na descrição:\n\n${briefSkeleton()}\n\n`;
const subtaskBrief = (name: string, d: PhaseDefault): PhaseDefault =>
  name === 'Plan'
    ? {
        ...d,
        instruction: d.instruction.replace(SUBTASK_BRIEF_PLAN_LAST, SUBTASK_BRIEF_PLAN_RULE),
        artifactTemplate: d.artifactTemplate.replace('## Pontos de atenção', `${SUBTASK_BRIEF_PLAN_SECTION}## Pontos de atenção`),
      }
    : d;

/** Os textos padrão da versão 17: os da versão 16 com o Plan pedindo a descrição da sub-tarefa em seções. */
const PHASE_DEFAULTS_V17: Record<string, PhaseDefault> = Object.fromEntries(
  Object.entries(PHASE_DEFAULTS_V16).map(([name, d]) => [name, subtaskBrief(name, d)]),
);

// A versão 18 explica a trilha direta (regra shortTrack): a história pequena, com plano de até uns 3 arquivos, é
// implementada pela própria sessão da história, sem sub-tarefas; se crescer, volta às sub-tarefas com o motivo na conversa.
const DIRECT_TRACK_PLAN =
  'Na trilha curta (história de esforço Baixo ou do tipo Bug, com a regra ligada), se o plano couber em até uns 3 arquivos, registre o plano no artefato e não crie sub-tarefas: a Implementação implementa a história direto.';
const DIRECT_TRACK_IMPLEMENTATION =
  'Na trilha direta (história da trilha curta, sem sub-tarefas na fase) você implementa a história: altere o código, verifique como o projeto define, faça o commit e mova a história para a próxima coluna. Se a mudança passar de uns 3 arquivos, crie as sub-tarefas com Fase = esta coluna, registre o motivo na conversa e pare: o board as executa.';
const directTrack = (name: string, d: PhaseDefault): PhaseDefault => {
  if (name === 'Plan') return { ...d, instruction: `${d.instruction}\n${DIRECT_TRACK_PLAN}` };
  if (name === 'Implementação') return { ...d, instruction: `${d.instruction}\n${DIRECT_TRACK_IMPLEMENTATION}` };
  return d;
};

/** Os textos padrão atuais (versão 18): os da versão 17 com a trilha direta no Plan e na Implementação. */
export const PHASE_DEFAULTS: Record<string, PhaseDefault> = Object.fromEntries(
  Object.entries(PHASE_DEFAULTS_V17).map(([name, d]) => [name, directTrack(name, d)]),
);

/** Textos padrão anteriores de uma fase e o que a versão atual traz de novo, para a atualização do board. */
export interface PhaseHistory {
  instructions: string[];
  templates: string[];
  /** o que muda para quem ainda tem um texto antigo; entra na descrição da atualização */
  change: string;
}

/**
 * Versões anteriores do padrão de cada fase. Na atualização do board, a coluna que ainda tem uma
 * delas (o texto exato, ou seja, não personalizado) recebe a versão atual de PHASE_DEFAULTS. Quem
 * muda um texto padrão acrescenta o anterior aqui e sobe BOARD_TEMPLATE_VERSION.
 */
export const PHASE_HISTORY: Record<string, PhaseHistory> = {
  Discovery: {
    instructions: [DISCOVERY_INSTRUCTION_V11, PHASE_DEFAULTS_V12.Discovery!.instruction, PHASE_DEFAULTS_V13.Discovery!.instruction],
    templates: [DISCOVERY_TEMPLATE_V8, DISCOVERY_TEMPLATE_V11, PHASE_DEFAULTS_V12.Discovery!.artifactTemplate],
    change:
      'a fase explica a trilha curta (história de esforço Baixo ou do tipo Bug vai direto ao Plan quando a regra está ligada) e como devolver a história à trilha completa; as dúvidas com alternativas vão por ask_questions (carrossel no card) e o documento perde a seção "Perguntas para você"',
  },
  PRD: {
    instructions: [PRD_INSTRUCTION_V5, PRD_INSTRUCTION_V11],
    templates: [PRD_TEMPLATE_V8, PHASE_DEFAULTS_V12.PRD!.artifactTemplate],
    change: 'o documento perde a seção "Perguntas para você": as dúvidas com alternativas vão por ask_questions antes de escrevê-lo',
  },
  Spec: {
    instructions: [SPEC_INSTRUCTION_V5, SPEC_INSTRUCTION_V11],
    templates: [SPEC_TEMPLATE_V5, SPEC_TEMPLATE_V8, SPEC_TEMPLATE_V11, PHASE_DEFAULTS_V12.Spec!.artifactTemplate],
    change: 'o documento perde a seção "Perguntas para você": as dúvidas com alternativas vão por ask_questions antes de escrevê-lo',
  },
  Plan: {
    instructions: [
      PLAN_INSTRUCTION_V5,
      PLAN_INSTRUCTION_V11,
      PHASE_DEFAULTS_V12.Plan!.instruction,
      PHASE_DEFAULTS_V13.Plan!.instruction,
      PHASE_DEFAULTS_V14.Plan!.instruction,
      PHASE_DEFAULTS_V16.Plan!.instruction,
      PHASE_DEFAULTS_V17.Plan!.instruction,
    ],
    templates: [PLAN_TEMPLATE_V5, PLAN_TEMPLATE_V8, PHASE_DEFAULTS_V12.Plan!.artifactTemplate, PHASE_DEFAULTS_V16.Plan!.artifactTemplate],
    change:
      'na trilha curta, com plano de até uns 3 arquivos, o plano é registrado e a história é implementada sem sub-tarefas; a descrição de cada sub-tarefa passa a ter as seções Objetivo, Pronto quando, Pode tocar e Não pode tocar (Decisões anteriores é opcional), com o esqueleto no modelo do plano, e o board confere as quatro obrigatórias antes de executar; as sub-tarefas passam a ser a menor parte da entrega que se verifica sozinha: as pequenas da mesma área e do mesmo agente se juntam, e a documentação pequena vai com a última de código; o plano parte do DISCOVERY quando a história veio pela trilha curta, sem PRD nem Spec; o documento perde a seção "Perguntas para você": as dúvidas com alternativas vão por ask_questions antes de escrevê-lo',
  },
  Revisão: {
    instructions: [PHASE_DEFAULTS_V12.Revisão!.instruction],
    templates: [],
    change: 'o achado que muda o comportamento combinado vira pergunta por ask_questions',
  },
  Implementação: {
    instructions: [IMPLEMENTATION_INSTRUCTION_V5, PHASE_DEFAULTS_V17.Implementação!.instruction],
    templates: [],
    change:
      'na trilha direta (história da trilha curta, sem sub-tarefas) você implementa a história; se a mudança passar de uns 3 arquivos, cria as sub-tarefas e registra o motivo na conversa; a fase pode começar sem sub-tarefas do Plan',
  },
  Homologação: {
    instructions: [HOMOLOGATION_INSTRUCTION_V5, HOMOLOGATION_INSTRUCTION_V9, HOMOLOGATION_INSTRUCTION_V14],
    templates: [],
    change:
      'o pull request é aberto com --base na branch de onde a história partiu (workspace.prBase do get_card) e explica o objetivo, como revisar o código e as decisões tomadas; no hotfix, sobe a versão para a release que o board cria a partir da principal',
  },
};
