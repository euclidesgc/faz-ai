import { describe, expect, it } from 'vitest';
import { FLOW_SKILL, FLOW_SKILLS, FLOW_SKILL_NAMES, flowSkillMarkdown, isFlowSkill } from '../src/extension/flowSkill';
import { FLOW_TEXT } from './flowSkillText';
import { SUBTASKS_NOW_NOTE } from '../src/extension/mcp/format';

describe('conjunto de skills do fluxo (#588)', () => {
  it('explica o valor por perfil, sem lista fixa de CLIs', () => {
    const harness = FLOW_SKILLS.find((k) => k.name === 'faz-ai-harness-do-card')!;
    expect(harness.body).toContain('<perfil>:<modelo>@<esforço>');
    expect(harness.body).toContain('perfil de CLI do board');
    expect(harness.body).not.toMatch(/claude, cursor (ou|e) kimi/i);
  });
  it('fala do perfil de CLI da execução e do perfil padrão, sem mandar trocar de CLI', () => {
    const harness = FLOW_SKILLS.find((k) => k.name === 'faz-ai-harness-do-card')!;
    expect(harness.body).toContain('perfil de CLI da execução');
    expect(harness.body).toContain('perfil padrão');
    expect(harness.body).toContain('Você não troca de CLI');
    expect(FLOW_TEXT).not.toMatch(/ferramenta do board/i);
  });
  it('a skill do harness explica cliLoads sem prometer contexto vazio sem prova', () => {
    const harness = FLOW_SKILLS.find((k) => k.name === 'faz-ai-harness-do-card')!;
    expect(harness.body).toContain('execution.cliLoads');
    expect(harness.body).toContain('contextEnforced');
    expect(harness.body).toContain('Lista vazia não prova isolamento');
  });
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

  it('a principal explica a trilha curta: Baixo ou Bug vai do Discovery ao Plan, o esforço sobe com update_card e move_card força a trilha completa', () => {
    expect(FLOW_SKILL.body).toContain('Trilha curta');
    expect(FLOW_SKILL.body).toContain('direto ao Plan');
    expect(FLOW_SKILL.body).toContain('`update_card`');
    expect(FLOW_SKILL.body).toContain('força a trilha completa');
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

describe('fluxo servido pelo get_skill (#643)', () => {
  it('requiredSkills sem path e a seção "Skills por assunto" mandam ler com get_skill', () => {
    expect(FLOW_SKILL.body).toContain('sem `path`');
    expect(FLOW_SKILL.body).toContain('`get_skill <nome>`');
    expect(FLOW_SKILL.body).toContain('Leia com `get_skill <nome>`');
    const harness = FLOW_SKILLS.find((k) => k.name === 'faz-ai-harness-do-card')!;
    expect(harness.body).toContain('sem `path`');
    expect(harness.body).toContain('`get_skill <nome>`');
  });

  it('o texto não cita ferramenta, pastas de skills nem "contexto vazio"', () => {
    for (const k of FLOW_SKILLS) {
      expect(k.body).not.toMatch(/\.claude|\.cursor|\.kimi-code|Agent tool/);
      expect(k.body).not.toContain('contexto vazio');
    }
  });

  it('isFlowSkill confere a lista exata, não o prefixo', () => {
    expect(FLOW_SKILL_NAMES).toEqual(FLOW_SKILLS.map((k) => k.name));
    expect(isFlowSkill('faz-ai-fluxo')).toBe(true);
    expect(isFlowSkill('faz-ai-modo-autonomo')).toBe(true);
    expect(isFlowSkill('faz-ai-deploy')).toBe(false);
    expect(flowSkillMarkdown('faz-ai-deploy')).toBeUndefined();
    expect(flowSkillMarkdown('faz-ai-fluxo')).toContain('name: faz-ai-fluxo');
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
