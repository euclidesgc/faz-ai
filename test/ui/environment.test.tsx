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

/** O Cursor no projeto, sem login e sem a skill; o Claude Code na máquina; o Code Review Graph sem grafo. */
const cursor = (skill: EnvCheck['status'] = 'missing'): EnvCheck => ({
  id: 'tool',
  tool: 'cursor',
  status: 'missing',
  children: [
    {
      id: 'cli',
      tool: 'cursor',
      status: 'ok',
      version: '2026.09.30',
      docs: 'https://cursor.com/docs/cli/installation',
      children: [
        {
          id: 'signin',
          tool: 'cursor',
          status: 'missing',
          command: 'cursor-agent login',
          requirement: {
            id: 'signin',
            tool: 'cursor',
            cli: 'cursor-agent',
            action: { kind: 'command', command: 'cursor-agent login', terminal: true },
          },
        },
      ],
    },
    { id: 'mcp', tool: 'cursor', status: 'ok', docs: 'https://github.com/euclidesgc/faz-ai#usando-com-ia' },
    {
      id: 'skill',
      tool: 'cursor',
      status: skill,
      requirement: skill === 'missing' ? { id: 'skill', tool: 'cursor', action: { kind: 'installSkill' } } : undefined,
    },
    { id: 'permission', tool: 'cursor', status: 'ok' },
  ],
});
const report = (o: { skill?: EnvCheck['status']; optional?: boolean } = {}): EnvironmentReport => ({
  tool: 'cursor',
  required: [{ id: 'node', status: 'ok', version: '22.11.0', docs: 'https://nodejs.org/en/download' }, cursor(o.skill)],
  optional:
    o.optional === false
      ? []
      : [
          {
            id: 'tool',
            tool: 'claude',
            status: 'missing',
            children: [
              {
                id: 'cli',
                tool: 'claude',
                status: 'ok',
                children: [{ id: 'signin', tool: 'claude', status: 'ok', command: 'claude auth login' }],
              },
              { id: 'mcp', tool: 'claude', status: 'missing' },
            ],
          },
        ],
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

  it('o nome da branch pronto não traz o botão', () => {
    syncStore(router);
    renderThemed(<EnvironmentView />);
    show({ ...report(), recommended: [{ id: 'branch-name', status: 'ok' }] });
    expect(screen.queryByRole('button', { name: 'Abrir a tela Git' })).not.toBeInTheDocument();
  });

  it('confere ao abrir e mostra as listas de necessários, opcionais e recomendados, nessa ordem', () => {
    syncStore(router);
    renderThemed(<EnvironmentView />);
    expect(sentOf('environment.check')).toHaveLength(1);
    expect(screen.getByText('Conferindo o ambiente…')).toBeInTheDocument();
    show(report());
    // o login e a skill: o bloco da ferramenta só resume, não conta
    expect(screen.getByText('Faltam 2 itens necessários para o board trabalhar com a IA.')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Necessários', 'Opcionais', 'Recomendados']);
    const required = screen.getByRole('region', { name: 'Necessários' });
    expect(within(required).getByText('Cursor (ferramenta do projeto)')).toBeInTheDocument();
    expect(within(required).getByText('22.11.0')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Opcionais' })).getByText('Claude Code (encontrado na máquina)')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Recomendados' })).getByText('Code Review Graph')).toBeInTheDocument();
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
        cursor(),
      ],
    });
    const node = item('Node.js 22 ou mais novo');
    expect(within(node).getByText('Para instalar, em ordem:')).toBeInTheDocument();
    // cada passo diz o que faz: o primeiro instala o nvm
    expect(within(node).getByText('Instala o nvm, o gerenciador de versões do Node.js:')).toBeInTheDocument();
    expect(within(node).getByText('Instala o Node.js 22 com ele:')).toBeInTheDocument();
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

  it('sem outra ferramenta na máquina, não há a lista de opcionais', () => {
    syncStore(router);
    renderThemed(<EnvironmentView />);
    show(report({ optional: false }));
    expect(screen.queryByRole('region', { name: 'Opcionais' })).toBeNull();
  });

  it('cada item tem o estado em palavras e o site entre parênteses', () => {
    syncStore(router);
    renderThemed(<EnvironmentView />);
    show(report());
    const node = item('Node.js 22 ou mais novo');
    expect(within(node).getByText('Pronto:')).toBeInTheDocument();
    expect(within(node).getByRole('link', { name: /nodejs\.org\/en\/download/ })).toHaveAttribute('href', 'https://nodejs.org/en/download');
  });

  it('o que depende de outro item aparece dentro dele: o login dentro da CLI', () => {
    syncStore(router);
    renderThemed(<EnvironmentView />);
    show(report());
    const cli = within(screen.getByRole('region', { name: 'Necessários' }))
      .getByText('Linha de comando cursor-agent')
      .closest('li')!;
    expect(within(cli).getByText('Login na linha de comando')).toBeInTheDocument();
    // o login da ferramenta do projeto tem o comando para copiar e o "Abrir no terminal"
    expect(within(cli).getByText('cursor-agent login')).toBeInTheDocument();
    expect(within(cli).getByRole('button', { name: 'Copiar comando' })).toBeInTheDocument();
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

  it('o board só tem botão para o que é dele; a outra ferramenta só mostra o estado', () => {
    syncStore(router);
    renderThemed(<EnvironmentView />);
    show(report());
    expect(screen.getAllByRole('button', { name: 'Instalar a skill' })).toHaveLength(1);
    const optional = screen.getByRole('region', { name: 'Opcionais' });
    expect(within(optional).queryByRole('button', { name: /Instalar/ })).toBeNull();
  });

  it('depois de instalar a skill, mostra que está trabalhando e confere de novo sozinho', async () => {
    syncStore(router);
    renderThemed(<EnvironmentView />);
    show(report());
    confirmLast();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 5000);
    await userEvent.click(within(item('Skill do fluxo (faz-ai-fluxo)')).getByRole('button', { name: 'Instalar a skill' }));
    expect(posted.mock.calls.map(([m]) => m.type).slice(-2)).toEqual(['harness.flowSkill.install', 'environment.check']);
    const skill = item('Skill do fluxo (faz-ai-fluxo)');
    expect(within(skill).getByText('Aplicando e conferindo de novo…')).toBeInTheDocument();
    expect(within(skill).queryByRole('button', { name: 'Instalar a skill' })).toBeNull();
    // a resposta chega com a skill instalada e o host confirma a conferência: o item vira "Pronto"
    show({ ...report({ skill: 'ok' }), checkedAt: Date.now() + 1 });
    confirmLast();
    await act(async () => {});
    expect(within(item('Skill do fluxo (faz-ai-fluxo)')).getByText('Pronto:')).toBeInTheDocument();
    expect(screen.queryByText('Aplicando e conferindo de novo…')).toBeNull();
    vi.useRealTimers();
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
      router.setRequirements([{ id: 'node', tool: 'claude', action: null }]);
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
});

describe('Diagnóstico do ambiente: definição do harness', () => {
  it('o item fica dentro da ferramenta, com um filho por falta, cada um explicando como resolver', async () => {
    syncStore(router);
    renderThemed(<EnvironmentView />);
    const r = report();
    const tool = r.required[1]!;
    tool.children!.splice(3, 0, {
      id: 'harness',
      tool: 'cursor',
      status: 'missing',
      requirement: {
        id: 'harness',
        tool: 'cursor',
        optional: true,
        harnessIssues: ['artifacts', 'isolation'],
        action: { kind: 'settings' },
      },
      children: [
        { id: 'harness-artifacts', tool: 'cursor', status: 'missing' },
        { id: 'harness-agents', tool: 'cursor', status: 'ok' },
        { id: 'harness-rules', tool: 'cursor', status: 'ok' },
        { id: 'harness-missing', tool: 'cursor', status: 'ok' },
        { id: 'harness-isolation', tool: 'cursor', status: 'missing' },
      ],
    });
    show(r);
    const harness = item('Definição do harness');
    expect(within(harness).getByText('Artefatos no board')).toBeInTheDocument();
    expect(within(harness).getByText('Artefatos fora do board que a CLI carrega')).toBeInTheDocument();
    expect(within(harness).getByRole('button', { name: 'Abrir Harness' })).toBeInTheDocument();
    fireEvent.focus(screen.getByText('Artefatos fora do board que a CLI carrega'));
    expect((await screen.findByRole('tooltip')).textContent).toMatch(/não desliga tudo/);
  });
});
