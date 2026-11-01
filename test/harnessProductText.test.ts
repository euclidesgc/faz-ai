import { describe, expect, it } from 'vitest';
import { FLOW_SKILLS } from '../src/extension/flowSkill';
import { harnessOverview } from '../src/extension/mcp/format';
import { boardState } from './fakes/board';
import { FLOW_TEXT } from './flowSkillText';

// O que a IA lê é produto: o texto muda junto com o comportamento. Aqui, as frases da decisão
// "ativo/inativo" (docs/decisoes/biblioteca-de-artefatos-do-board.md).

describe('get_harness: a nota explica ativo e inativo por tipo', () => {
  const note = harnessOverview(boardState()).note;

  it('off é inativo e o tipo decide o que ativo quer dizer', () => {
    expect(note).toContain('`usage` "off" é inativo');
    expect(note).toContain('regra ("always") entra em toda execução');
    expect(note).toContain('skill e agente ("contextual") só no card que os vincula');
    expect(note).toContain('servidor MCP em "always" entra em toda execução');
    expect(note).toContain('`tools` são ids neutros');
  });

  it('não ensina mais os modos antigos nem o campo Rules do card', () => {
    expect(note).not.toContain('campos Rules');
    expect(note).not.toContain('"contextual" (Pelo card)');
  });
});

describe('skill do fluxo: o que o card pode vincular', () => {
  it('Rules sai dos campos do card e a escolha é entre skills e agentes ativos e MCP Pelo card', () => {
    expect(FLOW_TEXT).toContain('os campos Skills e MCPs, o agente');
    expect(FLOW_TEXT).not.toContain('os campos Skills, Rules e MCPs');
    expect(FLOW_TEXT).toContain('só entre as\nskills e os agentes ativos do board');
    expect(FLOW_TEXT).toContain('as regras ativas e os\nservidores em "Sempre" já entram sozinhos, e o inativo não pode ser vinculado');
    expect(FLOW_TEXT).toContain('Uma skill cujas tools o agente não concede');
    expect(FLOW_TEXT).not.toContain('escolha só entre o que está no board em modo "Pelo card"');
  });

  it('nenhuma skill do fluxo ainda manda indicar regra no card', () => {
    for (const k of FLOW_SKILLS) expect(k.body, k.name).not.toMatch(/campos? Rules/);
  });
});
