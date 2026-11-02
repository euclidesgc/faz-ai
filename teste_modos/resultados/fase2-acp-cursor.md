# Fase 2 · ACP · Cursor (`agent acp`) — BLOQUEADO (sem créditos)

Mesma causa da fase 1: a conta sem cota de Agent morre no primeiro turno
(`ActionRequiredError: You've hit your usage limit` no modo CLI; o ACP usa a
mesma cota). O cliente de teste e o sandbox já estão prontos:

```sh
node teste_modos/acp/client.mjs --cmd agent --args "acp" \
  --cwd teste_modos/sandbox/cursor --out teste_modos/sandbox/cursor/acp1.log \
  --prompt "<prompt do condutor>"
```

O que verificar quando houver crédito (a [doc de ACP do Cursor](https://cursor.com/docs/cli/acp)
é promissora para P3):

- `cursor/task`: notificação de conclusão de subagente com `subagentType`
  (aceita `{ custom: "nome" }`), `agentId` e `durationMs` — o `agentId`
  permite retomar o filho;
- se o hook do board (`subagentStart`, `preToolUse`, `beforeMCPExecution`)
  também vale nas sessões ACP;
- MCP passado no `session/new` (a doc diz que usa `.cursor/mcp.json`; o
  cliente passa o de teste para comparar);
- `session/load` para P4.
