# Contexto mínimo: piloto de consumo e qualidade (E7.2, #997)

> **Histórico.** O Plano de contexto e o runtime v1 foram aposentados (#1144–#1147; migração 51 remove as tabelas `agent_context_contracts` e `activity_context_selections`). Este documento registra o que existiu e não descreve o produto atual.

**Estado: medido em 31/10/2026 (#1234), uma execução por tarefa e braço.** Com o runtime v1 aposentado (#1146), o piloto comparou o Harness atual (braço A) com o revisado pela #1003 (braço B, `docs/contexto-minimo-revisao-do-harness.md`), pelo runner de avaliação (`npm run eval -- --arm A|B`) e o conjunto de referência de `evals/stories`. O resultado está em [Resultado](#resultado-31102026) e os placares, em `evals/scoreboard/`.

## Linha de base (antes de qualquer revisão)

`get_metrics`, log desde 04/10/2026: **1.102 execuções, 83h56min, ~1,57 bilhão de tokens** (média de ~1,4 milhão de tokens por execução; a maior parte é leitura de cache). Parte das execuções não tem consumo medido (Cursor), então o total é parcial. Esses números misturam tipos de tarefa e modelos; servem só para dimensionar, não para comparar.

## Indicador principal

**Consumo total por tarefa aceita**: soma de tokens de entrada, cache e saída de todas as execuções da tarefa (incluindo tentativas, correções da revisão e retrabalho) até a aceitação. Uma tarefa não aceita não entra no denominador e é contada à parte.

## Indicadores de apoio

Ferramentas chamadas, tentativas, duração, correções pedidas na Revisão/Homologação e intervenções da pessoa (mensagens na conversa do card que mudam o rumo). A aba **Consumo** do card e `get_metrics` (por card e por fase) já trazem tokens, duração e tentativas; as correções e intervenções saem da conversa do card.

## Amostra

Quatro tarefas de esforço semelhante e modelo igual, uma por assunto, mais uma história que atravesse várias fases:

1. UI (webview): tela ou componente novo.
2. Backend (host/shared): regra ou repositório novo, com migração se couber.
3. MCP/fluxo: mudança de ferramenta ou texto que a IA lê.
4. Documentação: CHANGELOG e README pt/en.
5. História completa Discovery → Homologação.

Cada tarefa roda **duas vezes** em branches descartáveis a partir do mesmo commit: A com a configuração atual, B com a revisada. Mesma descrição, mesmo modelo e esforço. Rodar A e B alternando a ordem entre as tarefas, para não atribuir ao cache da primeira o que é da segunda.

## Critérios de decisão

- B é aceita se o consumo por tarefa aceita cai **e** nenhum indicador de qualidade piora (mesmas correções ou menos, mesma taxa de aceitação, sem intervenção a mais).
- Se B reduz tokens mas piora a qualidade em qualquer assunto, a escolha daquele agente ou skill volta ao que era (por exemplo, devolver uma skill `react-*` ao conjunto essencial).
- Amostra pequena não prova: com 1 execução por braço, trate a diferença como indício e repita antes de mudar o padrão do board.

## Como registrar o resultado

Preencher a tabela abaixo (uma linha por tarefa e braço) e a decisão por assunto; manter ou corrigir as escolhas da biblioteca conforme a evidência.

| Tarefa | Braço | Tokens (entrada/cache/saída) | Ferramentas | Tentativas | Duração | Correções | Intervenções | Aceita |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| UI (`ui`) | A | 56 / 1.771.386 / 9.512 (total 1.780.954) | 38 | 5 | 101 s | 0 | 0 | sim |
| UI (`ui`) | B | 78 / 1.963.745 / 12.367 (total 1.976.190) | 53 | 7 | 133 s | 0 | 0 | sim |
| Backend (`backend`) | A | 54 / 1.710.641 / 9.997 (total 1.720.692) | 38 | 5 | 103 s | 0 | 0 | sim |
| Backend (`backend`) | B | 62 / 1.548.230 / 13.327 (total 1.561.619) | 49 | 5 | 121 s | 0 | 0 | sim |
| MCP/fluxo (`mcp`) | A | 84 / 2.669.418 / 14.354 (total 2.683.856) | 59 | 7 | 203 s | 0 | 0 | sim |
| MCP/fluxo (`mcp`) | B | 56 / 1.317.037 / 10.227 (total 1.327.320) | 35 | 5 | 103 s | 0 | 0 | sim |
| Documentação (`docs`) | A | 42 / 1.305.384 / 7.001 (total 1.312.427) | 32 | 3 | 110 s | 0 | 0 | sim |
| Documentação (`docs`) | B | 48 / 1.143.973 / 8.963 (total 1.152.984) | 42 | 5 | 90 s | 0 | 0 | sim |
| História completa (`fluxo-completo`) | A | 114 / 3.764.958 / 21.959 (total 3.787.031) | 85 | 9 | 222 s | 0 | 0 | sim |
| História completa (`fluxo-completo`) | B | 104 / 2.587.931 / 20.569 (total 2.608.604) | 77 | 10 | 197 s | 0 | 0 | sim |

## Resultado (31/10/2026)

**Como foi medido.** `claude:sonnet@medium`, uma execução por tarefa e braço, cada uma num board temporário a partir do mesmo repositório de referência, no modo autônomo e sem a pessoa (por isso "Intervenções" é 0). A ordem dos braços foi invertida nas tarefas pares: ui e docs rodaram B antes de A. Os placares estão em `evals/scoreboard/`, um arquivo por tarefa e braço.

**Como ler a tabela.**

- **Tokens:** "cache" soma leitura e criação de cache.
- **Tentativas:** são as execuções da IA no board (história e sub-tarefas).
- **Ferramentas:** são as chamadas contadas no log da execução.
- **Correções:** são os pedidos de correção na Revisão (`reviewFixes`). Não houve nenhum, e todas as tarefas foram aceitas pelo aceite da história.
- **Revisor:** em cada tarefa, uma ou duas execuções (a do revisor independente) rodaram em `opus@high`, igualmente nos dois braços.

**Consumo por tarefa aceita (B em relação a A).**

| Assunto | Tokens | Custo (US$) | Falhas de teste nas execuções (A → B) |
| --- | --- | --- | --- |
| UI | **+11,0%** | 0,77 → 0,97 (+26%) | 0 → 0 |
| Backend | −9,2% | 0,97 → 1,36 (+41%) | 0 → 0 |
| MCP/fluxo | −50,5% | 1,09 → 0,68 (−37%) | 1 → 2 |
| Documentação | −12,1% | 0,43 → 0,81 (+88%) | 0 → 0 |
| História completa | −31,1% | 1,59 → 1,44 (−10%) | 1 → 0 |
| **Total** | **−23,6%** (11,28 mi → 8,63 mi) | 4,84 → 5,26 (+9%) | 2 → 2 |

**Decisão por assunto** (pelos critérios acima; com 1 execução por braço, tudo é indício e deve ser repetido antes de mudar o padrão do board).

- **UI: fica A.** B gastou mais tokens, ferramentas e tentativas para o mesmo resultado, então não passa no critério. Em B, o `frontend-web` tem só `texto-de-interface-i18n` e `react-component-contracts`. A indicação é devolver as skills `react-*` ao conjunto essencial do agente e repetir a medição da UI.
- **Backend: B, como indício.** Menos tokens, com a mesma qualidade (aceita, sem correções e sem falhas). Mantém a escolha da #1003.
- **MCP/fluxo: B, como indício.** É a maior redução (metade dos tokens, menos ferramentas e tentativas), com a mesma qualidade pelos critérios. As falhas de teste nas execuções passaram de 1 para 2; elas não estão nos critérios de qualidade, mas merecem atenção na repetição.
- **Documentação: B, como indício.** Menos tokens, com a mesma qualidade. B fez 5 tentativas contra 3 de A.
- **História completa: B, como indício.** Menos tokens e menos falhas de teste, com a mesma qualidade.

**Ressalvas.**

- **Tokens e custo divergem.** O indicador principal caiu 23,6%, mas o custo subiu 9%. B troca leitura de cache, barata, por criação de cache, mais cara (por exemplo, no backend a criação foi de 151.802 para 218.356). Vale decidir se o indicador do piloto continua sendo tokens ou passa a ser custo.
- **Ambiente da medição.** Os oito primeiros placares foram gravados com a árvore suja: na hora, só os placares inválidos tinham sido apagados. Os dois da UI rodaram com a correção do fechamento do board ainda sem commit; ela entrou logo depois, em `46bf9bc2`. Nada disso muda o código que a IA executa.
