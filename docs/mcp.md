# Faz AI Kanban: conexão com IA (MCP) em detalhe

O board pode ser consultado e editado por uma IA (Claude Code, Codex, Cursor, Kimi Code, GitHub Copilot ou qualquer cliente
MCP). A extensão roda um servidor MCP local para a pasta aberta; tudo o que a IA faz aparece no
board na hora, e as regras do board valem para ela também.

## Como conectar

Em Configurações → **Harness de IA** → **Tudo que a ferramenta carrega**, na seção **Servidores MCP**
da ferramenta, clique em **Instalar (padrão da ferramenta)** (ou rode **Faz AI: Instalar o MCP do
board (global)** na paleta). O board registra o servidor na configuração global da ferramenta, que
vale em qualquer projeto aberto com o board, sem arquivo nenhum no repositório:

| Ferramenta | Onde o servidor é registrado (global) | Como o servidor acha o projeto | Depois de registrar |
| --- | --- | --- | --- |
| Claude Code | `~/.claude.json`, por `claude mcp add-json --scope user` | variável `CLAUDE_PROJECT_DIR`, que o Claude Code passa ao servidor | Abra uma sessão nova (`/mcp` mostra o estado) |
| Cursor (chat do editor e `cursor-agent`) | **no projeto**, `.cursor/mcp.json` (fora do git), gravado sozinho ao abrir a pasta no Cursor | a pasta fixa no registro | Na primeira vez: recarregue a janela e ligue o `faz-ai` em Cursor Settings → MCP |
| Codex | `~/.codex/config.toml` | a pasta em que a sessão foi aberta | Abra uma sessão nova (`codex mcp list` confere) |
| Kimi Code | `~/.kimi-code/mcp.json` e/ou `~/.kimi/mcp.json` | a pasta em que a sessão foi aberta | Abra uma sessão nova a partir da pasta do projeto |
| GitHub Copilot | `~/.copilot/mcp-config.json` (Copilot CLI) e o `mcp.json` do perfil do VS Code | no VS Code, `${workspaceFolder}`; na CLI, a pasta em que ela roda | No VS Code, confirme a confiança (**MCP: List Servers**); na CLI, abra uma sessão nova |

**Instalar neste projeto** grava em `.mcp.json`, `.cursor/mcp.json`, `.codex/config.toml`,
`.kimi-code/mcp.json` ou `.vscode/mcp.json`, com a pasta fixa. Esses arquivos guardam caminhos desta
máquina, e o registro do projeto vale no lugar do global naquele projeto. Por isso um registro
quebrado ali (de outra pasta, de um node que sumiu) estraga o global. A faixa de requisitos mostra
**Corrigir o registro**, que tira o registro do arquivo do projeto e deixa o global valendo.

O agente do Copilot que roda no GitHub (cloud agent) não é atendido: ele executa fora desta máquina e
não alcança o servidor local.

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
codex mcp add faz-ai -- node "$BRIDGE"                      # Codex, global (~/.codex/config.toml)
kimi mcp add --transport stdio faz-ai -- node "$BRIDGE"     # Kimi, global
copilot mcp add faz-ai -- node "$BRIDGE"                    # Copilot CLI, global (~/.copilot/mcp-config.json)
```

No Cursor, o registro é sempre o do projeto: o global dele é um processo só para todas as janelas,
que sobe sem saber qual projeto atender (o `${workspaceFolder}` só é trocado quando a pessoa liga o
servidor à mão, e aí vale para todas as janelas). Os formatos gravados pelo board:

```json
// .cursor/mcp.json do projeto (Cursor)
{ "mcpServers": { "faz-ai": { "type": "stdio", "command": "node", "args": ["<bridge.js>", "<pasta do projeto>"] } } }
```

```toml
# ~/.codex/config.toml (Codex)
[mcp_servers.faz-ai]
command = "node"
args = ["<bridge.js>"]
```

```json
// ~/.kimi-code/mcp.json (Kimi Code)
{ "mcpServers": { "faz-ai": { "transport": "stdio", "command": "node", "args": ["<bridge.js>"] } } }
```

```json
// mcp.json do perfil do VS Code (GitHub Copilot); a chave é `servers`
{ "servers": { "faz-ai": { "type": "stdio", "command": "node", "args": ["<bridge.js>", "${workspaceFolder}"] } } }
```

```json
// ~/.copilot/mcp-config.json (Copilot CLI)
{ "mcpServers": { "faz-ai": { "type": "stdio", "command": "node", "args": ["<bridge.js>"], "tools": ["*"] } } }
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

Também pelo MCP: catálogo e regras de modelos (`get_models`, `detect_models`, `upsert_model`,
`set_model_rules`), padrões por tipo de card (`update_card_type`), recriar o board (`reset_board`) e o
harness inteiro (`get_harness`, `read_rule_file`, `write_rule_file`, `create_skill`, `update_skill`,
`set_skill_enabled`, `delete_skill`…).

### Status e revisão

Cada card em que a IA atua tem um status de trabalho, devolvido em `work` por `get_card` e
`list_cards` (que filtra por `work_status`):

| Status | Com quem | Como chega nele |
| --- | --- | --- |
| `ready` | IA | O card entrou numa coluna em que a IA atua, a pessoa pediu ajustes ou respondeu a uma pergunta |
| `running` | IA | `start_work` |
| `waiting_answer` | Pessoa | `ask_question` |
| `waiting_review` | Pessoa | `request_review` |
| `approved` | IA | A pessoa aprovou (não há ferramenta para a IA aprovar) |
| `blocked` | Pessoa | `block_card`, ou a pessoa bloqueou |

Nas colunas com `requiresApproval` (em `get_board`), `move_card` só leva o card para a frente quando
o status é `approved`. Voltar de coluna ou cancelar é livre. `update_column` liga e desliga
`ai_active` e `requires_approval`.

### Agentes

`get_harness` lista os agentes (subagentes) do projeto, e `get_agent`, `create_agent`, `update_agent`
e `delete_agent` os gerenciam. Cada ferramenta guarda os seus numa pasta própria:

| Ferramenta | Pasta | Arquivo | Modelo por agente |
| --- | --- | --- | --- |
| Claude Code | `.claude/agents` | `<nome>.md` (frontmatter YAML) | `model` |
| Codex | `.codex/agents` | `<nome>.toml` | `model` |
| Cursor | `.cursor/agents` | `<nome>.md` | `model` |
| Kimi Code | `.kimi-code/agents` | `<nome>.md` | não tem |
| GitHub Copilot | `.github/agents` | `<nome>.agent.md` | `model` |

### Projeto, global e plugins

O board lê o harness de cada ferramenta em três escopos: a pasta do projeto (`project`), a pasta do
usuário (`user`, vale em todos os projetos) e os plugins instalados (`plugin`). `get_harness` devolve
em `inventory` tudo que a ferramenta do projeto carrega (instruções e regras, skills, agentes,
comandos, hooks, servidores MCP, plugins e arquivos de configuração), com o escopo e o caminho de
cada item. De hooks e servidores MCP só vão o nome e o comando ou a URL, sem argumentos nem variáveis.

O campo "Skills" dos cards oferece as skills do projeto e também as globais e de plugins. Em
`get_card`, cada item de `requiredSkills` traz `scope`; para skills fora do projeto, `path` é o
caminho absoluto do `SKILL.md`. Quando uma skill existe no projeto e fora dele com o mesmo nome,
vale a do projeto. As ferramentas de escrita (`create_skill`, `create_agent`…) continuam atuando só
na pasta do projeto.

### Skills sob demanda

Cada skill do projeto ou da pasta do usuário tem um modo: `auto` (a IA vê a descrição e decide quando
usar) ou `manual` (só quando indicada num card ou chamada pelo nome). O modo é gravado no formato de
cada ferramenta: `disable-model-invocation: true` no frontmatter (Claude Code, Cursor, Kimi Code,
Copilot) ou `policy.allow_implicit_invocation: false` em `agents/openai.yaml` (Codex). Uma skill
desligada ou em modo `manual` continua valendo nos cards que a indicam: `requiredSkills` traz o
caminho do `SKILL.md`, e a execução pelo board passa esses caminhos no prompt.

### Modelos e referências

Modelos de classe, exemplos de código e outros arquivos de apoio ficam na pasta da skill
(`references/`, `assets/`, `scripts/`), como as ferramentas preveem: só são lidos quando o `SKILL.md`
aponta para eles. `get_harness` lista os arquivos de cada skill em `files`, `write_skill_file` grava
um arquivo numa skill do projeto, e em `get_card` cada skill de `requiredSkills` traz em `files` os
caminhos dos arquivos de apoio dela.

### Perfis de execução

Um perfil de execução define antes o que a sessão usa num card: agente, skills, servidores MCP,
ferramentas, modelo e se a sessão é limpa (sem as personalizações da pasta do usuário). Os perfis
são criados em Configurações → Perfis de execução; `get_board` os lista em `execProfiles`. O perfil
de um card é o do próprio card (`set_card_profile`), senão o da coluna (`update_column` com
`exec_profile`), senão o da coluna da história (numa sub-tarefa), senão o padrão do board.

`get_card` devolve o perfil resolvido em `execution`, e `requiredSkills` já soma as skills do perfil
às do card. Numa sessão aberta pela pessoa, `execution` é orientação. Na execução pelo board, o que
a linha de comando da ferramenta aceita é imposto por parâmetro (`enforcedByBoardRun`):

| Ferramenta | Imposto por parâmetro | Só orientado |
| --- | --- | --- |
| Claude Code | agente, servidores MCP, ferramentas, modelo e esforço, sessão limpa | skills (vão pelo caminho do arquivo) |
| GitHub Copilot | agente, servidores MCP, ferramentas, modelo e esforço | skills, sessão limpa |
| Kimi Code | agente, modelo | skills, servidores MCP, ferramentas, sessão limpa |
| Codex | servidores MCP, modelo e esforço | agente, skills, ferramentas, sessão limpa |
| Cursor | modelo | todo o resto |

### Pendências

`get_pending_work` é o ponto de partida de uma sessão sem pedido específico. Ele devolve, em
`forYou`, o que está com a IA:

- `approved`: cards aprovados, para mover para a próxima coluna;
- `unanswered`: cards em que a pessoa escreveu por último na conversa, com a mensagem;
- `ready`: cards prontos para trabalhar (sub-tarefas de uma história que está com a pessoa ficam de fora).

`withPerson` lista o que espera a pessoa. Cada mensagem da conversa traz `from` (`human` ou `ai`).
A skill `faz-ai-fluxo`, instalada por `install_flow_skill` ou pelo botão em Harness de IA, descreve
o ciclo completo para a IA.

### Execução pela conversa

O botão "Trabalhar na fase" (e o "Refinar com IA", sempre no nível mais restrito que a ferramenta aceita) roda a CLI da ferramenta do projeto na pasta do projeto, com um prompt que
manda trabalhar no card. Os comandos, conforme a documentação de cada ferramenta em 2026-10-02:

| Ferramenta | Comando | Permissões |
| --- | --- | --- |
| Claude Code | `claude -p` (prompt pela entrada padrão) | `--permission-mode dontAsk` com `--allowedTools "mcp__faz-ai__*" Read Glob Grep`; `acceptEdits`; `bypassPermissions` |
| Codex | `codex exec -` | `--sandbox read-only`; `workspace-write`; `--dangerously-bypass-approvals-and-sandbox` |
| GitHub Copilot | `copilot -p "<prompt>" --no-ask-user` | `--allow-tool=faz-ai --allow-tool=read`; mais `--allow-tool=write`; `--allow-all` |
| Cursor | `cursor-agent -p --output-format stream-json --force --approve-mcps --trust` (servidor do board gravado no `.cursor/mcp.json` antes de rodar) | `--allowed-tools` com as ferramentas de leitura e de MCP; mais as de edição; sem `--allowed-tools` |
| Kimi Code | `kimi -p` | só "sem restrições" (o `-p` não aceita flags de permissão) |

Cuidados por ferramenta:

- **Codex** só lê o `.codex/config.toml` do projeto se o projeto estiver marcado como confiável.
- **Copilot** só carrega o `.mcp.json` do projeto no modo `-p` com a variável
  `GITHUB_COPILOT_PROMPT_MODE_WORKSPACE_MCP=true`, que o board define.
- **Kimi** precisa do servidor registrado no arquivo global (`~/.kimi-code/mcp.json`), que é onde
  o board o registra.

Uma imagem colada numa mensagem aparece no texto como `attachment:<nome>`; o arquivo é o anexo de
mesmo nome em `attachments` de `get_card`.

### Branch e pasta de trabalho

`prepare_workspace` cria (ou reaproveita) a branch da história e, no modo worktree, a pasta de
trabalho dela; pode ser chamada de uma sub-tarefa. `get_card` devolve em `workspace` a branch e a
pasta em que o código deve ser alterado. O nome da branch e a pasta são definidos pelo board; a IA
não deve criar branches por conta própria. Nas execuções pelo board, a pasta das worktrees é
passada à ferramenta como pasta de trabalho extra (`--add-dir`).

`set_pull_request` registra na história o endereço do PR aberto pela IA; ele volta em
`workspace.pullRequest`. A IA não faz o merge: com o merge automático ligado, é o board que roda
`gh pr merge <url> --squash|--merge|--rebase` quando a pessoa aprova a homologação.

### Fases e documentos

Cada coluna em que a IA atua é uma fase. `get_card` devolve em `phase` a instrução da fase, o nome
e o modelo do documento que ela produz e se a coluna exige aprovação. Numa sub-tarefa, `phase` é a
fase da história e `storyArtifacts` lista os documentos já anexados a ela.

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
