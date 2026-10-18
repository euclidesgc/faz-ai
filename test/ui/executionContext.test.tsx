import { beforeEach, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { executionContextOf } from '../../src/shared/executionContext';
import { CONTEXT_ORIGINS, ExecutionContext } from '../../src/webview/components/card/ExecutionContext';
import { EN } from '../../src/webview/i18n/en';
import { boardState, card } from '../fakes/board';
import { posted, renderThemed } from './setup';

beforeEach(() => posted.mockClear());

it('abrir a prévia não chama IA, não inicia execução e explica o desconhecido e os limites do executor', async () => {
  const s = boardState();
  s.board.aiTool = 'cursor';
  const p = executionContextOf(s, card('h'));
  renderThemed(<ExecutionContext preview={p} />);
  await userEvent.click(screen.getByText('Contexto da execução'));
  expect(screen.getByText('Servidor obrigatório do board')).toBeVisible();
  expect(screen.getByText('Tamanho não medido')).toBeVisible();
  expect(screen.getByText(/este executor pode carregar outros servidores/)).toBeVisible();
  expect(screen.getByText(/não garante isolamento por ferramenta/)).toBeVisible();
  expect(screen.getByText(/Consumo futuro: desconhecido/)).toBeVisible();
  expect(posted).not.toHaveBeenCalled();
});

it('traduz todas as origens mostradas na prévia', () => {
  for (const label of Object.values(CONTEXT_ORIGINS)) expect(EN, label).toHaveProperty([label]);
});
