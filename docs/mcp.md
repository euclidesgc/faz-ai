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

Os campos do board (Fase, Tags, Modelo, Skills, Rules, Esforço da atividade e Criticidade) vêm com
`board: true` em `get_board.fields`: as regras, a triagem e a IA dependem deles. `delete_field` e a
troca de nome em `update_field` são recusadas neles, assim como opções e tipos de card (as opções de
Tags são da pessoa e mudam); a exibição muda em todos. `create_field` recusa o nome de um deles.
O valor da Fase de uma sub-tarefa é gravado pela IA (`create_card` ou `update_card` com
`fields.Fase`); a pessoa não o muda no card, e `update_card_type` recusa a Fase em `default_fields`.

Também pelo MCP: catálogo e regras de modelos (`get_models`, `detect_models`, `upsert_model`,
`set_model_rules`), padrões por tipo de card (`update_card_type`), recriar o board (`reset_board`) e o
harness inteiro (`get_harness`, `read_rule_file`, `write_rule_file`, `create_skill`, `update_skill`,
`set_skill_enabled`, `delete_skill`…).

Toda sessão recebe as instruções do servidor: o ciclo do card (por onde começar, status, revisão,
modelo do card, rules e skills obrigatórias e pendências com a pessoa) em menos de 2.048 caracteres,
o tamanho em que o Claude Code corta as instruções de cada servidor e a descrição de cada ferramenta
(documentação de 2026-10-13). O detalhe de cada passo fica onde a IA o lê quando precisa: na
descrição da ferramenta, nas notas do `get_card` (como `subtasksNowNote`, com as rodadas da
Implementação) e nas skills do fluxo. As notas do `get_card` são curtas e só aparecem quando o estado do
card pede; o texto completo fica em skills por assunto (`faz-ai-harness-do-card`,
`faz-ai-workspace-e-pr`, `faz-ai-implementacao-rodadas`, `faz-ai-revisao-e-homologacao` e
`faz-ai-modo-autonomo`), que a nota aponta pelo nome.

### Status e revisão

Cada card em que a IA atua tem um status de trabalho, devolvido em `work` por `get_card` e
`list_cards` (que filtra por `work_status`):

| Status | Com quem | Como chega nele |
| --- | --- | --- |
| `ready` | IA | O card entrou numa coluna em que a IA atua, a pessoa pediu ajustes ou respondeu a uma pergunta |
| `running` | IA | `start_work` |
| `waiting_answer` | Pessoa | `ask_question` |
| `waiting_review` | Pessoa | `request_review` |
| `approved` | IA | A pessoa aprovou e o board não pôde mover o card (não há ferramenta para a IA aprovar; a aprovação normal já leva o card à próxima coluna) |
| `blocked` | Pessoa | `block_card`, ou a pessoa bloqueou |

Nas colunas com `requiresApproval` (em `get_board`), `move_card` só leva o card para a frente quando
o status é `approved`. Voltar de coluna ou cancelar é livre. No modo autônomo, `phase.requiresApproval`
só vem verdadeiro na coluna até onde a pessoa liberou o modo; `request_review`, com ou sem `pending`,
vira aprovação na hora nas outras, e a IA é mandada decidir e seguir. `update_column` liga e desliga
`ai_active` e `requires_approval`.

### Agentes

Um agente do board é um arquivo de agente da ferramenta, do projeto ou da pasta do usuário.
`get_harness` lista os marcados como disponíveis (com `onlySelected: false`, todos, com a marcação
em `usage`), e `get_agent`, `create_agent`, `update_agent` e `delete_agent` os gerenciam: o padrão de
criação é a pasta global (`scope: "user"`), e o agente criado já nasce disponível. `create_agent` e
`update_agent` aceitam, além das instruções, `description`, `model` (valor do campo Modelo, ex.:
`claude:sonnet@medium`), `tools`, `deniedTools`, `skills` e `mcp`, e, no Cursor (que não tem lista de
ferramentas, skills nem MCP por subagente), `readonly` e `background` (`readonly: true` e
`is_background: true` no frontmatter); o board grava o que é só dele em chaves `faz-ai-*` do
frontmatter. Cada ferramenta guarda os seus numa
pasta própria (a global fica em `~/`):

| Ferramenta | Pasta | Arquivo | Modelo por agente |
| --- | --- | --- | --- |
| Claude Code | `.claude/agents` | `<nome>.md` (frontmatter YAML) | `model` |
| Cursor | `.cursor/agents` | `<nome>.md` | `model` |
| Kimi Code | `.kimi-code/agents` | `<nome>.md` (frontmatter YAML; aceita os mesmos globs `mcp__*` em `tools`) | — |

### Projeto, global e plugins

O board lê o harness de cada ferramenta em três escopos: a pasta do projeto (`project`), a pasta do
usuário (`user`, vale em todos os projetos) e os plugins instalados (`plugin`; no Claude Code, os que
`claude plugin list` mostra, sem o catálogo dos marketplaces). `get_harness` devolve
em `inventory` tudo que a ferramenta do projeto carrega (instruções e regras, skills, agentes,
comandos, hooks, servidores MCP, plugins e arquivos de configuração), com o escopo e o caminho de
cada item, e o `group` em que a tela de Harness o mostra: `main` (regras principais), `topic` (regras
por assunto), `memory` (memória automática do Claude Code), `skill`, `agent`, `command`, `hook`, `mcp`,
`settings`, `style` (estilos de saída), `plugin` e `managed` (política da organização, só leitura).
De hooks e servidores MCP só vão o nome e o comando ou a URL, sem argumentos nem variáveis.

Toda execução pelo board parte de contexto vazio: só entra o que está no board (Configurações →
Harness). `set_harness_selection` envia ao board rules (`instructions`), skills, agentes e servidores
MCP (`mcp`), muda o modo deles ou os tira do board: `always` (Sempre) entra em toda execução, pelo
caminho do arquivo ou na configuração de servidores da execução; `contextual` (Pelo card) vira opção
dos campos "Rules", "Skills" e "MCPs" dos cards (e agente disponível); `off` (Desligado) fica no
board sem entrar em nada, que é como as regras entram, para revisão; `null` tira do board. Cada item do
inventário traz em `key` a identidade para `set_harness_selection`: o caminho; num servidor MCP, o
arquivo mais o nome (`.mcp.json#github`). O `name` também serve para agente, skill e servidor. Os campos "Rules",
"Skills" e "MCPs" dos cards só oferecem o que está em `contextual`; o servidor do board vai sempre, sem
marcação. O inventário traz também o escopo `imported`: artefatos de pastas que a pessoa importou, que
a ferramenta não carrega sozinha. Em `get_card`, `requiredRules` e `requiredSkills` trazem o caminho de cada
arquivo que o card exige; para skills fora do projeto, `path` é o caminho absoluto do `SKILL.md`.
Quando uma skill existe no projeto e fora dele com o mesmo nome, vale a do projeto. `create_skill` e
`install_flow_skill` já marcam o que criam (`contextual` e `always`, respectivamente).

### Skills sob demanda

Cada skill do projeto ou da pasta do usuário tem um modo: `auto` (a IA vê a descrição e decide quando
usar) ou `manual` (só quando indicada num card ou chamada pelo nome). O modo é gravado no formato de
cada ferramenta: `disable-model-invocation: true` no frontmatter do `SKILL.md` (Claude Code e Cursor). Uma skill
desligada ou em modo `manual` continua valendo nos cards que a indicam: `requiredSkills` traz o
caminho do `SKILL.md`, e a execução pelo board passa esses caminhos no prompt.

### Modelos e referências

Modelos de classe, exemplos de código e outros arquivos de apoio ficam na pasta da skill
(`references/`, `assets/`, `scripts/`), como as ferramentas preveem: só são lidos quando o `SKILL.md`
aponta para eles. `get_harness` lista os arquivos de cada skill em `files`, `write_skill_file` grava
um arquivo numa skill do projeto, e em `get_card` cada skill de `requiredSkills` traz em `files` os
caminhos dos arquivos de apoio dela.

### Agente de cada card

O agente do card define antes o que a sessão usa: instruções, skills, servidores MCP, ferramentas e
modelo. `get_board` lista os disponíveis em `agents` (com `default`). O agente de um card é o do
próprio card (`set_card_profile`, pelo nome), senão o da coluna (`update_column` com
`exec_profile`), senão o da coluna da história (numa sub-tarefa), senão o padrão do board
(Configurações → Harness de IA → Ferramenta e execução).

`get_card` devolve o agente resolvido em `execution` (`profile`, `agentFile`, `mcpServers`,
`tools`, `deniedTools`, `enforcedByBoardRun`), e `requiredSkills` já soma as skills do agente às do
card. Numa sessão aberta pela pessoa, `execution` é orientação. Na execução pelo board, o que a
linha de comando da ferramenta aceita é imposto por parâmetro:

| Ferramenta | Imposto por parâmetro | Só orientado |
| --- | --- | --- |
| Claude Code | agente (inline, `--agents` + `--agent`), servidores MCP (`--strict-mcp-config`), ferramentas, modelo e esforço, contexto vazio (`--setting-sources ""`, `--disable-slash-commands`) | skills e rules (vão pelo caminho do arquivo) |
| Cursor | modelo | todo o resto |
| Kimi Code | modelo (`-m`), servidor do board (materializado no `.kimi-code/mcp.json`) | todo o resto (não há `--agents`, `--allowedTools` nem `--mcp-config`; em `-p` a permissão é sempre "auto") |

### Pendências

`get_pending_work` é o ponto de partida de uma sessão sem pedido específico. Ele devolve, em
`forYou`, o que está com a IA:

- `approved`: cards aprovados que o board não pôde mover (a aprovação normal já leva o card à próxima coluna), para mover;
- `unanswered`: cards em que a pessoa escreveu por último na conversa, com a mensagem;
- `ready`: cards prontos para trabalhar (sub-tarefas de uma história que está com a pessoa ficam de fora).

`withPerson` lista o que espera a pessoa. Cada mensagem da conversa traz `from` (`human` ou `ai`).
A skill `faz-ai-fluxo`, instalada por `install_flow_skill` (sem `scope`: instala no global da ferramenta, para todos os projetos) ou pelo botão em Harness de IA, descreve
o ciclo completo para a IA. A instalação grava também as skills por assunto citadas acima, que a skill
principal e as notas do `get_card` apontam; checar se está instalada continua olhando só a `faz-ai-fluxo`.

### Execução pela conversa

O botão "Trabalhar na fase" (e o "Refinar com IA", sempre no nível mais restrito que a ferramenta aceita) roda a CLI da ferramenta do projeto na pasta do projeto, com um prompt que
manda trabalhar no card. Os comandos, conforme a documentação de cada ferramenta em 2026-10-02:

| Ferramenta | Comando | Permissões |
| --- | --- | --- |
| Claude Code | `claude -p` (prompt pela entrada padrão) | `--permission-mode dontAsk` com `--allowedTools "mcp__faz-ai__*" Read Glob Grep`; `acceptEdits`; `bypassPermissions` |
| Cursor | `cursor-agent -p --output-format stream-json --force --approve-mcps --trust` (servidor do board gravado no `.cursor/mcp.json` antes de rodar) | `--allowed-tools` com as ferramentas de leitura e de MCP; mais as de edição; sem `--allowed-tools` |
| Kimi Code | `kimi -p --output-format stream-json` (prompt como valor do `-p`; servidor do board gravado no `.kimi-code/mcp.json` antes de rodar) | em `-p` a permissão é sempre "auto"; nas conversas, a regra `mcp__faz-ai__*` no `~/.kimi-code/config.toml` dispensa aprovações |

Uma imagem colada numa mensagem ou na descrição do card aparece no texto como `attachment:<nome>`; o
arquivo é o anexo de mesmo nome em `attachments` de `get_card`.

A conversa em `comments` de `get_card` vem **a partir do último resumo** (a mensagem com
`kind: "summary"`, gravada por `generate_summary` ou pelo botão "Resumir a conversa"): o que veio
antes já está no resumo e não é enviado. As mensagens anteriores continuam no board, esmaecidas na
tela; apagá-las é decisão da pessoa.

### Branch e pasta de trabalho

`prepare_workspace` cria (ou reaproveita) a branch da história e, no modo worktree, a pasta de
trabalho dela; pode ser chamada de uma sub-tarefa. `get_card` devolve em `workspace` a branch e a
pasta em que o código deve ser alterado. O nome da branch e a pasta são definidos pelo board; a IA
não deve criar branches por conta própria. Nas execuções pelo board, a pasta das worktrees é
passada à ferramenta como pasta de trabalho extra (`--add-dir`).

Com o gitflow ligado (`fazai.git.gitflow`, o padrão), a branch parte da `develop` (História, Débito
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

O documento é construído numa sub-tarefa (campo Fase = nome da coluna), mas fica na história:
`add_attachment` com `artifact: true` grava o arquivo no card da história, mesmo quando chamado na
sub-tarefa, e substitui a versão anterior de mesmo nome. A fase de cada coluna é editável em
Configurações → Workflows e colunas ou por `update_column` (`ai_instruction`, `artifact_name`,
`artifact_template`).

Ao ler um card (`get_card`), a IA recebe a ferramenta, o **modelo** e o **esforço** que devem executá-lo e as **Skills**
obrigatórias com o caminho de cada `SKILL.md`. Ela é instruída a carregar essas skills antes de
executar e a delegar o trabalho a um subagente com o modelo escolhido, ou avisar quando o cliente
não permite. Isso é uma orientação ao cliente de IA: cada ferramenta decide se e como a segue.

Fluxo SDD sugerido: a IA lê a história e a fase (`phase`), cria uma sub-tarefa com o campo Fase,
constrói nela o documento da fase e o anexa à história (`artifact: true`), pede a revisão na
história e para. Com a aprovação, move a história para a próxima coluna.
