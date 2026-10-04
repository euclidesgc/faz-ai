import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Card } from '../../../shared/model';
import { branchName, slug } from '../../../shared/git';
import { columnOf, isLive } from '../../../shared/selectors';
import { isPullRequestUrl, lastAiColumn, stackBaseOf, storyOf } from '../../../shared/story';
import { prepareWorkspace } from '../../git';
import type { BoardContext, HandlerMap } from './context';

/** Pasta onde ficam as worktrees das histórias. */
function worktreeRoot(ctx: BoardContext): string | null {
  const dir = ctx.opts.workspaceDir;
  const { git } = ctx.state().board;
  return dir && git.mode === 'worktree' ? path.resolve(dir, git.worktreeDir.replace(/\{repo\}/g, path.basename(dir))) : null;
}

/**
 * Pastas fora do projeto em que a IA precisa poder trabalhar: a das worktrees. Vai inteira (e
 * não a de uma história) porque a worktree pode ser criada no meio da execução.
 */
export function aiWorkDirs(ctx: BoardContext): string[] {
  const root = worktreeRoot(ctx);
  if (!root) return [];
  fs.mkdirSync(root, { recursive: true });
  return [root];
}

/** A história do card: ele mesmo, ou o pai quando é uma sub-tarefa. */
function storyOfCard(ctx: BoardContext, cardId: string): Card {
  const s = ctx.state();
  const card = s.cards.find((c) => c.id === cardId);
  const story = card && storyOf(s, card);
  if (!story) throw new Error('Card não encontrado');
  return story;
}

/** Cria (ou reaproveita) a branch e a pasta de trabalho da história, com nomes definidos pelo board. */
function prepareStoryWorkspace(ctx: BoardContext, cardId: string): void {
  const s = ctx.state();
  const { git } = s.board;
  const projectDir = ctx.opts.workspaceDir;
  if (git.mode === 'off') throw new Error('A criação de branches está desligada neste board (Configurações → Git).');
  if (!projectDir) throw new Error('Nenhuma pasta de projeto aberta.');
  const story = storyOfCard(ctx, cardId);
  // a branch já registrada vale mesmo que o título ou o padrão tenham mudado depois
  const branch =
    story.branch ||
    branchName(git.branchPattern, {
      type: s.cardTypes.find((t) => t.id === story.typeId)?.name ?? '',
      number: story.number,
      title: story.title,
    });
  const worktreePath =
    story.worktreePath || path.join(worktreeRoot(ctx) ?? projectDir, `${story.number}-${slug(story.title) || 'historia'}`);
  // história em modo autônomo parte da branch da anterior; a base escolhida na primeira vez vale daí em diante
  const ws = prepareWorkspace({
    projectDir,
    mode: git.mode,
    branch,
    worktreePath,
    base: story.branch ? story.baseBranch : (stackBaseOf(s, story)?.branch ?? ''),
  });
  ctx.cards.setWorkspace(story.id, ws.branch, ws.path);
  if (!story.branch) ctx.cards.setBaseBranch(story.id, ws.base);
}

/** Branch, worktree e pull request da história. */
export const workspaceHandlers = {
  'card.workspace.prepare': (msg, ctx) => {
    prepareStoryWorkspace(ctx, msg.cardId);
    return true;
  },
  'card.workspace.clear': (msg, ctx) => {
    const story = storyOfCard(ctx, msg.cardId);
    ctx.cards.setWorkspace(story.id, story.branch, '');
    return true;
  },
  'card.pr.set': (msg, ctx, { author }) => {
    const url = msg.url.trim();
    if (url && !isPullRequestUrl(url)) throw new Error('Informe o endereço (URL) do pull request.');
    const storyId = storyOfCard(ctx, msg.cardId).id;
    ctx.cards.setPullRequest(storyId, url);
    const s = ctx.state();
    const story = s.cards.find((c) => c.id === storyId)!;
    const column = columnOf(s, story);
    // história YOLO parada na última coluna da IA, com o pull request recém-gravado: já está entregue.
    // Grava waiting_review direto pelo repositório, sem passar pelo card.status.set de cards.ts — lá, em
    // modo autônomo, waiting_review vira approved na hora (é o que destrava as fases do meio); aqui a
    // entrega é para a pessoa revisar, não para a IA seguir, e o merge continua só dela (ctx.approved).
    // Bloqueio é a exceção: é impedimento aberto, e registrar o pull request não o resolve.
    if (
      story.yolo &&
      !story.parentId &&
      isLive(story) &&
      column?.category === 'open' &&
      column.id === lastAiColumn(s, story.workflowId)?.id &&
      story.prUrl &&
      story.status !== 'blocked'
    ) {
      ctx.cards.setStatus(story.id, 'waiting_review', '', author);
      ctx.comments.add(story.id, author, `História entregue com o pull request ${story.prUrl}; aguardando a revisão da pessoa.`, 'ai');
    }
    return true;
  },
  // Sem efeito colateral de propósito: ao contrário do card.pr.set (que fecha a entrega e avisa a
  // pessoa), este registro é só o insumo que a #49 vai cruzar com as releases publicadas; não muda
  // status nem grava comentário.
  'card.merge.set': (msg, ctx) => {
    const storyId = storyOfCard(ctx, msg.cardId).id;
    ctx.cards.setMergeCommit(storyId, msg.commit.trim());
    return true;
  },
} satisfies Partial<HandlerMap>;
