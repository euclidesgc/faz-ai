import { z } from 'zod';

/** Os desfechos que a IA informa no bloco final da resposta de uma fase. */
export const PHASE_OUTCOMES = ['DONE', 'DONE_WITH_CONCERNS', 'NEEDS_CONTEXT', 'BLOCKED'] as const;
export type PhaseOutcomeKind = (typeof PHASE_OUTCOMES)[number];

export const MAX_SUMMARY = 4000;
/** Quantas vezes o board pede o bloco de novo, na mesma sessão, antes de bloquear. */
export const MAX_OUTCOME_REPAIRS = 2;

export interface PhaseOutcome {
  outcome: PhaseOutcomeKind;
  summary: string;
  failure_reason?: string | null;
  pending?: string | null;
}

export type OutcomeRead = { kind: 'valid'; value: PhaseOutcome } | { kind: 'missing' } | { kind: 'invalid'; problem: string };

const filled = (v: string | null | undefined): boolean => typeof v === 'string' && v.trim() !== '';

const outcomeSchema = z
  .object({
    outcome: z.enum(PHASE_OUTCOMES, { error: 'o campo "outcome" deve ser DONE, DONE_WITH_CONCERNS, NEEDS_CONTEXT ou BLOCKED' }),
    summary: z
      .string({ error: 'o campo "summary" é obrigatório e deve ser texto' })
      .trim()
      .min(1, 'o campo "summary" não pode ser vazio')
      .transform((s) => s.slice(0, MAX_SUMMARY)),
    failure_reason: z.string().nullish(),
    pending: z.string().nullish(),
  })
  .superRefine((v, ctx) => {
    if (v.outcome === 'BLOCKED' && !filled(v.failure_reason)) {
      ctx.addIssue({ code: 'custom', message: 'BLOCKED exige "failure_reason"', path: ['failure_reason'] });
    }
    if ((v.outcome === 'NEEDS_CONTEXT' || v.outcome === 'DONE_WITH_CONCERNS') && !filled(v.pending)) {
      ctx.addIssue({ code: 'custom', message: `${v.outcome} exige "pending"`, path: ['pending'] });
    }
  });

/** Posição do `{` que casa com o `}` em `end`, respeitando strings e escapes; -1 se não houver. */
function matchingOpen(text: string, end: number): number {
  // Varre do começo: só assim se sabe o que está dentro de uma string.
  const stack: number[] = [];
  let inString = false;
  let escaped = false;
  for (let i = 0; i <= end; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') stack.push(i);
    else if (ch === '}') {
      const open = stack.pop();
      if (i === end) return open ?? -1;
    }
  }
  return -1;
}

/** O último objeto JSON que fecha a resposta (aceita a cerca ```json); texto depois dele = `missing`. */
export function readPhaseOutcome(answer: string): OutcomeRead {
  let text = answer.trimEnd();
  const fence = /\n?```[ \t]*$/.exec(text);
  if (fence) text = text.slice(0, fence.index).trimEnd();
  if (!text.endsWith('}')) return { kind: 'missing' };
  const open = matchingOpen(text, text.length - 1);
  if (open < 0) return { kind: 'missing' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(open));
  } catch (error) {
    return { kind: 'invalid', problem: `o JSON não pôde ser lido (${error instanceof Error ? error.message : String(error)})` };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { kind: 'invalid', problem: 'o bloco final deve ser um objeto JSON' };
  }
  const result = outcomeSchema.safeParse(parsed);
  if (!result.success) {
    return { kind: 'invalid', problem: result.error.issues.map((i) => i.message).join('; ') };
  }
  const { outcome, summary, failure_reason, pending } = result.data;
  return { kind: 'valid', value: { outcome, summary, failure_reason, pending } };
}

export interface OutcomeEffect {
  comment: string;
  status: 'ready' | 'waiting_review' | 'waiting_answer' | 'blocked';
  reason?: string;
}

const COMMENT_HEAD = 'Desfecho informado no bloco final da resposta (a IA não chamou a ferramenta do board):';

/** O que o board faz com o bloco, igual ao que a resposta na conversa já faz hoje. */
export function outcomeEffect(v: PhaseOutcome, ctx: { yolo: boolean; columnRequiresApproval: boolean }): OutcomeEffect {
  const summary = v.summary.slice(0, MAX_SUMMARY);
  switch (v.outcome) {
    case 'DONE':
      return {
        comment: `${COMMENT_HEAD}\n\n${summary}`,
        status: ctx.yolo ? 'ready' : ctx.columnRequiresApproval ? 'waiting_review' : 'waiting_answer',
      };
    case 'DONE_WITH_CONCERNS':
      return {
        comment: `${COMMENT_HEAD}\n\n${summary}\n\nRessalvas: ${v.pending ?? ''}`,
        status: ctx.yolo ? 'ready' : 'waiting_review',
      };
    case 'NEEDS_CONTEXT':
      return {
        comment: `${COMMENT_HEAD}\n\n${summary}\n\nPreciso de: ${v.pending ?? ''}`,
        status: ctx.yolo ? 'ready' : 'waiting_answer',
      };
    case 'BLOCKED':
      return {
        comment: `${COMMENT_HEAD}\n\n${summary}`,
        status: 'blocked',
        reason: `${v.failure_reason ?? ''}\n\n${summary}`.trim(),
      };
  }
}

const FORMAT = '{"outcome":"DONE|DONE_WITH_CONCERNS|NEEDS_CONTEXT|BLOCKED","summary":"...","failure_reason":null,"pending":null}';

/** O pedido de reparo, na mesma sessão, quando o bloco final falta ou é inválido. */
export function repairRequest(read: Exclude<OutcomeRead, { kind: 'valid' }>): string {
  const problem = read.kind === 'missing' ? 'não há um objeto JSON fechando a resposta' : read.problem;
  return `A sua última resposta não terminou com o bloco final válido (${problem}). Responda apenas com o bloco JSON (${FORMAT}), sem rodar ferramentas nem repetir o trabalho. "failure_reason" é obrigatório em BLOCKED e "pending" em NEEDS_CONTEXT e DONE_WITH_CONCERNS.`;
}

/** O pedido que vai no prompt ao produzir a resposta. */
export const PHASE_OUTCOME_ADVICE = `Termine a resposta com um único bloco JSON, sem texto depois dele: ${FORMAT}. Ele não substitui as ferramentas do board: chame-as como de costume; o bloco é conferido no fim. "failure_reason" é obrigatório em BLOCKED e "pending" em NEEDS_CONTEXT e DONE_WITH_CONCERNS.`;
