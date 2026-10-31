---
name: migracao-do-banco
description: Cria uma migração nova no banco sql.js do board (tabela ou coluna nova, dado a preencher) subindo SCHEMA_VERSION, com o teste da migração a partir do esquema anterior. Use quando a história muda o formato do que o board grava.
---

# Migração do banco do board

O board grava num SQLite em memória (sql.js). Toda mudança de formato é uma migração nova em
`src/extension/db/schema.ts`, aplicada em ordem por `migrate()`. Uma migração que já saiu numa versão
publicada nunca muda: quem já a aplicou não voltaria a rodá-la.

## Arquivos

- `src/extension/db/schema.ts`: `SCHEMA_VERSION` e o mapa `MIGRATIONS` (número → SQL).
- `src/extension/repositories/*.ts`: quem lê e grava a tabela ou coluna nova.
- `src/shared/model.ts`: o tipo que a webview recebe, se o dado chega até ela.
- `src/extension/db/boardExport.ts`: só confira; a exportação já leva `schemaVersion`.
- `test/database.test.ts`: um `describe('migração N → N+1 (...)')` por migração.

## Passo a passo

1. Em `schema.ts`, suba `SCHEMA_VERSION` em um e acrescente `MIGRATIONS[nova]` com o SQL. Comece o
   bloco com um comentário dizendo o porquê e o número da história (`-- #123: ...`), como as anteriores.
2. Coluna nova em tabela existente: `ALTER TABLE ... ADD COLUMN ... NOT NULL DEFAULT ...`. Dado a
   preencher a partir do que já existe: um `UPDATE` na mesma migração, sem inventar valor (veja a
   migração 25, que copia `updated_at`). Valor de enumeração: comentário com as opções, sem `CHECK`
   quando uma opção nova não deve pedir migração (veja `log_months.metric`).
3. Leia e grave o campo nos repositórios e, se a webview o usa, no tipo em `src/shared/model.ts` e no
   snapshot do `BoardRepo`.
4. Em `test/database.test.ts`, copie o esquema da versão anterior (os `SCHEMA_Vn` do arquivo são
   montados por `replace` sobre o anterior), insira um dado antigo, rode `migrate(old)` e verifique:
   `schema_version` igual a `SCHEMA_VERSION`, os dados antigos intactos e o valor novo preenchido como
   esperado. Mantenha o teste "banco novo" passando.
5. Rode `npm run typecheck` e `npx vitest run test/database.test.ts test/repositories.test.ts`; antes
   de entregar, `npm run validate`.
6. Registre a mudança em `CHANGELOG.md` e `CHANGELOG_EN.md` se ela for visível para a pessoa.

## O que esta skill nunca faz

- Não edita nem renumera uma migração que já existe, mesmo para corrigir um erro: a correção é outra
  migração.
- Não rebaixa `SCHEMA_VERSION` nem faz a versão anterior aceitar um banco mais novo: `migrate()`
  recusa o board gravado por uma versão mais nova, e isso é proposital.
- Não altera `BOARD_TEMPLATE_VERSION` nem o board padrão: colunas, campos e textos das fases são
  outra tarefa (skill `mudar-board-padrao`).
- Não grava dado novo fora de transação nem fora de `MIGRATIONS` (nada de `ALTER TABLE` em repositório).
