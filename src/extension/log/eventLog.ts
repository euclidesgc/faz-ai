// Liga o log ao funil do router: `probe(msg)` lê os fatos dos cards envolvidos antes do handler e
// `record(msg, actor, probe)` relê depois, chama `eventsFor` e grava os eventos. A regra de "o que
// aconteceu" é de `eventsFor` (puro); aqui é só a leitura por `id` e a gravação.
//
// Limite conhecido e aceito: o log só vê o que passa pelo router. Mudança feita por fora — alguém
// editando o arquivo do banco à mão, ou uma sessão de IA aberta no terminal em vez de pelo board —
// não gera evento e não gera reclamação (RF-12), e o evento que ela produzir pelas ferramentas MCP
// fica sem `run_id`, porque não há execução do board a que ligá-lo (RF-20).
//
// Orçamento: a sonda roda em TODA mutação do board. Ela lê só o card e a família dele, por `id`,
// numa consulta — nunca `snapshot()`, que monta o `BoardState` inteiro. E grava os eventos dentro da
// mesma mutação, antes do `scheduleSave()` que a operação já faria: o `sql.js` reescreve o arquivo
// inteiro a cada gravação, então um `scheduleSave` a mais custaria mais que o log todo. O teste de
// orçamento em `test/log.test.ts` conta as consultas e as gravações de um `card.move`.
import type { Database } from 'sql.js';
import type { WebviewToHost } from '../../shared/messages';
import type { FieldValue, LinkKind } from '../../shared/model';
import { one, str, strOrNull } from '../db/query';
import type { CardEventRepo } from './cardEventRepo';
import { eventsFor, type EventActor, type EventExtra } from './eventsFor';
import { cardFacts, cardFamilyFacts, newestCardFacts, trashedCardFacts, type CardFacts } from './facts';

/** O que a sonda leu antes do handler e como reler depois. */
export interface Probe {
  /** os fatos dos cards envolvidos, como estavam na chegada da mensagem */
  before: Map<string, CardFacts>;
  /** relê o mesmo recorte depois do handler (ou devolve `before`, quando o handler não muda fato nenhum do card) */
  after: () => Map<string, CardFacts>;
  /** o card em que uma execução de IA estaria em curso (`null` para mensagens sem card) */
  cardId: string | null;
  /** o que a mensagem não carrega e o handler apaga ou não devolve: campo anterior, pontas do vínculo */
  extra: Pick<EventExtra, 'field' | 'link'>;
}

export interface EventLogDeps {
  /** muda quando o board é recriado (settings.board.reset) */
  boardId: () => string;
  /** canal de log; as falhas vão para lá e a operação segue */
  log?: (line: string) => void;
}

/** Diz qual execução de IA está em curso num card (`null` quando não há) — informado pelo executor. */
export type RunResolver = (cardId: string) => string | null;

export class EventLog {
  private runResolver: RunResolver | null = null;

  constructor(
    private db: Database,
    private events: CardEventRepo,
    private deps: EventLogDeps,
  ) {}

  setRunResolver(fn: RunResolver | null): void {
    this.runResolver = fn;
  }

  /**
   * Para as mensagens que geram evento, descobre os ids envolvidos e lê os fatos antes do handler.
   * Devolve `null` para as que não geram evento nenhum — nesses casos o custo é uma comparação de string.
   */
  probe(msg: WebviewToHost): Probe | null {
    try {
      return this.probeInner(msg);
    } catch (e) {
      this.fail(e);
      return null;
    }
  }

  /** Depois do handler: relê os fatos, calcula os eventos e grava. Falha vai para o canal de log e a operação segue. */
  record(msg: WebviewToHost, actor: EventActor, probe: Probe | null): void {
    if (!probe) return;
    try {
      const after = probe.after();
      const runId = this.runIdFor(probe, after);
      const extra: EventExtra = { boardId: this.deps.boardId(), at: Date.now(), runId, ...probe.extra };
      if (msg.type === 'card.workspace.prepare') extra.branch = branchOf(after, msg.cardId);
      for (const event of eventsFor(msg, actor, probe.before, after, extra)) this.events.add(event);
    } catch (e) {
      this.fail(e);
    }
  }

  private probeInner(msg: WebviewToHost): Probe | null {
    const db = this.db;
    const family = (id: string): Probe => ({
      before: cardFamilyFacts(db, id),
      after: () => cardFamilyFacts(db, id),
      cardId: id,
      extra: {},
    });

    switch (msg.type) {
      case 'card.create': {
        // o card novo aparece no diff de presença: numa sub-tarefa, pela família do pai; numa história, como o card mais novo do board
        if (msg.parentId) return family(msg.parentId);
        const boardId = this.deps.boardId();
        return { before: new Map(), after: () => newestCardFacts(db, boardId), cardId: null, extra: {} };
      }
      case 'comment.add':
        // o handler devolve `changed` mesmo com o corpo vazio, mas não grava nada: sem evento
        return msg.body.trim() ? family(msg.cardId) : null;
      case 'card.move':
      case 'card.trash':
      case 'card.restore':
      case 'card.archive':
      case 'card.unarchive':
      case 'card.restoreArchived':
      case 'card.deletePermanent':
      case 'card.status.set':
      case 'attachment.addData':
      case 'card.pr.set':
      case 'card.workspace.prepare':
      case 'card.yolo.set':
        return family(msg.cardId);
      case 'card.yolo.inherit': {
        // o `#n` da história de origem entra no evento; ela não é da família
        const ids = [msg.cardId, msg.fromId];
        return { before: cardFacts(db, ids), after: () => cardFacts(db, ids), cardId: msg.cardId, extra: {} };
      }
      case 'trash.empty': {
        const before = trashedCardFacts(db, this.deps.boardId());
        const ids = [...before.keys()];
        return { before, after: () => cardFacts(db, ids), cardId: null, extra: {} };
      }
      case 'card.yolo.setMany': {
        const ids = msg.cardIds;
        return { before: cardFacts(db, ids), after: () => cardFacts(db, ids), cardId: null, extra: {} };
      }
      case 'field.setValue': {
        // o handler troca só o valor do campo: nenhum fato do card muda, e `after` reaproveita a leitura.
        // Limite aceito: mudar "Esforço da atividade" pode trocar "Modelo" em cascata na mesma mensagem,
        // e esse segundo field_changed não sai — cobri-lo exigiria ler os quatro campos de triagem antes
        // e depois, o que estoura o orçamento de duas consultas por mutação.
        const field = fieldBefore(db, msg.cardId, msg.fieldId);
        if (!field) return null;
        const before = cardFacts(db, [msg.cardId]);
        return { before, after: () => before, cardId: msg.cardId, extra: { field } };
      }
      case 'link.add': {
        // vincular não muda fato nenhum dos dois cards: `after` reaproveita a leitura
        const before = cardFacts(db, [msg.fromId, msg.toId]);
        return { before, after: () => before, cardId: msg.fromId, extra: {} };
      }
      case 'link.remove': {
        // a mensagem só traz o id do vínculo: as pontas são lidas antes de o handler apagar a linha
        const link = linkBefore(db, msg.linkId);
        if (!link) return null;
        const before = cardFacts(db, [link.fromId, link.toId]);
        return { before, after: () => before, cardId: link.fromId, extra: { link } };
      }
      default:
        return null;
    }
  }

  /** A execução em curso no card da mensagem ou, numa sub-tarefa, na história dela (a IA trabalha a história inteira). */
  private runIdFor(probe: Probe, after: Map<string, CardFacts>): string | null {
    if (!this.runResolver || !probe.cardId) return null;
    const own = this.runResolver(probe.cardId);
    if (own) return own;
    const parentId = (probe.before.get(probe.cardId) ?? after.get(probe.cardId))?.parentId;
    return parentId ? this.runResolver(parentId) : null;
  }

  private fail(e: unknown): void {
    const message = e instanceof Error ? e.message : String(e);
    (this.deps.log ?? console.error)(`[fazai] falha ao registrar o log do board: ${message}`);
  }
}

/** Nome do campo e o valor que o card tinha nele (`null` quando não tinha). `undefined` se o campo não existe. */
function fieldBefore(db: Database, cardId: string, fieldId: string): { name: string; previous: FieldValue } | undefined {
  const row = one(
    db,
    `SELECT f.name AS name, fv.value_json AS value_json FROM field_defs f
     LEFT JOIN field_values fv ON fv.field_id = f.id AND fv.card_id = ?
     WHERE f.id = ?`,
    [cardId, fieldId],
  );
  if (!row) return undefined;
  const json = strOrNull(row.value_json);
  return { name: str(row.name), previous: json == null ? null : (JSON.parse(json) as FieldValue) };
}

function linkBefore(db: Database, linkId: string): { fromId: string; toId: string; kind: LinkKind } | undefined {
  const row = one(db, 'SELECT from_id, to_id, kind FROM card_links WHERE id = ?', [linkId]);
  return row ? { fromId: str(row.from_id), toId: str(row.to_id), kind: str(row.kind) as LinkKind } : undefined;
}

/** A branch registrada pelo `card.workspace.prepare`: fica na história (o pai, quando o card é uma sub-tarefa). */
function branchOf(after: Map<string, CardFacts>, cardId: string): string {
  const card = after.get(cardId);
  const story = card?.parentId ? after.get(card.parentId) : card;
  return story?.branch ?? '';
}
