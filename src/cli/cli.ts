/**
 * Faz AI fora do editor: abre o board de uma pasta no navegador, com o servidor MCP, a execução da
 * IA e o heartbeat, sem precisar do VS Code aberto.
 *
 *   faz-ai [pasta] [--port <n>] [--data <pasta de dados>] [--no-open]
 */
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { createBoardHost } from '../extension/host/boardHost';
import { startMcpServer } from '../extension/mcp/server';
import { socketPath, workspaceKey } from '../extension/mcp/socketPath';
import { ViewStateStore, type Memento } from '../extension/viewState';
import { openWithSystem, revealInSystem } from '../extension/web/osOpen';
import { preferredPort, startWebServer } from '../extension/web/webServer';

declare const FAZAI_VERSION: string;

const HELP = `Faz AI ${FAZAI_VERSION}: board kanban para desenvolvimento com IA, no navegador.

Uso: faz-ai [pasta] [opções]

  pasta            pasta do projeto (padrão: a pasta atual)
  --port <n>       porta do board no navegador (padrão: uma porta fixa por pasta)
  --data <pasta>   onde ficam os boards e anexos (padrão: FAZAI_DATA ou os mesmos dados da extensão do editor)
  --no-open        não abre o navegador; só mostra o endereço
  -h, --help       mostra esta ajuda
`;

/** Pasta de dados: a da extensão no editor, quando existe (o board é o mesmo), ou ~/.faz-ai/data. */
function defaultDataDir(): string {
  const home = os.homedir();
  const appData = process.platform === 'darwin' ? path.join(home, 'Library', 'Application Support') : process.platform === 'win32' ? process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming') : process.env.XDG_CONFIG_HOME ?? path.join(home, '.config');
  for (const editor of ['Code', 'Code - Insiders', 'Cursor', 'Windsurf', 'VSCodium']) {
    const dir = path.join(appData, editor, 'User', 'globalStorage', 'euclidesgc.faz-ai');
    if (fs.existsSync(dir)) return dir;
  }
  return path.join(home, '.faz-ai', 'data');
}

function fileMemento(file: string): Memento {
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch {
    /* primeiro uso */
  }
  return {
    get: <T>(key: string) => data[key] as T | undefined,
    update(key, value) {
      data[key] = value;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(data));
    },
  };
}

const socketAlive = (address: string): Promise<boolean> =>
  new Promise((resolve) => {
    const probe = net.connect(address);
    probe.once('connect', () => {
      probe.destroy();
      resolve(true);
    });
    probe.once('error', () => resolve(false));
  });

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('-h') || args.includes('--help')) return void process.stdout.write(HELP);
  if (args.includes('--version')) return void process.stdout.write(`${FAZAI_VERSION}\n`);
  const option = (name: string): string | undefined => {
    const i = args.indexOf(name);
    if (i < 0) return undefined;
    const value = args[i + 1];
    if (!value || value.startsWith('--')) throw new Error(`Falta o valor de ${name}.`);
    args.splice(i, 2);
    return value;
  };
  const port = option('--port');
  const dataDir = path.resolve(option('--data') ?? process.env.FAZAI_DATA ?? defaultDataDir());
  const noOpen = args.includes('--no-open');
  const unknown = args.find((a) => a.startsWith('-') && a !== '--no-open');
  if (unknown) throw new Error(`Opção desconhecida: ${unknown}. Veja faz-ai --help.`);
  const folderPath = fs.realpathSync(path.resolve(args.find((a) => !a.startsWith('-')) ?? process.cwd()));
  if (!fs.statSync(folderPath).isDirectory()) throw new Error(`"${folderPath}" não é uma pasta.`);

  // o editor já serve o board desta pasta: dois processos gravando o mesmo banco perderiam dados
  const address = socketPath(folderPath);
  if (await socketAlive(address)) {
    throw new Error(`O board de "${folderPath}" já está aberto em outro lugar (uma janela do editor ou outro faz-ai).\nNo editor, use o comando "Faz AI: Abrir board no navegador" para ver este mesmo board no navegador.`);
  }

  const distDir = __dirname;
  const log = (line: string) => process.stdout.write(`${new Date().toLocaleTimeString()} ${line}\n`);
  const bridgePath = path.join(dataDir, 'mcp', 'bridge.js');
  fs.mkdirSync(path.dirname(bridgePath), { recursive: true });
  fs.copyFileSync(path.join(distDir, 'mcp-bridge.js'), bridgePath);

  const host = await createBoardHost({ storageDir: dataDir, wasmDir: distDir, folderPath, folderName: path.basename(folderPath), bridgePath, log });
  const { router, runner, heartbeat } = host;
  const stopMcp = await startMcpServer(address, { getRouter: async () => router, workspaceDir: folderPath, version: FAZAI_VERSION });
  const key = workspaceKey(folderPath);
  const viewState = new ViewStateStore(fileMemento(path.join(dataDir, 'view', `${key}.json`)));

  const web = await startWebServer({
    webviewDir: path.join(distDir, 'webview'),
    router,
    viewState,
    port: port ? Number(port) : preferredPort(key),
    tokenFile: path.join(os.homedir(), '.faz-ai', 'web-token'),
    iconFile: path.join(distDir, '..', 'media', 'icon.png'),
    env: {
      connectAI() {
        const { message, toIgnore } = host.connectAI();
        return toIgnore.length ? `${message} Esses arquivos guardam caminhos desta máquina: considere colocar no .gitignore: ${toIgnore.join(', ')}.` : message;
      },
      runAi: (cardId) => runner.start(cardId),
      stopAi: (cardId) => runner.stop(cardId),
      runHeartbeat() {
        const n = heartbeat.runNow();
        return n ? `A IA vai tratar ${n} história(s) com pendência. O andamento aparece nos cards.` : 'Nada pendente com a IA.';
      },
      openFolder: openWithSystem,
      openFile: openWithSystem,
      openExternal: openWithSystem,
      revealFile: revealInSystem,
    },
  });

  const timer = setInterval(() => heartbeat.tick(), 60_000);
  // regras e skills editadas por fora aparecem no board
  const refresh = setInterval(() => router.refreshHarness(), 15_000);

  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    clearInterval(timer);
    clearInterval(refresh);
    web.close();
    stopMcp();
    await host.dispose();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  process.stdout.write(`\nFaz AI ${FAZAI_VERSION}\nBoard:  ${router.snapshot().board.name} (${folderPath})\nAbra:   ${web.url}\n\nA IA do projeto alcança o board por este processo: deixe-o rodando. Ctrl+C encerra.\n\n`);
  if (!noOpen) openWithSystem(web.url);
}

main().catch((e) => {
  process.stderr.write(`faz-ai: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
