# Fase 1 · CLI · Cursor agent 2026.10.22 — BLOQUEADO (sem créditos)

Execução real tentada em 2026-11-02, sandbox `teste_modos/sandbox/cursor`
(sub-agentes `escritor`/`leitor` em `.cursor/agents/`, MCP de teste em
`.cursor/mcp.json`, skill em `.cursor/skills/`).

Resultado: `ActionRequiredError: You've hit your usage limit` — a conta não tem
cota de Agent. A CLI inicializou a sessão (`session_id` emitido, modelo Auto,
MCP e agents descobertos) e morreu antes do primeiro turno.

**Para destravar:** crédito/plano com cota de Agent na conta Cursor
(ou `CURSOR_API_KEY` de uma conta com cota). Reexecutar o mesmo cenário —
o sandbox e o comando já estão prontos:

```sh
cd teste_modos/sandbox/cursor
agent -p --force --approve-mcps --output-format stream-json "<prompt do condutor>"
```

Observação prévia (vale do init): a sessão iniciou com `permissionMode: default`
mesmo com `--force`; verificar na reexecução se as delegações ao `leitor`
(readonly) pedem aprovação interativa — em modo `-p` isso pode travar.
