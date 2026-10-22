import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { LocalCredentials, bindCredentials, credentialsFor } from '../src/extension/credentials';
import { openFile, openInMemory } from '../src/extension/db/database';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { ArtifactRepo } from '../src/extension/repositories/artifactRepo';
import { exportBoard, importBoard } from '../src/extension/db/boardExport';
import { all, run } from '../src/extension/db/query';
import { bareExec, executionPlan } from '../src/extension/execution';
import { AiGateway, NO_CARD, type AiRunEnd } from '../src/extension/ai/gateway';
import { createRunLog } from '../src/extension/log/runLog';

let dir: string;
const wasm = path.resolve(__dirname, '../node_modules/sql.js/dist');
const sentinel = 'SENTINELA-SEGREDO-NAO-EXPORTAVEL-728';
const definition = {
  command: `/local/${sentinel}`,
  args: [`--token=${sentinel}`],
  env: { TOKEN: sentinel },
  headers: { Authorization: `Bearer ${sentinel}` },
  url: `https://user:${sentinel}@example.test/${sentinel}?key=${sentinel}`,
};
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-credentials-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});
function makeRouter(db: Awaited<ReturnType<typeof openInMemory>>) {
  return new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'test',
    folderName: 'Teste',
    author: 'Pessoa',
    workspaceDir: dir,
    homeDir: path.join(dir, 'home'),
    attachmentsDir: path.join(dir, 'attachments'),
  });
}
describe('credenciais locais e referências MCP', () => {
  it('o editor não lê nem sobrescreve o arquivo MCP nativo com segredos (só a biblioteca do board é editável)', async () => {
    const db = await openInMemory(wasm);
    const router = makeRouter(db);
    const file = path.join(dir, '.mcp.json');
    const content = JSON.stringify({ mcpServers: { private: definition } });
    fs.writeFileSync(file, content);
    router.refreshHarness();
    expect(() => router.readHarnessFile(file)).toThrow('Arquivo fora do harness.');
    expect(fs.readFileSync(file, 'utf8')).toBe(content);
    db.close();
  });
  it('logs e resposta final não devolvem credenciais conhecidas do host', async () => {
    const db = await openInMemory(wasm);
    const router = makeRouter(db);
    router.handle({ type: 'harness.library.save', input: { kind: 'mcp', name: 'local', description: '', body: '', server: definition } });
    const lines: string[] = [];
    let feed!: (text: string, stream: 'stdout' | 'stderr') => void;
    let exit!: (code: number) => void;
    const gateway = new AiGateway({
      boardId: router.boardId,
      runLog: createRunLog(db),
      redact: (text) => router.redactCredentials(text),
      spawn: (_command, _cwd, out) => {
        feed = out;
        return {
          kill: () => exit(143),
          onExit: (fn) => {
            exit = fn;
          },
        };
      },
    });
    const execution = gateway.run({
      origin: 'manual',
      tool: 'claude',
      context: NO_CARD,
      cwd: dir,
      timeoutMinutes: 1,
      log: (text) => lines.push(text),
      prepare: () => ({
        input: { permission: 'board', prompt: 'Sem valores privados.' },
        config: { model: null, effort: null, profile: null, agent: null, autonomous: false, clean: true, skills: [], mcp: [] },
      }),
    });
    let result: AiRunEnd | undefined;
    execution.onExit((end) => {
      result = end;
    });
    feed(`Falha remota: ${sentinel}\n`, 'stderr');
    feed(
      JSON.stringify({ type: 'result', subtype: 'success', result: `Resposta ${sentinel}`, usage: { input_tokens: 2, output_tokens: 1 } }) +
        '\n',
      'stdout',
    );
    exit(0);
    expect(lines.join('\n')).not.toContain(sentinel);
    expect(result?.report.answer).not.toContain(sentinel);
    expect(result?.report.answer).toContain('[credencial local]');
    db.close();
  });
  it('reabre o cofre, protege todos os campos e recusa outro dono, referência inválida ou bytes adulterados', () => {
    const root = path.join(dir, 'vault');
    const store = new LocalCredentials(root);
    const ref = store.put('mcp:board:one', definition);
    expect(fs.readFileSync(path.join(root, `${ref}.json`), 'utf8')).not.toContain(sentinel);
    expect(new LocalCredentials(root).get('mcp:board:one', ref)).toEqual(definition);
    expect(store.get('mcp:board:two', ref)).toBeNull();
    expect(store.has('mcp:board:two', ref)).toBe(false);
    expect(store.get('mcp:board:one', '../../key')).toBeNull();
    const envelope = JSON.parse(fs.readFileSync(path.join(root, `${ref}.json`), 'utf8'));
    envelope.tag = Buffer.alloc(16).toString('base64');
    fs.writeFileSync(path.join(root, `${ref}.json`), JSON.stringify(envelope));
    expect(store.get('mcp:board:one', ref)).toBeNull();
    if (process.platform !== 'win32') {
      expect(fs.statSync(root).mode & 0o777).toBe(0o700);
      expect(fs.statSync(path.join(root, 'key')).mode & 0o777).toBe(0o600);
      expect(fs.statSync(path.join(root, `${ref}.json`)).mode & 0o777).toBe(0o600);
    }
  });
  it('reabrir o SQLite mantém referências e resolve apenas no host, sem devolver valores ao editor', async () => {
    const file = path.join(dir, 'board.db');
    const first = await openFile(file, wasm);
    const router = makeRouter(first.db);
    router.handle({
      type: 'harness.library.save',
      input: { kind: 'mcp', name: 'local', description: 'Privado', body: '', server: definition },
    });
    const artifact = router.snapshot().harness.library!.artifacts.find((a) => a.kind === 'mcp')!;
    expect(JSON.stringify(router.snapshot())).not.toContain(sentinel);
    expect(JSON.stringify(router.readLibraryArtifact(artifact.id))).not.toContain(sentinel);
    expect(router.readLibraryArtifact(artifact.id).server).toBeUndefined();
    expect(router.libraryMcpDefinitions().local).toEqual(definition);

    await first.close();
    expect(fs.readFileSync(file).includes(Buffer.from(sentinel))).toBe(false);
    const second = await openFile(file, wasm);
    const reopened = makeRouter(second.db);
    expect(reopened.libraryMcpDefinitions().local).toEqual(definition);
    const current = reopened.readLibraryArtifact(artifact.id);
    reopened.handle({ type: 'harness.library.save', input: { ...current, description: 'Editada sem receber o segredo' } });
    expect(reopened.libraryMcpDefinitions().local).toEqual(definition);
    await second.close();
  });
  it('migração preserva o JSON original se o cofre falhar, e só troca por referência depois de salvar', async () => {
    const db = await openInMemory(wasm);
    const router = makeRouter(db);
    const meta = JSON.stringify({ server: definition });
    run(
      db,
      "INSERT INTO board_artifacts (id, board_id, kind, name, meta_json, usage, created_at, updated_at) VALUES ('old', ?, 'mcp', 'old', ?, 'always', 1, 1)",
      [router.boardId, meta],
    );
    bindCredentials(db, {
      put: () => {
        throw new Error('disco cheio');
      },
      get: () => null,
      has: () => false,
      redact: (text) => text,
    });
    expect(() => new ArtifactRepo(db)).toThrow('disco cheio');
    expect(all(db, "SELECT meta_json FROM board_artifacts WHERE id = 'old'")[0]!.meta_json).toBe(meta);
    bindCredentials(db, new LocalCredentials(path.join(dir, 'vault')));
    const repo = new ArtifactRepo(db);
    expect(repo.mcpDefinitions(router.boardId).old).toEqual(definition);
    expect(JSON.stringify(all(db, 'SELECT * FROM board_artifacts'))).not.toContain(sentinel);
    expect(Buffer.from(db.export()).includes(Buffer.from(sentinel))).toBe(false);
    db.close();
  });
  it('export preserva a referência e import bloqueia mesmo com o cofre disponível até nova revisão humana', async () => {
    const db = await openInMemory(wasm);
    const router = makeRouter(db);
    router.handle({ type: 'harness.library.save', input: { kind: 'mcp', name: 'local', description: '', body: '', server: definition } });
    const artifact = router.snapshot().harness.library!.artifacts.find((a) => a.kind === 'mcp')!;
    router.handle({ type: 'harness.selection.set', items: [{ kind: 'mcp', location: 'board:local' }], usage: 'always' });
    const file = exportBoard(db, router.boardId, router.store, { extensionVersion: 'test' }).file;
    expect(JSON.stringify(file)).not.toContain(sentinel);
    expect(file.tables.board_artifacts!.find((r) => r.id === artifact.id)!.secret_ref).toBe(artifact.mcpCredential!.secretRef);
    importBoard({ db, store: router.store, boardId: router.boardId, workspaceKey: 'test' }, file);
    router.refreshHarness();
    expect(router.libraryMcpDefinitions()).toEqual({});
    expect(router.snapshot().harness.library!.artifacts.find((a) => a.id === artifact.id)!.mcpCredential).toMatchObject({
      available: true,
      review: 'pending',
    });
    const state = router.snapshot();
    const type = state.cardTypes[0]!;
    const card = router.createCard({
      typeId: type.id,
      columnId: state.columns.find((c) => c.workflowId === type.defaultWorkflowId)!.id,
      parentId: null,
      title: 'Não executar',
    });
    expect(() =>
      executionPlan(
        router.snapshot(),
        router.snapshot().cards.find((c) => c.id === card)!,
        router.libraryMcpDefinitions(),
        { command: 'node', args: [] },
      ),
    ).toThrow('revisão humana');
    const input = router.readLibraryArtifact(artifact.id);
    expect(() => router.handle({ type: 'harness.library.save', input: { ...input, server: definition } }, { source: 'ai' })).toThrow(
      'revisão humana',
    );
    router.handle({ type: 'harness.library.save', input: { ...input, server: definition } });
    expect(router.libraryMcpDefinitions().local).toEqual(definition);
    // Mesmo com metadados disponíveis, falha ao resolver o cofre não pode retirar um MCP obrigatório.
    expect(() => bareExec(null, { command: 'node', args: [] }, router.snapshot(), {})).toThrow('configuração local');

    const fresh = await openInMemory(wasm);
    const elsewhere = makeRouter(fresh);
    importBoard({ db: fresh, store: elsewhere.store, boardId: elsewhere.boardId, workspaceKey: 'test' }, file);
    expect(new ArtifactRepo(fresh).mcpDefinitions(router.boardId)).toEqual({});
    expect(credentialsFor(fresh).has(JSON.stringify(['mcp', router.boardId, artifact.id]), artifact.mcpCredential!.secretRef)).toBe(false);
    fresh.close();
    db.close();
  });
});
