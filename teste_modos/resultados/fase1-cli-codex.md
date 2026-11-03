# Fase 1 · CLI · Codex 0.163.0 — P1 e P3 PASSAM; P2-MCP FALHA; P2-sandbox em prova

Sandbox: `teste_modos/sandbox/codex` (agentes em `.codex/agents/*.toml`,
MCP em `.codex/config.toml`). Login ChatGPT.

## Rodadas 1–2 (run1) — bloqueio de aprovação de MCP

- A política padrão do `codex exec` nega MCP: `MCP tool call requires approval,
but approval policy is never`. Não combina com `--sandbox`: a flag certa é
  `--approve-for-me` (que já implica workspace-write).
- Primeira execução desperdiçada por cota esgotada (reset às 15:43) e pela
  flag `--approve-for-me` com valor indevido.

## Rodada 3 (run3, com --approve-for-me)

- **P1 Delegação — PASSA.** Condutor delegou a `escritor` e `leitor`
  (eventos `collab_tool_call` com `sender_thread_id` — as ferramentas de
  colaboração multi-agent são visíveis no `--json`).
- **P2 MCP — FALHA (sem escopo).** O `leitor` chamou o mesmo `codigo_secreto`
  e obteve `MCP-OK-7429`: os servidores MCP são da sessão (`config.toml`), sem
  campo por agente no TOML. O `sandbox_mode` por agente não cobre MCP.
- **P2 Escrita — INCONCLUSIVO nesta rodada.** O leitor não tentou escrever por
  obedência às `developer_instructions` ("não modifique arquivos"), sem
  exercitar o sandbox `read-only`. Rodada 4 prova o sandbox de fato.
- **P3 Observação — PASSA.** `--json` com itens por thread e `usage` por turno.
  **Custo alto:** ~100–117k tokens de entrada por rodada (82–97k em cache) —
  multi-agent do Codex hidrata bastante contexto por filho.
- **P4 Retomada — a verificar** (`codex resume`).

## Rodada 4 (run4) — prova do sandbox read-only do leitor: **FALHA**

O leitor (`sandbox_mode = "read-only"` no TOML) **escreveu
`resultado-leitor.txt`** via `exec_command`, exit 0, sem erro. Hipótese
operante: o `--approve-for-me` (necessário para o MCP do escritor passar)
aplica workspace-write à sessão inteira e atropela o sandbox por agente.
Conclusão prática para o board: **no modo exec, o escopo por sub-agente do
Codex (MCP e sandbox) não se sustenta** — o TOML por agente vale como papel e
preferência de modelo, não como fronteira.

**Resumo Codex CLI: P1 ✓, P3 ✓, P2 ✗ (MCP e escrita sem escopo real), P4 a verificar.**
