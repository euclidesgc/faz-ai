// Grava e lê `card_events`: o que aconteceu com um card, quem fez e em que execução de IA (se houve).
// O diff que decide quais eventos nascer (passo 3, `eventsFor`) e a ligação com o router (passos 4/5)
// não são deste arquivo — aqui é só o repositório.
import type { Database } from 'sql.js';
import type { CardEvent } from '../../shared/log';
import { monthOf, truncateTitle } from '../../shared/log';
import { newId } from '../db/ids';
import { all, run, str, strOrNull, type Row } from '../db/query';

function toEvent(r: Row): CardEvent {
  return {
    id: str(r.id),
    boardId: str(r.board_id),
    at: Number(r.at),
    month: str(r.month),
    kind: str(r.kind) as CardEvent['kind'],
    cardId: strOrNull(r.card_id),
    cardNumber: Number(r.card_number),
    cardTitle: str(r.card_title),
    cardType: str(r.card_type),
    workflow: str(r.workflow),
    columnName: str(r.column_name),
    fromValue: str(r.from_value),
    toValue: str(r.to_value),
    subject: str(r.subject),
    author: str(r.author),
    source: str(r.source) as CardEvent['source'],
    runId: strOrNull(r.run_id),
  };
}

export class CardEventRepo {
  constructor(private db: Database) {}

  /** Grava um evento; `month` vem de `monthOf(at)` e `cardTitle` é cortado em `CARD_TITLE_MAX_LENGTH`. Devolve o id. */
  add(event: Omit<CardEvent, 'id' | 'month'>): string {
    const id = newId();
    run(
      this.db,
      `INSERT INTO card_events(id, board_id, at, month, kind, card_id, card_number, card_title, card_type, workflow,
         column_name, from_value, to_value, subject, author, source, run_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        event.boardId,
        event.at,
        monthOf(event.at),
        event.kind,
        event.cardId,
        event.cardNumber,
        truncateTitle(event.cardTitle),
        event.cardType,
        event.workflow,
        event.columnName,
        event.fromValue,
        event.toValue,
        event.subject,
        event.author,
        event.source,
        event.runId,
      ],
    );
    return id;
  }

  /** Eventos de um card pelo número visível, do mais antigo para o mais recente. */
  byCard(number: number): CardEvent[] {
    return all(this.db, 'SELECT * FROM card_events WHERE card_number = ? ORDER BY at', [number]).map(toEvent);
  }

  /** Eventos de um mês ('YYYY-MM'), do mais antigo para o mais recente. */
  byMonth(month: string): CardEvent[] {
    return all(this.db, 'SELECT * FROM card_events WHERE month = ? ORDER BY at', [month]).map(toEvent);
  }

  /** Meses que ainda têm detalhe (não foram descartados pela consolidação), em ordem crescente. */
  monthsWithDetail(): string[] {
    return all(this.db, 'SELECT DISTINCT month FROM card_events ORDER BY month').map((r) => str(r.month));
  }

  /** Descarta o detalhe de um mês (a consolidação já arquivou os totais em `log_months`). */
  deleteMonth(month: string): void {
    run(this.db, 'DELETE FROM card_events WHERE month = ?', [month]);
  }
}
