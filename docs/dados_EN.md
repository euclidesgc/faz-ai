[🇧🇷 Português](dados.md) · 🇺🇸 English

# Where the data lives, backup and board in the browser

## Where the data lives

The board and the attachments live in the extension's storage, outside the repository. Each folder
has its own database file (`boards/<folder key>.db`), so windows on different projects do not
interfere with each other. The first time, the board starts from a copy of the single database of
earlier versions (`fazai.db`), which is left untouched. Rules and skills are files in the project
folder and go into git as usual. Agents, skills, rules and MCP definitions are stored in the board
database (the credentials of MCP definitions stay in the local vault); the library folder holds a
readable copy, and each execution gets its own snapshot under `run-artifacts/`. Avoid opening the
same folder in two editor windows at the same time: the last one to save wins (the extension warns
when that happens).

**Updating the extension updates the database.** When the board opens, the extension applies by
itself, in order, the format changes the database is missing, each in a transaction: if one fails,
the database stays as it was. This works from any earlier version, on any machine. The reverse path
does not exist: an earlier version of the extension (for example, after trying a newer build, the
store going back to the previous one) refuses to open a board saved by a newer version, without
touching it, and asks you to update the extension. If the database refuses a write on open, the full
error, with the statement that failed, is in **Output → Faz AI**.

**AI profiles: tool and mode (format 48).** Each profile stores the tool and the mode the board uses
to talk to it (CLI or ACP), and each run in the log stores the mode it ran in. Profiles saved before
are converted the first time the board is read, by their old type: the ready-made CLI stays in CLI,
the ready-made ACP agent in ACP, a copy of a ready-made CLI stays the base tool in CLI (its overrides
stay in the local vault, as they were), and a custom profile is its own tool, in ACP when it points to
an ACP agent and in CLI otherwise. The tool used by model fields, policies and Usage does not change
for any profile. A custom profile imported from another machine, without its configuration in the
local vault, stays in CLI until it is saved again. Earlier runs have no mode recorded. API mode is a
value of the same format (in the log and in the exported file), with no new migration: only the
ready-made Gemini runs in it, and importing accepts Gemini in API and refuses the mode for any other
profile. The API key never goes into the exported file; on the importing computer, connect Gemini
again. Taking the database back to format 47 (the support procedure for an earlier version) leaves
Gemini in ACP, the only mode that version knows.

## Board backup

To take the board to another machine or keep a copy:

**In the editor (VS Code or Cursor):** use the command palette (`Ctrl+Shift+P`):

- **Faz AI: Export the board** opens the native save dialog with the suggested name in the pattern
  `<board name>-<date>.fazai.json`. It creates a file with everything on the board: columns, types,
  fields, rules, models, agents, cards (including archived and trashed ones), conversations,
  checklists, links, history and the embedded attachments. Only the current folder's board goes into
  the file. It contains the conversations and attachments: keep it safe. When done, the extension
  shows the "Board exported in …" notification with an **Open folder** button.
- **Faz AI: Import a board** opens the native file picker. Once you choose a file, it shows a summary
  modal (board name, number of cards and attachments, size, version) with a warning that the current
  board will be replaced and a backup copy (`.bak`) will be made first. On confirmation, it replaces
  the board and shows a notification with the import result.

The commands work with the board closed (without the panel open): they open the database for the
current workspace folder on demand. In a workspace with multiple folders, the commands use the first
folder (same limitation that already exists in the extension); there is no folder selector.

**From the board screen** (in the editor or in browser mode, running `~/.faz-ai/bin/faz-ai` in the
terminal): use **Configurações → Backup** (Settings → Backup):

- **Exportar board** (export board) creates a `.fazai.json` file on your computer (download).
- **Importar de um arquivo…** (import from a file) opens the native file picker of the page.

**In both modes,** the imported file:

- Shows a summary (name, cards, attachments, size, version) and, after confirmation, writes a copy
  of the database (`<file>.bak`, next to it or in the data folder), moves the current board's
  attachments to a backup folder (`<attachments>.bak-<date>`), deletes the current board and
  replaces it with the one from the file, keeping the card numbers. The imported board becomes this
  folder's board. Nothing changes in the database if the file is invalid or something fails midway.
  The confirmation says the attachments went to backup.
- A file exported by an earlier version of the extension is upgraded on import; a file from a newer
  version is refused with the required version. Importing while the AI is running on a card is not
  allowed: wait for the run to finish. An import file with a card id or attachment name containing a
  path (`../`) is refused.

Known limits: the monthly consolidated log history does not go into the file, and the stories'
branches and working folders are imported as they were on the source machine (recreate the folder
from the card's button).

## The board in the browser, outside the editor

The board does not depend on the editor window:

- **Abrir no navegador** (open in browser, at the top of the board, or the command **Faz AI:
  Abrir board no navegador**) opens the same board in a browser tab. The editor stays open and
  keeps the board; both screens stay in sync.
- **What each screen receives**: the board state is built once per change and each screen (the
  editor panel, the sidebar, the browser tab) receives only what it shows: the live cards, the trash
  or the archived cards when those screens are open, and the conversation only for the open card.
  Consecutive changes arrive together, and a hidden screen only receives when it is back. Host
  operations over 200 ms are written to the **Faz AI** log channel with their duration.
- **Without the editor**: run `~/.faz-ai/bin/faz-ai` in the project folder (or `faz-ai <folder>`).
  It serves the board in the browser, with the MCP server, AI runs and the heartbeat, and keeps
  running until you stop it with Ctrl+C. The launcher is created by the extension and uses the same
  data; it needs Node.js on the PATH. To call just `faz-ai`, add `~/.faz-ai/bin` to your PATH.
  `faz-ai --help` lists the options (`--port`, `--data`, `--no-open`).

The page only answers on `127.0.0.1` and requires the secret in the link opened by the editor or
the terminal (it is then kept in a cookie, so the address can be bookmarked). The "Sistema" theme
follows VS Code's light or dark mode in the editor and the operating system's in the browser,
always with the board's own colors. In the browser, the filters open in the board's own bar. A
board is served from one place at a time: with the editor open on the folder, use **Abrir no
navegador**; the terminal `faz-ai` warns and does not start.
