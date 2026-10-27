// A aba Artefatos do board: a busca de cada assunto fica na aba dele, entre a barra de criação e a lista; a barra
// separa criar de pedir à IA; e o aviso de regras desligadas filtra a lista para revisar só elas.
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
  it('a busca é de cada assunto, fica abaixo da barra de criação, e trocar de aba não a perde', async () => {
    withRules([rule('testes', 'always'), rule('estilo', 'always')]);
    renderThemed(<ArtifactsHarness />);
    const search = screen.getByRole('searchbox', { name: 'Buscar em Regras por nome ou descrição' });
    const create = screen.getByRole('button', { name: /Nova regra/ });
    // a barra vem antes da busca, e a busca antes da lista
    expect(create.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await userEvent.type(search, 'test');
    expect(names().some((n) => n.includes('estilo'))).toBe(false);

    await userEvent.click(screen.getByRole('tab', { name: /Skills/ }));
    await userEvent.click(screen.getByRole('tab', { name: /Regras/ }));
    expect(screen.getByRole('searchbox', { name: 'Buscar em Regras por nome ou descrição' })).toHaveValue('test');
  });

  it('criar e pedir à IA ficam em grupos separados da barra', () => {
    withRules([]);
    renderThemed(<ArtifactsHarness />);
    const create = screen.getByRole('button', { name: /Nova regra/ }).closest('.toolbar-group');
    const ai = screen.getByRole('button', { name: 'Sugerir regras com IA' }).closest('.toolbar-group');
    expect(create).not.toBeNull();
    expect(within(create as HTMLElement).getByRole('button', { name: /Criar regra com ajuda/ })).toBeInTheDocument();
    expect(ai).not.toBe(create);
  });

  it('com regras desligadas, o aviso filtra a lista para só elas e volta a mostrar todas', async () => {
    withRules([rule('ligada', 'always'), rule('desligada', 'off')]);
    renderThemed(<ArtifactsHarness />);
    expect(names().some((n) => n.includes('ligada') && !n.includes('desligada'))).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar só as desligadas' }));
    expect(names().every((n) => !n.includes('ligada') || n.includes('desligada'))).toBe(true);
    expect(names().some((n) => n.includes('desligada'))).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar todas as regras' }));
    expect(names().some((n) => n.includes('ligada') && !n.includes('desligada'))).toBe(true);
  });

  it('o Exportar avisa que os servidores MCP não vão', async () => {
    withRules([]);
    renderThemed(<ArtifactsHarness />);
    await userEvent.hover(screen.getByRole('button', { name: 'Exportar para a ferramenta' }));
    expect((await screen.findAllByText(/Os servidores MCP não vão/))[0]).toBeInTheDocument();
  });
});
