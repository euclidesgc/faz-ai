# Faz AI Kanban: conexão com IA (MCP) em detalhe

O board pode ser consultado e editado por uma IA (Claude Code, Codex, Cursor, Kimi Code, GitHub Copilot ou qualquer cliente
MCP). A extensão roda um servidor MCP local para a pasta aberta; tudo o que a IA faz aparece no
board na hora, e as regras do board valem para ela também.

## Como conectar

Rode **Faz AI: Conectar IA (MCP)** (ou o botão em Configurações → Harness de IA). O board registra
o servidor na ferramenta em uso no projeto, no lugar e no formato que ela lê:

| Ferramenta | Onde o servidor é registrado | Depois de registrar |
| --- | --- | --- |
| Claude Code | `.mcp.json` na pasta do projeto | Abra uma sessão nova e aprove o servidor (`/mcp` mostra o estado) |
| Codex | `.codex/config.toml` na pasta do projeto | O projeto precisa estar marcado como confiável; `codex mcp list` confere |
| Cursor | `.cursor/mcp.json` na pasta do projeto | Ative o servidor em Settings → MCP |
| Kimi Code | `~/.kimi-code/mcp.json` e/ou `~/.kimi/mcp.json` (global) | Abra uma sessão nova a partir da pasta do projeto |
| GitHub Copilot | `.vscode/mcp.json` (VS Code) e `.mcp.json` (Copilot CLI) na pasta do projeto | No VS Code, confirme a confiança e inicie o servidor (**MCP: List Servers**); na CLI, abra uma sessão nova e confirme a confiança na pasta |

Os arquivos do projeto guardam caminhos desta máquina; o comando oferece colocá-los no `.gitignore`.
A lista de ferramentas só é carregada no início da sessão, então sempre abra uma sessão nova.

O Kimi só tem configuração global, por isso o registro dele não fixa a pasta: a ponte descobre o
projeto pelo diretório em que a sessão foi aberta.

O Copilot tem dois arquivos porque a Copilot CLI não lê o `.vscode/mcp.json`. O agente do Copilot que
roda no GitHub (cloud agent) não é atendido: ele executa fora desta máquina e não alcança o servidor local.

### Registro manual

O servidor é sempre o mesmo comando:

```sh
node "<bridge.js>" "<pasta do projeto>"
```

- `<bridge.js>` fica no armazenamento da extensão:
  - macOS: `~/Library/Application Support/Code/User/globalStorage/euclidesgc.faz-ai/mcp/bridge.js`
  - Linux: `~/.config/Code/User/globalStorage/euclidesgc.faz-ai/mcp/bridge.js`
  - Windows: `%APPDATA%\Code\User\globalStorage\euclidesgc.faz-ai\mcp\bridge.js`
- `<pasta do projeto>` é opcional. Sem ela, vale a variável `FAZAI_WORKSPACE` ou o diretório em que
  o cliente foi iniciado (subindo pelas pastas pais até achar um board ativo). Use sem a pasta em
  registros globais, para o mesmo registro servir a todos os projetos.

Pelas CLIs, com `BRIDGE` apontando para o `bridge.js`:

```sh
BRIDGE="$HOME/Library/Application Support/Code/User/globalStorage/euclidesgc.faz-ai/mcp/bridge.js"

claude mcp add --scope user faz-ai -- node "$BRIDGE"        # Claude Code, todos os projetos
codex mcp add faz-ai -- node "$BRIDGE"                      # Codex, global (~/.codex/config.toml)
kimi mcp add --transport stdio faz-ai -- node "$BRIDGE"     # Kimi, global
copilot mcp add faz-ai -- node "$BRIDGE"                    # Copilot CLI, global (~/.copilot/mcp-config.json)
```

O Cursor não tem comando de CLI para isso: edite `.cursor/mcp.json` (projeto) ou `~/.cursor/mcp.json`
(global). Os formatos gravados pelo board:

```json
// .mcp.json (Claude Code) e .cursor/mcp.json (Cursor)
{ "mcpServers": { "faz-ai": { "type": "stdio", "command": "node", "args": ["<bridge.js>", "<pasta do projeto>"] } } }
```

```toml
# .codex/config.toml (Codex)
[mcp_servers.faz-ai]
command = "node"
args = ["<bridge.js>", "<pasta do projeto>"]
```

```json
// ~/.kimi-code/mcp.json (Kimi Code)
{ "mcpServers": { "faz-ai": { "transport": "stdio", "command": "node", "args": ["<bridge.js>"] } } }
```

```json
// .vscode/mcp.json (GitHub Copilot no VS Code); a chave é `servers`
{ "servers": { "faz-ai": { "type": "stdio", "command": "node", "args": ["<bridge.js>", "<pasta do projeto>"] } } }
```

```json
// .mcp.json (Copilot CLI)
{ "mcpServers": { "faz-ai": { "type": "stdio", "command": "node", "args": ["<bridge.js>", "<pasta do projeto>"], "tools": ["*"] } } }
```

Outros clientes MCP com transporte stdio (Gemini CLI em `~/.gemini/settings.json`, por exemplo)
funcionam com o mesmo comando.

## Se as ferramentas não aparecem

1. O VSCode precisa estar aberto na pasta do projeto, com a extensão ativa. O servidor existe
   enquanto houver um socket em `~/.faz-ai/` (um arquivo `.sock` por pasta aberta).
2. Teste o servidor fora do cliente; a resposta deve conter `"name":"faz-ai"`:

   ```sh
   cd <pasta do projeto>
   echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"teste","version":"1"}}}' | node "$BRIDGE"
   ```

   Se vier "O board do Faz AI não está acessível", a extensão não está ativa para essa pasta.
3. Se o teste passa e o cliente não mostra as ferramentas, o servidor não está registrado na
   configuração que esse cliente lê, ou a sessão não foi reiniciada depois do registro.
4. Se o cliente inicia servidores a partir de outro diretório, passe a pasta do projeto como
   segundo argumento ou em `FAZAI_WORKSPACE`.

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
