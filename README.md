# Faz AI Kanban

Quadro kanban dentro do VSCode no estilo Kanbanize/Businessmap: duas linhas (workflows) com colunas
independentes, cards pai (Histórias, Bugs, Retrabalho, Débito técnico) na linha de cima e Sub-tarefas
na linha de baixo, campos personalizáveis e checklist por card.

## Uso

1. Abra uma pasta no VSCode e clique no ícone **Faz AI** na barra lateral. O board abre no editor e a
   barra lateral mostra um resumo (colunas, histórias, sub-tarefas); clicar num item abre o card.
2. **Colunas:** duplo clique no nome renomeia; o menu `⋯` marca como concluída, move e exclui;
   `+ Coluna` no fim da linha cria uma nova.
3. **Cards:** clique numa história filtra as sub-tarefas dela; duplo clique (ou ⤢) abre o detalhe.
   O menu `⋯` do card arquiva ou move para a lixeira.
4. **Arquivados:** o botão "Arquivados" mostra uma coluna extra em cada linha. Arraste um card para
   ela para arquivar, ou de volta para uma coluna para desarquivar.
5. **Lixeira:** aba no topo, com restaurar, apagar de vez e esvaziar.
6. **Filtros:** busca por palavra-chave e painel com tipo, campos, data/período e relacionamentos.
7. **Detalhe do card:** abas Detalhes (campos, descrição com editor Markdown e modo expandido,
   checklist, sub-tarefas), Comentários e Anexos (seletor, arrastar com Shift, ou colar).

Os dados ficam no `globalStorageUri` da extensão: `fazai.db` (SQLite, um board por pasta de workspace)
e `attachments/<cardId>/`. Nada é gravado dentro do repositório. Evite editar o mesmo board em duas
janelas do VSCode ao mesmo tempo: cada janela mantém o banco em memória e a última a salvar vence.

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
