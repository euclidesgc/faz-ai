/**
 * Varredor de branches e worktrees órfãs (#465, parte 2): coleta os fatos do git, entrega-os à regra
 * pura `detectOrphans` e remove o que ela diz ser seguro, revalidando cada item logo antes de remover.
 * Nenhum veredito nasce aqui: o host só mede e executa. A parte 3 liga `publish` e `clearWorkspace` ao
 * `MessageRouter`; até lá o módulo não conhece o roteador.
 */
import * as fs from 'node:fs';
import { detectMainBranch, isInside, worktreeRoot } from './git';
import { samePath } from './samePath';
import type { BoardState } from '../shared/model';
import {
  EMPTY_ORPHANS,
  candidateBranches,
  detectOrphans,
  ownerOf,
  type BranchFact,
  type GitFacts,
  type OrphanItem,
  type OrphanReport,
  type WorktreeFact,
} from '../shared/orphans';

export interface OrphanDeps {
  /** pasta do projeto */
  cwd: string;
  log(line: string): void;
  /** o `git` assíncrono do boardHost: resolve com a saída, rejeita com a mensagem do comando */
  git(args: string[], cwd: string): Promise<string>;
  /** a de `git.ts`: um só caminho de remoção, e o teste injeta a falha */
  removeWorktree(projectDir: string, worktreePath: string, force?: boolean): void;
  /** idem, `git branch -D` */
  deleteBranch(repo: string, branch: string): void;
  snapshot(): BoardState;
  /** a parte 3 liga em `router.setOrphans` */
  publish(report: OrphanReport): void;
  /** a parte 3 liga em `router.handle({ type: 'card.workspace.clear' })` */
  clearWorkspace(cardId: string): void;
  now?(): number;
}

/** O que a pessoa aceitou perder ao limpar um item `decision`: os números que a tela mostrou. */
export interface AcceptLoss {
  dirtyFiles: number;
  uniqueCommits: number;
}

/** A primeira linha da mensagem de erro, até 200 caracteres. */
const errorLine = (e: unknown): string => (e instanceof Error ? e.message : String(e)).split('\n')[0]!.trim().slice(0, 200);

const count = (out: string): number => out.split(/\r?\n/).filter(Boolean).length;

interface ListedWorktree {
  path: string;
  branch: string | null;
}

/**
 * O `git worktree list --porcelain` em blocos; o primeiro é a pasta principal. Repete o parser de
 * `listWorktrees` em `storyCleanup.ts` porque `WorktreeFact.branch` é `null` (não `''`) com o HEAD destacado.
 */
function parseWorktrees(out: string): ListedWorktree[] {
  const list: ListedWorktree[] = [];
  for (const block of out.split(/\r?\n\r?\n/)) {
    const lines = block.split(/\r?\n/);
    const wt = lines.find((l) => l.startsWith('worktree '));
    if (!wt) continue;
    const branch = lines.find((l) => l.startsWith('branch refs/heads/'));
    list.push({ path: wt.slice('worktree '.length), branch: branch ? branch.slice('branch refs/heads/'.length) : null });
  }
  return list;
}

const lossText = (dirtyFiles: number, uniqueCommits: number): string =>
  [dirtyFiles > 0 ? `${dirtyFiles} arquivo(s) não commitado(s)` : '', uniqueCommits > 0 ? `${uniqueCommits} commit(s) só nesta branch` : '']
    .filter(Boolean)
    .join(' e ');

const blockerText = (item: OrphanItem): string => {
  if (item.blockers.includes('unknown-card')) return 'não há card no board com esse número';
  if (item.blockers.includes('in-use')) return 'a branch ainda está em uso por uma worktree';
  return lossText(item.dirtyFiles, item.uniqueCommits) || 'a remoção depende de uma decisão';
};

export class OrphanSweeper {
  /** o último relatório publicado */
  report: OrphanReport = EMPTY_ORPHANS;
  private queue: Promise<unknown> = Promise.resolve();
  /** a varredura em curso: `sweep`/`scan` chamados de novo devolvem a promessa dela */
  private inFlight: Promise<OrphanReport> | null = null;
  /** a última falha da listagem geral: a mesma mensagem não vai duas vezes ao log */
  private listingFailure: string | null = null;
  /** falhas de remoção já logadas, por `id` + mensagem */
  private loggedFailures = new Set<string>();

  constructor(private readonly deps: OrphanDeps) {}

  private now(): number {
    return this.deps.now ? this.deps.now() : Date.now();
  }

  /** Uma operação por vez: o git e a lista publicada não aguentam duas varreduras entrelaçadas. */
  private enqueue<T>(op: () => Promise<T>): Promise<T> {
    const next = this.queue.then(op, op);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private publish(report: OrphanReport): OrphanReport {
    this.report = report;
    this.deps.publish(report);
    return report;
  }

  /**
   * O único lugar que chama o git. `only` restringe as medições (status, rev-list) aos itens listados:
   * a revalidação de um item não precisa medir os outros, que entram com números neutros.
   */
  private async gatherFacts(state: BoardState, only?: Set<string>): Promise<GitFacts | null> {
    const { git } = state.board;
    if (git.mode === 'off') return null;
    const { cwd } = this.deps;
    const measure = (id: string): boolean => !only || only.has(id);
    const base = state.mainBranch?.name ?? detectMainBranch(cwd)?.name ?? '';

    const listed = parseWorktrees(await this.deps.git(['worktree', 'list', '--porcelain'], cwd));
    const checkedOut = listed.map((w) => w.branch).filter((b): b is string => !!b);
    const root = worktreeRoot(cwd, git);
    const worktrees: WorktreeFact[] = [];
    // `worktreeRoot` já devolve null fora do modo worktree: nenhuma pasta entra
    for (const w of listed.slice(1)) {
      if (!root || !isInside(root, w.path)) continue;
      const exists = fs.existsSync(w.path);
      // o que não foi medido entra como pendente: um número neutro nunca pode significar "pode apagar"
      let dirtyFiles = exists ? 1 : 0;
      if (exists && measure(`worktree:${w.path}`)) {
        try {
          dirtyFiles = count(await this.deps.git(['status', '--porcelain'], w.path));
        } catch {
          // sem saber o que há na pasta, não some: um arquivo conta como pendência
          dirtyFiles = 1;
        }
      }
      worktrees.push({ path: w.path, branch: w.branch, exists, dirtyFiles });
    }

    const all = (await this.deps.git(['for-each-ref', '--format=%(refname:short)', 'refs/heads'], cwd)).split(/\r?\n/).filter(Boolean);
    const branches: BranchFact[] = [];
    for (const name of candidateBranches(state, all)) {
      if (!measure(`branch:${name}`)) {
        branches.push({ name, uniqueCommits: 1, mergeProof: false });
        continue;
      }
      let uniqueCommits: number;
      try {
        // commits que só esta branch alcança: fora de todas as outras locais e de todas as remotas
        uniqueCommits = Number(
          (
            await this.deps.git(['rev-list', '--count', `refs/heads/${name}`, '--not', `--exclude=${name}`, '--branches', '--remotes'], cwd)
          ).trim(),
        );
        if (!Number.isFinite(uniqueCommits)) uniqueCommits = 1;
      } catch {
        uniqueCommits = 1;
      }
      branches.push({ name, uniqueCommits, mergeProof: uniqueCommits > 0 && (await this.mergeProof(state, name, base)) });
    }

    return { mode: git.mode, base, worktrees, checkedOut, branches };
  }

  /**
   * O `mergeCommit` do dono está na base local e a ponta da branch não é mais nova que ele (um commit
   * depois do merge não foi mesclado). Objeto ausente localmente (squash no GitHub sem fetch) → sem prova.
   */
  private async mergeProof(state: BoardState, branch: string, base: string): Promise<boolean> {
    const oid = ownerOf(state, branch)?.mergeCommit ?? '';
    if (!oid || !base) return false;
    const { cwd } = this.deps;
    try {
      if (Number((await this.deps.git(['rev-list', '--count', oid, '--not', base], cwd)).trim()) !== 0) return false;
      const tip = Number((await this.deps.git(['log', '-1', '--format=%ct', `refs/heads/${branch}`], cwd)).trim());
      const merged = Number((await this.deps.git(['log', '-1', '--format=%ct', oid], cwd)).trim());
      return Number.isFinite(tip) && Number.isFinite(merged) && tip <= merged;
    } catch {
      return false;
    }
  }

  /** Lista fresca de órfãs; null quando a listagem falha (o relatório anterior fica) ou o git está desligado. */
  private async detect(only?: Set<string>): Promise<{ state: BoardState; items: OrphanItem[] } | null> {
    const state = this.deps.snapshot();
    let facts: GitFacts | null;
    try {
      facts = await this.gatherFacts(state, only);
    } catch (e) {
      const line = errorLine(e);
      if (this.listingFailure !== line) this.deps.log(`Varredura de órfãs pulada: ${line}`);
      this.listingFailure = line;
      return null;
    }
    this.listingFailure = null;
    return facts ? { state, items: detectOrphans(state, facts) } : null;
  }

  /** Remove o item (já revalidado). Devolve o texto do que foi feito; lança com a mensagem do git. */
  private remove(state: BoardState, item: OrphanItem, force: boolean): string {
    const { cwd } = this.deps;
    if (item.kind === 'worktree') {
      this.deps.removeWorktree(cwd, item.ref, force);
      // o mesmo gesto da conclusão: a história deixa de apontar para uma pasta que não existe mais
      for (const c of state.cards) if (c.worktreePath && samePath(c.worktreePath, item.ref)) this.deps.clearWorkspace(c.id);
      return `Worktree removida: ${item.ref}`;
    }
    this.deps.deleteBranch(cwd, item.ref);
    return `Branch apagada: ${item.ref}`;
  }

  /** A falha vai para `failed` e, uma vez por (id, mensagem), para o log; a rodada seguinte tenta de novo em silêncio. */
  private noteFailure(failed: Record<string, string>, item: OrphanItem, e: unknown): string {
    const line = errorLine(e);
    failed[item.id] = line;
    const key = `${item.id}\n${line}`;
    if (!this.loggedFailures.has(key)) {
      this.loggedFailures.add(key);
      this.deps.log(`Órfã não removida (${item.ref}): ${line}`);
    }
    return `Não removida: ${line}`;
  }

  /** Remove os `safe` de `items`, revalidando cada um com fatos novos. Devolve os ids removidos. */
  private async removeSafe(items: OrphanItem[], failed: Record<string, string>, done: string[]): Promise<string[]> {
    const removed: string[] = [];
    for (const candidate of items.filter((i) => i.verdict === 'safe')) {
      const fresh = await this.detect(new Set([candidate.id]));
      const item = fresh?.items.find((i) => i.id === candidate.id);
      // sumiu ou deixou de ser segura entre a listagem e agora: fica para a próxima rodada
      if (!fresh || !item || item.verdict !== 'safe') continue;
      try {
        done.push(this.remove(fresh.state, item, false));
        removed.push(item.id);
      } catch (e) {
        this.noteFailure(failed, item, e);
      }
    }
    return removed;
  }

  /**
   * Varre, remove o seguro e publica. Se a primeira passada removeu algo, repete uma vez: a branch
   * de uma worktree recém-removida deixa de estar em uso e pode sair na mesma rodada.
   */
  private async run(): Promise<{ report: OrphanReport; done: string[] }> {
    const done: string[] = [];
    const first = await this.detect();
    if (!first) {
      const report =
        this.deps.snapshot().board.git.mode === 'off'
          ? { ...EMPTY_ORPHANS, scannedAt: this.now() }
          : { ...this.report, scannedAt: this.now() };
      return { report: this.publish(report), done };
    }
    const failed: Record<string, string> = {};
    let items = first.items;
    const removed = await this.removeSafe(items, failed, done);
    if (removed.length) {
      const second = await this.detect();
      if (second) {
        items = second.items;
        removed.push(...(await this.removeSafe(items, failed, done)));
      }
    }
    const left = items.filter((i) => !removed.includes(i.id));
    for (const id of Object.keys(failed)) if (!left.some((i) => i.id === id)) delete failed[id];
    return { report: this.publish({ items: left, failed, scannedAt: this.now() }), done };
  }

  /** Varre, limpa o `safe` e publica. Nunca rejeita; com uma varredura em curso, devolve a dela. */
  sweep(): Promise<OrphanReport> {
    if (this.inFlight) return this.inFlight;
    const promise = this.enqueue(async () => {
      try {
        return (await this.run()).report;
      } catch (e) {
        this.deps.log(`Varredura de órfãs falhou: ${errorLine(e)}`);
        return this.report;
      } finally {
        this.inFlight = null;
      }
    });
    this.inFlight = promise;
    return promise;
  }

  /** Só varre e publica (o "Verificar de novo" da tela). Nunca rejeita. */
  scan(): Promise<OrphanReport> {
    if (this.inFlight) return this.inFlight;
    const promise = this.enqueue(async () => {
      try {
        const fresh = await this.detect();
        if (!fresh)
          return this.publish({ ...(this.deps.snapshot().board.git.mode === 'off' ? EMPTY_ORPHANS : this.report), scannedAt: this.now() });
        const failed = Object.fromEntries(Object.entries(this.report.failed).filter(([id]) => fresh.items.some((i) => i.id === id)));
        return this.publish({ items: fresh.items, failed, scannedAt: this.now() });
      } catch (e) {
        this.deps.log(`Varredura de órfãs falhou: ${errorLine(e)}`);
        return this.report;
      } finally {
        this.inFlight = null;
      }
    });
    this.inFlight = promise;
    return promise;
  }

  /**
   * Limpa um item pedido pela tela, revalidado no host: `safe` sai sem força; `decision` só com
   * `acceptLoss` igual aos números medidos agora (números novos → recusa citando-os). Devolve o aviso.
   */
  clean(id: string, acceptLoss?: AcceptLoss): Promise<string> {
    return this.enqueue(async () => {
      const fresh = await this.detect(new Set([id]));
      if (!fresh)
        return this.deps.snapshot().board.git.mode === 'off' ? 'O git do board está desligado.' : 'Não removida: a varredura falhou.';
      const item = fresh.items.find((i) => i.id === id);
      let text: string;
      const failed = { ...this.report.failed };
      const loss = acceptLoss ?? null;
      if (!item) text = 'Já não é órfã.';
      else if (item.verdict !== 'safe' && !loss) text = `Não removida: ${blockerText(item)}.`;
      else if (item.verdict !== 'safe' && loss && (item.dirtyFiles !== loss.dirtyFiles || item.uniqueCommits !== loss.uniqueCommits))
        text = `Não removida: mudou desde a listagem, agora são ${lossText(item.dirtyFiles, item.uniqueCommits) || 'outros números'}.`;
      else {
        try {
          text = this.remove(fresh.state, item, item.verdict !== 'safe');
          delete failed[item.id];
        } catch (e) {
          text = this.noteFailure(failed, item, e);
        }
      }
      // a lista publicada reflete o que sobrou
      const after = await this.detect();
      if (after) {
        for (const k of Object.keys(failed)) if (!after.items.some((i) => i.id === k)) delete failed[k];
        this.publish({ items: after.items, failed, scannedAt: this.now() });
      }
      return text;
    });
  }

  /** Remove todas as `safe` (revalidadas) e devolve o resumo. */
  cleanSafe(): Promise<string> {
    return this.enqueue(async () => {
      const { report, done } = await this.run();
      const failures = Object.keys(report.failed).length;
      if (!done.length)
        return failures ? `Nenhuma removida; ${failures} falha(s): veja a lista.` : 'Nenhuma branch ou worktree segura para remover.';
      return [...done, failures ? `${failures} não removida(s): veja a lista.` : ''].filter(Boolean).join('\n');
    });
  }
}
