// Codex, Kimi e GitHub Copilot: o board os chama, mas não mede o consumo deles por enquanto — a medição
// é só do Claude Code e do Cursor. Cada execução fica registrada em `ai_runs` pelo gateway, como as
// outras, com o consumo "não medido". Estes providers só montam o comando, sempre em texto: sem
// saída estruturada não há leitor, e portanto nenhum número que pareça medido.
//
// Quando uma delas voltar a ser medida, o caminho é um leitor próprio (conferido contra a saída real da
// CLI) e `measure` passar de 'none' para 'tokens' ou 'cost'.
import type { RunnerPermission } from '../../../shared/runner';
import { textReader } from '../../aiOutput/text';
import { BOARD_SERVER } from '../../execution';
import type { AiProvider } from '../provider';

const SERVER = BOARD_SERVER;

export const codexProvider: AiProvider = {
  tool: 'codex',
  measure: 'none',
  command: ({ prompt, permission, addDirs = [], exec }) => {
    const modes: Record<RunnerPermission, string[]> = {
      board: ['--sandbox', 'read-only'],
      edits: ['--sandbox', 'workspace-write'],
      full: ['--dangerously-bypass-approvals-and-sandbox'],
    };
    // as ferramentas do board não podem ficar esperando aprovação: ninguém acompanha a execução
    const key = (name: string) => (/^[\w-]+$/.test(name) ? name : JSON.stringify(name));
    const profile = [
      ...(exec?.model
        ? ['--model', exec.model.name, ...(exec.model.effort ? ['-c', `model_reasoning_effort="${exec.model.effort}"`] : [])]
        : []),
      ...(exec?.mcpBlocked ?? []).flatMap((n) => ['-c', `mcp_servers.${key(n)}.enabled=false`]),
    ];
    return {
      command: 'codex',
      args: [
        'exec',
        ...modes[permission],
        '--skip-git-repo-check',
        ...addDirs.flatMap((d) => ['--add-dir', d]),
        ...profile,
        '-c',
        `mcp_servers.${SERVER}.default_tools_approval_mode="approve"`,
        '-',
      ],
      stdin: prompt,
      format: 'text',
    };
  },
  reader: () => textReader(),
};

export const copilotProvider: AiProvider = {
  tool: 'copilot',
  measure: 'none',
  command: ({ prompt, permission, addDirs = [], exec }) => {
    const modes: Record<RunnerPermission, string[]> = {
      board: [`--allow-tool=${SERVER}`, '--allow-tool=read'],
      edits: [`--allow-tool=${SERVER}`, '--allow-tool=read', '--allow-tool=write'],
      full: ['--allow-all'],
    };
    // no modo -p os servidores MCP do projeto (.mcp.json) só carregam com esta variável
    const profile = [
      ...(exec?.agent ? [`--agent=${exec.agent}`] : []),
      ...(exec?.model ? [`--model=${exec.model.name}`, ...(exec.model.effort ? [`--effort=${exec.model.effort}`] : [])] : []),
      ...(exec?.tools.length ? [`--available-tools=${exec.tools.join(',')}`] : []),
      ...(exec?.deniedTools.length ? [`--excluded-tools=${exec.deniedTools.join(',')}`] : []),
      ...(exec?.mcpBlocked ?? []).map((n) => `--disable-mcp-server=${n}`),
      ...(exec?.clean ? ['--no-custom-instructions'] : []),
    ];
    return {
      command: 'copilot',
      args: ['-p', prompt, ...modes[permission], ...addDirs.map((d) => `--add-dir=${d}`), ...profile, '--no-ask-user'],
      env: { GITHUB_COPILOT_PROMPT_MODE_WORKSPACE_MCP: 'true' },
      promptArg: { index: 1, addDirFlag: '--add-dir=' },
      format: 'text',
    };
  },
  reader: () => textReader(),
};

// no -p o Kimi não pede aprovação de nada e recusa flags de permissão: só roda "sem restrições"
export const kimiProvider: AiProvider = {
  tool: 'kimi',
  measure: 'none',
  command: ({ prompt, permission, addDirs = [], exec }) =>
    permission === 'full'
      ? {
          command: 'kimi',
          args: [
            '-p',
            prompt,
            ...addDirs.flatMap((d) => ['--add-dir', d]),
            ...(exec?.model ? ['--model', exec.model.name] : []),
            ...(exec?.agent ? ['--agent', exec.agent] : []),
          ],
          format: 'text',
          promptArg: { index: 1, addDirFlag: '--add-dir' },
        }
      : null,
  reader: () => textReader(),
};
