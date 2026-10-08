import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Theme } from '@radix-ui/themes';

// liga o modo navegador antes de o setup montar o mock de `src/webview/vscode` (padrão de appearanceSettingsWeb.test.tsx):
// no editor (!isWeb, padrão dos testes), "Tocar histórias em paralelo" vira link para o Settings do editor
// (ver runnerSettingsEditor.test.tsx), igual ao GitSettings.
vi.hoisted(() => {
  (globalThis as { __fazaiTestWeb?: boolean }).__fazaiTestWeb = true;
});

import { choose, lastSent, posted, seedBoard, sentOf } from './setup';
import { RUNNER_PERMISSIONS } from '../../src/shared/runner';
import { profileOfAgent } from '../../src/shared/execution';
import { Dialog } from '../../src/webview/components/Dialog';
import { HarnessSettings } from '../../src/webview/components/settings/HarnessSettings';
import { useBoardStore, type HarnessTab } from '../../src/webview/store/boardStore';
import type { Agent, Harness, HarnessItem, Skill } from '../../src/shared/harness';
import type { BoardState } from '../../src/shared/model';

const skill = (name: string, over: Partial<Skill> = {}): Skill => ({
  name,
  description: `Descrição de ${name}`,
  enabled: true,
  mode: 'auto',
  path: `.claude/skills/${name}/SKILL.md`,
  content: `conteúdo de ${name}`,
  ...over,
});

const agent: Agent = {
  name: 'revisor',
  description: 'Revisa',
  model: 'opus',
  modelValue: 'claude:opus@high',
  scope: 'user',
  path: '/abs/home/.claude/agents/revisor.md',
  location: '~/.claude/agents/revisor.md',
  content: '---\nname: revisor\n---\ninstruções',
  body: 'instruções',
  tools: ['Read'],
  deniedTools: [],
  skills: [],
  mcp: [],
  seed: false,
};
const projectAgent: Agent = {
  ...agent,
  name: 'local',
  scope: 'project',
  path: '/abs/.claude/agents/local.md',
  location: '.claude/agents/local.md',
  seed: true,
};
const ruleItem: HarnessItem = {
  kind: 'instructions',
  scope: 'project',
  name: 'AGENTS.md',
  description: '',
  path: '/abs/AGENTS.md',
  location: 'AGENTS.md',
  layout: 'file',
};
const globalRule: HarnessItem = {
  ...ruleItem,
  scope: 'user',
  name: 'CLAUDE.md',
  path: '/abs/home/.claude/CLAUDE.md',
  location: '~/.claude/CLAUDE.md',
};

// o inventário liga cada skill do projeto ao caminho absoluto que o host usa para gravar o modo
const inventoryItem = (k: Skill): HarnessItem => ({
  kind: 'skill',
  scope: 'project',
  name: k.name,
  description: k.description,
  path: `/abs/${k.path}`,
  location: k.path,
  layout: 'skills',
  mode: k.mode,
  files: [],
  digest: k.name,
});

const SKILLS = [skill('revisar-spec'), skill('outra'), skill('desligada', { enabled: false })];
const HARNESS: Harness = {
  rules: [
    { name: 'CLAUDE.md', exists: false, content: '' },
    { name: 'AGENTS.md', exists: true, content: '# Regras' },
  ],
  skills: SKILLS,
  agents: [agent, projectAgent],
  inventory: [{ tool: 'claude', installed: true, items: [ruleItem, globalRule, ...SKILLS.filter((k) => k.enabled).map(inventoryItem)] }],
};

const setState = (patch: (s: BoardState) => Partial<BoardState>) => {
  const s = useBoardStore.getState().state!;
  useBoardStore.setState({ state: { ...s, ...patch(s) } });
};

beforeEach(async () => {
  await seedBoard();
  setState((s) => ({
    board: { ...s.board, aiTool: 'claude', execProfiles: [profileOfAgent(agent, true)] },
    harness: HARNESS,
    harnessSelection: [
      { kind: 'skill', location: '.claude/skills/revisar-spec/SKILL.md', usage: 'always' },
      { kind: 'skill', location: '.claude/skills/sumida/SKILL.md', usage: 'contextual' },
      { kind: 'agent', location: '~/.claude/agents/revisor.md', usage: 'contextual' },
    ],
    harnessInstall: null,
    aiRunUnsupported: null,
  }));
  posted.mockClear();
});

const renderScreen = (tab: HarnessTab = 'project') => {
  useBoardStore.setState({ harnessTab: tab });
  return render(
    <Theme>
      <HarnessSettings />
      <Dialog />
    </Theme>,
  );
};
/** a linha de um item na tabela, pelo nome dele (a primeira: com o editor aberto, a linha de edição também o cita) */
const row = (name: string | RegExp) => within(screen.getAllByRole('row', { name })[0]!);
const dialog = () => within(screen.getByRole('dialog'));

describe('HarnessSettings: abas', () => {
  it('quatro abas: ferramenta, projeto, global e tudo que a ferramenta carrega', async () => {
    renderScreen('tool');
    expect(screen.getByText('Ferramenta deste projeto')).toBeInTheDocument();
    expect(screen.queryByText('Harness do projeto')).toBeNull();
    await userEvent.click(screen.getByRole('tab', { name: /^Projeto/ }));
    expect(screen.getByText('Harness do projeto')).toBeInTheDocument();
    expect(useBoardStore.getState().harnessTab).toBe('project');
    // abrir um escopo relê as pastas (a do usuário não é vigiada)
    expect(sentOf('harness.refresh').length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('tab', { name: /^Global/ }));
    expect(screen.getByText('Harness global')).toBeInTheDocument();
    expect(useBoardStore.getState().harnessTab).toBe('user');
    await userEvent.click(screen.getByRole('tab', { name: /Tudo que a ferramenta carrega/ }));
    expect(screen.getByText('Tudo que cada ferramenta carrega')).toBeInTheDocument();
    expect(useBoardStore.getState().harnessTab).toBe('all');
  });
});

describe('HarnessSettings: rules', () => {
  it('marcar e desmarcar uma rule do projeto grava a marcação; o global mostra os arquivos da pasta do usuário', async () => {
    renderScreen('project');
    const r = row(/AGENTS\.md/);
    await userEvent.click(r.getByRole('checkbox', { name: 'Incluir em todo contexto: AGENTS.md' }));
    expect(lastSent('harness.selection.set')).toEqual({
      type: 'harness.selection.set',
      items: [{ kind: 'instructions', location: 'AGENTS.md' }],
      usage: 'always',
    });
    act(() =>
      setState((s) => ({ harnessSelection: [...s.harnessSelection, { kind: 'instructions', location: 'AGENTS.md', usage: 'always' }] })),
    );
    expect(row(/AGENTS\.md/).getByRole('checkbox', { name: 'Incluir em todo contexto: AGENTS.md' })).toBeChecked();
    await userEvent.click(row(/AGENTS\.md/).getByRole('checkbox', { name: 'Incluir em todo contexto: AGENTS.md' }));
    expect(lastSent('harness.selection.set').usage).toBeNull();
    // o CLAUDE.md global não aparece na aba do projeto
    expect(screen.queryByRole('row', { name: /~\/\.claude\/CLAUDE\.md/ })).toBeNull();
    await userEvent.click(screen.getByRole('tab', { name: /^Global/ }));
    expect(screen.getByRole('row', { name: /~\/\.claude\/CLAUDE\.md/ })).toBeInTheDocument();
  });

  it('editar um arquivo de regras da raiz do projeto grava pelo nome dele', async () => {
    renderScreen('project');
    await userEvent.click(row(/AGENTS\.md/).getByRole('button', { name: 'Editar' }));
    await userEvent.type(screen.getByDisplayValue('# Regras'), '!');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(lastSent('harness.rule.write')).toEqual({ type: 'harness.rule.write', name: 'AGENTS.md', content: '# Regras!' });
  });

  it('uma marcação cujo arquivo sumiu aparece como não encontrada e pode ser desmarcada', async () => {
    setState((s) => ({
      harnessSelection: [...s.harnessSelection, { kind: 'instructions', location: '.claude/rules/velha.md', usage: 'contextual' }],
    }));
    renderScreen('project');
    const missing = row(/velha\.md/);
    expect(missing.getByText('não encontrada')).toBeInTheDocument();
    await userEvent.click(missing.getByRole('checkbox', { name: 'Usar quando fizer sentido: .claude/rules/velha.md' }));
    expect(lastSent('harness.selection.set')).toEqual({
      type: 'harness.selection.set',
      items: [{ kind: 'instructions', location: '.claude/rules/velha.md' }],
      usage: null,
    });
  });
});

describe('HarnessSettings: skills', () => {
  const openSkills = async (tab: HarnessTab = 'project') => {
    renderScreen(tab);
    await userEvent.click(screen.getByRole('tab', { name: /^Skills/ }));
  };

  it('as duas marcações excluem uma à outra e o total aparece no resumo', async () => {
    await openSkills();
    expect(screen.getByText('1 em todo contexto · 0 quando fizer sentido · 2 no total.')).toBeInTheDocument();
    const k = row(/revisar-spec/);
    expect(k.getByRole('checkbox', { name: 'Incluir em todo contexto: revisar-spec' })).toBeChecked();
    expect(k.getByRole('checkbox', { name: 'Usar quando fizer sentido: revisar-spec' })).not.toBeChecked();
    await userEvent.click(k.getByRole('checkbox', { name: 'Usar quando fizer sentido: revisar-spec' }));
    expect(lastSent('harness.selection.set')).toEqual({
      type: 'harness.selection.set',
      items: [{ kind: 'skill', location: '.claude/skills/revisar-spec/SKILL.md' }],
      usage: 'contextual',
    });
    // a desligada não está no inventário: não pode ser marcada
    expect(screen.queryByRole('row', { name: /desligada/ })).toBeNull();
  });

  it('modo, editar e apagar uma skill do projeto', async () => {
    await openSkills();
    const k = row(/revisar-spec/);
    await choose(k.getByRole('combobox', { name: 'Modo da skill revisar-spec' }), 'Só quando indicada');
    expect(lastSent('harness.skill.setMode')).toEqual({
      type: 'harness.skill.setMode',
      tool: 'claude',
      paths: ['/abs/.claude/skills/revisar-spec/SKILL.md'],
      mode: 'manual',
    });
    await userEvent.click(k.getByRole('button', { name: 'Editar' }));
    await userEvent.type(screen.getByDisplayValue('conteúdo de revisar-spec'), '!');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(lastSent('harness.skill.write')).toEqual({
      type: 'harness.skill.write',
      name: 'revisar-spec',
      content: 'conteúdo de revisar-spec!',
    });
    await userEvent.click(row(/outra/).getByRole('button', { name: 'Apagar outra' }));
    await userEvent.click(dialog().getByRole('button', { name: 'Apagar' }));
    expect(lastSent('harness.item.delete')).toEqual({
      type: 'harness.item.delete',
      tool: 'claude',
      kind: 'skill',
      path: '/abs/.claude/skills/outra/SKILL.md',
    });
  });

  it('nova skill abre o formulário de criação com o destino, e a skill do fluxo é instalada daqui', async () => {
    await openSkills();
    await userEvent.click(screen.getByRole('button', { name: 'Nova skill' }));
    expect(screen.getByText('Onde')).toBeInTheDocument();
    expect(screen.getByLabelText('Skill do fluxo')).toBeInTheDocument();
  });
});

describe('HarnessSettings: agentes', () => {
  const openAgents = async (tab: HarnessTab = 'user') => {
    renderScreen(tab);
    await userEvent.click(screen.getByRole('tab', { name: /^Agentes/ }));
  };

  it('o global lista os agentes da pasta do usuário, com o padrão e a marcação; o projeto lista os dele', async () => {
    await openAgents();
    const a = row(/revisor/);
    expect(a.getByRole('checkbox', { name: 'Disponível no board: revisor' })).toBeChecked();
    expect(a.getByText('padrão')).toBeInTheDocument();
    expect(a.getByText('claude:opus@high')).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /local/ })).toBeNull();
    await userEvent.click(a.getByRole('checkbox', { name: 'Disponível no board: revisor' }));
    expect(lastSent('harness.selection.set')).toEqual({
      type: 'harness.selection.set',
      items: [{ kind: 'agent', location: '~/.claude/agents/revisor.md' }],
      usage: null,
    });
    await userEvent.click(screen.getByRole('tab', { name: /^Projeto/ }));
    await userEvent.click(screen.getByRole('tab', { name: /^Agentes/ }));
    const local = row(/local/);
    expect(local.getByText('de fábrica')).toBeInTheDocument();
    expect(local.getByRole('checkbox', { name: 'Disponível no board: local' })).not.toBeChecked();
    await userEvent.click(local.getByRole('checkbox', { name: 'Disponível no board: local' }));
    expect(lastSent('harness.selection.set')).toEqual({
      type: 'harness.selection.set',
      items: [{ kind: 'agent', location: '.claude/agents/local.md' }],
      usage: 'contextual',
    });
  });

  it('novo agente: normaliza o nome, recusa nome usado e cria na pasta do escopo', async () => {
    await openAgents();
    await userEvent.click(screen.getByRole('button', { name: 'Novo agente' }));
    const name = screen.getByPlaceholderText('revisor-de-spec');
    const create = screen.getByRole('button', { name: 'Criar agente' });
    await userEvent.type(name, 'revisor');
    await userEvent.type(screen.getByPlaceholderText('Revisa uma Spec e aponta lacunas antes do Plan'), ' Revisa ');
    expect(screen.getByText('Nome inválido ou já usado.')).toBeInTheDocument();
    expect(create).toBeDisabled();
    await userEvent.clear(name);
    await userEvent.type(name, 'Revisor Novo');
    expect(name).toHaveValue('revisor-novo');
    await userEvent.type(screen.getByPlaceholderText('Como este agente trabalha: padrões, comandos, o que nunca fazer'), 'Passos');
    await userEvent.click(create);
    expect(lastSent('harness.agent.create')).toEqual({
      type: 'harness.agent.create',
      scope: 'user',
      input: { name: 'revisor-novo', description: 'Revisa', body: 'Passos', model: '', tools: [], deniedTools: [], skills: [], mcp: [] },
    });
    expect(screen.queryByRole('button', { name: 'Criar agente' })).toBeNull();
  });

  it('editar grava o frontmatter por campo e as instruções com Salvar; apagar pede confirmação', async () => {
    await openAgents();
    await userEvent.click(row(/revisor/).getByRole('button', { name: 'Editar' }));
    const description = screen.getByDisplayValue('Revisa');
    await userEvent.type(description, ' tudo{Enter}');
    expect(lastSent('harness.agent.update')).toEqual({
      type: 'harness.agent.update',
      name: 'revisor',
      scope: 'user',
      patch: { description: 'Revisa tudo' },
    });
    await userEvent.type(screen.getByDisplayValue('instruções'), '.');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(lastSent('harness.agent.update')).toEqual({
      type: 'harness.agent.update',
      name: 'revisor',
      scope: 'user',
      patch: {},
      body: 'instruções.',
    });
    await userEvent.click(screen.getByRole('button', { name: 'Só leitura' }));
    expect(lastSent('harness.agent.update').patch).toEqual({ tools: ['Read', 'Grep', 'Glob'] });
    await userEvent.click(row(/revisor/).getByTitle('Apagar o agente'));
    expect(dialog().getByText(/vale para todos os seus projetos/)).toBeInTheDocument();
    await userEvent.click(dialog().getByRole('button', { name: 'Apagar' }));
    expect(lastSent('harness.agent.delete')).toEqual({ type: 'harness.agent.delete', name: 'revisor', scope: 'user' });
  });

  it('sugerir agentes com IA pede ao host, e fica desabilitado enquanto o chat responde; recriar os padrão só no global', async () => {
    await openAgents();
    await userEvent.click(screen.getByRole('button', { name: 'Sugerir agentes com IA' }));
    expect(lastSent('ai.suggestAgents')).toEqual({ type: 'ai.suggestAgents' });
    await userEvent.click(screen.getByRole('button', { name: 'Recriar os agentes padrão' }));
    expect(lastSent('harness.agents.seed')).toEqual({ type: 'harness.agents.seed', force: true });
    act(() => setState((s) => ({ chat: { ...s.chat, busy: true } })));
    expect(screen.getByRole('button', { name: 'Sugerir agentes com IA' })).toBeDisabled();
    await userEvent.click(screen.getByRole('tab', { name: /^Projeto/ }));
    await userEvent.click(screen.getByRole('tab', { name: /^Agentes/ }));
    expect(screen.queryByRole('button', { name: 'Recriar os agentes padrão' })).toBeNull();
  });

  it('o agente padrão é escolhido em Ferramenta e execução entre os disponíveis', async () => {
    renderScreen('tool');
    const runner = document.querySelector<HTMLElement>('.runner-settings')!;
    expect(within(runner).getByRole('combobox', { name: 'Agente padrão' })).toHaveTextContent('revisor');
  });
});

describe('HarnessSettings: ferramenta e execução', () => {
  it('escolher outra ferramenta grava no board; a atual não envia nada', async () => {
    renderScreen('tool');
    const radios = screen.getAllByRole('radio');
    await userEvent.click(radios[0]!);
    expect(sentOf('settings.board.update')).toHaveLength(0);
    await userEvent.click(radios[1]!);
    expect(lastSent('settings.board.update')).toEqual({ type: 'settings.board.update', patch: { aiTool: 'cursor' } });
  });

  it('a aba da ferramenta não instala o MCP: aponta para a seção da ferramenta', () => {
    renderScreen('tool');
    expect(screen.queryByRole('button', { name: /MCP/ })).toBeNull();
    expect(screen.getByText(/nas seções Servidores MCP e Skills de cada ferramenta/)).toBeInTheDocument();
  });

  it('permissão, tempo limite, heartbeat e Rodar o heartbeat agora', async () => {
    renderScreen('tool');
    const runner = document.querySelector<HTMLElement>('.runner-settings')!;
    await choose(
      within(runner).getByRole('combobox', { name: 'O que a IA pode fazer' }),
      RUNNER_PERMISSIONS.find((p) => p.value === 'full')!.label,
    );
    expect(lastSent('settings.board.update').patch).toEqual({ runner: { permission: 'full' } });
    const [timeout, interval] = within(runner).getAllByRole('spinbutton');
    await userEvent.clear(timeout!);
    await userEvent.type(timeout!, '7{Enter}');
    expect(lastSent('settings.board.update').patch).toEqual({ runner: { timeoutMinutes: 7 } });
    await userEvent.clear(interval!);
    await userEvent.type(interval!, '45{Enter}');
    expect(lastSent('settings.board.update').patch).toEqual({ runner: { heartbeatMinutes: 45 } });
    // o número só aparece com o paralelo ligado, e começa em duas histórias
    expect(within(runner).queryByLabelText('Histórias ao mesmo tempo')).toBeNull();
    await userEvent.click(within(runner).getByRole('switch', { name: 'Tocar histórias em paralelo' }));
    expect(lastSent('settings.board.update').patch).toEqual({ runner: { parallel: true } });
    act(() => setState((st) => ({ board: { ...st.board, runner: { ...st.board.runner, parallel: true } } })));
    const parallel = within(runner).getByLabelText('Histórias ao mesmo tempo');
    expect(parallel).toHaveValue(2);
    await userEvent.clear(parallel);
    await userEvent.type(parallel, '3{Enter}');
    expect(lastSent('settings.board.update').patch).toEqual({ runner: { parallelStories: 3 } });
    const heartbeat = within(runner).getByRole('switch', { name: 'Heartbeat ligado' });
    await userEvent.click(heartbeat);
    expect(lastSent('settings.board.update').patch).toEqual({
      runner: { heartbeat: !useBoardStore.getState().state!.board.runner.heartbeat },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Rodar o heartbeat agora' }));
    expect(lastSent('ai.heartbeat.run')).toEqual({ type: 'ai.heartbeat.run' });
  });

  it('sem suporte à execução, mostra o aviso no lugar dos campos', () => {
    setState(() => ({ aiRunUnsupported: 'Esta ferramenta não roda pelo board.' }));
    renderScreen('tool');
    expect(screen.getByText('Esta ferramenta não roda pelo board.')).toBeInTheDocument();
    expect(document.querySelector('.runner-settings')).toBeNull();
  });
});

describe('HarnessSettings: instalar o MCP e a skill do fluxo na seção de cada ferramenta', () => {
  const item = (kind: 'mcp' | 'skill', scope: 'project' | 'user', name: string): HarnessItem => ({
    kind,
    scope,
    name,
    description: '',
    path: `/abs/${scope}/${name}`,
    location: name,
    layout: kind === 'mcp' ? 'entry' : 'skills',
    files: [],
    digest: `${scope}-${name}`,
  });
  const withItems = (items: HarnessItem[]) =>
    setState((s) => ({ harness: { ...s.harness, inventory: [{ tool: 'claude', installed: true, items }] } }));
  const installBlock = (label: string) => within(screen.getByRole('generic', { name: label }));

  it('um só lugar por tipo: o MCP na seção Servidores MCP e a skill na seção Skills', () => {
    renderScreen('all');
    expect(screen.getAllByLabelText('Servidor do board')).toHaveLength(1);
    expect(screen.getAllByLabelText('Skill do fluxo')).toHaveLength(1);
    expect(installBlock('Servidor do board').getByText('global: não instalado')).toBeInTheDocument();
    expect(installBlock('Servidor do board').getByText(/~\/\.claude\.json/)).toBeInTheDocument();
    expect(installBlock('Skill do fluxo').getByText('~/.claude/skills/faz-ai-fluxo')).toBeInTheDocument();
  });

  it('o padrão da ferramenta instala no global, depois de confirmar', async () => {
    renderScreen('all');
    await userEvent.click(installBlock('Servidor do board').getByRole('button', { name: 'Instalar (padrão da ferramenta)' }));
    expect(sentOf('ui.connectAI')).toHaveLength(0);
    expect(dialog().getByText(/vale para todos os seus projetos/)).toBeInTheDocument();
    await userEvent.click(dialog().getByRole('button', { name: 'Instalar' }));
    expect(lastSent('ui.connectAI')).toEqual({ type: 'ui.connectAI', tool: 'claude', scope: 'user' });

    await userEvent.click(installBlock('Skill do fluxo').getByRole('button', { name: 'Instalar (padrão da ferramenta)' }));
    await userEvent.click(dialog().getByRole('button', { name: 'Instalar' }));
    expect(lastSent('harness.flowSkill.install')).toEqual({
      type: 'harness.flowSkill.install',
      tool: 'claude',
      scope: 'user',
      replace: false,
    });
  });

  it('no projeto sem global instala direto; com global, pergunta antes', async () => {
    renderScreen('all');
    await userEvent.click(installBlock('Servidor do board').getByRole('button', { name: 'Instalar neste projeto' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(lastSent('ui.connectAI')).toEqual({ type: 'ui.connectAI', tool: 'claude', scope: 'project' });

    posted.mockClear();
    act(() => withItems([item('mcp', 'user', 'faz-ai')]));
    expect(installBlock('Servidor do board').getByText('global: instalado')).toBeInTheDocument();
    await userEvent.click(installBlock('Servidor do board').getByRole('button', { name: 'Instalar neste projeto' }));
    expect(sentOf('ui.connectAI')).toHaveLength(0);
    expect(dialog().getByText(/Já está instalado no global/)).toBeInTheDocument();
    await userEvent.click(dialog().getByRole('button', { name: 'Instalar' }));
    expect(lastSent('ui.connectAI')).toEqual({ type: 'ui.connectAI', tool: 'claude', scope: 'project' });
  });

  it('a skill que já existe no destino só é substituída depois de confirmar', async () => {
    withItems([item('skill', 'project', 'faz-ai-fluxo')]);
    renderScreen('all');
    await userEvent.click(installBlock('Skill do fluxo').getByRole('button', { name: 'Reinstalar neste projeto' }));
    expect(dialog().getByText(/será substituída/)).toBeInTheDocument();
    await userEvent.click(dialog().getByRole('button', { name: 'Substituir' }));
    expect(lastSent('harness.flowSkill.install')).toEqual({
      type: 'harness.flowSkill.install',
      tool: 'claude',
      scope: 'project',
      replace: true,
    });
  });
});
