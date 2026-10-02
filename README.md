<img src="media/icon.png" width="96" alt="Ícone do Faz AI Kanban">

# Faz AI Kanban

Um board kanban dentro do editor (VS Code e Cursor), feito para conduzir Spec-Driven Development
(SDD) junto com uma IA. Você organiza o trabalho em histórias e sub-tarefas; a IA lê o board, produz
os artefatos de cada fase e move os cards conforme avança.

![Board com histórias nas fases do SDD e sub-tarefas na linha de baixo](docs/images/board.png)

## Para que serve

- **Planejar em fases.** As colunas das histórias são as fases do fluxo: Backlog, Discovery, PRD,
  Spec, Plan, Implementação, Homologação, Concluído e Cancelado. Cada história se desdobra em
  sub-tarefas, que têm um fluxo próprio (A fazer, Em andamento, Concluído).
- **Dizer à IA o que fazer em cada fase.** Cada coluna tem uma instrução para a IA e, se a fase
  gera um documento (Discovery, PRD, Spec, Plan), o modelo desse documento. No Discovery a IA
  analisa o problema e conversa com você antes de qualquer requisito; na Homologação a história só
  é concluída com a sua aprovação.
- **Trabalhar com a IA no mesmo quadro.** A extensão expõe o board por MCP. Claude Code, Codex,
  Cursor, Kimi Code, GitHub Copilot ou outro cliente MCP podem consultar e editar tudo o que a interface permite, e
  as mudanças aparecem no board na hora.
- **Saber com quem está cada card.** Todo card em que a IA atua tem um status (Pronto, Em execução,
  Aguardando resposta, Aguardando revisão, Aprovado, Bloqueado) que mostra se a pendência está com
  você ou com a IA.
- **Revisar antes de a IA avançar.** Nas colunas que exigem aprovação (Discovery, PRD, Spec, Plan
  e Homologação, por padrão), a IA termina o trabalho, pede a revisão e para. Ela só move o card depois que você aprova.
- **Ver o que espera por você.** O filtro "Com você", o contador no ícone da barra lateral e um
  aviso do editor mostram quando a IA pede revisão, faz uma pergunta ou trava num impedimento. A IA,
  por sua vez, pergunta ao board o que está com ela.
- **Dizer à IA como executar cada card.** Cada card pode indicar o modelo, o nível de esforço e as
  skills obrigatórias. O modelo pode ser sugerido por regras a partir do tamanho da tarefa.
- **Cuidar do harness do projeto.** O arquivo de regras (`CLAUDE.md` ou `AGENTS.md`) e as skills
  são criados, editados, ligados e desligados pelo próprio board.

## Como usar

1. Abra uma pasta no editor e clique no ícone **Faz AI** na barra lateral. Cada pasta tem o seu board.
2. Crie histórias com **+ Novo card** e arraste-as entre as colunas. Clicar numa história mostra só
   as sub-tarefas dela; duplo clique abre o detalhe.
3. No detalhe do card ficam o status, a descrição em Markdown, os campos, o checklist, as
   sub-tarefas, a conversa e os anexos. A conversa é o lugar em que você e a IA falam sobre o card.
   Os documentos das fases (PRD, Spec, Plan…) são construídos nas sub-tarefas, mas ficam anexados à
   história; nas sub-tarefas eles aparecem como links.
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
3. Em **Harness de IA**, clique em **Instalar skill do fluxo**: ela ensina a IA a conduzir os cards
   pelas fases, gerar os documentos, pedir revisão e retomar pendências. É um arquivo do projeto e
   pode ser editado.
4. Abra uma sessão nova da ferramenta na pasta do projeto e peça, por exemplo, "liste os cards do
   board", "pegue a história #1 e escreva o PRD" ou "veja o que está pendente no board e dê andamento".

Fluxo sugerido: a IA lê a história e a instrução da fase, cria uma sub-tarefa para construir o
documento da fase, anexa o documento à história e pede a revisão pela conversa do card. Você
responde no próprio card:

- **Aprovar** deixa o card Aprovado, e a IA o leva para a próxima coluna.
- **Pedir ajustes** devolve o card para a IA com o seu texto na conversa.
- Se a IA fizer uma pergunta, o card fica Aguardando resposta; ao responder na conversa, ele volta
  para a IA.
- **Bloquear** registra um impedimento, com o motivo.

### Chamar a IA pela conversa

Na conversa de qualquer card, **Chamar IA** roda a ferramenta do projeto em segundo plano para ler
a conversa e trabalhar naquele card. Não é um chat ao vivo: a resposta chega como mensagem na
conversa quando a execução termina, e enquanto isso o card fica "Em execução" (com um botão
**Parar**). Imagens coladas na mensagem viram anexos do card e a IA as recebe.

- O que a IA pode fazer nessas execuções se define em Configurações → Harness de IA → **Execução
  pela conversa**: só o board (padrão), board e arquivos do projeto, ou sem restrições.
- Cursor e Kimi Code, quando rodam em segundo plano, só funcionam no nível "sem restrições".
- A ferramenta precisa estar instalada e autenticada, e o servidor do board conectado.
- Se a execução falhar ou passar do tempo limite, o card fica Bloqueado com o motivo. O log
  completo está no painel **Saída → Faz AI**.

### Branch e pasta de trabalho por história

Cada história trabalha numa branch própria, criada pelo board (ex.: `historia/12-login-com-google`).
Por padrão ela vem com uma worktree: uma pasta de trabalho separada, ao lado do projeto, onde a IA
altera o código sem tocar na sua pasta nem nas suas alterações em andamento. As sub-tarefas fazem
commits na branch da história.

- A branch é criada quando a IA começa a implementação (ela chama `prepare_workspace`) ou pelo
  botão **Criar branch da história** no card.
- O card mostra a branch e abre a pasta de trabalho numa janela nova.
- Em Configurações → **Git** ficam o modo (worktree, branch na própria pasta ou desligado), o
  padrão do nome da branch e a pasta das worktrees.
- Cada worktree é uma cópia de trabalho: as dependências precisam ser instaladas nela.

### Heartbeat

Com o heartbeat ligado (Configurações → Harness de IA), o board chama a IA sozinho a cada
intervalo, enquanto o editor estiver aberto na pasta do projeto. Em cada rodada ela avança os cards
aprovados, responde às mensagens pendentes e trabalha nos cards prontos, uma história por vez.

- Sem pendência com a IA, nada é executado.
- Cards que estão com você (aguardando revisão ou resposta, bloqueados) não são tocados, a menos
  que você tenha deixado uma mensagem sem resposta na conversa.
- **Rodar agora** (nas configurações ou pelo comando **Faz AI: Rodar o heartbeat agora**) começa
  uma rodada na hora, mesmo com o heartbeat desligado. **Faz AI: Parar as execuções da IA**
  interrompe tudo.
- A barra de status mostra os cards em execução e a hora da próxima rodada.
- As execuções usam a mesma permissão e o mesmo tempo limite do botão "Chamar IA".

Quais colunas exigem aprovação, e em quais a IA atua, se define em Configurações → Workflows e
colunas. Você mesmo pode mover qualquer card sem aprovação.

O editor precisa estar aberto na pasta do projeto para a IA alcançar o board. O registro manual, os
formatos de cada ferramenta e a solução de problemas estão em [docs/mcp.md](docs/mcp.md).

## Configurações

![Configurações: catálogo de modelos e regras de sugestão](docs/images/settings.png)

| Seção | O que ajusta |
| --- | --- |
| Workflows e colunas | Nomes, ordem e significado das colunas; em quais a IA atua e quais exigem aprovação; a fase de cada coluna (instrução para a IA e modelo do documento); quais começam colapsadas |
| Tipos de card | História, Bug, Sub-tarefa…, com cor e valores padrão de campos por tipo |
| Campos | Campos personalizados (texto, seleção, data, modelo…) e onde aparecem |
| Regras do board | Bloqueios de conclusão e de avanço de fase, confirmações, preenchimento do modelo sugerido |
| Harness de IA | Ferramenta do projeto, arquivo de regras e skills |
| Modelos de IA | Modelos e níveis de esforço da ferramenta; regras que sugerem o modelo de cada card |
| Git | Branch e pasta de trabalho (worktree) de cada história: modo, nome da branch, pasta |
| Aparência | Tema (sistema, claro, escuro), fonte e tamanho dos textos longos; nome e cor dos status |

Sobre os modelos: **Detectar modelos** lê a lista da ferramenta (no Kimi Code, da configuração
local; nas outras, uma lista embutida que pode ser editada). As regras de sugestão combinam
condições com E e OU, por exemplo `Esforço da atividade = Alto E Tags = backend`. O resultado é
sempre uma sugestão: no card, o modelo e o esforço podem ser trocados a qualquer momento.

Quando uma versão nova da extensão muda o board padrão, o board pergunta se você quer atualizá-lo
(ou use **Faz AI: Atualizar board para o padrão atual**). A atualização só acrescenta o que falta:
nenhum card sai do lugar e o que você personalizou é mantido. Uma cópia do banco é gravada antes.

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
