import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { collectClaudeEnvironment } from '../src/extension/ai/environmentEvidence';

let dir: string;
beforeEach(() => (dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-env-'))));
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('environmentEvidence', () => {
  it('pasta ausente é fonte conhecida e estável', () => {
    const a = collectClaudeEnvironment(path.join(dir, 'nao-existe'));
    expect(a.state).toBe('complete');
    expect(collectClaudeEnvironment(path.join(dir, 'nao-existe'))).toEqual(a);
  });
  it('mudar a política muda o digest', () => {
    const before = collectClaudeEnvironment(dir);
    fs.writeFileSync(path.join(dir, 'managed-settings.json'), '{"a":1}');
    const after = collectClaudeEnvironment(dir);
    expect(after).not.toEqual(before);
    fs.mkdirSync(path.join(dir, 'managed-settings.d'));
    fs.writeFileSync(path.join(dir, 'managed-settings.d', '10.json'), '{}');
    expect(collectClaudeEnvironment(dir)).not.toEqual(after);
  });
  it('falha de leitura deixa o ambiente desconhecido', () => {
    fs.mkdirSync(path.join(dir, 'managed-settings.json'));
    expect(collectClaudeEnvironment(dir)).toEqual({ state: 'unknown' });
  });
});
