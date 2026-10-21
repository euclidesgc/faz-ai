// O retrabalho do painel e do get_metrics: o que a IA entregou para revisão, o que a pessoa aprovou de
// primeira e o que voltou com pedido de ajuste, por fase e por modelo, e os bugs que apareceram depois
// de uma história concluída. É o sinal de qualidade que os benchmarks não medem e o board consegue ver.
// `reworkOf` é puro (as contas); `panelRework` só faz as consultas.
import type { Database } from 'sql.js';
import { norm } from '../../shared/filters';
import { ZERO_SIGNAL, type MetricsRework, type MetricsReworkModel, type MetricsReworkPhase } from '../../shared/metrics';
import { all, num, str } from '../db/query';

/** Uma mudança de status do log, com o modelo da execução que a produziu ('' = sem execução do board). */
export interface ReworkEventRow {
  cardNumber: number;
  /** a coluna (fase) em que o card estava */
  phase: string;
  at: number;
  from: string;
  to: string;
  source: 'human' | 'ai';
  model: string;
}

/** O período em ms, inclusive nas duas pontas. */
export interface ReworkPeriod {
  start: number;
  end: number;
}

const emptyPhase = (phase: string): MetricsReworkPhase => ({
  phase,
  reviews: 0,
  approved: 0,
  adjusted: 0,
  resolved: 0,
  firstPass: 0,
  bashRuns: 0,
  reviewFixes: ZERO_SIGNAL,
  testFailures: ZERO_SIGNAL,
  commitsAfterPr: ZERO_SIGNAL,
});

/**
 * As contas do retrabalho. Pedido de revisão é o card indo para "Aguardando revisão"; a resposta é uma
 * pessoa levando-o dali para "Aprovado" (aprovou) ou para "Pronto" (pediu ajustes). "De primeira" vale
 * por card e fase: a primeira resposta da pessoa naquela fase foi a aprovação. O ajuste conta para o
 * modelo da execução que pediu a revisão respondida. Os eventos antes do período só dão o contexto (o
 * modelo, se a fase já teve resposta): contam só os que caem nele.
 */
export function reworkOf(rows: ReworkEventRow[], period: ReworkPeriod): Pick<MetricsRework, 'phases' | 'models'> {
  const phases = new Map<string, MetricsReworkPhase>();
  const models = new Map<string, MetricsReworkModel>();
  const phaseOf = (name: string) => phases.get(name) ?? phases.set(name, emptyPhase(name)).get(name)!;
  const modelOf = (name: string) => models.get(name) ?? models.set(name, { model: name, reviews: 0, adjusted: 0 }).get(name)!;
  const seen = new Map<string, { model: string; answered: boolean }>();
  const sorted = [...rows].sort((a, b) => a.cardNumber - b.cardNumber || a.at - b.at);
  for (const row of sorted) {
    const key = `${row.cardNumber}\u0000${row.phase}`;
    const passage = seen.get(key) ?? seen.set(key, { model: '', answered: false }).get(key)!;
    const inPeriod = row.at >= period.start && row.at <= period.end;
    if (row.to === 'waiting_review') {
      passage.model = row.model;
      if (inPeriod) {
        phaseOf(row.phase).reviews++;
        modelOf(row.model).reviews++;
      }
      continue;
    }
    const answer = row.from === 'waiting_review' && row.source === 'human' && (row.to === 'approved' || row.to === 'ready');
    if (!answer) continue;
    if (inPeriod) {
      const p = phaseOf(row.phase);
      if (row.to === 'approved') p.approved++;
      else {
        p.adjusted++;
        modelOf(passage.model).adjusted++;
      }
      if (!passage.answered) {
        p.resolved++;
        if (row.to === 'approved') p.firstPass++;
      }
    }
    passage.answered = true;
  }
  return {
    phases: [...phases.values()].filter((p) => p.reviews || p.approved || p.adjusted),
    models: [...models.values()].filter((m) => m.reviews || m.adjusted).sort((a, b) => b.adjusted - a.adjusted || b.reviews - a.reviews),
  };
}

/**
 * As histórias concluídas no período (a primeira conclusão cai nele), fora as do tipo Bug, e os bugs
 * vinculados a elas hoje, em qualquer direção do vínculo, que nasceram depois da conclusão. "Bug" é o
 * tipo de card com esse nome. O vínculo é lido do board atual: o bug aberto depois, contra uma história
 * concluída no período, é justamente o que escapou; o bug que a história veio corrigir, criado antes
 * dela terminar, não.
 */
function escapes(db: Database, boardId: string, period: ReworkPeriod, workflow: string): MetricsRework['escapes'] {
  const wf = workflow ? ' AND e.workflow = ?' : '';
  const stories = all(
    db,
    `SELECT e.card_id AS id, MIN(e.at) AS done_at, t.name AS type FROM card_events e
     JOIN cards c ON c.id = e.card_id JOIN card_types t ON t.id = c.type_id
     WHERE e.board_id = ? AND e.kind = 'done' AND c.parent_id IS NULL AND c.deleted_at IS NULL${wf} GROUP BY e.card_id`,
    [boardId, ...(workflow ? [workflow] : [])],
  ).filter((r) => num(r.done_at) >= period.start && num(r.done_at) <= period.end && norm(str(r.type)) !== 'bug');
  const doneAt = new Map(stories.map((r) => [str(r.id), num(r.done_at)]));
  if (!doneAt.size) return { stories: 0, withBugs: 0, bugs: 0, autonomousStories: 0, autonomousWithBugs: 0, autonomousBugs: 0 };
  const bugsOf = new Map<string, Set<string>>();
  const ids = [...doneAt.keys()];
  const marks = ids.map(() => '?').join(',');
  for (const r of all(
    db,
    `SELECT l.from_id AS a, l.to_id AS b, ta.name AS type_a, tb.name AS type_b, ca.created_at AS created_a, cb.created_at AS created_b
     FROM card_links l
     JOIN cards ca ON ca.id = l.from_id JOIN card_types ta ON ta.id = ca.type_id
     JOIN cards cb ON cb.id = l.to_id JOIN card_types tb ON tb.id = cb.type_id
     WHERE (l.from_id IN (${marks}) OR l.to_id IN (${marks})) AND ca.deleted_at IS NULL AND cb.deleted_at IS NULL`,
    [...ids, ...ids],
  )) {
    for (const [story, other, type, created] of [
      [str(r.a), str(r.b), str(r.type_b), num(r.created_b)],
      [str(r.b), str(r.a), str(r.type_a), num(r.created_a)],
    ] as const) {
      const done = doneAt.get(story);
      if (done === undefined || norm(type) !== 'bug' || created < done) continue;
      (bugsOf.get(story) ?? bugsOf.set(story, new Set()).get(story)!).add(other);
    }
  }
  return {
    stories: doneAt.size,
    withBugs: bugsOf.size,
    bugs: new Set([...bugsOf.values()].flatMap((s) => [...s])).size,
    // a parte autônoma é conta da #1030; aqui só o contrato
    autonomousStories: 0,
    autonomousWithBugs: 0,
    autonomousBugs: 0,
  };
}

/**
 * O retrabalho do período, no recorte de workflow do painel (`card_events` guarda o workflow). Duas
 * mudanças de status não são resposta à revisão: a que vem de mover o card de coluna (o status recomeça
 * na coluna nova; arrastar o card que aguardava revisão não é aprovar nem pedir ajuste) e a que vem de
 * ligar o modo autônomo (que libera a revisão pendente sem ninguém ler). Elas saem pelo `column_changed`
 * ou `yolo_changed` gravado junto, na mesma mensagem (mesmo card, mesmo instante). A exceção é a aprovação:
 * desde a #441 ela leva o card à coluna seguinte na mesma mensagem, e continua sendo a resposta da pessoa.
 */
export function panelRework(db: Database, boardId: string, period: ReworkPeriod, workflow: string): MetricsRework {
  const wf = workflow ? ' AND e.workflow = ?' : '';
  const events = all(
    db,
    `SELECT e.kind, e.card_number, e.column_name, e.at, e.from_value, e.to_value, e.source, r.model
     FROM card_events e LEFT JOIN ai_runs r ON r.id = e.run_id
     WHERE e.board_id = ? AND e.kind IN ('status_changed', 'column_changed', 'yolo_changed') AND e.at <= ?${wf}`,
    [boardId, period.end, ...(workflow ? [workflow] : [])],
  );
  const moves = new Set(events.filter((r) => str(r.kind) !== 'status_changed').map((r) => `${num(r.card_number)}:${num(r.at)}`));
  const rows: ReworkEventRow[] = events
    .filter((r) => str(r.kind) === 'status_changed' && (str(r.to_value) === 'approved' || !moves.has(`${num(r.card_number)}:${num(r.at)}`)))
    .map((r) => ({
      cardNumber: num(r.card_number),
      phase: str(r.column_name),
      at: num(r.at),
      from: str(r.from_value),
      to: str(r.to_value),
      source: str(r.source) === 'ai' ? 'ai' : 'human',
      model: str(r.model),
    }));
  return {
    ...reworkOf(rows, period),
    escapes: escapes(db, boardId, period, workflow),
    // os sinais da IA são consulta da #1030; até lá, "não medido"
    aiSignals: { bashRuns: 0, reviewFixes: ZERO_SIGNAL, testFailures: ZERO_SIGNAL, commitsAfterPr: ZERO_SIGNAL },
  };
}
