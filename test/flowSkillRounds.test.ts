import { describe, expect, it } from 'vitest';
import { FLOW_SKILL } from '../src/extension/flowSkill';
import { MCP_INSTRUCTIONS } from '../src/extension/mcp/server';

// As rodadas da Implementação, como a skill do fluxo e as instruções do servidor MCP as ensinam.

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

  it('as instruções do servidor repetem a regra de parada e a condição da permissão', () => {
    expect(MCP_INSTRUCTIONS).toMatch(/possa tocar agora/);
    expect(MCP_INSTRUCTIONS).toContain('withPerson');
    expect(MCP_INSTRUCTIONS).toMatch(/quem tem permissão/);
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
