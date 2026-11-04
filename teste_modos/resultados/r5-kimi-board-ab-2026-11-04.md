# R5 — rodada real pelo board: tradicional × sessão da História, Kimi Code (04/11/2026)

Primeira comparação A/B pelo board real, com o harness headless do eval (`npm run eval`,
`evals/lib/hostBoard.ts`): projeto temporário, banco, ponte e socket MCP próprios, autopiloto ligado.
História de referência `backend` ("Notas ganham etiquetas", começa no Plan), modelo `kimi-code/k3`,
limite de 30 minutos por braço, Kimi 2.4.1 numa home isolada (`KIMI_CODE_HOME`) só com as credenciais,
sem os MCPs globais da conta. Braço A: modo tradicional. Braço B: `FAZAI_INTERNAL_STORY_SESSIONS=1`.

## Antes de medir: três ajustes no aparato

- O eval exigia o verificador de capacidades, que não existe para o Kimi: o harness passa a assumir o
  regime compatível para esse perfil (como a pessoa faz pela tela).
- O eval exige `@<esforço>` no modelo; o Kimi não tem níveis, e o runner recusava "medium". O card recebe
  o modelo sem o sufixo quando o catálogo não tem esforços.
- Com a home padrão, cada chamada ao Kimi demorava 2 min 36 s (os MCPs globais `github`, `context7` e
  `kimi-cu` sobem por `npx` a cada processo) e a API expirava em 300 s. Com a home isolada, 14 s.

## Resultado

| Braço         | Fim                        | Execuções | Sessões da CLI         | Entrada (não cache) | Saída  | Leitura de cache | Pedidos ao modelo |
| ------------- | -------------------------- | --------- | ---------------------- | ------------------- | ------ | ---------------- | ----------------- |
| A tradicional | timeout 30 min, na Revisão | 7         | 5 (uma por execução)   | 155.955             | 15.700 | 1.726.208        | 39                |
| B sessão      | timeout 30 min, na Revisão | 10        | 1 principal + 4 filhas | 485.429             | 32.636 | 2.888.192        | 73                |

Tokens lidos direto dos `wire.jsonl` da sessão (`usage.record`), não do banco: no braço B o leitor do board
somava o acumulado da sessão a cada execução (defeito corrigido nesta rodada, com baseline na retomada). No
braço A a execução da revisão foi cortada antes de informar consumo, então o total de A é um pouco menor que
o real. Sem preço no catálogo, custo em dólar não medido.

**O que cada braço fez em 30 minutos**

- A: Plan (1 sub-tarefa de implementação criada), implementação (código, 12 testes verdes, commit), revisão
  independente aprovada; o fechamento da história foi cortado pelo limite.
- B: Plan (a principal criou 3 sub-tarefas; a filha #2 escreveu o PLAN.md), implementação em duas filhas
  (2 commits, suíte verde), revisão por uma filha (APROVADO na conversa); a filha da revisão foi abortada
  pelo limite antes de devolver o resultado, o board marcou a sessão para reconciliação e a história
  ficou com a pessoa, como desenhado.

**O que o modo novo provou pelo board (com o Kimi)**

- Uma sessão nativa para a história inteira: 9 turnos da principal no mesmo `session_3d94b23a…`, por
  três fases.
- Cada sub-tarefa virou uma filha gravada pelo board (`.kimi-code/agents/filha-N.md`), lançada pela
  principal, conferida pelo nome e com o estado registrado em `story_session_children`; três concluídas
  com modelo verificado, uma falha (a abortada) que levou a sessão a reconciliação em vez de aceitar
  trabalho não confirmado.
- As filhas foram baratas: 14 a 49 mil tokens de entrada não cacheados cada, 326 a 479 mil de cache.

**O que o modo novo custou (com o Kimi)**

- A principal consumiu 389 mil tokens de entrada não cacheados em 29 pedidos: a cada processo novo
  (`kimi --session`), a CLI reenvia o histórico crescente sem aproveitar o cache do processo anterior (o
  último pedido teve 83 mil de entrada e 768 de cache). É isso que triplica a entrada em relação ao braço A.
- Em 30 minutos nenhum braço entregou a história. B fez mais trabalho (duas sub-tarefas e PLAN.md por
  filha), mas não foi mais rápido: a fase Plan levou 13 min contra 5 min, porque a principal delegou até
  a escrita do plano.

## Conclusão desta rodada

Funcionalmente o desenho está comprovado pelo board com o Kimi: continuidade da principal, filhas com
escopo do card, conferência e recuperação. A hipótese de economia **não se confirmou neste conector**: o
Kimi não preserva o cache da sessão entre processos, e a principal persistente passa a ser a parte cara.
A economia depende de cache entre retomadas (o Claude Code anuncia isso para `--resume`) e de uma
principal que delegue menos turnos administrativos.

Pendências: repetir com limite de 60 minutos para os dois braços chegarem ao fim; repetir no Claude Code
(onde a medição inclui a filha no `modelUsage` e o cache de `--resume` pode mudar o quadro); três histórias
por braço antes de qualquer decisão. Pastas mantidas da rodada: `fazai-eval-6uE4DR` (A) e
`fazai-eval-P84X17` (B) no diretório temporário do sistema.
