import { seedBoard, syncStore, type SeededBoard } from './setup';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { FieldsSection } from '../../src/webview/components/card/FieldsSection';
import { useBoardStore } from '../../src/webview/store/boardStore';
import { modelValue } from '../../src/shared/models';

let board: SeededBoard;
beforeAll(async () => {
  board = await seedBoard();
});
beforeEach(() => syncStore(board.router));

const state = () => useBoardStore.getState().state!;
const story = () => state().cards.find((c) => c.id === board.storyId)!;
const modelField = () => state().fieldDefs.find((f) => f.kind === 'model')!;
const show = () =>
  render(
    <Theme>
      <FieldsSection card={story()} />
    </Theme>,
  );

describe('campo Modelo do card: o modelo sem execução bem-sucedida', () => {
  const at = new Date(2026, 9, 20, 15, 7).getTime();
  const pick = (id: string) => {
    board.router.handle({ type: 'field.setValue', cardId: board.storyId, fieldId: modelField().id, value: modelValue(id, null) });
    syncStore(board.router);
  };
  const mark = (id: string, runs = 1) =>
    useBoardStore.setState({
      state: {
        ...state(),
        board: { ...state().board, modelFailures: { [id]: { at, outcome: 'timeout', failureClass: null, exitCode: null, runs } } },
      },
    });

  it('escolhido um modelo marcado, avisa a causa, a data e o caminho, e o seletor segue com a escolha', () => {
    const [first, second] = state().board.modelCatalog;
    pick(first!.id);
    mark(first!.id);
    show();
    const note = screen.getByRole('note');
    expect(note).toHaveTextContent('Este modelo não roda no board: a última execução estourou o tempo limite em ');
    expect(note).toHaveTextContent('Veja Configurações › Conectar agentes › Modelos.');
    expect(screen.getByRole('combobox', { name: 'Modelo' })).not.toHaveTextContent('—');
    // outro modelo marcado não gera aviso neste card
    expect(screen.getAllByRole('note')).toHaveLength(1);
    expect(second).toBeDefined();
  });

  it('com várias falhas, diz quantas; sem marca ou com outro modelo escolhido, não há aviso', () => {
    const [first, second] = state().board.modelCatalog;
    pick(first!.id);
    mark(first!.id, 3);
    const { unmount } = show();
    expect(screen.getByRole('note')).toHaveTextContent(
      'as últimas 3 execuções terminaram sem resultado; a última estourou o tempo limite em',
    );
    unmount();
    pick(second!.id);
    mark(first!.id, 3);
    show();
    expect(screen.queryByRole('note')).toBeNull();
  });
});
