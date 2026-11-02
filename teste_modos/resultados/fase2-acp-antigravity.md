# Fase 2 · ACP · Antigravity (`agy acp`) — PARCIAL (subagente assíncrono)

Cliente: `teste_modos/acp/client.mjs`, sandbox `teste_modos/sandbox/antigravity`.

## Rodada 1 (acp1)

- **Handshake**: `initialize` + `session/new` (com MCP de teste do cliente) +
  `session/prompt` → `sessionId=a23e0b60-…`, `stopReason=end_turn` em ~16s.
- **P1 Delegação — inicia.** `invoke_subagent` aparece como `tool_call` com os
  argumentos e o filho ganha `conversation://5d2fceaa-…` visível no texto.
- **Comportamento assíncrono — ATENÇÃO.** O turno do pai **terminou**
  (`end_turn`) com o filho ainda rodando ("Aguardando a conclusão dele").
  No ACP do Antigravity o subagente é background de verdade: o board precisa
  de um laço de espera/retomada para colher o resultado — diferente do Kimi
  (filho bloqueia a tool call) e do Codex (eventos Start/Complete dentro do
  mesmo turno).
- **P4** em prova na rodada 2: `session/load` com o sessionId para cobrar o
  resultado do escritor e delegar ao leitor.

## Rodada 2 (acp2) — em andamento

Resume da sessão + coleta do escritor + delegação ao leitor. Resultado abaixo.
