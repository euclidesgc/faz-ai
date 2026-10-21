import { beforeEach, describe, expect, it } from 'vitest';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { lastSent, posted, renderThemed, seedBoard, sentOf } from './setup';
import type { BoardArtifact } from '../../src/shared/artifacts';
import type { HostToWebview } from '../../src/shared/messages';
import type { ProjectProfile } from '../../src/shared/projectProfile';
import { RuleWizard } from '../../src/webview/components/settings/harness/RuleWizard';
import { useBoardStore } from '../../src/webview/store/boardStore';
import type { BoardState } from '../../src/shared/model';

const setState = (patch: (s: BoardState) => Partial<BoardState>) => {
  const s = useBoardStore.getState().state!;
  useBoardStore.setState({ state: { ...s, ...patch(s) } });
};

const PROFILE: ProjectProfile = {
  languages: ['TypeScript'],
  scripts: { test: 'vitest run', lint: 'eslint .' },
  tools: ['eslint'],
  folders: ['src', 'test'],
  readme: 'App',
};

/** o host responde ao pedido do perfil que o assistente fez ao abrir */
const replyProfile = (profile: ProjectProfile = PROFILE) => {
  const { requestId } = lastSent('harness.project.profile');
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', { data: { type: 'harness.project.profileResult', requestId, profile } satisfies HostToWebview }),
    );
  });
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

const rule = (name: string): BoardArtifact => ({
  id: name,
  kind: 'rule',
  name,
  description: '',
  usage: 'off',
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

describe('assistente "Criar regra com ajuda"', () => {
  it('quatro passos: o que garante, convenções marcadas, conflito mostrado e a regra gravada no board pelo assistente', async () => {
    const closed: string[] = [];
    renderThemed(<RuleWizard onClose={() => closed.push('x')} />);
    replyProfile();

    // 1. o que garante: sem escolha de ferramenta, escopo ou pasta
    expect(screen.getByText('Passo 1 de 4')).toBeInTheDocument();
    expect(screen.queryByText('Onde vale')).not.toBeInTheDocument();
    expect(screen.getByText('Mensagens de commit em português, no imperativo, sem ponto final.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled();
    await userEvent.type(screen.getByRole('textbox', { name: 'A regra' }), 'Testes pequenos e sem mocks do banco.');
    await userEvent.click(screen.getByRole('button', { name: 'Comentários' }));
    expect((screen.getByRole('textbox', { name: 'A regra' }) as HTMLTextAreaElement).value).toContain('Comentários explicam o porquê');
    await next();

    // 2. convenções do projeto
    expect(screen.getByRole('checkbox', { name: 'Linguagens: TypeScript' })).not.toBeChecked();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Comando test: vitest run' }));
    await next();

    // 3. sem conflito; depois com
    expect(screen.getByText('Nenhum trecho conflita com o fluxo do board.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'A regra' }), '{Enter}Não use MCP nas tarefas pequenas.');
    await next();
    await next();
    expect(screen.getByRole('alert')).toHaveTextContent('Não use MCP nas tarefas pequenas.');
    await next();

    // 4. rascunho e resumo: nada gravado antes; a regra nasce desligada
    expect(sentOf('harness.artifact.save')).toHaveLength(0);
    expect(screen.getByText('Desligada, até você ativar')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Nome da regra' })).toHaveValue('testes-pequenos-mocks-banco');
    await userEvent.click(screen.getByRole('button', { name: 'Criar regra' }));
    const save = lastSent('harness.artifact.save');
    expect(save).toMatchObject({ kind: 'rule', name: 'testes-pequenos-mocks-banco', via: 'wizard' });
    expect(save.body).toContain('Testes pequenos e sem mocks do banco.');
    expect(save.body).toContain('## Convenções do projeto\n- Rode os testes com `npm run test`');
    expect(save).not.toHaveProperty('tool');
    expect(save).not.toHaveProperty('scope');
    expect(save).not.toHaveProperty('source');
    expect(sentOf('harness.item.write')).toHaveLength(0);
    expect(sentOf('harness.selection.set')).toHaveLength(0);
    expect(closed).toEqual(['x']);
  });

  it('recusa um nome que já existe no board e segue sem convenções se o host não responde ao perfil', async () => {
    setState((s) => ({ harness: { ...s.harness, library: { directory: '', artifacts: [rule('commits')] } } }));
    renderThemed(<RuleWizard onClose={() => {}} />);
    await userEvent.type(screen.getByRole('textbox', { name: 'A regra' }), 'Commits em português.');
    await next();
    expect(screen.getByText('Lendo o projeto…')).toBeInTheDocument();
    replyProfile({ languages: [], scripts: {}, tools: [], folders: [], readme: '' });
    expect(await screen.findByText('Não achei convenções no projeto para sugerir. Pode continuar.')).toBeInTheDocument();
    await next();
    await next();
    const name = screen.getByRole('textbox', { name: 'Nome da regra' });
    expect(name).toHaveValue('commits-portugues');
    await userEvent.clear(name);
    await userEvent.type(name, 'commits');
    expect(screen.getByText('Nome inválido ou já usado.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Criar regra' })).toBeDisabled();
  });
});
