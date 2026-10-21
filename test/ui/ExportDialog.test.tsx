import { beforeEach, describe, expect, it } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { lastSent, posted, renderThemed, seedBoard, sentOf } from './setup';
import { ExportDialog } from '../../src/webview/components/settings/harness/ExportDialog';
import type { ExportItem, ExportPlan, ExportResult } from '../../src/shared/toolExport';
import type { HostToWebview } from '../../src/shared/messages';

const item = (over: Partial<ExportItem>): ExportItem => ({
  id: 'skill:a',
  kind: 'skill',
  name: 'a',
  description: 'descrição',
  usage: 'always',
  flowSkill: false,
  files: [{ path: '/proj/.claude/skills/a/SKILL.md', exists: false }],
  losses: [],
  extras: [],
  ...over,
});

const planOf = (items: ExportItem[], over: Partial<ExportPlan> = {}): ExportPlan => ({
  tool: 'claude',
  target: 'project',
  roots: { project: '/proj/.claude', user: '/home/.claude' },
  items,
  mcpCount: 3,
  ...over,
});

const host = (msg: HostToWebview) => act(() => void window.dispatchEvent(new MessageEvent('message', { data: msg })));
const reply = (plan: ExportPlan) =>
  host({ type: 'harness.export.planResult', requestId: lastSent('harness.export.plan') && requestOf('harness.export.plan'), plan });
const requestOf = (type: 'harness.export.plan' | 'harness.export.apply') => {
  const all = posted.mock.calls.map(([m]) => m).filter((m) => m.type === type);
  return (all[all.length - 1] as unknown as { requestId: string }).requestId;
};

const ITEMS = [
  item({ id: 'rule:r', kind: 'rule', name: 'estilo', files: [{ path: '/proj/.claude/rules/estilo.md', exists: false }] }),
  item({
    id: 'skill:rev',
    name: 'revisar',
    files: [{ path: '/proj/.claude/skills/revisar/SKILL.md', exists: true }],
    extras: ['notas.txt'],
  }),
  item({ id: 'skill:flow', name: 'faz-ai-fluxo', flowSkill: true }),
  item({
    id: 'agent:x',
    kind: 'agent',
    name: 'revisor',
    losses: [
      { code: 'effort', effect: 'lost' },
      { code: 'mcpServers', effect: 'configure', value: 'github' },
    ],
  }),
  item({ id: 'agent:old', kind: 'agent', name: 'antigo', blocked: 'missing', files: [] }),
];

beforeEach(async () => {
  posted.mockClear();
  await seedBoard();
});

async function open(plan = planOf(ITEMS)) {
  renderThemed(<ExportDialog onClose={() => {}} />);
  expect(sentOf('harness.export.plan')).toHaveLength(1);
  reply(plan);
  await screen.findByText('estilo');
}

describe('ExportDialog', () => {
  it('seleção inicial: marca o que está em uso e deixa de fora a skill do fluxo e o bloqueado', async () => {
    await open();
    expect(screen.getByRole('checkbox', { name: /Exportar estilo/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Exportar faz-ai-fluxo/ })).not.toBeChecked();
    expect(screen.queryByRole('checkbox', { name: /Exportar antigo/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Exportar 3/ })).toBeEnabled();
  });

  it('a busca filtra a lista', async () => {
    await open();
    await userEvent.type(screen.getByRole('searchbox'), 'revis');
    expect(screen.queryByText('estilo')).toBeNull();
    expect(screen.getByText('revisar')).toBeInTheDocument();
    expect(screen.getByText('revisor')).toBeInTheDocument();
  });

  it('trocar a ferramenta pede uma prévia nova e descarta a resposta antiga', async () => {
    await open();
    const first = requestOf('harness.export.plan');
    await userEvent.click(screen.getByRole('radio', { name: 'Cursor' }));
    expect(sentOf('harness.export.plan')).toHaveLength(2);
    expect(lastSent('harness.export.plan').tool).toBe('cursor');
    host({ type: 'harness.export.planResult', requestId: first, plan: planOf([item({ id: 'x', name: 'velha' })]) });
    expect(screen.queryByText('velha')).toBeNull();
  });

  it('"Pasta do projeto" fica desabilitada sem projeto e o diálogo vai para a pasta do usuário', async () => {
    renderThemed(<ExportDialog onClose={() => {}} />);
    reply(planOf(ITEMS, { roots: { project: null, user: '/home/.claude' } }));
    const project = await screen.findByRole('radio', { name: /Pasta do projeto/ });
    expect(project).toBeDisabled();
    await waitFor(() => expect(lastSent('harness.export.plan').target).toBe('user'));
    expect(screen.getByText('Abra uma pasta de projeto para exportar para ela.')).toBeInTheDocument();
  });

  it('mostra os avisos de cópia desconectada e de servidores MCP', async () => {
    await open();
    expect(screen.getByText(/cópia desconectada/)).toBeInTheDocument();
    expect(screen.getByText(/Os 3 servidores MCP do board não são exportados/)).toBeInTheDocument();
  });

  it('avisa ao marcar a skill do fluxo', async () => {
    await open();
    expect(screen.queryByRole('alert')).toBeNull();
    await userEvent.click(screen.getByRole('checkbox', { name: /Exportar faz-ai-fluxo/ }));
    expect(screen.getByRole('alert')).toHaveTextContent(/cópia parada/);
  });

  it('"será pulado" vira "será substituído" com a opção', async () => {
    await open();
    expect(screen.getByText('já existe · será pulado')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: /Substituir os que já existem/ }));
    expect(screen.getByText('já existe · será substituído')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Exportar 3/ }));
    expect(lastSent('harness.export.apply')).toMatchObject({
      tool: 'claude',
      target: 'project',
      replace: true,
      ids: ['rule:r', 'skill:rev', 'agent:x'],
    });
  });

  it('mostra as perdas e os arquivos extras', async () => {
    await open();
    expect(screen.getByText(/O esforço não vai para a cópia/)).toBeInTheDocument();
    expect(screen.getByText(/Configurar na ferramenta: github/)).toBeInTheDocument();
    expect(screen.getByText(/notas\.txt/)).toBeInTheDocument();
  });

  it('o resumo conta por situação, lista a falha e repete o aviso de cópia desconectada', async () => {
    await open();
    await userEvent.click(screen.getByRole('button', { name: /Exportar 3/ }));
    const result: ExportResult = {
      tool: 'claude',
      target: 'project',
      files: [
        { item: 'rule:r', path: '/proj/.claude/rules/estilo.md', outcome: 'written' },
        { item: 'skill:rev', path: '/proj/.claude/skills/revisar/SKILL.md', outcome: 'skipped' },
        { item: 'agent:x', path: '/proj/.claude/agents/revisor.md', outcome: 'failed', error: 'EACCES' },
      ],
    };
    host({ type: 'harness.export.applyResult', requestId: requestOf('harness.export.apply'), result });
    await screen.findByText(/1 gravados · 1 pulados · 1 com falha/);
    expect(screen.getByText(/EACCES/)).toBeInTheDocument();
    expect(screen.getByText(/cópia desconectada/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fechar' })).toBeInTheDocument();
  });

  it('mostra o erro do host na prévia', async () => {
    renderThemed(<ExportDialog onClose={() => {}} />);
    host({ type: 'harness.export.planResult', requestId: requestOf('harness.export.plan'), error: 'Falhou ao ler.' });
    expect(await screen.findByRole('alert')).toHaveTextContent('Falhou ao ler.');
  });
});
