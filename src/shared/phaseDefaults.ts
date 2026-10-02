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

export const PHASE_DEFAULTS: Record<string, PhaseDefault> = {
  Discovery: {
    instruction: [
      'Entenda o problema de forma macro, antes de qualquer documento de requisitos.',
      'Leia a descrição e a conversa do card (inclusive as imagens anexadas) e investigue o código e a documentação do projeto.',
      'Esclareça o que precisa ser feito, qual é o objetivo, quem é afetado, os pré-requisitos e dependências, os riscos e o que fica de fora.',
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
      '## Pré-requisitos e dependências',
      '',
      '## Riscos e pontos em aberto',
      '',
      '## Fora do escopo',
      '',
      '## Decisões tomadas na conversa',
    ].join('\n'),
  },
  PRD: {
    instruction: [
      'Escreva o documento de requisitos do produto a partir do Discovery aprovado e da conversa do card.',
      'Descreva o comportamento esperado do ponto de vista de quem usa, sem decidir a implementação.',
      'Cada requisito precisa de um critério de aceite verificável.',
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
      '## Questões em aberto',
    ].join('\n'),
  },
  Spec: {
    instruction: [
      'Escreva a especificação técnica que atende ao PRD aprovado.',
      'Investigue o código existente e reaproveite o que já existe; descreva o que muda, onde e por quê.',
      'Aponte as alternativas descartadas e os riscos.',
    ].join('\n'),
    artifactName: 'SPEC.md',
    artifactTemplate: [
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
    ].join('\n'),
  },
  Plan: {
    instruction: [
      'Quebre a Spec aprovada em passos pequenos, que possam ser implementados e verificados um a um.',
      'Registre o plano no artefato e crie uma sub-tarefa para cada passo, com Fase = Implementação, o campo "Esforço da atividade" avaliado (o modelo é sugerido a partir dele) e as Skills necessárias.',
      'A descrição de cada sub-tarefa deve bastar para executá-la: o que fazer, onde e como verificar.',
    ].join('\n'),
    artifactName: 'PLAN.md',
    artifactTemplate: [
      '# Plano: <título>',
      '',
      '## Ordem de execução',
      '| # | Sub-tarefa | Esforço | Depende de | Como verificar |',
      '| --- | --- | --- | --- | --- |',
      '',
      '## Pontos de atenção',
      '',
      '## Verificação final',
    ].join('\n'),
  },
  Implementação: {
    instruction: [
      'Antes de alterar qualquer código, chame prepare_workspace na história: o board cria a branch e a pasta de trabalho dela. Altere o código só nessa pasta e nessa branch.',
      'Execute as sub-tarefas de implementação da história, uma por vez, na ordem do plano.',
      'Em cada uma: chame start_work, mova para "Em andamento", use o modelo e as skills indicados no card, verifique o resultado, faça o commit na branch da história e mova para a coluna de conclusão, registrando na conversa o que foi feito.',
      'Quando todas estiverem concluídas, mova a história para a próxima coluna.',
    ].join('\n'),
    ...NO_ARTIFACT,
  },
  Homologação: {
    instruction: [
      'Prepare a entrega para a validação da pessoa.',
      'Resuma na conversa o que foi construído, como testar passo a passo e o que ficou de fora, e peça a revisão.',
      'A conclusão depende da aprovação: depois de aprovado, mova a história para a coluna de conclusão.',
    ].join('\n'),
    ...NO_ARTIFACT,
  },
};
