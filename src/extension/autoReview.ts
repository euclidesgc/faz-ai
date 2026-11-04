import { cardRef, type BoardState, type Card, type Column } from '../shared/model';
import type { ExecProfile } from '../shared/execution';
import type { WebviewToHost } from '../shared/messages';
import { PHASE_FIELD, REVIEW_PHASE } from '../shared/boardFields';
import { phaseSubtasks } from '../shared/orchestration';
import { columnOf, columnsOf, isLive } from '../shared/selectors';
import { isWithHuman } from '../shared/story';
import { norm } from '../shared/filters';
import { prBaseOf } from '../shared/gitflow';
import { BRIEF_SECTIONS } from '../shared/subtaskBrief';
import { REVIEWER_AGENT } from './reviewRoundApply';

/**
 * A sub-tarefa de revisão independente nasce do board, não de uma execução da IA. Na rodada real de 04/11/2026 a
 * história gastava uma execução inteira (7 pedidos ao modelo) só para entrar na Revisão e criar a sub-tarefa do
 * `revisor-de-codigo` que a skill mandava criar. O que a skill descrevia por extenso o board faz ao ver a história
 * entrar na coluna: a primeira rodada da revisão começa sem a IA; as rodadas seguintes (correção e nova revisão)
 * continuam com ela, porque dependem de ler os achados.
 */

/** O começo da nota na conversa da história; o teste e a tela a reconhecem por ele. */
export const AUTO_REVIEW_MARK = 'Sub-tarefa de revisão criada pelo board';
const AUTHOR = 'Faz AI';
interface Origin {
  author: string;
  source: 'ai';
}
const origin: Origin = { author: AUTHOR, source: 'ai' };

export interface AutoReview {
  column: Column;
  reviewer: ExecProfile;
  /** a branch contra a qual o diff é revisado ('' quando o board não a conhece) */
  base: string;
}

/**
 * A história que acabou de entrar na Revisão e para a qual o board cria a revisão: viva, sem pai, não com a pessoa,
 * na coluna da IA chamada Revisão, com branch (há diff), ainda sem sub-tarefa na fase, e com o `revisor-de-codigo`
 * entre os agentes do board. Sem o agente, a Revisão fica como antes: a IA revisa ela mesma.
 */
export function autoReviewOf(s: BoardState, story: Card): AutoReview | null {
  if (!isLive(story) || story.parentId || isWithHuman(story)) return null;
  const column = columnOf(s, story);
  if (!column || column.category !== 'open' || !column.aiActive || norm(column.name) !== norm(REVIEW_PHASE)) return null;
  if (!story.branch || phaseSubtasks(s, story).length) return null;
  const reviewer = s.board.execProfiles.find((p) => p.name.trim().toLowerCase() === REVIEWER_AGENT);
  if (!reviewer) return null;
  return { column, reviewer, base: prBaseOf(s, story)?.baseBranch || story.baseBranch };
}

export const reviewTitle = (story: Card, base: string): string => `Revisar diff da história ${cardRef(story)} contra ${base || 'a base'}`;

/** A descrição com as seções que o board confere antes de executar (`subtaskBrief`), no mesmo roteiro da fase. */
export function reviewBrief(story: Card, base: string): string {
  const diff = base ? `\`git diff ${base}...HEAD\`` : 'o diff contra a base da história';
  return [
    `### ${BRIEF_SECTIONS.goal}`,
    `Revisar com um olhar independente o diff da história ${cardRef(story)} "${story.title}" (branch \`${story.branch}\`, ${diff}) na pasta de trabalho dela (\`workspace\` no card): correção em relação a cada item da história, segurança, compatibilidade do banco e aderência às convenções do projeto. Procure o código que só passa no teste: teste novo que já passa no commit base, teste existente alterado junto com o código que ele cobre, try/catch que engole erro, cast forçado e acoplamento novo entre módulos. As ressalvas declaradas pelas sub-tarefas (DONE_WITH_CONCERNS) estão na conversa da história: confira cada uma contra o diff.`,
    '',
    `### ${BRIEF_SECTIONS.done}`,
    'As checagens do projeto (typecheck, lint, testes e build, como ele as define) rodaram na pasta da história e o relatório está no `comment` do move_card que fecha esta sub-tarefa: achados, o que ficou "Não checado" e, na última linha, `VEREDITO: APROVADO|REPROVADO|NÃO COMPROVADO`.',
    '',
    `### ${BRIEF_SECTIONS.may}`,
    'Nada: a revisão só lê e roda as checagens. As correções são de outra sub-tarefa.',
    '',
    `### ${BRIEF_SECTIONS.mayNot}`,
    'Qualquer arquivo do projeto e a branch da história (sem commit, sem checkout).',
  ].join('\n');
}

/** O que o módulo usa do `MessageRouter`. */
export interface AutoReviewRouter {
  snapshot(): BoardState;
  createCard(input: { typeId: string; columnId: string; parentId: string | null; title: string }, origin: Origin): string;
  handle(msg: WebviewToHost, origin: Origin): unknown;
  applyReviewerModelToNewCard(cardId: string): void;
  onDidChange(fn: () => void): () => void;
}

/** Cria a sub-tarefa (Fase = Revisão, agente revisor, modelo do revisor pelo board) e registra na conversa da história. */
export function createAutoReview(router: AutoReviewRouter, story: Card, found: AutoReview): string {
  const s = router.snapshot();
  const child = s.workflows.find((w) => w.kind === 'child');
  const type = child && s.cardTypes.find((t) => t.defaultWorkflowId === child.id);
  const column = child && columnsOf(s, child.id).find((c) => c.category === 'open');
  if (!child || !type || !column) throw new Error('O workflow de sub-tarefas não tem tipo ou coluna aberta.');
  const title = reviewTitle(story, found.base);
  const id = router.createCard({ typeId: type.id, columnId: column.id, parentId: story.id, title }, origin);
  router.handle({ type: 'card.update', cardId: id, patch: { description: reviewBrief(story, found.base) } }, origin);
  const phase = s.fieldDefs.find((f) => f.name === PHASE_FIELD);
  if (phase) router.handle({ type: 'field.setValue', cardId: id, fieldId: phase.id, value: found.column.name }, origin);
  router.handle({ type: 'card.execProfile.set', cardId: id, profileId: found.reviewer.id }, origin);
  // o modelo do revisor é do board (outro, nunca o barato), como no create_card da IA
  router.applyReviewerModelToNewCard(id);
  const created = router.snapshot().cards.find((c) => c.id === id);
  router.handle(
    {
      type: 'comment.add',
      cardId: story.id,
      body: `${AUTO_REVIEW_MARK} ao entrar na ${found.column.name}: ${created ? cardRef(created) : title} "${title}", com o agente ${found.reviewer.name}. O board a executa; com o VEREDITO dela a história segue.`,
    },
    origin,
  );
  return id;
}

/**
 * Observa as histórias que mudam de coluna e cria a revisão da que entrou na Revisão. Só a janela dona do board age
 * (`canRun`). A história que já estava na Revisão ao abrir o board não ganha sub-tarefa aqui: a IA dela pode estar no
 * meio do trabalho. Devolve a função que desliga a observação.
 */
export function watchAutoReview(router: AutoReviewRouter, canRun: () => boolean, log: (line: string) => void): () => void {
  const columns = new Map(
    router
      .snapshot()
      .cards.filter((c) => !c.parentId)
      .map((c) => [c.id, c.columnId]),
  );
  let busy = false;
  return router.onDidChange(() => {
    const s = router.snapshot();
    const moved: Card[] = [];
    for (const story of s.cards.filter((c) => !c.parentId)) {
      const before = columns.get(story.id);
      columns.set(story.id, story.columnId);
      if (before !== undefined && before !== story.columnId) moved.push(story);
    }
    for (const id of [...columns.keys()]) if (!s.cards.some((c) => c.id === id)) columns.delete(id);
    // a criação muda o board e volta por aqui: a coluna já anotada acima não conta como entrada de novo
    if (busy || !moved.length || !canRun()) return;
    busy = true;
    try {
      for (const story of moved) {
        const found = autoReviewOf(s, story);
        if (!found) continue;
        try {
          const id = createAutoReview(router, story, found);
          const created = router.snapshot().cards.find((c) => c.id === id);
          log(
            `${cardRef(story)}: sub-tarefa de revisão ${created ? cardRef(created) : id} criada pelo board ao entrar na ${found.column.name}.`,
          );
        } catch (e) {
          log(`${cardRef(story)}: a sub-tarefa de revisão não foi criada pelo board: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    } finally {
      busy = false;
    }
  });
}
