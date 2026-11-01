---
name: "nova-ferramenta-mcp"
description: "Cria ou altera uma ferramenta do servidor MCP do board (nome, parâmetros zod, descrição, resposta), com o teste em test/mcp.test.ts e a documentação em docs/mcp.md. Use quando a história dá à IA uma ação ou leitura nova pelo MCP."
---


# Ferramenta nova no servidor MCP do board

As ferramentas ficam em `src/extension/mcp/tools/`, um arquivo por assunto (`cards.ts`, `work.ts`,
`harness.ts`...), registradas por `defineTools` em `tools/index.ts`. Cada uma é um `tool(name,
description, shape, run, readOnly?)`: o `shape` é zod, estrito (parâmetro com nome errado vira erro),
o retorno vira JSON e exceções viram erro legível para o modelo. O que a IA lê é produto: descrição,
notas e instruções mudam junto com o comportamento e têm teste.

## Arquivos

- `src/extension/mcp/tools/<assunto>.ts`: a ferramenta; `tools/args.ts` tem os argumentos comuns
  (`workflowArg`, `fieldsArg`, `colorArg`), `tools/helpers.ts` o `overview(router)` de resposta.
- `src/extension/mcp/tools/index.ts`: a ordem de registro, que é a ordem que a IA vê. Não mude a
  ordem das existentes; uma ferramenta nova entra junto das do mesmo assunto.
- `src/extension/mcp/format.ts`: formatação de cards e notas que vão no retorno (`SUBTASKS_NOW_NOTE`).
- `src/extension/mcp/server.ts`: `MCP_INSTRUCTIONS`, só se o ciclo do card mudar.
- `src/extension/panel/messageRouter.ts`: a ferramenta não grava direto; manda uma mensagem ao router
  (`router.handle({ type: '...' })`), a mesma que a interface usa.
- `test/mcp.test.ts`: o cliente MCP em memória (`call(name, args)`).
- `docs/mcp.md`, `CHANGELOG.md` e `CHANGELOG_EN.md` (o README só quando a ferramenta cria ou remove um recurso).

## Passo a passo

1. Veja se já existe uma mensagem do router para a ação; se não, crie-a primeiro no router e no
   repositório, com teste próprio. A ferramenta só traduz nome → id (`findCard`, `findField`,
   `findType` de `mcp/format.ts`) e chama o router.
2. Escreva a ferramenta no arquivo do assunto. Nome em `snake_case`, parâmetros com `.describe()` quando
   o nome não basta, `readOnly = true` nas que só leem. Descrição em português, direta, com o que a IA
   precisa saber para usar certo; o limite é 2.048 caracteres (o Claude Code corta o resto, e o teste
   barra).
3. Registre em `tools/index.ts` se criou um arquivo novo.
4. Em `test/mcp.test.ts`, adicione um `it` que chama a ferramenta pelo cliente e confere o efeito no
   board (`router.snapshot()`) e a resposta; cubra também o erro (card inexistente, parâmetro
   inválido). Se o detalhe de uso foi para a descrição, acrescente-o ao teste "o que não cabe nas
   instruções está na descrição".
5. Documente em `docs/mcp.md` (a seção do assunto) e, se muda o que a pessoa vê, nos dois CHANGELOGs
   (`registrar-mudanca-changelog-readme`).
6. Rode `npm run build:ext` (os testes do MCP usam o `dist/mcp-bridge.js` gerado) e
   `npx vitest run test/mcp.test.ts`; antes de entregar, `npm run validate`.

## O que esta skill nunca faz

- Não grava no banco por dentro da ferramenta nem repete regra de negócio do router.
- Não muda a ordem nem o nome de uma ferramenta existente: sessões abertas e a skill do fluxo
  dependem deles.
- Não escreve descrição ou instrução acima de 2.048 caracteres, nem leva para `MCP_INSTRUCTIONS` o que
  cabe na descrição da ferramenta.
- Não altera `src/extension/flowSkill.ts` nem `~/.faz-ai/mcp/bridge.js` por conta própria; a skill
  do fluxo muda só quando o ciclo do card muda, e a ponte é gerada pelo build.
