import { choose, lastSent, posted, seedBoard, sentOf } from './setup';
import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Theme } from '@radix-ui/themes';
import { RUNNER_PERMISSIONS } from '../../src/shared/runner';
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
  path: '.claude/agents/revisor.md',
  content: 'instruções',
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
  agents: [agent],
  inventory: [{ tool: 'claude', installed: true, items: SKILLS.filter((k) => k.enabled).map(inventoryItem) }],
};

const setState = (patch: (s: BoardState) => Partial<BoardState>) => {
  const s = useBoardStore.getState().state!;
  useBoardStore.setState({ state: { ...s, ...patch(s) } });
};

beforeEach(async () => {
  await seedBoard();
  setState((s) => ({ board: { ...s.board, aiTool: 'claude' }, harness: HARNESS, harnessInstall: null, aiRunUnsupported: null }));
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
/** bloco de um item (regra, skill ou agente) pelo título dele */
const block = (name: string) => within(screen.getByLabelText(name));
const dialog = () => within(screen.getByRole('dialog'));

describe('HarnessSettings: abas', () => {
  it('três abas separam a ferramenta, o que é do projeto e tudo que a ferramenta carrega', async () => {
    renderScreen('tool');
    expect(screen.getByText('Ferramenta deste projeto')).toBeInTheDocument();
    expect(screen.queryByText('Regras do projeto')).toBeNull();
    await userEvent.click(screen.getByRole('tab', { name: /Do projeto/ }));
    expect(screen.getByText('Regras do projeto')).toBeInTheDocument();
    expect(screen.queryByText('Ferramenta deste projeto')).toBeNull();
    // a aba escolhida fica lembrada
    expect(useBoardStore.getState().harnessTab).toBe('project');
    await userEvent.click(screen.getByRole('tab', { name: /Tudo que a ferramenta carrega/ }));
    expect(screen.getByText('Tudo que cada ferramenta carrega')).toBeInTheDocument();
    expect(useBoardStore.getState().harnessTab).toBe('all');
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

describe('HarnessSettings: regras', () => {
  it('Usar o AGENTS.md cria o CLAUDE.md que só o importa', async () => {
    renderScreen();
    await userEvent.click(block('CLAUDE.md').getByRole('button', { name: 'Usar o AGENTS.md' }));
    expect(lastSent('harness.rule.write')).toEqual({ type: 'harness.rule.write', name: 'CLAUDE.md', content: '@AGENTS.md\n' });
  });

  it('criar o arquivo: o editor abre vazio, Salvar grava e Descartar vira Fechar sem alterações', async () => {
    renderScreen();
    const rule = block('CLAUDE.md');
    expect(rule.queryByTitle('Apagar o arquivo')).toBeNull();
    await userEvent.click(rule.getByRole('button', { name: 'Criar' }));
    const save = rule.getByRole('button', { name: 'Salvar' });
    expect(save).toBeDisabled();
    // o botão da linha e o do editor
    expect(rule.getByRole('button', { name: 'Fechar edição' })).toBeInTheDocument();
    expect(rule.getByRole('button', { name: 'Fechar' })).toBeInTheDocument();
    await userEvent.type(rule.getAllByRole('textbox')[0]!, 'Regra nova');
    expect(rule.getByText('Alterações não salvas')).toBeInTheDocument();
    await userEvent.click(save);
    expect(lastSent('harness.rule.write')).toEqual({ type: 'harness.rule.write', name: 'CLAUDE.md', content: 'Regra nova' });
    await userEvent.click(rule.getByRole('button', { name: 'Descartar' }));
    expect(rule.queryByRole('button', { name: 'Salvar' })).toBeNull();
  });

  it('apagar um arquivo de regras pede confirmação', async () => {
    renderScreen();
    await userEvent.click(block('AGENTS.md').getByTitle('Apagar o arquivo'));
    expect(useBoardStore.getState().dialog).toMatchObject({ title: 'Apagar AGENTS.md?', danger: true });
    await userEvent.click(dialog().getByRole('button', { name: 'Apagar' }));
    expect(lastSent('harness.rule.delete')).toEqual({ type: 'harness.rule.delete', name: 'AGENTS.md' });
  });

  it('só um editor fica aberto por vez', async () => {
    renderScreen();
    await userEvent.click(block('AGENTS.md').getByRole('button', { name: 'Editar' }));
    expect(block('AGENTS.md').getByRole('button', { name: 'Salvar' })).toBeInTheDocument();
    await userEvent.click(block('revisar-spec').getByRole('button', { name: 'Editar' }));
    expect(block('AGENTS.md').queryByRole('button', { name: 'Salvar' })).toBeNull();
    expect(block('revisar-spec').getByDisplayValue('conteúdo de revisar-spec')).toBeInTheDocument();
  });
});

describe('HarnessSettings: skills', () => {
  it('ligar/desligar, modo e editar uma skill', async () => {
    renderScreen();
    const off = block('desligada');
    expect(off.getByText('Desligada')).toBeInTheDocument();
    expect(off.queryByRole('combobox')).toBeNull();
    await userEvent.click(off.getByRole('switch'));
    expect(lastSent('harness.skill.setEnabled')).toEqual({ type: 'harness.skill.setEnabled', name: 'desligada', enabled: true });

    const k = block('revisar-spec');
    await choose(k.getByRole('combobox'), 'Só quando indicada');
    expect(lastSent('harness.skill.setMode')).toEqual({
      type: 'harness.skill.setMode',
      tool: 'claude',
      paths: ['/abs/.claude/skills/revisar-spec/SKILL.md'],
      mode: 'manual',
    });
    await userEvent.click(k.getByRole('button', { name: 'Editar' }));
    await userEvent.type(k.getByDisplayValue('conteúdo de revisar-spec'), '!');
    await userEvent.click(k.getByRole('button', { name: 'Salvar' }));
    expect(lastSent('harness.skill.write')).toEqual({
      type: 'harness.skill.write',
      name: 'revisar-spec',
      content: 'conteúdo de revisar-spec!',
    });
  });

  it('apagar uma skill pede confirmação', async () => {
    renderScreen();
    await userEvent.click(block('outra').getByTitle('Apagar a skill'));
    await userEvent.click(dialog().getByRole('button', { name: 'Apagar' }));
    expect(lastSent('harness.skill.delete')).toEqual({ type: 'harness.skill.delete', name: 'outra' });
  });

  it('com várias automáticas, deixa todas só quando indicadas de uma vez', async () => {
    renderScreen();
    // o inventário no fim da página tem um botão de mesmo nome
    const bulk = within(screen.getByText('2 skills automáticas no projeto.').closest<HTMLElement>('p')!);
    await userEvent.click(bulk.getByRole('button', { name: 'Deixar todas só quando indicadas' }));
    expect(lastSent('harness.skill.setMode')).toEqual({
      type: 'harness.skill.setMode',
      tool: 'claude',
      paths: ['/abs/.claude/skills/revisar-spec/SKILL.md', '/abs/.claude/skills/outra/SKILL.md'],
      mode: 'manual',
    });
  });

  it('a skill do fluxo não é instalada aqui: o texto aponta para a seção Skills da ferramenta', () => {
    renderScreen();
    expect(screen.queryByRole('button', { name: /skill do fluxo/i })).toBeNull();
    expect(screen.getByText(/A skill do fluxo do board é instalada em/)).toBeInTheDocument();
  });

  it('nova skill: normaliza o nome, recusa nome usado e cria', async () => {
    renderScreen();
    await userEvent.click(screen.getByRole('button', { name: 'Nova skill' }));
    const create = screen.getByRole('button', { name: 'Criar skill' });
    const name = screen.getByPlaceholderText('revisar-spec');
    await userEvent.type(name, 'outra');
    await userEvent.type(screen.getByPlaceholderText('Use ao revisar uma Spec antes de passar para o Plan'), '  Quando usar  ');
    expect(screen.getByText('Nome inválido ou já usado.')).toBeInTheDocument();
    expect(create).toBeDisabled();
    await userEvent.clear(name);
    await userEvent.type(name, 'Minha Skill');
    expect(name).toHaveValue('minha-skill');
    await userEvent.type(screen.getByPlaceholderText('Instruções da skill, em markdown'), 'Passos');
    await userEvent.click(create);
    expect(lastSent('harness.skill.create')).toEqual({
      type: 'harness.skill.create',
      name: 'minha-skill',
      description: 'Quando usar',
      content: 'Passos',
    });
    expect(screen.queryByRole('button', { name: 'Criar skill' })).toBeNull();
  });

  it('sem skills, mostra a pasta vazia', () => {
    setState((s) => ({ harness: { ...s.harness, skills: [] } }));
    renderScreen();
    expect(screen.getByText(/Nenhuma skill em/)).toBeInTheDocument();
  });
});

describe('HarnessSettings: agentes', () => {
  it('novo agente com modelo; Cancelar limpa o formulário', async () => {
    renderScreen();
    await userEvent.click(screen.getByRole('button', { name: 'Novo subagente' }));
    await userEvent.type(screen.getByPlaceholderText('revisor-de-spec'), 'rascunho');
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Novo subagente' }));
    expect(screen.getByPlaceholderText('revisor-de-spec')).toHaveValue('');

    await userEvent.type(screen.getByPlaceholderText('revisor-de-spec'), 'Revisor Novo');
    await userEvent.type(screen.getByPlaceholderText('Revisa uma Spec e aponta lacunas antes do Plan'), ' Revisa ');
    await userEvent.type(screen.getByPlaceholderText('vazio = o modelo da sessão'), '  ');
    await userEvent.type(screen.getByPlaceholderText('Instruções do subagente'), 'Passos');
    await userEvent.click(screen.getByRole('button', { name: 'Criar subagente' }));
    expect(lastSent('harness.agent.create')).toEqual({
      type: 'harness.agent.create',
      name: 'revisor-novo',
      description: 'Revisa',
      content: 'Passos',
      model: undefined,
    });
    expect(screen.queryByRole('button', { name: 'Criar subagente' })).toBeNull();
  });

  it('nome de agente já usado não pode ser criado', async () => {
    renderScreen();
    await userEvent.click(screen.getByRole('button', { name: 'Novo subagente' }));
    await userEvent.type(screen.getByPlaceholderText('revisor-de-spec'), 'revisor');
    await userEvent.type(screen.getByPlaceholderText('Revisa uma Spec e aponta lacunas antes do Plan'), 'x');
    expect(screen.getByRole('button', { name: 'Criar subagente' })).toBeDisabled();
  });

  it('editar e apagar um agente', async () => {
    renderScreen();
    const a = block('revisor');
    expect(a.getByText('opus')).toBeInTheDocument();
    await userEvent.click(a.getByRole('button', { name: 'Editar' }));
    await userEvent.type(a.getByDisplayValue('instruções'), '.');
    await userEvent.click(a.getByRole('button', { name: 'Salvar' }));
    expect(lastSent('harness.agent.write')).toEqual({ type: 'harness.agent.write', name: 'revisor', content: 'instruções.' });
    await userEvent.click(a.getByTitle('Apagar o subagente'));
    await userEvent.click(dialog().getByRole('button', { name: 'Apagar' }));
    expect(lastSent('harness.agent.delete')).toEqual({ type: 'harness.agent.delete', name: 'revisor' });
  });

  it('sem agentes mostra a pasta vazia', () => {
    setState((s) => ({ harness: { ...s.harness, agents: [] } }));
    renderScreen();
    expect(screen.getByText(/Nenhum subagente em/)).toBeInTheDocument();
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
