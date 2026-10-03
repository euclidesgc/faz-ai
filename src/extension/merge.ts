import { cardRef, type Card } from '../shared/model';
import { columnsOf, openChildren } from '../shared/selectors';
import { removeWorktree } from './git';
import type { MessageRouter } from './panel/messageRouter';

export interface MergeDeps {
  /** roda o `gh` na pasta do projeto; rejeita com a mensagem de erro do comando */
  gh(args: string[], cwd: string): Promise<string>;
  log(line: string): void;
  cwd: string;
  /** remove a pasta de trabalho da história depois do merge */
  removeWorktree?: (projectDir: string, worktreePath: string) => void;
}

const AUTHOR = 'Faz AI';

/**
 * Merge automático na homologação: quando uma pessoa aprova uma história cuja próxima coluna é a
 * de conclusão, faz o merge do PR dela e só então conclui o card. Se o merge falhar, o card fica
 * bloqueado com o erro, em vez de aparecer como concluído com o PR aberto.
 */
export class AutoMerger {
  private merging = new Set<string>();

  constructor(
    private router: MessageRouter,
    private deps: MergeDeps,
  ) {
    router.onDidApprove((cardId) => void this.onApproved(cardId));
  }

  /** Coluna de conclusão logo depois da coluna do card, se for o caso de fazer o merge ao aprovar. */
  private target(card: Card) {
    const s = this.router.snapshot();
    if (!s.board.git.autoMerge || card.parentId || !card.prUrl || this.merging.has(card.id)) return null;
    const columns = columnsOf(s, card.workflowId);
    const next = columns[columns.findIndex((c) => c.id === card.columnId) + 1];
    return next?.category === 'done' ? next : null;
  }

  async onApproved(cardId: string): Promise<void> {
    const state = this.router.snapshot();
    const card = state.cards.find((c) => c.id === cardId);
    const done = card && this.target(card);
    if (!card || !done) return;
    const ref = cardRef(card);
    const block = (reason: string) =>
      this.router.handle({ type: 'card.status.set', cardId, status: 'blocked', note: reason }, { author: AUTHOR, source: 'ai' });

    const openKids = openChildren(state, cardId).length;
    if (openKids && state.board.rules.blockDoneWithOpenChildren)
      return void block(`O merge de ${card.prUrl} não foi feito: ${openKids} sub-tarefa(s) da história ainda em aberto.`);

    this.merging.add(cardId);
    // "Em execução" tira o card da fila da IA enquanto o merge acontece
    this.router.handle({ type: 'card.status.set', cardId, status: 'running' }, { author: AUTHOR, source: 'ai' });
    this.deps.log(`[${ref}] Merge de ${card.prUrl} (${state.board.git.mergeMethod}).`);
    try {
      await this.deps.gh(['pr', 'merge', card.prUrl, `--${state.board.git.mergeMethod}`], this.deps.cwd);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.deps.log(`[${ref}] Merge falhou: ${message}`);
      this.merging.delete(cardId);
      return void block(`O merge de ${card.prUrl} falhou: ${message}`);
    }
    this.merging.delete(cardId);
    this.deps.log(`[${ref}] Merge feito; card concluído.`);
    this.router.handle({ type: 'comment.add', cardId, body: `Merge de ${card.prUrl} feito.` }, { author: AUTHOR, source: 'ai' });
    this.router.handle({ type: 'card.move', cardId, columnId: done.id, position: Number.MAX_SAFE_INTEGER }, { author: AUTHOR });

    if (state.board.git.mode === 'worktree' && card.worktreePath) {
      try {
        (this.deps.removeWorktree ?? removeWorktree)(this.deps.cwd, card.worktreePath);
        this.router.handle({ type: 'card.workspace.clear', cardId });
      } catch (e) {
        // alterações não commitadas na worktree: fica para a pessoa decidir
        this.deps.log(`[${ref}] A pasta de trabalho ${card.worktreePath} não foi removida: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
}
