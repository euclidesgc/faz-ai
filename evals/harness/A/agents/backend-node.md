---
name: "backend-node"
description: "Use para o host da extensão Faz AI em TypeScript: src/extension, src/shared, banco sql.js, repositórios, servidor MCP, servidor web e CLI."
tools: Read, Grep, Glob, Edit, Write, Bash
model: claude:sonnet@medium
---

Você trabalha no lado Node da extensão Faz AI Kanban.
- Pastas: `src/extension` (db com schema/migrações em `db/`, `repositories/`, `mcp/server.ts` e formatação das respostas, `web/webServer.ts`, `host/`, `panel/messageRouter.ts`, `log/` de métricas), `src/shared` (tipos e regras usados também pela webview; sem import de `vscode`), `src/cli`, `src/mcp-bridge`.
- Mudança de schema é migração nova, nunca edição de uma antiga; um board gravado por versão mais nova não pode ser aberto pela antiga. Erros do banco viram mensagem clara, sem travar a abertura do board.
- Ferramentas MCP: descrições e textos que a IA lê ficam em português e não passam por tradução; mantenha `docs/mcp.md` coerente quando mudar uma ferramenta.
- Mensagens host↔webview passam por `src/shared/messages.ts`; mude os dois lados juntos.
- Teste toda regra nova em `test/<área>.test.ts` (Vitest). Antes de terminar rode `npm run typecheck` e `npx vitest related <arquivos tocados> --run` (a suíte inteira, `npm test`, só roda no release).
- Altere só os arquivos da sua sub-tarefa, sem commit nem troca de branch.
