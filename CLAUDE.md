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

### Testes durante o desenvolvimento

A suíte completa (`npm test`) leva uns 16 minutos e só roda antes de um release. Na Implementação e
na Revisão de uma história, rode só o que a mudança afeta:

- `npx vitest related <arquivos alterados> --run`: os testes que importam os arquivos tocados (some
  os testes novos ou alterados à lista);
- `npm run typecheck`;
- `npx eslint <arquivos alterados>` e `npx prettier --check <arquivos alterados>`;
- `npm run build:ext` antes, se a mudança mexe no MCP (os testes dele usam o `dist/mcp-bridge.js`).

Não rode `npm test` nem `vitest run` sem filtro fora do release, nem em subagentes em segundo plano.

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
- Toda mudança visível entra em `CHANGELOG.md` e `CHANGELOG_EN.md`, na seção da próxima versão
  (a mesma do `package.json`). O changelog segue o Keep a Changelog: uma seção por versão, com as
  subseções "Adicionado", "Alterado", "Removido" e "Corrigido" ("Added" / "Changed" / "Removed" /
  "Fixed"), um item por mudança, com o título em negrito e o número da história. Não existe seção
  "Não lançado": a `develop` sobe a versão do `package.json` na primeira entrega da versão seguinte,
  e a seção do topo contém apenas entregas já integradas. O release roda com essa versão explícita:
  `npm run release -- <versão do topo>`.
- Documentação em dois níveis, sempre em português e inglês (sufixo `_EN`). O `README.md` é a página
  da extensão na loja (padrão de README de extensão do VS Code, até 1500 palavras): só muda quando a
  mudança cria ou remove um recurso, um requisito, uma configuração ou um problema conhecido, em 1 a
  2 frases por item, sem regra de borda, tela inteira nem implementação. O detalhe de comportamento
  vai para o arquivo certo em `docs/`: `fluxo.md` (fases, aprovação, perguntas, Trabalhar na fase,
  Refinar, Resumir, vínculos), `harness.md` (biblioteca, modos, importar/exportar, agentes, perfis
  de CLI, Diagnóstico), `automacao.md` (heartbeat e modo autônomo), `gitflow.md` (branch, PR,
  derivadas, merges, registros de decisão), `metricas.md` (contexto, Consumo, Métricas,
  `get_metrics`), `configuracoes.md` (telas de Configurações), `dados.md` (dados, backup, navegador
  e `faz-ai`), `mcp.md` (ferramentas MCP). Os dois blocos que `scripts/releaseCheck.mjs` confere no
  README (aviso alpha e agradecimento) nunca mudam de texto sem atualizar a tabela `SHOWCASE`.
  Imagens só por caminho relativo em `docs/images/` (o `vsce` reescreve para URL absoluta), nunca
  SVG do repositório. O que é de quem desenvolve fica em `CONTRIBUTING.md`.
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
