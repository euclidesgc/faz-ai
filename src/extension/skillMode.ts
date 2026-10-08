import * as fs from 'node:fs';
import type { SkillMode } from '../shared/harness';

/**
 * Como se desliga a invocação automática de uma skill (documentação lida em 2026-10-02): no Claude Code
 * e no Cursor, `disable-model-invocation: true` no frontmatter do SKILL.md; a documentação das duas diz
 * que a descrição da skill sai do contexto.
 */
const FRONTMATTER_KEY = /^(disable-model-invocation|disableModelInvocation|disable_model_invocation):\s*(\S+)\s*$/m;
const HEAD_BYTES = 8192;

function read(file: string, bytes?: number): string {
  try {
    const text = fs.readFileSync(file, 'utf8');
    return bytes ? text.slice(0, bytes) : text;
  } catch {
    return '';
  }
}

const frontmatter = (text: string) => /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);

export function skillMode(skillMd: string): SkillMode {
  const fm = frontmatter(read(skillMd, HEAD_BYTES))?.[1] ?? '';
  return FRONTMATTER_KEY.exec(fm)?.[2] === 'true' ? 'manual' : 'auto';
}

function setFrontmatter(skillMd: string, mode: SkillMode): void {
  const text = read(skillMd);
  const fm = frontmatter(text);
  if (!fm) {
    if (mode === 'manual') fs.writeFileSync(skillMd, `---\ndisable-model-invocation: true\n---\n\n${text}`);
    return;
  }
  const lines = fm[1]!.split(/\r?\n/).filter((l) => !FRONTMATTER_KEY.test(l));
  if (mode === 'manual') lines.push('disable-model-invocation: true');
  fs.writeFileSync(skillMd, `---\n${lines.join('\n')}\n---${text.slice(fm[0].length)}`);
}

export function setSkillMode(skillMd: string, mode: SkillMode): void {
  if (!fs.existsSync(skillMd)) throw new Error('SKILL.md não encontrado.');
  setFrontmatter(skillMd, mode);
}
