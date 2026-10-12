export const environment: Record<string, string> = {
  // Diagnóstico do ambiente (tela, itens e o acesso pelas Configurações e pelo aviso)
  'Diagnóstico do ambiente': 'Environment check',
  'Verificar ambiente': 'Check environment',
  'Abre o Diagnóstico do ambiente: o que o board precisa e o que ele usa nesta máquina, com como resolver o que falta':
    'Opens the environment check: what the board needs and uses on this machine, and how to fix what is missing',
  'Ver o diagnóstico completo': 'See the full environment check',
  'Ir para o board': 'Go to the board',
  'Conferindo o ambiente…': 'Checking the environment…',
  'Falta 1 item necessário para o board trabalhar com a IA.': '1 required item is missing for the board to work with the AI.',
  'Faltam {n} itens necessários para o board trabalhar com a IA.': '{n} required items are missing for the board to work with the AI.',
  'O board está pronto para trabalhar com a IA. Há {n} recomendação para aproveitar melhor.':
    'The board is ready to work with the AI. There is {n} recommendation to get more out of it.',
  'O board está pronto para trabalhar com a IA. Há {n} recomendações para aproveitar melhor.':
    'The board is ready to work with the AI. There are {n} recommendations to get more out of it.',
  'Tudo pronto: o board tem tudo o que usa.': 'All set: the board has everything it uses.',
  'Depende do item anterior': 'Depends on the item above',
  Falta: 'Missing',
  'Instalar a skill': 'Install the skill',
  'A skill do fluxo ({name}) não está pronta para o {tool}': 'The flow skill ({name}) is not ready for {tool}',
  'É ela que ensina a IA a conduzir os cards pelo fluxo do board: fases, documentos, revisão e pendências. As execuções do board partem de contexto vazio: a skill precisa existir e estar marcada em "Incluir em todo contexto" em Configurações → Harness. Instalar por aqui grava na pasta global de skills da ferramenta e já marca.':
    'It teaches the AI to drive cards through the board flow: phases, documents, review and pending items. Board runs start from an empty context: the skill must exist and be checked as "Include in every context" in Settings → Harness. Installing from here writes to the tool\'s global skills folder and checks it.',
  'O {tool} não acha o comando do MCP do board': '{tool} cannot find the board MCP command',
  '{file} inicia o MCP com "{missing}", que não está no PATH com que o editor abriu (o programa foi instalado depois, ou fica numa pasta que o editor não lê). O arquivo está no git, então o board não grava nele o caminho desta máquina: feche e abra o editor de novo, ou tire o arquivo do git.':
    '{file} starts the MCP with "{missing}", which is not in the PATH the editor opened with (the program was installed later, or lives in a folder the editor does not read). The file is in git, so the board does not write this machine’s path into it: close and reopen the editor, or take the file out of git.',
  '{file} inicia o MCP com "{missing}", que não está no PATH com que o editor abriu (o programa foi instalado depois, ou fica numa pasta que o editor não lê). Corrigir grava o caminho completo dele nesta máquina, e o arquivo fica fora do git; depois, recarregue a janela.':
    '{file} starts the MCP with "{missing}", which is not in the PATH the editor opened with (the program was installed later, or lives in a folder the editor does not read). Fixing writes its full path on this machine, and the file stays out of git; then reload the window.',
  'Corrigir o caminho': 'Fix the path',
  uv: 'uv',
  'Aplicando e conferindo de novo…': 'Applying and checking again…',
  'MCP do board (faz-ai)': 'Board MCP (faz-ai)',
  'Nível de permissão das execuções': 'Permission level for runs',
  'Skill do fluxo ({name})': 'Flow skill ({name})',
  'Repositório Git nesta pasta': 'Git repository in this folder',
  'GitHub CLI (gh)': 'GitHub CLI (gh)',
  'O board usa o gh para fazer o merge automático do PR aprovado e para acompanhar os PRs abertos até o merge.':
    'The board uses gh to auto-merge the approved PR and to follow open PRs until they are merged.',
  'Login no GitHub CLI': 'Sign-in on the GitHub CLI',
  'Code Review Graph': 'Code Review Graph',
  'Grafo deste projeto': 'Graph for this project',
  // Diagnóstico do ambiente: as três listas, o nome de cada item e o hint de como o board o usa
  'O que o board precisa para trabalhar com o {tool}, as outras ferramentas de IA desta máquina e o que ele aproveita quando está instalado. Passe o mouse sobre um item para ver como o board o usa. O board instala só o próprio MCP e a skill do fluxo; o resto você instala pelo site indicado.':
    'What the board needs to work with {tool}, the other AI tools on this machine and what it makes use of when installed. Hover over an item to see how the board uses it. The board installs only its own MCP and the flow skill; you install the rest from the site shown.',
  Necessários: 'Required',
  Opcionais: 'Optional',
  Recomendados: 'Recommended',
  '{version} encontrado': '{version} found',
  'Para instalar:': 'To install:',
  'Para instalar, em ordem:': 'To install, in order:',
  'Depois:': 'Then:',
  'Instala o nvm, o gerenciador de versões do Node.js:': 'Installs nvm, the Node.js version manager:',
  'Carrega o nvm neste terminal (num terminal novo, ele já vem carregado):':
    'Loads nvm in this terminal (a new terminal already has it loaded):',
  'Põe a pasta ~/.local/bin, onde o programa foi instalado, no PATH dos próximos terminais:':
    'Adds the ~/.local/bin folder, where the program was installed, to the PATH of future terminals:',
  'Põe a pasta no PATH deste terminal, para achar o programa agora:': "Adds the folder to this terminal's PATH, to find the program now:",
  'Na pasta do projeto.': 'In the project folder.',
  'Atualiza a lista de pacotes (numa máquina nova, o apt não acha nada antes disso):':
    'Updates the package list (on a new machine, apt finds nothing before this):',
  'Pelo Homebrew (sem ele, instale antes pelo site brew.sh, ou baixe o instalador no site acima):':
    'Through Homebrew (without it, install it first from brew.sh, or download the installer from the site above):',
  'Depois, abra um terminal novo: o que já estava aberto não enxerga o programa recém-instalado.':
    'Then open a new terminal: the one already open does not see the newly installed program.',
  'Os comandos de instalação abaixo usam o curl, que não foi encontrado nesta máquina. Instale-o antes pelo gerenciador de pacotes do sistema.':
    'The install commands below use curl, which was not found on this machine. Install it first with the system package manager.',
  'Instala o Node.js {min} com ele:': 'Installs Node.js {min} with it:',
  'Node.js {min} ou mais novo': 'Node.js {min} or newer',
  'Roda o MCP do board: a ferramenta de IA o inicia com o Node.js do PATH a cada conversa e a cada execução pelo board.':
    "Runs the board's MCP: the AI tool starts it with the Node.js on the PATH in every conversation and every run from the board.",
  '{tool} (ferramenta do projeto)': '{tool} (project tool)',
  'A ferramenta de IA que o board usa nos botões de IA dos cards, no chat, no heartbeat e no modo autônomo.':
    "The AI tool the board uses for the cards' AI buttons, the chat, the heartbeat and autonomous mode.",
  '{tool} (encontrado na máquina)': '{tool} (found on this machine)',
  'Outra ferramenta de IA nesta máquina. O board passa a usá-la se você a escolher em Configurações → Harness de IA, e aí instala nela o MCP e a skill do board.':
    "Another AI tool on this machine. The board starts using it if you choose it in Settings → AI Harness, and then installs the board's MCP and skill in it.",
  'Linha de comando {cli}': 'Command line {cli}',
  'O board roda a linha de comando do {tool} em segundo plano, nesta pasta, para a IA trabalhar nos cards.':
    'The board runs the {tool} command line in the background, in this folder, for the AI to work on the cards.',
  'Login na linha de comando': 'Command line sign-in',
  'As execuções pelo board usam a sua conta e o seu plano no {tool}. Sem login, elas falham antes de começar.':
    'Runs from the board use your {tool} account and plan. Without signing in, they fail before starting.',
  'O canal pelo qual a IA do {tool} lê e atualiza os cards deste board: consulta, move entre as colunas, comenta e anexa. Roda na sua máquina.':
    "The channel through which the {tool} AI reads and updates this board's cards: it looks them up, moves them between columns, comments and attaches files. It runs on your machine.",
  'Ensina a IA do {tool} a conduzir os cards pelo fluxo do board: fases, documentos, revisão e pendências.':
    "Teaches the {tool} AI to move the cards through the board's flow: phases, documents, review and pending items.",
  'Diz o que a IA do {tool} pode fazer sozinha nas execuções pelo board. É escolhido em Configurações → Harness de IA.':
    'Sets what the {tool} AI may do on its own in runs from the board. It is chosen in Settings → AI Harness.',
  'Com o modo do Git ligado, o board cria uma branch ou uma worktree para cada história. O seu nome no Git assina os comentários.':
    'With Git mode on, the board creates a branch or a worktree for each story. Your Git name signs the comments.',
  'Os modos de branch e de worktree precisam de um repositório. Sem ele, as histórias são trabalhadas direto na pasta.':
    'The branch and worktree modes need a repository. Without one, stories are worked on directly in the folder.',
  'O gh usa a sua conta do GitHub para ver e mesclar os PRs. Sem login, o merge automático e o acompanhamento não funcionam.':
    'gh uses your GitHub account to see and merge PRs. Without signing in, automatic merge and PR tracking do not work.',
  'Entrega à IA um grafo do código (funções, classes, quem chama quem): ela acha o trecho certo sem ler arquivos inteiros e gasta menos tokens.':
    'Gives the AI a graph of the code (functions, classes, who calls whom): it finds the right spot without reading whole files and spends fewer tokens.',
  'O Code Review Graph analisa o projeto uma vez; depois, o grafo se atualiza a cada mudança.':
    'Code Review Graph analyzes the project once; after that, the graph updates with every change.',
  'Instala o Code Review Graph e o mantém atualizado, isolado na própria pasta. Se faltar um Python 3.10 ou mais novo, o uv baixa um só para ele: não é preciso instalar o Python antes.':
    'Installs Code Review Graph and keeps it up to date, isolated in its own folder. If Python 3.10 or newer is missing, uv downloads one just for it: there is no need to install Python first.',
  'MCP do Code Review Graph': 'Code Review Graph MCP',
  'É por ele que a IA do {tool} consulta o grafo nas conversas e nas execuções.':
    'It is how the {tool} AI queries the graph in conversations and runs.',
  'Busca semântica': 'Semantic search',
  'Deixa a IA buscar o código pelo significado ("onde validamos o login?"), e não só pelo nome. Com o provedor local, o código não sai da sua máquina.':
    'Lets the AI search the code by meaning ("where do we validate the login?"), not just by name. With the local provider, the code does not leave your machine.',
};
