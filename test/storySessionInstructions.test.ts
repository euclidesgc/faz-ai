import { describe, expect, it } from 'vitest';
import { FLOW_SKILL_NAME } from '../src/shared/harnessProject';
import { flowSkillMarkdown, STORY_SESSION_FLOW_BODY } from '../src/extension/flowSkill';
import { STORY_SESSION_ADVICE, STORY_SESSION_NATIVE_DELEGATION_ADVICE } from '../src/extension/unitAdvice';
import { replyPrompt } from '../src/extension/runner';

describe('persistent Story delegation instructions', () => {
  it('selects a dedicated flow skill body without changing traditional flow text', () => {
    const traditional = flowSkillMarkdown(FLOW_SKILL_NAME)!;
    const session = flowSkillMarkdown(FLOW_SKILL_NAME, 'story-session')!;
    expect(traditional).not.toContain('Todo trabalho especializado é executado por uma filha nativa');
    expect(session).toContain('Todo trabalho especializado é executado por uma filha nativa');
    expect(session).toContain('não oferece isolamento por subtarefa');
    expect(session).not.toContain('Não execute sub-tarefas, nem por subagente');
    expect(STORY_SESSION_FLOW_BODY).toContain('fechamento técnico');
  });

  it('provides explicit native delegation advice alongside the unchanged traditional advice', () => {
    expect(STORY_SESSION_ADVICE).toContain('Não execute sub-tarefas');
    expect(STORY_SESSION_NATIVE_DELEGATION_ADVICE).toContain('todo trabalho especializado deve ser feito por uma filha nativa');
    expect(STORY_SESSION_NATIVE_DELEGATION_ADVICE).toContain('não isolamento por subtarefa');
    expect(STORY_SESSION_NATIVE_DELEGATION_ADVICE).not.toContain('Não execute sub-tarefas');
  });

  it('keeps story replies as coordination without prohibiting the next native child', () => {
    const pilot = replyPrompt('#1', undefined, [], false, false, true);
    expect(pilot).toContain('o board reservará a próxima unidade');
    expect(pilot).not.toContain('Não execute sub-tarefas, nem por subagente');
    expect(replyPrompt('#1')).toContain('Não execute sub-tarefas, nem por subagente');
    expect(replyPrompt('#1', undefined, [], false, false, true, '#2')).toContain('A pessoa escreveu na conversa do card #2');
  });
});
