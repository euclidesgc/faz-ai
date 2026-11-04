# Fase 2 · ACP · Antigravity (`agy acp`) — COMPROVADO, com ressalvas (subagente assíncrono)

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

## Rodada 2 (acp2) — P2 do leitor e P4 confirmados

Resume da mesma sessão (`session/load` + `session/prompt`), coleta do escritor
e delegação ao leitor. Turno completou com `end_turn`.

- **P4 Retomada — PASSA.** A sessão `a23e0b60-…` foi retomada e o condutor
  produziu um comparativo escritor × leitor referindo os eventos da rodada 1 —
  contexto preservado entre conexões ACP.
- **P2 Ferramentas (leitor) — PASSA (enforced no schema).** "Bloqueado em
  nível de schema — nenhuma ferramenta de escrita ou execução (`write_to_file`,
  `replace_file_content`, `run_command`) foi exposta ao subagente leitor".
  `resultado-leitor-acp.txt` não foi criado.
- **P2 MCP (leitor) — PASSA (enforced por contexto).** `list_resources` com
  `mcp-segredo` retornou na hora: `server mcp-segredo is not allowed in this
context`.
- **Skill — SEM escopo (igual à CLI).** O leitor leu o `SKILL.md` como arquivo
  via `view_file` e obteve `SKILL-OK-3158`. Skill não é fronteira de acesso
  no Antigravity.
- **Escritor × MCP — artefato do cliente de teste.** O MCP apareceu no schema
  do escritor (`call_mcp_tool`), mas a chamada foi **negada por prompt de
  permissão** (`Permission prompt for action 'mcp' ... was denied`): nosso
  `client.mjs` não responde `session/request_permission`. No board, o cliente
  ACP precisa implementar o handler de permissão (auto-aprovar o que a
  sub-tarefa declara).
- **Custo — atenção.** O turno do resume registrou
  `inputTokens: 680.969` (599k de cache) — o ACP do Antigravity carrega um
  system/contexto muito pesado; medir antes de adotar para histórias longas.

## Veredito ACP Antigravity

P1 ✓ (assíncrono — exige laço de espera), P2 ✓ para ferramentas e MCP,
P3 ✓ (tool_calls + conversation:// do filho), P4 ✓ (resume entre conexões).
Ressalvas: skill sem escopo; subagente em background exige orquestração de
espera; cliente precisa tratar `session/request_permission`.
