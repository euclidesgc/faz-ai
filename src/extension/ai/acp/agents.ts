// O catálogo do conector ACP: um registro de dados por agente, no lugar de um provider com código.
// PROTÓTIPO: nenhum está em `AiTool` e nada no board os chama ainda.
//
// Os comandos são os do registro oficial do ACP (cdn.agentclientprotocol.com/registry/v1/latest/
// registry.json, lido em 2026-10-18), com o nome do executável que a instalação deixa no PATH. O que
// cada um mede vem da documentação do modo ACP de cada agente e dos relatos citados no registro de
// decisão (`docs/decisoes/acp-transporte-de-agentes.md`). Nenhum foi conferido contra a CLI instalada:
// não havia nenhuma na máquina do spike.
//
// De fora, de propósito: o Claude (`claude-agent-acp`, o adaptador do Zed sobre o Agent SDK) — o
// Claude segue pela CLI `claude`, a única que pode usar a assinatura da pessoa.
import { asNumber, asObject } from '../../aiOutput/json';
import { classifyGeminiFailure } from '../drivers/gemini/limit';
import { GEMINI_TOOL_EQUIVALENTS } from '../../../shared/agentTools';
import type { AcpAgent } from './provider';
import { readCodexQuota } from './codexQuota';

/**
 * O nome da ferramenta no `toolCallId` do Gemini CLI: o `Turn` (core) monta o id da chamada como
 * `<nome>__<id>` (`handlePendingFunctionCall`, conferido no pacote 0.65.0 instalado em 2026-10-23,
 * bundle/chunk-DKZARV6U.js), e o modo ACP manda esse id no `session/request_permission`
 * (`runTool`, bundle/gemini-GLQ4MVLB.js). Só vale o nome que a tabela de equivalentes conhece; o resto
 * (outro formato de id, ferramenta MCP, subagente com nome próprio) fica para o `kind`.
 */
export function geminiToolOf(toolCallId: string): string | null {
  const at = toolCallId.indexOf('__');
  const name = at > 0 ? toolCallId.slice(0, at) : '';
  return name && Object.hasOwn(GEMINI_TOOL_EQUIVALENTS, name) ? name : null;
}

/** O nome válido que o Gemini CLI dá a um nome MCP (`generateValidName`, 0.65.0): fora de `[A-Za-z0-9_.:-]` vira `_`. */
const geminiValidName = (name: string): string => name.replace(/[^a-zA-Z0-9_\-.:]/g, '_');

/**
 * O servidor de uma chamada MCP do Gemini que não dá para decidir (o id não bate com o título): nunca é um
 * servidor do card (o nome do servidor não tem espaço), então o board recusa e a conferência acusa.
 */
export const GEMINI_AMBIGUOUS_SERVER = '(servidor ambíguo)';

/** O servidor no nome de exibição que o Gemini dá à ferramenta MCP sem argumentos: `<ferramenta> (<servidor> MCP Server)`. */
const GEMINI_TITLE_SERVER = /\((?<server>[^()]+) MCP Server\)$/;

/**
 * A ferramenta MCP no `toolCallId` do Gemini CLI. A ferramenta MCP se chama `mcp_<servidor>_<ferramenta>`
 * (`DiscoveredMCPTool.getFullyQualifiedName` e `generateValidName`, pacote 0.65.0, bundle/chunk-DKZARV6U.js),
 * e o id é `<nome>__<id>`. O `_` é também o separador, então o id é ambíguo (`mcp_github_enterprise_x` é a
 * `x` do `github_enterprise` ou a `enterprise_x` do `github`):
 * - com o servidor no título (`(<servidor> MCP Server)`), o id precisa começar por ele; senão, ambíguo;
 * - sem ele, o servidor do card que é o prefixo mais longo, com `_` logo depois. Um servidor de fora do card
 *   com nome mais longo (o ACP do Gemini não isola a home, e `~/.gemini` pode trazer outros) só é visto pelo
 *   título: é o limite conhecido do registro;
 * - um `mcp_` sem servidor do card fica com o primeiro trecho, e o board o recusa por não ser do card.
 * A ferramenta vai até o primeiro `__` depois do prefixo.
 */
export function geminiMcpToolOf(
  call: { toolCallId: string; title: string | null },
  servers: readonly string[],
): { server: string; tool: string } | null {
  const id = call.toolCallId;
  if (!id.startsWith('mcp_')) return null;
  const at = id.indexOf('__');
  const name = at > 0 ? id.slice(0, at) : id;
  const prefix = (s: string) => `mcp_${geminiValidName(s)}_`;
  const fits = (s: string) => name.startsWith(prefix(s)) && name.length > prefix(s).length;
  const titled = call.title ? GEMINI_TITLE_SERVER.exec(call.title)?.groups?.server : undefined;
  if (titled)
    return fits(titled) ? { server: titled, tool: name.slice(prefix(titled).length) } : { server: GEMINI_AMBIGUOUS_SERVER, tool: name };
  const server = [...servers].sort((a, b) => b.length - a.length).find(fits);
  if (server) return { server, tool: name.slice(prefix(server).length) };
  const m = /^mcp_([^_]+)_(.+)$/.exec(name);
  return m ? { server: m[1]!, tool: m[2]! } : { server: GEMINI_AMBIGUOUS_SERVER, tool: name };
}

/** `--model <nome>`: o esforço não tem flag nesses agentes. */
const modelFlag = (model: { name: string }) => ['--model', model.name];

export const ACP_AGENTS: readonly AcpAgent[] = [
  {
    id: 'gemini',
    label: 'Gemini CLI',
    command: 'gemini',
    // `--skip-trust`: sem a pasta marcada como confiável o Gemini CLI em ACP fica mudo no session/prompt
    // (conferido na 0.65.0); a confiança é do board, que responde cada permissão pelo card
    args: ['--acp', '--skip-trust'],
    login: 'gemini',
    docs: 'https://geminicli.com/docs/cli/acp-mode',
    // `usage` e `usage_update` (só contexto, sem custo) desde o PR #29549, de 2026-09-29; antes, só `_meta.quota`
    usage: { tokens: 'turn', cost: false },
    modelArgs: modelFlag,
    // os modelos vêm no `session/new` ainda na forma anterior do protocolo (`models.availableModels`,
    // conferido na 0.65.0), sem `configOptions`: a escolha do card vai só pela linha de comando
    fullMode: 'yolo',
    // sem `mcpTitle`: a ferramenta MCP é lida só pelo id (`mcpToolOfId`), porque o título do shell é o comando
    // do modelo, que pode imitar o `ferramenta (servidor MCP Server)`; o título só confere o servidor do id
    nativeToolOf: geminiToolOf,
    mcpToolOfId: geminiMcpToolOf,
    // "inputTokens: prompt tokens, including cached tokens" (PR #29549)
    inputIncludesCache: true,
    // versões anteriores ao PR: `_meta.quota.token_count` com `input_tokens` e `output_tokens`, sem cache
    quota: (result) => {
      const count = asObject(asObject(asObject(result._meta)?.quota)?.token_count);
      const input = asNumber(count?.input_tokens);
      const output = asNumber(count?.output_tokens);
      return input === null || output === null
        ? null
        : { inputTokens: input, outputTokens: output, cacheReadTokens: 0, cacheWriteTokens: 0 };
    },
    // lido no pacote 0.65.0 (`GeminiAgent.initialize` e `authenticate` em bundle/gemini-*.js): o
    // `initialize` anuncia `gemini-api-key` com `_meta: { "api-key": { provider: "google" } }`, e o
    // `authenticate` lê a chave de `_meta["api-key"]`, chama `refreshAuth` e grava só o
    // `security.auth.selectedType`. A chave fica na memória do processo (`this.apiKey`): cada processo do
    // agente (execução, sondagem, leitura de modelos) autentica de novo. Desde 18/06/2026 a conta individual
    // Google entra pelo Antigravity; o Gemini CLI segue com chave de API (docs/decisoes/ferramenta-por-modo-gemini.md)
    apiKeyAuth: { methodId: 'gemini-api-key' },
    // o erro do turno volta no `session/prompt` com o status HTTP no código JSON-RPC (429 na cota): a mesma
    // classificação da CLI e da API do Gemini (`drivers/gemini/limit.ts`)
    classifyFailure: classifyGeminiFailure,
  },
  {
    id: 'antigravity-acp',
    label: 'Google Antigravity',
    // o registro do ACP distribui um binário (`agy_acp_server.par`, no zip da plataforma), sem pacote npm:
    // a pessoa põe a PASTA dele no PATH (por link simbólico ele não acha o próprio harness). O `agy`
    // interativo é outro programa, sem modo ACP.
    command: 'agy_acp_server.par',
    args: [],
    // o servidor pede login pelo `authenticate` do protocolo (Google, Gemini Enterprise, chave de API) e grava a
    // escolha em `~/.gemini/antigravity-acp/settings.json`; sem a história do login pela tela, vale o `agy`
    // (não conferido se o login dele é compartilhado)
    login: 'agy',
    docs: 'https://antigravity.google/docs/ide/extensions',
    // conferido na 1.4.1: a resposta do prompt não traz `usage`; só `usage_update` com o contexto ocupado
    usage: { tokens: 'none', cost: false },
    // o modelo e o nível de raciocínio vêm em `configOptions` (`model`, `thinking_level`) e no `models` do
    // session/new (`gemini-3.8-flash-high`), não na linha de comando
    fullMode: 'yolo',
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    command: 'opencode',
    args: ['acp'],
    login: 'opencode auth login',
    docs: 'https://opencode.ai/v2/docs/cli/acp/',
    // a documentação promete os dois: tokens do turno e o custo acumulado da sessão (sempre rotulado USD)
    usage: { tokens: 'turn', cost: true },
  },
  {
    id: 'codex-acp',
    label: 'Codex',
    // o adaptador oficial (@agentclientprotocol/codex-acp), que sobe o `codex app-server` por baixo
    command: 'codex-acp',
    args: [],
    login: 'codex login',
    docs: 'https://github.com/agentclientprotocol/codex-acp',
    // relatado na 1.6.2: o `usage` traz só o último pedido do turno, e o custo vem nulo
    usage: { tokens: 'last_request', cost: false },
    fullMode: 'agent-full-access',
    // a cota por janela (5 h e semanal) está no rollout de sessão do Codex, não no protocolo
    readQuota: (ctx) => readCodexQuota(ctx),
  },
  {
    id: 'cursor',
    label: 'Cursor',
    // a documentação chama de `agent acp`; o registro do ACP e a instalação também trazem `cursor-agent`
    command: 'cursor-agent',
    args: ['acp'],
    login: 'cursor-agent login',
    docs: 'https://cursor.com/docs/cli/acp',
    // o fórum relata `usage` ausente e nenhum `usage_update`; outro cliente relata `usage` acumulado
    usage: { tokens: 'unknown', cost: false },
    // "o ACP usa os servidores do .cursor/mcp.json do projeto ou do usuário"
    projectMcpFile: '.cursor/mcp.json',
  },
  {
    id: 'kimi',
    label: 'Kimi Code',
    command: 'kimi',
    args: ['acp'],
    login: 'kimi',
    docs: 'https://moonshotai.github.io/kimi-code/en/reference/kimi-acp',
    // a página não fala de consumo; no kimi-cli (arquivado) o `usage` ficava vazio (issue #2394)
    usage: { tokens: 'none', cost: false },
  },
  {
    id: 'github-copilot-cli',
    label: 'GitHub Copilot CLI',
    command: 'copilot',
    args: ['--acp'],
    login: 'copilot',
    docs: 'https://github.blog/changelog/2026-01-28-acp-support-in-copilot-cli-is-now-in-public-preview/',
    // nada documentado no ACP; a cobrança é por pedido premium, não por token
    usage: { tokens: 'none', cost: false },
    modelArgs: modelFlag,
  },
  {
    id: 'qwen-code',
    label: 'Qwen Code',
    command: 'qwen',
    args: ['--acp'],
    login: 'qwen',
    docs: 'https://qwenlm.github.io/qwen-code-docs/',
    // relatado na 0.21.5: a resposta só traz `stopReason`, e não há `usage_update` (issue #8513)
    usage: { tokens: 'none', cost: false },
    modelArgs: modelFlag,
  },
  {
    id: 'goose',
    label: 'goose',
    command: 'goose',
    args: ['acp'],
    login: 'goose configure',
    docs: 'https://block.github.io/goose/docs/guides/acp-clients',
    // relatado: o servidor ACP do goose responde só o `stopReason` (issue #8132)
    usage: { tokens: 'none', cost: false },
  },
];

export const acpAgent = (id: string): AcpAgent | undefined => ACP_AGENTS.find((a) => a.id === id);
