import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Database } from 'sql.js';
import { openInMemory } from '../src/extension/db/database';
import { BoardRepo } from '../src/extension/repositories/boardRepo';
import { ArtifactRepo } from '../src/extension/repositories/artifactRepo';
import { ToolExporter } from '../src/extension/toolExport';
import { readSource } from '../src/extension/artifactSource';
import type { ArtifactDraft } from '../src/shared/artifacts';
import type { AiTool } from '../src/shared/harness';

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
  body: '# Deploy\n\nPassos.\n',
  meta: {},
  origin: '',
  originTool: '',
  missing: false,
  skipped: [],
  files: [{ path: 'a.txt', content: 'a\n', encoding: 'utf8', size: 2 }],
  ...over,
});
const exporter = () => new ToolExporter(repo, boardId, { projectDir: project, homeDir: home }, 'dev');

beforeEach(async () => {
  db = await openInMemory(path.resolve(__dirname, '../node_modules/sql.js/dist'));
  repo = new ArtifactRepo(db);
  boardId = new BoardRepo(db).getOrCreate('ws-g', 'G').id;
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-export-g-'));
  project = path.join(tmp, 'proj');
  home = path.join(tmp, 'home');
  fs.mkdirSync(project);
  fs.mkdirSync(home);
});
afterEach(() => {
  fs.chmodSync(project, 0o755);
  fs.rmSync(tmp, { recursive: true, force: true });
});

const allText = (dir: string): string =>
  fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => fs.readFileSync(path.join(e.parentPath, e.name), 'utf8'))
    .join('\n');

describe('garantias do export', () => {
  it('RF11: o segredo de um servidor MCP não vai para nenhum arquivo', () => {
    repo.upsert(boardId, {
      ...draft({ kind: 'mcp', name: 'api', body: '', files: [], origin: '.mcp.json#api' }),
      meta: { server: { command: 'x', env: { TOKEN: 'segredo-super-secreto-123' } } },
    });
    const ids = [repo.upsert(boardId, draft())];
    const ex = exporter();
    expect(JSON.stringify(ex.plan('claude', 'project'))).not.toContain('segredo-super-secreto-123');
    expect(ex.plan('claude', 'project').mcpCount).toBe(1);
    ex.apply('claude', 'project', ids, true);
    expect(allText(project)).not.toContain('segredo-super-secreto-123');
  });

  it('RF14: o banco do board é o mesmo antes e depois', () => {
    const id = repo.upsert(boardId, draft());
    const before = Buffer.from(db.export());
    exporter().plan('claude', 'project');
    exporter().apply('claude', 'project', [id], true);
    expect(Buffer.from(db.export()).equals(before)).toBe(true);
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('RF13: falha num arquivo não impede os outros', () => {
    const a = repo.upsert(boardId, draft({ name: 'a', files: [] }));
    const b = repo.upsert(boardId, draft({ name: 'b', files: [] }));
    fs.mkdirSync(path.join(project, '.claude/skills/a'), { recursive: true });
    fs.chmodSync(path.join(project, '.claude/skills/a'), 0o500);
    const r = exporter().apply('claude', 'project', [a, b], false);
    fs.chmodSync(path.join(project, '.claude/skills/a'), 0o755);
    expect(r.files.find((f) => f.item === a)).toMatchObject({ outcome: 'failed' });
    expect(r.files.find((f) => f.item === a)!.error).toBeTruthy();
    expect(r.files.find((f) => f.item === b)!.outcome).toBe('written');
  });
});

describe('RF15: ida e volta com a leitura da importação', () => {
  const cases: { tool: AiTool; root: string; rule: string }[] = [
    { tool: 'claude', root: '.claude', rule: '.claude/rules/estilo.md' },
    { tool: 'cursor', root: '.cursor', rule: '.cursor/rules/estilo.mdc' },
    { tool: 'kimi', root: '.kimi-code', rule: '.kimi-code/AGENTS.md' },
  ];
  for (const c of cases) {
    it(`${c.tool}: skill e regra voltam com o mesmo conteúdo`, () => {
      const skill = repo.upsert(boardId, draft());
      const rule = repo.upsert(
        boardId,
        draft({ kind: 'rule', name: 'estilo.md', body: 'Escreva em português.\n', files: [], description: '' }),
      );
      exporter().apply(c.tool, 'project', [skill, rule], false);
      const dirs = { projectDir: project, homeDir: home };
      const s = readSource({ kind: 'skill', location: `${c.root}/skills/deploy/SKILL.md` }, dirs, c.tool);
      expect(s.missing).toBe(false);
      expect(s.description).toBe('Faz o deploy');
      expect(s.body).toContain('Passos.');
      expect(s.files.map((f) => [f.path, f.content])).toEqual([['a.txt', 'a\n']]);
      const r = readSource({ kind: 'instructions', location: c.rule }, dirs, c.tool);
      expect(r.missing).toBe(false);
      expect(r.body).toContain('Escreva em português.');
    });
  }
});
