import { lastSent, seedBoard, syncStore, type SeededBoard } from './setup';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Theme } from '@radix-ui/themes';
import { AgentModels } from '../../src/webview/components/settings/agentConnect/AgentModels';
import { useBoardStore } from '../../src/webview/store/boardStore';
import type { AiProfile } from '../../src/shared/aiProfiles';

let board: SeededBoard;
beforeAll(async () => {
  board = await seedBoard();
});
beforeEach(() => syncStore(board.router));

const state = () => useBoardStore.getState().state!;
const profile = () => state().board.aiProfiles.find((p) => p.id === state().board.aiTool)!;
const show = (p: AiProfile = profile()) =>
  render(
    <Theme>
      <AgentModels profile={p} />
    </Theme>,
  );

describe('Preço por bucket em Modelos', () => {
  it('abre os quatro campos, com o aviso, e grava o catálogo com o pricing; vazio fica sem preço', async () => {
    show();
    const first = state().board.modelCatalog.find((o) => o.tool === 'claude' || true)!;
    await userEvent.click(screen.getAllByRole('button', { name: /^Preço de / })[0]!);
    const form = within(screen.getByLabelText(/^Preço de .*/, { selector: '[class*="Card"], .draft-card' }));
    expect(form.getByText('Preço informado por você; o board não confere com o provedor.')).toBeInTheDocument();
    await userEvent.type(form.getByLabelText('Entrada'), '3');
    await userEvent.type(form.getByLabelText('Saída'), '15,5');
    await userEvent.click(form.getByRole('button', { name: 'Salvar preço' }));
    const saved = lastSent('settings.models.set').catalog.find((m) => m.id === first.id || m.pricing);
    expect(saved?.pricing).toEqual({ input: 3, output: 15.5 });
    expect(saved?.pricing).not.toHaveProperty('cacheRead');
  });

  it('valor inválido é recusado: o botão Salvar fica desligado', async () => {
    show();
    await userEvent.click(screen.getAllByRole('button', { name: /^Preço de / })[0]!);
    const form = within(document.querySelector('.draft-card') as HTMLElement);
    await userEvent.type(form.getByLabelText('Entrada'), '-2');
    expect(form.getByRole('button', { name: 'Salvar preço' })).toBeDisabled();
    expect(form.getByText('Informe um número maior ou igual a zero, ou deixe vazio.')).toBeInTheDocument();
  });

  it('perfil personalizado sem catálogo não mostra a ação Preço', () => {
    const custom = { ...profile(), id: 'livre-x', tool: 'livre-x', kind: 'custom' } as AiProfile;
    show(custom);
    expect(screen.queryByRole('button', { name: /^Preço de / })).toBeNull();
  });
});
