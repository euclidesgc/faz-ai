// Cenário de ponta a ponta do Conectar (épica "ferramenta por modo", história 7): o Gemini pelo ACP, do
// `locate` até "Conectada", com o fluxo de verdade (`Connector`), o cofre de verdade (`ToolKeys` sobre o cofre
// do banco), o verificador de verdade (dois handshakes e o servidor MCP de teste), a leitura de modelos de
// verdade e o "Detectar" de verdade; depois, um card roda por esse perfil, pelo gateway e pela admissão de
// verdade, no regime que a ciência gravou. Só o processo do Gemini CLI é falso (`FakeGemini`, um processo por
// spawn, que guarda a chave só na memória, como a 0.65.0). E a chave: só no cofre e no `authenticate`.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Connector } from '../../src/extension/ai/connect';
import { acpAgent } from '../../src/extension/ai/acp/agents';
import { acpSessionModels } from '../../src/extension/ai/acp/models';
import { acpSignIn } from '../../src/extension/ai/acp/signIn';
import { verifyExecutor } from '../../src/extension/ai/capabilityVerifier';
import { profileSignedIn, profileVersion } from '../../src/extension/cliProbe';
import { resolveProfileCommand } from '../../src/extension/cliResolve';
import { exportBoard } from '../../src/extension/db/boardExport';
import { rememberModels } from '../../src/extension/models';
import { AiProfileRepo } from '../../src/extension/repositories/aiProfileRepo';
import type { ConnectState } from '../../src/shared/connect';
import { FakeGemini, type FakeAgent } from '../fakes/acpAgent';
import { cardWorld, CONDUTOR_TOOLS, type CardWorld } from './cardWorld';

const KEY = 'AIzaSy-chave-do-cenario-0123456789';
const gemini = acpAgent('gemini')!;

let world: CardWorld | undefined;
afterEach(() => {
  world?.dispose();
  world = undefined;
});

/** O Conectar montado como o host monta (`host/boardHost.ts`), sobre as peças do mundo do card. */
function connectorOf(w: CardWorld, agent: FakeGemini, published: ConnectState[]): Connector {
  const repo = new AiProfileRepo(w.db);
  const scratch = (what: string) => fs.mkdtempSync(path.join(w.root, `${what}-`));
  const authOf = (p: { id: string }) => {
    const apiKey = w.keys.get('gemini');
    return p.id === 'gemini' && apiKey ? { methodId: 'gemini-api-key', apiKey } : undefined;
  };
  const connector: Connector = new Connector({
    profile: (id) => w.router.snapshot().board.aiProfiles.find((p) => p.id === id) ?? null,
    enable: (id) => void w.router.handle({ type: 'settings.aiProfiles.setEnabled', id, enabled: true }),
    resolve: (id) => repo.resolveProfile(w.router.boardId, id),
    locate: (profile) => resolveProfileCommand(profile, w.bin, w.home),
    version: (profile, exe) => profileVersion(profile, exe, { pathEnv: w.bin }),
    signedIn: (profile, exe) => profileSignedIn(profile, exe, w.home, { pathEnv: w.bin, hasApiKey: (t) => w.keys.has(t) }),
    keys: w.keys,
    authenticate: (_profile, executable, auth) => acpSignIn(gemini, auth, { executable, cwd: scratch('signin'), spawn: agent.spawn }),
    verify: (id) => {
      const profile = repo.resolveProfile(w.router.boardId, id);
      return verifyExecutor({
        executor: profile,
        profileId: id,
        admission: w.admission,
        store: w.evidence,
        pathEnv: w.bin,
        spawn: () => {
          throw new Error('o Gemini pelo ACP não roda a CLI de uma passada');
        },
        spawnAgent: agent.spawn,
        acpAuth: authOf(profile),
      });
    },
    reviewOf: (id) => w.router.snapshot().board.runner.compatibilityReviews[id] ?? null,
    recordReview: (id) => w.router.recordCompatibilityReview(id),
    listModels: async (profile, executable) => {
      const found = await acpSessionModels(gemini, profile.id, scratch('models'), {
        executable,
        spawn: agent.spawn,
        auth: authOf(profile),
      });
      rememberModels(profile.id, found.options);
      w.router.handle({ type: 'settings.models.detect', tool: profile.id });
      return found.options.length;
    },
    save: (id, summary) => w.router.saveConnection(id, summary),
    saved: (id) => w.router.savedConnections()[id] ?? null,
    publish: (state) => {
      published.push(state);
      w.router.setConnections(connector.snapshot(['gemini']));
    },
    redact: (text) => w.router.redactCredentials(text),
  });
  return connector;
}

/** O turno do card: o agente lê, responde na conversa (o efeito do `add_comment`) e informa o consumo. */
const turn = (w: () => CardWorld) => async (agent: FakeAgent) => {
  // um agente que repete a chave no stderr (log de depuração): o gateway a mascara antes do canal
  agent.stderr(`[debug] usando a chave ${KEY}\n`);
  agent.update({ sessionUpdate: 'tool_call', toolCallId: 't1', title: 'Ler src/app.ts', kind: 'read', status: 'pending' });
  agent.update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Fase concluída.\n' } });
  w().router.handle({ type: 'comment.add', cardId: w().cardId, body: 'Trabalho da fase feito.' }, { author: 'Gemini CLI', source: 'ai' });
  return { stopReason: 'end_turn', usage: { inputTokens: 900, outputTokens: 120 } };
};

describe('cenário: Conectar o Gemini em ACP com a chave no cofre e rodar um card por ele', () => {
  it('locate → chave → authenticate → verify → ciência → modelos → Conectada; o card roda admitido, e a chave não vaza', async () => {
    const agent = new FakeGemini({ validKey: KEY, onPrompt: (a) => turn(() => world!)(a) });
    world = await cardWorld({ profile: 'gemini', tools: CONDUTOR_TOOLS, spawnAcp: agent.spawn, permission: 'edits', viaConnect: true });
    const w = world;
    const published: ConnectState[] = [];
    const connector = connectorOf(w, agent, published);
    // o perfil pronto nasce desligado; o Conectar o liga
    expect(w.router.snapshot().board.aiProfiles.find((p) => p.id === 'gemini')?.enabled).toBe(false);

    // 1. Conectar: acha o `gemini` no PATH, lê a versão e para no campo da chave
    expect(await connector.connect('gemini')).toMatchObject({
      step: 'signIn',
      status: 'waiting',
      needs: 'api-key',
      summary: { version: '0.65.0' },
    });
    expect(agent.processes).toHaveLength(0);

    // 2. a chave: cofre → authenticate (sondagem de login) → os dois handshakes do verificador, cada um autenticando
    expect(await connector.connect('gemini', { apiKey: KEY })).toMatchObject({
      step: 'review',
      status: 'waiting',
      needs: 'review',
      summary: { signIn: 'api-key', regime: 'compatible' },
    });
    expect(agent.methods()).toEqual([
      ['initialize', 'authenticate'],
      ['initialize', 'authenticate', 'session/new'],
      ['initialize', 'authenticate', 'session/new'],
    ]);
    // o regime ainda não foi aceito: o card seria recusado por falta da ciência
    expect(w.router.snapshot().board.runner.compatibilityReviews).toEqual({});

    // 3. a ciência ("Entendo o que a ferramenta carrega") e os modelos: Conectada
    const done = await connector.connect('gemini', { acknowledge: true });
    expect(done).toMatchObject({
      status: 'connected',
      summary: { version: '0.65.0', signIn: 'api-key', regime: 'compatible', reviewed: 1, models: 2 },
    });
    expect(w.router.snapshot().board.runner.compatibilityReviews).toEqual({ gemini: 1 });
    expect(w.router.snapshot().connections?.gemini?.status).toBe('connected');
    // os modelos da sessão entraram no catálogo do board: aparecem em todo campo de modelo
    const catalog = w.router
      .snapshot()
      .board.modelCatalog.filter((m) => m.tool === 'gemini')
      .map((m) => m.model);
    expect(catalog).toEqual(expect.arrayContaining(['gemini-2.5-pro', 'gemini-2.5-flash']));
    // o regime do board não mudou: a ciência é só do Gemini
    expect(w.router.snapshot().board.runner.admissionRegime).toBe('exclusive');

    // 4. um card pelo perfil conectado, pelo campo Modelo, com um modelo que o Conectar trouxe
    const field = w.router.snapshot().fieldDefs.find((f) => f.kind === 'model')!;
    w.router.handle({ type: 'field.setValue', cardId: w.cardId, fieldId: field.id, value: 'gemini:gemini-2.5-pro' });
    const end = await w.run();
    expect(end.outcome).toBe('done');
    const run = agent.processes.at(-1)!;
    // o processo do card autenticou com a chave do cofre antes da sessão (a chave fica só na memória dele)
    expect(run.methods()).toEqual(['initialize', 'authenticate', 'session/new', 'session/prompt']);
    expect(run.apiKey).toBe(KEY);
    expect(w.aiRun()).toMatchObject({ tool: 'gemini', outcome: 'done', mode: 'acp' });
    expect(w.aiRun()?.admission).toMatchObject({ regime: 'compatible', state: 'admitted' });
    expect(w.comments()).toContain('Trabalho da fase feito.');
    expect(w.lines.filter((l) => l.includes('[debug]'))).toEqual([expect.stringContaining('[debug] usando a chave [credencial local]')]);

    // a chave: em nenhuma linha do log, estado publicado, conversa, linha do ai_runs, banco nem exportação
    const exported = JSON.stringify(exportBoard(w.db, w.router.boardId, w.router.store, { extensionVersion: 'teste' }).file);
    const database = Buffer.from(w.db.export()).toString('latin1');
    for (const [where, text] of Object.entries({
      log: w.lines.join('\n'),
      published: JSON.stringify(published),
      snapshot: JSON.stringify(w.router.snapshot()),
      conversa: w.comments().join('\n'),
      ai_runs: JSON.stringify(w.aiRun()),
      exportacao: exported,
      banco: database,
      evidencias: fs
        .readdirSync(path.join(w.root, 'evidencias'), { recursive: true, withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => fs.readFileSync(path.join(e.parentPath, e.name), 'utf8'))
        .join('\n'),
    }))
      expect(text, where).not.toContain(KEY);
    // ela só passou pelo `stdin` dos processos do agente, no `authenticate`
    for (const p of agent.processes) {
      const lines = p.received.filter((m) => JSON.stringify(m).includes(KEY));
      expect(lines.map((m) => m.method)).toEqual(['authenticate']);
    }
  });

  it('sem a ciência, o card do Gemini não roda; com a chave errada, o Conectar para no login', async () => {
    const agent = new FakeGemini({ validKey: KEY });
    world = await cardWorld({ profile: 'gemini', tools: CONDUTOR_TOOLS, spawnAcp: agent.spawn, viaConnect: true });
    const connector = connectorOf(world, agent, []);
    const wrong = await connector.connect('gemini', { apiKey: 'AIzaSy-chave-errada-000000' });
    expect(wrong).toMatchObject({ step: 'signIn', status: 'waiting', needs: 'api-key' });
    expect(wrong.error).toMatch(/recusou a chave de API/);
    expect(wrong.error).not.toContain('AIzaSy-chave-errada-000000');
  });
});
