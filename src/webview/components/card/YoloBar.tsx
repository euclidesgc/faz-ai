import type { Autopilot, BoardState, Card, Column, Id } from '../../../shared/model';
import { cardRef } from '../../../shared/model';
import { norm } from '../../../shared/filters';
import { lastAiColumn, storyOf, yoloStopOf, yoloStopOptions } from '../../../shared/story';
import { useBoardStore, type DialogSpec } from '../../store/boardStore';
import { usePending } from '../../usePending';
import { t } from '../../i18n';
import { ai, cards } from '../../commands';
import { Button, IconYolo, SelectField } from '../ui';

/**
 * O aviso sobre o que o modo autônomo faz, mostrado na confirmação de ligar (aqui, no botão do card e na
 * ação em lote de `SelectionBar`). Função (não constante) porque `t()` precisa ser chamada em tempo de
 * render, para pegar o idioma certo.
 */
export const yoloWarning = (): string =>
  t(
    'A IA toca esta história sozinha, sem aprovação, pergunta ou confirmação, até a fase que você escolher: ali ela faz o trabalho, pede a sua revisão e o modo se desliga. Pare a qualquer hora pelo botão do topo do board.',
  );

/** Uma opção de "Até onde": a coluna e o rótulo que a pessoa lê (a última da IA diz que abre o pull request). */
export interface YoloStop {
  value: Id;
  name: string;
  label: string;
  /** a última coluna da IA no workflow dela: escolher esta é ir até o pull request */
  last: boolean;
}

const stopOf = (state: BoardState, column: Column): YoloStop => {
  const last = column.id === lastAiColumn(state, column.workflowId)?.id;
  return {
    value: column.id,
    name: column.name,
    last,
    label: last ? t('{column} (abre o pull request)', { column: column.name }) : column.name,
  };
};

/**
 * As opções de "Até onde" para ligar o modo em uma ou mais histórias: as colunas em que a IA atua, da
 * coluna atual em diante. Em lote, só as que valem para todas (pelo nome, que é como o host as casa
 * entre workflows), com as colunas do workflow da primeira história.
 */
export function yoloStopChoices(state: BoardState, stories: Card[]): YoloStop[] {
  const [first, ...rest] = stories;
  if (!first) return [];
  return yoloStopOptions(state, first)
    .filter((c) => rest.every((s) => yoloStopOptions(state, s).some((o) => norm(o.name) === norm(c.name))))
    .map((c) => stopOf(state, c));
}

/** A opção que começa escolhida: a última que a pessoa usou, quando ainda vale; senão, a do fim (o pull request). */
const initialStop = (stops: YoloStop[], remembered: string): YoloStop | undefined =>
  (remembered ? stops.find((s) => norm(s.name) === norm(remembered)) : undefined) ?? stops.at(-1);

/**
 * Confirmação de ligar o modo autônomo, compartilhada por `YoloBar`, `CardFooter` e `SelectionBar`. O aviso
 * traz o seletor "Até onde" (`stops`), que começa na última escolha da pessoa; ligar passa a coluna
 * escolhida (`onEnable`). Com "não avisar novamente" marcado (`dontWarnYolo`), liga direto até a última escolha.
 */
export function confirmYoloOn(opts: {
  ask(dialog: DialogSpec | null): void;
  dontWarnYolo: boolean;
  setDontWarnYolo(value: boolean): void;
  stops: YoloStop[];
  untilName: string;
  setUntilName(name: string): void;
  title: string;
  confirmLabel?: string;
  onEnable(until: Id | null): void;
}): void {
  const initial = initialStop(opts.stops, opts.untilName);
  const enable = (value: string | undefined) => {
    const stop = opts.stops.find((s) => s.value === value);
    // o fim (o pull request) fica guardado como "sem escolha", para valer em qualquer board
    if (stop) opts.setUntilName(stop.last ? '' : stop.name);
    // a coluna vai sempre pelo id: o host sabe qual é a última da IA de cada história (em lote, a última
    // opção comum pode não ser a última de nenhuma delas)
    opts.onEnable(stop && !stop.last ? stop.value : null);
  };
  if (opts.dontWarnYolo) return enable(initial?.value);
  opts.ask({
    title: opts.title,
    message: yoloWarning(),
    confirmLabel: opts.confirmLabel ?? t('Ligar o modo autônomo'),
    danger: true,
    ...(opts.stops.length
      ? { choices: { label: t('Até onde'), options: opts.stops.map(({ value, label }) => ({ value, label })), value: initial?.value } }
      : {}),
    checkbox: { label: t('Não avisar novamente') },
    onConfirm: (choice, checkboxChecked) => {
      if (checkboxChecked) opts.setDontWarnYolo(true);
      enable(choice);
    },
  });
}

/**
 * Liga/desliga o modo autônomo de um card (história): desligar aplica direto; ligar passa por
 * `confirmYoloOn`, com o "Até onde". O valor mostrado reflete o clique na hora e fica travado (`applying`)
 * até o `boardState` confirmar ou o tempo esgotar. Usado por `YoloBar` e por `CardFooter` (o controle fora do detalhe).
 */
export function useYoloToggle(card: Card): { effectiveYolo: boolean; applying: boolean; toggle(enabled: boolean): void } {
  const state = useBoardStore((s) => s.state)!;
  const ask = useBoardStore((s) => s.ask);
  const dontWarnYolo = useBoardStore((s) => s.dontWarnYolo);
  const setDontWarnYolo = useBoardStore((s) => s.setDontWarnYolo);
  const untilName = useBoardStore((s) => s.yoloUntilName);
  const setUntilName = useBoardStore((s) => s.setYoloUntilName);
  const [effectiveYolo, applying, markYolo] = usePending(card.yolo);

  const apply = (enabled: boolean, until: Id | null = null) => {
    markYolo(enabled);
    cards.setYolo(card.id, enabled, until);
  };
  const toggle = (enabled: boolean) => {
    if (applying) return;
    if (!enabled) return apply(false);
    confirmYoloOn({
      ask,
      dontWarnYolo,
      setDontWarnYolo,
      stops: yoloStopChoices(state, [card]),
      untilName,
      setUntilName,
      title: t('Ligar o modo autônomo em {ref}?', { ref: cardRef(card) }),
      onEnable: (until) => apply(true, until),
    });
  };

  return { effectiveYolo, applying, toggle };
}

/**
 * O que a barra diz sobre a fila. A nota do autopiloto é do board inteiro e costuma falar de outra
 * história ("#298 está bloqueado: ..."): aqui só entra inteira quando é sobre este card; sobre outro,
 * fica uma linha curta que aponta para ele (o texto completo está na barra de atividade).
 */
function queueNote(t: (s: string, v?: Record<string, string>) => string, card: Card, autopilot: Autopilot): string {
  const note = autopilot.note?.trim();
  if (note) {
    if (note.startsWith(`${cardRef(card)} `)) return t(note);
    const other = /^#\d+/.exec(note)?.[0];
    if (other) return t('A fila está parada em {ref}: veja a barra de atividade.', { ref: other });
  }
  return autopilot.active ? t('O modo autônomo está tocando a fila.') : t('O modo autônomo está pausado.');
}

/** Modo autônomo (YOLO) da história: liga e desliga e mostra o andamento do autopiloto. A sub-tarefa mostra o da história. */
export function YoloBar({ card }: { card: Card }) {
  const state = useBoardStore((s) => s.state)!;
  const setUntilName = useBoardStore((s) => s.setYoloUntilName);
  const { effectiveYolo, applying, toggle } = useYoloToggle(card);
  if (card.deletedAt !== null || card.archivedAt !== null) return null;
  const story = storyOf(state, card) ?? card;
  const { autopilot } = state;

  if (card.parentId)
    return story.yolo ? (
      <div className="drawer-workspace yolo-bar">
        <span title={t('A IA trabalha nesta sub-tarefa sem pedir aprovação, como na história')}>
          <IconYolo /> {t('Modo autônomo, da história {ref}', { ref: cardRef(story) })}
        </span>
      </div>
    ) : null;

  const warning = yoloWarning();
  const stop = card.yolo ? yoloStopOf(state, card) : undefined;
  // a coluna em que o modo para pode ficar para trás da lista (a história já está nela): entra sempre
  const stops = card.yolo ? yoloStopChoices(state, [card]) : [];
  const options = stop && !stops.some((s) => s.value === stop.id) ? [stopOf(state, stop), ...stops] : stops;

  return (
    <div className="drawer-workspace yolo-bar">
      <label title={warning}>
        <input type="checkbox" checked={effectiveYolo} disabled={applying} onChange={(e) => toggle(e.target.checked)} /> <IconYolo />{' '}
        {card.yolo && stop ? t('Modo autônomo até') : t('Modo autônomo')}
      </label>
      {card.yolo && stop && (
        <SelectField
          size="1"
          aria-label={t('Até onde vai o modo autônomo')}
          title={t('Ao terminar o trabalho desta fase, a IA pede a sua revisão e o modo se desliga')}
          options={options.map(({ value, label }) => ({ value, label }))}
          value={stop.id}
          onChange={(value) => {
            const chosen = options.find((o) => o.value === value);
            setUntilName(chosen && !chosen.last ? chosen.name : '');
            cards.setYolo(card.id, true, value);
          }}
        />
      )}
      {card.yolo && (
        <>
          <span className="muted small">{queueNote(t, card, autopilot)}</span>
          {autopilot.active ? (
            <Button variant="ghost" size="small" onClick={() => ai.pauseAutopilot()}>
              {t('Pausar modo autônomo')}
            </Button>
          ) : (
            <Button variant="ghost" size="small" onClick={() => ai.resumeAutopilot()}>
              {t('Retomar modo autônomo')}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
