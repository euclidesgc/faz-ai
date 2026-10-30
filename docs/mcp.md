# Faz AI Kanban: conexão com IA (MCP) em detalhe

O board pode ser consultado e editado por uma IA (Claude Code, Cursor ou qualquer cliente
MCP). A extensão roda um servidor MCP local para a pasta aberta; tudo o que a IA faz aparece no
board na hora, e as regras do board valem para ela também.

## Como conectar

Em Configurações → **Harness de IA** → **Projeto**, no grupo **Servidores MCP**, clique em **Instalar (padrão da ferramenta)** (ou rode **Faz AI: Instalar o MCP do
board (global)** na paleta). O board registra o servidor na configuração global da ferramenta, que
vale em qualquer projeto aberto com o board, sem arquivo nenhum no repositório:

| Ferramenta | Onde o servidor é registrado (global) | Como o servidor acha o projeto | Depois de registrar |
| --- | --- | --- | --- |
| Claude Code | `~/.claude.json`, por `claude mcp add-json --scope user` | variável `CLAUDE_PROJECT_DIR`, que o Claude Code passa ao servidor | Abra uma sessão nova (`/mcp` mostra o estado) |
| Cursor (chat do editor e `cursor-agent`) | **no projeto**, `.cursor/mcp.json` (fora do git), gravado sozinho ao abrir a pasta no Cursor | a pasta fixa no registro | Na primeira vez: recarregue a janela e ligue o `faz-ai` em Cursor Settings → MCP |
| Kimi Code | `~/.kimi-code/mcp.json`, gravado pelo board (é um JSON só de servidores, seguro de escrever) | o diretório em que a CLI inicia o servidor (a pasta da sessão) | Abra uma sessão nova (`/mcp` mostra o estado) |

O board registra o servidor só no global da ferramenta (a exceção é o Cursor, acima). Ao atualizar a
extensão, o registro global é refeito nas ferramentas em que já estava; falha vai para Saída → Faz AI
e a faixa de requisitos continua avisando. Um registro de projeto antigo (`.mcp.json`,
`.kimi-code/mcp.json`) não é migrado e vale no lugar do global naquele projeto, então um registro
quebrado ali (de outra pasta, de um node que sumiu) estraga o global. A faixa de requisitos mostra
**Corrigir o registro**, que tira o registro do arquivo do projeto e refaz o global.

### Registro manual

O servidor é sempre o mesmo comando:

```sh
node "$HOME/.faz-ai/mcp/bridge.js" "<pasta do projeto>"
```

- A ponte (`bridge.js`) fica em `~/.faz-ai/mcp/` (no Windows, `%USERPROFILE%\.faz-ai\mcp\`). A
  extensão a atualiza ao abrir uma pasta, no VS Code e no Cursor, e o `faz-ai` ao rodar.
- `<pasta do projeto>` é opcional. Sem ela, vale a variável `FAZAI_WORKSPACE`, depois
  `CLAUDE_PROJECT_DIR` e, por fim, o diretório em que o cliente foi iniciado (subindo pelas pastas
  pais até achar um board ativo). Um argumento com uma variável que a ferramenta não trocou
  (`${workspaceFolder}`) conta como ausente.

Pelas CLIs:

```sh
BRIDGE="$HOME/.faz-ai/mcp/bridge.js"

claude mcp add --scope user faz-ai -- node "$BRIDGE"        # Claude Code, todos os projetos
```

No Cursor, o registro é sempre o do projeto: o global dele é um processo só para todas as janelas,
que sobe sem saber qual projeto atender (o `${workspaceFolder}` só é trocado quando a pessoa liga o
servidor à mão, e aí vale para todas as janelas). Os formatos gravados pelo board:

```json
// .cursor/mcp.json do projeto (Cursor)
{ "mcpServers": { "faz-ai": { "type": "stdio", "command": "node", "args": ["<bridge.js>", "<pasta do projeto>"] } } }

// .kimi-code/mcp.json do projeto (Kimi Code; a CLI documenta a entrada stdio sem o campo "type")
{ "mcpServers": { "faz-ai": { "command": "node", "args": ["<bridge.js>", "<pasta do projeto>"] } } }
```

Outros clientes MCP com transporte stdio (Gemini CLI em `~/.gemini/settings.json`, por exemplo)
funcionam com o mesmo comando.

## Se as ferramentas não aparecem

1. O VSCode precisa estar aberto na pasta do projeto, com a extensão ativa, ou o comando `faz-ai`
   rodando nela (o board fora do editor). O servidor existe
   enquanto houver um socket em `~/.faz-ai/` (um arquivo `.sock` por pasta aberta).
2. Teste o servidor fora do cliente; a resposta deve conter `"name":"faz-ai"`:

   ```sh
   cd <pasta do projeto>
   echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"teste","version":"1"}}}' | node "$HOME/.faz-ai/mcp/bridge.js"
   ```

   Se vier "O board do Faz AI não está acessível", a extensão não está ativa para essa pasta.
3. Se o teste passa e o cliente não mostra as ferramentas, o servidor não está registrado na
   configuração que esse cliente lê, ou a sessão não foi reiniciada depois do registro.
4. Se o cliente inicia servidores a partir de outro diretório, passe a pasta do projeto como
   segundo argumento ou em `FAZAI_WORKSPACE`.
5. No Cursor, o servidor do projeto só é lido ao abrir a janela, e chega desligado: recarregue a
   janela e ligue o `faz-ai` em Cursor Settings → MCP. A CLI (`cursor-agent mcp enable faz-ai`) tem
   aprovação própria, que não liga o servidor no editor.

## O que a IA pode fazer

A IA pode fazer tudo o que a interface faz: listar e ler cards (`get_board`, `list_cards`,
`get_card`), criar histórias e sub-tarefas, editar, mover, arquivar, mandar para a lixeira e apagar
de vez, mexer em checklist, na conversa do card e em anexos (inclusive ler anexos de texto), e configurar
colunas, tipos, campos e regras. Cards são referidos pelo número (`#12`) e colunas, tipos e campos
pelo nome. Mensagens da IA na conversa saem assinadas com o nome do cliente (ex.: "Claude Code").

`ask_questions` envia perguntas com opções para um carrossel no card. Antes, a IA detalha na descrição
o motivo da opção indicada e as consequências das alternativas. Fora do modo autônomo, o card passa
para `waiting_answer`; as respostas entram na seção "Perguntas e respostas" da descrição. No modo
autônomo, o board registra a opção indicada para cada pergunta e a IA continua. `get_card` inclui
`pendingQuestions` (pergunta, opções e indicada, sem IDs) somente enquanto houver perguntas pendentes.

`ask_question` continua para a pergunta aberta, sem opções. `request_review` com `pending` fica para o que não é pergunta com opções (dado, acesso, ponto em aberto). Os modelos de documento das fases não têm mais a seção "Perguntas para você".

Parâmetros de `ask_questions`: `card` e `questions`, uma lista de `{ question, options, recommended }`.
`options` tem pelo menos duas opções, sem repetição, e `recommended` é o texto exato de uma delas. A
chamada é recusada, sem gravar nada, com pergunta vazia, menos de duas opções, opções repetidas,
indicada fora das opções, a mesma pergunta duas vezes na rodada ou lista vazia. Uma nova chamada
substitui as perguntas ainda pendentes. A pergunta com o mesmo texto de uma já respondida substitui
a resposta dela. O retorno traz `next`: fora do modo autônomo, manda parar até as respostas chegarem
(o card volta para `ready`); no modo autônomo, avisa que cada pergunta foi respondida com a indicada
e que a descrição deve ser relida com `get_card` antes de ser reescrita.

Os campos do board (Fase, Tags, Modelo, Skills, Rules, MCPs e Esforço da atividade) vêm com
`board: true` em `get_board.fields`: as regras, a triagem e a IA dependem deles. `delete_field` e a
troca de nome em `update_field` são recusadas neles, assim como opções e tipos de card (as opções de
Tags são da pessoa e mudam); a exibição muda em todos. `create_field` recusa o nome de um deles.
O valor da Fase de uma sub-tarefa é gravado pela IA (`create_card` ou `update_card` com
`fields.Fase`); a pessoa não o muda no card, e `update_card_type` recusa a Fase em `default_fields`.

Também pelo MCP: uso, tokens e tempo do log (`get_metrics`, com `group_by` por fase, modelo, ferramenta,
modo da ferramenta (`mode`: `cli`, `acp` ou `api`), agente, skill, ferramenta usada, ferramenta MCP, `bash_command` (o comando-base de cada chamada de
Bash, sem argumentos, só do Claude Code) ou `failure_class` (a classe da falha: `transient`, `deterministic`, `budget` ou `canceled`; "sem classe" quando a execução terminou bem); com `rework: true`, o retrabalho do período: revisões, aprovações
de primeira, pedidos de ajuste (por fase, modelo e agente), execuções sem resultado (aproximação), tokens por história concluída por tipo e esforço e a visão tipo × modelo e tipo × agente, histórias concluídas com bug e os sinais da IA — correções na Revisão,
`npm test` com falha e commits depois do PR — cada um com a parte do modo autônomo, "não medidos" sem
registro de Bash). Com `group_by` `tool`, cada linha traz também a conferência das execuções: quantas
ficaram conferidas sem desvio, quantas tiveram desvio e quantas ficaram não conferidas (execuções anteriores
à conferência contam como não conferidas). Com a regra `showCost` ligada (padrão; `update_rules`), `get_metrics` traz a coluna `custo` e a linha do estimado pelo preço do catálogo. Também pelo MCP: catálogo e regras de modelos (`get_models`, `detect_models`, `upsert_model`,
`set_model_rules`; o preço por milhão de tokens de cada modelo (`pricing` em `get_models`) se grava com `price_input`, `price_output`, `price_cache_read` e `price_cache_write` em `upsert_model` (número >= 0 grava, `null` limpa o bucket, ausente mantém) e vale da próxima execução em diante), padrões por tipo de card (`update_card_type`) e o
harness inteiro (`get_harness`, `read_rule_file`, `write_rule_file`, `create_skill`, `update_skill`,
`delete_skill`…).

`get_models.profiles` lista os perfis de CLI e seus IDs, sem comando, configuração ou ambiente
privado. O prefixo do `value` escolhe o perfil de CLI que executa o card; sem modelo no card, no agente
nem na regra, vale o perfil padrão. `set_ai_tool` define esse **perfil padrão**: recebe o ID de um perfil
ligado e não cria, edita, revisa nem ativa perfis. Todo perfil ligado roda cards ao mesmo tempo: cada item
de `get_models.catalog` traz `runsWith`, o perfil ligado que executa aquele valor (o mesmo que o runner
escolhe), ou `null` quando nenhum ligado o roda; cada perfil traz `ready` (ligado, com a CLI e o login em
dia e sem motivo para o board não rodar). O modelo livre (`<perfil>:<modelo>`) vale em qualquer perfil
personalizado ligado, não só no padrão, em `create_card`, `update_card`, `update_card_type` e
`set_model_rules`.
Uma cópia usa o catálogo da origem. Para um perfil personalizado, os modelos podem ser cadastrados
à mão; num perfil ACP, `detect_models` abre uma sessão com o agente e lê os modelos que ele anuncia
(sem pedido, sem gastar a conta). O campo Modelo lista cada perfil personalizado ligado como um grupo
e aceita, nele, “Outro modelo…” sem cadastro. O valor é
`<perfil>:<modelo>@<esforço>` (sem `@<esforço>` quando não houver esforço). O perfil personalizado
retorna saída em texto e consumo/custo desconhecidos, nunca zero presumido. Testar o perfil na
interface usa a assinatura e uma resposta OK não comprova isolamento, permissões ou MCP.

O bloco `model` do `get_card` é o alvo que de fato executa o card, resolvido na ordem Modelo do card,
modelo do agente, regra de modelo (mesmo com o preenchimento automático desligado) e perfil padrão:
`{ tool, model, effort, label, value, from, note }`. `tool` é o **perfil de CLI** que executa (não o
agente) e `from` é `'card' | 'agent' | 'rule'`; no perfil padrão sem modelo o bloco não vem. Numa escolha
explícita inválida (perfil desligado, modelo fora do catálogo, esforço inexistente) o bloco traz o valor
escolhido, o `from` e `blocked: { reason, message }` (`profile-unavailable`, `model-unknown` ou
`effort-invalid`), sem cair para o nível seguinte. `execution` (o que o board impõe) segue o perfil que
executa. `get_execution_policies` lê as políticas de execução e troca de alvo (regra vencedora, destinos,
limites e revisão), só leitura e sem segredos; criar, revisar e ativar política é ação da pessoa nas
Configurações → Conectar agentes.

Toda sessão recebe as instruções do servidor: o ciclo do card (por onde começar, status, revisão,
modelo do card, rules e skills obrigatórias e pendências com a pessoa) em menos de 2.048 caracteres,
o tamanho em que o Claude Code corta as instruções de cada servidor e a descrição de cada ferramenta
(documentação de 2026-10-13). O detalhe de cada passo fica onde a IA o lê quando precisa: na
descrição da ferramenta, nas notas do `get_card` (como `subtasksNowNote`, com as rodadas da
Implementação) e nas skills do fluxo. As notas do `get_card` são curtas e só aparecem quando o estado do
card pede; o texto completo fica em skills por assunto (`faz-ai-harness-do-card`,
`faz-ai-workspace-e-pr`, `faz-ai-implementacao-rodadas`, `faz-ai-revisao-e-homologacao` e
`faz-ai-modo-autonomo`), que a nota aponta pelo nome.

O fluxo chega por três caminhos, e nenhum deles depende de instalação: a linha que todo pedido do
board traz (manda ler `faz-ai-fluxo` com `get_skill`), o `flowNote` de `get_card` e de `get_pending_work`
(a mesma indicação) e as skills do fluxo em `requiredSkills`. Esse é o regime: uma orientação à IA,
que a ferramenta segue como as demais instruções. Não há garantia de que a ferramenta leia o fluxo antes
de agir, nem de que não carregue por conta própria uma cópia instalada da skill com o mesmo nome; o
board só controla o que ele mesmo entrega.

### Status e revisão

Cada card em que a IA atua tem um status de trabalho, devolvido em `work` por `get_card` e
`list_cards` (que filtra por `work_status`):

| Status | Com quem | Como chega nele |
| --- | --- | --- |
| `ready` | IA | O card entrou numa coluna em que a IA atua, a pessoa escreveu na conversa (com o card bloqueado, aguardando resposta ou revisão) ou a IA devolveu o card com `release_card` |
| `running` | IA | `start_work` (numa sub-tarefa na primeira coluna do workflow filho, também a move para a coluna seguinte, quando é aberta e não exige aprovação) |
| `verifying` | IA | só o board (portões determinísticos); a IA não o define nem mexe no card enquanto durar |
| `waiting_answer` | Pessoa | `ask_question` ou `ask_questions` |
| `waiting_review` | Pessoa | `request_review` |
| `approved` | IA | A pessoa aprovou e o board não pôde mover o card (não há ferramenta para a IA aprovar; a aprovação normal já leva o card à próxima coluna) |
| `blocked` | Pessoa | `block_card`, ou a pessoa bloqueou |

`release_card` (`card`, `note`) devolve à fila da IA um card que estava com a pessoa, quando ela já
respondeu: a nota entra na conversa do card e o status volta para `ready`. Só vale depois de uma
mensagem da pessoa no card ou na história dele escrita depois de o card passar para ela; sem isso, a
ferramenta recusa. É o que a resposta numa história usa para destravar uma sub-tarefa: o board a
executa de novo.

`set_base_branch` (`card`, `base`) troca a base da história: a branch de onde ela parte e para a qual
o pull request vai (`workspace.prBase` do `get_card`). Serve quando a pessoa pede outra base, como a
`develop` no lugar da principal. A ferramenta só registra a base; a IA traz a branch da história para
ela na pasta de trabalho (sem trabalho feito, recria a branch a partir de `origin/<base>`; com trabalho,
`git merge`, sem rebase nem push forçado). Recusa a história sem branch, um nome inválido e a própria
branch da história.

`move_card` aceita `comment`: a mensagem de conclusão (markdown) entra na conversa do card, assinada
pela IA, depois do movimento aceito; um movimento recusado não grava nada. `create_card` aceita
`profile` (o agente, pelo nome, validado antes de criar) e `checklist` (os itens, na ordem) e devolve o
card resumido, como `move_card` e `start_work`, mais `checklistItems` (com ids) quando criou itens; o
detalhe (`phase`, `execution`, notas) vem pelo `get_card`. `set_card_profile` também devolve o resumo.
A descrição do `create_card` pede, numa sub-tarefa de fase de código, as seções `Objetivo`, `Pronto quando`,
`Pode tocar` e `Não pode tocar` (e `Decisões anteriores`, se houver): o board confere antes de executar. Numa sub-tarefa de correção criada
depois de uma checagem que falhou, o board escolhe o modelo (um nível acima); não o defina, porque a subida
é do board e o campo Modelo que a IA passar só vale se não for mais baixo que o alvo. Numa sub-tarefa de
Revisão (Fase = Revisão), o board escolhe o modelo do revisor (outro agente ou modelo, nunca o barato): não o
defina; o que a IA passar só fica se já for independente da implementação e não for o barato
(ver [Modelo do revisor](configuracoes.md#modelo-do-revisor)).
`add_checklist_item` aceita `text` (um item) ou `items` (vários, na ordem). `move_card` para uma coluna de
conclusão recusa o card com item do checklist em aberto e lista os itens com os ids: a IA marca o que fez
com `update_checklist_item` e apaga o que não se aplica com `delete_checklist_item`.

Nas colunas com `requiresApproval` (em `get_board`), `move_card` só leva o card para a frente quando
o status é `approved`. Voltar de coluna ou cancelar é livre. No modo autônomo, `phase.requiresApproval`
só vem verdadeiro na coluna até onde a pessoa liberou o modo; `request_review`, com ou sem `pending`,
vira aprovação na hora nas outras, e a IA é mandada decidir e seguir. `update_column` liga e desliga
`ai_active` e `requires_approval`.

Bloco final da resposta: ao produzir a fase ou responder na conversa, a IA termina a resposta com um
único objeto JSON, sem texto depois dele (`outcome`: `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT` ou
`BLOCKED`; `summary`; `failure_reason`, obrigatório em `BLOCKED`; `pending`, obrigatório em
`NEEDS_CONTEXT` e `DONE_WITH_CONCERNS`). As ferramentas do board continuam mandando: se a IA chamou
`request_review`, `ask_questions`, `block_card` ou `move_card`, o bloco é só conferido. Ele só age
quando a execução termina com o card ainda em `running` e sem resposta na conversa. Detalhe em
[Fluxo da história com a IA](fluxo.md#bloco-final-da-resposta).

Em coluna com checagens (`checks` em `get_board`), `move_card` para a frente e `request_review` feitos pela IA não entregam o card na hora: o card fica em `verifying`, a resposta traz `gate` (com `id` e `status: "verifying"`) e a IA para, sem mover o card nem continuar o trabalho dele. O board roda as checagens; passando, o movimento ou o pedido de revisão segue; falhando, o card volta para `ready` com o fim da saída na conversa. Enquanto o card está em `verifying`, o `comment` de `move_card` não entra na conversa. Voltar de coluna ou cancelar não passa pelo portão.

### Agentes

Um agente do board é uma cópia guardada no banco do board. `get_harness` lista só o que está no
board, com a marcação em `usage`. `get_agent` lê a cópia do board. `create_agent`,
`update_agent` e `delete_agent` gravam só no board: `scope` é aceito e ignorado, e o agente criado já
nasce disponível. Editar um agente copiado de um arquivo da ferramenta não altera o arquivo original;
`delete_agent` tira o agente do board sem apagar o arquivo; o agente de fábrica não sai (desligue-o com
`set_harness_selection` e `usage: "off"`). Em `get_harness`, cada cópia traz `originState` (`changed`
ou `missing`) e `editedInBoard` quando a última conferência com a origem achou diferença. `create_agent` e
`update_agent` aceitam, além das instruções, `description`, `model` (valor do campo Modelo, ex.:
`claude:sonnet@medium`), `tools`, `deniedTools`, `skills` e `mcp`, e, no Cursor (que não tem lista de
ferramentas, skills nem MCP por subagente), `readonly` e `background` (`readonly: true` e
`is_background: true` no frontmatter); o que é só do board fica no banco. Os arquivos de agente de cada ferramenta ficam numa
pasta própria (a global fica em `~/`); o board só os lê na importação e não grava nessas pastas.
Para apagar os agentes `faz-ai-*` que versões antigas gravaram nelas, remova os arquivos `faz-ai-*.md` de
`~/.claude/agents`, `.claude/agents`, `.cursor/agents` e `.kimi-code/agents` (o board não os apaga sozinho):

| Ferramenta | Pasta | Arquivo | Modelo por agente |
| --- | --- | --- | --- |
| Claude Code | `.claude/agents` | `<nome>.md` (frontmatter YAML) | `model` |
| Cursor | `.cursor/agents` | `<nome>.md` | `model` |
| Kimi Code | `.kimi-code/agents` | `<nome>.md` (frontmatter YAML; aceita os mesmos globs `mcp__*` em `tools`) | — |

### Biblioteca do board

Configurações → Harness de IA concentra regras, skills, subagentes e MCPs numa biblioteca particular,
com importação agrupada por tipo, CRUD e assistentes. `get_harness` inclui `library.artifacts`, com
id, tipo, nome, uso e caminho de cada cópia, sem configurações MCP. Trocar de ferramenta ou apagar
a origem não remove a cópia; `set_harness_selection` altera o modo, sem atualizar da origem.

- `get_project_profile`: perfil detectado do projeto, para sugestões sem executar comandos.
- `get_board_artifact { id }`: conteúdo completo de regra, skill ou agente; recusa MCPs.
- `get_skill { skill }`: `SKILL.md` completo de uma skill do projeto ou de uma skill do fluxo do board: `faz-ai-fluxo` e as `faz-ai-*` por assunto. As do fluxo vêm do próprio board, sem arquivo instalado, e têm prioridade sobre um arquivo de mesmo nome.
- `save_board_artifact { id?, kind, name, description, body, skills?, mcpServers?, categories? }`:
  cria/atualiza apenas na biblioteca. Tipos: `rule`, `skill`, `agent`; regra nova fica desligada.
  Edição exige id e mantém nome, arquivos de apoio e configurações omitidas. Categorias de agente:
  `read`, `edit`, `run`, `net`, `agents`. Configurações e credenciais MCP são gerenciadas pela pessoa.
- `list_board_mcp_tools { server, card? }`: lista ferramentas e schemas de um servidor da biblioteca.
- `call_board_mcp_tool { server, name, arguments, card? }`: encaminha a chamada e devolve seu resultado.

Quando o executor precisa de configuração MCP por arquivo de projeto, o transporte empresta esse arquivo com posse por caminho real e diário anterior à escrita. O launcher só recebe o comando depois do registro de sua identidade. A recuperação não restaura sobre uma execução órfã ainda viva ou de término desconhecido; conflitos da entrada `faz-ai` são preservados. Isso não concede acesso adicional ao MCP nem comprova isolamento de artefatos pela CLI.

Decisões v1 presentes no histórico/export são auditoria, não recibos de capacidade. A evidência local da máquina não tem endpoint de escrita na UI/MCP e não é importada com o board. A prévia de rascunhos continua sem autorizar execução até a integração do verificador real.

A ponte usa o mesmo registro **faz-ai**, independente da ferramenta cliente. MCP desligado ou ausente
é recusado; no modo Pelo card, é obrigatório informar um card que selecione o servidor, diretamente
ou pelo agente. Nas sessões externas, configurações são relidas em cada chamada; conexões são abertas e fechadas por
operação. Suporta stdio, Streamable HTTP e `type: "sse"` explícito, com `env`/`headers` estáticos.
Não conduz OAuth e não encaminha recursos ou prompts MCP. Erros de um servidor não impedem o uso
dos demais. A IA descobre os schemas antes de chamar uma ferramenta.

As definições MCP da biblioteca ficam cifradas no cofre local do host. Leituras, inclusive do editor, devolvem apenas referência, transporte e estado de revisão/disponibilidade. `save_board_artifact` por IA não pode gravar configurações MCP. A pessoa substitui a definição no editor; importações ficam pendentes e são recusadas antes da preparação e do encaminhamento. A leitura de arquivos de configuração MCP pela interface também é recusada. Logs e resultados encaminhados ocultam valores conhecidos pelo cofre. Perfis de CLI e APIs legadas de arquivos nativos ainda não têm a cobertura completa de #728. `get_skill`, `update_skill` e
`write_skill_file` priorizam a cópia; `get_agent` lê a cópia do board. APIs de arquivos nativos seguem
por compatibilidade com cópias já feitas.

### O que o board usa

O board **não varre** as pastas das ferramentas nem grava nelas (fora de "Conectar ao board", de
"Exportar para a ferramenta" e do MCP temporário da execução). `get_harness` devolve só o que foi enviado
ao board (Configurações → Harness): as rules, skills, agentes e servidores MCP, cada um com o modo em
`usage`, em `skills`, `agents`, `library.artifacts` e `inventory` (a lista do que está no board, com o
`group` que a tela usa). Plugins, hooks e permissões da ferramenta não aparecem mais no board.
`get_harness` não aceita mais `onlySelected`.

Toda execução pelo board parte de contexto vazio: só entra o que está no board.
`set_harness_selection` envia ao board rules (`instructions`), skills, agentes e servidores MCP
(`mcp`), muda o modo deles ou os tira do board, e identifica cada item por `{ kind, name }`, como
`get_harness` o mostra (o item é estrito: `location` dá erro). `off` é inativo: fica no board sem
entrar em nada nem poder ser vinculado, que é como as regras entram, para revisão. Ativo, o tipo
decide: regra usa `always` (entra em toda execução); skill e agente usam `contextual` (vinculáveis ao
card: N skills pelo campo "Skills", um agente); servidor MCP usa `always` ou `contextual` (opção do
campo "MCPs"). Uma regra enviada como `contextual` fica inativa, e uma skill ou um agente enviados como
`always` ficam `contextual`. `null` tira do board; o servidor do board vai sempre, sem marcação. Em
`get_harness`, cada artefato traz `version`, `folder` (skill) e `tools`, os ids neutros (`read`,
`search`, `write`, `edit`, `shell`, `network`, `mcp`, `delegate`): na skill, o que ela precisa; no
agente, o que ele concede. Em `get_card`, `requiredRules` e
`requiredSkills` trazem o caminho de cada arquivo que o card exige. As skills do fluxo do board vêm sem
`path`, com `{ scope: "board", via: "get_skill" }`, e se leem com `get_skill`; elas são sempre as do
board. `create_skill` marca o que cria como `contextual`.

**Removido:** `install_flow_skill` (o fluxo chega pelo `get_skill`, sem arquivo na pasta da ferramenta) e
`set_skill_enabled` (não há mais skill ligada ou desligada na pasta da ferramenta). `set_ai_tool` continua.

### Skills sob demanda

No board, uma skill em `contextual` (Pelo card) só vale nos cards que a indicam; em `always`, entra em toda
execução. O board não grava o modo na pasta da ferramenta. `requiredSkills` traz a skill da cópia do board,
e a execução pelo board passa esses caminhos no prompt.

### Modelos e referências

Modelos de classe, exemplos de código e outros arquivos de apoio ficam na pasta da skill
(`references/`, `assets/`, `scripts/`), como as ferramentas preveem: só são lidos quando o `SKILL.md`
aponta para eles. `get_harness` lista os arquivos de cada skill em `files`, `write_skill_file` grava
um arquivo na cópia da skill no board, e em `get_card` cada skill de `requiredSkills` traz em `files` os
caminhos dos arquivos de apoio dela.

### Agente de cada card

O agente do card define antes o que a sessão usa: instruções, skills, servidores MCP, ferramentas e
modelo. `get_board` lista os disponíveis em `agents` (com `default`; a resposta não traz `harness` nem `appearance`: o inventário está em `get_harness`, e só o Plan, o refinar e a edição do board pedem o `get_board`). O agente de um card é o do
próprio card (`profile` no `create_card` ou `set_card_profile`, pelo nome), senão o da coluna (`update_column` com
`exec_profile`), senão o da coluna da história (numa sub-tarefa), senão o padrão do board
(o padrão das instruções, na aba Agentes de Configurações → Harness).

`get_card` devolve o agente resolvido em `execution` (`profile`, `agentFile`, `mcpServers`,
`tools`, `deniedTools`, `enforcedByBoardRun`), e `requiredSkills` já soma as skills do agente às do
card. Numa sessão aberta pela pessoa, `execution` é orientação. Na execução pelo board, o que a
linha de comando da ferramenta aceita é imposto por parâmetro:

| Ferramenta | Imposto por parâmetro | Só orientado |
| --- | --- | --- |
| Claude Code | agente (inline, `--agents` + `--agent`), servidores MCP (`--strict-mcp-config`), ferramentas, modelo e esforço, contexto vazio (`--setting-sources ""`, `--disable-slash-commands`) | skills e rules (vão pelo caminho do arquivo) |
| Cursor | modelo; servidores MCP, ferramentas e subagentes pelo hook global do board (só com o hook instalado e atual; sem ele, voltam a orientação) | agente, skills e rules |
| Kimi Code | modelo (`-m`), servidor do board (materializado no `.kimi-code/mcp.json`) | todo o resto (não há `--agents`, `--allowedTools` nem `--mcp-config`; em `-p` a permissão é sempre "auto") |

### Pendências

`get_pending_work` é o ponto de partida de uma sessão sem pedido específico. Ele devolve, em
`forYou`, o que está com a IA:

- `approved`: cards aprovados que o board não pôde mover (a aprovação normal já leva o card à próxima coluna), para mover;
- `unanswered`: cards em que a pessoa escreveu por último na conversa, com a mensagem;
- `ready`: cards prontos para trabalhar (sub-tarefas de uma história que está com a pessoa ficam de fora).

`withPerson` lista o que espera a pessoa. Cada mensagem da conversa traz `from` (`human` ou `ai`).
A skill `faz-ai-fluxo`, que descreve o ciclo completo para a IA, é servida pelo `get_skill` e não exige instalação.
Não há instalação da skill na pasta da ferramenta: a faixa de requisitos aponta para Configurações → Harness.
`get_card` e `get_pending_work` trazem `flowNote` com a indicação de ler o fluxo com `get_skill`.

### Execução pela conversa

O botão "Enviar" da conversa chama a IA para responder à mensagem (modo de resposta: lê a última
mensagem, responde ou faz o pedido, mesmo com o card bloqueado, sem trabalhar a fase além disso).
O botão "Trabalhar na fase" (e o "Refinar com IA", sempre no nível mais restrito que a ferramenta aceita) roda a CLI da ferramenta do projeto na pasta do projeto, com um prompt que
manda trabalhar no card. Os comandos, conforme a documentação de cada ferramenta em 2026-10-02:

| Ferramenta | Comando | Permissões |
| --- | --- | --- |
| Claude Code | `claude -p` (prompt pela entrada padrão) | `--permission-mode dontAsk` com `--allowedTools "mcp__faz-ai__*" Read Glob Grep`; `acceptEdits`; `bypassPermissions` |
| Cursor | `cursor-agent -p --output-format stream-json --force --approve-mcps --trust` (servidor do board gravado no `.cursor/mcp.json` antes de rodar) | `--allowed-tools` com as ferramentas de leitura e de MCP; mais as de edição; sem `--allowed-tools` |
| Kimi Code | `kimi -p --output-format stream-json` (prompt como valor do `-p`; servidor do board gravado no `.kimi-code/mcp.json` antes de rodar) | em `-p` a permissão é sempre "auto"; nas conversas, a regra `mcp__faz-ai__*` no `~/.kimi-code/config.toml` dispensa aprovações |

Uma imagem colada numa mensagem ou na descrição do card aparece no texto como `attachment:<nome>`; o
arquivo é o anexo de mesmo nome em `attachments` de `get_card`.

`get_card` aceita `only` com os blocos que interessam (`phase`, `subtasks`, `checklist`, `links`,
`conversation`, `attachments`): título, descrição, campos, modelo, harness e pasta de trabalho vêm
sempre, e sem `only` vem tudo. Serve para reler só a conversa, por exemplo, sem repetir o card inteiro
no contexto.

A conversa em `comments` de `get_card` vem **a partir do último resumo** (a mensagem com
`kind: "summary"`, gravada por `generate_summary` ou pelo botão "Resumir a conversa"): o que veio
antes já está no resumo e não é enviado. As mensagens anteriores continuam no board, esmaecidas na
tela; apagá-las é decisão da pessoa.

Sem resumo, `comments` traz só as **últimas 20 mensagens**. Com resumo, o resumo sempre vem; se a
conversa passar de 20 mensagens, vêm as 19 últimas depois dele. Quando algo ficou de fora, `get_card`
traz `omittedBefore` com a quantidade de mensagens omitidas.

### Branch e pasta de trabalho

`prepare_workspace` cria (ou reaproveita) a branch da história e, no modo worktree, a pasta de
trabalho dela; pode ser chamada de uma sub-tarefa. `get_card` devolve em `workspace` a branch e a
pasta em que o código deve ser alterado. O nome da branch e a pasta são definidos pelo board; a IA
não deve criar branches por conta própria. Nas execuções pelo board, a pasta das worktrees é
passada à ferramenta como pasta de trabalho extra (`--add-dir`).

Com o gitflow ligado (Configurações → Git › Usar o gitflow, o padrão), a branch parte da `develop` (História, Débito
técnico e Retrabalho) ou da branch principal (Bug, que gera `hotfix/`); a pilha do modo autônomo e as
histórias derivadas partem da branch da história anterior. `workspace` ganha três campos:

- `baseBranch`: a branch de onde a da história partiu (nome curto, sem `origin/`);
- `prBase`: a branch para a qual o pull request deve ser aberto (hoje igual a `baseBranch`);
- `prNote`: a instrução pronta, `Abra o pull request com --base <prBase> (ex.: gh pr create --base
  <prBase>).`

Numa história anterior ao gitflow (sem base gravada), a base é a principal detectada; se ela não foi
detectada, `baseBranch` e `prBase` ficam de fora e a `prNote` manda abrir o PR contra a branch
principal. Numa história empilhada vem também `stackNote`, para dizer na descrição do PR de qual PR
ele depende. A resposta de `prepare_workspace` traz a `prBase`. Antes de criar a branch, o board roda
`git fetch origin` e parte de `origin/<base>`; o que não deu certo (sem `origin`, fetch que falhou,
`develop` criada ou não enviada, base gravada que sumiu) vai como comentário do "Faz AI" na conversa da
história. Quando a `develop` falta e o fetch falhou, ou a principal não pôde ser detectada (sem o HEAD
do `origin`, `main` nem `master`), `prepare_workspace` recusa em vez de criá-la, e a mensagem diz o que
fazer.

Uma história criada com `create_card` e `derived_from` (a próxima parte de uma funcionalidade dividida
em entregas, quando ela passa de umas 400 linhas; `derived_from` aponta para a parte anterior) parte
da branch da parte anterior enquanto o PR dela não foi mesclado; `workspace.baseBranch` traz essa base,
e o PR é aberto com `--base` nela. Enquanto a parte anterior, aberta, ainda não tem branch,
`prepare_workspace` recusa a derivada. `get_card` mostra a origem em `derivedFrom`.

`set_pull_request` registra na história o endereço do PR aberto pela IA, que o abre com `--base` em
`workspace.prBase` (ex.: `gh pr create --base <prBase>`); ele volta em
`workspace.pullRequest`. A IA não faz o merge: com o merge automático ligado, é o board que roda
`gh pr merge <url> --squash|--merge|--rebase` quando a pessoa aprova a homologação.

Quando a história anterior de uma pilha é concluída, o board passa a base da seguinte (e a do pull
request dela) para a base da anterior, normalmente a `develop`, e avisa na conversa. A IA segue
sempre o `workspace.baseBranch` atual e, se ele mudou, traz a nova base para a branch com
`git fetch origin <base>` e `git merge origin/<base>`, sem rebase nem push forçado.

No pull request para a principal (hotfix), o merge é sempre por merge commit. Depois do merge, o
board abre o pull request da principal para a `develop`; a IA não o abre. Ao concluir a história, o
board apaga a worktree, a branch local e a remota, e atualiza a `develop` local.

### Fases e documentos

Cada coluna em que a IA atua é uma fase. `get_card` devolve em `phase` a instrução da fase, o nome
e o modelo do documento que ela produz e se a coluna exige aprovação. Numa sub-tarefa, `phase` é a
fase da história e `storyArtifacts` lista os documentos já anexados a ela. Uma história criada ou
movida direto para uma fase adiante recebe em `phase.missingArtifacts` os documentos das fases
anteriores que não existem: a IA trabalha a partir da descrição e da conversa, sem criá-los.
Com a regra **Trilha curta** ligada (`shortTrack` em `update_rules` e nas `rules` de `get_board`;
ligada no board novo), a aprovação da pessoa e o autopiloto levam uma história de esforço Baixo ou
do tipo Bug do Discovery direto ao Plan, que parte do DISCOVERY; `move_card` com a coluna continua
livre e, para o PRD ou a Spec, força a trilha completa.
Na trilha direta, a história da trilha curta na Implementação sem sub-tarefas é executada pela
própria sessão, que recebe o pedido de implementar, verificar, fazer o commit e mover; se a mudança
passar de uns 3 arquivos, ela cria as sub-tarefas e para.

O documento é construído numa sub-tarefa (campo Fase = nome da coluna), mas fica na história:
`add_attachment` com `artifact: true` grava o arquivo no card da história, mesmo quando chamado na
sub-tarefa, e substitui a versão anterior de mesmo nome. A fase de cada coluna é editável em
Configurações → Workflows e colunas ou por `update_column` (`ai_instruction`, `artifact_name`,
`artifact_template`). As checagens da coluna (Configurações → Workflows e colunas) aparecem em
`get_board` e não se alteram pelo MCP: o `update_column` não as aceita.

Ao ler um card (`get_card`), a IA recebe a ferramenta, o **modelo** e o **esforço** que devem executá-lo e as **Skills**
obrigatórias com o caminho de cada `SKILL.md` (as do fluxo vêm sem caminho, para ler com `get_skill`). Ela é instruída a carregar essas skills antes de
executar e a avisar a pessoa quando o modelo for outro. Na fase de código, as sub-tarefas são executadas
pelo board (uma execução da CLI por sub-tarefa, com o modelo do card dela): a sessão da história cria e
descreve as sub-tarefas e para, e `subtasksNow.byBoard` lista as que o board executa, na ordem. Isso é uma orientação ao cliente de IA: cada ferramenta decide se e como a segue. Nenhuma execução delega a subagentes da ferramenta (no Claude Code, `Agent` — antes `Task` — fica negada; no Cursor e no Kimi Code, sem bloqueio comprovado, a capacidade fica "desconhecida" e a admissão decide). Em **Configurações → Harness de IA** (e em `fazai.git.parallelSubtasks`, de 1 a 6) a pessoa define **"Sub-tarefas em paralelo por história"**; a tela mostra o pedido e o efetivo (hoje 1).
Fluxo SDD sugerido: a IA lê a história e a fase (`phase`), cria uma sub-tarefa com o campo Fase,
constrói nela o documento da fase e o anexa à história (`artifact: true`), pede a revisão na
história e para. Com a aprovação, move a história para a próxima coluna.

## Identidade de execuções controladas

A API interna `AiRunner.start(cardId, { origin, mode?, workId, token, advice?, beforeStart?, onExit? })` preserva a assinatura legada. Unidades controladas exigem snapshot explícito e ponte do board; não há fallback silencioso para sessão externa. O host põe `FAZAI_RUN_TOKEN` apenas no ambiente dessa ponte. Ela envia `{"fazai":{"run":"<token>"}}` antes da primeira mensagem MCP. O transporte consome o cabeçalho, fixa a identidade da conexão e recusa cabeçalho tardio ou token malformado. Clientes externos sem variável mantêm o protocolo anterior. O token não é parâmetro de ferramenta, argumento de CLI, conteúdo de prompt ou dado exportado.

Todas as chamadas autenticadas revalidam token, geração e dono. Após revogação, inclusive depois de esperas assíncronas, a resposta é `Esta execução foi encerrada pelo board; nada foi alterado.`. Mutações aceitas são contadas conservadoramente antes de aguardar; eventos usam o run autenticado. O host remove tokens conhecidos de argumentos, resultados e logs. Sessões externas não herdam o run corrente e não podem iniciar ou mover um card reservado por outra unidade. Uma sessão de história não assume a execução dos filhos orquestráveis.

Leituras de skills, agentes, regras e artefatos de sessões controladas usam a cópia fixada, sem retorno ao cache compartilhado. O relay externo usa as definições privadas capturadas, limita servidores e, em contratos explícitos, operações; revogar interrompe conexões em curso. Alterar a biblioteca afeta execuções futuras. O snapshot ativo é somente leitura.

A API já é usada pelo Orchestrator com UnitStarter injetado nos testes; gatilhos legados não passam a criar unidades automaticamente. Testes usam servidor MCP e ponte compilada reais, com processos Node; não comprovam isolamento de uma CLI de IA, ativação v1 completa ou conclusão de #824/#825.

O hook interno de host `AiCall.beforeStart(identity)` pode aguardar persistência assíncrona. A CLI permanece atrás do launcher até a confirmação; ao sair da espera, token, snapshot e admissão são revalidados. Parar ou revogar durante a espera impede liberação tardia. O Orchestrator liga o hook ao flush e à posse da pasta por um UnitStarter injetado. A criação no host e a ativação nos gatilhos continuam pendentes.

### Verificação real do contrato do provider

`npm run test:cli-real` executa Claude Code instalado contra uma API local que emite chamadas determinadas e MCPs HTTP locais. O controle positivo conecta o MCP da configuração do projeto; `--strict-mcp-config` deve excluí-lo no caminho estrito. O servidor permitido anuncia duas operações, mas somente a autorizada pode alcançar seu handler. Uma chamada deliberada à outra operação precisa receber erro. Isso testa a imposição da CLI; não substitui os testes de identidade e escopo do servidor do board nem a prova do ambiente de produção. Não grava recibos de admissão; os registros de consumo da fixture ficam somente no SQLite descartável, separados dos boards da pessoa. Políticas gerenciadas e Cursor/Kimi permanecem não verificados.

### Políticas versionadas — base de domínio

O schema 41 acrescenta definições e histórico de políticas. A importação força revisão local pendente, preservando a intenção e as versões originais; a definição importada não é uma autorização. Não existe ferramenta MCP para salvar/ativar políticas executáveis. O repositório recusa gravação pela IA. O avaliador e a simulação compartilham a mesma função pura; ela não inicia processos, não resolve segredos e não grava o board. Sua integração às portas de inferência, à prévia e à auditoria de cada run ainda está pendente. Os dados de disponibilidade/admissão usados em execução deverão vir do host; parâmetros de simulação não constituem evidência.


### Gestão humana de políticas no host

A webview e o navegador usam `executionPolicy.read` (biblioteca ou histórico paginado) e `executionPolicy.simulate` com respostas correlacionadas por `requestId`. A simulação usa uma cópia do rascunho e não grava, resolve segredos, gera recibos nem inicia CLI. Instalação, credenciais e admissão no cenário são hipóteses declaradas, não estado comprovado do host. O catálogo contém apenas metadados dos providers integrados.

A reserva legada das regras de modelo não existe mais em `ModelRule`: o valor `fallback` ainda gravado no JSON de boards antigos é lido só pela conversão, que ao abrir o board, salvar regras ou importar o transforma em proposta `legacy-<regra>` (desligada, pendente, versão 1; idempotente, sem migração de schema). `set_model_rules` não tem o parâmetro `fallback` (a chave é ignorada, como qualquer outra fora do schema) e `get_models` não devolve `fallbackSuggest` nem `fallbackValue`. `settings.executionPolicy.save` e `settings.executionPolicy.remove` exigem ação da pessoa e revisão otimista; IA, MCP externo e tokens de execução são recusados. A UI permite salvar pendente ou confirmar revisão após comparar todas as condições/destinos/limites, preserva o rascunho em conflitos e permite recarregar a versão atual para nova comparação. Remoção cria revisão desativada e mantém o histórico. Rascunhos inválidos para o catálogo podem ser desativados ou removidos. Não há ferramentas MCP de escrita/ativação: só `get_execution_policies`, de leitura. Runner, chat e assistentes decidem a troca de alvo pelo mesmo avaliador da prévia **Próxima execução**. O assistente de IA do editor (criar, sugerir fallbacks, revisar conflitos) só devolve uma proposta validada, sem segredos; não salva nem liga política.


### Perfis de CLI persistidos

Schema 42 acrescenta `ai_profiles` à exportação e ao estado público do board. `config` é vazio nessa leitura; comandos, argumentos, ambiente e outros valores privados ficam no cofre local dos MCPs, com posse por board/perfil. A exportação carrega referências, nunca os valores salvos. Importações desativam os perfis até revisão humana local. A resposta da importação informa `profileReviews` com os nomes a revisar; não resolve credenciais nem executa probes. Duplicação explícita cria outra referência local e conserva revisão pendente/capacidades desconhecidas. Não há ferramenta MCP para criar/revisar/ativar perfis: a gestão é feita na tela Configurações → Conectar agentes.


O padrão do board aceita somente perfis ligados/revisados e conserva o ID de uma cópia; ela consulta o catálogo da origem, mas não herda a evidência de capacidades. Metadados desconhecidos não ampliam suporte ou permissões. O gateway recusa perfis ausentes, desativados ou pendentes antes de preparar a execução. A disponibilidade do comando e um resultado OK no teste não substituem evidência de isolamento, permissões ou MCP.


### Consultas de versão/login por perfil

`resolveCommand` aceita `onlyPath`; personalizados usam somente o comando exato no PATH ou caminho absoluto, sem aliases/extensões/pastas usuais. `resolveProfileCommand` considera o PATH privado do perfil. `profileVersion` e `profileSignedIn` são adaptadores internos do host, sem ferramenta MCP nova; a interface não envia comandos para sondar. O host resolve a configuração pelo ID e recusa consultas de perfis pendentes/desativados ou sem credencial local.

As sondas de perfil usam `execFile` sem shell, inclusive as consultas nativas; shims `.cmd`/`.bat` no Windows ficam desconhecidos nesse caminho. A versão retorna somente o trecho numérico reconhecido, com ocultação prévia dos valores privados; stdout/stderr brutos não vão ao estado. Sem `statusArgs`, personalizado não consulta/cobra login. Código zero/um/indisponível conserva verdadeiro/falso/desconhecido. As consultas configuradas exigem revisão humana e não comprovam capacidades. O cache é por perfil, executável e referência de credenciais.

Requisitos de perfis configuráveis expõem nome público em `cli`, nunca comando/args/env. Link de instalação HTTPS revisado pode aparecer como metadado público; URL com usuário, senha, query ou fragmento é omitida. Cópias/personalizados não dependem do registro MCP global de outra conta. A execução de configuráveis exige contrato e admissão por capacidades; uma declaração manual não substitui a evidência exigida.


### Execução por ACP (transporte do perfil)

Um perfil de CLI roda pelo Agent Client Protocol (ACP) quando a configuração do perfil traz `acpAgent` com o id de um agente do catálogo (`src/extension/ai/acp/agents.ts`): o perfil pronto do tipo `acp` (#1095; um por agente que não coincide com uma CLI pronta, com o id do agente, desligado até a pessoa ligar e sem linha no banco antes disso) ou um personalizado com `acpAgent`, de uma versão anterior ou da cópia de um agente pronto (o formulário novo é só de CLI desde a história 13, e o repositório recusa pôr `acpAgent` num personalizado que não era ACP). Uma execução é um processo, uma sessão e um `session/prompt`, e devolve o mesmo registro de uso da CLI de uma passada. O gateway só escolhe esse transporte para perfil `generic` com `acpAgent`; agente desconhecido é recusado antes de iniciar, e sem o transporte no host o perfil é recusado com "ACP indisponível". No personalizado ACP, o formulário de edição traz o campo **Agente ACP** (o id do catálogo) e o aviso de que o caminho normal é o Conectar; o campo de comando não aparece, e a sonda de requisitos procura o comando do agente no PATH.

**Admissão do transporte ACP (#1090).** O perfil ACP é personalizado e passa pela admissão por capacidades como os outros, com a tradução do transporte (`admitExecution(..., 'acp')`): nenhuma ferramenta nativa (o board responde cada `session/request_permission` pelo nível e pelo manifesto do card), delegação negada e servidores MCP só os do `session/new`. O vínculo (`ExecutionAdmission.binding`) é o comando e os argumentos do agente do catálogo (`acpCommand`), o binário resolvido e o digest dele, o ambiente, a permissão, a pasta e a configuração do perfil; não há flags de isolamento, arquivo temporário nem formato de saída. O gateway confere o comando que `spawnAcp` vai iniciar contra o vínculo (`AdmittedExecution.acpCommand`) e substitui o executável pelo vinculado; uma admissão de CLI não serve para um perfil ACP, nem o contrário. Os recibos vêm do verificador do host (no Conectar do agente, sozinho ao ligá-lo, ou por **Verificar capacidades** no personalizado ACP): dois handshakes do agente numa pasta descartável, sem `session/prompt` (não gasta a conta da pessoa), e os checks `ACP_CAPABILITY_CHECKS`: `fresh-session` (duas sessões distintas em dois processos), `protocol-version` (versão 1 do protocolo e sessão aberta, para permissões e delegação), `session-servers` (o servidor MCP de teste passado no `session/new` recebeu o `initialize` do agente), `managed-settings` (o digest do ambiente) e `own-context-files`, que fica `unavailable` de propósito: o protocolo não tem como impedir o agente de ler os próprios arquivos de contexto (`GEMINI.md`, `AGENTS.md`…). Por isso a capacidade de artefatos nunca é verificada no ACP e o perfil é admissível só no **regime compatível**, revisado pela pessoa; no exclusivo a admissão bloqueia com `capability-not-verified/artifacts`. Os recibos da CLI não valem para o ACP nem os do ACP para a CLI (ids de check diferentes), e cada agente do catálogo tem o próprio vínculo.

As permissões chegam por `session/request_permission` e são respondidas chamada a chamada: o nível da execução e o manifesto do card decidem, e servidor MCP ou ferramenta fora do card é negado (`reject_once`). Os servidores MCP do card (o do board e os liberados) entram no `session/new`, só em stdio; nenhum arquivo é escrito no projeto, exceto para o Cursor: o board registra o servidor do board no `.cursor/mcp.json` da pasta, que o `cursor-agent acp` lê no modo ACP. Parar é `session/cancel`; depois de 5 segundos o processo é encerrado. Login pedido pelo agente (`auth_required`) vira erro com o comando de login, sem `authenticate` e sem abrir o navegador.

Catálogo de agentes, comando de execução e login (nenhum validado com a CLI real ainda; o teste com as ferramentas, #988, ficou pendente):

| Agente | Comando | Login (no terminal) | Consumo informado |
| --- | --- | --- | --- |
| Gemini CLI | `gemini --acp --skip-trust` | `gemini` | tokens por turno, sem custo |
| Google Antigravity | `agy_acp_server.par` (binário do registro do ACP; a pasta dele no PATH, sem link simbólico) | `agy` (o servidor pede login pelo protocolo) | não informado |
| OpenCode | `opencode acp` | `opencode auth login` | tokens por turno e custo acumulado (USD) |
| Codex | `codex-acp` | `codex login` | só o último pedido do turno, sem custo |
| Cursor | `cursor-agent acp` | `cursor-agent login` | não informado |
| Kimi Code | `kimi acp` | `kimi` | não informado |
| GitHub Copilot CLI | `copilot --acp` | `copilot` | não informado (cobrança por pedido premium) |
| Qwen Code | `qwen --acp` | `qwen` | não informado |
| goose | `goose acp` | `goose configure` | não informado |

Consumo não informado fica desconhecido: nunca vira zero. O Claude Code não entra por ACP e segue pela CLI `claude`.

### O board como cliente MCP no modo API (Gemini)

No modo API (`profile.mode === 'api'`, o Gemini desde a história 10 da épica "ferramenta por modo") não há ferramenta para iniciar a ponte `mcp-bridge.js`: quem chama as ferramentas é o laço da extensão (`src/extension/ai/drivers/gemini/api.ts`). O board é cliente do **próprio servidor**, o mesmo que atende a pasta (`startMcpServer`, um por pasta, no socket de `socketPath`), pelo protocolo da ponte: uma mensagem JSON por linha e, numa execução controlada, o token da execução (`FAZAI_RUN_TOKEN`, que a sessão MCP injeta na definição do `faz-ai`) na primeira linha (`mcp/selfClient.ts`). Nada abre um segundo servidor: se nenhum atende a pasta, a execução falha com "O servidor MCP do board desta pasta não está acessível." Os MCPs do card são conectados pela definição da biblioteca (stdio na pasta do projeto, ou HTTP/SSE), o mesmo transporte do `call_board_mcp_tool` (`libraryMcpTransport`); um MCP do card fora do ar deixa só as ferramentas dele de fora, como numa CLI.

O servidor do board vê o cliente como `faz-ai-gemini-api` e assina as mensagens da conversa como **Gemini**. Cada ferramenta listada vira uma função declarada ao modelo com o nome `mcp__<servidor>__<ferramenta>` (o JSON Schema do MCP vai em `parametersJsonSchema`), mas só se a decisão do card a admite (`apiCallDecision`: a mesma regra do ACP, `boardDecision`, mais o escopo de operações do contrato quando a execução o traz). A mesma decisão roda de novo em cada chamada; a chamada a uma função não declarada volta ao modelo como erro, sem rodar. O inventário da execução é a lista das chamadas executadas (`mcp_tool`, `<servidor>/<ferramenta>`), e a conferência do card as compara como nos outros transportes. Desde a história 11 o laço também declara as ferramentas locais do board (`read_file`, `glob`, `grep` em `board`; `write_file`, `edit_file` em `edits`; `run_command` em `full`, sem as que o card nega), que não passam pelo MCP: o board as executa no host, confinadas às pastas do card (`src/extension/ai/apiTools.ts`), e elas entram no inventário como ferramentas nativas com o nome do card (`tool`, `Read`, `Write`, `Bash`…). O detalhe está em [Trabalhar na fase pela API](fluxo.md#trabalhar-na-fase-pela-api).

### Providers configuráveis e origem de teste

O gateway recebe a identidade/perfil escolhido, resolve a configuração privada pelo cofre no host e conserva uma cópia por run. `ai_runs.tool` guarda o ID real do perfil; não vira a base. Configuráveis exigem contrato v1 e admissão antes do spawn. A cópia usa a tradução da base com evidência própria: configuração/comando/args/env entram no vínculo, e recibos de outra configuração não autorizam execução. O genérico sem tradução continua recusado; argumentos declarados não comprovam restrições. Não foi criado endpoint MCP de ativação/revisão de perfil.

O adaptador genérico monta stdin/argv, destinos MCP CLI/projeto/nenhum, modelo/esforço/pastas e argumentos por permissão. Caminho MCP precisa ficar no projeto; ausência de argumentos restritos recusa montagem. Lookup é exato por PATH/absoluto e não usa shell. Seu leitor de texto retorna `measure: none`, consumo/custo desconhecidos e não transforma isso em medição quebrada ou zero. O gateway oculta valores privados e classifica frases literais de autenticação antes da ocultação; não interpreta essas frases como regex.

Schema 43 amplia o CHECK de `ai_runs.origin` para `test`. A reconstrução transacional preserva IDs, consumo, auditoria, inventário e Bash; as FKs dos filhos são conferidas e restauradas. Import/export continua versionado. A migração foi exercitada apenas em bancos descartáveis nesta implementação; o banco vivo do board não foi alterado diretamente.

## O que a CLI carrega por conta própria (`cliLoads`)

`get_card` (em `execution.cliLoads`) e `get_harness` (`cliLoads`) devolvem `{ contextEnforced, loads, unrecognized?, summary, note }` do perfil ativo. `loads` lista os tipos (`instructions`, `skill`, `agent`, `hook`, `mcp`) e a origem (`project`, `user`) que a CLI lê sozinha; `contextEnforced` só é verdadeiro com as capacidades de conversa nova e de controle de artefatos verificadas pelo host. Lista vazia significa nenhum item conhecido e não prova isolamento. Em conflito entre o que a CLI leu e o que o board entregou, vale o board. `ai_runs.clean` das execuções novas segue `contextEnforced`; as antigas mantêm o valor gravado.
