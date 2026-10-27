// Os selos e as ações da lista do Harness: o que é de fábrica (não se apaga; o agente restaura e desliga, a skill do
// fluxo é só de leitura, inclusive a que não está na biblioteca) e a conferência da cópia com a origem.
import { lastSent, renderThemed, seedBoard, sentOf } from './setup';
import { beforeEach, describe, expect, it } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AgentMeta, BoardArtifact } from '../../src/shared/artifacts';
import { ArtifactList } from '../../src/webview/components/settings/harness/ArtifactList';
import { useBoardStore } from '../../src/webview/store/boardStore';

const meta = (seed: boolean): AgentMeta => ({
  skills: [],
  mcpServers: [],
  model: '',
  tools: { categories: ['read'], native: { tool: '', allow: ['Read'], deny: [] } },
  ...(seed ? { seed: true } : {}),
});

const artifact = (over: Partial<BoardArtifact> & Pick<BoardArtifact, 'kind' | 'name'>): BoardArtifact => ({
  id: `${over.kind}:${over.name}`,
  description: '',
  usage: 'contextual',
  origin: '',
  originTool: '',
  missing: false,
  skipped: [],
  files: [],
  body: '',
  path: '',
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

function library(artifacts: BoardArtifact[], flowSkills: { name: string; description: string }[] = []): void {
  const s = useBoardStore.getState().state!;
  act(() =>
    useBoardStore.setState({
      state: {
        ...s,
        board: { ...s.board, runner: { ...s.board.runner, defaultAgent: 'condutor-do-board' } },
        harness: { ...s.harness, library: { directory: '/lib', artifacts, flowSkills } },
      },
    }),
  );
}

const list = (kind: BoardArtifact['kind']) =>
  renderThemed(<ArtifactList kind={kind} query="" picked={new Set()} onPick={() => {}} onImport={() => {}} />);
/** Confirma o diálogo do board aberto pelo clique (a tela monta o Dialog à parte). */
const confirmDialog = () => act(() => useBoardStore.getState().dialog!.onConfirm());
const row = (name: string) => screen.getAllByRole('listitem').find((li) => within(li).queryByText(name, { exact: true }))!;

beforeEach(async () => {
  await seedBoard();
});

describe('lista do Harness: de fábrica e origem', () => {
  it('o agente de fábrica tem o selo, restaura com confirmação, desliga e não tem Apagar; o padrão não desliga', async () => {
    library([
      artifact({ kind: 'agent', name: 'condutor-do-board', agent: meta(true) }),
      artifact({ kind: 'agent', name: 'qa-testes', agent: meta(true) }),
      artifact({ kind: 'agent', name: 'meu', agent: meta(false) }),
    ]);
    list('agent');
    const qa = row('qa-testes');
    expect(within(qa).getByText('de fábrica')).toBeInTheDocument();
    expect(within(qa).queryByRole('button', { name: /Apagar/ })).toBeNull();
    expect(within(qa).getByRole('combobox', { name: 'Modo no board: qa-testes' })).toBeInTheDocument();
    await userEvent.click(within(qa).getByRole('button', { name: 'Restaurar o original: qa-testes' }));
    expect(useBoardStore.getState().dialog?.title).toBe('Voltar "qa-testes" ao texto original?');
    confirmDialog();
    expect(lastSent('harness.agent.restore')).toMatchObject({ name: 'qa-testes' });

    // o padrão mostra o selo em vez do seletor: para desligá-lo, outro vira o padrão
    const conductor = row('condutor-do-board');
    expect(within(conductor).queryByRole('combobox')).toBeNull();
    expect(within(conductor).getByText('Disponível no board')).toBeInTheDocument();

    const mine = row('meu');
    expect(within(mine).queryByText('de fábrica')).toBeNull();
    expect(within(mine).queryByRole('button', { name: 'Restaurar o original: meu' })).toBeNull();
    expect(within(mine).getByRole('button', { name: /Apagar/ })).toBeInTheDocument();
  });

  it('o padrão da lista é o "padrão das instruções", para não se confundir com o agente de IA padrão de Conectar agentes', async () => {
    library([
      artifact({ kind: 'agent', name: 'condutor-do-board', agent: meta(true) }),
      artifact({ kind: 'agent', name: 'meu', agent: meta(false) }),
    ]);
    list('agent');
    expect(within(row('condutor-do-board')).getByText('padrão das instruções')).toBeInTheDocument();
    const mine = row('meu');
    expect(within(mine).queryByText('padrão das instruções')).toBeNull();
    await userEvent.click(within(mine).getByRole('button', { name: 'Tornar meu o agente padrão das instruções' }));
    expect(lastSent('settings.board.update').patch).toEqual({ runner: { defaultAgent: 'meu' } });
  });

  it('as skills do fluxo aparecem só para leitura, também as que não estão na biblioteca', () => {
    library(
      [artifact({ kind: 'skill', name: 'faz-ai-fluxo', generated: true, usage: 'always' })],
      [
        { name: 'faz-ai-fluxo', description: 'O fluxo' },
        { name: 'faz-ai-modo-autonomo', description: 'Modo autônomo' },
      ],
    );
    list('skill');
    expect(screen.getAllByText('faz-ai-fluxo')).toHaveLength(1);
    for (const name of ['faz-ai-fluxo', 'faz-ai-modo-autonomo']) {
      const r = row(name);
      expect(within(r).getByText('de fábrica')).toBeInTheDocument();
      expect(within(r).getByText('Entregue pelo board')).toBeInTheDocument();
      expect(within(r).queryByRole('button', { name: /Editar|Apagar/ })).toBeNull();
    }
  });

  it('a cópia mostra a conferência com a origem, e atualizar uma cópia editada no board pede confirmação', async () => {
    library([
      artifact({ kind: 'skill', name: 'react', origin: '.claude/skills/react/SKILL.md', originState: 'changed', editedInBoard: true }),
      artifact({ kind: 'skill', name: 'sumida', origin: '.claude/skills/sumida/SKILL.md', originState: 'missing' }),
      artifact({ kind: 'skill', name: 'em-dia', origin: '.claude/skills/em-dia/SKILL.md' }),
    ]);
    list('skill');
    const react = row('react');
    expect(within(react).getByText('origem alterada')).toBeInTheDocument();
    expect(within(react).getByText('editado no board')).toBeInTheDocument();
    await userEvent.click(within(react).getByRole('button', { name: 'Atualizar da origem: react' }));
    expect(sentOf('harness.library.update')).toHaveLength(0);
    confirmDialog();
    expect(lastSent('harness.library.update')).toMatchObject({ id: 'skill:react' });

    expect(within(row('sumida')).getByText('origem não encontrada')).toBeInTheDocument();
    expect(within(row('sumida')).queryByRole('button', { name: /Atualizar da origem/ })).toBeNull();
    expect(within(row('em-dia')).queryByText(/origem alterada|origem não encontrada|editado no board/)).toBeNull();
  });
});
