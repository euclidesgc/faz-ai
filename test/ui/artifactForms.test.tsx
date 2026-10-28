import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { lastSent, posted, renderThemed, seedBoard } from './setup';
import type { ArtifactAssistResult } from '../../src/shared/artifactAssistant';
import type { ArtifactKind, BoardArtifact } from '../../src/shared/artifacts';
import type { BoardState } from '../../src/shared/model';
import { ArtifactAssistant } from '../../src/webview/components/settings/harness/ArtifactAssistant';
import { ArtifactFormModal } from '../../src/webview/components/settings/harness/ArtifactFormModal';
import { RuleFormModal } from '../../src/webview/components/settings/harness/RuleFormModal';
import { useBoardStore } from '../../src/webview/store/boardStore';

// a IA é simulada: o pedido de assistência não passa pelo host nos testes
const assist = vi.hoisted(() => vi.fn());
vi.mock('../../src/webview/request', async (original) => ({
  ...(await original<typeof import('../../src/webview/request')>()),
  requestArtifactAssistance: assist,
}));

const artifact = (kind: ArtifactKind, name: string, patch: Partial<BoardArtifact> = {}): BoardArtifact => ({
  id: `${kind}:${name}`,
  kind,
  name,
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
  ...patch,
});

const setArtifacts = (artifacts: BoardArtifact[], skillFolders: string[] = []) => {
  const s = useBoardStore.getState().state!;
  const next: BoardState = {
    ...s,
    board: { ...s.board, aiTool: 'claude' },
    harness: { ...s.harness, library: { directory: '', artifacts, skillFolders } },
  };
  useBoardStore.setState({ state: next });
};

const draft = (patch = {}) => ({ name: '', description: '', version: '1.0.0', body: '', tools: [], ...patch });
const reply = (r: Partial<ArtifactAssistResult>): ArtifactAssistResult => ({
  context: [],
  progress: { index: 1, total: 3 },
  draft: draft(),
  done: false,
  ...r,
});

beforeEach(async () => {
  await seedBoard();
  setArtifacts([]);
  posted.mockClear();
  assist.mockReset();
});

describe('formulário de regra', () => {
  it('abre com o modelo, marca os tópicos que existem como título e estima os tokens', async () => {
    renderThemed(<RuleFormModal onClose={() => {}} onAssist={() => {}} />);
    const topics = screen.getByRole('complementary', { name: 'Guia da regra' });
    // o modelo traz as seções dos oito tópicos
    expect(within(topics).getByText('Testes').closest('li')).toHaveClass('topic-done');
    expect(within(topics).getByText(/~\d+ tokens/)).toBeInTheDocument();
  });

  it('um tópico sem título fica pendente', async () => {
    renderThemed(
      <RuleFormModal initial={{ name: 'x', version: '1', body: '# Testes\nRode `npm test`.' }} onClose={() => {}} onAssist={() => {}} />,
    );
    const topics = screen.getByRole('complementary', { name: 'Guia da regra' });
    expect(within(topics).getByText('Testes').closest('li')).toHaveClass('topic-done');
    expect(within(topics).getByText('Git e commits').closest('li')).toHaveClass('topic-todo');
  });

  it('"Salvar e ativar" manda active true, a versão e o nome', async () => {
    const closed = vi.fn();
    renderThemed(<RuleFormModal onClose={closed} onAssist={() => {}} />);
    await userEvent.type(screen.getByLabelText('Nome da regra'), 'projeto');
    const version = screen.getByLabelText('Versão');
    await userEvent.clear(version);
    await userEvent.type(version, '2');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar e ativar' }));
    const sent = lastSent('harness.library.save').input;
    expect(sent).toMatchObject({ kind: 'rule', name: 'projeto', version: '2', active: true });
    expect(sent.body).toContain('versao: 2');
    expect(sent.body).toContain('nome: projeto');
  });

  it('"Salvar inativa" manda active false', async () => {
    renderThemed(<RuleFormModal onClose={() => {}} onAssist={() => {}} />);
    await userEvent.type(screen.getByLabelText('Nome da regra'), 'projeto');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar inativa' }));
    expect(lastSent('harness.library.save').input).toMatchObject({ active: false });
  });
});

describe('formulário de skill e agente', () => {
  it('"Salvar e ativar" manda a versão, a pasta e as tools marcadas', async () => {
    setArtifacts([], ['front']);
    renderThemed(<ArtifactFormModal kind="skill" onClose={() => {}} onAssist={() => {}} />);
    await userEvent.type(screen.getByLabelText('Nome'), 'testes-ui');
    await userEvent.type(screen.getByLabelText('Descrição'), 'Como testar telas');
    await userEvent.type(screen.getByLabelText('Instruções da skill'), 'Use Testing Library.');
    await userEvent.click(screen.getByRole('checkbox', { name: /Ler arquivos/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Terminal/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar e ativar' }));
    expect(lastSent('harness.library.save').input).toMatchObject({
      kind: 'skill',
      name: 'testes-ui',
      version: '1.0.0',
      folder: '',
      tools: ['read', 'shell'],
      active: true,
    });
  });

  it('mostra o frontmatter ao vivo e a prévia do allowed-tools', async () => {
    renderThemed(<ArtifactFormModal kind="skill" onClose={() => {}} onAssist={() => {}} />);
    await userEvent.type(screen.getByLabelText('Nome'), 'abc');
    await userEvent.click(screen.getByRole('checkbox', { name: /Ler arquivos/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Buscar/ }));
    const front = screen.getByRole('region', { name: 'Frontmatter do board' });
    expect(front).toHaveTextContent('name: abc');
    expect(front).toHaveTextContent('tools: [read, search]');
    expect(screen.getByRole('region', { name: 'Prévia da exportação' })).toHaveTextContent('allowed-tools: Read Glob Grep');
  });

  it('marca o agente ativo sem a tool que a skill pede', async () => {
    setArtifacts([artifact('agent', 'revisor', { tools: ['read'] }), artifact('agent', 'dev', { tools: ['read', 'shell'] })]);
    renderThemed(<ArtifactFormModal kind="skill" onClose={() => {}} onAssist={() => {}} />);
    await userEvent.click(screen.getByRole('checkbox', { name: /Terminal/ }));
    const compat = screen.getByRole('region', { name: 'Compatibilidade' });
    expect(within(within(compat).getByText('revisor').closest('li')!).getByText('sem shell')).toBeInTheDocument();
    expect(within(within(compat).getByText('dev').closest('li')!).getByText('compatível')).toBeInTheDocument();
  });

  it('"Sugerir configuração" preenche os campos e marca as tools sugeridas', async () => {
    assist.mockResolvedValue(
      reply({
        draft: draft({
          name: 'revisar-pr',
          description: 'Revisa PRs',
          tools: ['read', 'search'],
          body: 'Leia o diff.',
          skills: [],
          model: '',
        }),
      }),
    );
    renderThemed(<ArtifactFormModal kind="agent" onClose={() => {}} onAssist={() => {}} />);
    await userEvent.type(screen.getByLabelText('Qual é o objetivo deste agente?'), 'revisar PRs');
    await userEvent.click(screen.getByRole('button', { name: /Sugerir configuração/ }));
    await waitFor(() => expect(screen.getByLabelText('Nome')).toHaveValue('revisar-pr'));
    expect(assist.mock.calls[0]![0]).toMatchObject({ mode: 'suggest', kind: 'agent', goal: 'revisar PRs' });
    expect(screen.getByRole('checkbox', { name: /Ler arquivos/ })).toBeChecked();
    expect(screen.getAllByText('sugerida')).toHaveLength(2);
  });

  it('mostra o erro da sugestão no formulário', async () => {
    assist.mockRejectedValue(new Error('A IA falhou.'));
    renderThemed(<ArtifactFormModal kind="skill" onClose={() => {}} onAssist={() => {}} />);
    await userEvent.type(screen.getByLabelText('O que esta skill deve ensinar?'), 'x');
    await userEvent.click(screen.getByRole('button', { name: /Sugerir configuração/ }));
    expect(await screen.findByText('A IA falhou.')).toBeInTheDocument();
  });
});

describe('assistente "Criar com IA"', () => {
  it('a primeira pergunta é local; "Próxima" envia as respostas e a opção Sugerido vem marcada', async () => {
    assist.mockResolvedValue(
      reply({
        question: {
          text: 'Qual framework de testes?',
          hint: 'Escolha um.',
          type: 'single',
          options: [
            { label: 'Jest', suggested: false },
            { label: 'Vitest', suggested: true },
          ],
        },
        context: [{ label: 'Stack', value: 'TypeScript' }],
        draft: draft({ body: '# Regras\n' }),
      }),
    );
    renderThemed(<ArtifactAssistant kind="rule" onClose={() => {}} onFinish={() => {}} />);
    expect(screen.getByText('Qual é o objetivo deste projeto e para quem ele é?')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Sua resposta'), 'Uma extensão de VS Code');
    await userEvent.click(screen.getByRole('button', { name: 'Próxima' }));
    await screen.findByText('Qual framework de testes?');
    expect(assist.mock.calls[0]![0]).toMatchObject({
      mode: 'question',
      kind: 'rule',
      goal: 'Uma extensão de VS Code',
      answers: [{ question: 'Qual é o objetivo deste projeto e para quem ele é?', answer: 'Uma extensão de VS Code' }],
    });
    expect(screen.getByRole('radio', { name: /Vitest/ })).toBeChecked();
    expect(screen.getByText('Sugerido')).toBeInTheDocument();
    expect(screen.getByText('Stack')).toBeInTheDocument();
    expect(screen.getByText('Pergunta 2 de 3')).toBeInTheDocument();
  });

  it('"Finalizar e revisar no editor" entrega o rascunho', async () => {
    const final = draft({ name: 'projeto', body: '# Regras\n' });
    assist.mockResolvedValue(reply({ done: true, draft: final }));
    const onFinish = vi.fn();
    renderThemed(<ArtifactAssistant kind="rule" onClose={() => {}} onFinish={onFinish} />);
    await userEvent.type(screen.getByLabelText('Sua resposta'), 'Algo');
    await userEvent.click(screen.getByRole('button', { name: 'Próxima' }));
    await screen.findByText('Pronto para revisar', { selector: 'h4' });
    await userEvent.click(screen.getByRole('button', { name: 'Finalizar e revisar no editor' }));
    expect(onFinish).toHaveBeenCalledWith(final);
  });

  it('mostra o erro com "Tentar de novo"', async () => {
    assist.mockRejectedValueOnce(new Error('Sem resposta.')).mockResolvedValueOnce(reply({ done: true }));
    renderThemed(<ArtifactAssistant kind="skill" onClose={() => {}} onFinish={() => {}} />);
    await userEvent.type(screen.getByLabelText('Sua resposta'), 'Algo');
    await userEvent.click(screen.getByRole('button', { name: 'Próxima' }));
    await screen.findByText('Sem resposta.');
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await screen.findByText('Pronto para revisar', { selector: 'h4' });
    expect(assist).toHaveBeenCalledTimes(2);
  });

  it('com o chat ocupado não deixa continuar', async () => {
    const s = useBoardStore.getState().state!;
    useBoardStore.setState({ state: { ...s, chat: { ...s.chat, busy: true } } });
    renderThemed(<ArtifactAssistant kind="agent" onClose={() => {}} onFinish={() => {}} />);
    await userEvent.type(screen.getByLabelText('Sua resposta'), 'Algo');
    expect(screen.getByRole('button', { name: 'Próxima' })).toBeDisabled();
  });
});
