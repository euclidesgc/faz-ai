import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { Database } from 'sql.js';
import { openInMemory } from '../src/extension/db/database';
import { BoardRepo } from '../src/extension/repositories/boardRepo';
import { ArtifactRepo } from '../src/extension/repositories/artifactRepo';
import { ArtifactMirror } from '../src/extension/artifactMirror';
import { RunArtifactSnapshots, runArtifactRequest, type RunArtifactRequest } from '../src/extension/runArtifactSnapshot';
import type { ArtifactDraft } from '../src/shared/artifacts';
import { AiGateway, NO_CARD, type AiCall } from '../src/extension/ai/gateway';
import { createRunLog } from '../src/extension/log/runLog';
import { AiRunRepo } from '../src/extension/log/aiRunRepo';
import { monthOf } from '../src/shared/log';
import { run } from '../src/extension/db/query';
import { bareExec } from '../src/extension/execution';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { AiRunner } from '../src/extension/runner';
import { ChatSession } from '../src/extension/chat';
import type { SpawnFn } from '../src/extension/aiOutput/measured';

let db: Database;
let dir: string;
let boardId: string;
let repo: ArtifactRepo;
let snapshots: RunArtifactSnapshots;
let id: string;
const draft = (body = 'Skill v1'): ArtifactDraft => ({
  kind: 'skill',
  name: 'testes',
  description: 'Validar',
  body,
  meta: {},
  origin: '',
  originTool: '',
  missing: false,
  skipped: [],
  files: [{ path: 'apoio/check.txt', content: 'ação', encoding: 'utf8', size: Buffer.byteLength('ação') }],
});
function request(): RunArtifactRequest {
  const directory = path.join(dir, 'cache');
  const mirror = new ArtifactMirror(directory, repo, boardId);
  return {
    directory,
    artifacts: repo
      .list(boardId)
      .filter((a) => a.id === id)
      .map((a) => ({ ...a, path: mirror.pathOf(a) })),
  };
}
const bodyPath = (directory: string) => path.join(directory, 'skills/testes/SKILL.md');
beforeEach(async () => {
  db = await openInMemory(path.resolve(__dirname, '../node_modules/sql.js/dist'));
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-run-artifacts-'));
  boardId = new BoardRepo(db).getOrCreate('snapshots', 'Teste').id;
  repo = new ArtifactRepo(db);
  id = repo.upsert(boardId, draft());
  snapshots = new RunArtifactSnapshots(path.join(dir, 'runs'), repo, boardId);
});
afterEach(() => {
  vi.useRealTimers();
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('snapshots de artefatos por execução', () => {
  it('A preserva v1 e B recebe v2; excluir a biblioteca e o cache não remove nenhum snapshot', () => {
    const a = snapshots.capture('run-a', request());
    repo.upsert(boardId, draft('Skill v2'));
    const b = snapshots.capture('run-b', request());
    repo.remove(boardId, id);
    fs.rmSync(path.join(dir, 'cache'), { recursive: true, force: true });
    expect(fs.readFileSync(bodyPath(a.directory), 'utf8')).toBe('Skill v1');
    expect(fs.readFileSync(bodyPath(b.directory), 'utf8')).toBe('Skill v2');
    expect(a.manifest.artifacts[0]!.revision).toBe(1);
    expect(b.manifest.artifacts[0]!.revision).toBe(2);
    expect(a.manifest.artifacts[0]!.files[0]!.sha256).not.toBe(b.manifest.artifacts[0]!.files[0]!.sha256);
    expect(fs.readFileSync(path.join(a.directory, 'skills/testes/apoio/check.txt'), 'utf8')).toBe('ação');
    a.validate();
    b.validate();
  });

  it('recusa metadados atrasados mesmo com edições no mesmo milissegundo', () => {
    vi.useFakeTimers();
    vi.setSystemTime(100);
    repo.upsert(boardId, draft('Primeira'));
    const old = request();
    const beforeStamp = repo.get(boardId, 'skill', 'testes')!.updatedAt;
    repo.upsert(boardId, draft('Segunda'));
    expect(repo.get(boardId, 'skill', 'testes')!.updatedAt).toBe(beforeStamp);
    expect(() => snapshots.capture('atrasado', old)).toThrow('mudou');
    expect(fs.readdirSync(path.join(dir, 'runs', boardId))).toEqual([]);
  });

  it('não substitui run publicado e mantém diretório íntegro diante de nova tentativa', () => {
    const frozen = snapshots.capture('run-a', request());
    repo.upsert(boardId, draft('Outra revisão'));
    expect(() => snapshots.capture('run-a', request())).toThrow('já foi publicado');
    expect(fs.readFileSync(bodyPath(frozen.directory), 'utf8')).toBe('Skill v1');
    frozen.validate();
  });

  it('recusa raiz simbólica antes de criar qualquer arquivo no destino externo', () => {
    const outside = path.join(dir, 'outside');
    fs.mkdirSync(outside);
    fs.symlinkSync(outside, path.join(dir, 'runs'), 'dir');
    expect(() => snapshots.capture('run-a', request())).toThrow('Pasta de snapshot');
    expect(fs.readdirSync(outside)).toEqual([]);
  });

  it('publica somente arquivos selecionados, com hash e sem definições MCP', () => {
    repo.upsert(boardId, { ...draft('Não selecionada'), name: 'outra', files: [] });
    repo.upsert(boardId, {
      ...draft(''),
      kind: 'mcp',
      name: 'segredo',
      files: [],
      meta: { server: { env: { TOKEN: 'SEGREDO-SENTINELA' } } },
    });
    const frozen = snapshots.capture('run-a', request());
    expect(frozen.manifest.artifacts.map((a) => a.id)).toEqual([id]);
    expect(JSON.stringify(frozen.manifest)).not.toContain('SEGREDO-SENTINELA');
    expect(fs.existsSync(path.join(frozen.directory, 'skills/outra'))).toBe(false);
    expect(frozen.manifest.artifacts[0]!.files.every((f) => /^[a-f0-9]{64}$/.test(f.sha256))).toBe(true);
  });

  it('rejeita arquivo alterado, manifesto alterado e link simbólico', () => {
    const a = snapshots.capture('run-a', request());
    fs.chmodSync(bodyPath(a.directory), 0o600);
    fs.writeFileSync(bodyPath(a.directory), 'Alterado');
    expect(() => a.validate()).toThrow('Integridade');
    const b = snapshots.capture('run-b', request());
    fs.unlinkSync(bodyPath(b.directory));
    fs.symlinkSync(bodyPath(a.directory), bodyPath(b.directory));
    expect(() => b.validate()).toThrow('Arquivo de snapshot');
    const c = snapshots.capture('run-c', request());
    fs.chmodSync(path.join(c.directory, 'manifest.json'), 0o600);
    fs.writeFileSync(path.join(c.directory, 'manifest.json'), '{}');
    expect(() => c.validate()).toThrow('Manifesto');
  });

  it('falha obrigatória não publica lote parcial nem escreve fora do snapshot', () => {
    run(db, "UPDATE board_artifact_files SET path = '../../escape' WHERE artifact_id = ?", [id]);
    expect(() => snapshots.capture('run-a', request())).toThrow('apoio obrigatório');
    expect(fs.readdirSync(path.join(dir, 'runs', boardId))).toEqual([]);
    expect(fs.existsSync(path.join(dir, 'escape'))).toBe(false);
    run(db, "UPDATE board_artifact_files SET path = 'a.txt', size = 100 WHERE artifact_id = ?", [id]);
    expect(() => snapshots.capture('run-b', request())).toThrow('Tamanho');
  });

  it('não trunca artefato obrigatório nem ignora arquivo de apoio que falhou na importação', () => {
    repo.upsert(boardId, { ...draft(), skipped: [{ path: 'apoio/perdido', reason: 'read' }] });
    expect(() => snapshots.capture('run-a', request())).toThrow('indisponível');
    repo.upsert(boardId, draft('x'.repeat(512 * 1024 + 1)));
    expect(() => snapshots.capture('run-b', request())).toThrow('limites de materialização');
    expect(fs.readdirSync(path.join(dir, 'runs', boardId))).toEqual([]);
  });

  it('redireciona prompt e diretório extra sem reescrever comando ou credenciais MCP', () => {
    const original = request();
    const frozen = snapshots.capture('run-a', original);
    const input = {
      prompt: `Leia ${original.artifacts[0]!.path}`,
      permission: 'board' as const,
      addDirs: [original.directory, '/workspace'],
      exec: {
        ...bareExec(null),
        mcpConfig: JSON.stringify({
          mcpServers: { local: { command: original.artifacts[0]!.path, env: { TOKEN: original.artifacts[0]!.path } } },
        }),
      },
    };
    expect(frozen.rewrite(input)).toMatchObject({
      prompt: `Leia ${bodyPath(frozen.directory)}`,
      addDirs: [frozen.directory, '/workspace'],
    });
    expect(input.addDirs[0]).toBe(original.directory);
    expect(frozen.rewrite(input).exec!.mcpConfig).toBe(input.exec.mcpConfig);
    expect(frozen.rewrite({ ...input, prompt: path.join(path.dirname(original.artifacts[0]!.path), 'apoio/check.txt') }).prompt).toBe(
      path.join(frozen.directory, 'skills/testes/apoio/check.txt'),
    );
    original.artifacts.length = 0;
    expect(frozen.rewrite(input).prompt).toBe(`Leia ${bodyPath(frozen.directory)}`);
  });

  it('a seleção sem card inclui Sempre e mantém opcionais fora do pedido', () => {
    const boards = new BoardRepo(db);
    repo.setUsage(boardId, id, 'always');
    repo.upsert(boardId, { ...draft(), name: 'opcional', files: [] });
    const state = boards.snapshot(boardId);
    const directory = path.join(dir, 'cache');
    const mirror = new ArtifactMirror(directory, repo, boardId);
    state.harness = {
      ...state.harness,
      library: { directory, artifacts: repo.list(boardId).map((a) => ({ ...a, path: mirror.pathOf(a) })) },
    };
    expect(runArtifactRequest(state)!.artifacts.map((a) => a.id)).toEqual([id]);
  });
});

describe('gateway com snapshot obrigatório', () => {
  function call(): AiCall {
    return {
      origin: 'manual',
      tool: 'claude',
      cwd: dir,
      context: NO_CARD,
      timeoutMinutes: 1,
      log: () => {},
      prepare: () => ({
        artifacts: request(),
        input: { permission: 'board', prompt: `Leia ${request().artifacts[0]!.path}` },
        config: { agent: null, model: null, effort: null, profile: null, autonomous: false, clean: true, skills: ['testes'], mcp: [] },
      }),
    };
  }
  it('falha ao materializar impede o spawn e fecha o registro como unsupported', () => {
    const spawn = vi.fn();
    const fail = new RunArtifactSnapshots(path.join(dir, 'arquivo'), repo, boardId);
    fs.writeFileSync(path.join(dir, 'arquivo'), 'Não é pasta');
    const gateway = new AiGateway({ boardId, runLog: createRunLog(db), spawn, snapshots: fail });
    expect(() => gateway.run(call())).toThrow();
    expect(spawn).not.toHaveBeenCalled();
    expect(new AiRunRepo(db).byMonth(monthOf(Date.now()))[0]!.outcome).toBe('unsupported');
  });

  it('o manifesto do run guarda a configuração resolvida, sem a decisão de admissão nem definições MCP', () => {
    const gateway = new AiGateway({ boardId, runLog: createRunLog(db), spawn: vi.fn(), snapshots });
    const input = call();
    let manifest: Record<string, unknown> = {};
    input.beforeSpawn = () => {
      const runId = new AiRunRepo(db).byMonth(monthOf(Date.now()))[0]!.id;
      manifest = JSON.parse(fs.readFileSync(path.join(dir, 'runs', boardId, runId, 'manifest.json'), 'utf8'));
      throw new Error('parar antes do processo');
    };
    expect(() => gateway.run(input)).toThrow('parar antes do processo');
    expect(manifest.config).toEqual({
      agent: null,
      model: null,
      effort: null,
      profile: null,
      autonomous: false,
      clean: true,
      skills: ['testes'],
      mcp: [],
    });
  });

  it('revalida após beforeSpawn e não inicia processo se o snapshot foi alterado', () => {
    const spawn = vi.fn();
    const gateway = new AiGateway({ boardId, runLog: createRunLog(db), spawn, snapshots });
    const input = call();
    input.beforeSpawn = () => {
      const runId = new AiRunRepo(db).byMonth(monthOf(Date.now()))[0]!.id;
      const file = bodyPath(path.join(dir, 'runs', boardId, runId));
      fs.chmodSync(file, 0o600);
      fs.writeFileSync(file, 'Outra instrução');
    };
    expect(() => gateway.run(input)).toThrow('Integridade');
    expect(spawn).not.toHaveBeenCalled();
  });

  it('runner e chat reais recebem caminhos por run sem depender do cache compartilhado', () => {
    const router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
      workspaceKey: 'snapshots',
      folderName: 'Teste',
      author: 'Pessoa',
      workspaceDir: dir,
      attachmentsDir: path.join(dir, 'attachments'),
    });
    expect(router.boardId).toBe(boardId);
    repo.setUsage(boardId, id, 'always');
    const originalSnapshot = router.snapshot.bind(router);
    vi.spyOn(router, 'snapshot').mockImplementation(() => {
      const state = originalSnapshot();
      const directory = request().directory;
      const mirror = new ArtifactMirror(directory, repo, boardId);
      return {
        ...state,
        harness: { ...state.harness, library: { directory, artifacts: repo.list(boardId).map((a) => ({ ...a, path: mirror.pathOf(a) })) } },
      };
    });
    const commands: string[] = [];
    const exits: ((code: number) => void)[] = [];
    const spawn: SpawnFn = (command) => {
      commands.push(JSON.stringify(command));
      return { kill: () => {}, onExit: (listener) => exits.push(listener) };
    };
    const gateway = new AiGateway({ boardId, runLog: createRunLog(db), snapshots, spawn });
    const runner = new AiRunner(router, { cwd: dir, gateway, log: () => {} });
    new ChatSession(router, { cwd: dir, gateway, log: () => {}, file: path.join(dir, 'chat.json') });
    const state = router.snapshot();
    const type = state.cardTypes[0]!;
    const cardId = router.createCard({
      typeId: type.id,
      parentId: null,
      title: 'Snapshot',
      columnId: state.columns.find((c) => c.workflowId === type.defaultWorkflowId)!.id,
    });
    runner.start(cardId, 'manual');
    repo.upsert(boardId, draft('Skill v2'));
    router.chatCommand({ type: 'chat.send', text: 'Revisar', model: null });
    const runs = new AiRunRepo(db).byMonth(monthOf(Date.now()));
    expect(runs).toHaveLength(2);
    expect(commands).toHaveLength(2);
    for (let i = 0; i < 2; i++) {
      const directory = path.join(dir, 'runs', boardId, runs[i]!.id);
      expect(commands[i]).toContain(directory);
      expect(commands[i]).not.toContain(bodyPath(request().directory));
      expect(fs.readFileSync(bodyPath(directory), 'utf8')).toBe(i === 0 ? 'Skill v1' : 'Skill v2');
    }
    for (const exit of exits) exit(0);
  });
});
