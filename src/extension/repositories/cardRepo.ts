import type { Database } from 'sql.js';
import type { FieldValue } from '../../shared/model';
import { norm } from '../../shared/filters';
import { parseRules } from '../../shared/rules';
import type { CardStatus } from '../../shared/status';
import { newId, now } from '../db/ids';
import { all, num, one, run, str, transaction, type Row } from '../db/query';

/** Status de um card ao entrar numa coluna: "Pronto" onde a IA atua, vazio nas demais. */
const entryStatus = (col: Row): CardStatus | null => (num(col.ai_active) === 1 && str(col.category) === 'open' ? 'ready' : null);

export class CardRepo {
  constructor(private db: Database) {}

  create(boardId: string, input: { typeId: string; columnId: string; parentId: string | null; title: string }): string {
    const db = this.db;
    const col = one(
      db,
      'SELECT c.workflow_id, c.category, c.ai_active, w.kind FROM columns c JOIN workflows w ON w.id = c.workflow_id WHERE c.id = ?',
      [input.columnId],
    );
    if (!col) throw new Error('Coluna não encontrada');
    const kind = str(col.kind);
    if (kind === 'child' && !input.parentId) throw new Error('Sub-tarefa precisa de um card pai');
    if (kind === 'parent' && input.parentId) throw new Error('Card de história não pode ter pai');
    if (input.parentId) {
      const parent = one(db, 'SELECT id FROM cards WHERE id = ? AND board_id = ?', [input.parentId, boardId]);
      if (!parent) throw new Error('Card pai não encontrado');
    }
    const pos = num(one(db, 'SELECT COALESCE(MAX(position), -1) + 1 AS p FROM cards WHERE column_id = ?', [input.columnId])?.p);
    const id = newId();
    const t = now();
    return transaction(db, () => {
      // o contador fica no board para que o número de um card apagado nunca volte a ser usado
      const number = num(one(db, 'SELECT next_card_number AS n FROM boards WHERE id = ?', [boardId])?.n);
      run(db, 'UPDATE boards SET next_card_number = ? WHERE id = ?', [number + 1, boardId]);
      run(
        db,
        `INSERT INTO cards(id, number, board_id, workflow_id, column_id, type_id, parent_id, title, description, position, created_at, updated_at, status, status_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          id,
          number,
          boardId,
          str(col.workflow_id),
          input.columnId,
          input.typeId,
          input.parentId,
          input.title.trim() || 'Sem título',
          '',
          pos,
          t,
          t,
          entryStatus(col),
          t,
        ],
      );
      // padrões do tipo (ex.: modelo e skills), só para campos que ainda existem
      const defaults = JSON.parse(
        str(one(db, 'SELECT defaults_json FROM card_types WHERE id = ?', [input.typeId])?.defaults_json) || '{}',
      ) as Record<string, FieldValue>;
      for (const [fieldId, value] of Object.entries(defaults)) {
        if (one(db, 'SELECT id FROM field_defs WHERE id = ? AND board_id = ?', [fieldId, boardId]))
          run(db, 'INSERT INTO field_values(card_id, field_id, value_json) VALUES (?,?,?)', [id, fieldId, JSON.stringify(value)]);
      }
      return id;
    });
  }

  update(cardId: string, patch: { title?: string; description?: string; typeId?: string }): void {
    const sets: string[] = [];
    const params: (string | number)[] = [];
    if (patch.title !== undefined) {
      sets.push('title = ?');
      params.push(patch.title);
    }
    if (patch.description !== undefined) {
      sets.push('description = ?');
      params.push(patch.description);
    }
    if (patch.typeId !== undefined) {
      sets.push('type_id = ?');
      params.push(patch.typeId);
    }
    if (!sets.length) return;
    sets.push('updated_at = ?');
    params.push(now(), cardId);
    run(this.db, `UPDATE cards SET ${sets.join(', ')} WHERE id = ?`, params);
  }

  /** Move para coluna (mesmo workflow) e reindexa as posições das colunas afetadas. */
  move(
    cardId: string,
    columnId: string,
    position: number,
    opts: { cancelChildren?: boolean; byAi?: boolean; allowOpenChildren?: boolean } = {},
  ): void {
    transaction(this.db, () => {
      this.moveInner(cardId, columnId, position, opts.byAi, opts.allowOpenChildren);
      if (opts.cancelChildren) this.cancelOpenChildren(cardId, columnId);
    });
  }

  /**
   * Se a história foi para uma coluna de cancelamento, leva as sub-tarefas em aberto para a coluna
   * de cancelamento do workflow delas (criada como "Cancelado" se ainda não existir).
   */
  private cancelOpenChildren(parentId: string, parentColumnId: string): void {
    const db = this.db;
    if (str(one(db, 'SELECT category FROM columns WHERE id = ?', [parentColumnId])?.category) !== 'cancelled') return;
    const kids = all(
      db,
      `SELECT c.id, c.workflow_id FROM cards c JOIN columns k ON k.id = c.column_id
       WHERE c.parent_id = ? AND c.deleted_at IS NULL AND c.archived_at IS NULL AND k.category = 'open' ORDER BY c.position`,
      [parentId],
    );
    const target = new Map<string, string>();
    for (const kid of kids) {
      const wf = str(kid.workflow_id);
      if (!target.has(wf)) {
        let col = one(db, "SELECT id FROM columns WHERE workflow_id = ? AND category = 'cancelled' ORDER BY position LIMIT 1", [wf]);
        if (!col) {
          const id = newId();
          const pos = num(one(db, 'SELECT COALESCE(MAX(position), -1) + 1 AS p FROM columns WHERE workflow_id = ?', [wf])?.p);
          run(db, "INSERT INTO columns(id, workflow_id, name, position, is_terminal, category) VALUES (?,?,?,?,1,'cancelled')", [
            id,
            wf,
            'Cancelado',
            pos,
          ]);
          col = { id };
        }
        target.set(wf, str(col.id));
      }
      this.moveInner(str(kid.id), target.get(wf)!, Number.MAX_SAFE_INTEGER);
    }
  }

  /**
   * `allowOpenChildren` desliga só a checagem de `blockDoneWithOpenChildren` abaixo; nenhuma outra
   * validação deste método é afetada. Quem usa: o `MergeWatcher`, porque o merge do pull request já
   * aconteceu e é irreversível — bloquear a conclusão descreveria um impedimento que não existe mais.
   * Não é exposta pela interface nem pelo MCP: um `true` descuidado em outro lugar passaria a regra
   * por cima sem aviso.
   */
  private moveInner(cardId: string, columnId: string, position: number, byAi = false, allowOpenChildren = false): void {
    const db = this.db;
    {
      const card = one(db, 'SELECT board_id, workflow_id, column_id, parent_id, title, status FROM cards WHERE id = ?', [cardId]);
      if (!card) throw new Error('Card não encontrado');
      const col = one(db, 'SELECT workflow_id, category, position, ai_active FROM columns WHERE id = ?', [columnId]);
      if (!col) throw new Error('Coluna não encontrada');
      if (str(col.workflow_id) !== str(card.workflow_id)) throw new Error('Não é possível mover entre workflows');

      const fromCol = str(card.column_id);
      // regra: um card pai só vai para uma coluna de conclusão quando não restam sub-tarefas em aberto
      if (
        str(col.category) === 'done' &&
        card.parent_id == null &&
        fromCol !== columnId &&
        !allowOpenChildren &&
        this.rules(str(card.board_id)).blockDoneWithOpenChildren
      ) {
        const open = num(
          one(
            db,
            `SELECT COUNT(*) AS n FROM cards c JOIN columns k ON k.id = c.column_id
             WHERE c.parent_id = ? AND c.deleted_at IS NULL AND c.archived_at IS NULL AND k.category = 'open'`,
            [cardId],
          )?.n,
        );
        if (open > 0) throw new Error(`Não é possível concluir "${str(card.title)}": ${open} sub-tarefa(s) ainda em aberto.`);
      }
      // regra: a história só avança de fase quando as sub-tarefas daquela fase (campo "Fase" = coluna atual) saíram de aberto
      if (
        card.parent_id == null &&
        fromCol !== columnId &&
        str(col.category) !== 'cancelled' &&
        this.rules(str(card.board_id)).blockPhaseAdvanceWithOpenChildren
      ) {
        const from = one(db, 'SELECT name, position FROM columns WHERE id = ?', [fromCol]);
        if (from && num(col.position) > num(from.position)) {
          const phase = norm(str(from.name));
          const pending = all(
            db,
            `SELECT fv.value_json FROM cards c JOIN columns k ON k.id = c.column_id
             JOIN field_values fv ON fv.card_id = c.id JOIN field_defs f ON f.id = fv.field_id
             WHERE c.parent_id = ? AND c.deleted_at IS NULL AND c.archived_at IS NULL AND k.category = 'open' AND lower(f.name) = 'fase'`,
            [cardId],
          ).filter((r) => norm(String(JSON.parse(str(r.value_json)))) === phase).length;
          if (pending > 0)
            throw new Error(
              `Não é possível avançar "${str(card.title)}": ${pending} sub-tarefa(s) da fase ${str(from.name)} ainda em aberto.`,
            );
        }
      }
      // regra: a IA só avança um card de uma coluna que exige aprovação depois que uma pessoa aprova; voltar ou cancelar é livre.
      // Em modo autônomo (YOLO) a aprovação não é exigida: a pessoa abriu mão dela ao ligar o modo na história
      if (byAi && !this.isYolo(cardId) && fromCol !== columnId && str(col.category) !== 'cancelled') {
        const from = one(db, 'SELECT name, position, requires_approval FROM columns WHERE id = ?', [fromCol]);
        if (from && num(from.requires_approval) === 1 && num(col.position) > num(from.position) && str(card.status) !== 'approved')
          throw new Error(
            `"${str(card.title)}" só sai de ${str(from.name)} com a aprovação de uma pessoa. Peça a revisão com request_review e pare; quando o status for "approved", mova o card.`,
          );
      }
      const ids = all(db, 'SELECT id FROM cards WHERE column_id = ? AND id != ? ORDER BY position', [columnId, cardId]).map((r) =>
        str(r.id),
      );
      const idx = Math.max(0, Math.min(position, ids.length));
      ids.splice(idx, 0, cardId);
      ids.forEach((id, i) =>
        run(db, 'UPDATE cards SET column_id = ?, position = ?, updated_at = ? WHERE id = ?', [columnId, i, now(), id]),
      );

      if (fromCol !== columnId) {
        all(db, 'SELECT id FROM cards WHERE column_id = ? ORDER BY position', [fromCol]).forEach((r, i) =>
          run(db, 'UPDATE cards SET position = ? WHERE id = ?', [i, str(r.id)]),
        );
        // o status vale para a coluna: ao entrar em outra, recomeça. Exceção: a IA que está executando o card
        // e o move para outra coluna em que ela atua (start_work e depois "Em andamento") continua executando;
        // zerar aqui apagaria o LED da sub-tarefa segundos depois de acender.
        const keepRunning = str(card.status) === 'running' && entryStatus(col) === 'ready';
        if (!keepRunning)
          run(db, "UPDATE cards SET status = ?, status_reason = '', status_at = ?, status_by = '' WHERE id = ?", [
            entryStatus(col),
            now(),
            cardId,
          ]);
      }
    }
  }

  /** Manda o card (e suas sub-tarefas ainda ativas) para a lixeira. */
  trash(cardId: string): void {
    this.mark('deleted_at', cardId);
  }

  restore(cardId: string): void {
    this.unmark('deleted_at', cardId, 'Restaure a história pai primeiro');
  }

  archive(cardId: string): void {
    this.mark('archived_at', cardId);
  }

  /** Desarquiva; opcionalmente já move para uma coluna/posição. */
  unarchive(cardId: string, columnId?: string, position?: number, byAi = false): void {
    transaction(this.db, () => {
      this.unmark('archived_at', cardId, 'Desarquive a história pai primeiro');
      if (columnId) this.moveInner(cardId, columnId, position ?? Number.MAX_SAFE_INTEGER, byAi);
    });
  }

  /**
   * Restaura um card arquivado pela aba Arquivados. O alvo é o próprio card ou, numa sub-tarefa cuja história
   * também está arquivada, a história: ela volta com todas as sub-tarefas arquivadas dela (as da lixeira ficam).
   * Cada card vai para o fim da primeira coluna do próprio workflow, inativo (sem status de trabalho), e a
   * história sai do modo autônomo. Devolve o id do alvo restaurado.
   */
  restoreArchived(cardId: string): string {
    const db = this.db;
    return transaction(db, () => {
      const card = one(db, 'SELECT id, parent_id, archived_at FROM cards WHERE id = ?', [cardId]);
      if (!card) throw new Error('Card não encontrado');
      if (card.archived_at == null) return cardId;
      let targetId = cardId;
      if (card.parent_id != null) {
        const parent = one(db, 'SELECT archived_at, deleted_at FROM cards WHERE id = ?', [str(card.parent_id)]);
        if (parent && parent.archived_at != null && parent.deleted_at == null) targetId = str(card.parent_id);
      }
      const ids = all(
        db,
        'SELECT id FROM cards WHERE (id = ? OR parent_id = ?) AND archived_at IS NOT NULL AND deleted_at IS NULL ORDER BY (id = ?) DESC, archived_at',
        [targetId, targetId, targetId],
      ).map((r) => str(r.id));
      for (const id of ids) {
        const row = one(db, 'SELECT workflow_id FROM cards WHERE id = ?', [id]);
        const first = one(db, 'SELECT id FROM columns WHERE workflow_id = ? ORDER BY position LIMIT 1', [str(row?.workflow_id)]);
        if (!first) throw new Error('Workflow sem colunas');
        const t = now();
        run(db, 'UPDATE cards SET archived_at = NULL, yolo = 0, updated_at = ? WHERE id = ?', [t, id]);
        this.moveInner(id, str(first.id), Number.MAX_SAFE_INTEGER);
        // a primeira coluna pode ter a IA ativa (entrada "Pronto"): restaurado volta inativo, como a pessoa espera
        run(db, "UPDATE cards SET status = NULL, status_reason = '', status_at = ?, status_by = '' WHERE id = ?", [t, id]);
      }
      return targetId;
    });
  }

  setStatus(cardId: string, status: CardStatus | null, reason: string, by: string): void {
    run(this.db, 'UPDATE cards SET status = ?, status_reason = ?, status_at = ?, status_by = ? WHERE id = ?', [
      status,
      reason,
      now(),
      by,
      cardId,
    ]);
  }

  setWorkspace(cardId: string, branch: string, worktreePath: string): void {
    run(this.db, 'UPDATE cards SET branch = ?, worktree_path = ? WHERE id = ?', [branch, worktreePath, cardId]);
  }

  /** Guarda de qual branch a da história partiu (vazio = a principal). */
  setBaseBranch(cardId: string, base: string): void {
    run(this.db, 'UPDATE cards SET base_branch = ? WHERE id = ?', [base, cardId]);
  }

  /** Guarda quando a branch da história foi criada, para empilhar pela ordem real de criação (#185). */
  setBranchCreatedAt(cardId: string, at: number): void {
    run(this.db, 'UPDATE cards SET branch_created_at = ? WHERE id = ?', [String(at), cardId]);
  }

  setExecProfile(cardId: string, profileId: string | null): void {
    run(this.db, 'UPDATE cards SET exec_profile = ? WHERE id = ?', [profileId || null, cardId]);
  }

  /** Liga ou desliga o modo autônomo da história. */
  setYolo(storyId: string, enabled: boolean): void {
    run(this.db, 'UPDATE cards SET yolo = ?, updated_at = ? WHERE id = ?', [enabled ? 1 : 0, now(), storyId]);
  }

  /**
   * O id da história do card (ele mesmo, ou o pai quando é uma sub-tarefa) quando ela está em modo
   * autônomo; `null` senão. Uma consulta só, para decidir rápido se vale a pena montar o snapshot
   * inteiro do board (ex.: `settleDelivery`, chamado a cada movimento de qualquer card).
   */
  yoloStoryIdOf(cardId: string): string | null {
    const row = one(
      this.db,
      'SELECT COALESCE(p.id, c.id) AS story_id, COALESCE(p.yolo, c.yolo) AS yolo FROM cards c LEFT JOIN cards p ON p.id = c.parent_id WHERE c.id = ?',
      [cardId],
    );
    return row && num(row.yolo) === 1 ? str(row.story_id) : null;
  }

  /** O card (ou a história dele, no caso de uma sub-tarefa) está em modo autônomo. */
  isYolo(cardId: string): boolean {
    const row = one(
      this.db,
      'SELECT COALESCE(p.yolo, c.yolo) AS yolo FROM cards c LEFT JOIN cards p ON p.id = c.parent_id WHERE c.id = ?',
      [cardId],
    );
    return num(row?.yolo) === 1;
  }

  setPullRequest(cardId: string, url: string): void {
    run(this.db, 'UPDATE cards SET pr_url = ? WHERE id = ?', [url, cardId]);
  }

  setMergeCommit(cardId: string, commit: string): void {
    run(this.db, 'UPDATE cards SET merge_commit = ? WHERE id = ?', [commit, cardId]);
  }

  status(cardId: string): CardStatus | null {
    const v = one(this.db, 'SELECT status FROM cards WHERE id = ?', [cardId])?.status;
    return v == null ? null : (str(v) as CardStatus);
  }

  /** Apaga de vez o card e seus filhos. Devolve os ids removidos (para limpar anexos). */
  deletePermanent(cardId: string): string[] {
    const ids = all(this.db, 'SELECT id FROM cards WHERE id = ? OR parent_id = ?', [cardId, cardId]).map((r) => str(r.id));
    run(this.db, 'DELETE FROM cards WHERE id = ?', [cardId]);
    return ids;
  }

  emptyTrash(boardId: string): string[] {
    const db = this.db;
    return transaction(db, () => {
      const ids = all(
        db,
        `SELECT id FROM cards WHERE board_id = ? AND (deleted_at IS NOT NULL
           OR parent_id IN (SELECT id FROM cards WHERE board_id = ? AND deleted_at IS NOT NULL))`,
        [boardId, boardId],
      ).map((r) => str(r.id));
      run(db, 'DELETE FROM cards WHERE board_id = ? AND deleted_at IS NOT NULL', [boardId]);
      return ids;
    });
  }

  private rules(boardId: string) {
    return parseRules(str(one(this.db, 'SELECT rules_json FROM boards WHERE id = ?', [boardId])?.rules_json));
  }

  private mark(col: 'deleted_at' | 'archived_at', cardId: string): void {
    const t = now();
    run(this.db, `UPDATE cards SET ${col} = ?, updated_at = ? WHERE (id = ? OR parent_id = ?) AND ${col} IS NULL`, [t, t, cardId, cardId]);
  }

  /** Limpa a marca do card e dos filhos que foram marcados junto (mesmo timestamp). */
  private unmark(col: 'deleted_at' | 'archived_at', cardId: string, parentError: string): void {
    const db = this.db;
    const card = one(db, `SELECT ${col} AS t, parent_id FROM cards WHERE id = ?`, [cardId]);
    if (!card) throw new Error('Card não encontrado');
    if (card.t == null) return;
    if (card.parent_id != null) {
      const parent = one(db, `SELECT ${col} AS t FROM cards WHERE id = ?`, [str(card.parent_id)]);
      if (parent && parent.t != null) throw new Error(parentError);
    }
    run(db, `UPDATE cards SET ${col} = NULL, updated_at = ? WHERE id = ? OR (parent_id = ? AND ${col} = ?)`, [
      now(),
      cardId,
      cardId,
      num(card.t),
    ]);
  }

  setFieldValue(cardId: string, fieldId: string, value: FieldValue): void {
    if (value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
      run(this.db, 'DELETE FROM field_values WHERE card_id = ? AND field_id = ?', [cardId, fieldId]);
    } else {
      run(this.db, 'INSERT OR REPLACE INTO field_values(card_id, field_id, value_json) VALUES (?,?,?)', [
        cardId,
        fieldId,
        JSON.stringify(value),
      ]);
    }
    run(this.db, 'UPDATE cards SET updated_at = ? WHERE id = ?', [now(), cardId]);
  }
}
