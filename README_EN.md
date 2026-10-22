[🇧🇷 Português](README.md) · 🇺🇸 English

<img src="media/icon.png" width="96" alt="Faz AI Kanban icon">

# Faz AI Kanban

> ⚠️ **Faz AI is in alpha.**
>
> The project is new and moves fast: screens, commands and the board format may still change. Review
> what the AI does before approving it. If something breaks, [tell me in an issue](https://github.com/euclidesgc/faz-ai/issues).

> **Thank you to everyone downloading and trying it out.**
>
> I published the extension and, the next day, it already had 160 downloads. To each person who gave
> a brand-new project a chance: thank you very much. Faz AI is **completely free and open source**
> (MIT license); contributions are welcome. — Euclides G Catunda

Enjoying it? Help Faz AI grow:

- ⭐ **Star** the [GitHub repository](https://github.com/euclidesgc/faz-ai).
- 💬 **Rate the extension** on the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=euclidesgc.faz-ai&ssr=false#review-details)
  or on [Open VSX](https://open-vsx.org/extension/euclidesgc/faz-ai/reviews) (Cursor's store).
- 🐞 Bug or idea? [Open an issue](https://github.com/euclidesgc/faz-ai/issues/new?template=bug.yml)
  or [tell me a suggestion](https://github.com/euclidesgc/faz-ai/issues/new?template=sugestao.yml).

A kanban board inside your editor (VS Code and Cursor), built to run Spec-Driven Development (SDD)
together with an AI. You organize the work into stories and sub-tasks; the AI reads the board,
produces the artifacts of each phase and moves the cards as it goes.

![Board with stories in the SDD phases and sub-tasks in the bottom workflow](docs/images/board.png)

## Getting started

1. **Install and open.** Install **Faz AI Kanban** in VS Code or Cursor, open the project folder and
   click the **Faz AI** icon in the sidebar. Each folder has its own board, already set up with the
   workflow phases.
2. **Connect the AI to the board.** In **Configurações → Harness** (Settings → Harness), pick the
   tool (Claude Code, Cursor or Kimi Code) and, in the **Projeto** (project) tab, click
   **Instalar (padrão da ferramenta)** (install, tool default) in **Servidores MCP** (MCP servers).
3. **Create the task.** In the **Backlog** column, click **+ Novo card** (new card), type the title
   and press Enter. Double-click opens the card so you can describe what you want.
4. **Let the AI start.** Drag the card to **Discovery** and click **Trabalhar na fase** (work on the
   phase). The AI analyzes the problem and talks with you in the **Conversa** (conversation) tab;
   when it finishes, the status changes to **Aguardando revisão** (waiting for review). If it needs
   a decision from you, the pending item shows up as **Travado em mim** (blocked on you).
5. **Review and move on.** Read the phase document and click **Aprovar** (approve) or **Pedir
   ajustes** (ask for changes). The story moves on through **PRD**, **Spec**, **Plan** and
   **Implementação** (implementation), always with the AI producing and you approving.

At the top, **N com você** (N with you) shows what is waiting for you, and the **Chat** lets you ask
the AI, in natural language, to create and move cards.

## How it works

- **Flow phases.** The story columns are Backlog, Discovery, PRD, Spec, Plan, Implementação
  (implementation), Revisão (review), Homologação (acceptance), Concluído (done) and Cancelado
  (cancelled). Each column has an instruction for the AI. Sub-tasks have their own flow.
- **Approval per phase.** In Discovery, PRD, Spec, Plan and Homologação (by default), the AI
  finishes, asks for review and stops. It only moves the card after you approve.
- **Status and "with you".** Every card the AI works on has a status (Pronto, Em execução,
  Aguardando resposta, Aguardando revisão, Aprovado, Bloqueado — ready, running, waiting for an
  answer, waiting for review, approved, blocked). The **Com você** (with you) filter and the counter
  on the sidebar show when the AI asks for a review, asks a question or hits a blocker.
- **Each card is a new, short session.** The AI opens the card through the board (`get_card`), does
  that piece of work and stops. The history stays on the card, not in the context window.
- **Controlled context.** Every run started by the board begins without the rules, skills, agents,
  hooks or plugins you did not check under **Harness**. PRD, Spec and Plan stay attached to the
  story, and the AI reads them only when it needs to.
- **Artifacts and agents defined in the Harness.** Rules, skills, subagents and MCP servers live in
  a board library, in **Sempre** (always), **Pelo card** (by card) or **Desligado** (off) mode. An
  agent allows only what it needs, and every run started by the board goes through an agent.
- **Model per card.** Each card can name the model, the effort level and the required skills;
  suggestion rules avoid using the most expensive model where a lighter one is enough.

## How to use

1. Open a folder in the editor and click the **Faz AI** icon in the sidebar. Each folder has its
   own board.
2. Create stories with **+ Novo card** (new card) and drag them between columns. Clicking a story
   shows only its sub-tasks; double-click opens the details.
3. The open card holds the status, the description in Markdown, the fields, the checklist, the
   sub-tasks, the conversation and the attachments.
4. Search by text or by ID (`#12`). The **Filtros** (filters) section of the sidebar filters by
   type, fields, dates and relationships.
5. Cards can be archived (actions menu → **Arquivar**) or sent to the **Lixeira** (trash). The
   **Arquivados** (archived) tab keeps the history with its own filters, and **Restaurar** (restore)
   sends the card back to the first column of its workflow. In the trash, you can tick several cards
   and **Restaurar** (restore) or **Apagar de vez** (delete permanently) the batch.
6. **Duplicar card** (duplicate card; actions menu of the open card) creates another card with the
   prefix "Cópia de" (copy of), copying the description, type, fields and checklist. Sub-tasks,
   attachments, comments and links are not copied.

On the board, each card shows the type, the title, the status with who the next step is waiting on
(a robot or a person), the AI model, the branch and the PR. A LED tells the state at a glance: green
with the AI working, yellow waiting on you, red blocked.

![Open card: status, approval, fields, description and checklist](docs/images/card.png)

**Collapsed cards and multi-select.** You can collapse a card, a column, the whole board or just the
selected cards to fit more rows in the same screen. The checkbox in a column's header (or
**Selecionar todos** (select all) in the ⋯ menu) selects its visible stories. The selection accepts
**Aprovar** (approve), **Bloquear** (block), **Trabalhar na fase** (work on the phase), **Refinar com
IA** (refine with AI), **Parar a IA** (stop the AI), archive, move, complete and trash, with a single
confirmation for the whole batch.

### Links between cards

Any card can be linked to another one, in any workflow, under **Vínculos** (links) in the open card:
**parent**, **child** or **related**. The card footer shows the link and how many children are
already closed. When the last open child is completed, the board asks (or moves on its own,
depending on Configurações → Regras — Settings → Rules) whether the parent should also go to
completion. The AI uses `link_cards` and `unlink_cards`, and `get_card` returns the links.

A card can also **depend** on another; the open card shows **Depende de** (depends on) and
**Libera** (unblocks). The AI uses this in Implementation: in Plan it declares the order between
sub-tasks (`create_card` or `link_cards` with `depends_on`), and the story's `get_card` returns in
`subtasksNow` what the board runs and what waits. Each sub-task runs in its own CLI run, one after
another, respecting the dependencies; when all of them finish, the board calls the AI once to verify
the whole, commit and move the story. **"Parallel sub-tasks per story"** lives in **Settings → AI
Harness**.

### Board in the browser

The board does not depend on the editor window:

- **Abrir no navegador** (open in browser, at the top of the board, or the command **Faz AI: Abrir
  board no navegador**) opens the same board in a browser tab, in sync with the editor.
- **Without the editor**: run `~/.faz-ai/bin/faz-ai` in the project folder. The command serves the
  board in the browser, with the MCP server, AI runs and the heartbeat, until you stop it with
  Ctrl+C. It needs Node.js on the PATH.

The page only answers on `127.0.0.1` and requires the secret in the link opened by the editor or the
terminal (it is kept in a cookie, so the address can be bookmarked). A board is served from one place
at a time: with the editor open on the folder, use **Abrir no navegador**.

## Using with AI

In Settings → **Ferramentas de IA** (AI tools), choose the project's default CLI profile (Claude
Code, Cursor and Kimi Code are built in). In the **Projeto** (project) tab, **Servidores MCP** (MCP
servers) group, click **Instalar (padrão da ferramenta)** (install, tool default): the board
registers the `faz-ai` server in the tool's global file, and does this on its own when the folder
opens. Nothing goes into the project folder. The flow skill (`faz-ai-fluxo`) is already served
through the MCP (`get_skill`); installing it in the **Skills** group is optional. **In Cursor there
is nothing to install**: the board writes the project's `.cursor/mcp.json` on its own (outside git)
and asks, the first time, to **reload the window** and **turn on `faz-ai`** in Cursor Settings → MCP.
Then open a session of the tool in the project folder and ask, for example, "list the cards on the
board".

| Item | Where it writes |
|---|---|
| MCP server | `~/.claude.json` and `~/.kimi-code/mcp.json` |
| Flow skill | `~/.claude/skills`, `~/.cursor/skills`, `~/.kimi-code/skills` |

In the suggested flow, the AI reads the story and the phase instruction, builds the phase document,
attaches it to the story and asks for your review in the card's conversation. You answer on the card
itself:

- **Aprovar** (approve) takes the card to the next column right away.
- **Pedir ajustes** (request changes) sends the card back to the AI with your text in the
  conversation.
- If the AI asks a question, the card stays in **Aguardando resposta** (waiting for an answer); once
  you reply, it goes back to the AI.
- **Bloquear** (block) records a blocker, with the reason.

**Questions with options.** When the AI needs a decision between alternatives, it records the
questions on the card (`ask_questions`), each with short options and the recommended one. They
appear on the open card in a carousel: one question at a time, with the **{n} de {total}** counter
(n of total) and the **Indicada** (recommended) badge. Clicking an option records the answer and
moves on. **Enviar respostas** (send answers) records everything in the **Perguntas e respostas**
(questions and answers) section of the description and hands the turn back to the AI. In autonomous
mode, the board answers each question with the recommended option and the AI carries on.

**Environment check.** The first time the board opens, a list with everything the board needs opens
on its own; after that, it opens through the **Verificar ambiente** (check environment) button, in
Settings. The board checks Node.js (22 or newer) and each CLI profile that is turned on: whether the
command line exists and whether it is signed in. As recommended, it points to Git, the GitHub CLI
with sign-in and the Code Review Graph. The board does not install anything: each item brings the
official site and the command to copy. The check runs on opening, every 5 minutes and on **Verificar
de novo** (check again).

The warning only **blocks** the board (AI buttons disabled, heartbeat and autonomous mode stopped)
when **no** enabled profile is available. With a sign-in missing or expired, the profile gets the
"sem login" (not signed in) warning and the **Abrir no terminal** (open in terminal) button, which
opens the sign-in command in a terminal (signing in is always yours to do). If the sign-in expires in
the middle of a run, the card goes back to the status it had, and the queue resumes on its own when
the sign-in is confirmed.

### What each phase delivers

- **Short track for small stories.** With the rule on (Settings → Rules; off by default), a story
  with **Baixo** (low) effort or of type **Bug** approved in Discovery goes straight to Plan, skipping
  PRD and Spec. Dragging the story to PRD or Spec forces the full track.
- **Spec with the program design.** Architecture, new or changed types and signatures, who calls
  whom on the main path, Mermaid diagrams and the discarded alternatives with the reason.
- **Plan with parts that are easy to review.** Each step says how to check it. Above about 400 lines
  of code, the AI keeps the first part in the story and creates the next ones as **derived stories**
  (`create_card` with `derived_from`); the branch of each derived story starts from the previous one,
  the PR is stacked, and the card shows **Derivada de #N** (derived from #N).
- **Review before the pull request.** The **Revisão** (review) column runs the project's checks and
  reviews the diff with independent eyes (the `revisor-de-codigo` agent, when it is on the board). It
  does not ask for approval: the result goes to the conversation and to the PR's **Como revisar**
  (how to review).
- **A pull request that explains the delivery.** The body brings **Objetivo** (goal), **O que foi
  feito** (what was done), **Como revisar** (how to review), **Decisões** (decisions) and the **Como
  testar** (how to test) script.

**Short path:** create the story straight in the column where it should start (the **+** of each
column) or drag it there. The AI starts from there, from the description, the conversation and the
code.

### Chat with the AI

![AI chat: question and answer using the board](docs/images/chat.png)

To give the board orders in natural language, use the **Chat**: in the editor's sidebar, the **Chat
com a IA** (chat with the AI) section; in the browser, the **Chat** button at the top. Write, for
example, "create a Login with Google story and three sub-tasks" or "what is waiting for me?". The AI
answers and acts through the board tools: it creates, moves and links cards. Below the field you
pick the **model and effort**. Enter sends, Shift+Enter adds a line, **Parar** (stop) interrupts and
**Limpar** (clear) erases the conversation. The history is kept per project, and the limit under
Configurações → Harness → "O que a IA pode fazer" (what the AI may do) applies.

### Work on the phase and Refine with AI

The card has two buttons that run the tool in the background. It is not a live chat: the answer
arrives in the conversation when the run ends, and meanwhile the card shows "Em execução" (running),
with a **Parar** (stop) button.

- **Trabalhar na fase** (work on the phase) does the work of the column the card is in, the same as
  the heartbeat would: it reads the conversation, answers it and ends by handing over (asks for
  review, asks a question, blocks or moves the card). With text typed, **Enviar e trabalhar na fase**
  (send and work on the phase) sends the message first.
- **Refinar com IA** (refine with AI) only makes the card clear and complete: rewrites the title and
  description (without inventing requirements), reviews Tags, Esforço (effort), Modelo (model) and
  Skills and completes the checklist. It does not work on the phase, move the card or touch files.
  The previous description is kept as an attachment.
- **Resumir a conversa** (summarize the conversation), in the Conversa tab, writes a summary
  (Decisões, Observações, Pendências — decisions, notes, pending items) as a new AI message. The
  earlier messages are deactivated and dimmed: the AI then receives only the summary and what comes
  after it. You can edit the summary and **Apagar mensagens resumidas** (delete summarized messages).
  The heartbeat summarizes on its own a conversation that has grown; it also exists as an MCP tool
  (`generate_summary`).
- What the AI may do in these runs is set in Configurações → Harness → **Execução pela conversa**
  (run from the conversation): only the board (default), the board and project files, or no
  restrictions. The level in use is shown next to the button. If the work needs more than the level
  allows, the AI blocks the card saying which option to choose.
- If the run fails or exceeds the time limit, the card becomes Bloqueado (blocked), with the reason.
  The full log is in **Saída → Faz AI** (Output → Faz AI).

### Context and usage

In the footer of each card, a ring shows how much of the context window the run takes before the AI
starts, with the total next to it (for example, `5.8K`). Clicking it opens the breakdown: a bar per
group (MCP servers, agents, rules and skills, and the card with description, conversation, phase
instructions and documents). It is an estimate from text size, meant to compare choices: unmarking a
skill or switching the agent changes the number right away. The window comes from the card's model;
without a known model (such as Cursor's), the ring shows only the total. The **Reler arquivos**
(reread files) button rereads the harness files.

The open card has the **Consumo** (usage) tab, which brings the two numbers together: **Próxima
execução** (next run; the same estimate as the ring, with the **Contexto da execução** (run context)
block and the source of each rule, skill and MCP server) and **Gasto até agora** (spent so far; what
the tool measured at the end of each run, one row per phase). What was spent is history and only
grows: deleting messages lowers the next runs, never what was already spent.

Every time the AI runs, the board records tokens, turns and the **inventory** of what it used: native
tools, MCP tools, subagents and skills. Usage is measured in tokens, with no dollar cost. "Não
medido" (not measured) is missing measurement, never zero. The detail of each run is kept for a
window of 1 to 24 months (default 6); the monthly totals never expire.

The **Métricas** (Metrics) button, in the top navigation, shows what the board recorded. You filter by
period and by **Workflow** and see four totals (completed activities, AI runs, tokens and AI time),
the tokens per month, where the usage happened (**Recortar por** / break down by phase, card type,
model, tool, effort or profile), how long a card stays in each phase, the lead time, the **rework**
(reviews asked for, first-try approvals, change requests and AI signals), the most expensive phases
and cards, what the AI used and the **Detalhe guardado** (detail kept) window, which you set there.
Notes next to the numbers say since when the log exists and which months only have the monthly
total.

During a card's conversation, the AI queries the same statistics with `get_metrics`, without opening
a panel: "how much AI time did card #72 use?", "which agent was used most?". The tool groups by
phase, card type, model, agent, skill and other dimensions, accepts period and card filters, brings
the rework with `rework: true` and replies with a compact table.

### Branch, pull request and gitflow

Each story works on its own branch, created by the board (for example `feature/12-login-com-google`).
By default it comes with a **worktree**: a separate working folder, next to the project, where the AI
changes the code without touching your folder. The branch is created when the AI starts the
implementation (`prepare_workspace`) or with the **Criar branch da história** (create the story's
branch) button; the card shows the branch and opens the folder in a new window. The mode (worktree,
branch in the same folder, or off), the branch name and automatic merge live in **Settings → Git**;
each worktree needs its dependencies installed.

Branches follow **gitflow**, on by default (**Usar o gitflow**): História and Débito técnico produce
`feature/` from `develop` and go back to it; Retrabalho produces `bugfix/` (a defect in a feature
that is still only on `develop`); Bug produces `hotfix/` from the main branch and goes back to it.
The main branch is detected on its own, and `develop` is created if it doesn't exist. The AI reads
the PR base in `workspace.prBase` of `get_card` and opens the pull request with `--base`. In stacked
stories (derived ones or autonomous mode), the base is the previous story's branch.

In **Homologação**, the AI writes the **Como testar** (how to test) script in the description, pushes
the branch, opens the pull request, records its address on the card and asks for your review. With
**automatic merge** on (Settings → Git › Pull request e merge; off by default), approving the story
merges the PR through the GitHub CLI (`gh`); only then the card goes to Concluído and the worktree is
removed. If the merge fails, the card becomes Bloqueado with the error. Off, approving takes the card
to Concluído right away.

**Completion with gitflow.** When the story is concluded with its PR merged, the board removes the
worktree, deletes the local and the remote branch and updates the local `develop` by fast-forward
only, without switching your folder's branch. When the cleanup is not safe (uncommitted changes,
commits outside the PR), it does not delete what is at risk, concludes the card anyway and leaves the
command for you in the conversation. A story stacked on the concluded one has its base changed to
`develop` first. After a hotfix, the board opens and merges a `main → develop` PR. Leftover branches
and worktrees show up under **Settings → Git → Branches e worktrees órfãs** (orphan branches and
worktrees): the safe ones the board cleans on its own; the others wait for your **Limpar** (Clear),
with confirmation.

**Decision records.** With **Settings → Git › Registros de decisão** (decision records) pointing to a
folder of the repository, such as `docs/decisoes`, Homologação writes there, before the PR, the
story's decision record (context, decision, discarded alternatives, consequences and diagrams), from
the approved Spec. The file `<number>-<title>.md` goes in a commit of the branch and is cited in the
PR. Empty, the default, turns it off.

**Merge detection.** The board watches the pull request of every open story, on every heartbeat
round. When the PR is merged, it records the commit on the card, says so in the conversation, moves
the card to completion and does the gitflow cleanup. If the PR is open with conflicts, it warns and
calls the AI in a run just to resolve it; if it cannot, it blocks the card. The merge itself is still
yours. When the version containing the story is published (tag with a release on GitHub), the board
records the version in the conversation and archives the card; you can restore it from the Arquivados
tab.

### Heartbeat

With the heartbeat on (Configurações → Harness), the board calls the AI on its own at every
interval, while the editor is open in the project folder. On each round it first tidies the board and
then decides what the AI does:

- returns to the AI the cards blocked by the tool's usage limit and warns once about a card that has
  been with you for two days or more; when a profile runs out of the plan's limit, its queue pauses
  until the renewal and the top of the board says until when;
- checks the pull requests, cleans up the orphans and syncs the local branches with origin,
  fast-forward only;
- checks, read-only, whether the branch of a story without a PR conflicts with the base, and warns
  in the conversation;
- summarizes the conversation of stories that have grown;
- refines new Backlog cards (**Refinar os cards novos do Backlog**, on by default) and leaves them
  waiting for your review;
- works on ready cards and answers pending messages, one run per story.

The queue follows the board order: bugs first, then the rightmost story, and within a column top to
bottom. Cards that are with you are not touched. Activities without a branch run at the same time up
to **Histórias ao mesmo tempo** (stories at the same time; two by default); the ones with a branch
run one at a time, unless **Tocar histórias em paralelo** (drive stories in parallel) is on in
worktree mode.

**Rodar o heartbeat agora** (run the heartbeat now) starts a round right away, even with the
heartbeat off. The activity bar at the bottom of the board shows what the AI is doing ("IA em #12
(Discovery, há 3 min)") or why it is stopped, and the **heart** at the top right turns the heartbeat
on and off.

### Autonomous mode (YOLO)

A **story** can be marked **YOLO**: turn on **Modo autônomo** in the card panel, click the icon in
the card footer or select several and use the selection bar. The board asks for confirmation (check
**Não avisar novamente** (don't warn again) to turn it on directly) and shows the **Até onde** (up to)
selector: the default is **Homologação (abre o pull request)** (opens the pull request); picking an
earlier phase, such as Plan, the AI goes on by itself up to it, asks for your review and the mode
turns off. From then on the AI drives the story **without asking for authorization or confirmation
on anything**:

- from **Backlog** to the last column it works in: Discovery, PRD, Spec, Plan, sub-tasks,
  implementation, review and the pull request (`set_pull_request`), where it stops and waits for
  your review. The review request becomes an approval right away, with the summary in the
  conversation;
- **no questions**: faced with a doubt, it decides and records the reason; `ask_questions` is
  answered with the recommended option. Only a real impediment blocks the card;
- **conversation summarized** between phases, so the context does not carry the whole conversation;
- follows the project's patterns (`CLAUDE.md`, `AGENTS.md`, `DESIGN.md`) and picks the least complex
  path;
- **no merge**: merging and moving on to Concluído stay with you;
- **no restrictions**: the runs use the "Sem restrições" permission, because they need git and
  `gh`.

The **autopilot** drives autonomous stories one at a time, in board order, corrected by
dependencies; each story waiting its turn shows the **Fila N** (queue N) badge. A story that is
blocked or waiting for your answer is skipped. Each story's branch starts from the most recent branch
among the other open autonomous stories, forming a **stack of PRs**. The AI can split a large request
by creating the following stories (`create_card` with `autonomous_from`). The circuit breaker blocks
the story after 3 consecutive runs with no progress, freeing the queue.

The **autonomous mode button** at the top of the board says what the click does: **Ligar modo
autônomo** (turn on; puts every open story in the mode, or only the selected ones), **Pausar modo
autônomo** (pause) or **Retomar modo autônomo** (resume). The pause is recorded on the board and
survives reopening the editor. A card stuck in "Em execução" (running) with no AI session goes back
to Pronto on its own.

### Agents

Subagents are **Board library** artifacts, with instructions, description, optional model, tool
categories and dependencies on skills and MCPs. Creating or editing through the Harness writes to
the board, without creating files in the tool folders; agents that already exist in those folders
can be imported.

The run selects the card's agent; without one, the phase's agent; then the default from **Harness →
Tool and execution**. On the **Sub-agents** tab, use **Create**, **Guided assistant** or **Generate
from project**. The editor lets you review the instructions, select skills and MCPs from the library
and set the Read, Edit, Commands, Network and Subagents categories. In Claude Code, the agent is
delivered with tool and model restrictions; in the other executors, part of the profile goes as
guidance in the prompt.

Through MCP, `get_board` lists the agents, `set_card_profile` selects a card's agent and
`create_agent`, `update_agent`, `get_agent` and `delete_agent` edit them.

## Harness

The board has a **private library**, independent of the AI tool. Under **Settings → Harness**, the **Board library** tab holds **Rules**, **Skills**, **Sub-agents** and **MCPs**. The **Tool and execution** tab selects the AI, models, permissions, default agent and heartbeat, and connects the tool to the board MCP server. Switching tools preserves artifacts and selections.

Executions use only the copies stored in the board database. An item that exists only in the tool's folder appears as missing and does not enter. If an agent or card cites an MCP server that is not on the board, the execution does not start.

Each item has a usage mode:

- **Always**: included in every board run.
- **Per card**: available to planning and the Skills, Rules and MCPs fields; included when the card or its agent selects it.
- **Off**: kept in the library without taking part. New rules start off, for review.

Each tab has **Create**, search, **Edit**, mode change and removal with confirmation; in **Skills**, **Sub-agents** and **MCPs** you can change the mode or delete in bulk. Rules, skills and subagents have a **Guided assistant** and **Generate from project**; the **Sub-agents** editor has **Get AI help**, **Get AI recommendations** and **Review and save**.

**Import artifacts** accepts a project or a collection: choose the folder, check the items in the preview and **Import selected** copies each one into its tab. The board recognizes `AGENTS.md`, `rules/` and `agents/` folders, skills with `SKILL.md` and `mcp.json`/`.mcp.json` with `mcpServers`. Duplicate names ask for confirmation before overwriting. **Import → Installed tool** reads only the chosen tool's folder.

**Export to the tool** is the reverse path: it copies rules, skills and agents into the folder of **Claude Code**, **Cursor** or **Kimi Code**, in the **Project folder** or the **User folder**. **Replace the ones that already exist** rewrites what is already there. The result is a **disconnected copy**: the board does not follow it. MCP servers are not exported; **Connect to the board** registers the board's own in the tool.

**MCPs** accept a form (`command` and `args` for stdio, URL for HTTP) or **Edit JSON directly**. The definition is encrypted in the local vault; imported MCPs remain pending until human review. The **faz-ai** bridge provides `list_board_mcp_tools` and `call_board_mcp_tool` for any MCP client connected to the board. **Library folder** shows a readable copy, by default in `~/faz-ai-library/<project>/`.

## Settings

| Section | What it adjusts |
| --- | --- |
| Workflows e colunas | Workflows, names, order and meaning of the columns, where the AI works and each column's phase |
| Tipos de card | Story, Bug, Sub-task…, with color and default values per type |
| Campos personalizados | The fields you create and where they appear; the board fields (Fase, Tags, Modelo, Skills, Rules, MCPs, Esforço da atividade) can't be deleted or renamed |
| Regras do board | Completion and phase blocks, confirmations, suggested model and short track for small stories |
| Harness | Library of rules, skills, subagents and MCPs; tool, permission, default agent and heartbeat (see [Harness](#harness)) |
| Ferramentas de IA | CLI profiles: enable, set a default, duplicate, create and test; execution and fallback policies |
| Modelos de IA | Models and effort levels by profile; rules that suggest each card's model |
| Git | Mode, gitflow, branch names and prefixes, worktrees, automatic merge and decision records |
| Aparência | **Language**, theme, font and size, per board |
| Backup | Export and import the board (see [Board backup](#board-backup)) |

A **CLI profile** is a tool the board can run. The builtin ones are Claude Code, Cursor and Kimi Code; a **custom** profile accepts another text-output CLI. In **Settings → AI Tools**, enable a profile and choose the default. The card's **Model** field (`<profile>:<model>@<effort>`) names which CLI runs; without it, the board uses the agent's model, the model rule or the default profile, in that order. An invalid choice leaves the card **blocked**. Suggestion rules combine conditions with AND and OR; the result is always a suggestion. Fallback between CLIs is decided only by the **execution and fallback policies**, reviewed and enabled by you. When a new version changes the default board, the board asks whether you want to update it and only adds what is missing.

## Where the data lives

The board and the attachments live in the extension's storage, outside the repository. Each folder has its own database (`boards/<folder key>.db`). Agents, skills, rules and MCP definitions are stored in the board database; the library folder holds a readable copy, and each execution gets its own snapshot under `run-artifacts/`. Do not open the same folder in two windows: the last one to save wins.

**Updating the extension updates the database.** When the board opens, the extension applies the format changes that are missing, each in a transaction. An earlier version of the extension refuses to open a board saved by a newer version. Write errors are in **Output → Faz AI**.

### Board backup

In the editor, the command palette (`Ctrl+Shift+P`) has **Faz AI: Export the board** and **Faz AI: Import a board**; on the screen, **Settings → Backup** has **Exportar board** (export board) and **Importar de um arquivo…** (import from a file). The export creates a `.fazai.json` with everything on the board, including conversations and attachments: keep it safe. The import shows a summary, writes a copy of the database (`.bak`), moves the current attachments to backup and replaces the board; nothing changes if the file is invalid. Files from earlier versions are upgraded; from newer versions, refused. Do not import while the AI is running on a card. The monthly log history does not go into the file, and branches and working folders come as they were on the source machine.

## Development

```sh
npm install
npm run build
npm test
npm run typecheck
```

New features are integrated into `develop`. `npm test` also runs the linter and checks formatting; `npm run format` formats everything. `npm run typecheck` checks the types and `npm run build` generates `dist/`. Press `F5` to open the Extension Development Host. The code is in `src/extension` (host and MCP server), `src/webview` (React interface), `src/shared` (model and board rules), `src/mcp-bridge` (stdio bridge) and `src/cli` (the board outside the editor). `node dist/cli.js <folder> --data <test data folder>` serves the board in the browser. `npm run test:cli-real` separately tests the **installed Claude Code**, with no login and no remote model.

The changelog follows Keep a Changelog, with one section per version and the **Added**, **Changed**, **Removed** and **Fixed** headings. The top section is the next version (the one in `package.json`) and includes only what has already reached `develop`. Integrating into `develop` does not publish the extension.

With gitflow, the release starts from the branch you are on. On `develop`, `npm run release -- X.Y.Z` requires an up-to-date, clean branch, runs the tests, creates `release/vX.Y.Z`, commits and packages; on a `hotfix/...`, the version commit goes on the branch itself, and `npm run release` must run **before** approving the card. Then the script publishes to both stores, opens the PR to `main` (always with a **merge commit**), creates the tag and the GitHub Release with the `.vsix` and sends `main` back to `develop` through a PR. `npm run release -- finish` picks up where it left off; `--dry-run` rehearses without publishing.

Between packaging and publishing, the release checks the four showcase files (`README.md`, `README_EN.md`, `CHANGELOG.md`, `CHANGELOG_EN.md`): the changelog needs the version being released at the top, with no leftover "Não lançado"/"Unreleased", and the README needs the alpha-notice and thank-you blocks. If anything fails, the release refuses before publishing. If you rewrite a notice block, update the `SHOWCASE` table in `scripts/releaseCheck.mjs`.

The e2e tests start a Docker container with a clean Ubuntu 24.04 to see the environment Diagnostics as on a new machine; sign-ins are yours. `npm run e2e:cursor` opens Cursor with the extension from the current branch (on macOS, through noVNC at `http://localhost:6080`); `npm run e2e:kimi` opens the board through `src/cli` at `http://localhost:7878`, and you install the Kimi Code CLI following the [script](scripts/e2e-kimi/ROTEIRO.md). Both accept `-- continuar`, `-- parar` and `-- remover`, and need Docker without `sudo`.

### Preparing the development environment

On a fresh clone, set up again what lives outside git.

- Node.js 22+ and git: build, tests and the `faz-ai` command.
- `.mcp.json` and `.claude/settings.local.json`: connect the AI to the board; the board no longer creates them.
- `.env.release` with `OVSX_PAT`: Open VSX token for publishing.
- `az login --allow-no-subscriptions`: Azure CLI login for the VS Code Marketplace.
- `gh auth login`: creates the GitHub Release.
- `.claude/skills/publicar-extensao/`: the publishing walkthrough; copy it from the original machine.

The last four are only needed to publish.

## Version history

What changed in each version is in [CHANGELOG_EN.md](CHANGELOG_EN.md).

## License

[MIT](LICENSE)
