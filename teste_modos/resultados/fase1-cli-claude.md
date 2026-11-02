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
