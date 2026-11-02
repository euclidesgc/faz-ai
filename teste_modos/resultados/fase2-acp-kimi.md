# Fase 2 · ACP · Kimi Code 2.4.1 (`kimi acp`) — P1, P2, P3 PASSAM

Cliente: `teste_modos/acp/client.mjs` (JSON-RPC sobre stdio; MCP de teste
passado pelo cliente no `session/new`, como o board faria).

- **Handshake**: `initialize` (protocolVersion 1) + `authenticate` + `session/new`
  + `session/prompt`, `stopReason=end_turn`, `sessionId` capturado
  (`session_247e43d5-…`) — sessão carregável depois (`session/load`, P4 a executar).
- **MCP via protocolo — PASSA.** O cliente declarou `mcp-segredo` no
  `session/new`; o escritor obteve `MCP-OK-7429` e gravou
  `resultado-escritor-acp.txt`. É o caminho do servidor do board, sem arquivo
  de config nem pasta confiável.
- **P1 Delegação visível — PASSA.** As delegações aparecem como `tool_call`/
  `tool_call_update` com títulos "Launching escritor agent" / "Launching leitor
  agent" — o board consegue vincular início/fim do filho ao card da sub-tarefa.
- **P2 Escopo — PASSA (mesmo mecanismo da CLI).** Os agentes do
  `.kimi-code/agents/` valem na sessão ACP; o leitor seguiu sem escrita/MCP/Skill
  (nenhum `resultado-leitor-acp.txt` criado).
- **P3 Observação — PASSA.** 559 `session/update` na sessão, incluindo os
  eventos de ferramenta dos filhos.
- **P4 Retomada — a executar** (`session/load` com o sessionId capturado).
- Observação: a sessão abriu em modo plano (pediu `plan_approve`, aprovado pelo
  cliente de teste); o board precisará tratar os modos no handshake.
