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
4. **Arquivados:** cada linha tem uma coluna "Arquivados" no fim, colapsada por padrão. Arraste um
   card para ela (mesmo colapsada) para arquivar, ou de volta para uma coluna para desarquivar. Os
   arquivados também aparecem num grupo próprio na barra lateral.
   **Colapsar:** linhas e colunas abrem e fecham com um clique no cabeçalho, e a escolha fica
   lembrada por workspace. O estado inicial de cada uma ("Começa colapsada") fica em
   Configurações → Workflows e colunas.
5. **Lixeira:** aba no topo, com restaurar, apagar de vez e esvaziar.
6. **Filtros:** busca por palavra-chave ou pelo ID do card (`#12`) no board; a seção **Filtros** da barra lateral tem tipo, campos,
   data/período e relacionamentos. Os filtros ativos aparecem como
   chips no board e são lembrados por workspace.
7. **Regras:** em Configurações → Regras, cada regra aparece como "quando… então…" com seu controle:
   bloquear conclusão com sub-tarefas em aberto, o que fazer com as sub-tarefas ao cancelar uma
   história, o que fazer com a história ao concluir a última sub-tarefa, e quando pedir confirmação ao excluir ou arquivar.
8. **Detalhe do card:** abas Detalhes (campos, descrição com editor Markdown e modo expandido,
   checklist, sub-tarefas), Comentários e Anexos (seletor, arrastar com Shift, ou colar).

Os dados do board ficam no `globalStorageUri` da extensão: `fazai.db` (SQLite, um board por pasta de
workspace) e `attachments/<cardId>/`. Evite editar o mesmo board em duas janelas do VSCode ao mesmo
tempo: cada janela mantém o banco em memória e a última a salvar vence.

## Board padrão para SDD

Um board novo já nasce preparado para Spec-Driven Development:

- **Colunas das histórias = fases do SDD:** Backlog, PRD, Spec, Plan, Implementação, Concluído e
  Cancelado. As sub-tarefas usam A fazer, Em andamento e Concluído.
- **Campo Fase** nas sub-tarefas (PRD, Spec, Plan, Implementação): diz a qual fase da história a
  sub-tarefa pertence.
- **Regra de avanço de fase:** uma história não avança de coluna enquanto houver sub-tarefas em
  aberto cuja Fase é a coluna atual. Voltar de coluna e cancelar continuam livres. Liga e desliga em
  Configurações → Regras do board.
- **Campo Modelo:** qual modelo de IA deve executar o card e com que nível de esforço (por exemplo
  "Fable 5.1 · low" ou "Opus 5.5 · high"). As opções vêm do catálogo de modelos do board.
- **Campo Esforço:** tamanho da tarefa (Baixo, Médio, Alto). As regras de sugestão escolhem o modelo
  a partir dele.
- **Campo Skills:** skills que devem ser carregadas obrigatoriamente na execução do card. As opções
  são as skills ligadas do projeto. Outras skills continuam podendo ser usadas normalmente.
- **Padrões por tipo:** em Configurações → Tipos de card, cada tipo pode ter valores padrão de campos
  (por exemplo Modelo e Skills), preenchidos em todo card novo daquele tipo.

Para trazer um board antigo para esse padrão, use **Recriar board padrão** em Configurações. Isso
apaga todos os cards e configurações do board.

## Modelos de IA

Configurações → **Modelos de IA** tem duas partes.

**Catálogo.** Os modelos que cada ferramenta oferece, com os níveis de esforço que cada um aceita e
o esforço padrão. O botão **Detectar modelos** de cada ferramenta atualiza a lista:

| Ferramenta | De onde vem a lista ao detectar |
| --- | --- |
| Kimi Code | Do `config.toml` do Kimi nesta máquina: os modelos reais da sua conta e os esforços de cada um |
| Claude Code, Codex, Cursor | Lista embutida na extensão, tirada da documentação de cada ferramenta |

Essas três ferramentas não guardam a lista de modelos em arquivo, então a lista embutida pode ficar
desatualizada. Para corrigir, edite o catálogo à mão ou peça à própria IA, pelo MCP, que registre
os modelos que ela tem (`upsert_model`). Modelos acrescentados à mão são mantidos ao detectar.

**Sugestão de modelo.** Uma lista de regras que sugerem um modelo a partir dos atributos do card.

- **Montar nova regra** abre o montador: condições sobre o tipo do card e os campos de seleção
  (Esforço, Tags, Fase…), com "é" ou "não é". As condições de um grupo valem juntas (**E**); cada
  grupo alternativo é um **OU**. Exemplo: `Esforço = Alto E Tags = backend OU Tipo = Bug`.
- **Adicionar à lista** põe a regra em uso. Na lista, cada regra pode ser ligada, desligada,
  editada, removida e reordenada; a primeira regra ligada que casa vence.
- Os botões "Recriar as regras de Esforço com os modelos de…" geram as três regras (Baixo, Médio,
  Alto) com um modelo leve, um intermediário e um forte da ferramenta escolhida.

O resultado é sempre uma sugestão: no card, o modelo e o esforço podem ser trocados a qualquer
momento.

- Por padrão, a sugestão preenche o campo Modelo enquanto ele está vazio ou ainda tem a sugestão
  anterior. Isso desliga em Configurações → Regras do board ("Preencher o modelo sugerido").
- Um modelo escolhido à mão nunca é trocado. Quando ele difere da sugestão, o card mostra um
  botão pequeno (✦ com o modelo sugerido) que aplica a sugestão, e o detalhe mostra o link "Usar".

Um board novo já nasce com o catálogo das ferramentas em uso e com as regras de Esforço da primeira
ferramenta instalada na máquina.

## Harness de IA

Configurações → **Harness de IA** gerencia, pelo board, o que as ferramentas de IA leem no projeto.

**Ferramentas usadas neste projeto.** Marque Claude Code, Codex, Cursor e/ou Kimi Code. Cada uma lê
lugares diferentes, e o board usa essa escolha para gravar tudo onde elas enxergam:

| Ferramenta | Regras | Skills do projeto |
| --- | --- | --- |
| Claude Code | `CLAUDE.md` | `.claude/skills` |
| Codex | `AGENTS.md` | `.agents/skills` |
| Cursor | `AGENTS.md` | `.agents/skills`, `.cursor/skills`, `.claude/skills` |
| Kimi Code | `AGENTS.md` | `.kimi/skills`, `.claude/skills`, `.agents/skills` |

**Regras do projeto.** Cria, edita e apaga `CLAUDE.md`, `AGENTS.md` e `GEMINI.md` na raiz. Para
manter as regras num arquivo só, escreva no `AGENTS.md` e use o botão **Usar o AGENTS.md** no
`CLAUDE.md`: ele cria um `CLAUDE.md` que apenas importa o outro (`@AGENTS.md`).

**Skills.** Cria, edita, liga, desliga e apaga skills (`<pasta>/<nome>/SKILL.md`).

- Com o Claude Code marcado, as skills ficam em `.claude/skills`. Se o Codex também estiver
  marcado, cada skill ganha um atalho (symlink) em `.agents/skills`, que é o único lugar que o Codex
  lê. Sem o Claude Code, as skills ficam em `.agents/skills`.
- Desligar move a pasta para `<pasta>-disabled` e remove o atalho: a skill sai do contexto de todas
  as ferramentas e o conteúdo fica guardado. Manter ligado só o necessário economiza contexto.
- Skills que já existiam em qualquer uma das duas pastas aparecem no board.

São arquivos da pasta do projeto, então entram no git normalmente, e mudanças feitas por fora (no
editor, pela IA, por um `git pull`) aparecem no board.

## Usando com IA (MCP)

O board pode ser consultado e editado por uma IA (Claude Code, Cursor, Copilot ou qualquer cliente
MCP). A extensão roda um servidor MCP local para a pasta aberta; tudo o que a IA faz aparece no
board na hora, e as regras do board valem para ela também.

### Como conectar

Rode **Faz AI: Conectar IA (MCP)** (ou o botão em Configurações → Harness de IA), marque as
ferramentas que você usa e o board grava a configuração no lugar e no formato que cada uma lê:

| Ferramenta | Onde o servidor é registrado | Depois de registrar |
| --- | --- | --- |
| Claude Code | `.mcp.json` na pasta do projeto | Abra uma sessão nova e aprove o servidor (`/mcp` mostra o estado) |
| Codex | `.codex/config.toml` na pasta do projeto | O projeto precisa estar marcado como confiável; `codex mcp list` confere |
| Cursor | `.cursor/mcp.json` na pasta do projeto | Ative o servidor em Settings → MCP |
| Kimi Code | `~/.kimi-code/mcp.json` e/ou `~/.kimi/mcp.json` (global) | Abra uma sessão nova a partir da pasta do projeto |

Os arquivos do projeto guardam caminhos desta máquina; o comando oferece colocá-los no `.gitignore`.
A lista de ferramentas só é carregada no início da sessão, então sempre abra uma sessão nova.

O Kimi só tem configuração global, por isso o registro dele não fixa a pasta: a ponte descobre o
projeto pelo diretório em que a sessão foi aberta.

#### Registro manual

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

Outros clientes MCP com transporte stdio (VS Code/Copilot em `.vscode/mcp.json` com a chave
`servers`, Gemini CLI em `~/.gemini/settings.json`) funcionam com o mesmo comando.

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

Também pelo MCP: catálogo e regras de modelos (`get_models`, `detect_models`, `upsert_model`,
`set_model_rules`), padrões por tipo de card (`update_card_type`), recriar o board (`reset_board`) e o
harness inteiro (`get_harness`, `read_rule_file`, `write_rule_file`, `create_skill`, `update_skill`,
`set_skill_enabled`, `delete_skill`…).

Ao ler um card (`get_card`), a IA recebe a ferramenta, o **modelo** e o **esforço** que devem executá-lo e as **Skills**
obrigatórias com o caminho de cada `SKILL.md`. Ela é instruída a carregar essas skills antes de
executar e a delegar o trabalho a um subagente com o modelo escolhido, ou avisar quando o cliente
não permite. Isso é uma orientação ao cliente de IA: cada ferramenta decide se e como a segue.

Fluxo SDD sugerido: a IA lê a história, produz o artefato da fase (PRD, Spec, Plan) e o anexa ao
card, cria as sub-tarefas com o campo Fase, move cada uma conforme avança, comenta o resultado e
move a história para a próxima coluna ao fechar a fase.

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
