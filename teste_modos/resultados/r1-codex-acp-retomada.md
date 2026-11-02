# R1 — retomada real da principal com Codex ACP

Data: 02/11/2026. Ambiente: `codex-acp` 2.2.2 instalado localmente. Sonda em pasta temporária vazia, sem alterações no repositório. Os logs brutos ficaram fora do projeto porque contêm inventário do ambiente.

1. Processo ACP A: `initialize` → `session/new` → `session/prompt` com “Memorize a palavra marfim42. Responda somente OK.” Resultado: `end_turn`, ID nativo `01a19e50-1d38-76c0-ba1b-39476bde07d4`.
2. Processo ACP B: novo processo, `initialize` → `session/load` com o mesmo ID → `session/prompt` perguntando a palavra do turno anterior. Resultado: `end_turn`, mesmo ID nativo; resposta `marfim42`.

**Conclusão delimitada:** o conector carregou a conversa anterior em outro processo e preservou o ID nativo para dois turnos. Essa sonda não passou pelo board nem criou filha. O cenário integrado falso do board está em `test/scenarios/storySession.scenario.test.ts`.

## Ampliação dos MCPs na retomada

Uma segunda sonda criou a sessão `01a19e51-18de-77a3-bfac-7b54d962eed2` sem MCPs. Outro processo executou `session/load` com o mesmo ID e passou o servidor de teste `mcp-segredo` no parâmetro `mcpServers`. O prompt seguinte chamou `mcp.mcp-segredo.codigo_secreto` e respondeu `MCP-OK-7429`, valor que o servidor de teste fornece. Portanto o Codex ACP 2.2.2 aceitou acrescentar esse MCP ao retomar a principal. O teste não prova que uma filha nativa o herdou nem que o board consegue isolar o servidor por subtarefa; esses pontos permanecem no aceite R2.
