// O retrabalho do painel e do get_metrics: o que a IA entregou para revisão, o que a pessoa aprovou de
// primeira e o que voltou com pedido de ajuste, por fase e por modelo, e os bugs que apareceram depois
// de uma história concluída. É o sinal de qualidade que os benchmarks não medem e o board consegue ver.
// `reworkOf` e `aiSignalsOf` são puros (as contas); `panelRework` só faz as consultas. Os sinais da IA
// (#605) medem a precisão onde não há revisão de pessoa, como no modo autônomo: commits na Revisão,
// `npm test` com falha e commits depois do pull request, lidos dos comandos de Bash de cada execução.
import type { Database } from 'sql.js';
import { norm } from '../../shared/filters';
import {
  ZERO_SIGNAL,
  type MetricsAiSignal,
  type MetricsRework,
  type MetricsReworkAgent,
  type MetricsReworkModel,
  type MetricsReworkPhase,
  type MetricsUnfinishedRow,
} from '../../shared/metrics';
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
  /** o agente da execução (`ai_runs.agent`); '' = sem agente */
  agent: string;
}

/** Um ajuste pedido pela pessoa, com o modelo e o agente da execução que pediu a revisão. */
export interface ReworkAdjustment {
  cardNumber: number;
  model: string;
  agent: string;
}

/** Uma história concluída no período (a primeira conclusão cai nele), com o tipo atual. */
export interface DoneStory {
  id: string;
  number: number;
  doneAt: number;
  type: string;
}

/** Execuções terminadas agrupadas por modelo, agente e resultado. */
export interface UnfinishedRunRow {
  model: string;
  agent: string;
  outcome: string;
  n: number;
}

/** O período em ms, inclusive nas duas pontas. */
export interface ReworkPeriod {
  start: number;
  end: number;
}

/** Uma chamada registrada de Bash de uma execução (`ai_run_bash` ⨝ `ai_runs`), com o que os sinais precisam. */
export interface BashSignalRow {
  runId: string;
  /** a história: o card da execução ou o pai dele; null = execução sem card */
  storyId: string | null;
  phase: string;
  autonomous: boolean;
  startedAt: number;
  /** o comando-base, ex.: 'git commit', 'npm test' */
  command: string;
  calls: number;
  failed: number;
  /** quando a história registrou o pull request (primeiro `pull_request_set`); undefined = sem PR */
  prAt?: number;
}

/** Os sinais da IA de uma fase: o que `MetricsReworkPhase` tem além das revisões. */
export type PhaseSignals = Pick<MetricsReworkPhase, 'bashRuns' | 'reviewFixes' | 'testFailures' | 'commitsAfterPr'>;

/** Soma `count` ocorrências de um sinal e marca a chave (execução ou história) como atingida, com a parte autônoma. */
class SignalSum {
  private seen = new Map<string, boolean>();
  private count = 0;
  private autonomousCount = 0;
  add(key: string, count: number, autonomous: boolean): void {
    this.count += count;
    if (autonomous) this.autonomousCount += count;
    // a chave é autônoma se qualquer ocorrência dela foi
    this.seen.set(key, (this.seen.get(key) ?? false) || autonomous);
  }
  value(): MetricsAiSignal {
    return {
      count: this.count,
      runs: this.seen.size,
      autonomousCount: this.autonomousCount,
      autonomousRuns: [...this.seen.values()].filter(Boolean).length,
    };
  }
}

/**
 * As contas dos sinais da IA, uma linha por (execução, comando): só as execuções iniciadas no período.
 * `bashRuns` é a base medida (execuções com algum comando registrado); "correções na Revisão" são os
 * commits de execuções da fase cujo nome normalizado (sem acento) é "revisao" (mesmo critério do tipo "Bug" em
 * `escapes`); "npm test com falha" são as chamadas de `npm test` que voltaram com erro; "commits depois
 * do PR" são os commits de execuções iniciadas depois de a história registrar o pull request. No total,
 * `commitsAfterPr.runs` conta histórias distintas (a história é autônoma se alguma dessas execuções foi);
 * por fase, conta execuções.
 */
export function aiSignalsOf(
  rows: BashSignalRow[],
  period: ReworkPeriod,
): { total: MetricsRework['aiSignals']; byPhase: Map<string, PhaseSignals> } {
  const inPeriod = rows.filter((r) => r.startedAt >= period.start && r.startedAt <= period.end);
  const sums = () => ({
    runs: new Set<string>(),
    reviewFixes: new SignalSum(),
    testFailures: new SignalSum(),
    commitsAfterPr: new SignalSum(),
  });
  const total = sums();
  const phases = new Map<string, ReturnType<typeof sums>>();
  for (const r of inPeriod) {
    const phase = phases.get(r.phase) ?? phases.set(r.phase, sums()).get(r.phase)!;
    for (const acc of [total, phase]) acc.runs.add(r.runId);
    if (r.command === 'git commit' && norm(r.phase) === 'revisao')
      for (const acc of [total, phase]) acc.reviewFixes.add(r.runId, r.calls, r.autonomous);
    if (r.command === 'npm test' && r.failed > 0) for (const acc of [total, phase]) acc.testFailures.add(r.runId, r.failed, r.autonomous);
    if (r.command === 'git commit' && r.storyId !== null && r.prAt !== undefined && r.startedAt > r.prAt) {
      total.commitsAfterPr.add(r.storyId, r.calls, r.autonomous);
      phase.commitsAfterPr.add(r.runId, r.calls, r.autonomous);
    }
  }
  const pack = (acc: ReturnType<typeof sums>): PhaseSignals => ({
    bashRuns: acc.runs.size,
    reviewFixes: acc.reviewFixes.value(),
    testFailures: acc.testFailures.value(),
    commitsAfterPr: acc.commitsAfterPr.value(),
  });
  return { total: pack(total), byPhase: new Map([...phases].map(([phase, acc]) => [phase, pack(acc)])) };
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
export function reworkOf(
  rows: ReworkEventRow[],
  period: ReworkPeriod,
): Pick<MetricsRework, 'phases' | 'models' | 'agents'> & { adjustments: ReworkAdjustment[] } {
  const phases = new Map<string, MetricsReworkPhase>();
  const models = new Map<string, MetricsReworkModel>();
  const phaseOf = (name: string) => phases.get(name) ?? phases.set(name, emptyPhase(name)).get(name)!;
  const modelOf = (name: string) => models.get(name) ?? models.set(name, { model: name, reviews: 0, adjusted: 0 }).get(name)!;
  const agents = new Map<string, MetricsReworkAgent>();
  const agentOf = (name: string) => agents.get(name) ?? agents.set(name, { agent: name, reviews: 0, adjusted: 0 }).get(name)!;
  const adjustments: ReworkAdjustment[] = [];
  const seen = new Map<string, { model: string; agent: string; answered: boolean }>();
  const sorted = [...rows].sort((a, b) => a.cardNumber - b.cardNumber || a.at - b.at);
  for (const row of sorted) {
    const key = `${row.cardNumber}\u0000${row.phase}`;
    const passage = seen.get(key) ?? seen.set(key, { model: '', agent: '', answered: false }).get(key)!;
    const inPeriod = row.at >= period.start && row.at <= period.end;
    if (row.to === 'waiting_review') {
      passage.model = row.model;
      passage.agent = row.agent;
      if (inPeriod) {
        phaseOf(row.phase).reviews++;
        modelOf(row.model).reviews++;
        agentOf(row.agent).reviews++;
      }
      continue;
    }
    const answer = row.from === 'waiting_review' && row.source === 'human' && (row.to === 'approved' || row.to === 'ready');
    if (!answer) continue;
    // o ajuste conta para a visão cruzada em qualquer data até o fim do período
    if (row.to === 'ready') adjustments.push({ cardNumber: row.cardNumber, model: passage.model, agent: passage.agent });
    if (inPeriod) {
      const p = phaseOf(row.phase);
      if (row.to === 'approved') p.approved++;
      else {
        p.adjusted++;
        modelOf(passage.model).adjusted++;
        agentOf(passage.agent).adjusted++;
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
    agents: [...agents.values()].filter((a) => a.reviews || a.adjusted).sort((a, b) => b.adjusted - a.adjusted || b.reviews - a.reviews),
    adjustments,
  };
}

/**
 * As execuções sem resultado por modelo e por agente. Só entram as com `outcome` (as em andamento não):
 * `failed`, `timeout` e `stopped` são "sem resultado"; `unsupported` e `unknown` contam só no total.
 * Ordem: mais sem resultado primeiro, depois mais execuções.
 */
export function unfinishedOf(rows: UnfinishedRunRow[]): MetricsRework['unfinished'] {
  const pack = (key: 'model' | 'agent'): MetricsUnfinishedRow[] => {
    const map = new Map<string, MetricsUnfinishedRow>();
    for (const r of rows) {
      const value = r[key];
      const row = map.get(value) ?? map.set(value, { value, runs: 0, unfinished: 0, failed: 0, timeout: 0, stopped: 0 }).get(value)!;
      row.runs += r.n;
      if (r.outcome === 'failed' || r.outcome === 'timeout' || r.outcome === 'stopped') {
        row[r.outcome] += r.n;
        row.unfinished += r.n;
      }
    }
    return [...map.values()].sort((a, b) => b.unfinished - a.unfinished || b.runs - a.runs);
  };
  return { models: pack('model'), agents: pack('agent') };
}

/**
 * As histórias cuja primeira conclusão cai no período, com o tipo atual (Bug incluídos), no recorte de
 * workflow do evento `done`. Quem precisa de outro recorte filtra o resultado.
 */
export function doneStories(db: Database, boardId: string, period: ReworkPeriod, workflow: string): DoneStory[] {
  const wf = workflow ? ' AND e.workflow = ?' : '';
  return all(
    db,
    `SELECT e.card_id AS id, c.number AS number, MIN(e.at) AS done_at, t.name AS type FROM card_events e
     JOIN cards c ON c.id = e.card_id JOIN card_types t ON t.id = c.type_id
     WHERE e.board_id = ? AND e.kind = 'done' AND c.parent_id IS NULL AND c.deleted_at IS NULL${wf} GROUP BY e.card_id`,
    [boardId, ...(workflow ? [workflow] : [])],
  )
    .map((r) => ({ id: str(r.id), number: num(r.number), doneAt: num(r.done_at), type: str(r.type) }))
    .filter((r) => r.doneAt >= period.start && r.doneAt <= period.end);
}

/**
 * As histórias concluídas no período (a primeira conclusão cai nele), fora as do tipo Bug, e os bugs
 * vinculados a elas hoje, em qualquer direção do vínculo, que nasceram depois da conclusão. "Bug" é o
 * tipo de card com esse nome. O vínculo é lido do board atual: o bug aberto depois, contra uma história
 * concluída no período, é justamente o que escapou; o bug que a história veio corrigir, criado antes
 * dela terminar, não.
 */
function escapes(db: Database, boardId: string, period: ReworkPeriod, workflow: string): MetricsRework['escapes'] {
  const stories = doneStories(db, boardId, period, workflow).filter((r) => norm(r.type) !== 'bug');
  const doneAt = new Map(stories.map((r) => [r.id, r.doneAt]));
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
  // a história é autônoma se alguma execução dela (ou de uma sub-tarefa) rodou em modo autônomo (#605)
  const autonomous = new Set(
    all(
      db,
      `SELECT DISTINCT COALESCE(c.parent_id, r.card_id) AS story_id FROM ai_runs r LEFT JOIN cards c ON c.id = r.card_id
       WHERE r.board_id = ? AND r.autonomous = 1 AND COALESCE(c.parent_id, r.card_id) IN (${marks})`,
      [boardId, ...ids],
    ).map((r) => str(r.story_id)),
  );
  const autonomousWithBugs = [...bugsOf.keys()].filter((id) => autonomous.has(id));
  return {
    stories: doneAt.size,
    withBugs: bugsOf.size,
    bugs: new Set([...bugsOf.values()].flatMap((s) => [...s])).size,
    autonomousStories: autonomous.size,
    autonomousWithBugs: autonomousWithBugs.length,
    autonomousBugs: new Set(autonomousWithBugs.flatMap((id) => [...bugsOf.get(id)!])).size,
  };
}

/**
 * Os eventos de status que valem para o retrabalho, até `end`, no recorte de workflow ('' = todos). Duas
 * mudanças de status não são resposta à revisão: a que vem de mover o card de coluna (o status recomeça
 * na coluna nova; arrastar o card que aguardava revisão não é aprovar nem pedir ajuste) e a que vem de
 * ligar o modo autônomo (que libera a revisão pendente sem ninguém ler). Elas saem pelo `column_changed`
 * ou `yolo_changed` gravado junto, na mesma mensagem (mesmo card, mesmo instante). A exceção é a aprovação:
 * desde a #441 ela leva o card à coluna seguinte na mesma mensagem, e continua sendo a resposta da pessoa.
 */
export function reviewEventRows(db: Database, boardId: string, end: number, workflow: string): ReworkEventRow[] {
  const wf = workflow ? ' AND e.workflow = ?' : '';
  const events = all(
    db,
    `SELECT e.kind, e.card_number, e.column_name, e.at, e.from_value, e.to_value, e.source, r.model, r.agent
     FROM card_events e LEFT JOIN ai_runs r ON r.id = e.run_id
     WHERE e.board_id = ? AND e.kind IN ('status_changed', 'column_changed', 'yolo_changed') AND e.at <= ?${wf}`,
    [boardId, end, ...(workflow ? [workflow] : [])],
  );
  const moves = new Set(events.filter((r) => str(r.kind) !== 'status_changed').map((r) => `${num(r.card_number)}:${num(r.at)}`));
  return events
    .filter((r) => str(r.kind) === 'status_changed' && (str(r.to_value) === 'approved' || !moves.has(`${num(r.card_number)}:${num(r.at)}`)))
    .map((r) => ({
      cardNumber: num(r.card_number),
      phase: str(r.column_name),
      at: num(r.at),
      from: str(r.from_value),
      to: str(r.to_value),
      source: str(r.source) === 'ai' ? 'ai' : 'human',
      model: str(r.model),
      agent: str(r.agent),
    }));
}

/** O retrabalho do período, no recorte de workflow do painel (`card_events` guarda o workflow). */
export function panelRework(db: Database, boardId: string, period: ReworkPeriod, workflow: string): MetricsRework {
  const rows = reviewEventRows(db, boardId, period.end, workflow);
  const { phases, models, agents } = reworkOf(rows, period);
  const { total, byPhase } = aiSignalsOf(bashSignalRows(db, boardId, period, workflow), period);
  // funde os sinais nas fases das revisões; uma fase só com sinal de Bash entra também
  const merged = new Map(phases.map((p) => [p.phase, p]));
  for (const [phase, signals] of byPhase) {
    if (signals.bashRuns === 0) continue;
    merged.set(phase, { ...(merged.get(phase) ?? emptyPhase(phase)), ...signals });
  }
  return {
    phases: [...merged.values()],
    models,
    agents,
    unfinished: unfinishedOf(unfinishedRunRows(db, boardId, period, workflow)),
    escapes: escapes(db, boardId, period, workflow),
    aiSignals: total,
  };
}

/**
 * Os comandos de Bash das execuções iniciadas no período, com a história (o card ou o pai dele) e o
 * instante em que ela registrou o pull request. A execução de uma sub-tarefa já apagada cai no próprio
 * card, sem PR: o commit depois do PR não conta, o resto conta. `started_at` segue o período do
 * retrabalho (ms, inclusive nas duas pontas), não o `runsWhere` do consumo.
 */
function bashSignalRows(db: Database, boardId: string, period: ReworkPeriod, workflow: string): BashSignalRow[] {
  const wf = workflow ? ' AND r.workflow = ?' : '';
  return all(
    db,
    `SELECT r.id AS run_id, COALESCE(c.parent_id, r.card_id) AS story_id, r.phase, r.autonomous, r.started_at,
            b.command, b.calls, b.failed, pr.pr_at
     FROM ai_run_bash b JOIN ai_runs r ON r.id = b.run_id
     LEFT JOIN cards c ON c.id = r.card_id
     LEFT JOIN (SELECT card_id, MIN(at) AS pr_at FROM card_events WHERE board_id = ? AND kind = 'pull_request_set' GROUP BY card_id) pr
       ON pr.card_id = COALESCE(c.parent_id, r.card_id)
     WHERE r.board_id = ? AND r.started_at >= ? AND r.started_at <= ?${wf}`,
    [boardId, boardId, period.start, period.end, ...(workflow ? [workflow] : [])],
  ).map((r) => ({
    runId: str(r.run_id),
    storyId: r.story_id == null ? null : str(r.story_id),
    phase: str(r.phase),
    autonomous: num(r.autonomous) === 1,
    startedAt: num(r.started_at),
    command: str(r.command),
    calls: num(r.calls),
    failed: num(r.failed),
    ...(r.pr_at == null ? {} : { prAt: num(r.pr_at) }),
  }));
}

/** As execuções com resultado registrado, iniciadas no período, agrupadas por modelo, agente e resultado. */
function unfinishedRunRows(db: Database, boardId: string, period: ReworkPeriod, workflow: string): UnfinishedRunRow[] {
  const wf = workflow ? ' AND r.workflow = ?' : '';
  return all(
    db,
    `SELECT r.model, r.agent, r.outcome, COUNT(*) AS n FROM ai_runs r
     WHERE r.board_id = ? AND r.outcome IS NOT NULL AND r.started_at >= ? AND r.started_at <= ?${wf}
     GROUP BY r.model, r.agent, r.outcome`,
    [boardId, period.start, period.end, ...(workflow ? [workflow] : [])],
  ).map((r) => ({ model: str(r.model), agent: str(r.agent), outcome: str(r.outcome), n: num(r.n) }));
}
