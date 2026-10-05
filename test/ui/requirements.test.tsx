import { lastSent, posted, renderThemed, seedBoard, syncStore } from './setup';
import { beforeEach, describe, expect, it } from 'vitest';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RequirementsBanner } from '../../src/webview/components/RequirementsBanner';
import { useBoardStore } from '../../src/webview/store/boardStore';
import type { MessageRouter } from '../../src/extension/panel/messageRouter';

let router: MessageRouter;

beforeEach(async () => {
  posted.mockClear();
  ({ router } = await seedBoard());
});

const missing = () => {
  router.setRequirements([
    {
      id: 'cli',
      tool: 'cursor',
      cli: 'cursor-agent',
      where: 'https://cursor.com/cli',
      action: { kind: 'command', command: 'curl https://cursor.com/install -fsS | bash' },
    },
    { id: 'mcp', tool: 'cursor', action: { kind: 'connect' } },
    { id: 'permission', tool: 'kimi', reason: 'Escolha "Sem restrições".', action: { kind: 'settings' } },
  ]);
  syncStore(router);
};

describe('faixa de requisitos do board', () => {
  it('não aparece com tudo pronto', () => {
    renderThemed(<RequirementsBanner />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('lista o que falta, com a ação de cada item, e não tem botão de fechar', async () => {
    missing();
    renderThemed(<RequirementsBanner />);
    expect(screen.getByText('Faltam 3 requisitos para o board trabalhar com a IA')).toBeInTheDocument();
    expect(screen.getByText('A linha de comando do Cursor não foi encontrada')).toBeInTheDocument();
    expect(screen.getByText('curl https://cursor.com/install -fsS | bash')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /fechar/i })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: /Conectar ao board/ }));
    expect(lastSent('ui.connectAI')).toEqual({ type: 'ui.connectAI' });
    await userEvent.click(screen.getByRole('button', { name: 'Verificar de novo' }));
    expect(lastSent('requirements.check')).toEqual({ type: 'requirements.check' });
    await userEvent.click(screen.getByRole('button', { name: 'Abrir Harness de IA' }));
    expect(useBoardStore.getState()).toMatchObject({ view: 'settings', settingsTab: 'harness' });
  });

  it('some sozinho quando a última pendência é resolvida', () => {
    missing();
    renderThemed(<RequirementsBanner />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    act(() => {
      router.setRequirements([]);
      syncStore(router);
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('no chat, compacto: os títulos e as ações, sem as explicações', () => {
    missing();
    renderThemed(<RequirementsBanner compact />);
    expect(screen.getByText('O servidor do board não está registrado no Cursor')).toBeInTheDocument();
    expect(screen.queryByText(/Nas conversas com o Cursor no editor/)).toBeNull();
  });
});
