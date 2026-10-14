import { choose, lastSent, posted, seedBoard, sentOf } from './setup';
import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Theme } from '@radix-ui/themes';
import { Dialog } from '../../src/webview/components/Dialog';
import { ToolHarness } from '../../src/webview/components/settings/harness/ToolHarness';
import type { HarnessTopic } from '../../src/shared/harnessTopics';
import type { AiTool } from '../../src/shared/harness';
import { useBoardStore } from '../../src/webview/store/boardStore';
import type { HarnessItem, ToolInventory } from '../../src/shared/harness';
import { createTargets, hookTargets, mcpTargets, permissionTargets } from '../../src/shared/harnessCatalog';

const GLOBAL_WARNING = 'O arquivo fica na sua pasta de usuário e vale para todos os seus projetos.';

const skill = (name: string, scope: 'project' | 'user', files: string[] = []): HarnessItem => {
  const base = scope === 'user' ? '~/.claude/skills' : '.claude/skills';
  return {
    kind: 'skill',
    scope,
    name,
    description: `Descrição de ${name}`,
    path: `/abs/${base}/${name}/SKILL.md`,
    location: `${base}/${name}/SKILL.md`,
    layout: 'skills',
    mode: 'auto',
    files,
    digest: name,
  };
};

// inventário fixo: a varredura real leria a pasta do usuário de quem roda o teste
const INVENTORY: ToolInventory[] = [
  {
    tool: 'claude',
    installed: true,
    items: [
      skill('revisar-spec', 'project', ['references/modelo.md']),
      skill('global-skill', 'user'),
      {
        kind: 'agent',
        scope: 'project',
        name: 'revisor',
        description: 'Revisa',
        path: '/abs/.claude/agents/revisor.md',
        location: '.claude/agents/revisor.md',
        layout: 'files',
      },
    ],
  },
  { tool: 'cursor', installed: false, items: [] },
];

beforeEach(async () => {
  await seedBoard();
  const s = useBoardStore.getState().state!;
  useBoardStore.setState({
    state: { ...s, board: { ...s.board, aiTool: 'claude' }, harness: { ...s.harness, inventory: INVENTORY }, harnessInstall: null },
  });
  posted.mockClear();
});

/** Abre o assunto da ferramenta e a origem (Projeto abre por padrão). */
const renderScreen = async (topic: HarnessTopic, origin: 'Projeto' | 'Global' = 'Projeto', tool: AiTool = 'claude') => {
  useBoardStore.setState({ harnessTopic: topic });
  const view = render(
    <Theme>
      <ToolHarness tool={tool} />
      <Dialog />
    </Theme>,
  );
  if (origin !== 'Projeto') await userEvent.click(screen.getByRole('radio', { name: origin }));
  return view;
};
const section = (label: string) => document.querySelector<HTMLElement>(`.settings-card[aria-label="${label}"]`)!;
/** os agentes da ferramenta do projeto têm a tabela própria: o formulário genérico aparece no Cursor */
const dialog = () => within(screen.getByRole('dialog'));
const userAgents = () => createTargets('cursor').find((t) => t.kind === 'agent' && t.scope === 'user')!;

describe('Harness: criar, acrescentar, abrir, copiar e apagar nas abas Projeto e Global', () => {
  it('relê o harness ao abrir a tela', async () => {
    await renderScreen('rules');
    expect(sentOf('harness.refresh')).toHaveLength(1);
  });

  it('criar um agente no projeto envia sem pedir confirmação e fecha o formulário', async () => {
    await renderScreen('agent', 'Projeto', 'cursor');
    const agents = section('Subagentes');
    await userEvent.click(within(agents).getByRole('button', { name: 'Novo' }));
    // o destino começa no primeiro lugar possível do projeto
    expect(within(agents).getByRole('combobox', { name: 'Onde' })).toHaveTextContent('Projeto: .cursor/agents/<nome>.md');
    const create = within(agents).getByRole('button', { name: 'Criar e abrir no editor' });
    expect(create).toBeDisabled();
    await userEvent.type(within(agents).getByPlaceholderText('revisar-spec'), 'Meu Agente');
    await userEvent.type(within(agents).getByPlaceholderText('Quando a IA deve usar'), '  Revisa specs  ');
    await userEvent.click(create);
    expect(useBoardStore.getState().dialog).toBeNull();
    const project = createTargets('cursor').find((t) => t.kind === 'agent' && t.scope === 'project')!;
    expect(lastSent('harness.item.create')).toEqual({
      type: 'harness.item.create',
      tool: 'cursor',
      source: project.source,
      name: 'meu-agente',
      description: 'Revisa specs',
    });
    expect(within(agents).queryByRole('button', { name: 'Criar e abrir no editor' })).toBeNull();
  });

  it('na aba Global, criar pede confirmação e só envia depois de confirmar', async () => {
    await renderScreen('agent', 'Global', 'cursor');
    const agents = section('Subagentes');
    await userEvent.click(within(agents).getByRole('button', { name: 'Novo' }));
    await choose(within(agents).getByRole('combobox', { name: 'Onde' }), `Global: ${userAgents().label}`);
    await userEvent.type(within(agents).getByPlaceholderText('revisar-spec'), 'revisor-global');
    await userEvent.type(within(agents).getByPlaceholderText('Quando a IA deve usar'), 'Revisa');
    await userEvent.click(within(agents).getByRole('button', { name: 'Criar e abrir no editor' }));
    expect(useBoardStore.getState().dialog).toMatchObject({
      title: 'Criar na pasta do usuário?',
      message: `~/.cursor/agents/revisor-global.md\n\n${GLOBAL_WARNING}`,
      confirmLabel: 'Criar',
    });
    expect(sentOf('harness.item.create')).toHaveLength(0);
    await userEvent.click(dialog().getByRole('button', { name: 'Criar' }));
    expect(lastSent('harness.item.create')).toMatchObject({ source: userAgents().source, name: 'revisor-global', description: 'Revisa' });
  });

  it('cancelar a confirmação global não envia e mantém o formulário aberto', async () => {
    await renderScreen('agent', 'Global', 'cursor');
    const agents = section('Subagentes');
    await userEvent.click(within(agents).getByRole('button', { name: 'Novo' }));
    await userEvent.type(within(agents).getByPlaceholderText('revisar-spec'), 'x');
    await userEvent.type(within(agents).getByPlaceholderText('Quando a IA deve usar'), 'y');
    await userEvent.click(within(agents).getByRole('button', { name: 'Criar e abrir no editor' }));
    await userEvent.click(dialog().getByRole('button', { name: 'Cancelar' }));
    expect(useBoardStore.getState().dialog).toBeNull();
    expect(sentOf('harness.item.create')).toHaveLength(0);
    expect(within(agents).getByRole('button', { name: 'Criar e abrir no editor' })).toBeInTheDocument();
  });

  it('Cancelar fecha o formulário sem enviar nada', async () => {
    await renderScreen('command');
    const commands = section('Comandos');
    posted.mockClear();
    await userEvent.click(within(commands).getByRole('button', { name: 'Novo' }));
    await userEvent.click(within(commands).getByRole('button', { name: 'Cancelar' }));
    expect(within(commands).queryByRole('button', { name: 'Criar e abrir no editor' })).toBeNull();
    expect(posted).not.toHaveBeenCalled();
  });

  it('servidor MCP: monta o servidor com argumentos e variáveis', async () => {
    await renderScreen('mcp');
    const mcp = section('Servidores MCP');
    await userEvent.click(within(mcp).getByRole('button', { name: 'Novo servidor' }));
    await userEvent.type(within(mcp).getByPlaceholderText('github'), 'github');
    await userEvent.type(within(mcp).getByPlaceholderText('npx'), 'npx');
    await userEvent.type(within(mcp).getByPlaceholderText('um por linha'), '-y{Enter}servidor');
    await userEvent.type(within(mcp).getByPlaceholderText('CHAVE=valor, um por linha'), 'TOKEN=abc');
    await userEvent.click(within(mcp).getByRole('button', { name: 'Acrescentar servidor' }));
    expect(useBoardStore.getState().dialog).toBeNull();
    expect(lastSent('harness.mcp.add')).toEqual({
      type: 'harness.mcp.add',
      tool: 'claude',
      source: mcpTargets('claude')[0]!.source,
      server: { name: 'github', transport: 'stdio', command: 'npx', args: ['-y', 'servidor'], env: { TOKEN: 'abc' }, url: '', headers: {} },
    });
    expect(within(mcp).queryByRole('button', { name: 'Acrescentar servidor' })).toBeNull();
  });

  it('hook: sempre pede confirmação, mesmo no projeto', async () => {
    await renderScreen('hook');
    const hooks = section('Hooks');
    await userEvent.click(within(hooks).getByRole('button', { name: 'Novo hook' }));
    await userEvent.type(within(hooks).getByPlaceholderText('./scripts/verificar.sh'), 'echo oi');
    await userEvent.type(within(hooks).getByPlaceholderText('padrão da ferramenta'), '30');
    await userEvent.click(within(hooks).getByRole('button', { name: 'Acrescentar hook' }));
    const target = hookTargets('claude')[0]!;
    expect(useBoardStore.getState().dialog).toMatchObject({
      title: 'Acrescentar este hook?',
      message: `O Claude Code vai rodar este comando sozinho, no seu computador, a cada "PreToolUse":\n\necho oi\n\nArquivo: ${target.label}`,
    });
    await userEvent.click(dialog().getByRole('button', { name: 'Acrescentar hook' }));
    expect(lastSent('harness.hook.add')).toEqual({
      type: 'harness.hook.add',
      tool: 'claude',
      source: target.source,
      hook: { event: 'PreToolUse', matcher: '', command: 'echo oi', timeout: 30 },
    });
  });

  it('regra de permissão global: escolhe a lista e confirma', async () => {
    await renderScreen('other', 'Global');
    const settings = section('Configurações e permissões');
    await userEvent.click(within(settings).getByRole('button', { name: 'Nova regra de permissão' }));
    const user = permissionTargets('claude').find((t) => t.scope === 'user')!;
    expect(within(settings).getByRole('combobox', { name: 'Arquivo' })).toHaveTextContent(`Global: ${user.label}`);
    await choose(within(settings).getByRole('combobox', { name: 'Lista' }), /negar \(deny\)/);
    await userEvent.type(within(settings).getByPlaceholderText('Ex.: Bash(npm run test *), Read(./.env)'), 'Read(./.env)');
    await userEvent.click(within(settings).getByRole('button', { name: 'Acrescentar regra' }));
    expect(useBoardStore.getState().dialog).toMatchObject({
      title: 'Acrescentar regra na pasta do usuário?',
      message: `${user.label}\n\n${GLOBAL_WARNING}`,
    });
    await userEvent.click(dialog().getByRole('button', { name: 'Acrescentar' }));
    expect(lastSent('harness.permission.add')).toEqual({
      type: 'harness.permission.add',
      tool: 'claude',
      source: user.source,
      list: 'deny',
      rule: 'Read(./.env)',
    });
  });

  it('ações da linha: abrir, copiar para o projeto e apagar com confirmação', async () => {
    await renderScreen('skill', 'Global');
    const row = screen.getByText('global-skill').closest('li')!;
    await userEvent.click(within(row).getByRole('button', { name: '~/.claude/skills/global-skill/SKILL.md' }));
    // o caminho abre o arquivo no editor do board
    expect(useBoardStore.getState().harnessFile).toBe('/abs/~/.claude/skills/global-skill/SKILL.md');
    act(() => useBoardStore.getState().closeHarnessFile());
    await userEvent.click(within(row).getByRole('button', { name: 'Copiar para o projeto' }));
    expect(lastSent('harness.item.copy')).toEqual({
      type: 'harness.item.copy',
      tool: 'claude',
      items: [{ kind: 'skill', path: '/abs/~/.claude/skills/global-skill/SKILL.md' }],
      to: 'project',
    });
    await userEvent.click(within(row).getByRole('button', { name: 'Apagar' }));
    expect(useBoardStore.getState().dialog).toMatchObject({ title: 'Apagar "global-skill"?', danger: true });
    expect(useBoardStore.getState().dialog?.message).toContain(GLOBAL_WARNING);
    await userEvent.click(dialog().getByRole('button', { name: 'Apagar' }));
    expect(lastSent('harness.item.delete')).toEqual({
      type: 'harness.item.delete',
      tool: 'claude',
      kind: 'skill',
      path: '/abs/~/.claude/skills/global-skill/SKILL.md',
    });
  });

  it('modo da skill global pede confirmação; arquivos de apoio abrem e são criados', async () => {
    const { unmount } = await renderScreen('skill', 'Global');
    await choose(
      within(screen.getByText('global-skill').closest('li')!).getByRole('combobox', { name: 'Modo da skill global-skill' }),
      /Só quando indicada/,
    );
    expect(useBoardStore.getState().dialog?.title).toBe('Alterar skills da pasta do usuário?');
    await userEvent.click(dialog().getByRole('button', { name: 'Alterar' }));
    expect(lastSent('harness.skill.setMode')).toEqual({
      type: 'harness.skill.setMode',
      tool: 'claude',
      paths: ['/abs/~/.claude/skills/global-skill/SKILL.md'],
      mode: 'manual',
    });
    unmount();
    await renderScreen('skill');
    const row = screen.getByText('revisar-spec').closest('li')!;
    await userEvent.click(within(row).getByRole('button', { name: 'Arquivos (1)' }));
    const files = document.querySelector<HTMLElement>('.skill-files')!;
    await userEvent.click(within(files).getByRole('button', { name: 'Abrir no editor' }));
    expect(lastSent('harness.skill.file.open')).toEqual({
      type: 'harness.skill.file.open',
      tool: 'claude',
      path: '/abs/.claude/skills/revisar-spec/SKILL.md',
      file: 'references/modelo.md',
    });
    await userEvent.type(within(files).getByPlaceholderText('modelo-de-repositorio.ts'), 'exemplo.ts');
    await userEvent.click(within(files).getByRole('button', { name: 'Novo arquivo' }));
    expect(lastSent('harness.skill.file.create')).toEqual({
      type: 'harness.skill.file.create',
      tool: 'claude',
      path: '/abs/.claude/skills/revisar-spec/SKILL.md',
      file: 'references/exemplo.ts',
      link: true,
    });
  });

  it('a linha mostra a descrição do arquivo e o caminho numa linha própria', async () => {
    await renderScreen('skill');
    const row = within(section('Skills')).getByText('revisar-spec').closest('li')!;
    expect(within(row).getByText('Descrição de revisar-spec')).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: '.claude/skills/revisar-spec/SKILL.md' })).toBeInTheDocument();
    // a skill global fica na outra aba
    expect(screen.queryByText('global-skill')).toBeNull();
  });

  it('buscar e instalar: Enter procura as skills da origem', async () => {
    await renderScreen('skill');
    await userEvent.click(screen.getByRole('button', { name: 'Buscar skills para instalar' }));
    await userEvent.type(screen.getByPlaceholderText(/dono\/repositorio/), 'dono/repo{Enter}');
    expect(lastSent('harness.install.scan')).toEqual({ type: 'harness.install.scan', source: 'dono/repo' });
  });
});
