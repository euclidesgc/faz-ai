import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import { cardRef, type BoardState, type Card, type ColumnCheck } from '../shared/model';
import { failureSignature, gateFailureMessage } from '../shared/failureSignature';
import { expandCommand, tailOf } from '../shared/gate';
import { prBaseOf } from '../shared/gitflow';
import { isLive } from '../shared/selectors';
import type { WebviewToHost } from '../shared/messages';
import type { GateRepo } from './repositories/gateRepo';
import { processBirth, terminateProcessGroup, type ProcessIdentity } from './processIdentity';
import { acquireWorkspace, type WorkspaceLease } from './workspaceLock';

// O executor do portão: quando a IA tenta sair de uma coluna com checagens, o board (não a IA) roda os
// comandos na pasta da história e devolve o desfecho ao router. Qualquer erro é falha fechada: o card
// nunca se move por uma checagem que não rodou até o fim.

const AUTHOR = 'Faz AI';
const MINUTE = 60_000;
/** o que cabe da saída das checagens na memória: o fim é o que explica a falha */
const OUTPUT_LIMIT = 64 * 1024;
/** folga acima da soma dos tempos das checagens para o card `verifying` ser considerado preso */
const SWEEP_GRACE_MS = 15 * MINUTE;
/** depois que o processo sai, quanto esperar a saída que ainda está no cano antes de seguir */
const DRAIN_MS = 100;

/** O que o executor usa do router; `completeGate`/`failGate` são métodos internos dele, fora do MCP e da webview. */
export interface GateRouter {
  snapshot(): BoardState;
  completeGate(gateRunId: string, sha: string): void;
  /** `failedCheck`: o nome da checagem que falhou (só no resultado `failed`); a subida de modelo o cita. */
  failGate(gateRunId: string, result: 'failed' | 'interrupted', body: string, failedCheck?: string, signature?: string): void;
  handle(msg: WebviewToHost, origin: { author?: string; source?: 'ai' | 'human' }): unknown;
}

export interface GateRunner {
  isRunning(cardId: string): boolean;
  onDidFinish(listener: (cardId: string) => void): () => void;
}

export interface GateDeps {
  repo: GateRepo;
  router: GateRouter;
  runner: GateRunner;
  state: () => BoardState;
  ownsBoard: () => boolean;
  /** a pasta da história (a sub-tarefa usa a do pai): `worktreePath` ou a pasta do projeto */
  workspaceOf: (story: Card) => string;
  instance: string;
  log: (line: string) => void;
  git: (args: string[], cwd: string) => Promise<string>;
  shellPath: () => Promise<string | undefined>;
  /** raiz da coordenação das pastas (testes) */
  coordinationDir?: string;
  acquireTries?: number;
  acquireDelayMs?: number;
  /** teto da espera pela sessão da IA que ainda está no card */
  waitCapMs?: number;
  /** avisa o disjuntor de falhas repetidas (#1097) depois de uma checagem `failed`; nunca lança para cá */
  onFailed?: (cardId: string) => void;
}

/** Fim de uma checagem: `code` null quando o processo morreu por sinal ou foi encerrado. */
interface CheckOutcome {
  code: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  output: string;
}

/** O portão foi cancelado (card mexido à mão, board fechado). */
class GateCancelled extends Error {}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export class GateExecutor {
  /** execuções vivas nesta janela: id do gate_runs → cancelamento */
  private readonly active = new Map<string, { cardId: string; abort: AbortController }>();

  constructor(private readonly deps: GateDeps) {}

  /** Cancela as verificações de um card (movido à mão, arquivado); o desfecho `interrupted` vai ao router. */
  cancel(cardId: string): void {
    for (const a of this.active.values()) if (a.cardId === cardId) a.abort.abort();
  }

  /** Encerra todas as verificações vivas (o board fechou). */
  dispose(): void {
    for (const a of this.active.values()) a.abort.abort();
  }

  /** Roda o portão `gateRunId`. Nunca lança: todo erro vira `failGate(..., 'interrupted', ...)`. */
  async run(gateRunId: string): Promise<void> {
    const abort = new AbortController();
    try {
      // sem ser a janela dona não executa: o gate_runs fica `running` e a dona o recupera
      if (!this.deps.ownsBoard()) return;
      const gate = this.deps.repo.get(gateRunId);
      if (!gate || gate.result !== 'running') return;
      this.active.set(gateRunId, { cardId: gate.cardId, abort });
      await this.execute(gateRunId, abort.signal);
    } catch (e) {
      this.fail(gateRunId, 'interrupted', e instanceof GateCancelled ? 'A verificação foi cancelada.' : message(e));
    } finally {
      this.active.delete(gateRunId);
    }
  }

  /**
   * Na abertura do board (só a janela dona): o que estava rodando não tem mais executor. As execuções viram
   * `interrupted` e os cards `verifying` voltam para `ready`. Devolve quantos cards foram liberados.
   */
  recoverAfterRestart(): number {
    if (!this.deps.ownsBoard()) return 0;
    this.deps.repo.interruptAllRunning();
    const stuck = this.deps.router.snapshot().cards.filter((c) => isLive(c) && c.status === 'verifying');
    this.release(
      stuck,
      'A verificação foi interrompida (a janela fechou ou reiniciou). O card voltou para Pronto; as checagens rodam de novo quando você tentar sair da coluna.',
    );
    return stuck.length;
  }

  /**
   * Na rodada do heartbeat (só a janela dona): o card `verifying` sem execução viva nesta janela e mais velho
   * que a soma dos tempos das checagens da coluna + 15 min está preso (a outra janela caiu, por exemplo).
   */
  sweep(now: number): number {
    if (!this.deps.ownsBoard()) return 0;
    const s = this.deps.router.snapshot();
    const alive = new Set([...this.active.values()].map((a) => a.cardId));
    const stuck = s.cards.filter((c) => {
      if (!isLive(c) || c.status !== 'verifying' || alive.has(c.id)) return false;
      const checks = s.columns.find((col) => col.id === c.columnId)?.checks ?? [];
      const limit = checks.reduce((sum, ch) => sum + ch.timeoutSec * 1000, 0) + SWEEP_GRACE_MS;
      return c.statusAt === null || now - c.statusAt >= limit;
    });
    for (const c of stuck) {
      const running = this.deps.repo.runningFor(c.id);
      if (running) this.deps.repo.finish(running.id, 'interrupted', 'A verificação ficou presa e foi encerrada.');
    }
    this.release(stuck, 'A verificação ficou presa sem nenhuma execução em curso. O card voltou para Pronto.');
    return stuck.length;
  }

  /** Devolve os cards para a IA (`ready`) explicando o motivo na conversa. */
  private release(cards: Card[], why: string): void {
    for (const c of cards) {
      try {
        this.deps.log(`${cardRef(c)} estava "Verificando" sem execução em curso; voltou para Pronto.`);
        this.deps.router.handle({ type: 'card.status.set', cardId: c.id, status: 'ready' }, { author: AUTHOR, source: 'ai' });
        this.deps.router.handle({ type: 'comment.add', cardId: c.id, body: why }, { author: AUTHOR, source: 'ai' });
      } catch (e) {
        this.deps.log(`Não foi possível liberar ${cardRef(c)} da verificação: ${message(e)}`);
      }
    }
  }

  private fail(gateRunId: string, result: 'failed' | 'interrupted', body: string, failedCheck?: string, signature?: string): void {
    try {
      this.deps.router.failGate(gateRunId, result, body, failedCheck, signature);
    } catch (e) {
      this.deps.log(`O desfecho do portão ${gateRunId} não foi gravado: ${message(e)}`);
      return;
    }
    // só `failed` soma; `interrupted` não é uma falha da história (#1097)
    if (result !== 'failed') return;
    try {
      const cardId = this.deps.repo.get(gateRunId)?.cardId;
      if (cardId) this.deps.onFailed?.(cardId);
    } catch (e) {
      this.deps.log(`O disjuntor de falhas não foi avisado do portão ${gateRunId}: ${message(e)}`);
    }
  }

  private async execute(gateRunId: string, signal: AbortSignal): Promise<void> {
    const { repo, router, git, log } = this.deps;
    const gate = repo.get(gateRunId)!;
    const state = router.snapshot();
    const card = state.cards.find((c) => c.id === gate.cardId);
    if (!card) return this.fail(gateRunId, 'interrupted', 'O card não existe mais.');
    const column = state.columns.find((c) => c.id === gate.columnId);
    const columnName = column?.name ?? '';
    const checks = column?.checks ?? [];
    if (checks.length === 0) return this.fail(gateRunId, 'interrupted', 'A coluna não tem mais checagens configuradas.');
    const story = (card.parentId && state.cards.find((c) => c.id === card.parentId)) || card;

    // a sessão da IA ainda pode estar escrevendo na pasta: espera ela terminar antes de reservar
    if (!(await this.waitSession([card.id, story.id], signal)))
      return this.fail(gateRunId, 'interrupted', 'A sessão da IA não terminou a tempo para a verificação começar.');

    const workspace = this.deps.workspaceOf(story);
    if (!workspace || !isDirectory(workspace)) return this.fail(gateRunId, 'interrupted', 'Pasta de trabalho indisponível.');

    const lease = await this.acquire(workspace, gateRunId, signal);
    if (!lease) return this.fail(gateRunId, 'interrupted', 'A pasta ainda está em uso por outra execução.');
    try {
      const sha = (await git(['rev-parse', 'HEAD'], workspace)).trim();
      if (!sha) throw new Error('O git não devolveu o commit atual (HEAD).');
      repo.setSha(gateRunId, sha);
      const base = prBaseOf(state, story)?.baseBranch || state.mainBranch?.name || state.board.git.mainBranch;
      if (!base) throw new Error('Sem branch de base para calcular os arquivos alterados.');
      const changedFiles = (await git(['diff', '--name-only', '-z', `${base}...HEAD`], workspace)).split('\0').filter(Boolean);
      const path = await this.deps.shellPath();

      for (const check of checks) {
        if (signal.aborted) throw new GateCancelled();
        const out = await this.runCheck(check, expandCommand(check.command, { base, changedFiles }), workspace, path, lease, signal);
        if (signal.aborted) throw new GateCancelled();
        if (out.timedOut || out.code !== 0) {
          const motivo = out.timedOut
            ? `tempo esgotado em ${check.timeoutSec}s`
            : out.code === null
              ? `encerrada pelo sinal ${out.signal ?? 'desconhecido'}`
              : `código ${out.code}`;
          const tail = tailOf(out.output);
          return this.fail(
            gateRunId,
            'failed',
            `**${check.name}** falhou (${motivo})${tail ? `\n\n\`\`\`\n${tail}\n\`\`\`` : ''}`,
            check.name,
            // só `failed` tem assinatura (#1097); `interrupted` não soma
            failureSignature(columnName, 'gate', gateFailureMessage(check.name, tail)),
          );
        }
      }
      router.completeGate(gateRunId, sha);
    } finally {
      // false: o grupo do comando ainda vive; o workspaceLock reconcilia na próxima reserva
      if (!lease.release()) log(`A reserva da pasta ${workspace} não foi liberada: ainda há processo do portão vivo.`);
    }
  }

  /** Espera a sessão da IA do card terminar (`onDidFinish`), até `waitCapMs`. `false`: estourou o teto ou cancelou. */
  private waitSession(ids: string[], signal: AbortSignal): Promise<boolean> {
    const { runner } = this.deps;
    const busy = () => ids.some((id) => runner.isRunning(id));
    if (!busy()) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      const done = (ok: boolean) => {
        clearTimeout(timer);
        unsubscribe();
        signal.removeEventListener('abort', onAbort);
        resolve(ok);
      };
      const onAbort = () => done(false);
      const unsubscribe = runner.onDidFinish((cardId) => {
        if (ids.includes(cardId) && !busy()) done(true);
      });
      const timer = setTimeout(() => done(false), this.deps.waitCapMs ?? 10 * MINUTE);
      signal.addEventListener('abort', onAbort);
      // terminou entre a checagem e a assinatura
      if (!busy()) done(true);
    });
  }

  private async acquire(workspace: string, gateRunId: string, signal: AbortSignal): Promise<WorkspaceLease | null> {
    const tries = this.deps.acquireTries ?? 10;
    const delay = this.deps.acquireDelayMs ?? 1500;
    for (let i = 0; i < tries; i++) {
      if (signal.aborted) throw new GateCancelled();
      const lease = acquireWorkspace(workspace, gateRunId, 1, this.deps.instance, this.deps.coordinationDir);
      if (lease) return lease;
      if (i < tries - 1) await sleep(delay);
    }
    return null;
  }

  /** Roda uma checagem com `sh -c` num grupo próprio de processos, com tempo máximo e saída limitada. */
  private runCheck(
    check: ColumnCheck,
    command: string,
    cwd: string,
    path: string | undefined,
    lease: WorkspaceLease,
    signal: AbortSignal,
  ): Promise<CheckOutcome> {
    return new Promise<CheckOutcome>((resolve, reject) => {
      const env: NodeJS.ProcessEnv = { ...process.env };
      if (path) env.PATH = path;
      let child: ChildProcess;
      try {
        child = spawn('sh', ['-c', command], { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (e) {
        return reject(e);
      }
      let output = '';
      const collect = (chunk: Buffer) => {
        output += chunk.toString('utf8');
        if (output.length > OUTPUT_LIMIT) output = output.slice(output.length - OUTPUT_LIMIT);
      };
      child.stdout?.on('data', collect);
      child.stderr?.on('data', collect);

      let identity: ProcessIdentity | null = null;
      let timedOut = false;
      let settled = false;
      const kill = async () => {
        if (identity) await terminateProcessGroup(identity).catch(() => false);
        else child.kill('SIGKILL');
      };
      const finish = (outcome: CheckOutcome) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        resolve(outcome);
      };
      const onAbort = () => void kill();
      const timer = setTimeout(() => {
        timedOut = true;
        void kill();
      }, check.timeoutSec * 1000);
      signal.addEventListener('abort', onAbort);

      child.once('error', (e) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        reject(e);
      });
      child.once('exit', (code, sig) => {
        // dá um instante para a saída que ainda está no cano; netos que seguram o cano não travam o portão
        const timerDrain = setTimeout(() => finish({ code, signal: sig, timedOut, output }), DRAIN_MS);
        child.once('close', () => {
          clearTimeout(timerDrain);
          finish({ code, signal: sig, timedOut, output });
        });
      });

      const pid = child.pid;
      if (!pid) return; // o evento 'error' do spawn explica
      try {
        identity = {
          pid,
          birth: processBirth(pid),
          platform: process.platform,
          groupId: process.platform === 'win32' ? null : pid,
          generation: randomUUID(),
        };
        lease.recordProcess(identity);
      } catch (e) {
        // sem registro na reserva não há como garantir o encerramento depois: mata e falha fechado
        void kill().finally(() => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          signal.removeEventListener('abort', onAbort);
          reject(e);
        });
        return;
      }
      if (signal.aborted) onAbort();
    });
  }
}

function isDirectory(dir: string): boolean {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}
