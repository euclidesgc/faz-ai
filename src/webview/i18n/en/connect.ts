// O Conectar de cada agente (história 7), em Conectar agentes: os passos, as fichas dos modos de `TOOLS`
// (`src/shared/aiTools.ts`) e as mensagens do Conectar no host.
export const connect: Record<string, string> = {
  // a tela
  Perfis: 'Profiles',
  'Ainda não oferecidos nesta versão: {modes}.': 'Not offered in this version yet: {modes}.',
  Recomendado: 'Recommended',
  'O que o board controla': 'What the board controls',
  'Regime esperado': 'Expected regime',
  'Precisão do que foi usado': 'Accuracy of what was used',
  'O que a ferramenta traz': 'What the tool brings',
  'Como se entra': 'How you sign in',
  Cobrança: 'Billing',
  'Quando escolher': 'When to choose',
  Conectar: 'Connect',
  Reconectar: 'Reconnect',
  'Acha a ferramenta, faz o login, verifica as capacidades e lê os modelos.':
    'Finds the tool, signs in, checks the capabilities, and reads the models.',
  'Use se algo parou de funcionar: refaz o login, a verificação e a leitura dos modelos.':
    'Use it if something stopped working: redoes the sign-in, the check, and the model reading.',
  'Pronto para rodar cards': 'Ready to run cards',
  'Pronto para rodar cards · conferido em {date}': 'Ready to run cards · checked on {date}',
  'Falta a sua ciência: o agente não roda cards até você dá-la.':
    "Your acknowledgment is missing: the agent won't run cards until you give it.",
  'Ver detalhes': 'See details',
  'O Conectar está em curso.': 'Connect is in progress.',
  'Achar a ferramenta': 'Find the tool',
  'Entrar na conta': 'Sign in',
  'Verificar as capacidades': 'Check the capabilities',
  'Ciência do regime': 'Regime acknowledgment',
  'Ler os modelos': 'Read the models',
  'Passos do Conectar': 'Connect steps',
  feito: 'done',
  'a seguir': 'next',
  'em curso': 'in progress',
  'espera você': 'waiting for you',
  falhou: 'failed',
  Conectada: 'Connected',
  'Conectar parou com erro no passo "{step}"': 'Connect stopped with an error at "{step}"',
  'Conectar em andamento: "{step}"': 'Connect in progress: "{step}"',
  'versão desconhecida': 'unknown version',
  'chave de API guardada': 'API key stored',
  'chave de API conferida': 'API key checked',
  'Modo em uso': 'Mode in use',
  'O board confere a chave agora, lendo a lista de modelos da conta pela API do Gemini (não gasta a conta). Aceita, ela fica guardada no cofre deste computador, a mesma para todos os modos, e vai para a CLI só no ambiente de cada execução; ela não volta para esta tela. Recusada, a chave guardada antes continua.':
    'The board checks the key now, by reading your account’s model list through the Gemini API (it does not spend your quota). Once accepted, it is stored in this computer’s vault, the same for every mode, and reaches the CLI only in the environment of each run; it never comes back to this screen. If refused, the previously stored key stays.',
  'MCP e ferramentas pelo settings da home isolada; a aprovação por nível; o contexto do projeto o Gemini carrega':
    'MCP and tools through the isolated home’s settings; approval by level; Gemini loads the project context',
  'exclusivo se as sondas passarem; senão compatível (a 0.65.0 lê o GEMINI.md do projeto)':
    'exclusive if the probes pass; otherwise compatible (0.65.0 reads the project’s GEMINI.md)',
  'boa: `tool_use` e `tool_result` no `stream-json`': 'good: `tool_use` and `tool_result` in the `stream-json`',
  'tokens por modelo (`result.stats`); o contexto próprio do projeto conta':
    'tokens per model (`result.stats`); the project’s own context counts',
  'o agente completo do Gemini CLI, numa passada': 'the full Gemini CLI agent, in a single pass',
  'chave de API do Gemini (cofre, no ambiente da execução)': 'Gemini API key (vault, in the run’s environment)',
  'quando se quer o Gemini CLI numa passada, com o board fixando as ferramentas e os servidores MCP':
    'when you want Gemini CLI in a single pass, with the board fixing the tools and MCP servers',
  'O board confere a chave agora, lendo a lista de modelos da conta pela API do Gemini (não gasta a conta). Aceita, ela fica guardada no cofre deste computador, a mesma para todos os modos, e vai à API só no cabeçalho; ela não volta para esta tela. Recusada, a chave guardada antes continua.':
    'The board checks the key now, by reading the account’s model list through the Gemini API (it does not spend the account). Once accepted, it is stored in this computer’s vault, the same for every mode, and goes to the API only in the header; it never comes back to this screen. If refused, the key stored before stays.',
  'Confere a chave com a API, guarda no cofre e continua o Conectar.':
    'Checks the key with the API, stores it in the vault and continues Connect.',
  'Conferir e guardar a chave': 'Check and store the key',
  'a IA também lê a configuração do próprio agente (regime compatível), sem a sua ciência: o perfil não roda até você dar a ciência':
    "the AI also reads the agent's own configuration (compatible regime), without your acknowledgment: the profile does not run until you acknowledge it",
  'O Conectar espera você no passo "{step}": continue no cartão em Conectar ferramenta, acima.':
    'Connect is waiting for you at "{step}": continue on the card in Connect a tool, above.',
  'Trocar a chave': 'Change the key',
  'Guarda outra chave no cofre e refaz o login e a verificação.': 'Stores another key in the vault and redoes the sign-in and the check.',
  'Fecha o campo sem trocar a chave guardada.': 'Closes the field without changing the stored key.',
  'Revogar ciência': 'Revoke acknowledgment',
  'Tira a sua ciência do regime compatível: o perfil deixa de rodar até você dar a ciência de novo.':
    'Removes your acknowledgment of the compatible regime: the profile stops running until you acknowledge it again.',
  'Dar ciência do regime compatível': 'Acknowledge the compatible regime',
  'Grava a sua ciência do regime compatível para este perfil, depois de ler o que ele carrega.':
    'Records your acknowledgment of the compatible regime for this profile, after reading what it loads.',
  'Dar ciência do regime compatível ao perfil "{name}"?': 'Acknowledge the compatible regime for profile "{name}"?',
  'Regime compatível com a sua ciência (revisão {n})': 'Compatible regime with your acknowledgment (revision {n})',
  'Ligue o perfil antes.': 'Turn the profile on first.',
  'Retoma o Conectar do passo em que parou.': 'Resumes Connect from the step where it stopped.',
  'login confirmado': 'signed in',
  'login não verificado': 'sign-in not verified',
  'a IA lê só o que o board prepara (regime exclusivo)': 'the AI reads only what the board prepares (exclusive regime)',
  'a IA também lê a configuração do próprio agente (regime compatível, ciência {n})':
    "the AI also reads the agent's own configuration (compatible regime, acknowledgment {n})",
  'sem sonda de capacidades': 'no capability probe',
  'capacidades não verificadas': 'capabilities not checked',
  'modelos da lista da extensão (o agente não informa os dele)': "models from the extension's list (the agent doesn't report its own)",
  '1 modelo': '1 model',
  '{n} modelos': '{n} models',
  'Chave de API': 'API key',
  'Cole a chave aqui': 'Paste the key here',
  'A chave fica guardada no cofre deste computador e vai para o login da ferramenta; ela não volta para esta tela. A ferramenta a confere de fato na primeira execução: uma chave errada aparece ali, com a mensagem dela.':
    'The key is stored in this computer’s vault and goes to the tool’s sign-in; it never comes back to this screen. The tool actually checks it on the first run: a wrong key shows up there, with the tool’s message.',
  'Guarda a chave no cofre e continua o Conectar.': 'Stores the key in the vault and continues Connect.',
  'Guardar a chave e continuar': 'Store the key and continue',
  'O {name} roda no regime compatível: ele carrega por conta própria arquivos de instruções e configuração que o board não montou. Permissões, MCP e delegação continuam decididos pelo card.':
    '{name} runs in the compatible regime: it loads instruction and configuration files on its own that the board did not assemble. Permissions, MCP, and delegation are still decided by the card.',
  'O que ele traz: {brings}.': 'What it brings: {brings}.',
  'Grava a sua ciência para este perfil; a revisão sobe a cada vez.':
    'Records your acknowledgment for this profile; the revision goes up each time.',
  'Entendo o que a ferramenta carrega': 'I understand what the tool loads',
  'Dá de novo a sua ciência do regime compatível: o perfil volta a rodar, sem refazer o Conectar.':
    'Gives your acknowledgment of the compatible regime again: the profile runs again, without redoing Connect.',
  'Abre um terminal com o comando de login.': 'Opens a terminal with the sign-in command.',
  'Tentar de novo': 'Try again',
  'Regime compatível ligado para o board inteiro (revisão {n}), de uma versão anterior. Agora o regime é de cada perfil: a ciência é dada no Conectar, em Conectar agentes.':
    'Compatible regime turned on for the whole board (revision {n}), from an earlier version. The regime is now per profile: you acknowledge it in Connect, under Connect agents.',
  'Desliga o regime compatível do board. Os perfis com ciência seguem no compatível; os que não passam pelo Conectar (cópias, personalizados) recebem a ciência nos detalhes deles, em Conectar agentes.':
    'Turns off the board-wide compatible regime. Acknowledged profiles stay compatible; those that do not go through Connect (copies, custom profiles) get the acknowledgment in their details, in Connect agents.',
  'Voltar ao exclusivo': 'Back to exclusive',
  // as fichas dos modos (`TOOLS`)
  'Usa uma chave de API do Gemini: cobrança por consumo, por projeto (há um nível gratuito).':
    'Uses a Gemini API key: billed by usage, per project (there is a free tier).',
  'É o único modo em que o board sabe de antemão tudo o que o agente pode acessar e paga só pelo que pediu.':
    'It is the only mode in which the board knows in advance everything the agent can access and pays only for what it asked.',
  'MCP e permissões, pedido a pedido; o contexto o agente carrega por conta própria':
    'MCP and permissions, request by request; the agent loads the context on its own',
  'compatível: o {name} lê os próprios arquivos de instruções e a própria configuração':
    'compatible: {name} reads its own instruction files and its own configuration',
  'boa: o agente anuncia cada ferramenta e MCP que usa': 'good: the agent announces each tool and MCP it uses',
  'tokens do turno (`usage`); o contexto próprio do agente também conta':
    'tokens for the turn (`usage`); the agent’s own context also counts',
  'o agente completo do {name} (ferramentas, planejamento, modos)': 'the full {name} agent (tools, planning, modes)',
  'chave de API do Gemini': 'Gemini API key',
  'por token': 'per token',
  'quando se quer o agente do próprio Gemini CLI decidindo como trabalhar': 'when you want Gemini CLI’s own agent deciding how to work',
  // a ficha do Gemini pela API (história 10)
  'tudo: contexto, ferramentas, MCP e permissões, chamada a chamada': 'everything: context, tools, MCP and permissions, call by call',
  'exclusivo, por construção: o board monta cada pedido e executa cada chamada':
    'exclusive, by construction: the board builds each request and executes each call',
  'exata: o inventário é a lista de chamadas que o board executou': 'exact: the inventory is the list of calls the board executed',
  'tokens por chamada (`usageMetadata`); nada gasto com contexto que o board não pediu':
    'tokens per call (`usageMetadata`); nothing spent on context the board did not ask for',
  'só o modelo: ler, editar arquivos e rodar comandos são ferramentas do board, liberadas pela permissão do card e confinadas às pastas dele, mais as dos MCPs do card':
    'only the model: reading, editing files and running commands are board tools, allowed by the card’s permission and confined to its folders, plus those of the card’s MCPs',
  'chave de API do Gemini, guardada no cofre local': 'Gemini API key, kept in the local vault',
  'para a finalidade do board: prever o acesso e gastar só o pedido, em Refinar, Resumir e Trabalhar na fase, com qualquer permissão':
    'for the board’s purpose: knowing the access in advance and spending only on the request, in refine, summarize and work on the phase, with any permission',
  'Usa a sua assinatura do Claude (Pro ou Max). Com uma chave de API da Anthropic, o uso é cobrado à parte, por consumo.':
    'Uses your Claude subscription (Pro or Max). With an Anthropic API key, usage is billed separately, by consumption.',
  'É o único modo que usa a assinatura: o ACP do Claude exige cobrança por API.':
    'It is the only mode that uses the subscription: Claude’s ACP requires API billing.',
  'agente, ferramentas e MCP por parâmetros da linha de comando, no modo estrito':
    'agent, tools, and MCP through command-line parameters, in strict mode',
  'exclusivo quando as sondas do verificador provam o isolamento; senão compatível':
    'exclusive when the verifier probes prove isolation; otherwise compatible',
  'boa: cada ferramenta e MCP no `stream-json` da CLI': 'good: each tool and MCP in the CLI’s `stream-json`',
  'custo e tokens por execução, informados pela CLI': 'cost and tokens per run, reported by the CLI',
  'o agente completo do {name}, numa passada': 'the full {name} agent, in a single pass',
  'login da própria ferramenta, no terminal (`{command}`)': 'the tool’s own sign-in, in the terminal (`{command}`)',
  'assinatura do Claude': 'Claude subscription',
  'é o único modo do Claude Code: o ACP dele exige cobrança por API, fora da assinatura':
    'it is Claude Code’s only mode: its ACP requires API billing, outside the subscription',
  'Usa o plano da sua conta do Cursor.': 'Uses your Cursor account plan.',
  'É o modo que a extensão traz pronto para o Cursor, com o hook que nega o que o card não libera.':
    'It is the mode the extension ships ready for Cursor, with the hook that denies what the card does not allow.',
  'MCP, ferramentas e subagentes pelo hook do board, na hora do uso; o agente do card segue pelo pedido':
    'MCP, tools, and subagents through the board hook, at the time of use; the card’s agent goes through the prompt',
  'compatível: a CLI do {name} ainda não tem sonda de capacidades': 'compatible: the {name} CLI has no capability probe yet',
  'boa: ferramentas e MCP no `stream-json` da CLI': 'good: tools and MCP in the CLI’s `stream-json`',
  'tokens por execução, informados pela CLI': 'tokens per run, reported by the CLI',
  'plano do Cursor': 'Cursor plan',
  'é o modo pronto do {name}; o ACP dele fica para depois do teste real': 'it is the ready {name} mode; its ACP waits for the real test',
  'Usa a sua conta do Kimi Code.': 'Uses your Kimi Code account.',
  'É o modo que a extensão traz pronto para o Kimi Code e que mede os tokens.':
    'It is the mode the extension ships ready for Kimi Code, and it measures tokens.',
  'o modelo; agente, ferramentas e MCP seguem como orientação no pedido': 'the model; agent, tools, and MCP go as guidance in the prompt',
  'boa: ferramentas e MCP na saída `stream-json` da CLI': 'good: tools and MCP in the CLI’s `stream-json` output',
  'o agente completo do Kimi Code, numa passada, com a permissão sempre automática':
    'the full Kimi Code agent, in a single pass, with permission always automatic',
  'conta do Kimi Code': 'Kimi Code account',
  'Usa a conta da própria ferramenta; a cobrança está na página oficial dela.':
    'Uses the tool’s own account; billing is on its official page.',
  'É o único modo que a extensão oferece para esta ferramenta.': 'It is the only mode the extension offers for this tool.',
  'tokens do último pedido do turno': 'tokens for the last request of the turn',
  'login da própria ferramenta, pelo protocolo ou no terminal': 'the tool’s own sign-in, through the protocol or in the terminal',
  'da conta da ferramenta': 'the tool’s own account',
  'quando se quer o agente do {name} decidindo como trabalhar, com o board respondendo cada pedido':
    'when you want the {name} agent deciding how to work, with the board answering each request',
  'tokens e custo do turno': 'tokens and cost for the turn',
  'não medido: o agente não informa os tokens pelo ACP': 'not measured: the agent does not report tokens over ACP',
  // as mensagens do Conectar no host
  'O comando `{command}` do {name} não está no PATH. Instale pela página oficial e tente de novo.':
    'The `{command}` command for {name} is not on the PATH. Install it from the official page and try again.',
  'Entre na conta do {name} no terminal (`{command}`) e tente de novo.': 'Sign in to {name} in the terminal (`{command}`) and try again.',
  '{name} recusou a sessão com a chave guardada. Confira a chave e tente de novo.':
    '{name} refused the session with the stored key. Check the key and try again.',
  '{name}: a verificação de capacidades não passou. Pendentes: {pending}.':
    '{name}: the capability check did not pass. Pending: {pending}.',
  // o resultado do "Verificar capacidades" (história 13), que antes saía só na notificação do comando da paleta
  '{name}: isolamento verificado; as cinco capacidades têm recibos válidos.':
    '{name}: isolation verified; all five capabilities have valid receipts.',
  '{name}: handshake do agente verificado. Os arquivos de contexto que ele lê por conta própria não têm prova: o perfil é admissível só no regime compatível.':
    '{name}: agent handshake verified. The context files it reads on its own have no proof: the profile is admissible only in the compatible regime.',
  '{name}: isolamento não verificado. Pendentes: {pending}.': '{name}: isolation not verified. Pending: {pending}.',
  '{name}: a verificação de capacidades só existe para a CLI do Claude, o Gemini pela CLI e os agentes ACP.':
    '{name}: the capability check exists only for the Claude CLI, Gemini over the CLI and the ACP agents.',
  '{name} está desligado ou espera revisão: ligue e revise o perfil antes de verificar.':
    '{name} is disabled or pending review: enable and review the profile before checking it.',
  '{name} recusou a chave de API: {reason}': '{name} refused the API key: {reason}',
  'A versão instalada do {name} não oferece o login por chave de API pelo ACP ({method}). Atualize a ferramenta e tente de novo.':
    'The installed version of {name} does not offer API key sign-in over ACP ({method}). Update the tool and try again.',
  '{name} pede login. Conecte em Configurações › Conectar agentes, com a chave de API.':
    '{name} asks you to sign in. Connect it in Settings › Connect agents, with the API key.',
  'Cole a chave de API.': 'Paste the API key.',
  'A chave de API tem de ser uma linha só, sem espaços, com 8 a 512 caracteres.':
    'The API key must be a single line, without spaces, 8 to 512 characters long.',
  '{name}: o Conectar é das ferramentas do catálogo; o perfil personalizado segue pelo formulário.':
    '{name}: Connect is for catalog tools; a custom profile goes through the form.',
  'O Conectar não está disponível neste host.': 'Connect is not available on this host.',
};
