import { cardRef, type BoardState, type Card } from '../shared/model';
import { columnOf, isLive } from '../shared/selectors';
import type { MessageRouter } from './panel/messageRouter';

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

export interface ReleaseDeps {
  /** roda o `gh` na pasta do projeto; rejeita com a mensagem de erro do comando */
  gh(args: string[], cwd: string): Promise<string>;
  /** roda o `git` na pasta do projeto, com o mesmo contrato do `gh` */
  git(args: string[], cwd: string): Promise<string>;
  log(message: string): void;
  cwd: string;
}

const AUTHOR = 'Faz AI';

/**
 * Parte estável da frase do comentário de versão. O "já comentei" é verificado na própria conversa,
 * não em memória: é o que garante um comentário só quando o arquivamento falhou na rodada anterior e
 * o comentário já está lá. Mudar a frase faz o comentário poder repetir uma vez nos cards que ficaram
 * no meio — mesma ressalva do `CLOSED_MARK` da detecção de merges.
 */
const VERSION_MARK = 'saiu na versão';

/**
 * Último passo do ciclo, na mesma rodada da detecção de merges (é o `afterRound` dela quem chama o
 * `sweep`): para cada história concluída com commit de merge guardado, pergunta se esse commit já está
 * numa tag com release publicada. Está: registra na conversa qual versão levou a história e arquiva o
 * card, nessa ordem.
 *
 * Sem timer próprio e sem `canRun` próprio — o `MergeWatcher` já guarda a rodada inteira. Nenhum
 * caminho lança para fora de `sweep()`, nenhum bloqueia card, e as falhas vão para o log sem repetir
 * enquanto a causa for a mesma. Não depende da API do VSCode.
 */
export class ReleaseWatcher {
  /** rodada em andamento: cobre um `runNow` concorrente, já que o `sweep` é assíncrono */
  private busy = false;
  /** última falha registrada no log; a memória atravessa rodadas, senão a mesma causa voltaria a cada intervalo */
  private lastFailure: string | null = null;

  constructor(
    private router: MessageRouter,
    private deps: ReleaseDeps,
  ) {}

  /** Uma rodada de arquivamento. Nunca rejeita. */
  async sweep(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.round();
    } catch (e) {
      // rede de segurança: nada aqui pode escapar para a rodada de merges que nos chamou
      this.noteFailure(e instanceof Error ? e.message : String(e));
    } finally {
      this.busy = false;
    }
  }

  private async round(): Promise<void> {
    const targets = publishWatchTargets(this.router.snapshot());
    if (!targets.length) return; // sem candidato, nenhuma chamada de rede nem de git

    // melhor esforço: `git tag --contains` só vê as tags deste clone, e numa máquina que não publicou
    // elas não existiriam. `--force` para não falhar com tag reescrita. Falhar aqui não impede nada:
    // a avaliação segue pelas tags que já estão presentes.
    try {
      await this.deps.git(['fetch', '--tags', '--force'], this.deps.cwd);
    } catch (e) {
      this.noteFailure(e instanceof Error ? e.message : String(e));
    }

    let releases: Release[];
    try {
      // limite assumido: uma publicação mais antiga que as últimas 100 releases não arquiva. O efeito
      // é não arquivar — o lado seguro —, e não se loga o truncamento para não encher o log com uma
      // linha que ninguém pode resolver.
      const out = await this.deps.gh(
        ['release', 'list', '--limit', '100', '--json', 'tagName,isDraft,isPrerelease,publishedAt'],
        this.deps.cwd,
      );
      releases = parseReleases(out);
    } catch (e) {
      // falha de consulta encerra a rodada de arquivamento; a de merges já aconteceu, antes desta
      return this.noteFailure(e instanceof Error ? e.message : String(e));
    }
    if (!releases.length) return; // nenhuma release publicada: silêncio

    const links = new Map<string, string>();
    // em série: ordem previsível no log e sem rajada de processos
    for (const card of targets) await this.consider(card, releases, links);
  }

  private async consider(card: Card, releases: Release[], links: Map<string, string>): Promise<void> {
    const sha = card.mergeCommit;
    try {
      // o commit pode não estar neste clone (clone raso, branch nunca baixada). Sem esta verificação o
      // `--contains` falharia com "malformed object name" e pareceria defeito no log.
      await this.deps.git(['rev-parse', '--verify', '--quiet', `${sha}^{commit}`], this.deps.cwd);
    } catch {
      return; // silêncio total: não há como afirmar publicação, e a rodada seguinte tenta de novo
    }

    let tags: string[];
    try {
      const out = await this.deps.git(['tag', '--contains', sha], this.deps.cwd);
      tags = out
        .split(/\r?\n/)
        .map((t) => t.trim())
        .filter(Boolean);
    } catch (e) {
      return this.noteFailure(e instanceof Error ? e.message : String(e), cardRef(card));
    }

    const tag = publishedVersion(releases, tags);
    if (!tag) return;
    await this.finish(card, tag, await this.linkOf(tag, links));
  }

  /** O link da release, memorizado por tag: o `gh release list --json` não oferece o campo `url`. */
  private async linkOf(tag: string, links: Map<string, string>): Promise<string> {
    const known = links.get(tag);
    if (known !== undefined) return known;
    let url = '';
    try {
      const data: unknown = JSON.parse(await this.deps.gh(['release', 'view', tag, '--json', 'url'], this.deps.cwd));
      if (data && typeof data === 'object' && typeof (data as { url?: unknown }).url === 'string') url = (data as { url: string }).url;
    } catch {
      /* o link é detalhe, não condição (RF7): em silêncio, o comentário sai só com a tag */
    }
    links.set(tag, url);
    return url;
  }

  /** Registra a versão na conversa e só então arquiva: se o arquivamento falhar, o card fica visível com o motivo. */
  private async finish(card: Card, tag: string, url: string): Promise<void> {
    const s = this.router.snapshot();
    // a situação pode ter mudado enquanto o gh respondia (outra rodada arquivou, a pessoa moveu)
    const live = publishWatchTargets(s).find((c) => c.id === card.id);
    if (!live) return;
    const ref = cardRef(live);
    try {
      const told = s.comments.some((c) => c.cardId === live.id && c.body.includes(VERSION_MARK));
      if (!told) {
        const where = url ? `${VERSION_MARK} ${tag} (${url}).` : `${VERSION_MARK} ${tag}.`;
        this.router.handle(
          {
            type: 'comment.add',
            cardId: live.id,
            body: `Esta história ${where} O commit do merge (${live.mergeCommit.slice(0, 7)}) está contido nessa tag. Card arquivado pelo board.`,
          },
          { author: AUTHOR, source: 'ai' },
        );
      }
      // o handler chama `cards.archive`, que marca a história e as sub-tarefas no mesmo UPDATE
      this.router.handle({ type: 'card.archive', cardId: live.id }, { author: AUTHOR });
    } catch (e) {
      return this.noteFailure(e instanceof Error ? e.message : String(e), ref);
    }
    this.deps.log(`[${ref}] Publicada na ${tag}; card arquivado.`);
  }

  /**
   * Uma linha de log por causa: a mesma falha em dez candidatos e três rodadas aparece uma vez. O que
   * se compara é a **causa**, não a linha: o card em que ela apareceu primeiro entra na mensagem, mas
   * incluí-lo na comparação faria a mesma falha render uma linha por candidato.
   *
   * O prefixo `Publicações:` é próprio para não se confundir com o `Merges:` da detecção de merges —
   * são duas causas de falha diferentes, e juntá-las faria uma esconder a outra.
   */
  private noteFailure(cause: string, ref?: string): void {
    if (cause === this.lastFailure) return;
    this.lastFailure = cause;
    this.deps.log(`Publicações: ${ref ? `[${ref}] ` : ''}${cause}`);
  }
}
