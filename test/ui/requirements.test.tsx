import { lastSent, posted, renderThemed, seedBoard, sentOf, syncStore } from './setup';
import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RequirementsBanner, aiBlockedReason } from '../../src/webview/components/RequirementsBanner';
import { useBoardStore } from '../../src/webview/store/boardStore';
import { App } from '../../src/webview/App';
import type { MessageRouter } from '../../src/extension/panel/messageRouter';
import type { BoardRequirement } from '../../src/shared/requirements';
import { setLocale } from '../../src/webview/i18n';

let router: MessageRouter;

beforeEach(async () => {
  posted.mockClear();
  ({ router } = await seedBoard());
});

const set = (list: BoardRequirement[]) =>
  act(() => {
    router.setRequirements(list);
    syncStore(router);
  });

const setAuthExpired = (tool: BoardRequirement['tool'] | null) =>
  act(() => {
    router.setAuthExpired(tool);
    syncStore(router);
  });

const CLI: BoardRequirement = {
  id: 'cli',
  tool: 'cursor',
  cli: 'cursor-agent',
  where: 'https://cursor.com/cli',
  action: { kind: 'command', command: 'curl https://cursor.com/install -fsS | bash' },
};
const MCP: BoardRequirement = { id: 'mcp', tool: 'cursor', optional: true, action: { kind: 'connect' } };
const PERMISSION: BoardRequirement = {
  id: 'permission',
  tool: 'claude',
  reason: 'Escolha "Sem restrições".',
  action: { kind: 'settings' },
};

const missing = () => set([CLI, MCP, PERMISSION]);
const region = () => screen.queryByRole('region', { name: 'Requisitos do board' });

describe('faixa de requisitos do board', () => {
  it('não aparece com tudo pronto', () => {
    renderThemed(<RequirementsBanner />);
    expect(region()).toBeNull();
  });

  it('lista o que falta, com a ação de cada item, e não tem botão de fechar', async () => {
    missing();
    renderThemed(<RequirementsBanner />);
    // o recomendado aparece, mas não conta como requisito que falta
    expect(screen.getByText('Faltam 2 requisitos para o board trabalhar com a IA')).toBeInTheDocument();
    expect(screen.getByText('A linha de comando do Cursor não foi encontrada')).toBeInTheDocument();
    expect(screen.getByText(/recomendado/)).toBeInTheDocument();
    expect(screen.getByText('curl https://cursor.com/install -fsS | bash')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /fechar/i })).toBeNull();
    // uma região, não um alerta: o leitor de tela não relê tudo a cada vez que a faixa aparece
    expect(screen.queryByRole('alert')).toBeNull();

    // leva ao assunto MCPs da aba da ferramenta do projeto, onde se escolhe entre global e projeto
    await userEvent.click(screen.getByRole('button', { name: /Instalar o MCP do board/ }));
    expect(sentOf('ui.connectAI')).toHaveLength(0);
    expect(useBoardStore.getState()).toMatchObject({ view: 'settings', settingsTab: 'harness', harnessTab: 'claude', harnessTopic: 'mcp' });
    useBoardStore.setState({ view: 'board' });
    await userEvent.click(screen.getByRole('button', { name: 'Abrir Harness de IA' }));
    expect(useBoardStore.getState()).toMatchObject({ view: 'settings', settingsTab: 'harness' });
  });

  it('"Verificar de novo" mostra que está conferindo e diz quando nada mudou', async () => {
    missing();
    renderThemed(<RequirementsBanner />);
    await userEvent.click(screen.getByRole('button', { name: 'Verificar de novo' }));
    expect(lastSent('requirements.check')).toEqual({ type: 'requirements.check' });
    expect(screen.getByText('Conferindo…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verificar de novo' })).toBeDisabled();
    await new Promise((r) => setTimeout(r, 2));
    set([CLI, MCP, PERMISSION]);
    expect(screen.getByText('Conferido agora: nada mudou.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verificar de novo' })).toBeEnabled();
  });

  it('só o recomendado: uma linha discreta, sem contar como requisito', () => {
    set([MCP]);
    renderThemed(<RequirementsBanner />);
    expect(screen.getByText('Recomendado para a IA enxergar o board nas suas conversas')).toBeInTheDocument();
    expect(screen.queryByText(/requisito/)).toBeNull();
    expect(region()).toHaveClass('recommended');
    expect(region()).not.toHaveClass('warn');
  });

  it('some sozinho quando a última pendência é resolvida', () => {
    missing();
    renderThemed(<RequirementsBanner />);
    expect(region()).toBeInTheDocument();
    set([]);
    expect(region()).toBeNull();
  });

  it('no chat, compacto: sem as explicações dos itens que têm botão; com elas nos que não têm', () => {
    set([CLI, MCP, PERMISSION, { id: 'node', tool: 'cursor', action: null }]);
    renderThemed(<RequirementsBanner compact />);
    expect(screen.getByText('O MCP do board (faz-ai) não está instalado no Cursor')).toBeInTheDocument();
    // o recomendado (o MCP) fica com a explicação: é o motivo do aviso
    expect(screen.getByText(/Nas conversas com o Cursor no editor/)).toBeInTheDocument();
    expect(screen.queryByText(/Sem ela não rodam os botões de IA/)).toBeNull();
    // sem botão que resolva (Node.js, permissão sem o atalho das configurações): a explicação fica
    expect(screen.getByText(/roda com o Node.js 22 ou mais novo/)).toBeInTheDocument();
    expect(screen.getByText('Escolha "Sem restrições".')).toBeInTheDocument();
  });
});

describe('MCP do board no Cursor', () => {
  it('desativado: diz para que serve e leva à tela de MCPs do Cursor', async () => {
    set([{ id: 'mcp-enable', tool: 'cursor', action: { kind: 'openEditorMcp' } }]);
    renderThemed(<RequirementsBanner />);
    expect(screen.getByText('Falta um passo para o chat do Cursor usar o board')).toBeInTheDocument();
    expect(screen.getByText('Ative o MCP do board no Cursor')).toBeInTheDocument();
    expect(screen.getByText(/canal pelo qual a IA do chat do Cursor lê e atualiza os cards/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Abrir MCPs do Cursor/ }));
    expect(sentOf('ui.openEditorMcp')).toHaveLength(1);
  });
});

describe('skill do fluxo', () => {
  it('sem ela, a faixa conta como requisito e instala no escopo global', async () => {
    set([{ id: 'skill', tool: 'cursor', action: { kind: 'installSkill' } }]);
    renderThemed(<RequirementsBanner />);
    expect(screen.getByText('Falta 1 requisito para o board trabalhar com a IA')).toBeInTheDocument();
    expect(screen.getByText('A skill do fluxo (faz-ai-fluxo) não está pronta para o Cursor')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Instalar a skill' }));
    expect(sentOf('harness.flowSkill.install')).toEqual([
      { type: 'harness.flowSkill.install', tool: 'cursor', scope: 'user', replace: false },
    ]);
  });
});

describe('botões de IA com a CLI que falta', () => {
  it('a CLI que falta ou está sem login bloqueia os botões, com o motivo', () => {
    expect(aiBlockedReason(router.snapshot())).toBeNull();
    set([CLI]);
    expect(aiBlockedReason(useBoardStore.getState().state!)).toContain('não foi encontrada');
    set([{ id: 'signin', tool: 'cursor', cli: 'cursor-agent', action: { kind: 'command', command: 'cursor-agent login' } }]);
    expect(aiBlockedReason(useBoardStore.getState().state!)).toContain('sem login');
    // o recomendado não bloqueia nada
    set([MCP]);
    expect(aiBlockedReason(useBoardStore.getState().state!)).toBeNull();
  });

  it('o login vencido durante a execução (sinal reativo) também bloqueia, mesmo sem o requisito "signin"', () => {
    setAuthExpired('claude');
    expect(aiBlockedReason(useBoardStore.getState().state!)).toContain('login do Claude Code venceu');
    setAuthExpired(null);
    expect(aiBlockedReason(useBoardStore.getState().state!)).toBeNull();
  });
});

describe('login vencido: aviso de erro, item sintético e "Abrir no terminal"', () => {
  const SIGNIN: BoardRequirement = {
    id: 'signin',
    tool: 'claude',
    cli: 'claude',
    action: { kind: 'command', command: 'claude auth login', terminal: true },
  };

  it('com o requisito "signin", a faixa fica com destaque de erro, não de aviso comum', () => {
    set([SIGNIN]);
    renderThemed(<RequirementsBanner />);
    expect(region()).toHaveClass('error');
    expect(region()).not.toHaveClass('warn');
  });

  it('o sinal reativo sem "signin" nos requisitos (o probe não soube dizer) monta o item sozinho', () => {
    setAuthExpired('cursor');
    renderThemed(<RequirementsBanner />);
    expect(region()).toBeInTheDocument();
    expect(region()).toHaveClass('error');
    expect(screen.getByText('A linha de comando do Cursor está sem login')).toBeInTheDocument();
  });

  it('"Abrir no terminal" roda o comando pelo host; some no modo navegador', async () => {
    set([SIGNIN]);
    renderThemed(<RequirementsBanner />);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir no terminal' }));
    expect(sentOf('ui.openTerminal')).toEqual([{ type: 'ui.openTerminal', command: 'claude auth login' }]);
  });
});

describe('aviso compacto do que falta (no lugar da faixa no topo do board)', () => {
  it('a aba Configurações e o Verificar ambiente ganham o ícone de atenção, e o hint diz o que falta', async () => {
    set([CLI, MCP]);
    renderThemed(<App />);
    // a faixa não aparece mais no board
    expect(screen.queryByRole('region', { name: 'Requisitos do board' })).toBeNull();
    const tab = screen.getByRole('button', { name: /Configurações/ });
    expect(tab).toHaveTextContent('Falta 1 requisito para o board trabalhar com a IA');
    fireEvent.focus(tab);
    const hint = await screen.findByRole('tooltip');
    expect(hint).toHaveTextContent('A linha de comando do Cursor não foi encontrada');
    expect(hint).toHaveTextContent('Veja como resolver em Configurações → Verificar ambiente.');
    fireEvent.blur(tab);

    await userEvent.click(tab);
    // nas Configurações, o mesmo ícone no Verificar ambiente
    const check = document.querySelector('.settings-side-actions .requirements-alert');
    expect(check).not.toBeNull();
  });

  it('login vencido deixa o ícone com destaque de erro; sem nada faltando, não há ícone', () => {
    setAuthExpired('cursor');
    renderThemed(<App />);
    expect(document.querySelector('.requirements-alert.error')).not.toBeNull();
    setAuthExpired(null);
    expect(document.querySelector('.requirements-alert')).toBeNull();
  });
});

describe('faixa de requisitos: definição do harness', () => {
  it('é só recomendação: a linha discreta diz o que falta e leva ao Harness de IA', async () => {
    // o teste anterior monta o App, que deixa a interface no idioma do navegador (inglês no jsdom)
    setLocale('pt');
    set([{ id: 'harness', tool: 'cursor', optional: true, harnessIssues: ['artifacts', 'rules'], action: { kind: 'settings' } }]);
    renderThemed(<RequirementsBanner />);
    expect(region()).toHaveClass('recommended');
    expect(screen.getByText('Recomendado: defina o harness para as execuções gastarem menos contexto')).toBeInTheDocument();
    expect(screen.getByText('O harness do board ainda não está definido')).toBeInTheDocument();
    expect(
      screen.getByText(/nenhuma skill, agente ou servidor MCP em modo "Pelo card"; regras no board ainda desligadas/),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir Harness de IA' }));
    expect(useBoardStore.getState().view).toBe('settings');
  });
});
