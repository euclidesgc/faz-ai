import { choose, lastSent, posted, seedBoard, sentOf } from './setup';
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Theme } from '@radix-ui/themes';
import { Dialog } from '../../src/webview/components/Dialog';
import { ArtifactsHarness } from '../../src/webview/components/settings/harness/ArtifactsHarness';
import type { BoardArtifact } from '../../src/shared/artifacts';
import type { HarnessTopic } from '../../src/shared/harnessTopics';
import type { BoardState } from '../../src/shared/model';
import { useBoardStore } from '../../src/webview/store/boardStore';

const artifact = (over: Partial<BoardArtifact> & Pick<BoardArtifact, 'kind' | 'name'>): BoardArtifact => ({
  id: `${over.kind}:${over.name}`,
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
  ...over,
});

const ARTIFACTS: BoardArtifact[] = [
  artifact({ kind: 'rule', name: 'estilo-de-codigo', description: 'Convenções de código', usage: 'always', origin: '~/.claude/CLAUDE.md' }),
  artifact({ kind: 'rule', name: 'revisão-de-pr', description: 'Como revisar', usage: 'off' }),
  artifact({ kind: 'rule', name: 'antiga', usage: 'off', origin: '.cursor/rules/antiga.mdc', missing: true }),
  artifact({
    kind: 'skill',
    name: 'migracao',
    description: 'Escreve uma migração nova',
    skipped: [{ path: 'references/grande.bin', reason: 'size' }],
  }),
  artifact({ kind: 'skill', name: 'publicar', description: 'Publica a release' }),
  artifact({ kind: 'skill', name: 'faz-ai-fluxo', description: 'Conduz o fluxo', generated: true }),
  artifact({ kind: 'mcp', name: 'github', mcpSummary: 'npx github-mcp' }),
];

const setState = (patch: (s: BoardState) => Partial<BoardState>) => {
  const s = useBoardStore.getState().state!;
  useBoardStore.setState({ state: { ...s, ...patch(s) } });
};

beforeEach(async () => {
  await seedBoard();
  setState((s) => ({
    board: { ...s.board, aiTool: 'claude' },
    harness: { ...s.harness, library: { directory: '/lib', artifacts: ARTIFACTS } },
  }));
  posted.mockClear();
});

const renderTopic = (topic: HarnessTopic = 'rules') => {
  useBoardStore.setState({ harnessTopic: topic });
  return render(
    <Theme>
      <ArtifactsHarness />
      <Dialog />
    </Theme>,
  );
};
const dialog = () => within(screen.getByRole('dialog'));
const row = (name: string) => within(screen.getByText(name, { selector: '.item-name' }).closest('li')!);

describe('Artefatos do board: lista e abas', () => {
  it('cada assunto é uma aba, com a contagem por modo, âmbar quando há regra desligada', () => {
    renderTopic();
    const badge = (name: RegExp) => screen.getByRole('tab', { name }).querySelector('.topic-badge')?.textContent ?? null;
    expect(screen.getAllByRole('tab')).toHaveLength(4);
    expect(badge(/^Regras/)).toBe('1 sempre · 2 desligadas');
    expect(badge(/^Skills/)).toBe('3 pelo card');
    expect(badge(/^Agentes/)).toBeNull();
    expect(badge(/^Servidores MCP/)).toBe('1 pelo card');
    expect(screen.getByRole('tab', { name: /^Regras/ }).querySelector('.rt-Badge')).toHaveAttribute('data-accent-color', 'amber');
    expect(screen.getByRole('tab', { name: /^Skills/ }).querySelector('.rt-Badge')).not.toHaveAttribute('data-accent-color', 'amber');
  });

  it('a linha mostra o nome, a descrição, a origem e o que ficou de fora pelos limites', async () => {
    renderTopic();
    expect(row('estilo-de-codigo').getByText('Convenções de código')).toBeInTheDocument();
    expect(row('estilo-de-codigo').getByText('importado de ~/.claude/CLAUDE.md')).toBeInTheDocument();
    expect(row('antiga').getByText('origem ausente na cópia')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /^Skills/ }));
    expect(row('migracao').getByText('Um arquivo ficou de fora pelos limites: references/grande.bin')).toBeInTheDocument();
    expect(row('faz-ai-fluxo').getByText('gerada pelo board')).toBeInTheDocument();
  });

  it('o aviso das regras desligadas aparece só na aba Regras, enquanto houver alguma', async () => {
    renderTopic();
    expect(screen.getByText(/Há regras desligadas/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /^Skills/ }));
    expect(screen.queryByText(/Há regras desligadas/)).toBeNull();
    setState((s) => ({
      harness: { ...s.harness, library: { directory: '/lib', artifacts: ARTIFACTS.map((a) => ({ ...a, usage: 'contextual' as const })) } },
    }));
    await userEvent.click(screen.getByRole('tab', { name: /^Regras/ }));
    expect(screen.queryByText(/Há regras desligadas/)).toBeNull();
  });
});

describe('Artefatos do board: busca', () => {
  it('casa parte do nome ou da descrição, sem acento e sem diferenciar maiúsculas', async () => {
    renderTopic();
    const search = screen.getByRole('searchbox', { name: 'Buscar por nome ou descrição' });
    await userEvent.type(search, 'REVISAO');
    expect(screen.getByText('revisão-de-pr', { selector: '.item-name' })).toBeInTheDocument();
    expect(screen.queryByText('estilo-de-codigo', { selector: '.item-name' })).toBeNull();
    await userEvent.clear(search);
    await userEvent.type(search, 'convencoes');
    expect(screen.getByText('estilo-de-codigo', { selector: '.item-name' })).toBeInTheDocument();
    await userEvent.clear(search);
    await userEvent.type(search, 'zzz');
    expect(await screen.findByText('Nada encontrado para a busca.')).toBeInTheDocument();
  });

  it('a busca e a seleção de cada assunto sobrevivem à troca de aba', async () => {
    renderTopic();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar por nome ou descrição' }), 'estilo');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Selecionar: estilo-de-codigo' }));
    await userEvent.click(screen.getByRole('tab', { name: /^Skills/ }));
    expect(screen.getByRole('searchbox', { name: 'Buscar por nome ou descrição' })).toHaveValue('');
    await userEvent.click(screen.getByRole('tab', { name: /^Regras/ }));
    expect(screen.getByRole('searchbox', { name: 'Buscar por nome ou descrição' })).toHaveValue('estilo');
    expect(screen.getByRole('checkbox', { name: 'Selecionar: estilo-de-codigo' })).toBeChecked();
  });
});

describe('Artefatos do board: modo e lote', () => {
  it('o modo de uma linha grava pela identidade do artefato', async () => {
    renderTopic();
    await choose(screen.getByRole('combobox', { name: 'Modo no board: estilo-de-codigo' }), 'Pelo card');
    expect(lastSent('harness.selection.set')).toEqual({
      type: 'harness.selection.set',
      items: [{ kind: 'instructions', location: 'estilo-de-codigo' }],
      usage: 'contextual',
    });
    // a regra desligada oferece os três modos; a skill, só dois
    await userEvent.click(screen.getByRole('combobox', { name: 'Modo no board: revisão-de-pr' }));
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Desligado', 'Pelo card', 'Sempre']);
  });

  it('o lote muda o modo dos marcados de uma vez, com o local de origem de cada um', async () => {
    renderTopic('skill');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Selecionar todos os visíveis' }));
    expect(screen.getByText('3 selecionados')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sempre' }));
    expect(lastSent('harness.selection.set')).toEqual({
      type: 'harness.selection.set',
      items: [
        { kind: 'skill', location: 'board:migracao' },
        { kind: 'skill', location: 'board:publicar' },
        { kind: 'skill', location: 'board:faz-ai-fluxo' },
      ],
      usage: 'always',
    });
  });

  it('apagar em lote mostra a quantidade e o aviso, e só grava depois de confirmar', async () => {
    renderTopic('skill');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Selecionar: migracao' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Selecionar: publicar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Apagar (2)' }));
    expect(sentOf('harness.selection.set')).toHaveLength(0);
    expect(dialog().getByText('Apagar 2 artefatos do board?')).toBeInTheDocument();
    expect(dialog().getByText(/deixam de recebê-los/)).toBeInTheDocument();
    await userEvent.click(dialog().getByRole('button', { name: 'Apagar' }));
    expect(lastSent('harness.selection.set')).toEqual({
      type: 'harness.selection.set',
      items: [
        { kind: 'skill', location: 'board:migracao' },
        { kind: 'skill', location: 'board:publicar' },
      ],
      usage: null,
    });
  });

  it('o agente não tem modo: a linha diz que ele está disponível, e o lote só apaga', async () => {
    setState((s) => ({
      harness: {
        ...s.harness,
        library: { directory: '/lib', artifacts: [...ARTIFACTS, artifact({ kind: 'agent', name: 'revisor', description: 'Revisa' })] },
      },
    }));
    renderTopic('agent');
    expect(row('revisor').getByText('Disponível no board')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).toBeNull();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Selecionar: revisor' }));
    expect(screen.queryByText('Modo no board')).toBeNull();
    expect(screen.getByRole('button', { name: 'Apagar (1)' })).toBeInTheDocument();
  });
});

describe('Artefatos do board: editar e apagar', () => {
  it('apagar pede confirmação, avisa quem cita o artefato e grava a identidade', async () => {
    renderTopic();
    await userEvent.click(screen.getByRole('button', { name: 'Apagar: revisão-de-pr' }));
    expect(sentOf('harness.selection.set')).toHaveLength(0);
    expect(dialog().getByText(/deixam de recebê-lo/)).toBeInTheDocument();
    await userEvent.click(dialog().getByRole('button', { name: 'Apagar' }));
    expect(lastSent('harness.selection.set')).toEqual({
      type: 'harness.selection.set',
      items: [{ kind: 'instructions', location: 'revisão-de-pr' }],
      usage: null,
    });
  });

  it('Editar abre o editor na própria linha, um por vez; só a linha aberta monta o editor', async () => {
    renderTopic();
    expect(screen.queryByRole('form', { name: /regra/i })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Editar: estilo-de-codigo' }));
    expect(screen.getAllByLabelText('Editar regra')).toHaveLength(1);
    expect(lastSent('harness.artifact.read')).toMatchObject({ kind: 'rule', name: 'estilo-de-codigo' });
    await userEvent.click(screen.getByRole('button', { name: 'Editar: revisão-de-pr' }));
    expect(screen.getAllByLabelText('Editar regra')).toHaveLength(1);
    expect(lastSent('harness.artifact.read')).toMatchObject({ kind: 'rule', name: 'revisão-de-pr' });
    await userEvent.click(screen.getByRole('button', { name: 'Fechar edição: revisão-de-pr' }));
    expect(screen.queryByLabelText('Editar regra')).toBeNull();
  });

  it('a skill do fluxo só muda de modo: sem editar nem apagar', async () => {
    renderTopic('skill');
    expect(screen.getByRole('combobox', { name: 'Modo no board: faz-ai-fluxo' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar: faz-ai-fluxo' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Apagar: faz-ai-fluxo' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Editar: migracao' })).toBeInTheDocument();
  });

  it('o nome de uma regra abre o texto na modal de leitura', async () => {
    renderTopic();
    await userEvent.click(screen.getByRole('button', { name: 'estilo-de-codigo' }));
    expect(useBoardStore.getState().harnessFile).toEqual({ kind: 'rule', name: 'estilo-de-codigo' });
    useBoardStore.getState().closeHarnessFile();
  });
});

describe('Artefatos do board: vazio e importar', () => {
  it('sem artefatos do assunto, diz o que fazer e oferece Novo e Importar', async () => {
    setState((s) => ({ harness: { ...s.harness, library: { directory: '/lib', artifacts: [] } } }));
    renderTopic();
    expect(screen.getByText(/Nenhuma regra no board/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Nova regra/ })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Ações em lote' })).toBeNull();
    await userEvent.click(screen.getAllByRole('button', { name: 'Importar' })[0]!);
    expect(screen.getByRole('dialog', { name: /Importar artefatos para o board/ })).toBeInTheDocument();
  });

  it('os botões de criar variam por assunto', async () => {
    renderTopic();
    expect(screen.getByRole('button', { name: /Criar regra com ajuda/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sugerir regras com IA/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /^Skills/ }));
    expect(screen.getByRole('button', { name: /Criar skill com ajuda/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /^Servidores MCP/ }));
    expect(screen.getByRole('button', { name: /Novo servidor/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /com ajuda/ })).toBeNull();
    await userEvent.click(screen.getByRole('tab', { name: /^Agentes/ }));
    expect(screen.getByRole('button', { name: 'Sugerir agentes com IA' })).toBeInTheDocument();
  });
});
