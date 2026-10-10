[🇧🇷 Português](CHANGELOG.md) · 🇺🇸 English

# Changelog

What changed in each version of Faz AI Kanban, newest first. The interface exists in Portuguese and
English; names of screens and buttons appear here as they are in the Portuguese interface.

## 0.34.0

- **A board saved by a newer version no longer half-opens.** After going back to an earlier version
  of the extension (for example, the store's one after trying a newer build), the board used to fail
  with "FOREIGN KEY constraint failed". Now the extension refuses to open it before touching the
  database and explains: the board was saved by a newer version, update the extension.
- **An error opening the board is explained and no longer locks the window.** When the database
  refuses a write (such as "FOREIGN KEY constraint failed"), the message now says which statement
  failed, and the full error goes to **Output → Faz AI**. Opening the board again retries, with no
  need to reload the window. The upkeep done on open (closing runs left open and consolidating the
  usage log) no longer stops the board from opening: if it fails, the reason goes to the log.
- **Usage in tokens, no dollar cost.** For now, the board measures AI usage only in tokens, which
  Claude Code and Cursor both report. The dollar cost is gone from Métricas (the total, the monthly
  series, the breakdown by category and the rankings), from the usage line in the card conversation
  and from the MCP `get_metrics`: only Claude Code reports the cost, and a total covering part of the
  runs confused more than it helped. The monthly series shows tokens, and the rankings now sort by
  tokens when the period has measured tokens. The value Claude Code reports is still stored in the
  database, so it can come back later without losing history.
- **Expired tool login: an error warning on the board, instead of stopping without explanation (#189).**
  The Claude Code sign-in is now actually checked (`claude auth status`), in addition to the existing
  Cursor check; before every AI call (the card's button, the heartbeat, autonomous mode), the board
  checks again, with a short cache. When the yellow bar's reason is sign-in, it switches to an error
  highlight and gains the **Abrir no terminal** (open in terminal) button, which runs the command
  there, but the actual sign-in is still always done by you. When the login expires mid-run, the
  first failure matching a known pattern ("OAuth session expired", "not logged in", "401", etc.) no
  longer blocks the card: it goes back to its previous status, with a short comment, and turns on the
  same error warning. The heartbeat and autonomous mode stop retrying on their own while it is on,
  without turning off, and resume once the sign-in is confirmed again. The environment check shows
  the same item.
- **The autonomous mode pause is recorded on the board (#220).** Pausing now lasts until you resume,
  even after closing and reopening the editor; before, reopening the editor started the queue
  again. Closing the editor still does not count as a pause, and turning the mode on for a story (or
  **Retomar**, resume) clears the pause. After a failure to start the tool, the autopilot does not
  start itself again until you resume. The sub-task list in the story panel now shows each sub-task's activity LED.
- **Arquivados tab replaces the archived column.** The "Arquivados" column is gone from the end of each board row (along with drag-to-archive and collapsing/expanding that column): rows are now narrow enough to see Histórias and Sub-tarefas at the same time with collapsed cards. Archived cards live in the new **Arquivados** (archived) tab, between Métricas and Lixeira, which preserves the history: one row per workflow, in board order, with only that workflow's archived cards, newest first. Archiving still happens from the card actions menu (with the usual confirmation) and through the automatic paths. Instead of "Desarquivar", the menu and the tab offer **Restaurar** (restore): the card goes back to the end of the first column of its workflow (Backlog / A fazer), inactive. Restoring a story also brings back all its archived sub-tasks and turns autonomous mode off; restoring a sub-task whose story is archived asks for confirmation ("Restaurar a história junto?") and restores the whole story; a sub-task of an active story comes back on its own. The `unarchive_card` MCP tool is unchanged.
- **Turn autonomous mode on and off right from the card, without opening it (#416).** The icon at the bottom of the card that already indicated "autonomous mode on" is now also a button: one click turns autonomous mode on or off without opening the story's detail view. The warning shown when turning it on is now shorter — it used to be a long paragraph with several operational details, now it's just the essentials: the AI runs the story on its own through the pull request, with no approval, question or confirmation, and how to stop it. This same text and dialog are used in the three places that turn autonomous mode on (the new card button, the toggle in the card detail, and the multi-select batch action), with the confirmation logic unified across them. The dialog gained a "Don't warn me again" checkbox: whoever checks it and confirms stops seeing this specific warning the next times, in all three places, as a personal preference stored in the browser or editor of whoever uses it (not on the board). Turning autonomous mode off in batch still always asks for confirmation, without the checkbox, since it's the riskier action.
- **Fix: autonomous mode no longer re-runs or blocks a story that was already delivered (#413).** An autonomous story that reached Homologação and was waiting on you (awaiting review or an answer, blocked, or approved and waiting for the next column) was treated as "no progress": the autopilot ran it again and ended up blocking it by itself. Now it leaves the queue while it is with you, and on a delivery without a pull request the AI calls `request_review` to mark the story as delivered.
- **Text-only phases run in parallel in any workspace mode (#331).** Refine, summarize and the phases that only produce a document (Discovery, PRD, Spec and Plan on the default board) now run at the same time, up to **Histórias ao mesmo tempo** (default 2), even with **Tocar histórias em paralelo** off. Implementation and Homologation work as before: one at a time outside the worktree, and parallel only in the worktree with the option on; the two caps are counted separately and there is still one run per story. In autonomous mode, the queue order applies to stories that need a branch; those in a text phase start when there is a free slot. Outside the worktree, `prepare_workspace` in a text phase while another story has a run in progress is refused (folder in use) and the branch is created in the code phase; with the "Sem restrições" permission the AI can still switch branches by hand, since the guard covers only the board's path.
- **Dragging cards is now smooth (#286).** When you drag a card, within the same column or to another column (empty or collapsed), the other cards slide aside with a ~200 ms transition and a dashed gap marks where it will land. The destination column makes room and the source column closes the gap. On drop, the card settles straight into its final position, without jumping back to the origin or flickering while the board updates; if the move is refused, the screen returns to the real state. It applies to stories and sub-tasks (any workflow) and respects `prefers-reduced-motion` (no transitions). **Fix:** moving a card down within the same column and dropping it on another card now saves it after that card, where the preview showed it (it used to be saved before it).
- **"Save description" is more prominent (#287).** When editing a card description, the button is now primary (solid indigo) and sits below the editor on the right, instead of a subtle button in the header. The button hierarchy rule is recorded in `DESIGN.md`; the other board buttons already followed the pattern.
- **Fallback model in a suggestion rule: execution retries automatically when the primary hits the limit.** Each model suggestion rule (Settings → AI Models) now has a **Fallback (optional)** field. When a card's execution fails because the primary model of a rule hit the plan's usage limit, the system automatically retries the execution with the fallback model, once only. If the fallback also fails, or if no fallback is configured, the card is blocked as before. The automatic switch records a comment in the card's conversation ("The `<primary model>` hit the usage limit; execution continues with `<fallback model>`"), without changing the card's Model field — the next execution will try the primary again. In autonomous mode (YOLO), the queue moves on without stalling when the primary hits the limit and a fallback is configured.
- **Cards can be collapsed to show only the strip and the title.** In columns with many cards, you can collapse cards in any of four scopes: a single card (button on the card), all cards in the column (item in the action menu), all cards on the board (button in the filter bar) or just the selected cards (button in the multi-select bar). A collapsed card continues to show the AI's activity LED and the status border so you know what needs your attention without expanding it. The state is remembered between sessions.
- **Activity bar at the bottom of the board.** An always-visible line, on every view, shows what
  the AI is doing right now: with one run, "IA em #12 (Discovery, há 3 min)"; with several, "IA em
  N cards: #12 Discovery · #15 refinando · …" (full list in the tooltip). Clicking the card
  reference opens the card. With no run at all, it shows the reason: the autopilot's note (why the
  queue stopped), the heartbeat's state ("Heartbeat desligado", "Heartbeat parado: motivo",
  "Próxima rodada às HH:MM") or "IA parada". The "IA trabalhando em N cards" counter at the top is
  gone, replaced by this bar.
- **Create-card button moved to the top of the column.** **+ Novo card** / **+ Nova sub-tarefa**
  moved from the column footer to the top, right below the header, so you don't have to scroll a
  full column to find it. Only the position changed: no behavior or data changes. The
  `docs/images/board.png` screenshot still shows the button at the bottom and was not updated in
  this change.
- **Git and parallel move from the board to the editor Settings.** The nine Git keys
  (`fazai.git.mode`, `branchPattern`, `worktreeDir`, `parallel`, `parallelStories`, `autoMerge`,
  `mergeMethod`, `watchMerges`, `watchMergeMinutes`) now live in `Ctrl+,` → **Faz AI: Git**, with
  **Resource** scope: the User value is the default for every project, and Workspace or Folder
  overrides it only for that project. In the editor, the Git tab and the "Tocar histórias em
  paralelo" block in the AI harness become a link to these keys; in the browser they stay as
  editable fields, as before. **Automatic migration:** the first time the board opens after this
  version, each key that only exists on the board becomes the User default; if the User already had
  another value, the board's is preserved by writing it to the Workspace (or the Workspace Folder,
  with multiple folders open) — **this can create a `.vscode/settings.json` in the project**. The
  board does not touch `.gitignore`: whether that file belongs in the repository is up to whoever
  uses it.
- **Summarize the card's conversation.** A new button in the Conversa tab, shown from 2 messages
  on, reads the whole conversation and writes a summary (decisions, notes, pending items) as a new
  AI message, without automatically deleting anything. The summary is reviewed like any other
  message: agree by leaving it as is, or edit the text. Below it, a recommendation lets you delete,
  with confirmation, the messages before the summary (not automatic); summarizing again creates a
  new record instead of replacing the previous one. Also available as the `generate_summary` MCP
  tool.
- **A blocked story held up the autopilot's whole queue.** With the first story in the queue
  stuck on an impediment (a block, a question without an answer, a dependency on another open
  card, or a stalled cycle), the autopilot stood still and none of the other independent
  autonomous stories ran, even when ready. Now any impediment is skipped while scanning the
  queue: the autopilot moves on to the next story that can advance (run, or move to another
  column when the AI does not work in it). A story that depends on another keeps waiting for
  that one to finish. The queue only shows the impediment warning when no story can advance,
  with the reason of the first one that got stuck.
- **Autonomous story delivery was not detected when the PR arrived before the last column.**
  When registering the pull request (`set_pull_request`), the board only marked `waiting_review`
  and commented the delivery if the story was already in the last column the AI works on; registered
  before that, the delivery was never detected and the autopilot kept trying to run a story that had
  already been delivered. Now that check (`settleDelivery`) also runs when the card moves to the last
  column, and inside the runner's `settle`, at the end of a run.
- **Backup through the command palette.** In the editor, the commands `fazai.exportBoard` ("Faz AI:
  Export the board") and `fazai.importBoard` ("Faz AI: Import a board") in the command palette
  (`Ctrl+Shift+P`) open native save and file picker dialogs, work with the board closed (they open
  the database on demand) and show notifications with the result. The "Backup" tab of the board's
  Settings no longer appears in the editor — it stays only in browser mode. In the native Settings
  (`Ctrl+,`), the "Faz AI: Backup" category now has the links "Export the board now" and "Import a
  board" that trigger the palette commands. With multiple folders in the workspace, the commands use
  the first folder (known limitation).
- **Formatted hint on the "Trabalhar na fase" and "Refinar com IA" buttons.** The buttons that run
  these actions (on the card's status bar and in the comments tab) now show a rich tooltip with the
  explanation formatted in bold and bullet points, instead of the native HTML `title`. The hint opens
  on hover or keyboard focus, closes with Esc, and stays visible when the button is blocked, so you
  know the reason even when you cannot click.
- **Autonomous Implementação stalled with the conductor.** A story's run is what carries out the
  Implementação subtasks, delegating each one to a subagent; but `condutor-do-board` (the default
  since the profile migration) runs read-only, and that restriction went to the Claude Code command
  line (`--tools`), removing the subagent tool from the session and leaving the specialists out (the
  empty context does not load the user's agents). The conductor kept saying "the board's automatic
  run will handle it" until the board blocked the card. Now a story's session receives the board's
  other available agents as subagents (with each one's tools and model), its agent gets the `Agent`
  tool, and its tool restriction goes in its own definition, not on the session. The factory
  conductor now says so in its instructions; an existing `condutor-do-board.md` in your folder is
  not overwritten, but the fix does not depend on it. And an agent's tool list is closed: Claude Code
  leaves out everything not in it, including the MCP servers it loaded — the board server connected,
  but the conductor's session had no `get_card` or `add_comment` and stopped without recording
  anything (the Diagnóstico said all was fine because it was: registration and connection were never
  the problem). Now every tool list the board builds for an agent, the story's or a specialist's,
  carries the board server's tools along (`mcp__faz-ai__*`): on the command line and also in the
  agent file, so it talks to the board when called as a subagent from the editor chat. Files the
  board had already written (the factory ones, such as the conductor) are completed once on opening;
  the interface does not show that name, only the list you chose.
- **Default agent after the profile migration.** Opening a board saved by an earlier version turned
  the built-in "Agente padrão" (no instructions) into the file `~/.claude/agents/agente-padr-o.md`,
  with the name cut by the accent and Opus as its model, and made it the board's default instead of
  `condutor-do-board`. Now that profile does not become a file (whatever pointed at it follows the
  board's default), migrated names only lose their accents (`agente-padrao`), and when the agent
  chosen as default does not exist, the conductor is used, not the first in the list. If the cut
  file was already created, delete it under Configurações → Harness → Global → Agentes.
- **Installing the flow skill checks it even when it already existed.** Since the empty context, the
  `faz-ai-fluxo` skill only counts as ready when it exists **and** is checked "include in every
  context". Anyone who already had the skill on disk saw the warning in the Diagnostics and on the
  board, and the **Install** button did nothing, because it stopped on finding the file. Now the file
  stays untouched (without `replace`), but the check mark goes in and the warning goes away. The MCP
  `install_flow_skill` says in its reply that it checked the skill.
- **Empty context by default and Harness with check marks.** Every run started by the board (Work
  on the phase, Refine with AI, heartbeat, board chat) now starts from an empty context: no rule,
  skill, agent, hook or plugin from your machine or the project gets in on its own. In Claude Code
  this is enforced by parameter (`--setting-sources ""`, `--disable-slash-commands` and an MCP
  servers file with the board's server and the ones the agent allows only); in Cursor, guidance in
  the prompt. What gets in is what you
  check under Configurações → **Harness de IA**, now with the **Projeto** and **Global** tabs, each
  with Rules, Agentes and Skills. Rules and skills have two check marks: **Incluir em todo contexto**
  (include in every context: goes into every run, by path) and **Usar quando fizer sentido** (use
  when it fits: becomes an option of the cards' Skills field and of the new **Rules** field, and
  Refine with AI picks it when the request calls for it). What is not checked does not exist for the
  run. Skills created or installed through the board are born checked; the flow skill is checked in
  every context when installed, and the Diagnostics only reports it ready when it exists and is
  checked. The `get_harness` (with `usage` and `onlySelected`) and `set_harness_selection` tools
  expose the check marks through MCP, and `get_card` returns `requiredRules` next to
  `requiredSkills`.
- **Agents as tool files.** Execution profiles no longer live in the board database: an agent is an
  agent file of the tool (`~/.claude/agents/<name>.md`, `~/.cursor/agents/<name>.md`), read from
  disk; the instructions are the session role and the frontmatter holds model, tools, skills and MCP
  servers (what belongs to the board only goes in `faz-ai-*` keys). The board stores, per project,
  which ones are **available** and which is the **default** (under Ferramenta e execução). Profiles
  already saved become files in the global folder on first opening, overwriting nothing; columns and
  cards now point by name. A profile that allowed every MCP server now allows only the board's: the
  others come back in the agent editor. The Agentes settings tab and the **Sessão limpa** (clean session) switch
  are gone: the empty context is always on. In Claude Code the agent goes inline (`--agents` +
  `--agent`), so it depends on no agents folder. On first opening, ten factory agents are created
  globally and checked (condutor-do-board as the default, frontend-web, backend-node,
  backend-python, mobile-flutter, documentacao-tecnica, qa-testes, revisor-de-codigo, devops-infra,
  dados-sql), with minimal instructions; what you delete does not come back on its own, and
  **Recriar os agentes padrão** recreates whatever is missing. **Sugerir agentes com IA** has the AI
  read the project and create or adjust agents through MCP (`create_agent` and `update_agent` gain
  `scope`, `model`, `tools`, `deniedTools`, `skills` and `mcp`; `get_board` lists the available ones
  under `agents`). Refine with AI receives the checked catalog (agents, rules and skills) and only
  picks from it, choosing the card's agent with `set_card_profile`.
- **The board supports only Claude Code and Cursor.** Codex, Kimi Code and GitHub Copilot are gone
  from the **Harness de IA** (AI harness) screen, which now offers just those two tools, and from the
  rest of the extension: built-in models, MCP server registration, rules, skills and agents, hooks,
  chat runs and the Diagnostic. A board that was set to one of them goes back to Claude Code when it
  opens. What Cursor and Claude Code still load from `.codex/skills` or `AGENTS.md` stays listed.
- **The price table is gone (#187).** A value computed from entered prices goes stale when the vendor
  changes its rates and makes the report wrong without any warning, so the board no longer calculates
  cost. Runs store the four token counters, and Claude Code also stores the `total_cost_usd` the CLI
  itself reports (Cursor does not report a cost); in this version the screens show only tokens (see
  "Usage in tokens, no dollar cost"). Gone are the
  built-in table, the price column of the **Modelos de IA** tab, **Preço variável** (variable price),
  the `price_*`, `reset_price` and `variable_price` fields of `upsert_model`, the price origin in
  `get_models` and the **Cursor Token Rate** rule (`cursorTokenRate` in `update_rules`). Catalogs saved
  before lose their price fields when the board opens. Older runs stay in the database, with the
  tokens they had.
- **Every call to the AI goes through a single door (#187).** The card runner (manual, heartbeat and
  autonomous mode) and the chat each repeated the usage record, and the record was optional. Both now
  ask an `AiGateway` for the run, which opens the `ai_runs` row before running, checks the permission,
  handles stop and timeout and stores outcome and consumption; each tool has its own provider
  (command and output reader). A test covers the four origins and fails if any file outside the
  gateway calls the AI or writes to the log. As a result, the usage log is no longer optional.
- **Faz AI settings in the editor Settings.** In `Ctrl+,`, searching "Faz AI" shows the Faz AI
  category with the sections Installation, Appearance, Git and Backup, in that order. Installation has
  the **Open the Environment Diagnostics** link; Appearance already brings **Language**
  (`fazai.appearance.language`); Git and Backup say their options arrive in the next versions, with a
  link to the board tab. Three new palette commands: **Faz AI: Open the Environment Diagnostics**,
  **Faz AI: Open the Faz AI settings in the editor Settings** and **Faz AI: Open the board settings**;
  in the board's Configurações, the **Abrir no Settings do editor** (open in the editor Settings)
  button goes the other way (it disappears in browser mode). Inside the editor the Settings wins and
  the board database is the copy, so browser mode and MCP see the same value; outside the editor the
  database is the only source, and whatever is written there is carried to the User Settings while the
  editor is open. On the first open, a board whose language differs from the default writes that
  language to the User Settings instead of being reset.
- **Environment check install script fully in English.** The script generated by **Install what is
  required** / **Install the recommended** mixed Portuguese ("Login da CLI", "instalação concluída",
  "pulado, porque … falhou") with the English interface. Step names and messages are now in English,
  and the test scans the script for Portuguese text.
- **Cleaner Cursor e2e test.** `npm run e2e:cursor` shows only "Gerando a extensão…" (packaging the
  extension) and, if any, the build error; the full output appears only when packaging fails. The
  `groups: cannot find name for group ID` warning is gone: the computer's groups (video, render) are
  now created inside the container, in `start.sh`, from the ids received.
- **Fix: the sub-task LED went dark seconds after lighting up.** Moving a card to another column
  reset its work status, including "Running": since the AI calls `start_work` and then moves the
  sub-task to "Em andamento", the green LED blinked for a moment and went off, and the story did
  not show the AI working on it. Now a running card moved to another column where the AI works
  stays "Running"; the other statuses still restart on a column change, and done columns have no
  work status.
- **Autonomous mode resumes by itself when the editor opens.** Stories already in autonomous mode
  used to sit still until a click on **Retomar modo autônomo**, which looked like the mode "not
  working". Now, when the editor opens (and whenever the window becomes the board's owner), the
  autopilot resumes the pending queue and logs it. The pause is still yours: what you paused, or
  what stopped because the tool failed to start, only comes back when you resume; a queue made only
  of delivered stories does not turn it back on.
- **Fix: a story waiting for a dependency stalled the whole autonomous queue.** The first story in
  the queue (board order) that depended on another open story held the autopilot with "waits for
  #N", even with #N itself ready further down the board. Now a story waiting for a dependency is
  skipped and the turn goes to the next story that can run; only when none can does the queue stop,
  with the first story's reason.
- **Queue order: the most advanced story finishes before a new one starts.** The execution order
  (heartbeat, autonomous mode and `get_pending_work`) was bug, card row and only then column, so a
  story just created at the top of Discovery jumped ahead of a half-done Implementação. Now it is
  bugs first; then the rightmost column; within a column, top to bottom. A new bug becomes next in
  the queue as soon as the current run finishes.
- **"Como testar" (how to test) script in the card description and the pull request.** In
  Homologação the AI now writes the test script (what was built, the steps with the expected result
  and what was left out) in the story's description and in the PR body, not only in the
  conversation. The column's default instruction and the flow skill changed; a board with the
  previous default instruction gets the new one through the template upgrade (version 5), and an
  already installed skill needs to be reinstalled with **Replace** to get the new text.

- **Markdown attachments open formatted.** A `.md`/`.markdown` attachment (such as a story's PRD,
  Spec or Plan document) now opens with headings, lists, tables and code blocks already formatted,
  instead of the raw text with `#`, `**` and `|---|`. A **Formatted** / **Code** selector in the
  window header switches to the raw text when needed; Edit, Save and Copy content still operate on
  the Markdown, as before. Images, JSON, plain text and types without a preview are unchanged.
- **Fix: the autonomous-mode branch stack came out wrong after reordering the queue by drag.** A new
  autonomous-mode story's branch now starts from the most recently created branch among the open YOLO
  stories — the same order the execution queue runs in — instead of starting from the nearest
  lower-numbered story. Before, dragging a card to the top of the queue left the pull request stack
  branching off a base that did not match the real run order, requiring a manual rebase. A story whose
  predecessor already had its pull request merged now starts directly from the main branch.
- **Fix: the board would not open, with "FOREIGN KEY constraint failed".** The one-time orphan
  cleanup that runs when the database opens stopped at the first orphan still referenced by another
  orphan (an old board's workflow used by its card types). It now retries once the referencing rows
  are gone, and an orphan that cannot be removed no longer keeps the board from opening.
- **Environment check.** A `flutter doctor`-style list of what the board needs (Node.js, the tool's
  command line, sign-in, board MCP, permission) and what it makes use of (flow skill, Git and
  repository, GitHub CLI and sign-in, Code Review Graph, project graph and semantic search). Each
  item has what it is for, how the board uses it, privacy, how to fix it (command to copy, button
  or download) and **Learn more**. The commands follow the detected system (Windows, macOS and the
  Linux families), and Code Review Graph shows its `uv` and Python prerequisites inside it.
- **Install everything, in the environment check.** **Install what is required** and **Install the
  recommended** show the steps and the script, and run in an editor terminal (bash or PowerShell,
  depending on the system). A step that fails does not stop the others, and the screen shows each
  one's result, with the error of those that failed. In browser mode, the script is for copying.
- **The board MCP and the flow skill become requirements** for every tool, in the yellow bar and the
  environment check: the editor chat depends on the MCP, and the skill makes the AI follow the flow.
  The bar gets an **Install the skill** button, and the Cursor "turn on the MCP" notice goes away
  seconds after it is turned on.
- **Full path for MCPs in the editor.** The editor chat cannot find what was installed after it opened
  (Node through `nvm`, `uvx`): the board writes the full path into the `faz-ai` and
  `code-review-graph` registrations, out of git, and the yellow bar warns when it is missing. The list opens on its own the first time the board opens on a
  machine and, after that, from **Check environment** in Settings or **See the full environment
  check** in the yellow bar.

- **Board server in Cursor and the other tools: a global install that works and a banner that goes
  away.**
  - The install button shows the result and the error on the board itself. They used to go to the
    editor notifications, which Cursor keeps in its notification center without showing them: the
    install seemed to do nothing.
  - **In Cursor, nothing to install.** Cursor's global scope is a single process for all windows,
    started without knowing which project to serve: the server showed an error, and when turned on by
    hand it served the same board in every window. Now the board writes the project's
    `.cursor/mcp.json` on its own (outside git) as soon as the folder opens in Cursor, and removes the
    old global entry. The first time in each project, the banner asks you to reload the window and
    then to turn on `faz-ai` in Cursor Settings → MCP (Cursor keeps every new project server off),
    with the **Abrir MCPs do Cursor** (open Cursor MCPs) button, which goes straight to Customize →
    MCPs, and goes away once the server connects.
  - The other tools' global registration tells the server where the project is: in Claude Code
    through the `CLAUDE_PROJECT_DIR` variable, in VS Code's `mcp.json` with `${workspaceFolder}`.
  - A broken registration in the project file (a `.cursor/mcp.json` for another folder, or for a node
    that is gone) takes precedence over the global one, and reinstalling the global one did not fix
    it: the banner now has **Corrigir o registro** (fix the registration), which removes it from there
    and leaves the global one in effect.
  - The bridge (`bridge.js`) now lives in `~/.faz-ai/mcp/`, the same for VS Code, Cursor and
    `faz-ai`. A registration with the old bridge asks you to install again.
  - GitHub Copilot: the global install also writes the VS Code profile's `mcp.json`.

- **Theme, font and font size moved to the editor's native Settings.** The three keys `fazai.appearance.theme/font/fontSize` now exist in VS Code's and Cursor's Settings (User scope), alongside `fazai.appearance.language` which already lived there since #179. Inside the editor, the Appearance tab of the board's Settings shows a link to open the native Settings; in browser mode (`faz-ai` in the terminal), the tab stays as before, with all 4 fields, because there is no editor Settings in that mode. Syncing is automatic: if the Settings has no explicit value yet and the board has a non-default value, the board's gets copied to the Settings and applies to all projects; if the Settings already has an explicit value, it wins (sync requirement from #179 extended to the three new keys). With multiple different boards opened for the first time after the update, the value from the first board to open applies — the others follow the Settings from then on.
- **The status table moved from the Appearance tab to the Workflows tab.** Name and color of each status stay editable on the board, but now in Settings → Workflows, not in Appearance; the interface (the fields and colors) stays identical, no existing customization is lost.
- **Dependency warnings between settings and cross-linked navigation.** Some configuration options only work because of another, but there is no notice. A new component shows a discreet line under the dependent option (for example, "Depends on **a model suggestion rule** (now: none)") that stays disabled when the dependency is not met. The cross-linked navigation lets you click a link to go to the matching board section (which scrolls and highlights for 2 s), or to open the editor Settings at the matching option; in browser mode, links to the Settings appear as text only. **"Fill in the suggested model automatically"** moved from Rules to Models, where it makes more sense — Rules shows a simple notice about the move. The Heartbeat interval field stays disabled when the heartbeat is off, with no additional dependency component. New headers in Models, Agents, Rules and Skills show "Showing the X of Cursor · switch tool" (or of the configured tool), allowing you to switch tools from any of these screens. A link in Settings (`fazai.git.parallel`) opens the board again, at the Harness heartbeat section.

### Fixes

- The autonomous-mode bar inside a card no longer shows another story's full block reason (the autopilot note is board-wide): about another card it shows a short line pointing to it; the full text stays in the activity bar.
- **A pending item for the person now hands over the card status.** When the AI left something depending on you (a decision, an open point, something left out of the delivery), it wrote that in a comment and moved on, and the card did not show it was your turn. `request_review` now takes a `pending` parameter: the item goes to the conversation under **Blocked on you** and the card stays in **Waiting for review**, even in autonomous mode (the request is no longer auto-approved and the queue moves on with the other stories). The flow skill and the MCP server instructions now require this path and gained the "Pending with the person" section and the three-block phase wrap-up (Blocked on you, What changed, What I found). Reinstall the flow skill in Settings → Harness to update its text.
- Claude Code's `allowed_warning` (close to the plan's cap) is no longer treated as an exhausted limit: the switch to the fallback model only happens on `rejected` or a window at 100%.
- The switch to the fallback model only happens when the run failed; a run that finished fine is no longer redone with the fallback.
- If the retry with the fallback model cannot start (card archived, tool refused), the card is blocked with the reason instead of staying "running" with no run.
- On a sub-task, the run now counts as text or branch by the story's phase, as the queue does, and the activity bar shows that phase.
- The **Export the board** and **Import a board** palette commands now have English titles when the editor is in English.
- The "História entregue com o pull request…" comment is always authored by the AI tool, even when the person moved the card.
- The autopilot note in the activity bar shows only the first line of the block reason, without code fences and capped at 160 characters.
- On Windows, runs and CLI probes no longer open a `cmd.exe` window.
- On Windows, the MCP server's named pipe carries the user name: two users with the same folder no longer compete for the same pipe.
- The multi-select bar now has a background, border and padding, like the filter bar, in both themes.
- The card's **Modo autônomo** checkbox and the batch button in the selection bar reflect the click right away and stay locked (the bar shows "Aplicando…") until the board confirms; with no reply in 3 s they revert.
- Collapsing or expanding a card with the keyboard keeps focus on the collapse button: Enter again reverts.
- The card's selection checkbox shows up when it receives keyboard focus (and while focus is inside the card).
- The activity bar no longer announces the whole line to screen readers every minute: only the card reference and phase are announced; the "N min ago" sits outside the live region. The autopilot note stays on one line, with the full text in the tooltip.
- Dragging a card right after dropping another starts from the order on screen, not the old one.
- In AI Models, **Preencher o modelo sugerido automaticamente** shows as off when there is no suggestion rule (it used to stay on and locked after deleting the last rule).
- **Resumir a conversa** locks right after the click: two quick clicks no longer start two runs.
- Only one **+ Novo card** form is open at a time on the board, and Esc closes it even when focus is outside the field.

## 0.33.0

- **README images** for agents, harness and models redone with this version's interface, in
  Portuguese and English.
- **Board MCP and flow skill installed in each tool's section, globally by default** ([#141](https://github.com/euclidesgc/faz-ai/issues/141)).
  - In **Harness de IA → Tudo que a ferramenta carrega**, each tool's **Servidores MCP** section has the board
    server, and its **Skills** section has the flow skill, each with its global and project state and
    two buttons: **Instalar (padrão da ferramenta)** (tool default), which writes to the global config
    (`~/.cursor/mcp.json`, `~/.codex/config.toml`, `claude mcp add --scope user`,
    `~/.claude/skills`…) and works in any repository with no file in the project, and **Instalar
    neste projeto**, to pin a version in a repository or a fork.
  - The duplicated buttons are gone: **Conectar IA (MCP)** from the settings menu and the tool tab,
    and **Instalar skill do fluxo** from the **Do projeto** tab. The requirements bar leads to the
    tool's **Servidores MCP** section.
  - Installing in the project when a global one exists asks for confirmation, and a flow skill that
    already exists at the destination is only replaced after confirming.
  - The global registration counts in the requirements bar, and Cursor runs from the board use the
    global one instead of writing `.cursor/mcp.json` in the project when it leads to this board.
  - Kimi Code, in the project, writes to `.kimi-code/mcp.json`; before, it always went global.
  - The MCP tool `install_flow_skill` takes `tool`, `scope` (`user`, the default, or `project`) and
    `replace`.
- **Cursor pricing.** **Auto** now has a **variable price**: Cursor charges the price of the model
  each request is routed to, so the board does not estimate its cost instead of using a misleading
  fixed number. The **Preço variável** (variable price) switch exists on every model in **Modelos de
  IA** (AI models) and in `upsert_model` (`variable_price`), and "Detectar modelos" keeps it.
- **Cursor Token Rate.** A new switch on the Cursor card, off by default: adds US$ 0.25 per million
  tokens to the estimate of third-party models, as Cursor charges on Teams and Enterprise plans;
  Composer, Grok and Auto are exempt. Through MCP, `cursorTokenRate` in `update_rules`. Runs already
  recorded are not recalculated.
- The price table hint and the README explain fast mode (a separate model with its own price), long
  context (not told apart: Cursor only reports the token total) and how the `cursor-agent models`
  id, the pricing table name and the board's model match.

## 0.32.0

- **Agents, models and rules no longer lose a change made right after another.** Writing an agent's
  intent and then clicking **Só leitura** (read-only) erased the intent: the second change started
  from the list before the first. The same went for the model catalog and the suggestion rules. Each
  change now starts from the last one sent.
- **Suggestion rules in English:** the "Esforço da atividade" field name, its options and the names
  of the rules the board creates are shown translated ("Task effort = Low"), as on the card.
- **README images redone** with this version's interface, in Portuguese and English.

- **Windows, macOS and Linux: the same board, with no data loss.**
  - **Same board in the editor and in the terminal:** on Windows, the terminal's `faz-ai` and the
    board server started by the AI reached the folder with an uppercase drive letter (`C:\`), and the
    editor with a lowercase one (`c:\`): two boards, two databases and two servers. The key is now
    the same. On macOS, `faz-ai` no longer resolves symbolic links, to get the same folder as the
    editor.
  - **The database never opens empty by mistake:** a file that exists but could not be read (on
    Windows, held by the antivirus or by cloud sync) opened an empty board that erased the real one on
    the first save. The board now waits for the file to be released, or reports the error. Saving
    also retries while the file is held.
  - **Worktrees on Windows:** a story's working folder was refused ("já existe e não é uma worktree",
    already exists and is not a worktree) from the second phase on, because git lists the path with
    `/`. A worktree that cannot be removed (locked file) no longer leaves its registration half done.
  - **Two windows on the same folder on Windows** get the same overwritten-data warning as on macOS
    and Linux.
  - **`npm test` on Windows:** `.gitattributes` pins LF, and a CRLF checkout no longer fails every
    file in Prettier. The Codex skill policy (`agents/openai.yaml`) with CRLF is read and switched
    without duplicating the key.
  - **The `faz-ai.cmd` launcher** works with an accented user name. Opening files and folders from
    the board in the browser no longer goes through `cmd.exe`, which read `&` and `%` in the path as
    commands.
  - **Terminal PATH (macOS and Linux):** a shell that is slow to open (nvm, conda, oh-my-zsh) gets
    more time, and a failure is not kept until the editor reopens. The board also looks for the CLI
    and node in nvm, Volta, fnm, asdf and mise, and on Windows in the Cursor installer's folder.

- **Sturdier Claude Code and Cursor runs.**
  - **Cursor:** the request goes through standard input, no longer on the command line. On Windows,
    a CLI installed as a `.cmd` went through `cmd.exe`, which cuts the line at 8191 characters and
    joins the request's lines. For Copilot and Kimi, which only take the request on the command line,
    a long request goes to a file the tool reads.
  - **Agent that restricts MCP servers (Claude Code):** it uses the board server of the run itself.
    It used to copy the one in `.mcp.json`, and failed without the registration or ran against
    another folder. The folder's servers in `~/.claude.json` are also found on Windows.
  - **"Board e arquivos" (board and files) level (Claude Code):** reading is also allowed outside the
    project, where the card's required skills live (`~/.claude/skills`).
  - **Stop and the time limit end the whole tree** (MCP servers, tests, commands the AI started), not
    only the CLI.
  - **As root** (containers, WSL as root), Claude Code does not run "Sem restrições" (unrestricted):
    the board warns, instead of every run failing.
  - **Without Node.js on the PATH,** the board server runs with the editor's own runtime.
  - The Claude Code bundled in the editor extension is also found on the remote side (SSH, WSL,
    container). Temporary folders of interrupted runs are deleted the next day, and MCP server names
    with a dot or space are allowed correctly.

- **The open card no longer loses what was written.**
  - **Description rewritten by the AI:** with the card open, the new description shows on screen,
    and closing the card no longer writes the old one back. A draft of yours still wins over the
    outside change.
  - **Esc:** with the Ações (actions) menu open, it closes only the menu, not the card. In a text
    field, the first Esc only leaves the field (and saves the title or the checklist item); the
    second closes the card. In a confirmation with an open list of options, it closes only the list.
  - **Title:** a new title coming from the AI does not erase what you are typing.
  - **Conversation:** the message being written survives switching tabs.
  - **Edited text attachment:** Esc or a click outside no longer discard the edit without warning,
    and Salvar (save) does not send twice.
  - The search in the Vínculos (links) section does not carry over from one card to the next.
  - In Harness de IA, the button that starts a heartbeat round is called **Rodar o heartbeat agora**
    (run the heartbeat now), like the palette command (it was "Chamar a IA agora", easy to confuse
    with the card buttons).

- **"Chamar IA" became two buttons, each with one job.**
  - **Trabalhar na fase** (work on the phase) is the old Chamar IA, named after what it does: the
    work of the column the card is in (in Implementação, code), until it hands over.
  - **Refinar com IA** (refine with AI) is new: rewrites the title and description clearly, reviews
    Tags, Esforço da atividade, Modelo and Skills and completes the checklist, without working on the
    phase, moving the card or touching files (it runs with the board only; in Kimi, which lacks
    that level, the request forbids it). The summary of what changed stays in the conversation, with
    the previous description, and the card returns to the status it had, also when the run fails
    (the failure goes to the conversation, without blocking the card). Refining does not count as a
    run without progress for the autonomous mode.

- **Cursor fast modes.** In Configurações → Modelos de IA (Settings → AI models), the Cursor card got
  the **Incluir os modos rápidos** (include fast modes) switch, off by default. When on, the fast
  version of each model (it answers sooner and charges more for the same tokens) enters the catalog
  as a separate model, for example "Claude Opus 5.5 1M Fast", with its own price for the cost
  estimate; the board builds the id Cursor expects (`claude-opus-5-5-high-fast`). Only the fast
  versions of models in the catalog come in: a model you removed does not come back, nor its fast
  version. When off, they leave the catalog. Through MCP, it is the `includeFastModels` rule of `update_rules`.

- **Board requirements warning.** While something is missing for the board to work with the AI
  tool, a bar stays at the top of the board (on every screen) and in the chat panel, with no close
  button. It points out: Node.js not on the PATH, the tool's command line not installed, Cursor's
  CLI not signed in, the board's server not registered in the file the tool reads, a registration
  pointing to a node or path that no longer exists (nvm switched versions), a registration for
  another folder (the file came from another machine through git, or the project moved) and a
  permission level the tool does not accept. For Claude, a server registered for your user
  (`claude mcp add -s user`) also counts. Each item brings the action: the command to copy,
  **Conectar IA (MCP)** (connect AI) or the shortcut to the AI harness. The bar goes away on its own
  when everything is solved; **Verificar de novo** (check again) checks right away, rereading the
  terminal PATH (a node installed with the board open is found without reloading the window), and
  says when nothing changed.
  - **Recommended is not required.** For Claude and Cursor, runs from the board carry the board
    server on their own: the registration is only missing in conversations outside the board. That
    item shows as recommended, out of the count; on its own, it becomes a discreet line instead of
    the yellow bar.
  - **The card's AI buttons are disabled** while the command line is missing or not signed in, with
    the reason in the tooltip, instead of failing after the click.
  - In the chat panel, the compact version shows the explanation when the item has no button that
    solves it (Node.js, permission, install site).

- **The card's AI buttons show the error on the board itself.** When the run does not even start (CLI not
  found, for example), the reason appears as a notice on the board screen and stays in the Faz AI
  channel. It used to go only to the editor's notifications, which Cursor keeps in the center
  without showing: the click seemed to do nothing.

- **Cursor's models are your account's.** With the CLI signed in, the board reads
  `cursor-agent models` when it opens and when the project switches to Cursor; the first real list replaces the built-in one only once, and after that **Detectar modelos** (detect
  models) brings it again (a catalog you trimmed does not refill on its own). The
  roughly 250 variants Cursor lists (one per level, plus the `-fast` ones) become about 50 entries,
  each model with its levels. The built-in list lost `grok-4.7`, which does not exist with that id,
  and Cursor's suggestion rules start at Auto, the only model the free plan accepts. On a board that
  already had other rules, the free plan's refusal comes explained on the card, with the way to pick
  Auto.

- **The board's tools refuse unknown parameters.** A misspelled name used to be dropped silently and
  the tool went on with the default: a misspelled `parent` in `create_card` created a story instead
  of the sub-task. The call now returns an error naming the parameter that does not exist.

- **Cursor catalog updated.** Local MCP servers the board adds to `.cursor/mcp.json` carry
  `"type": "stdio"`, as the documentation asks; subagents in `.grok/agents` appear in the inventory;
  and the `afterAgentThought`, `workspaceOpen`, `beforeTabFileRead` and `afterTabFileEdit` hook events
  are listed.

- **The board's server is registered with the full path of node.** An editor opened from the system
  menu does not inherit the terminal's PATH; with node installed only through nvm,
  `"command": "node"` did not start the server.

- **Cursor in the background really works.** The Trabalhar na fase button (formerly Chamar IA), the heartbeat and autonomous
  mode with Cursor had four defects, now fixed:
  - **No board server.** If nobody had clicked Conectar IA (MCP), the run had none of the board's
    tools and ended as a success without moving or commenting anything. The board now writes the
    server to `.cursor/mcp.json` before running, and redoes a registration that points to another
    folder. A `.cursor/mcp.json` that is not valid JSON is left as is, with a warning in the Faz AI
    channel.
  - **Zeroed consumption.** Cursor reports tokens in camelCase and the board read Claude's names:
    runs showed as measured with 0 tokens and zero cost. Tokens are now read, and the cost is
    estimated from the model that actually ran (Cursor reports it at the start; with `auto` it was
    impossible).
  - **Empty inventory.** The tools used, MCP ones included, were not counted. Now they are, once
    per call.
  - **Outside the worktree.** The story's working folder was not passed to Cursor; it now goes with
    `--add-dir`, as for the other tools.

- **Cursor accepts the "only the board" and "board and files" levels.** It used to run only with
  "no restrictions". At the lower levels the session gets only that level's tools, no terminal.

- **Cursor's CLI is looked up as `cursor-agent`.** The board also finds the CLI in the installer's
  folder, before trying the short `agent` name (which may be another program). The model effort goes
  as a suffix of the id (`claude-opus-5-5-high`), the way `cursor-agent models` lists the variants; a
  model with no level chosen runs at its default level, also in the board chat and in the model
  `get_card` reports.

- **Windows: the prompt reaches npm-installed CLIs intact.** Quotes, `&` and `|` in the text were
  interpreted by `cmd.exe`, and **Parar** (Stop) left the CLI running. Arguments are now escaped and
  Stop ends the whole process tree; if the process still does not close, the run ends for the board
  instead of leaving the card "Em execução" (running). Cursor's sign-in and model list are also read
  on Windows.

- **The board records the consumption, cost and inventory of each AI run.** For each run it stores
  input, output, cache read and cache creation tokens, the cost in dollars, the turns and the
  session id, plus the inventory of what was used: tools, MCP tools (with the server), subagents and
  skills. When the tool does not report the cost, the board estimates it from the model's **price
  per million tokens**, which you fill in under Configurações → Modelos de IA (Settings → AI models,
  or through MCP with `upsert_model`), and the estimated value is marked. A model without a price
  gets no cost, never 0. In the log channel, the tool's output now appears as readable lines, and
  each run ends with a consumption summary line. Copilot has no structured output: its runs are
  recorded **with no measured consumption** ("não medido", not zero). Questions in the board chat
  are recorded too, with no card. `get_metrics` now returns tokens and cost.

- **New Métricas (Metrics) view, the fourth navigation button.** It shows the board's work and AI
  usage, in the editor and in the board in the browser. It has period filters (Hoje, 7 dias, 30
  dias, Este mês, Últimos 12 meses, Tudo and a free range) and a workflow filter, and five totals:
  completed activities, AI runs, tokens, cost and AI time. AI time is the sum of each run's
  duration, so simultaneous runs add up and the total can exceed the elapsed time. What was not
  measured shows as "não medido" (not measured), never as 0.

- **The metrics panel has the cost and tokens series per month.** A bar chart, one series at a time.
  The month in progress is hatched, a month with no data is a gap marked "sem dado" (no data), and a
  table has the same numbers. The notes sit next to the number: since when the board's log exists,
  the period cut at the start of the log, and the months that only have the monthly total.

- **The metrics panel shows where the usage happened, how long a card waits in each phase and what
  the AI used.** Five new blocks below the monthly series, each one saying how far it sees: the
  whole series of the period or only the detail kept, with the month it starts.
  - **Where the usage happened:** usage split by phase, card type, model, AI tool, effort or profile,
    as horizontal bars in the chosen measure (cost, tokens, runs or AI time), with the table of the
    four measures beside them.
  - **How long a card stays in a phase:** median and mean of each pass through a phase, how many
    permanences are unknown and how many cards are in the phase now. It is clock time, not AI time:
    the card may be sitting there waiting for someone.
  - **Lead time:** from the card's creation to its first completion, with the median in front, the
    mean, the count of unknowns and the list per card. Unknown is a card whose creation fell outside
    the detail kept; the date is not estimated.
  - **Most expensive phases and Most expensive cards:** two rankings side by side, in tables sortable
    by any measure. The default is cost when the period has measured cost and AI time when it does
    not, and the screen writes the criterion in force. What goes past the row limit adds up in an
    "others" row.
  - **What the AI used:** tools, MCP tools (with the server in its own column), subagents and
    skills, with runs and uses. "Not measured yet" and "no records in the period" are different
    states.

  Tokens count even when the model has no price configured; cost adds up only the runs that have a
  price, and the note says how many were left out. Unmeasured or partial cost is explained in the
  Totals and in the series; tiny cost shows as "less than US$ 0.0001". The times and the inventory
  read only the detail kept: when a month leaves the retention window, it leaves these blocks.
  Tables
  that scroll take keyboard focus, the inverted range error is announced to screen readers, and the
  retention window field says it saves when you press Enter or leave it. The screen warns when a
  query takes longer than 15 seconds (with "Consultar de novo" / "query again"). A period chosen
  before the log starts is stated as such.

- **`get_metrics` groups by effort, profile, used tool and MCP tool.** The new dimensions are
  `effort`, `profile`, `used_tool` and `mcp_tool`. Mind the names: `tool` is the AI tool that ran
  (claude, codex); `used_tool` and `mcp_tool` are what the run used (Read, Bash, `get_card`), and
  `mcp_tool` brings the server in its own column, or "servidor não registrado" (server not recorded)
  when the name did not carry it. As with `agent` and `skill`, the inventory dimensions only count
  runs and uses, with no tokens or cost. `effort` and `profile` have tokens and cost. The panel's
  times (permanence and lead time) are not in `get_metrics`.

- **The window for each run's detail is configurable, from 1 to 24 months, and the default dropped
  from 12 to 6.** In the **Detalhe guardado** (Detail kept) block of the Metrics view you choose how
  many months of detail (consumption and inventory per run) the board keeps besides the current
  month; after that only the monthly totals remain, and they never expire. The retention only
  accepts
  whole numbers (12.5 becomes 13), and canceling a reduction restores the value. Lowering the window
  asks for confirmation and the discard happens the next time the board opens. If you are upgrading,
  you lose the individual detail of runs older than 6 months, not the totals. The shorter default
  keeps the database file within its size limit.

- **One click on the branch name copies it.** In the open card, the story's branch became a button:
  clicking copies the name to the clipboard and the screen confirms with "Nome copiado" (name copied).

- **The heartbeat can drive several stories at the same time.** In the settings, under execution by
  the AI, the **Tocar histórias em paralelo** switch (off by default) makes the heartbeat run several
  stories together: two by default, up to six in **Histórias ao mesmo tempo**. It only applies in "Worktree por história" mode, where each story works
  in its own folder; outside it, and in autonomous mode (stacked stories), it stays one at a time. The
  limit counts every run in progress, and more stories in parallel use more of the account usage limit.
  The Git screen now explains, in each mode, whether parallel is available and why: a branch in the
  same folder causes conflicts between stories; worktrees isolate them, but take more disk and use
  more memory and CPU while several run together. A card waiting on another (pending dependency)
  does
  not enter the queue; the heartbeat does not start a story with a sub-task running and uses the
  free
  slots of the parallel run limit even with an active run; autonomous mode and the heartbeat take
  turns in the slots; sub-tasks with someone or already running do not enter the parallel round; a
  dependency link between a card and its own story is refused.

- **Independent sub-tasks run at the same time.** A card can now **depend** on another (new link,
  in Vínculos: "precisa terminar antes deste card" / "só começa depois deste card", with the groups
  "Depende de" and "Libera"). In Plan the AI declares the order between sub-tasks (`create_card` with
  `depends_on`); in Implementation it delegates the ones with no pending dependency to simultaneous
  subagents, each with its card's model, and proceeds in rounds (`subtasksNow` in the story's
  `get_card`). `start_work` refuses a sub-task that is still waiting for another. It used to be
  always one sub-task at a time. If you already had the flow skill installed, delete it and install
  it again to get the new instruction.

- **The card's LED now looks like an LED and tells the state at a glance.** It used to be a dot in
  the bar's text color, with a nearly invisible pulse. It is now green and blinks slowly while the
  AI is working on the card (or on one of the story's sub-tasks), yellow when the card is waiting on
  you, red when it is blocked, and off when nothing is happening. Only green blinks. This applies to
  the cards on the board, the sub-tasks and the header of the open card.

- **Buttons say what the click does.** Labels that showed only a state or a generic name became
  actions: at the top, "Pausar modo autônomo" / "Retomar modo autônomo" (pause / resume autonomous
  mode), "Ver 2 com você" / "Ver todos os cards" and "Abrir chat" / "Fechar chat"; on the board,
  "Mostrar filtros", "Limpar filtros", "+ Nova coluna" and "Criar card"; on the card, "Parar a IA"
  and "Salvar descrição"; in the settings, "Criar tipo", "Criar coluna", "Adicionar modelo", "Fechar
  edição", "Reler pastas", "Chamar a IA agora", "Restaurar aparência padrão" and others. In the
  interface, autonomous mode now goes by a single name (no "YOLO" or "autopiloto" in the labels).

- **Export and import the board.** In **Configurações → Backup** (Settings → Backup), **Exportar
  board** creates a `.fazai.json` file with everything on the folder's board: settings, cards
  (including archived and trashed ones), conversations, checklists, links, history and the embedded
  attachments. **Importar de um arquivo…** shows a summary, asks for confirmation, writes a copy of
  the database (`.bak`) and replaces the current board with the one from the file, keeping the card
  numbers. Attachments from the board being replaced go to a backup folder next to the attachments
  folder (`<attachments>.bak-<date>`), and the confirmation says so. An import file with a card id
  or
  attachment name containing a path (`../`) is refused. A file from an earlier version is upgraded
  on import; one from a newer version is refused. Importing while the AI is running on a card is
  refused. Works in the editor and in the browser. It is the way to move the board between machines,
  since it lives outside the repository.
- **Splitting a large request into stories now actually links them.** Creating a story with
  `autonomous_from` now gives it a **related** link to the origin story — before, the origin was
  only recorded as text, in a comment that neither the interface nor the AI read as a relation. If
  any link already exists between the two (e.g. a story linked by hand), the creation is skipped
  silently, without duplicating.
- **The Vínculos (links) section of the open card now shows the sub-task relation.** On a sub-task,
  a "Pai" (parent) group with the story; on a story, the sub-task count with a shortcut to the
  Sub-tarefas section (without repeating the list). The relation is read-only and does not enter the
  completion rules, which still apply only to the manual parent/child link.

- **A story leaves the board when its version is published.** In the same round that looks at the
  pull requests, the board checks whether the merge commit of a concluded story is already in a
  published version — a tag that contains the commit **and** that has a published release on GitHub.
  It is: the board registers in the conversation which version carried the story (tag and release
  link) and archives the card, which goes to the workflow's archived area and can be unarchived with
  one click. The Concluído column now means "merged and not delivered yet". **The feature is on by
  default**, along with merge detection and on the same interval: there is no new setting to turn on.
  A tag without a release does not count, a draft release does not count, a prerelease does, and the
  recorded version is the oldest among those containing the commit, by publication date. It is best
  effort: a project with no releases, outside GitHub or without `gh` archives nothing and blocks no
  card. The board does not publish versions — `npm run release` stays as it is — and stories
  concluded before this version, with no merge commit recorded, stay yours to archive.

- **The AI can query the board's usage metrics straight in the card's conversation with `get_metrics`.** The
  tool aggregates history data — runs, duration, cost, and tokens — by phase, card type, tool, model,
  card, agent, or skill, with period and card filters. It replies in a compact table. It does not
  list individual runs (aggregation by card is enough for the AI to know each one's cost). Values
  that were not measured show as "-" (never 0), and a cost estimated from the model's price is
  marked as estimated. A date that does not exist (such as 2026-02-30) is refused; with only
  `start_date`, the query runs up to the current month, including the months already consolidated.

- **Claude Code configuration warnings are gone from the chat and the card failure.** Lines such as
  "Permission allow rule …" showed up in the chat error and in the card failure lines, pushing the
  real reason out. They now stay only in the log channel; the error reason (an expired login, for
  example) still shows.

## 0.31.1

- **The open card works again.** In 0.31.0 the card opened stuck to the left and closed on any
  click: the dark backdrop sat on top of it. It now opens as a centered window, closes only when you
  click outside it or press Esc, and the card's selectors and menus open above it. The Esc that
  closes an open selector no longer closes the card with it.

## 0.31.0

- **The board now keeps a history of what happens on it.** Every card event (creation, column
  change with from/to, status change, conversation message, attachment and artifact, subtask, link,
  pull request, completion, archiving and trash) and every AI run started by the board (card, column
  and phase at the moment of the call, tool, model, effort, agent, permission, autonomous mode,
  origin, duration and outcome) is recorded in the board's own file. This is the groundwork for the
  metrics panel, which doesn't exist yet: this version has no screen and no queries — the history
  only starts being collected. It counts from now on: nothing is reconstructed backwards, and AI
  sessions you open in the terminal, outside the board, are not measured.
- **No conversation content goes into the history.** The record keeps what happened, not what was
  said: the text of comments, descriptions and AI answers is not stored, and card titles are cut at
  120 characters. The detail is kept for 12 full months beyond the current one and then discarded,
  leaving the monthly totals, which never expire. Resetting the board erases the history along with
  everything else, and deleting a card does not delete its history — that's what keeps the totals of
  closed months stable.

- **The published package now ships with the version's release notes at the top of the changelog,
  instead of "Unreleased".** `npm run release` now opens the generated `.vsix` and checks the README
  and the CHANGELOG (in both languages) before publishing: it refuses if the changelog still has a
  leftover "Unreleased", if the first section isn't the version being released, or if either of the
  README's notice blocks (alpha phase and thank you) is missing. Before, it was possible to publish
  with a stale changelog.
- **Autonomous mode (YOLO) now stops at Homologação, with the pull request open, instead of going
  on to Concluído.** The AI goes from Backlog to the last column it works in (Homologação, on the
  default board), opens the pull request, records it with `set_pull_request` and stops there: the
  story waits for your review, with the "waiting review" status, and Concluído means merged again.
  The autopilot no longer gets stuck on this delivered story and moves straight on to the next one
  in the queue, without waiting for the review. YOLO stories already completed with an open pull
  request before this change stay as they are, with no migration.
- **The AI queue follows the board order, not the card number.** The heartbeat, the autopilot and
  `get_pending_work` now take cards with bugs first and then top to bottom — what decides is the
  card's position on the board. Category no longer weighs in either: a ready bug no longer sits
  behind an approved card that is further down. `get_pending_work` gained an `order` field with the
  whole queue in order; the `approved`, `unanswered` and `ready` groups still say what to do with
  each card. The branch base for autonomous stories is still the previous story by number, so a
  story that runs before a lower-numbered one opens its pull request outside the stack.

- **Release without a direct push to `main`.** `npm run release` now creates the `release/vX.Y.Z`
  branch from an up-to-date main and sets the version and the CHANGELOGs on it ("Unreleased" becomes
  the version). After publishing to the stores, it pushes the branch, opens the PR and, once the
  push is done, merges it by itself (squash), updates the local main, deletes the release branch
  (local and remote) and creates the tag and the GitHub Release on the merged commit. Before, the
  direct push was refused by the protected `main` and left a stray tag on the remote. If anything
  stops after publishing, `npm run release -- finish` picks up where it left off, without
  publishing again.
- **Default board in English.** With the interface in English, the names of the board the extension
  creates (the Stories and Sub-tasks workflows, columns such as Implementation, Acceptance and Done,
  card types, the Phase and Task effort fields, their options and the Default agent) are shown
  translated, on the board, on the card, in the filters, in the trash and in the settings lists.
  Only the display changes: the stored names stay as they are, so nothing breaks when you switch the
  language, and names you create or rename are never translated. The name boxes in the settings
  keep showing the stored name.
- **Technology logos in select fields.** Options of select and multi-select fields that name a
  technology (Flutter, Dart, React, TypeScript, Python, Rust, Docker, GitHub and about 80 others,
  also by nickname: "node", "ts", "k8s") get their logo, in the brand color, on the card, in the
  card's selector and in the filters. Options that are not technologies stay as before.
- **Attachments open in a window inside the board.** Clicking an attachment opens a modal instead
  of an external editor or app: text and JSON can be read and edited there, images are displayed
  and other types say that no preview is available. The modal offers **Save as** (the editor's
  dialog or, in the browser, a download) and **Copy content**.
- **Automatic triage on the AI's first call.** On a card with no Tags, Task effort, Model or
  Skills, the AI reads the description, chooses and fills in the four fields and creates the
  checklist before starting the phase's work. If any of them is already filled in, no triage happens.
- **AI LED at the top of the open card.** The AI activity LED also appears in the header of the
  open card and lights up when the AI is working on the card or on one of its sub-tasks.
- **The open card no longer covers the chat.** The card opens as a window centered on the screen,
  no longer as a panel pinned to the right, which used to sit on top of the AI chat.
- **The board detects pull request merges and concludes the story.** A periodic routine checks, at
  a configurable interval, whether a pull request from a story delivered in autonomous mode has been
  merged: when the merge is detected, the board records the merge commit on the card, registers in
  the conversation, moves the story to the completion column and removes the working folder. The
  warning of a PR closed without merge appears only once. **The feature is on by default** (Settings
  → Git, **Concluir a história quando o pull request for mergeado**), and the check interval is
  configurable (**Verificar a cada (minutos)**, default 15, range 5 to 1440). The merge is still
  done by the person (manually or by automatic merge); the board only observes.

## 0.30.0

- **Autonomous mode (YOLO)**: a story marked YOLO is driven by the AI from Backlog to the pull
  request, without asking for authorization or confirmation. Columns that require approval do not
  hold the card, the review request becomes an approval right away, and the AI settles doubts by
  itself, recording them in the conversation. It runs with the "Sem restrições" permission and
  does not merge. An **autopilot** drives stories in a queue, one at a time, and stacks the pull
  requests: each story's branch starts from the previous one. The AI can split a large request
  into several stories (`create_card` with `autonomous_from`). It stops when the card is blocked,
  when a run fails and after 3 consecutive runs with no progress. Switch in the card panel (with
  confirmation), badge on the card, an **Autônomo** button in the board's top bar and commands to
  pause and resume.
- **Rating request and feedback channels in the README.** The top of the README (in Portuguese and
  English) now invites people to star the repository, rate the extension on the VS Code Marketplace
  and Open VSX (Cursor's store), report bugs and suggest improvements through the repository's
  issues. Issues now have two ready-made forms, **Report a bug** (with version, editor, AI tool and
  system) and **Suggest an improvement**.
- **Interface in Portuguese and English.** In Configurações → Aparência (Settings → Appearance), the
  **Idioma** (language) can be **Automático** (follows the editor's or the browser's language:
  English for any `en`, Portuguese for the rest), **Português (Brasil)** or **English**. The whole
  interface switches on the spot: board, card, filters, chat, settings and the board's error and
  notice messages. The names of commands and sections in the editor (command palette and sidebar)
  also follow the editor's language. What you write (titles, descriptions, names) and what is read
  by the AI (phase instructions, MCP tools) is not translated.

- **Chat with the AI on the board.** A conversation to create, move and link cards and query the
  board in natural language: in the editor's sidebar (the **Chat com a IA** section, below Board and
  Filtros) and, in the browser, the **Chat** button in the top bar. You can pick the **model and
  effort** for the next messages; the AI acts through the board tools and answers in markdown. There
  are **Parar** (stop) and **Limpar** (clear), and the history is kept per project. It uses the same
  run limit as everything else (by default, the board only).

- **Open-card, board and filter controls in the same style.** Type, column, status, agent, filters
  and the dialog choice are now Radix selects, as are the checklist and filter checkboxes and the
  search, add-item and date fields. Only the title, the checklist item, the column name and the
  markdown editor stay as editable text.

- **Links between cards.** Any card can be linked to another one, in any workflow: **parent**,
  **child** or **related**, in the **Vínculos** section of the open card, with search by number or
  title. The card footer shows the link and the children's progress; repeated links and cycles are
  refused. When the last open child enters a completion column, the "when all children are done"
  rule (ask, move on its own, or nothing) also applies to the linked parent. The AI gets
  `link_cards` and `unlink_cards`, and `get_card` returns the links. Sub-tasks stay as they are.

- **Automatic skills per card type.** In Tipos de card → Padrões por tipo, the Skills field uses
  the picker window (before it showed "Sem opções ainda" when the project had no skills of its
  own) and every new card of the type is born with the chosen skills. Covered end to end by a test.

- **AI harness in three tabs.** The screen was a long scroll mixing three subjects. Now:
  **Ferramenta e execução** (the project's AI, runs from the conversation and heartbeat),
  **Do projeto** (rules, skills and agents that are part of the repository) and **Tudo que a
  ferramenta carrega** (the inventory, with global and plugins). The chosen tab is remembered. The tool's own agent files appear as **Subagentes** (subagents)
  on this screen, so they are not confused with **Agentes**.

- **Execution profiles become Agents.** The screen, the menu and the card now say **Agente**: it
  defines how the AI works (skills, MCP servers, tools, model and effort). Every run started by the
  board goes through an agent, the card's, the phase's or the default, and the board always has at
  least one (**Agente padrão**, no restrictions); the last one cannot be deleted. The tool's own
  agent file is now called **Subagente** (subagent, optional).
- **Agents configured by intent.** Each agent has the field **O que este agente faz** (what this
  agent does); with it, **Sugerir pela intenção** selects matching skills and MCP servers
  (word-based search, no AI call). An agent's skills use the picker window with search, and tools
  have ready-made sets: **Só leitura** (read-only) and **Editar código** (edit code). The table of
  what Claude Code accepts by parameter moved into a collapsed section.

- **Card Skills field with a picker window.** Instead of a wall of chips (one per skill, hundreds
  with plugins), the field shows what is selected and opens a window with search by name or
  description, Todas / Marcadas / Projeto / Globais / Plugins tabs (all / selected / project /
  global / plugins), a checkbox per skill and each one's origin. The same picker serves agents and
  uses the description of their intent to suggest skills.

- **AI harness: new list for skills, agents, hooks and MCP servers.** Each item shows its name, the
  description as a hint (two lines, full text on hover) and the file path on its own line, in full;
  clicking it opens the file in the editor. The table that broke the path and description across
  several lines is gone. Each row has a checkbox, and the header one selects the group; with items
  selected, a bar lets you make skills automatic or only-when-indicated, copy to the project or to
  global, and delete. The **Projeto** group always comes first, highlighted, saying it is part of
  the repository; **Global** and **Plugins** say they are not.
- **Block descriptions in frontmatter**: skills and agents with `description: |` or `>` (multi-line)
  showed an empty description or just the bar; the full description is now read.

- **Theme button in the board's top bar**: the icon in the top-right corner cycles between
  **Sistema** (system), **Claro** (light) and **Escuro** (dark). It is the same preference as
  Configurações > Aparência, so the choice is saved and applies in the editor and in the browser.
- **The board has its own colors**: the board now uses the same palette in the editor and in the
  browser, in light and dark, instead of inheriting the colors of the VS Code theme. With
  **Sistema**, it only follows whether the editor is in a light or a dark theme. High-contrast
  themes use the board's light or dark palette with stronger borders.
- The **Filtros** panel in the sidebar uses the board theme's background. Before, with a dark VS
  Code and a light board, the filters were almost invisible.
- Status and card type badges stay readable in any chosen color: the text turns black or white
  depending on the background color.
- The primary button is indigo in both themes (it was green in dark).
- Cards no longer have the colored stripe on the left: the type color lives in the card bar.
- Scrollbars use the board's colors, and the columns' horizontal scrollbar now has breathing room
  below the cards.
- The contrast of text, controls and keyboard focus is checked by an automated test in both
  themes. The color rules are in `DESIGN.md`.
- Internal: lint (ESLint) and formatting (Prettier) set up, plus interaction tests (clicks and
  keyboard) for the board. Nothing changes for users.
- Internal: the front end now uses UI primitives (button, typed select, chips, field row, delete
  button with confirmation, add input, number field) instead of repeating the same HTML in every
  screen. Nothing changes visually or for users.
- Internal: the Settings > Harness screen was split into one file per section, and the front end
  asks the host for actions through named commands (`src/webview/commands.ts`). Nothing changes
  for users.
- Internal: all code follows Prettier, checked by `npm test`, and `npm run typecheck` now covers
  the interface tests.
- Internal: board rules that the host and the front end repeated (active card, a card's column, open
  subtasks, what goes along when cancelling or completing) now live in one place, `src/shared`, with
  tests. Nothing changes for users.
- The "⋯" menu button tells screen readers whether the menu is open.
- Internal: the MCP tools move from a 1147-line file to `src/extension/mcp/tools/`, one file per
  group. The list the AI sees (names, descriptions, parameters) does not change.
- Internal: the host message router (690 lines) becomes a typed dispatcher with per-domain handlers
  in `src/extension/panel/handlers/`; the story rule lives in `src/shared/story.ts`.
- Internal: the Settings > Harness screen (483 lines) becomes a composition of sections in
  `settings/harness/`, with new interaction tests; non-React rules move to `src/shared`.
- Internal: the card panel (399 lines) becomes a composition of parts in `components/card/`, with
  21 new interaction tests; types, checklist and the subtask slot join `src/shared/selectors.ts`.
- Fixed: switching cards while editing the description saved the draft to the card opened next (for
  example, the subtask); it now goes to the card it was written on.
- **New icons**: emojis and loose symbols (✕ ⋯ ▾ ↗ 🗑 💬 📎) were replaced by a single set of line
  icons ([Lucide](https://lucide.dev)) across the whole board: cards, columns, card panel,
  description editor, filters and settings.
- **New board card**: a bar in the type's color, like a window's title bar, with the ID, the type
  and the open and actions buttons. The title stays on one line (in full in the tooltip), the status
  shows who the next step is waiting on with an icon (a robot for the AI, a person for you) and for
  how long, and a blocked card shows the reason in the tooltip. The AI model gets its own line, with
  the effort in Portuguese ("Sonnet 5.5 - baixo"), and the footer shows the branch and the PR link.
- Cards waiting on you get a border in the status color, so you can spot them at a glance.
- An LED blinks slowly on the card bar while the AI is working on it (steady, without blinking, when
  the system asks for reduced motion).
- **Readable text on type and status colors**: the text color (black or white) is now chosen by
  perceived contrast instead of the old formula, which put black text on the blue of História and
  the red of Bug. In Configurações > Tipos de card, each type shows a preview of the card while you
  pick its color; if the color makes the text hard to read, a warning offers the same color darker
  and lighter, applied with one click. The warning also applies to the status colors in Aparência.
- **Tidier settings**: each section has its title and main action on the same line. In **Tipos de
  card**, the **Novo tipo** (new type) button at the top opens a row in the table, aligned with the
  others, with the card preview (Enter adds, Esc cancels). Settings and the trash use the full width
  of the screen, and the settings side menu collapses into an icon-only strip (the choice is
  remembered).
- Text, link and number fields on a card no longer drop letters when you type fast. The value is
  saved when you leave the field, press Enter or close the card, instead of on every keystroke.
- **Fields screen redone**: each field becomes a card with its name in a text box, the type with an
  explanation of what it stores, how it shows on the board (with a live preview), the options as
  chips (Enter adds, X removes) and the card types it exists in. **Novo campo** (new field), at the
  top, opens the draft with the type choice; selection fields require at least one option. The
  "Só no detalhe" display is now called **Oculto** (hidden).
- Forms now use [Radix Themes](https://www.radix-ui.com/themes) components, from the same family as
  the board's colors. The other screens migrate gradually.
- **Workflows and columns redone**: you can create as many workflows as you want with **Novo
  workflow** (choosing whether it takes independent cards or sub-tasks; it starts with A fazer, Em
  andamento and Concluído) and delete empty ones. Each workflow's name is editable, and **Nova
  coluna** sits at the top of each one, opening an aligned row in the table. The "linha de cima" and
  "linha de baixo" labels and the "starts collapsed" options for the workflow, column and archive
  are gone: the board remembers the state in which you left each workflow and column.
- The AI assistant (MCP) gained `create_workflow` and `delete_workflow`; `set_workflow_layout` and
  the `collapsed` parameter of `update_column` were removed.
- The test browser's logs (`.playwright-mcp`) were committed by mistake in earlier PRs and are now
  ignored by git.
- **Workflow order**: each workflow has a handle you drag to change its position on the board (with
  the handle focused, ↑ and ↓ move one position). The AI assistant (MCP) gained `move_workflow`.
- **AI LED always on the card**: the LED on the card bar now exists all the time. It blinks slowly
  while the AI works on the card, and a story also lights up when the AI works on one of its
  sub-tasks. When the AI finishes, the LED stays on the card, turned off (outline only). The type
  preview also shows the turned-off LED.
- **Heartbeat heart** at the top right of the board: red and beating while the heartbeat is running;
  grey and still when it is off or cannot run (no connection to Faz AI or no project tool, with the
  reason in the tooltip). Clicking the heart turns the heartbeat on and off.
- In Configurações > Campos, the "No board" selector (Selo, Selo vazado, Nome: valor, Oculto) no
  longer overlaps the options column when the window is narrow: the field card's columns now wrap
  before they get narrower than the selector.
- **Board rules with the new design**: each rule becomes a card with the Ativa/Desligada badge, the
  switch or selector on the right and the "Quando / Então" below. The controls are Radix Themes,
  the same as Campos and Workflows. It is the first of the Configurações screens that still used the
  old controls.
- **AI harness with the new design**: the project's rules, skills and agents become cards with the
  title, the state badge and the actions on the right; each section has its main button at the top
  (Nova skill, Novo agente, Conectar ao board, Rodar agora, Atualizar). Creation forms, selectors,
  switches, checkboxes and the tool tabs use Radix Themes, like Campos, Workflows and Regras.
- **Execution profiles with the new design**: the **Novo perfil** button is at the top right; each
  profile is a card with the name in a text box, the "padrão" badge and the actions on the right,
  and the editor uses the Radix Themes selectors, switches and fields. The **model and effort**
  selector (also used in the open card) is now the Radix one.
- **AI models with the new design**: **Detectar modelos** and **Novo modelo** are at the top
  right. A new model opens a draft with aligned fields (name, identifier and efforts), instead of
  the loose row at the end of the table. The list and the **Sugestão de modelo** use the Radix
  Themes fields, selectors and switches; **Montar nova regra** is at the top of the section and the
  builder opens above the rule list.
- **Git and Appearance with the new design**: the fields become form cards with the label above
  each box and the help below. Selectors, the auto-merge switch, the merge warning (now a Radix
  callout) and the font-size slider are Radix Themes ones; Appearance's Restaurar padrões is the
  same button style as the other screens.
- **Leftovers of the new design in Configurações**: the columns table (name, "Representa", "IA
  atua" and "Exige aprovação"), the new-column row, the Fase editor, the card types table, the board
  name in the side menu and the per-type defaults now use the Radix Themes fields, selectors and
  checkboxes. Custom fields (text, number, date, select and checkbox) also use Radix, including in
  the open card. The "Novo workflow", "Nova coluna", "Novo tipo" and "Novo campo" buttons look the
  same on every screen.

## 0.29.1

- The README warns that the project is in **alpha**: bugs and changes between versions can happen.
- New section **Setting up the development environment**, with what lives outside git and must be
  set up again on a fresh clone, and how to publish with `main` accepting only pull requests.

## 0.29.0

- **The board in the browser, outside the editor**: **Abrir no navegador ↗** (or the command **Faz
  AI: Abrir board no navegador**) opens the same board in a tab, in sync with the editor. Without
  the editor, the `~/.faz-ai/bin/faz-ai` command serves a folder's board with the MCP server, AI
  runs and the heartbeat. The page only answers on `127.0.0.1` and requires the link's secret.
- **Calling the AI works without the CLI on the PATH**: the board looks for the executable in the
  usual install folders and inside editor extensions (Claude Code, Codex). Before, people who only
  used the Claude Code extension got "command not found".
- With Claude Code, the board's server is passed on the command line of each run: calling the AI no
  longer depends on **Conectar IA (MCP)** or on approving `.mcp.json`.
- The AI is told the run's permission level and, when it is not enough, blocks the card saying
  which option to choose. The level is shown next to the **Chamar IA** button, with a shortcut to
  change it.
- Run failures bring the end of the tool's output into the card, and the block reason is shown
  formatted.
- **Usability**: a **Chamar IA** button in the card header; notices and errors in floating boxes
  that do not push the board; an **N com você** counter and an AI-working indicator at the top; the
  Skills field collapsed, with search; a fixed card header; guidance on the empty board and on the
  sub-task row; open a card with Enter; visible keyboard focus; quieter top tabs.
- **One database per folder**: windows on different projects no longer overwrite each other. The
  board starts from a copy of the earlier versions' database, which is left untouched.

## 0.28.0

- **Find and install skills** from a folder, a GitHub `owner/repository` or a git address. The
  board lists the skills it finds and copies the chosen ones into the project or the user folder.
  The repository is cloned into a temporary folder and nothing from it is executed.
- The Plugins section shows each tool's commands for installing and removing plugins.

## 0.27.0

- **Templates and references in skills**: each skill's supporting files (`references/`, `assets/`,
  `scripts/`) are shown on screen, with open, create (with the link in `SKILL.md`) and delete.
- **Criar skill de modelos**: a project skill for class templates and code examples.
- `get_card` returns the supporting files of the card's skills; new MCP tool `write_skill_file`.

## 0.26.0

- **Hooks**: listed one per command, with the matcher; add and remove in the format of Claude Code,
  Codex, Cursor and Copilot. Kimi Code hooks are listed only.
- **Permission rules** (allow, ask, deny) of Claude Code and the Cursor CLI: list, add and remove.

## 0.25.0

- **MCP servers**: add and remove them in each tool's files, in the project and in the user folder,
  including Codex's `config.toml`. `~/.claude.json` is read-only.

## 0.24.0

- **Execution profiles** (Perfis de execução): agent, skills, MCP servers, tools, model and clean
  session, per phase, changeable per card, with a board default.
- Runs started by the board pass the profile to the tool as parameters where it accepts them, and
  as instructions in the prompt where it does not.
- The model and effort set on the card are now sent to the tool when the board runs it.
- MCP: `get_card` returns `execution`; `get_board` lists the profiles; `update_column` accepts
  `exec_profile`; new tool `set_card_profile`.

## 0.23.0

- **On-demand skills**: each skill can be Automática (automatic) or Só quando indicada (only when
  named), written in each tool's own format.
- The card's "Skills" field also offers disabled skills, and runs started by the board receive the
  path of each of the card's skills.

## 0.22.0

- **Harness**: create, delete and copy skills, agents, commands and rules between the user folder,
  plugins and the project. Changes to the user folder ask for confirmation.

## 0.21.0

- **Harness per tool and per scope**: one tab per tool, with what it loads in the project, in the
  user folder and from plugins (instructions, skills, agents, commands, hooks, MCP servers, plugins
  and settings).
- The card's "Skills" field offers global and plugin skills, with a filter by origin.
- Kimi Code: the project's skills folder is now `.kimi-code/skills`. The old folder,
  `.kimi/skills`, is still listed, but new skills go to the current one.

## 0.20.0

- **Column order**: drag the column's row in the settings, instead of the arrow buttons.
- A new column goes after the column you choose; by default, before the first completion column.

## 0.19.0

- **Agents in the harness**: create, edit and delete the project's agents (subagents), in each
  tool's format. MCP tools `get_agent`, `create_agent`, `update_agent` and `delete_agent`.

## 0.18.0

- **Pull request in Homologação** (acceptance): the AI opens the story's PR and records its address
  on the card.
- **Automatic merge** (optional, off by default): when the acceptance is approved, the board merges
  through the GitHub CLI and completes the card; if the merge fails, the card becomes blocked.

## 0.17.0

- **Branch and working folder per story**: each story has its own branch, by default in a separate
  worktree. New Git tab in the settings.

## 0.16.0

- **Heartbeat**: the board calls the AI on its own at every interval, when something is pending for
  it.

## 0.15.0

- **Call the AI from the conversation** (Chamar IA): runs the project's tool in the background for
  a card, with a configurable permission level and time limit.
- Images pasted into the conversation become card attachments.

## 0.14.0

- **Pending-work queue**: the "Com você" (with you) filter, a counter in the sidebar and a
  notification when the AI hands the turn over. MCP tool `get_pending_work`.
- **Flow skill** (`faz-ai-fluxo`), which teaches the AI to take cards through the board.

## 0.13.0

- **Configurable phases**: each column has the instruction for the AI and the template of the
  document the phase produces.
- New **Discovery** and **Homologação** columns in the default board.
- Phase documents stay attached to the story and appear as links in the sub-tasks.

## 0.12.0

- **Card status**: Pronto (ready), Em execução (running), Aguardando resposta (waiting for an
  answer), Aguardando revisão (waiting for review), Aprovado (approved) and Bloqueado (blocked),
  showing whether the next move is yours or the AI's.
- **Review before moving on**: in columns that require approval, the AI only moves the card after
  you approve.
- The "Comentários" tab is now called **Conversa** (conversation).
- **Board update**: existing boards are brought to the new default, with confirmation and without
  moving cards.

## 0.11.1 and earlier

See the repository's commit history.
