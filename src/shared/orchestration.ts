import type { BoardState, Card } from './model';
import type { AiRunOutcome } from './log';
import type { ActivityKind } from './activity';
import { activityKindOf, codeColumnOf } from './activity';
import { isShortTrackStory } from './advance';
import { subtaskWaves } from './links';
import { columnOf, isLive } from './selectors';
import { isWithHuman } from './story';
import {
  contextBlockedReason,
  contextHashOf,
  contextKey,
  contextReason,
  isContextDoneNote,
  isContextNote,
  isContextReason,
  MAX_CONTEXT_REQUESTS,
  type DeclaredRoute,
} from './subtaskOutcome';
import { briefBlockedReason, briefFailures, briefKey } from './subtaskBrief';
import { parallelLimit, textLimit, type RunnerConfig } from './runner';
import { resolveRunTarget, type RunTargetSource } from './runTarget';
import { suggestModelRule } from './models';
import { MAX_TRANSIENT_RETRIES, type FailureClass } from './failureClass';

export type WorkKind = 'subtask' | 'story' | 'closing' | 'activity';
export type WorkState = 'prepared' | 'started' | 'waiting' | 'reconciling' | 'done' | 'failed' | 'cancelled';
export const LIVE_WORK_STATES: readonly WorkState[] = ['prepared', 'started', 'reconciling'];
export const WORK_TRANSITIONS: Record<WorkState, readonly WorkState[]> = {
  prepared: ['started', 'cancelled', 'reconciling', 'failed'],
  started: ['reconciling'],
  waiting: ['prepared', 'cancelled', 'reconciling'],
  reconciling: ['done', 'waiting', 'failed', 'cancelled'],
  done: [],
  failed: ['prepared', 'cancelled'],
  cancelled: [],
};
export interface WorkUnit {
  kind: WorkKind;
  storyId: string | null;
  cardId: string | null;
  columnId: string;
  key: string;
}
export interface LiveWork {
  /** `reason`: por que a unidade terminou como terminou (na falha, o erro que impediu a execução) */
  byCard: ReadonlyMap<string, { state: WorkState; key: string; kind: WorkKind; reason?: string; updatedAt?: number }>;
}
export type StoryPlan = { kind: 'units'; units: WorkUnit[] } | { kind: 'wait' | 'paused'; reason: string } | { kind: 'idle' };

export function phaseSubtasks(s: BoardState, story: Card): Card[] {
  const phase = columnOf(s, story);
  const field = s.fieldDefs.find((f) => f.name.toLowerCase() === 'fase' && f.kind === 'select');
  return s.cards.filter(
    (c) =>
      c.parentId === story.id &&
      isLive(c) &&
      (!field || s.fieldValues.some((v) => v.cardId === c.id && v.fieldId === field.id && v.value === phase?.name)),
  );
}
/**
 * Trilha direta: história elegível à trilha curta (regra ligada, sem pai, Baixo ou Bug) parada na
 * Implementação e ainda sem sub-tarefas na fase, que a sessão da história implementa sozinha. A
 * Implementação é reconhecida pela estrutura (`codeColumnOf`), nunca pelo nome da coluna, para sobreviver
 * a renomeações; a Revisão e as demais colunas ficam de fora.
 */
export function isDirectTrackStory(s: BoardState, story: Card): boolean {
  return (
    s.board.rules.shortTrack &&
    !story.parentId &&
    isShortTrackStory(s, story) &&
    story.columnId === codeColumnOf(s, story.workflowId)?.id &&
    phaseSubtasks(s, story).length === 0
  );
}
export function orchestrableSubtasks(s: BoardState, story: Card): Card[] {
  if (
    !isLive(story) ||
    story.parentId ||
    columnOf(s, story)?.category !== 'open' ||
    !columnOf(s, story)?.aiActive ||
    activityKindOf(s, story) !== 'branch'
  )
    return [];
  return phaseSubtasks(s, story).filter((c) => columnOf(s, c)?.category === 'open' && !isWithHuman(c));
}
/**
 * O board conduz esta história pelo orquestrador: fase de código com IA, aberta, e já com sub-tarefas na
 * fase (abertas ou fechadas: o fechamento também é do orquestrador). Sem sub-tarefas, a sessão da história
 * roda como sempre (`runner.start`), para criá-las.
 */
export function orchestratesStory(s: BoardState, story: Card): boolean {
  const phase = columnOf(s, story);
  return (
    isLive(story) &&
    !story.parentId &&
    phase?.category === 'open' &&
    !!phase.aiActive &&
    activityKindOf(s, story) === 'branch' &&
    phaseSubtasks(s, story).length > 0
  );
}
/**
 * Parte estável da nota com que o heartbeat abre uma tentativa de desbloqueio na conversa da história. A nota
 * conta como gesto da pessoa (`handedBackAt`): a execução de desbloqueio faz o que a pessoa faria para destravar.
 */
export const UNBLOCK_MARK = 'Tentativa de desbloqueio';
export const isUnblockNote = (m: { source?: string | null; body: string }): boolean => m.source === 'ai' && m.body.startsWith(UNBLOCK_MARK);
/**
 * O último gesto da pessoa numa sub-tarefa, ou 0: mensagem na conversa dela ou na da história (é na história
 * que a pessoa destrava as sub-tarefas) e o status que ela mesma definiu. Entra na chave da sub-tarefa: a que
 * já rodou nesta fase só roda de novo quando a pessoa a devolve à IA. Sem isso, a sub-tarefa respondida voltava
 * a "Pronto" e nunca mais era executada, e a história ficava parada esperando por ela. A tentativa de desbloqueio
 * do heartbeat vale como esse gesto: sem ela, a sub-tarefa que a execução destravou continuava marcada como
 * já tentada, e a história parava de novo no mesmo ponto.
 */
export function handedBackAt(s: BoardState, card: Card): number {
  return gestureAt(s, card, true);
}
/**
 * O último gesto da pessoa (ou do desbloqueio do heartbeat) numa sub-tarefa. A nota de contexto completado só conta
 * em `handedBackAt`, porque é ela que troca a chave e faz a sub-tarefa rodar de novo; o teto de pedidos de contexto
 * a ignora, senão cada rodada zeraria a contagem e o laço nunca pararia.
 */
function gestureAt(s: BoardState, card: Card, withContextDone: boolean): number {
  const where = new Set([card.id, card.parentId]);
  const said = s.comments
    .filter((m) => where.has(m.cardId) && (m.source === 'human' || isUnblockNote(m) || (withContextDone && isContextDoneNote(m))))
    .map((m) => m.createdAt);
  const set = card.statusBy === s.currentUser && card.statusAt !== null ? [card.statusAt] : [];
  return Math.max(0, ...said, ...set);
}
/** A serialização completa evita colisões; IDs e revisões, nunca nomes de fases, definem a rodada. */
export function workKey(kind: WorkKind, s: BoardState, story: Card, card: Card): string {
  // a chave antiga (sem o gesto da pessoa) continua valendo para a sub-tarefa que ela nunca tocou
  const handBack = kind === 'subtask' ? handedBackAt(s, card) : 0;
  const closed =
    kind === 'closing'
      ? phaseSubtasks(s, story)
          .filter((c) => columnOf(s, c)?.category !== 'open')
          .map((c) => [c.id, c.columnId, c.updatedAt])
          .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
      : [];
  return JSON.stringify(
    kind === 'closing'
      ? [kind, story.id, story.columnId, closed]
      : kind === 'subtask'
        ? [kind, card.id, story.columnId, ...(handBack ? [handBack] : [])]
        : [kind, story.id, story.columnId, card.updatedAt],
  );
}
/** Onde a pessoa corrige o modelo, conforme de onde ele veio. */
const TARGET_PLACE: Record<RunTargetSource, (ref: string) => string> = {
  card: (ref) => `abra ${ref} e, no campo Modelo, escolha um modelo da lista`,
  agent: (ref) => `troque o modelo do agente de ${ref} (Configurações → Harness → Agentes) por um da lista`,
  rule: (ref) =>
    `corrija o modelo da regra de sugestão que casa com ${ref} (Configurações → Conectar agentes → Sugestão de modelo para cada card)`,
  default: () => 'escolha o agente e o modelo padrão em Configurações → Conectar agentes',
  chat: (ref) => `abra ${ref} e, no campo Modelo, escolha um modelo da lista`,
  fallback: () => 'corrija o modelo indicado em Configurações → Conectar agentes → Regras de fallback',
};
/**
 * O que a pessoa faz, passo a passo, para a sub-tarefa voltar a rodar. O alvo inválido (modelo fora do catálogo,
 * esforço que o modelo não aceita, agente desligado) é diagnosticado aqui, pelo estado atual: era o motivo mais
 * comum de uma sub-tarefa nem começar, e o texto genérico não dizia o que mudar.
 */
function unblockSteps(s: BoardState, stopped: Card, failure: string): string[] {
  const ref = `#${stopped.number}`;
  const steps: string[] = [];
  const target = resolveRunTarget(s, stopped);
  if (target.blocked) {
    const { block } = target;
    if (block.reason === 'profile-unavailable')
      steps.push(
        `Ligue o agente de "${block.value}" em Configurações → Conectar agentes, ou ${TARGET_PLACE[block.source](ref)} de um agente ligado.`,
      );
    else {
      const problem = block.reason === 'effort-invalid' ? `pede um esforço que o modelo não aceita` : `não existe no catálogo do agente`;
      steps.push(`Para corrigir o modelo, ${TARGET_PLACE[block.source](ref)}: o valor atual, "${block.value}", ${problem}.`);
    }
    // o valor errado veio da sugestão do board: sem corrigir a regra, as próximas sub-tarefas nascem com ele
    if (block.source === 'card' && suggestModelRule(s, stopped)?.model === block.value)
      steps.push(
        `Corrija também a regra de sugestão que propôs "${block.value}" (Configurações → Conectar agentes → Sugestão de modelo para cada card), senão as próximas sub-tarefas recebem o mesmo valor.`,
      );
  } else if (isWithHuman(stopped)) steps.push(`Abra ${ref} e faça o que o motivo acima pede.`);
  else if (failure) steps.push('Corrija o que o motivo acima aponta.');
  else steps.push(`Abra ${ref} e leia a última mensagem da conversa dela: ali está o que a IA fez e onde parou.`);
  steps.push(
    `Responda aqui na conversa da história (ou na de ${ref}) dizendo o que mudou: a resposta devolve a vez à IA, e o board roda ${ref} de novo. Só tirar o bloqueio, sem mudar a causa, faz a história parar outra vez no mesmo ponto.`,
  );
  return steps;
}
/**
 * Por que a história parou numa sub-tarefa, com o que a sub-tarefa pede e os passos para destravar: a história é
 * onde a pessoa destrava. O motivo vai para o bloqueio da história, e responder ali chama a IA, que pode agir nas
 * sub-tarefas. `failure` é o motivo da execução que falhou (o erro que a impediu de começar, por exemplo).
 */
export function stoppedReason(s: BoardState, story: Card, stopped: Card, failure = ''): string {
  const ref = `#${stopped.number}`;
  const cut = (text: string) => (text.length > 400 ? `${text.slice(0, 400)}…` : text);
  const why = isWithHuman(stopped) ? stopped.statusReason.trim() : '';
  const reason = failure.trim();
  const detail = why
    ? `${ref} está com você: ${cut(why)}`
    : reason
      ? `a execução de ${ref} terminou sem concluir a sub-tarefa.\n\nMotivo: ${cut(reason)}`
      : `a execução de ${ref} terminou sem concluir a sub-tarefa (o resultado está na conversa dela).`;
  const steps = unblockSteps(s, stopped, reason).map((step, i) => `${i + 1}. ${step}`);
  return `#${story.number} está parada: ${detail}\n\nPara destravar:\n${steps.join('\n')}`;
}
/**
 * A nota do bloqueio da história sem repetir o que a conversa já diz. A mesma nota, sem gesto da pessoa desde
 * a última vez, só atualiza o motivo do bloqueio (`quiet`). Se a pessoa agiu (respondeu ou tirou o bloqueio) e a
 * história parou de novo pelo mesmo motivo, a nota vem uma vez na versão que explica o que aconteceu e o que
 * costuma faltar; depois disso, também só o motivo. Repetir a mesma mensagem não ajuda quem já tentou.
 */
export function blockNote(s: BoardState, story: Card, reason: string): { note: string; quiet: boolean } {
  const again = repeatedBlockNote(story, reason);
  const sent = s.comments
    .filter((c) => c.cardId === story.id && c.source === 'ai' && (c.body.trim() === reason.trim() || c.body.trim() === again.trim()))
    .sort((a, b) => a.createdAt - b.createdAt)
    .at(-1);
  if (!sent) return { note: reason, quiet: false };
  if (sent.body.trim() === again.trim()) return { note: again, quiet: true };
  const family = new Set([story.id, ...s.cards.filter((c) => c.parentId === story.id).map((c) => c.id)]);
  const acted =
    s.comments.some((c) => family.has(c.cardId) && c.source === 'human' && c.createdAt > sent.createdAt) ||
    (story.statusBy === s.currentUser && (story.statusAt ?? 0) > sent.createdAt);
  return acted ? { note: again, quiet: false } : { note: reason, quiet: true };
}
/**
 * O id da última mensagem da conversa quando ela é do board e diz exatamente `body`: o resultado de uma tentativa
 * que repete o da anterior aponta para a mensagem que já está lá, em vez de empilhar outra igual.
 */
export function sameAsLastNote(s: BoardState, cardId: string, body: string): string | null {
  const last = s.comments
    .filter((c) => c.cardId === cardId)
    .sort((a, b) => a.createdAt - b.createdAt)
    .at(-1);
  return last && last.source === 'ai' && last.author === 'Faz AI' && last.body.trim() === body.trim() ? last.id : null;
}
/** A versão da nota para quem já tentou destravar e viu a história parar no mesmo ponto. */
export function repeatedBlockNote(story: Card, reason: string): string {
  return [
    `#${story.number} continua parada pelo mesmo motivo de antes.`,
    'O que aconteceu: depois da sua última ação, o board tentou seguir e parou no mesmo ponto. A causa ainda está lá; tirar o bloqueio ou responder sem mudar a causa não basta.',
    'O que costuma faltar: fazer a correção no lugar indicado no passo 1 (é ela que o board confere antes de rodar) e só então responder aqui dizendo o que mudou.',
    `Abaixo, o motivo e os passos de novo:\n\n${reason}`,
  ].join('\n\n');
}
/** Sub-tarefas abertas da fase, sem as com a pessoa, as que falharam e as já concluídas (chave em `done`). */
export function pendingSubtasks(s: BoardState, story: Card, live: LiveWork, done: ReadonlySet<string>): Card[] {
  return phaseSubtasks(s, story).filter(
    (c) =>
      columnOf(s, c)?.category === 'open' &&
      !isWithHuman(c) &&
      live.byCard.get(c.id)?.state !== 'failed' &&
      !done.has(workKey('subtask', s, story, c)),
  );
}
export function storyPlan(s: BoardState, story: Card, live: LiveWork, done: ReadonlySet<string>): StoryPlan {
  const phase = columnOf(s, story);
  if (!isLive(story) || story.parentId || phase?.category !== 'open' || !phase.aiActive || activityKindOf(s, story) !== 'branch')
    return { kind: 'idle' };
  const family = [story, ...s.cards.filter((c) => c.parentId === story.id)];
  if (
    family.some((c) => {
      const row = live.byCard.get(c.id);
      return row && LIVE_WORK_STATES.includes(row.state);
    })
  )
    return { kind: 'wait', reason: 'Há uma unidade da história em execução ou reconciliação.' };
  if (isWithHuman(story)) return { kind: 'paused', reason: `#${story.number} está com a pessoa.` };
  const failures = briefFailures(pendingSubtasks(s, story, live, done));
  if (failures.length) {
    const key = briefKey(story, failures, handedBackAt(s, story));
    const failed = live.byCard.get(story.id);
    if (done.has(key) || (failed?.state === 'failed' && failed.key === key))
      return { kind: 'paused', reason: briefBlockedReason(story, failures) };
    return { kind: 'units', units: [{ kind: 'story', storyId: story.id, cardId: story.id, columnId: story.columnId, key }] };
  }
  const children = phaseSubtasks(s, story);
  const open = children.filter((c) => columnOf(s, c)?.category === 'open');
  // a falha vale para a chave em que aconteceu: devolvida pela pessoa (chave nova), a sub-tarefa roda de novo.
  // Sem isso, a que falhou ao iniciar nunca mais rodava, e a história bloqueava de novo a cada resposta
  const failedNow = (c: Card) => {
    const row = live.byCard.get(c.id);
    return row?.state === 'failed' && row.key === workKey('subtask', s, story, c);
  };
  // pedido de contexto: a sessão do condutor completa a descrição antes de qualquer nova tentativa da sub-tarefa
  const asked = open.filter((c) => !isWithHuman(c) && failedNow(c) && isContextReason(live.byCard.get(c.id)?.reason ?? ''));
  if (asked.length) {
    const since = (c: Card) => gestureAt(s, c, false);
    if (
      asked.some(
        (c) => s.comments.filter((m) => m.cardId === c.id && isContextNote(m) && m.createdAt > since(c)).length > MAX_CONTEXT_REQUESTS,
      )
    )
      return { kind: 'paused', reason: contextBlockedReason(story, asked, 'limit') };
    const key = contextKey(
      story,
      asked.map((c) => ({ cardId: c.id, hash: contextHashOf(live.byCard.get(c.id)?.reason ?? '') ?? '' })),
      handedBackAt(s, story),
    );
    const own = live.byCard.get(story.id);
    // descrição igual à do pedido: a sessão já rodou (ou falhou) e não mudou nada; nunca reenviar a mesma
    if (done.has(key) || (own?.state === 'failed' && own.key === key))
      return { kind: 'paused', reason: contextBlockedReason(story, asked, 'unchanged') };
    return { kind: 'units', units: [{ kind: 'story', storyId: story.id, cardId: story.id, columnId: story.columnId, key }] };
  }
  const waves = subtaskWaves(s, story.id);
  const ready = waves.ready.filter((c) => open.some((o) => o.id === c.id));
  const unit = (kind: WorkKind, card: Card): WorkUnit => ({
    kind,
    storyId: story.id,
    cardId: card.id,
    columnId: story.columnId,
    key: workKey(kind, s, story, card),
  });
  const next = ready.find((c) => !done.has(workKey('subtask', s, story, c)) && !failedNow(c));
  if (next) return { kind: 'units', units: [unit('subtask', next)] };
  if (open.length) {
    const stopped = open.find((c) => isWithHuman(c) || failedNow(c) || done.has(workKey('subtask', s, story, c)));
    const failure = stopped && failedNow(stopped) ? (live.byCard.get(stopped.id)?.reason ?? '') : '';
    return stopped
      ? { kind: 'paused', reason: stoppedReason(s, story, stopped, failure) }
      : { kind: 'wait', reason: 'As sub-tarefas aguardam dependências ou liberação da posse.' };
  }
  // o fechamento (ou a sessão) que falhou fica parado até a pessoa (ou o desbloqueio do heartbeat) agir depois da falha:
  // sem isso, o plano devolvia a mesma unidade, a posse recusava a chave que já falhou e o autopiloto chamava a IA sem
  // fim, com "a unidade ou a pasta já está reservada" (a #1098 parou assim quando a janela recarregou no fechamento)
  const failedHere = (key: string) => {
    const row = live.byCard.get(story.id);
    return row?.state === 'failed' && row.key === key && (row.updatedAt ?? Infinity) > handedBackAt(s, story) ? row : null;
  };
  if (children.length) {
    const closing = unit('closing', story);
    if (done.has(closing.key)) return { kind: 'paused', reason: 'O fechamento terminou sem avançar a história.' };
    const failed = failedHere(closing.key);
    if (failed) return { kind: 'paused', reason: failedUnitReason(story, 'O fechamento da fase', failed.reason) };
    return { kind: 'units', units: [closing] };
  }
  const session = unit('story', story);
  if (done.has(session.key)) return { kind: 'paused', reason: 'A sessão terminou sem criar trabalho nem avançar a história.' };
  const failed = failedHere(session.key);
  if (failed) return { kind: 'paused', reason: failedUnitReason(story, 'A sessão da história', failed.reason) };
  return { kind: 'units', units: [session] };
}

/** Por que a história parou numa unidade dela (fechamento ou sessão) que falhou, e como ela volta a rodar. */
function failedUnitReason(story: Card, what: string, reason = ''): string {
  return [
    `#${story.number} está parada: ${what} terminou sem concluir.${reason.trim() ? `\n\nMotivo: ${reason.trim()}` : ''}`,
    'Para destravar: confira na pasta da história o que ficou feito e responda aqui dizendo o que mudou; a resposta devolve a vez à IA, e o board roda de novo.',
  ].join('\n\n');
}

export const PARTIAL_WORK_NOTE =
  'A execução não foi repetida e pode ter feito parte do trabalho (arquivos alterados, mensagens ou cards movidos): confira o que ficou feito antes de chamar de novo.';
export interface WorkEvidence {
  kind: WorkKind;
  processGone: boolean;
  outcome: AiRunOutcome;
  usageLimit: boolean;
  measureError: 'refused' | 'ended' | 'broken' | null;
  cardClosed: boolean;
  cardWithPerson: boolean;
  mutations: number;
  toolCalls: number | null;
  workspaceChanged: boolean | null;
  /** classe da falha da execução (null = terminou bem ou sem classe) */
  failureClass?: FailureClass | null;
  /** retentativas transitórias já feitas nesta unidade */
  transientRetries?: number;
  /** rota do desfecho declarado no bloco final da sub-tarefa (a ferramenta vence o bloco) */
  declared?: DeclaredRoute;
  /** a sub-tarefa, para o pedido de contexto registrar o hash da descrição que a IA viu */
  card?: Pick<Card, 'description'>;
}
export type Reconciled = { kind: 'done' | 'with-person' } | { kind: 'retry-safe' | 'needs-decision' | 'unconfirmed'; reason: string };
export function reconcileOutcome(e: WorkEvidence): Reconciled {
  if (!e.processGone) return { kind: 'unconfirmed', reason: 'O fim da árvore de processos não foi confirmado; a posse permanece retida.' };
  if (e.cardClosed) return { kind: 'done' };
  if (e.cardWithPerson) return { kind: 'with-person' };
  if (e.declared?.kind === 'needs-context')
    return { kind: 'needs-decision', reason: contextReason(e.card ?? { description: null }, e.declared) };
  const noWork = e.mutations === 0 && e.toolCalls === 0 && e.workspaceChanged === false;
  if (e.failureClass === 'transient') {
    // sem efeito: nenhuma mutação, ferramenta ou alteração da pasta; efeito desconhecido conta como efeito
    // toolCalls null com medição íntegra = nenhuma ferramenta observada; medição quebrada/recusada = desconhecido
    const idle = e.mutations === 0 && (e.toolCalls === 0 || e.toolCalls === null) && e.workspaceChanged === false;
    if (idle && (e.transientRetries ?? 0) < MAX_TRANSIENT_RETRIES && e.measureError !== 'broken' && e.measureError !== 'refused')
      return { kind: 'retry-safe', reason: 'Falha transitória sem efeito observado; nova tentativa após a espera.' };
    return {
      kind: 'needs-decision',
      reason: idle
        ? `Falha transitória: esgotou as ${MAX_TRANSIENT_RETRIES} tentativas.`
        : `Falha transitória, mas a IA pode ter agido. ${PARTIAL_WORK_NOTE}`,
    };
  }
  if (noWork && (e.outcome === 'stopped' || e.outcome === 'unsupported' || e.usageLimit) && e.measureError !== 'ended')
    return { kind: 'retry-safe', reason: 'Nenhuma mutação, ferramenta ou alteração da pasta foi observada.' };
  return { kind: 'needs-decision', reason: PARTIAL_WORK_NOTE };
}

export interface PolicyLimits {
  globalProcesses?: number | null;
  perProfile?: Readonly<Record<string, number>>;
}
export interface EffectiveLimits {
  branchProcesses: number;
  /** de onde vem `branchProcesses` e onde se ajusta, para a recusa dizer à pessoa */
  branchReason: string;
  textProcesses: number;
  textReason: string;
  writersPerWorkspace: 1;
  subtasks: { requested: number; effective: 1; reason: string | null };
  globalProcesses: number | null;
  perProfile: Readonly<Record<string, number>>;
}
export function effectiveLimits(runner: RunnerConfig, gitMode: string, policy?: PolicyLimits): EffectiveLimits {
  const cap = policy?.globalProcesses ?? null;
  const profiles = { ...policy?.perProfile };
  for (const value of [...Object.values(profiles), ...(cap === null ? [] : [cap])])
    if (!Number.isSafeInteger(value) || value < 1) throw new Error('Limite explícito de processos inválido.');
  return {
    branchProcesses: parallelLimit(runner, gitMode),
    branchReason: branchLimitReason(runner, gitMode),
    textProcesses: textLimit(runner),
    textReason: PARALLEL_STORIES_SETTING,
    writersPerWorkspace: 1,
    subtasks: {
      requested: runner.parallelSubtasks,
      effective: 1,
      reason: runner.parallelSubtasks > 1 ? 'As sub-tarefas escrevem na mesma pasta da história, então rodam uma por vez.' : null,
    },
    globalProcesses: cap,
    perProfile: profiles,
  };
}
const PARALLEL_STORIES_SETTING = 'o limite vem de "Histórias ao mesmo tempo", em Configurações → Automação';
function branchLimitReason(runner: RunnerConfig, gitMode: string): string {
  if (gitMode !== 'worktree')
    return 'fora do modo "Worktree por história" (Configurações → Git) as histórias dividem a mesma pasta, então só uma mexe no código por vez';
  if (!runner.parallel) return '"Tocar histórias em paralelo" está desligado em Configurações → Automação';
  return PARALLEL_STORIES_SETTING;
}
export interface WorkRuntime {
  activity: ActivityKind;
  profile: string | null;
  workspace: string | null;
  writer: boolean;
  /** o card que ocupa a vaga (#12), para a recusa dizer quem está rodando */
  label?: string;
}
/** "#3, #7" dos cards que ocupam as vagas; vazio quando nenhum tem rótulo. */
function holders(rows: readonly WorkRuntime[]): string {
  const labels = [...new Set(rows.flatMap((r) => (r.label ? [r.label] : [])))];
  return labels.length ? ` (${labels.join(', ')})` : '';
}
const runs = (n: number) => (n === 1 ? '1 execução' : `${n} execuções`);
/** Cada entrada viva reserva uma vaga, inclusive durante a reconciliação. Paths já devem ser reais. */
export function admit(
  unit: WorkRuntime,
  live: readonly WorkRuntime[],
  limits: EffectiveLimits,
): { ok: true } | { ok: false; reason: string } {
  const deny = (reason: string) => ({ ok: false as const, reason });
  const wait = 'Ela começa sozinha quando uma vaga liberar.';
  if (unit.writer && !unit.workspace) return deny('A pasta real do escritor não foi determinada.');
  const sameFolder = unit.writer ? live.filter((r) => r.writer && r.workspace === unit.workspace) : [];
  if (sameFolder.length)
    return deny(
      `A pasta desta execução já tem outra IA escrevendo${holders(sameFolder)}, ou aguardando a conferência do fim. Uma pasta aceita uma execução por vez. ${wait}`,
    );
  if (limits.globalProcesses !== null && live.length >= limits.globalProcesses)
    return deny(
      `Já há ${runs(live.length)} de IA rodando${holders(live)}, e o teto global da política de execução é ${limits.globalProcesses}. ${wait}`,
    );
  const profileCap = unit.profile === null ? undefined : limits.perProfile[unit.profile];
  const sameProfile = live.filter((r) => r.profile === unit.profile);
  if (profileCap !== undefined && sameProfile.length >= profileCap)
    return deny(
      `Já há ${runs(sameProfile.length)} do perfil ${unit.profile} rodando${holders(sameProfile)}, e a política de execução permite ${profileCap} desse perfil ao mesmo tempo. ${wait}`,
    );
  const branch = unit.activity === 'branch';
  const sameActivity = live.filter((r) => r.activity === unit.activity);
  const cap = branch ? limits.branchProcesses : limits.textProcesses;
  if (sameActivity.length >= cap)
    return deny(
      `Já há ${runs(sameActivity.length)} ${branch ? 'mexendo no código' : 'só de texto'} rodando${holders(sameActivity)}, e o limite é ${cap} ao mesmo tempo: ${branch ? limits.branchReason : limits.textReason}. ${wait}`,
    );
  return { ok: true };
}
