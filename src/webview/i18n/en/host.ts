// Mensagens do host (erros e avisos que chegam preenchidos ao webview). A chave é o texto em português com `{nome}` onde
// entra um valor; o `t` casa o texto já preenchido contra essas chaves e devolve a tradução com os valores no lugar.

/** O que fazer quando a CLI da ferramenta não é achada (o texto vem de `commandNotFound`, em src/extension/cliResolve.ts). */
const INSTALL_HINTS: [pt: string, en: string][] = [
  [
    'Instale o Claude Code (https://claude.com/claude-code) ou a extensão dele no editor.',
    'Install Claude Code (https://claude.com/claude-code) or its editor extension.',
  ],
  ['Instale a CLI do Codex (npm install -g @openai/codex).', 'Install the Codex CLI (npm install -g @openai/codex).'],
  ['Instale a GitHub Copilot CLI (npm install -g @github/copilot).', 'Install the GitHub Copilot CLI (npm install -g @github/copilot).'],
  ['Instale a CLI do Cursor (https://cursor.com/cli).', 'Install the Cursor CLI (https://cursor.com/cli).'],
  ['Instale a CLI do Kimi Code.', 'Install the Kimi Code CLI.'],
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
    'Codex: o projeto precisa estar marcado como confiável; abra uma sessão nova (codex mcp list confere).',
    'Codex: the project must be marked as trusted; open a new session (codex mcp list checks it).',
  ],
  ['Kimi Code: abra uma sessão nova a partir da pasta do projeto.', 'Kimi Code: open a new session from the project folder.'],
  [
    'GitHub Copilot no VS Code: confirme a confiança e inicie o servidor (MCP: List Servers). Copilot CLI: abra uma sessão nova na pasta e confirme a confiança nela.',
    'GitHub Copilot in VS Code: confirm trust and start the server (MCP: List Servers). Copilot CLI: open a new session in the folder and confirm trust in it.',
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

export const host: Record<string, string> = {
  ...commandNotFound,
  ...connectAI,

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
  'Migration {n} não encontrada': 'Migration {n} not found',

  // vínculos entre cards
  'Um card não pode se vincular a ele mesmo.': 'A card cannot link to itself.',
  'Estes cards já estão vinculados. Remova o vínculo antes de criar outro.':
    'These cards are already linked. Remove the link before creating another.',
  'O vínculo criaria um ciclo: o pai já é filho deste card.': 'The link would create a cycle: the parent is already a child of this card.',

  // status, aprovação e ações do card
  'Só uma pessoa pode aprovar um card.': 'Only a person can approve a card.',
  'Informe o motivo do bloqueio.': 'Enter the reason for the block.',
  'Anexo maior que 20 MB': 'Attachment larger than 20 MB',
  'Anexo não encontrado': 'Attachment not found',
  'Esta história ainda não tem pasta de trabalho.': 'This story does not have a working folder yet.',
  'Arquivo fora do harness.': 'File outside the harness.',

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
  'o comando "gh" (GitHub CLI) não foi encontrado.': 'the "gh" command (GitHub CLI) was not found.',

  // execução pela IA e chat
  'A IA ainda está respondendo. Espere ou interrompa.': 'The AI is still replying. Wait or stop it.',
  'A IA já está trabalhando em {ref}.': 'The AI is already working on {ref}.',
  'Interrompido.': 'Stopped.',
  'A resposta passou do tempo limite ({minutes} min) e foi encerrada.': 'The reply exceeded the time limit ({minutes} min) and was ended.',
  'Não foi possível executar o {tool}: {reason}': 'Could not run {tool}: {reason}',
  'O {tool} terminou com erro (código {code}).': '{tool} finished with an error (code {code}).',
  'O {tool} terminou com erro (código {code}).\n\n{tail}': '{tool} finished with an error (code {code}).\n\n{tail}',
  'A IA terminou sem escrever uma resposta.': 'The AI finished without writing a reply.',
  'O {tool}, quando roda em segundo plano, não pede aprovação de nada e não aceita limites por linha de comando. Para chamá-lo pelo board, escolha "Sem restrições" em Configurações → Harness de IA → Execução pela conversa.':
    'When {tool} runs in the background, it asks for approval of nothing and does not accept command-line limits. To call it from the board, choose "No restrictions" in Settings → AI harness → Execution through the conversation.',
  'O agente restringe os servidores MCP, mas o servidor do board não está registrado para o Claude Code nesta pasta. Use "Conectar ao board (MCP)" em Configurações → Harness de IA.':
    'The agent restricts MCP servers, but the board server is not registered for Claude Code in this folder. Use "Connect to the board (MCP)" in Settings → AI harness.',
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
  'Arquivo de regras desconhecido: "{name}". Aceitos: {accepted}.': 'Unknown rules file: "{name}". Accepted: {accepted}.',
  'Itens de plugin não podem ser alterados pelo board.': 'Plugin items cannot be changed by the board.',
  'Servidores de plugin não podem ser removidos pelo board.': 'Plugin servers cannot be removed by the board.',
  'Este item não pode ser alterado pelo board.': 'This item cannot be changed by the board.',
  'Este item não pode ser copiado.': 'This item cannot be copied.',
  'Arquivos de configuração não são apagados pelo board.': 'Settings files are not deleted by the board.',
  'Só skills têm modo de invocação.': 'Only skills have an invocation mode.',
  'Só skills têm arquivos de apoio.': 'Only skills have supporting files.',
  'O {tool} não tem agentes definidos em arquivos do projeto.': '{tool} has no agents defined in project files.',
  'O {tool} não permite fixar o modelo de um agente.': "{tool} does not allow fixing an agent's model.",
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
};
