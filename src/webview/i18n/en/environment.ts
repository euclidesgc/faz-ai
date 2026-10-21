export const environment: Record<string, string> = {
  // Diagnóstico do ambiente (tela, itens e o acesso pelas Configurações e pelo aviso)
  'Diagnóstico do ambiente': 'Environment check',
  'Verificar ambiente': 'Check environment',
  'Abre o Diagnóstico do ambiente: o que o board precisa e o que ele usa nesta máquina, com como resolver o que falta':
    'Opens the environment check: what the board needs and uses on this machine, and how to fix what is missing',
  'Ver o diagnóstico completo': 'See the full environment check',
  'Ir para o board': 'Go to the board',
  'Conferindo o ambiente…': 'Checking the environment…',
  'A conferência falhou. Tente de novo.': 'The check failed. Try again.',
  'Falta 1 item necessário para o board trabalhar com a IA.': '1 required item is missing for the board to work with the AI.',
  'Faltam {n} itens necessários para o board trabalhar com a IA.': '{n} required items are missing for the board to work with the AI.',
  'O board está pronto para trabalhar com a IA. Há {n} recomendação para aproveitar melhor.':
    'The board is ready to work with the AI. There is {n} recommendation to get more out of it.',
  'O board está pronto para trabalhar com a IA. Há {n} recomendações para aproveitar melhor.':
    'The board is ready to work with the AI. There are {n} recommendations to get more out of it.',
  'Tudo pronto: o board tem tudo o que usa.': 'All set: the board has everything it uses.',
  'Banco de artefatos do board': 'Board artifact bank',
  'Perfis de CLI': 'CLI profiles',
  'Nenhum perfil de CLI está ligado.': 'No CLI profile is turned on.',
  'Desligados ({n})': 'Off ({n})',
  'O que o board precisa para trabalhar com a IA: o Node.js, cada perfil de CLI (linha de comando, login e credenciais), o banco de artefatos e o que ele aproveita quando está instalado. Passe o mouse sobre um item para ver como o board o usa. O board não instala nada de terceiros: instale pelo comando ou pelo site indicado.':
    'What the board needs to work with the AI: Node.js, each CLI profile (command line, login and credentials), the artifact bank and what it uses when installed. Hover an item to see how the board uses it. The board installs nothing from third parties: install with the command or the site shown.',
  'Banco de artefatos': 'Artifact bank',
  Ligado: 'On',
  Padrão: 'Default',
  'Perfil importado: revise antes de usar. O board não roda nenhum comando dele enquanto isso.':
    'Imported profile: review it before use. The board runs none of its commands meanwhile.',
  'Linha de comando encontrada': 'Command line found',
  'Linha de comando não encontrada': 'Command line not found',
  'Como instalar': 'How to install',
  'Este perfil não informou como instalar.': 'This profile did not say how to install it.',
  'Login: desconectado': 'Login: signed out',
  'Login: venceu numa execução': 'Login: expired during a run',
  'Login: conectado': 'Login: signed in',
  'Login: não conferido (o perfil não tem comando de status)': 'Login: not checked (the profile has no status command)',
  'Login: não conferido (falta a linha de comando)': 'Login: not checked (the command line is missing)',
  'Credencial {name}: preenchida': 'Credential {name}: filled in',
  'Credencial {name}: ausente': 'Credential {name}: missing',
  'Verificado em {version}': 'Verified on {version}',
  'Precisa verificar de novo: a linha de comando mudou desde o último teste':
    'Needs checking again: the command line changed since the last test',
  'Não validado: este perfil ainda não foi testado': 'Not validated: this profile has not been tested yet',
  'Depende do item anterior': 'Depends on the item above',
  Falta: 'Missing',
  uv: 'uv',
  'Repositório Git nesta pasta': 'Git repository in this folder',
  'Nome da branch principal/develop': 'Main/develop branch name',
  'O nome novo já está nas configurações, mas o repositório ainda usa o antigo. Renomear ou Desfazer na tela Git acerta o clone, o upstream e o origin; o comando abaixo é só o do clone local.':
    'The new name is already in the settings, but the repository still uses the old one. Rename or Undo on the Git screen fixes the clone, the upstream and the origin; the command below is only the local clone one.',
  'Abrir a tela Git': 'Open the Git screen',
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
  'Busca semântica': 'Semantic search',
  'Deixa a IA buscar o código pelo significado ("onde validamos o login?"), e não só pelo nome. Com o provedor local, o código não sai da sua máquina.':
    'Lets the AI search the code by meaning ("where do we validate the login?"), not just by name. With the local provider, the code does not leave your machine.',

  // --- Definição do harness
  'O banco de artefatos do board: as skills, agentes, servidores MCP e regras que as execuções podem usar, no modo de cada um. Sem ele o board funciona, mas sem o ganho de economia e precisão.':
    "The board's artifact bank: the skills, agents, MCP servers and rules runs may use, each in its mode. The board works without it, but without the context savings and precision.",
  'Artefatos no board': 'Artifacts on the board',
  'Nenhuma skill, agente ou servidor MCP em modo "Pelo card": o planejamento dos cards não tem de onde escolher. Importe ou crie artefatos em Harness, na aba Artefatos do board.':
    'No skill, agent or MCP server in "By card" mode: the cards\' planning has nothing to pick from. Import or create artifacts in Harness, in the Board artifacts tab.',
  'Agente do board': 'Board agent',
  'Sem agente, toda execução roda com o escopo cheio. Crie um com "Criar agente com ajuda" ou "Sugerir agentes com IA".':
    'Without an agent, every run has the full scope. Create one with "Criar agente com ajuda" or "Sugerir agentes com IA".',
  'Regras revisadas': 'Rules reviewed',
  'Há regras enviadas ao board ainda desligadas: revise o texto na aba Regras e ative, ou tire do board.':
    'There are rules sent to the board still off: review the text in the Regras tab and turn them on, or remove them from the board.',
  'Artefatos presentes': 'Artifacts present',
  'Um artefato do board sumiu da origem; a aba do assunto mostra quais estão ausentes, para tirar do board ou repor o arquivo.':
    "A board artifact vanished from its source; the subject's tab shows which are missing, to remove from the board or restore the file.",
  'Isolamento do harness': 'Harness isolation',
  'A CLI carrega artefatos sem passar pelo board; o Diagnóstico do Harness mostra quais, para tirar da máquina ou trazer para o board.':
    'The CLI loads artifacts that bypass the board; the Harness diagnostics show which ones, to remove from the machine or bring into the board.',
  'regras do projeto': 'project rules',
  'regras do usuário': 'user rules',
  'skills do projeto': 'project skills',
  'skills do usuário': 'user skills',
  'agentes do projeto': 'project agents',
  'agentes do usuário': 'user agents',
  'hooks do projeto': 'project hooks',
  'hooks do usuário': 'user hooks',
  'servidores MCP do projeto': 'project MCP servers',
  'servidores MCP do usuário': 'user MCP servers',
  'itens não reconhecidos': 'unrecognized items',
  'A CLI pode carregar por conta própria: {list}.': 'The CLI may load on its own: {list}.',
  'Contexto vazio (imposto)': 'Empty context (enforced)',
  'Nenhum item conhecido carregado (sem prova de isolamento)': 'No known item loaded (no proof of isolation)',
  'nenhuma skill, agente ou servidor MCP em modo "Pelo card"': 'no skill, agent or MCP server in "Pelo card" mode',
  'nenhum agente do board': 'no board agent',
  'regras no board ainda desligadas, sem revisão': 'rules on the board still off, not reviewed',
  'artefato do board que sumiu da origem': 'a board artifact that vanished from its source',
  'artefatos que a CLI carrega sem passar pelo board': 'artifacts the CLI loads without going through the board',
  'O harness do board ainda não está definido': "The board's harness is not defined yet",
  'Recomendado: defina o harness para as execuções gastarem menos contexto': 'Recommended: define the harness so runs spend less context',
  'O board funciona assim, mas as execuções não ganham a economia e a precisão de um harness definido. Falta: {list}. Resolva em Configurações → Harness.':
    'The board works like this, but runs do not get the savings and precision of a defined harness. Missing: {list}. Fix it in Settings → AI Harness.',
  Verificada: 'Verified',
  Parcial: 'Partial',
  Desconhecida: 'Unknown',
  'em {version}, {date}': 'on {version}, {date}',
  'Admissível no regime {regime}': 'Admissible under the {regime} regime',
  'Não admissível': 'Not admissible',
  exclusivo: 'exclusive',
  compatível: 'compatible',
  'Pode carregar por conta própria: {list}': 'May load on its own: {list}',
  'O teste roda a ferramenta e usa a sua assinatura.': 'The test runs the tool and uses your subscription.',
  'Testando…': 'Testing…',
  'O teste não terminou com sucesso.': 'The test did not finish successfully.',
  'Próxima execução e limites': 'Next run and limits',
  'Regime de contexto: {regime}': 'Context regime: {regime}',
  'Indisponível nesta versão': 'Unavailable in this version',
  'Alvo padrão: {target}': 'Default target: {target}',
  'modelo padrão': 'default model',
  'regra {id}, versão {n}': 'rule {id}, version {n}',
  'Bloqueada: {reason}': 'Blocked: {reason}',
  'Os cards com alvo {name} não rodam: {reason}.': 'Cards targeting {name} do not run: {reason}.',
  'o perfil espera revisão': 'the profile is waiting for review',
  'a linha de comando não foi encontrada': 'the command line was not found',
  'o login não está conectado': 'the login is not connected',
  'o perfil ainda não foi testado': 'the profile has not been tested yet',
  'o perfil precisa ser testado de novo': 'the profile needs to be tested again',
  'o perfil não é admissível': 'the profile is not admissible',
  'Processos em pasta própria': 'Processes in their own folder',
  'Processos só de texto': 'Text-only processes',
  'Escritores por pasta': 'Writers per folder',
  'Sub-tarefas em paralelo': 'Parallel subtasks',
  'Processos no total': 'Total processes',
  'Sem teto': 'No cap',
  'Processos do perfil {id}': 'Processes of profile {id}',
  'Limites de execução': 'Execution limits',
  Limite: 'Limit',
  Pedido: 'Requested',
  Efetivo: 'Effective',
  Motivo: 'Reason',
  'A linha de comando do {tool} não foi encontrada: veja em Configurações → Verificar ambiente.':
    'The {tool} command line was not found: see Settings → Check environment.',
  'A linha de comando do {tool} está sem login: veja em Configurações → Verificar ambiente.':
    'The {tool} command line is signed out: see Settings → Check environment.',
};
