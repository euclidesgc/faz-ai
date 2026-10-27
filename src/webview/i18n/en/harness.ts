export const harness: Record<string, string> = {
  'Revisão humana pendente': 'Human review pending',
  'Configuração local ausente': 'Local configuration missing',
  'Este MCP exige revisão humana antes de executar.': 'This MCP requires human review before execution.',
  'A configuração local deste MCP está ausente.': 'The local configuration for this MCP is missing.',
  Sugestão: 'Suggestion',
  Nenhum: 'None',
  'Recursos e resultado': 'Resources and result',
  'Importar {name}': 'Import {name}',

  'Abrir pasta': 'Open folder',

  'Biblioteca do board': 'Board library',
  'Pasta da biblioteca': 'Library folder',

  // --- HarnessSettings
  Harness: 'Harness',
  'Plano de contexto': 'Context plan',
  'Fechar o plano de contexto': 'Close the context plan',
  'Plano de contexto deste workflow': "This workflow's context plan",
  'Plano de contexto padrão do board': "Board's default context plan",
  Automação: 'Automation',
  'Como o board executa a IA, com qualquer agente ligado: o que ela pode fazer, o tempo limite de cada execução, o heartbeat e quantas histórias andam ao mesmo tempo.':
    'How the board runs the AI, with any enabled agent: what it may do, the time limit of each run, the heartbeat and how many stories move at once.',

  // --- HarnessInventory
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
  'a sua pasta de usuário': 'your user folder',
  'o projeto': 'the project',
  Instalar: 'Install',

  // --- ItemRow
  'Novo servidor': 'New server',
  'sem arquivo': 'no file',
  Desinstalar: 'Uninstall',
  desativado: 'disabled',
  'da organização': 'from the organization',
  'Selecionar todos': 'Select all',
  'sob demanda': 'on demand',
  'Conteúdo do arquivo': 'File content',
  Apagar: 'Delete',
  Remover: 'Remove',

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
  'Novo arquivo': 'New file',
  Novo: 'New',
  'no terminal': 'in the terminal',

  // --- Escopos
  Projeto: 'Project',
  Global: 'Global',
  Importados: 'Imported',
  'Indicar artefatos': 'Suggest artifacts',
  'A IA não respondeu no formato esperado.': 'The AI did not answer in the expected format.',
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

  // --- NewHook
  Arquivo: 'File',
  Evento: 'Event',
  Comando: 'Command',
  'padrão da ferramenta': 'tool default',

  // --- NewItem
  Criar: 'Create',
  Onde: 'Where',
  Descrição: 'Description',
  '<nome>': '<name>',

  // --- NewMcpServer
  'Comando local (stdio)': 'Local command (stdio)',
  'Endereço (HTTP)': 'URL (HTTP)',
  Acrescentar: 'Add',
  'Servidor MCP novo': 'New MCP server',
  Tipo: 'Type',
  Argumentos: 'Arguments',
  'um por linha': 'one per line',
  Endereço: 'URL',
  'Variáveis de ambiente': 'Environment variables',
  Cabeçalhos: 'Headers',
  'Acrescentar servidor': 'Add server',

  // --- NewPermission
  Lista: 'List',
  permitir: 'allow',
  perguntar: 'ask',
  negar: 'deny',
  Regra: 'Rule',

  // --- ProjectAgents
  Editar: 'Edit',
  'Revisa uma Spec e aponta lacunas antes do Plan': 'Reviews a Spec and points out gaps before the Plan',
  'vazio = o modelo da sessão': 'empty = the session model',

  // --- ProjectRules
  Existe: 'Exists',
  'Não existe': 'Does not exist',
  'Apagar o arquivo': 'Delete the file',
  'Regras do projeto': 'Project rules',

  // --- ProjectSkills
  'Descrição (quando usar)': 'Description (when to use)',
  'Criar skill': 'Create skill',

  // --- ProjectTool
  Ferramenta: 'Tool',
  Regras: 'Rules',
  '.mcp.json (projeto)': '.mcp.json (project)',
  '.cursor/mcp.json (projeto)': '.cursor/mcp.json (project)',
  '.kimi-code/mcp.json (projeto)': '.kimi-code/mcp.json (project)',
  'Cursor e outras ferramentas': 'Cursor and other tools',

  // --- RunnerSettings
  'Execução pela conversa e heartbeat': 'Run from chat and heartbeat',
  'Começa uma rodada agora, mesmo com o heartbeat desligado': 'Starts a round now, even with the heartbeat off',
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
  'Com o heartbeat ligado e o board aberto nesta pasta (no editor ou pelo comando faz-ai), o board chama sozinho, a cada intervalo, o agente de cada card: ele trabalha nos cards prontos (um card aprovado vai para a próxima coluna na hora e é trabalhado na rodada seguinte), responde às mensagens pendentes, resume as conversas que cresceram, devolve para a IA os cards bloqueados por limite de uso, confere os pull requests mergeados e limpa branches e worktrees que sobraram, uma história por vez ou várias ao mesmo tempo, conforme o limite abaixo. Sem pendência, nada é executado.':
    "With the heartbeat on and the board open in this folder (in the editor or via the faz-ai command), the board calls each card's agent on its own at each interval: it works on ready cards (an approved card moves to the next column right away and is worked on in the next round), answers pending messages, summarizes conversations that have grown, returns to the AI the cards blocked by a usage limit, checks merged pull requests and cleans up leftover branches and worktrees, one story at a time or several at once, up to the limit below. With nothing pending, nothing runs.",
  'Refinar os cards novos do Backlog': 'Refine new Backlog cards',
  'A cada rodada, o heartbeat refina os cards do Backlog ainda não refinados: a partir do título, a IA melhora a descrição, preenche os campos (modelo, skills, rules) e o checklist, e deixa o card aguardando a sua revisão. Aprovar leva o card para a primeira fase.':
    'On each round, the heartbeat refines the Backlog cards not yet refined: from the title, the AI improves the description, fills in the fields (model, skills, rules) and the checklist, and leaves the card waiting for your review. Approving moves the card to the first phase.',
  Intervalo: 'Interval',
  'Limpar seleção': 'Clear selection',

  // --- SkillFiles
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
  '{n} itens': '{n} items',
  Copiar: 'Copy',
  'Apagar "{name}"?': 'Delete "{name}"?',
  'Reler pastas': 'Reread folders',
  'Rodar o heartbeat agora': 'Run the heartbeat now',
  'Histórias ao mesmo tempo': 'Stories at the same time',
  histórias: 'stories',
  'Sub-tarefas em paralelo por história': 'Sub-tasks in parallel per story',
  'sub-tarefas': 'sub-tasks',
  'Efetivo: {effective}. As sub-tarefas escrevem na mesma pasta da história, então rodam uma por vez.':
    'Effective: {effective}. The sub-tasks write to the same story folder, so they run one at a time.',
  'Tocar histórias em paralelo': 'Drive stories in parallel',
  'Ligado, o heartbeat toca várias histórias ao mesmo tempo, cada uma na sua própria pasta (worktree). Mais histórias em paralelo usam mais memória e processador e gastam mais do limite de uso da sua conta. O modo autônomo continua uma por vez, porque as histórias dele são empilhadas.':
    'When on, the heartbeat drives several stories at once, each in its own folder (worktree). More stories in parallel use more memory and CPU and more of your account usage limit. Autonomous mode stays one at a time, because its stories are stacked.',
  'Só disponível no modo "Worktree por história" (Configurações > Git). Fora dele as histórias dividem a mesma pasta e causariam conflitos, então o heartbeat toca uma por vez.':
    'Only available in "Worktree por história" mode (Settings > Git). Outside it the stories share the same folder and would cause conflicts, so the heartbeat drives one at a time.',
  Substituir: 'Replace',
  'Servidor do board': 'Board server',
  'Instalar neste projeto': 'Install in this project',
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
  'Modo no board: {name}': 'Mode on the board: {name}',
  'Modo no board': 'Mode on the board',
  // --- AgentsTable
  'A IA ainda está respondendo no chat do board.': 'The AI is still answering in the board chat.',
  'A IA lê o projeto e cria ou ajusta os agentes; acompanhe no chat do board.':
    'The AI reads the project and creates or adjusts the agents; follow it in the board chat.',
  'Sugerir agentes com IA': 'Suggest agents with AI',
  'Cria de novo os agentes de fábrica que não existem mais; não mexe nos que existem.':
    'Recreates the factory agents that no longer exist; leaves the existing ones alone.',
  'Agente novo': 'New agent',
  'Como este agente trabalha: padrões, comandos, o que nunca fazer': 'How this agent works: patterns, commands, what never to do',
  'Criar agente': 'Create agent',
  'Disponível no board': 'Available on the board',
  'de fábrica': 'factory',
  'Vem com o board: pode ser editado, restaurado ou desligado, mas não apagado.':
    'Comes with the board: it can be edited, restored or turned off, but not deleted.',
  'Vem com o board e acompanha a versão da extensão: só de leitura.': 'Comes with the board and follows the extension version: read only.',
  'A origem mudou desde a cópia. A cópia do board continua valendo até você atualizar.':
    'The source changed since the copy. The board copy still applies until you update it.',
  'origem alterada': 'source changed',
  'A origem não foi encontrada. A cópia do board continua valendo.': 'The source was not found. The board copy still applies.',
  'origem não encontrada': 'source not found',
  'A cópia foi editada no board depois de copiada da origem.': 'The copy was edited on the board after it was copied from the source.',
  'editado no board': 'edited on the board',
  'Atualizar "{name}" da origem?': 'Update "{name}" from the source?',
  'A cópia foi editada no board. Atualizar troca o conteúdo pelo da origem, e a edição do board se perde.':
    'The copy was edited on the board. Updating replaces its content with the source, and the board edit is lost.',
  'Atualizar da origem': 'Update from source',
  'Atualizar da origem: {name}': 'Update from source: {name}',
  'Copia de novo o conteúdo atual da origem para o board.': 'Copies the current source content to the board again.',
  'Restaurar o padrão': 'Restore default',
  'Restaurar o padrão: {name}': 'Restore default: {name}',
  'Volta o agente ao que vem com o board; o modo e o nome ficam.': 'Resets the agent to what comes with the board; the mode and name stay.',
  'Restaurar "{name}" ao padrão?': 'Restore "{name}" to the default?',
  'As instruções, as ferramentas e as skills voltam às de fábrica, e as edições feitas no board se perdem.':
    'The instructions, tools and skills go back to the factory ones, and the edits made on the board are lost.',
  'O board entrega esta skill pelo get_skill, com o texto desta versão da extensão.':
    'The board delivers this skill through get_skill, with the text of this extension version.',
  'O agente padrão das instruções executa quando nem o card nem a fase escolhem outro; para desligá-lo, torne outro o padrão das instruções.':
    'The default instructions agent runs when neither the card nor the phase picks another; to turn it off, make another one the default instructions agent.',
  'Entregue pelo board': 'Delivered by the board',
  'Abre o texto só para leitura': 'Opens the text read only',
  'Tornar padrão das instruções': 'Make default for instructions',
  'padrão das instruções': 'default for instructions',
  // --- AgentEditor
  'Uma frase: é por ela que o "Refinar com IA" escolhe o agente de um card.':
    'One sentence: it is how "Refine with AI" picks the agent for a card.',
  'O papel da sessão: como trabalha, padrões, comandos, o que nunca fazer. Vai inteiro para a IA.':
    'The session role: how it works, patterns, commands, what never to do. Goes to the AI in full.',
  'Lidas em toda execução com este agente, além das indicadas no card. Só as marcadas no Harness.':
    'Read in every run with this agent, besides the ones on the card. Only those checked in the Harness.',
  'Além do servidor do board, que vai sempre. Nada marcado = só o board.':
    'Besides the board server, which always goes. Nothing checked = board only.',
  'Agente padrão': 'Default agent',
  // --- EXEC_ASPECTS
  'Skills e rules': 'Skills and rules',
  'Contexto vazio': 'Empty context',
  // --- Harness por ferramenta e por assunto

  'Entendi, não mostrar de novo': 'Got it, do not show again',
  MCPs: 'MCPs',
  Comandos: 'Commands',
  'Arquivos desta pasta; valem só aqui.': 'Files in this folder; they apply only here.',
  'Arquivos da sua pasta de usuário; valem em todos os projetos.': 'Files in your user folder; they apply to all projects.',
  'Buscar por nome ou descrição': 'Search by name or description',
  'Buscar por nome ou descrição…': 'Search by name or description…',
  'Nada encontrado para a busca.': 'Nothing found for the search.',
  ausente: 'missing',
  'Importar artefatos': 'Import artifacts',
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
  'O {tool} não aceita {what} por agente: ele herda tudo da conversa principal.':
    '{tool} does not accept {what} per agent: it inherits everything from the main conversation.',
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
  'Criar regra': 'Create rule',
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
  'Confira a skill. Nada é gravado antes do botão de baixo.': 'Check the skill. Nothing is written before the button below.',
  'Nome da skill': 'Skill name',
  'Pelo card: só entra quando um card a indica': 'Per card: only goes in when a card picks it',
  'SKILL.md': 'SKILL.md',
  'A IA lê o projeto e escreve de 3 a 5 regras, desligadas no board; acompanhe no chat do board.':
    'The AI reads the project and writes 3 to 5 rules, switched off on the board; follow along in the board chat.',
  'A IA lê o projeto e cria de 3 a 5 skills, em "Pelo card"; acompanhe no chat do board.':
    'The AI reads the project and creates 3 to 5 skills, set to "Per card"; follow along in the board chat.',
  'Sugerir regras com IA': 'Suggest rules with AI',
  'Sugerir skills com IA': 'Suggest skills with AI',
  Leitura: 'Reading',
  'Lê e busca no projeto; não muda nada.': 'Reads and searches the project; changes nothing.',
  'Lê arquivos.': 'Reads files.',
  'Lê vários arquivos de uma vez.': 'Reads several files at once.',
  'Lista os arquivos e as pastas de uma pasta.': 'Lists the files and folders in a folder.',
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
  'Fecha o editor; o que não foi salvo se perde.': 'Closes the editor; unsaved changes are lost.',
  'Desmarca tudo; nada muda.': 'Unchecks everything; nothing changes.',
  'MCPs permitidos': 'Allowed MCPs',
  'Prévia do contrato': 'Contract preview',
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
  'Editar contrato de contexto (rascunho)': 'Edit context contract (draft)',
  'Fase no card': 'Card phase',
  'Ação no card': 'Card action',
  'Fase no workflow': 'Workflow phase',
  'Ação no workflow': 'Workflow action',
  'Fase no board': 'Board phase',
  'Ação no board': 'Board action',
  'Essencial do agente': 'Agent essential',
  'Não admitido pela execução': 'Not admitted by execution',
  'capacidade sem prova verificada do host': 'capability without host-verified proof',
  'ambiente do executor não verificado': 'executor environment not verified',
  'executor indisponível': 'executor unavailable',
  'pedido de execução inválido': 'invalid execution request',
  'MCP fora do limite do agente ou do board': 'MCP outside the agent or board limit',
  'operação MCP fora do limite': 'MCP operation outside the limit',
  'restrição nativa de outro executor': 'native restriction for another executor',
  'restrição nativa sem executor definido': 'native restriction without a defined executor',
  'restrição nativa não reconhecida': 'unrecognized native restriction',
  'tradução de ferramentas indisponível para este executor': 'tool mapping unavailable for this executor',
  'compatibilidade sem revisão humana': 'compatibility without human review',
  conversa: 'conversation',
  artefatos: 'artifacts',
  permissões: 'permissions',
  delegação: 'delegation',
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
  'Propor configuração de {activity} com IA': 'Propose configuration for {activity} with AI',
  'Pedindo proposta…': 'Requesting proposal…',
  'Propor com IA': 'Propose with AI',
  'Proposta da IA para {activity}': 'AI proposal for {activity}',
  'A IA só sugere skills e MCPs dentro do que o agente permite. Nada é gravado até você comparar e aplicar.':
    'The AI only suggests skills and MCPs within what the agent allows. Nothing is saved until you compare and apply.',
  Skill: 'Skill',
  MCP: 'MCP',
  'Nenhuma skill ou MCP além do essencial.': 'No skill or MCP beyond the essentials.',
  'A proposta está desatualizada: o card, o agente ou o catálogo mudaram. Peça uma nova proposta.':
    'The proposal is outdated: the card, agent or catalog changed. Request a new proposal.',
  'Usar como rascunho': 'Use as draft',
  'Descartar proposta': 'Discard proposal',
  'Referências de conclusão': 'Completion references',
  'Critérios e dependências são lidos do card; editar o plano não cria cópias.':
    'Criteria and dependencies are read from the card; editing the plan does not create copies.',
  'Depende de #{number}': 'Depends on #{number}',
  Trabalho: 'Work',
  Refino: 'Refinement',
  'Resolução de conflitos': 'Conflict resolution',
  'Conversa do board': 'Board conversation',
  'Assistente de agentes': 'Agent assistant',
  'Assistente de rules': 'Rule assistant',
  'Assistente de skills': 'Skill assistant',
  'Sugestões do Harness': 'Harness suggestions',
  'Dê um nome à regra.': 'Give the rule a name.',
  'Use letras minúsculas, números e hífen (até 64), com .md opcional.':
    'Use lowercase letters, numbers and hyphens (up to 64), with an optional .md.',
  'Já existe uma regra com este nome.': 'A rule with this name already exists.',
  'Editar regra': 'Edit rule',
  'Nova regra': 'New rule',
  'Letras minúsculas, números e hífen; .md é opcional.': 'Lowercase letters, numbers and hyphens; .md is optional.',
  'Os cards e os agentes que citam "{name}" não são reescritos: ajuste-os se for preciso.':
    'Cards and agents that mention "{name}" are not rewritten: update them if needed.',
  'Lendo a regra…': 'Reading the rule…',
  'Versão {n}.': 'Version {n}.',
  'A alteração vale para as próximas execuções; a execução em andamento não muda.':
    'The change applies to future runs; the run in progress does not change.',
  'Dê um nome à skill.': 'Give the skill a name.',
  'Use letras minúsculas, números e hífen (até 64).': 'Use lowercase letters, numbers and hyphens (up to 64).',
  'Já existe uma skill com este nome.': 'A skill with this name already exists.',
  'Editar skill': 'Edit skill',
  'Nova skill': 'New skill',
  'Esta skill é gerada pela extensão e regravada a cada abertura: só o modo muda.':
    'This skill is generated by the extension and rewritten on every open: only its mode changes.',
  'Letras minúsculas, números e hífen.': 'Lowercase letters, numbers and hyphens.',
  'É por ela que a IA e a pessoa decidem quando usar a skill.': 'This is how the AI and people decide when to use the skill.',
  'Corpo do SKILL.md': 'SKILL.md body',
  'Lendo a skill…': 'Reading the skill…',
  'Salve a skill para acrescentar arquivos de apoio.': 'Save the skill to add supporting files.',
  'Conteúdo de {file}': 'Contents of {file}',
  'Salvar arquivo': 'Save file',
  'Os arquivos são criados vazios na skill; escreva o conteúdo depois, no editor.':
    'The files are created empty in the skill; write their contents later, in the editor.',
  'O host não respondeu à leitura. Feche e abra o editor de novo.': 'The host did not answer the read. Close and reopen the editor.',
  'Dê um nome ao servidor.': 'Give the server a name.',
  'Use letras, números, hífen, ponto ou sublinhado (até 64).': 'Use letters, numbers, hyphens, dots or underscores (up to 64).',
  'O nome faz-ai é reservado ao MCP do board.': 'The name faz-ai is reserved for the board MCP.',
  'Já existe um servidor com este nome.': 'A server with this name already exists.',
  'Os valores guardados não aparecem. Deixe vazio para mantê-lo; digite para substituí-lo.':
    'Saved values are never shown. Leave empty to keep it; type to replace it.',
  'Nome em {label}': 'Name in {label}',
  'Valor de {key}': 'Value of {key}',
  'Guardado: vazio mantém': 'Saved: empty keeps it',
  valor: 'value',
  'Remover {key}': 'Remove {key}',
  'Acrescentar linha': 'Add row',
  'Editar servidor MCP': 'Edit MCP server',
  'Lendo o servidor…': 'Reading the server…',
  'Não ponha segredos nos argumentos: use as variáveis de ambiente.': 'Do not put secrets in the arguments: use environment variables.',
  'Há nomes repetidos nas variáveis ou nos cabeçalhos.': 'There are repeated names in the variables or headers.',
  Categoria: 'Category',
  'Abre o formulário de um agente novo; ele é gravado no board ao salvar.':
    'Opens the form for a new agent; it is saved in the board on save.',
  'Recriar os de fábrica': 'Recreate the built-in ones',
  'Tornar {name} o agente padrão das instruções': 'Make {name} the default instructions agent',
  'Apagar o agente {name}': 'Delete the agent {name}',
  'Este é o agente padrão das instruções. Torne outro agente o padrão das instruções antes de apagar este.':
    'This is the default instructions agent. Make another agent the default instructions agent before deleting this one.',
  'O agente é removido do board{location}. Colunas e cards que o usam voltam ao padrão.':
    'The agent is removed from the board{location}. Columns and cards that use it go back to the default.',
  'No board, em "Pelo card": {name}': 'In the board, under "By the card": {name}',
  'Sem lista: o agente herda o que o nível de permissão da execução libera.':
    'No list: the agent inherits what the execution permission level allows.',
  'Lista explícita: {n} ferramentas; só elas, dentro do nível de permissão da execução.':
    'Explicit list: {n} tools; only those, within the execution permission level.',
  'Este agente veio do {origin}: as categorias foram traduzidas para os nomes do {tool}. Confira a lista antes de executar.':
    'This agent came from {origin}: the categories were translated to the names used by {tool}. Check the list before running.',
  'O {tool} não aceita lista de ferramentas por agente: a execução ignora o que este agente restringe.':
    '{tool} does not accept a per-agent tool list: the run ignores what this agent restricts.',
  'Importar artefatos para o board': 'Import artifacts into the board',
  'Nada é ativado nem executado na importação. Regras e servidores MCP importados esperam a sua revisão.':
    'Nothing is activated or run on import. Imported rules and MCP servers wait for your review.',
  Origem: 'Source',
  'Pasta ou repositório git': 'Folder or git repository',
  'Ferramenta instalada': 'Installed tool',
  'Arquivo de exportação': 'Export file',
  'Caminho da pasta ou endereço do repositório': 'Folder path or repository address',
  'Subpasta (opcional)': 'Subfolder (optional)',
  'De onde importar': 'Import from',
  'Uma pasta neste computador ou o endereço de um repositório git.': 'A folder on this computer or the address of a git repository.',
  '/caminho/da/pasta ou https://github.com/conta/repositorio': '/path/to/folder or https://github.com/account/repository',
  'A pasta dentro da origem onde estão os artefatos.': 'The folder inside the source where the artifacts are.',
  Ferramentas: 'Tools',
  'Tem regras, skills, agentes ou MCPs para importar.': 'Has rules, skills, agents or MCPs to import.',
  'Nada para importar nesta máquina.': 'Nothing to import on this machine.',
  'Não há pasta nem arquivos desta ferramenta no projeto nem no usuário.':
    'There is no folder or file of this tool in the project or in the user folder.',
  'Examinar {tool}': 'Examine {tool}',
  'Escolha um arquivo gerado por "Exportar o board" para ver o que há nele.':
    'Pick a file made by "Export the board" to see what is in it.',
  'Informe o caminho da pasta ou o endereço do repositório.': 'Enter the folder path or the repository address.',
  'Lê a origem sem rodar nada e lista os artefatos encontrados.':
    'Reads the source without running anything and lists the artifacts found.',
  Examinar: 'Scan',
  'Lê as regras, skills, agentes e MCPs que esta ferramenta já tem.': 'Reads the rules, skills, agents and MCPs this tool already has.',
  'Escolhe um arquivo de exportação do board e lista o que há nele.': 'Picks a board export file and lists what is in it.',
  'Escolher arquivo': 'Choose file',
  'Artefatos encontrados': 'Artifacts found',
  'Nenhum artefato encontrado': 'No artifacts found',
  'já está no board': 'already in the board',
  'Volta para escolher outra origem.': 'Goes back to choose another source.',
  'Fecha sem importar nada.': 'Closes without importing anything.',
  'Marque pelo menos um artefato.': 'Check at least one artifact.',
  'Copia os artefatos marcados para o board.': 'Copies the checked artifacts into the board.',
  'Importar {n}': 'Import {n}',
  '{n} já estão no board': '{n} already in the board',
  'Substituir troca o conteúdo atual pelo importado. Pular os repetidos importa só o que é novo.':
    'Replace swaps the current content for the imported one. Skip the repeated ones imports only what is new.',
  'Pular os repetidos': 'Skip the repeated ones',

  // --- Artefatos do board (aba nova)
  'Artefatos do board': 'Board artifacts',
  'gerada pelo board': 'generated by the board',
  'origem ausente na cópia': 'source missing from the copy',
  'importado de {origin}': 'imported from {origin}',
  'Abre o formulário; o artefato é gravado no board ao salvar.': 'Opens the form; the artifact is saved to the board on save.',
  'Um passo a passo para escrever uma regra; ela entra no board desligada.':
    'A step-by-step guide to write a rule; it enters the board turned off.',
  'Um passo a passo para escrever uma skill; ela entra no board em "Pelo card".':
    'A step-by-step guide to write a skill; it enters the board in "By card" mode.',
  'Abre o diálogo para importar artefatos para o board.': 'Opens the dialog to import artifacts into the board.',
  'Ações em lote': 'Bulk actions',
  'Selecionar todos os visíveis': 'Select all visible',
  'Selecionar: {name}': 'Select: {name}',
  'Abre o texto no board, para ler e editar': 'Opens the text in the board, to read and edit',
  'Versão do artefato no board': 'Artifact version on the board',
  'v{n}': 'v{n}',
  'Fechar edição: {name}': 'Close editing: {name}',
  'Editar: {name}': 'Edit: {name}',
  'Abre o editor logo abaixo da linha.': 'Opens the editor right below the row.',
  'Apagar o artefato': 'Delete the artifact',
  'Apagar: {name}': 'Delete: {name}',
  'A cópia do board é apagada e a ação não pode ser desfeita; o arquivo de origem fica. Os cards e os agentes que citam este artefato deixam de recebê-lo.':
    'The board copy is deleted and this cannot be undone; the source file stays. Cards and agents that cite this artifact stop receiving it.',
  'um selecionado': 'one selected',
  'Um arquivo ficou de fora pelos limites: {files}': 'One file was left out by the limits: {files}',
  '{n} arquivos ficaram de fora pelos limites: {files}': '{n} files were left out by the limits: {files}',
  'Importa regras, skills, agentes e servidores MCP de uma pasta, de uma ferramenta instalada ou de um arquivo.':
    'Imports rules, skills, agents and MCP servers from a folder, an installed tool or a file.',
  '{n} sempre': '{n} always',
  '{n} pelo card': '{n} by card',
  '{n} desligadas': '{n} off',
  'Há regras desligadas: elas estão no board, mas não entram em nenhuma execução. Leia o texto de cada uma e ative ou apague; regra ativa entra em toda execução.':
    'Some rules are off: they are on the board but enter no run. Read each one and turn it on or delete it; an active rule enters every run.',
  'Apaga os artefatos marcados do board; os arquivos de origem ficam.':
    'Deletes the checked artifacts from the board; the source files stay.',
  'Apagar {n} artefatos do board?': 'Delete {n} artifacts from the board?',
  'As cópias do board serão apagadas e a ação não pode ser desfeita; os arquivos de origem ficam. Os cards e os agentes que citam estes artefatos deixam de recebê-los.':
    'The board copies will be deleted and this cannot be undone; the source files stay. Cards and agents that cite these artifacts stop receiving them.',
  'Regra do board': 'Board rule',
  'Skill do board': 'Board skill',
  'Somente leitura: esta skill é gerada pela extensão e regravada a cada abertura.':
    'Read only: this skill is generated by the extension and rewritten on every open.',
  'Só o que está no board entra nas execuções, no modo de cada um.': "Only what is on the board enters runs, in each one's mode.",
  'Nenhuma regra no board. Crie uma ou importe as que você já tem; elas entram desligadas, para você revisar antes de ativar.':
    'No rule on the board. Create one or import the ones you already have; they enter turned off, for you to review before activating.',
  'Nenhuma skill no board. Crie uma ou importe uma pasta com SKILL.md.':
    'No skill on the board. Create one or import a folder with SKILL.md.',
  'Nenhum agente no board: toda execução roda com o escopo cheio. Crie um, use as sugestões prontas ou importe.':
    'No agent on the board: every run has the full scope. Create one, use the ready suggestions or import.',
  'Nenhum servidor MCP no board. Cadastre um ou importe os que você já configurou.':
    'No MCP server on the board. Register one or import the ones you already set up.',

  // --- Exportar para a ferramenta
  'Copia regras, skills e agentes do board para a pasta de uma ferramenta (Claude Code, Cursor ou Kimi Code), no formato dela. Os servidores MCP não vão: o Conectar registra o do board.':
    "Copies board rules, skills and agents into a tool's folder (Claude Code, Cursor or Kimi Code), in its format. MCP servers don't go: Connect registers the board's own.",
  'Volta a mostrar todas as regras do board.': 'Shows all the board rules again.',
  'Mostra só as regras desligadas, para revisar uma a uma.': 'Shows only the rules that are off, to review them one by one.',
  'Mostrar todas as regras': 'Show all rules',
  'Mostrar só as desligadas': 'Show only the ones off',
  'Buscar em {topic} por nome ou descrição': 'Search {topic} by name or description',
  'Vale para os cards deste workflow; o que ficar em "Herdar" segue o padrão do board, em Harness › Plano de contexto.':
    'Applies to the cards of this workflow; whatever stays on "Herdar" (inherit) follows the board default, in Harness › Plano de contexto (context plan).',
  'O que cada atividade leva para a IA (agente, modelo, skills, MCPs e o resultado esperado) quando nem o card nem o workflow escolhem outra coisa. O de cada workflow fica no botão Plano de contexto dele, em Workflows e colunas.':
    "What each activity brings to the AI (agent, model, skills, MCPs and the expected result) when neither the card nor the workflow picks something else. Each workflow's lives under its Plano de contexto (context plan) button, in Workflows and columns.",
  'Exportar para a ferramenta': 'Export to the tool',
  '{n} gravados': '{n} written',
  '{n} substituídos': '{n} replaced',
  '{n} pulados': '{n} skipped',
  '{n} recusados': '{n} refused',
  '{n} com falha': '{n} failed',
  'recusado: {reason}': 'refused: {reason}',
  'já existe · será substituído': 'already exists · will be replaced',
  'já existe · será pulado': 'already exists · will be skipped',
  novo: 'new',
  'Copia regras, skills e agentes do board no formato de {tool}.': 'Copies board rules, skills and agents in the {tool} format.',
  'Ferramenta e destino': 'Tool and destination',
  Destino: 'Destination',
  'Pasta do projeto': 'Project folder',
  'Pasta do usuário': 'User folder',
  'Abra uma pasta de projeto para exportar para ela.': 'Open a project folder to export to it.',
  'O resultado é uma cópia desconectada: o board não atualiza, não acompanha e não apaga o que for exportado. Uma mudança no board só chega à ferramenta exportando de novo.':
    'The result is a disconnected copy: the board does not update, follow or delete what is exported. A change on the board only reaches the tool by exporting again.',
  'Os {n} servidores MCP do board não são exportados: o "Conectar ao board" registra o do board, e os outros você configura na ferramenta.':
    'The {n} MCP servers on the board are not exported: "Connect to the board" registers the board\'s own, and you set up the others in the tool.',
  'Carregando a prévia…': 'Loading the preview…',
  'Substituir os que já existem': 'Replace the ones that already exist',
  'Nenhum artefato para exportar': 'No artifact to export',
  'Exportar {name}': 'Export {name}',
  'A sessão conectada ao board já recebe o fluxo pelo MCP; a cópia fica parada na versão de hoje.':
    "The session connected to the board already gets the flow through MCP; the copy stays frozen at today's version.",
  'A pasta no destino tem {n} arquivo(s) que o board não tem ({names}): eles ficam.':
    'The destination folder has {n} file(s) the board does not have ({names}): they stay.',
  'A skill do fluxo vai como uma cópia parada: a sessão conectada ao board recebe o fluxo atualizado pelo MCP, e esta cópia não acompanha.':
    'The flow skill goes as a frozen copy: the session connected to the board gets the updated flow through MCP, and this copy does not follow it.',
  'Nada foi gravado.': 'Nothing was written.',
  'O resultado é uma cópia desconectada: o board não atualiza, não acompanha e não apaga o que foi exportado.':
    'The result is a disconnected copy: the board does not update, follow or delete what was exported.',
  'Fecha o resumo.': 'Closes the summary.',
  'Fecha sem exportar nada.': 'Closes without exporting anything.',
  'Grava os artefatos marcados na pasta da ferramenta.': "Writes the checked artifacts into the tool's folder.",
  'Exportar {n}': 'Export {n}',
  'Configurar na ferramenta: {value}': 'Configure in the tool: {value}',
  'A restrição de ferramentas não vai para a cópia: o agente herda todas as ferramentas da sessão.':
    "The tool restriction does not go to the copy: the agent inherits all the session's tools.",
  'Os servidores MCP do agente não vão para a cópia: ele usa os da sessão.':
    "The agent's MCP servers do not go to the copy: it uses the session's.",
  'As skills do agente não vão para a cópia.': "The agent's skills do not go to the copy.",
  'O modelo não vai para a cópia: o agente usa o da sessão.': "The model does not go to the copy: the agent uses the session's.",
  'O esforço não vai para a cópia.': 'The effort does not go to the copy.',
  'O modo somente leitura não vai para a cópia.': 'Read-only mode does not go to the copy.',
  'A execução em segundo plano não vai para a cópia.': 'Background execution does not go to the copy.',
  'O agente padrão das instruções não vai para a cópia.': 'The default instructions agent does not go to the copy.',
  'O modo (Sempre ou Pelo card) não vai para a cópia: a ferramenta decide pela descrição.':
    'The mode (Always or By card) does not go to the copy: the tool decides by the description.',
  'O cabeçalho original da regra não vai para a cópia.': "The rule's original header does not go to the copy.",
  'Arquivos que ficaram de fora na cópia para o board não vão para a cópia.':
    'Files left out when copying to the board do not go to the copy.',
  'Entra em toda conversa (o modo "Pelo card" não existe nesta ferramenta).':
    'Applies to every conversation (the "By card" mode does not exist in this tool).',
  'As regras escolhidas vão juntas num só arquivo e voltam como uma regra só na importação.':
    'The chosen rules go together in a single file and come back as one rule on import.',
  'Para usar com o board conectado, acrescente {value} à lista de ferramentas.':
    'To use it with the board connected, add {value} to the tools list.',
  'Diferença no formato: {value}': 'Format difference: {value}',
  'origem ausente na cópia para o board': 'source missing from the board copy',
  'esta ferramenta não tem esse artefato nesse destino': 'this tool has no such artifact at this destination',
  'o nome não serve de nome de arquivo ou de pasta': 'the name cannot be a file or folder name',
  'um arquivo de apoio tem caminho que sai da pasta da skill': 'a supporting file has a path that leaves the skill folder',
  'o caminho real sai da pasta da ferramenta': 'the real path leaves the tool folder',
  'o destino é um link simbólico': 'the destination is a symbolic link',
  'o destino é uma pasta': 'the destination is a folder',
  'outro artefato do lote grava o mesmo arquivo': 'another artifact in the batch writes the same file',
  'Não há pasta de projeto aberta para exportar.': 'There is no open project folder to export to.',
  'Conectar ao board': 'Connect to the board',
  'Regime de admissão': 'Admission regime',
  Exclusivo: 'Exclusive',
  Compatível: 'Compatible',
  'A ferramenta só roda com as cinco capacidades verificadas: a IA vê exatamente o contexto que o board montou para o card.':
    'The tool only runs with all five capabilities verified: the AI sees exactly the context the board built for the card.',
  'A ferramenta pode carregar os próprios arquivos de contexto (regras, skills, agentes, hooks e MCPs que o perfil declara em "O que a CLI carrega por conta própria"). Permissões, MCP e delegação continuam exigidos. É o único regime em que um agente ACP roda.':
    'The tool may load its own context files (the rules, skills, agents, hooks and MCPs the profile declares under "What the CLI loads on its own"). Permissions, MCP and delegation are still required. It is the only regime in which an ACP agent runs.',
  'Os <b>Artefatos do board</b> (regras, skills, agentes e servidores MCP) valem com qualquer ferramenta de IA; a edição vale para as próximas execuções. O <b>Plano de contexto</b> é o padrão do board; o de cada workflow fica em Workflows e colunas. O que a IA pode fazer e o heartbeat ficam em <b>Automação</b>; a sugestão de modelo, em <b>Conectar agentes</b>.':
    "The <b>Artefatos do board</b> (board artifacts: rules, skills, agents and MCP servers) apply with any AI tool; edits apply to the next runs. The <b>Plano de contexto</b> (context plan) is the board's default; each workflow's lives in Workflows and columns. What the AI may do and the heartbeat live in <b>Automação</b> (automation); the model suggestion, in <b>Conectar agentes</b> (connect agents).",
  'O botão "Trabalhar na fase" de um card roda a IA dele em segundo plano nesta pasta, sem ninguém aprovando cada passo. Aqui se define o que ela pode fazer nessas execuções ("Refinar com IA" roda só com o board, quando a ferramenta tem esse nível; sem ele, o pedido proíbe mexer em arquivos). O agente de cada card precisa estar instalado, autenticado e ligado em Conectar agentes.':
    'A card\'s "Trabalhar na fase" (work on the phase) button runs its AI in the background in this folder, with no one approving each step. Here you set what it may do in those runs ("Refinar com IA" runs only with the board when the tool has that level; without it, the request forbids touching files). Each card\'s agent must be installed, signed in and enabled in Connect agents.',
};
