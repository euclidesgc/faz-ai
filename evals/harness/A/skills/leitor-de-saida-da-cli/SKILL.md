---
name: "leitor-de-saida-da-cli"
description: "Cria ou corrige o leitor da saída de uma CLI de IA (Claude Code, Cursor, Kimi) em src/extension/aiOutput, testado contra uma saída real gravada em test/fixtures. Use quando a CLI muda o formato do stream-json, quando o board mostra linha, consumo ou inventário errados de uma execução, ou ao ligar uma ferramenta nova."
---

# Leitor da saída de uma CLI de IA

Cada execução de card roda a CLI da ferramenta e passa cada linha da saída a um `OutputReader`
(`src/extension/aiOutput/reader.ts`): `push(line, stream)` devolve as linhas legíveis para o board,
`report()` devolve o `RunReport` do fim (consumo, medição, inventário de chamadas) e `sawEvent` diz se
o formato foi reconhecido. O provider da ferramenta (`src/extension/ai/providers/<ferramenta>.ts`)
escolhe o formato (`OutputFormat`) e o leitor. O `stderr` é texto de gente e nunca é interpretado.

## Quando usar

- A CLI mudou o formato do `stream-json` (versão nova) e o board passou a mostrar errado.
- Consumo, medição (`measure`) ou inventário de chamadas saem errados para uma ferramenta.
- Ferramenta nova com saída estruturada.

Não use para flags de linha de comando ou montagem do processo (`runner.ts`, `spawn.ts`, `execution.ts`):
isso é integração da CLI, com o agente `integracoes-ia`.

## Entradas

- Uma **saída real** da CLI (arquivo `.jsonl` da execução, ou o log do card) e a versão da CLI.
- A documentação oficial atual do formato de saída da ferramenta (regra do projeto: leia antes de
  codificar algo específico de uma ferramenta e cite a fonte na conversa do card).
- O que o board mostra e o que deveria mostrar.

## Arquivos

- `src/extension/aiOutput/reader.ts` (`OutputFormat`, `OutputReader`, `ReaderDeps`).
- Um leitor por ferramenta: `claude.ts`, `cursor.ts`, `kimi.ts`; base comum em `json.ts`, `lines.ts`,
  `text.ts`, `measured.ts`, `errors.ts`.
- `src/extension/ai/providers/<ferramenta>.ts` e `providers/index.ts`: formato e leitor por ferramenta.
- `src/shared/log.ts`: o `RunReport`.
- `test/fixtures/<ferramenta>-stream-json*.jsonl` e `test/aiOutput<Ferramenta>.test.ts`
  (`aiOutputClaude`, `aiOutputCursor`, `aiOutputKimi`, `aiOutputLines`, `aiOutputText`).

## Passo a passo

1. Grave a saída real em `test/fixtures/<ferramenta>-stream-json[-caso].jsonl`, uma linha por evento.
   Encurte o conteúdo das ferramentas e **retire segredos, tokens, e-mails e caminhos pessoais**; mantenha
   os campos que o leitor usa.
2. No topo do teste, um comentário diz a versão da CLI e o que a execução gravada faz (veja
   `test/aiOutputKimi.test.ts`). Primeiro um `describe` contra a fixture; depois os casos de borda,
   montados com os mesmos campos.
3. Escreva o teste que falha (linha mostrada, `report().measure`, `consumption`, `inventory`), depois
   corrija o leitor. Evento desconhecido não quebra a leitura: vira lista vazia.
4. Formato novo: acrescente o valor em `OutputFormat`, o leitor no arquivo da ferramenta e a escolha
   em `reader: (format) => ...` do provider.
5. Avalie as outras ferramentas: se a mesma correção vale para elas, aplique; se não, deixe a
   diferença explícita no código (comentário com o porquê).

## Validação

- `npx vitest run test/aiOutput*.test.ts test/runner.test.ts` e `npm run typecheck`; antes de
  entregar, `npm run validate`.

## Saída

Na conversa do card: versão da CLI e fonte da documentação consultada, a fixture gravada, o que
o leitor passou a entender e o efeito para as outras ferramentas.

## Falhas

- Sem saída real disponível: não invente fixture; peça a saída com `ask_question` (ou registre como
  pendência). Casos de borda montados à mão não substituem a fixture.
- Documentação e saída real divergem: vale o que a CLI emite; registre a divergência como achado não
  validado.
- A CLI não informa consumo: `measure` parcial e `consumption` nulo, sem estimar valores.

## O que esta skill nunca faz

- Não interpreta `stderr`.
- Não muda flags da CLI nem o processo para "consertar" a leitura.
- Não grava na fixture dado pessoal ou segredo.
