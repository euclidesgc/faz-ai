// Configurações › Conectar agentes: a lista, o agente em uso, a conexão, a conta, os modelos, a sessão de teste, o log
// do protocolo e as mensagens do host sobre a conta e a sessão de teste.
export const agentConnect: Record<string, string> = {
  // a página, o menu e o agente em uso
  'Conectar agentes': 'Connect agents',
  'Escolha o agente de IA que roda os cards, entre na conta dele, conecte-o ao board e ajuste os modelos. Só um agente fica em uso de cada vez; os outros ligados entram pelo campo Modelo, pelas regras de sugestão e pelas políticas de fallback.':
    'Pick the AI agent that runs the cards, sign in to it, connect it to the board and tune its models. Only one agent is in use at a time; the other enabled ones come in through the Model field, the suggestion rules and the fallback policies.',
  'Verificar situação': 'Check status',
  'Confere de novo se cada agente está instalado, a versão e o login da CLI.':
    "Checks again whether each agent is installed, its version and the CLI's sign-in.",
  'Atualizar lista': 'Refresh list',
  'Baixa de novo a lista do registro oficial do ACP e relê o PATH (depois de instalar um agente).':
    'Downloads the official ACP registry list again and rereads the PATH (after you install an agent).',
  'Agente em uso': 'Agent in use',
  'Agente em uso: {name}': 'Agent in use: {name}',
  'Ainda não conectado pelo board': 'Not connected by the board yet',
  'Ver conexão': 'See connection',
  'Mostra a conexão e a conta do agente em uso': 'Shows the connection and the account of the agent in use',
  'Abre a aba Testar do agente em uso': 'Opens the Test tab of the agent in use',
  'Em uso': 'In use',

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
  'Em uso nos cards': 'In use in cards',
  'Usar nos cards': 'Use in cards',
  'Ligue ou conecte o agente antes.': 'Enable or connect the agent first.',
  'Os cards que não escolhem outro agente (pelo campo Modelo, pelo agente ou por uma regra) passam a rodar com este.':
    'Cards that do not pick another agent (through the Model field, the agent or a rule) will run with this one.',
  'É o agente que roda os cards que não escolhem outro. Para desligá-lo, ponha outro agente em uso antes.':
    'This is the agent that runs the cards that do not pick another. To disable it, put another agent in use first.',
  'Ligado: o campo Modelo dos cards, o chat e as regras de sugestão oferecem os modelos dele.':
    "Enabled: the cards' Model field, the chat and the suggestion rules offer its models.",
  'Desligado: o board não roda nada com ele.': 'Disabled: the board runs nothing with it.',
  'Conectado: {summary}.': 'Connected: {summary}.',
  'Cópias e perfis personalizados não passam pelo Conectar: em Detalhes, verifique as capacidades e dê a ciência do regime; depois, ligue o perfil aqui.':
    'Copies and custom profiles do not go through Connect: in Details, check the capabilities and acknowledge the regime; then enable the profile here.',
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
  'Regime compatível': 'Compatible regime',
  'com a sua ciência (revisão {n})': 'with your acknowledgment (revision {n})',
  'sem ciência': 'not acknowledged',
  Versão: 'Version',
  Medição: 'Measurement',
  'Registro do ACP': 'ACP registry',
  Autores: 'Authors',
  Distribuição: 'Distribution',
  binário: 'binary',
  'Comando da sessão de teste': 'Test session command',
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
};
