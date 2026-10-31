import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { dropOuterRunGitConfig } from '../../evals/lib/outerRun';
import { createKit } from '../../src/extension/commitTrailers';

const tmp: string[] = [];
const mk = (): string => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-outer-'));
  tmp.push(d);
  return d;
};
afterEach(() => {
  for (const d of tmp.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function cleanEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('GIT_') || k.startsWith('FAZ_AI_')) delete env[k];
  env.GIT_CONFIG_GLOBAL = os.devNull;
  env.GIT_CONFIG_NOSYSTEM = '1';
  return env;
}

describe('dropOuterRunGitConfig', () => {
  it('tira o par do board e as variáveis da execução, e deixa os pares da pessoa', () => {
    const env: Record<string, string | undefined> = {
      GIT_CONFIG_COUNT: '2',
      GIT_CONFIG_KEY_0: 'user.name',
      GIT_CONFIG_VALUE_0: 'Pessoa',
      GIT_CONFIG_KEY_1: 'core.hooksPath',
      GIT_CONFIG_VALUE_1: '/kit',
      FAZ_AI_GIT_CONFIG_COUNT: '1',
      FAZ_AI_TRAILER_CARD: '#7',
      FAZ_AI_TRAILER_PHASE: 'Implementação',
      FAZ_AI_TRAILER_RUN: 'r1',
    };
    expect(dropOuterRunGitConfig(env)).toBe(true);
    expect(env).toEqual({ GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'user.name', GIT_CONFIG_VALUE_0: 'Pessoa' });
  });

  it('sem pares da pessoa, some com GIT_CONFIG_COUNT', () => {
    const env: Record<string, string | undefined> = {
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'core.hooksPath',
      GIT_CONFIG_VALUE_0: '/kit',
      FAZ_AI_GIT_CONFIG_COUNT: '0',
    };
    expect(dropOuterRunGitConfig(env)).toBe(true);
    expect(env).toEqual({});
  });

  it('não mexe fora de uma execução, nem quando o par do board não é o último', () => {
    const none: Record<string, string | undefined> = {
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'core.hooksPath',
      GIT_CONFIG_VALUE_0: '/x',
    };
    expect(dropOuterRunGitConfig(none)).toBe(false);
    expect(none.GIT_CONFIG_COUNT).toBe('1');
    const shifted: Record<string, string | undefined> = {
      GIT_CONFIG_COUNT: '3',
      GIT_CONFIG_KEY_0: 'core.hooksPath',
      GIT_CONFIG_VALUE_0: '/kit',
      FAZ_AI_GIT_CONFIG_COUNT: '0',
    };
    expect(dropOuterRunGitConfig(shifted)).toBe(false);
    expect(shifted.GIT_CONFIG_COUNT).toBe('3');
  });

  it('com o kit de fora e o do board do eval, o git da história não trava', () => {
    const root = mk();
    const outer = createKit({ card: 1234, phase: 'Implementação', runId: 'fora' }, root);
    const inner = createKit({ card: 1, phase: 'Implementação', runId: 'dentro' }, root);
    try {
      let env = cleanEnv();
      env = { ...env, ...outer.env(env) };
      dropOuterRunGitConfig(env);
      env = { ...env, ...inner.env(env) };
      const repo = path.join(root, 'repo');
      fs.mkdirSync(repo);
      fs.writeFileSync(path.join(repo, 'a.txt'), 'x');
      const git = (args: string[]) => spawnSync('git', args, { cwd: repo, env, encoding: 'utf8', timeout: 10_000 });
      for (const args of [
        ['init', '-q', '-b', 'main'],
        ['add', '-A'],
        ['-c', 'user.name=t', '-c', 'user.email=t@t.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'Estado inicial'],
        ['switch', '-q', '-c', 'feat'],
      ]) {
        const r = git(args);
        expect(r.error, `git ${args.join(' ')}`).toBeUndefined();
        expect(r.status, `git ${args.join(' ')}: ${r.stderr}`).toBe(0);
      }
      expect(git(['log', '-1', '--format=%(trailers:key=Faz-AI-Run,valueonly)']).stdout.trim()).toBe('dentro');
    } finally {
      outer.dispose();
      inner.dispose();
    }
  });
});
