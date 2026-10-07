export const environment: Record<string, string> = {
  // Diagnóstico do ambiente (tela, itens e o acesso pelas Configurações e pelo aviso)
  'Diagnóstico do ambiente': 'Environment check',
  'Verificar ambiente': 'Check environment',
  'Abre o Diagnóstico do ambiente: o que o board precisa e o que ele usa nesta máquina, com como resolver o que falta':
    'Opens the environment check: what the board needs and uses on this machine, and how to fix what is missing',
  'Ver o diagnóstico completo': 'See the full environment check',
  'Ir para o board': 'Go to the board',
  'O que o board precisa para trabalhar com o {tool} e o que ele aproveita quando está instalado. Cada item diz para que serve, como o board o usa, o que sai da sua máquina e como resolver o que falta.':
    'What the board needs to work with {tool} and what it makes use of when installed. Each item says what it is for, how the board uses it, what leaves your machine and how to fix what is missing.',
  'Conferindo o ambiente…': 'Checking the environment…',
  'Falta 1 item necessário para o board trabalhar com a IA.': '1 required item is missing for the board to work with the AI.',
  'Faltam {n} itens necessários para o board trabalhar com a IA.': '{n} required items are missing for the board to work with the AI.',
  'O board está pronto para trabalhar com a IA. Há {n} recomendação para aproveitar melhor.':
    'The board is ready to work with the AI. There is {n} recommendation to get more out of it.',
  'O board está pronto para trabalhar com a IA. Há {n} recomendações para aproveitar melhor.':
    'The board is ready to work with the AI. There are {n} recommendations to get more out of it.',
  'Tudo pronto: o board tem tudo o que usa.': 'All set: the board has everything it uses.',
  Necessário: 'Required',
  Recomendado: 'Recommended',
  'Pronto · {version}': 'Ready · {version}',
  'Depende do item anterior': 'Depends on the item above',
  Falta: 'Missing',
  'Para que serve': 'What it is for',
  'Como o board usa': 'How the board uses it',
  Privacidade: 'Privacy',
  'Saiba mais': 'Learn more',
  'Instalar a skill': 'Install the skill',
  'Aplicando e conferindo de novo…': 'Applying and checking again…',
  'Baixar o instalador': 'Download the installer',

  'Node.js 18 ou mais novo': 'Node.js 18 or newer',
  'Roda o MCP do board, o servidor pelo qual a IA lê e altera os cards.':
    'Runs the board MCP, the server through which the AI reads and changes the cards.',
  'A ferramenta de IA inicia o MCP com o node do PATH do terminal a cada conversa e a cada execução pelo board.':
    'The AI tool starts the MCP with the node on the terminal PATH in every conversation and every run from the board.',
  'Linha de comando do {tool}': '{tool} command line',
  'É ela que o board chama para a IA trabalhar nos cards.': 'It is what the board calls to have the AI work on the cards.',
  'Os botões de IA dos cards, o chat do board, o heartbeat e o modo autônomo rodam a linha de comando do {tool} em segundo plano, nesta pasta.':
    'The AI buttons on cards, the board chat, the heartbeat and autonomous mode run the {tool} command line in the background, in this folder.',
  'O que a IA lê (o card, o código do projeto) vai para o {tool} pelas regras da sua conta nele; o board não manda nada a mais.':
    'What the AI reads (the card, the project code) goes to {tool} under the terms of your account there; the board sends nothing else.',
  'Login na linha de comando do {tool}': 'Sign-in on the {tool} command line',
  'As execuções pelo board usam a sua conta e o seu plano.': 'Runs from the board use your account and your plan.',
  'Sem login, as execuções falham antes de começar.': 'Without signing in, runs fail before they start.',
  'MCP do board (faz-ai)': 'Board MCP (faz-ai)',
  'É o canal pelo qual a IA lê e atualiza os cards deste board.':
    'It is the channel through which the AI reads and updates the cards on this board.',
  'Nas conversas com o {tool}, a IA usa o MCP para consultar os cards, movê-los entre as colunas e registrar comentários e anexos.':
    'In conversations with {tool}, the AI uses the MCP to look up cards, move them between columns and add comments and attachments.',
  'Roda na sua máquina: o MCP fala com o board por um arquivo local, sem passar pela rede.':
    'Runs on your machine: the MCP talks to the board through a local file, without going over the network.',
  'Nível de permissão das execuções': 'Permission level for runs',
  'Diz o que a IA pode fazer sozinha quando o board a executa.': 'Sets what the AI may do on its own when the board runs it.',
  'É escolhido em Harness de IA. Algumas ferramentas não aceitam todos os níveis fora de um terminal.':
    'It is chosen in AI Harness. Some tools do not accept every level outside a terminal.',
  'Skill do fluxo ({name})': 'Flow skill ({name})',
  'Ensina a IA a conduzir os cards pelo fluxo do board: fases, documentos, revisão e pendências.':
    'Teaches the AI to take cards through the board flow: phases, documents, review and pending items.',
  'O {tool} carrega a skill quando você pede para trabalhar num card, no chat do editor ou no terminal. Ela é instalada na pasta global de skills da ferramenta e vale para todos os projetos.':
    '{tool} loads the skill when you ask it to work on a card, in the editor chat or the terminal. It is installed in the tool’s global skills folder and applies to every project.',
  'O controle de versão do projeto.': 'The project’s version control.',
  'Com o modo do Git ligado, o board cria uma branch ou uma worktree para cada história. Ele também lê do Git o seu nome, que assina os comentários.':
    'With Git mode on, the board creates a branch or a worktree for each story. It also reads your name from Git to sign comments.',
  'Repositório Git nesta pasta': 'Git repository in this folder',
  'Os modos de branch e de worktree precisam de um repositório.': 'The branch and worktree modes need a repository.',
  'Sem repositório, as histórias são trabalhadas direto na pasta, sem branch própria.':
    'Without a repository, stories are worked on directly in the folder, without their own branch.',
  'GitHub CLI (gh)': 'GitHub CLI (gh)',
  'Fala com o GitHub pela linha de comando.': 'Talks to GitHub from the command line.',
  'O board usa o gh para fazer o merge automático do PR aprovado e para acompanhar os PRs abertos até o merge.':
    'The board uses gh to auto-merge the approved PR and to follow open PRs until they are merged.',
  'Usa a sua conta do GitHub, direto do gh; nada passa pelo board.':
    'Uses your GitHub account, straight from gh; nothing goes through the board.',
  'Login no GitHub CLI': 'Sign-in on the GitHub CLI',
  'O gh precisa da sua conta para ver e mesclar os PRs.': 'gh needs your account to see and merge PRs.',
  'Sem login, o merge automático e o acompanhamento dos PRs não funcionam.': 'Without signing in, auto-merge and PR tracking do not work.',
  'Code Review Graph': 'Code Review Graph',
  'Monta um grafo do código (funções, classes, quem chama quem) e o entrega à IA por um MCP próprio.':
    'Builds a graph of the code (functions, classes, who calls whom) and hands it to the AI through its own MCP.',
  'Em vez de ler arquivos inteiros, a IA consulta o grafo para achar o trecho certo e medir o impacto de uma mudança: gasta menos tokens e erra menos nos cards.':
    'Instead of reading whole files, the AI queries the graph to find the right code and measure the impact of a change: it spends fewer tokens and makes fewer mistakes on cards.',
  'Roda na sua máquina: o grafo fica na pasta .code-review-graph do projeto e o código não sai dela. Precisa do Python 3.10 ou mais novo, que o uv instala junto, sem mexer no Python do sistema.':
    'Runs on your machine: the graph lives in the project’s .code-review-graph folder and the code never leaves it. It needs Python 3.10 or newer, which uv installs alongside it without touching the system Python.',
  'O último comando registra o MCP do Code Review Graph no {tool} e, por padrão, acrescenta instruções de uso ao arquivo de regras do projeto (CLAUDE.md, AGENTS.md…). Rode-o na pasta do projeto.':
    'The last command registers the Code Review Graph MCP in {tool} and, by default, adds usage instructions to the project rules file (CLAUDE.md, AGENTS.md…). Run it in the project folder.',
  'Grafo deste projeto': 'Graph for this project',
  'O Code Review Graph precisa analisar o projeto uma vez antes de responder.':
    'Code Review Graph needs to analyse the project once before it can answer.',
  'Depois do primeiro build, o grafo é atualizado a cada mudança, sem você pedir.':
    'After the first build, the graph is updated on every change, without you asking.',
  'Busca semântica do Code Review Graph': 'Code Review Graph semantic search',
  'Deixa a IA buscar o código pelo significado ("onde validamos o login?"), e não só pelo nome.':
    'Lets the AI search the code by meaning ("where do we validate the login?"), not only by name.',
  'A busca do MCP do Code Review Graph passa a comparar o sentido da pergunta com cada função do grafo, e a IA acha o que procura em menos tentativas.':
    'The Code Review Graph MCP search starts comparing the meaning of the question with each function in the graph, and the AI finds what it is looking for in fewer attempts.',
  'Com o provedor local (o dos comandos abaixo), o modelo all-MiniLM-L6-v2 é baixado uma vez do Hugging Face e roda na sua máquina: o código não sai dela. Os provedores openai, google, minimax e voyage mandam trechos do código para a API desses serviços, e muitas empresas não permitem isso. Confira a política da sua antes de trocar o provedor.':
    'With the local provider (the one in the commands below), the all-MiniLM-L6-v2 model is downloaded once from Hugging Face and runs on your machine: the code never leaves it. The openai, google, minimax and voyage providers send code snippets to those services’ APIs, and many companies do not allow that. Check your company’s policy before switching providers.',
};
