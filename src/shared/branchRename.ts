/**
 * Renomear a branch principal ou a develop também no `origin` (#466). Aqui só o que é puro: os tipos do
 * pedido e do resultado e os comandos que a pessoa roda à mão quando o board não age no remoto.
 * Quem executa os passos é `src/extension/branchRename.ts`.
 */

/** Qual das duas branches de nome configurável mudou. */
export type RenameKind = 'main' | 'develop';

/** Um pedido de renomeação guardado até a pessoa escolher entre Renomear e Desfazer (RF9). */
export interface BranchRenamePending {
  kind: RenameKind;
  /** o nome em uso antes da mudança (a principal detectada, quando `previous` é vazio) */
  from: string;
  /** o nome que a pessoa digitou */
  to: string;
  /** o valor da configuração antes da mudança: é o que o Desfazer regrava ('' = principal detectada) */
  previous: string;
}

/** Os passos da renomeação, na ordem em que rodam. */
export type RenameStep = 'fetch' | 'remote' | 'local' | 'upstream' | 'head';

export interface RenameRequest {
  kind: RenameKind;
  from: string;
  to: string;
}

/**
 * - `done`: o repositório ficou coerente com o nome novo;
 * - `manual`: o board não age no remoto (sem `gh`, sem GitHub, sem permissão para descobrir o
 *   repositório) e nada foi executado: a pessoa roda `commands`;
 * - `failed`: um passo falhou; `done` diz o que já mudou e `commands` o que falta;
 * - `nothing`: não havia o que renomear (o nome novo já existe, ou o antigo não existe).
 */
export type RenameStatus = 'done' | 'manual' | 'failed' | 'nothing';

export interface RenameOutcome {
  status: RenameStatus;
  request: RenameRequest;
  /** passos concluídos nesta execução */
  done: RenameStep[];
  /** o passo que falhou e a mensagem do git ou do `gh` */
  failed?: { step: RenameStep; error: string };
  /** por que o remoto não foi tocado (`manual`) */
  reason?: string;
  /** o que a pessoa ainda roda neste clone (tudo, no `manual`) */
  commands: string[];
  /** o que cada outro clone do repositório precisa rodar depois */
  otherClones: string[];
}

/** O comando de cada passo que o board faz no clone; o remoto é o `gh` (ver `remoteCommands`). */
function stepCommand(req: RenameRequest, step: RenameStep): string[] {
  switch (step) {
    case 'fetch':
      return ['git fetch --prune origin'];
    case 'remote':
      return remoteCommands(req);
    case 'local':
      return [`git branch -m ${req.from} ${req.to}`];
    case 'upstream':
      return [`git branch -u origin/${req.to} ${req.to}`];
    case 'head':
      return [`git remote set-head origin ${req.to}`];
  }
}

/** Renomear no remoto à mão: publica o nome novo, troca a branch padrão (só na principal) e apaga o antigo. */
function remoteCommands(req: RenameRequest): string[] {
  const cmds = [`git push -u origin ${req.to}`];
  if (req.kind === 'main')
    cmds.push(`# no provedor (GitHub: Settings → Branches), troque a branch padrão para ${req.to} antes de apagar a antiga`);
  cmds.push(`git push origin --delete ${req.from}`);
  return cmds;
}

/** Todos os comandos para renomear à mão neste clone, na ordem certa. */
export function manualCommands(req: RenameRequest): string[] {
  // `git branch -m` primeiro: o `push -u` já deixa o upstream em origin/<novo>
  const cmds = [...stepCommand(req, 'local'), ...remoteCommands(req)];
  if (req.kind === 'main') cmds.push(...stepCommand(req, 'head'));
  return cmds;
}

/** Os comandos dos passos que faltam, na ordem; vazio quando não falta nenhum. */
export function remainingCommands(req: RenameRequest, steps: RenameStep[]): string[] {
  return steps.flatMap((s) => stepCommand(req, s));
}

/** O que cada outro clone do repositório roda depois de a branch ser renomeada no remoto. */
export function otherCloneCommands(req: RenameRequest): string[] {
  const cmds = [`git branch -m ${req.from} ${req.to}`, 'git fetch --prune origin', `git branch -u origin/${req.to} ${req.to}`];
  if (req.kind === 'main') cmds.push('git remote set-head origin -a');
  return cmds;
}
