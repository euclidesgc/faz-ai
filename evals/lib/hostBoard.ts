import * as fs from 'node:fs';
import * as path from 'node:path';
import { createBoardHost, boardDbFile } from '../../src/extension/host/boardHost';
import { openFile } from '../../src/extension/db/database';
import { AiRunRepo, type AiRun } from '../../src/extension/log/aiRunRepo';
import { panelRework } from '../../src/extension/log/rework';
import { startMcpServer } from '../../src/extension/mcp/server';
import { socketPath, workspaceKey } from '../../src/extension/mcp/socketPath';
import type { AiRunner } from '../../src/extension/runner';
import { monthOf } from '../../src/shared/log';
import { configureBoard, type EvalBoard } from './evalBoard';
import type { EvalConfig, EvalLog } from './types';

/** A raiz do repositório: o bundle fica em `evals/.build/`, então duas pastas acima. */
const repoRoot = (): string => path.resolve(__dirname, '..', '..');

/** Os meses (AAAA-MM) de `start` a `end`, inclusive. */
function monthsOf(start: number, end: number): string[] {
  const months: string[] = [];
  const cursor = new Date(start);
  cursor.setDate(1);
  const last = monthOf(end);
  for (let i = 0; i < 24; i++) {
    const month = monthOf(cursor.getTime());
    months.push(month);
    if (month >= last) break;
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

/** Quanto `close` espera as execuções interrompidas terminarem antes de fechar o banco mesmo assim. */
const STOP_RUNS_MS = 30_000;

/**
 * Interrompe as execuções em curso e espera o fim delas. O `dispose` do host fecha o banco sem esperar: uma
 * execução que o autopiloto começou logo antes (a história já na Homologação) gravaria o fim num banco fechado,
 * o sql.js responde "out of memory" e o erro derruba o eval antes de gravar o placar.
 */
async function stopRuns(runner: Pick<AiRunner, 'running' | 'stop'>, timeoutMs = STOP_RUNS_MS): Promise<void> {
  for (const id of runner.running) runner.stop(id);
  const deadline = Date.now() + timeoutMs;
  while (runner.running.length > 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200));
}

/**
 * O board real de uma história: o `createBoardHost` da extensão, headless, com o projeto, os dados e a ponte
 * dentro de `root` (nada da pasta de dados da pessoa é aberto) e o servidor MCP no socket do projeto temporário,
 * como o `src/cli/cli.ts` (sem servidor web nem heartbeat). A pasta `root/project` já deve existir.
 */
export async function openHostBoard(root: string, config: EvalConfig, log: (line: string) => void): Promise<EvalBoard> {
  const dist = path.join(repoRoot(), 'dist');
  const bridgeSource = path.join(dist, 'mcp-bridge.js');
  if (!fs.existsSync(bridgeSource) || !fs.existsSync(path.join(dist, 'sql-wasm.wasm'))) {
    throw new Error('A extensão não está compilada (falta dist/mcp-bridge.js ou dist/sql-wasm.wasm). Rode npm run build:ext.');
  }
  const project = path.join(root, 'project');
  const data = path.join(root, 'data');
  const bridgeDir = path.join(root, 'bridge');
  fs.mkdirSync(project, { recursive: true });
  fs.mkdirSync(data, { recursive: true });
  fs.mkdirSync(bridgeDir, { recursive: true });
  // sem esta pasta o host põe a cópia de leitura da biblioteca em ~/faz-ai-library: com ela fica no diretório temporário
  fs.mkdirSync(path.join(data, 'artifacts', workspaceKey(project)), { recursive: true });
  const bridgePath = path.join(bridgeDir, 'mcp-bridge.js');
  fs.copyFileSync(bridgeSource, bridgePath);

  const version = (JSON.parse(fs.readFileSync(path.join(repoRoot(), 'package.json'), 'utf8')) as { version: string }).version;
  const host = await createBoardHost({
    storageDir: data,
    wasmDir: dist,
    folderPath: project,
    folderName: path.basename(project),
    bridgePath,
    log,
    version,
  });
  let stopMcp: () => void = () => {};
  try {
    stopMcp = await startMcpServer(socketPath(project), {
      getRouter: async () => host.router,
      getRunner: async () => host.runner,
      workspaceDir: project,
      version,
    });
    configureBoard(host.router, config);
    // a verificação das capacidades do perfil: sem os recibos o board não admite a execução
    log(await host.verifyExecutor(config.profile));
  } catch (err) {
    stopMcp();
    await host.dispose();
    throw err;
  }
  const boardId = host.router.boardId;

  return {
    router: host.router,
    runner: host.runner,
    autopilot: host.autopilot,
    projectDir: project,
    async close(period): Promise<EvalLog> {
      host.autopilot.stop();
      await stopRuns(host.runner);
      stopMcp();
      await host.dispose();
      // o banco já foi gravado pelo `dispose`: lê de novo, de fora do host
      const handle = await openFile(boardDbFile(data, project), dist);
      try {
        const runs: AiRun[] = [];
        for (const month of monthsOf(period.start, period.end)) runs.push(...new AiRunRepo(handle.db).byMonth(month));
        const { aiSignals } = panelRework(handle.db, boardId, period, '');
        return {
          runs: runs.filter((r) => r.boardId === boardId && r.startedAt >= period.start && r.startedAt <= period.end),
          signals: {
            reviewFixes: aiSignals.reviewFixes.count,
            testFailures: aiSignals.testFailures.count,
            commitsAfterPr: aiSignals.commitsAfterPr.count,
          },
        };
      } finally {
        await handle.close();
      }
    },
  };
}
