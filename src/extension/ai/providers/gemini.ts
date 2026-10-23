// Provider do Gemini CLI pela linha de comando (`gemini -p`, épica "ferramenta por modo", história 8),
// conferido contra a CLI 0.65.0 instalada, rodando de verdade contra uma API local (GOOGLE_GEMINI_BASE_URL),
// e contra a documentação oficial (geminicli.com/docs/cli/headless e /docs/reference/configuration, lidas em
// 2026-10-23):
// - o pedido vai pela entrada padrão, com `-p ""` (a CLI junta o `-p` ao que veio pela entrada): nada de
//   prompt na linha de comando, que no Windows passa pelo cmd.exe;
// - `GEMINI_CLI_HOME` muda a raiz da configuração do usuário (a CLI lê `<home>/.gemini/settings.json`): cada
//   execução recebe uma home temporária só com o `settings.json` do board, então a configuração, as extensões,
//   o `GEMINI.md`, as skills, os comandos e os hooks da conta da pessoa não entram. O que a home não isola (o
//   `GEMINI.md` do projeto, por exemplo) as sondas do verificador dizem; o regime vem delas;
// - no settings: os servidores MCP da execução (cada um com as operações admitidas em `includeTools`),
//   `mcp.allowed`, as ferramentas em `tools.core` (a lista exata que a CLI registra: o que fica fora o modelo
//   nem recebe) e em `tools.allowed`, com as operações MCP (`mcp_<servidor>_<operação>`), a delegação
//   desligada (`experimental.enableAgents`), skills e hooks desligados, o `GEMINI.md` dos ancestrais desligado
//   (`context.memoryBoundaryMarkers: []`), a autenticação por chave e nada de estatística de uso nem de
//   atualização automática;
// - `--allowed-mcp-server-names` repete a lista dos servidores, `-e none` desliga as extensões, `--skip-trust`
//   confia na pasta só nesta sessão (sem isso, numa pasta não confiável a CLI não conecta os servidores MCP);
// - `--approval-mode` por nível: `default` em "Só o board", `auto_edit` em "Board e arquivos", `yolo` em "Sem
//   restrições". A restrição de verdade é o registro (`tools.core`), não a pergunta: no modo de uma passada a
//   CLI não tem a quem perguntar;
// - a chave de API vai só no ambiente do processo (`GEMINI_API_KEY`), posta pelo driver na hora do `spawn`.
import { AGENT_TOOLS, geminiToolsFor } from '../../../shared/agentTools';
import type { RunnerPermission } from '../../../shared/runner';
import { geminiReader } from '../../aiOutput/gemini';
import { asList, asObject, asText } from '../../aiOutput/json';
import { textReader } from '../../aiOutput/text';
import { BOARD_SERVER, boardOnlyMcpConfig } from '../../execution';
import type { AiProvider, HeadlessInput } from '../provider';

/** A variável em que a CLI procura a pasta da configuração do usuário. */
export const GEMINI_HOME_ENV = 'GEMINI_CLI_HOME';
/** A variável da chave de API (a autenticação `gemini-api-key`). */
export const GEMINI_KEY_ENV = 'GEMINI_API_KEY';
/** O settings do board, dentro da home temporária. */
export const GEMINI_SETTINGS = '.gemini/settings.json';

const APPROVAL: Record<RunnerPermission, string> = { board: 'default', edits: 'auto_edit', full: 'yolo' };
/** Os grupos de ferramentas que cada nível libera fora da admissão (a mesma regra de `admitExecution`). */
const LEVEL_GROUPS: Record<RunnerPermission, string[]> = {
  board: ['read'],
  edits: ['read', 'edit'],
  full: ['read', 'edit', 'run', 'net', 'other'],
};

/** Os servidores do `mcpConfig` (o JSON que o Claude Code recebe) no formato do `mcpServers` do Gemini CLI. */
export function geminiMcpServers(mcpConfig: string | null): Record<string, Record<string, unknown>> {
  const defs = mcpConfig ? asObject(asObject(JSON.parse(mcpConfig))?.mcpServers) : null;
  const out: Record<string, Record<string, unknown>> = {};
  for (const [name, raw] of Object.entries(defs ?? {})) {
    const def = asObject(raw);
    if (!def) continue;
    const type = asText(def.type);
    const url = asText(def.url);
    const headers = asObject(def.headers);
    const command = asText(def.command);
    // `httpUrl` é o HTTP transmitível, `url` o SSE e `command` o stdio (a CLI dá a vez nessa ordem)
    if (url && type === 'sse') out[name] = { url, ...(headers ? { headers } : {}) };
    else if (url) out[name] = { httpUrl: url, ...(headers ? { headers } : {}) };
    else if (command) {
      const env = asObject(def.env);
      const cwd = asText(def.cwd);
      out[name] = {
        command,
        args: asList(def.args).filter((a): a is string => typeof a === 'string'),
        ...(env ? { env } : {}),
        ...(cwd ? { cwd } : {}),
      };
    }
  }
  return out;
}

/** O servidor e a operação de um nome `mcp__<servidor>__<operação>`, pelo servidor conhecido mais longo. */
function mcpOperation(name: string, servers: readonly string[]): { server: string; tool: string } | null {
  const server = [...servers].sort((a, b) => b.length - a.length).find((s) => name.startsWith(`mcp__${s}__`));
  return server ? { server, tool: name.slice(`mcp__${server}__`.length) } : null;
}

/** As ferramentas nativas fora da admissão: as do nível, dentro das do card (quando há lista), sem as negadas. */
function legacyTools(permission: RunnerPermission, exec: HeadlessInput['exec']): string[] {
  const level = AGENT_TOOLS.gemini.filter((g) => LEVEL_GROUPS[permission].includes(g.id)).flatMap((g) => g.tools.map((t) => t.name));
  const listed = exec?.tools.length ? new Set(geminiToolsFor(exec.tools)) : null;
  const denied = new Set(geminiToolsFor(exec?.deniedTools ?? []));
  return level.filter((t) => (!listed || listed.has(t)) && !denied.has(t));
}

/** O `settings.json` da home do board para este pedido; a ordem das chaves é fixa (entra no vínculo). */
export function geminiSettings(input: HeadlessInput): { settings: Record<string, unknown>; servers: string[] } {
  const { permission, exec, boardServer } = input;
  const strict = exec?.toolSet === 'explicit';
  const defined = geminiMcpServers(exec?.mcpConfig ?? (boardServer ? boardOnlyMcpConfig(boardServer) : null));
  const mcpServers: Record<string, Record<string, unknown>> = {};
  // as operações MCP só são declaradas ao modelo quando estão em `tools.allowed` (conferido na 0.65.0: nem o
  // `trust` do servidor nem o modo `yolo` bastam no modo de uma passada)
  const mcpAllowed: string[] = [];
  if (strict) {
    // só as operações admitidas: um servidor sem nenhuma fica de fora (a CLI nem o inicia)
    const ops = new Map<string, string[]>();
    for (const name of exec.mcpTools ?? []) {
      const op = mcpOperation(name, Object.keys(defined));
      if (op) ops.set(op.server, [...(ops.get(op.server) ?? []), op.tool]);
    }
    for (const [name, def] of Object.entries(defined)) {
      const allowed = ops.get(name);
      if (!allowed?.length) continue;
      mcpServers[name] = { ...def, includeTools: allowed };
      mcpAllowed.push(...allowed.map((tool) => `mcp_${name}_${tool}`));
    }
  } else
    for (const [name, def] of Object.entries(defined)) {
      // fora da admissão, o servidor liberado vale inteiro, como o `mcp__<servidor>__*` do Claude Code
      mcpServers[name] = def;
      mcpAllowed.push(`mcp_${name}_*`);
    }
  const tools = strict ? [...exec.tools] : legacyTools(permission, exec);
  const servers = Object.keys(mcpServers);
  return {
    servers,
    settings: {
      security: { auth: { selectedType: 'gemini-api-key' } },
      privacy: { usageStatisticsEnabled: false },
      general: { enableAutoUpdate: false, enableAutoUpdateNotification: false },
      mcpServers,
      // sem servidor nenhum, o nome do board (que não está definido) fecha a lista: nenhum servidor de fora entra
      mcp: { allowed: servers.length ? servers : [BOARD_SERVER] },
      tools: { core: tools, allowed: [...tools, ...mcpAllowed] },
      skills: { enabled: false },
      hooksConfig: { enabled: false },
      experimental: { enableAgents: false },
      context: { memoryBoundaryMarkers: [], includeDirectoryTree: false },
    },
  };
}

export const geminiCliProvider: AiProvider = {
  tool: 'gemini',
  // a CLI informa os tokens por modelo (`result.stats`), não o custo
  measure: 'tokens',
  command: (input) => {
    const { prompt, permission, addDirs = [], exec, structured } = input;
    const { settings, servers } = geminiSettings(input);
    const allowed = servers.length ? servers : [BOARD_SERVER];
    return {
      command: 'gemini',
      args: [
        '-p',
        '',
        ...(structured ? ['--output-format', 'stream-json'] : []),
        '--approval-mode',
        APPROVAL[permission],
        '--skip-trust',
        '-e',
        'none',
        ...allowed.flatMap((n) => ['--allowed-mcp-server-names', n]),
        ...addDirs.flatMap((d) => ['--include-directories', d]),
        // o esforço não tem flag na CLI: só o modelo vai
        ...(exec?.model ? ['-m', exec.model.name] : []),
      ],
      stdin: prompt,
      format: structured ? 'gemini-stream-json' : 'text',
      tempHome: { env: GEMINI_HOME_ENV, files: { [GEMINI_SETTINGS]: `${JSON.stringify(settings, null, 2)}\n` } },
      apiKeyEnv: GEMINI_KEY_ENV,
    };
  },
  reader: (format, deps) => (format === 'gemini-stream-json' ? geminiReader(deps) : textReader()),
};
