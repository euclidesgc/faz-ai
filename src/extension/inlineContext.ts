import type { BoardState, Card } from '../shared/model';
import { cardDetail, requiredSkills } from './mcp/format';
import { flowSkillMarkdown } from './flowSkill';

/**
 * O que o board já tem em mãos ao chamar a IA e, até a rodada real de 04/11/2026, mandava-a buscar de novo: o
 * card (`get_card`) e as skills do fluxo (`get_skill faz-ai-fluxo` e as `faz-ai-*` indicadas). Cada busca era um
 * pedido inteiro ao modelo, com todo o contexto da sessão (8 a 18 `get_card` e 10 a 15 `get_skill` por história).
 * O conteúdo vai no próprio pedido, no formato exato que as ferramentas devolveriam, e o pedido diz que não é
 * preciso relê-lo no começo. Fica como dado, depois das instruções, para não se confundir com elas.
 */
export interface InlineContext {
  /** o card como `get_card` o devolveria agora */
  card: unknown;
  /** as skills do fluxo como `get_skill` as devolveria, na ordem em que o card as exige */
  skills: { name: string; markdown: string }[];
}

/** A frase que troca a ordem de ler o card e as skills pela ordem de usar o que já veio. */
export const INLINE_NOTE =
  'O card e as skills do fluxo vêm neste pedido, no fim, como get_card e get_skill os devolveriam agora: não os releia no começo (onde a skill mandar ler o card ou uma skill que está aqui, considere feito). Chame get_card só para blocos que podem ter mudado, com `only`, e get_skill só para uma skill que não está aqui.';

export function inlineContext(s: BoardState, c: Card, attachmentPath: (a: BoardState['attachments'][number]) => string): InlineContext {
  // a faz-ai-fluxo vai sempre (é a que a linha do fluxo mandava ler); as faz-ai-* por assunto, as que o card exige
  const names = [
    'faz-ai-fluxo',
    ...requiredSkills(s, c).flatMap((k) => ('via' in k && k.via === 'get_skill' && k.name !== 'faz-ai-fluxo' ? [k.name] : [])),
  ];
  const skills = [...new Set(names)].flatMap((name) => {
    const markdown = flowSkillMarkdown(name);
    return markdown ? [{ name, markdown }] : [];
  });
  return { card: cardDetail(s, c, attachmentPath), skills };
}

/** As linhas do bloco de dados no fim do pedido: cada parte com o cabeçalho que diz de que ferramenta ela viria. */
export function inlineLines(ref: string, inline: InlineContext): string[] {
  return [
    `===== Card ${ref}, como get_card o devolveria agora =====`,
    JSON.stringify(inline.card, null, 1),
    ...inline.skills.flatMap((k) => [`===== Skill ${k.name}, como get_skill a devolveria =====`, k.markdown]),
    '===== Fim do que já veio neste pedido =====',
  ];
}
