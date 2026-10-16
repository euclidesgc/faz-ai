import { describe, expect, it } from 'vitest';
import { FLOW_SKILL, FLOW_SKILLS } from '../src/extension/flowSkill';
import { SUBTASKS_NOW_NOTE } from '../src/extension/mcp/format';

describe('conjunto de skills do fluxo (#588)', () => {
  it('a principal vem primeiro, os nomes não se repetem e cada skill tem descrição e corpo', () => {
    expect(FLOW_SKILLS[0]).toBe(FLOW_SKILL);
    const names = FLOW_SKILLS.map((k) => k.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(
      expect.arrayContaining([
        'faz-ai-harness-do-card',
        'faz-ai-workspace-e-pr',
        'faz-ai-implementacao-rodadas',
        'faz-ai-revisao-e-homologacao',
        'faz-ai-modo-autonomo',
      ]),
    );
    for (const k of FLOW_SKILLS) {
      expect(k.description.length).toBeGreaterThan(20);
      expect(k.body.length).toBeGreaterThan(100);
    }
  });

  it('a principal aponta cada skill por assunto, e a nota das rodadas aponta a das rodadas', () => {
    for (const k of FLOW_SKILLS.slice(1)) expect(FLOW_SKILL.body).toContain(k.name);
    expect(SUBTASKS_NOW_NOTE).toContain('faz-ai-implementacao-rodadas');
  });

  it('a principal manda partir do mapa do código e pede os arquivos de cada sub-tarefa', () => {
    expect(FLOW_SKILL.body).toContain('Mapa do código');
    expect(FLOW_SKILL.body).toContain('os arquivos que ela vai tocar');
    expect(FLOW_SKILL.body).not.toContain('code-review-graph');
  });
});
