# Ferramenta por modo, 14: teste real do Gemini nos três modos

> História 14 da épica [Ferramenta por modo: o Gemini em CLI, ACP e API](epica-ferramenta-por-modo.md).
> Entregue em 2026-10-23, depois da [8](ferramenta-por-modo-8-gemini-cli.md) (CLI), da
> [10](ferramenta-por-modo-10-gemini-api-mcp.md) e [11](ferramenta-por-modo-11-gemini-api-arquivos-shell.md)
> (API) e da [12](ferramenta-por-modo-12-limite-de-uso-gemini.md) (limite de uso). Fecha a `#988` para o
> Gemini: o ACP já tinha handshake e card validados lá; faltava o board inteiro, nos três modos.

## Contexto

Até a história 12 nenhuma chamada paga foi feita: a CLI foi provada com o binário 0.65.0 contra uma API
local e falsa, a API com um servidor HTTP falso, o ACP com um agente falso. Esta história entrega o que
roda com a conta de verdade e o registro do que ainda não foi visto. **O teste real ainda não foi rodado**:
quem roda é a pessoa dona da conta, porque gasta cota. Por isso todos os pontos abaixo estão **não
validados**; o rótulo muda para **verificado** só com a saída gravada neste registro (versão, data, número).

## Decisão

- **`test/cli-real/gemini.real.ts`** (fora do `npm test`: o `vitest.config.ts` só inclui `test/**/*.test.{ts,tsx}`;
  este arquivo é do `vitest.cli-real.config.ts`). Um card mínimo (ler o card pelo MCP do board, responder OK,
  não editar nada) roda pelo caminho do board (`cardWorld`: runner, gateway, admissão, driver do modo, leitor,
  conferência, `ai_runs`), com a ponta externa de verdade: `gemini -p` (CLI), `gemini --acp` (ACP) e
  `generateContent` (API). Em cada modo confere que: a execução termina com código 0; a conferência é
  `ok` (sem desvio falso); o inventário vem no vocabulário do modo (nomes do Gemini como `read_file` na CLI,
  `<servidor>/<ferramenta>` no MCP); o consumo foi registrado (`measure` `full` ou `tokens`, tokens de entrada
  mais saída maiores que zero); `ai_runs` traz `tool: gemini` e o `mode` certo; a chave não aparece no log, na
  conversa nem na linha de uso. Cada modo imprime uma linha JSON (`"gemini": "<modo>"`) com os tokens, para a
  comparação com o painel.
- **Pula, não falha, e nunca gasta sem confirmação.** Os outros testes reais tratam ausência como falha (o
  Claude e o Cursor não custam por execução). O Gemini cobra, então a regra aqui é outra, explícita no
  código: sem `FAZAI_REAL_CONFIRM=1` nada roda (inclusive o ACP por login OAuth); com a confirmação, a CLI
  pede o binário e a `GEMINI_API_KEY` (a home isolada do board não enxerga o login da conta), o ACP pede o
  binário (a chave é opcional) e a API pede a chave. O motivo vai no título do teste pulado e no `stderr`.
- **`scripts/gemini-real.mjs`**: explica o que vai acontecer, avisa que gasta cota, e **recusa (código 2)**
  sem `--sim` ou `FAZAI_REAL_CONFIRM=1`, antes de qualquer chamada. Com a confirmação roda o teste
  (`--modo cli|acp|api` filtra um modo) e, com `--capturar-429 <arquivo>`, captura um 429 real (abaixo).
  Os processos saem por lista de argumentos, sem shell.
- **A chave no ACP.** No board a chave do cofre chega ao ACP pelo Conectar (`authenticate`). O teste não
  passa pelo Conectar (que depende de verificação de capacidades, só provada à mão aqui): põe os recibos como
  os cenários e entrega a `GEMINI_API_KEY` no ambiente do processo. Isso exercita o transporte, o leitor e a
  conferência, mas **não** o `authenticate` com a chave pelo protocolo; ver "Fora do alcance".

## Rótulos por modo

Tudo **não validado** até a primeira execução. O que cada coluna confere está em `gemini.real.ts`.

| Ponto                                              | CLI (`gemini -p`) | ACP (`gemini --acp`) | API (`generateContent`) |
| -------------------------------------------------- | ----------------- | -------------------- | ----------------------- |
| A execução termina (código 0)                      | não validado      | não validado         | não validado            |
| Conferência sem desvio falso                       | não validado      | não validado         | não validado            |
| Inventário no vocabulário do modo                  | não validado      | não validado         | não validado            |
| Tokens registrados e batendo com o AI Studio       | não validado      | não validado         | não validado            |
| Modo em `ai_runs` (`cli`, `acp`, `api`)            | não validado      | não validado         | não validado            |
| Chave fora do log, da conversa e do registro       | não validado      | não validado         | não validado            |
| 429 real lido como limite de uso (história 12)     | não validado      | não validado         | não validado            |

Contra o que é **verificado** hoje, e por que não basta: a CLI 0.65.0 e o stream-json contra API local
(história 8); o ACP até o card inteiro na `#988` (sem o board inteiro); a API só contra servidor falso
(histórias 10 e 11); o formato do 429 só na documentação e no código da CLI (história 12).

## Como rodar

1. Chave de uma conta de teste no AI Studio, `export GEMINI_API_KEY=...`, e o `gemini` instalado
   (`gemini --version`). Use um projeto do Google com cobrança conhecida (a cota gratuita dá para uma
   rodada; num projeto pago, a cobrança é real).
2. `npm run build:ext` e `node scripts/gemini-real.mjs` (lê o aviso e recusa), depois
   `node scripts/gemini-real.mjs --sim`. Um modo só: `--sim --modo api`. Outro modelo:
   `FAZAI_REAL_GEMINI_MODEL=gemini-2.5-pro` (padrão `gemini-2.5-flash`, o mais barato).
3. Cole neste registro, por modo: versão do `gemini`, data, o JSON impresso, e mude o rótulo.

## Como conferir o consumo contra o AI Studio

1. Antes: abra aistudio.google.com, **Dashboard > Usage and Billing** (ou **Rate limit**), filtre pelo
   projeto da chave e pelo modelo, e anote os tokens de entrada, de saída e o número de requisições do dia.
2. Rode **um modo por vez** (`--modo`), esperando o painel atualizar (leva alguns minutos; ele agrega por
   minuto). Dois modos em seguida misturam as contagens.
3. Compare com o JSON do teste (`tokens.in`, `tokens.out`, `tokens.cacheRead`):
   - **entrada** do board = `promptTokenCount` sem o cache (`cachedContentTokenCount`), mais o pedido das
     ferramentas (`toolUsePromptTokenCount`); o painel mostra o total, então some o cache lido;
   - **saída** do board = candidatos mais o raciocínio (`thoughtsTokenCount`); o painel pode separá-los;
   - **requisições**: na API, `turns` do relatório (um pedido por turno) deve bater com a contagem do
     painel; a CLI pode fazer pedidos a mais (nova tentativa, resumo de sessão) e o ACP idem.
4. Anote a diferença em cada modo. Dentro de poucos por cento é **verificado**; diferença maior é achado:
   registre os números (do board e do painel) e abra um card, sem ajustar o leitor "no olho".

## Pontos que as histórias anteriores deixaram para a 14

- **Os corpos 429 da API foram montados, não capturados** (história 12: `test/fixtures/gemini-api-429-*.json`
  seguem o `google.rpc.Status` da documentação). Para capturar o real:
  `node scripts/gemini-real.mjs --sim --capturar-429 /caminho/gemini-api-429-real.json`. O roteiro dispara
  pedidos mínimos (1 token de saída, no máximo 60) até a API recusar; na cota gratuita estoura em
  poucos pedidos, numa conta paga pode não estourar (o roteiro diz e não grava nada). Leia o arquivo antes de
  versionar (confira que não há chave nem dado do projeto), compare com a fixture montada (`code`, `status`,
  `details` com `QuotaFailure` e `RetryInfo`) e, se divergir, ajuste `classifyGeminiFailure`. A cota diária
  (`PerDay` no `quotaId`) só se captura esgotando o dia; fica anotada como não capturada se não acontecer.
- **O erro JSON-RPC do ACP no 429** é o que o código da 0.65.0 monta (`RequestError(429, ...)`), não uma
  captura. Para capturar: com a cota esgotada, rode o ACP com o registro das mensagens do transporte e grave
  a resposta do `session/prompt`.
- **A chave por `authenticate` no ACP** (história 7): o Gemini CLI aceita a chave no login sem consultá-la;
  uma chave errada só aparece na primeira execução. Passe uma chave inválida de propósito pelo Conectar e
  registre a mensagem que chega ao card.
- **O horário do reset diário** (meia-noite do Pacífico) é a regra publicada, não um dado do erro:
  confira no painel de limites do AI Studio o horário em que o "Requests per day" volta.
- **O catálogo ACP do Cursor e do Kimi** segue sem oferecer o ACP deles; este teste é só do Gemini.

## Fora do alcance

- O `authenticate` do ACP com a chave do cofre pelo Conectar não é exercitado pelo teste (ver acima);
  rode o Conectar à mão no cartão ACP e registre.
- Nenhuma prova de isolamento é refeita com a conta: as sondas da história 8 seguem contra a API local.
- O consumo de tarefas longas (muitas chamadas de função, `max_turn_requests`) fica para quando houver
  uso real; o card mínimo tem poucos pedidos.

## Alternativas descartadas

- **Rodar o teste real no `npm test` ou no CI com uma chave de segredo:** cobra a cada execução e falha por
  cota alheia ao código; fica atrás da confirmação.
- **Falhar quando falta a chave, como o Claude e o Cursor:** esses não cobram; falhar quebraria o
  `npm run test:cli-real` de quem só quer os outros.
- **Gravar a saída real como fixture automaticamente:** a saída leva texto do modelo e pode levar dado do
  projeto; quem captura confere o arquivo antes de versionar.

## Consequências

- `npm run test:cli-real` passa a listar três testes do Gemini, pulados sem a confirmação.
- Quando alguém rodar, este registro ganha uma seção por execução (versão, data, JSON, diferença contra o
  painel) e a tabela troca os rótulos; só então a épica pode dar o Gemini como validado nos três modos.
- Docs: `CONTRIBUTING.md` e `CONTRIBUTING_EN.md`, `docs/harness.md` e `docs/harness_EN.md` (teste real do
  Gemini) e CHANGELOGs.
