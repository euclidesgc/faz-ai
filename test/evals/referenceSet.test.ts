import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { materialize, proveReference } from '../../evals/lib/acceptance';
import { loadStories, parseStory, runAcceptance, UnknownStoryError, type ReferenceStory } from '../../evals/lib/stories';

const STORIES_ROOT = path.resolve(__dirname, '../../evals/stories');
const tmp: string[] = [];
const mk = (): string => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-refset-'));
  tmp.push(d);
  return d;
};
afterAll(() => {
  for (const d of tmp) fs.rmSync(d, { recursive: true, force: true });
});

const valid = {
  title: 'T',
  description: 'D',
  startPhase: 'Plan',
  timeoutMinutes: 30,
  acceptance: { command: ['node', '--test', '.eval-acceptance/*.test.js'], timeoutSeconds: 60 },
  requiredArtifacts: [],
};

describe('parseStory', () => {
  it('aceita um story.json válido', () => {
    expect(parseStory(valid, 'x', '/d')).toMatchObject({ id: 'x', startPhase: 'Plan', requiredArtifacts: [], dir: '/d' });
  });

  it.each([
    ['campo faltando', { ...valid, title: undefined }, /title/],
    ['tipo errado', { ...valid, timeoutMinutes: '30' }, /timeoutMinutes/],
    ['timeout fracionado', { ...valid, timeoutMinutes: 1.5 }, /timeoutMinutes/],
    ['startPhase inválida', { ...valid, startPhase: 'Homologação' }, /startPhase/],
    ['campo extra', { ...valid, acceptCommand: 'x' }, /acceptCommand/],
    ['campo extra no aceite', { ...valid, acceptance: { ...valid.acceptance, shell: true } }, /acceptance\.shell/],
    ['anexo exigido de tipo errado', { ...valid, requiredArtifacts: [1] }, /requiredArtifacts/],
    ['não é objeto', [], /objeto/],
  ])('rejeita %s', (_nome, raw, mensagem) => {
    expect(() => parseStory(raw, 'x', '/d')).toThrow(mensagem);
  });
});

/** Uma história mínima, montada em pasta temporária, com a solução que faz o aceite passar. */
function miniStory(): ReferenceStory {
  const dir = mk();
  for (const p of ['repo/src', 'acceptance', 'solution/src']) fs.mkdirSync(path.join(dir, p), { recursive: true });
  fs.writeFileSync(path.join(dir, 'repo/package.json'), '{ "type": "module" }\n');
  fs.writeFileSync(path.join(dir, 'repo/src/a.js'), 'export const a = 1;\n');
  fs.writeFileSync(path.join(dir, 'solution/src/b.js'), 'export const b = 2;\n');
  fs.writeFileSync(
    path.join(dir, 'acceptance/b.test.js'),
    "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { b } from '../src/b.js';\ntest('b', () => assert.equal(b, 2));\n",
  );
  return parseStory({ ...valid, acceptance: { command: valid.acceptance.command, timeoutSeconds: 30 } }, 'mini', dir);
}

describe('proveReference (história mínima)', () => {
  it('falha sem a solução e passa com ela, duas execuções de cada', async () => {
    const proof = await proveReference(miniStory());
    expect(proof.withoutSolution).toHaveLength(2);
    expect(proof.withSolution).toHaveLength(2);
    expect(proof.withoutSolution.map((r) => r.passed)).toEqual([false, false]);
    expect(proof.withSolution.map((r) => r.passed)).toEqual([true, true]);
  }, 60_000);

  it('uma solução incompleta reprova: tirar um arquivo da solution/ derruba o aceite', async () => {
    const story = miniStory();
    fs.rmSync(path.join(story.dir, 'solution/src/b.js'));
    fs.writeFileSync(path.join(story.dir, 'solution/src/c.js'), 'export const c = 3;\n');
    const proof = await proveReference(story);
    expect(proof.withSolution.every((r) => r.passed)).toBe(false);
  }, 60_000);

  it('materialize só leva a solution/ quando pedida', () => {
    const story = miniStory();
    const sem = materialize(story, { withSolution: false });
    const com = materialize(story, { withSolution: true });
    tmp.push(sem, com);
    expect(fs.existsSync(path.join(sem, 'src/b.js'))).toBe(false);
    expect(fs.existsSync(path.join(com, 'src/b.js'))).toBe(true);
    expect(fs.existsSync(path.join(com, 'src/a.js'))).toBe(true);
  });

  it('o aceite não sobra na pasta do repo/', async () => {
    const story = miniStory();
    const work = materialize(story, { withSolution: true });
    tmp.push(work);
    expect((await runAcceptance(story, work)).passed).toBe(true);
    expect(fs.existsSync(path.join(story.dir, 'repo/.eval-acceptance'))).toBe(false);
  });
});

describe('loadStories com --story', () => {
  it('filtra por id e lança com a lista de disponíveis', () => {
    const root = mk();
    for (const id of ['b', 'a']) {
      fs.mkdirSync(path.join(root, id));
      fs.writeFileSync(path.join(root, id, 'story.json'), JSON.stringify(valid));
    }
    expect(loadStories(root).map((s) => s.id)).toEqual(['a', 'b']);
    expect(loadStories(root, ['b']).map((s) => s.id)).toEqual(['b']);
    expect(() => loadStories(root, ['x'])).toThrow(UnknownStoryError);
    expect(() => loadStories(root, ['x'])).toThrow('História "x" não existe. Disponíveis: a, b');
  });
});

/** Tudo de `dir` (arquivos), como caminhos relativos com `/`. */
function filesOf(dir: string, base = dir): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? filesOf(full, base) : [path.relative(base, full).split(path.sep).join('/')];
  });
}

describe('o conjunto de referência real', () => {
  const stories = loadStories(STORIES_ROOT);

  it('são exatamente as cinco histórias esperadas', () => {
    expect(stories.map((s) => s.id)).toEqual(['backend', 'docs', 'fluxo-completo', 'mcp', 'ui']);
  });

  it('só a fluxo-completo começa na Discovery, exige DISCOVERY.md e PLAN.md e tem 90 minutos', () => {
    for (const s of stories) {
      if (s.id === 'fluxo-completo') {
        expect(s).toMatchObject({ startPhase: 'Discovery', requiredArtifacts: ['DISCOVERY.md', 'PLAN.md'], timeoutMinutes: 90 });
      } else {
        expect(s, s.id).toMatchObject({ startPhase: 'Plan', requiredArtifacts: [], timeoutMinutes: 30 });
      }
    }
  });

  it('cada história tem repo/, acceptance/ com *.test.js e solution/ não vazios', () => {
    for (const s of stories) {
      expect(filesOf(path.join(s.dir, 'repo')).length, `${s.id}/repo`).toBeGreaterThan(0);
      expect(filesOf(path.join(s.dir, 'solution')).length, `${s.id}/solution`).toBeGreaterThan(0);
      const acceptance = filesOf(path.join(s.dir, 'acceptance'));
      expect(
        acceptance.some((f) => f.endsWith('.test.js')),
        `${s.id}/acceptance`,
      ).toBe(true);
      expect(
        acceptance.some((f) => f.endsWith('.test.ts')),
        `${s.id}: o aceite nunca é *.test.ts`,
      ).toBe(false);
    }
  });

  it('nada de acceptance/ vaza para repo/, e a solution/ só repete um caminho para substituí-lo', () => {
    for (const s of stories) {
      const repo = new Set(filesOf(path.join(s.dir, 'repo')));
      const aceiteNoRepo = filesOf(path.join(s.dir, 'acceptance')).filter((f) => repo.has(f));
      expect(aceiteNoRepo, `${s.id}: aceite dentro de repo/`).toEqual([]);
      // a solução reescreve arquivos do repo/ (é o que ela faz), mas nunca com o mesmo conteúdo: igual é cópia, não solução
      const copiados = filesOf(path.join(s.dir, 'solution')).filter(
        (f) =>
          repo.has(f) && fs.readFileSync(path.join(s.dir, 'solution', f), 'utf8') === fs.readFileSync(path.join(s.dir, 'repo', f), 'utf8'),
      );
      expect(copiados, `${s.id}: solution/ igual ao repo/`).toEqual([]);
    }
  });

  it('o repo/ não tem dependências', () => {
    for (const s of stories) {
      const pkg = JSON.parse(fs.readFileSync(path.join(s.dir, 'repo/package.json'), 'utf8')) as Record<string, unknown>;
      expect(pkg.dependencies, s.id).toBeUndefined();
      expect(pkg.devDependencies, s.id).toBeUndefined();
    }
  });

  it.each(stories.map((s) => [s.id, s] as const))(
    'proveReference de %s: falha sem a solução e passa com ela, nas duas execuções',
    async (_id, story) => {
      const proof = await proveReference(story);
      const show = (rs: typeof proof.withSolution): string => rs.map((r) => r.output).join('\n---\n');
      expect(
        proof.withoutSolution.map((r) => r.passed),
        `${story.id} sem a solução devia falhar`,
      ).toEqual([false, false]);
      expect(
        proof.withSolution.map((r) => r.passed),
        `${story.id} com a solução devia passar:\n${show(proof.withSolution)}`,
      ).toEqual([true, true]);
    },
    60_000,
  );
});
