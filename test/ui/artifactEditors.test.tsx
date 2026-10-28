import { beforeEach, describe, expect, it } from 'vitest';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { choose, confirmLast, lastSent, posted, renderThemed, seedBoard, sentOf } from './setup';
import type { ArtifactKind, BoardArtifact } from '../../src/shared/artifacts';
import type { HostToWebview } from '../../src/shared/messages';
import type { BoardState } from '../../src/shared/model';
import { McpServerEditor } from '../../src/webview/components/settings/harness/McpServerEditor';
import { RuleEditor } from '../../src/webview/components/settings/harness/RuleEditor';
import { useBoardStore } from '../../src/webview/store/boardStore';

const artifact = (kind: ArtifactKind, name: string, patch: Partial<BoardArtifact> = {}): BoardArtifact => ({
  id: `${kind}:${name}`,
  kind,
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
  createdAt: 0,
  updatedAt: 0,
  ...patch,
});

const setArtifacts = (artifacts: BoardArtifact[]) => {
  const s = useBoardStore.getState().state!;
  const next: BoardState = { ...s, harness: { ...s.harness, library: { directory: '', artifacts } } };
  useBoardStore.setState({ state: next });
};

/** o host responde à leitura do artefato com o mesmo requestId */
const replyRead = (text: string, expected?: { kind: ArtifactKind; name: string; file?: string }) => {
  const read = lastSent('harness.artifact.read');
  if (expected) expect(read).toMatchObject(expected);
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'harness.artifact.readResult', requestId: read.requestId, text } satisfies HostToWebview,
      }),
    );
  });
};

beforeEach(async () => {
  await seedBoard();
  setArtifacts([]);
  posted.mockClear();
});

describe('editor de regra', () => {
  it('cria uma regra nova e envia harness.artifact.save manual, sem previous', async () => {
    const closed: string[] = [];
    renderThemed(<RuleEditor onClose={() => closed.push('x')} />);
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    await userEvent.type(screen.getByRole('textbox', { name: 'Nome da regra' }), 'commits');
    await userEvent.type(screen.getByRole('textbox', { name: 'Texto da regra' }), 'Commits em português.');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(lastSent('harness.artifact.save')).toEqual({
      type: 'harness.artifact.save',
      kind: 'rule',
      name: 'commits',
      body: 'Commits em português.',
      via: 'manual',
    });
    confirmLast();
    await act(async () => {});
    expect(closed).toEqual(['x']);
  });

  it('nome inválido ou repetido desabilita Salvar e mostra o motivo', async () => {
    setArtifacts([artifact('rule', 'commits')]);
    renderThemed(<RuleEditor onClose={() => {}} />);
    const name = screen.getByRole('textbox', { name: 'Nome da regra' });
    await userEvent.type(screen.getByRole('textbox', { name: 'Texto da regra' }), 'Texto.');
    await userEvent.type(name, 'Nome Inválido');
    expect(screen.getByText('Use letras minúsculas, números e hífen (até 64), com .md opcional.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    await userEvent.clear(name);
    await userEvent.type(name, 'commits');
    expect(screen.getByText('Já existe uma regra com este nome.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    await userEvent.clear(name);
    await userEvent.type(name, 'commits.md');
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled();
    expect(sentOf('harness.artifact.save')).toHaveLength(0);
  });

  it('renomear lê o texto, avisa que as citações não são reescritas e envia previous', async () => {
    setArtifacts([artifact('rule', 'commits')]);
    renderThemed(<RuleEditor rule={artifact('rule', 'commits')} onClose={() => {}} />);
    expect(screen.getByRole('textbox', { name: 'Texto da regra' })).toBeDisabled();
    replyRead('Commits em português.', { kind: 'rule', name: 'commits' });
    expect(screen.getByRole('textbox', { name: 'Texto da regra' })).toHaveValue('Commits em português.');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    const name = screen.getByRole('textbox', { name: 'Nome da regra' });
    await userEvent.clear(name);
    await userEvent.type(name, 'mensagens-de-commit');
    expect(screen.getByRole('status')).toHaveTextContent('Os cards e os agentes que citam "commits" não são reescritos');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(lastSent('harness.artifact.save')).toMatchObject({
      kind: 'rule',
      name: 'mensagens-de-commit',
      previous: 'commits',
      body: 'Commits em português.',
      via: 'manual',
    });
  });
});

describe('editor de servidor MCP', () => {
  it('cria um servidor por comando', async () => {
    renderThemed(<McpServerEditor onClose={() => {}} />);
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    await userEvent.type(screen.getByRole('textbox', { name: 'Nome' }), 'github');
    await userEvent.type(screen.getByRole('textbox', { name: 'Comando' }), 'npx');
    await userEvent.type(screen.getByRole('textbox', { name: 'Argumentos' }), '-y\npkg');
    await userEvent.click(screen.getByRole('button', { name: 'Acrescentar linha' }));
    await userEvent.type(screen.getByLabelText('Nome em Variáveis de ambiente'), 'TOKEN');
    await userEvent.type(screen.getByLabelText('Valor de TOKEN'), 'abc');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(lastSent('harness.artifact.save')).toEqual({
      type: 'harness.artifact.save',
      kind: 'mcp',
      name: 'github',
      server: { name: 'github', transport: 'stdio', command: 'npx', args: ['-y', 'pkg'], env: { TOKEN: 'abc' }, url: '', headers: {} },
      keepSecrets: [],
      via: 'manual',
    });
  });

  it('cria um servidor por endereço', async () => {
    renderThemed(<McpServerEditor onClose={() => {}} />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Nome' }), 'docs');
    await choose(screen.getByRole('combobox', { name: 'Tipo' }), 'Endereço (HTTP)');
    await userEvent.type(screen.getByRole('textbox', { name: 'Endereço' }), 'https://exemplo.dev/mcp');
    await userEvent.click(screen.getByRole('button', { name: 'Acrescentar linha' }));
    await userEvent.type(screen.getByLabelText('Nome em Cabeçalhos'), 'Authorization');
    await userEvent.type(screen.getByLabelText('Valor de Authorization'), 'Bearer x');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(lastSent('harness.artifact.save')).toMatchObject({
      kind: 'mcp',
      name: 'docs',
      keepSecrets: [],
      server: { transport: 'http', url: 'https://exemplo.dev/mcp', command: '', env: {}, headers: { Authorization: 'Bearer x' } },
    });
  });

  it('editar: o valor guardado não aparece e salvar sem digitar manda o nome em keepSecrets', async () => {
    setArtifacts([artifact('mcp', 'api')]);
    renderThemed(<McpServerEditor server={artifact('mcp', 'api')} onClose={() => {}} />);
    const read = lastSent('harness.artifact.read');
    expect(read).toMatchObject({ kind: 'mcp', name: 'api' });
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'harness.artifact.readResult',
            requestId: read.requestId,
            server: { name: 'api', transport: 'stdio', command: 'node', args: ['s.js'], env: { TOKEN: '' }, url: '', headers: {} },
          } satisfies HostToWebview,
        }),
      );
    });
    expect(await screen.findByDisplayValue('node')).toBeInTheDocument();
    expect(screen.getByLabelText('Valor de TOKEN')).toHaveValue('');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(lastSent('harness.artifact.save')).toMatchObject({
      kind: 'mcp',
      name: 'api',
      keepSecrets: ['TOKEN'],
      server: { command: 'node', args: ['s.js'], env: { TOKEN: '' } },
    });
    expect(lastSent('harness.artifact.save')).not.toHaveProperty('previous');
  });

  it('digitar um valor substitui o guardado e tira o nome de keepSecrets', async () => {
    setArtifacts([artifact('mcp', 'api')]);
    renderThemed(<McpServerEditor server={artifact('mcp', 'api')} onClose={() => {}} />);
    const read = lastSent('harness.artifact.read');
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'harness.artifact.readResult',
            requestId: read.requestId,
            server: { name: 'api', transport: 'stdio', command: 'node', args: [], env: { TOKEN: '' }, url: '', headers: {} },
          } satisfies HostToWebview,
        }),
      );
    });
    await screen.findByDisplayValue('node');
    await userEvent.type(screen.getByLabelText('Valor de TOKEN'), 'novo');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(lastSent('harness.artifact.save')).toMatchObject({ keepSecrets: [], server: { env: { TOKEN: 'novo' } } });
  });

  it('nome inválido ou repetido desabilita Salvar', async () => {
    setArtifacts([artifact('mcp', 'api')]);
    renderThemed(<McpServerEditor onClose={() => {}} />);
    const name = screen.getByRole('textbox', { name: 'Nome' });
    await userEvent.type(screen.getByRole('textbox', { name: 'Comando' }), 'npx');
    await userEvent.type(name, 'nome inválido');
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    await userEvent.clear(name);
    await userEvent.type(name, 'api');
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    expect(screen.getByText('Já existe um servidor com este nome.')).toBeInTheDocument();
    await userEvent.clear(name);
    await userEvent.type(name, 'outro');
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled();
  });
});
