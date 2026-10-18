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

import { choose, confirmLast, lastSent, posted, seedBoard, sentOf } from './setup';
import { RUNNER_PERMISSIONS } from '../../src/shared/runner';
import { profileOfAgent } from '../../src/shared/execution';
import { Dialog } from '../../src/webview/components/Dialog';
import { ToolHarness } from '../../src/webview/components/settings/harness/ToolHarness';
import { HarnessSettings } from '../../src/webview/components/settings/HarnessSettings';
import type { HarnessTopic } from '../../src/shared/harnessTopics';
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
  readonly: false,
  background: false,
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

const renderTab = (tab: HarnessTab) => {
  useBoardStore.setState({ harnessTab: tab });
  return render(
    <Theme>
      {tab === 'tool' ? <HarnessSettings /> : <ToolHarness tool={tab === 'cursor' || tab === 'kimi' ? tab : 'claude'} />}
      <Dialog />
    </Theme>,
  );
};
/** Ferramenta e execução */
const renderTool = () => renderTab('tool');
/** A aba da ferramenta do projeto, no assunto e na origem pedidos (Projeto abre por padrão). */
const renderScreen = async (topic: HarnessTopic = 'rules', origin?: string) => {
  useBoardStore.setState({ harnessTopic: topic });
  const view = renderTab('claude');
  if (origin) await userEvent.click(screen.getByRole('radio', { name: origin }));
  return view;
};
/** a linha de um item na tabela, pelo nome dele (a primeira: com o editor aberto, a linha de edição também o cita) */
const row = (name: string | RegExp) => within(screen.getAllByRole('row', { name })[0]!);
const dialog = () => within(screen.getByRole('dialog'));

describe('HarnessSettings: abas', () => {
  it('concentra os artefatos na biblioteca e mantém execução em outra aba', async () => {
    renderTool();
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(screen.queryByRole('tab', { name: /^Claude Code/ })).toBeNull();
    await userEvent.click(screen.getByRole('tab', { name: /^Biblioteca do board/ }));
    for (const name of ['Regras', 'Skills', 'Sub-agentes', 'MCPs'])
      expect(screen.getByRole('tab', { name: new RegExp(`^${name}`) })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Global' })).toBeNull();
  });

  it('as abas da biblioteca são as mesmas com Cursor selecionado', async () => {
    setState((s) => ({ board: { ...s.board, aiTool: 'cursor' } }));
    renderTool();
    await userEvent.click(screen.getByRole('tab', { name: /^Biblioteca do board/ }));
    expect(screen.getByRole('tab', { name: /^Regras/ })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /^Cursor/ })).toBeNull();
  });

  it('o endereço antigo de uma ferramenta abre a biblioteca central', () => {
    useBoardStore.setState({ harnessTab: 'claude', harnessTopic: 'rules' });
    render(
      <Theme>
        <HarnessSettings />
      </Theme>,
    );
    expect(screen.getByRole('tab', { name: /^Biblioteca do board/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /^Regras/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('as seções harness-project e harness-user levam à ferramenta do projeto, e harness-agents ao assunto Sub-agentes', () => {
    setState((s) => ({ board: { ...s.board, aiTool: 'cursor' } }));
    useBoardStore.setState({ harnessTab: 'tool', harnessTopic: 'rules' });
    useBoardStore.getState().goToSection('harness-user');
    expect(useBoardStore.getState()).toMatchObject({ harnessTab: 'cursor', harnessOrigin: 'user' });
    // a pendência "nenhum agente do board" cai no Board, onde se vê o que falta enviar
    useBoardStore.getState().goToSection('harness-agents');
    expect(useBoardStore.getState()).toMatchObject({ harnessTab: 'cursor', harnessTopic: 'agent', harnessOrigin: 'board' });
  });
});

describe('HarnessSettings: importar artefatos no navegador', () => {
  it('sem seletor de pasta, a pessoa digita o caminho, e o board varre a pasta', async () => {
    await renderScreen('skill');
    // no navegador o botão abre um campo, em vez de pedir o seletor do editor
    await userEvent.click(screen.getByRole('button', { name: 'Importar artefatos' }));
    expect(sentOf('harness.import.pick')).toHaveLength(0);
    const importar = screen.getByRole('button', { name: 'Importar' });
    expect(importar).toBeDisabled();
    await userEvent.type(screen.getByRole('textbox', { name: 'Caminho da pasta a importar' }), '  /srv/colecao  ');
    await userEvent.click(importar);
    expect(lastSent('harness.import.add')).toEqual({ type: 'harness.import.add', tool: 'claude', dir: '/srv/colecao' });
    // o campo fica, mostrando a espera, e fecha quando o host confirma a importação
    expect(screen.getByRole('textbox', { name: 'Caminho da pasta a importar' })).toBeInTheDocument();
    confirmLast();
    await act(async () => {});
    expect(screen.queryByRole('textbox', { name: 'Caminho da pasta a importar' })).toBeNull();
  });

  it('Cancelar fecha o campo sem enviar nada', async () => {
    await renderScreen('skill');
    await userEvent.click(screen.getByRole('button', { name: 'Importar artefatos' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('textbox', { name: 'Caminho da pasta a importar' })).toBeNull();
    expect(sentOf('harness.import.add')).toHaveLength(0);
  });
});

/** a linha de um item nas abas Projeto e Global, pelo nome dele */
const item = (name: string) => within(screen.getAllByText(name, { selector: '.item-name' })[0]!.closest('li')!);

describe('HarnessSettings: rules', () => {
  it('marcar e desmarcar uma rule do projeto grava a marcação; o global mostra os arquivos da pasta do usuário', async () => {
    await renderScreen('rules');
    const usage = () => item('AGENTS.md').getByRole('combobox', { name: 'Modo no board: AGENTS.md' });
    expect(usage()).toHaveTextContent('Fora do board');
    await choose(usage(), 'Sempre');
    expect(lastSent('harness.selection.set')).toEqual({
      type: 'harness.selection.set',
      items: [{ kind: 'instructions', location: 'AGENTS.md' }],
      usage: 'always',
    });
    act(() =>
      setState((s) => ({ harnessSelection: [...s.harnessSelection, { kind: 'instructions', location: 'AGENTS.md', usage: 'always' }] })),
    );
    expect(usage()).toHaveTextContent('Sempre');
    await choose(usage(), 'Fora do board');
    expect(lastSent('harness.selection.set').usage).toBeNull();
    // o CLAUDE.md global não aparece na aba do projeto
    expect(screen.queryByRole('button', { name: '~/.claude/CLAUDE.md' })).toBeNull();
    await userEvent.click(screen.getByRole('radio', { name: 'Global' }));
    expect(item('CLAUDE.md').getByRole('button', { name: '~/.claude/CLAUDE.md' })).toBeInTheDocument();
  });

  it('o caminho de uma rule abre o arquivo no editor do board', async () => {
    await renderScreen('rules');
    await userEvent.click(item('AGENTS.md').getByRole('button', { name: 'AGENTS.md' }));
    expect(useBoardStore.getState().harnessFile).toBe('/abs/AGENTS.md');
    act(() => useBoardStore.getState().closeHarnessFile());
  });

  it('uma marcação cujo arquivo sumiu aparece como ausente na origem Board e pode ser removida', async () => {
    setState((s) => ({
      harnessSelection: [...s.harnessSelection, { kind: 'instructions', location: '.claude/rules/velha.md', usage: 'contextual' }],
    }));
    await renderScreen('rules', 'Board');
    const missing = within(screen.getByText('.claude/rules/velha.md').closest('li')!);
    expect(missing.getByText('ausente')).toBeInTheDocument();
    await userEvent.click(missing.getByRole('button', { name: /^Excluir:/ }));
    expect(lastSent('harness.selection.set')).toEqual({
      type: 'harness.selection.set',
      items: [{ kind: 'instructions', location: '.claude/rules/velha.md' }],
      usage: null,
    });
  });
});

describe('HarnessSettings: skills', () => {
  it('o uso nas execuções troca entre as duas marcações', async () => {
    await renderScreen('skill');
    const usage = item('revisar-spec').getByRole('combobox', { name: 'Modo no board: revisar-spec' });
    expect(usage).toHaveTextContent('Sempre');
    await choose(usage, 'Pelo card');
    expect(lastSent('harness.selection.set')).toEqual({
      type: 'harness.selection.set',
      items: [{ kind: 'skill', location: '.claude/skills/revisar-spec/SKILL.md' }],
      usage: 'contextual',
    });
    // a desligada não está no inventário: não aparece
    expect(screen.queryByText('desligada', { selector: '.item-name' })).toBeNull();
  });

  it('modo, abrir e apagar uma skill do projeto', async () => {
    await renderScreen('skill');
    const k = item('revisar-spec');
    await choose(k.getByRole('combobox', { name: 'Modo da skill revisar-spec' }), 'Só quando indicada');
    expect(lastSent('harness.skill.setMode')).toEqual({
      type: 'harness.skill.setMode',
      tool: 'claude',
      paths: ['/abs/.claude/skills/revisar-spec/SKILL.md'],
      mode: 'manual',
    });
    await userEvent.click(k.getByRole('button', { name: '.claude/skills/revisar-spec/SKILL.md' }));
    expect(useBoardStore.getState().harnessFile).toBe('/abs/.claude/skills/revisar-spec/SKILL.md');
    act(() => useBoardStore.getState().closeHarnessFile());
    await userEvent.click(item('outra').getByRole('button', { name: 'Apagar' }));
    await userEvent.click(dialog().getByRole('button', { name: 'Apagar' }));
    expect(lastSent('harness.item.delete')).toEqual({
      type: 'harness.item.delete',
      tool: 'claude',
      kind: 'skill',
      path: '/abs/.claude/skills/outra/SKILL.md',
    });
  });

  it('nova skill abre o formulário de criação com o destino, e a skill do fluxo é instalada daqui', async () => {
    await renderScreen('skill');
    const skills = within(document.querySelector<HTMLElement>('.settings-card[aria-label="Skills"]')!);
    await userEvent.click(skills.getByRole('button', { name: 'Novo' }));
    expect(skills.getByText('Onde')).toBeInTheDocument();
    expect(skills.getByLabelText('Skill do fluxo')).toBeInTheDocument();
  });
});

describe('HarnessSettings: agentes', () => {
  // os agentes ficam no assunto Sub-agentes; a origem escolhe a pasta (Projeto ou Global)
  const openAgents = async (origin: string = 'Global') => {
    await renderScreen('agent', origin === 'Projeto' ? undefined : origin);
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
    // na origem Projeto ficam os agentes do projeto
    await userEvent.click(screen.getByRole('radio', { name: 'Projeto' }));
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
    await userEvent.click(screen.getByRole('radio', { name: 'Projeto' }));
    expect(screen.queryByRole('button', { name: 'Recriar os agentes padrão' })).toBeNull();
  });

  it('o agente padrão é escolhido em Ferramenta e execução entre os disponíveis', async () => {
    renderTool();
    const runner = document.querySelector<HTMLElement>('.runner-settings')!;
    expect(within(runner).getByRole('combobox', { name: 'Agente padrão' })).toHaveTextContent('revisor');
  });
});

describe('HarnessSettings: assistentes e sugestões de regras e skills', () => {
  it('Regras: o assistente abre no Projeto e no Global, a IA sugere, e nenhum aparece no Board', async () => {
    await renderScreen('rules');
    await userEvent.click(screen.getByRole('button', { name: 'Criar regra com ajuda' }));
    expect(screen.getByText('Passo 1 de 5')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByText('Passo 1 de 5')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Sugerir regras com IA' }));
    expect(lastSent('ai.suggestRules')).toEqual({ type: 'ai.suggestRules' });
    act(() => setState((st) => ({ chat: { ...st.chat, busy: true } })));
    expect(screen.getByRole('button', { name: 'Sugerir regras com IA' })).toBeDisabled();
    act(() => setState((st) => ({ chat: { ...st.chat, busy: false } })));

    // trocar de origem fecha o assistente aberto; no Global ele grava na pasta do usuário
    await userEvent.click(screen.getByRole('button', { name: 'Criar regra com ajuda' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Global' }));
    expect(screen.queryByText('Passo 1 de 5')).toBeNull();
    expect(screen.getByRole('button', { name: 'Criar regra com ajuda' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Board' }));
    expect(screen.queryByRole('button', { name: 'Criar regra com ajuda' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sugerir regras com IA' })).toBeNull();
  });

  it('Skills: o assistente e a sugestão da IA', async () => {
    await renderScreen('skill');
    await userEvent.click(screen.getByRole('button', { name: 'Criar skill com ajuda' }));
    expect(screen.getByText('Passo 1 de 6')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sugerir skills com IA' }));
    expect(lastSent('ai.suggestSkills')).toEqual({ type: 'ai.suggestSkills' });
    expect(screen.queryByRole('button', { name: 'Criar regra com ajuda' })).toBeNull();
  });

  it('em Sub-agentes e Hooks não há assistente de regras nem de skills', async () => {
    await renderScreen('hook');
    expect(screen.queryByRole('button', { name: 'Criar regra com ajuda' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Criar skill com ajuda' })).toBeNull();
  });

  it('a ferramenta que não é a do projeto não oferece os assistentes', async () => {
    useBoardStore.setState({ harnessTopic: 'rules' });
    renderTab('cursor');
    expect(screen.queryByRole('button', { name: 'Criar regra com ajuda' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sugerir regras com IA' })).toBeNull();
  });
});

describe('HarnessSettings: ferramenta e execução', () => {
  it('escolher outra ferramenta grava no board; a atual não envia nada', async () => {
    renderTool();
    const radios = screen.getAllByRole('radio');
    await userEvent.click(radios[0]!);
    expect(sentOf('settings.board.update')).toHaveLength(0);
    await userEvent.click(radios[1]!);
    expect(lastSent('settings.board.update')).toEqual({ type: 'settings.board.update', patch: { aiTool: 'cursor' } });
  });

  it('a aba de execução permite conectar o MCP e explica a biblioteca compartilhada', () => {
    renderTool();
    expect(screen.queryByRole('button', { name: /MCP/ })).toBeNull();
    expect(screen.getByText(/biblioteca do board, compartilhada entre as ferramentas/)).toBeInTheDocument();
  });

  it('permissão, tempo limite, heartbeat e Rodar o heartbeat agora', async () => {
    renderTool();
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
    // o intervalo do heartbeat só é editável com o heartbeat ligado
    expect(interval).toBeDisabled();
    const heartbeat = within(runner).getByRole('switch', { name: 'Heartbeat ligado' });
    await userEvent.click(heartbeat);
    expect(lastSent('settings.board.update').patch).toEqual({ runner: { heartbeat: true } });
    act(() => setState((st) => ({ board: { ...st.board, runner: { ...st.board.runner, heartbeat: true } } })));
    expect(interval).toBeEnabled();
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
    await userEvent.click(screen.getByRole('button', { name: 'Rodar o heartbeat agora' }));
    expect(lastSent('ai.heartbeat.run')).toEqual({ type: 'ai.heartbeat.run' });
  });

  it('sem suporte à execução, mostra o aviso no lugar dos campos', () => {
    setState(() => ({ aiRunUnsupported: 'Esta ferramenta não roda pelo board.' }));
    renderTool();
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

  it('um só lugar por tipo: o MCP no assunto MCPs e a skill no assunto Skills', async () => {
    const { unmount } = await renderScreen('mcp');
    expect(screen.getAllByLabelText('Servidor do board')).toHaveLength(1);
    expect(screen.queryByLabelText('Skill do fluxo')).toBeNull();
    expect(installBlock('Servidor do board').getByText('global: não instalado')).toBeInTheDocument();
    expect(installBlock('Servidor do board').getByText(/~\/\.claude\.json/)).toBeInTheDocument();
    unmount();
    await renderScreen('skill');
    expect(screen.getAllByLabelText('Skill do fluxo')).toHaveLength(1);
    expect(screen.queryByLabelText('Servidor do board')).toBeNull();
    expect(installBlock('Skill do fluxo').getByText('~/.claude/skills/faz-ai-fluxo')).toBeInTheDocument();
  });

  it('abrir e fechar a busca de skills várias vezes não duplica o card "Skill do fluxo" (nem o "Servidor do board")', async () => {
    // com a key repetida entre os irmãos, o React avisa e passa a duplicar o card
    const erro = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { unmount } = await renderScreen('skill');
    const skills = document.querySelector<HTMLElement>('.settings-card[aria-label="Skills"]')!;
    for (let i = 0; i < 4; i++) {
      await userEvent.click(within(skills).getByRole('button', { name: 'Buscar skills para instalar' }));
    }
    expect(screen.getAllByLabelText('Skill do fluxo')).toHaveLength(1);
    unmount();
    // o mesmo card (BoardInstall) vale para o servidor MCP: abrir e fechar o formulário ao lado dele não o duplica
    await renderScreen('mcp');
    const mcp = document.querySelector<HTMLElement>('.settings-card[aria-label="Servidores MCP"]')!;
    for (let i = 0; i < 4; i++) {
      await userEvent.click(within(mcp).getByRole('button', { name: 'Novo servidor' }));
    }
    expect(screen.getAllByLabelText('Servidor do board')).toHaveLength(1);
    const repetidas = erro.mock.calls.filter((c) => String(c[0]).includes('two children with the same key'));
    erro.mockRestore();
    expect(repetidas).toHaveLength(0);
  });

  it('o padrão da ferramenta instala no global, depois de confirmar', async () => {
    const { unmount } = await renderScreen('mcp');
    await userEvent.click(installBlock('Servidor do board').getByRole('button', { name: 'Instalar (padrão da ferramenta)' }));
    expect(sentOf('ui.connectAI')).toHaveLength(0);
    expect(dialog().getByText(/vale para todos os seus projetos/)).toBeInTheDocument();
    await userEvent.click(dialog().getByRole('button', { name: 'Instalar' }));
    expect(lastSent('ui.connectAI')).toEqual({ type: 'ui.connectAI', tool: 'claude' });
    unmount();

    await renderScreen('skill');
    await userEvent.click(installBlock('Skill do fluxo').getByRole('button', { name: 'Instalar (padrão da ferramenta)' }));
    await userEvent.click(dialog().getByRole('button', { name: 'Instalar' }));
    expect(lastSent('harness.flowSkill.install')).toEqual({
      type: 'harness.flowSkill.install',
      tool: 'claude',
      replace: false,
    });
  });

  it('só o global existe: um botão e nenhum texto "neste projeto" (fora o card do Cursor)', async () => {
    const { unmount } = await renderScreen('mcp');
    const mcp = installBlock('Servidor do board');
    expect(mcp.getAllByRole('button')).toHaveLength(1);
    expect(mcp.queryByText(/neste projeto/)).toBeNull();
    unmount();
    await renderScreen('skill');
    const skill = installBlock('Skill do fluxo');
    expect(skill.getAllByRole('button')).toHaveLength(1);
    expect(skill.queryByText(/neste projeto/)).toBeNull();
  });

  it('a skill que já existe no destino só é substituída depois de confirmar', async () => {
    withItems([item('skill', 'user', 'faz-ai-fluxo')]);
    await renderScreen('skill');
    await userEvent.click(installBlock('Skill do fluxo').getByRole('button', { name: 'Reinstalar (padrão da ferramenta)' }));
    expect(dialog().getByText(/será substituída/)).toBeInTheDocument();
    await userEvent.click(dialog().getByRole('button', { name: 'Substituir' }));
    expect(lastSent('harness.flowSkill.install')).toEqual({
      type: 'harness.flowSkill.install',
      tool: 'claude',
      replace: true,
    });
  });
});

describe('HarnessSettings: aviso de como usar', () => {
  it('aparece até a pessoa dispensar, fica guardado, e volta pelo "Como funciona"', async () => {
    useBoardStore.setState({ harnessIntroSeen: false });
    renderTool();
    const note = () => screen.queryByRole('note', { name: 'Como usar o Harness' });
    expect(note()).toBeInTheDocument();
    expect(note()).toHaveTextContent('Por onde começar');
    expect(screen.queryByRole('button', { name: 'Como funciona' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Entendi, não mostrar de novo' }));
    expect(note()).toBeNull();
    expect(useBoardStore.getState().harnessIntroSeen).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Como funciona' }));
    expect(note()).toBeInTheDocument();
  });

  it('dispensar grava no host (prefs.set) e o que o host manda em prefs vale, para não voltar ao reabrir o painel', async () => {
    useBoardStore.setState({ harnessIntroSeen: false });
    renderTool();
    const note = () => screen.queryByRole('note', { name: 'Como usar o Harness' });
    await userEvent.click(screen.getByRole('button', { name: 'Entendi, não mostrar de novo' }));
    expect(lastSent('prefs.set')).toEqual({ type: 'prefs.set', patch: { harnessIntroSeen: true } });
    // o painel reaberto começa sem saber e recebe as preferências do host no ready
    act(() => useBoardStore.setState({ harnessIntroSeen: false }));
    expect(note()).toBeInTheDocument();
    act(() => {
      useBoardStore.getState().setPrefs({ dontWarnYolo: false, yoloUntilName: '', harnessIntroSeen: true });
    });
    expect(note()).toBeNull();
  });
});
