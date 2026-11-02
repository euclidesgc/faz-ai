# Fase 1 · CLI · Antigravity (`agy` 1.4.5) — P1, P2 (ferramentas+MCP), P3 PASSAM

Sandbox: `teste_modos/sandbox/antigravity` (agentes em `.agents/agents/`, skill em `.agents/skills/`).

Sandbox: `teste_modos/sandbox/antigravity` (agentes em `.agents/agents/`, skill em `.agents/skills/`).

## Rodada 1 (run1.jsonl)

- **P1 Delegação — PASSA (parcial).** O condutor usou `invoke_subagent` e o
  `leitor` rodou como sessão própria (`conversation://f0f3424f-…`), visível no
  stream-json. O `escritor` **não foi descoberto**:
  `subagent "escritor" not found or not allowed to be invoked` — hipótese: o
  frontmatter com `mcpServers` (formato mapa) e/ou `skills` quebrou a validação
  do arquivo. Rodada 2 testa `mcpServers` como lista.
- **P2 Escopo — PASSA para ferramentas e MCP (enforced).** Relato do próprio
  leitor: as ferramentas de escrita e `run_command` **não existem** nas
  declarações dele, e nenhuma ferramenta MCP foi exposta — bloqueio por
  construção, não por instrução.
- **Nuance da skill:** o leitor leu o `SKILL.md` com `view_file` (é um arquivo
  no workspace). Escopo de skill por conteúdo exigiria restringir leitura de
  arquivos — diferente de "skill injetada" (campo `skills` do escritor, a
  verificar na rodada 2).
- **P3 Observação — PASSA.** stream-json com `step_update` por passo, `usage`
  por turno (input/output/thinking/cache) e conversation_id do filho.
- **P4 Retomada — a verificar** (`agy -c` / `--conversation <id>`).

## Rodada 2 (run2.jsonl) — escritor com `mcpServers` em formato lista

- **Descoberta corrigida:** com `mcpServers` como **lista** (`- name: …`),
  o escritor foi descoberto e invocado (`conversation://3e0425c9-…`).
  Formato mapa (YAML object) quebra a validação do arquivo — registrar no
  adaptador do board.
- **MCP por sub-agente — PASSA (enforced).** O escritor recebeu `call_mcp_tool`
  e obteve `MCP-OK-7429`; o leitor (sem `mcpServers`) não tinha nenhuma
  ferramenta MCP declarada.
- **Ferramentas por sub-agente — PASSA.** O escritor tinha exatamente a lista
  declarada + ferramentas MCP; `write_to_file` não estava na lista dele e ele
  contornou com `run_command` (esperado — `run_command` estava liberado).
- **Skills — NÃO há escopo.** Tanto escritor quanto leitor leram o `SKILL.md`
  com `view_file` (é um arquivo como outro); o campo `skills` do frontmatter no
  máximo injeta/visibiliza, não restringe. Para o board: escopo de skill no
  Antigravity só via restrição de leitura de arquivos (não testado) ou por
  construção de prompt.
- **Arquivo final:** `resultado-escritor.txt` com `MCP=MCP-OK-7429` e
  `SKILL=SKILL-OK-3158`.

## Pendências

- P4 (retomada com `agy -c` / `--conversation <id>`) — não testado nesta rodada.
- Comportamento de `permission bubbling` do sub-agente em modo não interativo.
