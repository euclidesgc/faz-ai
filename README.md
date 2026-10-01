# Faz AI Kanban

Quadro kanban dentro do VSCode no estilo Kanbanize/Businessmap: duas linhas (workflows) com colunas
independentes, cards pai (Histórias, Bugs, Retrabalho, Débito técnico) na linha de cima e Sub-tarefas
na linha de baixo, campos personalizáveis e checklist por card.

## Uso

1. Abra uma pasta no VSCode e clique no ícone **Faz AI** na barra lateral. O board abre no editor e a
   barra lateral mostra um resumo (colunas, histórias, sub-tarefas); clicar num item abre o card.
2. **Colunas:** duplo clique no nome renomeia; o menu `⋯` move, exclui e define o que a coluna
   representa (trabalho em aberto, conclusão ou cancelamento); `+ Coluna` cria uma nova.
   **Regra:** uma história só entra numa coluna de conclusão quando não tem sub-tarefas em aberto.
3. **Cards:** clique numa história filtra as sub-tarefas dela; duplo clique (ou ⤢) abre o detalhe.
   O menu `⋯` do card arquiva ou move para a lixeira.
4. **Arquivados:** o botão "Arquivados" mostra uma coluna extra em cada linha. Arraste um card para
   ela para arquivar, ou de volta para uma coluna para desarquivar.
5. **Lixeira:** aba no topo, com restaurar, apagar de vez e esvaziar.
6. **Filtros:** busca por palavra-chave ou pelo ID do card (`#12`) no board; a seção **Filtros** da barra lateral tem tipo, campos,
   data/período e relacionamentos. Os filtros ativos aparecem como
   chips no board e são lembrados por workspace.
7. **Regras:** em Configurações → Regras, cada regra aparece como "quando… então…" com seu controle:
   bloquear conclusão com sub-tarefas em aberto, o que fazer com as sub-tarefas ao cancelar uma
   história, o que fazer com a história ao concluir a última sub-tarefa, e quando pedir confirmação ao excluir ou arquivar.
8. **Detalhe do card:** abas Detalhes (campos, descrição com editor Markdown e modo expandido,
   checklist, sub-tarefas), Comentários e Anexos (seletor, arrastar com Shift, ou colar).

Os dados ficam no `globalStorageUri` da extensão: `fazai.db` (SQLite, um board por pasta de workspace)
e `attachments/<cardId>/`. Nada é gravado dentro do repositório. Evite editar o mesmo board em duas
janelas do VSCode ao mesmo tempo: cada janela mantém o banco em memória e a última a salvar vence.

## Usando com IA (MCP)

O board pode ser consultado e editado por uma IA (Claude Code, Cursor, Copilot ou qualquer cliente
MCP). A extensão roda um servidor MCP local para a pasta aberta; tudo o que a IA faz aparece no
board na hora, e as regras do board valem para ela também.

### Como conectar

O servidor é iniciado por um comando só, igual em todos os clientes:

```sh
node "<bridge.js>" "<pasta do projeto>"
```

- `<bridge.js>` fica no armazenamento da extensão:
  - macOS: `~/Library/Application Support/Code/User/globalStorage/euclidesgc.faz-ai/mcp/bridge.js`
  - Linux: `~/.config/Code/User/globalStorage/euclidesgc.faz-ai/mcp/bridge.js`
  - Windows: `%APPDATA%\Code\User\globalStorage\euclidesgc.faz-ai\mcp\bridge.js`
- `<pasta do projeto>` é opcional. Sem ela, vale a variável `FAZAI_WORKSPACE` ou o diretório em que
  o cliente foi iniciado (subindo pelas pastas pais até achar um board ativo). Use sem a pasta em
  configurações globais, para o mesmo registro servir a todos os projetos.

O comando **Faz AI: Conectar IA (MCP)** (ou o botão em Configurações) grava o `.mcp.json` da pasta
e, em "Copiar configuração", entrega o trecho JSON com os caminhos já preenchidos.

Atenção: o `.mcp.json` do projeto só é lido por alguns clientes (Claude Code, por exemplo). Os
demais leem a própria configuração, e o servidor precisa ser registrado nela.
Nos exemplos abaixo, `BRIDGE` é o caminho do `bridge.js`:

```sh
BRIDGE="$HOME/Library/Application Support/Code/User/globalStorage/euclidesgc.faz-ai/mcp/bridge.js"
```

**Claude Code** — lê o `.mcp.json` do projeto (reinicie a sessão e aprove o servidor). Ou, para
todos os projetos:

```sh
claude mcp add --scope user faz-ai -- node "$BRIDGE"
```

**Kimi Code** — usa a própria configuração, não o `.mcp.json`. Registre pela CLI:

```sh
kimi mcp add --transport stdio faz-ai -- node "$BRIDGE"
```

ou acrescente em `~/.kimi-code/mcp.json` (`~/.kimi/mcp.json` na Kimi CLI), dentro de `mcpServers`,
e abra uma sessão nova:

```json
"faz-ai": {
  "transport": "stdio",
  "command": "node",
  "args": ["/Users/VOCE/Library/Application Support/Code/User/globalStorage/euclidesgc.faz-ai/mcp/bridge.js"]
}
```

**Codex** — pela CLI:

```sh
codex mcp add faz-ai -- node "$BRIDGE"
```

ou em `~/.codex/config.toml`:

```toml
[mcp_servers.faz-ai]
command = "node"
args = ["/Users/VOCE/Library/Application Support/Code/User/globalStorage/euclidesgc.faz-ai/mcp/bridge.js"]
```

**Cursor** — `.cursor/mcp.json` na pasta do projeto (ou `~/.cursor/mcp.json` para todos), com o
mesmo conteúdo do `.mcp.json`:

```json
{
  "mcpServers": {
    "faz-ai": { "command": "node", "args": ["<bridge.js>", "<pasta do projeto>"] }
  }
}
```

**VS Code (Copilot)** — `.vscode/mcp.json` na pasta do projeto; note a chave `servers`:

```json
{
  "servers": {
    "faz-ai": { "type": "stdio", "command": "node", "args": ["<bridge.js>", "${workspaceFolder}"] }
  }
}
```

**Gemini CLI** — em `~/.gemini/settings.json` (ou `.gemini/settings.json` no projeto), a mesma
entrada `mcpServers` do Cursor.

**Outros clientes** — qualquer cliente MCP com transporte stdio funciona com o comando acima.

Depois de registrar, reinicie a sessão do cliente: a lista de ferramentas só é carregada no início.

### Se as ferramentas não aparecem

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

### O que a IA pode fazer

A IA pode fazer tudo o que a interface faz: listar e ler cards (`get_board`, `list_cards`,
`get_card`), criar histórias e sub-tarefas, editar, mover, arquivar, mandar para a lixeira e apagar
de vez, mexer em checklist, comentários e anexos (inclusive ler anexos de texto), e configurar
colunas, tipos, campos e regras. Cards são referidos pelo número (`#12`) e colunas, tipos e campos
pelo nome. Comentários feitos pela IA saem assinados com o nome do cliente (ex.: "Claude Code").

O campo **Modelo** (seleção, criado por padrão) diz qual modelo de IA deve executar o card. A IA é
instruída a ler esse campo e delegar o trabalho a um subagente com o modelo escolhido, ou avisar
quando o cliente não permite. As opções são editáveis em Configurações → Campos.

Fluxo SDD sugerido: a IA lê a história, anexa PRD/Spec/Plan ao card, cria as sub-tarefas com o
campo Fase, move cada uma conforme avança e comenta o resultado.

## Desenvolvimento

```sh
npm install
npm run build        # dist/extension.js + dist/webview
npm test             # vitest (repositórios e persistência)
npm run typecheck
```

Pressione `F5` para abrir o Extension Development Host. `npm run watch:ext` e `npm run watch:web`
recompilam em paralelo; recarregue a janela (`Developer: Reload Window`) para ver mudanças.

## Estrutura

- `src/shared/` tipos do modelo e protocolo de mensagens host ↔ webview
- `src/extension/` extension host: `db/` (sql.js, schema, seed), `repositories/`, `panel/`
- `src/webview/` React + Vite: `store/` (zustand), `components/`
- `test/` testes vitest contra sql.js em memória
