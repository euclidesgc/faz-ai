import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openInMemory } from '../src/extension/db/database';
import { AiProfileRepo } from '../src/extension/repositories/aiProfileRepo';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { runContextScope, type ContextScopeDeps } from '../src/extension/ai/contextScope';
import { contextScopeState, type ContextLocationResult, type ContextScopeReport } from '../src/shared/contextScope';

let dir: string;
let project: string;
let home: string;
let db: Awaited<ReturnType<typeof openInMemory>>;
let router: MessageRouter;
let repo: AiProfileRepo;

const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-context-scope-'));
  home = path.join(dir, 'home');
  project = path.join(home, 'projeto');
  write(path.join(project, 'CLAUDE.md'), '# Projeto\nToda história que muda a execução de um card ganha um cenário novo em test.\n');
  write(path.join(project, 'README.md'), '# Leia\nEste projeto mostra um board que conduz a IA pelas fases de cada história.\n');
  write(path.join(home, '.foo', 'FOO.md'), 'Prefira respostas curtas e diretas quando a pessoa pedir só uma confirmação.\n');
  db = await openInMemory(path.resolve(__dirname, '../node_modules/sql.js/dist'));
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'context-scope',
    folderName: 'Projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(dir, 'attachments'),
    workspaceDir: project,
    homeDir: home,
  });
  repo = new AiProfileRepo(db);
});
afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const DISCOVERY = JSON.stringify({
  tool: 'Claude Code',
  locations: [
    { path: 'CLAUDE.md', scope: 'project', kind: 'instructions', loads: 'always' },
    { path: '.foo/rules/*.md', scope: 'project', kind: 'rules', loads: 'always' },
    { path: '.foo/agents/*.md', scope: 'project', kind: 'agent', loads: 'on-demand' },
    { path: '~/.foo/FOO.md', scope: 'user', kind: 'instructions', loads: 'always' },
    { path: '~/.foo/ausente.md', scope: 'user', kind: 'instructions', loads: 'always' },
    { path: '.foo/settings.json', scope: 'project', kind: 'settings', loads: 'always' },
    { path: '~/.foo/<projeto>/MEMORY.md', scope: 'user', kind: 'memory', loads: 'always' },
  ],
});

/**
 * Um agente de mentira: carrega sozinho os arquivos de `loads` (relativos à pasta da execução) e responde ao pedido
 * de citação com as linhas que começam com cada trecho, procurando no que carregou e no bloco de controle.
 */
function fakeGateway(loads: string[], opts: { usedTools?: boolean; discovery?: string } = {}) {
  const calls: { cwd: string; prompt: string; input: Record<string, unknown>; origin: string }[] = [];
  const gateway = {
    run: (call: any) => {
      const prepared = call.prepare();
      const prompt: string = prepared.input.prompt;
      calls.push({ cwd: call.cwd, prompt, input: prepared.input, origin: call.origin });
      let answer: string;
      if (prompt.includes('Liste os arquivos e pastas')) answer = `Aqui está:\n${opts.discovery ?? DISCOVERY}`;
      else {
        const loaded: string[] = [];
        for (const pattern of loads) {
          const base = path.join(call.cwd, path.dirname(pattern));
          const re = new RegExp(`^${path.basename(pattern).replace('.', '\\.').replace('*', '.*')}$`);
          for (const f of fs.existsSync(base) ? fs.readdirSync(base) : [])
            if (re.test(f)) loaded.push(fs.readFileSync(path.join(base, f), 'utf8'));
        }
        const control = prompt.split('Bloco de controle:\n')[1]!.split('\n')[0]!;
        const lines = [...loaded.join('\n').split('\n'), control].map((l) => l.replace(/^\s*[-*]\s+/, ''));
        answer = [...prompt.matchAll(/^(t\d+): "(.+)"$/gm)]
          .map(([, id, head]) => `${id}: ${lines.find((l) => l.startsWith(head!)) ?? 'NÃO ENCONTREI'}`)
          .join('\n');
      }
      return {
        onExit: (fn: (end: unknown) => void) =>
          queueMicrotask(() =>
            fn({
              outcome: 'done',
              timedOut: false,
              report: { answer, inventory: opts.usedTools ? [{ kind: 'tool', name: 'Read', calls: 1 }] : [] },
            }),
          ),
      };
    },
  };
  return { gateway, calls };
}

/** Valores diferentes a cada chamada, sempre os mesmos de uma execução a outra. */
const counter = () => {
  let i = 0;
  return () => (i++ * 0.6180339887) % 1;
};

const deps = (gateway: unknown, extra: ContextScopeDeps['extra'] = () => []): ContextScopeDeps => ({
  repo,
  gateway: gateway as never,
  boardId: () => router.boardId,
  cwd: project,
  homeDir: home,
  version: () => '2.1.296',
  extra,
  random: counter(),
});

const byPath = (r: ContextScopeReport, p: string): ContextLocationResult => r.locations.find((l) => l.path === p)!;

describe('contexto do card no host', () => {
  it('descobre pelo agente, cita o que existe no projeto e na pasta pessoal e usa iscas para o que falta no projeto', async () => {
    // o agente carrega o CLAUDE.md do projeto e as regras de .foo/rules; o resto, não
    const { gateway, calls } = fakeGateway(['CLAUDE.md', '.foo/rules/*.md']);
    const report = await runContextScope(deps(gateway), 'claude');

    expect(report).toMatchObject({ profileId: 'claude', version: '2.1.296', discovered: true, control: true });
    expect(byPath(report, 'CLAUDE.md').verdict).toEqual({ state: 'leaks', how: 'quote', files: ['CLAUDE.md'] });
    // não existe no projeto: a isca na pasta descartável mostra que ele carregaria
    expect(byPath(report, '.foo/rules/*.md').verdict).toEqual({ state: 'leaks', how: 'canary', files: ['.foo/rules/fazai-teste.md'] });
    expect(byPath(report, '.foo/agents/*.md').verdict).toEqual({ state: 'controlled', how: 'canary' });
    expect(byPath(report, '~/.foo/FOO.md').verdict).toEqual({ state: 'controlled', how: 'quote' });
    expect(byPath(report, '~/.foo/ausente.md').verdict).toEqual({ state: 'untested', reason: 'missing-user' });
    expect(byPath(report, '.foo/settings.json').verdict).toEqual({ state: 'untested', reason: 'not-text' });
    expect(byPath(report, '~/.foo/<projeto>/MEMORY.md').verdict).toEqual({ state: 'untested', reason: 'pattern' });
    // o arquivo de instrução do projeto que o agente não citou também é conferido
    expect(byPath(report, 'README.md')).toMatchObject({ source: 'project', verdict: { state: 'controlled', how: 'quote' } });
    // a pasta pessoal só foi lida: nenhuma isca nela
    expect(fs.readdirSync(path.join(home, '.foo')).sort()).toEqual(['FOO.md']);

    // descoberta, citação no projeto e citação das iscas; todas como o teste do perfil, sem ferramentas
    expect(calls).toHaveLength(3);
    expect(calls.map((c) => c.origin)).toEqual(['test', 'test', 'test']);
    expect(calls[0]!.cwd).toBe(project);
    expect(calls[1]!.cwd).toBe(project);
    expect(calls[2]!.cwd).not.toBe(project);
    expect(fs.existsSync(calls[2]!.cwd)).toBe(false);
    expect(calls[1]!.input).toMatchObject({ permission: 'board', draftOnly: true, exec: { tools: [], toolSet: 'explicit' } });
    expect(JSON.parse((calls[1]!.input.exec as { mcpConfig: string }).mcpConfig)).toEqual({ mcpServers: {} });
  });

  it('no modo API é fechado por construção: nenhum pedido ao modelo, nenhum gasto', async () => {
    const { gateway, calls } = fakeGateway([]);
    // um perfil qualquer no modo API (o Gemini pronto nasce desligado e não resolve)
    const api = { ...repo.resolveProfile(router.boardId, 'claude'), id: 'gemini', mode: 'api' as const };
    const report = await runContextScope({ ...deps(gateway), repo: { resolveProfile: () => api } }, 'gemini');
    expect(calls).toHaveLength(0);
    expect(report).toMatchObject({ profileId: 'gemini', byConstruction: true, locations: [] });
    expect(contextScopeState(report)).toBe('closed');
  });

  it('com o agente usando ferramentas, nada vira prova', async () => {
    const { gateway } = fakeGateway(['CLAUDE.md'], { usedTools: true });
    const report = await runContextScope(deps(gateway), 'claude');
    expect(report.control).toBe(false);
    expect(byPath(report, 'CLAUDE.md').verdict).toEqual({ state: 'untested', reason: 'used-tools' });
  });

  it('o local acrescentado pela pessoa entra no teste, mesmo com o agente sem resposta legível', async () => {
    write(path.join(project, 'NOTAS.md'), 'Sempre rode o validate completo antes de concluir uma história do board.\n');
    const { gateway } = fakeGateway(['NOTAS.md'], { discovery: 'não sei' });
    const report = await runContextScope(
      deps(gateway, () => [{ path: 'NOTAS.md', scope: 'project', kind: 'instructions', loads: null, source: 'person' }]),
      'claude',
    );
    expect(report.discovered).toBe(false);
    expect(byPath(report, 'NOTAS.md')).toMatchObject({ source: 'person', verdict: { state: 'leaks' } });
  });
});

describe('contexto do card no router', () => {
  it('grava o teste fora da exportação, publica no estado e guarda os locais da pessoa; a IA não mexe', async () => {
    const report: ContextScopeReport = { profileId: 'claude', version: '1', at: 1, discovered: true, control: true, locations: [] };
    router.setAiProfileRuntime({
      probe: async () => ({ type: 'aiProfiles.status', profiles: {} }),
      test: async (id) => ({ type: 'aiProfiles.testResult', id, ok: true, output: '' }),
      contextScope: async () => report,
    });
    const pending = router.runContextScope('claude');
    expect(router.snapshot().contextScopeRunning).toEqual(['claude']);
    await expect(router.runContextScope('claude')).rejects.toThrow('em curso');
    await pending;
    expect(router.snapshot()).toMatchObject({ contextScopes: { claude: report }, contextScopeRunning: [] });

    router.handle({
      type: 'settings.aiProfiles.contextLocation',
      id: 'claude',
      op: 'add',
      location: { path: ' `~/.foo/EXTRA.md` ', scope: 'project', kind: 'rules' },
    });
    expect(router.snapshot().contextExtra).toEqual({
      claude: [{ path: '~/.foo/EXTRA.md', scope: 'user', kind: 'rules', loads: null, source: 'person' }],
    });
    router.handle({
      type: 'settings.aiProfiles.contextLocation',
      id: 'claude',
      op: 'remove',
      location: { path: '~/.foo/EXTRA.md', scope: 'user', kind: 'rules' },
    });
    expect(router.snapshot().contextExtra).toEqual({ claude: [] });
    expect(() =>
      router.handle(
        {
          type: 'settings.aiProfiles.contextLocation',
          id: 'claude',
          op: 'add',
          location: { path: 'X.md', scope: 'project', kind: 'rules' },
        },
        { source: 'ai' },
      ),
    ).toThrow('revisão humana');
  });
});
