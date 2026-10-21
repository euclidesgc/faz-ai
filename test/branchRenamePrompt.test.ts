import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openInMemory } from '../src/extension/db/database';
import type { GhRunner } from '../src/extension/branchRename';
import {
  COPY,
  RENAME,
  UNDO,
  bindBranchRenamePrompt,
  renameQuestion,
  renameResultText,
  type RenamePromptUi,
} from '../src/extension/branchRenamePrompt';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import type { RenameOutcome } from '../src/shared/branchRename';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

let base: string;
let repo: string;
let origin: string;
let router: MessageRouter;
let ghFails: Error | null;
let ghViewFails: Error | null;

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const settle = () => new Promise<void>((r) => setTimeout(r, 20));

const gh: GhRunner = (args) => {
  if (args[0] === 'repo') {
    if (ghViewFails) throw ghViewFails;
    return `${path.basename(path.dirname(origin))}/origin\n`;
  }
  if (ghFails) throw ghFails;
  const from = decodeURIComponent(/branches\/(.+)\/rename$/.exec(args[3] ?? '')![1]!);
  const to = (args[5] ?? '').replace('new_name=', '');
  git(origin, 'branch', '-m', from, to);
  return '';
};

/** O editor falso: cada caixa devolve a próxima resposta da fila (undefined = fechou sem escolher). */
function fakeUi(answers: (string | undefined)[]) {
  const shown: { kind: 'warn' | 'info' | 'error'; message: string; modal?: boolean; items: string[] }[] = [];
  const copied: string[] = [];
  const next = () => Promise.resolve(answers.shift());
  const ui: RenamePromptUi = {
    warn: (message, modal, ...items) => (shown.push({ kind: 'warn', message, modal, items }), next()),
    info: (message, ...items) => (shown.push({ kind: 'info', message, items }), next()),
    error: (message, ...items) => (shown.push({ kind: 'error', message, items }), next()),
    copy: (text) => (copied.push(text), Promise.resolve()),
  };
  return { ui, shown, copied };
}

const update = (g: Record<string, string>) => router.handle({ type: 'settings.board.update', patch: { git: g } });

beforeEach(async () => {
  base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-rename-p-')));
  repo = path.join(base, 'projeto');
  origin = path.join(base, 'origin.git');
  git(base, 'init', '-q', '--bare', '-b', 'master', origin);
  git(base, 'clone', '-q', origin, repo);
  git(repo, 'config', 'user.email', 't@e.com');
  git(repo, 'config', 'user.name', 'T');
  git(repo, 'switch', '-q', '-c', 'master');
  git(repo, 'commit', '-q', '--allow-empty', '-m', 'inicial');
  git(repo, 'branch', 'develop');
  git(repo, 'push', '-q', '-u', 'origin', 'master');
  git(repo, 'push', '-q', '-u', 'origin', 'develop');
  git(repo, 'remote', 'set-head', 'origin', 'master');
  ghFails = null;
  ghViewFails = null;
  const db = await openInMemory(WASM_DIR);
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(base, 'attachments'),
    workspaceDir: repo,
    gh,
  });
});
afterEach(() => fs.rmSync(base, { recursive: true, force: true }));

describe('aviso modal da renomeação no editor', () => {
  it('pergunta com Renomear e Desfazer, explica o que muda e o que não muda, e só então renomeia', async () => {
    const { ui, shown } = fakeUi([RENAME, undefined]);
    bindBranchRenamePrompt(router, ui);
    update({ developBranch: 'dev' });
    await settle();
    const question = shown[0]!;
    expect(question).toMatchObject({ kind: 'warn', modal: true, items: [RENAME, UNDO] });
    expect(question.message).toContain('"develop" para "dev"');
    expect(question.message).toContain('no GitHub, com o gh');
    expect(question.message).toContain('workflows de CI');
    expect(question.message).toContain('os outros clones');
    // o resultado vem depois da confirmação
    expect(shown[1]).toMatchObject({ kind: 'info' });
    expect(shown[1]!.message).toContain('renomeada para "dev"');
    expect(git(repo, 'branch', '--list', 'dev')).toContain('dev');
    expect(router.snapshot().branchRenames).toEqual([]);
    expect(router.snapshot().branchRenameResult).toBeNull();
  });

  it('Desfazer volta o nome sem tocar o repositório', async () => {
    const before = git(repo, 'for-each-ref');
    const { ui } = fakeUi([UNDO]);
    bindBranchRenamePrompt(router, ui);
    update({ developBranch: 'dev' });
    await settle();
    expect(router.snapshot().board.git.developBranch).toBe('develop');
    expect(git(repo, 'for-each-ref')).toBe(before);
  });

  it('fechar a caixa sem escolher mantém o pedido e não pergunta de novo na sessão', async () => {
    const { ui, shown } = fakeUi([undefined]);
    bindBranchRenamePrompt(router, ui);
    update({ developBranch: 'dev' });
    await settle();
    update({ featurePrefix: 'feat/' });
    await settle();
    expect(shown).toHaveLength(1);
    expect(router.snapshot().branchRenames).toHaveLength(1);
    // ao reabrir (novo bind sobre o mesmo board), a pergunta volta (RF9)
    const again = fakeUi([UNDO]);
    bindBranchRenamePrompt(router, again.ui);
    await settle();
    expect(again.shown[0]!.message).toContain('"develop" para "dev"');
  });

  it('sem gh: resultado com os comandos prontos e botão para copiar', async () => {
    ghViewFails = new Error('o comando "gh" não foi encontrado');
    const { ui, shown, copied } = fakeUi([RENAME, COPY]);
    bindBranchRenamePrompt(router, ui);
    update({ mainBranch: 'main' });
    await settle();
    const result = shown[1]!;
    expect(result).toMatchObject({ kind: 'warn', modal: true, items: [COPY] });
    expect(result.message).toContain('git push origin --delete master');
    expect(result.message).toContain('git remote set-head origin -a');
    expect(copied[0]).toContain('git branch -m master main');
    // o pedido fica (o repositório segue divergente), mas a pergunta não repete nesta sessão
    expect(shown).toHaveLength(2);
    expect(router.snapshot().branchRenames).toHaveLength(1);
    expect(git(repo, 'branch', '--list', 'master')).toContain('master');
  });

  it('falha do gh: o aviso é de erro, diz o que falta e a pergunta volta para tentar de novo', async () => {
    ghFails = new Error('HTTP 403');
    const { ui, shown } = fakeUi([RENAME, undefined, UNDO]);
    bindBranchRenamePrompt(router, ui);
    update({ developBranch: 'dev' });
    await settle();
    expect(shown[1]).toMatchObject({ kind: 'error' });
    expect(shown[1]!.message).toContain('HTTP 403');
    expect(shown[1]!.message).toContain('Nada foi alterado');
    expect(shown[2]).toMatchObject({ kind: 'warn', items: [RENAME, UNDO] });
  });

  it('recusa do board (IA executando): a pessoa lê o motivo e o pedido fica', async () => {
    const f = fakeUi([undefined]);
    const s0 = router.snapshot();
    const wf = s0.workflows.find((w) => w.kind === 'parent')!;
    const id = router.createCard({
      typeId: s0.cardTypes.find((t) => t.defaultWorkflowId === wf.id)!.id,
      columnId: s0.columns.find((c) => c.workflowId === wf.id)!.id,
      parentId: null,
      title: 'X',
    });
    // a IA começa a executar enquanto o aviso está aberto
    const ui: RenamePromptUi = {
      ...f.ui,
      warn: (message, modal, ...items) => {
        f.shown.push({ kind: 'warn', message, modal, items });
        router.setAiRuns([
          { cardId: id, runId: '', mode: 'phase', origin: 'manual', phase: 'Implementação', model: null, tool: 'claude', startedAt: 0 },
        ]);
        return Promise.resolve(RENAME);
      },
    };
    bindBranchRenamePrompt(router, ui);
    update({ developBranch: 'dev' });
    await settle();
    expect(f.shown[1]).toMatchObject({ kind: 'error' });
    expect(f.shown[1]!.message).toContain('a IA está executando #');
    expect(router.snapshot().branchRenames).toHaveLength(1);
    expect(git(repo, 'branch', '--list', 'develop')).toContain('develop');
  });
});

describe('textos', () => {
  const req = { kind: 'main', from: 'master', to: 'main' } as const;
  const base: RenameOutcome = { status: 'done', request: req, done: [], commands: [], otherClones: [] };
  it('falha parcial lista o que já foi feito e o que falta', () => {
    const r = renameResultText({
      ...base,
      status: 'failed',
      done: ['remote'],
      failed: { step: 'local', error: 'fatal' },
      commands: ['git branch -m master main'],
    });
    expect(r.level).toBe('error');
    expect(r.text).toContain('Já feito: renomear no GitHub');
    expect(r.text).toContain('git branch -m master main');
  });
  it('a pergunta da develop não fala do origin/HEAD', () => {
    expect(renameQuestion({ kind: 'develop', from: 'develop', to: 'dev', previous: 'develop' })).not.toContain('origin/HEAD.');
    expect(renameQuestion({ kind: 'main', from: 'master', to: 'main', previous: '' })).toContain('origin/HEAD para main');
  });
});
