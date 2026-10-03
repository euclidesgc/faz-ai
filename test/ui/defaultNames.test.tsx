import { seedBoard, syncStore, type SeededBoard } from './setup';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { Board } from '../../src/webview/components/Board';
import { FieldBadge } from '../../src/webview/components/FieldRenderer';
import { defaultAgent } from '../../src/shared/execution';
import { useBoardStore } from '../../src/webview/store/boardStore';
import { dt, setLocale } from '../../src/webview/i18n';
import { DEFAULT_NAMES_EN } from '../../src/webview/i18n/en';

let board: SeededBoard;
beforeAll(async () => {
  board = await seedBoard();
});
beforeEach(() => syncStore(board.router));
afterEach(() => setLocale('pt-BR'));

/** Nomes do board padrão que são iguais nos dois idiomas. */
const SAME = new Set(['Backlog', 'Discovery', 'PRD', 'Spec', 'Plan', 'Bug', 'Tags', 'Skills', 'frontend', 'backend', 'infra', 'docs']);

describe('nomes do board padrão em inglês', () => {
  it('todo nome que o board novo cria tem tradução, ou é igual nos dois idiomas', () => {
    const s = useBoardStore.getState().state!;
    const names = [
      ...s.workflows.map((w) => w.name),
      ...s.columns.map((c) => c.name),
      ...s.cardTypes.map((ct) => ct.name),
      ...s.fieldDefs.flatMap((f) => [f.name, ...f.options]),
      defaultAgent().name,
    ];
    const missing = [...new Set(names)].filter((n) => !SAME.has(n) && !(n in DEFAULT_NAMES_EN));
    expect(missing).toEqual([]);
  });

  it('dt traduz só em inglês e deixa passar o que a pessoa criou', () => {
    expect(dt('Concluído')).toBe('Concluído');
    setLocale('en');
    expect(dt('Concluído')).toBe('Done');
    expect(dt('Em revisão')).toBe('Em revisão');
  });

  it('o board em inglês mostra workflows, colunas e tipos traduzidos', () => {
    setLocale('en');
    render(
      <Theme>
        <Board />
      </Theme>,
    );
    expect(screen.getByRole('heading', { name: 'Stories' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sub-tasks' })).toBeInTheDocument();
    expect(screen.getByText('Implementation')).toBeInTheDocument();
    expect(screen.getAllByText('Done').length).toBeGreaterThan(0);
    expect(screen.queryByText('Implementação')).toBeNull();
  });

  it('a opção de um campo de seleção aparece traduzida, e o valor guardado não muda', () => {
    setLocale('en');
    const field = useBoardStore.getState().state!.fieldDefs.find((f) => f.name === 'Fase')!;
    const { container } = render(
      <Theme>
        <FieldBadge field={field} value="Implementação" />
      </Theme>,
    );
    expect(container).toHaveTextContent('Implementation');
    expect(container.querySelector('[title]')).toHaveAttribute('title', 'Phase');
  });
});
