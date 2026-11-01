// A trilha curta no avanço calculado (src/shared/advance.ts): estado puro, sem banco.
import { describe, expect, it } from 'vitest';
import { isShortTrackStory, isSkippedOnShortTrack, nextColumnFor } from '../src/shared/advance';
import type { BoardState, Column } from '../src/shared/model';
import { DEFAULT_RULES } from '../src/shared/rules';
import { boardState, card, column, sub } from './fakes/board';

const phase = (id: string, position: number, artifactName: string, name = id): Column => ({
  ...column(id, 'wp', position),
  name,
  artifactName,
});

/** Board com as fases de documento e a regra como pedido; `effort` preenche o campo "Esforço da atividade" da história h1. */
function state(
  over: {
    shortTrack?: boolean;
    effort?: string | null;
    typeId?: string;
    columnId?: string;
    prdName?: string;
    withEffortField?: boolean;
  } = {},
): BoardState {
  const { shortTrack = true, effort = null, typeId = 'story', columnId = 'discovery', prdName = 'PRD', withEffortField = true } = over;
  return boardState({
    board: { ...boardState().board, rules: { ...DEFAULT_RULES, shortTrack } },
    columns: [
      phase('discovery', 0, 'DISCOVERY.md', 'Discovery'),
      phase('prd', 1, 'PRD.md', prdName),
      phase('spec', 2, 'SPEC.md', 'Spec'),
      phase('plan', 3, 'PLAN.md', 'Plan'),
      { ...column('cancelled', 'wp', 4, 'cancelled'), name: 'Cancelado' },
      { ...column('impl', 'wp', 5), name: 'Implementação' },
      { ...column('todo', 'wc', 0), name: 'A fazer' },
      // workflow filho com uma coluna de PRD: a sub-tarefa não a pula
      { ...phase('subprd', 1, 'PRD.md', 'PRD da sub'), workflowId: 'wc' },
      { ...column('subdone', 'wc', 2, 'done'), name: 'Concluído' },
    ],
    cardTypes: [
      { id: 'story', boardId: 'b', name: 'História', color: '', defaultWorkflowId: 'wp', defaults: {}, branchKind: 'feature' },
      { id: 'bug', boardId: 'b', name: 'Bug', color: '', defaultWorkflowId: 'wp', defaults: {}, branchKind: 'bugfix' },
      { id: 'sub', boardId: 'b', name: 'Sub-tarefa', color: '', defaultWorkflowId: 'wc', defaults: {}, branchKind: 'feature' },
    ],
    fieldDefs: withEffortField
      ? [
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
        ]
      : [],
    fieldValues: effort ? [{ cardId: 'h1', fieldId: 'f-effort', value: effort }] : [],
    cards: [card('h1', { typeId, columnId }), sub('s1', 'h1', 'todo')],
  });
}
const story = (s: BoardState) => s.cards[0]!;
const next = (s: BoardState) => nextColumnFor(s, story(s))?.name;

describe('nextColumnFor', () => {
  it('com a regra desligada, a próxima coluna é a seguinte, mesmo para um Bug', () => {
    expect(next(state({ shortTrack: false, typeId: 'bug' }))).toBe('PRD');
  });

  it('Bug no Discovery vai direto ao Plan', () => {
    expect(next(state({ typeId: 'bug' }))).toBe('Plan');
  });

  it('história de esforço Baixo vai direto ao Plan', () => {
    expect(next(state({ effort: 'Baixo' }))).toBe('Plan');
  });

  it('história Baixo levada à mão ao PRD pula só a Spec', () => {
    expect(next(state({ effort: 'Baixo', columnId: 'prd' }))).toBe('Plan');
  });

  it('esforço Alto ou Médio segue a trilha completa', () => {
    expect(next(state({ effort: 'Alto' }))).toBe('PRD');
    expect(next(state({ effort: 'Médio' }))).toBe('PRD');
  });

  it('reconhece o PRD pelo documento: a coluna renomeada "Requisitos" com PRD.md é pulada', () => {
    expect(next(state({ typeId: 'bug', prdName: 'Requisitos' }))).toBe('Plan');
  });

  it('documento personalizado não é pulado', () => {
    const s = state({ typeId: 'bug' });
    s.columns.find((c) => c.id === 'prd')!.artifactName = 'REQUISITOS.md';
    expect(next(s)).toBe('PRD');
  });

  it('sem campo de esforço e sem tipo Bug, segue a trilha completa', () => {
    expect(next(state({ withEffortField: false }))).toBe('PRD');
    expect(next(state({}))).toBe('PRD');
  });

  it('sub-tarefa nunca pula, mesmo com a regra ligada', () => {
    const s = state({ typeId: 'bug' });
    const sub1 = s.cards[1]!;
    s.fieldValues.push({ cardId: sub1.id, fieldId: 'f-effort', value: 'Baixo' });
    expect(nextColumnFor(s, sub1)?.name).toBe('PRD da sub');
  });

  it('o esforço alterado entre duas chamadas muda o resultado: a regra lê o estado atual', () => {
    const s = state({ effort: 'Baixo' });
    expect(next(s)).toBe('Plan');
    s.fieldValues[0]!.value = 'Alto';
    expect(next(s)).toBe('PRD');
  });

  it('pula a coluna de cancelamento como hoje e devolve undefined sem coluna seguinte', () => {
    expect(next(state({ columnId: 'plan' }))).toBe('Implementação');
    expect(next(state({ columnId: 'impl' }))).toBeUndefined();
  });
});

describe('isShortTrackStory e isSkippedOnShortTrack', () => {
  it('compara nomes sem diferenciar acento nem caixa', () => {
    const s = state({ effort: 'baixo' });
    s.cardTypes[1]!.name = 'BUG';
    expect(isShortTrackStory(s, story(s))).toBe(true);
    expect(isShortTrackStory(s, { ...story(s), typeId: 'bug' })).toBe(true);
    expect(isSkippedOnShortTrack({ ...column('x', 'wp', 0), artifactName: 'spec.md' })).toBe(true);
    expect(isSkippedOnShortTrack({ ...column('x', 'wp', 0), artifactName: '' })).toBe(false);
  });
});
