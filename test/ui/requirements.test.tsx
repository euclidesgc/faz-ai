import { lastSent, posted, renderThemed, seedBoard, sentOf, confirmLast } from './setup';
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

/** Copia o estado do roteador para a store, com o Cursor como perfil padrão e o Kimi ligado (o board novo nasce no Claude Code). */
const sync = () =>
  useBoardStore.setState({
    state: {
      ...router.snapshot(),
      board: {
        ...router.snapshot().board,
        aiTool: 'cursor',
        aiProfiles: router.snapshot().board.aiProfiles.map((p) => ({ ...p, enabled: p.enabled || p.id === 'cursor' || p.id === 'kimi' })),
      },
    },
  });

const set = (list: BoardRequirement[]) =>
  act(() => {
    router.setRequirements(list);
    sync();
  });

const setAuthExpired = (tool: Parameters<MessageRouter['setAuthExpired']>[0], expired = true) =>
  act(() => {
    router.setAuthExpired(tool, expired);
    sync();
  });

const NONE = (reason: 'no-enabled' | 'unvalidated' | 'unavailable'): BoardRequirement => ({
  id: 'no-profile',
  reason,
  action: { kind: 'diagnostic' },
});
const CURSOR_CLI: BoardRequirement = {
  id: 'profile',
  profile: 'cursor',
  name: 'Cursor',
  problem: 'cli',
  optional: true,
  action: { kind: 'diagnostic', profile: 'cursor' },
};
const CLAUDE_LOGIN: BoardRequirement = {
  id: 'profile',
  profile: 'claude',
  name: 'Claude Code',
  problem: 'signin',
  optional: true,
  action: { kind: 'command', command: 'claude auth login', terminal: true },
};
const NODE: BoardRequirement = { id: 'node', action: null };
const HARNESS: BoardRequirement = { id: 'harness', optional: true, harnessIssues: ['artifacts', 'rules'], action: { kind: 'settings' } };

const region = () => screen.queryByRole('region', { name: 'Requisitos do board' });

describe('faixa de requisitos do board', () => {
  it('não aparece com tudo pronto', () => {
    renderThemed(<RequirementsBanner />);
    expect(region()).toBeNull();
  });

  it('os três textos de "nenhum perfil", com "teste um perfil" quando só falta validar, e o botão do diagnóstico', async () => {
    for (const [reason, title] of [
      ['no-enabled', 'Nenhum perfil de CLI está ligado'],
      ['unvalidated', 'Nenhum perfil de CLI foi validado: teste um perfil para o board trabalhar com a IA'],
      ['unavailable', 'Nenhum perfil de CLI está disponível para o board trabalhar com a IA'],
    ] as const) {
      set([NONE(reason)]);
      const { unmount } = renderThemed(<RequirementsBanner />);
      expect(screen.getAllByText(title).length).toBeGreaterThan(0);
      expect(region()).toHaveClass('error');
      unmount();
    }
    set([NONE('no-enabled')]);
    renderThemed(<RequirementsBanner />);
    await userEvent.click(screen.getByRole('button', { name: 'Ver no diagnóstico' }));
    expect(useBoardStore.getState()).toMatchObject({ view: 'environment', environmentProfile: null });
  });

  it('o aviso de um perfil não bloqueia, não conta como requisito e leva ao bloco do perfil', async () => {
    set([CURSOR_CLI]);
    renderThemed(<RequirementsBanner />);
    expect(screen.getByText('1 perfil de CLI precisa de atenção')).toBeInTheDocument();
    expect(screen.getByText('Cursor: linha de comando não encontrada')).toBeInTheDocument();
    expect(screen.queryByText(/requisito/)).toBeNull();
    expect(region()).toHaveClass('warn');
    expect(region()).not.toHaveClass('error');
    await userEvent.click(screen.getByRole('button', { name: 'Ver no diagnóstico' }));
    expect(useBoardStore.getState()).toMatchObject({ view: 'environment', environmentProfile: 'cursor' });
  });

  it('a prova de capacidades invalidada avisa sem bloquear e diz como ela é refeita', () => {
    set([
      {
        id: 'profile',
        profile: 'claude',
        name: 'Claude Code',
        problem: 'evidence-invalidated',
        optional: true,
        action: { kind: 'diagnostic', profile: 'claude' },
      },
      {
        id: 'profile',
        profile: 'kimi',
        name: 'Gemini CLI',
        problem: 'evidence-invalidated',
        automatic: true,
        optional: true,
        action: { kind: 'diagnostic', profile: 'kimi' },
      },
    ]);
    renderThemed(<RequirementsBanner />);
    expect(screen.getByText('2 perfis de CLI precisam de atenção')).toBeInTheDocument();
    expect(screen.getByText('Claude Code: a verificação de capacidades perdeu a validade')).toBeInTheDocument();
    expect(screen.getByText('Gemini CLI: a verificação de capacidades perdeu a validade')).toBeInTheDocument();
    expect(
      screen.getByText(/Rode "Faz AI: Verificar o isolamento da CLI de IA" na paleta de comandos e escolha este perfil/),
    ).toBeInTheDocument();
    expect(screen.getByText(/O board já está verificando de novo, sem gastar a sua conta/)).toBeInTheDocument();
    expect(region()).toHaveClass('warn');
    expect(region()).not.toHaveClass('error');
    expect(aiBlockedReason(useBoardStore.getState().state!)).toBeNull();
  });

  it('o login de um perfil pronto traz o comando de login e o "Abrir no terminal"', async () => {
    set([CLAUDE_LOGIN]);
    renderThemed(<RequirementsBanner />);
    expect(screen.getByText('Claude Code: sem login')).toBeInTheDocument();
    expect(screen.getByText('claude auth login')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir no terminal' }));
    expect(sentOf('ui.openTerminal')).toEqual([{ type: 'ui.openTerminal', command: 'claude auth login' }]);
  });

  it('"Verificar de novo" mostra que está conferindo e diz quando nada mudou', async () => {
    set([NODE, CURSOR_CLI]);
    renderThemed(<RequirementsBanner />);
    await userEvent.click(screen.getByRole('button', { name: 'Verificar de novo' }));
    expect(lastSent('requirements.check')).toEqual({ type: 'requirements.check' });
    expect(screen.getByText('Conferindo…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verificar de novo' })).toBeDisabled();
    set([NODE, CURSOR_CLI]);
    confirmLast();
    await act(async () => {});
    expect(screen.getByText('Conferido agora: nada mudou.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verificar de novo' })).toBeEnabled();
  });

  it('a conferência que falha destrava "Verificar de novo" sem dizer que nada mudou', async () => {
    set([NODE]);
    renderThemed(<RequirementsBanner />);
    await userEvent.click(screen.getByRole('button', { name: 'Verificar de novo' }));
    confirmLast(false, 'Não foi possível conferir os requisitos do board: CLI não respondeu.');
    await act(async () => {});
    expect(screen.queryByText('Conferindo…')).toBeNull();
    expect(screen.queryByText('Conferido agora: nada mudou.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Verificar de novo' })).toBeEnabled();
  });

  it('sem Node.js, falta 1 requisito, com destaque de aviso', () => {
    set([NODE, CURSOR_CLI]);
    renderThemed(<RequirementsBanner />);
    expect(screen.getByText('Falta 1 requisito para o board trabalhar com a IA')).toBeInTheDocument();
    expect(screen.getByText('Node.js não encontrado')).toBeInTheDocument();
    expect(region()).toHaveClass('warn');
  });

  it('some sozinho quando a última pendência é resolvida', () => {
    set([NONE('unavailable')]);
    renderThemed(<RequirementsBanner />);
    expect(region()).toBeInTheDocument();
    set([]);
    expect(region()).toBeNull();
  });

  it('no chat, compacto: sem o atalho do diagnóstico; com a explicação onde não há botão que resolva', () => {
    set([NODE, CURSOR_CLI]);
    renderThemed(<RequirementsBanner compact />);
    expect(screen.queryByRole('button', { name: 'Ver no diagnóstico' })).toBeNull();
    expect(screen.getByText(/roda com o Node.js 22 ou mais novo/)).toBeInTheDocument();
    expect(screen.getByText(/O board não encontrou a linha de comando deste perfil/)).toBeInTheDocument();
  });

  it('não há texto nem botão dos requisitos que saíram (MCP, skill, permissão)', () => {
    set([NONE('unavailable'), CURSOR_CLI, HARNESS]);
    renderThemed(<RequirementsBanner />);
    expect(screen.queryByText(/MCP do board/)).toBeNull();
    expect(screen.queryByText(/skill do fluxo/)).toBeNull();
    for (const name of [
      /Instalar o MCP/,
      /Instalar a skill/,
      /Corrigir o registro/,
      /Corrigir o caminho/,
      /Liberar as ferramentas/,
      /Abrir MCPs/,
    ])
      expect(screen.queryByRole('button', { name })).toBeNull();
  });
});

describe('botões de IA sem perfil disponível', () => {
  it('"nenhum perfil" bloqueia os botões, com o motivo; o aviso de um perfil e o recomendado não', () => {
    expect(aiBlockedReason(router.snapshot())).toBeNull();
    set([NONE('unavailable')]);
    expect(aiBlockedReason(useBoardStore.getState().state!)).toContain('Nenhum perfil de CLI está disponível');
    set([HARNESS]);
    expect(aiBlockedReason(useBoardStore.getState().state!)).toBeNull();
    // o problema do perfil padrão (Cursor) bloqueia o que o usaria
    set([CURSOR_CLI]);
    expect(aiBlockedReason(useBoardStore.getState().state!)).toContain('linha de comando do Cursor não foi encontrada');
  });

  it('o login vencido do perfil padrão durante a execução (sinal reativo) também bloqueia', () => {
    setAuthExpired('cursor');
    expect(aiBlockedReason(useBoardStore.getState().state!)).toContain('login do Cursor venceu');
    setAuthExpired('cursor', false);
    expect(aiBlockedReason(useBoardStore.getState().state!)).toBeNull();
  });
});

describe('aviso compacto do que falta (no lugar da faixa no topo do board)', () => {
  it('a aba Configurações e o Verificar ambiente ganham o ícone de atenção, e o hint diz o que falta', async () => {
    set([CURSOR_CLI]);
    renderThemed(<App />);
    // a faixa não aparece mais no board
    expect(screen.queryByRole('region', { name: 'Requisitos do board' })).toBeNull();
    const tab = screen.getByRole('button', { name: /Configurações/ });
    expect(tab).toHaveTextContent('1 perfil de CLI precisa de atenção');
    fireEvent.focus(tab);
    const hint = await screen.findByRole('tooltip');
    expect(hint).toHaveTextContent('Cursor: linha de comando não encontrada');
    expect(hint).toHaveTextContent('Veja como resolver em Configurações → Verificar ambiente.');
    fireEvent.blur(tab);

    await userEvent.click(tab);
    // nas Configurações, o mesmo ícone no Verificar ambiente
    const check = document.querySelector('.settings-side-actions .requirements-alert');
    expect(check).not.toBeNull();
  });

  it('nenhum perfil disponível deixa o ícone com destaque de erro; sem nada faltando, não há ícone', () => {
    set([NONE('unavailable')]);
    renderThemed(<App />);
    expect(document.querySelector('.requirements-alert.error')).not.toBeNull();
    set([CURSOR_CLI]);
    expect(document.querySelector('.requirements-alert.warn')).not.toBeNull();
    set([]);
    expect(document.querySelector('.requirements-alert')).toBeNull();
  });
});

describe('faixa de requisitos: definição do harness', () => {
  it('é só recomendação: a linha discreta diz o que falta e leva ao Harness', async () => {
    // o teste anterior monta o App, que deixa a interface no idioma do navegador (inglês no jsdom)
    setLocale('pt-BR');
    set([HARNESS]);
    renderThemed(<RequirementsBanner />);
    expect(region()).toHaveClass('recommended');
    expect(screen.getByText('Recomendado: defina o harness para as execuções gastarem menos contexto')).toBeInTheDocument();
    expect(screen.getByText('O harness do board ainda não está definido')).toBeInTheDocument();
    expect(
      screen.getByText(/nenhuma skill, agente ou servidor MCP em modo "Pelo card"; regras no board ainda desligadas/),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir Harness' }));
    expect(useBoardStore.getState().view).toBe('settings');
  });
});
