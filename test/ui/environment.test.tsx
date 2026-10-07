import { posted, renderThemed, seedBoard, sentOf, syncStore } from './setup';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, within } from '@testing-library/react';
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

const report = (checks: EnvCheck[]): EnvironmentReport => ({ tool: 'cursor', checks, checkedAt: Date.now() + 1000 });
const show = (r: EnvironmentReport) =>
  act(() => {
    router.setEnvironment(r);
    syncStore(router);
  });

const MISSING: EnvCheck[] = [
  {
    id: 'cli',
    level: 'required',
    status: 'missing',
    requirement: {
      id: 'cli',
      tool: 'cursor',
      cli: 'cursor-agent',
      action: { kind: 'command', command: 'curl https://cursor.com/install -fsS | bash' },
    },
  },
  { id: 'signin', level: 'required', status: 'skipped' },
  { id: 'node', level: 'required', status: 'ok', version: '22.3.0' },
  { id: 'skill', level: 'recommended', status: 'missing', fix: { kind: 'installSkill' } },
  {
    id: 'crg',
    level: 'recommended',
    status: 'missing',
    fix: { kind: 'commands', commands: ['uv tool install code-review-graph', 'code-review-graph install --platform cursor'] },
  },
  { id: 'crg-embeddings', level: 'recommended', status: 'skipped' },
];

const item = (title: string) => screen.getByText(title).closest('li')!;

describe('Diagnóstico do ambiente', () => {
  it('confere ao abrir e mostra a lista separada em necessário e recomendado', () => {
    syncStore(router);
    renderThemed(<EnvironmentView />);
    expect(sentOf('environment.check')).toHaveLength(1);
    expect(screen.getByText('Conferindo o ambiente…')).toBeInTheDocument();
    show(report(MISSING));
    expect(screen.getByText('Falta 1 item necessário para o board trabalhar com a IA.')).toBeInTheDocument();
    const required = screen.getByRole('region', { name: 'Necessário' });
    expect(within(required).getByText('Linha de comando do Cursor')).toBeInTheDocument();
    expect(within(required).getByText('Pronto · 22.3.0')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Recomendado' })).getByText('Code Review Graph')).toBeInTheDocument();
  });

  it('cada item diz para que serve, como o board usa e como resolver, com o Saiba mais', async () => {
    syncStore(router);
    renderThemed(<EnvironmentView />);
    show(report(MISSING));
    const cli = item('Linha de comando do Cursor');
    expect(within(cli).getByText('Para que serve')).toBeInTheDocument();
    expect(within(cli).getByText('curl https://cursor.com/install -fsS | bash')).toBeInTheDocument();
    expect(within(cli).getByRole('link', { name: /Saiba mais/ })).toHaveAttribute('href', 'https://cursor.com/cli');

    // os comandos do Code Review Graph, em ordem, com o aviso do que o install mexe
    const crg = item('Code Review Graph');
    expect(
      within(crg)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      expect.stringContaining('uv tool install code-review-graph'),
      expect.stringContaining('code-review-graph install --platform cursor'),
    ]);
    expect(within(crg).getByText(/acrescenta instruções de uso ao arquivo de regras/)).toBeInTheDocument();
    expect(within(crg).getByText(/o código não sai dela/)).toBeInTheDocument();

    // o que depende de outro item não tem ação ainda
    expect(within(item('Busca semântica do Code Review Graph')).getByText('Depende do item anterior')).toBeInTheDocument();
    // a privacidade da busca semântica cita os provedores de nuvem
    expect(within(item('Busca semântica do Code Review Graph')).getByText(/muitas empresas não permitem/)).toBeInTheDocument();

    await userEvent.click(within(item('Skill do fluxo (faz-ai-fluxo)')).getByRole('button', { name: 'Instalar a skill' }));
    expect(sentOf('harness.flowSkill.install')).toEqual([
      { type: 'harness.flowSkill.install', tool: 'cursor', scope: 'user', replace: false },
    ]);
  });

  it('depois de instalar a skill, mostra que está trabalhando e confere de novo sozinho', async () => {
    syncStore(router);
    renderThemed(<EnvironmentView />);
    show(report(MISSING));
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 5000);
    await userEvent.click(within(item('Skill do fluxo (faz-ai-fluxo)')).getByRole('button', { name: 'Instalar a skill' }));
    expect(posted.mock.calls.map(([m]) => m.type).slice(-2)).toEqual(['harness.flowSkill.install', 'environment.check']);
    const skill = item('Skill do fluxo (faz-ai-fluxo)');
    expect(within(skill).getByText('Aplicando e conferindo de novo…')).toBeInTheDocument();
    expect(within(skill).queryByRole('button', { name: 'Instalar a skill' })).toBeNull();
    // a resposta chega com a skill instalada: o item vira "Pronto"
    const done = MISSING.map((c) => (c.id === 'skill' ? { id: c.id, level: c.level, status: 'ok' as const } : c));
    show({ ...report(done), checkedAt: Date.now() + 1 });
    expect(within(item('Skill do fluxo (faz-ai-fluxo)')).getByText('Pronto')).toBeInTheDocument();
    expect(screen.queryByText('Aplicando e conferindo de novo…')).toBeNull();
    vi.useRealTimers();
  });

  it('"Verificar de novo" roda outra vez e fica desligado até a resposta', async () => {
    syncStore(router);
    renderThemed(<EnvironmentView />);
    show(report(MISSING));
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 5000);
    await userEvent.click(screen.getByRole('button', { name: 'Verificar de novo' }));
    expect(sentOf('environment.check')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Verificar de novo' })).toBeDisabled();
    show({ ...report(MISSING), checkedAt: Date.now() + 1 });
    expect(screen.getByRole('button', { name: 'Verificar de novo' })).toBeEnabled();
    vi.useRealTimers();
  });

  it('abre pelas Configurações e pelo aviso de requisitos', async () => {
    syncStore(router);
    renderThemed(<Settings />);
    await userEvent.click(screen.getByRole('button', { name: /Verificar ambiente/ }));
    expect(useBoardStore.getState().view).toBe('environment');

    useBoardStore.setState({ view: 'board' });
    act(() => {
      router.setRequirements([{ id: 'node', tool: 'cursor', action: null }]);
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
