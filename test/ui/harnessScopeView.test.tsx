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
    // o CLAUDE.md já existe: não é oferecido de novo
    expect(card('Regras principais').queryByRole('button', { name: 'Criar CLAUDE.md' })).toBeNull();
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
