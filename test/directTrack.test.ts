// O predicado da trilha direta (src/shared/orchestration.ts): estado puro, sem banco.
import { describe, expect, it } from 'vitest';
import { isDirectTrackStory } from '../src/shared/orchestration';
import type { BoardState, Column } from '../src/shared/model';
import { DEFAULT_RULES } from '../src/shared/rules';
import { boardState, card, column, sub } from './fakes/board';

const phase = (id: string, position: number, name: string, artifactName = '', aiActive = true): Column => ({
  ...column(id, 'wp', position),
  name,
  artifactName,
  aiActive,
});

function state(
  over: {
    shortTrack?: boolean;
    effort?: string | null;
    typeId?: string;
    columnId?: string;
    names?: [string, string];
    subPhase?: string | null;
  } = {},
): BoardState {
  const { shortTrack = true, effort = 'Baixo', typeId = 'story', columnId = 'impl', names = ['Implementação', 'Revisão'], subPhase } = over;
  const fieldValues = [
    ...(effort ? [{ cardId: 'h1', fieldId: 'f-effort', value: effort }] : []),
    ...(subPhase ? [{ cardId: 's1', fieldId: 'f-phase', value: subPhase }] : []),
  ];
  return boardState({
    board: { ...boardState().board, rules: { ...DEFAULT_RULES, shortTrack } },
    columns: [
      phase('plan', 0, 'Plan', 'PLAN.md'),
      phase('impl', 1, names[0]),
      phase('review', 2, names[1]),
      { ...column('todo', 'wc', 0), name: 'A fazer' },
    ],
    cardTypes: [
      { id: 'story', boardId: 'b', name: 'História', color: '', defaultWorkflowId: 'wp', defaults: {}, branchKind: 'feature' },
      { id: 'bug', boardId: 'b', name: 'Bug', color: '', defaultWorkflowId: 'wp', defaults: {}, branchKind: 'bugfix' },
      { id: 'sub', boardId: 'b', name: 'Sub-tarefa', color: '', defaultWorkflowId: 'wc', defaults: {}, branchKind: 'feature' },
    ],
    fieldDefs: [
      {
        id: 'f-effort',
        boardId: 'b',
        name: 'Esforço da atividade',
        kind: 'select',
        options: ['Baixo', 'Médio', 'Alto'],
        appliesToTypes: null,
        display: 'badge',
        position: 0,
      },
      {
        id: 'f-phase',
        boardId: 'b',
        name: 'Fase',
        kind: 'select',
        options: [names[0], names[1]],
        appliesToTypes: null,
        display: 'badge',
        position: 1,
      },
    ],
    fieldValues,
    cards: [card('h1', { typeId, columnId }), ...(subPhase !== undefined ? [sub('s1', 'h1', 'todo')] : [])],
  });
}
const direct = (s: BoardState) => isDirectTrackStory(s, s.cards[0]!);

describe('isDirectTrackStory', () => {
  it('verdadeiro com regra ligada, Baixo, Implementação e sem sub-tarefas', () => {
    expect(direct(state())).toBe(true);
  });
  it('verdadeiro com tipo Bug sem esforço', () => {
    expect(direct(state({ typeId: 'bug', effort: null }))).toBe(true);
  });
  it('verdadeiro com Implementação e Revisão renomeadas', () => {
    expect(direct(state({ names: ['Construir', 'Conferir'] }))).toBe(true);
  });
  it('falso com a regra desligada', () => {
    expect(direct(state({ shortTrack: false }))).toBe(false);
  });
  it('falso com esforço Médio', () => {
    expect(direct(state({ effort: 'Médio' }))).toBe(false);
  });
  it('falso para sub-tarefa', () => {
    const s = state({ subPhase: 'Implementação' });
    expect(isDirectTrackStory(s, s.cards[1]!)).toBe(false);
  });
  it('falso com sub-tarefa já criada na fase', () => {
    expect(direct(state({ subPhase: 'Implementação' }))).toBe(false);
  });
  it('falso na Revisão', () => {
    expect(direct(state({ columnId: 'review' }))).toBe(false);
  });
  it('falso no Plan', () => {
    expect(direct(state({ columnId: 'plan' }))).toBe(false);
  });
});
