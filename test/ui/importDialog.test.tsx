import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { confirmLast, lastSent, posted, renderThemed, seedBoard, sentOf } from './setup';
import { Dialog as AskDialog } from '../../src/webview/components/Dialog';
import { ImportDialog } from '../../src/webview/components/settings/harness/ImportDialog';
import { useBoardStore } from '../../src/webview/store/boardStore';
import type { BoardState } from '../../src/shared/model';
import type { ImportCandidate, ImportPreview } from '../../src/shared/artifactImport';

const setState = (patch: (s: BoardState) => Partial<BoardState>) => {
  const s = useBoardStore.getState().state!;
  useBoardStore.setState({ state: { ...s, ...patch(s) } });
};

const cand = (over: Partial<ImportCandidate>): ImportCandidate => ({
  key: 'skill:a',
  kind: 'skill',
  name: 'a',
  description: 'descrição',
  origin: 'x',
  exists: false,
  ...over,
});

const showPreview = (candidates: ImportCandidate[], source: ImportPreview['source'] = { from: 'folder', path: '/p' }) =>
  act(() => setState(() => ({ artifactImport: { source, label: '/p', candidates } })));

beforeEach(async () => {
  await seedBoard();
  setState((s) => ({
    artifactImport: null,
    harnessSuggestions: null,
    harness: {
      ...s.harness,
      inventory: [
        { tool: 'claude', installed: true, items: [] },
        { tool: 'cursor', installed: false, items: [] },
      ],
    },
  }));
  posted.mockClear();
});

describe('ImportDialog', () => {
  it('pasta: envia o scan com a subpasta', async () => {
    renderThemed(<ImportDialog onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText('Caminho da pasta ou endereço do repositório'), ' /repo ');
    await userEvent.type(screen.getByLabelText('Subpasta (opcional)'), 'lib');
    await userEvent.click(screen.getByRole('button', { name: 'Examinar' }));
    expect(lastSent('harness.import.scan').source).toEqual({ from: 'folder', path: '/repo', subdir: 'lib' });
  });

  it('ferramenta: instalada envia o scan; a ausente fica marcada e desabilitada', async () => {
    renderThemed(<ImportDialog onClose={() => {}} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Ferramenta instalada' }));
    expect(screen.getAllByText('não encontrada nesta máquina').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Cursor' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Claude Code' }));
    expect(lastSent('harness.import.scan').source).toEqual({ from: 'tool', tool: 'claude' });
  });

  it('arquivo de exportação e escolher pasta enviam o pick', async () => {
    renderThemed(<ImportDialog onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Escolher pasta' }));
    expect(lastSent('harness.import.pick')).toEqual({ type: 'harness.import.pick', what: 'folder' });
    confirmLast();
    await userEvent.click(screen.getByRole('radio', { name: 'Arquivo de exportação' }));
    await userEvent.click(screen.getByRole('button', { name: 'Escolher arquivo' }));
    expect(lastSent('harness.import.pick')).toEqual({ type: 'harness.import.pick', what: 'export' });
  });

  it('lista com repetido e problema: o item com problema fica sem caixa', () => {
    renderThemed(<ImportDialog onClose={() => {}} />);
    showPreview([cand({}), cand({ key: 'rule:r', kind: 'rule', name: 'r', exists: true }), cand({ key: 'mcp:m', kind: 'mcp', name: 'm', problem: 'nome inválido' })]);
    expect(screen.getByText('já está no board')).toBeInTheDocument();
    expect(screen.getByText('nome inválido')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Importar m' })).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Importar a' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Importar 0' })).toBeDisabled();
  });

  it('sem repetidos, importa direto', async () => {
    renderThemed(<ImportDialog onClose={() => {}} />);
    showPreview([cand({})]);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Importar a' }));
    await userEvent.click(screen.getByRole('button', { name: 'Importar 1' }));
    expect(lastSent('harness.import.apply')).toEqual({ type: 'harness.import.apply', keys: ['skill:a'], onConflict: 'skip' });
  });

  const withAsk = () =>
    renderThemed(
      <>
        <ImportDialog onClose={() => {}} />
        <AskDialog />
      </>,
    );
  const markBoth = async () => {
    showPreview([cand({}), cand({ key: 'rule:r', kind: 'rule', name: 'r', exists: true })]);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Importar a' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Importar r' }));
    await userEvent.click(screen.getByRole('button', { name: 'Importar 2' }));
    expect(sentOf('harness.import.apply')).toHaveLength(0);
  };

  it('repetidos: Substituir', async () => {
    withAsk();
    await markBoth();
    // jsdom não lê o CSS que devolve o clique ao diálogo de confirmação
    await userEvent.setup({ pointerEventsCheck: 0 }).click(await screen.findByRole('button', { name: 'Substituir', hidden: true }));
    expect(lastSent('harness.import.apply')).toEqual({ type: 'harness.import.apply', keys: ['skill:a', 'rule:r'], onConflict: 'replace' });
  });

  it('repetidos: Pular os repetidos', async () => {
    withAsk();
    await markBoth();
    await userEvent.setup({ pointerEventsCheck: 0 }).click(await screen.findByRole('button', { name: 'Pular os repetidos', hidden: true }));
    expect(lastSent('harness.import.apply').onConflict).toBe('skip');
  });

  it('Nenhum artefato encontrado', () => {
    renderThemed(<ImportDialog onClose={() => {}} />);
    showPreview([]);
    expect(screen.getByText('Nenhum artefato encontrado')).toBeInTheDocument();
  });

  it('Indicar artefatos só na ferramenta instalada e marca o indicado', async () => {
    renderThemed(<ImportDialog onClose={() => {}} />);
    showPreview([cand({})]);
    expect(screen.queryByRole('button', { name: 'Indicar artefatos' })).toBeNull();
    showPreview([cand({})], { from: 'tool', tool: 'claude' });
    await userEvent.click(screen.getByRole('button', { name: 'Indicar artefatos' }));
    expect(lastSent('harness.suggest.run')).toEqual({ type: 'harness.suggest.run', tool: 'claude', kind: 'skill' });
    act(() => setState(() => ({ harnessSuggestions: { tool: 'claude', kind: 'skill', items: [{ location: 'skill:a', reason: 'combina' }] } })));
    expect(screen.getByRole('checkbox', { name: 'Importar a' })).toBeChecked();
    expect(screen.getByText(/combina/)).toBeInTheDocument();
  });

  it('o erro da origem volta ao passo 1 com a mensagem', async () => {
    renderThemed(<ImportDialog onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText('Caminho da pasta ou endereço do repositório'), '/x');
    await userEvent.click(screen.getByRole('button', { name: 'Examinar' }));
    confirmLast(false, 'Pasta inexistente');
    expect(await screen.findByRole('alert')).toHaveTextContent('Pasta inexistente');
    expect(screen.getByRole('button', { name: 'Examinar' })).toBeInTheDocument();
  });

  it('fechar envia cancel', async () => {
    const onClose = vi.fn();
    renderThemed(<ImportDialog onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(lastSent('harness.import.cancel')).toEqual({ type: 'harness.import.cancel' });
    expect(onClose).toHaveBeenCalled();
  });
});
