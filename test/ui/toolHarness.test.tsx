import { choose, lastSent, posted, renderThemed, seedBoard, sentOf } from './setup';
import { beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { HarnessSelection } from '../../src/shared/harnessSelection';
import { HARNESS_CATALOG } from '../../src/shared/harnessCatalog';
import type { AiTool, HarnessItem } from '../../src/shared/harness';
import type { HarnessTopic } from '../../src/shared/harnessTopics';
import { ToolHarness } from '../../src/webview/components/settings/harness/ToolHarness';
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
  item({
    kind: 'instructions',
    name: 'CLAUDE.md',
    location: 'CLAUDE.md',
    source: sourceOf('claude', 'CLAUDE.md', 'main'),
    imports: [{ path: '/abs/docs/guia.md', location: 'docs/guia.md', depth: 1 }],
  }),
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
      harnessImports: [],
      harnessInstall: null,
    },
  });
});

/** Abre o assunto da ferramenta, e a origem quando não é Projeto (a que abre por padrão). */
const show = async (topic: HarnessTopic, origin?: string, tool: AiTool = 'claude') => {
  useBoardStore.setState({ harnessTopic: topic });
  const view = renderThemed(<ToolHarness tool={tool} />);
  if (origin) await userEvent.click(screen.getByRole('radio', { name: origin }));
  return view;
};

const card = (title: string) => within(document.querySelector<HTMLElement>(`.settings-card[aria-label="${title}"]`)!);
const titles = () => [...document.querySelectorAll('.settings-card h4')].map((h) => h.textContent);

describe('ToolHarness: assuntos', () => {
  it('uma aba por assunto, na ordem; só o assunto à vista é montado', async () => {
    await show('rules');
    const tabs = screen.getAllByRole('tab');
    ['Regras', 'Skills', 'Sub-agentes', 'MCPs', 'Comandos', 'Hooks', 'Demais'].forEach((name, i) =>
      expect(tabs[i], name).toHaveAccessibleName(new RegExp(`^${name}`)),
    );
    expect(tabs).toHaveLength(7);
    expect(screen.getByRole('tab', { name: /^Regras/ })).toHaveAttribute('aria-selected', 'true');
    // os grupos de outros assuntos nem existem na árvore: é isso que deixa a tela leve
    expect(titles()).toEqual(['Regras principais', 'Regras por assunto']);
    expect(document.querySelector('.settings-card[aria-label="Skills"]')).toBeNull();
    await userEvent.click(screen.getByRole('tab', { name: /^Skills/ }));
    expect(useBoardStore.getState().harnessTopic).toBe('skill');
    expect(titles()).toEqual(['Skills']);
    expect(document.querySelector('.settings-card[aria-label="Regras principais"]')).toBeNull();
  });

  it('a ferramenta do projeto leva o selo; a outra avisa que a marcação só vale para a do projeto', async () => {
    const { unmount } = await show('rules');
    expect(screen.getByText('ferramenta deste projeto')).toBeInTheDocument();
    unmount();
    await show('rules', undefined, 'cursor');
    expect(screen.queryByText('ferramenta deste projeto')).toBeNull();
    expect(screen.getByText(/Mostrando o que o Cursor carrega\. As execuções do board usam o Claude Code/)).toBeInTheDocument();
    expect(screen.getByText('não encontrada nesta máquina')).toBeInTheDocument();
  });

  it('abrir a aba relê as pastas, e a origem começa em Projeto', async () => {
    await show('rules');
    expect(sentOf('harness.refresh')).toHaveLength(1);
    expect(screen.getByRole('radio', { name: 'Projeto' })).toBeChecked();
    // sem pasta importada não há Importados
    const origins = screen.getAllByRole('radio');
    ['Board', 'Projeto', 'Global'].forEach((name, i) => expect(origins[i], name).toHaveAccessibleName(name));
    expect(origins).toHaveLength(3);
  });
});

describe('ToolHarness: Regras, Projeto', () => {
  it('agrupa na ordem, explica cada item numa frase e deixa a memória para Demais', async () => {
    await show('rules');
    const main = card('Regras principais');
    expect(main.getByText('Regras do projeto que o Claude Code lê no começo de toda conversa; vão no repositório.')).toBeInTheDocument();
    expect(main.getByText('sempre carregado')).toBeInTheDocument();
    // o CLAUDE.md global não aparece aqui
    expect(main.queryByRole('button', { name: '~/.claude/CLAUDE.md' })).toBeNull();
    expect(card('Regras por assunto').getByText('Estilo de código')).toBeInTheDocument();
    expect(titles()).not.toContain('Memória');
  });

  it('a memória do projeto fica em Demais, na origem Projeto, sem plugins nem organização', async () => {
    await show('other');
    expect(titles()[0]).toBe('Memória');
    expect(titles()).not.toContain('Plugins');
    expect(card('Memória').getByRole('button', { name: '~/.claude/projects/-abs/memory/MEMORY.md' })).toBeInTheDocument();
  });

  it('mostra o que o CLAUDE.md importa com @, e o importado abre no editor do board', async () => {
    await show('rules');
    const main = card('Regras principais');
    expect(main.getByText('Importa com @, e entram junto:')).toBeInTheDocument();
    await userEvent.click(main.getByRole('button', { name: 'docs/guia.md' }));
    expect(useBoardStore.getState().harnessFile).toBe('/abs/docs/guia.md');
    act(() => useBoardStore.getState().closeHarnessFile());
  });

  it('oferece criar os arquivos que a ferramenta leria e ainda não existem', async () => {
    await show('rules');
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

  it('num projeto sem regras, oferece só o CLAUDE.md, o CLAUDE.local.md e o AGENTS.md, cada um com a sua frase', async () => {
    setClaudeItems([]);
    await show('rules');
    const main = card('Regras principais');
    const offered = main.getAllByRole('button', { name: /^Criar / }).map((b) => b.textContent);
    expect(offered).toEqual(['Criar CLAUDE.md', 'Criar CLAUDE.local.md', 'Criar AGENTS.md']);
    expect(
      main.getByText('Suas regras pessoais para este projeto, lidas em toda conversa; ficam fora do repositório.'),
    ).toBeInTheDocument();
    expect(main.getByText(/lidas também pelo Cursor/)).toBeInTheDocument();
  });

  it('com AGENTS.md e sem CLAUDE.md, avisa que criar um CLAUDE.md faz o Claude Code parar de lê-lo', async () => {
    setClaudeItems([agentsMd]);
    await show('rules');
    const main = card('Regras principais');
    expect(
      main.getByText(/Criar um CLAUDE.md ou CLAUDE.local.md faz ele parar de ler, a menos que o arquivo novo importe com @AGENTS.md/),
    ).toBeInTheDocument();
    expect(main.getByRole('button', { name: 'Criar CLAUDE.md' })).toBeInTheDocument();
    expect(main.getByText('sempre carregado')).toBeInTheDocument();
    expect(main.queryByText('não lido pelo Claude Code')).toBeNull();
  });

  it('com CLAUDE.md e AGENTS.md, marca o AGENTS.md como não lido e diz como importar', async () => {
    setClaudeItems([CLAUDE_ITEMS[0]!, agentsMd]);
    await show('rules');
    const main = card('Regras principais');
    expect(main.getByText('não lido pelo Claude Code')).toBeInTheDocument();
    expect(main.getByText(/porque o projeto tem CLAUDE.md. Para ler os dois, importe com @AGENTS.md no CLAUDE.md/)).toBeInTheDocument();
    // só o CLAUDE.md continua sempre carregado
    expect(main.getAllByText('sempre carregado')).toHaveLength(1);
    expect(main.queryByText(/faz ele parar de ler/)).toBeNull();
  });

  it('com o AGENTS.md importado pelo CLAUDE.md, ele não aparece como não lido', async () => {
    const claude = { ...CLAUDE_ITEMS[0]!, imports: [{ path: agentsMd.path, location: 'AGENTS.md', depth: 1 }] };
    setClaudeItems([claude, agentsMd]);
    await show('rules');
    expect(card('Regras principais').queryByText('não lido pelo Claude Code')).toBeNull();
  });

  it('no Cursor, o AGENTS.md não tem o aviso do Claude Code, e a marcação das execuções não aparece', async () => {
    await show('rules', undefined, 'cursor');
    expect(card('Regras principais').queryByText(/faz ele parar de ler/)).toBeNull();
    expect(card('Regras principais').getByRole('button', { name: 'Criar AGENTS.md' })).toBeInTheDocument();
    expect(card('Regras por assunto').getByText('Nada aqui ainda.')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /Modo no board/ })).toBeNull();
    // a outra ferramenta não tem a origem Board: o board só marca a do projeto
    expect(screen.queryByRole('radio', { name: 'Board' })).toBeNull();
  });

  it('na ferramenta do projeto, cada regra tem o seletor de modo no board', async () => {
    await show('rules');
    expect(card('Regras principais').getByRole('combobox', { name: 'Modo no board: CLAUDE.md' })).toHaveTextContent('Fora do board');
  });
});

describe('ToolHarness: Global', () => {
  it('mostra a pasta do usuário, os plugins e a organização, sem a memória do projeto', async () => {
    const s = useBoardStore.getState().state!;
    const policy = HARNESS_CATALOG.claude.findIndex((x) => x.base === 'managed' && x.kind === 'instructions');
    useBoardStore.setState({
      state: {
        ...s,
        harness: {
          ...s.harness,
          inventory: [
            {
              tool: 'claude',
              installed: true,
              items: [
                ...CLAUDE_ITEMS,
                item({
                  kind: 'skill',
                  scope: 'plugin',
                  plugin: 'figma',
                  name: 'figma-design',
                  location: '~/.claude/plugins/figma/skills/figma-design/SKILL.md',
                  layout: 'skills',
                }),
                item({
                  kind: 'instructions',
                  scope: 'user',
                  name: 'CLAUDE.md',
                  location: '/etc/claude-code/CLAUDE.md',
                  path: '/etc/claude-code/CLAUDE.md',
                  source: policy,
                }),
              ],
            },
            { tool: 'cursor', installed: true, items: [] },
          ],
        },
      },
    });
    const { unmount } = await show('rules', 'Global');
    expect(card('Regras principais').getByRole('button', { name: '~/.claude/CLAUDE.md' })).toBeInTheDocument();
    unmount();
    await show('other', 'Global');
    expect(titles()).not.toContain('Memória');
    // um bloco por plugin, com o que ele traz
    expect(card('Plugins').getByText('figma', { selector: 'summary .item-name' })).toBeInTheDocument();
    expect(card('Plugins').getByText('figma-design')).toBeInTheDocument();
    expect(card('Organização').getByRole('button', { name: '/etc/claude-code/CLAUDE.md' })).toBeInTheDocument();
    // a política da organização não se cria nem se apaga daqui
    expect(card('Organização').queryByRole('button', { name: 'Apagar' })).toBeNull();
    expect(titles().indexOf('Organização')).toBe(titles().length - 1);
  });

  it('no Cursor, o que não fica em arquivo aparece como aviso no grupo', async () => {
    const { unmount } = await show('rules', 'Global', 'cursor');
    const main = card('Regras principais');
    expect(main.getByText('User Rules')).toBeInTheDocument();
    expect(main.getByText('sem arquivo')).toBeInTheDocument();
    unmount();
    await show('other', 'Global', 'cursor');
    expect(card('Organização').getByText('Team Rules')).toBeInTheDocument();
  });
});

describe('ToolHarness: aviso do Cursor', () => {
  it('a aba do Cursor avisa que a linha de comando não desliga artefatos; a do Claude Code, não', async () => {
    const { unmount } = await show('rules', undefined, 'cursor');
    const notice = screen.getByText(/A linha de comando do Cursor não desliga artefatos/);
    expect(notice).toHaveTextContent(/desligue nas configurações do Cursor ou remova do projeto/);
    expect(notice).toHaveTextContent(/O board só avisa/);
    unmount();
    await show('rules');
    expect(screen.queryByText(/não desliga artefatos/)).toBeNull();
  });
});

describe('ToolHarness: busca', () => {
  const skill = (name: string, description = '') =>
    item({
      kind: 'skill',
      name,
      description,
      location: `.claude/skills/${name}/SKILL.md`,
      layout: 'skills',
      mode: 'auto',
      source: sourceOf('claude', '.claude/skills'),
    });

  it('filtra o catálogo por parte do nome ou da descrição, sem diferenciar acento', async () => {
    setClaudeItems([skill('commit', 'Mensagem de commit'), skill('revisar'), skill('banco', 'Escreve uma migração nova')]);
    await show('skill');
    const names = () => [...document.querySelectorAll('.item-name')].map((x) => x.textContent);
    expect(names()).toEqual(['commit', 'revisar', 'banco']);
    const search = screen.getByRole('searchbox', { name: 'Buscar por nome ou descrição' });
    await userEvent.type(search, 'REVIS');
    expect(names()).toEqual(['revisar']);
    await userEvent.clear(search);
    await userEvent.type(search, 'migracao');
    expect(names()).toEqual(['banco']);
    await userEvent.clear(search);
    await userEvent.type(search, 'nada disso');
    expect(names()).toEqual([]);
    expect(screen.getByText('Nada encontrado para a busca.')).toBeInTheDocument();
  });
});

describe('ToolHarness: origem Board', () => {
  const skill = (name: string, over: Partial<HarnessItem> = {}) =>
    item({
      kind: 'skill',
      name,
      description: `Descrição de ${name}`,
      location: `.claude/skills/${name}/SKILL.md`,
      layout: 'skills',
      mode: 'auto',
      source: sourceOf('claude', '.claude/skills'),
      ...over,
    });
  const select = (selection: HarnessSelection[]) => {
    const s = useBoardStore.getState().state!;
    useBoardStore.setState({ state: { ...s, harnessSelection: selection } });
  };

  it('lista o que está no board com o modo, a origem e o botão de remover; o que não está fica de fora', async () => {
    setClaudeItems([skill('commit'), skill('revisar', { scope: 'user', location: '~/.claude/skills/revisar/SKILL.md' }), skill('fora')]);
    select([
      { kind: 'skill', location: '.claude/skills/commit/SKILL.md', usage: 'always' },
      { kind: 'skill', location: '~/.claude/skills/revisar/SKILL.md', usage: 'contextual' },
    ]);
    await show('skill', 'Board');
    const rows = [...document.querySelectorAll('.item-row')];
    expect(rows).toHaveLength(2);
    const commit = within(rows[0] as HTMLElement);
    expect(commit.getByText('Projeto')).toBeInTheDocument();
    expect(commit.getByRole('combobox', { name: 'Modo no board: commit' })).toHaveTextContent('Sempre');
    // no board o item já está lá: o seletor só troca o modo
    await userEvent.click(commit.getByRole('combobox', { name: 'Modo no board: commit' }));
    expect(screen.queryByRole('option', { name: 'Fora do board' })).toBeNull();
    await userEvent.click(await screen.findByRole('option', { name: 'Pelo card' }));
    expect(lastSent('harness.selection.set')).toEqual({
      type: 'harness.selection.set',
      items: [{ kind: 'skill', location: '.claude/skills/commit/SKILL.md' }],
      usage: 'contextual',
    });
    const revisar = within(rows[1] as HTMLElement);
    expect(revisar.getByText('Global')).toBeInTheDocument();
    await userEvent.click(revisar.getByRole('button', { name: 'Remover do board: revisar' }));
    expect(lastSent('harness.selection.set')).toEqual({
      type: 'harness.selection.set',
      items: [{ kind: 'skill', location: '~/.claude/skills/revisar/SKILL.md' }],
      usage: null,
    });
  });

  it('as regras aparecem desligadas, com o aviso para revisar o texto antes de ativar', async () => {
    select([{ kind: 'instructions', location: 'CLAUDE.md', usage: 'off' }]);
    await show('rules', 'Board');
    expect(screen.getByText(/As regras entram desligadas/)).toBeInTheDocument();
    const row = within(document.querySelector('.item-row') as HTMLElement);
    expect(row.getByRole('combobox', { name: 'Modo no board: CLAUDE.md' })).toHaveTextContent('Desligado');
    await choose(row.getByRole('combobox', { name: 'Modo no board: CLAUDE.md' }), 'Sempre');
    expect(lastSent('harness.selection.set').usage).toBe('always');
  });

  it('um artefato cuja origem sumiu aparece como ausente na mesma lista e pode ser removido', async () => {
    setClaudeItems([skill('commit')]);
    select([
      { kind: 'skill', location: '.claude/skills/commit/SKILL.md', usage: 'contextual' },
      { kind: 'skill', location: '.claude/skills/sumida/SKILL.md', usage: 'contextual' },
      { kind: 'instructions', location: 'outra-regra.md', usage: 'off' },
    ]);
    await show('skill', 'Board');
    const missing = within(screen.getByText('.claude/skills/sumida/SKILL.md').closest('li')!);
    expect(missing.getByText('ausente')).toBeInTheDocument();
    // a marcação de outro tipo não aparece aqui
    expect(screen.queryByText('outra-regra.md')).toBeNull();
    await userEvent.click(missing.getByRole('button', { name: 'Remover do board: .claude/skills/sumida/SKILL.md' }));
    expect(lastSent('harness.selection.set')).toEqual({
      type: 'harness.selection.set',
      items: [{ kind: 'skill', location: '.claude/skills/sumida/SKILL.md' }],
      usage: null,
    });
  });

  it('a busca vale também no board', async () => {
    setClaudeItems([skill('commit'), skill('revisar')]);
    select([
      { kind: 'skill', location: '.claude/skills/commit/SKILL.md', usage: 'contextual' },
      { kind: 'skill', location: '.claude/skills/revisar/SKILL.md', usage: 'contextual' },
    ]);
    await show('skill', 'Board');
    expect(document.querySelectorAll('.item-row')).toHaveLength(2);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar por nome ou descrição' }), 'revis');
    expect(document.querySelectorAll('.item-row')).toHaveLength(1);
    expect(screen.getByText('revisar', { selector: '.item-name' })).toBeInTheDocument();
  });

  it('um assunto vazio no board orienta a enviar do catálogo', async () => {
    await show('skill', 'Board');
    expect(screen.getByText(/Nada neste assunto foi enviado ao board/)).toBeInTheDocument();
  });

  it('os sub-agentes do board aparecem como disponíveis, sem seletor de modo', async () => {
    setClaudeItems([
      item({ kind: 'agent', name: 'revisor', location: '.claude/agents/revisor.md', layout: 'files', description: 'Revisa' }),
    ]);
    select([{ kind: 'agent', location: '.claude/agents/revisor.md', usage: 'contextual' }]);
    await show('agent', 'Board');
    const row = within(document.querySelector('.item-row') as HTMLElement);
    expect(row.getByText('Disponível no board')).toBeInTheDocument();
    expect(row.queryByRole('combobox')).toBeNull();
    await userEvent.click(row.getByRole('button', { name: 'Remover do board: revisor' }));
    expect(lastSent('harness.selection.set').usage).toBeNull();
  });
});

describe('ToolHarness: ações em massa', () => {
  const skill = (name: string) =>
    item({
      kind: 'skill',
      name,
      location: `.claude/skills/${name}/SKILL.md`,
      layout: 'skills',
      mode: 'auto',
      source: sourceOf('claude', '.claude/skills'),
    });
  const hook = (command: string) =>
    item({
      kind: 'hook',
      name: 'PreToolUse',
      detail: command,
      location: '.claude/settings.json',
      path: '/abs/.claude/settings.json',
      layout: 'entry',
      source: HARNESS_CATALOG.claude.findIndex((s) => s.group === 'hook' && s.scope === 'project' && s.path === '.claude/settings.json'),
    });

  it('o do topo marca todos, e "Enviar para o board" manda os marcados com o modo de entrada do tipo', async () => {
    setClaudeItems([skill('commit'), skill('revisar')]);
    await show('skill');
    const skills = card('Skills');
    await userEvent.click(skills.getByRole('checkbox', { name: 'Selecionar todos: Skills' }));
    expect(skills.getByRole('checkbox', { name: 'Selecionar commit' })).toBeChecked();
    expect(skills.getByRole('checkbox', { name: 'Selecionar revisar' })).toBeChecked();
    expect(skills.getByText('2 marcados')).toBeInTheDocument();
    // nada está no board ainda: não há o que remover
    expect(skills.queryByRole('button', { name: /Remover do board/ })).toBeNull();
    await userEvent.click(skills.getByRole('button', { name: 'Enviar para o board' }));
    expect(lastSent('harness.selection.set')).toEqual({
      type: 'harness.selection.set',
      items: [
        { kind: 'skill', location: '.claude/skills/commit/SKILL.md' },
        { kind: 'skill', location: '.claude/skills/revisar/SKILL.md' },
      ],
      usage: 'contextual',
    });
    // feita a ação, a seleção é limpa
    expect(skills.getByRole('checkbox', { name: 'Selecionar commit' })).not.toBeChecked();
  });

  it('as regras são enviadas desligadas, para a pessoa revisar antes de ativar', async () => {
    await show('rules');
    const main = card('Regras principais');
    await userEvent.click(main.getByRole('checkbox', { name: 'Selecionar CLAUDE.md' }));
    await userEvent.click(main.getByRole('button', { name: 'Enviar para o board' }));
    expect(lastSent('harness.selection.set')).toEqual({
      type: 'harness.selection.set',
      items: [{ kind: 'instructions', location: 'CLAUDE.md' }],
      usage: 'off',
    });
  });

  it('o que já está no board não é reenviado: o botão diz para quantos vale e "Remover do board" tira só esses', async () => {
    setClaudeItems([skill('commit'), skill('revisar')]);
    const s = useBoardStore.getState().state!;
    useBoardStore.setState({
      state: { ...s, harnessSelection: [{ kind: 'skill', location: '.claude/skills/commit/SKILL.md', usage: 'always' }] },
    });
    await show('skill');
    const skills = card('Skills');
    await userEvent.click(skills.getByRole('checkbox', { name: 'Selecionar todos: Skills' }));
    await userEvent.click(skills.getByRole('button', { name: 'Enviar para o board (1)' }));
    expect(lastSent('harness.selection.set').items).toEqual([{ kind: 'skill', location: '.claude/skills/revisar/SKILL.md' }]);
    await userEvent.click(skills.getByRole('checkbox', { name: 'Selecionar todos: Skills' }));
    await userEvent.click(skills.getByRole('button', { name: 'Remover do board (1)' }));
    expect(lastSent('harness.selection.set')).toEqual({
      type: 'harness.selection.set',
      items: [{ kind: 'skill', location: '.claude/skills/commit/SKILL.md' }],
      usage: null,
    });
  });

  it('definir o modo vale para todos os marcados', async () => {
    setClaudeItems([skill('commit'), skill('revisar')]);
    await show('skill');
    const skills = card('Skills');
    await userEvent.click(skills.getByRole('checkbox', { name: 'Selecionar todos: Skills' }));
    await userEvent.click(skills.getByRole('button', { name: 'Sempre' }));
    expect(lastSent('harness.selection.set').usage).toBe('always');
    expect(lastSent('harness.selection.set').items).toHaveLength(2);
  });

  it('nas skills, muda o modo de invocação das marcadas', async () => {
    setClaudeItems([skill('commit'), skill('revisar')]);
    await show('skill');
    const skills = card('Skills');
    await userEvent.click(skills.getByRole('checkbox', { name: 'Selecionar revisar' }));
    expect(skills.getByRole('checkbox', { name: 'Selecionar todos: Skills' })).toHaveAttribute('data-state', 'indeterminate');
    await userEvent.click(skills.getByRole('button', { name: 'Só quando indicada' }));
    expect(lastSent('harness.skill.setMode')).toMatchObject({ paths: ['/abs/.claude/skills/revisar/SKILL.md'], mode: 'manual' });
  });

  it('apagar pede confirmação antes e só então apaga todos', async () => {
    setClaudeItems([skill('commit'), skill('revisar')]);
    await show('skill');
    const skills = card('Skills');
    await userEvent.click(skills.getByRole('checkbox', { name: 'Selecionar todos: Skills' }));
    const bar = within(skills.getByRole('toolbar', { name: 'Ações nos itens marcados' }));
    await userEvent.click(bar.getByRole('button', { name: 'Apagar' }));
    const dialog = useBoardStore.getState().dialog!;
    expect(dialog.title).toBe('Apagar 2 itens?');
    expect(sentOf('harness.item.delete')).toEqual([]);
    act(() => dialog.onConfirm());
    expect(sentOf('harness.item.delete').map((m) => m.path)).toEqual([
      '/abs/.claude/skills/commit/SKILL.md',
      '/abs/.claude/skills/revisar/SKILL.md',
    ]);
  });

  it('nos hooks, a ação é remover as entradas do arquivo, também com confirmação', async () => {
    setClaudeItems([hook('npm test'), hook('npm run lint')]);
    await show('hook');
    const hooks = card('Hooks');
    await userEvent.click(hooks.getByRole('checkbox', { name: 'Selecionar todos: Hooks' }));
    // hook não vai ao board, nem tem modo ou cópia
    expect(hooks.queryByRole('button', { name: 'Sempre' })).toBeNull();
    expect(hooks.queryByRole('button', { name: 'Enviar para o board' })).toBeNull();
    expect(hooks.queryByRole('button', { name: 'Apagar' })).toBeNull();
    await userEvent.click(hooks.getByRole('button', { name: 'Remover' }));
    act(() => useBoardStore.getState().dialog!.onConfirm());
    expect(sentOf('harness.hook.remove').map((m) => m.command)).toEqual(['npm test', 'npm run lint']);
  });

  it('o assunto de hooks não tem a origem Board', async () => {
    await show('hook');
    expect(screen.queryByRole('radio', { name: 'Board' })).toBeNull();
  });

  it('o que não tem ação em massa fica sem caixa', async () => {
    setClaudeItems([
      item({
        kind: 'settings',
        name: 'settings.json',
        location: '.claude/settings.json',
        source: sourceOf('claude', '.claude/settings.json', 'settings'),
      }),
    ]);
    await show('other');
    expect(card('Configurações e permissões').queryByRole('checkbox')).toBeNull();
  });
});

describe('ToolHarness: Importados', () => {
  const DIR = '/abs/colecao';
  const imported = (name: string, kind: HarnessItem['kind'] = 'skill'): HarnessItem =>
    item({
      kind,
      scope: 'imported',
      name,
      description: `Importada: ${name}`,
      location: `${DIR}/${name}/SKILL.md`,
      path: `${DIR}/${name}/SKILL.md`,
      layout: kind === 'skill' ? 'skills' : 'files',
      ...(kind === 'skill' ? { mode: 'auto' as const } : {}),
    });
  const withImports = (items: HarnessItem[]) => {
    setClaudeItems([...CLAUDE_ITEMS, ...items]);
    const s = useBoardStore.getState().state!;
    useBoardStore.setState({ state: { ...s, harnessImports: [{ tool: 'claude', dir: DIR }] } });
  };

  it('a origem só existe com pasta importada; lista as pastas e os artefatos achados nelas', async () => {
    await show('skill');
    expect(screen.queryByRole('radio', { name: 'Importados' })).toBeNull();
    cleanup();
    withImports([imported('externa')]);
    await show('skill', 'Importados');
    expect(screen.getByText('Pastas importadas:')).toBeInTheDocument();
    expect(screen.getByText(DIR)).toBeInTheDocument();
    expect(card('Skills').getByText('externa')).toBeInTheDocument();
    // a skill importada não aparece em Projeto
    await userEvent.click(screen.getByRole('radio', { name: 'Projeto' }));
    expect(screen.queryByText('externa', { selector: '.item-name' })).toBeNull();
  });

  it('um artefato importado vai ao board como qualquer outro', async () => {
    withImports([imported('externa')]);
    await show('skill', 'Importados');
    const skills = card('Skills');
    await userEvent.click(skills.getByRole('checkbox', { name: 'Selecionar externa' }));
    await userEvent.click(skills.getByRole('button', { name: 'Enviar para o board' }));
    expect(lastSent('harness.selection.set')).toEqual({
      type: 'harness.selection.set',
      items: [{ kind: 'skill', location: `${DIR}/externa/SKILL.md` }],
      usage: 'contextual',
    });
  });

  it('remover a pasta pede confirmação e diz que os artefatos dela saem do board', async () => {
    withImports([imported('externa')]);
    await show('skill', 'Importados');
    await userEvent.click(screen.getByRole('button', { name: `Remover pasta: ${DIR}` }));
    const dialog = useBoardStore.getState().dialog!;
    expect(dialog.message).toMatch(/Os artefatos dela saem do board/);
    expect(sentOf('harness.import.remove')).toEqual([]);
    act(() => dialog.onConfirm());
    expect(lastSent('harness.import.remove')).toEqual({ type: 'harness.import.remove', tool: 'claude', dir: DIR });
  });

  it('o botão "Importar artefatos" abre o seletor de pasta do editor', async () => {
    posted.mockClear();
    await show('skill');
    await userEvent.click(screen.getByRole('button', { name: 'Importar artefatos' }));
    expect(lastSent('harness.import.pick')).toEqual({ type: 'harness.import.pick', tool: 'claude' });
  });
});

describe('ToolHarness: plugins', () => {
  const plugin = (name: string, id: string, scopes: string[], enabled = true): HarnessItem =>
    item({
      kind: 'plugin',
      scope: 'plugin',
      name,
      plugin: name,
      layout: 'entry',
      location: `~/.claude/plugins/${name}/.claude-plugin/plugin.json`,
      install: { id, scopes, enabled, dir: `/home/.claude/plugins/${name}` },
    });

  it('o do topo marca os plugins, e desativar vai pela ferramenta', async () => {
    setClaudeItems([plugin('design', 'design@synced', ['synced']), plugin('fmt', 'fmt@loja', ['user'])]);
    await show('other', 'Global');
    const plugins = card('Plugins');
    expect(plugins.getByText('sincronizado do claude.ai')).toBeInTheDocument();
    await userEvent.click(plugins.getByRole('checkbox', { name: 'Selecionar todos: Plugins' }));
    // o sincronizado não se desinstala: o botão diz para quantos vale
    expect(plugins.getByRole('button', { name: 'Desinstalar (1)' })).toBeInTheDocument();
    await userEvent.click(plugins.getByRole('button', { name: 'Desativar' }));
    expect(lastSent('harness.plugin.apply')).toEqual({
      type: 'harness.plugin.apply',
      tool: 'claude',
      action: 'disable',
      ids: ['design@synced', 'fmt@loja'],
    });
    expect(plugins.getByText('Aplicando pela ferramenta…')).toBeInTheDocument();
  });

  it('desinstalar pede confirmação antes', async () => {
    setClaudeItems([plugin('fmt', 'fmt@loja', ['user'], false)]);
    await show('other', 'Global');
    const plugins = card('Plugins');
    expect(plugins.getByText('desativado')).toBeInTheDocument();
    await userEvent.click(plugins.getByRole('checkbox', { name: 'Selecionar fmt' }));
    expect(plugins.getByRole('button', { name: 'Ativar' })).toBeInTheDocument();
    await userEvent.click(plugins.getByRole('button', { name: 'Desinstalar' }));
    const dialog = useBoardStore.getState().dialog!;
    expect(dialog.title).toBe('Desinstalar "fmt"?');
    expect(sentOf('harness.plugin.apply')).toEqual([]);
    act(() => dialog.onConfirm());
    expect(lastSent('harness.plugin.apply')).toMatchObject({ action: 'uninstall', ids: ['fmt@loja'] });
  });

  it('sem saber como o plugin foi instalado, ele fica sem caixa', async () => {
    setClaudeItems([{ ...plugin('velho', 'x', []), install: undefined }]);
    await show('other', 'Global');
    expect(card('Plugins').queryByRole('checkbox')).toBeNull();
  });
});
