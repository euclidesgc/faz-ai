import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findFlowSkillCopies } from '../src/extension/flowSkillCopies';

const tmps: string[] = [];
const tmp = (): string => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-copy-'));
  tmps.push(d);
  return d;
};
afterEach(() => {
  for (const d of tmps.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});
const put = (base: string, rel: string, text = 'x'): string => {
  const file = path.join(base, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
};

describe('cópias antigas da skill do fluxo', () => {
  it('sem cópia, lista vazia', () => {
    expect(findFlowSkillCopies({ projectDir: tmp(), homeDir: tmp() })).toEqual([]);
  });
  it('acha no projeto e no usuário, em qualquer ferramenta, e não altera o arquivo', () => {
    const project = tmp();
    const home = tmp();
    const a = put(project, '.claude/skills/faz-ai-fluxo/SKILL.md', 'antiga');
    const b = put(home, '.cursor/skills/faz-ai-fluxo/SKILL.md');
    const c = put(home, '.kimi-code/skills/faz-ai-fluxo/SKILL.md');
    put(home, '.claude/skills/outra/SKILL.md');
    expect(findFlowSkillCopies({ projectDir: project, homeDir: home })).toEqual([a, b, c]);
    expect(fs.readFileSync(a, 'utf8')).toBe('antiga');
  });
});
