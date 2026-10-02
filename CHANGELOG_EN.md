[🇧🇷 Português](CHANGELOG.md) · 🇺🇸 English

# Changelog

What changed in each version of Faz AI Kanban, newest first. The extension's interface is in
Portuguese, so names of screens and buttons appear as you see them on screen.

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
