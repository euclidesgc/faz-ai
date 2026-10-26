// Mensagens do host (erros e avisos que chegam preenchidos ao webview). A chave é o texto em português com `{nome}` onde
// entra um valor; o `t` casa o texto já preenchido contra essas chaves e devolve a tradução com os valores no lugar.

/** O que fazer quando a CLI da ferramenta não é achada (o texto vem de `commandNotFound`, em src/extension/cliResolve.ts). */
const INSTALL_HINTS: [pt: string, en: string][] = [
  [
    'Instale o Claude Code (https://claude.com/claude-code) ou a extensão dele no editor.',
    'Install Claude Code (https://claude.com/claude-code) or its editor extension.',
  ],
  [
    'Instale a CLI do Cursor (curl https://cursor.com/install -fsS | bash) e entre na conta com "cursor-agent login".',
    'Install the Cursor CLI (curl https://cursor.com/install -fsS | bash) and sign in with "cursor-agent login".',
  ],
  ['Instale a ferramenta.', 'Install the tool.'],
];

/** `commandNotFound` sozinho e dentro do aviso do chat; a dica de instalação varia por ferramenta, então cada uma vira uma chave. */
const commandNotFound: Record<string, string> = Object.fromEntries(
  INSTALL_HINTS.flatMap(([pt, en]) => {
    const ptText = `comando "{command}" não encontrado no PATH, nas pastas de instalação usuais nem nas extensões do editor. ${pt} Depois confira no terminal se "{command} --version" responde.`;
    const enText = `command "{command}" was not found in PATH, in the usual install folders or in the editor extensions. ${en} Then check in the terminal that "{command} --version" responds.`;
    return [
      [ptText, enText],
      [`Não foi possível executar o {tool}: ${ptText}`, `Could not run {tool}: ${enText}`],
    ];
  }),
);

/** Resposta de "Conectar IA": o servidor registrado e o próximo passo de cada ferramenta (o `next` de cada registro em clientConfig.ts). */
const NEXT_STEPS: [pt: string, en: string][] = [
  [
    'Claude Code: abra uma sessão nova em qualquer projeto com o board aberto (/mcp mostra o estado).',
    'Claude Code: open a new session in any project with the board open (/mcp shows its state).',
  ],
  [
    'Kimi Code: abra uma sessão nova em qualquer projeto com o board aberto.',
    'Kimi Code: open a new session in any project with the board open.',
  ],
  [
    'Cursor: se o "faz-ai" aparecer desligado em Cursor Settings → MCP, ligue.',
    'Cursor: if "faz-ai" shows as off in Cursor Settings → MCP, turn it on.',
  ],
];
const connectAI: Record<string, string> = Object.fromEntries(
  NEXT_STEPS.map(([pt, en]) => [`Servidor "faz-ai" registrado em: {files}. ${pt}`, `Server "faz-ai" registered in: {files}. ${en}`]),
);

/**
 * Avisos do board na conversa ao criar a branch (gitNoticeText, em src/shared/gitflow.ts). Ficam à parte porque a
 * conversa traduz os comentários do board só por estas chaves (translateGitNotice, em ../index.ts).
 */
export const gitNotices: Record<string, string> = {
  'A pasta da biblioteca não pode ser um link simbólico.': 'The library folder cannot be a symbolic link.',
  'Escolha uma pasta vazia ou a pasta desta biblioteca do board.': 'Choose an empty folder or this board library’s folder.',
  'Espere as execuções de IA terminarem antes de mudar a pasta da biblioteca.':
    'Wait for AI runs to finish before changing the library folder.',
  'Informe o caminho completo da pasta da biblioteca.': 'Enter the full path to the library folder.',
  'Não foi possível ler o artefato de origem. Releia as pastas e tente novamente.':
    'Could not read the source artifact. Refresh the folders and try again.',
  'Já existe um artefato "{name}" na biblioteca. Remova a cópia anterior antes de importar outra origem.':
    'An artifact "{name}" already exists in the library. Remove the previous copy before importing another source.',
  'Mais de uma origem para o artefato "{name}". Importe uma origem por vez.':
    'More than one source for artifact "{name}". Import one source at a time.',
  'Skill não encontrada na origem selecionada.': 'Skill not found in the selected source.',
  'Este artefato não tem uma origem para atualizar.': 'This artifact has no source to update from.',
  'A origem não está disponível. A cópia do board foi preservada.': 'The source is not available. The board copy was preserved.',
  'Arquivo fora da biblioteca do board.': 'File outside the board library.',

  'O repositório não tem origin: a branch {branch} partiu de {base} como está nesta máquina.':
    'The repository has no origin: branch {branch} started from {base} as it is on this machine.',
  'Não foi possível atualizar as refs do origin antes de criar a branch {branch} ({error}). Ela partiu de {base} como está nesta máquina, que pode estar desatualizada.':
    'Could not update the origin refs before creating branch {branch} ({error}). It started from {base} as it is on this machine, which may be out of date.',
  'A branch {develop} não existia: o board a criou a partir de {main} e a enviou ao origin.':
    'Branch {develop} did not exist: the board created it from {main} and pushed it to origin.',
  'A branch {develop} não existia: o board a criou a partir de {main}, mas não conseguiu enviá-la ao origin ({error}). Envie à mão: git push -u origin {develop}':
    'Branch {develop} did not exist: the board created it from {main}, but could not push it to origin ({error}). Push it by hand: git push -u origin {develop}',
  'A branch {develop} existe só nesta máquina: o pull request para ela só abre depois de enviá-la ao origin (git push -u origin {develop}).':
    'Branch {develop} exists only on this machine: the pull request to it can only be opened after pushing it to origin (git push -u origin {develop}).',
  'A branch {missing}, de onde a {branch} tinha partido, não existe mais nesta máquina nem no origin: a {branch} foi recriada a partir de {base}, que passa a ser a base do pull request.':
    'Branch {missing}, which {branch} had started from, no longer exists on this machine or on origin: {branch} was recreated from {base}, which becomes the pull request base.',

  // avisos da limpeza da história concluída (gitNotice, em src/shared/gitNotices.ts)
  'Limpeza da história depois do merge:': 'Story cleanup after the merge:',
  'pasta de trabalho {path} removida': 'work folder {path} removed',
  'branch local {branch} apagada': 'local branch {branch} deleted',
  'branch remota origin/{branch} apagada': 'remote branch origin/{branch} deleted',
  'branch remota origin/{branch} já tinha sido apagada': 'remote branch origin/{branch} had already been deleted',
  '{develop} local atualizada até origin/{develop}': 'local {develop} updated to origin/{develop}',
  '{develop} local já estava atualizada': 'local {develop} was already up to date',
  '**Aviso:** A {develop} local não foi atualizada: ela está aberta em {path}, e o board não mexe nos arquivos dessa pasta. Atualize lá com: git pull --ff-only origin {develop}':
    '**Warning:** Local {develop} was not updated: it is checked out in {path}, and the board does not touch the files in that folder. Update it there with: git pull --ff-only origin {develop}',
  '**Aviso:** A {develop} local não foi atualizada: ela tem {count} commit(s) que não estão em origin/{develop}, e o board não força a atualização. Envie esses commits num pull request ou descarte-os, e depois rode: git fetch origin {develop}:{develop}':
    '**Warning:** Local {develop} was not updated: it has {count} commit(s) that are not in origin/{develop}, and the board does not force the update. Send those commits in a pull request or discard them, then run: git fetch origin {develop}:{develop}',
  '**Aviso:** A {develop} local não foi atualizada: {error}. Atualize com: git fetch origin {develop}:{develop}':
    '**Warning:** Local {develop} was not updated: {error}. Update it with: git fetch origin {develop}:{develop}',
  '**Aviso:** A limpeza não apagou nada: a pasta de trabalho {path} tem mudanças não commitadas ({files}). A worktree, a branch local {branch} e a remota continuam. Para não perder essas mudanças, faça o commit e envie-as num pull request novo, ou copie os arquivos. Atenção: como a história já foi entregue, a limpeza de branches e worktrees órfãs vai descartar essas mudanças pendentes depois.':
    '**Warning:** The cleanup deleted nothing: the work folder {path} has uncommitted changes ({files}). The worktree, the local branch {branch} and the remote one are kept. To keep these changes, commit them and send them in a new pull request, or copy the files. Note: since the story was delivered, the cleanup of orphan branches and worktrees will later discard these pending changes.',
  '**Aviso:** A limpeza não apagou nada: a pasta de trabalho {path} tem mudanças não commitadas ({files} e mais {n}). A worktree, a branch local {branch} e a remota continuam. Para não perder essas mudanças, faça o commit e envie-as num pull request novo, ou copie os arquivos. Atenção: como a história já foi entregue, a limpeza de branches e worktrees órfãs vai descartar essas mudanças pendentes depois.':
    '**Warning:** The cleanup deleted nothing: the work folder {path} has uncommitted changes ({files} and {n} more). The worktree, the local branch {branch} and the remote one are kept. To keep these changes, commit them and send them in a new pull request, or copy the files. Note: since the story was delivered, the cleanup of orphan branches and worktrees will later discard these pending changes.',
  '**Aviso:** A limpeza não apagou nada: a branch local {branch} tem {count} commit(s) que não estão no pull request {pr}. A worktree {path} e as branches local e remota continuam. Envie esses commits num pull request novo. Atenção: como a história já foi entregue, a limpeza de branches e worktrees órfãs vai descartar esses commits depois.':
    '**Warning:** The cleanup deleted nothing: the local branch {branch} has {count} commit(s) that are not in the pull request {pr}. The worktree {path} and the local and remote branches are kept. Send those commits in a new pull request. Note: since the story was delivered, the cleanup of orphan branches and worktrees will later discard these commits.',
  '**Aviso:** A branch local {branch} não foi apagada: a pasta do projeto ({path}) está nela, e o board não troca a branch da sua pasta. Troque de branch (por exemplo, git switch {develop}) e apague-a com: git branch -D {branch}':
    "**Warning:** The local branch {branch} was not deleted: the project folder ({path}) is on it, and the board does not switch your folder's branch. Switch branches (for example, git switch {develop}) and delete it with: git branch -D {branch}",
  '**Aviso:** A branch local {branch} não foi apagada: ela está aberta em {path}. Feche essa pasta ou troque a branch dela e apague com: git branch -D {branch}':
    '**Warning:** The local branch {branch} was not deleted: it is checked out in {path}. Close that folder or switch its branch, then delete it with: git branch -D {branch}',
  '**Aviso:** A pasta de trabalho {path} não foi removida: {error}. A branch local {branch} ficou porque a pasta ainda a usa. Remova com: git worktree remove {path}':
    '**Warning:** The work folder {path} was not removed: {error}. The local branch {branch} was kept because the folder still uses it. Remove it with: git worktree remove {path}',
  '**Aviso:** A branch local {branch} não foi apagada: {error}. Apague com: git branch -D {branch}':
    '**Warning:** The local branch {branch} was not deleted: {error}. Delete it with: git branch -D {branch}',
  '**Aviso:** A branch remota origin/{branch} não foi apagada: {error}. Apague com: git push origin --delete {branch}':
    '**Warning:** The remote branch origin/{branch} was not deleted: {error}. Delete it with: git push origin --delete {branch}',
  '**Aviso:** A branch remota origin/{branch} não foi apagada: ela recebeu commits depois do pull request {pr}. Confira e, se não precisar deles, apague com: git push origin --delete {branch}':
    "**Warning:** The remote branch origin/{branch} was not deleted: it received commits after the pull request {pr}. Check them and, if you don't need them, delete it with: git push origin --delete {branch}",
  '**Aviso:** A limpeza não apagou nada: o pull request {pr} é da branch {head}, e a branch registrada no card é {branch}.':
    '**Warning:** The cleanup deleted nothing: the pull request {pr} is from branch {head}, and the branch recorded on the card is {branch}.',
  '**Aviso:** A limpeza não apagou nada: não foi possível confirmar o pull request {pr} pelo gh ({error}).':
    '**Warning:** The cleanup deleted nothing: the pull request {pr} could not be confirmed through gh ({error}).',
  '**Aviso:** O repositório não tem o remoto origin: a branch remota e a {develop} não foram tocadas.':
    '**Warning:** The repository has no origin remote: the remote branch and {develop} were not touched.',

  // pilha e volta da principal no hotfix (#480)
  '**Aviso:** A branch remota origin/{branch} não foi apagada: o pull request {nextPr} da história #{number} ainda a usa como base. Troque a base dele (gh pr edit {nextPr} --base {base}) e apague com: git push origin --delete {branch}':
    '**Warning:** The remote branch origin/{branch} was not deleted: the pull request {nextPr} of story #{number} still uses it as its base. Change its base (gh pr edit {nextPr} --base {base}) and delete it with: git push origin --delete {branch}',
  'A história #{prev}, sobre a qual esta estava empilhada, foi concluída: a base desta história passou de {old} para {base}. Antes de continuar, traga a nova base para a branch (git fetch origin {base} e git merge origin/{base}), sem rebase nem push forçado.':
    "Story #{prev}, which this one was stacked on, was completed: this story's base changed from {old} to {base}. Before continuing, bring the new base into the branch (git fetch origin {base} and git merge origin/{base}), without rebase or force push.",
  'A base do pull request {pr} também passou para {base}.': 'The base of the pull request {pr} also changed to {base}.',
  '**Aviso:** a base do pull request {pr} não foi trocada: {error}. Troque com: gh pr edit {pr} --base {base}':
    '**Warning:** the base of the pull request {pr} was not changed: {error}. Change it with: gh pr edit {pr} --base {base}',
  'A {main} voltou para a {develop} pelo pull request {url}, com merge commit.':
    '{main} was merged back into {develop} through the pull request {url}, with a merge commit.',
  'A {develop} já contém a {main}: não foi preciso abrir o pull request de volta.':
    '{develop} already contains {main}: no back-merge pull request was needed.',
  '**Aviso:** O pull request {url} da {main} para a {develop} tem conflito e ficou aberto. O board não resolve conflitos: resolva-o no GitHub ou localmente e faça o merge com merge commit (gh pr merge {url} --merge).':
    '**Warning:** The pull request {url} from {main} to {develop} has a conflict and was left open. The board does not resolve conflicts: resolve it on GitHub or locally and merge it with a merge commit (gh pr merge {url} --merge).',
  '**Aviso:** O pull request {url} da {main} para a {develop} ficou aberto: {error}. Faça o merge com merge commit: gh pr merge {url} --merge':
    '**Warning:** The pull request {url} from {main} to {develop} was left open: {error}. Merge it with a merge commit: gh pr merge {url} --merge',
  '**Aviso:** O pull request da {main} para a {develop} não foi aberto: {error}. Abra com: gh pr create --base {develop} --head {main}':
    '**Warning:** The pull request from {main} to {develop} was not opened: {error}. Open it with: gh pr create --base {develop} --head {main}',
  'Volta da {main} para a {develop} depois do hotfix #{number}': 'Merge {main} back into {develop} after hotfix #{number}',
  'Aberto pelo Faz AI depois do merge de {pr}. Faça o merge com merge commit, não com squash: a {develop} precisa conter os commits da {main}.':
    "Opened by Faz AI after {pr} was merged. Merge it with a merge commit, not squash: {develop} must contain {main}'s commits.",
  // release a partir da principal depois do hotfix
  'Release {tag} criada a partir da {main} ({url}). Se o projeto publica numa loja, a publicação segue o processo de release dele.':
    "Release {tag} created from {main} ({url}). If the project publishes to a store, publishing follows the project's release process.",
  'A {main} já tem a release {tag} sobre o commit do hotfix: nada a criar.':
    '{main} already has the release {tag} on the hotfix commit: nothing to create.',
  '**Aviso:** A release não foi criada: a versão do package.json na {main} ({version}) já tem a tag {tag}. Suba a versão e gere a release a partir da {main} pelo processo do projeto.':
    "**Warning:** The release was not created: the package.json version on {main} ({version}) already has the tag {tag}. Bump the version and create the release from {main} with the project's release process.",
  '**Aviso:** A release não foi criada: a {main} não tem package.json nem tag de versão (vX.Y.Z) de onde tirar a próxima. Crie com: gh release create <versão> --target {main} --generate-notes':
    '**Warning:** The release was not created: {main} has neither a package.json nor a version tag (vX.Y.Z) to derive the next one from. Create it with: gh release create <version> --target {main} --generate-notes',
  '**Aviso:** A release {tag} não foi criada: {error}. Crie com: gh release create {tag} --target {sha} --title {tag} --generate-notes':
    '**Warning:** The release {tag} was not created: {error}. Create it with: gh release create {tag} --target {sha} --title {tag} --generate-notes',
};

export const host: Record<string, string> = {
  'O perfil resolvido não corresponde ao alvo solicitado.': 'The resolved profile does not match the requested target.',
  'A admissão não corresponde ao perfil solicitado.': 'Admission does not match the requested profile.',
  'O perfil precisa de executável direto, sem shell.': 'The profile requires a direct executable without a shell.',
  'Perfil pronto inválido.': 'Invalid builtin profile.',

  'Este perfil fornece apenas texto; consumo desconhecido.': 'This profile returns text only; usage is unknown.',
  'Perfis configuráveis exigem contrato e admissão por capacidades.': 'Configurable profiles require a contract and capability admission.',
  'Perfil genérico sem tradução do contrato neutro.': 'Generic profile has no neutral contract mapping.',
  'O perfil não declara argumentos para esta permissão restrita.': 'The profile declares no arguments for this restricted permission.',
  'O perfil personalizado de CLI não roda cards: o board não consegue provar o que ele acessa. Use um agente do catálogo pelo Conectar, em Configurações › Conectar agentes.':
    'A custom CLI profile does not run cards: the board cannot prove what it accesses. Use a catalog agent through Connect, in Settings › Connect agents.',
  'Arquivo MCP do perfil precisa ser relativo ao projeto.': 'The profile MCP file must be relative to the project.',

  'Perfil desativado ou pendente de revisão.': 'Profile disabled or pending review.',
  'Perfis executáveis exigem revisão humana.': 'Executable profiles require human review.',
  'Os perfis prontos não são editados: duplique para mudar.': 'Builtin profiles cannot be edited: duplicate one to change it.',
  'Os perfis prontos não são apagados: desligue.': 'Builtin profiles cannot be deleted: disable them instead.',
  'O perfil personalizado novo é só de CLI. Para um agente ACP, conecte o agente do catálogo em Conectar agentes.':
    'A new custom profile is CLI only. For an ACP agent, connect the catalog agent in Connect agents.',
  'Nome do perfil inválido.': 'Invalid profile name.',
  'Tipo ou base do perfil inválido.': 'Invalid profile type or base.',
  'Posição ou estado do perfil inválido.': 'Invalid profile position or state.',
  'Configuração do perfil inválida.': 'Invalid profile configuration.',
  'Informe o comando do perfil personalizado.': 'Enter the custom profile command.',
  'Agente ACP inválido.': 'Invalid ACP agent.',
  'Informe o arquivo MCP do projeto.': 'Enter the project MCP file.',
  'Estado do perfil inválido.': 'Invalid profile state.',
  'O tipo e a base do perfil não são alterados: crie outro perfil.': 'The profile type and base cannot be changed: create another profile.',
  'Forneça uma configuração revisada para este perfil.': 'Provide a reviewed configuration for this profile.',
  'Escolha outro perfil padrão antes de desligar este.': 'Choose another default profile before disabling this one.',
  'Escolha outro perfil padrão antes de apagar este.': 'Choose another default profile before deleting this one.',
  'Revise o perfil importado antes de ligar.': 'Review the imported profile before enabling it.',
  'Perfil indisponível neste board.': 'Profile unavailable on this board.',
  'Já existe um teste em curso para este perfil.': 'A test is already running for this profile.',
  'Teste excedeu dois minutos.': 'The test exceeded two minutes.',
  'O teste não terminou com sucesso.': 'The test did not finish successfully.',
  'Situação dos perfis indisponível neste host.': 'Profile status is unavailable on this host.',
  'Teste de perfil indisponível neste host.': 'Profile testing is unavailable on this host.',
  'Configuração local do perfil indisponível.': 'Local profile configuration is unavailable.',
  'Perfil de CLI ainda não disponível para execução.': 'CLI profile is not available for execution yet.',
  'Board "{name}" importado: {cards} card(s) e {attachments} anexo(s). Perfis desativados para revisão local: {profiles}.':
    'Board "{name}" imported: {cards} card(s) and {attachments} attachment(s). Profiles disabled for local review: {profiles}.',
  'Board "{name}" importado: {cards} card(s) e {attachments} anexo(s). Revise as configurações locais dos servidores MCP: {secrets}. Perfis desativados para revisão local: {profiles}.':
    'Board "{name}" imported: {cards} card(s) and {attachments} attachment(s). Review the local MCP server configurations: {secrets}. Profiles disabled for local review: {profiles}.',
  'Board "{name}" importado: {cards} card(s) e {attachments} anexo(s). Anexos sem arquivo: {missing}. Perfis desativados para revisão local: {profiles}.':
    'Board "{name}" imported: {cards} card(s) and {attachments} attachment(s). Attachments without a file: {missing}. Profiles disabled for local review: {profiles}.',
  'Board "{name}" importado: {cards} card(s) e {attachments} anexo(s). Anexos sem arquivo: {missing}. Revise as configurações locais dos servidores MCP: {secrets}. Perfis desativados para revisão local: {profiles}.':
    'Board "{name}" imported: {cards} card(s) and {attachments} attachment(s). Attachments without a file: {missing}. Review the local MCP server configurations: {secrets}. Profiles disabled for local review: {profiles}.',
  'Política de execução inválida ou versão não suportada.': 'Invalid execution policy or unsupported version.',
  'Snapshot de políticas inválido.': 'Invalid policy snapshot.',
  'Versão de política inválida.': 'Invalid policy version.',
  'Identidade de política repetida.': 'Duplicate policy identity.',
  'Políticas executáveis exigem revisão humana.': 'Executable policies require human review.',
  'Revisão de política inválida.': 'Invalid policy revision.',
  'Política indisponível neste board.': 'Policy unavailable on this board.',
  'A política mudou. Releia antes de salvar.': 'The policy changed. Read it again before saving.',
  'Destino da política inválido ou indisponível no catálogo.': 'Policy target is invalid or unavailable in the catalog.',
  'Esta regra fecha um ciclo com {rules}: o card voltaria a um modelo que já falhou. Tire esse destino de uma das regras.':
    'This rule closes a cycle with {rules}: the card would go back to a model that already failed. Remove that target from one of the rules.',
  'Esta regra empata na prioridade com {rules}, e as duas valem para o mesmo caso. Mude a ordem na lista.':
    'This rule ties on priority with {rules}, and both apply to the same case. Change the order in the list.',
  'A regra {rule} tem um destino fora do catálogo.': 'The {rule} rule has a target outside the catalog.',
  'Histórico de política incompleto ou fora do board.': 'Policy history is incomplete or outside the board.',
  'Versão atual diverge do histórico da política.': 'The current version differs from policy history.',
  'Histórico de política fora do board.': 'Policy history is outside the board.',

  'Revise as configurações locais dos servidores MCP: {secrets}.': 'Review the local MCP server configurations: {secrets}.',

  'Configurações MCP não são devolvidas ao editor. Use a biblioteca para salvar uma nova definição.':
    'MCP configurations are not returned to the editor. Use the library to save a new definition.',
  'Configurações e credenciais MCP exigem revisão humana.': 'MCP configurations and credentials require human review.',
  'Este MCP exige revisão humana ou configuração local antes de executar.':
    'This MCP requires human review or local configuration before execution.',
  'MCPs exigem revisão humana ou configuração local: {names}.': 'MCPs require human review or local configuration: {names}.',
  'Referências salvas não podem ser substituídas pelo editor.': 'Saved references cannot be replaced by the editor.',
  'Referência de credencial fora deste artefato.': 'The credential reference does not belong to this artifact.',
  'Definição MCP importada inválida.': 'Invalid imported MCP definition.',
  'Definição MCP legada inválida; valores originais preservados.': 'Invalid legacy MCP definition; original values have been preserved.',
  'Arquivo de credenciais sem proteção local adequada.': 'The credentials file lacks adequate local protection.',
  'Pasta de credenciais sem proteção local adequada.': 'The credentials folder lacks adequate local protection.',
  'Chave local de credenciais inválida.': 'Invalid local credentials key.',

  'A reconciliação da abertura precisa terminar antes de executar.': 'Startup reconciliation must finish before running.',
  'A unidade foi cancelada antes de liberar a execução.': 'The work unit was cancelled before releasing the run.',
  'A história mudou de fase ou foi encerrada antes de liberar a execução.': 'The story changed phase or ended before releasing the run.',
  'A unidade ou a pasta já está reservada.': 'The work unit or workspace is already reserved.',
  'A pasta já tem outro escritor ou aguarda reconciliação.': 'The workspace already has another writer or is awaiting reconciliation.',
  'A tentativa precisa estar vinculada ao log antes de iniciar.': 'The attempt must be linked to the log before starting.',
  'Não foi possível preparar ou iniciar a execução; confira o ambiente antes de tentar de novo.':
    'The run could not be prepared or started; check the environment before trying again.',
  'Não foi possível reservar a pasta antes de executar.': 'The workspace could not be reserved before running.',
  'A unidade não iniciou: {reason}': 'The work unit did not start: {reason}',
  'A unidade viva ainda reserva a pasta.': 'The live work unit still reserves the workspace.',
  'Esta execução foi encerrada pelo board; nada foi alterado.': 'This run was ended by the board; nothing was changed.',
  'A unidade exige token e identidade de trabalho juntos.': 'The work unit requires both a token and a work identity.',
  'A unidade não pertence ao card desta execução.': 'The work unit does not belong to this run’s card.',
  'A execução controlada exige a ponte MCP do board.': 'A managed run requires the board MCP bridge.',
  'O token não pertence à unidade desta execução.': 'The token does not belong to this run’s work unit.',
  'Snapshot incompatível com a sessão MCP.': 'The snapshot is incompatible with the MCP session.',
  'Snapshot obrigatório da execução indisponível.': 'The required run snapshot is unavailable.',
  'Operação MCP fora do contrato desta execução.': 'The MCP operation is outside this run’s contract.',
  'Card fora do escopo desta execução.': 'The card is outside this run’s scope.',
  'Servidor MCP fora do snapshot desta execução.': 'The MCP server is outside this run’s snapshot.',
  'Método fora da sessão MCP.': 'The method is outside the MCP session.',
  'Artefatos externos não pertencem ao snapshot desta execução.': 'External artifacts do not belong to this run’s snapshot.',
  'O snapshot da execução é somente leitura.': 'The run snapshot is read-only.',
  'Configuração global fora do escopo desta execução.': 'Global configuration is outside this run’s scope.',
  'O board está executando #{number}; acompanhe pelo get_card.': 'The board is executing #{number}; follow its progress through get_card.',
  'O board executa as sub-tarefas desta fase; a sessão da história apenas as planeja.':
    'The board executes this phase’s subtasks; the story session only plans them.',

  'O índice da biblioteca está inválido. Os arquivos foram preservados.': 'The library index is invalid. The files were preserved.',
  'Caminho inválido dentro da skill.': 'Invalid path inside the skill.',
  'O arquivo ultrapassa os limites da biblioteca.': 'The file exceeds the library limits.',
  ...commandNotFound,
  ...connectAI,
  'A linha de comando "{command}" não foi encontrada. Rode no terminal: {manual}':
    'The "{command}" command line was not found. Run in the terminal: {manual}',
  '"{command}" não conseguiu registrar o servidor ({reason}). Rode no terminal: {manual}':
    '"{command}" could not register the server ({reason}). Run in the terminal: {manual}',

  // cartões, colunas, workflows e boards (repositórios e telas)
  'Card não encontrado': 'Card not found',
  'Card não encontrado.': 'Card not found.',
  'Este card não tem perguntas pendentes.': 'This card has no pending questions.',
  'As perguntas deste card mudaram: confira as novas antes de enviar.':
    'The questions on this card have changed: review the new ones before sending.',
  'Card pai não encontrado': 'Parent card not found',
  'Coluna não encontrada': 'Column not found',
  'Coluna de destino inválida': 'Invalid destination column',
  'Board não encontrado': 'Board not found',
  'Workflow não encontrado': 'Workflow not found',
  'Sub-tarefa precisa de um card pai': 'A sub-task needs a parent card',
  'Card de história não pode ter pai': 'A story card cannot have a parent',
  'Não é possível mover entre workflows': 'Cannot move between workflows',
  'Não é possível concluir "{title}": {open} sub-tarefa(s) ainda em aberto.': 'Cannot complete "{title}": {open} sub-task(s) still open.',
  'Não é possível avançar "{title}": {pending} sub-tarefa(s) da fase {phase} ainda em aberto.':
    'Cannot advance "{title}": {pending} sub-task(s) of phase {phase} still open.',
  '"{title}" só sai de {column} com a aprovação de uma pessoa. Peça a revisão com request_review e pare; quando o status for "approved", mova o card.':
    '"{title}" only leaves {column} with a person\'s approval. Request a review with request_review and stop; when the status is "approved", move the card.',
  'Restaure a história pai primeiro': 'Restore the parent story first',
  'Desarquive a história pai primeiro': 'Unarchive the parent story first',
  'Um workflow precisa de ao menos uma coluna': 'A workflow needs at least one column',
  'Tipo em uso por {n} card(s)': 'Type in use by {n} card(s)',
  'O board precisa de ao menos um workflow': 'The board needs at least one workflow',
  'O workflow tem {cards} card(s), inclusive arquivados e na lixeira':
    'The workflow has {cards} card(s), including archived and trashed ones',
  '{types} tipo(s) de card nascem neste workflow': '{types} card type(s) are created in this workflow',
  // campos do board (src/shared/boardFields.ts)
  '"{name}" é o nome de um campo do board; escolha outro nome.': '"{name}" is the name of a board field; choose another name.',
  'O campo de modelo de IA é só um, o "Modelo" do board.': 'There is only one AI model field, the board\'s "Modelo".',
  'O campo "{name}" é do board e não pode ser apagado: as regras e a IA dependem dele.':
    'The "{name}" field belongs to the board and cannot be deleted: the rules and the AI depend on it.',
  'O campo "{name}" é do board e não pode ser renomeado: as regras e a IA o encontram pelo nome.':
    'The "{name}" field belongs to the board and cannot be renamed: the rules and the AI find it by its name.',
  'As opções do campo "{name}" são mantidas pelo board.': 'The options of the "{name}" field are kept by the board.',
  'Os tipos de card do campo "{name}" são mantidos pelo board.': 'The card types of the "{name}" field are kept by the board.',
  'O campo "{name}" é preenchido pelo board e pela IA, não à mão.': 'The "{name}" field is filled in by the board and the AI, not by hand.',
  'O campo "{name}" não tem valor padrão por tipo: o board o preenche em cada card.':
    'The "{name}" field has no default value per type: the board fills it in on each card.',
  'Migration {n} não encontrada': 'Migration {n} not found',

  // vínculos entre cards
  'Um card não pode se vincular a ele mesmo.': 'A card cannot link to itself.',
  'Estes cards já estão vinculados. Remova o vínculo antes de criar outro.':
    'These cards are already linked. Remove the link before creating another.',
  'O vínculo criaria um ciclo: um card dependeria dele mesmo.': 'The link would create a cycle: a card would depend on itself.',
  'O vínculo criaria um ciclo: o pai já é filho deste card.': 'The link would create a cycle: the parent is already a child of this card.',

  // status, aprovação e ações do card
  'Só uma pessoa pode aprovar um card.': 'Only a person can approve a card.',
  'Informe o motivo do bloqueio.': 'Enter the reason for the block.',
  'Anexo maior que 20 MB': 'Attachment larger than 20 MB',
  'Anexo não encontrado': 'Attachment not found',
  'Esta história ainda não tem pasta de trabalho.': 'This story does not have a working folder yet.',
  'Arquivo fora do harness.': 'File outside the harness.',
  'Arquivo maior que 512 KB: abra no editor.': 'File larger than 512 KB: open it in the editor.',

  // backup do board (exportar e importar)
  'Board exportado em {path}. O arquivo contém conversas e anexos: guarde-o com cuidado.':
    'Board exported to {path}. The file contains conversations and attachments: keep it safe.',
  'Board exportado em {path}. Anexos sem arquivo: {cards}. O arquivo contém conversas e anexos: guarde-o com cuidado.':
    'Board exported to {path}. Attachments without a file: {cards}. The file contains conversations and attachments: keep it safe.',
  'Board "{name}" importado: {cards} card(s) e {attachments} anexo(s).':
    'Board "{name}" imported: {cards} card(s) and {attachments} attachment(s).',
  'Board "{name}" importado: {cards} card(s) e {attachments} anexo(s). Anexos sem arquivo: {missing}.':
    'Board "{name}" imported: {cards} card(s) and {attachments} attachment(s). Attachments without a file: {missing}.',
  'Board "{name}" importado: {cards} card(s) e {attachments} anexo(s). Revise as configurações locais dos servidores MCP: {secrets}.':
    'Board "{name}" imported: {cards} card(s) and {attachments} attachment(s). Review the local MCP server configurations: {secrets}.',
  'Board "{name}" importado: {cards} card(s) e {attachments} anexo(s). Anexos sem arquivo: {missing}. Revise as configurações locais dos servidores MCP: {secrets}.':
    'Board "{name}" imported: {cards} card(s) and {attachments} attachment(s). Attachments without a file: {missing}. Review the local MCP server configurations: {secrets}.',
  'Board "{name}" importado: {cards} card(s) e {attachments} anexo(s). Preencha os valores vazios dos servidores MCP: {secrets}.':
    'Board "{name}" imported: {cards} card(s) and {attachments} attachment(s). Fill in the empty values of the MCP servers: {secrets}.',
  'Board "{name}" importado: {cards} card(s) e {attachments} anexo(s). Anexos sem arquivo: {missing}. Preencha os valores vazios dos servidores MCP: {secrets}.':
    'Board "{name}" imported: {cards} card(s) and {attachments} attachment(s). Attachments without a file: {missing}. Fill in the empty values of the MCP servers: {secrets}.',
  'Espere a execução da IA terminar para importar o board.': 'Wait for the AI run to finish before importing the board.',
  'O arquivo é grande demais para enviar (limite de 200 MB).': 'The file is too large to send (200 MB limit).',
  'Não foi possível ler o arquivo.': 'Could not read the file.',
  'Importação expirada: escolha o arquivo de novo.': 'Import expired: choose the file again.',
  'Este board já foi importado em outra pasta que usa o mesmo banco.':
    'This board was already imported into another folder that uses the same database.',
  'Anexo "{name}" com conteúdo inválido no arquivo.': 'Attachment "{name}" has invalid content in the file.',
  'Este arquivo foi gerado por uma versão mais nova do Faz AI (formato {version}). Atualize a extensão.':
    'This file was generated by a newer version of Faz AI (format {version}). Update the extension.',
  'Este arquivo precisa do Faz AI {version} ou superior (banco versão {schema}). Atualize a extensão.':
    'This file needs Faz AI {version} or later (database version {schema}). Update the extension.',
  'Arquivo não é um export do Faz AI: o conteúdo não é um JSON válido.': 'The file is not a Faz AI export: the content is not valid JSON.',
  'Arquivo não é um export do Faz AI: o conteúdo não é um objeto JSON.':
    'The file is not a Faz AI export: the content is not a JSON object.',
  'Arquivo não é um export do Faz AI: falta o marcador "board-export".':
    'The file is not a Faz AI export: the "board-export" marker is missing.',
  'Arquivo não é um export do Faz AI: a versão do formato é inválida.': 'The file is not a Faz AI export: the format version is invalid.',
  'Arquivo não é um export do Faz AI: a versão do banco é inválida.': 'The file is not a Faz AI export: the database version is invalid.',
  'Arquivo não é um export do Faz AI: faltam os dados do board.': 'The file is not a Faz AI export: the board data is missing.',
  'Arquivo não é um export do Faz AI: o board não tem nome.': 'The file is not a Faz AI export: the board has no name.',
  'Arquivo não é um export do Faz AI: faltam as tabelas.': 'The file is not a Faz AI export: the tables are missing.',
  'Arquivo não é um export do Faz AI: falta a tabela "{table}".': 'The file is not a Faz AI export: the "{table}" table is missing.',
  'Arquivo não é um export do Faz AI: linha inválida em "{table}".': 'The file is not a Faz AI export: invalid row in "{table}".',
  'Arquivo não é um export do Faz AI: linha sem id em "{table}".': 'The file is not a Faz AI export: row without id in "{table}".',
  'Arquivo não é um export do Faz AI: falta a lista de arquivos dos anexos.':
    'The file is not a Faz AI export: the attachment file list is missing.',
  'Arquivo não é um export do Faz AI: item inválido na lista de arquivos dos anexos.':
    'The file is not a Faz AI export: invalid item in the attachment file list.',
  'Arquivo não é um export do Faz AI: conteúdo de anexo inválido.': 'The file is not a Faz AI export: invalid attachment content.',
  'Arquivo não é um export do Faz AI: a tabela "{table}" não existe no banco versão {schema}.':
    'The file is not a Faz AI export: the "{table}" table does not exist in database version {schema}.',
  'Arquivo não é um export do Faz AI: nome de skill ou agente inválido.': 'The file is not a Faz AI export: invalid skill or agent name.',
  'Arquivo não é um export do Faz AI: caminho de arquivo de apoio inválido.':
    'The file is not a Faz AI export: invalid supporting file path.',
  'O chat não está disponível neste board.': 'Chat is not available on this board.',

  // modelos e esforço
  'O board não tem o campo "{field}".': 'The board has no "{field}" field.',
  'O modelo "{model}" não aceita o esforço "{effort}". Aceitos: {accepted}.':
    'The model "{model}" does not accept the effort "{effort}". Accepted: {accepted}.',
  'Modelo "{text}" não está no catálogo. Disponíveis: {available}.': 'Model "{text}" is not in the catalog. Available: {available}.',
  nenhum: 'none',
  '(sem condições)': '(no conditions)',
  '(campo apagado)': '(deleted field)',

  // branches e worktrees das histórias
  'A criação de branches está desligada neste board (Configurações → Git).':
    'Branch creation is turned off on this board (Settings → Git).',
  'Informe o endereço (URL) do pull request.': 'Enter the pull request address (URL).',
  'A pasta do projeto não é um repositório git.': 'The project folder is not a git repository.',
  'O repositório ainda não tem nenhum commit: faça o primeiro commit antes de criar branches de histórias.':
    'The repository has no commits yet: make the first commit before creating story branches.',
  'A pasta {dir} já existe e não é uma worktree deste repositório.':
    'The folder {dir} already exists and is not a worktree of this repository.',
  'Não foi possível atualizar as refs do origin ({error}) e a branch {develop} não existe nesta máquina: sem saber se ela já existe no origin, o board não a cria nem a envia. Verifique a rede e as credenciais do git (git fetch origin no terminal) e tente de novo.':
    'Could not update the origin refs ({error}) and branch {develop} does not exist on this machine: without knowing whether it already exists on origin, the board neither creates nor pushes it. Check the network and the git credentials (git fetch origin in the terminal) and try again.',
  'Não foi possível saber qual é a branch principal (o origin não informa a dele e não há main nem master), e a branch {develop} não existe: o board não a cria a partir da branch atual ({current}). Rode git remote set-head origin -a e tente de novo.':
    'Could not tell which branch is the main one (origin does not report its own and there is no main or master), and branch {develop} does not exist: the board does not create it from the current branch ({current}). Run git remote set-head origin -a and try again.',
  'Não foi possível saber qual é a branch principal (não há origin, main nem master), e a branch {develop} não existe: o board não a cria a partir da branch atual ({current}). Crie a {develop} à mão a partir da principal (git branch {develop} <principal>) e tente de novo.':
    'Could not tell which branch is the main one (there is no origin, main or master), and branch {develop} does not exist: the board does not create it from the current branch ({current}). Create {develop} by hand from the main branch (git branch {develop} <main>) and try again.',
  'o comando "gh" (GitHub CLI) não foi encontrado.': 'the "gh" command (GitHub CLI) was not found.',

  // execução pela IA e chat
  'A IA ainda está respondendo. Espere ou interrompa.': 'The AI is still replying. Wait or stop it.',
  'A IA já está trabalhando em {ref}.': 'The AI is already working on {ref}.',
  'Não dá para renomear a branch agora: a IA está executando {refs}. Espere terminar e tente de novo.':
    'Cannot rename the branch now: the AI is running {refs}. Wait for it to finish and try again.',
  'Não dá para renomear a branch agora: há uma execução da IA em andamento. Espere terminar e tente de novo.':
    'Cannot rename the branch now: an AI run is in progress. Wait for it to finish and try again.',
  'Não há renomeação de branch à espera de confirmação.': 'There is no branch rename waiting for confirmation.',
  'Há uma renomeação de branch à espera de resposta (Renomear ou Desfazer): responda antes de criar a branch da história.':
    'A branch rename is waiting for an answer (Rename or Undo): answer it before creating the story branch.',
  'Interrompido.': 'Stopped.',
  'A resposta passou do tempo limite ({minutes} min) e foi encerrada.': 'The reply exceeded the time limit ({minutes} min) and was ended.',
  'Não foi possível executar o {tool}: {reason}': 'Could not run {tool}: {reason}',
  'O {tool} terminou com erro (código {code}).': '{tool} finished with an error (code {code}).',
  'Não foi possível conferir os requisitos do board: {error}': 'Could not check the board requirements: {error}',
  'Não foi possível rodar o Diagnóstico do ambiente: {error}': 'Could not run the environment Diagnosis: {error}',
  'O {tool} terminou com erro (código {code}).\n\n{tail}': '{tool} finished with an error (code {code}).\n\n{tail}',
  'A IA terminou sem escrever uma resposta.': 'The AI finished without writing a reply.',
  'O agente restringe os servidores MCP, mas o servidor do board não está registrado para o Claude Code nesta pasta. Instale o servidor em Configurações → Harness → Tudo que a ferramenta carrega → Claude Code → Servidores MCP.':
    'The agent restricts MCP servers, but the board server is not registered for Claude Code in this folder. Install the server in Settings → Harness → Everything the tool loads → Claude Code → MCP servers.',
  'Servidores MCP do agente não encontrados na configuração do Claude Code: {servers}.':
    "The agent's MCP servers were not found in the Claude Code configuration: {servers}.",

  // webview no navegador
  'O arquivo é grande demais para enviar (limite de 20 MB).': 'The file is too large to upload (20 MB limit).',
  'O acesso a este board expirou. Abra o board de novo pelo editor ou pelo terminal.':
    'Access to this board has expired. Reopen the board from the editor or the terminal.',
  '"{name}" tem mais de 20 MB e não foi anexado.': '"{name}" is larger than 20 MB and was not attached.',

  // harness: arquivos de regras, skills, agentes, hooks, permissões e servidores MCP
  'Nenhuma pasta de projeto aberta.': 'No project folder is open.',
  'Nenhuma origem de skills carregada. Procure de novo.': 'No skills source loaded. Search again.',
  'Nome de skill inválido: use letras minúsculas, números e hífens (ex.: "revisar-spec").':
    'Invalid skill name: use lowercase letters, numbers and hyphens (e.g. "review-spec").',
  'Nome de agente inválido: use letras minúsculas, números e hífens (ex.: "revisor-de-spec").':
    'Invalid agent name: use lowercase letters, numbers and hyphens (e.g. "spec-reviewer").',
  'Nome inválido: use letras, números, hífen, ponto ou sublinhado.': 'Invalid name: use letters, numbers, hyphen, dot or underscore.',
  'O agente precisa de uma descrição: é por ela que a IA decide quando delegar a ele.':
    'The agent needs a description: it is how the AI decides when to delegate to it.',
  'Já existe uma skill "{name}".': 'A skill "{name}" already exists.',
  'Já existe uma skill "{name}" ligada.': 'An enabled skill "{name}" already exists.',
  'Já existe uma skill "{name}" desligada.': 'A disabled skill "{name}" already exists.',
  'Já existe uma skill "{name}" em {path}.': 'A skill "{name}" already exists in {path}.',
  'Já existe uma skill "{name}" no destino.': 'A skill "{name}" already exists at the destination.',
  'Já existe um agente "{name}".': 'An agent "{name}" already exists.',
  'Skill "{name}" não encontrada.': 'Skill "{name}" not found.',
  'Agente "{name}" não encontrado.': 'Agent "{name}" not found.',
  'Informe o comando do hook.': 'Enter the hook command.',
  'Hook não encontrado no arquivo. Atualize a lista e tente de novo.': 'Hook not found in the file. Refresh the list and try again.',

  // instalação de skills
  'Informe uma pasta ou o endereço de um repositório git.': 'Enter a folder or the address of a git repository.',
  'Pasta não encontrada: {source}': 'Folder not found: {source}',
  'Origem não reconhecida. Use o caminho completo de uma pasta, "dono/repositorio" do GitHub ou um endereço https ou ssh de um repositório git.':
    'Source not recognized. Use the full path of a folder, "owner/repository" from GitHub or an https or ssh address of a git repository.',
  'Não foi possível clonar {url}: {reason}': 'Could not clone {url}: {reason}',

  'Nome de regra inválido: use letras minúsculas, números e hífens, com .md opcional.':
    'Invalid rule name: use lowercase letters, numbers and hyphens, with an optional .md.',
  'Nome de regra inválido: use letras, números, ponto, hífen e sublinhado.':
    'Invalid rule name: use letters, numbers, dot, hyphen and underscore.',
  'Nome de skill inválido: use letras minúsculas, números e hífens.': 'Invalid skill name: use lowercase letters, numbers and hyphens.',
  'Nome de agente inválido.': 'Invalid agent name.',
  'Nome inválido.': 'Invalid name.',
  'Nome de artefato inválido.': 'Invalid artifact name.',
  'Nome inválido. Use letras minúsculas, números e hífens.': 'Invalid name. Use lowercase letters, numbers and hyphens.',
  'O nome faz-ai é reservado ao MCP do board.': 'The name faz-ai is reserved for the board MCP.',
  'O nome faz-ai é reservado ao servidor MCP do board.': 'The name faz-ai is reserved for the board MCP server.',
  'Arquivo maior que 512 KB.': 'File larger than 512 KB.',
  'Arquivos de apoio demais (limite de 100).': 'Too many supporting files (limit of 100).',
  'Arquivo de apoio inválido ou acima de 512 KB.': 'Supporting file invalid or larger than 512 KB.',
  'Skill acima de 5 MB.': 'Skill larger than 5 MB.',
  'A skill já tem 100 arquivos de apoio.': 'The skill already has 100 supporting files.',
  'A skill passaria de 5 MB no total.': 'The skill would exceed 5 MB in total.',
  'Arquivo de apoio não encontrado.': 'Supporting file not found.',
  'Arquivo binário: não dá para editar como texto.': 'Binary file: it cannot be edited as text.',
  'Não foi possível ler o conteúdo.': 'Could not read the content.',
  'Escolha outro agente padrão antes de apagar este.': 'Choose another default agent before deleting this one.',
  'Escolha outro agente padrão antes de desligar este.': 'Choose another default agent before turning this one off.',
  'Agente padrão do board: ele pode ser editado, restaurado ou desligado, mas não apagado.':
    'Board factory agent: it can be edited, restored or turned off, but not deleted.',
  'A skill do fluxo é da extensão: só o modo dela pode mudar.': 'The flow skill belongs to the extension: only its mode can change.',
  'Já existe um artefato com este nome. Edite o existente ou escolha outro nome.':
    'An artifact with this name already exists. Edit the existing one or choose another name.',
  'Artefato não encontrado.': 'Artifact not found.',
  'Nenhum artefato encontrado.': 'No artifact found.',
  'Informe uma URL HTTP do servidor MCP.': 'Enter an HTTP URL for the MCP server.',
  'Informe o comando do servidor MCP.': 'Enter the MCP server command.',
  'Informe a configuração do servidor MCP.': 'Enter the MCP server configuration.',
  'Importar artefatos exige revisão humana.': 'Importing artifacts requires human review.',
  'Leia a origem antes de importar.': 'Read the source before importing.',
  'Subpasta inválida.': 'Invalid subfolder.',
  'Subpasta não encontrada: {rel}': 'Subfolder not found: {rel}',
  'Ferramenta não reconhecida.': 'Tool not recognized.',
  'Arquivo não encontrado: {file}': 'File not found: {file}',
  'Item não encontrado na prévia: {key}': 'Item not found in the preview: {key}',
  'Skill "{skill}" não está no board.': 'Skill "{skill}" is not in the board.',
  'Importados: {imported}. Pulados: {skipped}. Problemas: {problems}. Servidores MCP a configurar: {secrets}.':
    'Imported: {imported}. Skipped: {skipped}. Problems: {problems}. MCP servers to configure: {secrets}.',

  '{ref} está bloqueado: {reason}': '{ref} is blocked: {reason}',
  '{ref} está esperando uma pessoa.': '{ref} is waiting for a person.',
  '{ref} não tem nada pendente com a IA, mas ainda não foi concluído.': '{ref} has nothing pending with the AI, but is not finished yet.',

  ...gitNotices,
  'Há trabalho em execução ou reconciliação. Resolva a posse antes de importar o board.':
    'Work is running or being reconciled. Resolve ownership before importing the board.',
};
