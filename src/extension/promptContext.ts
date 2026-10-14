import { selectedItems, selectedMcpNames, selectedSkillNames, selectedRuleLocations } from '../shared/harnessSelection';
import type { BoardState, Card } from '../shared/model';
import { requiredRules, requiredSkills } from './mcp/format';

/** Um arquivo que a sessão deve ler antes de começar: uma rule ou uma skill, pelo caminho absoluto. */
export interface ContextRef {
  kind: 'rule' | 'skill';
  name: string;
  path: string;
}

const describe = (r: ContextRef) => `${r.kind} ${r.name} (${r.path})`;

/** O contexto fixo do board: rules e skills marcadas como "incluir em todo contexto", pelo caminho. */
export function alwaysRefs(s: BoardState): ContextRef[] {
  return [
    ...selectedItems(s, 'instructions', 'always').map((i): ContextRef => ({ kind: 'rule', name: i.location, path: i.path })),
    ...selectedItems(s, 'skill', 'always').map((i): ContextRef => ({ kind: 'skill', name: i.name, path: i.path })),
  ];
}

/** O que o card exige além do contexto fixo: as rules e as skills indicadas nele e no agente, pelo caminho. */
export function cardRefs(s: BoardState, c: Card): ContextRef[] {
  const always = new Set(alwaysRefs(s).map((r) => r.path));
  return [
    ...requiredRules(s, c).flatMap((r): ContextRef[] =>
      'path' in r && r.path && !always.has(r.path) ? [{ kind: 'rule', name: r.name, path: r.path }] : [],
    ),
    ...requiredSkills(s, c).flatMap((k): ContextRef[] =>
      'path' in k && k.path && !always.has(k.path) ? [{ kind: 'skill', name: k.name, path: k.path }] : [],
    ),
  ];
}

/** As linhas do pedido que mandam ler o contexto fixo e o do card. Vazias quando não há nada marcado. */
export function contextLines(s: BoardState, c?: Card): { always: string[]; card: string[] } {
  const always = alwaysRefs(s);
  const card = c ? cardRefs(s, c) : [];
  return {
    always: always.length ? [`Contexto fixo deste board. Antes de começar, leia e siga: ${always.map(describe).join('; ')}.`] : [],
    card: card.length ? [`Este card exige também: ${card.map(describe).join('; ')}.`] : [],
  };
}

/**
 * O que o "Refinar com IA" e o planejamento podem indicar num card: só os artefatos do board em modo
 * "Pelo card" (nunca o catálogo Global, Projeto ou Importados), e os agentes disponíveis. O que está em
 * modo "Sempre" já vai em toda execução e não precisa ser indicado.
 */
export interface RefineCatalog {
  agents: { name: string; description: string; default: boolean }[];
  rules: { location: string; description: string }[];
  skills: { name: string; description: string }[];
  mcps: { name: string; description: string }[];
  /** o que entra em toda execução deste board, só para a IA saber que já conta com isso */
  always: { kind: 'rule' | 'skill' | 'mcp'; name: string }[];
}

export function refineCatalog(s: BoardState): RefineCatalog {
  const skills = selectedItems(s, 'skill', 'contextual');
  const mcps = selectedItems(s, 'mcp', 'contextual');
  return {
    agents: s.board.execProfiles
      .filter((p) => p.scope !== 'builtin')
      .map((p) => ({ name: p.id, description: p.purpose, default: p.isDefault })),
    rules: selectedItems(s, 'instructions', 'contextual').map((i) => ({ location: i.location, description: i.description })),
    skills: selectedSkillNames(s, 'contextual').map((name) => ({
      name,
      description: skills.find((i) => i.name === name)?.description ?? '',
    })),
    mcps: selectedMcpNames(s, 'contextual').map((name) => ({ name, description: mcps.find((i) => i.name === name)?.description ?? '' })),
    always: [
      ...alwaysRefs(s).map((r) => ({ kind: r.kind, name: r.name })),
      ...selectedMcpNames(s, 'always').map((name) => ({ kind: 'mcp' as const, name })),
    ],
  };
}

/**
 * Linhas do pedido de refinar que listam o catálogo; é tudo o que existe para a IA indicar. Minimalismo:
 * no máximo uma skill por assunto, sempre a mais próxima do objetivo; excesso produz o efeito contrário.
 */
export function catalogLines(catalog: RefineCatalog): string[] {
  const item = (name: string, description: string) => (description ? `${name} (${description})` : name);
  return [
    'Catálogo deste board: só os artefatos que a pessoa enviou ao board em modo "Pelo card". Só isto existe para você indicar num card; nada fora da lista, mesmo que exista no projeto ou na máquina:',
    `- Agentes (escolha um com set_card_profile): ${
      catalog.agents.map((a) => item(a.name, `${a.description}${a.default ? '; padrão' : ''}`)).join('; ') || 'nenhum além do agente padrão'
    }.`,
    `- Rules (campo Rules; o valor é o caminho mostrado): ${catalog.rules.map((r) => item(r.location, r.description)).join('; ') || 'nenhuma'}.`,
    `- Skills (campo Skills): ${catalog.skills.map((k) => item(k.name, k.description)).join('; ') || 'nenhuma'}.`,
    `- Servidores MCP (campo MCPs; o do board vai sempre): ${catalog.mcps.map((m) => item(m.name, m.description)).join('; ') || 'nenhum'}.`,
    ...(catalog.always.length
      ? [`Já entram em toda execução, sem precisar indicar: ${catalog.always.map((a) => `${a.kind} ${a.name}`).join('; ')}.`]
      : []),
    'Indique só o mínimo que a tarefa pede: no máximo uma skill por assunto (a mais próxima do objetivo; pode haver mais de uma se forem de assuntos diferentes, como navegação e acesso a dados), e só os servidores MCP de que a tarefa precisa. Excesso de artefatos piora o resultado.',
  ];
}

export { selectedRuleLocations };
