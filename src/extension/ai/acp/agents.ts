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
import type { AcpAgent } from './provider';

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
    fullMode: 'yolo',
    // o nome de exibição que o Gemini CLI dá às ferramentas MCP: `ferramenta (servidor MCP Server)`
    mcpTitle: /^(?<tool>.+?) \((?<server>.+?) MCP Server\)/,
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
