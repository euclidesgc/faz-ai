<img src="media/icon.png" width="96" alt="Ícone do Faz AI Kanban">

# Faz AI Kanban

Um board kanban dentro do editor (VS Code e Cursor), feito para conduzir Spec-Driven Development
(SDD) junto com uma IA. Você organiza o trabalho em histórias e sub-tarefas; a IA lê o board, produz
os artefatos de cada fase e move os cards conforme avança.

![Board com histórias nas fases do SDD e sub-tarefas na linha de baixo](docs/images/board.png)

## Para que serve

- **Planejar em fases.** As colunas das histórias são as fases do SDD: Backlog, PRD, Spec, Plan,
  Implementação, Concluído e Cancelado. Cada história se desdobra em sub-tarefas, que têm um fluxo
  próprio (A fazer, Em andamento, Concluído).
- **Trabalhar com a IA no mesmo quadro.** A extensão expõe o board por MCP. Claude Code, Codex,
  Cursor, Kimi Code, GitHub Copilot ou outro cliente MCP podem consultar e editar tudo o que a interface permite, e
  as mudanças aparecem no board na hora.
- **Dizer à IA como executar cada card.** Cada card pode indicar o modelo, o nível de esforço e as
  skills obrigatórias. O modelo pode ser sugerido por regras a partir do tamanho da tarefa.
- **Cuidar do harness do projeto.** O arquivo de regras (`CLAUDE.md` ou `AGENTS.md`) e as skills
  são criados, editados, ligados e desligados pelo próprio board.

## Como usar

1. Abra uma pasta no editor e clique no ícone **Faz AI** na barra lateral. Cada pasta tem o seu board.
2. Crie histórias com **+ Novo card** e arraste-as entre as colunas. Clicar numa história mostra só
   as sub-tarefas dela; duplo clique abre o detalhe.
3. No detalhe do card ficam a descrição em Markdown, os campos, o checklist, as sub-tarefas, os
   comentários e os anexos (é onde entram PRD, Spec e Plan).
4. Busque por texto ou pelo ID (`#12`). A seção **Filtros** da barra lateral filtra por tipo,
   campos, datas e relacionamentos.
5. Cards podem ser arquivados (coluna "Arquivados" no fim de cada linha) ou enviados para a
   **Lixeira**, de onde podem ser restaurados.

Por padrão, uma história não é concluída nem avança de fase enquanto tiver sub-tarefas em aberto
daquela fase. Essas regras podem ser desligadas nas configurações.

## Usando com IA

1. Em Configurações → **Harness de IA**, escolha a ferramenta do projeto (Claude Code, Codex,
   Cursor, Kimi Code ou GitHub Copilot).
2. Clique em **Conectar IA (MCP)**. O board registra o servidor no arquivo que a ferramenta lê.
3. Abra uma sessão nova da ferramenta na pasta do projeto e peça, por exemplo, "liste os cards do
   board" ou "pegue a história #1 e escreva o PRD".

Fluxo sugerido: a IA lê a história, produz o artefato da fase e o anexa ao card, cria as
sub-tarefas, move cada uma conforme avança, comenta o resultado e leva a história para a próxima
coluna ao fechar a fase.

O editor precisa estar aberto na pasta do projeto para a IA alcançar o board. O registro manual, os
formatos de cada ferramenta e a solução de problemas estão em [docs/mcp.md](docs/mcp.md).

## Configurações

![Configurações: catálogo de modelos e regras de sugestão](docs/images/settings.png)

| Seção | O que ajusta |
| --- | --- |
| Workflows e colunas | Nomes, ordem e significado das colunas; quais começam colapsadas |
| Tipos de card | História, Bug, Sub-tarefa…, com cor e valores padrão de campos por tipo |
| Campos | Campos personalizados (texto, seleção, data, modelo…) e onde aparecem |
| Regras do board | Bloqueios de conclusão e de avanço de fase, confirmações, preenchimento do modelo sugerido |
| Harness de IA | Ferramenta do projeto, arquivo de regras e skills |
| Modelos de IA | Modelos e níveis de esforço da ferramenta; regras que sugerem o modelo de cada card |
| Aparência | Tema (sistema, claro, escuro), fonte e tamanho dos textos longos |

Sobre os modelos: **Detectar modelos** lê a lista da ferramenta (no Kimi Code, da configuração
local; nas outras, uma lista embutida que pode ser editada). As regras de sugestão combinam
condições com E e OU, por exemplo `Esforço da atividade = Alto E Tags = backend`. O resultado é
sempre uma sugestão: no card, o modelo e o esforço podem ser trocados a qualquer momento.

## Onde ficam os dados

O board e os anexos ficam no armazenamento da extensão, fora do repositório. Regras e skills são
arquivos da pasta do projeto e entram no git normalmente. Evite editar o mesmo board em duas janelas
ao mesmo tempo: a última a salvar vence.

## Desenvolvimento

```sh
npm install
npm run build
npm test
npm run typecheck
```

Pressione `F5` para abrir o Extension Development Host. O código fica em `src/extension` (host e
servidor MCP), `src/webview` (interface em React), `src/shared` (modelo e protocolo) e
`src/mcp-bridge` (ponte stdio usada pelos clientes de IA).

## Licença

[MIT](LICENSE)
