import { z } from 'zod';
import { openPredecessors } from '../../../shared/links';
import { cardRef } from '../../../shared/model';
import { activityKindOf } from '../../../shared/activity';
import { columnOf } from '../../../shared/selectors';
import { isDelivered, isYolo, storyOf } from '../../../shared/story';
import type { MessageRouter } from '../../panel/messageRouter';
import { cardSummary, findCard } from '../format';
import { cardArg } from './args';
import { aiOrigin, detail, findProfile, live } from './helpers';
import type { DefineTool, ToolContext } from './registry';

/** Execução pela IA: status de trabalho, workspace (branch/pasta), agente de execução e pull request. */
export function registerWorkTools(tool: DefineTool, ctx: ToolContext): void {
  const setStatus = (
    router: MessageRouter,
    ref: string | number,
    status: 'running' | 'waiting_review' | 'waiting_answer' | 'blocked',
    note: string | undefined,
    next: string,
    pending = false,
  ) => {
    const card = live(findCard(router.snapshot(), ref));
    const after = router.handle({ type: 'card.status.set', cardId: card.id, status, note, pending }, aiOrigin(ctx));
    return {
      card: cardSummary(
        after,
        after.cards.find((c) => c.id === card.id)!,
      ),
      next,
    };
  };

  tool(
    'start_work',
    'Marca que você começou a trabalhar no card (status "running"). Chame antes de executar o trabalho de um card. Recusa enquanto o card depender de outro que ainda não terminou (`waitingFor`).',
    { card: cardArg },
    (a, router) => {
      const s = router.snapshot();
      const card = live(findCard(s, a.card));
      const pending = openPredecessors(s, card.id);
      if (pending.length)
        throw new Error(
          `${cardRef(card)} depende de ${pending.map(cardRef).join(', ')}, que ainda não terminou. Conclua a dependência antes, ou remova o vínculo com unlink_cards se ele não fizer mais sentido.`,
        );
      return setStatus(
        router,
        a.card,
        'running',
        undefined,
        'Ao terminar, peça a revisão com request_review, pergunte com ask_question ou mova o card.',
      );
    },
  );

  tool(
    'request_review',
    'Entrega o trabalho da fase para revisão de uma pessoa (status "waiting_review") e registra o resumo na conversa do card. Depois de chamar, PARE: só uma pessoa aprova. Se ela pedir ajustes, o card volta para "ready" com o pedido na conversa; quando aprovar, o status vira "approved" e você move o card. ' +
      'Use `pending` sempre que algo ficou dependendo da pessoa (decisão, dado, acesso, ponto em aberto que ela precisa avaliar): a pendência vai para a conversa e o card fica com ela mesmo em modo autônomo. Nunca registre uma pendência só num comentário e siga adiante.',
    {
      card: cardArg,
      summary: z.string().min(1).describe('O que foi feito e o que a pessoa deve revisar (markdown)'),
      pending: z
        .string()
        .min(1)
        .optional()
        .describe(
          'O que depende da pessoa (markdown): decisão, dado, acesso ou ponto em aberto. Com isso o card fica com ela, mesmo em modo autônomo.',
        ),
    },
    (a, router) => {
      const yolo = isYolo(router.snapshot(), live(findCard(router.snapshot(), a.card)));
      const pending = a.pending?.trim();
      const note = pending ? `${a.summary.trim()}\n\n**Travado em mim**\n${pending}` : a.summary;
      return setStatus(
        router,
        a.card,
        'waiting_review',
        note,
        yolo && !pending
          ? 'Modo autônomo (YOLO): o card foi aprovado automaticamente. Mova-o para a próxima coluna e siga o trabalho.'
          : pending
            ? 'Pare aqui. A pendência está com a pessoa: não mova o card nem continue o trabalho dele até ela resolver e aprovar ou pedir ajustes.'
            : 'Pare aqui. Não mova o card nem continue o trabalho dele até uma pessoa aprovar ou pedir ajustes.',
        Boolean(pending),
      );
    },
  );

  tool(
    'ask_question',
    'Faz uma pergunta à pessoa na conversa do card e passa a vez para ela (status "waiting_answer"). Use quando faltar uma informação ou decisão. Depois de chamar, pare de trabalhar neste card até a resposta chegar.',
    { card: cardArg, question: z.string().min(1).describe('A pergunta (markdown)') },
    (a, router) => {
      if (isYolo(router.snapshot(), live(findCard(router.snapshot(), a.card))))
        throw new Error(
          'Modo autônomo (YOLO): ninguém vai responder. Decida por conta própria, registre a decisão e o motivo na conversa do card com add_comment e siga o trabalho. Use block_card só se for impossível continuar.',
        );
      return setStatus(
        router,
        a.card,
        'waiting_answer',
        a.question,
        'Pare aqui. Quando a pessoa responder na conversa, o card volta para "ready".',
      );
    },
  );

  tool(
    'block_card',
    'Marca o card como bloqueado por um impedimento que você não consegue resolver (acesso, dependência externa, erro de ambiente) e registra o motivo na conversa.',
    { card: cardArg, reason: z.string().min(1).describe('O que impede o trabalho e o que é preciso para destravar') },
    (a, router) => setStatus(router, a.card, 'blocked', a.reason, 'Pare aqui. Uma pessoa precisa desbloquear o card.'),
  );

  tool(
    'prepare_workspace',
    'Cria (ou reaproveita) a branch da história e a pasta em que o código dela deve ser alterado. Chame antes de mexer em código do projeto; pode ser chamada de uma sub-tarefa. Fora do modo worktree, só chame na fase de código (fase que só produz documento não precisa de branch). O nome da branch e a pasta são definidos pelo board: não crie branches por conta própria.',
    { card: cardArg },
    (a, router) => {
      const s = router.snapshot();
      const card = live(findCard(s, a.card));
      if (s.board.git.mode !== 'worktree' && activityKindOf(s, card, 'phase') === 'text') {
        const story = storyOf(s, card);
        const holder = s.cards.find((c) => s.aiRuns.includes(c.id) && storyOf(s, c)?.id !== story?.id);
        if (holder) {
          const holderStory = storyOf(s, holder) ?? holder;
          throw new Error(
            `A pasta do projeto está em uso pela execução de ${cardRef(holderStory)}. ${cardRef(story ?? card)} está em ${columnOf(s, story ?? card)?.name}, fase que só produz documento e não precisa de branch: não chame prepare_workspace agora. A branch é criada na fase de código, quando a pasta estiver livre.`,
          );
        }
      }
      router.handle({ type: 'card.workspace.prepare', cardId: card.id }, aiOrigin(ctx));
      return detail(router, card.id).workspace;
    },
  );

  tool(
    'set_card_profile',
    'Escolhe o agente do card: o arquivo de agente (instruções, skills, servidores MCP, ferramentas e modelo) que a sessão do board usa para executá-lo; os disponíveis estão em `agents`, em get_board. Sem `profile`, o card volta a usar o agente da coluna (ou o padrão do board).',
    { card: cardArg, profile: z.string().optional().describe('Nome do agente; omita para voltar ao da coluna') },
    (a, router) => {
      const card = live(findCard(router.snapshot(), a.card));
      router.handle(
        { type: 'card.execProfile.set', cardId: card.id, profileId: a.profile ? findProfile(router.snapshot(), a.profile).id : null },
        aiOrigin(ctx),
      );
      return detail(router, card.id);
    },
  );

  tool(
    'set_pull_request',
    'Registra na história o endereço do pull request aberto para a branch dela. Chame logo depois de abrir o PR (ex.: com `gh pr create`); pode ser chamada de uma sub-tarefa. Não faça o merge: ele depende da aprovação da pessoa na homologação.',
    { card: cardArg, url: z.string().url().describe('Endereço do pull request') },
    (a, router) => {
      const card = live(findCard(router.snapshot(), a.card));
      router.handle({ type: 'card.pr.set', cardId: card.id, url: a.url }, aiOrigin(ctx));
      const result = detail(router, card.id).workspace ?? { pullRequest: a.url };
      // na última coluna da IA, o pull request fecha a entrega: o status já passou para a pessoa.
      // Fora dela, nada muda aqui: a fase segue o fluxo normal (request_review, move_card).
      const s = router.snapshot();
      const story = storyOf(
        s,
        s.cards.find((c) => c.id === card.id)!,
      );
      if (story && isDelivered(s, story))
        return {
          ...result,
          next: 'A história foi entregue: o status passou para a pessoa (aguardando revisão). Pare aqui — não mova o card para a conclusão nem faça o merge; isso é dela.',
        };
      return result;
    },
  );
}
