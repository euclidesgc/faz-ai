export const workflows: Record<string, string> = {
  // Colunas
  Coluna: 'Column',
  Representa: 'Represents',
  'IA atua': 'AI works',
  'Exige aprovação': 'Requires approval',
  Fase: 'Phase',
  'Trabalho em aberto': 'Open work',
  Conclusão: 'Completion',
  Cancelamento: 'Cancellation',
  'Nome da coluna {name}': 'Name of column {name}',
  'O que {name} representa': 'What {name} represents',
  'A IA atua em {name}': 'AI works in {name}',
  '{name} exige aprovação': '{name} requires approval',
  'Instrução para a IA e modelo do documento desta fase': 'AI instruction and document template for this phase',
  Instrução: 'Instruction',
  Definir: 'Set',
  'Um workflow precisa de ao menos uma coluna': 'A workflow needs at least one column',
  'Excluir a coluna': 'Delete the column',
  'Excluir a coluna "{name}"?': 'Delete the column "{name}"?',
  '{n} card(s) serão movidos para a coluna escolhida.': '{n} card(s) will be moved to the chosen column.',
  'A coluna está vazia.': 'The column is empty.',
  'Excluir coluna': 'Delete column',
  'Mover cards para': 'Move cards to',
  'Arraste para mudar a posição de "{name}" (ou use ↑ e ↓)': 'Drag to change the position of "{name}" (or use ↑ and ↓)',
  'Nome da coluna': 'Column name',
  'Onde a coluna entra': 'Where the column goes',
  'No início': 'At the start',
  'Depois de {name}': 'After {name}',
  Cancelar: 'Cancel',
  Adicionar: 'Add',

  // Workflow novo
  'Workflow novo': 'New workflow',
  Nome: 'Name',
  'Ex.: Suporte, Bugs, Pesquisa': 'E.g. Support, Bugs, Research',
  Papel: 'Role',
  '{hint} O papel não muda depois de criado.': '{hint} The role cannot be changed after it is created.',
  'Cards independentes': 'Independent cards',
  'Sub-tarefas': 'Sub-tasks',
  'Recebe histórias, bugs, retrabalho e débitos. Cada card pode ter sub-tarefas.':
    'Receives stories, bugs, rework and debts. Each card can have sub-tasks.',
  'Recebe as sub-tarefas de uma história. Cada card tem sempre uma história como pai.':
    'Receives the sub-tasks of a story. Each card always has a story as its parent.',
  'Começa com as colunas A fazer, Em andamento e Concluído; depois você muda como quiser.':
    'Starts with the columns To do, In progress and Done; then change them however you like.',
  'Criar workflow': 'Create workflow',

  // Fase
  'Instrução para a IA': 'AI instruction',
  'O que ela faz quando um card entra em "{name}".': 'What it does when a card enters "{name}".',
  'Ex.: escreva o documento de requisitos a partir da conversa do card…':
    "E.g. write the requirements document from the card's conversation…",
  'Documento da fase': 'Phase document',
  'Nome do arquivo anexado à história; vazio se a fase não gera documento.':
    'Name of the file attached to the story; empty if the phase does not produce a document.',
  'Ex.: PRD.md': 'E.g. PRD.md',
  'Modelo do documento': 'Document template',
  'A IA preenche este modelo ao gerar o documento.': 'The AI fills in this template when generating the document.',
  'Markdown com as seções do documento.': 'Markdown with the sections of the document.',
  Agente: 'Agent',
  'Skills, servidores MCP, ferramentas e modelo dos cards desta fase; cada card pode trocar.':
    'Skills, MCP servers, tools and model for the cards in this phase; each card can change them.',
  'Padrão do board ({name})': 'Board default ({name})',
  'Padrão do board (nenhum)': 'Board default (none)',
  'Restaurar o padrão desta fase': 'Restore this phase default',

  // Workflow
  'Workflow {name}': 'Workflow {name}',
  'Nome do workflow': 'Workflow name',
  'Nova coluna': 'New column',
  'Excluir o workflow': 'Delete the workflow',
  'Excluir o workflow "{name}"?': 'Delete the workflow "{name}"?',
  'As colunas dele serão apagadas. Ele não tem cards.': 'Its columns will be deleted. It has no cards.',
  'Excluir workflow': 'Delete workflow',
  'O board precisa de ao menos um workflow': 'The board needs at least one workflow',
  'Workflow não encontrado': 'Workflow not found',
  'Workflows e colunas': 'Workflows and columns',
  'Novo workflow': 'New workflow',
  'Um workflow é um conjunto de colunas por onde os cards andam, e aparece como uma faixa no board. Você pode ter quantos quiser. Workflows de cards independentes recebem histórias, bugs e afins; os de sub-tarefas recebem as sub-tarefas de uma história. Uma história só entra numa coluna de conclusão quando não tem sub-tarefas em aberto. No board, cada workflow e cada coluna abre e fecha com um clique, e o board volta do jeito que você deixou. Para mudar a ordem dos workflows ou das colunas, arraste pela alça à esquerda (ou use ↑ e ↓ com a alça em foco).':
    'A workflow is a set of columns the cards move through, and it appears as a lane on the board. You can have as many as you like. Independent-card workflows receive stories, bugs and the like; sub-task workflows receive the sub-tasks of a story. A story only enters a done column when it has no open sub-tasks. On the board, each workflow and each column opens and closes with a click, and the board comes back the way you left it. To change the order of workflows or columns, drag the handle on the left (or use ↑ and ↓ with the handle focused).',
  '"IA atua" marca as colunas em que a IA trabalha: ao entrar nelas o card fica Pronto. "Exige aprovação" é o ponto de revisão: a IA termina, pede a revisão e só avança o card depois que você aprova. Em "Fase" ficam a instrução da IA para a coluna e o modelo do documento que ela produz (PRD, Spec…).':
    '"AI works" marks the columns where the AI works: when a card enters them it becomes Ready. "Requires approval" is the review point: the AI finishes, asks for review and only moves the card forward after you approve. "Phase" holds the AI instruction for the column and the template of the document it produces (PRD, Spec…).',

  // Agentes
  Agentes: 'Agents',
  'Novo agente': 'New agent',
  'Um agente diz como a IA trabalha num card: que skills ela lê, a que servidores MCP e ferramentas ela tem acesso e que modelo usa. Toda execução pelo board ("Chamar IA" e heartbeat) roda através de um agente: o escolhido no card; senão, o da fase (Workflows e colunas → Fase); senão, o padrão. Assim isso é decidido antes, em vez de a ferramenta descobrir sozinha durante a conversa.':
    'An agent defines how the AI works on a card: which skills it reads, which MCP servers and tools it can access and which model it uses. Every run from the board ("Call AI" and heartbeat) goes through an agent: the one chosen on the card; otherwise the phase\'s (Workflows and columns → Phase); otherwise the default. This way it is decided up front, instead of the tool figuring it out on its own during the conversation.',
  'O que o {tool} aceita por parâmetro': 'What {tool} accepts as a parameter',
  'Cada execução pelo board é uma sessão nova, só com o que está no card. <b>Imposto</b> é o que o {tool} recebe por parâmetro; <b>orientado</b> segue como instrução no prompt. Numa conversa aberta por você, tudo é orientação: a IA lê o agente em <code>get_card</code>. As skills vão sempre pelo caminho do arquivo, no prompt: valem mesmo desligadas ou fora da invocação automática.':
    'Each run from the board is a new session, with only what is on the card. <b>Enforced</b> is what {tool} receives as a parameter; <b>advised</b> goes as an instruction in the prompt. In a conversation you open yourself, everything is guidance: the AI reads the agent in <code>get_card</code>. Skills always go by file path, in the prompt: they apply even when turned off or outside automatic invocation.',
  'Agente {n}': 'Agent {n}',
  'Na execução pelo board, o {tool} recebe isto por parâmetro: a sessão não tem como usar outra coisa.':
    'When run from the board, {tool} receives this as a parameter: the session has no way to use anything else.',
  'O {tool} não aceita isto por parâmetro: segue no prompt, como instrução.':
    '{tool} does not accept this as a parameter: it goes in the prompt, as an instruction.',
  imposto: 'enforced',
  orientado: 'advised',
  'subagente {name}': 'subagent {name}',
  '{n} skill(s)': '{n} skill(s)',
  'MCP: board': 'MCP: board',
  'MCP: board + {list}': 'MCP: board + {list}',
  'ferramentas: {list}': 'tools: {list}',
  'sessão limpa': 'clean session',
  'Sem restrições: a sessão usa o que a ferramenta carregar.': 'No restrictions: the session uses whatever the tool loads.',
  'Agente {name}': 'Agent {name}',
  'Nome do agente': 'Agent name',
  padrão: 'default',
  'Usado quando nem o card nem a coluna indicam um agente': 'Used when neither the card nor the column specifies an agent',
  'Tornar padrão': 'Make default',
  Fechar: 'Close',
  Editar: 'Edit',
  'Precisa haver ao menos um agente': 'There must be at least one agent',
  'Apagar o agente': 'Delete the agent',
  'Apagar o agente "{name}"?': 'Delete the agent "{name}"?',
  'Colunas e cards que usam este agente voltam ao padrão.': 'Columns and cards that use this agent go back to the default.',
  'O que este agente faz': 'What this agent does',
  'Uma frase, como na descrição de um agente. É a base para sugerir skills e servidores MCP.':
    "One sentence, like an agent's description. It is the basis for suggesting skills and MCP servers.",
  'Ex.: revisa a Spec e aponta lacunas antes do Plan': 'E.g. reviews the Spec and points out gaps before the Plan',
  Skills: 'Skills',
  'Lidas em toda execução com este agente, além das indicadas no card. Com a intenção preenchida, o botão Sugerir pela intenção marca as que combinam.':
    'Read on every run with this agent, in addition to those chosen on the card. With the intent filled in, the Suggest from intent button selects the ones that match.',
  'Skills de {name}': 'Skills for {name}',
  'Servidores MCP': 'MCP servers',
  'Restringir: a sessão usa só o servidor do board e os marcados abaixo':
    'Restrict: the session uses only the board server and the ones checked below',
  'Nenhum outro servidor configurado para o {tool}.': 'No other server configured for {tool}.',
  'Servidores cujo nome ou descrição combinam com a intenção': 'Servers whose name or description match the intent',
  'Sugerir pela intenção ({n})': 'Suggest from intent ({n})',
  'Ferramentas disponíveis': 'Available tools',
  'Nomes separados por vírgula, como a ferramenta os chama; vazio = as que o nível de permissão da execução libera.':
    "Names separated by commas, as the tool calls them; empty = the ones the run's permission level allows.",
  'Sem lista: vale o que o nível de permissão libera': 'No list: whatever the permission level allows applies',
  'Liberar o padrão': 'Allow the default',
  'Ex.: Read, Grep, Glob, Edit': 'E.g. Read, Grep, Glob, Edit',
  'Ferramentas negadas': 'Denied tools',
  'Ex.: WebFetch, Bash(git push *)': 'E.g. WebFetch, Bash(git push *)',
  'Modelo e esforço': 'Model and effort',
  'O modelo indicado no card tem preferência.': 'The model chosen on the card takes precedence.',
  'Subagente do {tool}': '{tool} subagent',
  'Opcional: um arquivo de agente do {tool} (em Harness de IA → Agentes) que conduz a sessão; vazio = o agente padrão da ferramenta.':
    "Optional: a {tool} agent file (in AI harness → Agents) that drives the session; empty = the tool's default agent.",
  Subagente: 'Subagent',
  'Sessão limpa {badge}: sem as personalizações da sua pasta de usuário e sem invocação automática de skills':
    'Clean session {badge}: without the customizations from your user folder and without automatic skill invocation',

  // Constantes de src/shared/execution.ts
  'Sessão limpa': 'Clean session',
  Ferramentas: 'Tools',
  'Só leitura': 'Read-only',
  'Editar código': 'Edit code',
  'Lê e busca arquivos; não edita nem roda comandos.': 'Reads and searches files; does not edit or run commands.',
  'Lê, edita arquivos e roda comandos no terminal.': 'Reads, edits files and runs commands in the terminal.',
};
