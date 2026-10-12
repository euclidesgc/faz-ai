import { lastSent, renderThemed, seedBoard } from './setup';
import { beforeEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HARNESS_CATALOG } from '../../src/shared/harnessCatalog';
import type { AiTool, HarnessItem } from '../../src/shared/harness';
import { HarnessScopeView } from '../../src/webview/components/settings/harness/HarnessScopeView';
import { useBoardStore } from '../../src/webview/store/boardStore';

/** Índice da fonte do catálogo pelo caminho, no escopo e no grupo pedidos. */
const sourceOf = (tool: AiTool, path: string, group?: string) =>
  HARNESS_CATALOG[tool].findIndex((s) => s.path === path && (!group || s.group === group));

const item = (over: Partial<HarnessItem> & Pick<HarnessItem, 'name' | 'kind' | 'location'>): HarnessItem => ({
  scope: 'project',
  description: '',
  path: `/abs/${over.location}`,
  layout: 'file',
  ...over,
});

const CLAUDE_ITEMS: HarnessItem[] = [
  item({ kind: 'instructions', name: 'CLAUDE.md', location: 'CLAUDE.md', source: sourceOf('claude', 'CLAUDE.md', 'main') }),
  item({
    kind: 'instructions',
    name: 'estilo',
    location: '.claude/rules/estilo.md',
    layout: 'files',
    description: 'Estilo de código',
    source: sourceOf('claude', '.claude/rules'),
  }),
  item({
    kind: 'memory',
    scope: 'user',
    name: 'MEMORY',
    location: '~/.claude/projects/-abs/memory/MEMORY.md',
    layout: 'files',
    source: HARNESS_CATALOG.claude.findIndex((s) => s.group === 'memory'),
  }),
  item({
    kind: 'instructions',
    scope: 'user',
    name: 'CLAUDE.md',
    location: '~/.claude/CLAUDE.md',
    path: '/home/.claude/CLAUDE.md',
    source: HARNESS_CATALOG.claude.findIndex((s) => s.scope === 'user' && s.path === '.claude/CLAUDE.md'),
  }),
];

const agentsMd = item({ kind: 'instructions', name: 'AGENTS.md', location: 'AGENTS.md', source: sourceOf('claude', 'AGENTS.md', 'main') });

/** Troca os itens do Claude Code no inventário. */
const setClaudeItems = (items: HarnessItem[]) => {
  const s = useBoardStore.getState().state!;
  useBoardStore.setState({
    state: { ...s, harness: { ...s.harness, inventory: s.harness.inventory.map((x) => (x.tool === 'claude' ? { ...x, items } : x)) } },
  });
};

beforeEach(async () => {
  await seedBoard();
  const s = useBoardStore.getState().state!;
  useBoardStore.setState({
    state: {
      ...s,
      board: { ...s.board, aiTool: 'claude' },
      harness: {
        rules: [],
        skills: [],
        agents: [],
        inventory: [
          { tool: 'claude', installed: true, items: CLAUDE_ITEMS },
          { tool: 'cursor', installed: false, items: [] },
        ],
      },
      harnessSelection: [],
      harnessInstall: null,
    },
  });
});

const card = (title: string) => within(document.querySelector<HTMLElement>(`.settings-card[aria-label="${title}"]`)!);
const titles = () => [...document.querySelectorAll('.settings-card h4')].map((h) => h.textContent);

describe('HarnessScopeView: Projeto', () => {
  it('agrupa na ordem, explica cada item numa frase e mostra a memória do projeto', () => {
    renderThemed(<HarnessScopeView scope="project" />);
    expect(titles().slice(0, 4)).toEqual(['Regras principais', 'Regras por assunto', 'Memória', 'Skills']);
    // plugins e organização são da aba Global
    expect(titles()).not.toContain('Plugins');
    const main = card('Regras principais');
    expect(main.getByText('Regras do projeto que o Claude Code lê no começo de toda conversa; vão no repositório.')).toBeInTheDocument();
    expect(main.getByText('sempre carregado')).toBeInTheDocument();
    // o CLAUDE.md global não aparece aqui
    expect(main.queryByRole('button', { name: '~/.claude/CLAUDE.md' })).toBeNull();
    expect(card('Regras por assunto').getByText('Estilo de código')).toBeInTheDocument();
    expect(card('Memória').getByRole('button', { name: '~/.claude/projects/-abs/memory/MEMORY.md' })).toBeInTheDocument();
  });

  it('oferece criar os arquivos que a ferramenta leria e ainda não existem', async () => {
    renderThemed(<HarnessScopeView scope="project" />);
    await userEvent.click(card('Regras principais').getByRole('button', { name: 'Criar CLAUDE.local.md' }));
    expect(lastSent('harness.item.create')).toEqual({
      type: 'harness.item.create',
      tool: 'claude',
      source: sourceOf('claude', 'CLAUDE.local.md'),
      name: '',
      description: '',
    });
    // o CLAUDE.md já existe: não é oferecido de novo; os lugares alternativos e o AGENTS.md também não
    for (const path of ['CLAUDE.md', '.claude/CLAUDE.md', 'AGENTS.md', '.claude/AGENTS.md'])
      expect(card('Regras principais').queryByRole('button', { name: `Criar ${path}` })).toBeNull();
  });

  it('num projeto sem regras, oferece só o CLAUDE.md, o CLAUDE.local.md e o AGENTS.md, cada um com a sua frase', () => {
    setClaudeItems([]);
    renderThemed(<HarnessScopeView scope="project" />);
    const main = card('Regras principais');
    const offered = main.getAllByRole('button', { name: /^Criar / }).map((b) => b.textContent);
    expect(offered).toEqual(['Criar CLAUDE.md', 'Criar CLAUDE.local.md', 'Criar AGENTS.md']);
    expect(
      main.getByText('Suas regras pessoais para este projeto, lidas em toda conversa; ficam fora do repositório.'),
    ).toBeInTheDocument();
    expect(main.getByText(/lidas também pelo Cursor/)).toBeInTheDocument();
  });

  it('com AGENTS.md e sem CLAUDE.md, avisa que criar um CLAUDE.md faz o Claude Code parar de lê-lo', () => {
    setClaudeItems([agentsMd]);
    renderThemed(<HarnessScopeView scope="project" />);
    const main = card('Regras principais');
    expect(
      main.getByText(/Criar um CLAUDE.md ou CLAUDE.local.md faz ele parar de ler, a menos que o arquivo novo importe com @AGENTS.md/),
    ).toBeInTheDocument();
    expect(main.getByRole('button', { name: 'Criar CLAUDE.md' })).toBeInTheDocument();
    expect(main.getByText('sempre carregado')).toBeInTheDocument();
    expect(main.queryByText('não lido pelo Claude Code')).toBeNull();
  });

  it('com CLAUDE.md e AGENTS.md, marca o AGENTS.md como não lido e diz como importar', () => {
    setClaudeItems([CLAUDE_ITEMS[0]!, agentsMd]);
    renderThemed(<HarnessScopeView scope="project" />);
    const main = card('Regras principais');
    expect(main.getByText('não lido pelo Claude Code')).toBeInTheDocument();
    expect(main.getByText(/porque o projeto tem CLAUDE.md. Para ler os dois, importe com @AGENTS.md no CLAUDE.md/)).toBeInTheDocument();
    // só o CLAUDE.md continua sempre carregado
    expect(main.getAllByText('sempre carregado')).toHaveLength(1);
    expect(main.queryByText(/faz ele parar de ler/)).toBeNull();
  });

  it('no Cursor, o AGENTS.md não tem o aviso do Claude Code', async () => {
    renderThemed(<HarnessScopeView scope="project" />);
    await userEvent.click(screen.getByRole('radio', { name: 'Cursor' }));
    expect(card('Regras principais').queryByText(/faz ele parar de ler/)).toBeNull();
  });

  it('o seletor mostra a outra ferramenta, sem a marcação das execuções', async () => {
    renderThemed(<HarnessScopeView scope="project" />);
    expect(card('Regras principais').getByRole('combobox', { name: 'Uso nas execuções do board: CLAUDE.md' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Cursor' }));
    expect(screen.getByText('não encontrada nesta máquina')).toBeInTheDocument();
    expect(card('Regras principais').getByRole('button', { name: 'Criar AGENTS.md' })).toBeInTheDocument();
    expect(card('Regras por assunto').getByText('Nada aqui ainda.')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /Uso nas execuções do board/ })).toBeNull();
  });
});
