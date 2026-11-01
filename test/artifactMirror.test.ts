import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Database } from 'sql.js';
import { openInMemory } from '../src/extension/db/database';
import { BoardRepo } from '../src/extension/repositories/boardRepo';
import { ArtifactRepo } from '../src/extension/repositories/artifactRepo';
import { ArtifactMirror } from '../src/extension/artifactMirror';
import type { ArtifactDraft } from '../src/shared/artifacts';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

let db: Database;
let repo: ArtifactRepo;
let boardId: string;
let tmp: string;
let dir: string;
let logs: string[];
let mirror: ArtifactMirror;

const draft = (over: Partial<ArtifactDraft> = {}): ArtifactDraft => ({
  kind: 'skill',
  name: 'deploy',
  description: 'Faz o deploy',
  body: '# Deploy',
  meta: {},
  origin: '.claude/skills/deploy/SKILL.md',
  originTool: 'claude',
  missing: false,
  skipped: [],
  files: [{ path: 'scripts/run.sh', content: 'echo oi', encoding: 'utf8', size: 7 }],
  ...over,
});

const read = (p: string) => fs.readFileSync(p, 'utf8');
const idOf = (kind: 'skill' | 'rule' | 'agent', name: string) => repo.list(boardId).find((a) => a.kind === kind && a.name === name)!;

beforeEach(async () => {
  db = await openInMemory(WASM_DIR);
  repo = new ArtifactRepo(db);
  boardId = new BoardRepo(db).getOrCreate('ws-1', 'Projeto X').id;
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-'));
  dir = path.join(tmp, 'artifacts', 'ws');
  logs = [];
  mirror = new ArtifactMirror(dir, repo, boardId, (m) => logs.push(m));
});

afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('ArtifactMirror', () => {
  it('grava skill, regra e agente, e não grava MCP', () => {
    repo.upsert(boardId, draft());
    repo.upsert(boardId, draft({ kind: 'rule', name: 'CLAUDE.md', body: 'regra', origin: 'CLAUDE.md', files: [] }));
    repo.upsert(
      boardId,
      draft({ kind: 'agent', name: 'revisor', description: 'Revisa: tudo', body: ' Instruções ', origin: '', files: [] }),
    );
    repo.upsert(boardId, draft({ kind: 'mcp', name: 'gh', body: '', meta: { server: { command: 'x', env: { T: 's' } } }, files: [] }));
    mirror.ensure();

    const skill = idOf('skill', 'deploy');
    expect(mirror.pathOf(skill)).toBe(path.join(dir, 'skills', 'deploy', 'SKILL.md'));
    expect(read(mirror.pathOf(skill))).toBe('# Deploy');
    expect(read(path.join(dir, 'skills', 'deploy', 'scripts', 'run.sh'))).toBe('echo oi');
    const rule = idOf('rule', 'CLAUDE.md');
    expect(mirror.pathOf(rule)).toBe(path.join(dir, 'rules', rule.id, 'CLAUDE.md'));
    expect(read(mirror.pathOf(rule))).toBe('regra');
    const agent = idOf('agent', 'revisor');
    expect(read(mirror.pathOf(agent))).toBe('---\nname: "revisor"\ndescription: "Revisa: tudo"\n---\n\nInstruções\n');
    expect(mirror.pathOf({ id: 'x', kind: 'mcp', name: 'gh' })).toBe('');
    expect(fs.readdirSync(dir).sort()).toEqual(['agents', 'rules', 'skills']);
    expect(logs).toEqual([]);
  });

  it('regrava ao mudar e não regrava o que não mudou', () => {
    repo.upsert(boardId, draft());
    mirror.ensure();
    const p = mirror.pathOf(idOf('skill', 'deploy'));
    const old = new Date(2020, 0, 1);
    fs.utimesSync(p, old, old);
    mirror.ensure();
    expect(fs.statSync(p).mtimeMs).toBe(old.getTime());
    repo.upsert(boardId, draft({ body: '# Deploy 2' }));
    mirror.ensure();
    expect(read(p)).toBe('# Deploy 2');
    // mesmo tamanho, outro conteúdo
    repo.upsert(boardId, draft({ body: '# Deploy 3' }));
    mirror.ensure();
    expect(read(p)).toBe('# Deploy 3');
  });

  it('recria a pasta apagada e apaga o que saiu do board', () => {
    repo.upsert(boardId, draft());
    repo.upsert(boardId, draft({ name: 'outra', origin: 'x', files: [] }));
    mirror.ensure();
    fs.rmSync(dir, { recursive: true, force: true });
    mirror.ensure();
    expect(read(path.join(dir, 'skills', 'deploy', 'SKILL.md'))).toBe('# Deploy');
    fs.writeFileSync(path.join(dir, 'sobra.txt'), 'x');
    fs.writeFileSync(path.join(dir, 'skills', 'deploy', 'velho.txt'), 'x');
    repo.remove(boardId, idOf('skill', 'outra').id);
    mirror.ensure();
    expect(fs.existsSync(path.join(dir, 'sobra.txt'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'skills', 'deploy', 'velho.txt'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'skills', 'outra'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'skills', 'deploy', 'SKILL.md'))).toBe(true);
  });

  it('não grava o artefato ausente', () => {
    repo.upsert(boardId, draft({ missing: true }));
    mirror.ensure();
    expect(fs.existsSync(path.join(dir, 'skills'))).toBe(false);
  });

  it('grava o binário igual ao original', () => {
    const bytes = Buffer.from([0, 255, 1, 128, 10, 13, 200]);
    repo.upsert(
      boardId,
      draft({ files: [{ path: 'bin/x.dat', content: bytes.toString('base64'), encoding: 'base64', size: bytes.length }] }),
    );
    mirror.ensure();
    expect(fs.readFileSync(path.join(dir, 'skills', 'deploy', 'bin', 'x.dat')).equals(bytes)).toBe(true);
  });

  it('recusa caminho e nome que escapam da pasta', () => {
    repo.upsert(
      boardId,
      draft({
        files: [
          { path: '../x', content: 'a', encoding: 'utf8', size: 1 },
          { path: '/abs', content: 'a', encoding: 'utf8', size: 1 },
          { path: 'ok.txt', content: 'a', encoding: 'utf8', size: 1 },
        ],
      }),
    );
    repo.upsert(boardId, draft({ name: '../fora', origin: 'y', files: [] }));
    repo.upsert(boardId, draft({ kind: 'agent', name: 'a/b', origin: '', files: [] }));
    mirror.ensure();
    expect(fs.existsSync(path.join(dir, 'skills', 'x'))).toBe(false);
    expect(fs.existsSync(path.join(tmp, 'artifacts', 'x'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'skills', 'deploy', 'ok.txt'))).toBe(true);
    expect(mirror.pathOf({ id: '1', kind: 'skill', name: '../fora' })).toBe('');
    expect(mirror.pathOf({ id: '1', kind: 'agent', name: 'a/b' })).toBe('');
    expect(logs.length).toBe(4);
    expect(fs.readdirSync(path.join(dir, 'skills'))).toEqual(['deploy']);
  });

  it('falha de disco não lança e vai para o log', () => {
    repo.upsert(boardId, draft());
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    fs.writeFileSync(dir, 'arquivo no lugar da pasta');
    expect(() => mirror.ensure()).not.toThrow();
    expect(logs.length).toBeGreaterThan(0);
  });
});
