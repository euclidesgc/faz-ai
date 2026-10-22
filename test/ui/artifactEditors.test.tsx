import { beforeEach, describe, expect, it } from 'vitest';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { choose, confirmLast, lastSent, posted, renderThemed, seedBoard, sentOf } from './setup';
import type { ArtifactKind, BoardArtifact } from '../../src/shared/artifacts';
import type { HostToWebview } from '../../src/shared/messages';
import type { BoardState } from '../../src/shared/model';
import { McpServerEditor } from '../../src/webview/components/settings/harness/McpServerEditor';
import { RuleEditor } from '../../src/webview/components/settings/harness/RuleEditor';
import { SkillEditor } from '../../src/webview/components/settings/harness/SkillEditor';
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

describe('editor de skill', () => {
  const skill = artifact('skill', 'migrar', { files: ['references/exemplo.md'], revision: 3 });

  it('carrega o SKILL.md pelo readResult e salva com nome, descrição e corpo', async () => {
    setArtifacts([skill]);
    renderThemed(<SkillEditor skill={skill} onClose={() => {}} />);
    replyRead('---\nname: migrar\ndescription: "Migrar o banco"\nallowed-tools: Read\n---\n\n# migrar\n\nPasso a passo.\n', {
      kind: 'skill',
      name: 'migrar',
    });
    expect(screen.getByRole('textbox', { name: 'Descrição' })).toHaveValue('Migrar o banco');
    expect(screen.getByRole('textbox', { name: 'Corpo do SKILL.md' })).toHaveValue('# migrar\n\nPasso a passo.\n');
    expect(screen.getByText(/Versão 3\./)).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: 'Descrição' }), ' com segurança');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    const save = lastSent('harness.artifact.save');
    expect(save).toMatchObject({ kind: 'skill', name: 'migrar', via: 'manual' });
    expect(save).not.toHaveProperty('previous');
    expect(save.body).toBe(
      '---\nname: migrar\ndescription: "Migrar o banco com segurança"\nallowed-tools: Read\n---\n\n# migrar\n\nPasso a passo.\n',
    );
  });

  it('ignora o readResult de outro requestId', async () => {
    setArtifacts([skill]);
    renderThemed(<SkillEditor skill={skill} onClose={() => {}} />);
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'harness.artifact.readResult', requestId: 'outro', text: '---\nname: x\n---\nx' } satisfies HostToWebview,
        }),
      );
    });
    expect(screen.getByRole('textbox', { name: 'Corpo do SKILL.md' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
  });

  it('adiciona, edita e apaga arquivos de apoio com harness.skillFile.write e harness.skillFile.delete', async () => {
    setArtifacts([skill]);
    renderThemed(<SkillEditor skill={skill} onClose={() => {}} />);
    replyRead('---\nname: migrar\ndescription: "x"\n---\n\ncorpo\n');
    posted.mockClear();

    // adicionar: pasta + nome, citando no SKILL.md
    await userEvent.type(screen.getByRole('textbox', { name: 'Nome do arquivo' }), 'ultima.md');
    await userEvent.click(screen.getByRole('button', { name: 'Novo arquivo' }));
    expect(lastSent('harness.skillFile.write')).toEqual({
      type: 'harness.skillFile.write',
      skill: 'migrar',
      file: 'references/ultima.md',
      content: '',
      link: true,
    });
    confirmLast();
    await act(async () => {});

    // editar um arquivo que já existe: lê pelo host e grava o texto
    await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
    replyRead('texto antigo', { kind: 'skill', name: 'migrar', file: 'references/exemplo.md' });
    const area = screen.getByRole('textbox', { name: 'Conteúdo de references/exemplo.md' });
    expect(area).toHaveValue('texto antigo');
    await userEvent.type(area, ' novo');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar arquivo' }));
    expect(lastSent('harness.skillFile.write')).toEqual({
      type: 'harness.skillFile.write',
      skill: 'migrar',
      file: 'references/exemplo.md',
      content: 'texto antigo novo',
    });
    confirmLast();
    await act(async () => {});

    // apagar: confirmação do board e depois a mensagem
    await userEvent.click(screen.getByRole('button', { name: 'Apagar o arquivo' }));
    expect(useBoardStore.getState().dialog?.title).toBe('Apagar "references/exemplo.md"?');
    act(() => void useBoardStore.getState().dialog!.onConfirm());
    expect(lastSent('harness.skillFile.delete')).toEqual({
      type: 'harness.skillFile.delete',
      skill: 'migrar',
      file: 'references/exemplo.md',
    });
  });

  it('o erro de limite do host aparece ao adicionar um arquivo', async () => {
    setArtifacts([skill]);
    renderThemed(<SkillEditor skill={skill} onClose={() => {}} />);
    replyRead('---\nname: migrar\ndescription: "x"\n---\n\ncorpo\n');
    await userEvent.type(screen.getByRole('textbox', { name: 'Nome do arquivo' }), 'grande.md');
    await userEvent.click(screen.getByRole('button', { name: 'Novo arquivo' }));
    confirmLast(false, 'Arquivo acima de 512 KB.');
    expect(await screen.findByText('Arquivo acima de 512 KB.')).toBeInTheDocument();
  });

  it('skill nova: nome inválido desabilita Salvar e os arquivos esperam a skill existir', async () => {
    renderThemed(<SkillEditor onClose={() => {}} />);
    expect(screen.getByText('Salve a skill para acrescentar arquivos de apoio.')).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: 'Nome da skill' }), 'Nome Ruim');
    await userEvent.type(screen.getByRole('textbox', { name: 'Descrição' }), 'Faz algo.');
    await userEvent.type(screen.getByRole('textbox', { name: 'Corpo do SKILL.md' }), '# corpo');
    expect(screen.getByText('Use letras minúsculas, números e hífen (até 64).')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    const name = screen.getByRole('textbox', { name: 'Nome da skill' });
    await userEvent.clear(name);
    await userEvent.type(name, 'nova-skill');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(lastSent('harness.artifact.save')).toMatchObject({
      kind: 'skill',
      name: 'nova-skill',
      via: 'manual',
      body: '---\nname: nova-skill\ndescription: "Faz algo."\n---\n\n# corpo\n',
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
