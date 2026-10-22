import type { BoardState, Card, Id } from './model';
import { openPredecessors } from './links';
import { childrenOf, isAiWorking, isLive } from './selectors';
import { isDelivered, isWithHuman, yoloStories } from './story';

// A fila do modo autônomo: em que ordem o autopiloto trata as histórias, e a posição que cada card mostra.

/** De quem a história depende para começar, entre as histórias de uma lista: dependências (`precedes`) e a história de origem de uma derivada. */
function dependsOn(s: BoardState, story: Card, among: ReadonlySet<Id>): Id[] {
  const ids = new Set<Id>();
  for (const p of openPredecessors(s, story.id)) if (among.has(p.id)) ids.add(p.id);
  // a derivada parte da branch da origem: só entra depois que a origem terminar o trabalho dela
  if (story.derivedFrom && among.has(story.derivedFrom)) ids.add(story.derivedFrom);
  // as dependências das sub-tarefas em cards de fora da história também seguram a história
  for (const child of childrenOf(s, story.id).filter(isLive))
    for (const p of openPredecessors(s, child.id)) {
      const owner = p.parentId ?? p.id;
      if (owner !== story.id && among.has(owner)) ids.add(owner);
    }
  ids.delete(story.id);
  return [...ids];
}

/**
 * As histórias em modo autônomo ainda não entregues, na ordem em que o autopiloto as trata: a ordem
 * do board (bug primeiro, depois a coluna mais à direita e a posição na coluna, `byExecutionOrder`),
 * corrigida pelas precedências: uma história que depende de outra da fila (vínculo "depende de", ou
 * história derivada da outra) vem depois dela, por mais acima que esteja no board. Um ciclo de
 * dependências não trava a ordem: a primeira do ciclo pela ordem do board entra, e as demais seguem.
 */
export function autopilotQueue(s: BoardState): Card[] {
  const pending = yoloStories(s).filter((c) => !isDelivered(s, c));
  const among = new Set(pending.map((c) => c.id));
  const deps = new Map(pending.map((c) => [c.id, dependsOn(s, c, among)]));
  const out: Card[] = [];
  const placed = new Set<Id>();
  let rest = pending;
  while (rest.length) {
    const next = rest.find((c) => deps.get(c.id)!.every((id) => placed.has(id))) ?? rest[0]!;
    out.push(next);
    placed.add(next.id);
    rest = rest.filter((c) => c.id !== next.id);
  }
  return out;
}

/**
 * A posição de cada história que ainda espera a vez na fila do modo autônomo (1 = a próxima). Só
 * entram as que estão esperando: a história em execução (nela ou numa sub-tarefa) e a que está com a
 * pessoa (bloqueada, aguardando resposta ou revisão) não têm posição.
 */
const positionsCache = new WeakMap<BoardState, Map<Id, number>>();

export function queuePositions(s: BoardState): Map<Id, number> {
  // cada card do board pergunta a própria posição a cada redesenho: a fila é calculada uma vez por estado
  const cached = positionsCache.get(s);
  if (cached) return cached;
  const out = new Map<Id, number>();
  positionsCache.set(s, out);
  for (const story of autopilotQueue(s)) {
    if (isAiWorking(s, story) || childrenOf(s, story.id).some((c) => isLive(c) && isAiWorking(s, c))) continue;
    if (isWithHuman(story)) continue;
    out.set(story.id, out.size + 1);
  }
  return out;
}
