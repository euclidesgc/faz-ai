// Rótulos, dicas e descrições das constantes de src/shared que a interface exibe (pt-BR → inglês).

export const shared: Record<string, string> = {
  // aparência (appearance.ts)
  'Sistema (acompanha o editor ou o sistema)': 'System (follows the editor or the system)',
  Claro: 'Light',
  Escuro: 'Dark',
  'Sem serifa do sistema': 'System sans-serif',
  'Fonte da interface do VS Code': 'VS Code interface font',
  Serifada: 'Serif',
  Monoespaçada: 'Monospace',
  'Fonte do editor do VS Code': 'VS Code editor font',

  // status dos cards e com quem está a pendência (status.ts)
  Pronto: 'Ready',
  'Em execução': 'Running',
  'Aguardando resposta': 'Waiting for answer',
  'Aguardando revisão': 'Waiting for review',
  Aprovado: 'Approved',
  Bloqueado: 'Blocked',
  'A IA pode trabalhar no card': 'The AI can work on the card',
  'Uma sessão de IA está trabalhando no card': 'An AI session is working on the card',
  'A IA fez uma pergunta na conversa': 'The AI asked a question in the conversation',
  'O trabalho da fase está pronto para ser revisado': 'The phase work is ready for review',
  'A IA deve mover o card para a próxima coluna': 'The AI should move the card to the next column',
  'Há um impedimento': 'There is a blocker',
  'com a IA': 'with AI',
  'com você': 'with you',

  // execução pela IA e heartbeat (runner.ts)
  'Só o board': 'Board only',
  'A IA lê o projeto e usa as ferramentas do board (conversa, anexos, status, mover cards). Não altera arquivos do projeto nem roda comandos.':
    'The AI reads the project and uses the board tools (conversation, attachments, status, moving cards). It does not change project files or run commands.',
  'Board e arquivos do projeto': 'Board and project files',
  'Além do board, a IA cria e altera arquivos do projeto sem pedir confirmação. Comandos de terminal continuam fora.':
    'Besides the board, the AI creates and changes project files without asking for confirmation. Terminal commands remain off limits.',
  'Sem restrições': 'No restrictions',
  'A IA altera arquivos e roda qualquer comando sem pedir confirmação. Use só em projetos e máquinas em que isso é aceitável.':
    'The AI changes files and runs any command without asking for confirmation. Use only on projects and machines where that is acceptable.',
  'Sem ligação com o Faz AI.': 'No connection to Faz AI.',

  // git (git.ts)
  'Squash (um commit só)': 'Squash (a single commit)',
  'Merge commit': 'Merge commit',
  Rebase: 'Rebase',
  'Worktree por história': 'Worktree per story',
  'Cada história ganha uma branch e uma pasta de trabalho própria. A IA mexe no código lá, sem tocar na sua pasta nem nas suas alterações em andamento.':
    'Each story gets its own branch and working folder. The AI works on the code there, without touching your folder or your work in progress.',
  'Branch na própria pasta': 'Branch in the project folder',
  'Cada história ganha uma branch, mas o trabalho acontece na pasta do projeto: a IA troca de branch nela. Evite com o heartbeat ligado, porque isso pode atropelar o que você está fazendo.':
    'Each story gets a branch, but the work happens in the project folder: the AI switches branches in it. Avoid this with the heartbeat on, because it can trample what you are doing.',
  Desligado: 'Off',
  'O board não cria branches nem worktrees.': 'The board does not create branches or worktrees.',

  // agentes do board e ferramentas (execution.ts)
  'Agente padrão': 'Default agent',
  Agente: 'Agent',
  Skills: 'Skills',
  'Servidores MCP': 'MCP servers',
  Ferramentas: 'Tools',
  'Modelo e esforço': 'Model and effort',
  'Sessão limpa': 'Clean session',
  'Só leitura': 'Read-only',
  'Lê e busca arquivos; não edita nem roda comandos.': 'Reads and searches files; does not edit or run commands.',
  'Editar código': 'Edit code',
  'Lê, edita arquivos e roda comandos no terminal.': 'Reads, edits files and runs commands in the terminal.',

  // modelos e esforço (models.ts)
  'Esforço da atividade': 'Task effort',
  'Esforço do modelo': 'Model effort',
  Baixo: 'Low',
  Médio: 'Medium',
  Alto: 'High',
  baixo: 'low',
  leve: 'light',
  médio: 'medium',
  alto: 'high',
  'muito alto': 'very high',
  máximo: 'max',
  ultra: 'ultra',

  // tempo (time.ts)
  agora: 'now',
  'há {n} min': '{n} min ago',
  'há {n} h': '{n} h ago',
  'há {n} d': '{n} d ago',

  // harness: grupos das abas Projeto e Global e frase de cada fonte do catálogo (harnessCatalog.ts)
  Memória: 'Memory',
  'Anotações que a própria IA escreve para lembrar entre uma conversa e outra.':
    'Notes the AI writes itself to remember from one conversation to the next.',
  'Regras principais': 'Main rules',
  'Entram no começo de toda conversa: é o que a IA sempre sabe sobre você e o projeto.':
    'Loaded at the start of every conversation: what the AI always knows about you and the project.',
  'Regras por assunto': 'Rules by topic',
  'Regras separadas por tema; algumas só entram quando a IA mexe em certos arquivos.':
    'Rules split by topic; some only load when the AI works on certain files.',
  'Pacotes de instruções e arquivos de apoio que a IA carrega quando a tarefa pede.':
    'Bundles of instructions and support files the AI loads when the task calls for them.',
  'Ajudantes com instruções próprias, para os quais a IA delega partes do trabalho.':
    'Helpers with their own instructions, to which the AI delegates parts of the work.',
  Comandos: 'Commands',
  'Prompts prontos, chamados com /nome na conversa.': 'Ready-made prompts, called with /name in the conversation.',
  'Como a ferramenta se comporta e o que a IA pode fazer sem perguntar.': 'How the tool behaves and what the AI may do without asking.',
  'Estilos de saída': 'Output styles',
  'Mudam o jeito de a IA responder.': 'Change the way the AI answers.',
  'Pacotes instalados que trazem skills, agentes, comandos, hooks e servidores; mudam pela própria ferramenta.':
    'Installed packages that bring skills, agents, commands, hooks and servers; changed through the tool itself.',
  Organização: 'Organization',
  'Definido pela sua empresa para todas as pessoas; aqui é só leitura.': 'Set by your company for everyone; read-only here.',
  'Instruções e arquivos de apoio que o Claude Code carrega quando a tarefa pede; só a descrição fica sempre à vista.':
    'Instructions and support files Claude Code loads when the task calls for them; only the description is always in view.',
  'Ajudante com instruções próprias, para o qual o Claude Code delega partes do trabalho.':
    'A helper with its own instructions, to which Claude Code delegates parts of the work.',
  'Prompt pronto, chamado digitando /nome na conversa.': 'A ready-made prompt, called by typing /name in the conversation.',
  'O que a IA pode fazer sem perguntar (allow), deve perguntar antes (ask) ou nunca pode fazer (deny).':
    'What the AI may do without asking (allow), must ask first (ask) or may never do (deny).',
  'Muda o jeito de o Claude Code responder (tom, formato); escolhido com /output-style.':
    'Changes the way Claude Code answers (tone, format); chosen with /output-style.',
  'Instruções no padrão aberto AGENTS.md; o Claude Code as lê quando o projeto não tem CLAUDE.md.':
    'Instructions in the open AGENTS.md format; Claude Code reads them when the project has no CLAUDE.md.',
  'Instruções e arquivos de apoio que o Cursor carrega quando a tarefa pede; só a descrição fica sempre à vista.':
    'Instructions and support files Cursor loads when the task calls for them; only the description is always in view.',
  'Ajudante com instruções próprias, para o qual o Cursor delega partes do trabalho.':
    'A helper with its own instructions, to which Cursor delegates parts of the work.',
  'Regras do projeto que o Claude Code lê no começo de toda conversa; vão no repositório.':
    'Project rules Claude Code reads at the start of every conversation; they go in the repository.',
  'O mesmo que o CLAUDE.md da raiz, guardado na pasta .claude; também entra em toda conversa.':
    'The same as the root CLAUDE.md, kept in the .claude folder; also loaded in every conversation.',
  'Suas regras pessoais para este projeto, lidas em toda conversa; ficam fora do repositório.':
    'Your personal rules for this project, read in every conversation; kept out of the repository.',
  'Regra de um assunto; com `paths` no topo, só entra quando a IA mexe nesses arquivos.':
    'A rule on one topic; with `paths` at the top, it only loads when the AI works on those files.',
  'Suas regras pessoais, lidas em toda conversa de qualquer projeto.': 'Your personal rules, read in every conversation of any project.',
  'Sua regra de um assunto, que vale em todos os projetos.': 'Your rule on one topic, applied to every project.',
  'Comando que o Claude Code roda sozinho num evento (antes de editar, ao terminar…); vai no repositório.':
    'A command Claude Code runs on its own on an event (before editing, when finishing…); goes in the repository.',
  'Comando que o Claude Code roda sozinho num evento, só na sua máquina.':
    'A command Claude Code runs on its own on an event, only on your machine.',
  'Comando que o Claude Code roda sozinho num evento, em todos os projetos.':
    'A command Claude Code runs on its own on an event, in every project.',
  'Servidor que dá ferramentas extras à IA, compartilhado no repositório.':
    'A server that gives the AI extra tools, shared in the repository.',
  'Servidor adicionado pelo Claude Code (claude mcp add); o arquivo é mantido por ele.':
    'A server added through Claude Code (claude mcp add); the file is maintained by it.',
  'Configurações do projeto (permissões, hooks, variáveis, modelo); vão no repositório.':
    'Project settings (permissions, hooks, variables, model); they go in the repository.',
  'Configurações só suas neste projeto; ficam fora do repositório.':
    'Settings that are yours alone in this project; kept out of the repository.',
  'Suas configurações do Claude Code, em todos os projetos.': 'Your Claude Code settings, in every project.',
  'Anotação que o Claude Code guarda sozinho sobre este projeto; o índice MEMORY.md entra em toda conversa.':
    'A note Claude Code keeps on its own about this project; the MEMORY.md index is loaded in every conversation.',
  'Regras da sua organização, instaladas pela equipe de TI; valem para todas as pessoas.':
    "Your organization's rules, installed by the IT team; they apply to everyone.",
  'Configurações impostas pela organização; valem acima das suas.':
    'Settings enforced by the organization; they take precedence over yours.',
  'Instruções do projeto no padrão aberto AGENTS.md, lidas pelo Cursor em toda conversa.':
    'Project instructions in the open AGENTS.md format, read by Cursor in every conversation.',
  'Regra de um assunto; o topo diz se entra sempre, por caminho de arquivo ou quando a IA julgar útil.':
    'A rule on one topic; its header says whether it loads always, by file path or when the AI finds it useful.',
  'Prompt pronto, chamado digitando /nome no chat.': 'A ready-made prompt, called by typing /name in the chat.',
  'Comando que o Cursor roda sozinho num evento do agente, neste projeto.':
    'A command Cursor runs on its own on an agent event, in this project.',
  'Comando que o Cursor roda sozinho num evento do agente, em todos os projetos.':
    'A command Cursor runs on its own on an agent event, in every project.',
  'Servidor que dá ferramentas extras à IA neste projeto.': 'A server that gives the AI extra tools in this project.',
  'Servidor que dá ferramentas extras à IA em todos os projetos.': 'A server that gives the AI extra tools in every project.',
  'Configuração da linha de comando do Cursor (cursor-agent) neste projeto.':
    'Settings for the Cursor command line (cursor-agent) in this project.',
  'Configuração da linha de comando do Cursor (cursor-agent), em todos os projetos.':
    'Settings for the Cursor command line (cursor-agent), in every project.',
  'O que o cursor-agent pode fazer sem perguntar (allow) ou nunca pode fazer (deny).':
    'What cursor-agent may do without asking (allow) or may never do (deny).',
  'Seu prompt pronto, chamado com /nome em qualquer projeto.': 'Your ready-made prompt, called with /name in any project.',
  'Arquivos que a IA do Cursor não pode ler nem citar, no formato do .gitignore.':
    "Files Cursor's AI may not read or mention, in .gitignore format.",
  'User Rules': 'User Rules',
  'Suas regras pessoais do Cursor, lidas em toda conversa, ficam nas configurações dele (Customize → Rules), não num arquivo.':
    'Your personal Cursor rules, read in every conversation, live in its settings (Customize → Rules), not in a file.',
  'Team Rules': 'Team Rules',
  'Regras do time, definidas no painel do Cursor nos planos Team e Enterprise; valem acima das do projeto.':
    'Team rules, set in the Cursor dashboard on Team and Enterprise plans; they take precedence over the project ones.',
  'Ignorados de todos os projetos': 'Ignored in every project',
  'A lista global de arquivos que a IA não lê fica nas configurações do Cursor (Indexing → Ignore Files).':
    'The global list of files the AI does not read lives in the Cursor settings (Indexing → Ignore Files).',
  // harness (harness.ts)
  Automática: 'Automatic',
  'A IA vê a descrição em toda sessão e decide quando usar a skill.':
    'The AI sees the description in every session and decides when to use the skill.',
  'Só quando indicada': 'Only when indicated',
  'A IA não invoca a skill sozinha: ela só é usada quando um card a indica ou quando é chamada pelo nome.':
    'The AI does not invoke the skill on its own: it is only used when a card points to it or when it is called by name.',
  'Instruções e regras': 'Instructions and rules',
  'Texto carregado em toda sessão, ou quando a IA mexe em arquivos de um caminho.':
    'Text loaded in every session, or when the AI touches files under a path.',
  'Instruções que a IA carrega quando precisa, ou quando o card indica.':
    'Instructions the AI loads when it needs them, or when the card points to them.',
  Subagentes: 'Subagents',
  'Ajudantes com instruções próprias, para os quais a ferramenta delega trabalho.':
    'Helpers with their own instructions, to which the tool delegates work.',
  'Comandos e prompts': 'Commands and prompts',
  'Prompts prontos, chamados pelo nome.': 'Ready-made prompts, called by name.',
  Hooks: 'Hooks',
  'Comandos que a ferramenta roda sozinha em certos eventos.': 'Commands the tool runs on its own on certain events.',
  'Servidores que dão ferramentas extras à IA.': 'Servers that give the AI extra tools.',
  Plugins: 'Plugins',
  'Pacotes instalados, que trazem skills, agentes, comandos, hooks e servidores MCP.':
    'Installed packages that bring skills, agents, commands, hooks and MCP servers.',
  'Configurações e permissões': 'Settings and permissions',
  'Arquivos de configuração da ferramenta.': "The tool's configuration files.",
  Projeto: 'Project',
  'Arquivos desta pasta; valem só aqui.': 'Files in this folder; they apply only here.',
  'Fazem parte deste projeto e vão no repositório.': 'They are part of this project and go in the repository.',
  Global: 'Global',
  'Arquivos da sua pasta de usuário; valem em todos os projetos.': 'Files in your user folder; they apply to all projects.',
  'Da sua máquina: valem em todos os seus projetos, mas não vão no repositório.':
    'From your machine: they apply to all your projects, but do not go in the repository.',
  'Vêm de plugins instalados ou da própria ferramenta; não são editáveis.':
    'They come from installed plugins or from the tool itself; they cannot be edited.',
  'Vêm de plugins e não podem ser alterados, só copiados.': 'They come from plugins and cannot be changed, only copied.',
  '.mcp.json (projeto)': '.mcp.json (project)',
  '.cursor/mcp.json (projeto)': '.cursor/mcp.json (project)',
  'Cursor e outras ferramentas': 'Cursor and other tools',
  '~/.claude.json (claude mcp add --scope user)': '~/.claude.json (claude mcp add --scope user)',
  '.cursor/mcp.json (projeto; o global não funciona no Cursor)': '.cursor/mcp.json (project; the global scope does not work in Cursor)',
  'Documentação e exemplos de código, lidos só quando a skill aponta para eles.':
    'Documentation and code examples, read only when the skill points to them.',
  'Modelos de arquivo e outros recursos estáticos.': 'File templates and other static resources.',
  'Scripts que a IA pode executar.': 'Scripts the AI can run.',

  // catálogo do harness (harnessCatalog.ts)
  permitir: 'allow',
  perguntar: 'ask',
  negar: 'deny',
  'no terminal': 'in the terminal',
  'no Cursor (Customize → Plugins) ou numa sessão do agente': 'in Cursor (Customize → Plugins) or in an agent session',
  'claude plugin marketplace add <dono/repositorio>': 'claude plugin marketplace add <owner/repository>',
  'gh skill search <termo>': 'gh skill search <term>',
  'agent plugin marketplace add <endereço git>': 'agent plugin marketplace add <git URL>',
  '/plugins install <pasta, zip ou endereço do GitHub>': '/plugins install <folder, zip or GitHub URL>',
};
