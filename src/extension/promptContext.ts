import { selectedItems, selectedSkillNames, selectedRuleLocations } from '../shared/harnessSelection';
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

/** O que o "Refinar com IA" pode indicar num card: só o que o Harness marcou como "usar quando fizer sentido", e os agentes disponíveis. */
export interface RefineCatalog {
  agents: { name: string; description: string; default: boolean }[];
  rules: { location: string; description: string }[];
  skills: { name: string; description: string }[];
}

export function refineCatalog(s: BoardState): RefineCatalog {
  const items = selectedItems(s, 'skill', 'contextual');
  return {
    agents: s.board.execProfiles
      .filter((p) => p.scope !== 'builtin')
      .map((p) => ({ name: p.id, description: p.purpose, default: p.isDefault })),
    rules: selectedItems(s, 'instructions', 'contextual').map((i) => ({ location: i.location, description: i.description })),
    skills: selectedSkillNames(s, 'contextual').map((name) => ({
      name,
      description: items.find((i) => i.name === name)?.description ?? '',
    })),
  };
}

/** Linhas do pedido de refinar que listam o catálogo; é tudo o que existe para a IA indicar. */
export function catalogLines(catalog: RefineCatalog): string[] {
  const item = (name: string, description: string) => (description ? `${name} (${description})` : name);
  return [
    'Catálogo deste board. Só isto existe para você indicar num card; nada fora da lista:',
    `- Agentes (escolha um com set_card_profile): ${
      catalog.agents.map((a) => item(a.name, `${a.description}${a.default ? '; padrão' : ''}`)).join('; ') || 'nenhum além do agente padrão'
    }.`,
    `- Rules (campo Rules; o valor é o caminho mostrado): ${catalog.rules.map((r) => item(r.location, r.description)).join('; ') || 'nenhuma'}.`,
    `- Skills (campo Skills): ${catalog.skills.map((k) => item(k.name, k.description)).join('; ') || 'nenhuma'}.`,
  ];
}

export { selectedRuleLocations };
