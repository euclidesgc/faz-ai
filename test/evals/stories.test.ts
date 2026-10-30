import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadStories, prepareProject, runAcceptance, type ReferenceStory } from '../../evals/lib/stories';

const tmp: string[] = [];
const mk = (): string => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-stories-'));
  tmp.push(d);
  return d;
};
afterEach(() => {
  for (const d of tmp.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const realRoot = path.resolve(__dirname, '../../evals/stories');

function fakeStory(acceptance: { command: string[]; timeoutSeconds: number }, testFile: string): ReferenceStory {
  const dir = mk();
  fs.mkdirSync(path.join(dir, 'repo'));
  fs.mkdirSync(path.join(dir, 'acceptance'));
  fs.writeFileSync(path.join(dir, 'repo', 'a.txt'), 'x');
  fs.writeFileSync(path.join(dir, 'acceptance', 'check.test.js'), testFile);
  return { id: 'f', title: 't', description: 'd', startPhase: 'Plan', timeoutMinutes: 30, acceptance, dir };
}

describe('loadStories', () => {
  it('aplica os padrões', () => {
    const root = mk();
    fs.mkdirSync(path.join(root, 'b'));
    fs.writeFileSync(
      path.join(root, 'b', 'story.json'),
      JSON.stringify({ title: 'T', description: 'D', acceptance: { command: ['node'] } }),
    );
    const [s] = loadStories(root);
    expect(s).toMatchObject({
      id: 'b',
      title: 'T',
      startPhase: 'Plan',
      timeoutMinutes: 30,
      acceptance: { command: ['node'], timeoutSeconds: 120 },
      dir: path.join(root, 'b'),
    });
  });

  it('lê a história slugify e filtra por id', () => {
    expect(loadStories(realRoot).map((s) => s.id)).toContain('slugify');
    expect(loadStories(realRoot, ['slugify'])).toHaveLength(1);
    expect(() => loadStories(realRoot, ['nao-existe'])).toThrow(/nao-existe/);
  });
});

describe('prepareProject', () => {
  it('copia repo/, inicia o git em main e faz um commit sem levar acceptance/', () => {
    const story = loadStories(realRoot, ['slugify'])[0]!;
    const project = path.join(mk(), 'project');
    prepareProject(story, project);
    expect(fs.existsSync(path.join(project, 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(project, '.eval-acceptance'))).toBe(false);
    const branch = spawnSync('git', ['branch', '--show-current'], { cwd: project, encoding: 'utf8' }).stdout.trim();
    expect(branch).toBe('main');
    const status = spawnSync('git', ['status', '--porcelain'], { cwd: project, encoding: 'utf8' }).stdout;
    expect(status).toBe('');
  });
});

describe('runAcceptance', () => {
  const cmd = ['node', '--test', '.eval-acceptance/*.test.js'];

  it('sucesso', async () => {
    const story = fakeStory({ command: cmd, timeoutSeconds: 30 }, "import test from 'node:test'; test('ok', () => {});");
    const project = path.join(mk(), 'p');
    prepareProject(story, project);
    expect(fs.existsSync(path.join(project, '.eval-acceptance'))).toBe(false);
    const r = await runAcceptance(story, project);
    expect(r).toMatchObject({ passed: true, exitCode: 0 });
  });

  it('falha', async () => {
    const story = fakeStory(
      { command: cmd, timeoutSeconds: 30 },
      "import test from 'node:test'; test('ruim', () => { throw new Error('x'); });",
    );
    const project = path.join(mk(), 'p');
    prepareProject(story, project);
    const r = await runAcceptance(story, project);
    expect(r.passed).toBe(false);
    expect(r.exitCode).toBe(1);
  });

  it('tempo limite mata o processo e devolve exitCode null', async () => {
    const story = fakeStory({ command: ['node', '.eval-acceptance/check.test.js'], timeoutSeconds: 0.3 }, 'setInterval(() => {}, 1000);');
    const project = path.join(mk(), 'p');
    prepareProject(story, project);
    const r = await runAcceptance(story, project);
    expect(r).toMatchObject({ passed: false, exitCode: null });
  });
});
