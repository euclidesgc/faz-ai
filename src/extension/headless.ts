import { aiToolInfo, type AiTool } from '../shared/harness';
import type { RunnerPermission } from '../shared/runner';

/** Comando que roda a CLI de uma ferramenta de IA sem interface, para um prompt, até terminar. */
export interface HeadlessCommand {
  command: string;
  args: string[];
  /** prompt enviado pela entrada padrão, quando a CLI aceita (evita problemas de aspas no argumento) */
  stdin?: string;
  env?: Record<string, string>;
}

export interface HeadlessInput {
  prompt: string;
  permission: RunnerPermission;
  /** pastas fora da pasta do projeto em que a IA também trabalha (as worktrees das histórias) */
  addDirs?: string[];
}

/** Nome do servidor MCP do board, como registrado em cada ferramenta. */
const SERVER = 'faz-ai';

/**
 * Como cada ferramenta roda sem interface, conforme a documentação delas em 2026-10-02:
 * - Claude Code: code.claude.com/docs/en/headless e /permission-modes
 * - Codex: learn.chatgpt.com/docs/non-interactive-mode
 * - GitHub Copilot: docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference
 * - Cursor: cursor.com/docs/cli/headless
 * - Kimi Code: moonshotai.github.io/kimi-code/en/reference/kimi-command.html
 *
 * Cursor e Kimi não têm, no modo sem interface, um nível de permissão intermediário por linha de
 * comando: só rodam "sem restrições".
 */
const BUILDERS: Record<AiTool, (input: HeadlessInput) => HeadlessCommand | null> = {
  claude: ({ prompt, permission, addDirs = [] }) => {
    // sem pasta confiada, o `-p` ignora as permissões do projeto: elas vão todas na linha de comando
    const modes: Record<RunnerPermission, string[]> = {
      // dontAsk nega tudo o que não está liberado: só o board e a leitura do projeto
      board: ['--permission-mode', 'dontAsk', '--allowedTools', `mcp__${SERVER}__*`, 'Read', 'Glob', 'Grep'],
      edits: ['--permission-mode', 'acceptEdits', '--allowedTools', `mcp__${SERVER}__*`],
      full: ['--permission-mode', 'bypassPermissions'],
    };
    return { command: 'claude', args: ['-p', ...modes[permission], ...addDirs.flatMap((d) => ['--add-dir', d])], stdin: prompt };
  },
  codex: ({ prompt, permission, addDirs = [] }) => {
    const modes: Record<RunnerPermission, string[]> = {
      board: ['--sandbox', 'read-only'],
      edits: ['--sandbox', 'workspace-write'],
      full: ['--dangerously-bypass-approvals-and-sandbox'],
    };
    // as ferramentas do board não podem ficar esperando aprovação: ninguém acompanha a execução
    return { command: 'codex', args: ['exec', ...modes[permission], '--skip-git-repo-check', ...addDirs.flatMap((d) => ['--add-dir', d]), '-c', `mcp_servers.${SERVER}.default_tools_approval_mode="approve"`, '-'], stdin: prompt };
  },
  copilot: ({ prompt, permission, addDirs = [] }) => {
    const modes: Record<RunnerPermission, string[]> = {
      board: [`--allow-tool=${SERVER}`, '--allow-tool=read'],
      edits: [`--allow-tool=${SERVER}`, '--allow-tool=read', '--allow-tool=write'],
      full: ['--allow-all'],
    };
    // no modo -p os servidores MCP do projeto (.mcp.json) só carregam com esta variável
    return { command: 'copilot', args: ['-p', prompt, ...modes[permission], ...addDirs.map((d) => `--add-dir=${d}`), '--no-ask-user'], env: { GITHUB_COPILOT_PROMPT_MODE_WORKSPACE_MCP: 'true' } };
  },
  cursor: ({ prompt, permission }) => (permission === 'full' ? { command: 'agent', args: ['-p', '--force', '--approve-mcps', '--trust', prompt] } : null),
  // no -p o Kimi não pede aprovação de nada e recusa flags de permissão
  kimi: ({ prompt, permission, addDirs = [] }) => (permission === 'full' ? { command: 'kimi', args: ['-p', prompt, ...addDirs.flatMap((d) => ['--add-dir', d])] } : null),
};

/** Por que o board não pode executar a ferramenta com esta permissão; null quando pode. */
export function headlessUnsupported(tool: AiTool, permission: RunnerPermission): string | null {
  if (BUILDERS[tool]({ prompt: '', permission })) return null;
  return `O ${aiToolInfo(tool).label}, quando roda em segundo plano, não pede aprovação de nada e não aceita limites por linha de comando. Para chamá-lo pelo board, escolha "Sem restrições" em Configurações → Harness de IA → Execução pela conversa.`;
}

export function headlessCommand(tool: AiTool, input: HeadlessInput): HeadlessCommand | { unsupported: string } {
  return BUILDERS[tool](input) ?? { unsupported: headlessUnsupported(tool, input.permission)! };
}
