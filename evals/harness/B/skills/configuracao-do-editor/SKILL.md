---
name: "configuracao-do-editor"
description: "Adiciona ou altera uma configuração fazai.* do Settings do editor: o contributes.configuration do package.json, as descrições nos dois package.nls, a sincronia com o board em src/extension/settings/ideSettings.ts e os testes packageConfiguration e ideSettings. Use quando a história cria uma opção que a pessoa ajusta no Settings do VS Code ou do Cursor."
---

# Configuração `fazai.*` do editor

As opções do Faz AI no Settings do editor ficam em `package.json` › `contributes.configuration`, em
seções ordenadas (Instalação, Aparência, Git, Backup). Dentro do editor, o Settings é a fonte e o
SQLite do board é a cópia; fora dele (navegador e MCP) o SQLite é a única fonte. A sincronia mora em
`src/extension/settings/ideSettings.ts`: cada chave ligada ao board é um `SyncedKey`.

## Quando usar

- Opção nova que a pessoa ajusta no Settings (`fazai.<seção>.<nome>`).
- Mudança de valores aceitos, default ou escopo de uma opção existente.

Não use para preferência só da tela (sem Settings) nem para campo do board criado pela pessoa.

## Entradas

- Nome da chave, seção, tipo, valores aceitos, default e escopo (`application`, `window`, `resource`).
- Se o valor precisa valer fora do editor (navegador, MCP): então é sincronizado com o board.

## Arquivos

- `package.json` › `contributes.configuration`: chave, `type`, `enum`, `default`, `scope`,
  `markdownDescription: "%config....%"`, `enumDescriptions`.
- `package.nls.json` (inglês) e `package.nls.pt-br.json` (português).
- `src/shared/<assunto>.ts`: as constantes que o `package.json` repete (`LANGUAGES`, `THEMES`,
  `FONTS`, `DEFAULT_GIT`, `DEFAULT_RUNNER`, `PARALLEL_RANGE`...).
- `src/extension/settings/ideSettings.ts`: `SyncedKey` (`fromBoard`, `toBoardPatch`, `isValid`,
  `defaultValue`, `migrate`).
- `test/packageConfiguration.test.ts`, `test/ideSettings.test.ts`.
- `docs/configuracoes.md` e `docs/configuracoes_EN.md`; o README só na lista de configurações, em 1 a 2 frases.

## Passo a passo

1. Declare a chave na seção certa do `package.json`, com o prefixo `fazai.`; o `enum` e o `default`
   vêm das constantes de `src/shared`, não de valores soltos.
2. Escreva `markdownDescription` (e `enumDescriptions`, se houver enum) como referência `%config...%`
   e acrescente o texto nos dois `package.nls*.json`.
3. Se a chave é sincronizada com o board: crie o `SyncedKey` em `ideSettings.ts`, com `defaultValue`
   igual ao do `package.json` e `isValid` aceitando só os valores do enum ou da faixa; o valor no
   board chega por `settings.board.update` (o patch). Se o campo ainda não existe no board, é
   formato do banco: skill `migracao-do-banco` antes.
4. Testes: em `packageConfiguration.test.ts`, um `it` que compara `enum`/`default`/`scope` com as
   constantes de `src/shared`; em `ideSettings.test.ts`, a ida e a volta Settings ↔ board e o valor
   inválido ignorado.
5. Documente em `docs/configuracoes.md` (e no `_EN`), na lista de configurações dos READMEs e nos CHANGELOGs (`registrar-mudanca-changelog-readme`).

## Validação

- `npx vitest run test/packageConfiguration.test.ts test/ideSettings.test.ts` e `npm run typecheck`;
  antes de entregar, `npm run validate`.

## Saída

Na conversa do card: a chave, a seção, o default, se é sincronizada com o board e os testes.

## Falhas

- A opção não cabe em nenhuma das seções: uma seção nova muda o teste "tem 4 seções em ordem", que é
  de convenção. É decisão da pessoa: registre como pendência (`request_review` com `pending`) em vez
  de alterar o teste.
- Default diferente entre `package.json` e `src/shared`: corrija para uma única fonte; não ajuste o
  teste para aceitar os dois.

## O que esta skill nunca faz

- Não lê `vscode.workspace.getConfiguration` fora de `ideSettings.ts`.
- Não cria chave sem o prefixo `fazai.` nem descrição em um idioma só.
- Não afrouxa `test/packageConfiguration.test.ts`.
