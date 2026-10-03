[🇧🇷 Português](CHANGELOG.md) · 🇺🇸 English

# Changelog

What changed in each version of Faz AI Kanban, newest first. The extension's interface is in
Portuguese, so names of screens and buttons appear as you see them on screen.

## Unreleased

- **Release without a direct push to `main`.** `npm run release` now publishes to the stores, opens
  the version PR (`release/vX.Y.Z`, with "Unreleased" already renamed in the CHANGELOGs), waits for
  the merge and only then creates the tag and the GitHub Release on the merged commit. Before, the
  direct push was refused by the protected `main` and left a stray tag on the remote. The new
  `npm run release -- finish` completes the tag and the GitHub Release after the merge, without
  publishing again.

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
