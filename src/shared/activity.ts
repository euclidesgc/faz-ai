import type { BoardState, Card, Column, Id } from './model';
import type { AiRunMode } from './runner';
import { columnOf, columnsOf } from './selectors';
import { storyOf } from './story';

// Classificação da atividade da IA: `text` só produz documento (não mexe em código, dispensa troca de
// branch); `branch` trabalha o código da história e precisa da branch/worktree dela.

export type ActivityKind = 'text' | 'branch';

/** Primeira coluna aberta e aiActive sem artefato: onde a história passa a mexer em código. undefined = não há. */
export function codeColumnOf(s: BoardState, workflowId: Id): Column | undefined {
  return columnsOf(s, workflowId)
    .filter((c) => c.category === 'open' && c.aiActive && c.artifactName === '')
    .sort((a, b) => a.position - b.position)[0];
}

/** A coluna só produz documento: tem artifactName e vem antes de codeColumnOf (ou não há coluna de código). */
export function isTextColumn(s: BoardState, column: Column): boolean {
  if (column.category !== 'open' || !column.aiActive || column.artifactName === '') return false;
  const code = codeColumnOf(s, column.workflowId);
  return !code || column.position < code.position;
}

/** Tipo da atividade de um card para um modo: refine/summarize = text; phase = pela coluna da HISTÓRIA agora. */
export function activityKindOf(s: BoardState, card: Card, mode: AiRunMode = 'phase'): ActivityKind {
  if (mode === 'refine' || mode === 'summarize') return 'text';
  const story = storyOf(s, card);
  const column = story ? columnOf(s, story) : undefined;
  return column && isTextColumn(s, column) ? 'text' : 'branch';
}

/**
 * Tipo de uma execução em curso: usa `aiActivity` (mode + phase congelado no início) quando houver a
 * linha do card; sem ela, cai em `activityKindOf(card, 'phase')`. `phase` é nome de coluna: resolve
 * pela coluna de mesmo nome no workflow da história; nome não encontrado = branch.
 */
export function runningKindOf(s: BoardState, cardId: Id): ActivityKind {
  const card = s.cards.find((c) => c.id === cardId);
  if (!card) return 'branch';
  const run = s.aiActivity.find((a) => a.cardId === cardId);
  if (!run) return activityKindOf(s, card, 'phase');
  if (run.mode !== 'phase') return 'text';
  const story = storyOf(s, card);
  const column = story ? s.columns.find((c) => c.workflowId === story.workflowId && c.name === run.phase) : undefined;
  return column && isTextColumn(s, column) ? 'text' : 'branch';
}

/** Quantas execuções de cada tipo há em `running` (ids do executor). */
export function runningByKind(s: BoardState, running: readonly Id[]): Record<ActivityKind, number> {
  const out: Record<ActivityKind, number> = { text: 0, branch: 0 };
  for (const id of running) out[runningKindOf(s, id)]++;
  return out;
}
