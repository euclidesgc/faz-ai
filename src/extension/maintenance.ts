import type { BoardState } from '../shared/model';

/** O que a manutenção da rodada precisa: o `git` de fundo, o board e os passos, cada um em seu módulo. */
export interface MaintenanceDeps {
  /** o `git` assíncrono do boardHost: resolve com a saída, rejeita com a mensagem do comando */
  git(args: string[], cwd: string): Promise<string>;
  log(line: string): void;
  /** pasta do projeto */
  cwd: string;
  snapshot(): BoardState;
  /** a detecção de merges (`MergeWatcher.runNow`) */
  merges(): Promise<unknown>;
  /** a sincronização das branches locais (`BranchSyncer.sync`); supõe o fetch já feito */
  sync(): Promise<unknown>;
  /** a conferência do conflito com a base das histórias sem PR (`BaseConflictChecker.runNow`, #747); supõe o fetch já feito */
  baseConflicts(): Promise<unknown>;
  /** as branches e worktrees órfãs (`OrphanSweeper.sweep`) */
  orphans(): Promise<unknown>;
  /** as histórias publicadas numa versão (`ReleaseWatcher.sweep`) */
  releases(): Promise<unknown>;
}

/** A primeira linha da mensagem de erro: é o que vai para o log. */
const firstLine = (e: unknown): string => (e instanceof Error ? e.message : String(e)).split('\n')[0]!.trim();

/**
 * A manutenção sem IA de cada rodada do heartbeat, numa ordem fixa (#722): um `git fetch --prune` só →
 * merges (a história mesclada perde a branch, então vem antes da sincronização) → sincronização das
 * branches locais → conferência do conflito com a base das histórias sem PR (#747) → órfãs e versões
 * publicadas, juntas. A fila da IA espera até o fim da conferência, para partir das branches já
 * atualizadas e com o aviso de conflito já na conversa; órfãs e versões seguem em segundo plano, porque
 * não mexem nas branches das histórias vivas. Sem git (ou com o git do board desligado), só merges,
 * órfãs e versões, como antes. Não depende da API do VSCode.
 */
export class Maintenance {
  /** a manutenção em andamento: `ready` resolve no fim da conferência com a base, `done` quando tudo terminou */
  private inFlight: { ready: Promise<void>; done: Promise<void> } | null = null;
  /** o último motivo de falha do fetch que foi para o log: o mesmo não se repete a cada rodada (RF16) */
  private lastFetchFailure: string | null = null;

  constructor(private deps: MaintenanceDeps) {}

  /**
   * A manutenção da rodada. Resolve quando a conferência com a base termina (é o que a fila da IA espera). Com uma
   * manutenção ainda em andamento, não começa outra e devolve a espera da que está em curso (RF3).
   * Nunca rejeita.
   */
  run(): Promise<void> {
    if (this.inFlight) return this.inFlight.ready;
    let ready!: () => void;
    const flight = { ready: new Promise<void>((r) => (ready = r)), done: Promise.resolve() };
    this.inFlight = flight;
    flight.done = this.steps(ready)
      .catch((e) => this.deps.log(`Manutenção: falha inesperada: ${firstLine(e)}`))
      .finally(() => {
        ready(); // uma falha antes da sincronização não pode prender a fila da IA
        if (this.inFlight === flight) this.inFlight = null;
      });
    return flight.ready;
  }

  /** Espera a manutenção em andamento terminar por inteiro (também órfãs e versões); para o fechamento e os testes. */
  async idle(): Promise<void> {
    await this.inFlight?.done;
  }

  private async steps(ready: () => void): Promise<void> {
    const gitOn = await this.gitOn();
    const fetched = gitOn && (await this.fetch());
    await this.safe('merges', () => this.deps.merges());
    if (fetched) {
      await this.safe('sincronização das branches', () => this.deps.sync());
      // depois da sincronização e antes da fila da IA: o aviso já está na conversa quando a IA trabalha a fase
      await this.safe('conflito com a base', () => this.deps.baseConflicts());
    }
    ready();
    await Promise.all([this.safe('órfãs', () => this.deps.orphans()), this.safe('versões publicadas', () => this.deps.releases())]);
  }

  /** O git do board está em uso e a pasta é um repositório: sem isso nenhum passo novo, nem linha nova (RF18). */
  private async gitOn(): Promise<boolean> {
    if (this.deps.snapshot().board.git.mode === 'off') return false;
    try {
      await this.deps.git(['rev-parse', '--is-inside-work-tree'], this.deps.cwd);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * O fetch único da rodada: as refs do origin que a sincronização compara. Falhou (sem rede, sem
   * credencial, sem origin): a sincronização fica para a próxima rodada, com uma linha no log por motivo.
   */
  private async fetch(): Promise<boolean> {
    try {
      await this.deps.git(['remote', 'get-url', 'origin'], this.deps.cwd);
    } catch {
      return this.fetchFailed('o repositório não tem origin');
    }
    try {
      await this.deps.git(['fetch', '--quiet', '--prune', 'origin'], this.deps.cwd);
      this.lastFetchFailure = null;
      return true;
    } catch (e) {
      return this.fetchFailed(firstLine(e));
    }
  }

  private fetchFailed(reason: string): false {
    if (reason !== this.lastFetchFailure) {
      this.lastFetchFailure = reason;
      this.deps.log(`Branches: a sincronização ficou para a próxima rodada: ${reason}.`);
    }
    return false;
  }

  /** A rede de segurança de cada passo: cada um trata as próprias falhas, mas nenhum derruba os seguintes. */
  private async safe(name: string, step: () => Promise<unknown>): Promise<void> {
    try {
      await step();
    } catch (e) {
      this.deps.log(`Manutenção: falha inesperada em ${name}: ${firstLine(e)}`);
    }
  }
}
