// Nomes do board padrão (workflows, colunas, tipos, campos, opções e o agente padrão) em inglês. Ficam separados do
// dicionário da interface de propósito: só valem para o que o board cria sozinho, então um card ou uma coluna que a
// pessoa batizou com o mesmo texto de um botão não é traduzido. O teste de i18n confere que o board novo está todo aqui.
export const defaults: Record<string, string> = {
  // workflows
  Histórias: 'Stories',
  'Sub-tarefas': 'Sub-tasks',
  // colunas das histórias (as fases do SDD) e das sub-tarefas
  Implementação: 'Implementation',
  Homologação: 'Acceptance',
  Concluído: 'Done',
  Cancelado: 'Cancelled',
  'A fazer': 'To do',
  'Em andamento': 'In progress',
  // tipos de card
  História: 'Story',
  Retrabalho: 'Rework',
  'Débito técnico': 'Tech debt',
  'Sub-tarefa': 'Sub-task',
  // campos e opções
  Fase: 'Phase',
  Modelo: 'Model',
  'Esforço da atividade': 'Task effort',
  // os nomes das regras que "Recriar as regras" monta
  'Esforço da atividade baixo': 'Task effort low',
  'Esforço da atividade médio': 'Task effort medium',
  'Esforço da atividade alto': 'Task effort high',
  Baixo: 'Low',
  Médio: 'Medium',
  Alto: 'High',
  // agente
  'Agente padrão': 'Default agent',
};
