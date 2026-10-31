import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CommitTrailers, createKit, hookScripts, supportsConfigEnv, type CommitTrailerKit } from '../src/extension/commitTrailers';

const values = { card: 42, phase: 'Implementação', runId: 'run-abc' };

function cleanEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('GIT_')) delete env[k];
  env.GIT_CONFIG_GLOBAL = os.devNull;
  env.GIT_CONFIG_NOSYSTEM = '1';
  return { ...env, ...extra };
}

let root: string;
let repo: string;
let kit: CommitTrailerKit | undefined;

function git(args: string[], env: NodeJS.ProcessEnv = cleanEnv()): string {
  return execFileSync('git', args, { cwd: repo, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function trailerEnv(k: CommitTrailerKit, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const base = cleanEnv(extra);
  return { ...base, ...k.env(base) };
}

function commit(msg: string, env: NodeJS.ProcessEnv, ...flags: string[]): void {
  git(['commit', '--allow-empty', '-q', '-m', msg, ...flags], env);
}

function trailers(): string {
  return git(['log', '-1', '--format=%(trailers)']);
}

function writeHook(dir: string, name: string, body: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-ct-test-'));
  repo = path.join(root, 'repo');
  fs.mkdirSync(repo);
  git(['init', '-q']);
  git(['config', 'user.name', 'T']);
  git(['config', 'user.email', 't@t']);
  kit = undefined;
});

afterEach(() => {
  kit?.dispose();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('supportsConfigEnv', () => {
  it('aceita 2.31 ou mais nova', () => {
    expect(supportsConfigEnv('git version 2.30.9')).toBe(false);
    expect(supportsConfigEnv('git version 2.31.0')).toBe(true);
    expect(supportsConfigEnv('git version 2.39.3 (Apple Git-146)')).toBe(true);
    expect(supportsConfigEnv('git version 3.0.0')).toBe(true);
    expect(supportsConfigEnv('lixo')).toBe(false);
  });
});

describe('kit.env', () => {
  it('usa o índice 0 sem GIT_CONFIG_COUNT', () => {
    kit = createKit(values, root);
    const env = kit.env({});
    expect(env).toMatchObject({
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'core.hooksPath',
      GIT_CONFIG_VALUE_0: kit.dir,
      FAZ_AI_GIT_CONFIG_COUNT: '0',
      FAZ_AI_TRAILER_CARD: '#42',
      FAZ_AI_TRAILER_PHASE: 'Implementação',
      FAZ_AI_TRAILER_RUN: 'run-abc',
    });
  });

  it('usa o índice 1 com GIT_CONFIG_COUNT=1', () => {
    kit = createKit(values, root);
    const env = kit.env({ GIT_CONFIG_COUNT: '1' });
    expect(env.GIT_CONFIG_COUNT).toBe('2');
    expect(env.GIT_CONFIG_KEY_1).toBe('core.hooksPath');
    expect(env.GIT_CONFIG_VALUE_1).toBe(kit.dir);
    expect(env.FAZ_AI_GIT_CONFIG_COUNT).toBe('1');
    expect(env.GIT_CONFIG_KEY_0).toBeUndefined();
  });

  it('devolve {} com GIT_CONFIG_COUNT inválido', () => {
    kit = createKit(values, root);
    expect(kit.env({ GIT_CONFIG_COUNT: 'abc' })).toEqual({});
    expect(kit.env({ GIT_CONFIG_COUNT: '-1' })).toEqual({});
  });

  it('tira quebras de linha da fase', () => {
    kit = createKit({ ...values, phase: 'A\nB\r\nC' }, root);
    expect(kit.env({}).FAZ_AI_TRAILER_PHASE).not.toMatch(/[\r\n]/);
  });
});

describe('commit com o kit', () => {
  it('traz os três trailers, também com --no-verify', () => {
    kit = createKit(values, root);
    commit('x', trailerEnv(kit));
    expect(trailers()).toBe('Faz-AI-Card: #42\nFaz-AI-Phase: Implementação\nFaz-AI-Run: run-abc\n\n');
    commit('y', trailerEnv(kit), '--no-verify');
    expect(trailers()).toContain('Faz-AI-Run: run-abc');
  });

  it('--amend e mensagem com trailer antigo deixam uma ocorrência de cada', () => {
    kit = createKit(values, root);
    commit('x\n\nFaz-AI-Run: antigo', trailerEnv(kit));
    commit('x\n\nFaz-AI-Run: antigo', trailerEnv(kit), '--amend');
    const out = trailers();
    expect(out.match(/Faz-AI-Run:/g)).toHaveLength(1);
    expect(out.match(/Faz-AI-Card:/g)).toHaveLength(1);
    expect(out).toContain('Faz-AI-Run: run-abc');
    expect(out).not.toContain('antigo');
  });

  it('commit sem o ambiente sai sem Faz-AI-*, e .git/config e .git/hooks não mudam', () => {
    const cfg = () => fs.readFileSync(path.join(repo, '.git', 'config'), 'utf8');
    const hooks = () => fs.readdirSync(path.join(repo, '.git', 'hooks')).sort();
    const cfgBefore = cfg();
    const hooksBefore = hooks();
    kit = createKit(values, root);
    commit('x', trailerEnv(kit));
    commit('y', cleanEnv());
    expect(git(['log', '-1', '--format=%B'])).not.toContain('Faz-AI');
    expect(cfg()).toBe(cfgBefore);
    expect(hooks()).toEqual(hooksBefore);
  });

  it('mantém o par GIT_CONFIG da pessoa', () => {
    kit = createKit(values, root);
    const env = trailerEnv(kit, {
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'user.name',
      GIT_CONFIG_VALUE_0: 'Pessoa',
    });
    commit('x', env);
    expect(git(['log', '-1', '--format=%an'])).toBe('Pessoa\n');
    expect(trailers()).toContain('Faz-AI-Run: run-abc');
  });
});

describe('repasse aos hooks do repositório', () => {
  it('chama o pre-commit de .git/hooks', () => {
    const marker = path.join(root, 'marker1');
    writeHook(path.join(repo, '.git', 'hooks'), 'pre-commit', `echo ran > "${marker}"`);
    kit = createKit(values, root);
    commit('x', trailerEnv(kit));
    expect(fs.existsSync(marker)).toBe(true);
  });

  it('chama o pre-commit de um core.hooksPath local relativo (husky)', () => {
    const marker = path.join(root, 'marker2');
    writeHook(path.join(repo, '.husky', '_'), 'pre-commit', `echo ran > "${marker}"`);
    git(['config', 'core.hooksPath', '.husky/_']);
    kit = createKit(values, root);
    commit('x', trailerEnv(kit));
    expect(fs.existsSync(marker)).toBe(true);
    expect(trailers()).toContain('Faz-AI-Card: #42');
  });

  it('chama o prepare-commit-msg do repositório antes dos trailers', () => {
    writeHook(path.join(repo, '.git', 'hooks'), 'prepare-commit-msg', 'echo "da-repo" >> "$1"');
    kit = createKit(values, root);
    commit('x', trailerEnv(kit));
    const body = git(['log', '-1', '--format=%B']);
    expect(body).toContain('da-repo');
    expect(trailers()).toContain('Faz-AI-Run: run-abc');
  });

  it('pre-commit com exit 1 faz o commit falhar', () => {
    writeHook(path.join(repo, '.git', 'hooks'), 'pre-commit', 'exit 1');
    kit = createKit(values, root);
    expect(() => commit('x', trailerEnv(kit!))).toThrow();
  });

  it('hook original sem bit de execução é ignorado', () => {
    const file = path.join(repo, '.git', 'hooks', 'pre-commit');
    writeHook(path.dirname(file), 'pre-commit', 'exit 1');
    fs.chmodSync(file, 0o644);
    kit = createKit(values, root);
    expect(() => commit('x', trailerEnv(kit!))).not.toThrow();
  });
});

describe('kits aninhados (execução dentro de execução)', () => {
  // o de dentro sobrescreve FAZ_AI_GIT_CONFIG_COUNT; antes, o hook de fora achava a si mesmo e
  // fazia exec em laço, e git init/add/commit travavam
  function nestedEnv(outer: CommitTrailerKit, inner: CommitTrailerKit): NodeJS.ProcessEnv {
    let env = cleanEnv();
    for (const k of Object.keys(env)) if (k.startsWith('FAZ_AI_')) delete env[k];
    env = { ...env, ...outer.env(env) };
    return { ...env, ...inner.env(env) };
  }

  function run(cwd: string, args: string[], env: NodeJS.ProcessEnv) {
    const r = spawnSync('git', args, { cwd, env, encoding: 'utf8', timeout: 10_000 });
    expect(r.error, `git ${args.join(' ')} travou`).toBeUndefined();
    expect(r.status, `git ${args.join(' ')}: ${r.stderr}`).toBe(0);
    return r.stdout;
  }

  it('git init, add, commit e switch não travam, e o commit leva os trailers da execução de dentro', () => {
    const outer = createKit({ card: 1234, phase: 'Implementação', runId: 'fora' }, root);
    const inner = createKit({ card: 7, phase: 'Revisão', runId: 'dentro' }, root);
    try {
      const env = nestedEnv(outer, inner);
      const novo = path.join(root, 'novo');
      fs.mkdirSync(novo);
      fs.writeFileSync(path.join(novo, 'a.txt'), 'x');
      run(novo, ['init', '-q', '-b', 'main'], env);
      run(novo, ['add', '-A'], env);
      run(novo, ['-c', 'user.name=t', '-c', 'user.email=t@t.invalid', 'commit', '-qm', 'Estado inicial'], env);
      run(novo, ['switch', '-q', '-c', 'feat'], env);
      const out = run(novo, ['log', '-1', '--format=%(trailers)'], cleanEnv());
      expect(out).toBe('Faz-AI-Card: #7\nFaz-AI-Phase: Revisão\nFaz-AI-Run: dentro\n\n');
    } finally {
      outer.dispose();
      inner.dispose();
    }
  });

  it('o hook do repositório roda uma vez, pelo kit de fora', () => {
    const marker = path.join(root, 'marker-aninhado');
    writeHook(path.join(repo, '.git', 'hooks'), 'pre-commit', `echo ran >> "${marker}"`);
    const outer = createKit({ card: 1, phase: 'A', runId: 'fora' }, root);
    const inner = createKit({ card: 2, phase: 'B', runId: 'dentro' }, root);
    try {
      run(repo, ['commit', '--allow-empty', '-qm', 'x'], nestedEnv(outer, inner));
      expect(fs.readFileSync(marker, 'utf8')).toBe('ran\n');
      expect(trailers()).toContain('Faz-AI-Run: dentro');
    } finally {
      outer.dispose();
      inner.dispose();
    }
  });

  it('com FAZ_AI_GIT_CONFIG_COUNT apontando para o próprio kit, o hook não entra em laço', () => {
    kit = createKit(values, root);
    const env = { ...trailerEnv(kit), FAZ_AI_GIT_CONFIG_COUNT: '1' };
    run(repo, ['commit', '--allow-empty', '-qm', 'x'], env);
    expect(trailers()).toContain('Faz-AI-Run: run-abc');
  });
});

describe('hookScripts', () => {
  it('não gera hooks de servidor nem fsmonitor', () => {
    const names = Object.keys(hookScripts());
    expect(names).toContain('prepare-commit-msg');
    for (const n of ['pre-receive', 'update', 'post-receive', 'fsmonitor-watchman']) expect(names).not.toContain(n);
  });
});

describe('CommitTrailers.prepare', () => {
  it('git 2.30 devolve null e avisa uma vez', () => {
    const ct = new CommitTrailers({ gitVersion: () => 'git version 2.30.1', tempRoot: root });
    const lines: string[] = [];
    expect(ct.prepare(values, (l) => lines.push(l))).toBeNull();
    expect(ct.prepare(values, (l) => lines.push(l))).toBeNull();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Trailers de rastreio desligados');
  });

  it('git ausente (null) idem', () => {
    const ct = new CommitTrailers({ gitVersion: () => null, tempRoot: root });
    const lines: string[] = [];
    expect(ct.prepare(values, (l) => lines.push(l))).toBeNull();
    expect(ct.prepare(values, (l) => lines.push(l))).toBeNull();
    expect(lines).toHaveLength(1);
  });

  it('tempRoot inexistente devolve null com o motivo', () => {
    const ct = new CommitTrailers({
      gitVersion: () => 'git version 2.39.3',
      tempRoot: path.join(root, 'nao-existe'),
    });
    const lines: string[] = [];
    expect(ct.prepare(values, (l) => lines.push(l))).toBeNull();
    expect(lines[0]).toContain('Trailers de rastreio indisponíveis nesta execução:');
  });

  it('com git bom devolve o kit, e dispose é idempotente', () => {
    const ct = new CommitTrailers({ gitVersion: () => 'git version 2.39.3', tempRoot: root });
    const k = ct.prepare(values, () => undefined);
    expect(k).not.toBeNull();
    expect(fs.existsSync(k!.dir)).toBe(true);
    k!.dispose();
    expect(fs.existsSync(k!.dir)).toBe(false);
    expect(() => k!.dispose()).not.toThrow();
  });
});
