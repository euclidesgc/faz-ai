---
name: mudar-board-padrao
description: Altera o board padrão (coluna, campo, opção ou texto de instrução e modelo de documento de uma fase) subindo BOARD_TEMPLATE_VERSION com um passo de atualização que preserva o que a pessoa personalizou. Use quando a história muda o que um board novo traz ou o que a IA lê numa fase.
---

# Mudança no board padrão

O board padrão (colunas, campos, textos das fases) tem versão própria, `BOARD_TEMPLATE_VERSION` em
`src/extension/db/boardTemplate.ts`. Boards criados antes são atualizados no lugar pelo "Atualizar
board", passo a passo, sem recriar nada e sem tocar no que a pessoa personalizou. Texto de fase é
produto: a IA o lê em `get_card.phase`, e o `PHASE_HISTORY` é o que permite trocar o texto antigo pelo
novo só onde ele ainda é o padrão.

## Arquivos

- `src/extension/db/boardTemplate.ts`: `BOARD_TEMPLATE_VERSION`, `BOARD_TEMPLATE` (colunas),
  `steps()` (os passos de atualização por versão), `insertColumn`, `STORY_PHASES`.
- `src/shared/phaseDefaults.ts`: `PHASE_DEFAULTS` (instrução, nome e modelo do documento de cada fase)
  e `PHASE_HISTORY` (versões anteriores de cada texto).
- `src/extension/db/seed.ts`: o board novo.
- `src/webview/i18n/en/defaults.ts`: nome padrão novo precisa da tradução.
- `test/boardUpgrade.test.ts` (board antigo → padrão atual), `test/mcp.test.ts` (nomes das colunas),
  `test/ui/defaultNames.test.tsx`, `test/flowSkillRounds.test.ts` quando o texto fala do fluxo.
- `README.md` e `README_EN.md` ("O que cada fase entrega"), `CHANGELOG.md` e `CHANGELOG_EN.md`.

## Passo a passo

1. Texto de fase (instrução ou modelo): em `phaseDefaults.ts`, renomeie a constante atual para
   `..._Vn` (n = versão atual do template), escreva a nova, aponte `PHASE_DEFAULTS` para ela e
   acrescente a antiga em `PHASE_HISTORY[fase].instructions` ou `.templates`, atualizando `change`
   com o que muda para quem ainda tem o texto antigo. `phaseTextSteps` faz o resto.
2. Coluna, campo ou opção nova: acrescente em `BOARD_TEMPLATE` (ou no seed) e escreva um passo em
   `steps()` guardado por `if (version < NOVA)`, como `reviewSteps` e `criticalityRemovalSteps`: localize pelo
   nome normalizado (`norm`), não faça nada se já existir ou se a âncora foi renomeada, e leia
   posições na hora de aplicar (um passo anterior pode tê-las mudado).
3. Suba `BOARD_TEMPLATE_VERSION` em um.
4. Nome padrão novo: tradução em `en/defaults.ts`.
5. Testes em `test/boardUpgrade.test.ts`: board novo já nasce no padrão; board antigo com o texto
   anterior recebe o novo e `pendingUpgrade` descreve o passo; coluna personalizada fica como está;
   aplicar duas vezes não duplica nada.
6. Documente a fase no README (os dois idiomas) e nos CHANGELOGs; o passo de atualização aparece para
   a pessoa, então a descrição dele é texto de produto.
7. Rode `npx vitest run test/boardUpgrade.test.ts test/mcp.test.ts test/ui/defaultNames.test.tsx` e
   `npm run typecheck`; antes de entregar, `npm test`.

## O que esta skill nunca faz

- Não edita no lugar um texto padrão que já saiu sem guardar o anterior em `PHASE_HISTORY`: os boards
  existentes ficariam para sempre com a versão velha.
- Não sobrescreve coluna, campo ou texto que a pessoa personalizou, nem move cards de coluna.
- Não mexe em `SCHEMA_VERSION` nem em `MIGRATIONS`: formato do banco é `migracao-do-banco`.
- Não muda a skill do fluxo (`src/extension/flowSkill.ts`) ou as instruções do MCP sem a história pedir;
  se o novo texto de fase contradiz o que elas dizem, aponte na conversa do card.
