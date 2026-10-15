import { beforeEach, describe, expect, it } from 'vitest';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { lastSent, posted, renderThemed, seedBoard, sentOf } from './setup';
import type { HarnessItem } from '../../src/shared/harness';
import { HARNESS_CATALOG } from '../../src/shared/harnessCatalog';
import type { HostToWebview } from '../../src/shared/messages';
import type { ProjectProfile } from '../../src/shared/projectProfile';
import { RuleWizard } from '../../src/webview/components/settings/harness/RuleWizard';
import { useBoardStore } from '../../src/webview/store/boardStore';
import type { BoardState } from '../../src/shared/model';

const setState = (patch: (s: BoardState) => Partial<BoardState>) => {
  const s = useBoardStore.getState().state!;
  useBoardStore.setState({ state: { ...s, ...patch(s) } });
};

const indexOf = (scope: 'project' | 'user', file: string) =>
  HARNESS_CATALOG.claude.findIndex((s) => s.scope === scope && s.path === file && !s.noCreate);

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

const claudeMd: HarnessItem = {
  kind: 'instructions',
  scope: 'project',
  name: 'CLAUDE.md',
  description: '',
  path: '/abs/CLAUDE.md',
  location: 'CLAUDE.md',
  layout: 'file',
  source: indexOf('project', 'CLAUDE.md'),
};

beforeEach(async () => {
  await seedBoard();
  setState((s) => ({
    board: { ...s.board, aiTool: 'claude' },
    harness: { ...s.harness, inventory: [{ tool: 'claude', installed: true, items: [] }] },
    harnessSelection: [],
  }));
  posted.mockClear();
});

const next = () => userEvent.click(screen.getByRole('button', { name: 'Continuar' }));

describe('assistente "Criar regra com ajuda"', () => {
  it('por assunto: caminhos, o que garante, convenções marcadas, conflito mostrado e a regra gravada desligada no board', async () => {
    const closed: string[] = [];
    renderThemed(<RuleWizard tool="claude" scope="project" onClose={() => closed.push('x')} />);
    replyProfile();

    // 1. onde vale: principal por padrão; "Por assunto" pede os caminhos
    expect(screen.getByText('Passo 1 de 5')).toBeInTheDocument();
    expect(screen.getByText('Só nos arquivos de teste')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Por assunto' }));
    expect(screen.getByText(/Uma regra nova em \.claude\/rules\/<nome>\.md\./)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Arquivos de teste' }));
    expect(screen.getByPlaceholderText('src/**/*.test.ts, test/**')).toHaveValue('**/*.test.*');
    await next();

    // 2. o que garante: o exemplo de resposta e as ideias
    expect(screen.getByText('Mensagens de commit em português, no imperativo, sem ponto final.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled();
    await userEvent.type(screen.getByRole('textbox', { name: 'A regra' }), 'Testes pequenos e sem mocks do banco.');
    await userEvent.click(screen.getByRole('button', { name: 'Comentários' }));
    expect((screen.getByRole('textbox', { name: 'A regra' }) as HTMLTextAreaElement).value).toContain('Comentários explicam o porquê');
    await next();

    // 3. convenções do projeto: itens marcáveis a partir do perfil
    expect(screen.getByRole('checkbox', { name: 'Linguagens: TypeScript' })).not.toBeChecked();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Comando test: vitest run' }));
    expect(screen.getByRole('checkbox', { name: 'Comando test: vitest run' })).toBeChecked();
    await next();

    // 4. sem conflito
    expect(screen.getByText('Nenhum trecho conflita com o fluxo do board.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'A regra' }), '{Enter}Não use MCP nas tarefas pequenas.');
    await next();
    await next();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Não use MCP nas tarefas pequenas.');
    expect(alert).toHaveTextContent('Estes trechos podem conflitar com o fluxo do board:');
    await next();

    // 5. rascunho, resumo e confirmação: nada gravado antes
    expect(sentOf('harness.item.write')).toHaveLength(0);
    expect(screen.getByText('Desligada, até você ativar')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Nome do arquivo' })).toHaveValue('testes-pequenos-mocks-banco');
    // o conflito continua à vista no texto final, que a pessoa pode editar
    expect(screen.getByRole('alert')).toHaveTextContent('Não use MCP');
    await userEvent.click(screen.getByRole('button', { name: 'Criar regra' }));
    const write = lastSent('harness.item.write');
    expect(write).toMatchObject({ tool: 'claude', source: indexOf('project', '.claude/rules'), name: 'testes-pequenos-mocks-banco' });
    expect(write.content).toContain('paths:\n  - "**/*.test.*"');
    expect(write.content).toContain('- Testes pequenos e sem mocks do banco.');
    expect(write.content).toContain('## Convenções do projeto\n- Rode os testes com `npm run test`');
    expect(write.append).toBeUndefined();
    expect(lastSent('harness.selection.set')).toEqual({
      type: 'harness.selection.set',
      items: [{ kind: 'instructions', location: '.claude/rules/testes-pequenos-mocks-banco.md' }],
      usage: 'off',
    });
    expect(closed).toEqual(['x']);
  });

  it('principal: acrescenta ao CLAUDE.md que já existe e o deixa desligado; se já estava no board, mantém o modo', async () => {
    setState((s) => ({ harness: { ...s.harness, inventory: [{ tool: 'claude', installed: true, items: [claudeMd] }] } }));
    const first = renderThemed(<RuleWizard tool="claude" scope="project" onClose={() => {}} />);
    replyProfile();
    expect(screen.getByRole('combobox', { name: 'Arquivo' })).toHaveTextContent('CLAUDE.md (acrescenta ao existente)');
    await next();
    await userEvent.type(screen.getByRole('textbox', { name: 'A regra' }), 'Commits em português.');
    for (let i = 0; i < 3; i++) await next();
    expect(screen.getByText('(acrescenta ao fim do arquivo)')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Acrescentar ao arquivo' }));
    expect(lastSent('harness.item.write')).toMatchObject({
      source: claudeMd.source,
      name: '',
      append: true,
      content: '## Regras do projeto\n\nCommits em português.\n',
    });
    expect(lastSent('harness.selection.set')).toMatchObject({ items: [{ kind: 'instructions', location: 'CLAUDE.md' }], usage: 'off' });

    first.unmount();
    posted.mockClear();
    setState(() => ({ harnessSelection: [{ kind: 'instructions', location: 'CLAUDE.md', usage: 'always' }] }));
    renderThemed(<RuleWizard tool="claude" scope="project" onClose={() => {}} />);
    await next();
    await userEvent.type(screen.getByRole('textbox', { name: 'A regra' }), 'Outra.');
    for (let i = 0; i < 3; i++) await next();
    await userEvent.click(screen.getByRole('button', { name: 'Acrescentar ao arquivo' }));
    expect(sentOf('harness.item.write')).toHaveLength(1);
    // quem já tinha ativado o CLAUDE.md não o vê desligar por causa de um acréscimo
    expect(sentOf('harness.selection.set')).toHaveLength(0);
  });

  it('o global grava na pasta do usuário e avisa; sem a resposta do host o assistente segue sem convenções', async () => {
    renderThemed(<RuleWizard tool="claude" scope="user" onClose={() => {}} />);
    expect(screen.getByRole('combobox', { name: 'Arquivo' })).toHaveTextContent('~/.claude/CLAUDE.md');
    await next();
    await userEvent.type(screen.getByRole('textbox', { name: 'A regra' }), 'Responder em português.');
    await next();
    expect(screen.getByText('Lendo o projeto…')).toBeInTheDocument();
    replyProfile({ languages: [], scripts: {}, tools: [], folders: [], readme: '' });
    expect(await screen.findByText('Não achei convenções no projeto para sugerir. Pode continuar.')).toBeInTheDocument();
    await next();
    await next();
    expect(screen.getByText(/vale para todos os seus projetos/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Criar regra' }));
    expect(lastSent('harness.selection.set').items).toEqual([{ kind: 'instructions', location: '~/.claude/CLAUDE.md' }]);
  });
});
