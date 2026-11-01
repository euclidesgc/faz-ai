// Configurações › Conectar agentes: o campo "Modelo do revisor" (o modelo que revisa a correção, ou Automático).
import { choose, lastSent, renderThemed, seedBoard, syncStore, type SeededBoard } from './setup';
import { beforeAll, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { ReviewerModelField } from '../../src/webview/components/settings/agentConnect/ReviewerModelField';
import { modelValue } from '../../src/shared/models';
import { modelDisplay } from '../../src/webview/modelText';
import { useBoardStore } from '../../src/webview/store/boardStore';

let board: SeededBoard;
beforeAll(async () => {
  board = await seedBoard();
});

/** Põe o modelo do revisor configurado no estado que a tela lê (o host é quem o grava). */
const withReviewer = (value: string | null) => {
  syncStore(board.router);
  useBoardStore.setState((s) => ({ state: { ...s.state!, board: { ...s.state!.board, reviewerModel: value } } }));
};
const field = () => screen.getByRole('combobox', { name: 'Modelo do revisor' });
const catalog = () => useBoardStore.getState().state!.board.modelCatalog;
const firstValue = () => {
  const o = catalog()[0]!;
  return modelValue(o.id, o.efforts[0] ?? null);
};

describe('Conectar agentes: o modelo do revisor', () => {
  it('sem modelo escolhido, o campo mostra Automático e a dica de quando ele vale', () => {
    withReviewer(null);
    renderThemed(<ReviewerModelField />);
    expect(field()).toHaveTextContent('Automático');
    expect(screen.getByText('Usado quando só há um agente pronto; nunca o nível barato.')).toBeInTheDocument();
  });

  it('escolher um modelo do catálogo grava o valor no host', async () => {
    withReviewer(null);
    renderThemed(<ReviewerModelField />);
    const value = firstValue();
    await choose(field(), modelDisplay(catalog(), value, true));
    expect(lastSent('settings.reviewerModel.set')).toEqual({ type: 'settings.reviewerModel.set', value });
  });

  it('um modelo já escolhido aparece no campo', () => {
    const value = firstValue();
    withReviewer(value);
    renderThemed(<ReviewerModelField />);
    expect(field()).toHaveTextContent(modelDisplay(catalog(), value, true));
  });

  it('voltar a Automático grava null', async () => {
    withReviewer(firstValue());
    renderThemed(<ReviewerModelField />);
    await choose(field(), 'Automático');
    expect(lastSent('settings.reviewerModel.set')).toEqual({ type: 'settings.reviewerModel.set', value: null });
  });

  it('um modelo que saiu do catálogo cai em Automático, em vez de mostrar um valor sem nome', () => {
    withReviewer('claude:modelo-que-nao-existe');
    renderThemed(<ReviewerModelField />);
    expect(field()).toHaveTextContent('Automático');
  });
});
