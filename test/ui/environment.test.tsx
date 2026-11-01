import { posted, renderThemed, seedBoard, sentOf, syncStore, confirmLast } from './setup';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EnvironmentView } from '../../src/webview/components/EnvironmentView';
import { Dialog } from '../../src/webview/components/Dialog';
import { RequirementsBanner } from '../../src/webview/components/RequirementsBanner';
import { Settings } from '../../src/webview/components/settings/Settings';
import { useBoardStore } from '../../src/webview/store/boardStore';
import type { MessageRouter } from '../../src/extension/panel/messageRouter';
import type { EnvCheck, EnvironmentReport } from '../../src/shared/environment';
import type { ProfileHealth } from '../../src/shared/profileHealth';
import type { HostToWebview } from '../../src/shared/messages';

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
  kind: 'catalog',
  tool: id,
  mode: 'cli',
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

const hostMessage = (data: HostToWebview) => act(() => window.dispatchEvent(new MessageEvent('message', { data })));

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

  it('as cópias antigas do fluxo listam os arquivos e "Apagar as cópias" confirma com os caminhos antes de pedir ao host', async () => {
    syncStore(router);
    renderThemed(
      <>
        <EnvironmentView />
        <Dialog />
      </>,
    );
    const skill = '/home/u/.claude/skills/faz-ai-fluxo/SKILL.md';
    const agent = '/home/u/.claude/agents/condutor-do-board.md';
    show({ ...report(), recommended: [{ id: 'flow-skill-copy', status: 'missing', paths: [skill, agent] }] });
    const row = item('Cópias antigas do fluxo do board');
    expect(within(row).getByText(skill)).toBeInTheDocument();
    expect(within(row).getByText(agent)).toBeInTheDocument();
    // antes a tela só dizia "apague os listados": agora o botão apaga, mas só depois de a pessoa ver a lista
    await userEvent.click(within(row).getByRole('button', { name: 'Apagar as cópias' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Apagar as cópias antigas do fluxo?');
    expect(dialog).toHaveTextContent(skill);
    expect(dialog).toHaveTextContent(agent);
    expect(sentOf('environment.flowSkillCopies.delete')).toHaveLength(0);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Apagar' }));
    expect(sentOf('environment.flowSkillCopies.delete')).toEqual([{ type: 'environment.flowSkillCopies.delete', paths: [skill, agent] }]);
    expect(within(row).getByText('Apagando…')).toBeInTheDocument();
    // o host apagou um e não conseguiu o outro: o motivo aparece no item, e o relatório refeito pelo host tira o apagado
    hostMessage({ type: 'environment.flowSkillCopies.deleteResult', deleted: [skill], failed: [{ path: agent, reason: 'EACCES' }] });
    confirmLast();
    await act(async () => {});
    expect(within(row).getByRole('alert')).toHaveTextContent('Não foi possível apagar:');
    expect(within(row).getByRole('alert')).toHaveTextContent(`${agent}: EACCES`);
  });

  it('o MCP do board na ferramenta: um filho por perfil, com a situação, o botão que registra e a dica de onde religar', async () => {
    syncStore(router);
    renderThemed(<EnvironmentView />);
    show({
      ...report(),
      recommended: [
        {
          id: 'board-mcp',
          status: 'missing',
          children: [
            {
              id: 'board-mcp-claude',
              status: 'ok',
              mcp: { profile: 'claude', name: 'Claude Code', tool: 'claude', state: 'registered', file: '~/.claude.json' },
            },
            {
              id: 'board-mcp-cursor',
              status: 'missing',
              mcp: { profile: 'cursor', name: 'Cursor', tool: 'cursor', state: 'outdated', file: '.cursor/mcp.json', reason: 'bridge' },
            },
            {
              id: 'board-mcp-kimi',
              status: 'missing',
              mcp: { profile: 'kimi', name: 'Kimi Code', tool: 'kimi', state: 'unregistered' },
            },
          ],
        },
      ],
    });
    const row = item('MCP do board na ferramenta (sessões fora do board)');
    expect(row).toHaveClass('missing');
    // o filho leva o nome do perfil (o bloco do perfil, acima, tem o mesmo nome no título)
    const child = (name: string) => within(row).getByText(name).closest('li')!;
    const claude = child('Claude Code');
    expect(claude).toHaveClass('ok');
    expect(claude).toHaveTextContent('Registrado em ~/.claude.json');
    expect(within(claude).queryByRole('button')).toBeNull();
    const cursor = child('Cursor');
    expect(cursor).toHaveTextContent('Registrado em .cursor/mcp.json, mas para outra ponte (versão anterior do board)');
    // o interruptor do Cursor não se lê de fora: o filho dele diz isso e abre a tela do Cursor
    expect(cursor).toHaveTextContent('O board não consegue conferir o interruptor do Cursor');
    await userEvent.click(within(cursor).getByRole('button', { name: 'Abrir Cursor Settings → MCP' }));
    expect(sentOf('ui.openEditorMcp')).toHaveLength(1);
    const kimi = child('Kimi Code');
    expect(kimi).toHaveTextContent('Não registrado na ferramenta');
    // o botão é o comando da paleta "Instalar o MCP do board" para a ferramenta do perfil; o relatório é refeito ao fim
    const before = sentOf('environment.check').length;
    await userEvent.click(within(kimi).getByRole('button', { name: 'Instalar o MCP do board' }));
    expect(sentOf('ui.connectAI')).toEqual([{ type: 'ui.connectAI', tool: 'kimi' }]);
    confirmLast();
    await act(async () => {});
    expect(sentOf('environment.check')).toHaveLength(before + 1);
    // o registrado não tem botão; os dois que faltam têm o seu
    expect(within(row).getAllByRole('button', { name: 'Instalar o MCP do board' })).toHaveLength(2);
  });

  it('o MCP do board desligado na ferramenta diz onde religar, sem botão de registrar (o registro está lá)', () => {
    syncStore(router);
    renderThemed(<EnvironmentView />);
    show({
      ...report(),
      recommended: [
        {
          id: 'board-mcp',
          status: 'missing',
          children: [
            {
              id: 'board-mcp-claude',
              status: 'missing',
              mcp: { profile: 'claude', name: 'Claude Code', tool: 'claude', state: 'disabled', file: '~/.claude.json' },
            },
          ],
        },
      ],
    });
    const row = item('MCP do board na ferramenta (sessões fora do board)');
    const claude = within(row).getByText('Claude Code').closest('li')!;
    expect(claude).toHaveTextContent('Desligado na ferramenta (~/.claude.json)');
    expect(claude).toHaveTextContent('ligue o servidor "faz-ai" em /mcp no Claude Code');
    expect(within(claude).queryByRole('button', { name: 'Instalar o MCP do board' })).toBeNull();
  });

  it('sem cópia antiga, o aviso não aparece', () => {
    syncStore(router);
    renderThemed(<EnvironmentView />);
    show(report());
    expect(screen.queryByText('Cópias antigas do fluxo do board')).not.toBeInTheDocument();
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
    // o modo do perfil vai no título (história 12)
    expect(screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent)).toEqual([
      'Claude Code · CLI · Padrão',
      'Cursor · CLI',
      'importado · CLI',
    ]);
    const claude = block('Claude Code');
    expect(within(claude).getByText('Ligado')).toBeInTheDocument();
    expect(within(claude).getByText('Linha de comando encontrada · /bin/claude · 2.1.4')).toBeInTheDocument();
    expect(within(claude).getByText('Login: conectado')).toBeInTheDocument();
    const group = screen.getByText('Desligados (2)').closest('details')!;
    expect(group).not.toHaveAttribute('open');
    expect(within(group).getByText('Desligado')).toBeInTheDocument();
  });

  it('o mesmo Gemini em modos diferentes: o título de cada bloco diz o modo (história 12)', () => {
    syncStore(router);
    renderThemed(<EnvironmentView />);
    show(
      report({
        profiles: [
          profile('claude'),
          profile('gemini', { name: 'Gemini CLI', tool: 'gemini', mode: 'api', base: 'generic', isDefault: false }),
        ],
      }),
    );
    expect(screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent)).toEqual([
      'Claude Code · CLI · Padrão',
      'Gemini CLI · API',
    ]);
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
          profile('claude', { verifiable: true, evidence: { state: 'never' } }),
          profile('cursor', { evidence: { state: 'stale' }, isDefault: false }),
          profile('kimi', { evidence: { state: 'valid', version: '1.9.0' }, isDefault: false }),
          profile('gemini', { name: 'Gemini CLI', mode: 'api', base: 'generic', isDefault: false, evidence: { state: 'never' } }),
        ],
      }),
    );
    expect(within(block('Claude Code')).getByText('Não validado: este perfil ainda não foi testado')).toBeInTheDocument();
    expect(within(block('Cursor')).getByText(/Precisa verificar de novo/)).toBeInTheDocument();
    expect(within(block('kimi')).getByText('Verificado em 1.9.0')).toBeInTheDocument();
    // a ferramenta sem sonda e sem prova nenhuma não ganha "Não validado" nem sete "Desconhecida": uma linha só diz por quê
    const gemini = within(block('Gemini CLI'));
    expect(gemini.queryByText(/Não validado/)).toBeNull();
    expect(gemini.queryByText(/Desconhecida/)).toBeNull();
    expect(gemini.getByText('Capacidades: esta ferramenta não tem sonda; o perfil roda no regime compatível')).toBeInTheDocument();
  });

  it('a linha "Verificado em" leva a data da prova, uma vez só, sem repetir sob cada capacidade', () => {
    syncStore(router);
    renderThemed(<EnvironmentView />);
    const at = Date.UTC(2026, 10, 1, 15);
    show(
      report({
        profiles: [
          profile('claude', {
            verifiable: true,
            capabilities: ['verified', 'verified', 'verified', 'verified', 'verified', 'unknown', 'unknown'],
            evidence: { state: 'valid', version: '2.1.316', checkedAt: at, ok: true },
          }),
        ],
      }),
    );
    const b = within(block('Claude Code'));
    expect(b.getByText(`Verificado em 2.1.316, ${new Date(at).toLocaleDateString()}`)).toBeInTheDocument();
    expect(b.queryByText(/^em 2\.1\.316/)).toBeNull();
    // cancelamento e saída não têm sonda em ferramenta nenhuma: a linha diz isso, em vez de parecer algo a verificar
    expect(b.getByText('Cancelamento: Desconhecida (sem sonda)')).toBeInTheDocument();
    expect(b.getByText('Saída: Desconhecida (sem sonda)')).toBeInTheDocument();
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
    it('cada perfil mostra as próprias capacidades e, sem recibos, como verificá-lo em Conectar agentes', () => {
      syncStore(router);
      renderThemed(<EnvironmentView />);
      const unknown = Array(7).fill('unknown');
      show(
        report({
          profiles: [
            profile('claude', { verifiable: true, capabilities: unknown }),
            profile('gemini', {
              name: 'Gemini CLI',
              kind: 'catalog',
              mode: 'acp',
              base: 'generic',
              isDefault: false,
              verifiable: true,
              capabilities: ['verified', 'partial', 'verified', 'verified', 'verified', 'unknown', 'unknown'],
            }),
            profile('cursor', { capabilities: unknown, isDefault: false }),
            profile('claude', {
              id: 'claude-trabalho',
              name: 'Claude trabalho',
              verifiable: true,
              capabilities: unknown,
              isDefault: false,
            }),
          ],
        }),
      );
      // o comando da paleta saiu (história 13), e o perfil do catálogo também verifica aqui: antes só tinha "Abrir
      // Conectar agentes", que abria a aba sem dizer o que clicar, e a pessoa voltava sem prova nova
      const hint = /Sem recibos de capacidade/;
      const claude = within(block('Claude Code'));
      expect(claude.getByText(hint)).toHaveTextContent('a verificação roda numa pasta descartável e não gasta a sua conta.');
      expect(claude.getByRole('button', { name: 'Verificar capacidades' })).toBeInTheDocument();
      // o atalho para Conectar agentes fica como secundário enquanto o perfil do catálogo não foi conectado
      expect(claude.getByRole('button', { name: 'Abrir Conectar agentes' })).toBeInTheDocument();
      const copy = within(block('Claude trabalho'));
      expect(copy.getByText(hint)).toHaveTextContent('a verificação roda numa pasta descartável e não gasta a sua conta.');
      expect(copy.getByRole('button', { name: 'Verificar capacidades' })).toBeInTheDocument();
      expect(copy.getByRole('button', { name: 'Abrir o perfil' })).toBeInTheDocument();
      expect(copy.queryByRole('button', { name: 'Abrir Conectar agentes' })).toBeNull();
      expect(screen.queryByText(/paleta de comandos/)).toBeNull();
      expect(claude.getByText('MCP: Desconhecida')).toBeInTheDocument();
      const gemini = within(block('Gemini CLI'));
      expect(gemini.getByText('MCP: Verificada').closest('li')).toHaveClass('ok');
      expect(gemini.getByText('Controle de artefatos: Parcial')).toBeInTheDocument();
      // com recibos, o botão continua (refazer), mas a frase não diz "sem recibos"
      expect(gemini.queryByText(hint)).not.toBeInTheDocument();
      expect(gemini.getByRole('button', { name: 'Verificar capacidades' })).toBeInTheDocument();
      // o Cursor não tem sonda de capacidades: nada de mandar a pessoa rodar o comando para ele
      expect(within(block('Cursor')).queryByText(hint)).not.toBeInTheDocument();
      expect(within(block('Cursor')).queryByRole('button', { name: 'Verificar capacidades' })).toBeNull();
    });
    it('o perfil do catálogo já conectado não traz "Abrir Conectar agentes": o atalho é verificar', () => {
      router.setConnections({ claude: { profileId: 'claude', step: 'models', status: 'connected', summary: {} } });
      syncStore(router);
      renderThemed(<EnvironmentView />);
      show(report({ profiles: [profile('claude', { verifiable: true, capabilities: Array(7).fill('unknown') })] }));
      const claude = within(block('Claude Code'));
      expect(claude.getByRole('button', { name: 'Verificar capacidades' })).toBeInTheDocument();
      expect(claude.queryByRole('button', { name: 'Abrir Conectar agentes' })).toBeNull();
    });
    it('cada capacidade não verificada diz o motivo, no lugar de só "Desconhecida"', () => {
      syncStore(router);
      renderThemed(<EnvironmentView />);
      show(
        report({
          profiles: [
            profile('claude', {
              verifiable: true,
              capabilities: ['verified', 'partial', 'partial', 'unknown', 'unknown', 'unknown', 'unknown'],
              capabilityReasons: [
                null,
                { reason: 'incomplete', check: 'own-context-files' },
                { reason: 'failed', check: 'protocol-version' },
                { reason: 'changed-binding' },
                { reason: 'expired' },
                { reason: 'no-evidence' },
                null,
              ],
            }),
          ],
        }),
      );
      const b = within(block('Claude Code'));
      expect(b.getByText('Conversa nova: Verificada')).toBeInTheDocument();
      expect(
        b.getByText('Controle de artefatos: Parcial (o agente lê os próprios arquivos de contexto: vale no regime compatível)'),
      ).toBeInTheDocument();
      expect(b.getByText('Permissões: Parcial (falhou: protocol-version)')).toBeInTheDocument();
      expect(b.getByText('MCP: Desconhecida (prova de outra versão da CLI)')).toBeInTheDocument();
      expect(b.getByText('Delegação: Desconhecida (prova vencida)')).toBeInTheDocument();
      expect(b.getByText('Cancelamento: Desconhecida (sem prova)')).toBeInTheDocument();
      // sem sonda (a saída) a linha diz isso
      expect(b.getByText('Saída: Desconhecida (sem sonda)')).toBeInTheDocument();
    });
    it('"Precisa verificar de novo" diz de quando é a última prova, a versão de agora e o que clicar', () => {
      syncStore(router);
      renderThemed(<EnvironmentView />);
      const date = new Date(Date.UTC(2026, 9, 28, 15)).toLocaleDateString();
      show(
        report({
          profiles: [
            profile('claude', { evidence: { state: 'stale', version: '2.1.316', checkedAt: Date.UTC(2026, 9, 28, 15) } }),
            profile('cursor', { evidence: { state: 'stale', version: '1.9.0' }, isDefault: false }),
            profile('kimi', { evidence: { state: 'stale' }, isDefault: false }),
          ],
        }),
      );
      expect(within(block('Claude Code')).getByText(/Precisa verificar de novo/)).toHaveTextContent(
        `Precisa verificar de novo: a última prova é de ${date}, e a linha de comando agora é a 2.1.316. Clique em Verificar capacidades.`,
      );
      expect(within(block('Cursor')).getByText(/Precisa verificar de novo/)).toHaveTextContent(
        'a linha de comando mudou desde a última prova (agora 1.9.0). Clique em Verificar capacidades.',
      );
      expect(within(block('kimi')).getByText(/Precisa verificar de novo/)).toHaveTextContent(
        'Precisa verificar de novo: a linha de comando mudou desde a última prova. Clique em Verificar capacidades.',
      );
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
      expect(b.getByText(/O teste roda a ferramenta uma vez e usa a sua assinatura/)).toHaveTextContent('Ele não prova capacidades');
      const button = b.getByRole('button', { name: 'Testar' });
      await userEvent.click(button);
      expect(await b.findByRole('status')).toHaveTextContent('Testando…');
      expect(button).toBeDisabled();
      expect(posted.mock.calls.filter(([m]) => m.type === 'settings.aiProfiles.test')).toHaveLength(1);
    });
    it('a falha do Testar traz o motivo do host e as últimas linhas da saída da ferramenta', async () => {
      syncStore(router);
      renderThemed(<EnvironmentView />);
      show(report({ profiles: [profile('cursor', { isDefault: true })] }));
      const b = within(block('Cursor'));
      await userEvent.click(b.getByRole('button', { name: 'Testar' }));
      confirmLast();
      hostMessage({
        type: 'aiProfiles.testResult',
        id: 'cursor',
        ok: false,
        output: "Chamando Cursor: cursor-agent -p …\nActionRequiredError: You've hit your usage limit",
        error: "Limite de uso da ferramenta atingido: ActionRequiredError: You've hit your usage limit",
      });
      await act(async () => {});
      const alert = b.getByRole('alert');
      expect(alert).toHaveTextContent('Limite de uso da ferramenta atingido');
      expect(within(alert).getByText('Saída da ferramenta')).toBeInTheDocument();
      expect(alert).toHaveTextContent("ActionRequiredError: You've hit your usage limit");
    });
    it('no modo API o Testar do Diagnóstico leva a Conectar agentes, onde se escolhe o modelo, em vez de falhar', async () => {
      syncStore(router);
      renderThemed(<EnvironmentView />);
      show(report({ profiles: [profile('gemini', { name: 'Gemini CLI', mode: 'api', base: 'generic' })] }));
      const b = within(block('Gemini CLI'));
      expect(b.queryByRole('button', { name: 'Testar' })).toBeNull();
      expect(b.getByText(/No modo API o teste precisa de um modelo/)).toBeInTheDocument();
      await userEvent.click(b.getByRole('button', { name: 'Testar em Conectar agentes' }));
      expect(useBoardStore.getState()).toMatchObject({ view: 'settings', settingsTab: 'connect', connectTool: 'gemini' });
      expect(sentOf('settings.aiProfiles.test')).toHaveLength(0);
    });
    it('o Testar mostra que a ferramenta respondeu e refaz o relatório da tela: antes, o sucesso não mudava nada', async () => {
      syncStore(router);
      renderThemed(<EnvironmentView />);
      show(report({ profiles: [profile('claude')] }));
      const before = sentOf('environment.check').length;
      const b = within(block('Claude Code'));
      await userEvent.click(b.getByRole('button', { name: 'Testar' }));
      // o host confirma o pedido e manda o resultado; a ordem entre os dois não importa para a tela
      confirmLast();
      hostMessage({ type: 'aiProfiles.testResult', id: 'claude', ok: true, output: 'oi' });
      await act(async () => {});
      expect(b.getByRole('status')).toHaveTextContent('A ferramenta respondeu.');
      expect(sentOf('environment.check')).toHaveLength(before + 1);
      // a falha continua com o motivo
      await userEvent.click(b.getByRole('button', { name: 'Testar' }));
      confirmLast();
      hostMessage({ type: 'aiProfiles.testResult', id: 'claude', ok: false, output: '', error: 'sem login' });
      await act(async () => {});
      expect(b.getByRole('alert')).toHaveTextContent('sem login');
    });
    it('"Verificar capacidades" no bloco da cópia pede a verificação ao host e refaz o relatório ao fim', async () => {
      syncStore(router);
      renderThemed(<EnvironmentView />);
      show(
        report({
          profiles: [
            profile('claude', { id: 'claude-trabalho', name: 'Claude trabalho', verifiable: true, capabilities: Array(7).fill('unknown') }),
          ],
        }),
      );
      const before = sentOf('environment.check').length;
      const b = within(block('Claude trabalho'));
      await userEvent.click(b.getByRole('button', { name: 'Verificar capacidades' }));
      expect(sentOf('settings.aiProfiles.verify')).toHaveLength(1);
      expect(b.getByRole('status')).toHaveTextContent('Verificando…');
      confirmLast();
      await act(async () => {});
      expect(sentOf('environment.check')).toHaveLength(before + 1);
    });
    it('"Verificar capacidades" no perfil do catálogo mostra a frase do verificador no próprio bloco, nos dois sentidos', async () => {
      syncStore(router);
      renderThemed(<EnvironmentView />);
      show(report({ profiles: [profile('claude', { verifiable: true, capabilities: Array(7).fill('unknown') })] }));
      const before = sentOf('environment.check').length;
      const b = within(block('Claude Code'));
      await userEvent.click(b.getByRole('button', { name: 'Verificar capacidades' }));
      expect(sentOf('settings.aiProfiles.verify')).toEqual([{ type: 'settings.aiProfiles.verify', id: 'claude' }]);
      // o resultado por perfil chega antes do `done`; a ordem entre os dois não importa para a tela. Enquanto o
      // relatório é refeito, a espera continua; a frase aparece quando ele volta
      hostMessage({
        type: 'aiProfiles.verifyResult',
        id: 'claude',
        ok: true,
        message: 'Claude Code: isolamento verificado; as cinco capacidades têm recibos válidos.',
      });
      confirmLast();
      await act(async () => {});
      expect(sentOf('environment.check')).toHaveLength(before + 1);
      expect(b.getByRole('status')).toHaveTextContent('Verificando…');
      confirmLast();
      await act(async () => {});
      expect(b.getByRole('status')).toHaveTextContent('Claude Code: isolamento verificado; as cinco capacidades têm recibos válidos.');
      // a verificação que não passou fica como alerta, com os pendentes
      await userEvent.click(b.getByRole('button', { name: 'Verificar capacidades' }));
      hostMessage({
        type: 'aiProfiles.verifyResult',
        id: 'claude',
        ok: false,
        message: 'Claude Code: isolamento não verificado. Pendentes: mcp/session-servers.',
      });
      confirmLast();
      await act(async () => {});
      confirmLast();
      await act(async () => {});
      expect(b.getByRole('alert')).toHaveTextContent('Pendentes: mcp/session-servers');
      // o resultado de outro perfil não entra neste bloco
      hostMessage({ type: 'aiProfiles.verifyResult', id: 'outro', ok: true, message: 'outro: isolamento verificado.' });
      expect(b.queryByText(/outro: isolamento verificado/)).toBeNull();
      // a recusa do host (perfil desligado, sem sonda) volta pelo `done` e também aparece no bloco
      await userEvent.click(b.getByRole('button', { name: 'Verificar capacidades' }));
      confirmLast(false, 'Claude Code está desligado ou espera revisão: ligue e revise o perfil antes de verificar.');
      await act(async () => {});
      expect(b.getByRole('alert')).toHaveTextContent('Claude Code está desligado ou espera revisão');
    });
    it('"Abrir Conectar agentes" no bloco do perfil do catálogo abre a aba Conexão dele', async () => {
      syncStore(router);
      renderThemed(<EnvironmentView />);
      show(report({ profiles: [profile('claude', { verifiable: true, capabilities: Array(7).fill('unknown') })] }));
      await userEvent.click(within(block('Claude Code')).getByRole('button', { name: 'Abrir Conectar agentes' }));
      expect(useBoardStore.getState()).toMatchObject({ view: 'settings', settingsTab: 'connect', connectTool: 'claude' });
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
          branchReason: 'Histórias ao mesmo tempo',
          textProcesses: 4,
          textReason: 'Histórias ao mesmo tempo',
          writersPerWorkspace: 1,
          subtasks: { requested: 3, effective: 1, reason: 'Rodam uma por vez.' },
          globalProcesses: null,
          perProfile: { claude: 2 },
        },
      });
      const s = within(screen.getByRole('region', { name: 'Próxima execução e limites' }));
      expect(s.getByText('Contexto do card: fechado (regime exclusivo)')).toBeInTheDocument();
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
