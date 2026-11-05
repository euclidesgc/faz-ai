// O commit da fase pelo board: a mensagem leva a história, as sub-tarefas e os trailers de rastreio; a pasta sem
// alterações é recusada, e o sha devolvido é o do commit feito.
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { commitPhase, phaseCommitMessage } from '../src/extension/phaseCommit';

const git = (cwd: string, args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-phase-commit-'));
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.email', 'teste@x']);
  git(dir, ['config', 'user.name', 'Teste']);
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'Estado inicial']);
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const input = {
  storyNumber: 7,
  storyTitle: 'Notas ganham etiquetas',
  phase: 'Implementação',
  subtasks: ['Migração v1 → v2', 'addTag e load'],
};

describe('commit da fase pelo board', () => {
  it('a mensagem traz o título da história, as sub-tarefas e os trailers do card e da fase, sem o da run', () => {
    const msg = phaseCommitMessage(input);
    expect(msg.split('\n')[0]).toBe('Notas ganham etiquetas');
    expect(msg).toContain('- Migração v1 → v2');
    expect(msg).toContain('Faz-AI-Card: #7');
    expect(msg).toContain('Faz-AI-Phase: Implementação');
    expect(msg).not.toContain('Faz-AI-Run');
  });

  it('com alterações na pasta (novas e editadas) faz o commit e devolve o sha dele', () => {
    fs.writeFileSync(path.join(dir, 'a.txt'), 'b');
    fs.writeFileSync(path.join(dir, 'novo.js'), 'export const x = 1;');
    const { sha } = commitPhase(dir, input, git);
    expect(git(dir, ['rev-parse', 'HEAD'])).toBe(sha);
    expect(git(dir, ['status', '--porcelain'])).toBe('');
    expect(git(dir, ['log', '-1', '--format=%B'])).toContain('Faz-AI-Card: #7');
    expect(git(dir, ['show', '--stat', '--format=', 'HEAD'])).toContain('novo.js');
  });

  it('sem alterações recusa, sem criar commit', () => {
    const before = git(dir, ['rev-parse', 'HEAD']);
    expect(() => commitPhase(dir, input, git)).toThrow('não tem alterações');
    expect(git(dir, ['rev-parse', 'HEAD'])).toBe(before);
  });
});
