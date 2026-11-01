import { beforeEach, describe, expect, it } from 'vitest';
import * as path from 'node:path';
import type { Database } from 'sql.js';
import { openInMemory } from '../src/extension/db/database';
import { BoardRepo } from '../src/extension/repositories/boardRepo';
import { ArtifactRepo } from '../src/extension/repositories/artifactRepo';
import type { AgentMeta, ArtifactDraft } from '../src/shared/artifacts';

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
    repo.setUsage(boardId, id, 'off');
    const again = repo.upsert(boardId, draft({ description: 'novo' }));
    const row = repo.get(boardId, 'skill', 'deploy')!;
    expect(again).toBe(id);
    expect(row.usage).toBe('off');
    expect(row.description).toBe('novo');
    expect(row.createdAt).toBe(first.createdAt);
    repo.upsert(boardId, draft(), 'contextual');
    expect(repo.get(boardId, 'skill', 'deploy')!.usage).toBe('contextual');
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
    expect(by('mcp').mcpSummary).toBe('MCP stdio');
    expect(JSON.stringify(list)).not.toContain('segredo');
    expect(JSON.stringify(list)).not.toContain('meta');
  });

  it('o resumo do MCP não expõe comando nem partes da URL', () => {
    repo.upsert(boardId, mcp('web', { url: 'https://x.test/mcp?key=abc' }));
    expect(repo.get(boardId, 'mcp', 'web')!.mcpSummary).toBe('MCP HTTP');
  });

  it('mcpDefinitions traz as definições com segredos, só dos não ausentes', () => {
    repo.upsert(boardId, mcp('gh', { command: 'npx', env: { TOKEN: 'segredo' } }));
    repo.upsert(boardId, mcp('web', { url: 'https://x.test', headers: { Authorization: 'Bearer z' } }));
    repo.upsert(boardId, mcp('gone', { command: 'x' }, { missing: true }));
    expect(repo.mcpDefinitions(boardId)).toEqual({});
    repo.upsert(boardId, mcp('gh', { command: 'npx', env: { TOKEN: 'segredo' } }), undefined, true);
    repo.upsert(boardId, mcp('web', { url: 'https://x.test', headers: { Authorization: 'Bearer z' } }), undefined, true);
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

describe('ArtifactRepo: biblioteca (ativo/inativo, tools, versão e pastas)', () => {
  const agentMeta = (over: Partial<AgentMeta> = {}): AgentMeta => ({
    skills: [],
    mcpServers: [],
    model: '',
    tools: { categories: ['read', 'run'], native: { tool: '', allow: [], deny: [] } },
    ...over,
  });
  const skillBody = (extra: string) => `---\nname: deploy\ndescription: d\n${extra}---\n# Deploy`;

  it('sem tools gravadas, o agente deriva das categorias (e do mcp) e a skill do allowed-tools', () => {
    repo.upsert(boardId, draft({ kind: 'agent', name: 'dev', files: [], meta: agentMeta({ mcpServers: ['github'] }) }));
    repo.upsert(boardId, draft({ body: skillBody('allowed-tools: Read Grep Bash\n') }));
    expect(repo.get(boardId, 'agent', 'dev')!.tools).toEqual(['read', 'search', 'shell', 'mcp']);
    expect(repo.get(boardId, 'skill', 'deploy')!.tools).toEqual(['read', 'search', 'shell']);
    // nada foi gravado na leitura: continua NULL no banco
    expect(db.exec('SELECT COUNT(*) FROM board_artifacts WHERE tools_json IS NULL')[0]!.values[0]![0]).toBe(2);
  });

  it('grava tools, versão e pasta e relê; a lista gravada vale mesmo vazia', () => {
    repo.upsert(boardId, draft({ tools: ['read', 'delegate', 'write'], version: '2.1.0', folder: 'frontend/react' }));
    // delegate não existe na skill: sai na leitura
    expect(repo.get(boardId, 'skill', 'deploy')).toMatchObject({ tools: ['read', 'write'], version: '2.1.0', folder: 'frontend/react' });
    repo.upsert(boardId, draft({ tools: [], body: skillBody('allowed-tools: Read\n') }));
    expect(repo.get(boardId, 'skill', 'deploy')!.tools).toEqual([]);
    // sem tools/version/folder no upsert seguinte, mantém o gravado
    repo.upsert(boardId, draft({ description: 'outra' }));
    expect(repo.get(boardId, 'skill', 'deploy')).toMatchObject({ tools: [], version: '2.1.0', folder: 'frontend/react' });
  });

  it('o padrão de versão é do tipo e a pasta só existe na skill', () => {
    repo.upsert(boardId, draft({ kind: 'rule', name: 'r.md', files: [], folder: 'x' }));
    repo.upsert(boardId, draft({ kind: 'agent', name: 'dev', files: [], meta: agentMeta(), folder: 'x' }));
    repo.upsert(boardId, draft({ name: 'sk' }));
    expect(repo.get(boardId, 'rule', 'r.md')).toMatchObject({ version: '1', folder: '' });
    expect(repo.get(boardId, 'agent', 'dev')).toMatchObject({ version: '1.0.0', folder: '' });
    expect(repo.get(boardId, 'skill', 'sk')).toMatchObject({ version: '1.0.0', folder: '' });
  });

  it('setUsage e upsert normalizam o modo pelo tipo: regra pelo card é inativa, skill e agente sempre são pelo card', () => {
    const rule = repo.upsert(boardId, draft({ kind: 'rule', name: 'r.md', files: [] }));
    const skill = repo.upsert(boardId, draft());
    const agent = repo.upsert(boardId, draft({ kind: 'agent', name: 'dev', files: [], meta: agentMeta() }));
    const mcp = repo.upsert(boardId, draft({ kind: 'mcp', name: 'github', files: [], meta: { server: { command: 'gh' } } }));
    repo.setUsage(boardId, rule, 'contextual');
    repo.setUsage(boardId, skill, 'always');
    repo.setUsage(boardId, agent, 'always');
    repo.setUsage(boardId, mcp, 'always');
    const usage = (kind: 'rule' | 'skill' | 'agent' | 'mcp', name: string) => repo.get(boardId, kind, name)!.usage;
    expect([usage('rule', 'r.md'), usage('skill', 'deploy'), usage('agent', 'dev'), usage('mcp', 'github')]).toEqual([
      'off',
      'contextual',
      'contextual',
      'always',
    ]);
    repo.setUsage(boardId, rule, 'always');
    expect(usage('rule', 'r.md')).toBe('always');
    repo.upsert(boardId, draft({ kind: 'rule', name: 'r2.md', files: [] }), 'contextual');
    repo.upsert(boardId, draft({ name: 'sk2' }), 'always');
    expect([usage('rule', 'r2.md'), usage('skill', 'sk2')]).toEqual(['off', 'contextual']);
  });

  it('a leitura normaliza uma linha gravada por uma versão anterior', () => {
    const id = repo.upsert(boardId, draft({ kind: 'rule', name: 'velha.md', files: [] }));
    db.run("UPDATE board_artifacts SET usage = 'contextual' WHERE id = ?", [id]);
    expect(repo.get(boardId, 'rule', 'velha.md')!.usage).toBe('off');
  });

  it('skillFolders devolve os níveis de cima, une as das skills com as vazias e removeSkillFolder tira só as vazias', () => {
    repo.upsert(boardId, draft({ name: 'a', folder: 'frontend/react/hooks' }));
    repo.upsert(boardId, draft({ name: 'b', folder: 'backend' }));
    repo.upsert(boardId, draft({ name: 'c' }));
    repo.addSkillFolder(boardId, 'docs/guias');
    repo.addSkillFolder(boardId, 'docs/guias');
    expect(repo.skillFolders(boardId)).toEqual(['backend', 'docs', 'docs/guias', 'frontend', 'frontend/react', 'frontend/react/hooks']);
    // a pasta de outro board não aparece
    const other = boards.getOrCreate('ws-2', 'Outro').id;
    expect(repo.skillFolders(other)).toEqual([]);
    repo.removeSkillFolder(boardId, 'docs');
    expect(repo.skillFolders(boardId)).toEqual(['backend', 'frontend', 'frontend/react', 'frontend/react/hooks']);
    // a que ainda tem skill continua pelas skills
    repo.removeSkillFolder(boardId, 'backend');
    expect(repo.skillFolders(boardId)).toContain('backend');
  });
});
