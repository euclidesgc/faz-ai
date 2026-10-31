import { cardRef, type Card } from '../shared/model';
import { PHASE_OUTCOME_ADVICE } from '../shared/phaseOutcome';
import { briefSkeleton, REQUIRED_BRIEF_SECTIONS, type BriefFailure } from '../shared/subtaskBrief';

/**
 * Pedidos extras à IA quando o board executa as unidades de uma história (Spec da #621, "Pedidos à IA").
 * O texto é produto: muda junto com o comportamento do orquestrador e tem teste.
 */

/** O sentido dos quatro valores do bloco final numa sub-tarefa (o formato é o da #1098). */
const OUTCOME_MEANING =
  'Na sub-tarefa: `DONE` = terminou e verificou; `DONE_WITH_CONCERNS` = terminou e há ressalva que a Revisão deve olhar (diga em `pending`); `NEEDS_CONTEXT` = a descrição não basta para fazer sem adivinhar (diga em `pending` o que falta; não conclua); `BLOCKED` = impedimento que você não resolve (`failure_reason`). O bloco não substitui `move_card`.';

/** As ressalvas declaradas pelas sub-tarefas, para o fechamento e a sessão da história conferirem contra o diff. */
export const concernsAdvice = (concerns: readonly { ref: string; text: string }[]): string =>
  concerns.length
    ? `As sub-tarefas declararam ressalvas (DONE_WITH_CONCERNS); confira cada uma contra o diff e leve as que seguem de pé à Revisão:\n${concerns.map((c) => `- ${c.ref}: ${c.text}`).join('\n')}`
    : '';

/** A execução de uma sub-tarefa: só ela, no ciclo de sempre; as outras o board executa. */
export const subtaskAdvice = (story: Card, subtask: Card): string =>
  `Você executa só a sub-tarefa ${cardRef(subtask)} da história ${cardRef(story)}. O ciclo: start_work, mover para "Em andamento", fazer o trabalho na pasta da história (\`workspace\` no get_card), verificar só a sua parte (o teste do que você mudou e o typecheck; nada de suíte completa nem build), mover para a coluna de conclusão e registrar o que fez na conversa da sub-tarefa. Não faça commit, não troque de branch e não execute outras sub-tarefas: quem executa as outras é o board. ${PHASE_OUTCOME_ADVICE} ${OUTCOME_MEANING}`;

const BRIEF_ADVICE = `As sub-tarefas que criar, inclusive as de correção e as de revisão, levam na descrição as seções ${REQUIRED_BRIEF_SECTIONS.map((name) => `"${name}"`).join(', ')}.`;

/** O fechamento da fase depois que todas as sub-tarefas terminaram. */
export const closingAdvice = (story: Card, concerns: readonly { ref: string; text: string }[] = []): string =>
  `As sub-tarefas desta fase de ${cardRef(story)} terminaram; os resultados estão na conversa da história. Verifique o conjunto como o projeto define, faça o commit e mova a história. Se a verificação falhar, corrija ou crie uma sub-tarefa de correção com Fase = esta coluna e pare: o board a executa e chama você de novo. ${BRIEF_ADVICE}${concerns.length ? `\n\n${concernsAdvice(concerns)}` : ''}`;

/** A sessão da história numa fase de código: cria e descreve as sub-tarefas e para. */
export const STORY_SESSION_ADVICE =
  'Nesta fase de código o board executa as sub-tarefas, cada uma numa execução própria. Não execute sub-tarefas, nem por subagente (ferramenta Agent): crie-as, descreva-as e pare. A Revisão segue o mesmo caminho: crie a sub-tarefa de revisão com o agente `revisor-de-codigo` e pare. ' +
  BRIEF_ADVICE;

/**
 * A sessão da história na trilha direta (Implementação de uma história da trilha curta, sem sub-tarefas na fase):
 * ela mesma implementa; só passa às sub-tarefas se a mudança crescer.
 */
export const DIRECT_TRACK_ADVICE =
  'Esta história está na trilha direta: não há sub-tarefas e você mesmo a implementa. Chame prepare_workspace, altere o código só na pasta da história, verifique como o projeto define, faça o commit na branch e mova a história para a próxima coluna. Se a mudança passar de uns 3 arquivos, não a implemente: crie as sub-tarefas com Fase = esta coluna, registre o motivo na conversa e pare; o board as executa. Não execute sub-tarefas, nem por subagente (ferramenta Agent). ' +
  BRIEF_ADVICE;

/** A sessão de correção: a história reescreve as descrições reprovadas na conferência e para. */
export const briefAdvice = (story: Card, failures: readonly BriefFailure[]): string =>
  [
    `O board não executou as sub-tarefas abaixo da história ${cardRef(story)} porque a descrição delas não tem as seções obrigatórias (${REQUIRED_BRIEF_SECTIONS.map((name) => `"${name}"`).join(', ')}):`,
    ...failures.map((f) => `- ${cardRef(f.card)}: falta ${f.missing.join(', ')}.`),
    `Cada descrição leva estas seções, como títulos markdown:\n\n${briefSkeleton()}`,
    'Reescreva a descrição de cada sub-tarefa listada com update_card, mantendo o que ela já diz e completando as seções que faltam. Não execute sub-tarefas, nem por subagente (ferramenta Agent), não crie sub-tarefas novas e pare ao terminar.',
    'Ao fim da sessão o board confere de novo; se a descrição ainda falhar, a história vai para a pessoa.',
  ].join('\n\n');

/**
 * A sessão de contexto: a sub-tarefa disse que a descrição não basta; a história a completa e para.
 * `reason` é o motivo gravado no resultado (`contextReason`): a marca, o hash, o resumo e "Preciso de: ...".
 */
export const contextAdvice = (story: Card, requests: readonly { card: Card; reason: string }[]): string =>
  [
    ...requests.map(({ card, reason }) => {
      const m = /^\*\*Pedido de contexto\*\* \([0-9a-f]+\): ([\s\S]*?)\n\nPreciso de: ([\s\S]*)$/.exec(reason);
      return `A sub-tarefa ${cardRef(card)} pediu contexto: ${m?.[1]?.trim() ?? reason}. Falta: ${m?.[2]?.trim() ?? 'o que a descrição não diz'}.`;
    }),
    `Complete a descrição de cada uma com update_card (mantenha as seções), pelo que sabe da história ${cardRef(story)} e do código; não execute sub-tarefas e pare. O board roda a sub-tarefa de novo com a descrição nova; descrição igual pausa a história.`,
  ].join('\n\n');
