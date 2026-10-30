import { z } from 'zod';
import { openPredecessors } from '../../../shared/links';
import { cardRef } from '../../../shared/model';
import { activityKindOf } from '../../../shared/activity';
import { cleanBranchName } from '../../../shared/git';
import { handedBackAt } from '../../../shared/orchestration';
import { columnOf } from '../../../shared/selectors';
import { statusInfo } from '../../../shared/status';
import { isAtYoloStop, isDelivered, isYolo, storyOf } from '../../../shared/story';
import type { MessageRouter } from '../../panel/messageRouter';
import { cardSummary, findCard } from '../format';
import { cardArg } from './args';
import { END, aiOrigin, detail, findProfile, live, nextOpenColumnOf } from './helpers';
import type { DefineTool, ToolContext } from './registry';

/** Execução pela IA: status de trabalho, workspace (branch/pasta), agente de execução e pull request. */
export function registerWorkTools(tool: DefineTool, ctx: ToolContext): void {
  const setStatus = (
    router: MessageRouter,
    ref: string | number,
    status: 'running' | 'waiting_review' | 'waiting_answer' | 'blocked',
    note: string | undefined,
    next: string | ((verifying: boolean) => string),
    pending = false,
  ) => {
    const card = live(findCard(router.snapshot(), ref));
    const after = router.handle({ type: 'card.status.set', cardId: card.id, status, note, pending }, aiOrigin(ctx));
    const now = after.cards.find((c) => c.id === card.id)!;
    // o pedido de revisão em coluna com checagens não entrega o card: ele fica "Verificando" e o board decide
    const gate = now.status === 'verifying' ? router.runningGate(card.id) : null;
    return {
      card: cardSummary(after, now),
      ...(gate ? { gate: { id: gate.id, status: 'verifying' } } : {}),
      next: typeof next === 'string' ? next : next(now.status === 'verifying'),
    };
  };

  tool(
    'start_work',
    'Marca que você começou a trabalhar no card (status "running"). Chame antes de executar o trabalho de um card. Numa sub-tarefa que está na primeira coluna do workflow filho, já a leva para a coluna seguinte ("Em andamento" no board padrão): não precisa de move_card. Recusa enquanto o card depender de outro que ainda não terminou (`waitingFor`).',
    { card: cardArg },
    (a, router) => {
      const s = router.snapshot();
      const card = live(findCard(s, a.card));
      const pending = openPredecessors(s, card.id);
      if (pending.length)
        throw new Error(
          `${cardRef(card)} depende de ${pending.map(cardRef).join(', ')}, que ainda não terminou. Conclua a dependência antes, ou remova o vínculo com unlink_cards se ele não fizer mais sentido.`,
        );
      // o movimento vem antes do status: a resposta já mostra a coluna nova e, se ele for recusado, nada fica "running"
      const next = nextOpenColumnOf(s, card);
      if (next) router.handle({ type: 'card.move', cardId: card.id, columnId: next.id, position: END }, aiOrigin(ctx));
      return setStatus(
        router,
        a.card,
        'running',
        undefined,
        'Ao terminar, peça a revisão com request_review, pergunte com ask_questions (com opções) ou ask_question (aberta) ou mova o card.',
      );
    },
  );

  tool(
    'request_review',
    'Entrega o trabalho da fase para revisão de uma pessoa (status "waiting_review") e registra o resumo na conversa do card. Depois de chamar, PARE: só uma pessoa aprova. Se ela pedir ajustes, o card volta para "ready" com o pedido na conversa; quando aprovar, o status vira "approved" e você move o card. ' +
      'Em coluna com checagens (`checks` em get_board) o card não é entregue na hora: fica em "Verificando" (o resultado traz `gate`), o board roda as checagens e você PARA; passando, o pedido de revisão segue; falhando, o card volta para "ready" com o fim da saída na conversa. ' +
      'Use `pending` para o que ficou dependendo da pessoa e não é pergunta com opções (dado, acesso, ponto em aberto que ela precisa avaliar); decisão com alternativas vai por ask_questions: a pendência vai para a conversa e o card fica com ela. No modo autônomo nada segura o card (nem `pending`): decida você, registre e siga. Nunca registre uma pendência só num comentário e siga adiante.',
    {
      card: cardArg,
      summary: z.string().min(1).describe('O que foi feito e o que a pessoa deve revisar (markdown)'),
      pending: z
        .string()
        .min(1)
        .optional()
        .describe(
          'O que depende da pessoa (markdown): decisão, dado, acesso ou ponto em aberto. Com isso o card fica com ela (fora do modo autônomo).',
        ),
    },
    (a, router) => {
      const s = router.snapshot();
      const card = live(findCard(s, a.card));
      const yolo = isYolo(s, card);
      // na coluna até onde a pessoa liberou o modo, o pedido é para ela, e o modo se desliga
      const stop = isAtYoloStop(s, card);
      const pending = a.pending?.trim();
      const note = pending ? `${a.summary.trim()}\n\n**Travado em mim**\n${pending}` : a.summary;
      return setStatus(
        router,
        a.card,
        'waiting_review',
        note,
        (verifying) =>
          verifying
            ? 'Pare aqui. O card está em "Verificando": o board roda as checagens da coluna. Não mova o card nem continue o trabalho dele. Passando, o pedido de revisão segue; falhando, o card volta para "ready" com o fim da saída na conversa.'
            : stop
              ? 'Pare aqui. Esta era a última fase que a pessoa liberou para o modo autônomo: o modo foi desligado e a revisão é dela. Não mova o card nem continue o trabalho dele.'
              : yolo
                ? pending
                  ? 'Modo autônomo (YOLO): a pendência não segura o card, que foi aprovado automaticamente. Decida você mesmo pelo padrão do projeto e pelo caminho menos complexo, registre a decisão e o motivo (na conversa e no documento da fase), mova o card para a próxima coluna e siga.'
                  : 'Modo autônomo (YOLO): o card foi aprovado automaticamente. Mova-o para a próxima coluna e siga o trabalho.'
                : pending
                  ? 'Pare aqui. A pendência está com a pessoa: não mova o card nem continue o trabalho dele até ela resolver e aprovar ou pedir ajustes.'
                  : 'Pare aqui. Não mova o card nem continue o trabalho dele até uma pessoa aprovar ou pedir ajustes.',
        Boolean(pending),
      );
    },
  );

  tool(
    'ask_questions',
    'Faz à pessoa perguntas com opções, respondidas num carrossel no card aberto (status "waiting_answer"). Use para toda pergunta com alternativas, inclusive o que ficaria no `pending` do request_review; pergunta aberta, sem opções, é ask_question. Antes, escreva na descrição do card (update_card) o detalhe de cada pergunta: o motivo da indicada, as consequências de seguir ou não e o detalhe das outras opções. No carrossel vão só a pergunta, as opções curtas e a indicada. As respostas ficam na seção "Perguntas e respostas" da descrição; a pergunta com o mesmo texto de uma já respondida substitui a resposta dela. No modo autônomo o board responde cada uma com a indicada, registra e o card segue com você.',
    {
      card: cardArg,
      questions: z
        .array(
          z.object({
            question: z.string().describe('A pergunta, curta, em uma linha'),
            options: z.array(z.string()).describe('As opções curtas; pelo menos duas'),
            recommended: z.string().describe('A opção indicada: o texto exato de uma das opções'),
          }),
        )
        .describe('As perguntas da rodada; substituem as que ainda estão pendentes no card'),
    },
    (a, router) => {
      const s = router.snapshot();
      const card = live(findCard(s, a.card));
      const yolo = isYolo(s, card);
      const after = router.handle({ type: 'card.questions.set', cardId: card.id, questions: a.questions }, aiOrigin(ctx));
      return {
        card: cardSummary(
          after,
          after.cards.find((c) => c.id === card.id)!,
        ),
        next: yolo
          ? 'Modo autônomo: cada pergunta foi respondida com a indicada e registrada na seção "Perguntas e respostas" da descrição. Leia a descrição de novo (get_card) antes de reescrevê-la e siga o trabalho.'
          : 'Pare aqui. Quando a pessoa enviar as respostas, elas ficam na seção "Perguntas e respostas" da descrição e o card volta para "ready". Pergunta sem resposta: decida pelo padrão do projeto e registre a decisão.',
      };
    },
  );

  tool(
    'ask_question',
    'Faz uma pergunta à pessoa na conversa do card e passa a vez para ela (status "waiting_answer"). Use quando faltar uma informação ou decisão. Pergunta com alternativas: ask_questions. Depois de chamar, pare de trabalhar neste card até a resposta chegar.',
    { card: cardArg, question: z.string().min(1).describe('A pergunta (markdown)') },
    (a, router) => {
      if (isYolo(router.snapshot(), live(findCard(router.snapshot(), a.card))))
        throw new Error(
          'Modo autônomo (YOLO): ninguém vai responder. Decida pelo caminho que segue os padrões do projeto e as regras de arquitetura dele, o menos complexo entre os que os seguem, registre a decisão e o motivo na conversa do card com add_comment e siga o trabalho. Use block_card só se for impossível continuar.',
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
    'release_card',
    'Devolve à fila da IA (status "ready") um card que estava com a pessoa (bloqueado, aguardando resposta ou revisão), quando ela já respondeu o que o travava. Use ao responder uma mensagem da pessoa numa história: a sub-tarefa liberada volta a ser executada pelo board. Só vale depois de uma mensagem da pessoa no card ou na história dele, escrita depois de o card passar para ela; nunca para destravar o próprio trabalho sem a resposta dela.',
    {
      card: cardArg,
      note: z.string().min(1).describe('O que a pessoa decidiu e por que o card pode seguir (markdown), gravado na conversa do card'),
    },
    (a, router) => {
      const s = router.snapshot();
      const card = live(findCard(s, a.card));
      if (!card.status || statusInfo(card.status).owner !== 'human')
        throw new Error(`${cardRef(card)} não está com a pessoa (status "${card.status ?? 'nenhum'}"): não há o que devolver.`);
      if (handedBackAt(s, card) <= (card.statusAt ?? 0))
        throw new Error(
          `A pessoa ainda não respondeu sobre ${cardRef(card)} depois de ele passar para ela: espere a mensagem dela no card ou na história.`,
        );
      router.handle({ type: 'card.status.set', cardId: card.id, status: 'ready' }, aiOrigin(ctx));
      router.handle({ type: 'comment.add', cardId: card.id, body: a.note }, aiOrigin(ctx));
      const after = router.snapshot();
      return {
        card: cardSummary(
          after,
          after.cards.find((c) => c.id === card.id)!,
        ),
        next: card.parentId
          ? 'A sub-tarefa voltou para a fila: o board a executa quando a história seguir. Não a execute você.'
          : 'O card voltou para a fila da IA.',
      };
    },
  );

  tool(
    'prepare_workspace',
    'Cria (ou reaproveita) a branch da história e a pasta em que o código dela deve ser alterado. Chame antes de mexer em código do projeto; pode ser chamada de uma sub-tarefa. Fora do modo worktree, só chame na fase de código (fase que só produz documento não precisa de branch). O nome da branch e a pasta são definidos pelo board: não crie branches por conta própria. A branch parte da base do fluxo (a develop, a principal ou a branch anterior da pilha) e a resposta traz `prBase`, a branch para a qual o pull request deve ser aberto.',
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
    'set_base_branch',
    'Troca a base da história (a branch de onde ela parte e para a qual o pull request vai): `workspace.prBase` do get_card passa a ser `base`. Use quando a pessoa pedir, por exemplo a develop no lugar da principal porque o código a alterar só existe nela. A ferramenta só registra a base: traga a branch da história para ela na pasta de trabalho (sem trabalho feito, recrie a branch a partir de origin/<base>; com trabalho, git merge origin/<base>, sem rebase nem push forçado) e diga na conversa o que fez.',
    {
      card: cardArg,
      base: z.string().min(1).describe('A nova base, ex.: "develop"'),
    },
    (a, router) => {
      const s = router.snapshot();
      const story = storyOf(s, live(findCard(s, a.card))) ?? live(findCard(s, a.card));
      const base = cleanBranchName(a.base, '');
      if (!base) throw new Error(`"${a.base}" não é um nome de branch válido.`);
      if (!story.branch) throw new Error(`${cardRef(story)} ainda não tem branch: chame prepare_workspace, que já parte da base do fluxo.`);
      if (base === story.branch) throw new Error(`A base não pode ser a própria branch de ${cardRef(story)}.`);
      router.handle({ type: 'card.baseBranch.set', cardId: story.id, base }, aiOrigin(ctx));
      return {
        workspace: detail(router, story.id).workspace,
        next: `A base de ${cardRef(story)} agora é ${base}. Traga a branch ${story.branch} para ela na pasta de trabalho antes de seguir.`,
      };
    },
  );

  tool(
    'set_card_profile',
    'Escolhe o agente do card: o arquivo de agente (instruções, skills, servidores MCP, ferramentas e modelo) que a sessão do board usa para executá-lo; os disponíveis estão em `agents`, em get_board. Sem `profile`, o card volta a usar o agente da coluna (ou o padrão do board). Devolve o card resumido; no create_card, `profile` já escolhe o agente.',
    { card: cardArg, profile: z.string().optional().describe('Nome do agente; omita para voltar ao da coluna') },
    (a, router) => {
      const card = live(findCard(router.snapshot(), a.card));
      router.handle(
        { type: 'card.execProfile.set', cardId: card.id, profileId: a.profile ? findProfile(router.snapshot(), a.profile).id : null },
        aiOrigin(ctx),
      );
      const after = router.snapshot();
      return cardSummary(
        after,
        after.cards.find((c) => c.id === card.id)!,
      );
    },
  );

  tool(
    'set_pull_request',
    'Registra na história o endereço do pull request aberto para a branch dela. Abra o PR com `--base` em `workspace.prBase` (ex.: `gh pr create --base <prBase>`) e chame logo depois; pode ser chamada de uma sub-tarefa. Não faça o merge: ele depende da aprovação da pessoa na homologação.',
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
