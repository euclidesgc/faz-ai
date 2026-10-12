import { lastSent, renderThemed, seedBoard } from './setup';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { HostToWebview } from '../../src/shared/messages';
import { HarnessFileModal, READ_TIMEOUT_MS, splitFrontmatter } from '../../src/webview/components/settings/harness/HarnessFileModal';
import { useBoardStore } from '../../src/webview/store/boardStore';

beforeAll(async () => {
  await seedBoard();
});

function open(path: string): void {
  act(() => useBoardStore.getState().openHarnessFile(path));
}

function reply(msg: HostToWebview): void {
  act(() => window.dispatchEvent(new MessageEvent('message', { data: msg })));
}

const readId = () => (lastSent('harness.file.read') as { requestId: string }).requestId;

describe('splitFrontmatter', () => {
  it('separa os metadados do topo do corpo', () => {
    expect(splitFrontmatter('---\ndescription: x\n---\n# Regra\n')).toEqual({ meta: 'description: x', body: '# Regra\n' });
    expect(splitFrontmatter('# Sem metadados')).toEqual({ meta: null, body: '# Sem metadados' });
  });
});

describe('HarnessFileModal', () => {
  it('lê o arquivo do host, mostra formatado e salva a edição', async () => {
    renderThemed(<HarnessFileModal />);
    open('/projeto/.claude/rules/estilo.md');
    expect(lastSent('harness.file.read')).toMatchObject({ path: '/projeto/.claude/rules/estilo.md' });
    reply({ type: 'harness.file.readResult', requestId: readId(), content: '---\npaths: src/**\n---\n# Estilo\n', readonly: false });
    expect(screen.getByRole('heading', { name: 'Estilo' })).toBeInTheDocument();
    expect(screen.getByText('paths: src/**')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
    const area = screen.getByRole('textbox', { name: 'Conteúdo do arquivo' });
    await userEvent.type(area, 'Use tabs.');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    const write = lastSent('harness.file.write') as { requestId: string; path: string; content: string };
    expect(write.path).toBe('/projeto/.claude/rules/estilo.md');
    expect(write.content).toContain('Use tabs.');
    reply({ type: 'harness.file.writeResult', requestId: write.requestId, ok: true });
    expect(screen.queryByRole('textbox', { name: 'Conteúdo do arquivo' })).toBeNull();
    act(() => useBoardStore.getState().closeHarnessFile());
  });

  it('arquivo só leitura não oferece edição, e o erro de gravação mantém o texto', async () => {
    renderThemed(<HarnessFileModal />);
    open('/home/.claude.json');
    reply({ type: 'harness.file.readResult', requestId: readId(), content: '{}', readonly: true });
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
    expect(screen.getByText(/Somente leitura/)).toBeInTheDocument();
    act(() => useBoardStore.getState().closeHarnessFile());

    open('/projeto/.mcp.json');
    reply({ type: 'harness.file.readResult', requestId: readId(), content: '{}', readonly: false });
    await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Conteúdo do arquivo' }), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    const write = lastSent('harness.file.write') as { requestId: string };
    reply({ type: 'harness.file.writeResult', requestId: write.requestId, ok: false, error: 'JSON inválido, nada foi gravado: x' });
    expect(screen.getByRole('alert')).toHaveTextContent('JSON inválido');
    expect(screen.getByRole('textbox', { name: 'Conteúdo do arquivo' })).toHaveValue('{}x');
    act(() => useBoardStore.getState().closeHarnessFile());
  });

  it('sem resposta do host, desiste e diz para recarregar a janela', () => {
    vi.useFakeTimers();
    try {
      renderThemed(<HarnessFileModal />);
      open('/projeto/.claude/skills/publicar/SKILL.md');
      expect(screen.getByText('Carregando…')).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(READ_TIMEOUT_MS));
      expect(screen.queryByText('Carregando…')).toBeNull();
      expect(screen.getByText(/O board não respondeu.*Developer: Reload Window/)).toBeInTheDocument();
      // uma resposta atrasada não muda mais nada
      reply({ type: 'harness.file.readResult', requestId: readId(), content: '# Tarde', readonly: false });
      expect(screen.queryByRole('heading', { name: 'Tarde' })).toBeNull();
      act(() => useBoardStore.getState().closeHarnessFile());
    } finally {
      vi.useRealTimers();
    }
  });
});
