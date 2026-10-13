import { describe, expect, it } from 'vitest';
import { FLOW_SKILL } from '../src/extension/flowSkill';
import { SUBTASKS_NOW_NOTE } from '../src/extension/mcp/format';
import { MCP_INSTRUCTIONS } from '../src/extension/mcp/server';

// As rodadas da Implementação, como a skill do fluxo e a nota de `subtasksNow` no get_card as ensinam.

const implementacao = FLOW_SKILL.body.slice(
  FLOW_SKILL.body.indexOf('## Sub-tarefas de implementação'),
  FLOW_SKILL.body.indexOf('## Homologação'),
);

describe('rodadas da Implementação', () => {
  it('a skill para quando as sub-tarefas restantes estão com a pessoa, em vez de repetir até não sobrar nenhuma em aberto', () => {
    expect(implementacao).not.toContain('até não sobrar\nnenhuma em aberto');
    expect(implementacao).toMatch(/possa tocar agora/);
    expect(implementacao).toContain('withPerson');
    expect(implementacao).toMatch(/com a pessoa[^.]*pare/);
  });

  it('a skill só manda testar e fazer commit quando a permissão inclui o terminal', () => {
    expect(implementacao).toMatch(/sem terminal|não pode rodar comandos/i);
    expect(implementacao).toMatch(/quem tem permissão/);
  });

  it('a nota das rodadas no get_card repete a regra de parada e a condição da permissão', () => {
    expect(SUBTASKS_NOW_NOTE).toMatch(/possa tocar agora/);
    expect(SUBTASKS_NOW_NOTE).toContain('withPerson');
    expect(SUBTASKS_NOW_NOTE).toMatch(/com a pessoa, pare/);
    expect(SUBTASKS_NOW_NOTE).toMatch(/quem tem permissão/);
    expect(SUBTASKS_NOW_NOTE).toMatch(/mesma mensagem[\s\S]*sem fazer commit/);
  });
});

describe('pendências com a pessoa', () => {
  it('a skill nunca deixa uma pendência só num comentário: entrega com request_review e pending, mesmo em modo autônomo', () => {
    expect(FLOW_SKILL.body).toContain('## Pendências com a pessoa');
    expect(FLOW_SKILL.body).toMatch(/nunca fica só num\s+comentário/);
    expect(FLOW_SKILL.body).toContain('## Ao fechar uma fase ou sub-tarefa');
    expect(FLOW_SKILL.body).toContain('**Travado em mim**');
    expect(FLOW_SKILL.body).toMatch(/"Travado em mim" tiver qualquer item[\s\S]*`request_review`[\s\S]*`pending`/);
    const yolo = FLOW_SKILL.body.slice(FLOW_SKILL.body.indexOf('## Modo autônomo'), FLOW_SKILL.body.indexOf('## Quando parar'));
    expect(yolo).toMatch(/`request_review` com\s+`pending`/);
    expect(yolo).toContain('mesmo em modo autônomo');
    expect(MCP_INSTRUCTIONS).toContain('request_review e `pending`');
  });
});

describe('fases do fluxo na skill', () => {
  const section = (from: string, to: string) => FLOW_SKILL.body.slice(FLOW_SKILL.body.indexOf(from), FLOW_SKILL.body.indexOf(to));

  it('a história pode começar numa fase adiante, sem os documentos anteriores', () => {
    expect(section('## Trabalhar num card', '## Pendências com a pessoa')).toMatch(/fase adiante[\s\S]*sem criar os documentos que faltam/);
  });

  it('o Plan recorta em partes fáceis de revisar e divide em histórias derivadas o que passar de umas 400 linhas', () => {
    const plan = section('## Sub-tarefas de implementação', '## Ao fechar uma fase');
    expect(plan).toMatch(/fácil de revisar sozinha/);
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
    const yolo = section('## Modo autônomo', '## Quando parar');
    expect(yolo).toMatch(/padrões do projeto/);
    expect(yolo).toMatch(/menos complexo/);
  });
});

describe('Revisão antes do pull request', () => {
  it('a skill manda checar, revisar com o revisor-de-codigo, corrigir o que tem diretriz e perguntar o ambíguo', () => {
    const revisao = FLOW_SKILL.body.slice(FLOW_SKILL.body.indexOf('## Revisão'), FLOW_SKILL.body.indexOf('## Homologação'));
    expect(revisao).toMatch(/checagens do projeto/);
    expect(revisao).toContain('revisor-de-codigo');
    expect(revisao).toMatch(/só passa no teste/);
    expect(revisao).toMatch(/diretriz clara[\s\S]*corrige agora/);
    expect(revisao).toMatch(/ambíguo[\s\S]*`ask_question`[\s\S]*`pending`/);
  });
});
