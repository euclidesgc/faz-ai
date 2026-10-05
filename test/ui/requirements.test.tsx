import { lastSent, posted, renderThemed, seedBoard, syncStore } from './setup';
import { beforeEach, describe, expect, it } from 'vitest';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RequirementsBanner, aiBlockedReason } from '../../src/webview/components/RequirementsBanner';
import { useBoardStore } from '../../src/webview/store/boardStore';
import type { MessageRouter } from '../../src/extension/panel/messageRouter';
import type { BoardRequirement } from '../../src/shared/requirements';

let router: MessageRouter;

beforeEach(async () => {
  posted.mockClear();
  ({ router } = await seedBoard());
});

const set = (list: BoardRequirement[]) =>
  act(() => {
    router.setRequirements(list);
    syncStore(router);
  });

const CLI: BoardRequirement = {
  id: 'cli',
  tool: 'cursor',
  cli: 'cursor-agent',
  where: 'https://cursor.com/cli',
  action: { kind: 'command', command: 'curl https://cursor.com/install -fsS | bash' },
};
const MCP: BoardRequirement = { id: 'mcp', tool: 'cursor', optional: true, action: { kind: 'connect' } };
const PERMISSION: BoardRequirement = { id: 'permission', tool: 'kimi', reason: 'Escolha "Sem restrições".', action: { kind: 'settings' } };

const missing = () => set([CLI, MCP, PERMISSION]);
const region = () => screen.queryByRole('region', { name: 'Requisitos do board' });

describe('faixa de requisitos do board', () => {
  it('não aparece com tudo pronto', () => {
    renderThemed(<RequirementsBanner />);
    expect(region()).toBeNull();
  });

  it('lista o que falta, com a ação de cada item, e não tem botão de fechar', async () => {
    missing();
    renderThemed(<RequirementsBanner />);
    // o recomendado aparece, mas não conta como requisito que falta
    expect(screen.getByText('Faltam 2 requisitos para o board trabalhar com a IA')).toBeInTheDocument();
    expect(screen.getByText('A linha de comando do Cursor não foi encontrada')).toBeInTheDocument();
    expect(screen.getByText(/recomendado/)).toBeInTheDocument();
    expect(screen.getByText('curl https://cursor.com/install -fsS | bash')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /fechar/i })).toBeNull();
    // uma região, não um alerta: o leitor de tela não relê tudo a cada vez que a faixa aparece
    expect(screen.queryByRole('alert')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: /Conectar IA \(MCP\)/ }));
    expect(lastSent('ui.connectAI')).toEqual({ type: 'ui.connectAI' });
    await userEvent.click(screen.getByRole('button', { name: 'Abrir Harness de IA' }));
    expect(useBoardStore.getState()).toMatchObject({ view: 'settings', settingsTab: 'harness' });
  });

  it('"Verificar de novo" mostra que está conferindo e diz quando nada mudou', async () => {
    missing();
    renderThemed(<RequirementsBanner />);
    await userEvent.click(screen.getByRole('button', { name: 'Verificar de novo' }));
    expect(lastSent('requirements.check')).toEqual({ type: 'requirements.check' });
    expect(screen.getByText('Conferindo…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verificar de novo' })).toBeDisabled();
    await new Promise((r) => setTimeout(r, 2));
    set([CLI, MCP, PERMISSION]);
    expect(screen.getByText('Conferido agora: nada mudou.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verificar de novo' })).toBeEnabled();
  });

  it('só o recomendado: uma linha discreta, sem contar como requisito', () => {
    set([MCP]);
    renderThemed(<RequirementsBanner />);
    expect(screen.getByText('Recomendado para a IA enxergar o board nas suas conversas')).toBeInTheDocument();
    expect(screen.queryByText(/requisito/)).toBeNull();
    expect(region()).toHaveClass('recommended');
    expect(region()).not.toHaveClass('warn');
  });

  it('some sozinho quando a última pendência é resolvida', () => {
    missing();
    renderThemed(<RequirementsBanner />);
    expect(region()).toBeInTheDocument();
    set([]);
    expect(region()).toBeNull();
  });

  it('no chat, compacto: sem as explicações dos itens que têm botão; com elas nos que não têm', () => {
    set([CLI, MCP, PERMISSION, { id: 'node', tool: 'cursor', action: null }]);
    renderThemed(<RequirementsBanner compact />);
    expect(screen.getByText('O servidor do board não está registrado no Cursor')).toBeInTheDocument();
    expect(screen.queryByText(/Nas conversas com o Cursor no editor/)).toBeNull();
    // sem botão que resolva (Node.js, permissão sem o atalho das configurações): a explicação fica
    expect(screen.getByText(/roda com o Node.js 18 ou mais novo/)).toBeInTheDocument();
    expect(screen.getByText('Escolha "Sem restrições".')).toBeInTheDocument();
  });
});

describe('botões de IA com a CLI que falta', () => {
  it('a CLI que falta ou está sem login bloqueia os botões, com o motivo', () => {
    expect(aiBlockedReason(router.snapshot())).toBeNull();
    set([CLI]);
    expect(aiBlockedReason(useBoardStore.getState().state!)).toContain('não foi encontrada');
    set([{ id: 'signin', tool: 'cursor', cli: 'cursor-agent', action: { kind: 'command', command: 'cursor-agent login' } }]);
    expect(aiBlockedReason(useBoardStore.getState().state!)).toContain('sem login');
    // o recomendado não bloqueia nada
    set([MCP]);
    expect(aiBlockedReason(useBoardStore.getState().state!)).toBeNull();
  });
});
