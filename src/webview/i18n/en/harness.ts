export const harness: Record<string, string> = {
  // --- HarnessSettings
  'Harness de IA': 'AI harness',
  'O que a IA lê e usa neste projeto. <b>Ferramenta e execução</b> escolhe com qual IA o board trabalha; <b>Do projeto</b> reúne o que faz parte do repositório e é editável aqui; <b>Tudo que a ferramenta carrega</b> mostra também o que vem da sua pasta de usuário e de plugins.':
    'What the AI reads and uses in this project. <b>Tool and execution</b> chooses which AI the board works with; <b>From the project</b> gathers what is part of the repository and can be edited here; <b>Everything the tool loads</b> also shows what comes from your user folder and from plugins.',
  'Ferramenta e execução': 'Tool and execution',
  'Do projeto': 'From the project',
  'Tudo que a ferramenta carrega': 'Everything the tool loads',
  'Tudo aqui são arquivos da pasta do projeto: vão no repositório e valem para quem trabalha nele.':
    'Everything here is files in the project folder: they go in the repository and apply to everyone working on it.',

  // --- HarnessInventory
  'Tudo que cada ferramenta carrega': 'Everything each tool loads',
  'Relê as pastas do projeto e do usuário': 'Re-reads the project and user folders',
  'O que cada ferramenta de IA lê neste projeto e na sua pasta de usuário, separado por escopo. <b>Projeto</b> vale só aqui; <b>Global</b> vale em todos os seus projetos; <b>Plugins</b> vem de pacotes instalados e não pode ser alterado, mas pode ser copiado. "Abrir" mostra o arquivo no editor, onde ele também é editado.':
    'What each AI tool reads in this project and in your user folder, split by scope. <b>Project</b> applies only here; <b>Global</b> applies to all your projects; <b>Plugins</b> come from installed packages and cannot be changed, but can be copied. "Open" shows the file in the editor, where it is also edited.',
  'deste projeto': 'this project',
  'não encontrada': 'not found',
  'Sem sinal de instalação nesta máquina: {tools}.': 'No sign of installation on this machine: {tools}.',

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
  'Abre o arquivo no editor, onde ele pode ser alterado': 'Opens the file in the editor, where it can be changed',
  'Abre o arquivo no editor': 'Opens the file in the editor',
  'Modo da skill {name}': 'Mode of skill {name}',
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
  'Plugins são instalados e removidos pela própria ferramenta, {where}:': 'Plugins are installed and removed by the tool itself, {where}:',
  'no terminal': 'in the terminal',
  'no Cursor (Customize → Plugins) ou numa sessão do agente': 'in Cursor (Customize → Plugins) or in an agent session',
  'numa sessão do Kimi Code': 'in a Kimi Code session',
  'claude plugin marketplace add <dono/repositorio>': 'claude plugin marketplace add <owner/repository>',
  'codex plugin marketplace add <dono/repositorio>': 'codex plugin marketplace add <owner/repository>',
  'gh skill search <termo>': 'gh skill search <term>',
  'agent plugin marketplace add <endereço git>': 'agent plugin marketplace add <git URL>',
  '/plugins install <pasta, zip ou endereço do GitHub>': '/plugins install <folder, zip or GitHub URL>',
  'Para aproveitar só uma skill de um plugin ou de um repositório, use "Buscar skills para instalar" na seção Skills, ou "Copiar para o projeto" na skill do plugin.':
    'To use just one skill from a plugin or a repository, use "Find skills to install" in the Skills section, or "Copy to the project" on the plugin skill.',
  'Um hook é um comando que a ferramenta roda sozinha no seu computador. Só acrescente comandos que você conhece.':
    'A hook is a command the tool runs on its own on your computer. Only add commands you know.',
  'Os hooks do Kimi Code ficam no <code>~/.kimi-code/config.toml</code> (<code>[[hooks]]</code>): aparecem aqui e são editados no arquivo.':
    'Kimi Code hooks live in <code>~/.kimi-code/config.toml</code> (<code>[[hooks]]</code>): they show up here and are edited in the file.',
  'Os servidores do <code>~/.claude.json</code> aparecem aqui, mas são alterados pelo Claude Code: <code>claude mcp add --scope user …</code> e <code>claude mcp remove …</code>.':
    'The servers in <code>~/.claude.json</code> show up here, but are changed by Claude Code: <code>claude mcp add --scope user …</code> and <code>claude mcp remove …</code>.',
  '{n} skills automáticas: as descrições delas, {chars} caracteres ao todo, entram em toda sessão do {tool}. As demais só são lidas quando indicadas.':
    '{n} automatic skills: their descriptions, {chars} characters in total, go into every {tool} session. The others are only read when indicated.',

  // --- Escopos
  Projeto: 'Project',
  Global: 'Global',
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
  'O {tool} não define subagentes em arquivos do projeto.': '{tool} does not define subagents in project files.',
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
  'Codex, Cursor, Kimi Code, GitHub Copilot e outros': 'Codex, Cursor, Kimi Code, GitHub Copilot and others',
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
  'Cria a skill que ensina a IA a conduzir os cards pelo fluxo do board: fases, documentos, revisão e pendências':
    'Creates the skill that teaches the AI to take cards through the board flow: phases, documents, review and pending items',
  'Instalar skill do fluxo': 'Install flow skill',
  'Nova skill': 'New skill',
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
  'Conectar o {tool} ao board (MCP)': 'Connect {tool} to the board (MCP)',
  'O projeto trabalha com uma ferramenta de IA por vez. Ela define o arquivo de regras, a pasta das skills, onde o servidor MCP é registrado e os modelos oferecidos nos cards. Pastas de outras ferramentas podem existir no projeto, mas o board não mexe nelas. O botão registra o servidor do board em {mcp}.':
    'The project works with one AI tool at a time. It defines the rules file, the skills folder, where the MCP server is registered and the models offered on cards. Folders for other tools can exist in the project, but the board does not touch them. The button registers the board server in {mcp}.',
  'Ferramenta de IA do projeto': 'Project AI tool',
  Ferramenta: 'Tool',
  Regras: 'Rules',
  '.mcp.json (projeto)': '.mcp.json (project)',
  '.codex/config.toml (projeto confiável)': '.codex/config.toml (trusted project)',
  '~/.kimi-code/mcp.json ou ~/.kimi/mcp.json (global)': '~/.kimi-code/mcp.json or ~/.kimi/mcp.json (global)',
  '.vscode/mcp.json e .mcp.json (projeto)': '.vscode/mcp.json and .mcp.json (project)',
  '.cursor/mcp.json (projeto)': '.cursor/mcp.json (project)',

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
  'Com o heartbeat ligado e o board aberto nesta pasta (no editor ou pelo comando faz-ai), o board chama o {tool} sozinho a cada intervalo: ele avança os cards aprovados, responde às mensagens pendentes e trabalha nos cards prontos, uma história por vez ou várias ao mesmo tempo, conforme o limite abaixo. Sem pendência, nada é executado.':
    'With the heartbeat on and the board open in this folder (in the editor or through the faz-ai command), the board calls {tool} on its own at every interval: it moves approved cards forward, answers pending messages and works on ready cards, one story at a time or several at once, according to the limit below. With nothing pending, nothing is run.',
  Intervalo: 'Interval',

  // --- ScopeGroup
  'Selecionar todos em {scope}': 'Select all in {scope}',
  'Ações nos itens marcados': 'Actions on the selected items',
  '{n} marcados': '{n} selected',
  'A IA vê a descrição em toda sessão e decide quando usar': 'The AI sees the description in every session and decides when to use it',
  'Deixar automáticas': 'Set to automatic',
  'A IA deixa de invocar sozinha; elas continuam valendo nos cards que as indicam':
    'The AI stops invoking them on its own; they still apply on the cards that indicate them',
  'Deixar só quando indicadas': 'Set to only when indicated',
  'Copiar para o projeto ({n})': 'Copy to the project ({n})',
  'Copiar para o global ({n})': 'Copy to global ({n})',
  'Apagar ({n})': 'Delete ({n})',
  'Limpar seleção': 'Clear selection',
  'Nada neste projeto para o {tool}.': 'Nothing in this project for {tool}.',

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
};
