import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openFile, type DbHandle } from '../db/database';
import { Heartbeat } from '../heartbeat';
import { registerClients } from '../mcp/clientConfig';
import { workspaceKey } from '../mcp/socketPath';
import { AutoMerger } from '../merge';
import { MessageRouter } from '../panel/messageRouter';
import { AiRunner } from '../runner';
import { loginShellPath, spawnHeadless } from '../spawn';

export interface BoardHostOptions {
  /** pasta de dados do Faz AI (bancos e anexos) */
  storageDir: string;
  /** pasta com o sql-wasm.wasm */
  wasmDir: string;
  /** pasta do projeto */
  folderPath: string;
  folderName: string;
  /** caminho estável do bridge.js, entregue à ferramenta de IA para ela falar com o board */
  bridgePath: string;
  log(line: string): void;
}

/** O board de uma pasta em funcionamento: banco, roteador, executor da IA e heartbeat. Não depende da API do VSCode. */
export interface BoardHost {
  router: MessageRouter;
  runner: AiRunner;
  heartbeat: Heartbeat;
  /** registra o servidor MCP do board na ferramenta de IA do projeto e devolve o resumo do que foi feito */
  connectAI(): { message: string; toIgnore: string[] };
  addToGitignore(lines: string[]): void;
  dispose(): Promise<void>;
}

function gitUserName(cwd: string): Promise<string> {
  return new Promise((resolve) => {
    execFile('git', ['config', 'user.name'], { cwd, timeout: 3000 }, (err, stdout) => {
      const name = err ? '' : stdout.trim();
      resolve(name || os.userInfo().username || 'Eu');
    });
  });
}

/**
 * Arquivo do banco de uma pasta. Cada pasta tem o seu, para duas janelas (ou o editor e o navegador)
 * em projetos diferentes não gravarem uma por cima da outra. Na primeira vez, parte de uma cópia do
 * banco único das versões anteriores, que fica intacto.
 */
export function boardDbFile(storageDir: string, folderPath: string): string {
  const file = path.join(storageDir, 'boards', `${workspaceKey(folderPath)}.db`);
  const legacy = path.join(storageDir, 'fazai.db');
  if (!fs.existsSync(file) && fs.existsSync(legacy)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.copyFileSync(legacy, file);
  }
  return file;
}

export async function createBoardHost(o: BoardHostOptions): Promise<BoardHost> {
  const handle: DbHandle = await openFile(boardDbFile(o.storageDir, o.folderPath), o.wasmDir);
  const homeDir = os.homedir();
  const router = new MessageRouter(handle, {
    workspaceKey: workspaceKey(o.folderPath),
    folderName: o.folderName,
    author: await gitUserName(o.folderPath),
    attachmentsDir: path.join(o.storageDir, 'attachments'),
    workspaceDir: o.folderPath,
    homeDir,
  });
  const pathEnv = await loginShellPath();
  const runner = new AiRunner(router, {
    cwd: o.folderPath,
    homeDir,
    bridgePath: o.bridgePath,
    log: o.log,
    spawn: (command, cwd, log) => spawnHeadless(command, cwd, log, pathEnv),
  });
  new AutoMerger(router, {
    cwd: o.folderPath,
    log: o.log,
    gh: (args, cwd) =>
      new Promise((resolve, reject) => {
        execFile('gh', args, { cwd, timeout: 120_000, env: { ...process.env, ...(pathEnv ? { PATH: pathEnv } : {}) } }, (err, stdout, stderr) =>
          err ? reject(new Error((err as NodeJS.ErrnoException).code === 'ENOENT' ? 'o comando "gh" (GitHub CLI) não foi encontrado.' : stderr.trim() || err.message)) : resolve(stdout),
        );
      }),
  });
  const heartbeat = new Heartbeat(runner, { snapshot: () => router.snapshot(), now: () => Date.now(), log: o.log });

  const gitignore = path.join(o.folderPath, '.gitignore');
  return {
    router,
    runner,
    heartbeat,
    connectAI() {
      const done = registerClients([router.snapshot().board.aiTool], { bridgePath: o.bridgePath, workspaceDir: o.folderPath, homeDir });
      // arquivos do projeto guardam caminhos desta máquina, então normalmente não devem ir para o repositório
      const ignored = fs.existsSync(gitignore) ? fs.readFileSync(gitignore, 'utf8').split(/\r?\n/).map((l) => l.trim()) : [];
      const toIgnore = [...new Set(done.flatMap((d) => (d.projectFile && !ignored.includes(d.projectFile) ? [d.projectFile] : [])))];
      const files = done.map((d) => d.projectFile ?? d.file.replace(homeDir, '~')).join(', ');
      return { message: `Servidor "faz-ai" registrado em: ${files}. ${[...new Set(done.map((d) => d.next))].join(' ')}`, toIgnore };
    },
    addToGitignore(lines) {
      const current = fs.existsSync(gitignore) ? fs.readFileSync(gitignore, 'utf8') : '';
      fs.writeFileSync(gitignore, `${current}${current && !current.endsWith('\n') ? '\n' : ''}${lines.join('\n')}\n`);
    },
    async dispose() {
      heartbeat.stop();
      runner.dispose();
      await handle.close();
    },
  };
}
