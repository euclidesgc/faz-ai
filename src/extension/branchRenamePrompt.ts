import type { BranchRenamePending, RenameKind, RenameOutcome, RenameStep } from '../shared/branchRename';
import type { BoardState } from '../shared/model';
import type { WebviewToHost } from '../shared/messages';

/** O que o aviso precisa do editor: as caixas de mensagem e a área de transferência (injetados nos testes). */
export interface RenamePromptUi {
  /** mensagem de aviso; `modal` pede uma resposta antes de seguir. Devolve o botão ou undefined ao fechar. */
  warn(message: string, modal: boolean, ...items: string[]): PromiseLike<string | undefined>;
  info(message: string, ...items: string[]): PromiseLike<string | undefined>;
  error(message: string, ...items: string[]): PromiseLike<string | undefined>;
  copy(text: string): PromiseLike<void>;
}

/** O que o aviso precisa do router (a mesma superfície do `IdeSettings`). */
export interface RenamePromptRouter {
  snapshot(): BoardState;
  handle(msg: WebviewToHost): unknown;
  onDidChange(fn: () => void): () => void;
}

const KIND_LABEL: Record<RenameKind, string> = { main: 'principal', develop: 'develop' };
const STEP_LABEL: Record<RenameStep, string> = {
  fetch: 'atualizar as referências do origin',
  remote: 'renomear no GitHub',
  local: 'renomear a branch local',
  upstream: 'ajustar o upstream',
  head: 'apontar o origin/HEAD para a nova',
};
export const RENAME = 'Renomear';
export const UNDO = 'Desfazer';
export const COPY = 'Copiar comandos';

/** A pergunta do aviso: o que acontece ao renomear e o que não acontece (RF2). */
export function renameQuestion(p: BranchRenamePending): string {
  const main = p.kind === 'main';
  return [
    `Renomear a branch ${KIND_LABEL[p.kind]} "${p.from}" para "${p.to}"?`,
    '',
    'O nome novo já está nas configurações. Para o repositório ficar coerente, o board vai:',
    '• renomear a branch no GitHub, com o gh (instalado e autenticado);',
    '• renomear a branch no clone local e ajustar o upstream;',
    ...(main ? [`• apontar o origin/HEAD para ${p.to}.`] : []),
    '',
    'Sem o gh, fora do GitHub ou sem permissão, o board não mexe no remoto e mostra os comandos prontos.',
    'Não muda: workflows de CI, regras de proteção, a branch padrão do GitHub (na develop) e os outros clones (os comandos deles aparecem depois).',
    `Desfazer volta o nome para "${p.from}" sem tocar o repositório.`,
  ].join('\n');
}

const stepList = (steps: RenameStep[]): string => steps.map((s) => STEP_LABEL[s]).join(', ');
const lines = (cmds: string[]): string => cmds.join('\n');

/** O texto do resultado e se ele pede uma resposta antes de seguir (manual e falha pedem). */
export function renameResultText(r: RenameOutcome): { text: string; modal: boolean; level: 'info' | 'warn' | 'error'; copy: string } {
  const { from, to } = r.request;
  const copy = [...r.commands, ...(r.otherClones.length ? ['', '# nos outros clones do repositório:', ...r.otherClones] : [])].join('\n');
  switch (r.status) {
    case 'done':
      return {
        text:
          `Branch "${from}" renomeada para "${to}" (${stepList(r.done)}).` +
          (r.otherClones.length ? `\nNos outros clones, rode:\n${lines(r.otherClones)}` : ''),
        modal: false,
        level: 'info',
        copy: lines(r.otherClones),
      };
    case 'manual':
      return {
        text:
          `O board não alterou o repositório nem o remoto (${r.reason ?? 'sem o gh'}).\n` +
          `Para renomear "${from}" para "${to}", rode neste clone:\n${lines(r.commands)}` +
          (r.otherClones.length ? `\n\nNos outros clones:\n${lines(r.otherClones)}` : ''),
        modal: true,
        level: 'warn',
        copy,
      };
    case 'failed':
      return {
        text:
          `A renomeação parou em "${r.failed ? STEP_LABEL[r.failed.step] : 'um passo'}": ${r.failed?.error ?? 'erro'}.\n` +
          (r.done.length ? `Já feito: ${stepList(r.done)}.\n` : 'Nada foi alterado.\n') +
          (r.commands.length ? `Falta:\n${lines(r.commands)}\n` : '') +
          'Renomear de novo é seguro: cada passo confere o estado antes de agir.',
        modal: true,
        level: 'error',
        copy,
      };
    case 'nothing':
      return {
        text: `Nada a renomear: "${to}" já existe ou "${from}" não existe mais. O board passa a usar "${to}".`,
        modal: false,
        level: 'info',
        copy: '',
      };
  }
}

const keyOf = (p: BranchRenamePending): string => `${p.kind}:${p.from}>${p.to}`;

/**
 * Liga o aviso do editor (RF2, RF3, RF9): enquanto houver um pedido de renomeação no board, pergunta
 * Renomear ou Desfazer; depois mostra o resultado, com os comandos para copiar. Fechar a caixa sem
 * escolher não faz nada: o pedido continua e a pergunta volta quando o board é aberto de novo.
 */
export function bindBranchRenamePrompt(router: RenamePromptRouter, ui: RenamePromptUi): { dispose(): void } {
  let busy = false;
  /** pedidos de que a pessoa fechou a caixa nesta sessão: não perguntar de novo até reabrir */
  const declined = new Set<string>();

  const resolve = (kind: RenameKind, action: 'confirm' | 'undo' | 'dismiss') => router.handle({ type: 'git.rename.resolve', kind, action });

  async function showResult(r: RenameOutcome): Promise<void> {
    const shown = renameResultText(r);
    const items = shown.copy ? [COPY] : [];
    const show =
      shown.level === 'info'
        ? ui.info(shown.text, ...items)
        : shown.level === 'warn'
          ? ui.warn(shown.text, shown.modal, ...items)
          : ui.error(shown.text, ...items);
    if ((await show) === COPY) await ui.copy(shown.copy);
    resolve(r.request.kind, 'dismiss');
  }

  /** o pedido em pergunta: se o board recusar a resposta, não perguntar de novo nesta sessão */
  let asking: BranchRenamePending | null = null;

  async function ask(p: BranchRenamePending): Promise<void> {
    asking = p;
    const choice = await ui.warn(renameQuestion(p), true, RENAME, UNDO);
    if (choice === UNDO) resolve(p.kind, 'undo');
    else if (choice === RENAME) resolve(p.kind, 'confirm');
    else declined.add(keyOf(p));
  }

  async function check(): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      // um passo por vez: o resultado de uma renomeação antes da pergunta da próxima
      for (;;) {
        const s = router.snapshot();
        if (s.branchRenameResult) {
          await showResult(s.branchRenameResult);
          continue;
        }
        const next = s.branchRenames.find((p) => !declined.has(keyOf(p)));
        if (!next) return;
        await ask(next);
      }
    } catch (e) {
      if (asking) declined.add(keyOf(asking));
      // recusa do board (IA executando) ou erro inesperado: a pessoa lê o motivo e o pedido continua
      void ui.error(e instanceof Error ? e.message : String(e));
    } finally {
      busy = false;
    }
  }

  const unsubscribe = router.onDidChange(() => void check());
  void check();
  return { dispose: unsubscribe };
}
