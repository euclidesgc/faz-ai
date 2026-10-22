import { describe, expect, it } from 'vitest';
import { agentContextOf, executionContextOf } from '../src/shared/executionContext';
import { manifestOf, type ExecProfile } from '../src/shared/execution';
import { estimateContext, tokensOf } from '../src/shared/contextEstimate';
import { EMPTY_HARNESS, type HarnessItem } from '../src/shared/harness';
import type { BoardState } from '../src/shared/model';
import { boardState, card, sub } from './fakes/board';

const agent = (id: string, over: Partial<ExecProfile> = {}): ExecProfile => ({
  id,
  name: id,
  purpose: 'Especialista',
  instructions: 'Execute os testes.',
  skills: ['testes'],
  mcpServers: ['github'],
  tools: ['Read'],
  deniedTools: [],
  model: '',
  isDefault: true,
  scope: 'board',
  path: `/board/${id}.md`,
  ...over,
});
const skill: HarnessItem = {
  kind: 'skill',
  name: 'testes',
  scope: 'project',
  path: '/board/testes/SKILL.md',
  location: 'board:testes',
  description: '',
  layout: 'skills',
  size: 400,
  boardArtifactId: 'skill-1',
};
const rule: HarnessItem = {
  kind: 'instructions',
  name: 'geral',
  scope: 'project',
  path: '/board/geral.md',
  location: 'board:geral',
  description: '',
  layout: 'file',
  size: 800,
  boardArtifactId: 'rule-1',
};
const mcp: HarnessItem = {
  kind: 'mcp',
  name: 'github',
  scope: 'project',
  path: '',
  location: 'board:github',
  description: '',
  layout: 'entry',
  boardArtifactId: 'mcp-1',
};

function state(): BoardState {
  const s = boardState();
  return {
    ...s,
    board: { ...s.board, aiTool: 'claude', execProfiles: [agent('dev')] },
    cards: [card('h', { execProfile: 'dev' })],
    harness: { ...EMPTY_HARNESS, inventory: [{ tool: 'claude', installed: true, items: [skill, rule, mcp] }] },
    harnessSelection: [
      { kind: 'skill', location: skill.location, usage: 'always' },
      { kind: 'instructions', location: rule.location, usage: 'always' },
      { kind: 'mcp', location: mcp.location, usage: 'always' },
    ],
    fieldDefs: ['Skills', 'Rules', 'MCPs'].map((name, position) => ({
      id: name,
      name,
      boardId: 'b',
      kind: 'multiselect',
      options: [],
      appliesToTypes: null,
      display: 'chip',
      position,
    })),
    fieldValues: [
      { cardId: 'h', fieldId: 'Skills', value: ['testes'] },
      { cardId: 'h', fieldId: 'Rules', value: [rule.location] },
      { cardId: 'h', fieldId: 'MCPs', value: ['github'] },
    ],
  };
}

describe('prévia do contexto efetivo', () => {
  it('reutiliza o manifesto, mantém todas as origens e contabiliza cada identidade uma vez', () => {
    const s = state();
    const c = s.cards[0]!;
    const before = JSON.stringify(s);
    const p = executionContextOf(s, c);
    const m = manifestOf(s, c);
    expect(p.estimate).toEqual(estimateContext(s, c));
    expect(p.items.filter((i) => i.kind === 'skill')).toEqual([
      { id: 'skill:skill-1', kind: 'skill', name: 'testes', location: skill.location, origins: ['always', 'agent', 'card'], tokens: 100 },
    ]);
    expect(p.items.find((i) => i.kind === 'rule')).toMatchObject({ id: 'rule:rule-1', origins: ['always', 'card'], tokens: 200 });
    expect(p.items.find((i) => i.name === 'github')).toMatchObject({ origins: ['agent', 'card', 'always'], tokens: null });
    expect(p.items.filter((i) => i.kind === 'mcp').map((i) => i.name)).toEqual(['faz-ai', ...m.mcpServers]);
    expect(p.items.filter((i) => i.kind === 'skill').map((i) => i.name)).toEqual(m.skills);
    expect(p.items.find((i) => i.kind === 'agent')).toMatchObject({ origins: ['card'] });
    expect(p.estimate.groups.find((g) => g.id === 'skills')?.tokens).toBe(100);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('acompanha a herança legada da fase, história e padrão, mesmo com escolhas ausentes', () => {
    const s = state();
    const story = card('h', { execProfile: 'dev' });
    const task = sub('t', 'h', 'todo');
    s.cards = [story, task];
    expect(executionContextOf(s, task).items[0]?.origins).toEqual(['story']);
    story.execProfile = null;
    story.columnId = s.columns[0]!.id;
    s.columns[0]!.execProfile = 'dev';
    expect(executionContextOf(s, task).items[0]?.origins).toEqual(['story-phase']);
    task.columnId = story.columnId;
    task.execProfile = 'removido';
    expect(executionContextOf(s, task).items[0]?.origins).toEqual(['phase']);
    s.columns[0]!.execProfile = null;
    expect(executionContextOf(s, task).items[0]?.origins).toEqual(['default']);
  });

  it('identidade estável une aliases da mesma cópia e não depende do nome ou caminho de materialização', () => {
    const s = state();
    const alias = { ...skill, location: 'outra-origem', path: '/outra-pasta/SKILL.md' };
    s.harness.inventory[0]!.items.push(alias);
    s.harnessSelection.push({ kind: 'skill', location: alias.location, usage: 'always' });
    const p = executionContextOf(s, s.cards[0]!);
    expect(p.items.filter((i) => i.kind === 'skill')).toHaveLength(1);
    expect(p.estimate.groups.find((g) => g.id === 'skills')?.tokens).toBe(100);
  });

  it('não atribui ao card uma seleção recusada que continua presente por causa do agente', () => {
    const s = state();
    s.harnessSelection = [];
    const p = executionContextOf(s, s.cards[0]!);
    expect(p.items.find((i) => i.kind === 'skill')).toMatchObject({ origins: ['agent'] });
    expect(p.items.find((i) => i.name === 'github')).toMatchObject({ origins: ['agent'] });
    expect(p.items.some((i) => i.kind === 'rule')).toBe(false);
  });

  it('preserva itens do agente sem medida e troca as origens quando o agente muda', () => {
    const s = state();
    s.board.execProfiles.push(agent('outro', { skills: ['ausente'], mcpServers: ['novo'], isDefault: false }));
    const c = { ...s.cards[0]!, execProfile: 'outro' };
    const p = executionContextOf(s, c);
    expect(p.items.find((i) => i.name === 'ausente')).toMatchObject({ tokens: null, origins: ['agent'] });
    expect(p.items.find((i) => i.name === 'testes')).toMatchObject({ origins: ['always', 'card'] });
    expect(p.items.find((i) => i.name === 'github')).toMatchObject({ origins: ['card', 'always'] });
    expect(p.items.find((i) => i.name === 'novo')).toMatchObject({ tokens: null, origins: ['agent'] });
  });

  it('a prévia do rascunho do agente não herda cards, fase, documentos, conversa ou delegados', () => {
    const s = state();
    const p = agentContextOf(s, agent('rascunho', { instructions: 'x'.repeat(800), skills: ['rascunho'] }));
    expect(p.estimate.phase).toBeNull();
    expect(p.estimate.groups.some((g) => g.id === 'card')).toBe(false);
    expect(p.items.some((i) => i.kind === 'subagent')).toBe(false);
    expect(p.items.some((i) => i.origins.includes('card'))).toBe(false);
    expect(p.items.find((i) => i.kind === 'agent')?.tokens).toBe(tokensOf(800 + 'Especialista'.length));
    expect(p.items.find((i) => i.name === 'testes')?.origins).toEqual(['always']);
    expect(p.items.find((i) => i.name === 'rascunho' && i.kind === 'skill')?.tokens).toBeNull();
  });

  it('sinaliza parágrafos repetidos entre os agentes, sem afirmar comparação de rules ou skills', () => {
    const s = state();
    const paragraph = 'Respeite as convenções do projeto e execute as validações necessárias antes de entregar o resultado.';
    s.board.execProfiles = [
      agent('dev', { instructions: paragraph }),
      agent('revisor', { instructions: `${paragraph}\n\nRevise.`, isDefault: false }),
    ];
    // só o agente da execução entra: os outros agentes não são subagentes dela
    expect(executionContextOf(s, s.cards[0]!).overlaps).toEqual([]);
    expect(executionContextOf(s, sub('t', 'h', 'todo')).overlaps).toEqual([]);
    s.board.aiTool = 'cursor';
    const p = executionContextOf(s, s.cards[0]!);
    expect(p.overlaps).toEqual([]);
    expect(p.enforcement.mcp).toBe('enforced');
    expect(p.enforcement.tools).toBe('enforced');
  });
});
