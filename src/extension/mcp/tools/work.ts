import { z } from 'zod';
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
  ) => {
    const card = live(findCard(router.snapshot(), ref));
    const after = router.handle({ type: 'card.status.set', cardId: card.id, status, note }, aiOrigin(ctx));
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
    'Marca que você começou a trabalhar no card (status "running"). Chame antes de executar o trabalho de um card.',
    { card: cardArg },
    (a, router) =>
      setStatus(
        router,
        a.card,
        'running',
        undefined,
        'Ao terminar, peça a revisão com request_review, pergunte com ask_question ou mova o card.',
      ),
  );

  tool(
    'request_review',
    'Entrega o trabalho da fase para revisão de uma pessoa (status "waiting_review") e registra o resumo na conversa do card. Depois de chamar, PARE: só uma pessoa aprova. Se ela pedir ajustes, o card volta para "ready" com o pedido na conversa; quando aprovar, o status vira "approved" e você move o card.',
    { card: cardArg, summary: z.string().min(1).describe('O que foi feito e o que a pessoa deve revisar (markdown)') },
    (a, router) => {
      const yolo = isYolo(router.snapshot(), live(findCard(router.snapshot(), a.card)));
      return setStatus(
        router,
        a.card,
        'waiting_review',
        a.summary,
        yolo
          ? 'Modo autônomo (YOLO): o card foi aprovado automaticamente. Mova-o para a próxima coluna e siga o trabalho.'
          : 'Pare aqui. Não mova o card nem continue o trabalho dele até uma pessoa aprovar ou pedir ajustes.',
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
    'Cria (ou reaproveita) a branch da história e a pasta em que o código dela deve ser alterado. Chame antes de mexer em código do projeto; pode ser chamada de uma sub-tarefa. O nome da branch e a pasta são definidos pelo board: não crie branches por conta própria.',
    { card: cardArg },
    (a, router) => {
      const card = live(findCard(router.snapshot(), a.card));
      router.handle({ type: 'card.workspace.prepare', cardId: card.id }, aiOrigin(ctx));
      return detail(router, card.id).workspace;
    },
  );

  tool(
    'set_card_profile',
    'Escolhe o agente de execução de um card (skills, servidores MCP, ferramentas e modelo que a sessão deve usar); os agentes estão em execProfiles, em get_board. Sem `profile`, o card volta a usar o agente da coluna.',
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
