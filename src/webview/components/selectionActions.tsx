import type { BoardState, Card, Column, Id } from '../../shared/model';
import { activityKindOf, runningByKind } from '../../shared/activity';
import { limitOf } from '../../shared/runner';
import { isCardCollapsed, isAiWorking, aiWorkingChildren } from '../../shared/selectors';
import { t } from '../i18n';
import { ai, cards } from '../commands';
import { useBoardStore } from '../store/boardStore';
import { requestArchiveMany, requestConcludeMany, requestMoveMany, requestTrashMany, withBulkStatus } from '../store/actions';
import { canSetBulkStatus } from '../../shared/status';
import { aiBlockedReason } from './RequirementsBanner';
import { confirmYoloOn, yoloStopChoices, yoloWarning } from './card/YoloBar';
import type { MenuItem } from './Menu';

/**
 * Fonte única das ações contextuais sobre os cards selecionados (barra de seleção e menu da coluna
 * usam os mesmos descritores). Cada ação fica sempre visível: quando nenhum card elegível a aceita,
 * aparece desabilitada; com seleção mista, roda só no subconjunto elegível.
 */
export interface SelectionAction {
  id: 'approve' | 'block' | 'unblock' | 'run' | 'refine' | 'stop' | 'yolo' | 'collapse' | 'archive' | 'move' | 'conclude' | 'trash';
  /** grupos separam as ações no menu da coluna (quebra de linha entre grupos) */
  group: number;
  label: string;
  danger?: boolean;
  /** os cards selecionados que a ação atingiria agora */
  eligible: Card[];
  disabled: boolean;
  run(): void;
}

export interface SelectionContext {
  state: BoardState;
  /** seleção viva e visível (a barra passa a seleção do board; o menu, só os desta coluna) */
  selected: Card[];
  collapsed: Record<string, boolean>;
  /** colunas candidatas a destino de "mover"/"concluir" (as irmãs, no menu da coluna; as do workflow, na barra) */
  destinations: Column[];
  /** marca o estado otimista do botão de modo autônomo da barra (o menu não usa) */
  onYoloMark?: (enabled: boolean) => void;
}

/** Frase de aviso quando a ação atinge só parte da seleção; '' quando atinge tudo. */
const partialNote = (n: number, ofTotal: number): string =>
  ofTotal > n ? ' ' + t('Atinge {m} de {n} selecionados.', { m: n, n: ofTotal }) : '';

/** Confirmação de aprovar em lote: cada aprovado segue para a próxima coluna pelo fluxo do host. */
function requestApproveMany(eligible: Card[], ofTotal: number): void {
  const { ask } = useBoardStore.getState();
  ask({
    title: t('Aprovar {n} card(s)?', { n: eligible.length }),
    message: t('Cada card aprovado segue para a próxima coluna.') + partialNote(eligible.length, ofTotal),
    confirmLabel: t('Aprovar'),
    onConfirm: () =>
      void withBulkStatus(t('Aprovando {n} card(s)…', { n: eligible.length }), () =>
        cards.setStatusMany(
          eligible.map((c) => c.id),
          'approved',
        ),
      ),
  });
}

/** Bloqueio em lote pede o motivo uma única vez; o texto vai para a conversa de cada card bloqueado. */
function requestBlockMany(eligible: Card[], ofTotal: number): void {
  const { ask } = useBoardStore.getState();
  ask({
    title: t('Bloquear {n} card(s)?', { n: eligible.length }),
    message: t('O motivo vai para a conversa de cada card bloqueado.') + partialNote(eligible.length, ofTotal),
    confirmLabel: t('Bloquear'),
    danger: true,
    text: { label: t('Motivo'), placeholder: t('O que está impedindo o trabalho?'), required: true },
    onConfirm: (_choice, _checkbox, note) =>
      void withBulkStatus(t('Bloqueando {n} card(s)…', { n: eligible.length }), () =>
        cards.setStatusMany(
          eligible.map((c) => c.id),
          'blocked',
          note,
        ),
      ),
  });
}

/** Liga ou desliga o modo autônomo do lote (mesmo fluxo da barra antiga: desligar confirma; ligar tem o "Até onde"). */
function runYolo(ctx: SelectionContext, eligible: Card[]): void {
  const { state, selected } = ctx;
  const { ask, dontWarnYolo, setDontWarnYolo, yoloUntilName, setYoloUntilName } = useBoardStore.getState();
  const apply = (enabled: boolean, until: Id | null = null) => {
    ctx.onYoloMark?.(enabled);
    void withBulkStatus(t('Aplicando…'), () =>
      cards.setYoloMany(
        selected.map((c) => c.id),
        enabled,
        until,
      ),
    );
  };
  const allYolo = selected.every((c) => c.yolo);
  const n = selected.length;
  // desligar em lote sempre pede confirmação (maior impacto): fica fora do "não avisar novamente"
  if (allYolo) {
    ask({
      title: t('Desligar o modo autônomo em {n} história(s)?', { n }),
      message: yoloWarning(),
      confirmLabel: t('Desligar modo autônomo'),
      danger: true,
      onConfirm: () => apply(false),
    });
    return;
  }
  confirmYoloOn({
    ask,
    dontWarnYolo,
    setDontWarnYolo,
    stops: yoloStopChoices(state, eligible),
    untilName: yoloUntilName,
    setUntilName: setYoloUntilName,
    title: t('Ligar o modo autônomo em {n} história(s)?', { n }),
    confirmLabel: t('Ligar modo autônomo'),
    onEnable: (until) => apply(true, until),
  });
}

function runAiMany(selected: Card[], send: (id: Id) => Promise<void>): void {
  void withBulkStatus(t('Aplicando…'), async () => {
    await Promise.allSettled(selected.map((c) => send(c.id)));
  });
}

export function selectionActions(ctx: SelectionContext): SelectionAction[] {
  const { state, selected, collapsed, destinations } = ctx;
  const ids = selected.map((c) => c.id);
  const n = selected.length;
  const noneSelected = n === 0;

  const running = new Set(state.aiRuns);
  const counts = runningByKind(state, state.aiRuns);
  const runner = state.board.runner;
  const workspaceMode = state.board.git.mode;
  const blockedByAi = aiBlockedReason(state);

  const toApprove = selected.filter((c) => canSetBulkStatus(c.status, 'approved'));
  const toBlock = selected.filter((c) => canSetBulkStatus(c.status, 'blocked'));
  const toUnblock = selected.filter((c) => canSetBulkStatus(c.status, 'ready'));
  const toStop = selected.filter((c) => running.has(c.id));

  // as de execução respeitam a capacidade restante por tipo de atividade: o lote nunca ultrapassa o
  // limite seguro de execuções de texto ou de branch; o que não cabe fica de fora
  const idle = selected.filter((c) => !isAiWorking(state, c) && !aiWorkingChildren(state, c));
  const runCounts = { ...counts };
  const toRun: Card[] = [];
  for (const card of idle) {
    const kind = activityKindOf(state, card, 'phase');
    if (runCounts[kind] < limitOf(runner, workspaceMode, kind)) {
      toRun.push(card);
      runCounts[kind]++;
    }
  }
  const refineCounts = { ...counts };
  const toRefine: Card[] = [];
  for (const card of idle) {
    if (refineCounts.text < limitOf(runner, workspaceMode, 'text')) {
      toRefine.push(card);
      refineCounts.text++;
    }
  }

  const allYolo = !noneSelected && selected.every((c) => c.yolo);
  const allCollapsed = !noneSelected && selected.every((c) => isCardCollapsed(collapsed, c.id));
  const doneColumn = destinations.find((c) => c.category === 'done');

  return [
    {
      id: 'approve',
      group: 1,
      label: t('Aprovar'),
      eligible: toApprove,
      disabled: noneSelected || !toApprove.length,
      run: () => requestApproveMany(toApprove, n),
    },
    {
      id: 'block',
      group: 1,
      label: t('Bloquear'),
      eligible: toBlock,
      disabled: noneSelected || !toBlock.length,
      run: () => requestBlockMany(toBlock, n),
    },
    {
      id: 'unblock',
      group: 1,
      label: t('Desbloquear'),
      eligible: toUnblock,
      disabled: noneSelected || !toUnblock.length,
      run: () =>
        void withBulkStatus(t('Desbloqueando {n} card(s)…', { n: toUnblock.length }), () =>
          cards.setStatusMany(
            toUnblock.map((c) => c.id),
            'ready',
          ),
        ),
    },
    {
      id: 'run',
      group: 2,
      label: t('Trabalhar na fase'),
      eligible: toRun,
      disabled: !!blockedByAi || !toRun.length,
      run: () => runAiMany(toRun, (id) => ai.run(id)),
    },
    {
      id: 'refine',
      group: 2,
      label: t('Refinar com IA'),
      eligible: toRefine,
      disabled: !!blockedByAi || !toRefine.length,
      run: () => runAiMany(toRefine, (id) => ai.refine(id)),
    },
    {
      id: 'stop',
      group: 2,
      label: t('Parar a IA'),
      eligible: toStop,
      disabled: noneSelected || !toStop.length,
      run: () => runAiMany(toStop, (id) => ai.stop(id)),
    },
    {
      id: 'yolo',
      group: 3,
      label: allYolo ? t('Desligar modo autônomo') : t('Ligar modo autônomo'),
      danger: !allYolo,
      eligible: allYolo ? selected : selected.filter((c) => !c.yolo),
      disabled: noneSelected,
      run: () => runYolo(ctx, allYolo ? selected : selected.filter((c) => !c.yolo)),
    },
    {
      id: 'collapse',
      group: 3,
      label: allCollapsed ? t('Expandir selecionados') : t('Colapsar selecionados'),
      eligible: selected,
      disabled: noneSelected,
      run: () => useBoardStore.getState().setManyCollapsed(ids, !allCollapsed),
    },
    {
      id: 'archive',
      group: 4,
      label: t('Arquivar selecionados'),
      eligible: selected,
      disabled: noneSelected,
      run: () => requestArchiveMany(selected, useBoardStore.getState().clearSelected),
    },
    {
      id: 'move',
      group: 4,
      label: t('Mover selecionados para...'),
      eligible: selected,
      disabled: noneSelected || !destinations.length,
      run: () => requestMoveMany(selected, destinations, useBoardStore.getState().clearSelected),
    },
    {
      id: 'conclude',
      group: 4,
      label: t('Concluir selecionados'),
      eligible: selected,
      disabled: noneSelected || !doneColumn,
      run: () => doneColumn && requestConcludeMany(selected, doneColumn, useBoardStore.getState().clearSelected),
    },
    {
      id: 'trash',
      group: 5,
      label: t('Mandar selecionados para a lixeira'),
      danger: true,
      eligible: selected,
      disabled: noneSelected,
      run: () => requestTrashMany(selected, useBoardStore.getState().clearSelected),
    },
  ];
}

/** Converte os descritores em itens do menu da coluna, com separadores entre os grupos. */
export function selectionMenuItems(actions: SelectionAction[], busy = false): MenuItem[] {
  const items: MenuItem[] = [];
  let lastGroup = 0;
  for (const a of actions) {
    if (lastGroup && a.group !== lastGroup) items.push('sep');
    lastGroup = a.group;
    items.push({
      label: a.label,
      danger: a.danger,
      disabled: a.disabled || busy,
      onClick: a.run,
    });
  }
  return items;
}
