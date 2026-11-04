# Sessão da História e filhas por conector

Registro de 03/11/2026, na branch `feature/board-story-sessions` (PR #488). Consolida a investigação
de 02/11 (`teste_modos/`, sondas por CLI e ACP em Claude, Cursor, Codex, Kimi e Antigravity), as
sondas ao vivo de 03/11 (Claude 2.1.316 e Kimi 2.4.1) e o que o board passou a fazer com cada um.

## Contexto

Uma história resolvida direto na CLI termina mais rápido e gasta menos tokens do que pelo board,
porque cada card abre uma execução nova com o contexto inteiro. O desenho novo é: a história é a
sessão principal, persistente entre fases; cada sub-tarefa é uma filha efêmera dessa sessão, com
escopo fechado (regras, skills, MCPs, ferramentas e modelo definidos no card antes de rodar); as
perguntas à pessoa ficam na principal; o board continua dono do fluxo (elegibilidade, reservas,
aprovações, conferência do resultado).

Os três requisitos de governança: definir o escopo de cada filha antes de ela rodar; poder editar o
card da sub-tarefa (acrescentar a skill que faltou) antes do "play"; e não carregar o histórico da
principal na filha.

## Decisão

O board sustenta a sessão da História em três conectores, cada um pelo mecanismo nativo que ele tem,
e mantém os demais no modo tradicional (uma execução por card):

| Conector          | Principal                                          | Filha                                                                                                    | Escopo imposto pela ferramenta             | Prova de modelo / observação                                                | Estado        |
| ----------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------- | ------------- |
| Claude Code (CLI) | agente da sessão (`--agent`), retoma por `--resume` | subagente no `--agents` da mesma chamada: `tools`, `disallowedTools`, `mcpServers`, `model`, `effort`    | ferramentas, MCP, modelo, quem lança quem  | `resolvedModel` no resultado da chamada; `parent_tool_use_id` nas mensagens | implementado  |
| Kimi Code (CLI)   | `--agent-file` na criação, `--session` na retomada | agente em `.kimi-code/agents/<nome>.md` do projeto, só durante a execução: `tools`, `disallowedTools`     | ferramentas, MCP (por glob), skill         | `actual_subagent_type` e `status` no resultado; modelo é o da sessão        | implementado  |
| Codex (ACP)       | sessão ACP carregada a cada turno (`session/load`) | sessão filha nativa do adaptador (capability AIR), herda MCPs e política da principal                     | nenhum por filha (fronteira é a sessão)    | `session/load` da filha devolve modelo e esforço                            | piloto (R2)   |
| Antigravity (ACP) | —                                                  | `invoke_subagent`, assíncrona; morre quando o processo ACP termina                                       | ferramentas e MCP sim; skill não            | `conversation://` no texto; sem evento de fim                               | tradicional   |
| Cursor (CLI/ACP)  | —                                                  | subagente herda todas as ferramentas e MCPs do pai; o arquivo só aceita `readonly` e `model`             | nenhum por filha                           | `cursor/task` no ACP                                                        | tradicional   |

Em todos, a filha recebe só o que o card dela define (instruções do agente, skills e regras pelo
caminho do arquivo, servidores MCP, ferramentas, modelo) mais o pedido da unidade; nunca o histórico
da principal. A principal recebe só a ordem de delegar e as mensagens humanas novas desde o último
turno confirmado.

## Por que assim

- **Claude Code** é o único em que tudo é imposto por parâmetro e verificável na saída: a sonda de
  03/11 mostrou a allowlist `Agent(filha)` recusando `Explore`, o `resolvedModel` da filha e a
  retomada por id de qualquer pasta. O arquivo de `--agents` resolve o limite da linha de comando.
- **Kimi Code** impõe ferramentas e MCP por filha, mas a retomada não aceita arquivo de agente: a
  allowlist `subagents` da principal fica aberta (`*`) e o board confere o nome da filha no resultado.
  A filha herda o modelo, então o board recusa antes de delegar a sub-tarefa que pede outro. A CLI não
  diz na largada se os servidores conectaram; a prontidão vale pelo arquivo que o próprio board grava
  (`.kimi-code/mcp.json`) com a pasta confiada por variável. Essa evidência é mais fraca que a do
  Claude e fica registrada como tal no canal da execução.
- **Codex** delega e observa bem (eventos de início e fim com id de thread), mas não tem cerca por
  filha: tudo o que está na sessão é de todas. O board monta a sessão com a união dos MCPs das
  sub-tarefas e confere a lista antes de delegar; o escopo positivo (o que usar) vai por prompt. A
  prova real pelo board (R2) ficou pendente: a filha não despachou dentro do tempo da sonda.
- **Antigravity** não cabe no desenho de um processo por turno: a filha é assíncrona e o próprio
  agente relatou, ao ser recarregado, que "o reinício do servidor encerrou todos os subagentes". Além
  disso a skill não é fronteira (a filha lê o arquivo). Exigiria manter o processo ACP vivo entre
  turnos, o que o board não faz.
- **Cursor** não tem escopo por subagente na documentação oficial (herda tudo, inclusive MCP). O que o
  board já impõe pelo hook global continua valendo no modo tradicional.

## Alternativas descartadas

- Uma sessão viva por história (processo aberto entre aprovações): resolveria Antigravity e simplificaria
  Codex, mas cria um escritor vivo durante a espera humana e muda o modelo de recuperação do board.
- Materializar TOML de agente por sub-tarefa no Codex (`developer_instructions`): dá escopo positivo
  mais forte, mas depende de confirmar que o adaptador relê `.codex/agents` em `session/load`; fica
  para depois da prova R2.
- Modo API para controle total: continua a opção de referência (o board é o laço), mas só existe driver
  para o Gemini; um driver Anthropic/OpenAI é trabalho próprio.

## Rodada real pelo board (04/11/2026)

Registro completo em `teste_modos/resultados/r5-kimi-board-ab-2026-11-04.md`. Em resumo: o desenho funcionou
de ponta a ponta pelo board com o Kimi e com o Claude (uma sessão principal por três fases, filhas com o
escopo do card, nome e modelo conferidos, recuperação quando uma filha não confirmou). A economia prevista
não apareceu em nenhum dos dois: com um processo por turno, a principal relê o histórico inteiro a cada
turno, e esse custo cresce com a história (no Kimi sem cache entre processos; no Claude com cache, mas
regravado a cada processo). No Claude, o trabalho em `haiku` custou US$ 0,11 no modo tradicional contra
US$ 0,86 na sessão da História, para a mesma história. A promoção a padrão fica condicionada a um processo
vivo por história ou a uma principal com contexto podado por fase.

## Consequências e riscos

- Latência: no Claude e no Kimi cada turno é um processo novo com retomada; a filha roda dentro desse
  processo. O ganho vem de não reenviar o contexto do board a cada card, não da filha em si.
- Processos: uma filha em segundo plano no Claude estende a vida do processo (`-p` espera o trabalho);
  no Kimi o arquivo da filha nasce e morre com a tentativa e nunca sobrescreve um existente.
- Consistência: a intenção é persistida antes do despacho; eventos de filha incompatíveis levam a
  sessão a reconciliação e o card volta para a pessoa; uma filha concluída sem prova de modelo não é
  aceita.
- Medição: o Claude informa o total da sessão com a filha incluída; o Kimi lê os tokens do registro da
  sessão; o Codex não separa o consumo da filha.
- Fica pendente: a rodada real completa pelo board (três histórias, comparação de custo e tempo) antes
  de promover o modo a padrão.
