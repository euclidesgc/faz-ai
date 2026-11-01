// A aba Artefatos do board: a busca de cada assunto fica na aba dele, entre a barra de criação e a lista; a barra
// junta o criar com IA e o criar à mão; o MCP não tem Criar com IA.
import { renderThemed, seedBoard } from './setup';
import { beforeEach, describe, expect, it } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BoardArtifact } from '../../src/shared/artifacts';
import { ArtifactsHarness } from '../../src/webview/components/settings/harness/ArtifactsHarness';
import { useBoardStore } from '../../src/webview/store/boardStore';

const rule = (name: string, usage: BoardArtifact['usage']): BoardArtifact => ({
  id: `rule:${name}`,
  kind: 'rule',
  name,
  description: '',
  usage,
  origin: '',
  originTool: '',
  missing: false,
  skipped: [],
  files: [],
  body: '',
  path: '',
  createdAt: 0,
  updatedAt: 0,
});

function withRules(rules: BoardArtifact[]): void {
  const s = useBoardStore.getState().state!;
  const others = (s.harness.library?.artifacts ?? []).filter((a) => a.kind !== 'rule');
  act(() =>
    useBoardStore.setState({
      state: {
        ...s,
        harness: { ...s.harness, library: { directory: '/lib', flowSkills: [], ...s.harness.library, artifacts: [...others, ...rules] } },
      },
    }),
  );
}

const names = () => screen.getAllByRole('listitem').map((li) => li.textContent ?? '');

beforeEach(async () => {
  await seedBoard();
  useBoardStore.setState({ harnessTopic: 'rules' });
});

describe('Harness › Artefatos do board', () => {
  it('a busca é de cada assunto, fica abaixo da barra de criação, e trocar de aba não a perde nem ao filtro', async () => {
    withRules([rule('testes', 'always'), rule('estilo', 'always')]);
    renderThemed(<ArtifactsHarness />);
    const search = screen.getByRole('searchbox', { name: 'Buscar em Regras por nome ou descrição' });
    const create = screen.getByRole('button', { name: /Nova regra/ });
    // a barra vem antes da busca, e a busca antes da lista
    expect(create.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await userEvent.type(search, 'test');
    expect(names().some((n) => n.includes('estilo'))).toBe(false);
    await userEvent.click(screen.getByRole('radio', { name: 'Ativas' }));

    await userEvent.click(screen.getByRole('tab', { name: /Skills/ }));
    await userEvent.click(screen.getByRole('tab', { name: /Regras/ }));
    expect(screen.getByRole('searchbox', { name: 'Buscar em Regras por nome ou descrição' })).toHaveValue('test');
    expect(screen.getByRole('radio', { name: 'Ativas' })).toBeChecked();
  });

  it('criar com IA e criar à mão ficam juntos na barra, e o servidor MCP não tem Criar com IA', async () => {
    withRules([]);
    renderThemed(<ArtifactsHarness />);
    const create = screen.getByRole('button', { name: /Nova regra/ }).closest('.toolbar-group');
    expect(within(create as HTMLElement).getByRole('button', { name: /Criar com IA/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /Servidores MCP/ }));
    expect(screen.getByRole('button', { name: /Novo servidor/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Criar com IA/ })).toBeNull();
  });

  it('o Exportar avisa que os servidores MCP não vão', async () => {
    withRules([]);
    renderThemed(<ArtifactsHarness />);
    await userEvent.hover(screen.getByRole('button', { name: 'Exportar para a ferramenta' }));
    expect((await screen.findAllByText(/Os servidores MCP não vão/))[0]).toBeInTheDocument();
  });
});
