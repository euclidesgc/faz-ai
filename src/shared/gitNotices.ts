// Avisos da limpeza da história concluída (conversa do card). O host grava em português, com `{parâmetros}` preenchidos
// por `gitNotice`; a tela traduz o texto pronto pelo dicionário em src/webview/i18n/en/host.ts (mesmo mecanismo de
// `gitNoticeText`, em ./gitflow.ts). Módulo puro: sem `vscode` nem banco.

type Params = Record<string, string | number>;

/**
 * As chaves da limpeza (#464), da pilha (`stack.*`), da volta da principal no hotfix (`back.*`, #480) e da release
 * a partir da principal depois do hotfix (`release.*`).
 */
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
  | 'cleanup.noOrigin'
  | 'cleanup.remoteStillBase'
  | 'stack.moved'
  | 'stack.prMoved'
  | 'stack.prFailed'
  | 'back.merged'
  | 'back.already'
  | 'back.conflict'
  | 'back.notMerged'
  | 'back.createFailed'
  | 'back.prTitle'
  | 'back.prBody'
  | 'release.created'
  | 'release.already'
  | 'release.notBumped'
  | 'release.noVersion'
  | 'release.failed';

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
  'cleanup.remoteStillBase':
    '**Aviso:** A branch remota origin/{branch} não foi apagada: o pull request {nextPr} da história #{number} ainda a usa como base. Troque a base dele (gh pr edit {nextPr} --base {base}) e apague com: git push origin --delete {branch}',
  'stack.moved':
    'A história #{prev}, sobre a qual esta estava empilhada, foi concluída: a base desta história passou de {old} para {base}. Antes de continuar, traga a nova base para a branch (git fetch origin {base} e git merge origin/{base}), sem rebase nem push forçado.',
  'stack.prMoved': 'A base do pull request {pr} também passou para {base}.',
  'stack.prFailed': '**Aviso:** a base do pull request {pr} não foi trocada: {error}. Troque com: gh pr edit {pr} --base {base}',
  'back.merged': 'A {main} voltou para a {develop} pelo pull request {url}, com merge commit.',
  'back.already': 'A {develop} já contém a {main}: não foi preciso abrir o pull request de volta.',
  'back.conflict':
    '**Aviso:** O pull request {url} da {main} para a {develop} tem conflito e ficou aberto. O board não resolve conflitos: resolva-o no GitHub ou localmente e faça o merge com merge commit (gh pr merge {url} --merge).',
  'back.notMerged':
    '**Aviso:** O pull request {url} da {main} para a {develop} ficou aberto: {error}. Faça o merge com merge commit: gh pr merge {url} --merge',
  'back.createFailed':
    '**Aviso:** O pull request da {main} para a {develop} não foi aberto: {error}. Abra com: gh pr create --base {develop} --head {main}',
  'back.prTitle': 'Volta da {main} para a {develop} depois do hotfix #{number}',
  'back.prBody':
    'Aberto pelo Faz AI depois do merge de {pr}. Faça o merge com merge commit, não com squash: a {develop} precisa conter os commits da {main}.',
  'release.created':
    'Release {tag} criada a partir da {main} ({url}). Se o projeto publica numa loja, a publicação segue o processo de release dele.',
  'release.already': 'A {main} já tem a release {tag} sobre o commit do hotfix: nada a criar.',
  'release.notBumped':
    '**Aviso:** A release não foi criada: a versão do package.json na {main} ({version}) já tem a tag {tag}. Suba a versão e gere a release a partir da {main} pelo processo do projeto.',
  'release.noVersion':
    '**Aviso:** A release não foi criada: a {main} não tem package.json nem tag de versão (vX.Y.Z) de onde tirar a próxima. Crie com: gh release create <versão> --target {main} --generate-notes',
  'release.failed':
    '**Aviso:** A release {tag} não foi criada: {error}. Crie com: gh release create {tag} --target {sha} --title {tag} --generate-notes',
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
