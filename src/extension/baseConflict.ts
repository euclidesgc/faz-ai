import { cardRef, type BoardState, type Card } from '../shared/model';
import type { WebviewToHost } from '../shared/messages';
import { columnOf, isLive } from '../shared/selectors';
import { prBaseOf } from '../shared/gitflow';
import { MAINTENANCE_LIMIT, mapLimit } from './concurrency';
import { CommandError } from './git';

/** O que a conferência antes do PR precisa: o `git` de fundo, o board e o jeito de escrever na conversa. */
export interface BaseConflictDeps {
  /** o `git` assíncrono do boardHost: resolve com a saída, rejeita com `CommandError` (código de saída e saída padrão) */
  git(args: string[], cwd: string): Promise<string>;
  log(line: string): void;
  /** pasta do projeto: as refs são as mesmas em todas as worktrees */
  cwd: string;
  snapshot(): BoardState;
  /** `comment.add` em nome do board */
  act(msg: WebviewToHost): void;
}

/** Parte estável do aviso: o "já avisei" é conferido na conversa (marca + branch + commit), como no `MergeWatcher`. */
export const BASE_CONFLICT_MARK = 'tem conflito com a base';

/** O `merge-tree --write-tree` chegou no git 2.38: abaixo disso a conferência é pulada (RF13). */
const MIN_GIT: [number, number] = [2, 38];
/** Quantos arquivos o aviso lista; o resto vira "e mais N". */
const MAX_FILES = 10;

const short = (sha: string) => sha.slice(0, 7);
/** A primeira linha da mensagem de erro do git: é o que vai para o log. */
const firstLine = (e: unknown): string => (e instanceof Error ? e.message : String(e)).split('\n')[0]!.trim();

/**
 * Histórias que a conferência olha: vivas, sem pai, em coluna aberta, com branch e ainda sem pull
 * request, em qualquer coluna e status (P3 do PRD: a conferência só lê, não tira o card de ninguém). Pura.
 */
export const baseCheckTargets = (s: BoardState): Card[] =>
  s.cards.filter((c) => isLive(c) && !c.parentId && c.branch !== '' && c.prUrl === '' && columnOf(s, c)?.category === 'open');

/** `git version 2.39.3 (Apple Git-146)` → [2, 39]; null quando a saída não traz a versão. */
export const parseGitVersion = (out: string): [number, number] | null => {
  const m = /git version (\d+)\.(\d+)/.exec(out);
  return m ? [Number(m[1]), Number(m[2])] : null;
};

const atLeast = (v: [number, number], min: [number, number]) => v[0] > min[0] || (v[0] === min[0] && v[1] >= min[1]);

/** O aviso na conversa: cita a branch e o commit dela (um aviso por commit) e diz à IA o que fazer antes do PR. */
export const baseConflictNotice = (branch: string, base: string, oid: string, files: string[]): string => {
  const shown = files.slice(0, MAX_FILES).join(', ');
  const more = files.length > MAX_FILES ? ` e mais ${files.length - MAX_FILES}` : '';
  const where = files.length ? `, em: ${shown}${more}` : '';
  return (
    `A branch ${branch} ${BASE_CONFLICT_MARK} origin/${base} (commit ${short(oid)})${where}. ` +
    `Antes de abrir o pull request, atualize a branch por merge a partir de origin/${base} (sem rebase nem push forçado), ` +
    `resolva os conflitos e rode as checagens.`
  );
};

/** A conversa já tem o aviso deste commit da branch. */
export const baseConflictTold = (s: BoardState, card: Card, oid: string): boolean =>
  s.comments.some(
    (c) => c.cardId === card.id && c.body.includes(BASE_CONFLICT_MARK) && c.body.includes(card.branch) && c.body.includes(short(oid)),
  );

/** O que a conferência de uma história encontrou: só leitura, nada mudou. */
type Check = { kind: 'clean' } | { kind: 'conflict'; base: string; oid: string; files: string[] } | { kind: 'skip'; reason: string };

/**
 * A conferência antes do PR, na manutenção de cada rodada do heartbeat (#747): para a história com
 * branch e sem pull request, pergunta ao git se o merge dela com `origin/<base>` teria conflito, com
 * `git merge-tree --write-tree`, que só lê (não toca pasta, índice nem refs; os objetos soltos que ele
 * grava o `gc` recolhe). Com conflito, avisa na conversa uma vez por commit da branch, para a IA tratar
 * ao trabalhar a fase. Não move o card nem muda o status. Supõe o fetch da `Maintenance` já feito. Git
 * anterior a 2.38, base ausente no origin ou branch ausente nesta máquina: pula, com uma linha no log
 * por motivo. Não depende da API do VSCode.
 */
export class BaseConflictChecker {
  private busy = false;
  /** a versão do git já conferida nesta abertura: true = serve, false = antiga (já avisada no log) */
  private gitOk: boolean | null = null;
  /** o último motivo de pulo que foi para o log, por história: o mesmo não se repete a cada rodada */
  private lastSkip = new Map<string, string>();

  constructor(private deps: BaseConflictDeps) {}

  /** Uma passada. Com outra em andamento, não começa. Nunca rejeita. */
  async runNow(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.pass();
    } catch (e) {
      this.deps.log(`Conflito antes do PR: falha inesperada: ${firstLine(e)}`);
    } finally {
      this.busy = false;
    }
  }

  private async pass(): Promise<void> {
    const s = this.deps.snapshot();
    if (s.board.git.mode === 'off') return;
    const targets = baseCheckTargets(s);
    // o que saiu dos alvos esquece o motivo: se voltar e o motivo persistir, aparece de novo
    const ids = new Set(targets.map((c) => c.id));
    for (const id of [...this.lastSkip.keys()]) if (!ids.has(id)) this.lastSkip.delete(id);
    if (!targets.length || !(await this.versionOk())) return;

    // as medições vão em paralelo, com o teto da manutenção; os avisos, em série, na ordem dos alvos
    const checks = await mapLimit(targets, MAINTENANCE_LIMIT, (card) => this.check(s, card));
    for (const [i, card] of targets.entries()) {
      const c = checks[i]!;
      if (c.kind === 'skip') this.skipped(card, c.reason);
      else {
        this.lastSkip.delete(card.id);
        if (c.kind === 'conflict') this.announce(card, c.base, c.oid, c.files);
      }
    }
  }

  /** `git --version` uma vez por abertura; antiga demais, uma linha no log e nada mais. */
  private async versionOk(): Promise<boolean> {
    if (this.gitOk !== null) return this.gitOk;
    let out: string;
    try {
      out = await this.deps.git(['--version'], this.deps.cwd);
    } catch (e) {
      this.deps.log(`Conflito antes do PR: conferência pulada, git --version falhou: ${firstLine(e)}`);
      return false; // tenta de novo na próxima rodada
    }
    const v = parseGitVersion(out);
    this.gitOk = !!v && atLeast(v, MIN_GIT);
    if (!this.gitOk) this.deps.log(`Conflito antes do PR: conferência pulada, git ${v ? v.join('.') : out.trim()} é anterior a 2.38.`);
    return this.gitOk;
  }

  /** Só leitura: as duas pontas e o merge virtual entre elas. */
  private async check(s: BoardState, card: Card): Promise<Check> {
    const base = prBaseOf(s, card)?.prBase ?? '';
    if (!base) return { kind: 'clean' }; // sem base conhecida não há o que comparar
    const baseRef = `refs/remotes/origin/${base}`;
    if (!(await this.ref(baseRef))) return { kind: 'skip', reason: `origin/${base} não existe` };
    const oid = await this.ref(`refs/heads/${card.branch}`);
    if (!oid) return { kind: 'skip', reason: `a branch ${card.branch} não existe nesta máquina` };
    try {
      await this.deps.git(['merge-tree', '--write-tree', '--name-only', '--no-messages', baseRef, oid], this.deps.cwd);
      return { kind: 'clean' };
    } catch (e) {
      // saída 1 é conflito quando a primeira linha é a árvore gerada; ref inválida também sai com 1, mas sem árvore
      const lines = e instanceof CommandError ? e.stdout.split('\n').map((l) => l.trim()) : [];
      if (e instanceof CommandError && e.exitCode === 1 && /^[0-9a-f]{40,64}$/.test(lines[0] ?? ''))
        return { kind: 'conflict', base, oid, files: lines.slice(1).filter(Boolean) };
      return { kind: 'skip', reason: `git merge-tree falhou: ${firstLine(e)}` };
    }
  }

  /** O commit da ref, ou '' quando ela não existe. */
  private async ref(name: string): Promise<string> {
    try {
      return (await this.deps.git(['rev-parse', '--verify', '--quiet', `${name}^{commit}`], this.deps.cwd)).trim();
    } catch {
      return '';
    }
  }

  /** Avisa na conversa, uma vez por commit da branch; confere de novo no board de agora. */
  private announce(card: Card, base: string, oid: string, files: string[]): void {
    const s = this.deps.snapshot();
    const live = s.cards.find((c) => c.id === card.id);
    if (!live || live.branch !== card.branch || live.prUrl !== '' || baseConflictTold(s, live, oid)) return;
    this.deps.act({ type: 'comment.add', cardId: live.id, body: baseConflictNotice(live.branch, base, oid, files) });
    this.deps.log(`[${cardRef(live)}] A branch ${live.branch} tem conflito com origin/${base} (commit ${short(oid)}); aviso na conversa.`);
  }

  private skipped(card: Card, reason: string): void {
    if (this.lastSkip.get(card.id) === reason) return;
    this.lastSkip.set(card.id, reason);
    this.deps.log(`[${cardRef(card)}] Conflito antes do PR: conferência pulada: ${reason}.`);
  }
}
