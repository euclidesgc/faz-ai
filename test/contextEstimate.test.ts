import { describe, expect, it } from 'vitest';
import {
  CLAUDE_MCP_INSTRUCTIONS_LIMIT,
  estimateContext,
  tokensOf,
  type ContextEstimate,
  type McpFootprint,
} from '../src/shared/contextEstimate';
import type { ExecProfile } from '../src/shared/execution';
import { EMPTY_HARNESS, type HarnessItem } from '../src/shared/harness';
import type { BoardState, FieldDef } from '../src/shared/model';
import type { ModelOption } from '../src/shared/models';
import { boardState, card, column, sub } from './fakes/board';

const FOOTPRINT: McpFootprint = { server: 'faz-ai', tools: 73, names: 2000, instructions: 4316, definitions: 48_000 };

const item = (
  kind: HarnessItem['kind'],
  name: string,
  location: string,
  size: number,
  scope: HarnessItem['scope'] = 'project',
): HarnessItem => ({
  kind,
  scope,
  name,
  description: '',
  path: `/p/${location}`,
  location,
  layout: kind === 'skill' ? 'skills' : 'file',
  size,
});

const profile = (id: string, over: Partial<ExecProfile> = {}): ExecProfile => ({
  id,
  name: id,
  purpose: '',
  instructions: '',
  skills: [],
  mcpServers: [],
  tools: [],
  deniedTools: [],
  model: '',
  isDefault: false,
  scope: 'user',
  path: `/home/.claude/agents/${id}.md`,
  ...over,
});

const multiselect = (id: string, name: string): FieldDef => ({
  id,
  boardId: 'b',
  name,
  kind: 'multiselect',
  options: [],
  appliesToTypes: null,
  display: 'badge',
  position: 0,
});

const OPUS: ModelOption = { id: 'claude:opus', tool: 'claude', model: 'opus', label: 'Opus 5.5', efforts: ['high'], defaultEffort: 'high' };

/** Board com o servidor medido, uma rule e uma skill em todo contexto, e outra rule e outra skill para o card indicar. */
function stateWith(over: Partial<BoardState> = {}): BoardState {
  const base = boardState();
  return boardState({
    boardServer: FOOTPRINT,
    harness: {
      ...EMPTY_HARNESS,
      inventory: [
        {
          tool: 'claude',
          installed: true,
          items: [
            item('instructions', 'CLAUDE.md', 'CLAUDE.md', 4000),
            item('instructions', 'api.md', '.claude/rules/api.md', 800),
            item('skill', 'fluxo', '.claude/skills/fluxo/SKILL.md', 2000),
            item('skill', 'testes', '~/.claude/skills/testes/SKILL.md', 1200, 'user'),
            item('skill', 'testes', '.claude/skills/testes/SKILL.md', 400),
          ],
        },
      ],
    },
    harnessSelection: [
      { kind: 'instructions', location: 'CLAUDE.md', usage: 'always' },
      { kind: 'instructions', location: '.claude/rules/api.md', usage: 'contextual' },
      { kind: 'skill', location: '.claude/skills/fluxo/SKILL.md', usage: 'always' },
      { kind: 'skill', location: '.claude/skills/testes/SKILL.md', usage: 'contextual' },
    ],
    fieldDefs: [multiselect('f-rules', 'Rules'), multiselect('f-skills', 'Skills'), { ...multiselect('f-model', 'Modelo'), kind: 'model' }],
    board: { ...base.board, modelCatalog: [OPUS] },
    ...over,
  });
}

const group = (e: ContextEstimate, id: string) => e.groups.find((g) => g.id === id);
const names = (e: ContextEstimate, id: string) => group(e, id)?.entries.map((x) => x.name ?? x.kind);

describe('contexto estimado de um card', () => {
  it('Claude Code: do servidor do board entram os nomes e as instruções (cortadas); as definições ficam sob demanda, fora do total', () => {
    const story = card('h1', { title: 'Tela', description: '' });
    const e = estimateContext(stateWith({ cards: [story] }), story);
    const mcp = group(e, 'mcp')!;
    expect(mcp.entries.map((x) => [x.kind, x.tokens, x.onDemand ?? false])).toEqual([
      ['mcp-names', tokensOf(2000), false],
      ['mcp-instructions', tokensOf(CLAUDE_MCP_INSTRUCTIONS_LIMIT), false],
      ['mcp-definitions', tokensOf(48_000), true],
    ]);
    expect(mcp.tokens).toBe(tokensOf(2000) + tokensOf(CLAUDE_MCP_INSTRUCTIONS_LIMIT));
    expect(e.onDemand).toBe(tokensOf(48_000));
    expect(e.total).toBe(e.groups.reduce((n, g) => n + g.tokens, 0));
  });

  it('Cursor: conta as definições inteiras e as instruções sem corte, a estimativa mais alta', () => {
    const story = card('h1');
    const s = stateWith({ cards: [story] });
    const e = estimateContext({ ...s, board: { ...s.board, aiTool: 'cursor' } }, story);
    expect(group(e, 'mcp')!.tokens).toBe(tokensOf(4316) + tokensOf(48_000));
    expect(e.onDemand).toBe(0);
  });

  it('sem a medida do host, o servidor do board aparece como não medido', () => {
    const story = card('h1');
    const e = estimateContext(stateWith({ cards: [story], boardServer: null }), story);
    expect(group(e, 'mcp')!.entries).toEqual([{ kind: 'mcp-server', name: 'faz-ai', tokens: null }]);
    expect(e.unmeasured).toBe(1);
  });

  it('rules e skills do contexto fixo sempre entram; as indicadas no card somam, sem repetir, e a skill do projeto vale mais que a global', () => {
    const story = card('h1');
    const s = stateWith({
      cards: [story],
      fieldValues: [
        { cardId: 'h1', fieldId: 'f-rules', value: ['.claude/rules/api.md', 'CLAUDE.md'] },
        { cardId: 'h1', fieldId: 'f-skills', value: ['testes', 'fluxo'] },
      ],
    });
    const e = estimateContext(s, story);
    expect(group(e, 'rules')!.entries.map((x) => [x.name, x.tokens])).toEqual([
      ['CLAUDE.md', tokensOf(4000)],
      ['.claude/rules/api.md', tokensOf(800)],
    ]);
    expect(group(e, 'skills')!.entries.map((x) => [x.name, x.tokens])).toEqual([
      ['fluxo', tokensOf(2000)],
      ['testes', tokensOf(400)],
    ]);
  });

  it('o card sem nada marcado não tem grupo de rules nem de skills além do contexto fixo; o que sumiu do disco fica sem medida', () => {
    const story = card('h1');
    const s = stateWith({
      cards: [story],
      harnessSelection: [],
      fieldValues: [{ cardId: 'h1', fieldId: 'f-skills', value: ['apagada'] }],
    });
    const e = estimateContext(s, story);
    expect(group(e, 'rules')).toBeUndefined();
    expect(group(e, 'skills')!.entries).toEqual([{ kind: 'skill', name: 'apagada', tokens: null }]);
    expect(e.unmeasured).toBe(1);
  });

  it('o agente entra com as instruções; numa história no Claude Code, os outros agentes entram como subagentes, só com nome e descrição', () => {
    const story = card('h1');
    const child = sub('s1', 'h1', 'todo');
    const base = stateWith({ cards: [story, child] });
    const s: BoardState = {
      ...base,
      board: {
        ...base.board,
        execProfiles: [
          profile('condutor', { isDefault: true, instructions: 'x'.repeat(400), purpose: 'Conduz', mcpServers: ['playwright'] }),
          profile('backend', { purpose: 'Faz o backend', instructions: 'y'.repeat(9000) }),
        ],
      },
    };
    const e = estimateContext(s, story);
    expect(group(e, 'agents')!.entries).toEqual([
      { kind: 'agent', name: 'condutor', tokens: tokensOf(400 + 'Conduz'.length) },
      { kind: 'subagent', name: 'backend', tokens: tokensOf('backend'.length + 'Faz o backend'.length) },
    ]);
    // o servidor que o agente libera aparece, sem medida
    expect(group(e, 'mcp')!.entries.at(-1)).toEqual({ kind: 'mcp-allowed', name: 'playwright', tokens: null });
    // a sub-tarefa roda com o agente dela, sem subagentes
    expect(names(estimateContext(s, child), 'agents')).toEqual(['condutor']);
  });

  it('o card: título e descrição, checklist, conversa, instruções da fase e os documentos da história', () => {
    const phase = { ...column('doing', 'wp', 1), aiActive: true, aiInstruction: 'Escreva o PRD.', artifactTemplate: '# PRD' };
    const story = card('h1', { columnId: 'doing', title: 'Tela', description: 'Uma tela nova' });
    const child = sub('s1', 'h1', 'todo');
    const base = stateWith({ cards: [story, child] });
    const s: BoardState = {
      ...base,
      columns: base.columns.map((c) => (c.id === 'doing' ? phase : c)),
      checklistItems: [{ id: 'i1', cardId: 'h1', text: 'Validar', done: false, position: 0 }],
      comments: [{ id: 'm1', cardId: 'h1', author: 'a', source: 'human', body: 'Ajuste o título', createdAt: 0, updatedAt: 0 }],
      attachments: [
        { id: 'a1', cardId: 'h1', filename: 'PRD.md', storedName: 'a1', mime: 'text/markdown', size: 6000, createdAt: 0, artifact: true },
        { id: 'a2', cardId: 'h1', filename: 'print.png', storedName: 'a2', mime: 'image/png', size: 90_000, createdAt: 0, artifact: false },
      ],
    };
    const e = estimateContext(s, story);
    expect(e.phase).toBe('doing');
    expect(group(e, 'card')!.entries).toEqual([
      { kind: 'card-text', tokens: tokensOf('Tela'.length + 'Uma tela nova'.length) },
      { kind: 'card-checklist', count: 1, tokens: tokensOf('Validar'.length) },
      { kind: 'card-comments', count: 1, tokens: tokensOf('Ajuste o título'.length) },
      { kind: 'card-phase', tokens: tokensOf('Escreva o PRD.'.length + '# PRD'.length) },
      { kind: 'card-documents', count: 1, tokens: tokensOf(6000) },
    ]);
    // a sub-tarefa lê os documentos da história
    expect(group(estimateContext(s, child), 'card')!.entries.at(-1)).toEqual({ kind: 'card-documents', count: 1, tokens: tokensOf(6000) });
  });

  it('a janela vem do modelo do card; sem modelo, ou com um modelo de janela desconhecida, não há janela', () => {
    const story = card('h1');
    const withModel = stateWith({ cards: [story], fieldValues: [{ cardId: 'h1', fieldId: 'f-model', value: 'claude:opus@high' }] });
    expect(estimateContext(withModel, story)).toMatchObject({ window: 1_000_000, model: 'Opus 5.5' });
    // no backlog a IA não atua: não há fase
    expect(estimateContext(stateWith({ cards: [story] }), story)).toMatchObject({ window: null, model: null, phase: null });
    const custom: ModelOption = { ...OPUS, id: 'claude:meu-modelo', model: 'meu-modelo', label: 'Meu modelo' };
    const unknown = stateWith({ cards: [story], fieldValues: [{ cardId: 'h1', fieldId: 'f-model', value: 'claude:meu-modelo' }] });
    expect(estimateContext({ ...unknown, board: { ...unknown.board, modelCatalog: [custom] } }, story)).toMatchObject({
      window: null,
      model: 'Meu modelo',
    });
  });
});
