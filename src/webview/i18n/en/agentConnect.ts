// Configurações › Conectar agentes: a lista, o agente padrão, a conexão, a conta, os modelos, a sessão de teste, o log
// do protocolo e as mensagens do host sobre a conta e a sessão de teste.
export const agentConnect: Record<string, string> = {
  // a página, o menu e o agente padrão
  'Conectar agentes': 'Connect agents',
  'Conecte os agentes de IA ao board, entre na conta de cada um e ajuste os modelos. Todo agente ligado roda cards, ao mesmo tempo que os outros: cada card vai para o agente do modelo dele (o do card, o do agente do harness ou o da regra de sugestão, no fim desta tela), e o padrão roda os cards sem modelo.':
    "Connect the AI agents to the board, sign in to each one and tune the models. Every enabled agent runs cards, alongside the others: each card goes to its model's agent (the card's, the harness agent's or the suggestion rule's, at the end of this screen), and the default one runs the cards with no model.",
  Atualizar: 'Refresh',
  'Confere de novo quais agentes estão instalados, a versão de cada um e se você está com a conta conectada. Use depois de instalar um agente, entrar na conta dele ou atualizá-lo fora do board.':
    "Checks again which agents are installed, each one's version and whether you are signed in to the account. Use it after installing an agent, signing in to it or updating it outside the board.",
  'Roda os cards que não dizem qual modelo usar. Para trocar, use Usar nos cards sem modelo na aba Conexão de outro agente.':
    "Runs the cards that don't say which model to use. To change it, use Use for cards with no model in another agent's Connection tab.",

  // a lista
  'Buscar agente': 'Search agents',
  'Agentes do board': 'Board agents',
  'Agente personalizado (CLI)': 'Custom agent (CLI)',
  'Outros agentes do registro do ACP': 'Other agents from the ACP registry',
  'O board ainda não executa cards com eles: dá para entrar na conta e conversar com cada um na sessão de teste.':
    'The board does not run cards with them yet: you can sign in and talk to each one in the test session.',
  'Carregando o registro…': 'Loading the registry…',
  'Não deu para atualizar o registro ({error}); a lista é a de {date}.':
    'Could not refresh the registry ({error}); the list is from {date}.',
  'Escolha um agente na lista.': 'Pick an agent from the list.',
  Conectado: 'Connected',
  'Conectando…': 'Connecting…',
  'Espera você': 'Waiting for you',
  'O Conectar parou': 'Connect stopped',
  Ligado: 'Enabled',
  Desligado: 'Disabled',
  'Não instalado': 'Not installed',
  'Só teste': 'Test only',
  Indisponível: 'Unavailable',

  // o agente escolhido
  'Registro do ACP · {version}': 'ACP registry · {version}',
  'Página do agente': 'Agent page',
  Conexão: 'Connection',
  Modelos: 'Models',
  Testar: 'Test',
  Detalhes: 'Details',

  // a conexão
  'Sem programa para instalar: no modo API, quem fala com o modelo é a extensão.':
    'Nothing to install: in API mode, the extension talks to the model itself.',
  'Instalado · versão {version}': 'Installed · version {version}',
  Instalado: 'Installed',
  'Não encontrado nesta máquina': 'Not found on this machine',
  'Ainda não verificado': 'Not checked yet',
  'Como instalar': 'How to install',
  'Conexão com o board': 'Connection to the board',
  'Modo de conexão': 'Connection mode',
  'Como funciona o modo {mode}': 'How {mode} mode works',
  'Ainda não conectado pelo board. O Conectar acha a ferramenta, confere o login, verifica o que ela carrega por conta própria (sem gastar a sua conta) e lê os modelos.':
    'Not connected by the board yet. Connect finds the tool, checks the sign-in, verifies what it loads on its own (without spending your account) and reads the models.',
  'Passa o agente para este modo quando o login der certo, com a mesma chave e os mesmos modelos.':
    'Switches the agent to this mode once the sign-in works, with the same key and the same models.',
  'Conectar no modo {mode}': 'Connect in {mode} mode',
  'Abre o login num terminal; quando ele fechar, o board confere a conta e retoma o Conectar sozinho.':
    'Opens the sign-in in a terminal; when it closes, the board checks the account and resumes Connect on its own.',
  'Uso nos cards': 'Use in cards',
  'Este agente roda os cards sem modelo e não pode ser desligado: use "Usar nos cards sem modelo" em outro agente antes.':
    'This agent runs the cards with no model and cannot be disabled: use "Usar nos cards sem modelo" (use for cards with no model) on another agent first.',
  'Usar nos cards sem modelo': 'Use for cards with no model',
  'Ligue ou conecte o agente antes.': 'Enable or connect the agent first.',
  'Os cards sem modelo (nem no card, nem no agente, nem por uma regra) passam a rodar com este. Os outros seguem no agente do modelo deles.':
    "Cards with no model (not on the card, the agent or a rule) will run with this one. The others stay on their model's agent.",
  'Roda os cards que não escolhem modelo. Os que escolhem um modelo de outro agente rodam nele, ao mesmo tempo.':
    "Runs the cards that don't choose a model. The ones that choose another agent's model run on that agent, at the same time.",
  'Roda os cards que escolhem um modelo dele, ao mesmo tempo que os outros agentes. Os modelos dele aparecem no campo Modelo dos cards e no chat.':
    "Runs the cards that choose one of its models, alongside the other agents. Its models show up in the cards' Model field and in the chat.",
  'Desligado: o board não usa este agente.': "Disabled: the board doesn't use this agent.",
  'programa instalado no computador': 'program installed on the computer',
  'agente pelo protocolo ACP': 'agent over the ACP protocol',
  'direto pela API, sem programa instalado': 'straight through the API, with no program installed',
  'Cópias e perfis personalizados não passam pelo Conectar: verifique as capacidades e dê a ciência do regime nas ações abaixo; depois, ligue o perfil.':
    'Copies and custom profiles do not go through Connect: check the capabilities and acknowledge the regime with the actions below; then enable the profile.',
  'Ações do perfil': 'Profile actions',
  'O board ainda não executa cards com este agente: ele está no registro do ACP, mas não no catálogo da extensão. Dá para entrar na conta e conversar com ele na aba Testar.':
    "The board does not run cards with this agent yet: it is in the ACP registry, but not in the extension's catalog. You can sign in and talk to it in the Test tab.",

  // a conta
  'Conta do agente': "Agent's account",
  Conta: 'Account',
  'Verificando…': 'Checking…',
  'Com login': 'Signed in',
  'Sem login': 'Signed out',
  'Não verificada': 'Not checked',
  'Não deu para verificar': 'Could not check',
  'verificada em {date}': 'checked on {date}',
  'Login em curso no terminal. Termine lá: quando o terminal fechar, o board confere a conta sozinho.':
    'Sign-in in progress in the terminal. Finish there: when the terminal closes, the board checks the account on its own.',
  'Login em curso pelo {name}. Termine onde ele pediu (o navegador, por exemplo).':
    'Sign-in in progress through {name}. Finish where it asked you to (the browser, for example).',
  'O agente não anuncia como entrar: ele usa a conta que já estiver configurada nesta máquina.':
    'The agent does not announce how to sign in: it uses whatever account is already set up on this machine.',
  'Verificar a conta': 'Check the account',
  'Espere o login terminar': 'Wait for the sign-in to finish',
  'Confere o login agora, sem gastar a sua conta: o status da CLI ou uma sessão do agente sem pedido.':
    "Checks the sign-in now, without spending your account: the CLI's status or an agent session with no request.",
  'Sair da conta': 'Sign out',
  'Sai da conta da ferramenta nesta máquina: ela sai também fora do board (terminal, editor).':
    'Signs the tool out on this machine: it signs out outside the board too (terminal, editor).',
  'Sair da conta do {name}?': 'Sign out of {name}?',
  'A ferramenta sai da conta nesta máquina inteira, não só no board: o terminal e o editor também ficam sem login até você entrar de novo.':
    'The tool signs out on this whole machine, not only on the board: the terminal and the editor also stay signed out until you sign in again.',
  'Entrar no terminal': 'Sign in from the terminal',
  'Abre o login num terminal do editor; quando ele fechar, o board confere a conta sozinho.':
    'Opens the sign-in in an editor terminal; when it closes, the board checks the account on its own.',
  'Rode o comando acima num terminal desta máquina e depois clique em Verificar a conta.':
    'Run the command above in a terminal on this machine, then click Check the account.',
  Entrar: 'Sign in',
  'Pede ao agente que faça o login (ele pode abrir o navegador); o board espera você terminar.':
    'Asks the agent to sign in (it may open the browser); the board waits for you to finish.',
  'Entrar com a chave': 'Sign in with the key',
  'Entrega a chave à ferramenta; ela não volta para esta tela nem vai para o log.':
    'Hands the key to the tool; it never comes back to this screen and never goes to the log.',
  'Espere a operação em andamento': 'Wait for the operation in progress',
  'Informe a chave': 'Enter the key',

  // os modelos
  'Modelos do agente': "Agent's models",
  'Ligue o agente antes: o board lê os modelos só dos agentes ligados.':
    'Enable the agent first: the board only reads the models of enabled agents.',

  // a sessão de teste
  'Teste rápido': 'Quick test',
  'Teste rápido pelo caminho dos cards': 'Quick test through the cards path',
  'Modelo do teste': 'Test model',
  'a lista de modelos da sua conta na API, pela chave guardada no Conectar; o que a conta não lista mais sai do catálogo':
    "your account's model list from the API, with the key saved in Connect; what the account no longer lists leaves the catalog",
  'No modo API a ferramenta não tem modelo padrão: o teste roda neste modelo.':
    'In API mode the tool has no default model: the test runs on this model.',
  'Nenhum modelo no catálogo: conecte o agente de novo na aba Conexão.':
    'No models in the catalog: connect the agent again in the Connection tab.',
  'Escolha o modelo do teste: no modo API a ferramenta não tem modelo padrão.':
    'Choose the test model: in API mode the tool has no default model.',
  'Um pedido curto pelo mesmo caminho das execuções dos cards, para conferir que o agente responde.':
    'A short request through the same path as card runs, to check that the agent answers.',
  'Executa um pedido curto como numa execução de card; usa a sua assinatura.':
    'Runs a short request as in a card run; it uses your subscription.',
  'Ligue o agente antes.': 'Enable the agent first.',
  'Testar o {name}?': 'Test {name}?',
  'Testando…': 'Testing…',
  'Sessão de teste': 'Test session',
  'Sessão de teste pelo ACP': 'Test session over ACP',
  'Conversa com o agente em tempo real: o texto, o raciocínio, as ferramentas, o plano e os pedidos de permissão, que você responde aqui. Fecha sozinha depois de 10 minutos parada.':
    'Talks to the agent in real time: the text, the reasoning, the tools, the plan and the permission requests, which you answer here. It closes by itself after 10 idle minutes.',
  'Abrir esta fecha a sessão de teste do {name}.': "Opening this one closes {name}'s test session.",
  'Abrir sessão de teste': 'Open test session',
  'Inicia o agente pelo ACP e abre uma sessão na pasta do projeto, para conversar com ele aqui':
    'Starts the agent over ACP and opens a session in the project folder, to talk to it here',
  'O agente não está disponível nesta máquina': 'The agent is not available on this machine',
  'Abrir de novo': 'Open again',
  'Fecha e abre de novo: o agente relê o login e começa uma sessão nova':
    'Closes and opens again: the agent rereads the sign-in and starts a new session',
  'Encerrar sessão': 'End session',
  'Encerra a sessão e o processo do agente': "Ends the session and the agent's process",
  Fechada: 'Closed',
  'Abrindo…': 'Opening…',
  Aberta: 'Open',
  'Pede login': 'Asks for sign-in',
  'Respondendo…': 'Responding…',
  Erro: 'Error',
  'sessão {id}': 'session {id}',
  'O agente pediu login. Entre na conta na aba Conexão e depois clique em Abrir de novo.':
    'The agent asked for sign-in. Sign in on the Connection tab, then click Open again.',
  'Opções da sessão': 'Session options',
  'O agente não declarou opções de sessão (modelo, esforço, modo).': 'The agent declared no session options (model, effort, mode).',
  'Modo (session/set_mode)': 'Mode (session/set_mode)',
  '{count} opções': '{count} options',
  'Eventos do agente': 'Agent events',
  'Nenhum evento ainda. Envie um prompt para ver a resposta chegar em tempo real.':
    'No events yet. Send a prompt to watch the answer arrive in real time.',
  'Contexto: {used} de {size} tokens': 'Context: {used} of {size} tokens',
  'Prompt de teste': 'Test prompt',
  'Liste os arquivos da raiz do projeto': 'List the files at the project root',
  'Limpa os eventos da tela; a sessão continua': 'Clears the events on screen; the session goes on',
  Limpar: 'Clear',
  'Manda session/cancel: o agente encerra o turno': 'Sends session/cancel: the agent ends the turn',
  Interromper: 'Stop',
  'Envia o prompt ao agente (Ctrl+Enter)': 'Sends the prompt to the agent (Ctrl+Enter)',
  'Abra a sessão de teste antes': 'Open the test session first',
  'Escreva o prompt': 'Write the prompt',
  Enviar: 'Send',
  Raciocínio: 'Reasoning',
  Plano: 'Plan',
  'O agente pede permissão: {title}': 'The agent asks for permission: {title}',
  'Resposta: {answer}': 'Answer: {answer}',
  'Responde ao agente: {option}': 'Answers the agent: {option}',
  'Fim do turno': 'End of turn',

  // o log do protocolo
  'Log do protocolo ACP': 'ACP protocol log',
  'Limpa as linhas da tela; o arquivo continua com tudo': 'Clears the lines on screen; the file keeps everything',
  'Abre no editor o arquivo de hoje, com o JSON completo de cada mensagem':
    "Opens today's file in the editor, with the full JSON of each message",
  'Este board não tem pasta de dados para o log': 'This board has no data folder for the log',
  'Abrir arquivo': 'Open file',
  'Cada mensagem JSON-RPC trocada com o agente, nos dois sentidos: a seta para a direita sai do board, a para a esquerda vem do agente. As respostas mostram o tempo do pedido.':
    'Each JSON-RPC message exchanged with the agent, in both directions: the right arrow leaves the board, the left arrow comes from the agent. Responses show how long the request took.',
  'Ocultar session/update': 'Hide session/update',
  'Esconde da lista os avisos de progresso do agente. Só muda o que aparece aqui: o arquivo continua com tudo.':
    "Hides the agent's progress notices from the list. It only changes what shows here: the file keeps everything.",
  'Pedido mais lento: {method} em {ms} ms': 'Slowest request: {method} in {ms} ms',
  'Nenhuma mensagem ainda. Verifique a conta de um agente ou abra uma sessão de teste para ver o initialize e o resto da conversa do protocolo.':
    "No messages yet. Check an agent's account or open a test session to see initialize and the rest of the protocol exchange.",
  processo: 'process',
  resposta: 'response',
  erro: 'error',
  'do board para o agente': 'from the board to the agent',
  'do agente para o board': 'from the agent to the board',

  // os detalhes
  Tipo: 'Type',
  Isolamento: 'Isolation',
  Versão: 'Version',
  Medição: 'Measurement',
  Autores: 'Authors',
  Distribuição: 'Distribution',
  binário: 'binary',
  'Personalizado pelo ACP: continua rodando como está. O caminho normal é conectar o agente do catálogo no modo ACP; perfis personalizados novos são só de CLI.':
    'Custom over ACP: it keeps running as it is. The usual path is to connect the catalog agent in ACP mode; new custom profiles are CLI only.',
  'Mostra o agente do catálogo deste perfil, para conectar.': "Shows this profile's catalog agent, to connect it.",
  'Abrir o agente do catálogo': 'Open the catalog agent',

  // as mensagens do host sobre a conta, o login e a sessão de teste
  'O login no terminal terminou com o código {code}.': 'The sign-in in the terminal ended with code {code}.',
  'Rode no terminal: {command}': 'Run in a terminal: {command}',
  'Já há um login em curso para este agente.': 'A sign-in is already in progress for this agent.',
  'Este agente não tem esse método de login.': 'This agent has no such sign-in method.',
  'Este agente não sai da conta por aqui.': 'This agent cannot be signed out from here.',
  'Esta ferramenta não tem comando para sair da conta.': 'This tool has no sign-out command.',
  'O comando para sair da conta terminou com o código {code}.': 'The sign-out command ended with code {code}.',
  '{name} não oferece sair da conta pelo protocolo.': '{name} offers no sign-out over the protocol.',
  '{name} não respondeu ao logout.': '{name} did not answer the logout.',
  'O login pelo {name} não terminou em {minutes} min.': 'The sign-in through {name} did not finish in {minutes} min.',
  '{name} não abriu a sessão em {seconds} s.': '{name} did not open the session in {seconds} s.',
  '{name} não respondeu ao initialize em {seconds} s.': '{name} did not answer initialize in {seconds} s.',
  'Não deu para iniciar {name}: {error}': 'Could not start {name}: {error}',
  '{name} saiu (código {code}) antes de responder.': '{name} exited (code {code}) before answering.',
  '{name} não está instalado: o comando {command} não está no PATH.': '{name} is not installed: the {command} command is not on the PATH.',
  '{name} não está instalado neste computador.': '{name} is not installed on this computer.',
  'Este agente não está mais no registro do ACP.': 'This agent is no longer in the ACP registry.',
  '{name} não tem modo ACP para a sessão de teste.': '{name} has no ACP mode for the test session.',
  'O agente pediu login antes de abrir a sessão.': 'The agent asked for sign-in before opening the session.',
  'O agente pediu login para responder.': 'The agent asked for sign-in to answer.',
  'O agente saiu (código {code}).': 'The agent exited (code {code}).',
  'A sessão de teste fechou depois de {minutes} min sem uso. Abra de novo para continuar.':
    'The test session closed after {minutes} idle min. Open it again to go on.',
  'Sessão de teste encerrada.': 'Test session ended.',
  'Nenhuma sessão de teste aberta.': 'No test session open.',
  'O agente ainda está respondendo.': 'The agent is still answering.',
  'Nenhuma sessão de teste para abrir de novo.': 'No test session to open again.',
  'Conectar agentes não está disponível neste host.': 'Connect agents is not available on this host.',
  'Este board não tem pasta de dados para o log do protocolo.': 'This board has no data folder for the protocol log.',
  'Ainda não há log do protocolo hoje: verifique a conta de um agente ou abra uma sessão de teste.':
    "There is no protocol log today yet: check an agent's account or open a test session.",
  'O registro do ACP respondeu {status}.': 'The ACP registry answered {status}.',
  'O registro do ACP veio num formato inesperado.': 'The ACP registry came in an unexpected format.',
  'Baixa {package} pelo {runner} na primeira vez.': 'Downloads {package} through {runner} the first time.',
  'Precisa do {runner} instalado.': 'Needs {runner} installed.',
  'Instale o {command} pela página do agente: o board não baixa binários.':
    "Install {command} from the agent's page: the board does not download binaries.",
  'Sem comando para esta plataforma.': 'No command for this platform.',
  'Sem binário para esta plataforma.': 'No binary for this platform.',
  // o contexto do card
  'entra sozinho': 'loads on its own',
  'Contexto fechado por construção: no modo API o próprio board monta cada pedido, e nenhum programa lê arquivos por conta própria. Não há o que testar.':
    'Closed context by construction: in API mode the board itself builds each request, and no program reads files on its own. There is nothing to test.',
  'Arquivos: {list}': 'Files: {list}',
  'fica de fora: só entra se o card incluir': 'stays out: only enters if the card includes it',
  'fica de fora: só entra se o card incluir (testado com isca)': 'stays out: only enters if the card includes it (tested with a decoy)',
  'Ainda não testado: o board não sabe o que este agente lê sozinho.':
    "Not tested yet: the board doesn't know what this agent reads on its own.",
  'O teste não terminou: {error}': "The test didn't finish: {error}",
  'Testado na versão {old}; a atual é {now}. Teste de novo.': 'Tested on version {old}; the current one is {now}. Test again.',
  Caminho: 'Path',
  'Relativo à raiz do projeto, ou começando por ~/ na sua pasta pessoal. Aceita * e **.':
    'Relative to the project root, or starting with ~/ in your home folder. Accepts * and **.',
  'Fecha sem acrescentar.': 'Closes without adding.',
  'Informe o caminho': 'Enter the path',
  'O local entra no próximo teste.': 'The location goes into the next test.',
  'Por que isso importa': 'Why this matters',
  'Com o contexto fechado, cada card gasta só o necessário e segue só as instruções dele. Aberto, a IA também lê arquivos da própria ferramenta: gasta mais e pode seguir instruções que não estão no card.':
    "With the closed context, each card spends only what it needs and follows only its own instructions. Open, the AI also reads the tool's own files: it costs more and may follow instructions that are not in the card.",
  'Testando o que o agente lê sozinho… Gasta alguns pedidos da conta dele.':
    "Testing what the agent reads on its own… It uses a few requests from the agent's account.",
  'O que este agente lê sozinho ({n} locais)': 'What this agent reads on its own ({n} locations)',
  'Padrão da ferramenta': 'Tool default',
  'carrega sempre': 'always loads',
  'carrega quando combina': 'loads when relevant',
  'seus arquivos': 'your files',
  projeto: 'project',
  'acrescentado por você': 'added by you',
  'achado no projeto': 'found in the project',
  'Tirar {path}': 'Remove {path}',
  'Tira o local que você acrescentou; vale no próximo teste.': 'Removes the location you added; applies on the next test.',
  '"Padrão da ferramenta" é o que o agente declarou: como ela se comporta rodando sozinha. O veredito ao lado de cada local é o que o teste provou rodando como um card. Os arquivos da sua pasta pessoal só são lidos: o board nunca escreve neles.':
    '"Tool default" is what the agent declared: how the tool behaves running on its own. The verdict next to each location is what the test proved running as a card. Files in your home folder are only read: the board never writes to them.',
  Locais: 'Locations',
  'Um local que o agente lê e não declarou.': "A location the agent reads and didn't declare.",
  'Acrescentar um local': 'Add a location',
  Acrescentar: 'Add',
  'O teste já está em curso.': 'The test is already running.',
  'Pergunta ao agente onde ele lê sozinho e confere pedindo que ele cite trechos desses arquivos, rodando como um card. Gasta alguns pedidos da conta dele.':
    "Asks the agent where it reads on its own and checks by asking it to quote passages from those files, running as a card. It uses a few requests from the agent's account.",
  'Testar agora': 'Test now',
  'Testar de novo': 'Test again',
  'Contexto fechado': 'Closed context',
  instruções: 'instructions',
  regras: 'rules',
  memória: 'memory',
  skills: 'skills',
  agentes: 'agents',
  hooks: 'hooks',
  'servidores MCP': 'MCP servers',
  configuração: 'configuration',
  'não verificável por este teste (não entra como texto)': "can't be checked by this test (not loaded as text)",
  'caminho que o board não sabe resolver': "a path the board can't resolve",
  'não existe na sua pasta pessoal; o board não escreve nela': "doesn't exist in your home folder; the board doesn't write there",
  'existe, mas sem uma linha boa para citar': 'exists, but has no good line to quote',
  'sem prova: o agente não citou nem a linha de controle': "no proof: the agent didn't even quote the control line",
  'sem prova: o agente usou ferramentas no teste': 'no proof: the agent used tools during the test',
  'o teste não rodou': "the test didn't run",
  // o que fazer com o que entra sozinho
  'Cópias antigas da skill do fluxo que versões anteriores do Faz AI instalaram: o fluxo agora vem do board, e você pode apagar estas pastas.':
    'Old copies of the flow skill that earlier Faz AI versions installed: the flow now comes from the board, and you can delete these folders.',
  'Vêm do plugin "{plugin}" da ferramenta: se você não o usa, desinstale.':
    'They come from the tool\'s "{plugin}" plugin: if you don\'t use it, uninstall it.',
  'Da sua pasta pessoal, entram em todos os projetos. Importe para o board (Harness › Importar) e tire da pasta, ou mova para a pasta de skills do projeto que a usa (isso só limita o vazamento a esse projeto).':
    'From your home folder, they enter every project. Import them into the board (Harness › Import) and remove them from the folder, or move them to the skills folder of the project that uses them (that only limits the leak to that project).',
  'Instruções da sua pasta pessoal, valem para todos os projetos: mova para o projeto o que for só dele.':
    'Instructions from your home folder apply to every project: move to the project whatever is only for it.',
  'Do projeto: leve o conteúdo para uma regra do board, que entra só nos cards que a pedirem, e deixe aqui uma referência para quem usa a ferramenta fora do board.':
    'From the project: move the content to a board rule, which only enters the cards that ask for it, and leave a reference here for whoever uses the tool outside the board.',
  'Perguntando ao agente…': 'Asking the agent…',
  'Já é só a referência que o board deixou: entra em todo card apenas esta linha, e não há mais o que fazer aqui.':
    'It is already just the reference the board left: only this line enters every card, and there is nothing left to do here.',
  'Sugerido pelo agente, confira antes de rodar:': 'Suggested by the agent, check before running:',
  'O agente não soube dizer o comando: veja a documentação da ferramenta.':
    "The agent couldn't tell the command: see the tool's documentation.",
  'Pergunta ao agente o comando que desinstala este plugin. Gasta um pedido da conta dele; o board nunca roda o comando.':
    "Asks the agent for the command that uninstalls this plugin. It uses one request from the agent's account; the board never runs the command.",
  'Como desinstalar?': 'How to uninstall?',
  'Prévia da mudança': 'Change preview',
  'Nome da regra': 'Rule name',
  'Letras minúsculas, números e hífens.': 'Lowercase letters, numbers and hyphens.',
  'O conteúdo de {file} vira a regra "{rule}" do board (Configurações › Harness), e {file} passa a ter só:':
    'The content of {file} becomes the board rule "{rule}" (Settings › Harness), and {file} keeps only:',
  'Para a regra entrar nos cards, marque-a em Harness › Regras (sempre ou pelo card). Depois, o teste do contexto roda de novo.':
    'For the rule to enter cards, mark it in Harness › Rules (always or by card). Then the context test runs again.',
  'Todas as linhas de {replace} já estão em {keep}: nada se perde. {replace} passa a ter só:':
    'Every line of {replace} is already in {keep}: nothing is lost. {replace} keeps only:',
  'Depois, o teste do contexto roda de novo.': 'Then the context test runs again.',
  'Fecha sem mudar nada.': 'Closes without changing anything.',
  'Informe o nome da regra': 'Enter the rule name',
  'Grava a mudança no projeto. Ela fica no git: dá para desfazer.': 'Writes the change in the project. It stays in git: it can be undone.',
  'Importar como regra': 'Import as rule',
  Juntar: 'Merge',
  'Repete {pct}% das linhas em {other}.': 'Repeats {pct}% of its lines in {other}.',
  'Troca {file} por uma referência a {other}, que já tem todas as linhas dele.':
    'Replaces {file} with a reference to {other}, which already has all its lines.',
  'Juntar em {other}': 'Merge into {other}',
  'Junte à mão o que só existe aqui e deixe uma referência.': 'Merge by hand what only exists here and leave a reference.',
  'Mantido por você: entra em todo card.': 'Kept by you: it enters every card.',
  'Volta a mostrar a sugestão deste local.': "Shows this location's suggestion again.",
  'Mostra a prévia: o conteúdo vira uma regra do board e o arquivo fica com uma referência.':
    'Shows the preview: the content becomes a board rule and the file keeps a reference.',
  'Abre a pasta no sistema; o board não muda nada nela.': "Opens the folder in the system; the board doesn't change anything in it.",
  'Você quer que este local entre em todo card: a sugestão some e ele não conta no resumo.':
    "You want this location to enter every card: the suggestion goes away and it doesn't count in the summary.",
  'Manter assim': 'Keep it',
  '~1 token em todo card': '~1 token in every card',
  '~{n} tokens em todo card': '~{n} tokens in every card',
  'Contexto aberto': 'Open context',
  'Contexto fechado:': 'Closed context:',
  'a IA usa só o que o card entrega.': 'the AI uses only what the card provides.',
  'Contexto aberto por escolha sua:': 'Open context by your choice:',
  'Contexto aberto:': 'Open context:',
  'Não deu para verificar: nenhum local teve prova.': "Couldn't verify: no location had proof.",
  'O agente não disse onde lê; só os arquivos de instrução do projeto foram conferidos.':
    "The agent didn't say where it reads; only the project's instruction files were checked.",
  'Verificado em {date}. Veja abaixo o que fazer com cada um.': 'Verified on {date}. See below what to do with each one.',
  'Verificado em {date}.': 'Verified on {date}.',
  'você manteve 1 local que entra em todo card.': 'you kept 1 location that enters every card.',
  'você manteve {n} locais que entram em todo card.': 'you kept {n} locations that enter every card.',
  '1 local entra sozinho em todo card': '1 location loads on its own in every card',
  '{n} locais entram sozinhos em todo card': '{n} locations load on their own in every card',
  '(~1 token).': '(~1 token).',
  '(~{n} tokens).': '(~{n} tokens).',
};
