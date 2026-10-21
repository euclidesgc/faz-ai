export const harness: Record<string, string> = {
  'Revisão humana pendente': 'Human review pending',
  'Configuração local ausente': 'Local configuration missing',
  'Este MCP exige revisão humana antes de executar.': 'This MCP requires human review before execution.',
  'A configuração local deste MCP está ausente.': 'The local configuration for this MCP is missing.',
  'A configuração salva fica apenas no host e não é devolvida ao editor. Sem substituir, os valores atuais são preservados.':
    'Saved configuration stays on the host and is not returned to the editor. Unless replaced, its current values are preserved.',
  'Este MCP está pendente de revisão. Informe uma nova definição para revisar e habilitar a execução.':
    'This MCP is pending review. Enter a new definition to review and enable execution.',
  'A configuração local desta referência não está disponível nesta máquina.':
    'The local configuration for this reference is unavailable on this machine.',
  'Substituir a configuração salva': 'Replace saved configuration',
  Sugestão: 'Suggestion',
  Nenhum: 'None',
  'Recursos e resultado': 'Resources and result',
  'Esta é a pasta de destino do board. A pasta de origem é escolhida na importação abaixo.':
    'This is the board destination folder. Choose the source folder in the import section below.',
  'Adicionada na pasta da biblioteca': 'Added in the library folder',
  'Nenhuma skill na biblioteca. Use Importar de uma pasta acima ou cole uma pasta com SKILL.md na biblioteca e clique em Atualizar lista.':
    'No skills in the library. Use Import from a folder above, or paste a folder containing SKILL.md into the library and click Refresh list.',
  'As skills aparecem no campo Skills dos cards e no planejamento. Pelo card só entra quando escolhido; Sempre entra em toda execução.':
    'Skills appear in the cards’ Skills field and in planning. Per card is included only when chosen; Always is included in every run.',
  'Importar de uma pasta': 'Import from a folder',
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

  'Abrir pasta': 'Open folder',
  'Origem: {path}': 'Source: {path}',
  '{n} arquivo(s) não copiado(s); consulte os limites da biblioteca.': '{n} file(s) not copied; check the library limits.',
  'Cada skill aceita arquivos de até 512 KB, até 100 arquivos de apoio e 5 MB no total. Itens omitidos aparecem na lista do board.':
    'Each skill accepts files up to 512 KB, up to 100 supporting files and 5 MB in total. Omitted items are shown in the board list.',
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
  Instruções: 'Instructions',
  Descartar: 'Discard',
  Fechar: 'Close',
  Salvar: 'Save',
  Cancelar: 'Cancel',
  'a sua pasta de usuário': 'your user folder',
  'o projeto': 'the project',
  Instalar: 'Install',
  'Selecionar todas': 'Select all',
  'sem arquivo': 'no file',
  Desinstalar: 'Uninstall',
  desativado: 'disabled',
  'da organização': 'from the organization',
  'Selecionar todos': 'Select all',
  'O board não respondeu. Se a extensão acabou de ser atualizada, recarregue a janela (no VS Code, Developer: Reload Window) e abra o arquivo de novo.':
    'The board did not reply. If the extension was just updated, reload the window (in VS Code, Developer: Reload Window) and open the file again.',
  'Mostrando o que o {tool} carrega. As execuções do board usam o {board}: a marcação só vale para ele.':
    'Showing what {tool} loads. Board runs use {board}: the marking only applies to it.',
  'sob demanda': 'on demand',
  'Abre o arquivo no board, para ler e editar': 'Opens the file in the board, to read and edit',
  'Somente leitura: este arquivo é mantido pela ferramenta ou por um plugin.':
    'Read-only: this file is maintained by the tool or by a plugin.',
  'Conteúdo do arquivo': 'File content',
  'Referências, modelos e scripts da pasta da skill': "References, templates and scripts from the skill's folder",
  Apagar: 'Delete',
  '{detail}\n\nA entrada sai de {location}.': '{detail}\n\nThe entry is removed from {location}.',
  Remover: 'Remove',
  '{description}: {name}\n\nA regra sai de {location}.': '{description}: {name}\n\nThe rule is removed from {location}.',

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
  Novo: 'New',
  'no terminal': 'in the terminal',
  'no Cursor (Customize → Plugins) ou numa sessão do agente': 'in Cursor (Customize → Plugins) or in an agent session',
  'claude plugin marketplace add <dono/repositorio>': 'claude plugin marketplace add <owner/repository>',
  'gh skill search <termo>': 'gh skill search <term>',
  'agent plugin marketplace add <endereço git>': 'agent plugin marketplace add <git URL>',
  '/plugins install <pasta, zip ou endereço do GitHub>': '/plugins install <folder, zip or GitHub URL>',

  // --- Escopos
  Projeto: 'Project',
  Global: 'Global',
  Importados: 'Imported',
  'Indicar artefatos': 'Suggest artifacts',
  'Não há artefatos fora do board neste assunto.': 'There are no artifacts off the board in this subject.',
  'A IA não respondeu no formato esperado.': 'The AI did not answer in the expected format.',
  'Indicar artefatos só vale para a ferramenta do projeto.': 'Suggesting artifacts only works for the project tool.',
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
  'O {tool} vai rodar este comando sozinho, no seu computador, a cada "{event}":\n\n{command}\n\nArquivo: {file}':
    '{tool} will run this command on its own, on your computer, on every "{event}":\n\n{command}\n\nFile: {file}',
  Arquivo: 'File',
  Evento: 'Event',
  Comando: 'Command',
  'padrão da ferramenta': 'tool default',
  Criar: 'Create',
  Onde: 'Where',
  Descrição: 'Description',
  '<nome>': '<name>',
  Tipo: 'Type',
  Argumentos: 'Arguments',
  'um por linha': 'one per line',
  Endereço: 'URL',
  'Variáveis de ambiente': 'Environment variables',
  Cabeçalhos: 'Headers',
  Lista: 'List',
  permitir: 'allow',
  perguntar: 'ask',
  negar: 'deny',
  Regra: 'Rule',

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
  Abrir: 'Open',
  'Nome do arquivo': 'File name',

  // --- SkillRow
  Ligada: 'On',
  Desligada: 'Off',
  'Desligar: tira a skill do contexto das ferramentas de IA': "Turn off: removes the skill from the AI tools' context",
  'Ligar a skill': 'Turn the skill on',
  'Apagar a skill': 'Delete the skill',
  'Apagar a skill "{name}"?': 'Delete the skill "{name}"?',
  'A pasta da skill é removida do projeto, com todos os arquivos dela.':
    "The skill's folder is removed from the project, along with all its files.",
  '{n} itens': '{n} items',
  Copiar: 'Copy',
  'Reler pastas': 'Reread folders',
  'Trocando a ferramenta e relendo o harness…': 'Switching the tool and rereading the harness…',
  'Rodar o heartbeat agora': 'Run the heartbeat now',
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
  Substituir: 'Replace',
  'Servidor do board': 'Board server',
  'Skill do fluxo': 'Flow skill',
  'Instalar neste projeto': 'Install in this project',
  'A skill do fluxo do board é instalada em "Tudo que a ferramenta carrega" → {tool} → Skills: no global (padrão) ou neste projeto.':
    'The board flow skill is installed in "Everything the tool loads" → {tool} → Skills: globally (default) or in this project.',
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
  'Sugerir agentes com IA': 'Suggest agents with AI',
  'Criar agente': 'Create agent',
  'Disponível no board': 'Available on the board',
  'de fábrica': 'factory',
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
  '<b>Para que serve.</b> Toda execução do board parte só do que está no board (no Claude Code, contexto vazio imposto; nas outras CLIs, veja o que elas carregam sozinhas em Ferramentas de IA). Esta tela é o catálogo do que existe na sua máquina e no projeto; o <b>Board</b> é só o que a IA pode usar.':
    '<b>What it is for.</b> Every board run starts from only what is on the board (in Claude Code, empty context is enforced; for other CLIs, see what they load on their own in Ferramentas de IA). This screen is the catalog of what exists on your machine and in the project; the <b>Board</b> is only what the AI may use.',
  '<b>Por que assim.</b> Menos contexto por execução é resposta mais rápida, mais barata e mais precisa. O planejamento de cada card escolhe o mínimo entre o que está no Board.':
    '<b>Why this way.</b> Less context per run means faster, cheaper and more precise answers. The planning of each card picks the minimum among what is on the Board.',
  '<b>Por onde começar.</b> 1) Abra a aba da ferramenta do projeto e, em Skills e MCPs, use <b>Indicar artefatos</b> e envie ao Board. 2) Em Sub-agentes, crie um agente com ajuda. 3) Em Regras, revise as que entraram desligadas e ative as que valem.':
    "<b>Where to start.</b> 1) Open the project tool's tab and, in Skills and MCPs, use <b>Indicar artefatos</b> and send to the Board. 2) In Sub-agentes, create an agent with help. 3) In Regras, review the ones that entered off and turn on the ones that apply.",
  'Entendi, não mostrar de novo': 'Got it, do not show again',
  'Nenhum agente no board: toda execução roda com o escopo cheio. Crie um em Projeto ou Global, com "Criar agente com ajuda" ou pelas sugestões prontas.':
    'No agent on the board: every run has the full scope. Create one in Projeto or Global, with "Criar agente com ajuda" or from the ready-made suggestions.',
  'Nenhuma regra no board. Envie as do projeto a partir de Projeto ou Global; elas entram desligadas, para você revisar antes de ativar.':
    'No rule on the board. Send the project ones from Projeto or Global; they enter off, for you to review before turning on.',
  'Nada neste assunto no board: o planejamento dos cards não tem de onde escolher. Vá a Projeto ou Global, use "Indicar artefatos" e envie ao board.':
    'Nothing of this subject on the board: the cards\' planning has nothing to pick from. Go to Projeto or Global, use "Indicar artefatos" and send to the board.',
  'Ir para Projeto': 'Go to Projeto',
  'Ir para Global': 'Go to Global',
  'Tudo que o {tool} carrega, por assunto. O <b>catálogo</b> (Projeto, Global e Importados) mostra o que existe e não ocupa o contexto da IA. Só o que você envia ao <b>Board</b> pode ser usado pelas execuções, no modo de cada artefato.':
    'Everything {tool} loads, by topic. The <b>catalog</b> (Project, Global and Imported) shows what exists and takes no space in the AI context. Only what you send to the <b>Board</b> can be used by runs, in the mode of each artifact.',
  'Sub-agentes': 'Sub-agents',
  MCPs: 'MCPs',
  Comandos: 'Commands',
  Demais: 'Other',
  'em Harness › Sub-agentes': 'in Harness › Sub-agents',
  'Arquivos desta pasta; valem só aqui.': 'Files in this folder; they apply only here.',
  'Arquivos da sua pasta de usuário; valem em todos os projetos.': 'Files in your user folder; they apply to all projects.',
  'Buscar por nome ou descrição': 'Search by name or description',
  'Buscar por nome ou descrição…': 'Search by name or description…',
  'Nada encontrado para a busca.': 'Nothing found for the search.',
  'As regras entram desligadas: escritas para outro contexto, elas podem conflitar com o fluxo e as definições do board (fases, aprovação, uso do MCP). Leia o texto de cada uma antes de ativar; regra ativa entra em toda execução.':
    'Rules come in off: written for another context, they may conflict with the board flow and settings (phases, approval, MCP use). Read the text of each one before turning it on; an active rule goes into every run.',
  'Remover do board: {name}': 'Remove from the board: {name}',
  ausente: 'missing',
  'O arquivo de origem não existe mais; os cards que o listam continuam intactos.':
    'The source file no longer exists; the cards that list it stay intact.',
  'Os cards e as fases podem escolher este agente.': 'Cards and phases may pick this agent.',
  '{dir}\n\nOs artefatos dela saem do board e deixam de aparecer em Importados. A pasta em si não é tocada.':
    '{dir}\n\nIts artifacts leave the board and stop showing in Imported. The folder itself is not touched.',
  'Importar artefatos': 'Import artifacts',
  Importar: 'Import',
  Negar: 'Deny',
  'Somente leitura': 'Read-only',
  'amplia o escopo': 'widens the scope',
  Continuar: 'Continue',
  'Exemplo:': 'Example:',
  Tirar: 'Remove',
  'Criar agente com ajuda': 'Create agent with help',
  'lista de ferramentas': 'a list of tools',
  'servidores MCP': 'MCP servers',
  skills: 'skills',
  nenhuma: 'none',
  'somente leitura': 'read-only',
  'em segundo plano': 'in the background',
  'o da sessão': "the session's",
  'Criar regra com ajuda': 'Create rule with help',
  'Criar regra': 'Create rule',
  'Mensagens de commit em português, no imperativo, sem ponto final.':
    'Commit messages in Portuguese, in the imperative, with no final period.',
  'A regra': 'The rule',
  'Ideias de regra': 'Rule ideas',
  'Desmarcar todas': 'Uncheck all',
  'Criar skill com ajuda': 'Create skill with help',
  'A tarefa': 'The task',
  Passo: 'Step',
  Limite: 'Limit',
  'Nome da skill': 'Skill name',
  'SKILL.md': 'SKILL.md',
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
  'Tira do board; o arquivo de origem não é tocado.': 'Removes it from the board; the source file is not touched.',
  'O que a IA pode usar nas execuções do board. <b>Ferramenta e execução</b> escolhe a IA, a permissão e o agente padrão; cada ferramenta tem a sua aba: primeiro onde olhar (Board, Projeto, Global ou Importados), depois um assunto por vez.':
    'What the AI can use in board runs. <b>Ferramenta e execução</b> (tool and execution) picks the AI, the permission and the default agent; each tool has its own tab: first where to look (Board, Projeto, Global or Importados), then one subject at a time.',
  'Tudo que o {tool} carrega. Escolha onde olhar e depois o assunto: o <b>catálogo</b> (Projeto, Global e Importados) mostra o que existe e não ocupa o contexto da IA; só o que você envia ao <b>Board</b> pode ser usado pelas execuções, no modo de cada artefato.':
    'Everything {tool} loads. Pick where to look and then the subject: the <b>catalog</b> (Projeto, Global and Importados) shows what exists and takes no space in the AI context; only what you send to the <b>Board</b> can be used by runs, in the mode of each artifact.',
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

  'Revise a configuração desta atividade. Alterações ficam no rascunho até aplicar o plano.':
    'Review this activity configuration. Changes stay in the draft until you apply the plan.',
  'Agente da atividade': 'Activity agent',
  Herdar: 'Inherit',
  'Nenhum agente': 'No agent',
  'Agente ausente': 'Missing agent',
  'Herdar modelo': 'Inherit model',
  'Modelo e fallback serão avaliados pelo mecanismo de políticas existente. Esta tela não decide alternativas.':
    'The existing policy engine will evaluate the model and fallback. This screen does not choose alternatives.',
  'Skills adicionais': 'Additional skills',
  'MCPs ativos': 'Active MCPs',
  'Herdar skills adicionais': 'Inherit additional skills',
  'Herdar MCPs ativos': 'Inherit active MCPs',
  'Essenciais e Sempre aparecem na prévia. Sugestões não entram até serem selecionadas.':
    'Essential and Always resources appear in the preview. Suggestions are included only when selected.',
  'Selecionar ativa somente os MCPs permitidos pelo agente. Escolhas incompatíveis permanecem visíveis para remoção.':
    'Selection activates only MCPs allowed by the agent. Incompatible choices remain visible for removal.',
  'Fora do contrato do agente': 'Outside the agent contract',
  'Entradas da atividade': 'Activity inputs',
  'Resultado esperado': 'Expected result',
  'Justificativa da escolha': 'Reason for the choice',
  'Usar no rascunho do plano': 'Use in the plan draft',
  'Plano de execução': 'Execution plan',
  'Padrão do board': 'Board default',
  'Vazio explícito': 'Explicit empty value',
  'Planeje cada ação separadamente. Os contratos ainda são rascunhos e não governam a execução legada.':
    'Plan each action separately. Contracts are still drafts and do not govern legacy execution.',
  Selecionar: 'Select',
  'Ação ou fase': 'Action or phase',
  'Agente e modelo': 'Agent and model',
  'Contexto inicial conhecido': 'Known initial context',
  Configuração: 'Configuration',
  'Selecionar {activity}': 'Select {activity}',
  Rascunho: 'Draft',
  'Sem agente válido': 'No valid agent',
  'Cerca de {tokens} tokens conhecidos': 'About {tokens} known tokens',
  '{n} itens sem medida': '{n} unmeasured items',
  'Configurar {activity}': 'Configure {activity}',
  'Origens e incompatibilidades': 'Sources and incompatibilities',
  'Revisão {revision}': 'Revision {revision}',
  'A estimativa cobre só o texto conhecido. MCPs, anexos e arquivos de apoio podem acrescentar contexto; consumo total continua desconhecido.':
    'The estimate covers only known text. MCPs, attachments and supporting files may add context; total usage remains unknown.',
  'Copiar {activity} para as atividades marcadas': 'Copy {activity} to the selected activities',
  'Uma configuração mudou em outra edição. Preserve seu rascunho e releia as revisões antes de aplicar.':
    'A configuration changed in another edit. Keep your draft and reload revisions before applying.',
  'Atualizar revisões e comparar': 'Refresh revisions and compare',
  'Comparar alterações ({n})': 'Compare changes ({n})',
  'Revise antes de aplicar': 'Review before applying',
  'Parcela conhecida: {before} → {after} tokens': 'Known portion: {before} → {after} tokens',
  'Itens sem medida: {before} → {after}': 'Unmeasured items: {before} → {after}',
  'Sem justificativa informada': 'No reason provided',
  'Aplicar rascunhos revisados': 'Apply reviewed drafts',
  'Descartar rascunhos do plano': 'Discard plan drafts',
  'Referências de conclusão': 'Completion references',
  'Critérios e dependências são lidos do card; editar o plano não cria cópias.':
    'Criteria and dependencies are read from the card; editing the plan does not create copies.',
  'Depende de #{number}': 'Depends on #{number}',
  'Padrões do plano de execução': 'Execution plan defaults',
  'Escopo do plano': 'Plan scope',
  Trabalho: 'Work',
  Refino: 'Refinement',
  'Resolução de conflitos': 'Conflict resolution',
  'Conversa do board': 'Board conversation',
  'Assistente de agentes': 'Agent assistant',
  'Assistente de rules': 'Rule assistant',
  'Assistente de skills': 'Skill assistant',
  'Sugestões do Harness': 'Harness suggestions',

  // --- BoardInstall
  'Conectar ao board': 'Connect to the board',
  'Conecta a ferramenta de IA ao MCP do board.': 'Connects the AI tool to the board MCP.',
  'Registra o servidor MCP do board em {tool}.': 'Registers the board MCP server in {tool}.',
};
