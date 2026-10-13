import { renderThemed, seedBoard, syncStore, type SeededBoard } from './setup';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CardView } from '../../src/webview/components/Card';
import { ENTRY_LABELS, GROUP_LABELS } from '../../src/webview/components/cardView/ContextGauge';
import { EN } from '../../src/webview/i18n/en';
import { useBoardStore } from '../../src/webview/store/boardStore';
import { setLocale } from '../../src/webview/i18n';
import type { BoardState, Card } from '../../src/shared/model';
import { posted } from './setup';

let board: SeededBoard;
beforeAll(async () => {
  board = await seedBoard();
});
beforeEach(() => syncStore(board.router));
afterEach(() => setLocale('pt-BR'));

const state = () => useBoardStore.getState().state!;
const cardOf = (id: string) => state().cards.find((c) => c.id === id)!;
const patchState = (patch: (s: BoardState) => Partial<BoardState>) => useBoardStore.setState({ state: { ...state(), ...patch(state()) } });
const patchCard = (id: string, patch: Partial<Card>) =>
  patchState((s) => ({ cards: s.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
const show = (id: string) => renderThemed(<CardView card={cardOf(id)} />);
const gauge = () => screen.getByRole('button', { name: /Contexto estimado do card/ });

/** Põe o modelo no card pelo campo Modelo do board padrão. */
function setModel(id: string, value: string) {
  const field = state().fieldDefs.find((f) => f.kind === 'model')!;
  patchState((s) => ({
    fieldValues: [...s.fieldValues.filter((v) => !(v.cardId === id && v.fieldId === field.id)), { cardId: id, fieldId: field.id, value }],
  }));
}

describe('contexto estimado no card do board', () => {
  it('o rodapé tem o anel com o total; com modelo, o nome acessível diz quanto da janela o card ocupa', () => {
    setModel(board.storyId, 'claude:opus@high');
    const { container } = show(board.storyId);
    expect(gauge()).toHaveAccessibleName(/de 1\.000\.000 tokens/);
    expect(container.querySelector('.context-gauge .context-ring-fill')).not.toBeNull();
  });

  it('sem modelo, o anel fica só com o aro e o nome acessível dá só o total', () => {
    setModel(board.storyId, '');
    const { container } = show(board.storyId);
    expect(gauge()).toHaveAccessibleName(/^Contexto estimado do card: cerca de [\d.]+ tokens\./);
    expect(container.querySelector('.context-gauge .context-ring-fill')).toBeNull();
  });

  it('o clique abre o detalhe por grupo, sem abrir nem selecionar o card; cada grupo abre a lista do que pesa', async () => {
    setModel(board.storyId, 'claude:opus@high');
    show(board.storyId);
    posted.mockClear();
    await userEvent.click(gauge());
    const panel = await screen.findByRole('dialog', { name: 'Contexto estimado' });
    expect(useBoardStore.getState().openCardId ?? null).toBeNull();
    expect(within(panel).getByText('Servidores MCP')).toBeInTheDocument();
    expect(within(panel).getByText('Card')).toBeInTheDocument();
    expect(within(panel).getByText('Livre')).toBeInTheDocument();
    // o card está no Backlog, onde a IA não atua: a estimativa não cita fase
    expect(within(panel).getByText('Estimativa da próxima execução · Opus 5.5')).toBeInTheDocument();
    // o servidor do board: nomes e instruções contam; as definições aparecem como sob demanda
    await userEvent.click(within(panel).getByText('Servidores MCP'));
    expect(within(panel).getByText('nomes das ferramentas')).toBeInTheDocument();
    expect(within(panel).getByText('definições das ferramentas').closest('li')).toHaveClass('on-demand');
    expect(within(panel).getByText(/^Sob demanda: mais/)).toBeInTheDocument();
    expect(within(panel).getByText(/Fora da conta: o prompt e as ferramentas nativas do Claude Code/)).toBeInTheDocument();
    expect(posted).not.toHaveBeenCalled();
  });

  it('acompanha o card: numa coluna em que a IA atua, a estimativa diz a fase e soma as instruções dela', async () => {
    setModel(board.storyId, 'claude:opus@high');
    const phase = state().columns.find((c) => c.workflowId === cardOf(board.storyId).workflowId && c.aiActive && c.aiInstruction)!;
    const { unmount } = show(board.storyId);
    const total = () => Number(/cerca de ([\d.]+)/.exec(gauge().getAttribute('aria-label')!)![1]!.replace(/\./g, ''));
    const inBacklog = total();
    unmount();
    patchCard(board.storyId, { columnId: phase.id });
    show(board.storyId);
    expect(total()).toBeGreaterThan(inBacklog);
    await userEvent.click(gauge());
    const panel = await screen.findByRole('dialog', { name: 'Contexto estimado' });
    expect(within(panel).getByText(`Estimativa da próxima execução, na fase ${phase.name} · Opus 5.5`)).toBeInTheDocument();
  });

  it('sem modelo, o detalhe explica por que não há porcentagem', async () => {
    setModel(board.storyId, '');
    show(board.storyId);
    await userEvent.click(gauge());
    const panel = await screen.findByRole('dialog', { name: 'Contexto estimado' });
    expect(within(panel).getByText('O card não tem modelo: sem a janela de contexto, não há porcentagem.')).toBeInTheDocument();
    expect(within(panel).queryByText('Livre')).toBeNull();
  });

  it('em inglês, os grupos e as linhas do detalhe vêm traduzidos', async () => {
    setLocale('en');
    setModel(board.storyId, 'claude:opus@high');
    show(board.storyId);
    await userEvent.click(screen.getByRole('button', { name: /Estimated card context/ }));
    const panel = await screen.findByRole('dialog', { name: 'Estimated context' });
    for (const summary of panel.querySelectorAll('summary')) await userEvent.click(summary);
    // o board de teste não marca agente nem skill: aparecem o servidor do board e o card
    for (const text of ['MCP servers', 'Card', 'Free', 'tool names', 'server instructions', 'tool definitions', 'Title and description'])
      expect(within(panel).getByText(text)).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(/nomes das|instruções|definições|Título|Livre|Sob demanda/);
  });

  it('todo rótulo de grupo e de linha do detalhe tem tradução (o teste de i18n só lê t() com texto literal)', () => {
    for (const label of [...Object.values(GROUP_LABELS), ...Object.values(ENTRY_LABELS)].filter(Boolean))
      expect(EN).toHaveProperty([label]);
  });

  it('card arquivado não mostra o anel', () => {
    patchCard(board.subId, { archivedAt: Date.now() });
    show(board.subId);
    expect(screen.queryByRole('button', { name: /Contexto estimado do card/ })).toBeNull();
  });
});
