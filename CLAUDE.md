# Faz AI Kanban

Extensão do VS Code e do Cursor com um board kanban que conduz a IA pelas fases de cada história.
TypeScript em três partes:

- `src/extension`: o host da extensão (banco sql.js com as migrações em `db/`, `repositories/`,
  servidor MCP em `mcp/`, runner e autopiloto das IAs, servidor web e CLI);
- `src/shared`: regras e tipos puros, usados também pela webview (sem banco nem `vscode`);
- `src/webview`: as telas, em React com Radix Themes, pelo Vite.

Testes em `test/` (Vitest; `test/ui/` para as telas, com Testing Library).

## Comandos

- `npm run typecheck`: os três tsconfig (extensão, webview e testes).
- `npm test`: build da extensão, lint, `prettier --check` e Vitest. Os testes do MCP usam o
  `dist/mcp-bridge.js` que o build gera.
- `npm run build`: extensão e webview.

## Convenções

- Comentários, mensagens e nomes de teste em português. O comentário diz o porquê.
- Texto da interface: a chave é o português (`t('Novo card')`); a tradução vai em
  `src/webview/i18n/en/`, e o teste de i18n acusa a que faltar. Os nomes do board padrão (colunas,
  campos, tipos) vão em `i18n/en/defaults.ts`.
- Telas seguem o [DESIGN.md](DESIGN.md): tokens semânticos, nunca hex nem primitivo nos componentes.
- Banco: mudança de formato é uma migração nova em `src/extension/db/schema.ts`, subindo
  `SCHEMA_VERSION`; nunca edite uma migração que já saiu. Uma versão anterior recusa abrir o board
  gravado por uma mais nova.
- Board padrão: mudança no modelo (colunas, campos, textos das fases) sobe `BOARD_TEMPLATE_VERSION`
  em `src/extension/db/boardTemplate.ts`, com um passo de atualização que não mexe no que a pessoa
  personalizou. Texto padrão de fase que muda: guarde o anterior em `PHASE_HISTORY`
  (`src/shared/phaseDefaults.ts`).
- O que a IA lê é produto: a skill do fluxo (`src/extension/flowSkill.ts`), as instruções do servidor
  MCP, as notas do `get_card` e os pedidos do runner mudam junto com o comportamento e têm teste.
- Toda mudança visível entra em `CHANGELOG.md` e `CHANGELOG_EN.md`, na seção "Não lançado" /
  "Unreleased", e na seção certa de `README.md` e `README_EN.md` (e de `docs/mcp.md` quando muda o
  MCP). Na `develop`, essa seção contém apenas entregas já integradas, sem itens previstos ou
  exclusivos de outras branches. O `npm run release` transforma "Não lançado" na versão, com as
  notas das mudanças presentes na branch da release.
- Integração com uma ferramenta de IA (Claude Code, Cursor): leia a documentação oficial atual antes
  de mexer em caminhos, formatos de arquivo ou flags da CLI.

## Núcleo

Revise com mais rigor o que mexe em `src/extension/db/**`, `src/extension/repositories/**`,
`src/extension/mcp/**`, `src/extension/runner.ts`, `src/extension/autopilot.ts` e
`src/extension/flowSkill.ts`.

## Fluxo

As histórias deste repositório passam pelo board do próprio Faz AI, com os agentes de
`.claude/agents/`. Um pull request por história; uma funcionalidade grande vira histórias derivadas,
com os PRs empilhados. A base de integração das novas funcionalidades é a `develop`; entregas em
branches intermediárias precisam chegar a ela antes de constar nas notas da próxima release.
Os registros de decisão ficam em [`docs/decisoes/`](docs/decisoes/README.md).
