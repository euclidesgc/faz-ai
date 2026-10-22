[🇧🇷 Português](fluxo.md) · 🇺🇸 English

# Story flow with the AI

This is the detailed manual of how a story moves through the board with the AI: what each phase
asks for, how you answer on the card, what the AI buttons do and how cards relate to each other.

## What it is for

- **Plan in phases.** The story columns are the phases of the flow: Backlog, Discovery, PRD, Spec,
  Plan, Implementação (implementation), Revisão (review), Homologação (acceptance), Concluído (done)
  and Cancelado (cancelled). Each story breaks down into sub-tasks, which have their own flow: A
  fazer (to do), Em andamento (in progress), Concluído (done).
- **Tell the AI what to do in each phase.** Each column has an instruction for the AI and, if the
  phase produces a document (Discovery, PRD, Spec, Plan), the template for that document. In
  Discovery the AI analyzes the problem and talks to you before any requirement is written; in
  Homologação the story is only completed with your approval. Discovery records a **code map**
  (files, functions, patterns and tests), Spec completes it, and PRD, Spec and Plan start from it and
  read only what is missing; each Plan sub-task carries the files it will touch in its description.
- **Work with the AI on the same board.** The extension exposes the board over MCP. Claude Code,
  Cursor or any other MCP client can read and edit everything the interface allows, and the changes
  show up on the board right away.
- **Know who has each card.** Every card the AI works on has a status: Pronto (ready), Em execução
  (running), Aguardando resposta (waiting for an answer), Aguardando revisão (waiting for review),
  Aprovado (approved) or Bloqueado (blocked). It shows whether the next move is yours or the AI's.
- **Review before the AI moves on.** In columns that require approval (Discovery, PRD, Spec, Plan and
  Homologação by default), the AI finishes the work, asks for review and stops. It only moves the
  card after you approve.
- **See what is waiting for you.** The "Com você" (with you) filter, the counter on the sidebar icon
  and an editor notification show when the AI asks for a review, asks a question or hits a blocker.
  The AI, in turn, asks the board what is waiting for it.
- **Tell the AI how to run each card.** Each card can name the model, the effort level and the
  required skills. The model can be suggested by rules based on the size of the task.
- **Decide beforehand what the AI uses.** An agent sets the skills, MCP servers, tools and model for
  each phase or card, instead of letting the tool figure it out during the conversation. Every run
  started by the board goes through an agent.
- **A harness that belongs to the board.** Rules, skills, subagents and MCP servers live in a library
  kept in the board's database, each in its own mode (Always, By card or Off). The board does not
  scan the AI tools' folders or write to them: it only reads what you import. Plugins, hooks and
  permissions of the tool do not appear in the Harness screen; the connection to the board lives
  under **Conectar ao board** (connect to the board).

## The suggested flow

Open a new session of the tool in the project folder and ask, for example, "list the cards on the
board", "take story #1 and write the PRD" or "check what is pending on the board and move it
forward".

The AI reads the story and the phase instruction, creates a sub-task to build the phase document,
attaches the document to the story and asks for review in the card's conversation. You answer on
the card itself:

- **Aprovar** (approve) takes the card to the next column right away (the status starts over there,
  Pronto for the AI). It only stays Aprovado, for the AI to move, when the board cannot: the approval
  that triggers the automatic merge concludes the card after the merge, and a conclusion refused
  because of an open sub-task leaves a notice in the conversation.
- **Pedir ajustes** (request changes) sends the card back to the AI with your text in the
  conversation.
- If the AI asks a question, the card waits for an answer; once you reply in the conversation, it
  goes back to the AI.
- **Bloquear** (block) records a blocker, with the reason.

Which columns require approval, and in which ones the AI works, is set in Configurações → Workflows
e colunas. You can always move any card yourself without approval.

### Questions with options

When the AI needs a decision between alternatives, it records the questions on the card
(`ask_questions`), each with short options and the recommended one, and explains the details in the
description. The card stays in **Aguardando resposta** (waiting for an answer). Answers go into the
**Perguntas e respostas** (Questions and answers) section of the description; answering the same
question again replaces the previous answer. In autonomous mode, the board answers each question
with the recommended option, records it in the same section and the AI carries on. An open question,
without options, is still `ask_question`.

Questions with options appear on the open card, below the description, in a carousel: one question
at a time, with the **{n} de {total}** counter (step n of total) and the recommended option marked
with the **Indicada** (Recommended) badge. Clicking an option records the answer and moves on; to
write your own answer, use the field of that question. **Anterior** (Previous) and **Próxima** (Next)
go back and forward. The last screen is the summary, with the unanswered questions; **Enviar
respostas** (Send answers) records everything in the **Perguntas e respostas** section and hands the
turn back to the AI.

## What each phase delivers

The instructions and document templates of the default board ask, in each phase, for what makes the
code review quick later:

- **Short track for small stories.** With the rule on (Settings → Rules; off by default), a story
  with **Baixo** (low) effort or of type **Bug** approved in Discovery, or advanced by the autopilot,
  goes straight to Plan, skipping PRD and Spec, and the Plan starts from the DISCOVERY. The rule reads
  the current effort and type at each advance: if Discovery finds the story is bigger than it looked,
  the AI raises the effort and the story follows the full track. To force the full track on a small
  story, drag it (or ask the AI to move it with `move_card`) to PRD or Spec: an explicit move is never
  redirected. The skipped columns are recognized by the document they produce (PRD.md and SPEC.md),
  so renaming them does not turn the rule off.
- **Spec with the program design.** Besides the architecture, the Spec brings the new or changed
  types and signatures, the file of each one and who calls whom on the main path, with the feature
  flow in Mermaid diagrams. Discarded alternatives come with the reason for each one.
- **Plan with parts that are easy to review.** Each step is an understandable part of the delivery
  and says how to check it (test, typecheck, command or screen); splitting by layer is fine, as long
  as each part can be checked. The plan estimates the lines of code of the delivery: above about 400,
  the AI keeps the first part in the story and creates the next ones as **derived stories**, in order
  (`create_card` with `derived_from` pointing to the previous part). The branch of each derived story
  starts from the branch of the previous part and its pull request is stacked on top of that one; the
  card shows **Derivada de #N** (derived from #N). If the previous part has no branch yet, the derived
  story waits for it before creating its own.
- **Review before the pull request.** After Implementação, the **Revisão** (review) column runs the
  project's checks (typecheck, lint, tests and build, as the project defines them) and reviews the
  story's diff with independent eyes: it delegates to the `revisor-de-codigo` agent, in a new
  session, when that agent is among the board's agents. Besides defects, the review looks for code
  that only passes the test (a new test that already passed before the change, a test changed
  together with the code it covers, a try/catch that swallows errors, a forced cast, new coupling).
  What has a clear guideline is fixed right away; what is ambiguous or changes the agreed behavior
  becomes a question for you, and the AI stops. The column doesn't ask for approval: the result stays
  in the conversation and goes into the PR's **Como revisar** (how to review).
- **A pull request that explains the delivery.** In Homologação, the PR body brings the **Objetivo**
  (goal), **O que foi feito** (what was done), **Como revisar** (how to review: where to start
  reading, the order of the commits and the size of the diff), the **Decisões** (decisions: why the
  chosen path, the discarded alternatives and the deviations from the plan) and the **Como testar**
  (how to test) script.

**Short path for small stories.** Create the story straight in the column where it should start (the
**+** at the top of each column) or drag it there, for example to Plan. The AI starts from there:
without the documents of the earlier phases, it works from the description, the conversation and the
code, and `get_card` says which documents don't exist so it neither creates them nor blocks for lack
of them. In Implementação, a story without sub-tasks gets one from the description.

Boards created before get the new texts through **Atualizar board** (update board, in Settings), only
in the columns that still have the previous default text: what you customized stays as it is. The
flow the AI reads is the board's current text, through the MCP: nothing needs reinstalling.

## Chat with the AI

![AI chat: question and answer using the board](images/chat_en.png)

To give the board orders in natural language, use the **Chat**: in the editor's sidebar, the **Chat
com a IA** section (below Board and Filtros); in the browser, the **Chat** button in the top bar,
which opens a panel on the right. Write, for example, "create a Login with Google story and three
sub-tasks" or "what is waiting for me?". The project's AI answers and acts through the board tools:
it creates, moves and links cards, and queries what is on it. Below the field you pick the **model
and effort** for the next messages (the choice is remembered). Enter sends, Shift+Enter adds a line,
**Parar** (stop) interrupts and **Limpar** (clear) erases the conversation. The history is kept per
project.

The chat uses the same background run as the cards, so the limit under Configurações → Harness →
"O que a IA pode fazer" applies (by default, the board only), and so does the time limit there.

## Work on the phase and Refine with AI

A card has two buttons that run the project's tool in the background. It is not a live chat: the
answer arrives as a message in the conversation when the run ends, and meanwhile the card shows "Em
execução" (with a **Parar** button to stop it). The buttons show an explanatory hint (with bold text
and bullet points) when you hover the mouse or focus with the keyboard; the hint opens on hover and
on keyboard focus, closes with Esc, and stays visible even when the button is blocked.

- **Trabalhar na fase** (work on the phase) does the work of the column the card is in, the same as
  the heartbeat would: in Discovery it analyzes the problem, in PRD it writes the PRD, in
  Implementação it writes the code (if the permission allows). It reads the conversation and answers
  it, and ends by handing over: asks for review, asks a question, blocks or moves the card. If Tags,
  Esforço da atividade, Modelo and Skills are all empty, it fills them first. It is in the card
  header and in the conversation (with text typed, **Enviar e trabalhar na fase** sends the message
  first).
- **Refinar com IA** (refine with AI) only makes the card clear and complete for whoever will work
  on it: rewrites the title and description (without inventing requirements; whatever is ambiguous
  becomes a "Dúvidas em aberto" list), reviews Tags, Esforço da atividade, Modelo and Skills even if
  they already have a value, and adds the missing steps to the checklist. It does not work on the
  phase, create sub-tasks, move the card or touch files: it runs with the board only. Before it
  rewrites the description, it saves the previous text, unchanged, as an attachment of the story
  (`descricao-anterior-AAAA-MM-DD-HHMM.md`, not an artifact); the conversation gets the name of the
  attachment, not the text. At the end it summarizes in the conversation what changed (citing the
  attachment, if it rewrote the description) and the card returns to the status it had, also when
  the run fails: the failure goes to the conversation, without blocking the card. A refine does not
  count as a run without progress for the autonomous mode.

Images pasted into the message or into the card description become card attachments and the AI
receives them.

### Summarize the conversation

**Resumir a conversa** (summarize the conversation), in the Conversa tab, shows up from 2 messages
on: it reads the whole conversation and writes a summary (Decisões, Observações, Pendências —
decisions, notes, pending items) as a new AI message (`kind: "summary"`), without automatically
deleting anything, without working on the phase, moving the card or changing its status. It runs
with the board only, always at the "Alto" model tier (regardless of the card's Esforço). The summary
**deactivates** the earlier messages: the AI then receives the conversation from the last summary on
(`comments` in `get_card`), the summary is highlighted on screen and the earlier messages are dimmed.
You review the summary the same way you review any message: agree by leaving it as is, or edit the
text. Any message can be deleted by you; right below the summary, the **Apagar mensagens resumidas**
(delete summarized messages) button deletes, with confirmation, every message before it; summarizing
again creates a new record, it does not replace the previous one. The
[heartbeat](automacao_EN.md) summarizes on its own a conversation that has grown. It is also
available as the MCP tool `generate_summary`, with the same result.

### Permission, tool and failures

- What the AI may do in these runs is set in Configurações → Harness → **Execução pela conversa**:
  only the board (default), the board and project files, or no restrictions. The level in use is
  shown next to the button, with a shortcut to change it. The AI is told about the limit: if the work
  needs more than the level allows, it blocks the card saying which option to choose.
- Cursor accepts all three levels: at "only the board" and "board and files" its session gets only
  the tools of that level (reading and MCP; reading, MCP and editing), with no terminal.
- The tool must be installed and signed in. Its CLI does not need to be on the PATH: the board also
  looks in the usual install folders and inside editor extensions (if you only use the Claude Code
  extension, you already have the executable). Cursor's CLI is `cursor-agent` (the
  `curl https://cursor.com/install -fsS | bash` installer also creates the `agent` shortcut); sign in
  once with `cursor-agent login`.
- With Claude Code, the board's server is passed on the command line of each run: it does not depend
  on installing the MCP or on approving `.mcp.json`. With Cursor, the board uses the global
  registration in `~/.cursor/mcp.json` when it leads to this board; without it (or in a worktree
  outside the project folder), it writes the server to `.cursor/mcp.json` before running (and adds
  the file to `.git/info/exclude` when it creates it). For the other tools, install first.
- When the story has its own working folder (worktree), the tool gets that folder along with the
  project's, Cursor included.
- Stop and the time limit end the tool and everything it started (MCP servers, tests, commands).
  Claude Code does not run "no restrictions" as root (containers, WSL as root): the board warns.
  Without Node.js on the PATH, the board server runs with the editor's own runtime.
- If the run fails or exceeds the time limit, the card becomes blocked, with the reason and the end
  of the tool's output. The full log is in the **Output → Faz AI** panel (or in the `faz-ai`
  terminal).

## The board day to day

1. Open a folder in the editor and click the **Faz AI** icon in the sidebar. Each folder has its own
   board.
2. Create stories with **+ Novo card** (new card) and drag them between columns. While you drag, the
   other cards slide aside with a smooth animation and a dashed gap shows where the card will land;
   on drop it settles straight into place, without flicker. Clicking a story shows only its
   sub-tasks; double-click opens the details.
3. The card details hold the status, the description in Markdown, the fields, the checklist, the
   sub-tasks, the conversation and the attachments. The conversation is where you and the AI talk
   about the card. Phase documents (PRD, Spec, Plan…) are built in sub-tasks but stay attached to
   the story; in sub-tasks they appear as links.
4. Search by text or by ID (`#12`). The **Filtros** (filters) section of the sidebar filters by
   type, fields, dates and relationships.

![Open card: status, approval, fields, description and checklist](images/card_en.png)

Nothing happens silently: every action that goes to the board waits for confirmation and shows it is
working. A thin bar at the top lights up while any request is in progress; the card being moved,
archived or changing status or title fades and gets a spinner on its bar (on the board and in the
open card); the clicked button (create card, send message, approve, restore…) and the affected row
(checklist item, link, field) show the wait in place; and what replaces the whole board (recreate,
import a backup, empty the trash) sits behind a veil. A text field only clears when the host
confirms: if the action fails, the warning shows up and what you typed stays.

By default, a story is not completed and does not advance a phase while it has open sub-tasks of
that phase. These rules can be turned off in the settings. The sub-task's phase is the **Fase**
field, which the AI fills in when it creates the sub-task: on the open card it is read-only, and it
can't be a card type default.

At the top of the board, **N com você** (N with you) shows how many cards are waiting for your
review, answer or unblocking (one click filters to them), and an indicator appears while the AI is
working on a card.

### The card on the board

Each card has a bar in its type's color, with the ID, the type and the open and actions buttons.
Below it come the title (in full in the tooltip when it doesn't fit), the status with an icon for
who the next step is waiting on (a robot for the AI, a person for you) and how long it has been like
that, the fields, the AI model (e.g. "Sonnet 5.5 - baixo", with the effort in Portuguese) and, in
the footer, the counters, the branch and the PR. Cards waiting on you get a border in the status
color, and the LED on the bar tells the card's state at a glance: green and blinking slowly while the
AI is working on it (on a story, also when it works on one of its sub-tasks), yellow when it is
waiting on you, red when it is blocked, and off when nothing is happening. On a story, the sub-task
list shows the same LED on each one: green and blinking while running, red when blocked, yellow when
waiting on you, and off when stopped.

**Collapsed cards.** You can collapse cards to fit more rows of a column in the same screen. A
collapsed card keeps the type's colored strip (with the AI LED, the number, the type and the
buttons) and shows the title in up to two lines, hiding the rest; the status border stays (if the
card is waiting on you), so you can sweep the board at a glance and know what needs your attention.
Collapse can be applied in four scopes: a single card (button on the card itself), all cards in a
column (item in the column's action menu), all cards on the board (button in the filter bar) or just
the selected cards (button in the multi-select bar). The state is remembered between sessions.

### Multi-select

**Select all in a column.** The checkbox at the start of a story column's header, on the same line
as the cards' checkboxes (or **Selecionar todos** in the ⋯ menu), selects the column's visible
stories (the active filter applies); checked again, it clears the selection. In a column with no
cards, the checkbox is hidden, but its space stays reserved. With the selection made, the same menu
offers **Arquivar selecionados**, **Mover selecionados para...**, **Concluir selecionados** and
**Mandar selecionados para a lixeira**, each with a single confirmation for the whole batch; **Limpar
seleção** clears it. The selection applies to one column at a time: selecting a card in another
column replaces the selection. In a batch, a story with an open sub-task is not concluded (the others
go ahead), and moving to a cancellation column cancels open sub-tasks.

**Actions on selected cards.** The multi-select bar (two or more cards) and the column's ⋯ menu
offer the same actions: **Aprovar** (approve), **Bloquear** (block), **Desbloquear** (unblock),
**Trabalhar na fase** (work on the phase), **Refinar com IA** (refine with AI), **Parar a IA** (stop
the AI), autonomous mode, collapse/expand, archive, move, complete and trash. Unavailable actions
stay visible and disabled, without displaying a reason; the menu also shows them with no selection.
Each action affects only eligible, visible cards. Approve applies to cards waiting for review and
uses the same automatic advance as individual approval; block requires a reason, recorded in each
card's conversation; unblock returns blocked cards to **Pronto** (ready). Work and refine respect the
remaining parallel execution capacity: cards already running or exceeding the limit are left out.
**Parar a IA** only stops runs started by the board.

### Archived, trash and duplicate

Cards can be archived (card actions menu → **Arquivar**) or sent to the **Lixeira** (trash), from
where they can be restored. Archived cards leave the board rows and live in the **Arquivados**
(archived) tab, between Métricas and Lixeira, which preserves the history: one row per workflow, in
board order, newest first.

- **Restaurar** (restore) sends the card back to the end of the first column of its workflow
  (Backlog / A fazer on the default board), inactive. Restoring a story also brings back all its
  archived sub-tasks and turns autonomous mode off; restoring a sub-task whose story is archived asks
  for confirmation and restores the whole story (a sub-task of an active story comes back on its own,
  with no confirmation).
- The tab has its own filter bar, which does not change the board's filter: text search (title,
  description, conversation, fields and `#number`), type, option fields (such as Tags) and archive
  date range. The counter shows the active filters, and **Limpar filtros** (clear filters) resets
  them; when you leave and come back, the tab opens clear. Each row shows 50 cards at a time, and
  **Mostrar mais** (show more) brings the next ones.
- Clicking an archived story selects it: the Sub-tarefas (sub-tasks) row then shows only its
  archived sub-tasks, even those that do not match the filter. Clicking again, or **Limpar seleção**
  (clear selection), clears the selection. Opening the card still lists all sub-tasks.
- To act on several at once, select the archived cards you want: **Selecionar todos os visíveis**
  (select all visible) selects only the cards the filters show. **Restaurar** (restore) in bulk
  follows the same rule as the single action (a story comes back with its archived sub-tasks, and a
  sub-task whose story is archived brings back the whole story), and **Enviar para a lixeira** (send
  to trash) in bulk takes each story's archived sub-tasks along. Every bulk action asks for
  confirmation, saying how many cards will be affected and what goes along with them. Permanent
  deletion stays only in the Lixeira (trash).

**Multi-select in the trash.** In the **Lixeira** (trash), tick cards one by one or use **Selecionar
todos** in the table header; the checkbox shows a partial state when only some are ticked. With at
least one card ticked, a bar appears with the count and the actions **Restaurar** (restore) and
**Apagar de vez** (delete permanently), which apply to the whole selection. Restore runs straight
away; delete permanently asks for one confirmation for the batch. **Limpar** (clear) unticks
everything. Restoring or deleting a card also takes its sub-tasks that are in the trash. **Esvaziar
lixeira** (empty trash) stays as it was and does not depend on the selection.

**Duplicar card** (duplicate card; card actions menu of the open card) creates another card from it,
one at a time. The title gets the prefix "Cópia de" (Copy of in the English interface); the
description, type, fields and checklist (unchecked) are copied, and the new card goes to the end of
the first column of its workflow, with no confirmation. Sub-tasks, attachments, comments and links
are not copied. There is no bulk duplication: with several cards selected, the option does not
appear.

## Links between cards

Besides sub-tasks, any card can be linked to another one, in any workflow, under **Vínculos** (links)
in the open card (as in Kanbanize or Businessmap): **parent**, **child** or **related**. Search the
other card by number or title and pick the kind of link. The card footer on the board shows the link
and, when there are children, how many are already closed. A repeated link and one that would close
a cycle (the parent already being a child of the card) are refused.

A linked parent follows the rule in Configurações → Regras: when the last open child enters a
completion column, the board asks (or moves on its own, depending on the rule) whether the parent
should also go to completion. The AI uses the `link_cards` and `unlink_cards` tools, and `get_card`
returns the links.

The **Vínculos** section also shows, display-only, the sub-task relation: on a sub-task, a "Pai"
(parent) group with the story; on a story, the sub-task count with a shortcut to the **Sub-tarefas**
section. This relation is read-only (no remove button) and does not enter the completion rule above,
which still applies only to the manual parent/child link.

### Dependencies and sub-tasks in parallel

A card can **depend** on another: in **Vínculos**, pick "precisa terminar antes deste card" (the
other one is a prerequisite) or "só começa depois deste card". The open card shows the groups
**Depende de** (depends on, with how many dependencies are still open) and **Libera** (unblocks). The
board refuses a dependency cycle.

The AI uses this to speed up the Implementation. In Plan it declares the order between sub-tasks
(`create_card` with `depends_on`, or `link_cards` with `depends_on`): one depends on another when it
uses what the other produces or when both change the same files. In Implementation, the story's
`get_card` returns in `subtasksNow` what the **board runs** (`byBoard`, in order) and what waits
(`waiting`).

In a code phase the board, not the story session, runs the sub-tasks: each one in its own CLI run,
with the agent, model and skills of its card, **one after another** in the story's folder (a single
writer at a time), respecting dependencies; the story session only creates them and stops. Each
sub-task's cycle fits in two calls: `start_work` already moves it to "Em andamento" and `move_card`
with `comment` completes it and records the result; in Plan, `create_card` already takes the agent
(`profile`) and the checklist and returns the summarized card. `start_work` refuses a sub-task that
is still waiting for another. With no dependencies declared, all open sub-tasks are considered
independent. When all of them finish, the board calls the AI once for the closing: verify the whole,
commit and move the story.

No execution delegates to the tool's subagents (in Claude Code, `Agent` — formerly `Task` — is
denied; Cursor and Kimi Code have no proven block, so the capability stays "unknown" and admission
decides). In **Settings → AI Harness** (and `fazai.git.parallelSubtasks`, 1 to 6) the person sets
**"Sub-tarefas em paralelo por história"** (parallel sub-tasks per story); the screen shows the
requested and the effective value (today 1). The flow text is the board's current one, served
through the MCP; a copy of the flow skill already installed in the tool's folder is not replaced by
the board. To keep the tool from loading the old text on its own, delete that copy.
