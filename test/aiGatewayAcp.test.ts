// O gateway escolhe o transporte pelo perfil: `acpAgent` ⇒ `spawnAcp`; sem ele, a CLI de sempre.
// O ciclo do log de uso é o mesmo nos dois.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Database } from 'sql.js';
import { AiGateway, NO_CARD, type AiCall } from '../src/extension/ai/gateway';
import type { AcpSpawnFn } from '../src/extension/ai/acp/provider';
import type { SpawnFn } from '../src/extension/aiOutput/measured';
import { openInMemory } from '../src/extension/db/database';
import { AiRunRepo } from '../src/extension/log/aiRunRepo';
import { createRunLog } from '../src/extension/log/runLog';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { isAcpProfile, type AiProfile } from '../src/shared/aiProfiles';
import { monthOf } from '../src/shared/log';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');
let dir: string;
let db: Database;
let router: MessageRouter;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-gw-acp-'));
  db = await openInMemory(WASM_DIR);
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'Projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(dir, 'attachments'),
    workspaceDir: dir,
    homeDir: path.join(dir, 'home'),
  });
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const profile = (config: AiProfile['config']): AiProfile => ({
  id: 'gemini-acp',
  name: 'Gemini ACP',
  enabled: true,
  kind: 'builtin',
  base: 'generic',
  config,
  position: 9,
});

const call = (p: AiProfile): AiCall => ({
  origin: 'manual',
  tool: p.id,
  profile: p,
  context: NO_CARD,
  cwd: dir,
  timeoutMinutes: 30,
  prepare: () => ({
    input: { prompt: 'oi', permission: 'board' },
    config: { model: null, effort: null, profile: null, agent: null, autonomous: false, clean: false, skills: [], mcp: null },
  }),
  log: () => {},
});

describe('transporte escolhido pelo perfil', () => {
  it('isAcpProfile só vale para base generic com acpAgent', () => {
    expect(isAcpProfile(profile({ acpAgent: 'gemini' }))).toBe(true);
    expect(isAcpProfile(profile({}))).toBe(false);
  });

  it('perfil ACP usa spawnAcp e grava a linha do log como as CLIs', () => {
    const acp: { command: string }[] = [];
    let cli = 0;
    const spawn: SpawnFn = () => {
      cli++;
      return { onExit: () => {}, kill: () => {} };
    };
    let exit: (code: number | null) => void = () => {};
    const spawnAcp: AcpSpawnFn = (command) => {
      acp.push(command);
      return { write: () => {}, end: () => {}, onExit: (fn) => (exit = fn), kill: () => exit(143) };
    };
    const gw = new AiGateway({ boardId: router.boardId, runLog: createRunLog(db), spawn, spawnAcp });
    const run = gw.run(call(profile({ acpAgent: 'gemini' })));
    expect(cli).toBe(0);
    expect(acp[0]!.command).toBe('gemini');
    expect(new AiRunRepo(db).byMonth(monthOf(Date.now()))[0]).toMatchObject({ id: run.runId, outcome: null, tool: 'gemini-acp' });
    run.stop();
    exit(143);
    expect(new AiRunRepo(db).byMonth(monthOf(Date.now()))[0]).toMatchObject({ outcome: 'stopped' });
  });

  it('agente desconhecido ou host sem spawnAcp: recusa e fecha a linha como unsupported', () => {
    const spawn: SpawnFn = () => ({ onExit: () => {}, kill: () => {} });
    const spawnAcp: AcpSpawnFn = () => {
      throw new Error('não deveria iniciar');
    };
    const withAcp = new AiGateway({ boardId: router.boardId, runLog: createRunLog(db), spawn, spawnAcp });
    expect(() => withAcp.run(call(profile({ acpAgent: 'nao-existe' })))).toThrow(/desconhecido/);
    const without = new AiGateway({ boardId: router.boardId, runLog: createRunLog(db), spawn });
    expect(() => without.run(call(profile({ acpAgent: 'gemini' })))).toThrow(/ACP indisponível/);
    expect(new AiRunRepo(db).byMonth(monthOf(Date.now())).map((r) => r.outcome)).toEqual(['unsupported', 'unsupported']);
  });

  it('perfil ACP personalizado admitido é recusado: a admissão vincula a CLI one-shot, não o agente ACP', () => {
    let started = 0;
    const spawn: SpawnFn = () => {
      started++;
      return { onExit: () => {}, kill: () => {} };
    };
    const spawnAcp: AcpSpawnFn = () => {
      started++;
      throw new Error('não deveria iniciar');
    };
    const custom: AiProfile = {
      ...profile({ acpAgent: 'gemini' }),
      kind: 'custom',
      credentials: { review: 'reviewed', available: true },
    } as never;
    // a admissão de mentira admite tudo: a recusa tem de vir do gateway, não dela
    const admission = {
      prepare: (_p: unknown, _id: string, input: unknown) => ({ input, decision: { state: 'admitted' }, command: (c: unknown) => c }),
    } as never;
    const runLog = createRunLog(db);
    const gw = new AiGateway({ boardId: router.boardId, runLog, spawn, spawnAcp, admission });
    const strictCall: AiCall = {
      ...call(custom),
      prepare: () => ({ ...call(custom).prepare(), strict: { profileId: custom.id, request: { activeMcpIds: [] } as never } }),
    };
    expect(() => gw.run(strictCall)).toThrow(/admissão por capacidades ainda não cobre o transporte ACP/);
    expect(started).toBe(0);
  });
});
