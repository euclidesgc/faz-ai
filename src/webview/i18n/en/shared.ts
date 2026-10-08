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
