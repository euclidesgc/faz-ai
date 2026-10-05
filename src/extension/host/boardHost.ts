import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openFile, type DbHandle } from '../db/database';
import { dayOf } from '../../shared/log';
import { Autopilot } from '../autopilot';
import { Heartbeat } from '../heartbeat';
import { createRunLog } from '../log/runLog';
import { consolidate } from '../log/rollup';
import { BoardRepo } from '../repositories/boardRepo';
import { registerClients } from '../mcp/clientConfig';
import { workspaceKey } from '../mcp/socketPath';
import { AutoMerger, MergeWatcher } from '../merge';
import { ReleaseWatcher } from '../release';
import { removeWorktree } from '../git';
import { MessageRouter } from '../panel/messageRouter';
import { ChatSession } from '../chat';
import { AiRunner } from '../runner';
import { cursorModels, cursorSignedIn } from '../cliProbe';
import { checkRequirements } from '../requirements';
import { resolveCommand } from '../cliResolve';
import { isFastVariant, onlyBuiltin, rememberModels } from '../models';
import { loginShellPath, spawnHeadless } from '../spawn';

/** Complemento do nome na mensagem de "comando não encontrado", para não piorar o que a pessoa já lê no log. */
const COMMAND_HINT: Record<string, string> = { gh: ' (GitHub CLI)' };

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
  /** versão da extensão (vai no cabeçalho do arquivo exportado) */
  version?: string;
  /** esta janela é a dona do board (serve o MCP), a única que roda o autopiloto; padrão: sempre */
  ownsBoard?: () => boolean;
}

/** O board de uma pasta em funcionamento: banco, roteador, executor da IA e heartbeat. Não depende da API do VSCode. */
export interface BoardHost {
  router: MessageRouter;
  runner: AiRunner;
  heartbeat: Heartbeat;
  mergeWatcher: MergeWatcher;
  chat: ChatSession;
  /** toca sozinho as histórias em modo autônomo (YOLO) */
  autopilot: Autopilot;
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
    log: o.log,
    extensionVersion: o.version,
  });
  const runLog = createRunLog(handle.db, o.log);
  // execuções que a sessão anterior não fechou (a janela caiu, a máquina desligou) viram 'unknown' em
  // vez de ficarem abertas para sempre. Só a janela dona do board faz isso: duas janelas na mesma
  // pasta compartilham o arquivo do banco, e a segunda a abrir marcaria como inconclusiva uma
  // execução viva da primeira. É a mesma ambiguidade que o `ownsBoard` existe para conter.
  const ownsBoard = !o.ownsBoard || o.ownsBoard();
  if (ownsBoard) runLog.closeOpen(Date.now());
  // a retenção: fora da janela, o detalhe do mês vira total em `log_months`. Roda aqui, na abertura,
  // no máximo uma vez por dia — nunca durante uma mutação do board, para não entrar no custo de uma
  // operação comum da pessoa mesmo que fique lenta.
  const boardRepo = new BoardRepo(handle.db);
  const opened = boardRepo.openedNow(router.boardId, Date.now());
  if (ownsBoard && opened.rollupDay !== dayOf(Date.now()))
    consolidate(handle.db, router.boardId, Date.now(), boardRepo.retentionMonths(router.boardId));
  const pathEnv = await loginShellPath();
  // o node do PATH do terminal, com caminho absoluto: é ele que a ferramenta usa para iniciar o servidor do board
  const nodePath = resolveCommand('node', pathEnv, homeDir) ?? undefined;
  const runner = new AiRunner(router, {
    cwd: o.folderPath,
    homeDir,
    bridgePath: o.bridgePath,
    nodePath,
    log: o.log,
    runLog,
    spawn: (command, cwd, out) => spawnHeadless(command, cwd, out, pathEnv),
  });
  // o log do board liga cada evento à execução em curso no card (`run_id`); sem execução, fica nulo
  router.setRunResolver((cardId) => runner.runIdOf(cardId));
  // os comandos externos das rotinas periódicas: resolvem com a saída padrão, rejeitam com a mensagem
  // do comando (é ela que vai para o log). `git` aqui é assíncrono de propósito — o `src/extension/git.ts`
  // é síncrono, feito para o que a pessoa dispara, e travaria o processo da extensão numa rodada de fundo.
  const run = (cmd: string) => (args: string[], cwd: string) =>
    new Promise<string>((resolve, reject) => {
      execFile(
        cmd,
        args,
        { cwd, timeout: 120_000, env: { ...process.env, ...(pathEnv ? { PATH: pathEnv } : {}) } },
        (err, stdout, stderr) =>
          err
            ? reject(
                new Error(
                  (err as NodeJS.ErrnoException).code === 'ENOENT'
                    ? `o comando "${cmd}"${COMMAND_HINT[cmd] ?? ''} não foi encontrado.`
                    : stderr.trim() || err.message,
                ),
              )
            : resolve(stdout),
      );
    });
  const gh = run('gh');
  const git = run('git');
  new AutoMerger(router, {
    cwd: o.folderPath,
    log: o.log,
    gh,
    removeWorktree,
  });
  const chat = new ChatSession(router, {
    cwd: o.folderPath,
    homeDir,
    bridgePath: o.bridgePath,
    nodePath,
    log: o.log,
    runLog,
    spawn: (command, cwd, out) => spawnHeadless(command, cwd, out, pathEnv),
    file: path.join(o.storageDir, 'chat', `${workspaceKey(o.folderPath)}.json`),
  });
  // os modelos do Cursor são os da conta, e só a CLI diz quais são: lidos ao abrir o board e ao passar
  // a usar o Cursor. A primeira lista real substitui a embutida sozinha; depois, só pelo "Detectar
  // modelos", para não trazer de volta um modelo que a pessoa tirou do catálogo.
  const refreshCursorModels = async () => {
    const exe = resolveCommand('cursor-agent', pathEnv, homeDir);
    if (!exe) return;
    const found = await cursorModels(exe, pathEnv);
    if (!found.length) return;
    rememberModels('cursor', found);
    const { board } = router.snapshot();
    // a lista chegou: entra sozinha na primeira vez, ou quando a pessoa ligou os modos rápidos antes
    // de ela ser lida (o "Detectar" daquele momento só tinha a lista embutida, sem as rápidas)
    const fastMissing =
      board.rules.includeFastModels && found.some((m) => isFastVariant(m, found) && !board.modelCatalog.some((o) => o.id === m.id));
    if (ownsBoard && board.aiTool === 'cursor' && (onlyBuiltin('cursor', board.modelCatalog) || fastMissing))
      router.handle({ type: 'settings.models.detect', tool: 'cursor' });
  };
  // o que falta para o board trabalhar com a ferramenta (CLI, login, servidor MCP, permissão): vira a
  // faixa de aviso da interface, que fica enquanto faltar alguma coisa. Confere ao abrir, quando a
  // ferramenta ou a permissão mudam, depois de conectar, a cada poucos minutos (a pessoa instala a
  // CLI ou entra na conta fora do board) e quando ela pede "Verificar de novo".
  let checking: Promise<void> | null = null;
  let cursorBlocked = false;
  let checkAgain = false;
  const checkNow = (): Promise<void> => {
    if (checking) {
      checkAgain = true;
      return checking;
    }
    const { board } = router.snapshot();
    checking = checkRequirements({
      tool: board.aiTool,
      permission: board.runner.permission,
      workspaceDir: o.folderPath,
      homeDir,
      bridgePath: o.bridgePath,
      nodePath,
      resolve: (command) => resolveCommand(command, pathEnv, homeDir),
      signedIn: (tool, exe) => (tool === 'cursor' ? cursorSignedIn(exe, pathEnv) : Promise.resolve(null)),
    })
      .then((list) => {
        // a CLI do Cursor acabou de ficar pronta (instalada, com login): só agora dá para ler os modelos da conta
        const blocked = list.some((r) => r.id === 'cli' || r.id === 'signin');
        if (cursorBlocked && !blocked && router.snapshot().board.aiTool === 'cursor') void refreshCursorModels();
        cursorBlocked = blocked;
        router.setRequirements(list);
      })
      .catch((e) => o.log(`Não foi possível conferir os requisitos do board: ${e instanceof Error ? e.message : String(e)}`))
      .finally(() => {
        checking = null;
        if (checkAgain) {
          checkAgain = false;
          void checkNow();
        }
      });
    return checking;
  };
  router.onRequirementsCheck(() => void checkNow());
  const requirementsTimer = setInterval(() => void checkNow(), 5 * 60_000);
  requirementsTimer.unref?.();
  void checkNow();

  let toolInUse = router.snapshot().board.aiTool;
  let permissionInUse = router.snapshot().board.runner.permission;
  if (toolInUse === 'cursor') void refreshCursorModels();
  router.onDidChange(() => {
    const { board } = router.snapshot();
    if (board.aiTool === toolInUse && board.runner.permission === permissionInUse) return;
    const toolChanged = board.aiTool !== toolInUse;
    toolInUse = board.aiTool;
    permissionInUse = board.runner.permission;
    void checkNow();
    if (toolChanged && board.aiTool === 'cursor') void refreshCursorModels();
  });
  const autopilot = new Autopilot(router, runner, { log: o.log, canRun: o.ownsBoard });
  const heartbeat = new Heartbeat(runner, { snapshot: () => router.snapshot(), now: () => Date.now(), log: o.log });
  // sem timer próprio: o arquivamento das histórias publicadas acontece no fim da rodada de merges,
  // com o mesmo liga/desliga, o mesmo intervalo e a mesma janela dona
  const releaseWatcher = new ReleaseWatcher(router, { cwd: o.folderPath, log: o.log, gh, git });
  const mergeWatcher = new MergeWatcher(router, {
    cwd: o.folderPath,
    log: o.log,
    gh,
    removeWorktree,
    now: () => Date.now(),
    canRun: o.ownsBoard,
    afterRound: () => releaseWatcher.sweep(),
  });

  const gitignore = path.join(o.folderPath, '.gitignore');
  return {
    router,
    runner,
    heartbeat,
    mergeWatcher,
    chat,
    autopilot,
    connectAI() {
      const done = registerClients([router.snapshot().board.aiTool], {
        bridgePath: o.bridgePath,
        workspaceDir: o.folderPath,
        homeDir,
        nodeCommand: nodePath,
      });
      // arquivos do projeto guardam caminhos desta máquina, então normalmente não devem ir para o repositório
      const ignored = fs.existsSync(gitignore)
        ? fs
            .readFileSync(gitignore, 'utf8')
            .split(/\r?\n/)
            .map((l) => l.trim())
        : [];
      const toIgnore = [...new Set(done.flatMap((d) => (d.projectFile && !ignored.includes(d.projectFile) ? [d.projectFile] : [])))];
      const files = done.map((d) => d.projectFile ?? d.file.replace(homeDir, '~')).join(', ');
      void checkNow();
      return { message: `Servidor "faz-ai" registrado em: ${files}. ${[...new Set(done.map((d) => d.next))].join(' ')}`, toIgnore };
    },
    addToGitignore(lines) {
      const current = fs.existsSync(gitignore) ? fs.readFileSync(gitignore, 'utf8') : '';
      fs.writeFileSync(gitignore, `${current}${current && !current.endsWith('\n') ? '\n' : ''}${lines.join('\n')}\n`);
    },
    async dispose() {
      clearInterval(requirementsTimer);
      autopilot.pause();
      heartbeat.stop();
      runner.dispose();
      chat.dispose();
      await handle.close();
    },
  };
}
