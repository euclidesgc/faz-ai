import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Database } from 'sql.js';
import { openInMemory } from '../src/extension/db/database';
import { BoardRepo } from '../src/extension/repositories/boardRepo';
import { ArtifactRepo } from '../src/extension/repositories/artifactRepo';
import { ToolExporter, checkPath, writeInside } from '../src/extension/toolExport';
import type { ArtifactDraft } from '../src/shared/artifacts';

let db: Database;
let repo: ArtifactRepo;
let boardId: string;
let tmp: string;
let project: string;
let home: string;

const draft = (over: Partial<ArtifactDraft> = {}): ArtifactDraft => ({
  kind: 'skill',
  name: 'deploy',
  description: 'Faz o deploy',
  body: '# Deploy\n',
  meta: {},
  origin: '',
  originTool: '',
  missing: false,
  skipped: [],
  files: [{ path: 'scripts/run.sh', content: 'echo oi\n', encoding: 'utf8', size: 8 }],
  ...over,
});
const exporter = (dirs = { projectDir: project, homeDir: home }) => new ToolExporter(repo, boardId, dirs, 'dev');
const rule = (name = 'CLAUDE.md', body = 'Seja breve.\n') =>
  draft({ kind: 'rule', name, body, files: [], description: '', origin: name, originTool: 'claude' });

beforeEach(async () => {
  db = await openInMemory(path.resolve(__dirname, '../node_modules/sql.js/dist'));
  repo = new ArtifactRepo(db);
  boardId = new BoardRepo(db).getOrCreate('ws-x', 'X').id;
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-export-'));
  project = path.join(tmp, 'proj');
  home = path.join(tmp, 'home');
  fs.mkdirSync(project);
  fs.mkdirSync(home);
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('ToolExporter', () => {
  it('a prévia não grava nada e lista os arquivos do formato da ferramenta', () => {
    repo.upsert(boardId, draft());
    const plan = exporter().plan('claude', 'project');
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]!.files.map((f) => path.relative(project, f.path))).toEqual([
      path.join('.claude', 'skills', 'deploy', 'SKILL.md'),
      path.join('.claude', 'skills', 'deploy', 'scripts', 'run.sh'),
    ]);
    expect(fs.readdirSync(project)).toEqual([]);
  });

  it('grava os escolhidos e só eles', () => {
    const a = repo.upsert(boardId, draft());
    repo.upsert(boardId, draft({ name: 'outra' }));
    const r = exporter().apply('claude', 'project', [a], false);
    expect(r.files.every((f) => f.outcome === 'written')).toBe(true);
    expect(fs.existsSync(path.join(project, '.claude/skills/deploy/scripts/run.sh'))).toBe(true);
    expect(fs.existsSync(path.join(project, '.claude/skills/outra'))).toBe(false);
  });

  it('RF08: arquivo existente fica byte a byte igual sem a opção, e o item inteiro é pulado', () => {
    const a = repo.upsert(boardId, draft());
    const skill = path.join(project, '.claude/skills/deploy/SKILL.md');
    fs.mkdirSync(path.dirname(skill), { recursive: true });
    fs.writeFileSync(skill, Buffer.from([0, 1, 2, 255]));
    const r = exporter().apply('claude', 'project', [a], false);
    expect(r.files.every((f) => f.outcome === 'skipped')).toBe(true);
    expect([...fs.readFileSync(skill)]).toEqual([0, 1, 2, 255]);
    expect(fs.existsSync(path.join(project, '.claude/skills/deploy/scripts'))).toBe(false);
  });

  it('com "substituir" regrava os existentes e grava os novos', () => {
    const a = repo.upsert(boardId, draft());
    const skill = path.join(project, '.claude/skills/deploy/SKILL.md');
    fs.mkdirSync(path.dirname(skill), { recursive: true });
    fs.writeFileSync(skill, 'velho');
    const r = exporter().apply('claude', 'project', [a], true);
    expect(r.files.map((f) => f.outcome).sort()).toEqual(['replaced', 'written']);
    expect(fs.readFileSync(skill, 'utf8')).toContain('Deploy');
  });

  it('RF09: extras na pasta da skill ficam e aparecem na prévia', () => {
    const a = repo.upsert(boardId, draft());
    const extra = path.join(project, '.claude/skills/deploy/meu.txt');
    fs.mkdirSync(path.dirname(extra), { recursive: true });
    fs.writeFileSync(extra, 'meu');
    expect(exporter().plan('claude', 'project').items[0]!.extras).toEqual(['meu.txt']);
    exporter().apply('claude', 'project', [a], true);
    expect(fs.readFileSync(extra, 'utf8')).toBe('meu');
  });

  it('recusa nome inseguro e segue com os outros', () => {
    const bad = repo.upsert(boardId, draft({ name: '..' }));
    const ok = repo.upsert(boardId, draft({ name: 'bom' }));
    const r = exporter().apply('claude', 'project', [bad, ok], false);
    expect(r.files.find((f) => f.item === bad)).toMatchObject({ outcome: 'refused', reason: 'unsafe-name' });
    expect(r.files.filter((f) => f.item === ok).every((f) => f.outcome === 'written')).toBe(true);
  });

  it('origem ausente fica bloqueada', () => {
    const id = repo.upsert(boardId, draft({ missing: true }));
    const plan = exporter().plan('claude', 'project');
    expect(plan.items.find((i) => i.id === id)!.blocked).toBe('missing');
    expect(exporter().apply('claude', 'project', [id], false).files[0]).toMatchObject({ outcome: 'refused', reason: 'missing' });
  });

  it('regra do Cursor na pasta do usuário é bloqueada', () => {
    const id = repo.upsert(boardId, rule());
    expect(
      exporter()
        .plan('cursor', 'user')
        .items.find((i) => i.id === id)!.blocked,
    ).toBe('unsupported');
  });

  it('sem projeto: roots.project é null e apply no projeto é recusado', () => {
    repo.upsert(boardId, draft());
    const ex = exporter({ projectDir: undefined as never, homeDir: home });
    expect(ex.plan('claude', 'project').roots.project).toBeNull();
    expect(() => ex.apply('claude', 'project', [], false)).toThrow();
    expect(ex.plan('claude', 'user').items).toHaveLength(1);
  });

  it('ferramenta sem formato lança', () => {
    expect(() => exporter().plan('outra' as never, 'project')).toThrow();
  });

  it('regras do Kimi vão juntas no AGENTS.md', () => {
    const ids = [repo.upsert(boardId, rule('A.md', 'a\n')), repo.upsert(boardId, rule('B.md', 'b\n'))];
    exporter().apply('kimi', 'project', ids, false);
    const text = fs.readFileSync(path.join(project, '.kimi-code/AGENTS.md'), 'utf8');
    expect(text).toContain('a');
    expect(text).toContain('b');
  });
});

describe('escrita segura', () => {
  it('caminho fora da pasta da ferramenta ou com ..', () => {
    expect(checkPath(project, '.claude', '.cursor/x.md')).toBe('unsafe-path');
    expect(checkPath(project, '.claude', '.claude/../x.md')).toBe('unsafe-path');
  });

  it.skipIf(process.platform === 'win32')('link no meio do caminho que sai da pasta: outside-root, nada fora é gravado', () => {
    const outside = path.join(tmp, 'fora');
    fs.mkdirSync(outside);
    fs.mkdirSync(path.join(project, '.claude'));
    fs.symlinkSync(outside, path.join(project, '.claude/skills'));
    expect(writeInside(project, '.claude', '.claude/skills/x/SKILL.md', Buffer.from('x'), true)).toMatchObject({
      outcome: 'refused',
      reason: 'outside-root',
    });
    expect(fs.readdirSync(outside)).toEqual([]);
  });

  it.skipIf(process.platform === 'win32')('a pasta da ferramenta que é link continua valendo', () => {
    const dot = path.join(tmp, 'dotfiles');
    fs.mkdirSync(dot);
    fs.symlinkSync(dot, path.join(project, '.claude'));
    expect(writeInside(project, '.claude', '.claude/rules/a.md', Buffer.from('x'), false).outcome).toBe('written');
    expect(fs.existsSync(path.join(dot, 'rules/a.md'))).toBe(true);
  });

  it.skipIf(process.platform === 'win32')('destino que é link ou pasta', () => {
    fs.mkdirSync(path.join(project, '.claude/rules/dir.md'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'alvo'), 'a');
    fs.symlinkSync(path.join(tmp, 'alvo'), path.join(project, '.claude/rules/l.md'));
    expect(writeInside(project, '.claude', '.claude/rules/dir.md', Buffer.from('x'), true).reason).toBe('not-file');
    expect(writeInside(project, '.claude', '.claude/rules/l.md', Buffer.from('x'), true).reason).toBe('symlink');
    expect(fs.readFileSync(path.join(tmp, 'alvo'), 'utf8')).toBe('a');
  });

  it('arquivo novo que aparece depois da prévia vira skipped (wx)', () => {
    const rel = '.claude/rules/a.md';
    fs.mkdirSync(path.join(project, '.claude/rules'), { recursive: true });
    fs.writeFileSync(path.join(project, rel), 'meu');
    expect(writeInside(project, '.claude', rel, Buffer.from('x'), false).outcome).toBe('skipped');
    expect(fs.readFileSync(path.join(project, rel), 'utf8')).toBe('meu');
  });
});
