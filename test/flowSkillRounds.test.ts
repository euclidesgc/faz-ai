import { describe, expect, it } from 'vitest';
import { FLOW_TEXT } from './flowSkillText';
import { SUBTASKS_NOW_NOTE } from '../src/extension/mcp/format';
import { MCP_INSTRUCTIONS } from '../src/extension/mcp/server';

// As rodadas da Implementação, como a skill do fluxo e a nota de `subtasksNow` no get_card as ensinam.

const implementacao = FLOW_TEXT.slice(FLOW_TEXT.indexOf('## Sub-tarefas de implementação'), FLOW_TEXT.indexOf('## Homologação'));

describe('rodadas da Implementação', () => {
  it('a skill diz que o board executa as sub-tarefas e que a sessão cria, descreve e para; withPerson não é do board', () => {
    expect(implementacao).toMatch(/o \*\*board\*\* executa as sub-tarefas/);
    expect(implementacao).toMatch(/Depois\s+\*\*pare\*\*/);
    expect(implementacao).toContain('byBoard');
    expect(implementacao).toContain('withPerson');
    expect(implementacao).toMatch(/uma vez\*\*, para o fechamento/);
  });

  it('nenhum texto que a IA lê manda executar sub-tarefa pela ferramenta Agent ou por subagente', () => {
    expect(implementacao).toMatch(/nem por subagente/);
    expect(implementacao).not.toMatch(/delegue[^.]*subagente/i);
    expect(SUBTASKS_NOW_NOTE).toMatch(/nem por subagente/);
    expect(SUBTASKS_NOW_NOTE).not.toMatch(/delegue/i);
    expect(MCP_INSTRUCTIONS).not.toMatch(/delegue/i);
  });

  it('a skill só manda testar e fazer commit quando a permissão inclui o terminal', () => {
    expect(implementacao).toMatch(/sem terminal|não pode rodar comandos/i);
    expect(implementacao).toMatch(/quem tem permissão/);
  });

  it('a nota das rodadas no get_card diz o que o board executa, que a sessão cria e para, e aponta a skill', () => {
    expect(SUBTASKS_NOW_NOTE).toContain('withPerson');
    expect(SUBTASKS_NOW_NOTE).toMatch(/não são suas/);
    expect(SUBTASKS_NOW_NOTE).toContain('byBoard');
    expect(SUBTASKS_NOW_NOTE).toMatch(/crie-as e pare/);
    expect(SUBTASKS_NOW_NOTE).toContain('faz-ai-implementacao-rodadas');
  });
});

describe('pendências com a pessoa', () => {
  it('a skill nunca deixa uma pendência só num comentário: entrega com request_review e pending; no modo autônomo decide e segue', () => {
    expect(FLOW_TEXT).toContain('## Pendências com a pessoa');
    expect(FLOW_TEXT).toMatch(/nunca fica só num\s+comentário/);
    expect(FLOW_TEXT).toContain('## Ao fechar uma fase ou sub-tarefa');
    expect(FLOW_TEXT).toContain('**Travado em mim**');
    expect(FLOW_TEXT).toMatch(/"Travado em mim" tiver qualquer item[\s\S]*`request_review`[\s\S]*`pending`/);
    const yolo = FLOW_TEXT.slice(FLOW_TEXT.indexOf('## Modo autônomo'), FLOW_TEXT.length);
    expect(yolo).toMatch(/`request_review` com\s+`pending` não segura o card no modo autônomo/);
    expect(yolo).toContain('`ask_questions` é aceita');
    expect(yolo).toContain('Perguntas e respostas');
    expect(yolo).not.toContain('Perguntas para você');
    expect(MCP_INSTRUCTIONS).toContain('request_review e `pending`');
    expect(MCP_INSTRUCTIONS).toContain('ask_questions');
    expect(FLOW_TEXT).not.toContain('R.** >');
    expect(MCP_INSTRUCTIONS).toContain('No modo autônomo nada disso segura o card');
  });
});

describe('fases do fluxo na skill', () => {
  const section = (from: string, to: string) => FLOW_TEXT.slice(FLOW_TEXT.indexOf(from), FLOW_TEXT.indexOf(to));

  it('a história pode começar numa fase adiante, sem os documentos anteriores', () => {
    expect(section('## Trabalhar num card', '## Pendências com a pessoa')).toMatch(/fase adiante[\s\S]*sem criar os documentos que faltam/);
  });

  it('o Plan recorta em partes fáceis de revisar e divide em histórias derivadas o que passar de umas 400 linhas', () => {
    const plan = section('## Sub-tarefas de implementação', '## Ao fechar uma fase');
    expect(plan).toMatch(/revisada\s+sozinha/);
    expect(plan).toMatch(/Recortar por camada/);
    expect(plan).toMatch(/400[\s\S]*`derived_from`/);
  });

  it('o pull request explica objetivo, como revisar e as decisões, além do roteiro de testes', () => {
    const homologacao = section('## Homologação', '## Modo autônomo');
    for (const part of ['**Objetivo**', '**O que foi feito**', '**Como revisar**', '**Decisões**', '**Como testar**'])
      expect(homologacao).toContain(part);
    expect(homologacao).toMatch(/alternativas descartadas com o motivo/);
  });

  it('no modo autônomo a IA segue os padrões do projeto e escolhe o caminho menos complexo', () => {
    const yolo = FLOW_TEXT.slice(FLOW_TEXT.indexOf('## Modo autônomo'));
    expect(yolo).toMatch(/padrões do projeto/);
    expect(yolo).toMatch(/menos complexo/);
  });
});

describe('base do pull request (#462)', () => {
  it('a skill manda abrir o pull request com --base em workspace.prBase: Homologação, prepare_workspace e pilha do modo autônomo', () => {
    const body = FLOW_TEXT;
    const homologacao = body.slice(body.indexOf('## Homologação'), body.indexOf('## Modo autônomo'));
    expect(homologacao).toMatch(/`--base` em\s+`workspace.prBase`/);
    expect(homologacao).toContain('gh pr create --base <prBase>');
    const prepare = body.slice(
      body.indexOf('chame `prepare_workspace` na história'),
      body.indexOf('Na Implementação, o **board** executa'),
    );
    expect(prepare).toMatch(/base do fluxo[\s\S]*`workspace.prBase`/);
    const yolo = body.slice(body.indexOf('## Modo autônomo'), body.length);
    // a pilha mantém o baseBranch da anterior e abre o PR com a base dela
    expect(yolo).toMatch(/`workspace.baseBranch`[\s\S]*`--base` em `workspace.prBase`/);
  });
});

describe('Revisão antes do pull request', () => {
  it('a skill manda checar, revisar com o revisor-de-codigo, corrigir o que tem diretriz e perguntar o ambíguo', () => {
    const revisao = FLOW_TEXT.slice(FLOW_TEXT.indexOf('## Revisão'), FLOW_TEXT.indexOf('## Homologação'));
    expect(revisao).toMatch(/checagens do projeto/);
    expect(revisao).toContain('revisor-de-codigo');
    expect(revisao).toMatch(/só passa no teste/);
    expect(revisao).toMatch(/diretriz clara[\s\S]*corrige agora/);
    expect(revisao).toMatch(/ambíguo[\s\S]*`ask_questions`[\s\S]*modo autônomo[\s\S]*menos complexo/);
  });
});
