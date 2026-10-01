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

1. Rode o comando **Faz AI: Conectar IA (MCP)** (ou o botão em Configurações). Ele registra o
   servidor `faz-ai` no `.mcp.json` da pasta.
2. Reinicie a sessão do Claude Code na pasta e aprove o servidor (`/mcp` mostra o estado). Em outros
   clientes, use a mesma configuração do `.mcp.json`.
3. O VSCode precisa estar aberto nessa pasta enquanto a IA usa o board.

A IA pode fazer tudo o que a interface faz: listar e ler cards (`get_board`, `list_cards`,
`get_card`), criar histórias e sub-tarefas, editar, mover, arquivar, mandar para a lixeira e apagar
de vez, mexer em checklist, comentários e anexos (inclusive ler anexos de texto), e configurar
colunas, tipos, campos e regras. Cards são referidos pelo número (`#12`) e colunas, tipos e campos
pelo nome. Comentários feitos pela IA saem assinados com o nome do cliente (ex.: "Claude Code").

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
