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

describe('aviso de conflito com a base (#747)', () => {
  const workspace = FLOW_SKILLS.find((k) => k.name === 'faz-ai-workspace-e-pr')!;

  it('a skill da pasta de trabalho diz como tratar o aviso antes do PR, sem rebase nem push forçado', () => {
    expect(workspace.body).toContain('Se a conversa trouxer o aviso de que a branch tem conflito com a base');
    expect(workspace.body).toContain('trate antes de abrir o pull request');
    expect(workspace.body).toContain('`git merge origin/<base>`, resolva os conflitos, rode as checagens');
    expect(workspace.body).toContain('no\nmodo autônomo, `block_card` com o motivo');
    expect(workspace.body).toContain('o conflito é do board');
    expect(workspace.description).toContain('aviso de conflito com a base');
  });

  it('a principal aponta a skill também para o aviso de conflito', () => {
    expect(FLOW_SKILL.body).toContain('a pilha e o aviso de conflito com a base');
  });
});

describe('skill do fluxo e as pastas das ferramentas (RF23)', () => {
  it('nenhum texto manda criar skill, regra ou agente na pasta da ferramenta', () => {
    for (const k of FLOW_SKILLS) {
      const text = `${k.description}\n${k.body}`;
      expect(text).not.toMatch(/\.claude\/|\.cursor\/|\.kimi-code\//);
      expect(text).not.toMatch(/arquivo (de|da) (skill|regra|agente)[^.\n]*pasta d[ae] ferramenta/i);
    }
  });
});
