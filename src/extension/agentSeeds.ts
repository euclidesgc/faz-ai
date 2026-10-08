import { FLOW_SKILL_NAME, toItemName } from '../shared/harnessProject';
import type { AgentInput } from '../shared/messages';
import { TOOL_PRESETS } from '../shared/execution';
import { EFFORT_FIELD } from '../shared/models';
import type { BoardState } from '../shared/model';
import type { HarnessStore } from './harness';
import type { BoardContext } from './panel/handlers/context';

type Level = 'Baixo' | 'Médio' | 'Alto';

/** Um agente de fábrica: o que ele faz, com que esforço de modelo, com que ferramentas e skills, e como age. */
interface Seed {
  name: string;
  description: string;
  level: Level;
  tools: string[];
  skills: string[];
  body: string;
}

const READ = TOOL_PRESETS.find((p) => p.id === 'read')!.tools;
const CODE = TOOL_PRESETS.find((p) => p.id === 'code')!.tools;

/** Nome do agente padrão de fábrica: conduz os cards pelo fluxo e delega aos especialistas. */
export const CONDUCTOR_AGENT = 'condutor-do-board';

/**
 * A variedade mínima de agentes que o board oferece. Instruções curtas e genéricas de propósito: o
 * "Sugerir agentes com IA" e a pessoa as adaptam ao projeto. O modelo vem das regras de esforço do board.
 */
export const AGENT_SEEDS: Seed[] = [
  {
    name: CONDUCTOR_AGENT,
    description:
      'Conduz os cards pelo fluxo do board (fases, documentos, revisão, pendências) e delega o trabalho técnico aos agentes especialistas.',
    level: 'Médio',
    tools: READ,
    skills: [FLOW_SKILL_NAME],
    body: [
      'Você conduz cards do board Faz AI. Siga a skill do fluxo e as instruções da fase que vêm em `phase` no get_card.',
      'Comece por get_pending_work ou pelo card pedido; decida o próximo passo da fase e passe a vez ao terminar.',
      'Não faça você o trabalho técnico que um especialista faria melhor: no Plan e na Implementação, indique o agente certo em cada sub-tarefa com set_card_profile, escolhendo entre os agentes disponíveis em get_board.',
      'Registre decisões e resultados na conversa do card. Nunca invente requisito: o que estiver em aberto vira pergunta ou nota.',
    ].join('\n'),
  },
  {
    name: 'frontend-web',
    description: 'Frontend web em React/TypeScript: componentes, estado, estilos, acessibilidade e testes de interface.',
    level: 'Médio',
    tools: CODE,
    skills: [],
    body: [
      'Siga os padrões de componentes, estado e estilo que já existem no projeto; procure um exemplo parecido antes de criar algo novo.',
      'Todo comportamento novo de tela ganha teste de interface. Acessibilidade (teclado, leitor de tela) e responsividade fazem parte da entrega.',
      'Não acrescente dependência nova sem registrar no card o motivo.',
    ].join('\n'),
  },
  {
    name: 'backend-node',
    description: 'Backend em Node/TypeScript: APIs, serviços, persistência e testes.',
    level: 'Médio',
    tools: CODE,
    skills: [],
    body: [
      'Contratos explícitos: tipos e validação na borda de entrada. Erros tratados e registrados, nunca engolidos.',
      'Teste unitário para a lógica e teste de integração para o caminho que toca banco ou rede. Migrações sempre reversíveis.',
      'Siga a estrutura de pastas e os padrões de código do projeto.',
    ].join('\n'),
  },
  {
    name: 'backend-python',
    description: 'Backend em Python: APIs, serviços, scripts e dados.',
    level: 'Médio',
    tools: CODE,
    skills: [],
    body: [
      'Use o ambiente virtual e o gerenciador de dependências do projeto. Type hints em tudo que for público.',
      'Testes com o framework que o projeto já usa (pytest, por padrão); lint e formatação do projeto antes de concluir.',
      'Nenhum efeito colateral na importação de um módulo.',
    ].join('\n'),
  },
  {
    name: 'mobile-flutter',
    description: 'Aplicativos móveis em Flutter/Dart: widgets, estado, navegação e testes de widget.',
    level: 'Médio',
    tools: CODE,
    skills: [],
    body: [
      'Widgets pequenos e testáveis; o estado segue o padrão que o projeto já adotou.',
      'Rode `flutter analyze` e os testes de widget antes de concluir. Trate as diferenças de plataforma (iOS e Android) de forma explícita.',
    ].join('\n'),
  },
  {
    name: 'documentacao-tecnica',
    description: 'Documentação técnica: README, guias, registros de decisão e changelog.',
    level: 'Baixo',
    tools: ['Read', 'Grep', 'Glob', 'Edit', 'Write'],
    skills: [],
    body: [
      'Escreva para quem chega agora ao projeto: contexto antes do detalhe, exemplos reais, nada de comportamento inventado (confirme no código).',
      'Quando o projeto mantém dois idiomas, atualize os dois com o mesmo conteúdo.',
    ].join('\n'),
  },
  {
    name: 'qa-testes',
    description: 'Estratégia e escrita de testes, reprodução e cobertura de bugs.',
    level: 'Médio',
    tools: CODE,
    skills: [],
    body: [
      'Reproduza o problema com um teste que falha antes de qualquer correção; todo bug ganha teste de regressão.',
      'Cubra os casos de borda e de erro nomeados nos critérios de aceite. Nunca altere o comportamento sob teste só para o teste passar.',
    ].join('\n'),
  },
  {
    name: 'revisor-de-codigo',
    description: 'Revisão de código: correção, segurança, clareza e aderência aos padrões do projeto.',
    level: 'Alto',
    tools: ['Read', 'Grep', 'Glob', 'Bash'],
    skills: [],
    body: [
      'Leia o diff inteiro e o contexto dos arquivos tocados. Aponte defeitos com o cenário concreto em que falham.',
      'Separe o que bloqueia do que é sugestão. Não reescreva o código: aponte e explique.',
    ].join('\n'),
  },
  {
    name: 'devops-infra',
    description: 'CI/CD, contêineres, infraestrutura como código e automação de ambiente.',
    level: 'Médio',
    tools: CODE,
    skills: [],
    body: [
      'Mudanças idempotentes e reversíveis; documente o caminho de volta. Segredos nunca em arquivo versionado.',
      'Valide o pipeline localmente quando houver como, antes de depender da execução remota.',
    ].join('\n'),
  },
  {
    name: 'dados-sql',
    description: 'Modelagem de dados, SQL, migrações e consultas analíticas.',
    level: 'Médio',
    tools: CODE,
    skills: [],
    body: [
      'Migrações com ida e volta. Índices justificados; consultas que tocam tabelas grandes explicadas (EXPLAIN) antes de entrar.',
      'Proteja dados pessoais: nada de copiar dados reais para exemplos ou testes.',
    ].join('\n'),
  },
];

/** O modelo que as regras do board sugerem para um nível de esforço (a regra "Esforço = nível"), ou vazio quando não há. */
function modelFor(state: BoardState, level: Level): string {
  const effort = state.fieldDefs.find((f) => f.name.toLowerCase() === EFFORT_FIELD.toLowerCase());
  if (!effort) return '';
  const rule = state.board.modelRules.find(
    (r) => r.enabled && r.groups.some((g) => g.some((c) => c.fieldId === effort.id && c.op === 'is' && c.value === level)),
  );
  return rule?.model ?? '';
}

/**
 * Cria na pasta global de agentes da ferramenta em uso os agentes de fábrica que ainda não existem (em
 * nenhum escopo) e nunca foram oferecidos a este board; com `force`, também os já oferecidos que a
 * pessoa apagou. Marca cada um como disponível e, sem agente padrão definido, faz do condutor o padrão.
 * Devolve os nomes criados.
 */
export function seedAgents(ctx: BoardContext, store: HarnessStore, force = false): string[] {
  const state = ctx.state();
  const offered = new Set(ctx.boards.seededAgents(ctx.boardId));
  const existing = new Set(store.agents().map((a) => a.name));
  const created: string[] = [];
  for (const seed of AGENT_SEEDS) {
    if (existing.has(seed.name) || (!force && offered.has(seed.name))) continue;
    const input: AgentInput = {
      name: seed.name,
      description: seed.description,
      body: seed.body,
      model: modelFor(state, seed.level),
      tools: seed.tools,
      deniedTools: [],
      skills: seed.skills,
      mcp: [],
    };
    try {
      store.createAgent(input, 'user', true);
      created.push(seed.name);
    } catch {
      // sem pasta de usuário ou sem agentes nesta ferramenta: nada a semear
      return created;
    }
  }
  if (created.length) ctx.boards.addSeededAgents(ctx.boardId, created);
  return created;
}

/**
 * Converte os agentes que versões anteriores guardavam no banco em arquivos na pasta global da
 * ferramenta, marcados como disponíveis. Um arquivo de mesmo nome que já exista é reaproveitado, nunca
 * sobrescrito. Colunas e cards passam a apontar pelo nome. Idempotente: só roda enquanto houver perfis no banco.
 */
export function migrateExecProfiles(ctx: BoardContext, store: HarnessStore): Record<string, string> {
  const legacy = ctx.boards.legacyExecProfiles(ctx.boardId);
  if (!legacy.length) return {};
  const agents = store.agents();
  const names: Record<string, string> = {};
  let defaultName = '';
  for (const p of legacy) {
    const name = toItemName(p.name) || p.id;
    names[p.id] = name;
    const found = agents.find((a) => a.name === name);
    if (!found) {
      const subagent = p.agent ? agents.find((a) => a.name === p.agent) : undefined;
      try {
        store.createAgent(
          {
            name,
            description: p.purpose || p.name,
            body: subagent?.body || `Agente "${p.name}" do board.`,
            model: p.model,
            tools: p.tools,
            deniedTools: p.deniedTools,
            skills: p.skills,
            mcp: p.mcpServers ?? [],
          },
          'user',
        );
      } catch {
        // sem pasta de usuário ou ferramenta sem agentes: os perfis ficam no banco até a próxima abertura
        return {};
      }
    }
    if (p.isDefault) defaultName = name;
  }
  const location = (name: string) => store.agents().find((a) => a.name === name)?.location;
  ctx.boards.setSelection(
    ctx.boardId,
    Object.values(names)
      .map((n) => location(n))
      .filter((l): l is string => !!l)
      .map((l) => ({ kind: 'agent' as const, location: l })),
    'contextual',
  );
  if (defaultName) ctx.boards.updateBoard(ctx.boardId, { runner: { defaultAgent: defaultName } });
  ctx.boards.finishExecProfilesMigration(ctx.boardId, names);
  return names;
}
