# R5 — rodada real pelo board: tradicional × sessão da História (04/11/2026)

Comparação A/B pelo board real, com o harness headless do eval (`npm run eval`, `evals/lib/hostBoard.ts`):
projeto temporário, banco, ponte e socket MCP próprios, autopiloto ligado, história de referência `backend`
("Notas ganham etiquetas", começa no Plan, aceite por `node --test`). Braço A: modo tradicional. Braço B:
`FAZAI_INTERNAL_STORY_SESSIONS=1`. Kimi 2.4.1 numa home isolada (`KIMI_CODE_HOME`) só com as credenciais;
Claude Code 2.1.316 com `haiku`.

## Ajustes no aparato e no board que a rodada exigiu

- O eval exigia o verificador de capacidades, que não existe para o Kimi: o harness assume o regime
  compatível para esse perfil. O eval exige `@<esforço>`; o Kimi não tem níveis, e o card recebe o modelo
  sem o sufixo.
- Com a home padrão do Kimi, cada chamada demorava 2 min 36 s (os MCPs globais da conta sobem por `npx` a
  cada processo) e a API expirava em 300 s. Com a home isolada, 14 s.
- A principal do Kimi nascia sem a ferramenta `Agent` no arquivo de agente; como a retomada não aceita
  outro arquivo, a sessão retomada não conseguia delegar (primeira tentativa do braço B, bloqueio seguro).
- **Medição cumulativa**: numa sessão retomada, o Kimi (registro `wire.jsonl`) e o Claude (`modelUsage` e
  `total_cost_usd` em `--resume`) informam o acumulado da sessão, e o board gravava esse acumulado em cada
  execução. Corrigido: o Kimi desconta o que já estava gravado antes da execução; o Claude guarda o
  acumulado no checkpoint da sessão e desconta na próxima retomada. Os números abaixo já estão corrigidos
  à mão (último acumulado da sessão), porque as rodadas correram antes da correção.
- A conferência marcava a filha autorizada como desvio ("subagente filha-2"); a filha passa a constar na
  conferência como delegada permitida.

## Kimi Code (k3)

| Braço         | Limite | Fim                                   | Execuções | Sessões da CLI                     | Entrada sem cache | Saída  | Leitura de cache |
| ------------- | ------ | ------------------------------------- | --------- | ---------------------------------- | ----------------- | ------ | ---------------- |
| A tradicional | 30 min | timeout na Revisão (revisão aprovada) | 7         | 5                                  | 155.955           | 15.700 | 1.726.208        |
| B sessão      | 30 min | timeout na Revisão (filha abortada)   | 10        | 1 principal + 4 filhas             | 485.429           | 32.636 | 2.888.192        |
| A tradicional | 60 min | **entregue e aceita em 762 s**        | 7         | 7                                  | 202.598           | 24.737 | 2.683.648        |
| B sessão      | 60 min | cota de 5 h do Kimi esgotou no Plan   | 5         | 1 principal + 1 filha              | —                 | —      | —                |
| B sessão      | 60 min | **entregue e aceita em 1309 s**       | 11        | 1 principal + 3 filhas + 2 resumos | 563.037           | 35.452 | 4.024.064        |

Sem preço no catálogo, custo em dólar não medido. Tokens do braço B de 30 min lidos direto dos `wire.jsonl`
(principal 389 mil de entrada sem cache em 29 pedidos; filhas de 14 a 49 mil cada). Os do braço B de 60 min
(repetido depois da cota voltar, `fazai-eval-N6fF7Y`) já saíram do board com a correção da medição e conferem
com a soma dos `usage.record` (76 pedidos): principal 423 mil de entrada sem cache em 39 pedidos, filhas de 24
a 46 mil cada, dois resumos entre fases 46 mil.

- O braço B de 60 min entregou a mesma história que A, aceita pelos 16 testes, com uma sessão (`session_1f44984f…`,
  9 turnos) e três filhas (`filha-2` plano, `filha-3` implementação, `filha-4` revisão), todas conferidas pelo
  nome com o modelo da sessão. Custou 1,7× o tempo (1309 s contra 762 s), 2,8× a entrada sem cache (563 mil
  contra 203 mil) e 1,5× a leitura de cache. Desta vez o cache da sessão sobreviveu a parte das retomadas (o
  último pedido da principal leu 117 mil tokens de cache e 748 sem), mas a principal ainda teve pedidos de
  107 mil tokens de entrada sem cache ao retomar com o cache frio; a leitura do histórico inteiro a cada
  processo continua sendo o custo dominante.
- O gasto da principal (423 mil) é 75 % do braço; as três filhas somadas (94 mil) custam menos do que uma
  execução tradicional média de A (29 mil por execução × 7). As filhas são baratas; a principal persistente é
  cara.

- O que B provou pelo board: uma sessão nativa por três fases (9 turnos no mesmo `session_3d94b23a…`), quatro
  sub-tarefas delegadas a filhas gravadas pelo board e conferidas pelo nome, três com modelo verificado; a
  filha abortada pelo limite levou a sessão a reconciliação em vez de aceitar trabalho não confirmado.
- O que B custou: o Kimi não preserva o cache da sessão entre processos (`kimi --session`): o último pedido
  da principal teve 83 mil tokens de entrada e 768 de cache. A principal persistente é a parte cara, e a
  entrada sem cache triplicou em relação a A no mesmo tempo.
- A primeira tentativa do braço B de 60 min caiu na cota de 5 h do plano do Kimi no Plan; o aparato esperou a
  cota voltar (2 h 30) e repetiu a rodada, que é a linha entregue acima.

## Claude Code (haiku), 60 min

| Braço         | Fim                                      | Execuções | Sessões da CLI                    | Saída  | Leitura de cache | Criação de cache | Custo informado |
| ------------- | ---------------------------------------- | --------- | --------------------------------- | ------ | ---------------- | ---------------- | --------------- |
| A tradicional | **entregue e aceita em 270 s**           | 8         | 8                                 | 39.661 | 3.396.921        | 349.075          | US$ 0,72        |
| B sessão      | bloqueada na 2ª rodada da revisão, 456 s | 9         | 1 principal + 4 filhas + 1 resumo | 72.346 | 6.984.527        | 828.786          | US$ 1,02        |

Custo de A: US$ 0,62 são os dois resumos de conversa entre fases, que rodaram com `opus` (não com o modelo
do card); o trabalho em `haiku` custou US$ 0,11. Custo de B: US$ 0,16 do resumo em `opus` e US$ 0,86 da
sessão principal com as filhas (último acumulado da sessão `e3365e1c…`).

- O que B provou pelo board: uma sessão nativa por três fases (8 turnos), quatro filhas (`filha-2`
  implementação, `filha-3` revisão, `filha-4` correção, `filha-5` segunda revisão), todas com
  `resolvedModel: claude-haiku-5-5` conferido; a allowlist `Agent(<filha>)` e os embutidos desligados
  valeram em todas.
- Por que B não entregou: a revisão da `filha-3` reprovou (um teste que já passava na base), a `filha-4`
  corrigiu, e a segunda revisão travou numa regra do fluxo (sugestão S2 marcada "não resolvida" impede o
  APROVADO). A não passou pela mesma rodada porque a sua revisão aprovou de primeira: variância do modelo,
  não do modo.
- Por que B custou mais em `haiku` (US$ 0,86 contra US$ 0,11): a principal relê a sessão inteira a cada
  turno. A leitura de cache cresceu de 0,5 milhão para 6,9 milhões de tokens por execução ao longo da
  história, e a criação de cache de 44 mil para 814 mil, porque cada processo novo regrava o contexto que
  não estava mais quente. As filhas são baratas; o que pesa é a principal carregar o histórico de todas as
  fases. Comparando só a fase Plan, igual nos dois: A US$ 0,0218, B US$ 0,0177.

## Linha de base: a mesma história direto na CLI, sem board

Mesmo `repo/` da história, mesmo texto (título e descrição do `story.json` mais "trabalhe neste repositório,
rode `node --test` e faça um commit"), um único `kimi -p` (k3, home isolada) e um único `claude -p` (haiku, sem
pedir permissão). Aceite pelos mesmos testes do eval.

| Execução                | Fim                    | Tempo | Pedidos ao modelo | Entrada sem cache | Saída  | Leitura de cache | 1º prompt | Custo                    |
| ----------------------- | ---------------------- | ----- | ----------------- | ----------------- | ------ | ---------------- | --------- | ------------------------ |
| Kimi k3 direto          | aceita (10/10), commit | 57 s  | 6                 | 6.599             | 2.270  | 86.016           | 13.846    | —                        |
| Kimi k3 pelo board      | aceita, commit         | 762 s | 63                | 202.598           | 24.737 | 2.683.648        | ~33.000   | —                        |
| Claude haiku direto     | aceita (10/10), commit | 49 s  | 13                | 16                | 7.669  | 383.306          | ~57.000   | US$ 0,015                |
| Claude haiku pelo board | aceita, commit         | 270 s | 107               | —                 | 39.661 | 3.396.921        | ~30.000   | US$ 0,72 (0,11 em haiku) |

Direto na CLI a história custa 10 % do tempo e 3 % dos tokens de entrada do Kimi pelo board, e 2 % do custo do
Claude pelo board (13 % se contado só o trabalho em `haiku`, sem os resumos em `opus`). O tempo ocioso do board
entre execuções foi de 1 s em todas as rodadas: a diferença inteira está no número de pedidos ao modelo (6 a 13
contra 63 a 107) e no prompt fixo de cada pedido (30 mil tokens de instruções, ferramentas MCP e card antes de a
IA fazer qualquer coisa). Dois terços das chamadas de ferramenta pelo board são do próprio board (`get_card` 8 a
18 vezes, `get_skill` 10 a 15, `update_checklist_item` 13, `move_card` 6 a 10), e cada uma é um pedido inteiro.

Pastas: `scratchpad/baseline/{kimi,claude}` desta sessão (com `.eval-acceptance/` copiado para o aceite).

## Conclusão desta rodada

Funcionalmente o desenho está comprovado pelo board nos dois conectores: continuidade da principal, filhas
com o escopo do card, conferência pelo nome, prova de modelo e recuperação; no Kimi os dois braços de 60 min
entregaram a história aceita. A hipótese de economia **não se confirmou** em nenhum dos dois: com um processo
por turno, a principal persistente relê o histórico inteiro a cada turno, e esse custo cresce com a história;
no Kimi com cache só parcial entre processos (B custou 2,8× a entrada sem cache e 1,7× o tempo de A), no
Claude com cache mas com regravação a cada processo (B custou 8× o trabalho em `haiku` de A).

| Conector                                                                                                   | Braço         | Fim                     | Tempo  | Entrada sem cache | Saída  | Leitura de cache | Custo                    |
| ---------------------------------------------------------------------------------------------------------- | ------------- | ----------------------- | ------ | ----------------- | ------ | ---------------- | ------------------------ |
| Kimi k3                                                                                                    | A tradicional | entregue                | 762 s  | 202.598           | 24.737 | 2.683.648        | —                        |
| Kimi k3                                                                                                    | B sessão      | entregue                | 1309 s | 563.037           | 35.452 | 4.024.064        | —                        |
| Claude haiku                                                                                               | A tradicional | entregue                | 270 s  | —                 | 39.661 | 3.396.921        | US$ 0,72 (0,11 em haiku) |
| Claude haiku                                                                                               | B sessão      | bloqueada na 2ª revisão | 456 s  | —                 | 72.346 | 6.984.527        | US$ 1,02 (0,86 em haiku) | A economia só apareceria com (a) um processo vivo por história, para o cache |
| ficar quente entre turnos, ou (b) uma principal com contexto podado por fase (checkpoint curto no lugar do |
| histórico), o que o plano já previa como "checkpoint" e ainda não existe.                                  |

Observação à parte: os resumos de conversa entre fases rodam com `opus` mesmo com o card em `haiku` e
dominaram o custo do braço A. Vale uma história própria.

Observação do aparato: ao fim das rodadas entregues aparece "A unidade não iniciou: out of memory" no log do
eval (Kimi B 60 e Claude A), depois do aceite: o autopiloto tenta abrir a unidade seguinte enquanto o harness
já fecha o banco. Não afeta o resultado, mas vale um olhar no encerramento do `hostBoard`.

Pendências: três histórias por braço antes de decidir; corrigir o modelo do resumo entre fases; Cursor sem
créditos (fora desta rodada). Pastas mantidas: `fazai-eval-6uE4DR` (Kimi A 30), `fazai-eval-P84X17` (Kimi B 30),
`fazai-eval-lcxABN` (Kimi A 60), `fazai-eval-Ndjrz8` (Kimi B 60, cota), `fazai-eval-N6fF7Y` (Kimi B 60,
entregue), `fazai-eval-mIfQqJ` (Claude A), `fazai-eval-Y0QEQC` (Claude B), no diretório temporário do sistema.
