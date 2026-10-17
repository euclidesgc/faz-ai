import { beforeEach, describe, expect, it } from 'vitest';
import * as path from 'node:path';
import type { Database } from 'sql.js';
import { openInMemory } from '../src/extension/db/database';
import { BoardRepo } from '../src/extension/repositories/boardRepo';
import { ArtifactRepo } from '../src/extension/repositories/artifactRepo';
import type { ArtifactDraft } from '../src/shared/artifacts';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

let db: Database;
let boards: BoardRepo;
let repo: ArtifactRepo;
let boardId: string;

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
  files: [{ path: 'a.txt', content: 'a', encoding: 'utf8', size: 1 }],
  ...over,
});

const mcp = (name: string, server: Record<string, unknown>, over: Partial<ArtifactDraft> = {}): ArtifactDraft =>
  draft({ kind: 'mcp', name, body: '', meta: { server }, origin: `.mcp.json#${name}`, files: [], ...over });

const count = (table: string) => Number(db.exec(`SELECT COUNT(*) FROM ${table}`)[0]!.values[0]![0]);

beforeEach(async () => {
  db = await openInMemory(WASM_DIR);
  boards = new BoardRepo(db);
  repo = new ArtifactRepo(db);
  boardId = boards.getOrCreate('ws-1', 'Projeto X').id;
});

describe('ArtifactRepo', () => {
  it('upsert mantém id, criação e modo; sem usage num novo vale o padrão do tipo', () => {
    const id = repo.upsert(boardId, draft());
    const first = repo.get(boardId, 'skill', 'deploy')!;
    expect(first.usage).toBe('contextual');
    repo.setUsage(boardId, id, 'always');
    const again = repo.upsert(boardId, draft({ description: 'novo' }));
    const row = repo.get(boardId, 'skill', 'deploy')!;
    expect(again).toBe(id);
    expect(row.usage).toBe('always');
    expect(row.description).toBe('novo');
    expect(row.createdAt).toBe(first.createdAt);
    repo.upsert(boardId, draft(), 'off');
    expect(repo.get(boardId, 'skill', 'deploy')!.usage).toBe('off');
    expect(count('board_artifacts')).toBe(1);
  });

  it('é único por (tipo, nome): o mesmo nome em outro tipo é outro artefato', () => {
    const a = repo.upsert(boardId, draft({ name: 'x' }));
    const b = repo.upsert(boardId, draft({ name: 'x', kind: 'agent', files: [] }));
    expect(a).not.toBe(b);
    expect(count('board_artifacts')).toBe(2);
  });

  it('troca os arquivos de apoio no upsert e os devolve em content', () => {
    const id = repo.upsert(
      boardId,
      draft({
        files: [
          { path: 'img/p.png', content: 'AAEC', encoding: 'base64', size: 3 },
          { path: 'a.txt', content: 'a', encoding: 'utf8', size: 1 },
        ],
      }),
    );
    expect(repo.list(boardId)[0]!.files).toEqual(['a.txt', 'img/p.png']);
    repo.upsert(boardId, draft({ files: [{ path: 'b.txt', content: 'b', encoding: 'utf8', size: 1 }] }));
    expect(repo.content(id)).toEqual({ body: '# Deploy', files: [{ path: 'b.txt', content: 'b', encoding: 'utf8', size: 1 }] });
    expect(count('board_artifact_files')).toBe(1);
  });

  it('list não leva o corpo de regra/skill nem a definição MCP; o corpo do agente entra', () => {
    repo.upsert(boardId, draft());
    repo.upsert(boardId, draft({ kind: 'rule', name: 'CLAUDE.md', origin: 'CLAUDE.md', body: 'regras', files: [] }));
    repo.upsert(
      boardId,
      draft({
        kind: 'agent',
        name: 'dev',
        body: 'instruções',
        files: [],
        meta: { skills: [], mcpServers: [], model: '', tools: { categories: [], native: { tool: 'claude', allow: [], deny: [] } } },
      }),
    );
    repo.upsert(boardId, mcp('gh', { command: 'npx', args: ['-y', 'x'], env: { TOKEN: 'segredo' } }));
    const list = repo.list(boardId);
    const by = (k: string) => list.find((a) => a.kind === k)!;
    expect(by('skill').body).toBe('');
    expect(by('rule').body).toBe('');
    expect(by('agent').body).toBe('instruções');
    expect(by('agent').agent?.tools.native.tool).toBe('claude');
    expect(by('mcp').mcpSummary).toBe('npx');
    expect(JSON.stringify(list)).not.toContain('segredo');
    expect(JSON.stringify(list)).not.toContain('meta');
  });

  it('o resumo do MCP é o comando, ou a url sem a query', () => {
    repo.upsert(boardId, mcp('web', { url: 'https://x.test/mcp?key=abc' }));
    expect(repo.get(boardId, 'mcp', 'web')!.mcpSummary).toBe('https://x.test/mcp');
  });

  it('mcpDefinitions traz as definições com segredos, só dos não ausentes', () => {
    repo.upsert(boardId, mcp('gh', { command: 'npx', env: { TOKEN: 'segredo' } }));
    repo.upsert(boardId, mcp('web', { url: 'https://x.test', headers: { Authorization: 'Bearer z' } }));
    repo.upsert(boardId, mcp('gone', { command: 'x' }, { missing: true }));
    expect(repo.mcpDefinitions(boardId)).toEqual({
      gh: { command: 'npx', env: { TOKEN: 'segredo' } },
      web: { url: 'https://x.test', headers: { Authorization: 'Bearer z' } },
    });
  });

  it('findByLocation usa a origem, ou board:<nome> no criado no board', () => {
    const id = repo.upsert(boardId, draft());
    const own = repo.upsert(boardId, draft({ name: 'meu', origin: '', originTool: '' }));
    expect(repo.findByLocation(boardId, 'skill', '.claude/skills/deploy/SKILL.md')?.id).toBe(id);
    expect(repo.findByLocation(boardId, 'skill', 'board:meu')?.id).toBe(own);
    expect(repo.findByLocation(boardId, 'agent', 'board:meu')).toBeUndefined();
  });

  it('remove apaga o artefato e os arquivos de apoio', () => {
    const id = repo.upsert(boardId, draft());
    repo.remove(boardId, id);
    expect(count('board_artifacts')).toBe(0);
    expect(count('board_artifact_files')).toBe(0);
  });

  describe('legado', () => {
    const legacy = (kind: string, location: string, usage = 'always') =>
      db.run('INSERT INTO harness_selection(board_id, kind, location, usage) VALUES (?,?,?,?)', [boardId, kind, location, usage]);

    it('importLegacy grava os rascunhos, apaga as linhas copiadas e é idempotente', () => {
      legacy('skill', '.claude/skills/deploy/SKILL.md', 'contextual');
      legacy('instructions', 'CLAUDE.md');
      const sel = repo.legacySelection(boardId);
      expect(sel).toHaveLength(2);
      repo.importLegacy(boardId, [
        { selection: sel.find((s) => s.kind === 'skill')!, draft: draft() },
        {
          selection: sel.find((s) => s.kind === 'instructions')!,
          draft: draft({ kind: 'rule', name: 'CLAUDE.md', origin: 'CLAUDE.md', files: [] }),
        },
      ]);
      expect(repo.legacySelection(boardId)).toEqual([]);
      expect(repo.get(boardId, 'rule', 'CLAUDE.md')!.usage).toBe('always');
      expect(repo.get(boardId, 'skill', 'deploy')!.usage).toBe('contextual');
      repo.importLegacy(boardId, []);
      expect(count('board_artifacts')).toBe(2);
    });

    it('é atômico: um erro no meio não grava nada nem apaga a marcação', () => {
      legacy('skill', 'a');
      legacy('skill', 'b');
      const bad = { ...draft({ name: 'b' }), files: [{ path: 'x', content: 'x', encoding: 'latin1' as unknown as 'utf8', size: 1 }] };
      expect(() =>
        repo.importLegacy(boardId, [
          { selection: { kind: 'skill', location: 'a', usage: 'always' }, draft: draft({ name: 'a' }) },
          { selection: { kind: 'skill', location: 'b', usage: 'always' }, draft: bad },
        ]),
      ).toThrow();
      expect(count('board_artifacts')).toBe(0);
      expect(repo.legacySelection(boardId)).toHaveLength(2);
    });
  });
});
