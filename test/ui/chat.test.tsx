import { choose, lastSent, posted, renderThemed, seedBoard, sentOf } from './setup';
import { beforeEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatPanel } from '../../src/webview/components/chat/ChatPanel';
import { useBoardStore } from '../../src/webview/store/boardStore';
import type { ChatMessage, ChatState } from '../../src/shared/chat';

const msg = (role: ChatMessage['role'], text: string, id = text): ChatMessage => ({ id, role, text, at: 0 });

function setChat(chat: ChatState) {
  const s = useBoardStore.getState().state!;
  useBoardStore.setState({ state: { ...s, board: { ...s.board, aiTool: 'claude' }, chat }, chatModel: null });
}

beforeEach(async () => {
  await seedBoard();
  setChat({ messages: [], busy: false });
  posted.mockClear();
});

const input = () => screen.getByLabelText('Mensagem para a IA');

describe('ChatPanel', () => {
  it('sem conversa, mostra pedidos de exemplo que só preenchem o campo', async () => {
    renderThemed(<ChatPanel />);
    expect(screen.getByRole('button', { name: 'Limpar' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: /Resuma o que está parado/ }));
    expect(input()).toHaveValue('Resuma o que está parado no board e o que espera por mim.');
    expect(sentOf('chat.send')).toHaveLength(0);
  });

  it('Enter envia com o modelo padrão e limpa o campo; Shift+Enter quebra a linha', async () => {
    renderThemed(<ChatPanel />);
    await userEvent.type(input(), 'crie um card{Shift>}{Enter}{/Shift}segunda linha');
    expect(sentOf('chat.send')).toHaveLength(0);
    expect(input()).toHaveValue('crie um card\nsegunda linha');
    await userEvent.type(input(), '{Enter}');
    expect(lastSent('chat.send')).toEqual({ type: 'chat.send', text: 'crie um card\nsegunda linha', model: null });
    expect(input()).toHaveValue('');
  });

  it('o botão Enviar fica desligado sem texto, e o modelo escolhido vai junto e fica lembrado', async () => {
    renderThemed(<ChatPanel />);
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();
    await choose(screen.getByRole('combobox', { name: 'Modelo' }), /Sonnet/);
    const model = useBoardStore.getState().chatModel!;
    expect(model).toMatch(/^claude:sonnet/);
    await userEvent.type(input(), 'oi');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(lastSent('chat.send')).toEqual({ type: 'chat.send', text: 'oi', model });
  });

  it('mostra a conversa: a pessoa à direita, a IA em markdown e o aviso de erro', () => {
    setChat({
      messages: [msg('user', 'crie o card Login'), msg('assistant', 'Criei o card **#3**.'), msg('error', 'Interrompido.')],
      busy: false,
    });
    renderThemed(<ChatPanel />);
    const log = within(screen.getByRole('log'));
    expect(log.getByText('crie o card Login').closest('.chat-msg')).toHaveClass('user');
    expect(log.getByText('#3').tagName).toBe('STRONG');
    expect(log.getByText('Interrompido.').closest('.chat-msg')).toHaveClass('error');
    expect(screen.getByRole('button', { name: 'Limpar' })).toBeEnabled();
  });

  it('enquanto a IA responde, mostra o andamento, troca Enviar por Parar e não envia outra', async () => {
    setChat({ messages: [msg('user', 'oi')], busy: true });
    renderThemed(<ChatPanel />);
    expect(screen.getByRole('status')).toHaveTextContent('Claude Code está respondendo');
    expect(screen.queryByRole('button', { name: 'Enviar' })).toBeNull();
    await userEvent.type(input(), 'outra{Enter}');
    expect(sentOf('chat.send')).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Parar' }));
    expect(lastSent('chat.stop')).toEqual({ type: 'chat.stop' });
  });

  it('Limpar apaga a conversa', async () => {
    setChat({ messages: [msg('user', 'oi')], busy: false });
    renderThemed(<ChatPanel />);
    await userEvent.click(screen.getByRole('button', { name: 'Limpar' }));
    expect(lastSent('chat.clear')).toEqual({ type: 'chat.clear' });
  });
});
