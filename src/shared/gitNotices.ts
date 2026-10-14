// Avisos da limpeza da história concluída (conversa do card). O host grava em português, com `{parâmetros}` preenchidos
// por `gitNotice`; a tela traduz o texto pronto pelo dicionário em src/webview/i18n/en/host.ts (mesmo mecanismo de
// `gitNoticeText`, em ./gitflow.ts). Módulo puro: sem `vscode` nem banco.

type Params = Record<string, string | number>;

/** As chaves desta parte; `stack.*`, `back.*` e `cleanup.remoteStillBase` entram na parte 2 (#480). */
export type GitNoticeKey =
  | 'cleanup.title'
  | 'cleanup.worktreeRemoved'
  | 'cleanup.localDeleted'
  | 'cleanup.remoteDeleted'
  | 'cleanup.remoteGone'
  | 'develop.updated'
  | 'develop.current'
  | 'develop.checkedOut'
  | 'develop.ahead'
  | 'develop.failed'
  | 'cleanup.dirty'
  | 'cleanup.unpushed'
  | 'cleanup.localCheckedOut'
  | 'cleanup.localInUse'
  | 'cleanup.worktreeFailed'
  | 'cleanup.localFailed'
  | 'cleanup.remoteFailed'
  | 'cleanup.remoteMoved'
  | 'cleanup.headMismatch'
  | 'cleanup.noPullRequest'
  | 'cleanup.noOrigin';

/** Os textos em português; os avisos já levam o prefixo `**Aviso:**`. */
export const GIT_NOTICES: Record<GitNoticeKey, string> = {
  'cleanup.title': 'Limpeza da história depois do merge:',
  'cleanup.worktreeRemoved': 'pasta de trabalho {path} removida',
  'cleanup.localDeleted': 'branch local {branch} apagada',
  'cleanup.remoteDeleted': 'branch remota origin/{branch} apagada',
  'cleanup.remoteGone': 'branch remota origin/{branch} já tinha sido apagada',
  'develop.updated': '{develop} local atualizada até origin/{develop}',
  'develop.current': '{develop} local já estava atualizada',
  'develop.checkedOut':
    '**Aviso:** A {develop} local não foi atualizada: ela está aberta em {path}, e o board não mexe nos arquivos dessa pasta. Atualize lá com: git pull --ff-only origin {develop}',
  'develop.ahead':
    '**Aviso:** A {develop} local não foi atualizada: ela tem {count} commit(s) que não estão em origin/{develop}, e o board não força a atualização. Envie esses commits num pull request ou descarte-os, e depois rode: git fetch origin {develop}:{develop}',
  'develop.failed': '**Aviso:** A {develop} local não foi atualizada: {error}. Atualize com: git fetch origin {develop}:{develop}',
  'cleanup.dirty':
    '**Aviso:** A limpeza não apagou nada: a pasta de trabalho {path} tem mudanças não commitadas ({files}). A worktree, a branch local {branch} e a remota continuam. Para não perder essas mudanças, faça o commit e envie-as num pull request novo, ou copie os arquivos. Atenção: como a história já foi entregue, a limpeza de branches e worktrees órfãs vai descartar essas mudanças pendentes depois.',
  'cleanup.unpushed':
    '**Aviso:** A limpeza não apagou nada: a branch local {branch} tem {count} commit(s) que não estão no pull request {pr}. A worktree {path} e as branches local e remota continuam. Envie esses commits num pull request novo. Atenção: como a história já foi entregue, a limpeza de branches e worktrees órfãs vai descartar esses commits depois.',
  'cleanup.localCheckedOut':
    '**Aviso:** A branch local {branch} não foi apagada: a pasta do projeto ({path}) está nela, e o board não troca a branch da sua pasta. Troque de branch (por exemplo, git switch {develop}) e apague-a com: git branch -D {branch}',
  'cleanup.localInUse':
    '**Aviso:** A branch local {branch} não foi apagada: ela está aberta em {path}. Feche essa pasta ou troque a branch dela e apague com: git branch -D {branch}',
  'cleanup.worktreeFailed':
    '**Aviso:** A pasta de trabalho {path} não foi removida: {error}. A branch local {branch} ficou porque a pasta ainda a usa. Remova com: git worktree remove {path}',
  'cleanup.localFailed': '**Aviso:** A branch local {branch} não foi apagada: {error}. Apague com: git branch -D {branch}',
  'cleanup.remoteFailed':
    '**Aviso:** A branch remota origin/{branch} não foi apagada: {error}. Apague com: git push origin --delete {branch}',
  'cleanup.remoteMoved':
    '**Aviso:** A branch remota origin/{branch} não foi apagada: ela recebeu commits depois do pull request {pr}. Confira e, se não precisar deles, apague com: git push origin --delete {branch}',
  'cleanup.headMismatch':
    '**Aviso:** A limpeza não apagou nada: o pull request {pr} é da branch {head}, e a branch registrada no card é {branch}.',
  'cleanup.noPullRequest': '**Aviso:** A limpeza não apagou nada: não foi possível confirmar o pull request {pr} pelo gh ({error}).',
  'cleanup.noOrigin': '**Aviso:** O repositório não tem o remoto origin: a branch remota e a {develop} não foram tocadas.',
};

/** O texto do aviso em português, com cada `{param}` no lugar. Parâmetro que falta fica como `{param}`. */
export function gitNotice(key: GitNoticeKey, params: Params = {}): string {
  return GIT_NOTICES[key].replace(/\{(\w+)\}/g, (m, n: string) => (n in params ? String(params[n]) : m));
}

/**
 * Os nomes de arquivo para o aviso: até `max`, separados por vírgula, com "e mais N" para o resto
 * (a tela traduz o "e mais N" pelo dicionário do host).
 */
export function fileList(files: string[], max = 20): string {
  if (files.length <= max) return files.join(', ');
  return `${files.slice(0, max).join(', ')} e mais ${files.length - max}`;
}
