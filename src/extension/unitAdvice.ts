import { cardRef, type Card } from '../shared/model';
import { REQUIRED_BRIEF_SECTIONS } from '../shared/subtaskBrief';

/**
 * Pedidos extras à IA quando o board executa as unidades de uma história (Spec da #621, "Pedidos à IA").
 * O texto é produto: muda junto com o comportamento do orquestrador e tem teste.
 */

/** A execução de uma sub-tarefa: só ela, no ciclo de sempre; as outras o board executa. */
export const subtaskAdvice = (story: Card, subtask: Card): string =>
  `Você executa só a sub-tarefa ${cardRef(subtask)} da história ${cardRef(story)}. O ciclo: start_work, mover para "Em andamento", fazer o trabalho na pasta da história (\`workspace\` no get_card), verificar só a sua parte (o teste do que você mudou e o typecheck; nada de suíte completa nem build), mover para a coluna de conclusão e registrar o que fez na conversa da sub-tarefa. Não faça commit, não troque de branch e não execute outras sub-tarefas: quem executa as outras é o board.`;

const BRIEF_ADVICE = `As sub-tarefas que criar, inclusive as de correção e as de revisão, levam na descrição as seções ${REQUIRED_BRIEF_SECTIONS.map((name) => `"${name}"`).join(', ')}.`;

/** O fechamento da fase depois que todas as sub-tarefas terminaram. */
export const closingAdvice = (story: Card): string =>
  `As sub-tarefas desta fase de ${cardRef(story)} terminaram; os resultados estão na conversa da história. Verifique o conjunto como o projeto define, faça o commit e mova a história. Se a verificação falhar, corrija ou crie uma sub-tarefa de correção com Fase = esta coluna e pare: o board a executa e chama você de novo. ${BRIEF_ADVICE}`;

/** A sessão da história numa fase de código: cria e descreve as sub-tarefas e para. */
export const STORY_SESSION_ADVICE =
  'Nesta fase de código o board executa as sub-tarefas, cada uma numa execução própria. Não execute sub-tarefas, nem por subagente (ferramenta Agent): crie-as, descreva-as e pare. A Revisão segue o mesmo caminho: crie a sub-tarefa de revisão com o agente `revisor-de-codigo` e pare. ' +
  BRIEF_ADVICE;
