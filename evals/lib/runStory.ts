import { autopilotStep } from '../../src/extension/autopilot';
import type { BoardState, Card } from '../../src/shared/model';
import { columnOf } from '../../src/shared/selectors';
import { lastAiColumn } from '../../src/shared/story';
import type { EvalBoard } from './evalBoard';
import type { ReferenceStory } from './stories';
import type { EvalConfig, StoryRun } from './types';

export type { EvalEnd, StoryRun } from './types';

/** Intervalo da checagem que cobre o caso de nenhum evento chegar. */
const TICK_MS = 2000;
/** Quanto esperar as execuções morrerem depois do `autopilot.stop()` no tempo limite. */
const STOP_WAIT_MS = 30_000;

/**
 * Conduz a história de referência pelo board até o fim:
 * - `delivered`: a história entrou na Homologação (última coluna da IA). O modo autônomo dela é desligado uma
 *   vez, para o autopiloto não começar a Homologação e a execução da Revisão que levou o card até lá terminar
 *   com o consumo medido (parar o autopiloto a mataria antes);
 * - `blocked`: a história ficou com a pessoa (bloqueada ou com pergunta), ou o autopiloto parou sem execução em curso;
 * - `timeout`: o tempo acabou; o autopiloto é parado e as execuções têm até 30 s para morrer.
 */
export async function runStory(
  board: EvalBoard,
  story: ReferenceStory,
  config: EvalConfig,
  opts: { timeoutMs: number },
): Promise<StoryRun> {
  const { router } = board;
  const startedAt = Date.now();
  const cardId = createStory(board, story, config);

  return new Promise<StoryRun>((resolve) => {
    let settled = false;
    let yoloOff = false;
    let stopAt: number | null = null;
    const cleanups: Array<() => void> = [];

    const finish = (end: StoryRun['end'], endNote: string | null): void => {
      if (settled) return;
      settled = true;
      for (const fn of cleanups) fn();
      resolve({ storyId: story.id, end, endNote, startedAt, endedAt: Date.now() });
    };

    /** nenhuma execução em curso é a história nem uma sub-tarefa dela */
    const idle = (s: BoardState): boolean =>
      !board.runner.running.some((id) => {
        const card = s.cards.find((c) => c.id === id);
        return id === cardId || card?.parentId === cardId;
      });

    const check = (): void => {
      if (settled) return;
      const s = router.snapshot();
      const card = s.cards.find((c) => c.id === cardId);
      if (!card) return finish('blocked', 'A história sumiu do board.');

      if (stopAt !== null) {
        if (idle(s) || Date.now() - stopAt >= STOP_WAIT_MS) finish('timeout', `Tempo limite de ${Math.round(opts.timeoutMs / 1000)} s.`);
        return;
      }

      const last = lastAiColumn(s, card.workflowId);
      if (last && columnOf(s, card)?.id === last.id) {
        if (!yoloOff) {
          yoloOff = true;
          router.handle({ type: 'card.yolo.set', cardId, enabled: false });
        }
        if (idle(router.snapshot())) finish('delivered', null);
        return;
      }

      if (card.status === 'blocked' || card.status === 'waiting_answer') return finish('blocked', reasonOf(card));

      if (idle(s)) {
        const step = autopilotStep(s);
        if (step.kind === 'paused') return finish('blocked', step.reason);
        if (step.kind === 'idle') return finish('blocked', 'O autopiloto ficou sem passo e a história não chegou à Homologação.');
      }
    };

    cleanups.push(router.onDidChange(check));
    cleanups.push(board.runner.onDidFinish(check));
    const tick = setInterval(check, TICK_MS);
    cleanups.push(() => clearInterval(tick));
    const deadline = setTimeout(() => {
      if (settled) return;
      stopAt = Date.now();
      board.autopilot.stop();
      check();
    }, opts.timeoutMs);
    cleanups.push(() => clearTimeout(deadline));
    check();
  });
}

function reasonOf(card: Card): string {
  return card.statusReason?.trim() ? card.statusReason.trim() : `A história ficou com a pessoa (${card.status}).`;
}

/** Cria a história na fase inicial, com a descrição e o Modelo, e liga o modo autônomo: o autopiloto assume. */
function createStory(board: EvalBoard, story: ReferenceStory, config: EvalConfig): string {
  const { router } = board;
  const s = router.snapshot();
  const parent = s.workflows.find((w) => w.kind === 'parent');
  const column = parent && s.columns.find((c) => c.workflowId === parent.id && c.name === story.startPhase);
  if (!parent || !column) {
    const names = s.columns.filter((c) => c.workflowId === parent?.id).map((c) => c.name);
    throw new Error(`Fase inicial "${story.startPhase}" não existe no board. Colunas: ${names.join(', ')}.`);
  }
  const type = s.cardTypes.find((t) => t.defaultWorkflowId === parent.id);
  if (!type) throw new Error('O board não tem um tipo de card para histórias.');
  const cardId = router.createCard({ typeId: type.id, columnId: column.id, parentId: null, title: story.title });
  router.handle({ type: 'card.update', cardId, patch: { description: story.description } });
  const modelField = s.fieldDefs.find((f) => f.kind === 'model');
  if (modelField) router.handle({ type: 'field.setValue', cardId, fieldId: modelField.id, value: config.model });
  router.handle({ type: 'card.yolo.set', cardId, enabled: true });
  return cardId;
}
