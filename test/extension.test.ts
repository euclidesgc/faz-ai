import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { fake, fakeConfig, Uri } from './fakes/vscode';
import type { BoardState } from '../src/shared/model';

/**
 * Ponta a ponta da extensão com um editor de mentira: ativa, abre o board, cria um card pela
 * interface, serve o mesmo board no navegador e encerra gravando o banco da pasta.
 */
let root: string;
let home: string;
let project: string;
let storage: string;
let extensionDir: string;

const wait = async (ok: () => boolean, what: string) => {
  for (let i = 0; i < 200; i++) {
    if (ok()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`não aconteceu a tempo: ${what}`);
};

beforeEach(() => {
  // caminho curto e sem links: o socket do servidor MCP fica na home e tem limite de tamanho
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fz-')));
  home = path.join(root, 'home');
  project = path.join(root, 'projeto');
  storage = path.join(root, 'dados');
  extensionDir = path.join(root, 'ext');
  for (const d of [home, project, storage, path.join(extensionDir, 'dist', 'webview'), path.join(extensionDir, 'media')])
    fs.mkdirSync(d, { recursive: true });
  fs.copyFileSync(path.resolve(__dirname, '../node_modules/sql.js/dist/sql-wasm.wasm'), path.join(extensionDir, 'dist', 'sql-wasm.wasm'));
  fs.writeFileSync(path.join(extensionDir, 'dist', 'mcp-bridge.js'), '// ponte');
  fs.writeFileSync(path.join(extensionDir, 'dist', 'cli.js'), '// cli');
  fs.writeFileSync(path.join(extensionDir, 'dist', 'webview', 'main.js'), '// interface');
  execFileSync('git', ['init', '-q'], { cwd: project });
  // no POSIX a home vem de $HOME: nada do teste toca a home de verdade
  vi.stubEnv('HOME', home);
  vi.stubEnv('SHELL', '/bin/sh');
  fake.reset();
  fake.folder = project;
});

afterEach(() => {
  // fecha os painéis como o editor faria: o BoardPanel é estático e sobreviveria ao próximo teste
  for (const panel of fake.panels) panel.dispose();
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});

/** Ativa a extensão com um `context` de mentira apontando para as pastas temporárias do teste. */
const activateExtension = async () => {
  const { activate, deactivate } = await import('../src/extension/extension');
  const memory = new Map<string, unknown>();
  const memento = { get: (k: string) => memory.get(k), update: (k: string, v: unknown) => Promise.resolve(void memory.set(k, v)) };
  const context = {
    globalStorageUri: Uri.file(storage),
    extensionPath: extensionDir,
    extensionUri: Uri.file(extensionDir),
    extension: { packageJSON: { version: '9.9.9' } },
    workspaceState: memento,
    globalState: memento,
    subscriptions: [] as unknown[],
  };
  await activate(context as never);
  return { deactivate };
};

it.skipIf(process.platform === 'win32')('ativa, abre o board, cria um card, serve no navegador e grava ao encerrar', async () => {
  const { deactivate } = await activateExtension();

  for (const id of [
    'fazai.openBoard',
    'fazai.openInBrowser',
    'fazai.connectAI',
    'fazai.ai.run',
    'fazai.ai.stop',
    'fazai.heartbeat.runNow',
    'fazai.autopilot.resume',
    'fazai.upgradeBoard',
    'fazai.showLog',
  ])
    expect(fake.commands.has(id), id).toBe(true);
  // o atalho de terminal aponta para esta versão e para os mesmos dados
  const launcher = fs.readFileSync(path.join(home, '.faz-ai', 'bin', 'faz-ai'), 'utf8');
  expect(launcher).toContain(path.join(extensionDir, 'dist', 'cli.js'));
  expect(launcher).toContain(storage);
  expect(fs.statSync(path.join(home, '.faz-ai', 'bin', 'faz-ai')).mode & 0o111).toBeTruthy();

  // abrir o board cria o painel; a interface avisa que está pronta e recebe o board
  await fake.commands.get('fazai.openBoard')!();
  const { webview } = fake.panels[0]!;
  expect(webview.html).toContain('data-host="vscode"');
  webview.receive({ type: 'ready' });
  await wait(() => webview.posted.some((m) => (m as { type: string }).type === 'boardState'), 'board enviado ao painel');
  const state = (
    webview.posted.find((m) => (m as { type: string }).type === 'boardState') as { state: import('../src/shared/model').BoardState }
  ).state;
  expect(state.board.name).toBe('projeto');

  const wf = state.workflows.find((w) => w.kind === 'parent')!;
  webview.receive({
    type: 'card.create',
    typeId: state.cardTypes.find((t) => t.defaultWorkflowId === wf.id)!.id,
    columnId: state.columns.find((c) => c.workflowId === wf.id)!.id,
    parentId: null,
    title: 'Card pelo editor',
  });
  const titles = () =>
    (
      webview.posted.filter((m) => (m as { type: string }).type === 'boardState').at(-1) as {
        state: import('../src/shared/model').BoardState;
      }
    ).state.cards.map((c) => c.title);
  await wait(() => titles().includes('Card pelo editor'), 'card criado');

  // o mesmo board, no navegador: o endereço aberto entrega a página a quem tem o segredo
  webview.receive({ type: 'ui.openInBrowser' });
  await wait(() => fake.opened.length > 0, 'navegador aberto');
  const url = new URL(fake.opened[0]!);
  expect(url.hostname).toBe('127.0.0.1');
  const status = await new Promise<number>((resolve, reject) =>
    http.get(url, (res) => (res.resume(), resolve(res.statusCode ?? 0))).on('error', reject),
  );
  expect(status).toBe(302);
  expect(fake.messages.filter((m) => m.kind === 'error')).toEqual([]);

  await deactivate();
  // cada pasta grava no seu próprio banco
  const boards = fs.readdirSync(path.join(storage, 'boards'));
  expect(boards).toHaveLength(1);
  expect(fs.statSync(path.join(storage, 'boards', boards[0]!)).size).toBeGreaterThan(1000);
  expect(fs.existsSync(path.join(storage, 'fazai.db'))).toBe(false);
});

it.skipIf(process.platform === 'win32')('comandos de ida e volta entre o board e o Settings do editor', async () => {
  const { deactivate } = await activateExtension();
  const opened: unknown[][] = [];
  fake.commands.set('workbench.action.openSettings', (...args) => void opened.push(args));

  await fake.commands.get('fazai.openIdeSettings')!();
  await fake.commands.get('fazai.openIdeSettings')!('fazai.appearance.language');
  expect(opened).toEqual([['@ext:euclidesgc.faz-ai'], ['@id:fazai.appearance.language']]);

  // sem painel: o comando abre o board e a mensagem espera o ready
  await fake.commands.get('fazai.openBoardSettings')!({ tab: 'harness' });
  const { webview } = fake.panels[0]!;
  expect(webview.posted.some((m) => (m as { type: string }).type === 'ui.openSettings')).toBe(false);
  webview.receive({ type: 'ready' });
  await wait(() => webview.posted.some((m) => (m as { type: string }).type === 'ui.openSettings'), 'aba enviada ao painel');
  expect(webview.posted.find((m) => (m as { type: string }).type === 'ui.openSettings')).toEqual({
    type: 'ui.openSettings',
    tab: 'harness',
    section: undefined,
  });

  // painel aberto: posta na hora; aba inválida cai na padrão
  await fake.commands.get('fazai.openBoardSettings')!({ tab: 'nada' });
  expect(webview.posted.at(-1)).toEqual({ type: 'ui.openSettings', tab: 'columns', section: undefined });
  await fake.commands.get('fazai.openBoardSettings')!();
  expect(webview.posted.at(-1)).toEqual({ type: 'ui.openSettings', tab: 'columns', section: undefined });

  await fake.commands.get('fazai.openEnvironment')!();
  expect(webview.posted.at(-1)).toEqual({ type: 'ui.openView', view: 'environment' });

  // Settings → board: mudar o idioma no Settings chega ao SQLite e à webview
  fakeConfig.set('global', 'fazai.appearance.language', 'en');
  await wait(() => {
    const last = webview.posted.filter((m) => (m as { type: string }).type === 'boardState').at(-1) as { state: BoardState } | undefined;
    return last?.state.board.appearance.language === 'en';
  }, 'idioma do Settings refletido no board');
  await deactivate();
});
