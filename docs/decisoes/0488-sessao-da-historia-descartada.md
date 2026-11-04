# Sessão da História descartada: o board fica só com o modo tradicional

Registro de 04/11/2026. Fecha o piloto da branch `feature/board-story-sessions` (PR #488, não
integrado), que consolidava a investigação de 02 e 03/11 (`teste_modos/` naquela branch) e o registro
"Sessão da História e filhas por conector".

## Contexto

A hipótese do piloto: uma história resolvida direto na CLI termina mais rápido e gasta menos do que
pelo board porque cada card abre uma execução nova com o contexto inteiro. O desenho proposto era a
história como sessão principal, persistente entre fases, delegando cada sub-tarefa a uma filha
efêmera com escopo fechado (agente, skills, MCPs, ferramentas e modelo do card) que devolve só o
resultado, para a principal crescer pouco.

O piloto foi implementado para o Claude Code (subagentes no `--agents`, retomada por `--resume`) e
para o Kimi Code (`--agent-file`, `--session`), com conferência da filha pelo nome, prova de modelo e
recuperação na reabertura do board, e medido pelo board real com o harness do eval (história
"Notas ganham etiquetas", começa no Plan, aceite por `node --test`).

## Decisão

Descartar a sessão da História e manter só o modo tradicional: uma execução da CLI por card e por
fase, com contexto zerado, e o board como memória da história (card, conversa, anexos, estado).
O ganho de custo vem de enxugar cada execução, não de uma sessão persistente.

## Por que

A economia não se confirmou em nenhum dos dois conectores. Com um processo por turno, a principal
persistente relê o histórico inteiro a cada turno, e esse custo cresce com a história; as filhas
foram baratas, a principal é que pesou (75 % do braço no Kimi).

| Conector     | Braço         | Fim                     | Tempo  | Entrada sem cache | Leitura de cache | Custo                    |
| ------------ | ------------- | ----------------------- | ------ | ----------------- | ---------------- | ------------------------ |
| Kimi k3      | A tradicional | entregue                | 762 s  | 202.598           | 2.683.648        | —                        |
| Kimi k3      | B sessão      | entregue                | 1309 s | 563.037           | 4.024.064        | —                        |
| Claude haiku | A tradicional | entregue                | 270 s  | —                 | 3.396.921        | US$ 0,72 (0,11 em haiku) |
| Claude haiku | B sessão      | bloqueada na 2ª revisão | 456 s  | —                 | 6.984.527        | US$ 1,02 (0,86 em haiku) |

A diferença para a CLI direta tinha outra causa. Dois terços das chamadas de ferramenta pelo board
eram do próprio board (`get_card` 8 a 18 vezes, `get_skill` 10 a 15, `update_checklist_item` 13), cada
uma um pedido inteiro ao modelo com 30 mil tokens fixos (80 ferramentas MCP, a skill do fluxo e o
card), e os resumos entre fases rodavam em `opus`. A execução enxuta (branch
`feature/board-execucao-enxuta`) atacou isso no modo tradicional: a sessão MCP da execução recebe só
as 35 ferramentas da execução; o card e as skills vão no próprio pedido; o checklist se marca de uma
vez; o resumo entre fases roda com o modelo do card e só quando a conversa pesa; e a IA não pula fase
pelo `move_card`. Mesma história, Claude haiku, modo tradicional:

| Rodada                       | Tempo | Execuções | Pedidos ao modelo | Chamadas ao board | Custo (tudo em haiku) |
| ---------------------------- | ----- | --------- | ----------------- | ----------------- | --------------------- |
| Antes                        | 270 s | 8         | 107               | 79                | US$ 0,11              |
| Depois da execução enxuta    | 259 s | 8         | 79                | 32                | US$ 0,09              |
| CLI direta, só implementar   | 49 s  | 1         | 13                | —                 | US$ 0,015             |
| CLI direta, com o processo   | 322 s | 1 + subagente | 48 (+19)      | —                 | US$ 0,081             |

A comparação justa é a última linha: a mesma história pedida à CLI com as quatro fases da trilha curta
como entregas em arquivo (plano, um commit por sub-tarefa, revisão por subagente, texto do PR e
registro por fase; o prompt está em `0488-prompt-cli-com-processo.txt`). O custo é do processo, não do
board: US$ 0,081 direto contra US$ 0,086 pelo board, e o board foi mais rápido porque cada execução
parte de um contexto curto (29 mil tokens constantes por pedido, contra 48 mil crescendo até 97 mil
na sessão única). Os dois passaram nos 10 testes de aceite; a revisão da CLI direta achou dois testes
fracos e a do board aprovou sem achados, uma amostra de cada lado.

## Medição depois dos cortes (04/11/2026, Claude haiku, modo tradicional)

Os quatro cortes desta branch (orientação pelo board, sub-tarefa de revisão criada pelo board, fechamento
automático da fase e os textos da versão 22), medidos pelo mesmo eval sobre o commit final:

| Rodada                              | Tempo | Execuções | Pedidos ao modelo | Chamadas ao board | Custo (tudo em haiku) |
| ----------------------------------- | ----- | --------- | ----------------- | ----------------- | --------------------- |
| Antes da execução enxuta            | 270 s | 8         | 107               | 79                | US$ 0,11              |
| Execução enxuta                     | 259 s | 8         | 79                | 32                | US$ 0,09              |
| Execução enxuta + cortes do board   | 207 s | 6         | 58                | 19                | US$ 0,078             |
| ... + commit da fase pelo board     | 141 s | 3         | 34                | 8                 | US$ 0,040             |
| CLI direta, com o processo          | 322 s | 1 + subagente | 48 (+19)      | —                 | US$ 0,081             |

O que mudou nas chamadas ao board: `get_board` de 4 para 1, `prepare_workspace` de 4 para 0, `start_work`
de 5 para 0, `move_card` de 8 para 7. A sub-tarefa de revisão nasceu do board ao entrar na Revisão, e a Revisão
fechou sozinha depois do APROVADO (uma execução a menos em cada ponto). Na primeira medição a Implementação ainda teve o fechamento pela IA (8 pedidos), porque as sub-tarefas não fazem commit, por desenho do ciclo, e a pasta chegava ao fim da fase com alterações. O último corte resolveu isso: o board faz o commit da fase (mensagem com a história, as sub-tarefas e os trailers de rastreio) e move a história. Na medição final a história passou por três execuções da IA (Plan, uma sub-tarefa de implementação e a revisão independente): os dois fechamentos foram do board, a revisão nasceu do board, e das 8 chamadas ao board 3 foram `move_card`, 2 `get_board` (no Plan, para os agentes), 1 `get_card`, 1 `create_card` e 1 `add_attachment`. Pelo board a história agora custa metade da CLI direta com o mesmo processo (US$ 0,040 contra 0,081), em
menos da metade do tempo (141 s contra 322 s), e um terço do custo de antes da execução enxuta (US$ 0,11).

Agente por coluna: já existia (`Column.execProfile`, resolvido card → coluna → história → coluna da história →
padrão do board; a tela é a de Workflows e colunas); o agente carrega ferramentas, MCPs, skills e modelo. A
revisão criada pelo board usa o `revisor-de-codigo` pelo nome, o mesmo critério do regime de rodadas.

## Alternativas descartadas

- **Um processo vivo por história**, para o cache ficar quente entre turnos: nenhuma das CLIs oferece
  isso fora do modo interativo, e o board perderia o controle de cada turno.
- **Principal com contexto podado por fase** (checkpoint curto no lugar do histórico): reproduz o que o
  board já faz com o card e a conversa, a preço de modelo e com mais código.
- **Manter o piloto desligado atrás da flag** (`FAZAI_INTERNAL_STORY_SESSIONS`): 7,4 mil linhas em
  99 arquivos sem uso, nos módulos que o CLAUDE.md pede para revisar com mais rigor (runner, MCP,
  banco).

## Consequências

- A branch `feature/board-story-sessions` e o PR #488 ficam como registro; o código não entra na
  `develop`. A execução enxuta foi rebaseada sobre a `develop` sem a sessão.
- O que sobra para cortar no modo tradicional, pela rodada medida: execuções que só passam o bastão
  (a história fecha a Implementação, entra na Revisão, cria a sub-tarefa de revisão e fecha a Revisão
  em quatro execuções), e chamadas cuja resposta o board já sabe (`get_board` para achar a próxima
  coluna, `prepare_workspace` repetido, `start_work`). O agente por coluna já existe
  (`Column.execProfile`: card → coluna → história → coluna da história → padrão do board), e o
  agente carrega ferramentas, MCPs, skills e modelo; o que falta é o board padrão trazer essa
  configuração por fase e o Harness mostrá-la por coluna.
