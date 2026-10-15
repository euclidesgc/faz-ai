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

/** Resposta de "Conectar IA": o servidor registrado e o próximo passo de cada ferramenta (de registerClients), com ou sem o aviso do .gitignore. */
const NEXT_STEPS: [pt: string, en: string][] = [
  [
    'Claude Code: abra uma sessão nova na pasta e aprove o servidor (/mcp mostra o estado).',
    'Claude Code: open a new session in the folder and approve the server (/mcp shows its state).',
  ],
  ['Cursor: ative o servidor em Settings → MCP.', 'Cursor: enable the server in Settings → MCP.'],
  [
    'Claude Code: abra uma sessão nova em qualquer projeto com o board aberto (/mcp mostra o estado).',
    'Claude Code: open a new session in any project with the board open (/mcp shows its state).',
  ],
];
const GITIGNORE_PT = ' Esses arquivos guardam caminhos desta máquina: considere colocar no .gitignore: {ignored}.';
const GITIGNORE_EN = ' These files hold paths from this machine: consider adding them to .gitignore: {ignored}.';
const connectAI: Record<string, string> = Object.fromEntries(
  NEXT_STEPS.flatMap(([pt, en]) => [
    [`Servidor "faz-ai" registrado em: {files}. ${pt}`, `Server "faz-ai" registered in: {files}. ${en}`],
    [`Servidor "faz-ai" registrado em: {files}. ${pt}${GITIGNORE_PT}`, `Server "faz-ai" registered in: {files}. ${en}${GITIGNORE_EN}`],
  ]),
);

/**
 * Avisos do board na conversa ao criar a branch (gitNoticeText, em src/shared/gitflow.ts). Ficam à parte porque a
 * conversa traduz os comentários do board só por estas chaves (translateGitNotice, em ../index.ts).
 */
export const gitNotices: Record<string, string> = {
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
};

export const host: Record<string, string> = {
  ...commandNotFound,
  ...connectAI,
  'A linha de comando "{command}" não foi encontrada. Rode no terminal: {manual}':
    'The "{command}" command line was not found. Run in the terminal: {manual}',
  '"{command}" não conseguiu registrar o servidor ({reason}). Rode no terminal: {manual}':
    '"{command}" could not register the server ({reason}). Run in the terminal: {manual}',

  // cartões, colunas, workflows e boards (repositórios e telas)
  'Card não encontrado': 'Card not found',
  'Card não encontrado.': 'Card not found.',
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
  'Este arquivo não pode ser alterado pelo board.': 'This file cannot be changed by the board.',

  // backup do board (exportar e importar)
  'Board exportado em {path}. O arquivo contém conversas e anexos: guarde-o com cuidado.':
    'Board exported to {path}. The file contains conversations and attachments: keep it safe.',
  'Board exportado em {path}. Anexos sem arquivo: {cards}. O arquivo contém conversas e anexos: guarde-o com cuidado.':
    'Board exported to {path}. Attachments without a file: {cards}. The file contains conversations and attachments: keep it safe.',
  'Board "{name}" importado: {cards} card(s) e {attachments} anexo(s).':
    'Board "{name}" imported: {cards} card(s) and {attachments} attachment(s).',
  'Board "{name}" importado: {cards} card(s) e {attachments} anexo(s). Anexos sem arquivo: {missing}.':
    'Board "{name}" imported: {cards} card(s) and {attachments} attachment(s). Attachments without a file: {missing}.',
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
  'Interrompido.': 'Stopped.',
  'A resposta passou do tempo limite ({minutes} min) e foi encerrada.': 'The reply exceeded the time limit ({minutes} min) and was ended.',
  'Não foi possível executar o {tool}: {reason}': 'Could not run {tool}: {reason}',
  'O {tool} terminou com erro (código {code}).': '{tool} finished with an error (code {code}).',
  'Não foi possível conferir os requisitos do board: {error}': 'Could not check the board requirements: {error}',
  'Não foi possível rodar o Diagnóstico do ambiente: {error}': 'Could not run the environment Diagnosis: {error}',
  'O {tool} terminou com erro (código {code}).\n\n{tail}': '{tool} finished with an error (code {code}).\n\n{tail}',
  'A IA terminou sem escrever uma resposta.': 'The AI finished without writing a reply.',
  'O agente restringe os servidores MCP, mas o servidor do board não está registrado para o Claude Code nesta pasta. Instale o servidor em Configurações → Harness de IA → Tudo que a ferramenta carrega → Claude Code → Servidores MCP.':
    'The agent restricts MCP servers, but the board server is not registered for Claude Code in this folder. Install the server in Settings → AI harness → Everything the tool loads → Claude Code → MCP servers.',
  'Servidores MCP do agente não encontrados na configuração do Claude Code: {servers}.':
    "The agent's MCP servers were not found in the Claude Code configuration: {servers}.",

  // webview no navegador
  'O arquivo é grande demais para enviar (limite de 20 MB).': 'The file is too large to upload (20 MB limit).',
  'O acesso a este board expirou. Abra o board de novo pelo editor ou pelo terminal.':
    'Access to this board has expired. Reopen the board from the editor or the terminal.',
  '"{name}" tem mais de 20 MB e não foi anexado.': '"{name}" is larger than 20 MB and was not attached.',

  // harness: arquivos de regras, skills, agentes, hooks, permissões e servidores MCP
  'SKILL.md não encontrado.': 'SKILL.md not found.',
  'Nenhuma pasta de projeto aberta.': 'No project folder is open.',
  'Pasta do usuário não encontrada.': 'User folder not found.',
  'Item não encontrado no harness. Atualize a lista e tente de novo.': 'Item not found in the harness. Refresh the list and try again.',
  'Servidor não encontrado no harness. Atualize a lista e tente de novo.':
    'Server not found in the harness. Refresh the list and try again.',
  'Skill "{name}" não encontrada no projeto.': 'Skill "{name}" not found in the project.',
  'Nenhuma origem de skills carregada. Procure de novo.': 'No skills source loaded. Search again.',
  'Esta ferramenta não tem uma pasta de skills nesse escopo.': 'This tool has no skills folder in that scope.',
  'Nome inválido: use letras minúsculas, números e hífens (ex.: "revisar-spec").':
    'Invalid name: use lowercase letters, numbers and hyphens (e.g. "review-spec").',
  'Nome de skill inválido: use letras minúsculas, números e hífens (ex.: "revisar-spec").':
    'Invalid skill name: use lowercase letters, numbers and hyphens (e.g. "review-spec").',
  'Nome de agente inválido: use letras minúsculas, números e hífens (ex.: "revisor-de-spec").':
    'Invalid agent name: use lowercase letters, numbers and hyphens (e.g. "spec-reviewer").',
  'Nome de arquivo inválido: use pasta/arquivo.ext, com letras, números, hífen, ponto e sublinhado.':
    'Invalid file name: use folder/file.ext, with letters, numbers, hyphen, dot and underscore.',
  'Nome inválido: use letras, números, hífen, ponto ou sublinhado.': 'Invalid name: use letters, numbers, hyphen, dot or underscore.',
  'Não é possível criar um item neste lugar.': 'An item cannot be created here.',
  'Informe a descrição: é por ela que a IA decide quando usar o item.':
    'Enter the description: it is how the AI decides when to use the item.',
  'A skill precisa de uma descrição: é por ela que a IA decide quando usar a skill.':
    'The skill needs a description: it is how the AI decides when to use the skill.',
  'O agente precisa de uma descrição: é por ela que a IA decide quando delegar a ele.':
    'The agent needs a description: it is how the AI decides when to delegate to it.',
  'Já existe: {file}': 'Already exists: {file}',
  'Já existe "{rel}" nesta skill.': '"{rel}" already exists in this skill.',
  'Já existe "{name}" em {path}.': '"{name}" already exists in {path}.',
  'Já existe uma skill "{name}".': 'A skill "{name}" already exists.',
  'Já existe uma skill "{name}" ligada.': 'An enabled skill "{name}" already exists.',
  'Já existe uma skill "{name}" desligada.': 'A disabled skill "{name}" already exists.',
  'Já existe uma skill "{name}" em {path}.': 'A skill "{name}" already exists in {path}.',
  'Já existe uma skill "{name}" no destino.': 'A skill "{name}" already exists at the destination.',
  'Já existe um agente "{name}".': 'An agent "{name}" already exists.',
  'Já existe um servidor "{name}" em {path}.': 'A server "{name}" already exists in {path}.',
  'Arquivo "{rel}" não encontrado nesta skill.': 'File "{rel}" not found in this skill.',
  'Skill "{name}" não encontrada.': 'Skill "{name}" not found.',
  'Agente "{name}" não encontrado.': 'Agent "{name}" not found.',
  'Servidor "{name}" não encontrado em {path}.': 'Server "{name}" not found in {path}.',
  'Plugins desinstalados: {names}. Vale a partir da próxima sessão do Claude Code, ou depois de /reload-plugins numa sessão aberta.':
    'Plugins uninstalled: {names}. Takes effect from the next Claude Code session, or after /reload-plugins in an open session.',
  'Plugins desativados: {names}. Vale a partir da próxima sessão do Claude Code, ou depois de /reload-plugins numa sessão aberta.':
    'Plugins disabled: {names}. Takes effect from the next Claude Code session, or after /reload-plugins in an open session.',
  'Plugins ativados: {names}. Vale a partir da próxima sessão do Claude Code, ou depois de /reload-plugins numa sessão aberta.':
    'Plugins enabled: {names}. Takes effect from the next Claude Code session, or after /reload-plugins in an open session.',
  'Plugins removidos de ~/.cursor/plugins/local: {names}. Recarregue a janela do Cursor para valer.':
    'Plugins removed from ~/.cursor/plugins/local: {names}. Reload the Cursor window for it to take effect.',
  'Feito em {done} de {total}. Falhou: {failures}': 'Done for {done} of {total}. Failed: {failures}',
  'Nada mudou. Falhou: {failures}': 'Nothing changed. Failed: {failures}',
  'Nenhum dos plugins escolhidos aceita essa ação.': 'None of the chosen plugins accepts that action.',
  'Arquivo de regras desconhecido: "{name}". Aceitos: {accepted}.': 'Unknown rules file: "{name}". Accepted: {accepted}.',
  'Itens de plugin não podem ser alterados pelo board.': 'Plugin items cannot be changed by the board.',
  'Servidores de plugin não podem ser removidos pelo board.': 'Plugin servers cannot be removed by the board.',
  'Este item não pode ser alterado pelo board.': 'This item cannot be changed by the board.',
  'Este item não pode ser copiado.': 'This item cannot be copied.',
  'Arquivos de configuração não são apagados pelo board.': 'Settings files are not deleted by the board.',
  'Só skills têm modo de invocação.': 'Only skills have an invocation mode.',
  'Só skills têm arquivos de apoio.': 'Only skills have supporting files.',
  'O {tool} não tem uma pasta de projeto para este tipo de item.': '{tool} has no project folder for this kind of item.',
  'O {tool} não tem uma pasta de usuário para este tipo de item.': '{tool} has no user folder for this kind of item.',
  '{file} não é um JSON simples (pode ter comentários ou um erro de sintaxe). Abra o arquivo e edite-o à mão.':
    '{file} is not plain JSON (it may have comments or a syntax error). Open the file and edit it by hand.',
  'Este item fica num arquivo que o board não edita. Abra o arquivo e edite-o à mão.':
    'This item lives in a file the board does not edit. Open the file and edit it by hand.',
  'Este servidor fica num arquivo que o board não edita. Abra o arquivo, ou use a linha de comando da ferramenta.':
    "This server lives in a file the board does not edit. Open the file, or use the tool's command line.",
  'Este arquivo de servidores MCP não é editado pelo board.': 'The board does not edit this MCP servers file.',
  'Este arquivo de hooks não é editado pelo board.': 'The board does not edit this hooks file.',
  'Este arquivo de permissões não é editado pelo board.': 'The board does not edit this permissions file.',
  'Informe o comando do servidor.': 'Enter the server command.',
  'Informe o endereço (URL) do servidor.': 'Enter the server address (URL).',
  'Informe o evento do hook.': 'Enter the hook event.',
  'Informe o comando do hook.': 'Enter the hook command.',
  'Informe a regra.': 'Enter the rule.',
  'Esta regra já está na lista.': 'This rule is already in the list.',
  'Regra de permissão desconhecida.': 'Unknown permission rule.',
  'Regra não encontrada no arquivo. Atualize a lista e tente de novo.': 'Rule not found in the file. Refresh the list and try again.',
  'Hook não encontrado no arquivo. Atualize a lista e tente de novo.': 'Hook not found in the file. Refresh the list and try again.',

  // instalação de skills
  'Informe uma pasta ou o endereço de um repositório git.': 'Enter a folder or the address of a git repository.',
  'Pasta não encontrada: {source}': 'Folder not found: {source}',
  'Origem não reconhecida. Use o caminho completo de uma pasta, "dono/repositorio" do GitHub ou um endereço https ou ssh de um repositório git.':
    'Source not recognized. Use the full path of a folder, "owner/repository" from GitHub or an https or ssh address of a git repository.',
  'Não foi possível clonar {url}: {reason}': 'Could not clone {url}: {reason}',
  'Skill não encontrada na origem: {rel}': 'Skill not found in the source: {rel}',
  '"{name}" não é um nome de skill válido (letras minúsculas, números e hífens).':
    '"{name}" is not a valid skill name (lowercase letters, numbers and hyphens).',

  '{ref} está bloqueado: {reason}': '{ref} is blocked: {reason}',
  '{ref} está esperando uma pessoa.': '{ref} is waiting for a person.',
  '{ref} não tem nada pendente com a IA, mas ainda não foi concluído.': '{ref} has nothing pending with the AI, but is not finished yet.',

  ...gitNotices,
};
