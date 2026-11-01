import { lastSent, renderThemed, seedBoard, confirmLast } from './setup';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { HostToWebview } from '../../src/shared/messages';
import type { BoardArtifact } from '../../src/shared/artifacts';
import { HarnessFileModal, splitFrontmatter } from '../../src/webview/components/settings/harness/HarnessFileModal';
import { ARTIFACT_READ_TIMEOUT_MS } from '../../src/webview/components/settings/harness/useArtifactText';
import { useBoardStore, type HarnessFileRef } from '../../src/webview/store/boardStore';

const skill = (name: string, generated = false): BoardArtifact => ({
  id: `skill:${name}`,
  kind: 'skill',
  name,
  description: '',
  usage: 'contextual',
  origin: '',
  originTool: '',
  missing: false,
  skipped: [],
  files: [],
  body: '',
  path: '',
  generated,
  createdAt: 0,
  updatedAt: 0,
});

beforeAll(async () => {
  await seedBoard();
  const s = useBoardStore.getState().state!;
  useBoardStore.setState({
    state: { ...s, harness: { ...s.harness, library: { directory: '/lib', artifacts: [skill('publicar'), skill('faz-ai-fluxo', true)] } } },
  });
});

function open(file: HarnessFileRef): void {
  act(() => useBoardStore.getState().openHarnessFile(file));
}

function reply(msg: HostToWebview): void {
  act(() => window.dispatchEvent(new MessageEvent('message', { data: msg })));
}

const readId = () => (lastSent('harness.artifact.read') as { requestId: string }).requestId;
const close = () => act(() => useBoardStore.getState().closeHarnessFile());

describe('splitFrontmatter', () => {
  it('separa os metadados do topo do corpo', () => {
    expect(splitFrontmatter('---\ndescription: x\n---\n# Regra\n')).toEqual({ meta: 'description: x', body: '# Regra\n' });
    expect(splitFrontmatter('# Sem metadados')).toEqual({ meta: null, body: '# Sem metadados' });
  });
});

describe('HarnessFileModal', () => {
  it('abre o texto de uma regra do board, mostra formatado e salva pelo artefato', async () => {
    renderThemed(<HarnessFileModal />);
    open({ kind: 'rule', name: 'estilo.md' });
    expect(lastSent('harness.artifact.read')).toMatchObject({ kind: 'rule', name: 'estilo.md' });
    expect(screen.getByText('Carregando…')).toBeInTheDocument();
    reply({ type: 'harness.artifact.readResult', requestId: readId(), text: '---\npaths: src/**\n---\n# Estilo\n' });
    expect(screen.getByRole('heading', { name: 'Estilo' })).toBeInTheDocument();
    expect(screen.getByText('paths: src/**')).toBeInTheDocument();
    // não abre mais caminho de disco
    expect(screen.queryByRole('button', { name: 'Abrir no editor' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Conteúdo do arquivo' }), 'Use tabs.');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(lastSent('harness.artifact.save')).toMatchObject({ kind: 'rule', name: 'estilo.md', via: 'manual' });
    expect(lastSent('harness.artifact.save').body).toContain('Use tabs.');
    confirmLast();
    await act(async () => {});
    expect(screen.queryByRole('textbox', { name: 'Conteúdo do arquivo' })).toBeNull();
    close();
  });

  it('o SKILL.md grava como skill; um arquivo de apoio, pelo arquivo da skill', async () => {
    renderThemed(<HarnessFileModal />);
    open({ kind: 'skill', name: 'publicar' });
    reply({ type: 'harness.artifact.readResult', requestId: readId(), text: '# Publicar' });
    await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Conteúdo do arquivo' }), '!');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(lastSent('harness.artifact.save')).toMatchObject({ kind: 'skill', name: 'publicar', body: '# Publicar!' });
    confirmLast();
    await act(async () => {});
    close();

    open({ kind: 'skill', name: 'publicar', file: 'references/modelo.ts' });
    expect(lastSent('harness.artifact.read')).toMatchObject({ kind: 'skill', name: 'publicar', file: 'references/modelo.ts' });
    reply({ type: 'harness.artifact.readResult', requestId: readId(), text: 'const a = 1;' });
    await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Conteúdo do arquivo' }), '2');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(lastSent('harness.skillFile.write')).toMatchObject({
      skill: 'publicar',
      file: 'references/modelo.ts',
      content: 'const a = 1;2',
    });
    confirmLast(false, 'Arquivo grande demais.');
    await act(async () => {});
    // o erro do host fica na tela e o texto editado também
    expect(screen.getByRole('alert')).toHaveTextContent('Arquivo grande demais.');
    expect(screen.getByRole('textbox', { name: 'Conteúdo do arquivo' })).toHaveValue('const a = 1;2');
    close();
  });

  it('a skill do fluxo, gerada pela extensão, abre só para leitura', () => {
    renderThemed(<HarnessFileModal />);
    open({ kind: 'skill', name: 'faz-ai-fluxo' });
    reply({ type: 'harness.artifact.readResult', requestId: readId(), text: '# Fluxo' });
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
    expect(screen.getByText(/Somente leitura/)).toBeInTheDocument();
    close();
  });

  it('sem resposta do host, desiste e diz o que fazer; uma resposta atrasada não muda mais nada', () => {
    vi.useFakeTimers();
    try {
      renderThemed(<HarnessFileModal />);
      open({ kind: 'rule', name: 'lenta' });
      const id = readId();
      expect(screen.getByText('Carregando…')).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(ARTIFACT_READ_TIMEOUT_MS));
      expect(screen.queryByText('Carregando…')).toBeNull();
      expect(screen.getByRole('alert')).toHaveTextContent('O host não respondeu à leitura');
      reply({ type: 'harness.artifact.readResult', requestId: id, text: '# Tarde' });
      expect(screen.queryByRole('heading', { name: 'Tarde' })).toBeNull();
      close();
    } finally {
      vi.useRealTimers();
    }
  });
});
