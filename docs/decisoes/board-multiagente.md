# Board multiagente: qualquer modelo de qualquer agente conectado

> Decidido em 2026-10-24, sobre [Conectar agentes](conectar-agentes.md) (PR #386). O pedido: o board usa
> qualquer modelo de qualquer agente com a conexão feita e ligado, sem a pessoa ficar trocando o agente em uso.

## Contexto

O `board.aiTool` é um perfil só: o "agente em uso". A execução de um card já não depende dele quando há um
modelo escolhido: `resolveRunTarget` (`src/shared/runTarget.ts`) segue card → agente do harness → regra de
sugestão → perfil padrão, e o prefixo do valor (`<perfil>:<modelo>@<esforço>`) escolhe o perfil ligado que
executa (`cliOfValue`). O runner, o chat, o heartbeat e o autopiloto já resolvem o alvo por card; as vagas de
execução são por tipo de atividade, não por agente, e o runner guarda uma execução por card, então dois cards
em agentes diferentes já rodam lado a lado. O campo Modelo do card (`modelGroups`) e o editor de regras já
listam os modelos de todos os perfis ligados, e o Diagnóstico confere a CLI e o login de cada perfil ligado.

O que ainda supunha um agente só, achado na revisão:

| Onde | O que fazia | Efeito |
| --- | --- | --- |
| `aiRunUnsupported` (`messageRouter.snapshot`) | o motivo de o **padrão** não rodar (personalizado de CLI, permissão sem argumento, root) | desligava o Trabalhar na fase, o Refinar e o heartbeat de **todos** os cards, mesmo os que escolheram um modelo de outro agente; e não desligava o card cujo agente é que não roda |
| heartbeat e autopiloto | pulavam o card cujo perfil está sem CLI ou sem login, mas não o cujo perfil não roda | a rodada gastava a vez numa execução que o gateway recusa |
| `resolveModelInput` (MCP `update_card`, `create_card`, `set_model_rules`) | o modelo livre só era aceito no personalizado **padrão** | um modelo livre de outro agente personalizado ligado era recusado pela IA |
| `get_models` | o catálogo trazia os modelos de todas as ferramentas, sem dizer quais o board consegue rodar agora | a IA escolhia um modelo de um agente desligado e o card ficava bloqueado |
| `executionContextOf` (aba Contexto do card) e o chat (`clean`) | o contexto imposto era o do padrão | o card ou o chat noutro agente mostrava e pedia o isolamento errado |
| Conectar agentes | "Agente em uso", "Só um agente fica em uso de cada vez", "Usar nos cards" | dizia o contrário do que o board faz: parecia preciso trocar de agente para usar outro |
| `nextRun.blockedInUse` do Diagnóstico | os perfis em uso eram o padrão, os das regras e os dos agentes | o perfil de um card com modelo escolhido, sem login, não aparecia como bloqueando a próxima execução |

## Decisão

- **O padrão é só o que roda o card sem modelo.** `board.aiTool` continua (o formato do banco não muda), com o
  nome "agente padrão" na tela. Todo agente ligado roda cards pelo campo Modelo, pelo agente do harness ou por
  uma regra, ao mesmo tempo que os outros.
- **O motivo de não rodar é por perfil.** O snapshot ganha `aiRunUnsupportedBy` (perfil → motivo, só dos
  ligados). O card consulta o motivo do perfil que o executaria (`aiBlockedReason`); o `aiRunUnsupported`
  global passa a dizer só que **nenhum** perfil ligado roda (aí o heartbeat para). O heartbeat e o autopiloto
  pulam o card cujo perfil não roda (`cardRunUnsupported`), como já pulavam o sem CLI ou sem login.
- **Modelo livre de qualquer personalizado ligado.** `resolveModelInput` recebe os perfis ligados e aceita o
  modelo livre do personalizado do prefixo, seja ele o padrão ou não.
- **`get_models` diz quem roda cada modelo.** Cada item do catálogo traz `runsWith` (o perfil ligado que
  executa aquele valor, o mesmo de `cliOfValue`) ou `null`, e a nota explica que só os de `runsWith` servem
  para um card. Os perfis trazem `ready` (ligado e sem motivo para não rodar).
- **O contexto imposto é o do alvo.** A aba Contexto do card e o chat usam o perfil que executa, não o padrão.
- **Conectar agentes fala de padrão.** O cartão do topo vira "Agente padrão", com a linha dos outros agentes
  ligados que também rodam cards; o selo "Em uso" vira "Padrão"; "Usar nos cards" vira "Tornar padrão".
- **O Diagnóstico conta os perfis dos cards na fila** (`profilesInUse` do alvo) entre os que bloqueiam a
  próxima execução.

## Alternativas descartadas

- **Tirar o `board.aiTool`**: o card sem modelo, o chat sem modelo, o resumo e a delivery precisam de um alvo;
  sem padrão, cada um teria de inventar o seu, e o banco mudaria de formato para nada.
- **Uma vaga de execução por agente**: os limites de hoje são por tipo de atividade porque protegem a pasta e
  as branches, não a conta; o limite de uso de cada agente já pausa só o perfil dele (`pauseOf`).
- **Listar no campo Modelo os perfis desligados, marcados**: a escolha viraria um bloqueio na hora de rodar;
  o lugar de ligar um agente é Conectar agentes.

## Consequências

- Nenhuma migração e nenhuma versão do board padrão: o que muda é a leitura do estado e o texto.
- O texto que a IA lê muda junto: a descrição e a nota do `get_models` e o `runsWith`, com teste.
- Um cenário em `test/scenarios/` roda dois cards em agentes diferentes com o padrão sem rodar.

## Para o release (bloqueia)

1. Motivo de não rodar por perfil (card, heartbeat, autopiloto).
2. Modelo livre dos personalizados não padrão no MCP.
3. `get_models` com `runsWith` e `ready`.
4. Contexto imposto do alvo (aba Contexto e chat).
5. O texto de Conectar agentes e da documentação.
6. O CHANGELOG: a seção "Não lançado" está acima de uma "0.47.0" que nunca saiu (não há tag `v0.47.0`), e o
   `scripts/releaseCheck.mjs` exige que a primeira seção seja a versão do release. Antes do release, juntar
   as duas em "0.47.0" ou subir o `package.json` para 0.48.0 (decisão da pessoa).

## Depois do release (melhoria)

- "Sugerir regras" com os modelos de mais de um agente (hoje vem do padrão; dá para editar cada regra à mão).
- O motivo da rodada parada (`heartbeatIdleReason`) dizer todos os perfis com problema, não o primeiro.
- `harnessStatus` e `cliLoadsOf` (sem card) por perfil ligado, não só do padrão.
- As pendências de [Conectar agentes](conectar-agentes.md): o transporte de execução no SDK oficial, os agentes
  do registro nos cards e o Claude pelo ACP com cobrança de API.
