# Contexto mínimo: piloto de consumo e qualidade (E7.2, #997)

**Estado: protocolo e linha de base prontos; a medição ainda não foi feita.** Medir exige executar tarefas reais com as duas configurações (a atual e a revisada em #1003, `docs/contexto-minimo-revisao-do-harness.md`), e isso depende de duas decisões da pessoa que o modo autônomo não toma: aprovar as propostas do #1003 e ligar o runtime v1 (`FAZ_AI_CONTEXT_RUNTIME=v1`) numa máquina com os recibos de capacidade válidos (os do comando `fazai.verifyExecutor`, que saiu na história 13 da épica "ferramenta por modo"; hoje gravados pelo Conectar ou pelo "Verificar capacidades" de Ferramentas de IA). Não há resultado a registrar; reduzir tokens sem a prova de qualidade não encerra o piloto.

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
| _a medir_ | | | | | | | | |
