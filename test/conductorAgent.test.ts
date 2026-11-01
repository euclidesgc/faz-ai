import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { BRIEF_SECTIONS, REQUIRED_BRIEF_SECTIONS } from '../src/shared/subtaskBrief';

describe('agente condutor do board (#1110)', () => {
  it('manda a sub-tarefa levar as seções da descrição, com os títulos de subtaskBrief', () => {
    const text = fs.readFileSync(path.resolve(__dirname, '../.claude/agents/condutor-do-board.md'), 'utf8');
    for (const name of [...REQUIRED_BRIEF_SECTIONS, BRIEF_SECTIONS.decisions]) expect(text).toContain(`\`${name}\``);
    expect(text).toContain('o board confere antes de executar');
  });
});
