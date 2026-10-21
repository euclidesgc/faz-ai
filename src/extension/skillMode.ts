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
