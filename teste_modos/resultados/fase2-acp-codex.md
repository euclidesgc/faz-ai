# Fase 2 · ACP · Codex (`npx @agentclientprotocol/codex-acp`) — P1 e P3 PASSAM; P2 FALHA

Cliente: `teste_modos/acp/client.mjs`. Login ChatGPT (cota ok após reset).

- **Handshake**: initialize + session/new + prompt, `sessionId` UUID,
  `stopReason=end_turn`. Modo legacy de subagentes (o cliente de teste não
  negociou a capability do RFD de subagent sessions — fica para uma rodada 2
  com a negociação bilateral).
- **P1 Delegação — PASSA.** `escritor` e `leitor` lançados.
- **P3 Observação — PASSA e melhor que na CLI.** Ciclo de vida do filho como
  eventos: `Start subagent escritor` / `Complete subagent escritor` (idem
  leitor) com `agentThreadId` e sender/receiver thread ids; `usage_update`
  contínuo (tokens usados × tamanho da janela).
- **P2 Escopo — FALHA (confirmada no protocolo).** O leitor **escreveu**
  `resultado-leitor-acp.txt` **e** usou o MCP (`MCP-OK-7429`): "Nenhuma ação
  foi bloqueada". Nem o TOML por agente nem o ACP dão fronteira por filho.
- **MCP via `session/new` — com ressalva.** O servidor declarado pelo cliente
  foi **recusado por colisão de nome**: "the Codex config already defines an
  MCP server with this name" (o `.codex/config.toml` do sandbox já tinha
  `mcp-segredo`). O do config prevaleceu e funcionou. Para o board: o nome do
  servidor (`faz-ai`) não pode colidir com o config do projeto, ou deve ser
  passado pelo próprio `codex mcp add`/config.
- **P4 Retomada — a verificar** (`session/load`).

**Resumo: para o Codex, o ACP melhora a observação, mas não resolve o escopo
por sub-agente — segue sem fronteira por filho (P2 ✗).**
