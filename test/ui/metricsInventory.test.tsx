import { renderThemed } from './setup';
import { afterEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import type { MetricsInventory, MetricsPanelResult } from '../../src/shared/metrics';
import { setLocale } from '../../src/webview/i18n';
import { Inventory } from '../../src/webview/components/metrics/Inventory';
import { emptySections } from './metricsFixtures';

afterEach(() => setLocale('pt-BR'));

function render(inventory: MetricsInventory, detailFrom = '2026-08') {
  const sections = { ...emptySections(), inventory };
  const result = { detailFrom, sections } as unknown as MetricsPanelResult;
  return renderThemed(<Inventory result={result} sections={sections} />);
}

const filled: MetricsInventory = {
  measured: true,
  tools: [{ name: 'Read', server: '', runs: 3, calls: 12 }],
  mcpTools: [
    { name: 'get_card', server: 'faz-ai', runs: 2, calls: 5 },
    { name: 'mcp__sem_servidor', server: '', runs: 1, calls: 1 },
  ],
  agents: [{ name: 'Explore', server: '', runs: 1, calls: 2 }],
  skills: [{ name: 'ui-components', server: '', runs: 1, calls: 1 }],
};

describe('Inventory', () => {
  it('mostra os quatro grupos, cada um com tabela, legenda e cabeçalhos de coluna', () => {
    render(filled);
    for (const name of ['Ferramentas', 'Ferramentas de MCP', 'Subagentes', 'Skills']) {
      const group = screen.getByRole('region', { name });
      const table = within(group).getByRole('table', { name });
      expect(within(table).getAllByRole('columnheader').length).toBeGreaterThanOrEqual(3);
    }
    const tools = screen.getByRole('table', { name: 'Ferramentas' });
    const row = within(tools).getByRole('row', { name: /Read/ });
    expect(within(row).getByRole('rowheader', { name: 'Read' })).toBeTruthy();
    expect(within(row).getByText('12')).toBeTruthy();
  });

  it('põe o servidor em coluna própria e diz "servidor não registrado" sem adivinhar', () => {
    render(filled);
    const mcp = screen.getByRole('table', { name: 'Ferramentas de MCP' });
    expect(within(mcp).getByRole('columnheader', { name: 'Servidor' })).toBeTruthy();
    expect(within(mcp).getByRole('columnheader', { name: 'Ferramenta' })).toBeTruthy();
    const ok = within(mcp).getByRole('row', { name: /get_card/ });
    expect(within(ok).getAllByRole('cell')[0]!.textContent).toBe('faz-ai');
    const unknown = within(mcp).getByRole('row', { name: /mcp__sem_servidor/ });
    expect(within(unknown).getByText('servidor não registrado')).toBeTruthy();
    expect(within(unknown).getByRole('rowheader').textContent).toBe('mcp__sem_servidor');
  });

  it('nunca medido: "ainda não medido" nos quatro grupos, sem citar a história #70', () => {
    const { container } = render({ measured: false, tools: [], mcpTools: [], agents: [], skills: [] });
    expect(container.querySelectorAll('[data-state="unmeasured"]')).toHaveLength(4);
    expect(container.querySelector('[data-state="empty"]')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
    expect(container.textContent).toMatch(/Ainda não medido/);
    expect(container.textContent).not.toMatch(/#70/);
  });

  it('medido com o período vazio: "nenhum registro no período", outro texto', () => {
    const { container } = render({ measured: true, tools: [], mcpTools: [], agents: [], skills: [] });
    expect(container.querySelectorAll('[data-state="empty"]')).toHaveLength(4);
    expect(container.querySelector('[data-state="unmeasured"]')).toBeNull();
    expect(container.textContent).toMatch(/Nenhum registro no período/);
    expect(container.textContent).not.toMatch(/Ainda não medido/);
  });

  it('diz o alcance: só o detalhe, desde quando, e o que o arquivo mensal guarda', () => {
    const { container } = render(filled);
    const scope = container.querySelector('[data-inventory-scope]')!;
    expect(scope.textContent).toMatch(/só o detalhe guardado, desde agosto de 2026/);
    expect(scope.textContent).toMatch(/totais mensais de uso/);
    expect(scope.textContent).toMatch(/arquivo mensal/);
  });

  it('sem detalhe no board, o alcance não inventa um mês', () => {
    const { container } = render(filled, '');
    const scope = container.querySelector('[data-inventory-scope]')!;
    expect(scope.textContent).toMatch(/só o detalhe guardado\./);
    expect(scope.textContent).not.toMatch(/desde/);
  });

  it('em inglês', () => {
    setLocale('en');
    render(filled);
    expect(screen.getByRole('table', { name: 'MCP tools' })).toBeTruthy();
    expect(screen.getByText('server not recorded')).toBeTruthy();
    expect(screen.getAllByRole('columnheader', { name: 'Uses' }).length).toBe(4);
  });
});
