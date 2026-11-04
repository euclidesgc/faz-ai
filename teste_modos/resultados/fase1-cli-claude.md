# Fase 1 · CLI · Claude Code 2.1.316 — COMPROVADO (registro)

Status: dado como comprovado pela equipe; este arquivo só consolida a evidência.

- **P1 Delegação — PASSA.** Fixture de execução real com sub-agente:
  `test/fixtures/claude-stream-json.jsonl` (probe com `claude 2.1.278`, 219 eventos),
  lido por `src/extension/aiOutput/claude.ts`. Sub-agentes customizados via
  `--agents <json>` + `--agent <nome>` (usado pelo board em `src/extension/ai/providers/claude.ts:50`).
- **P2 Escopo — PASSA (documentação vigente, conferida hoje).**
  [Sub-agents](https://code.claude.com/docs/en/sub-agents): por sub-agente,
  `tools`/`disallowedTools` (com globs `mcp__servidor__*` e `mcp__*`), `mcpServers`
  (referência ou inline), `skills` (conteúdo injetado na largada; bloqueio de
  invocação removendo `Skill` das tools), `model`, `effort`, `omitClaudeMd`.
  Quais tipos o condutor pode lançar: `tools: Agent(tipo1, tipo2)` no agente da
  sessão e `--disallowedTools "Agent(Explore)"` por flag.
- **P3 Observação — PASSA.** Sub-agente aparece no stream-json (`Agent`/`Task`,
  `subagent_type`, `parent_tool_use_id`); `modelUsage` é cumulativo da sessão e
  inclui os tokens do sub-agente (medições 1 e 2 do leitor do board).
- **P4 Retomada — PASSA.** `--resume <session_id>` (provider do board já declara
  `resumable: true`); a doc confirma que o resume restaura as restrições de
  ferramentas e o modelo do agente.

Lacuna residual: verificar ao vivo, na 2.1.316, se o JSON inline de `--agents`
aceita `skills` e `mcpServers` (a doc cita `omitClaudeMd` no JSON; os demais
campos seguem o frontmatter). Não bloqueia: MCP se escopa por globs em `tools`
e skills podem ir no `prompt` do sub-agente.

## Sonda ao vivo (03/11/2026, CLI 2.1.316) — lacuna fechada, caminho do board comprovado

Duas chamadas `claude -p` com `--model haiku`, em pasta temporária, `--setting-sources ""`,
`--strict-mcp-config` e `CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS=1` (US$ 0,002 no total):

1. `--agents <arquivo.json> --agent condutor`: o arquivo define `condutor` (tools `Agent(filha)`,
   `Read`) e `filha` (tools `Read`, `model: haiku`). A sessão abriu; `system/init` listou
   `agents: ["condutor", "filha"]` (os embutidos saíram) e `tools: ["Task", "Read"]`.
2. `--resume <session_id>` com os mesmos argumentos: o condutor lançou `Agent` com
   `subagent_type: "filha"`; a CLI emitiu `task_started` (com `tool_use_id`), as mensagens da filha
   com `parent_tool_use_id`, `task_updated` (`status: completed`), `task_notification` e o
   `tool_result` da chamada com `tool_use_result.resolvedModel: "claude-haiku-5-5"`. O pedido de
   lançar `Explore` voltou como erro da ferramenta: `Agent type 'Explore' not found. Available
agents: filha` — a allowlist `Agent(filha)` é imposta pela CLI.

Como o board usa isso (`src/extension/ai/providers/claude.ts`, `aiOutput/claude.ts`,
`storySessionCli.ts`): a principal é o agente da sessão (`--agent`), retomada por `--resume`; a
filha da sub-tarefa vai no mesmo `--agents` (por arquivo temporário, por causa do limite da linha de
comando no Windows) com `tools`, `disallowedTools`, `model`, `effort` e `mcpServers` do card; a
principal só pode lançá-la (`Agent(<filha>)`); o leitor emite a filha quando a CLI a inicia e o
modelo efetivo pelo `resolvedModel` (ou pelo `model` das mensagens dela). Uma chamada de `Agent`
recusada pela CLI não vira filha. Cenário: `test/scenarios/storySessionClaude.scenario.test.ts`.
