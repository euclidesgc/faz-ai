---
name: "mensagem-host-webview"
description: "Cria ou altera uma mensagem entre a interface (webview) e o host da extensão: o tipo em src/shared/messages.ts, o handler do router ou o caso da HostBridge, a resposta correlacionada por requestId e o teste dos dois lados. Use quando uma tela precisa de uma ação ou leitura nova do host, ou quando muda o formato de uma mensagem existente."
---

# Mensagem nova entre a interface e o host

Toda conversa entre a webview e a extensão passa pelas uniões de `src/shared/messages.ts`:
`WebviewToHost` (a tela pede) e `HostToWebview` (o host responde ou avisa). Os dois lados mudam
juntos. O host trata a mensagem de dois jeitos:

- **pelo router** (`src/extension/panel/messageRouter.ts`, mapa `HANDLERS`): o que lê ou grava o board.
  Os handlers ficam em `src/extension/panel/handlers/<domínio>.ts`, um `HandlerMap` por domínio
  (`cards.ts`, `cardContent.ts`, `harness.ts`, `boardSettings.ts`, `workspace.ts`, `models.ts`,
  `boardBackup.ts`, `branchRename.ts`), com o `BoardContext` de `handlers/context.ts`. É o mesmo
  caminho que o servidor MCP usa (`router.handle({ type: '...' })`), então a regra fica num lugar só.
- **pela ponte** (`viaBridge` no `bridgeOnly` do router + `case` em `src/extension/host/hostBridge.ts`):
  o que precisa do editor, de diálogo, do sistema de arquivos fora do banco ou responde uma leitura
  sem mudar o board (ex.: `harness.file.read`, `metrics.query`, `attachment.read`).

## Quando usar

- A tela precisa de uma ação ou leitura nova do host.
- Muda o formato (campos) de uma mensagem que já existe.

Não use para ferramenta do MCP (skill `nova-ferramenta-mcp`), formato do banco (`migracao-do-banco`)
nem só para texto de tela (`texto-de-interface-i18n`).

## Entradas

- O que a tela pede e o que precisa receber de volta (só o `done`, ou um resultado).
- Se a ação muda o board (router) ou depende do editor/arquivos (ponte).
- O domínio do handler (arquivo em `handlers/`).

## Arquivos

- `src/shared/messages.ts`: `WebviewToHost`, `HostToWebview`, `Tracked` (envelope com `requestId`).
- `src/extension/panel/messageRouter.ts`: `HANDLERS` e `bridgeOnly`.
- `src/extension/panel/handlers/<domínio>.ts` e `handlers/context.ts`.
- `src/extension/host/hostBridge.ts`: o `switch (msg.type)` da ponte.
- `src/webview/vscode.ts` (`postToHost`), `src/webview/request.ts` (`request()`, espera o `done`),
  `src/webview/store/actions.ts` e `src/webview/store/boardStore.ts`.
- Testes: `test/<domínio>.test.ts` (chamam `router.handle({ type: ... })`), `test/hostBridge.test.ts`,
  `test/ui/*.test.tsx` para a tela.

## Passo a passo

1. Acrescente o tipo em `WebviewToHost`, com um comentário `/** ... */` dizendo o que a mensagem faz,
   no bloco do mesmo domínio e no padrão de nome `dominio.acao` (`harness.library.read`). Se há
   resposta além do `done`, acrescente em `HostToWebview` um `<tipo>Result` (ou nome equivalente) com
   `requestId` e `error?`, como `harness.file.readResult`.
2. Host:
   - router: escreva o handler no `HandlerMap` do domínio; regra pura vai para `src/shared` e é testada
     lá. Erro para a pessoa é `throw new Error('...')` em português (vira toast pelo `error`); a
     tradução vai em `src/webview/i18n/en/host.ts`;
   - ponte: registre `'tipo': viaBridge` no `bridgeOnly` e trate o `case` na `HostBridge`.
   O TypeScript recusa o `HANDLERS` sem handler para o tipo novo: não contorne com cast.
3. Webview: envie por `postToHost` ou, quando a tela precisa saber que terminou, por `request()`;
   centralize em `store/actions.ts` se mais de uma tela usa.
4. Testes: um `it` no `test/<domínio>.test.ts` que chama `router.handle(...)` e confere o efeito no
   `router.snapshot()` (e o erro); na ponte, em `test/hostBridge.test.ts`; na tela, em `test/ui/`.
5. Mudança visível: `registrar-mudanca-changelog-readme`.

## Validação

- `npm run typecheck` (os três tsconfig pegam o lado que ficou para trás).
- `npx vitest run test/<domínio>.test.ts test/hostBridge.test.ts <testes da tela>`; antes de
  entregar, `npm run validate`.

## Saída

Na conversa do card: o tipo da mensagem, quem trata (router ou ponte, arquivo do handler), a resposta
e os testes acrescentados.

## Falhas

- Não dá para decidir entre router e ponte (a ação grava no board **e** abre diálogo): faça a ponte
  colher a entrada e mandar ao router uma mensagem própria, como as de importação
  (`harness.import.pick`, `backup.import.pick`/`backup.import.apply`); se ainda houver dúvida, pergunte no card.
- Mensagem existente usada por outra tela ou pelo MCP: procure todos os usos antes de mudar o formato
  e mude-os juntos; se o MCP depende dela, rode também `test/mcp.test.ts`.

## O que esta skill nunca faz

- Não grava no banco a partir da `HostBridge` nem duplica no handler regra que já está no router.
- Não importa `vscode` em `src/shared` nem no router (o router roda também no modo navegador e no MCP).
- Não renomeia uma mensagem existente sem atualizar todos os usos no mesmo passo.

## Lacunas para revisar

- O caminho no modo navegador (`src/extension/web/webServer.ts`) não foi conferido nesta skill:
  verifique se a ponte nova precisa de equivalente ali.
