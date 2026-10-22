import { posted, renderThemed, seedBoard, sentOf, syncStore, confirmLast } from './setup';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EnvironmentView } from '../../src/webview/components/EnvironmentView';
import { RequirementsBanner } from '../../src/webview/components/RequirementsBanner';
import { Settings } from '../../src/webview/components/settings/Settings';
import { useBoardStore } from '../../src/webview/store/boardStore';
import type { MessageRouter } from '../../src/extension/panel/messageRouter';
import type { EnvCheck, EnvironmentReport } from '../../src/shared/environment';
import type { ProfileHealth } from '../../src/shared/profileHealth';

let router: MessageRouter;

beforeEach(async () => {
  posted.mockClear();
  ({ router } = await seedBoard());
  useBoardStore.setState({ view: 'board' });
});

const show = (r: EnvironmentReport) =>
  act(() => {
    router.setEnvironment(r);
    syncStore(router);
  });

const profile = (id: string, over: Partial<ProfileHealth> = {}): ProfileHealth => ({
  id,
  name: id === 'claude' ? 'Claude Code' : id === 'cursor' ? 'Cursor' : id,
  kind: 'builtin',
  base: id as ProfileHealth['base'],
  registration: 'enabled',
  isDefault: id === 'claude',
  probe: { id, found: true, path: `/bin/${id}`, version: '2.1.4', login: 'signed-in' },
  credentials: [],
  capabilities: [],
  admission: null,
  evidence: { state: 'never' },
  install: null,
  authExpired: false,
  validationRequired: false,
  problem: null,
  ...over,
});
const harnessCheck = (status: EnvCheck['status'] = 'ok'): EnvCheck => ({
  id: 'harness',
  status,
  requirement:
    status === 'missing' ? { id: 'harness', optional: true, harnessIssues: ['artifacts'], action: { kind: 'settings' } } : undefined,
  children: [
    { id: 'harness-artifacts', status: status === 'missing' ? 'missing' : 'ok' },
    { id: 'harness-agents', status: 'ok' },
    { id: 'harness-rules', status: 'ok' },
    { id: 'harness-missing', status: 'ok' },
  ],
});
const report = (o: { profiles?: ProfileHealth[]; harness?: EnvCheck['status'] } = {}): EnvironmentReport => ({
  required: [{ id: 'node', status: 'ok', version: '22.11.0', docs: 'https://nodejs.org/en/download' }],
  profiles: o.profiles ?? [
    profile('claude'),
    profile('cursor', { probe: { id: 'cursor', found: false, login: 'unchecked' }, problem: 'cli' }),
  ],
  availability: { blocked: false, reason: null, warnings: [] },
  regime: 'exclusive',
  nextRun: null,
  limits: null,
  harness: harnessCheck(o.harness),
  recommended: [
    {
      id: 'crg',
      status: 'ok',
      version: '2.3.1',
      children: [
        { id: 'crg-graph', status: 'missing', command: 'code-review-graph build' },
        {
          id: 'crg-embeddings',
          status: 'missing',
          install: [{ command: 'uv tool install --reinstall "code-review-graph[embeddings]"' }],
          command: 'code-review-graph embed --provider local',
        },
      ],
    },
  ],
  checkedAt: Date.now() + 1000,
});

const block = (name: string) => screen.getByRole('region', { name: new RegExp(`^${name}`) });

const item = (title: string) => screen.getByText(title).closest('li')!;

describe('Diagnóstico do ambiente', () => {
  it('o nome da branch pendente mostra o comando e o botão que abre a tela Git', async () => {
    syncStore(router);
    renderThemed(<EnvironmentView />);
    show({
      ...report(),
      recommended: [{ id: 'branch-name', status: 'missing', command: 'git branch -m master main', inProject: true }],
    });
    const row = item('Nome da branch principal/develop');
    expect(within(row).getByText('git branch -m master main')).toBeInTheDocument();
    await userEvent.click(within(row).getByRole('button', { name: 'Abrir a tela Git' }));
    expect(useBoardStore.getState().view).toBe('settings');
    expect(useBoardStore.getState().settingsTab).toBe('git');
  });

  it('a cópia antiga da skill do fluxo lista os arquivos a apagar, sem botão que apague', () => {
    syncStore(router);
    renderThemed(<EnvironmentView />);
    const file = '/home/u/.claude/skills/faz-ai-fluxo/SKILL.md';
    show({ ...report(), recommended: [{ id: 'flow-skill-copy', status: 'missing', paths: [file] }] });
    const row = item('Cópia antiga da skill do fluxo');
    expect(within(row).getByText(file)).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: /apagar|excluir|delete/i })).not.toBeInTheDocument();
  });

  it('sem cópia antiga, o aviso não aparece', () => {
    syncStore(router);
    renderThemed(<EnvironmentView />);
    show(report());
    expect(screen.queryByText('Cópia antiga da skill do fluxo')).not.toBeInTheDocument();
  });

  it('o nome da branch pronto não traz o botão', () => {
    syncStore(router);
    renderThemed(<EnvironmentView />);
    show({ ...report(), recommended: [{ id: 'branch-name', status: 'ok' }] });
    expect(screen.queryByRole('button', { name: 'Abrir a tela Git' })).not.toBeInTheDocument();
  });

  it('confere ao abrir e mostra necessários, perfis de CLI, banco de artefatos e recomendados, nessa ordem', () => {
    syncStore(router);
    renderThemed(<EnvironmentView />);
    expect(sentOf('environment.check')).toHaveLength(1);
    expect(screen.getByText('Conferindo o ambiente…')).toBeInTheDocument();
    show(report());
    expect(screen.getByText(/O board está pronto para trabalhar com a IA/)).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Necessários',
      'Perfis de CLI',
      'Próxima execução e limites',
      'Banco de artefatos',
      'Recomendados',
    ]);
    expect(within(screen.getByRole('region', { name: 'Necessários' })).getByText('22.11.0')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Recomendados' })).getByText('Code Review Graph')).toBeInTheDocument();
  });

  it('um bloco por perfil, o padrão primeiro, com o caminho e a versão; os desligados ficam num grupo fechado', () => {
    syncStore(router);
    renderThemed(<EnvironmentView />);
    show(
      report({
        profiles: [
          profile('claude'),
          profile('cursor', { registration: 'disabled', isDefault: false }),
          profile('importado', { registration: 'pending-review', probe: null, isDefault: false }),
        ],
      }),
    );
    expect(screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent)).toEqual(['Claude Code · Padrão', 'Cursor', 'importado']);
    const claude = block('Claude Code');
    expect(within(claude).getByText('Ligado')).toBeInTheDocument();
    expect(within(claude).getByText('Linha de comando encontrada · /bin/claude · 2.1.4')).toBeInTheDocument();
    expect(within(claude).getByText('Login: conectado')).toBeInTheDocument();
    const group = screen.getByText('Desligados (2)').closest('details')!;
    expect(group).not.toHaveAttribute('open');
    expect(within(group).getByText('Desligado')).toBeInTheDocument();
  });

  it('critério de aceite: Claude Code pronto e Cursor sem CLI aparece como não encontrado, com a instalação, sem bloquear', () => {
    syncStore(router);
    renderThemed(<EnvironmentView />);
    show(
      report({
        profiles: [
          profile('claude'),
          profile('cursor', {
            probe: { id: 'cursor', found: false, login: 'unchecked' },
            problem: 'cli',
            install: {
              steps: [{ command: 'curl https://cursor.com/install -fsS | bash' }],
              docs: 'https://cursor.com/docs/cli/installation',
            },
          }),
        ],
      }),
    );
    const cursor = block('Cursor');
    expect(within(cursor).getByText('Linha de comando não encontrada')).toBeInTheDocument();
    expect(within(cursor).getByText('Login: não conferido (falta a linha de comando)')).toBeInTheDocument();
    expect(within(cursor).getByText('curl https://cursor.com/install -fsS | bash')).toBeInTheDocument();
    expect(screen.getByText(/O board está pronto para trabalhar com a IA/)).toBeInTheDocument();
  });

  it('o perfil pendente de revisão mostra só o aviso: sem versão, sem login e sem instalação', () => {
    syncStore(router);
    renderThemed(<EnvironmentView />);
    show(report({ profiles: [profile('importado', { registration: 'pending-review', probe: null, isDefault: false })] }));
    useBoardStore.setState({ environmentProfile: 'importado' });
    const pending = block('importado');
    expect(within(pending).getByText('Pendente de revisão')).toBeInTheDocument();
    expect(within(pending).getByText(/revise antes de usar/)).toBeInTheDocument();
    expect(within(pending).queryByText(/Linha de comando/)).toBeNull();
    expect(within(pending).queryByText(/Login/)).toBeNull();
    expect(within(screen.getByText('Desligados (1)').closest('details')!).getByText('importado')).toBeInTheDocument();
  });

  it('os três estados de login, com o comando de login do perfil pronto quando desconectado', () => {
    syncStore(router);
    renderThemed(<EnvironmentView />);
    show(
      report({
        profiles: [
          profile('claude', { probe: { id: 'claude', found: true, path: '/bin/claude', login: 'signed-out' }, problem: 'signin' }),
          profile('cursor', { probe: { id: 'cursor', found: true, path: '/bin/cursor', login: 'unchecked' }, isDefault: false }),
          profile('kimi', { isDefault: false }),
        ],
      }),
    );
    expect(within(block('Claude Code')).getByText('Login: desconectado')).toBeInTheDocument();
    expect(within(block('Claude Code')).getByText('claude auth login')).toBeInTheDocument();
    expect(within(block('Cursor')).getByText('Login: não conferido (o perfil não tem comando de status)')).toBeInTheDocument();
    expect(within(block('kimi')).getByText('Login: conectado')).toBeInTheDocument();
  });

  it('credenciais: só o nome da referência e se está preenchida ou ausente', () => {
    syncStore(router);
    renderThemed(<EnvironmentView />);
    show(
      report({
        profiles: [
          profile('claude', {
            credentials: [
              { name: 'ref-a', filled: true },
              { name: 'ref-b', filled: false },
            ],
          }),
        ],
      }),
    );
    expect(screen.getByText('Credencial ref-a: preenchida')).toBeInTheDocument();
    expect(screen.getByText('Credencial ref-b: ausente')).toBeInTheDocument();
  });

  it('a última verificação real: nunca testado, vencido e verificado, sem selo no que não foi provado', () => {
    syncStore(router);
    renderThemed(<EnvironmentView />);
    show(
      report({
        profiles: [
          profile('claude', { evidence: { state: 'never' } }),
          profile('cursor', { evidence: { state: 'stale' }, isDefault: false }),
          profile('kimi', { evidence: { state: 'valid', version: '1.9.0' }, isDefault: false }),
        ],
      }),
    );
    expect(within(block('Claude Code')).getByText('Não validado: este perfil ainda não foi testado')).toBeInTheDocument();
    expect(within(block('Cursor')).getByText(/Precisa verificar de novo/)).toBeInTheDocument();
    expect(within(block('kimi')).getByText('Verificado em 1.9.0')).toBeInTheDocument();
  });

  it('o aviso do topo leva ao bloco do perfil: o grupo dos desligados abre quando o perfil está lá', () => {
    syncStore(router);
    useBoardStore.setState({ environmentProfile: 'cursor' });
    renderThemed(<EnvironmentView />);
    show(report({ profiles: [profile('claude'), profile('cursor', { registration: 'disabled', isDefault: false })] }));
    expect(screen.getByText('Desligados (1)').closest('details')).toHaveAttribute('open');
  });

  it('o banco de artefatos é um bloco à parte, com um filho por falta, cada um explicando como resolver', async () => {
    syncStore(router);
    renderThemed(<EnvironmentView />);
    show(report({ harness: 'missing' }));
    const harness = item('Banco de artefatos do board');
    expect(within(harness).getByText('Artefatos no board')).toBeInTheDocument();
    expect(screen.queryByText('Artefatos do projeto fora do board')).toBeNull();
    expect(within(harness).getByRole('button', { name: 'Abrir Harness' })).toBeInTheDocument();
    fireEvent.focus(screen.getByText('Artefatos no board'));
    expect((await screen.findByRole('tooltip')).textContent).toMatch(/Nenhuma skill, agente ou servidor MCP/);
  });

  it('o que falta traz os comandos de instalação em ordem; o que está pronto, não', () => {
    syncStore(router);
    renderThemed(<EnvironmentView />);
    show({
      ...report(),
      required: [
        {
          id: 'node',
          status: 'missing',
          install: [
            { command: 'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.8/install.sh | bash', step: 'nvm' },
            { command: '. "$HOME/.nvm/nvm.sh"', step: 'nvm-load' },
            { command: 'nvm install 22', step: 'node' },
          ],
        },
      ],
    });
    const node = item('Node.js 22 ou mais novo');
    expect(within(node).getByText('Para instalar, em ordem:')).toBeInTheDocument();
    // cada passo diz o que faz: o primeiro instala o nvm
    expect(within(node).getByText('Instala o nvm, o gerenciador de versões do Node.js:')).toBeInTheDocument();
    expect(within(node).getByText('Instala o Node.js 22 com ele:')).toBeInTheDocument();
    expect(
      within(node)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([expect.stringContaining('nvm-sh/nvm'), expect.stringContaining('nvm.sh'), expect.stringContaining('nvm install 22')]);
    // o Code Review Graph está pronto: o único "Para instalar" dentro dele é o da busca semântica, que falta
    expect(within(item('Code Review Graph')).getAllByText(/Para instalar/)).toHaveLength(1);
    expect(within(item('Busca semântica')).getByText('Para instalar:')).toBeInTheDocument();
  });

  it('cada item tem o estado em palavras e o site entre parênteses', () => {
    syncStore(router);
    renderThemed(<EnvironmentView />);
    show(report());
    const node = item('Node.js 22 ou mais novo');
    expect(within(node).getByText('Pronto:')).toBeInTheDocument();
    expect(within(node).getByRole('link', { name: /nodejs\.org\/en\/download/ })).toHaveAttribute('href', 'https://nodejs.org/en/download');
  });

  it('o hint de cada linha explica como o board usa o item', async () => {
    syncStore(router);
    renderThemed(<EnvironmentView />);
    show(report());
    fireEvent.focus(screen.getByText('Code Review Graph'));
    expect((await screen.findByRole('tooltip')).textContent).toMatch(/grafo do código/);
  });

  it('os comandos do Code Review Graph têm copiar, e a busca semântica traz antes o comando de instalar o pacote', () => {
    syncStore(router);
    renderThemed(<EnvironmentView />);
    show(report());
    expect(within(item('Grafo deste projeto')).getByText('code-review-graph build')).toBeInTheDocument();
    const semantic = item('Busca semântica');
    expect(within(semantic).getByText('code-review-graph embed --provider local')).toBeInTheDocument();
    expect(within(semantic).getByText('Para instalar:')).toBeInTheDocument();
    expect(within(semantic).getByText('uv tool install --reinstall "code-review-graph[embeddings]"')).toBeInTheDocument();
    expect(within(semantic).getByText('Depois:')).toBeInTheDocument();
  });

  it('"Verificar de novo" roda outra vez e fica desligado até a resposta', async () => {
    syncStore(router);
    renderThemed(<EnvironmentView />);
    show(report());
    confirmLast();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 5000);
    await userEvent.click(screen.getByRole('button', { name: 'Verificar de novo' }));
    expect(sentOf('environment.check')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Verificar de novo' })).toBeDisabled();
    show({ ...report(), checkedAt: Date.now() + 1 });
    // o relatório chegou, mas o botão só volta quando o host confirma que a conferência acabou
    expect(screen.getByRole('button', { name: 'Verificar de novo' })).toBeDisabled();
    confirmLast();
    await act(async () => {});
    expect(screen.getByRole('button', { name: 'Verificar de novo' })).toBeEnabled();
    vi.useRealTimers();
  });

  it('"Recarregar a janela" fica ao lado de "Verificar de novo" e pede a recarga ao editor', async () => {
    show(report());
    renderThemed(<EnvironmentView />);
    const buttons = screen.getAllByRole('button').map((b) => b.textContent);
    expect(buttons.indexOf('Recarregar a janela')).toBe(buttons.indexOf('Verificar de novo') + 1);
    await userEvent.click(screen.getByRole('button', { name: 'Recarregar a janela' }));
    expect(sentOf('ui.reloadWindow')).toHaveLength(1);
  });

  it('com a IA trabalhando, recarregar pergunta antes, porque interrompe a execução', async () => {
    show(report());
    const s = useBoardStore.getState().state!;
    act(() => useBoardStore.setState({ state: { ...s, aiRuns: ['c1', 'c2'] } }));
    renderThemed(<EnvironmentView />);
    await userEvent.click(screen.getByRole('button', { name: 'Recarregar a janela' }));
    const dialog = useBoardStore.getState().dialog!;
    expect(dialog.message).toBe('A IA está trabalhando em 2 cards. Recarregar a janela interrompe essas execuções.');
    expect(sentOf('ui.reloadWindow')).toHaveLength(0);
    act(() => dialog.onConfirm());
    expect(sentOf('ui.reloadWindow')).toHaveLength(1);
  });

  it('abre pelas Configurações e pelo aviso de requisitos', async () => {
    syncStore(router);
    renderThemed(<Settings />);
    await userEvent.click(screen.getByRole('button', { name: /Verificar ambiente/ }));
    expect(useBoardStore.getState().view).toBe('environment');

    useBoardStore.setState({ view: 'board' });
    act(() => {
      router.setRequirements([{ id: 'node', action: null }]);
      syncStore(router);
    });
    renderThemed(<RequirementsBanner />);
    await userEvent.click(screen.getByRole('button', { name: 'Ver o diagnóstico completo' }));
    expect(useBoardStore.getState().view).toBe('environment');
  });

  it('abre sozinho só na primeira vez nesta máquina', () => {
    const seen = vi.fn();
    router.onEnvironment({ check: vi.fn(), seen }, true);
    expect(router.snapshot().environmentFirstRun).toBe(true);
    router.markEnvironmentSeen();
    router.markEnvironmentSeen();
    expect(seen).toHaveBeenCalledTimes(1);
    expect(router.snapshot().environmentFirstRun).toBe(false);
  });

  describe('capacidades, Testar, próxima execução e limites', () => {
    const decisionOf = (over: object) => ({
      action: 'fallback',
      reason: 'rule',
      policy: { id: 'p1', revision: 3 },
      target: { profileId: 'cursor', model: 'composer', effort: null },
      alternatives: [],
      rejected: [],
      budget: null,
      nextAttempt: 1,
      notBefore: null,
      visited: [],
      consumption: [],
      ...over,
    });
    it('capacidade parcial ou desconhecida nunca aparece como verificada', () => {
      syncStore(router);
      renderThemed(<EnvironmentView />);
      show(
        report({
          profiles: [
            profile('claude', {
              capabilities: ['verified', 'partial', 'unknown', 'unknown', 'unknown', 'unknown', 'unknown'],
              evidence: { state: 'valid', version: '2.1.4', checkedAt: Date.UTC(2026, 9, 20) },
            }),
          ],
        }),
      );
      const b = within(block('Claude Code'));
      expect(b.getByText('Conversa nova: Verificada').closest('li')).toHaveClass('ok');
      expect(b.getByText('Controle de artefatos: Parcial').closest('li')).not.toHaveClass('ok');
      expect(b.getByText('Permissões: Desconhecida').closest('li')).not.toHaveClass('ok');
      expect(b.queryByText('Permissões: Verificada')).not.toBeInTheDocument();
    });
    it('admissão não admissível lista os motivos, um por exigência', () => {
      syncStore(router);
      renderThemed(<EnvironmentView />);
      show(
        report({
          profiles: [
            profile('claude', {
              admission: {
                version: 1,
                regime: 'exclusive',
                state: 'blocked',
                capabilities: [],
                reasons: [{ code: 'capability-not-verified', capability: 'mcp' }, { code: 'tools-missing' }],
                tools: [],
                deniedTools: [],
                mcpTools: [],
                activeMcpIds: [],
                binding: 'x',
              },
            }),
          ],
        }),
      );
      const b = within(block('Claude Code'));
      expect(b.getByText('Não admissível')).toBeInTheDocument();
      expect(b.getByText('capability-not-verified · MCP')).toBeInTheDocument();
      expect(b.getByText('tools-missing')).toBeInTheDocument();
    });
    it('o Testar avisa do uso da assinatura, mostra Testando… e não aceita o segundo clique', async () => {
      syncStore(router);
      renderThemed(<EnvironmentView />);
      show(report({ profiles: [profile('claude')] }));
      const b = within(block('Claude Code'));
      expect(b.getByText('O teste roda a ferramenta e usa a sua assinatura.')).toBeInTheDocument();
      const button = b.getByRole('button', { name: 'Testar' });
      await userEvent.click(button);
      expect(await b.findByRole('status')).toHaveTextContent('Testando…');
      expect(button).toBeDisabled();
      expect(posted.mock.calls.filter(([m]) => m.type === 'settings.aiProfiles.test')).toHaveLength(1);
    });
    it('sem simulador nem limites, a seção diz "Indisponível nesta versão"', () => {
      syncStore(router);
      renderThemed(<EnvironmentView />);
      show(report());
      const section = within(screen.getByRole('region', { name: 'Próxima execução e limites' }));
      expect(section.getAllByText('Indisponível nesta versão')).toHaveLength(2);
    });
    it('mostra regime, alvo, regra e versão, o aviso dos cards bloqueados e a tabela de limites do relatório', () => {
      syncStore(router);
      renderThemed(<EnvironmentView />);
      show({
        ...report(),
        nextRun: {
          simulation: { decision: decisionOf({}), hypothetical: true, problems: [], requested: { state: 'blocked' } } as never,
          blockedInUse: [{ id: 'cursor', name: 'Cursor', problem: 'cli' }],
        },
        limits: {
          branchProcesses: 2,
          textProcesses: 4,
          writersPerWorkspace: 1,
          subtasks: { requested: 3, effective: 1, reason: 'Rodam uma por vez.' },
          globalProcesses: null,
          perProfile: { claude: 2 },
        },
      });
      const s = within(screen.getByRole('region', { name: 'Próxima execução e limites' }));
      expect(s.getByText('Regime de contexto: exclusivo')).toBeInTheDocument();
      expect(s.getByText(/Alvo padrão: cursor · composer/)).toBeInTheDocument();
      expect(s.getByText(/regra p1, versão 3/)).toBeInTheDocument();
      expect(s.getByText(/Os cards com alvo Cursor não rodam/)).toBeInTheDocument();
      const row = s.getByText('Sub-tarefas em paralelo').closest('tr')!;
      expect(within(row).getByText('3')).toBeInTheDocument();
      expect(within(row).getByText('Rodam uma por vez.')).toBeInTheDocument();
      expect(s.getByText('Processos do perfil claude')).toBeInTheDocument();
    });
    it('decisão sem destino mostra o bloqueio', () => {
      syncStore(router);
      renderThemed(<EnvironmentView />);
      show({
        ...report(),
        nextRun: {
          simulation: {
            decision: decisionOf({ action: 'block', reason: 'no-policy', policy: null, target: null }),
            hypothetical: true,
            problems: [],
            requested: { state: 'blocked' },
          } as never,
          blockedInUse: [],
        },
      });
      expect(screen.getByText(/Bloqueada: Nenhuma política corresponde/)).toBeInTheDocument();
    });
  });
});
