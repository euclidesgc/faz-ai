import { beforeEach, describe, expect, it } from 'vitest';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { lastSent, posted, renderThemed, seedBoard, sentOf } from './setup';
import type { BoardArtifact } from '../../src/shared/artifacts';
import type { HostToWebview } from '../../src/shared/messages';
import { SkillWizard } from '../../src/webview/components/settings/harness/SkillWizard';
import { useBoardStore } from '../../src/webview/store/boardStore';
import type { BoardState } from '../../src/shared/model';

const setState = (patch: (s: BoardState) => Partial<BoardState>) => {
  const s = useBoardStore.getState().state!;
  useBoardStore.setState({ state: { ...s, ...patch(s) } });
};

beforeEach(async () => {
  await seedBoard();
  setState((s) => ({
    board: { ...s.board, aiTool: 'claude' },
    harness: { ...s.harness, library: { directory: '', artifacts: [] } },
  }));
  posted.mockClear();
});

const next = () => userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
const reply = (scripts: Record<string, string>) => {
  const { requestId } = lastSent('harness.project.profile');
  const msg: HostToWebview = {
    type: 'harness.project.profileResult',
    requestId,
    profile: { languages: ['TypeScript'], scripts, tools: [], folders: ['src'], readme: '' },
  };
  act(() => void window.dispatchEvent(new MessageEvent('message', { data: msg })));
};

describe('assistente "Criar skill com ajuda"', () => {
  it('percorre os 6 passos e grava o SKILL.md com os arquivos de apoio, enviando a skill ao board em "Pelo card"', async () => {
    const closed: string[] = [];
    renderThemed(<SkillWizard onClose={() => closed.push('x')} />);
    reply({ test: 'vitest run', typecheck: 'tsc' });

    // 1. a tarefa vira a descrição
    expect(screen.getByText('Passo 1 de 6')).toBeInTheDocument();
    expect(
      screen.getByText('Escrever uma migração nova do banco, subindo a versão do schema e sem editar migração antiga.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled();
    await userEvent.type(
      screen.getByRole('textbox', { name: 'A tarefa' }),
      'Escrever uma migração nova do banco, sem editar migração antiga.',
    );
    await next();

    // 2. o gatilho entra na descrição
    await userEvent.type(screen.getByRole('textbox', { name: 'Use quando…' }), 'o pedido falar de migração ou de schema');
    await next();

    // 3. o passo a passo vem proposto a partir da tarefa e do projeto, e é editável
    const steps = () => screen.getAllByRole('textbox', { name: /^Passo \d+$/ }).map((x) => (x as HTMLInputElement).value);
    expect(steps()[0]).toContain('Leia o pedido');
    expect(steps().join('\n')).toContain('npm run typecheck');
    expect(steps().join('\n')).toContain('npm run test');
    const count = steps().length;
    await userEvent.click(screen.getByRole('button', { name: 'Tirar Passo 1' }));
    expect(steps()).toHaveLength(count - 1);
    await userEvent.type(screen.getByRole('textbox', { name: 'Nova linha: Passo' }), 'Atualize o CHANGELOG{Enter}');
    expect(steps().at(-1)).toBe('Atualize o CHANGELOG');
    await next();

    // 4. limites: os propostos e mais um
    expect(screen.getByRole('textbox', { name: 'Limite 1' })).toHaveValue('Não altere arquivos fora do que a tarefa pede.');
    await userEvent.type(screen.getByRole('textbox', { name: 'Nova linha: Limite' }), 'Nunca edita migração publicada{Enter}');
    await next();

    // 5. arquivos de apoio: só pasta/arquivo válido entra
    const file = screen.getByRole('textbox', { name: 'Novo arquivo de apoio' });
    await userEvent.type(file, 'exemplo.md');
    expect(screen.getByRole('button', { name: 'Acrescentar' })).toBeDisabled();
    await userEvent.clear(file);
    await userEvent.click(screen.getByRole('button', { name: 'references/' }));
    await userEvent.type(file, 'ultima-migracao.md');
    await userEvent.click(screen.getByRole('button', { name: 'Acrescentar' }));
    expect(screen.getByRole('button', { name: /^references\/ultima-migracao\.md/ })).toBeInTheDocument();
    await next();

    // 6. resumo: nada foi gravado
    expect(sentOf('harness.artifact.save')).toHaveLength(0);
    expect(screen.getByRole('textbox', { name: 'Nome da skill' })).toHaveValue('escrever-migracao-nova-banco');
    expect(screen.getByText('Pelo card: só entra quando um card a indica')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Criar skill' }));
    const save = lastSent('harness.artifact.save');
    expect(save).toMatchObject({
      kind: 'skill',
      name: 'escrever-migracao-nova-banco',
      files: ['references/ultima-migracao.md'],
      via: 'wizard',
    });
    expect(save).not.toHaveProperty('tool');
    expect(save).not.toHaveProperty('scope');
    expect(save).not.toHaveProperty('source');
    expect(save.body).toContain('name: escrever-migracao-nova-banco');
    expect(save.body).toContain(
      'description: "Escrever uma migração nova do banco, sem editar migração antiga. Use quando o pedido falar de migração ou de schema."',
    );
    expect(save.body).toContain('1. Procure no projeto um exemplo do mesmo tipo');
    expect(save.body).toContain('- Nunca edita migração publicada');
    expect(save.body).toContain('- [references/ultima-migracao.md](references/ultima-migracao.md)');
    expect(sentOf('harness.selection.set')).toHaveLength(0);
    expect(closed).toEqual(['x']);
  });

  it('nome já usado no board é recusado', async () => {
    const existing: BoardArtifact = {
      id: 'migrar',
      kind: 'skill',
      name: 'migrar',
      description: 'x',
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
    };
    setState((s) => ({ harness: { ...s.harness, library: { directory: '', artifacts: [existing] } } }));
    renderThemed(<SkillWizard onClose={() => {}} />);
    await userEvent.type(screen.getByRole('textbox', { name: 'A tarefa' }), 'Migrar o banco');
    await next();
    await userEvent.type(screen.getByRole('textbox', { name: 'Use quando…' }), 'o pedido falar de banco');
    for (let i = 0; i < 4; i++) await next();
    const name = screen.getByRole('textbox', { name: 'Nome da skill' });
    expect(name).toHaveValue('migrar-banco');
    await userEvent.clear(name);
    await userEvent.type(name, 'migrar');
    expect(screen.getByText('Nome inválido ou já usado.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Criar skill' })).toBeDisabled();
    await userEvent.clear(name);
    await userEvent.type(name, 'migrar-banco');
    await userEvent.click(screen.getByRole('button', { name: 'Criar skill' }));
    expect(lastSent('harness.artifact.save')).toMatchObject({ kind: 'skill', name: 'migrar-banco', via: 'wizard' });
  });
});
