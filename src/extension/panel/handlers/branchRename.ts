import type { GitConfig } from '../../../shared/git';
import { parseGit } from '../../../shared/git';
import {
  RENAME_PENDING_KEY,
  RENAME_RESULT_KEY,
  parsePending,
  type BranchRenamePending,
  type RenameKind,
  type RenameOutcome,
} from '../../../shared/branchRename';
import { storyOf } from '../../../shared/story';
import { renameNeeded, runBranchRename } from '../../branchRename';
import type { BoardContext, HandlerMap } from './context';

/** A configuração de git de cada tipo: o campo do `GitConfig` que guarda o nome. */
const FIELD: Record<RenameKind, 'mainBranch' | 'developBranch'> = { main: 'mainBranch', develop: 'developBranch' };

const readPending = (ctx: BoardContext): BranchRenamePending[] => parsePending(ctx.boards.getMeta(RENAME_PENDING_KEY));

const writePending = (ctx: BoardContext, list: BranchRenamePending[]): void => ctx.boards.setMeta(RENAME_PENDING_KEY, JSON.stringify(list));
const writeResult = (ctx: BoardContext, r: RenameOutcome | null): void => ctx.boards.setMeta(RENAME_RESULT_KEY, JSON.stringify(r));

/** Os números das histórias com a IA executando agora (uma sub-tarefa conta pela história dela). */
function runningStories(ctx: BoardContext): number[] {
  if (!ctx.aiRuns.length) return [];
  const s = ctx.state();
  const numbers = new Set<number>();
  for (const id of ctx.aiRuns) {
    const card = s.cards.find((c) => c.id === id);
    const story = card && storyOf(s, card);
    if (story) numbers.add(story.number);
  }
  return [...numbers].sort((a, b) => a - b);
}

function refuseWhileRunning(ctx: BoardContext): void {
  if (!ctx.aiRuns.length) return;
  const numbers = runningStories(ctx).map((n) => `#${n}`);
  throw new Error(
    numbers.length
      ? `Não dá para renomear a branch agora: a IA está executando ${numbers.join(', ')}. Espere terminar e tente de novo.`
      : 'Não dá para renomear a branch agora: há uma execução da IA em andamento. Espere terminar e tente de novo.',
  );
}

/**
 * Compara a configuração antes e depois do patch e devolve, por tipo, o que muda: a principal e a
 * develop. Vale só com repositório e com o nome novo ainda inexistente (RF1). Voltar ao nome de origem de
 * um pedido guardado cancela o pedido (`to === from` com `replaces`).
 */
function nameChanges(ctx: BoardContext, patch: Partial<GitConfig>): BranchRenamePending[] {
  const dir = ctx.opts.workspaceDir;
  if (!dir) return [];
  const before = parseGit(ctx.boards.gitJson(ctx.boardId));
  const after = parseGit(JSON.stringify({ ...before, ...patch }));
  const pending = readPending(ctx);
  const out: BranchRenamePending[] = [];
  for (const kind of ['main', 'develop'] as const) {
    const field = FIELD[kind];
    if (before[field] === after[field]) continue;
    const queued = pending.find((p) => p.kind === kind);
    // sem pedido guardado, o nome de antes é o em uso; com ele, o nome de origem continua valendo
    const from = queued?.from ?? (kind === 'main' ? ctx.mainBranch()?.name : before.developBranch) ?? '';
    const previous = queued?.previous ?? before[field];
    const to = after[field];
    out.push({ kind, from, to, previous });
  }
  return out.filter((c) => {
    // principal vazia volta a ser detectada: não há nome novo para criar
    if (!c.to) return false;
    // voltou ao nome de origem de um pedido guardado: cancela o pedido
    if (c.from === c.to) return true;
    return renameNeeded(dir, c.from, c.to);
  });
}

/**
 * Antes de gravar a configuração: com a IA executando, mudar o nome de uma branch existente é recusado
 * (RF7). Quem está só voltando ao nome de origem de um pedido guardado passa.
 */
export function guardGitPatch(ctx: BoardContext, patch: Partial<GitConfig>): BranchRenamePending[] {
  const changes = nameChanges(ctx, patch);
  if (changes.some((c) => c.from !== c.to)) refuseWhileRunning(ctx);
  return changes;
}

/** Depois de gravar a configuração: guarda os pedidos novos e apaga os cancelados. */
export function registerRenames(ctx: BoardContext, patch: Partial<GitConfig>, changes: BranchRenamePending[]): void {
  const touched = (['main', 'develop'] as const).filter((k) => FIELD[k] in patch);
  if (!touched.length) return;
  let list = readPending(ctx);
  // uma mudança de nome que não cai em renomeação (nome já existe, branch antiga não existe) limpa o pedido do tipo
  list = list.filter((p) => !touched.includes(p.kind));
  for (const c of changes) if (c.from !== c.to) list.push({ kind: c.kind, from: c.from, to: c.to, previous: c.previous });
  writePending(ctx, list);
  writeResult(ctx, null);
  ctx.mainBranch(true);
}

/** O board foi recriado: os pedidos e o resultado de antes não valem mais. */
export function clearRenames(ctx: BoardContext): void {
  writePending(ctx, []);
  writeResult(ctx, null);
}

/** Renomear, Desfazer ou dispensar o resultado: as três respostas do aviso. */
export const branchRenameHandlers = {
  'git.rename.resolve': (msg, ctx) => {
    const list = readPending(ctx);
    const pending = list.find((p) => p.kind === msg.kind);
    if (msg.action === 'dismiss') {
      writeResult(ctx, null);
      return true;
    }
    if (!pending) throw new Error('Não há renomeação de branch à espera de confirmação.');
    const rest = list.filter((p) => p !== pending);
    if (msg.action === 'undo') {
      // só a configuração volta: nenhum comando de escrita no repositório (RF3)
      ctx.boards.updateBoard(ctx.boardId, { git: { [FIELD[pending.kind]]: pending.previous } });
      writePending(ctx, rest);
      writeResult(ctx, null);
      ctx.mainBranch(true);
      return true;
    }
    // confirmar: a única ação que escreve no repositório e no origin
    const dir = ctx.opts.workspaceDir;
    if (!dir) throw new Error('Nenhuma pasta de projeto aberta.');
    refuseWhileRunning(ctx);
    const outcome = runBranchRename(dir, { kind: pending.kind, from: pending.from, to: pending.to }, ctx.gh);
    // a falha parcial mantém o pedido: repetir só faz o que faltou. O resto (feito, nada a fazer, comandos
    // manuais) encerra o pedido; se o repositório seguir divergente, ele volta ao reabrir o board.
    writePending(ctx, outcome.status === 'failed' ? list : rest);
    writeResult(ctx, outcome);
    ctx.mainBranch(true);
    return true;
  },
} satisfies Partial<HandlerMap>;
