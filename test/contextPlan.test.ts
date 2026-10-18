import { describe, expect, it } from 'vitest';
import {
  activityDraft,
  cardContextTargets,
  contextTargetKey,
  emptyActivityContext,
  estimateContextDraft,
  planPreview,
  previewTarget,
  withContextDrafts,
} from '../src/shared/contextPlan';
import { boardState, card, sub } from './fakes/board';

describe('composição do plano de execução', () => {
  it('lista fases abertas ordenadas por ID estável e mantém tarefa com uma seleção por ação', () => {
    const story = card('story');
    const task = sub('task', story.id, 'todo');
    const state = boardState({ cards: [story, task] });
    expect(cardContextTargets(state, story).map((t) => [t.action, t.phaseId])).toEqual([
      ['work', ''],
      ['work', 'backlog'],
      ['work', 'doing'],
      ['refine', ''],
      ['summary', ''],
      ['conflict', ''],
    ]);
    const before = cardContextTargets(state, story).map(contextTargetKey);
    state.columns = state.columns.map((c) => ({ ...c, name: 'Renomeada' }));
    expect(cardContextTargets(state, story).map(contextTargetKey)).toEqual(before);
    expect(cardContextTargets(state, task).map((t) => [t.action, t.phaseId])).toEqual([
      ['work', ''],
      ['refine', ''],
      ['summary', ''],
      ['conflict', ''],
    ]);
  });

  it('mostra herança da fase atual da tarefa sem copiar a seleção do condutor', () => {
    const story = card('story');
    const task = sub('task', story.id, 'todo');
    const state = boardState({ cards: [story, task] });
    const target = cardContextTargets(state, task)[0]!;
    const conductor = activityDraft(state, { ...target, cardId: story.id });
    conductor.selection.expectedResult = 'Só da história';
    const phase = activityDraft(state, { ...target, cardId: null, workflowId: 'wc', phaseId: 'todo' });
    phase.selection.expectedResult = 'Padrão da fase';
    const overlay = withContextDrafts(state, [conductor, phase]);
    expect(previewTarget(state, target).phaseId).toBe('todo');
    expect(planPreview(overlay, target).expectedResult).toBe('Padrão da fase');
    const own = activityDraft(overlay, target);
    own.selection.expectedResult = 'Resultado da tarefa';
    expect(planPreview(overlay, target, [own]).expectedResult).toBe('Resultado da tarefa');
    expect(planPreview(overlay, { ...target, action: 'refine' }).expectedResult).toBe('');
    expect(target.phaseId).toBe('');
  });

  it('sobrepõe rascunhos sem alterar estado salvo ou compartilhar listas mutáveis', () => {
    const state = boardState({ cards: [card('story')] });
    const target = cardContextTargets(state, state.cards[0]!)[0]!;
    const draft = activityDraft(state, target);
    draft.selection.activeMcpIds = { mode: 'explicit', value: [] };
    draft.reason = 'Revisão';
    const overlay = withContextDrafts(state, [draft]);
    overlay.contextPlanning!.activities[0]!.selection.inputAttachmentIds.push('novo');
    expect(state.contextPlanning).toBeUndefined();
    expect(draft.selection.inputAttachmentIds).toEqual([]);
    expect(activityDraft(overlay, target)).toMatchObject({ expectedRevision: 1, reason: 'Revisão' });
    expect(emptyActivityContext().activeMcpIds).toEqual({ mode: 'inherit' });
    expect(overlay.contextPlanning!.runtime).toBe('legacy');
  });

  it('mantém anexos sem medida fora da estimativa conhecida e nunca os conta como zero medido', () => {
    const story = card('story', { description: 'Texto conhecido'.repeat(20) });
    const state = boardState({ cards: [story] });
    const target = cardContextTargets(state, story)[0]!;
    const draft = activityDraft(state, target);
    draft.selection.inputAttachmentIds = ['anexo-sem-medida'];
    const estimate = estimateContextDraft(state, planPreview(state, target, [draft]));
    expect(estimate.knownTokens).toBeGreaterThan(0);
    expect(estimate.unknownIds).toEqual(['anexo-sem-medida']);
  });
});
