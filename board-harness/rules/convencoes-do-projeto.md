# Faz AI Kanban

Extensão do VS Code e do Cursor com um board kanban que conduz a IA pelas fases de cada história. TypeScript.

## Mapa do código

- `src/extension`: host da extensão. Banco sql.js com migrações em `db/` (`schema.ts`, `boardTemplate.ts`), `repositories/`, servidor MCP em `mcp/` (ferramentas em `mcp/tools/`), runner e autopiloto das IAs (`runner.ts`, `autopilot.ts`, `aiOutput/`), `panel/messageRouter.ts`, servidor web e host.
- `src/shared`: regras e tipos puros, usados também pela webview. Sem banco e sem import de `vscode`.
- `src/webview`: telas em React + Radix Themes, build pelo Vite; traduções em `src/webview/i18n/en/`.
- `src/cli`, `src/mcp-bridge`: CLI e ponte MCP.
- `test/`: Vitest (`*.test.ts` para lógica, `*.test.tsx` e `test/ui/` com Testing Library para telas).
- `docs/` (`mcp.md`, `decisoes/`), `scripts/` (release, e2e), `board-harness/`, `media/`, `releases/` (fora do git).

## Validação

- `npm run typecheck`: os três tsconfig (extensão, webview, testes).
- `npx vitest related <arquivos tocados> --run` durante o trabalho (some os testes novos ou alterados à lista).
- `npm run validate` antes de concluir uma história ou atividade e antes de abrir ou mergear o PR: typecheck, eslint e prettier nos alterados contra `origin/develop`, `vitest related` e os cenários de `test/scenarios/`.
- A suíte inteira (`npm test`, uns 16 minutos) só roda no release; não rode `npm test` nem `vitest run` sem filtro fora dele. Os testes do MCP usam o `dist/mcp-bridge.js`: rode `npm run build:ext` antes quando a mudança mexe no MCP.
- `npm run build`: extensão e webview.

## Convenções

- Comentários, mensagens e nomes de teste em português; o comentário diz o porquê.
- Texto de interface: a chave é o português (`t('Novo card')`), a tradução vai em `src/webview/i18n/en/<área>.ts`; nomes do board padrão em `i18n/en/defaults.ts`. `test/i18n.test.ts` acusa o que faltar.
- Telas seguem o `DESIGN.md`: tokens semânticos, nunca hex nem primitivo nos componentes.
- Mensagens host↔webview passam por `src/shared/messages.ts`: mude os dois lados juntos.
- Banco: mudança de formato é migração nova em `src/extension/db/schema.ts`, subindo `SCHEMA_VERSION`; nunca edite uma migração que já saiu. Uma versão anterior recusa o board gravado por uma mais nova, e isso é proposital.
- Board padrão: mudança de colunas, campos ou textos de fase sobe `BOARD_TEMPLATE_VERSION` com um passo de atualização que preserva o que a pessoa personalizou; texto de fase anterior vai para `PHASE_HISTORY` (`src/shared/phaseDefaults.ts`).
- O que a IA lê é produto: skill do fluxo (`src/extension/flowSkill.ts`), instruções e descrições do MCP, notas do `get_card` e pedidos do runner mudam junto com o comportamento e têm teste.
- Integração com uma ferramenta de IA (Claude Code, Cursor, Copilot): leia a documentação oficial atual antes de mexer em caminhos, formatos de arquivo ou flags da CLI.
- Mudança visível entra em `CHANGELOG.md` e `CHANGELOG_EN.md`, na seção da próxima versão (a do `package.json`; não existe seção "Não lançado"), e o detalhe vai para o arquivo do assunto em `docs/`, nos dois idiomas; `docs/mcp.md` quando muda o MCP. O `README.md` é a página da loja e só muda quando a mudança cria ou remove um recurso, requisito, configuração ou problema conhecido.
- Toda história que muda o comportamento da execução de um card (plano, gateway, admissão, transporte, leitura da saída, conferência, mensagens do runner) ganha ou atualiza um cenário em `test/scenarios/`.
- Testes que guardam convenções (`i18n`, `icons`, `tokens`, `packageConfiguration`, `metricsContract`): se falharem, corrija o código, não afrouxe o teste.

## Limites

- Altere só os arquivos da sua sub-tarefa, sem commit nem troca de branch.
- Um pull request por história; funcionalidade grande vira histórias derivadas com PRs empilhados.
- Revise com mais rigor o que toca `src/extension/db/**`, `src/extension/repositories/**`, `src/extension/mcp/**`, `src/extension/runner.ts`, `src/extension/autopilot.ts` e `src/extension/flowSkill.ts`.
- Decisões de arquitetura ficam registradas em `docs/decisoes/`.
