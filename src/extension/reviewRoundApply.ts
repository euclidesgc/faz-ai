import { PHASE_FIELD } from '../shared/boardFields';
import type { BoardState, Card, Column } from '../shared/model';
import { modelFieldOf, parseModelValue } from '../shared/models';
import { runTargetOf } from '../shared/runTarget';
import { columnOf, valueOf } from '../shared/selectors';
import { parseVerdict, type Finding } from '../shared/reviewVerdict';
import { git, tryGit } from './git';
import { implementerModelOf } from './reviewerModelApply';
import type { BoardContext } from './panel/handlers/context';
import { ReviewRoundRepo, type ReviewRound } from './repositories/reviewRoundRepo';

export interface ReviewRoundDeps {
  ctx: BoardContext;
  log: (line: string) => void;
  /** o estado com o harness (os agentes do board): o `ctx.state()` vem do banco e não os traz */
  state: () => BoardState;
}

/** O agente cuja sub-tarefa de revisão entra no regime de rodadas (sem ele, a revisão fica como antes: sem rodada nem portão). */
export const REVIEWER_AGENT = 'revisor-de-codigo';
/** A 3ª rodada sem APROVADO bloqueia a história para a pessoa: a IA não fica em laço corrigindo e revisando. */
export const MAX_ROUNDS = 3;

const REVIEW = 'Revisão';

const repoOf = (d: ReviewRoundDeps): ReviewRoundRepo => new ReviewRoundRepo(d.ctx.dbHandle.db);
const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const short = (sha: string): string => sha.slice(0, 10);

function phaseOf(state: BoardState, card: Card): string | null {
  const field = state.fieldDefs.find((f) => f.name === PHASE_FIELD);
  const v = field ? valueOf(state, card.id, field.id) : null;
  return typeof v === 'string' ? v : null;
}

/** A sub-tarefa de revisão do regime de rodadas: Fase "Revisão" e o agente `revisor-de-codigo`. */
function isIndependentReview(state: BoardState, card: Card): boolean {
  if (!card.parentId || phaseOf(state, card) !== REVIEW) return false;
  const profile = state.board.execProfiles.find((p) => p.id === card.execProfile);
  return profile?.name.trim().toLowerCase() === REVIEWER_AGENT;
}

/** O fechamento de uma sub-tarefa de revisão: a IA a leva a uma coluna de conclusão (a mão da pessoa não passa por aqui). */
export function isClosingReview(state: BoardState, card: Card, target: Column): boolean {
  return isIndependentReview(state, card) && target.category === 'done' && card.columnId !== target.id;
}

/** A saída da história da coluna Revisão para a frente (cancelar não é sair com a revisão aprovada). */
export function isLeavingReview(state: BoardState, card: Card, target: Column): boolean {
  if (card.parentId) return false;
  const current = columnOf(state, card);
  if (!current || current.name !== REVIEW || target.id === current.id || target.workflowId !== current.workflowId) return false;
  return target.position > current.position && target.category !== 'cancelled';
}

/** A pasta onde o git da história vive: a pasta de trabalho dela ou a do projeto. */
function dirOf(d: ReviewRoundDeps, story: Card): string {
  return story.worktreePath || d.ctx.opts.workspaceDir || '';
}

function headOf(dir: string): string {
  if (!dir) throw new Error('a história não tem pasta de trabalho');
  const sha = git(dir, ['rev-parse', 'HEAD']);
  if (!sha) throw new Error('o git não devolveu o commit atual (HEAD)');
  return sha;
}

/** O modelo efetivo da sub-tarefa: o do campo ou o resolvido pelo agente, regra ou padrão. */
function modelOf(state: BoardState, card: Card): string | null {
  const field = modelFieldOf(state, card);
  const own = field ? valueOf(state, card.id, field.id) : null;
  return (typeof own === 'string' && own ? own : runTargetOf(state, card)?.value) || null;
}

/** O que a comparação dos modelos diz da independência; sem um dos dois, nada a declarar. */
function independenceOf(implementer: string | null, reviewer: string | null): string | null {
  const a = implementer ? parseModelValue(implementer)?.id : null;
  const b = reviewer ? parseModelValue(reviewer)?.id : null;
  if (!a || !b) return null;
  if (a === b) return 'unchanged';
  return a.slice(0, a.indexOf(':')) === b.slice(0, b.indexOf(':')) ? 'other_model' : 'other_provider';
}

const findingLine = (f: Finding): string =>
  `- ${f.id} [${f.severity === 'bloqueia' ? 'bloqueia' : 'sugestão'}] ${f.where}: ${f.text}${f.status ? ` [${f.status}]` : ''}`;

/**
 * O bloco `## Rodada N` que a descrição da sub-tarefa de revisão ganha da 2ª rodada em diante: os achados da rodada
 * anterior (cada id volta no veredito com o status) e o diff a revisar. Na 1ª rodada devolve null. Quando o commit
 * da rodada anterior não é ancestral do HEAD (rebase ou force-push), o diff `sha...HEAD` não vale: o bloco manda
 * revisar o diff inteiro e declarar isso.
 */
export function nextRoundBlock(d: ReviewRoundDeps, storyId: string, headSha: string): string | null {
  const last = repoOf(d).lastForStory(storyId);
  if (!last) return null;
  const story = d.state().cards.find((c) => c.id === storyId);
  const dir = story ? dirOf(d, story) : '';
  const ancestor = !!dir && tryGit(dir, ['merge-base', '--is-ancestor', last.headSha, headSha]) !== null;
  const lines = [
    `## Rodada ${last.round + 1}`,
    '',
    `Rodada anterior: ${last.round}, ${last.verdict}, no commit \`${short(last.headSha)}\`. HEAD atual: \`${short(headSha)}\`.`,
    '',
    last.findings.length
      ? `Achados anteriores (repita cada id no comment com [RESOLVIDO] ou [NÃO RESOLVIDO]):\n${last.findings.map(findingLine).join('\n')}`
      : 'A rodada anterior não deixou achados.',
  ];
  if (last.unchecked.length) lines.push('', `Não checado na rodada anterior:\n${last.unchecked.map((u) => `- ${u}`).join('\n')}`);
  lines.push(
    '',
    ancestor
      ? `Revise o que mudou desde então: \`git diff ${last.headSha}...HEAD\`.`
      : `O commit da rodada anterior (\`${short(last.headSha)}\`) não é ancestral do HEAD (rebase ou force-push): revise o diff inteiro da história contra a base e declare no comment que revisou o diff inteiro.`,
  );
  return lines.join('\n');
}

/**
 * Chamado por `create_card` depois dos campos, do modelo do revisor e do agente: na sub-tarefa de revisão da 2ª rodada
 * em diante anexa o bloco `## Rodada N` à descrição. Nunca lança: erro é logado e a sub-tarefa nasce como estava.
 */
export function appendRoundBlock(d: ReviewRoundDeps, newCardId: string): void {
  try {
    const state = d.state();
    const card = state.cards.find((c) => c.id === newCardId);
    if (!card || !isIndependentReview(state, card)) return;
    const story = state.cards.find((c) => c.id === card.parentId);
    if (!story) return;
    const block = nextRoundBlock(d, story.id, headOf(dirOf(d, story)));
    if (block) d.ctx.cards.update(card.id, { description: card.description ? `${card.description.trimEnd()}\n\n${block}` : block });
  } catch (e) {
    d.log(`Bloco da rodada não anexado a ${newCardId}: ${message(e)}`);
  }
}

export type CloseResult = { ok: true } | { ok: false; problem: string };

/**
 * O fechamento da sub-tarefa de revisão: o veredito do `comment` precisa ser válido (falha fechada, com o motivo em
 * português) e a rodada é gravada com o HEAD, os modelos e a independência. A sub-tarefa só sai da revisão aprovada
 * pelo host; `git` falhando recusa o fechamento. Quem chama desfaz a gravação (`discardRound`) se a mudança de coluna
 * for recusada depois.
 */
export function closeReviewSubtask(d: ReviewRoundDeps, subtaskId: string, comment: string | undefined): CloseResult {
  const state = d.state();
  const card = state.cards.find((c) => c.id === subtaskId);
  const story = card && state.cards.find((c) => c.id === card.parentId);
  if (!card || !story || !isIndependentReview(state, card)) return { ok: true };
  const repo = repoOf(d);
  // a rodada que esta própria sub-tarefa já gravou (reabertura e novo fechamento) não conta como anterior
  const last =
    repo
      .listForStory(story.id)
      .filter((r) => r.subtaskId !== card.id)
      .at(-1) ?? null;
  const read = parseVerdict(comment ?? '', last?.findings ?? []);
  if (read.kind === 'invalid')
    return {
      ok: false,
      problem: `Não fechei a revisão #${card.number}: ${read.problem} Passe o veredito no comment do move_card e mova de novo; a sub-tarefa continua em andamento.`,
    };
  let head: string;
  try {
    head = headOf(dirOf(d, story));
  } catch (e) {
    return {
      ok: false,
      problem: `Não fechei a revisão #${card.number}: não consegui ler o commit atual (HEAD) da pasta de trabalho (${message(e)}). Sem ele a rodada não é registrada; confira a pasta e mova de novo.`,
    };
  }
  repo.deleteForSubtask(card.id);
  const implementerModel = implementerModelOf(d, story.id);
  const reviewerModel = modelOf(state, card);
  repo.create({
    storyId: story.id,
    subtaskId: card.id,
    round: (last?.round ?? 0) + 1,
    verdict: read.value.verdict,
    headSha: head,
    implementerModel,
    reviewerModel,
    independence: independenceOf(implementerModel, reviewerModel),
    findings: read.value.findings,
    unchecked: read.value.unchecked,
  });
  return { ok: true };
}

/** Desfaz a rodada gravada por `closeReviewSubtask` (o card não chegou a sair da coluna). */
export function discardRound(d: ReviewRoundDeps, subtaskId: string): void {
  repoOf(d).deleteForSubtask(subtaskId);
}

export type ExitResult = { ok: true } | { ok: false; reason: string; block: boolean };

/**
 * O portão de saída da história da Revisão, só para a IA: a última rodada precisa ser APROVADO. Sem rodada (revisão
 * sem o agente `revisor-de-codigo`) não há portão. A 3ª rodada sem APROVADO pede o bloqueio da história (`block`).
 */
export function storyExitGate(d: ReviewRoundDeps, storyId: string): ExitResult {
  const last: ReviewRound | null = repoOf(d).lastForStory(storyId);
  if (!last || last.verdict === 'APROVADO') return { ok: true };
  if (last.round >= MAX_ROUNDS)
    return {
      ok: false,
      block: true,
      reason: `A revisão chegou à ${last.round}ª rodada sem APROVADO (último veredito: ${last.verdict}). O limite é ${MAX_ROUNDS} rodadas: a história foi bloqueada para a pessoa decidir.`,
    };
  return {
    ok: false,
    block: false,
    reason: `A última rodada da revisão (${last.round}) terminou em ${last.verdict}: a história não sai da Revisão. Corrija os achados e crie uma nova sub-tarefa de revisão (Rodada ${last.round + 1}); só um VEREDITO: APROVADO libera a saída.`,
  };
}
