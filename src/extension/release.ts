import type { BoardState, Card } from '../shared/model';
import { columnOf, isLive } from '../shared/selectors';

// Último passo do ciclo de uma história autônoma: ela é executada, entregue, mergeada (#48) e
// publicada. Aqui se lê o quarto fato — neste projeto a versão sai como tag anotada `vX.Y.Z` mais
// GitHub Release, criadas pelo `scripts/release.mjs`.
//
// O critério de "publicado" é conservador de propósito: uma tag que **contém** o commit de merge e
// que **tem release publicada**. Tag sozinha não basta: se a release falha depois da tag criada, a
// tag existe e a versão não chegou a ninguém. Entre arquivar cedo e arquivar tarde, tarde é o erro
// recuperável — a rodada seguinte se corrige sozinha, enquanto um card arquivado cedo desaparece
// sem ninguém notar.

/** Uma release publicada do repositório: a tag dela e quando saiu. */
export interface Release {
  tag: string;
  /** data de publicação em ms; é por ela que se decide qual versão levou a história, nunca pelo nome */
  publishedAt: number;
}

/**
 * Candidatas a arquivamento: histórias vivas (fora da lixeira e do arquivo), sem pai, numa coluna de
 * conclusão e com o commit de merge guardado (RF2, RF3).
 *
 * Não se exige o modo autônomo: o `mergeCommit` só é gravado pelo `MergeWatcher`, que só atua em
 * história autônoma, então o campo preenchido já é a prova. Sub-tarefa nunca é candidata — ela sai do
 * board no arrasto do arquivamento da história.
 */
export const publishWatchTargets = (s: BoardState): Card[] =>
  s.cards.filter((c) => isLive(c) && !c.parentId && !!c.mergeCommit && columnOf(s, c)?.category === 'done');

/** Mensagem única para toda resposta do `gh` fora do formato esperado, no estilo do `parsePullRequest`. */
const unexpected = (out: string) => new Error(`resposta inesperada do gh: ${out.trim().slice(0, 200) || '(vazia)'}`);

/**
 * Converte a saída de `gh release list --json tagName,isDraft,isPrerelease,publishedAt`: descarta
 * rascunho e release sem data utilizável, mantém pré-lançamento (o código chegou a quem instalou) e
 * ordena da publicação mais antiga para a mais nova (RF4, RF5).
 *
 * Qualquer coisa fora do formato é **falha de consulta**, não "sem releases" (RF13): tratar um erro
 * do `gh` como lista vazia seria silêncio no lugar de um aviso. Array vazio, porém, é resposta
 * válida — o repositório simplesmente não publicou nada.
 */
export function parseReleases(out: string): Release[] {
  let data: unknown;
  try {
    data = JSON.parse(out);
  } catch {
    throw unexpected(out);
  }
  if (!Array.isArray(data)) throw unexpected(out);
  const releases: Release[] = [];
  for (const item of data) {
    if (!item || typeof item !== 'object') throw unexpected(out);
    const r = item as { tagName?: unknown; isDraft?: unknown; publishedAt?: unknown };
    if (typeof r.tagName !== 'string' || !r.tagName) throw unexpected(out);
    if (r.isDraft === true) continue;
    const at = typeof r.publishedAt === 'string' ? Date.parse(r.publishedAt) : NaN;
    if (Number.isNaN(at)) continue;
    releases.push({ tag: r.tagName, publishedAt: at });
  }
  return releases.sort((a, b) => a.publishedAt - b.publishedAt);
}

/**
 * A versão que levou a história: a primeira da lista ordenada por data de publicação cuja tag está
 * entre as que contêm o commit, ou `null` (RF5).
 *
 * `tags` vem do `git tag --contains`, em ordem alfabética, e essa ordem **não serve**: `v0.10.0` vem
 * antes de `v0.9.0` em texto, e a resposta certa é a de data mais antiga.
 */
export const publishedVersion = (releases: Release[], tags: string[]): string | null =>
  releases.find((r) => tags.includes(r.tag))?.tag ?? null;
