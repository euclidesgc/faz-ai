import { describe, expect, it } from 'vitest';
import type { BoardState, Column } from '../src/shared/model';
import { phaseModelBadge } from '../src/shared/phaseModel';

const column = (over: Partial<Column> = {}): Column => ({ id: 'c', workflowId: 'wp', name: 'Plan', phaseModel: null, ...over }) as Column;
const state = (rules: unknown[] = []): BoardState =>
  ({
    board: { modelRules: rules },
    workflows: [
      { id: 'wp', kind: 'parent' },
      { id: 'wc', kind: 'child' },
    ],
    fieldDefs: [{ id: 'esforco', name: 'Esforço da atividade' }],
  }) as unknown as BoardState;
const effortRule = (enabled = true) => ({
  id: 'r',
  enabled,
  groups: [[{ fieldId: 'esforco', op: 'is', value: 'Alto' }]],
  model: 'claude:opus',
});

describe('phaseModelBadge', () => {
  it('a coluna com modelo mostra o modelo', () => {
    expect(phaseModelBadge(state([effortRule()]), column({ phaseModel: 'claude:haiku' }))).toEqual({
      kind: 'model',
      value: 'claude:haiku',
    });
  });

  it('a Revisão do workflow de histórias é do revisor; a do workflow filho não é', () => {
    expect(phaseModelBadge(state(), column({ name: 'Revisão' }))).toEqual({ kind: 'reviewer' });
    expect(phaseModelBadge(state(), column({ name: 'Revisão', workflowId: 'wc' }))).toEqual({ kind: 'none' });
  });

  it('regra ligada com condição no Esforço mostra esforço; desligada não', () => {
    expect(phaseModelBadge(state([effortRule()]), column())).toEqual({ kind: 'effort' });
    expect(phaseModelBadge(state([effortRule(false)]), column())).toEqual({ kind: 'none' });
  });

  it('sem nada em particular, nenhum selo', () => {
    expect(phaseModelBadge(state(), column())).toEqual({ kind: 'none' });
  });
});
