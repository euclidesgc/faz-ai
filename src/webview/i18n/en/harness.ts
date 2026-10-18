export const harness: Record<string, string> = {
  'Esta é a pasta de destino do board. A pasta de origem é escolhida na importação abaixo.':
    'This is the board destination folder. Choose the source folder in the import section below.',
  'Adicionada na pasta da biblioteca': 'Added in the library folder',
  'Nenhuma skill na biblioteca. Use Importar de uma pasta acima ou cole uma pasta com SKILL.md na biblioteca e clique em Atualizar lista.':
    'No skills in the library. Use Import from a folder above, or paste a folder containing SKILL.md into the library and click Refresh list.',
  'As skills aparecem no campo Skills dos cards e no planejamento. Pelo card só entra quando escolhido; Sempre entra em toda execução.':
    'Skills appear in the cards’ Skills field and in planning. Per card is included only when chosen; Always is included in every run.',
  'Importar selecionadas ({n})': 'Import selected ({n})',
  'Importar {name}': 'Import {name}',
  'Buscar skills pelo caminho': 'Find skills by path',
  'Pasta de origem ou repositório': 'Source folder or repository',
  '{n} skill(s) importada(s). Elas estão na aba Skills abaixo, no modo Pelo card.':
    '{n} skill(s) imported. They are under the Skills tab below, in Per card mode.',
  'Importar de uma pasta': 'Import from a folder',
  'Escolhe uma pasta e lista as skills antes de copiar para o board.':
    'Chooses a folder and lists skills before copying them to the board.',
  '1. Escolha a pasta de origem. 2. Marque as skills encontradas. 3. Clique em Importar selecionadas. As cópias aparecem na lista abaixo e funcionam com qualquer ferramenta.':
    '1. Choose the source folder. 2. Select the skills found. 3. Click Import selected. Copies appear in the list below and work with any tool.',
  'Importar skills de outra pasta': 'Import skills from another folder',
  'Importar skills para o board': 'Import skills to the board',
  'Não foi possível ler "{path}". Os arquivos foram preservados; confira o SKILL.md e os limites abaixo.':
    'Could not read "{path}". The files were preserved; check SKILL.md and the limits below.',
  'A pasta "{path}" precisa de um nome com letras minúsculas, números e hífens.':
    'Folder "{path}" needs a name with lowercase letters, numbers and hyphens.',
  'A pasta "{path}" tem o mesmo nome de uma skill já cadastrada. Seus arquivos foram preservados; renomeie a pasta para importar outra skill.':
    'Folder "{path}" has the same name as an existing skill. Your files were preserved; rename the folder to import another skill.',
  'Você pode colar pastas de skills aqui. Cada pasta deve conter SKILL.md; os arquivos de apoio vão junto. Ao voltar à tela ou clicar em Atualizar lista, elas aparecem em Skills, no modo Pelo card.':
    'You can paste skill folders here. Each folder must contain SKILL.md, along with its supporting files. Return to this screen or click Refresh list to see them under Skills, in Per card mode.',
  'Abre a pasta da biblioteca no gerenciador de arquivos do sistema.': 'Opens the library folder in the system file manager.',
  'Atualizar lista': 'Refresh list',
  'Reconhece skills coladas na pasta e atualiza a lista sem apagar seus arquivos.':
    'Detects skills pasted into the folder and refreshes the list without deleting your files.',
  'A <b>Biblioteca do board</b> reúne os artefatos disponíveis em qualquer ferramenta. <b>Ferramenta e execução</b> escolhe a IA, a permissão e o agente padrão. As abas das ferramentas mostram as fontes para importar.':
    'The <b>Board library</b> gathers artifacts available with any tool. <b>Tool and execution</b> chooses the AI, permission and default agent. Tool tabs show sources to import from.',
  'Tudo que o {tool} carrega. O <b>catálogo</b> (Projeto, Global e Importados) mostra as fontes. Ao enviar um artefato à <b>Biblioteca do board</b>, ele é copiado e fica disponível para as execuções com qualquer ferramenta, no modo escolhido.':
    'Everything {tool} loads. The <b>catalog</b> (Project, Global and Imported) shows sources. Sending an artifact to the <b>Board library</b> copies it and makes it available for runs with any tool, in the chosen mode.',

  'Abrir pasta': 'Open folder',
  'Origem: {path}': 'Source: {path}',
  '{n} arquivo(s) não copiado(s); consulte os limites da biblioteca.': '{n} file(s) not copied; check the library limits.',
  'Cada skill aceita arquivos de até 512 KB, até 100 arquivos de apoio e 5 MB no total. Itens omitidos aparecem na lista do board.':
    'Each skill accepts files up to 512 KB, up to 100 supporting files and 5 MB in total. Omitted items are shown in the board list.',

  'Copia este agente para a biblioteca do board.': 'Copies this agent to the board library.',
  'Biblioteca do board': 'Board library',
  'Skills, agentes e regras copiados para este board ficam disponíveis com qualquer ferramenta de IA. As fontes originais são preservadas.':
    'Skills, agents and rules copied to this board are available with any AI tool. Original sources are preserved.',
  'Pasta da biblioteca': 'Library folder',
  'Caminho completo de uma pasta vazia': 'Full path to an empty folder',
  'Informe uma nova pasta para a biblioteca.': 'Enter a new folder for the library.',
  'Copia a biblioteca para a nova pasta e passa a usá-la. A pasta anterior é preservada.':
    'Copies the library to the new folder and starts using it. The previous folder is preserved.',
  'Salvar pasta': 'Save folder',
  'A biblioteca ainda não está disponível.': 'The library is not available yet.',
  'Abre a pasta da biblioteca no editor.': 'Opens the library folder in the editor.',
  'A biblioteca é local e particular. As skills importadas não são distribuídas com a extensão. Atualizações da origem só entram quando você pede.':
    'The library is local and private. Imported skills are not distributed with the extension. Source updates are applied only when you request them.',
  'Buscar na biblioteca': 'Search the library',
  'Copia as skills selecionadas e seus arquivos de apoio para a biblioteca particular deste board.':
    'Copies the selected skills and their supporting files to this board’s private library.',
  'Substitui a cópia do board pelo conteúdo atual da origem.': 'Replaces the board copy with the current source content.',
  'Atualizar "{name}" da origem?': 'Update "{name}" from the source?',
  'A cópia atual do board será substituída. A origem não será alterada.':
    'The current board copy will be replaced. The source will not be changed.',
  'Atualizar da origem': 'Update from source',
  'Mostrando o catálogo do {tool}. Os artefatos enviados ao board ficam disponíveis com qualquer ferramenta.':
    'Showing the {tool} catalog. Artifacts sent to the board are available with any tool.',

  // --- HarnessSettings
  Harness: 'Harness',
  'O que a IA lê e usa neste projeto. <b>Ferramenta e execução</b> escolhe com qual IA o board trabalha; <b>Do projeto</b> reúne o que faz parte do repositório e é editável aqui; <b>Tudo que a ferramenta carrega</b> mostra também o que vem da sua pasta de usuário e de plugins.':
    'What the AI reads and uses in this project. <b>Tool and execution</b> chooses which AI the board works with; <b>From the project</b> gathers what is part of the repository and can be edited here; <b>Everything the tool loads</b> also shows what comes from your user folder and from plugins.',
  'Ferramenta e execução': 'Tool and execution',
  'Do projeto': 'From the project',
  'Tudo que a ferramenta carrega': 'Everything the tool loads',
  'Tudo aqui são arquivos da pasta do projeto: vão no repositório e valem para quem trabalha nele.':
    'Everything here is files in the project folder: they go in the repository and apply to everyone working on it.',

  // --- HarnessInventory
  'Relê as pastas do projeto e do usuário': 'Re-reads the project and user folders',
  'deste projeto': 'this project',
  'não encontrada': 'not found',

  // --- Formulários e editores
  Nome: 'Name',
  'Nome inválido ou já usado.': 'Invalid or already used name.',
  Instruções: 'Instructions',
  'Alterações não salvas': 'Unsaved changes',
  Descartar: 'Discard',
  Fechar: 'Close',
  Salvar: 'Save',
  Cancelar: 'Cancel',

  // --- InstallSkills
  'Instalar no projeto': 'Install in the project',
  'Instalar no global': 'Install globally',
  'Instalar {n} skill(s)?': 'Install {n} skill(s)?',
  'As pastas são copiadas para {destination}. Nada é executado na instalação, mas uma skill são instruções (e às vezes scripts) que a IA vai seguir: leia o que vem de fontes que você não conhece.':
    'The folders are copied to {destination}. Nothing is run during installation, but a skill is instructions (and sometimes scripts) that the AI will follow: read what comes from sources you do not know.',
  'a sua pasta de usuário': 'your user folder',
  'o projeto': 'the project',
  Instalar: 'Install',
  'Instalar skills': 'Install skills',
  'dono/repositorio, endereço git (https ou ssh) ou o caminho de uma pasta': 'owner/repository, git URL (https or ssh) or a folder path',
  'Procurar skills': 'Find skills',
  'Um repositório é clonado numa pasta temporária, sem rodar nada dele. Você vê as skills encontradas antes de copiar qualquer coisa.':
    'A repository is cloned into a temporary folder, without running anything from it. You see the skills found before anything is copied.',
  '{n} skill(s) em {source}': '{n} skill(s) in {source}',
  'Onde instalar': 'Where to install',
  'nome de pasta inválido para skill': 'invalid folder name for a skill',
  'já existe no destino': 'already exists at the destination',
  'Instalar {name}': 'Install {name}',
  '{n} arquivo(s) de apoio': '{n} support file(s)',
  'Nenhuma pasta com SKILL.md nessa origem.': 'No folder with SKILL.md in this source.',
  'Selecionar todas': 'Select all',
  'Instalar {n} selecionada(s)': 'Install {n} selected',

  // --- ItemRow
  'Selecionar {name}': 'Select {name}',
  'copiada no projeto': 'copied in the project',
  'no projeto, com conteúdo diferente': 'in the project, with different content',
  'Novo hook': 'New hook',
  'Novo servidor': 'New server',
  'sem arquivo': 'no file',
  'Nada aqui ainda.': 'Nothing here yet.',
  'Você pode criar:': 'You can create:',
  'Desinstalar "{name}"?': 'Uninstall "{name}"?',
  'Desinstalar {n} plugins?': 'Uninstall {n} plugins?',
  'A pasta de cada um sai de ~/.cursor/plugins/local.': "Each one's folder is removed from ~/.cursor/plugins/local.",
  'O Claude Code remove o plugin e apaga os dados e as opções que ele guardou.':
    'Claude Code removes the plugin and deletes the data and options it saved.',
  Desinstalar: 'Uninstall',
  'Ações nos plugins marcados': 'Actions on the checked plugins',
  'Aplicando pela ferramenta…': 'Applying through the tool…',
  Desativar: 'Disable',
  Ativar: 'Enable',
  'A ferramenta não carrega o plugin até ele ser ativado de novo': 'The tool does not load the plugin until it is enabled again',
  desativado: 'disabled',
  'Vem da sua conta no claude.ai: dá para desativar, não para desinstalar':
    'Comes from your claude.ai account: it can be disabled, not uninstalled',
  'sincronizado do claude.ai': 'synced from claude.ai',
  'Instalado pela sua organização: dá para desativar, não para desinstalar':
    'Installed by your organization: it can be disabled, not uninstalled',
  'da organização': 'from the organization',
  'Modo da skill': 'Skill mode',
  'Ações nos itens marcados': 'Actions on the checked items',
  'Selecionar todos: {group}': 'Select all: {group}',
  '{n} marcados': '{n} checked',
  'Selecionar todos': 'Select all',
  'Remover {n} entradas?': 'Remove {n} entries?',
  'O board não respondeu. Se a extensão acabou de ser atualizada, recarregue a janela (no VS Code, Developer: Reload Window) e abra o arquivo de novo.':
    'The board did not reply. If the extension was just updated, reload the window (in VS Code, Developer: Reload Window) and open the file again.',
  'não lido pelo Claude Code': 'not read by Claude Code',
  'Por padrão, o Claude Code não lê este arquivo nas suas conversas, porque o projeto tem {claude}. Para ler os dois, importe com @{path} no {claude} ou mude Project instructions no /config do Claude Code.':
    'By default, Claude Code does not read this file in your conversations, because the project has {claude}. To read both, import it with @{path} in {claude} or change Project instructions in Claude Code /config.',
  'O Claude Code está lendo o {path}. Criar um CLAUDE.md ou CLAUDE.local.md faz ele parar de ler, a menos que o arquivo novo importe com @{path}.':
    'Claude Code is reading {path}. Creating a CLAUDE.md or CLAUDE.local.md makes it stop, unless the new file imports it with @{path}.',
  'Criar {path}': 'Create {path}',
  'ferramenta deste projeto': "this project's tool",
  'Mostrando o que o {tool} carrega. As execuções do board usam o {board}: a marcação só vale para ele.':
    'Showing what {tool} loads. Board runs use {board}: the marking only applies to it.',
  'não encontrada nesta máquina': 'not found on this machine',
  'Entra no começo de toda conversa da ferramenta': 'Loaded at the start of every conversation of the tool',
  'sempre carregado': 'always loaded',
  'A ferramenta só lê o conteúdo quando a tarefa pede ou quando você chama':
    'The tool only reads the content when the task calls for it or when you call it',
  'sob demanda': 'on demand',
  'Importa com @, e entram junto:': 'Imports with @, which load along with it:',
  'Abre o arquivo importado no board': 'Opens the imported file in the board',
  'Abre o arquivo no board, para ler e editar': 'Opens the file in the board, to read and edit',
  'Abre o arquivo no board, só para leitura': 'Opens the file in the board, read-only',
  'Somente leitura: este arquivo é mantido pela ferramenta ou por um plugin.':
    'Read-only: this file is maintained by the tool or by a plugin.',
  'Conteúdo do arquivo': 'File content',
  'Modo da skill {name}': 'Mode of skill {name}',
  'Skill importada: o modo nativo é de quem mantém a pasta, e no board o que vale é o modo do artefato.':
    "Imported skill: the native mode belongs to whoever keeps the folder, and on the board what counts is the artifact's mode.",
  'Skill de plugin: o modo não pode ser alterado aqui. Para mudar, copie a skill para o projeto.':
    'Plugin skill: the mode cannot be changed here. To change it, copy the skill to the project.',
  'Referências, modelos e scripts da pasta da skill': "References, templates and scripts from the skill's folder",
  'Arquivos ({n})': 'Files ({n})',
  'Cria uma cópia independente na pasta do projeto': 'Creates an independent copy in the project folder',
  'Copiar para o projeto': 'Copy to the project',
  'Cria uma cópia na sua pasta de usuário, que vale em todos os projetos':
    'Creates a copy in your user folder, which applies to all projects',
  'Copiar para o global': 'Copy to global',
  Apagar: 'Delete',
  'Remover o hook deste arquivo': 'Remove the hook from this file',
  'Remover o hook de "{name}"?': 'Remove the hook from "{name}"?',
  '{detail}\n\nA entrada sai de {location}.': '{detail}\n\nThe entry is removed from {location}.',
  Remover: 'Remove',
  'Remover a regra deste arquivo': 'Remove the rule from this file',
  'Remover a regra de permissão?': 'Remove the permission rule?',
  '{description}: {name}\n\nA regra sai de {location}.': '{description}: {name}\n\nThe rule is removed from {location}.',
  'Remover o servidor deste arquivo': 'Remove the server from this file',
  'Remover o servidor "{name}"?': 'Remove the server "{name}"?',
  'A entrada sai de {location}.': 'The entry is removed from {location}.',

  // --- KindSection
  'Instruções e regras': 'Instructions and rules',
  'Texto carregado em toda sessão, ou quando a IA mexe em arquivos de um caminho.':
    'Text loaded in every session, or when the AI touches files under a path.',
  Skills: 'Skills',
  'Instruções que a IA carrega quando precisa, ou quando o card indica.':
    'Instructions the AI loads when it needs them, or when the card points to them.',
  Subagentes: 'Subagents',
  'Ajudantes com instruções próprias, para os quais a ferramenta delega trabalho.':
    'Helpers with their own instructions, to which the tool delegates work.',
  'Comandos e prompts': 'Commands and prompts',
  'Prompts prontos, chamados pelo nome.': 'Ready-made prompts, called by name.',
  Hooks: 'Hooks',
  'Comandos que a ferramenta roda sozinha em certos eventos.': 'Commands the tool runs on its own on certain events.',
  'Servidores MCP': 'MCP servers',
  'Servidores que dão ferramentas extras à IA.': 'Servers that give the AI extra tools.',
  Plugins: 'Plugins',
  'Pacotes instalados, que trazem skills, agentes, comandos, hooks e servidores MCP.':
    'Installed packages that bring skills, agents, commands, hooks and MCP servers.',
  'Configurações e permissões': 'Settings and permissions',
  'Arquivos de configuração da ferramenta.': "The tool's configuration files.",
  'Buscar e instalar': 'Find and install',
  'Nova regra de permissão': 'New permission rule',
  'Novo arquivo': 'New file',
  Novo: 'New',
  'Modelos de classe e exemplos de código ficam bem numa skill própria, só quando indicada: os arquivos vão em <code>references/</code> e os cards que a indicam recebem os caminhos.':
    'Class templates and code examples fit well in a skill of their own, used only when indicated: the files go in <code>references/</code> and the cards that indicate it receive the paths.',
  'Criar skill de modelos': 'Create templates skill',
  'Plugins são instalados pela própria ferramenta, {where}:': 'Plugins are installed by the tool itself, {where}:',
  'no terminal': 'in the terminal',
  'no Cursor (Customize → Plugins) ou numa sessão do agente': 'in Cursor (Customize → Plugins) or in an agent session',
  'claude plugin marketplace add <dono/repositorio>': 'claude plugin marketplace add <owner/repository>',
  'gh skill search <termo>': 'gh skill search <term>',
  'agent plugin marketplace add <endereço git>': 'agent plugin marketplace add <git URL>',
  '/plugins install <pasta, zip ou endereço do GitHub>': '/plugins install <folder, zip or GitHub URL>',
  'Um hook é um comando que a ferramenta roda sozinha no seu computador. Só acrescente comandos que você conhece.':
    'A hook is a command the tool runs on its own on your computer. Only add commands you know.',
  'Os servidores do <code>~/.claude.json</code> aparecem aqui, mas são alterados pelo Claude Code: <code>claude mcp add --scope user …</code> e <code>claude mcp remove …</code>.':
    'The servers in <code>~/.claude.json</code> show up here, but are changed by Claude Code: <code>claude mcp add --scope user …</code> and <code>claude mcp remove …</code>.',

  // --- Escopos
  Projeto: 'Project',
  Global: 'Global',
  Importados: 'Imported',
  'Indicar artefatos': 'Suggest artifacts',
  'Indicando…': 'Suggesting…',
  'A IA lê o projeto e o catálogo deste assunto e deixa pré-selecionados os artefatos que fazem mais sentido; você confirma.':
    "The AI reads the project and this subject's catalog and pre-selects the artifacts that make the most sense; you confirm.",
  '{n} indicados: confira a seleção e use "Enviar para o board".': '{n} suggested: check the selection and use "Enviar para o board".',
  'A IA não indicou nenhum artefato deste assunto.': 'The AI suggested no artifact of this subject.',
  'Descartar indicação': 'Discard suggestion',
  'Não há artefatos fora do board neste assunto.': 'There are no artifacts off the board in this subject.',
  'A IA não respondeu no formato esperado.': 'The AI did not answer in the expected format.',
  'Indicar artefatos só vale para a ferramenta do projeto.': 'Suggesting artifacts only works for the project tool.',
  'Indicado pela IA': 'Suggested by the AI',
  indicado: 'suggested',
  'Encontrados nas pastas que você importou; a ferramenta não os carrega sozinha.':
    'Found in the folders you imported; the tool does not load them on its own.',
  'De pastas importadas: só entram nas execuções quando enviados ao board.':
    'From imported folders: they only get into runs when sent to the board.',
  'Fazem parte deste projeto e vão no repositório.': 'They are part of this project and go in the repository.',
  'Da sua máquina: valem em todos os seus projetos, mas não vão no repositório.':
    'From your machine: they apply to all your projects, but do not go in the repository.',
  'Vêm de plugins e não podem ser alterados, só copiados.': 'They come from plugins and cannot be changed, only copied.',

  // --- Modos de skill
  Automática: 'Automatic',
  'Só quando indicada': 'Only when indicated',

  // --- NewHook
  'Acrescentar este hook?': 'Add this hook?',
  'O {tool} vai rodar este comando sozinho, no seu computador, a cada "{event}":\n\n{command}\n\nArquivo: {file}':
    '{tool} will run this command on its own, on your computer, on every "{event}":\n\n{command}\n\nFile: {file}',
  'Acrescentar hook': 'Add hook',
  'Hook novo': 'New hook',
  Arquivo: 'File',
  Evento: 'Event',
  'Filtro (opcional)': 'Filter (optional)',
  'Ex.: Bash, ou Edit|Write; vazio = sempre': 'E.g.: Bash, or Edit|Write; empty = always',
  Comando: 'Command',
  'Tempo limite (s)': 'Timeout (s)',
  'padrão da ferramenta': 'tool default',

  // --- NewItem
  'Criar na pasta do usuário?': 'Create in the user folder?',
  Criar: 'Create',
  'Item novo': 'New item',
  Onde: 'Where',
  Descrição: 'Description',
  'Descrição (opcional)': 'Description (optional)',
  'Quando a IA deve usar': 'When the AI should use it',
  'Criar e abrir no editor': 'Create and open in the editor',
  '<nome>': '<name>',

  // --- NewMcpServer
  'Comando local (stdio)': 'Local command (stdio)',
  'Endereço (HTTP)': 'URL (HTTP)',
  'Acrescentar servidor na pasta do usuário?': 'Add server to the user folder?',
  Acrescentar: 'Add',
  'Servidor MCP novo': 'New MCP server',
  Tipo: 'Type',
  Argumentos: 'Arguments',
  'um por linha': 'one per line',
  Endereço: 'URL',
  'Variáveis de ambiente': 'Environment variables',
  Cabeçalhos: 'Headers',
  'Gravados no arquivo como estão. Se o arquivo vai para o repositório, não ponha segredos nele.':
    'Written to the file as they are. If the file goes in the repository, do not put secrets in it.',
  'CHAVE=valor, um por linha': 'KEY=value, one per line',
  'Acrescentar servidor': 'Add server',

  // --- NewPermission
  'Acrescentar regra na pasta do usuário?': 'Add rule to the user folder?',
  'Regra de permissão nova': 'New permission rule',
  Lista: 'List',
  permitir: 'allow',
  perguntar: 'ask',
  negar: 'deny',
  Regra: 'Rule',
  'Ex.: Shell(git), Read(src/**)': 'E.g.: Shell(git), Read(src/**)',
  'Ex.: Bash(npm run test *), Read(./.env)': 'E.g.: Bash(npm run test *), Read(./.env)',
  'Acrescentar regra': 'Add rule',

  // --- ProjectAgents
  Editar: 'Edit',
  'Apagar o subagente': 'Delete the subagent',
  'Apagar o subagente "{name}"?': 'Delete the subagent "{name}"?',
  'O arquivo do subagente é removido do projeto.': "The subagent's file is removed from the project.",
  'Sem descrição no frontmatter.': 'No description in the frontmatter.',
  'Novo subagente': 'New subagent',
  'Subagentes do {tool}: cada arquivo em <code>{dir}</code> define um ajudante com instruções próprias, e a ferramenta delega trabalho a ele pela descrição.':
    '{tool} subagents: each file in <code>{dir}</code> defines a helper with its own instructions, and the tool delegates work to it based on the description.',
  'Um subagente pode fixar o modelo que usa, o que serve para executar um card com o modelo indicado nele.':
    'A subagent can pin the model it uses, which is how a card is run with the model set on it.',
  'Subagente novo': 'New subagent',
  'Descrição (quando delegar)': 'Description (when to delegate)',
  'Revisa uma Spec e aponta lacunas antes do Plan': 'Reviews a Spec and points out gaps before the Plan',
  'Instruções do subagente': 'Subagent instructions',
  'Criar subagente': 'Create subagent',
  'Modelo (opcional)': 'Model (optional)',
  'vazio = o modelo da sessão': 'empty = the session model',
  'Nenhum subagente em <code>{dir}</code> ainda.': 'No subagents in <code>{dir}</code> yet.',

  // --- ProjectRules
  Existe: 'Exists',
  'Não existe': 'Does not exist',
  'Lido por: {readBy}': 'Read by: {readBy}',
  'Cria um CLAUDE.md que só importa o AGENTS.md, para as regras ficarem num arquivo só':
    'Creates a CLAUDE.md that only imports AGENTS.md, so the rules live in a single file',
  'Usar o AGENTS.md': 'Use AGENTS.md',
  'Apagar o arquivo': 'Delete the file',
  'Apagar {name}?': 'Delete {name}?',
  'O arquivo é removido da pasta do projeto.': 'The file is removed from the project folder.',
  'Regras do projeto': 'Project rules',
  'Instruções carregadas em toda sessão de IA. Quanto mais curtas, menos contexto consomem.':
    'Instructions loaded in every AI session. The shorter they are, the less context they use.',

  // --- ProjectSkills
  'Skills do {tool} em <code>{dir}</code>. Todas viram opções do campo "Skills" dos cards, e um card que indica uma skill entrega à IA o caminho do arquivo. Por isso uma skill não precisa ficar à vista da IA para ser usada:':
    '{tool} skills in <code>{dir}</code>. All of them become options in the "Skills" field of cards, and a card that indicates a skill hands the AI the file path. That is why a skill does not need to be in the AI\'s sight to be used:',
  '<b>Automática</b>: a IA vê a descrição em toda sessão e decide quando usar.':
    '<b>Automatic</b>: the AI sees the description in every session and decides when to use it.',
  '<b>Só quando indicada</b>: a IA não a invoca sozinha; vale quando um card a indica ou quando é chamada pelo nome.':
    '<b>Only when indicated</b>: the AI does not invoke it on its own; it applies when a card indicates it or when it is called by name.',
  '<b>Desligada</b>: movida para <code>{dir}-disabled</code>; a ferramenta não a enxerga, mas um card ainda pode indicá-la.':
    '<b>Off</b>: moved to <code>{dir}-disabled</code>; the tool cannot see it, but a card can still indicate it.',
  '{n} skills automáticas no projeto.': '{n} automatic skills in the project.',
  'A IA deixa de invocar essas skills sozinha; elas continuam valendo nos cards que as indicam':
    'The AI stops invoking these skills on its own; they still apply on the cards that indicate them',
  'Deixar todas só quando indicadas': 'Set all to only when indicated',
  'Skill nova': 'New skill',
  'Descrição (quando usar)': 'Description (when to use)',
  'Use ao revisar uma Spec antes de passar para o Plan': 'Use when reviewing a Spec before moving on to the Plan',
  'Instruções da skill, em markdown': 'Skill instructions, in markdown',
  'Criar skill': 'Create skill',
  'Nenhuma skill em <code>{dir}</code> ainda.': 'No skills in <code>{dir}</code> yet.',

  // --- ProjectTool
  'Ferramenta deste projeto': "This project's tool",
  'Ferramenta de IA do projeto': 'Project AI tool',
  Ferramenta: 'Tool',
  Regras: 'Rules',
  '.mcp.json (projeto)': '.mcp.json (project)',
  '.cursor/mcp.json (projeto)': '.cursor/mcp.json (project)',
  '.kimi-code/mcp.json (projeto)': '.kimi-code/mcp.json (project)',
  'Cursor e outras ferramentas': 'Cursor and other tools',

  // --- RunnerSettings
  'Execução pela conversa e heartbeat': 'Run from chat and heartbeat',
  'Começa uma rodada agora, mesmo com o heartbeat desligado': 'Starts a round now, even with the heartbeat off',
  'O botão "Trabalhar na fase" de um card roda o {tool} em segundo plano nesta pasta, sem ninguém aprovando cada passo. Aqui se define o que ele pode fazer nessas execuções ("Refinar com IA" roda só com o board, quando a ferramenta tem esse nível; sem ele, o pedido proíbe mexer em arquivos). O {tool} precisa estar instalado e autenticado nesta máquina{suffix}.':
    'A card\'s "Work on the phase" button runs {tool} in the background in this folder, with nobody approving each step. Here you set what it can do in those runs ("Refine with AI" runs with the board only when the tool has that level; without it, the request forbids touching files). {tool} must be installed and signed in on this machine{suffix}.',
  '; o board é entregue a ele em cada execução, sem depender do botão acima':
    '; the board is handed to it on every run, without depending on the button above',
  ', e o servidor do board conectado (botão acima)': ', and the board server connected (button above)',
  'Execução pela IA': 'Run by the AI',
  'O que a IA pode fazer': 'What the AI can do',
  'Só o board': 'Board only',
  'A IA lê o projeto e usa as ferramentas do board (conversa, anexos, status, mover cards). Não altera arquivos do projeto nem roda comandos.':
    'The AI reads the project and uses the board tools (conversation, attachments, status, moving cards). It does not change project files or run commands.',
  'Board e arquivos do projeto': 'Board and project files',
  'Além do board, a IA cria e altera arquivos do projeto sem pedir confirmação. Comandos de terminal continuam fora.':
    'Besides the board, the AI creates and changes project files without asking for confirmation. Terminal commands remain off limits.',
  'Sem restrições': 'No restrictions',
  'A IA altera arquivos e roda qualquer comando sem pedir confirmação. Use só em projetos e máquinas em que isso é aceitável.':
    'The AI changes files and runs any command without asking for confirmation. Use only on projects and machines where that is acceptable.',
  'Tempo limite por execução': 'Timeout per run',
  minutos: 'minutes',
  'Heartbeat ligado': 'Heartbeat on',
  'Com o heartbeat ligado e o board aberto nesta pasta (no editor ou pelo comando faz-ai), o board chama o {tool} sozinho a cada intervalo: ele trabalha nos cards prontos (um card aprovado vai para a próxima coluna na hora e é trabalhado na rodada seguinte), responde às mensagens pendentes, resume as conversas que cresceram, devolve para a IA os cards bloqueados por limite de uso, confere os pull requests mergeados e limpa branches e worktrees que sobraram, uma história por vez ou várias ao mesmo tempo, conforme o limite abaixo. Sem pendência, nada é executado.':
    'With the heartbeat on and the board open in this folder (in the editor or via the faz-ai command), the board calls {tool} on its own at each interval: it works on ready cards (an approved card moves to the next column right away and is worked on in the next round), answers pending messages, summarizes conversations that have grown, returns to the AI the cards blocked by a usage limit, checks merged pull requests and cleans up leftover branches and worktrees, one story at a time or several at once, up to the limit below. With nothing pending, nothing runs.',
  'Refinar os cards novos do Backlog': 'Refine new Backlog cards',
  'A cada rodada, o heartbeat refina os cards do Backlog ainda não refinados: a partir do título, a IA melhora a descrição, preenche os campos (modelo, skills, rules) e o checklist, e deixa o card aguardando a sua revisão. Aprovar leva o card para a primeira fase.':
    'On each round, the heartbeat refines the Backlog cards not yet refined: from the title, the AI improves the description, fills in the fields (model, skills, rules) and the checklist, and leaves the card waiting for your review. Approving moves the card to the first phase.',
  Intervalo: 'Interval',

  // --- ScopeGroup
  'A IA vê a descrição em toda sessão e decide quando usar': 'The AI sees the description in every session and decides when to use it',
  'Limpar seleção': 'Clear selection',

  // --- SkillFiles
  'Criar arquivo numa skill da pasta do usuário?': 'Create a file in a user-folder skill?',
  'Sem arquivos de apoio.': 'No support files.',
  Abrir: 'Open',
  'Apagar "{file}"?': 'Delete "{file}"?',
  'O arquivo sai da skill "{name}". Se o SKILL.md aponta para ele, ajuste o texto.':
    'The file is removed from the skill "{name}". If SKILL.md points to it, adjust the text.',
  'Pasta do arquivo': 'File folder',
  'Nome do arquivo': 'File name',
  'Citar no SKILL.md': 'Mention in SKILL.md',
  'As ferramentas só leem um arquivo de apoio quando o SKILL.md aponta para ele':
    'Tools only read a support file when SKILL.md points to it',

  // --- SkillRow
  Ligada: 'On',
  Desligada: 'Off',
  'Desligar: tira a skill do contexto das ferramentas de IA': "Turn off: removes the skill from the AI tools' context",
  'Ligar a skill': 'Turn the skill on',
  'Apagar a skill': 'Delete the skill',
  'Apagar a skill "{name}"?': 'Delete the skill "{name}"?',
  'A pasta da skill é removida do projeto, com todos os arquivos dela.':
    "The skill's folder is removed from the project, along with all its files.",

  // --- useItemActions e text.ts
  'O arquivo fica na sua pasta de usuário e vale para todos os seus projetos.':
    'The file stays in your user folder and applies to all your projects.',
  '{n} itens': '{n} items',
  'Copiar {what} para a pasta do usuário?': 'Copy {what} to the user folder?',
  Copiar: 'Copy',
  'Copiar {what} para o projeto?': 'Copy {what} to the project?',
  'Cada item vira uma cópia independente na pasta do projeto.': 'Each item becomes an independent copy in the project folder.',
  'Alterar skills da pasta do usuário?': 'Change user-folder skills?',
  'A mudança é gravada no arquivo da skill. {warning}': 'The change is written to the skill file. {warning}',
  Alterar: 'Change',
  'Apagar "{name}"?': 'Delete "{name}"?',
  'Apagar {n} itens?': 'Delete {n} items?',
  'A pasta da skill é removida, com todos os arquivos dela: {location}':
    "The skill's folder is removed, along with all its files: {location}",
  'O arquivo é removido: {location}': 'The file is removed: {location}',
  'Reler pastas': 'Reread folders',
  'Relendo as pastas e os plugins…': 'Rereading the folders and the plugins…',
  'Buscando a origem e procurando skills…': 'Fetching the source and looking for skills…',
  'Trocando a ferramenta e relendo o harness…': 'Switching the tool and rereading the harness…',
  'Rodar o heartbeat agora': 'Run the heartbeat now',
  'Buscar skills para instalar': 'Find skills to install',
  'Abrir no editor': 'Open in editor',
  'Histórias ao mesmo tempo': 'Stories at the same time',
  histórias: 'stories',
  'Tocar histórias em paralelo': 'Drive stories in parallel',
  'Ligado, o heartbeat toca várias histórias ao mesmo tempo, cada uma na sua própria pasta (worktree). Mais histórias em paralelo usam mais memória e processador e gastam mais do limite de uso da sua conta. O modo autônomo continua uma por vez, porque as histórias dele são empilhadas. As sub-tarefas independentes de cada história já rodam em paralelo, sem limite, conforme o plano.':
    'When on, the heartbeat drives several stories at once, each in its own folder (worktree). More stories in parallel use more memory and CPU and more of your account usage limit. Autonomous mode stays one at a time, because its stories are stacked. The independent sub-tasks of each story already run in parallel, with no limit, according to the plan.',
  'Só disponível no modo "Worktree por história" (Configurações > Git). Fora dele as histórias dividem a mesma pasta e causariam conflitos, então o heartbeat toca uma por vez.':
    'Only available in "Worktree por história" mode (Settings > Git). Outside it the stories share the same folder and would cause conflicts, so the heartbeat drives one at a time.',
  'Tocar histórias em paralelo agora fica no Settings do editor, em Faz AI › Git.':
    'Driving stories in parallel now lives in the editor Settings, under Faz AI › Git.',

  // --- BoardInstall
  'O registro será gravado em {where}.': 'The registration will be written to {where}.',
  'A skill será instalada em {where}.': 'The skill will be installed in {where}.',
  'Já existe uma skill "{name}" em {where}. Ela será substituída pela versão desta extensão, e o que foi ajustado nela se perde.':
    'A "{name}" skill already exists in {where}. It will be replaced by this extension\'s version, and any changes made to it will be lost.',
  'Instalar no global do {tool}?': 'Install globally in {tool}?',
  Substituir: 'Replace',
  'Servidor do board': 'Board server',
  'Skill do fluxo': 'Flow skill',
  'Servidor do board (faz-ai)': 'Board server (faz-ai)',
  'Skill do fluxo (faz-ai-fluxo)': 'Flow skill (faz-ai-fluxo)',
  'global: instalado': 'global: installed',
  'global: não instalado': 'global: not installed',
  'neste projeto: instalado': 'this project: installed',
  'neste projeto: não instalado': 'this project: not installed',
  'Deixa a IA ler e atualizar o board nas suas conversas. As execuções pelo board não dependem disso. Grava no global (<code>{user}</code>): vale em qualquer repositório aberto com o board, sem arquivo nenhum no projeto.':
    'Lets the AI read and update the board in your conversations. Runs from the board do not depend on it. Writes to the global config (<code>{user}</code>): it works in any repository opened with the board, with no file in the project.',
  'Ensina a IA a conduzir os cards pelo fluxo do board: fases, documentos, revisão e pendências. Instala em <code>{user}</code>, para todos os seus projetos.':
    'Teaches the AI to move cards through the board flow: phases, documents, review and pending items. Installs to <code>{user}</code>, for all your projects.',
  'Reinstalar (padrão da ferramenta)': 'Reinstall (tool default)',
  'Instalar (padrão da ferramenta)': 'Install (tool default)',
  'Reinstalar neste projeto': 'Reinstall in this project',
  'Instalar neste projeto': 'Install in this project',
  'A skill do fluxo do board é instalada em "Tudo que a ferramenta carrega" → {tool} → Skills: no global (padrão) ou neste projeto.':
    'The board flow skill is installed in "Everything the tool loads" → {tool} → Skills: globally (default) or in this project.',
  'No Cursor, o servidor do board fica em <code>{project}</code>, fora do git. O global do Cursor é um processo só para todas as janelas e não sabe qual board atender. O board grava este registro sozinho ao abrir no Cursor; se o "faz-ai" aparecer desligado em Cursor Settings → MCP, ligue.':
    'In Cursor, the board server lives in <code>{project}</code>, outside git. Cursor\'s global scope is a single process for all windows and cannot tell which board to serve. The board writes this registration on its own when it opens in Cursor; if "faz-ai" shows as off in Cursor Settings → MCP, turn it on.',
  // --- HarnessSettings (contexto vazio)
  Rules: 'Rules',
  // --- SelectionTable
  Sempre: 'Always',
  'Entra em toda execução do board (trabalhar a fase, refinar, chat), independente do card.':
    'Goes into every board run (work the phase, refine, chat), whatever the card.',
  'Pelo card': 'Per card',
  'Não entra sozinho: só quando o card o lista, pela escolha do planejamento, do "Refinar com IA" ou sua.':
    'Does not get in on its own: only when the card lists it, chosen by the planning, by "Refine with AI" or by you.',
  Desligado: 'Off',
  'Está no board, mas não entra em nenhuma execução até você ativar.': 'It is on the board, but gets into no run until you turn it on.',
  'Fora do board': 'Off the board',
  'Modo no board: {name}': 'Mode on the board: {name}',
  'Só o que está no board entra nas execuções; o resto fica invisível para elas.':
    'Only what is on the board goes into runs; the rest is invisible to them.',
  'Modo no board': 'Mode on the board',
  // --- AgentsTable
  'O {tool} não define agentes em arquivos; o board executa os cards com o agente embutido.':
    '{tool} does not define agents in files; the board runs cards with the built-in agent.',
  'Um agente é um arquivo de agente do {tool} em <code>{dir}</code>: as instruções são o papel da sessão, e o frontmatter diz o modelo, as ferramentas, as skills e os servidores MCP que ela recebe. <b>Disponível no board</b> é o que os cards e as fases podem escolher; o <b>padrão</b> executa quando nenhum deles escolhe.':
    'An agent is a {tool} agent file in <code>{dir}</code>: the instructions are the session role, and the frontmatter sets the model, tools, skills and MCP servers it gets. <b>Available on the board</b> is what cards and phases can pick; the <b>default</b> runs when none of them picks.',
  'A IA ainda está respondendo no chat do board.': 'The AI is still answering in the board chat.',
  'A IA lê o projeto e cria ou ajusta os agentes; acompanhe no chat do board.':
    'The AI reads the project and creates or adjusts the agents; follow it in the board chat.',
  'Sugerir agentes com IA': 'Suggest agents with AI',
  'Cria de novo os agentes de fábrica que não existem mais; não mexe nos que existem.':
    'Recreates the factory agents that no longer exist; leaves the existing ones alone.',
  'Recriar os agentes padrão': 'Recreate the default agents',
  'Agente novo': 'New agent',
  'Como este agente trabalha: padrões, comandos, o que nunca fazer': 'How this agent works: patterns, commands, what never to do',
  'Criar agente': 'Create agent',
  'Os cards e as fases podem escolher este agente; o padrão precisa estar disponível':
    'Cards and phases can pick this agent; the default must be available',
  'Disponível no board': 'Available on the board',
  'Disponível no board: {name}': 'Available on the board: {name}',
  'Criado pelo board; pode ser editado ou apagado': 'Created by the board; it can be edited or deleted',
  'de fábrica': 'factory',
  'Tornar padrão': 'Make default',
  'O arquivo é removido: {location}. Colunas e cards que usam este agente voltam ao padrão.':
    'The file is removed: {location}. Columns and cards using this agent fall back to the default.',
  'Nenhum agente do {tool} neste escopo.': 'No {tool} agent in this scope.',
  // --- AgentEditor
  'Uma frase: é por ela que o "Refinar com IA" escolhe o agente de um card.':
    'One sentence: it is how "Refine with AI" picks the agent for a card.',
  'O papel da sessão: como trabalha, padrões, comandos, o que nunca fazer. Vai inteiro para a IA.':
    'The session role: how it works, patterns, commands, what never to do. Goes to the AI in full.',
  'Lidas em toda execução com este agente, além das indicadas no card. Só as marcadas no Harness.':
    'Read in every run with this agent, besides the ones on the card. Only those checked in the Harness.',
  'Além do servidor do board, que vai sempre. Nada marcado = só o board.':
    'Besides the board server, which always goes. Nothing checked = board only.',
  // --- RunnerSettings (agente padrão)
  'Executa os cards que não escolhem um agente, nem pela fase. Só os agentes marcados como disponíveis no Harness.':
    'Runs the cards that pick no agent, not even through the phase. Only agents checked as available in the Harness.',
  'Agente embutido (sem instruções)': 'Built-in agent (no instructions)',
  'Agente padrão': 'Default agent',
  'agentes marcados como disponíveis': 'agents checked as available',
  // --- EXEC_ASPECTS
  'Skills e rules': 'Skills and rules',
  'Contexto vazio': 'Empty context',
  // --- Harness por ferramenta e por assunto
  'O projeto trabalha com uma ferramenta de IA por vez. Ela define o arquivo de regras, a pasta das skills, onde o servidor MCP é registrado e os modelos oferecidos nos cards. Pastas de outras ferramentas podem existir no projeto, mas o board não mexe nelas. O servidor MCP do board e a skill do fluxo são instalados na aba de cada ferramenta, nos assuntos MCPs e Skills, em Projeto.':
    "The project works with one AI tool at a time. It defines the rules file, the skills folder, where the MCP server is registered and the models offered on cards. Folders of other tools may exist in the project, but the board does not touch them. The board MCP server and the flow skill are installed in each tool's tab, under the MCPs and Skills topics, in Project.",
  'O que a IA pode usar nas execuções do board. <b>Ferramenta e execução</b> escolhe a IA, a permissão e o agente padrão; cada ferramenta tem a sua aba, com um assunto por vez, e em cada um a origem: Board, Projeto, Global ou Importados.':
    'What the AI may use in board runs. <b>Ferramenta e execução</b> (Tool and run) picks the AI, the permission and the default agent; each tool has its tab, one subject at a time, and in each one the origin: Board, Projeto, Global or Importados.',
  'Como funciona': 'How it works',
  'Como usar o Harness': 'How to use the Harness',
  '<b>Para que serve.</b> Toda execução do board parte de contexto vazio. Esta tela é o catálogo do que existe na sua máquina e no projeto; o <b>Board</b> é só o que a IA pode usar.':
    '<b>What it is for.</b> Every board run starts from an empty context. This screen is the catalog of what exists on your machine and in the project; the <b>Board</b> is only what the AI may use.',
  '<b>Por que assim.</b> Menos contexto por execução é resposta mais rápida, mais barata e mais precisa. O planejamento de cada card escolhe o mínimo entre o que está no Board.':
    '<b>Why this way.</b> Less context per run means faster, cheaper and more precise answers. The planning of each card picks the minimum among what is on the Board.',
  '<b>Por onde começar.</b> 1) Abra a aba da ferramenta do projeto e, em Skills e MCPs, use <b>Indicar artefatos</b> e envie ao Board. 2) Em Sub-agentes, crie um agente com ajuda. 3) Em Regras, revise as que entraram desligadas e ative as que valem.':
    "<b>Where to start.</b> 1) Open the project tool's tab and, in Skills and MCPs, use <b>Indicar artefatos</b> and send to the Board. 2) In Sub-agentes, create an agent with help. 3) In Regras, review the ones that entered off and turn on the ones that apply.",
  'Entendi, não mostrar de novo': 'Got it, do not show again',
  '{n} no board, {off} desligadas': '{n} on the board, {off} off',
  '{n} no board': '{n} on the board',
  'Nenhum agente no board: toda execução roda com o escopo cheio. Crie um em Projeto ou Global, com "Criar agente com ajuda" ou pelas sugestões prontas.':
    'No agent on the board: every run has the full scope. Create one in Projeto or Global, with "Criar agente com ajuda" or from the ready-made suggestions.',
  'Nenhuma regra no board. Envie as do projeto a partir de Projeto ou Global; elas entram desligadas, para você revisar antes de ativar.':
    'No rule on the board. Send the project ones from Projeto or Global; they enter off, for you to review before turning on.',
  'Nada neste assunto no board: o planejamento dos cards não tem de onde escolher. Vá a Projeto ou Global, use "Indicar artefatos" e envie ao board.':
    'Nothing of this subject on the board: the cards\' planning has nothing to pick from. Go to Projeto or Global, use "Indicar artefatos" and send to the board.',
  'Ir para Projeto': 'Go to Projeto',
  'Ir para Global': 'Go to Global',
  'Harness do {tool}': '{tool} harness',
  'Tudo que o {tool} carrega, por assunto. O <b>catálogo</b> (Projeto, Global e Importados) mostra o que existe e não ocupa o contexto da IA. Só o que você envia ao <b>Board</b> pode ser usado pelas execuções, no modo de cada artefato.':
    'Everything {tool} loads, by topic. The <b>catalog</b> (Project, Global and Imported) shows what exists and takes no space in the AI context. Only what you send to the <b>Board</b> can be used by runs, in the mode of each artifact.',
  'A linha de comando do {tool} não desliga artefatos: regras, servidores MCP e o mais que estiver no projeto entram no contexto conforme o {tool} decidir. Para o "tudo desligado" valer, desligue nas configurações do {tool} ou remova do projeto o que você não quer no contexto das tarefas. O board só avisa.':
    '{tool}\'s command line does not turn artifacts off: rules, MCP servers and anything else in the project enter the context as {tool} sees fit. For "everything off" to hold, turn them off in {tool}\'s settings or remove from the project what you do not want in the context of tasks. The board only warns.',
  'Sub-agentes': 'Sub-agents',
  MCPs: 'MCPs',
  Comandos: 'Commands',
  Demais: 'Other',
  'em Harness › Sub-agentes': 'in Harness › Sub-agents',
  'Origem dos artefatos': 'Origin of the artifacts',
  'O que você enviou ao board: só isso entra nas execuções, no modo de cada um (Sempre, Pelo card ou Desligado).':
    'What you sent to the board: only this gets into runs, in the mode of each one (Always, By card or Off).',
  'Arquivos desta pasta; valem só aqui.': 'Files in this folder; they apply only here.',
  'Arquivos da sua pasta de usuário; valem em todos os projetos.': 'Files in your user folder; they apply to all projects.',
  'Buscar por nome ou descrição': 'Search by name or description',
  'Buscar por nome ou descrição…': 'Search by name or description…',
  'Nada encontrado para a busca.': 'Nothing found for the search.',
  'As regras entram desligadas: escritas para outro contexto, elas podem conflitar com o fluxo e as definições do board (fases, aprovação, uso do MCP). Leia o texto de cada uma antes de ativar; regra ativa entra em toda execução.':
    'Rules come in off: written for another context, they may conflict with the board flow and settings (phases, approval, MCP use). Read the text of each one before turning it on; an active rule goes into every run.',
  'Remover do board': 'Remove from the board',
  'Remover do board: {name}': 'Remove from the board: {name}',
  ausente: 'missing',
  'O arquivo de origem não existe mais; os cards que o listam continuam intactos.':
    'The source file no longer exists; the cards that list it stay intact.',
  'Os cards e as fases podem escolher este agente.': 'Cards and phases may pick this agent.',
  'Enviar para o board': 'Send to the board',
  'Disponibiliza para os cards deste board; o board lê o arquivo da origem na hora de usar.':
    "Makes it available to this board's cards; the board reads the source file when using it.",
  'Pastas importadas:': 'Imported folders:',
  'Remover pasta': 'Remove folder',
  'Remover pasta: {dir}': 'Remove folder: {dir}',
  'Remover a pasta importada?': 'Remove the imported folder?',
  '{dir}\n\nOs artefatos dela saem do board e deixam de aparecer em Importados. A pasta em si não é tocada.':
    '{dir}\n\nIts artifacts leave the board and stop showing in Imported. The folder itself is not touched.',
  'Importar artefatos': 'Import artifacts',
  'Escolhe uma pasta e procura nela skills, agentes, comandos, hooks e servidores MCP no formato da ferramenta.':
    'Picks a folder and looks in it for skills, agents, commands, hooks and MCP servers in the format of the tool.',
  'Caminho da pasta a importar': 'Path of the folder to import',
  'Caminho da pasta, no computador onde o board roda': 'Folder path, on the computer where the board runs',
  Importar: 'Import',

  // --- Editor de agentes por ferramenta e assistentes de criação
  'Marque as que o agente pode usar; nada marcado = as que o nível de permissão da execução libera.':
    "Check the ones the agent may use; nothing checked = the ones the run's permission level allows.",
  'Retiradas do agente mesmo que o nível de permissão as libere.': 'Removed from the agent even if the permission level allows them.',
  '{n} negadas': '{n} denied',
  'Nenhuma negada': 'None denied',
  Negar: 'Deny',
  'Como o agente roda': 'How the agent runs',
  'O {tool} não tem lista de ferramentas, skills nem servidores MCP por agente: ele herda tudo da conversa principal.':
    '{tool} has no list of tools, skills or MCP servers per agent: it inherits everything from the main conversation.',
  'Somente leitura': 'Read-only',
  'Não edita arquivos nem roda comandos que mudem estado.': 'Does not edit files or run commands that change state.',
  'Em segundo plano': 'In the background',
  'Roda sem a conversa esperar pelo resultado.': 'Runs without the conversation waiting for the result.',
  'Marcar uma ferramenta deste grupo amplia o que o agente pode fazer.': 'Checking a tool in this group widens what the agent can do.',
  'amplia o escopo': 'widens the scope',
  'Acrescentar servidor MCP': 'Add MCP server',
  'Acrescentar servidor MCP…': 'Add MCP server…',
  'Tirar {name} da lista': 'Remove {name} from the list',
  'Passo {n} de {total}': 'Step {n} of {total}',
  Passos: 'Steps',
  Continuar: 'Continue',
  'Exemplo:': 'Example:',
  'Tirar {item}': 'Remove {item}',
  Tirar: 'Remove',
  'Nova linha: {label}': 'New line: {label}',
  'O {tool} não aceita {what} no arquivo do agente: ele herda tudo da conversa principal.':
    '{tool} does not accept {what} in the agent file: it inherits everything from the main conversation.',
  'Pode continuar.': 'You can continue.',
  'Criar agente com ajuda': 'Create agent with help',
  'Para que este agente existe? Diga o papel e o objetivo dele.': 'What is this agent for? Describe its role and goal.',
  'Revisa o diff de uma branch antes do pull request e aponta bugs, sem alterar nada.':
    "Reviews a branch's diff before the pull request and points out bugs, changing nothing.",
  Diretriz: 'Guideline',
  'Quanto mais estreito o papel, menos ferramentas e contexto o agente precisa.':
    'The narrower the role, the fewer tools and context the agent needs.',
  'Que ferramentas ele precisa? O conjunto mínimo para a diretriz já vem sugerido.':
    'Which tools does it need? The minimum set for the guideline is already suggested.',
  'Read, Grep e Glob para ler o código, e Bash só para git diff.': 'Read, Grep and Glob to read the code, and Bash only for git diff.',
  'Sugestão para o que você descreveu': 'Suggestion for what you described',
  'Usar a sugestão': 'Use the suggestion',
  'Estas escolhas ampliam o escopo do agente: {names}.': "These choices widen the agent's scope: {names}.",
  'Nada marcado: o agente usa as ferramentas que o nível de permissão da execução libera.':
    "Nothing checked: the agent uses the tools the run's permission level allows.",
  'O agente pode alterar o projeto?': 'May the agent change the project?',
  'Somente leitura, para um revisor que só aponta problemas.': 'Read-only, for a reviewer that only points out problems.',
  'lista de ferramentas': 'a list of tools',
  'Pela diretriz, o agente parece precisar editar arquivos.': 'From the guideline, the agent seems to need to edit files.',
  'Pela diretriz, o agente parece só precisar ler: somente leitura é o mais seguro.':
    'From the guideline, the agent seems to only need to read: read-only is the safest.',
  'Precisa de algum servidor MCP além do do board?': "Does it need any MCP server besides the board's?",
  'Nenhum: o servidor do board já cobre o que um revisor faz.': "None: the board's server already covers what a reviewer does.",
  'O servidor do board vai sempre, sem marcar.': "The board's server always goes along, no need to check it.",
  'Nenhum outro servidor no board. Envie-os pela aba MCPs.': 'No other server on the board. Send them from the MCPs tab.',
  'servidores MCP': 'MCP servers',
  'Alguma skill de apoio? Vale uma por assunto.': 'Any supporting skill? One per subject.',
  'Nenhuma, ou só a skill de revisão de código do projeto.': "None, or only the project's code review skill.",
  'Sugeridas pela diretriz': 'Suggested by the guideline',
  'Você marcou {n} skills: confira se cada uma é de um assunto diferente.':
    'You checked {n} skills: make sure each one is about a different subject.',
  'Nenhuma skill no board em "Pelo card". Envie-as pela aba Skills.':
    'No skill on the board set to "Per card". Send them from the Skills tab.',
  skills: 'skills',
  'Que modelo e esforço ele usa?': 'Which model and effort does it use?',
  'O menor modelo com esforço baixo, para um agente que só lê e revisa.':
    'The smallest model with low effort, for an agent that only reads and reviews.',
  'Sugestão: {model}': 'Suggestion: {model}',
  'Como ele trabalha? O rascunho sai das respostas; acrescente o que o projeto exige e ajuste o texto.':
    'How does it work? The draft comes from your answers; add what the project requires and adjust the text.',
  'Siga o padrão de testes de test/. Nunca rode comandos que mudem o repositório.':
    'Follow the test pattern in test/. Never run commands that change the repository.',
  'Padrões e comandos do projeto': 'Project standards and commands',
  'Um por linha. Opcional.': 'One per line. Optional.',
  'O que ele nunca faz': 'What it never does',
  'Refazer o rascunho com as respostas': 'Redo the draft from the answers',
  'Confira o agente inteiro. Nada é gravado antes de Criar agente.': 'Check the whole agent. Nothing is written before Create agent.',
  'as do nível de permissão': 'the ones the permission level allows',
  nenhuma: 'none',
  'Como roda': 'How it runs',
  'somente leitura': 'read-only',
  'pode editar': 'can edit',
  'em segundo plano': 'in the background',
  'o da sessão': "the session's",
  'Um passo a passo com exemplos e sugestões para criar um agente de escopo reduzido.':
    'A step-by-step guide with examples and suggestions to create a narrow-scope agent.',
  'Sugestões prontas': 'Ready-made suggestions',
  'Sugestões prontas:': 'Ready-made suggestions:',
  'Abre o assistente com as respostas preenchidas, para você ajustar e confirmar.':
    'Opens the assistant with the answers filled in, for you to adjust and confirm.',
  'Criar regra com ajuda': 'Create rule with help',
  'Acrescentar ao arquivo': 'Add to the file',
  'Criar regra': 'Create rule',
  'Onde a regra vale: em todo o projeto ou só num assunto?': 'Where does the rule apply: the whole project or only one subject?',
  'Só nos arquivos de teste': 'Only in test files',
  'Este escopo não tem onde gravar regras para a ferramenta escolhida.': 'This scope has nowhere to write rules for the chosen tool.',
  'Onde a regra vale': 'Where the rule applies',
  'Principal (todo o projeto)': 'Main (whole project)',
  'Por assunto': 'By subject',
  'A regra principal entra no começo de toda conversa. Num arquivo que já existe, o texto é acrescentado no fim.':
    'The main rule goes in at the start of every conversation. In a file that already exists, the text is added at the end.',
  'acrescenta ao existente': 'adds to the existing one',
  'Uma regra nova em {path}.': 'A new rule in {path}.',
  'Com caminhos, o Claude Code só a lê quando mexe nesses arquivos (paths no topo do arquivo).':
    'With paths, Claude Code only reads it when working on those files (paths at the top of the file).',
  'Com caminhos, o Cursor só a aplica a esses arquivos (globs no topo do arquivo).':
    'With paths, Cursor only applies it to those files (globs at the top of the file).',
  'Caminhos (opcional)': 'Paths (optional)',
  'Separados por vírgula. Vazio = vale sempre que a regra for lida.': 'Comma-separated. Empty = applies whenever the rule is read.',
  'O que a regra garante? Uma regra por linha, no imperativo.': 'What does the rule guarantee? One rule per line, in the imperative.',
  'Mensagens de commit em português, no imperativo, sem ponto final.':
    'Commit messages in Portuguese, in the imperative, with no final period.',
  'A regra': 'The rule',
  'Ideias de regra': 'Rule ideas',
  'Quer incluir alguma convenção do projeto? Marque as que valem.': 'Want to include any project convention? Check the ones that apply.',
  'Rode os testes com npm run test antes de dizer que terminou.': 'Run the tests with npm run test before saying you are done.',
  'Lendo o projeto…': 'Reading the project…',
  'Não achei convenções no projeto para sugerir. Pode continuar.': 'I found no conventions in the project to suggest. You can continue.',
  'Desmarcar todas': 'Uncheck all',
  'Marcar todas': 'Check all',
  'Confiro o texto contra o fluxo do board (fases, aprovação, servidor MCP, branches).':
    "I check the text against the board's flow (phases, approval, MCP server, branches).",
  'Não use MCP; commit direto na main; pule a aprovação.': 'Do not use MCP; commit straight to main; skip the approval.',
  'Nenhum trecho conflita com o fluxo do board.': "No passage conflicts with the board's flow.",
  'A regra entra no board desligada: você a revisa e ativa depois, na lista de regras.':
    'The rule enters the board switched off: you review and activate it later, in the rules list.',
  'Confira o rascunho. Nada é gravado antes do botão de baixo.': 'Check the draft. Nothing is written before the button below.',
  '(acrescenta ao fim do arquivo)': '(added to the end of the file)',
  'Desligada, até você ativar': 'Off, until you activate it',
  'Texto da regra': 'Rule text',
  'Estes trechos podem conflitar com o fluxo do board:': "These passages may conflict with the board's flow:",
  'Criar skill com ajuda': 'Create skill with help',
  'Que tarefa a skill ensina? Uma frase: ela vira a descrição da skill.':
    "What task does the skill teach? One sentence: it becomes the skill's description.",
  'Escrever uma migração nova do banco, subindo a versão do schema e sem editar migração antiga.':
    'Write a new database migration, bumping the schema version and without editing old migrations.',
  'A tarefa': 'The task',
  'Uma tarefa só: skill estreita é mais precisa e pesa menos no contexto.':
    'One task only: a narrow skill is more precise and weighs less on the context.',
  'Este escopo não tem pasta de skills para a ferramenta escolhida.': 'This scope has no skills folder for the chosen tool.',
  'Quando a IA deve usá-la? Diga os tipos de pedido ou de arquivo.': 'When should the AI use it? Name the kinds of request or file.',
  'o pedido falar de migração, schema ou banco de dados, ou mexer em arquivos de src/db/':
    'the request mentions migrations, schema or the database, or touches files in src/db/',
  'Use quando…': 'Use when…',
  'Entra na descrição; é por ela que você indica a skill num card com segurança.':
    'It goes in the description; that is how you can safely pick the skill on a card.',
  'Qual é o passo a passo? Ajuste os que proponho a partir do projeto.': 'What are the steps? Adjust the ones I propose from the project.',
  'Ler a última migração, escrever a nova com o próximo número, rodar os testes.':
    'Read the latest migration, write the new one with the next number, run the tests.',
  Passo: 'Step',
  'Mais um passo…': 'One more step…',
  'Voltar aos passos propostos': 'Back to the proposed steps',
  'O que a skill nunca faz? Limites deixam o escopo pequeno.': 'What does the skill never do? Limits keep the scope small.',
  'Nunca edita uma migração que já foi publicada.': 'Never edits a migration that was already published.',
  Limite: 'Limit',
  'Mais um limite…': 'One more limit…',
  'Precisa de arquivos de apoio? Opcional.': 'Does it need supporting files? Optional.',
  'references/ultima-migracao.md, com um exemplo de migração do projeto.':
    'references/latest-migration.md, with a migration example from the project.',
  'Novo arquivo de apoio': 'New supporting file',
  'Use pasta/arquivo.ext, com letras, números, hífen, ponto e sublinhado.':
    'Use folder/file.ext, with letters, numbers, hyphen, dot and underscore.',
  'Nenhum arquivo de apoio.': 'No supporting files.',
  'Os arquivos são criados vazios na pasta da skill; escreva o conteúdo depois.':
    'The files are created empty in the skill folder; write the content afterwards.',
  'Confira a skill. Nada é gravado antes do botão de baixo.': 'Check the skill. Nothing is written before the button below.',
  'Nome da skill': 'Skill name',
  'Pelo card: só entra quando um card a indica': 'Per card: only goes in when a card picks it',
  'SKILL.md': 'SKILL.md',
  'Um passo a passo para escrever uma regra no formato da ferramenta; ela entra no board desligada.':
    "A step-by-step guide to write a rule in the tool's format; it enters the board switched off.",
  'Um passo a passo para escrever uma skill no formato da ferramenta; ela entra no board em "Pelo card".':
    'A step-by-step guide to write a skill in the tool\'s format; it enters the board as "Per card".',
  'A IA lê o projeto e escreve de 3 a 5 regras, desligadas no board; acompanhe no chat do board.':
    'The AI reads the project and writes 3 to 5 rules, switched off on the board; follow along in the board chat.',
  'A IA lê o projeto e cria de 3 a 5 skills, em "Pelo card"; acompanhe no chat do board.':
    'The AI reads the project and creates 3 to 5 skills, set to "Per card"; follow along in the board chat.',
  'Sugerir regras com IA': 'Suggest rules with AI',
  'Sugerir skills com IA': 'Suggest skills with AI',
  Leitura: 'Reading',
  'Lê e busca no projeto; não muda nada.': 'Reads and searches the project; changes nothing.',
  'Lê arquivos.': 'Reads files.',
  'Encontra arquivos pelo nome ou padrão.': 'Finds files by name or pattern.',
  'Busca texto dentro dos arquivos.': 'Searches for text inside files.',
  'Consulta definições e referências de código.': 'Looks up code definitions and references.',
  'Lista os recursos que os servidores MCP oferecem.': 'Lists the resources MCP servers offer.',
  'Lê um recurso de um servidor MCP.': 'Reads a resource from an MCP server.',
  'Procura ferramentas disponíveis.': 'Searches for available tools.',
  'Edição de arquivos': 'File editing',
  'Muda arquivos do projeto.': 'Changes project files.',
  'Altera trechos de um arquivo.': 'Changes parts of a file.',
  'Cria ou sobrescreve um arquivo.': 'Creates or overwrites a file.',
  'Edita células de um notebook Jupyter.': 'Edits cells of a Jupyter notebook.',
  'Roda comandos no seu computador.': 'Runs commands on your computer.',
  'Roda comandos no terminal.': 'Runs commands in the terminal.',
  'Roda comandos no PowerShell.': 'Runs commands in PowerShell.',
  'Acompanha um processo em segundo plano; pode abrir conexões de rede.': 'Watches a background process; may open network connections.',
  Rede: 'Network',
  'Acessa a internet.': 'Accesses the internet.',
  'Baixa e lê uma página.': 'Downloads and reads a page.',
  'Pesquisa na web.': 'Searches the web.',
  'Outros agentes': 'Other agents',
  'Lança ou conversa com outros agentes.': 'Launches or talks to other agents.',
  'Lança outro agente para uma parte do trabalho.': 'Launches another agent for part of the work.',
  'Manda uma mensagem a outro agente.': 'Sends a message to another agent.',
  'Lista os agentes em execução.': 'Lists the running agents.',
  Outras: 'Others',
  'Organização do trabalho; não ampliam o que o agente alcança.': 'Work organization; they do not widen what the agent reaches.',
  'Invoca skills; sem ela o agente não invoca nenhuma.': 'Invokes skills; without it the agent invokes none.',
  'Cria uma tarefa na lista da sessão.': 'Creates a task in the session list.',
  'Lê uma tarefa da lista.': 'Reads a task from the list.',
  'Lista as tarefas da sessão.': "Lists the session's tasks.",
  'Atualiza uma tarefa da lista.': 'Updates a task in the list.',
  'Mantém a lista de afazeres da sessão.': "Keeps the session's to-do list.",
  'Entra numa worktree do git.': 'Enters a git worktree.',
  'Sai da worktree.': 'Leaves the worktree.',
  'Agenda uma tarefa recorrente.': 'Schedules a recurring task.',
  'Remove uma tarefa agendada.': 'Removes a scheduled task.',
  'Lista as tarefas agendadas.': 'Lists the scheduled tasks.',
  'Revisor somente leitura': 'Read-only reviewer',
  'Escritor de testes': 'Test writer',
  'Redator de documentação': 'Documentation writer',
  'Executor de migrações': 'Migration runner',
  'Para que serve': 'What it is for',
  'Skills de apoio': 'Supporting skills',
  Resumo: 'Summary',
  'Onde vale': 'Where it applies',
  'O que garante': 'What it guarantees',
  'Convenções do projeto': 'Project conventions',
  'Conflito com o board': 'Conflict with the board',
  'Rascunho e resumo': 'Draft and summary',
  'Que tarefa ensina': 'Task it teaches',
  'Quando usar': 'When to use',
  'Passo a passo': 'Steps',
  'O que nunca faz': 'What it never does',
  'Arquivos de apoio': 'Supporting files',
  'lê os arquivos do projeto': "reads the project's files",
  'busca texto nos arquivos': 'searches for text in files',
  'encontra arquivos pelo nome': 'finds files by name',
  'altera trechos dos arquivos': 'changes parts of files',
  'cria arquivos novos': 'creates new files',
  'roda comandos do projeto (testes, formatação)': 'runs project commands (tests, formatting)',
  'roda os comandos que a tarefa pede': 'runs the commands the task asks for',
  'lê o diff com git (instrua o agente a usar só comandos de leitura)':
    'reads the diff with git (tell the agent to use read-only commands only)',
  'lê páginas da internet': 'reads pages from the internet',
  'pesquisa na web': 'searches the web',
  'Ler e revisar não pede muito raciocínio: o menor modelo do catálogo com esforço baixo sai mais barato e rápido.':
    'Reading and reviewing do not take much reasoning: the smallest model in the catalog with low effort is cheaper and faster.',
  'Planejar, projetar ou implementar pede mais raciocínio: um modelo maior dá menos retrabalho.':
    'Planning, designing or implementing takes more reasoning: a larger model means less rework.',
  'O board conduz a IA pelo servidor MCP: sem ele a IA não lê o card nem registra o andamento.':
    'The board drives the AI through the MCP server: without it the AI neither reads the card nor records progress.',
  'O board decide o que a IA faz em cada fase; mandar ignorá-lo desfaz o fluxo.':
    'The board decides what the AI does in each phase; telling it to ignore the board undoes the flow.',
  'Nas fases com aprovação a IA entrega para revisão e para; pedir que não peça revisão quebra essa parada.':
    'In phases with approval the AI hands over for review and stops; telling it not to ask for review breaks that stop.',
  'A aprovação da pessoa é o que libera o card para a próxima fase; pulá-la quebra o fluxo.':
    "The person's approval is what releases the card to the next phase; skipping it breaks the flow.",
  'O board trabalha numa branch por história e entrega por pull request; commit direto na main passa por cima disso.':
    'The board works on one branch per story and delivers by pull request; committing straight to main bypasses that.',
  'O board prepara uma branch e uma worktree para cada história; proibir a branch impede a IA de entregar pelo fluxo.':
    'The board prepares a branch and a worktree for each story; forbidding the branch stops the AI from delivering through the flow.',
  'Mover o card é como a IA sinaliza o progresso no board.': 'Moving the card is how the AI signals progress on the board.',
  'Quando falta informação a IA pergunta pelo board (ask_question); proibir perguntas a deixa decidir no escuro.':
    'When information is missing the AI asks through the board (ask_question); forbidding questions leaves it deciding in the dark.',
  Commits: 'Commits',
  Testes: 'Tests',
  Comentários: 'Comments',
  Escopo: 'Scope',
  'Linguagens: {list}': 'Languages: {list}',
  'Comando {name}: {cmd}': 'Command {name}: {cmd}',
  'Ferramenta: {name}': 'Tool: {name}',
  'Pastas principais: {list}': 'Main folders: {list}',
  'Arquivos de teste': 'Test files',
  'Pasta {name}': 'Folder {name}',
  'Relê as pastas do projeto e a global e atualiza o catálogo; espera também a lista de plugins da ferramenta.':
    "Rereads the project and global folders and refreshes the catalog; also waits for the tool's plugin list.",
  'Limpa a pré-seleção indicada pela IA; nada foi enviado ao board.':
    "Clears the AI's suggested pre-selection; nothing was sent to the board.",
  'Vai a "Ferramenta deste projeto", na aba Ferramenta e execução.':
    'Goes to "Ferramenta deste projeto" (project tool), in the Ferramenta e execução tab.',
  'Abre o formulário de um agente novo; o arquivo é gravado na pasta da ferramenta ao salvar.':
    "Opens the form for a new agent; the file is written to the tool's folder on save.",
  'Fecha o editor; o que não foi salvo se perde.': 'Closes the editor; unsaved changes are lost.',
  'Abre o editor do agente logo abaixo da linha.': 'Opens the agent editor right below the row.',
  'Grava o registro do board em .cursor/mcp.json, na pasta do projeto.':
    "Writes the board's entry to .cursor/mcp.json, in the project folder.",
  'Registra o servidor do board no global da ferramenta: vale em todos os projetos, sem arquivo no repositório.':
    "Registers the board server in the tool's global config: valid in every project, with no file in the repository.",
  'Instala a skill na sua pasta de usuário: vale em todos os projetos.': 'Installs the skill in your user folder: valid in every project.',
  'Tira do board; o arquivo de origem não é tocado.': 'Removes it from the board; the source file is not touched.',
  'Tira os marcados do board; os arquivos de origem ficam.': 'Removes the checked ones from the board; the source files stay.',
  'Pede confirmação e apaga do disco os arquivos marcados.': 'Asks for confirmation and deletes the checked files from disk.',
  'Pede confirmação e tira as entradas marcadas do arquivo de configurações.':
    'Asks for confirmation and removes the checked entries from the settings file.',
  'Desmarca tudo; nada muda.': 'Unchecks everything; nothing changes.',
  'Procura skills numa pasta ou num repositório git e mostra a lista antes de copiar qualquer coisa.':
    'Looks for skills in a folder or a git repository and shows the list before copying anything.',
  'Acrescenta uma regra de permissão ao arquivo de configurações da ferramenta.': "Adds a permission rule to the tool's settings file.",
  'Acrescenta um hook ao arquivo de configurações da ferramenta.': "Adds a hook to the tool's settings file.",
  'Registra um servidor MCP no arquivo da ferramenta.': "Registers an MCP server in the tool's file.",
  'Cria um arquivo novo deste assunto na pasta da ferramenta e o abre para editar.':
    "Creates a new file of this subject in the tool's folder and opens it for editing.",
  'Cria a skill de referências do projeto, com a pasta references/ para modelos e exemplos.':
    "Creates the project's references skill, with the references/ folder for templates and examples.",
  'Cria este arquivo na pasta indicada e o abre para editar.': 'Creates this file in the folder shown and opens it for editing.',
  'Pede confirmação e tira a pasta e os artefatos dela do board; a pasta no disco não é tocada.':
    'Asks for confirmation and removes the folder and its artifacts from the board; the folder on disk is not touched.',
  'Informe a origem: dono/repositório, endereço git ou o caminho de uma pasta.':
    'Enter the source: owner/repository, a git address or a folder path.',
  'Clona ou lê a origem numa pasta temporária, sem rodar nada, e lista as skills encontradas.':
    'Clones or reads the source into a temporary folder, without running anything, and lists the skills found.',
  'Marca todas as skills que podem ser instaladas.': 'Checks every skill that can be installed.',
  'Descarta a lista e apaga a pasta temporária; nada foi instalado.':
    'Discards the list and deletes the temporary folder; nothing was installed.',
  'Marque pelo menos uma skill.': 'Check at least one skill.',
  'Copia as pastas das skills marcadas para o destino escolhido.': 'Copies the folders of the checked skills to the chosen destination.',
  'Mostra as referências, os modelos e os scripts da pasta da skill.': "Shows the references, templates and scripts in the skill's folder.",
  'Pede confirmação e apaga o arquivo (ou a pasta da skill) do disco.':
    "Asks for confirmation and deletes the file (or the skill's folder) from disk.",
  'A ferramenta ainda está aplicando a ação anterior.': 'The tool is still applying the previous action.',
  'Pede à ferramenta para desativar os plugins marcados; vale na próxima sessão dela.':
    'Asks the tool to disable the checked plugins; takes effect in its next session.',
  'Pede à ferramenta para ativar os plugins marcados; vale na próxima sessão dela.':
    'Asks the tool to enable the checked plugins; takes effect in its next session.',
  'Pede confirmação e desinstala os plugins marcados pela ferramenta.':
    'Asks for confirmation and uninstalls the checked plugins through the tool.',
  'O que a IA pode usar nas execuções do board. <b>Ferramenta e execução</b> escolhe a IA, a permissão e o agente padrão; cada ferramenta tem a sua aba: primeiro onde olhar (Board, Projeto, Global ou Importados), depois um assunto por vez.':
    'What the AI can use in board runs. <b>Ferramenta e execução</b> (tool and execution) picks the AI, the permission and the default agent; each tool has its own tab: first where to look (Board, Projeto, Global or Importados), then one subject at a time.',
  'Tudo que o {tool} carrega. Escolha onde olhar e depois o assunto: o <b>catálogo</b> (Projeto, Global e Importados) mostra o que existe e não ocupa o contexto da IA; só o que você envia ao <b>Board</b> pode ser usado pelas execuções, no modo de cada artefato.':
    'Everything {tool} loads. Pick where to look and then the subject: the <b>catalog</b> (Projeto, Global and Importados) shows what exists and takes no space in the AI context; only what you send to the <b>Board</b> can be used by runs, in the mode of each artifact.',
  'Este assunto não entra no board: a ferramenta carrega esses arquivos por conta própria. Veja em Projeto ou Global.':
    'This subject does not go on the board: the tool loads these files on its own. See Projeto or Global.',
  'Contrato de contexto: {name}': 'Context contract: {name}',
  'Rascunho v1. Salvar não altera a execução legada. A admissão por capacidades ainda está indisponível (#729).':
    'Version 1 draft. Saving does not change legacy execution. Capability admission is still unavailable (#729).',
  'Papel do agente': 'Agent role',
  'Instruções do contrato': 'Contract instructions',
  'Skills essenciais': 'Essential skills',
  'Entram em toda atividade deste agente.': 'Included in every activity of this agent.',
  'Skills sugeridas': 'Suggested skills',
  'São sugestões para a atividade; não entram antecipadamente no contexto.':
    'Suggestions for the activity; they are not loaded into context in advance.',
  'MCPs permitidos': 'Allowed MCPs',
  'Delimitam os MCPs que uma atividade pode selecionar; não ativam servidores por si só.':
    'Limit which MCPs an activity can select; they do not activate servers by themselves.',
  'Nenhum recurso deste tipo cadastrado.': 'No resources of this type registered.',
  'Restrições de ferramentas': 'Tool restrictions',
  'Categorias solicitadas no contrato. A tradução e a imposição dependem da admissão do executor. Lista vazia não concede todas as ferramentas.':
    'Categories requested in the contract. Translation and enforcement depend on executor admission. An empty list does not grant all tools.',
  'Ferramenta das restrições nativas': 'Tool for native restrictions',
  'Permitir nativas (uma por linha)': 'Allow native tools (one per line)',
  'Negar nativas (uma por linha)': 'Deny native tools (one per line)',
  'Prévia do contrato com essenciais e itens Sempre. Complementos da atividade não estão selecionados.':
    'Contract preview with essentials and Always items. Activity additions are not selected.',
  'O contrato mudou em outra edição. Feche e abra novamente para carregar a revisão atual.':
    'The contract changed in another editor. Close and reopen to load the current revision.',
  'Salvar rascunho do contrato': 'Save contract draft',
  'Prévia do contrato': 'Contract preview',
  'Editar contrato de contexto (rascunho)': 'Edit context contract (draft)',
  'Fase no card': 'Card phase',
  'Ação no card': 'Card action',
  'Fase no workflow': 'Workflow phase',
  'Ação no workflow': 'Workflow action',
  'Fase no board': 'Board phase',
  'Ação no board': 'Board action',
  'Essencial do agente': 'Agent essential',
  'Admissão indisponível (#729). Esta prévia não autoriza execução.':
    'Admission unavailable (#729). This preview does not authorize execution.',
  'O alvo da atividade não pertence ao board ou à fase indicada.':
    'The activity target does not belong to the board or the selected phase.',
  'Seleção de contexto inválida.': 'Invalid context selection.',
  'Escolha um agente válido para a atividade.': 'Choose a valid agent for the activity.',
  'O agente ainda não tem contrato v1.': 'The agent does not have a v1 contract yet.',
  'O contrato do agente é inválido.': 'The agent contract is invalid.',
  'Recurso ausente.': 'Missing resource.',
  'Recurso desligado ou indisponível.': 'Resource disabled or unavailable.',
  'O recurso tem um tipo diferente do esperado.': 'The resource has a different type than expected.',
  'MCP fora do contrato do agente.': 'MCP outside the agent contract.',
  'Anexo de entrada ausente.': 'Missing input attachment.',
  'Anexo de entrada de outro board.': 'Input attachment from another board.',
  Indisponível: 'Unavailable',
  Nenhuma: 'None',
};
