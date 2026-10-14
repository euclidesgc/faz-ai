import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Card } from '../../../shared/model';
import { branchName, slug } from '../../../shared/git';
import { BOARD_AUTHOR, branchKindOf, flowBaseOf, flowPrefix, gitNoticeText } from '../../../shared/gitflow';
import { isPullRequestUrl, stackBaseOf, storyOf } from '../../../shared/story';
import { columnOf, isLive } from '../../../shared/selectors';
import { settleDelivery } from '../../delivery';
import { now } from '../../db/ids';
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
  // a derivada parte da branch da parte anterior: sem ela ainda, a base sairia da principal e ficaria fixa
  const origin = !story.branch && story.derivedFrom ? s.cards.find((c) => c.id === story.derivedFrom) : undefined;
  if (origin && isLive(origin) && columnOf(s, origin)?.category === 'open' && !origin.branch)
    throw new Error(
      `#${story.number} deriva de #${origin.number}, que ainda não tem branch: a branch desta parte parte da dela. Implemente #${origin.number} antes.`,
    );
  // detecta de novo: o cache pode ser de antes de a pasta virar repositório (git init depois de abrir o
  // board), e com a principal vazia a base sairia sem nome ("A branch  não existe"). A origem da detecção
  // também conta: a principal adivinhada pela branch atual não serve para criar a develop (ver git.ts)
  const detected = ctx.mainBranch(true);
  // a detecção só falha fora de um repositório: a mesma mensagem que o git daria adiante
  if (!detected) throw new Error('A pasta do projeto não é um repositório git.');
  const main = detected.name;
  const kind = branchKindOf(s, story);
  const typeName = s.cardTypes.find((t) => t.id === story.typeId)?.name ?? '';
  // a branch já registrada vale mesmo que o título ou o padrão tenham mudado depois
  const branch =
    story.branch ||
    branchName(git.branchPattern, { type: typeName, number: story.number, title: story.title, flow: flowPrefix(git, kind, typeName) });
  const worktreePath =
    story.worktreePath || path.join(worktreeRoot(ctx) ?? projectDir, `${story.number}-${slug(story.title) || 'historia'}`);
  // a base escolhida na primeira vez vale daí em diante (RF16): história com branch volta a ela (ou à principal,
  // quando é anterior ao gitflow) e, se essa base sumiu, à base do fluxo; a nova parte da anterior na pilha (derivada
  // ou modo autônomo), senão da base do fluxo
  const flowBase = flowBaseOf(git, kind, main);
  const toFlow = { base: flowBase.base, developFrom: flowBase.isDevelop ? main : undefined };
  const ws = prepareWorkspace({
    projectDir,
    mode: git.mode,
    branch,
    worktreePath,
    stack: story.branch ? undefined : stackBaseOf(s, story)?.branch,
    ...(story.branch ? { base: story.baseBranch || main, fallback: toFlow } : toFlow),
    mainGuessed: detected.source === 'current',
  });
  ctx.cards.setWorkspace(story.id, ws.branch, ws.path);
  if (!story.branch) {
    ctx.cards.setBaseBranch(story.id, ws.base);
    ctx.cards.setBranchCreatedAt(story.id, now());
  } else if (ws.notices.some((n) => n.kind === 'baseMissing')) {
    // a base gravada sumiu e a branch voltou da base do fluxo: o pull request vai para ela agora
    ctx.cards.setBaseBranch(story.id, ws.base);
  }
  // os avisos vão em português, assinados pelo board; a tela traduz pelo autor (RF25)
  for (const n of ws.notices) ctx.comments.add(story.id, BOARD_AUTHOR, gitNoticeText(n), 'ai');
  // criar a develop ou a primeira branch pode mudar o que a detecção enxerga
  ctx.mainBranch(true);
}

/** Branch, worktree e pull request da história. */
export const workspaceHandlers = {
  'card.workspace.prepare': (msg, ctx) => {
    prepareStoryWorkspace(ctx, msg.cardId);
    return true;
  },
  // a tela Git pede para detectar de novo a principal; devolve true para o snapshot novo chegar a ela
  'git.main.refresh': (_msg, ctx) => {
    ctx.mainBranch(true);
    return true;
  },
  'card.workspace.clear': (msg, ctx) => {
    const story = storyOfCard(ctx, msg.cardId);
    ctx.cards.setWorkspace(story.id, story.branch, '');
    return true;
  },
  'card.pr.set': (msg, ctx) => {
    const url = msg.url.trim();
    if (url && !isPullRequestUrl(url)) throw new Error('Informe o endereço (URL) do pull request.');
    const storyId = storyOfCard(ctx, msg.cardId).id;
    ctx.cards.setPullRequest(storyId, url);
    // história YOLO parada na última coluna da IA, com o pull request recém-gravado: já está entregue.
    // settleDelivery grava waiting_review direto pelo repositório, sem passar pelo card.status.set de
    // cards.ts — lá, em modo autônomo, waiting_review vira approved na hora (é o que destrava as fases
    // do meio); aqui a entrega é para a pessoa revisar, não para a IA seguir, e o merge continua só
    // dela (ctx.approved). Bloqueio é a exceção: é impedimento aberto, e registrar o pull request não
    // o resolve (ver `isDeliverableStory`).
    settleDelivery(ctx, storyId);
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
