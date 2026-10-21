import { beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { lastSent, posted, renderThemed, seedBoard, sentOf } from './setup';
import { AGENT_SUGGESTIONS } from '../../src/shared/agentSuggestions';
import { suggestAgentModel } from '../../src/shared/agentWizard';
import { baseInfo, type HarnessItem } from '../../src/shared/harness';
import { AgentWizard } from '../../src/webview/components/settings/harness/AgentWizard';
import { AgentsTable } from '../../src/webview/components/settings/harness/AgentsTable';
import { useBoardStore } from '../../src/webview/store/boardStore';
import type { BoardState } from '../../src/shared/model';

const setState = (patch: (s: BoardState) => Partial<BoardState>) => {
  const s = useBoardStore.getState().state!;
  useBoardStore.setState({ state: { ...s, ...patch(s) } });
};

const skillItem: HarnessItem = {
  kind: 'skill',
  scope: 'project',
  name: 'revisao-de-codigo',
  description: 'Revisa código e aponta riscos',
  path: '/abs/.claude/skills/revisao-de-codigo/SKILL.md',
  location: '.claude/skills/revisao-de-codigo/SKILL.md',
  layout: 'skills',
};
const mcpItem: HarnessItem = {
  kind: 'mcp',
  scope: 'project',
  name: 'github',
  description: '',
  path: '/abs/.mcp.json',
  location: '.mcp.json',
  layout: 'entry',
};

beforeEach(async () => {
  await seedBoard();
  setState((s) => ({
    board: { ...s.board, aiTool: 'claude' },
    harness: {
      ...s.harness,
      agents: [],
      library: undefined,
      inventory: [{ tool: 'claude', installed: true, items: [skillItem, mcpItem] }],
    },
    harnessSelection: [
      { kind: 'skill', location: skillItem.location, usage: 'contextual' },
      { kind: 'mcp', location: '.mcp.json#github', usage: 'contextual' },
    ],
  }));
  posted.mockClear();
});

const next = () => userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
const catalog = () => useBoardStore.getState().state!.board.modelCatalog;

describe('assistente "Criar agente com ajuda"', () => {
  it('percorre os 7 passos, com exemplo e sugestão em cada um, e só grava no último', async () => {
    const closed: string[] = [];
    renderThemed(<AgentWizard tool={baseInfo('claude')} onClose={() => closed.push('x')} />);

    // 1. diretriz: sem resposta não segue; o exemplo de resposta aparece
    expect(screen.getByText('Passo 1 de 7')).toBeInTheDocument();
    expect(screen.getByText(/Revisa o diff de uma branch antes do pull request e aponta bugs, sem alterar nada\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled();
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Diretriz' }),
      'Revisa o diff de uma branch antes do pull request e aponta bugs, sem alterar nada.',
    );
    await next();

    // 2. ferramentas: o mínimo da diretriz vem marcado, com o porquê, e a lista completa continua à mostra
    expect(screen.getByText('Passo 2 de 7')).toBeInTheDocument();
    expect(screen.getByText('Sugestão para o que você descreveu')).toBeInTheDocument();
    expect(screen.getByText('lê os arquivos do projeto')).toBeInTheDocument();
    for (const name of ['Read', 'Grep', 'Glob', 'Bash']) expect(screen.getByRole('checkbox', { name })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Edit' })).not.toBeChecked();
    expect(screen.getByText(/Estas escolhas ampliam o escopo do agente: Bash\./)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'WebSearch' }));
    expect(screen.getByText(/ampliam o escopo do agente: Bash, WebSearch\./)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'WebSearch' }));
    await next();

    // 3. servidores MCP: o do board vai sempre; os outros do board são opções
    expect(screen.getByText('O servidor do board vai sempre, sem marcar.')).toBeInTheDocument();
    await next();

    // 4. skills: a ligada à diretriz vem sugerida
    expect(screen.getByText('Sugeridas pela diretriz')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'revisao-de-codigo' }));
    await next();

    // 5. modelo: o menor do catálogo para leitura
    const light = suggestAgentModel('light', catalog(), 'claude')!;
    expect(screen.getByText(/^Sugestão:/)).toBeInTheDocument();
    await next();

    // 6. instruções: o rascunho sai das respostas
    const body = screen.getByRole('textbox', { name: 'Instruções' }) as HTMLTextAreaElement;
    expect(body.value).toContain('## Como trabalha');
    expect(body.value).toContain('Nunca altere nem crie arquivos.');
    expect(body.value).toContain('Siga as skills revisao-de-codigo');
    await userEvent.type(screen.getByRole('textbox', { name: 'Padrões e comandos do projeto' }), 'Use git diff main...HEAD');
    expect(body.value).toContain('- Use git diff main...HEAD');
    await next();

    // 7. resumo: nada foi gravado até aqui
    expect(sentOf('harness.agent.create')).toHaveLength(0);
    expect(screen.getByText('Passo 7 de 7')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Nome' })).toHaveValue('revisa-diff-branch-antes');
    expect(screen.getByText('faz-ai')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Criar agente' }));
    const sent = lastSent('harness.agent.create');
    expect(sent).not.toHaveProperty('scope');
    expect(sent.input).not.toHaveProperty('tool');
    expect(sent.input).toMatchObject({
      name: 'revisa-diff-branch-antes',
      description: 'Revisa o diff de uma branch antes do pull request e aponta bugs, sem alterar nada.',
      model: light.value,
      tools: ['Read', 'Grep', 'Glob', 'Bash'],
      deniedTools: [],
      skills: ['revisao-de-codigo'],
      mcp: [],
    });
    expect(sent.input.body).toContain('- Use git diff main...HEAD');
    expect(sent.input).not.toHaveProperty('readonly');
    expect(closed).toEqual(['x']);
  });

  it('Voltar mantém as respostas, o nome é editável e validado, e Cancelar não grava nada', async () => {
    setState((s) => ({
      harness: { ...s.harness, agents: [{ name: 'revisor', scope: 'user', location: '~/.claude/agents/revisor.md' } as never] },
    }));
    const closed: string[] = [];
    renderThemed(<AgentWizard tool={baseInfo('claude')} onClose={() => closed.push('x')} />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Diretriz' }), 'Revisa tudo');
    for (let i = 0; i < 6; i++) await next();
    const name = screen.getByRole('textbox', { name: 'Nome' });
    expect(name).toHaveValue('revisa-tudo');
    await userEvent.clear(name);
    await userEvent.type(name, 'Revisor');
    expect(name).toHaveValue('revisor');
    expect(screen.getByText('Nome inválido ou já usado.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Criar agente' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(screen.getByText('Passo 6 de 7')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(closed).toEqual(['x']);
    expect(sentOf('harness.agent.create')).toHaveLength(0);
  });

  it('uma sugestão pronta abre o assistente com as respostas feitas, para ajustar e confirmar', async () => {
    const reviewer = AGENT_SUGGESTIONS[0]!;
    renderThemed(<AgentWizard tool={baseInfo('claude')} preset={reviewer} onClose={() => {}} />);
    expect(screen.getByRole('textbox', { name: 'Diretriz' })).toHaveValue(reviewer.directive);
    await next();
    for (const name of reviewer.tools) expect(screen.getByRole('checkbox', { name })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Edit' })).not.toBeChecked();
    for (let i = 0; i < 5; i++) await next();
    expect(screen.getByRole('textbox', { name: 'Nome' })).toHaveValue('revisor');
    await userEvent.click(screen.getByRole('button', { name: 'Criar agente' }));
    expect(lastSent('harness.agent.create').input).toMatchObject({
      name: 'revisor',
      tools: reviewer.tools,
      body: reviewer.instructions,
      model: suggestAgentModel('light', catalog(), 'claude')!.value,
    });
  });

  it('no Cursor o passo das ferramentas vira somente leitura, e skills e MCP avisam que o arquivo não os aceita', async () => {
    setState((s) => ({ board: { ...s.board, aiTool: 'cursor' } }));
    renderThemed(<AgentWizard tool={baseInfo('cursor')} onClose={() => {}} />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Diretriz' }), 'Revisa o código e aponta problemas');
    await next();
    expect(screen.queryByRole('checkbox', { name: 'Read' })).toBeNull();
    // pela diretriz o agente só lê: a sugestão já vem marcada
    expect(screen.getByRole('checkbox', { name: 'Somente leitura' })).toBeChecked();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Em segundo plano' }));
    await next();
    expect(screen.getByText(/Cursor não aceita servidores MCP por agente/)).toBeInTheDocument();
    await next();
    expect(screen.getByText(/Cursor não aceita skills por agente/)).toBeInTheDocument();
    for (let i = 0; i < 3; i++) await next();
    await userEvent.click(screen.getByRole('button', { name: 'Criar agente' }));
    expect(lastSent('harness.agent.create').input).toMatchObject({
      tools: [],
      skills: [],
      mcp: [],
      readonly: true,
      background: true,
    });
  });
});

describe('Sugestões prontas e o botão do assistente na tabela de agentes', () => {
  it('"Criar agente com ajuda" abre o assistente limpo; cada sugestão pronta o abre preenchido; o botão da IA continua', async () => {
    renderThemed(<AgentsTable tool={baseInfo('claude')} scope="user" />);
    expect(screen.getByRole('button', { name: 'Sugerir agentes com IA' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Criar agente com ajuda' }));
    expect(screen.getByRole('textbox', { name: 'Diretriz' })).toHaveValue('');
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('textbox', { name: 'Diretriz' })).toBeNull();

    const ready = screen.getByRole('group', { name: 'Sugestões prontas' });
    for (const s of AGENT_SUGGESTIONS) expect(ready).toHaveTextContent(s.label);
    await userEvent.click(screen.getByRole('button', { name: 'Escritor de testes' }));
    expect(screen.getByRole('textbox', { name: 'Diretriz' })).toHaveValue(AGENT_SUGGESTIONS[1]!.directive);
    // trocar de sugestão recomeça o assistente
    await userEvent.click(screen.getByRole('button', { name: 'Redator de documentação' }));
    expect(screen.getByRole('textbox', { name: 'Diretriz' })).toHaveValue(AGENT_SUGGESTIONS[2]!.directive);
    expect(screen.getAllByRole('textbox', { name: 'Diretriz' })).toHaveLength(1);
  });
});
