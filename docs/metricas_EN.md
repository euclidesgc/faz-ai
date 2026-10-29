[🇧🇷 Português](metricas.md) · 🇺🇸 English

# Context, usage and metrics

What Faz AI Kanban estimates before each run (the card's context), what it measures afterwards (the
consumption and inventory of each run) and where those numbers show up: the card's **Consumo**
(usage) tab, the **Métricas** (metrics) panel and the `get_metrics` MCP tool.

## Estimated context of each card

In the footer of each card on the board, a discreet ring shows how much of the context window the
card's run takes before the AI starts, with the total next to it (for example, `5.8K`). Clicking it
opens the breakdown, shaped like Claude Code's context window: the total over the window of the
card's model, a bar per group and each item, with how much it takes.

- **MCP servers.** In Claude Code, the session starts with only the tool names and each server's
  instructions (cut at 2,048 characters); the full definitions load when the AI looks up a tool and
  show up separately, as **sob demanda** (on demand), outside the total. The board measures its own
  server; the servers the agent allows show up as **não medido** (not measured), because the board
  does not open them.
- **Agents.** The instructions of the session's agent and, for a story in Claude Code, the name and
  description of each subagent (a subagent's instructions go into its own context, not the
  session's).
- **Rules and Skills.** The ones on the board in **Sempre** (always) mode and the ones the card or
  the agent asks for, by the size of the file the session reads.
- **Card.** Title and description, checklist, conversation, the phase's instructions and template,
  and the phase documents.

### How to read the estimate

It is an estimate from text size (about 4 characters per token), meant to compare choices and find
what weighs before running: unmarking a skill, removing it from the card or switching the agent
changes the number right away. The estimate follows the card: in a column where the AI works, it
names the phase and adds its instructions, and the conversation and documents count as they grow.
Deleting messages only lowers the next runs; what was already spent does not come back.

When it opens, the breakdown rereads the harness files from disk: if something changed since the
last read (a global skill edited outside the board, for example), it says so and already shows the
new numbers; the **Reler arquivos** (reread files) button does the same on request. The AI tool's
own prompt and built-in tools are not counted.

The window comes from the card's model (or the agent's): 1M for Fable 5.1, Opus 5.5 and Sonnet 5.5,
and 200K for Haiku 4.5. Without a model, or with a model whose window is unknown (such as Cursor's),
the ring shows only the total. In Cursor, which does not enforce the empty context, what the tool
loads on its own is also left out, and the MCP tool definitions count in full. What the run actually
spent shows up afterwards, in the consumption of each run.

### Run context (preview)

The **Contexto da execução** (run context) block under **Consumo → Próxima execução** (usage → next
run) shows the agent, native delegation candidates, rules, skills and MCP servers with all their
sources: card, agent, phase, story, default or Always. A file selected by multiple sources appears
once per identity (the board copy ID, when available). The agent editors show the same block for the
draft and Always items, without selections from a card.

The preview uses the current manifest and neither starts a run nor calls AI. It distinguishes
restrictions enforced by the executor from prompt advice, flags identical paragraphs in agent
instructions and explains that rule and skill contents are not compared. Unknown sizes remain
unmeasured; initial context size does not predict total task usage. This delivery makes current
behavior visible; configuration per action and new authorization boundaries are not active yet.

### Project MCP file lease (Cursor and Kimi)

Transport that requires project MCP files (Cursor and Kimi) uses a lease coordinated by the real
file path. A protected journal under `~/.faz-ai/mcp-leases` precedes mutation; format attempts
reuse the same ownership. After confirmed termination, the previous configuration is restored while
preserving servers added by the person. Conflicting changes to the `faz-ai` entry or invalid JSON
are not overwritten. When the CLI exits, the board ends what it left in its process group (the
`cursor-agent` leaves a `worker-server` with language servers that would live for minutes) and waits up
to 5 s for the group to end. Without confirmation that the process tree has ended, the lease is retained and
a new run on that file is refused. The launcher receives the CLI command only after its identity is
journaled. On startup, a demonstrably dead owner allows recovery of preparations whose command was
never released and recorded process groups with confirmed termination. Old or ambiguous journals
remain retained. Windows does not yet provide process-tree confirmation in this transport; that case
requires reconciliation. This does not prove CLI isolation or complete #729.

### Snapshot of the run's files

On the host, runner and chat publish selected library files under
`run-artifacts/<boardId>/<runId>`, with revisions and SHA-256 hashes. Prompts and additional
directories use that copy. Updating or deleting an artifact or its cache does not rewrite the
snapshot; required materialization failures block process startup. Schema 38 adds monotonic
artifact revisions. Published snapshots are preserved, including inconclusive runs; automatic
cleanup is not implemented yet. This freezes prompt file references; managed MCP sessions also use
the copy, as described below. External legacy sources and full v1 resolution have not been activated
in E5.

### Local orchestration

The local orchestration foundation uses `ai_work` and `ai_work_attempts` (schema 39), with unit
ownership, generations, token hashes, process identity and mutation counts. These tables are
excluded from exports; imports do not create ownership and are refused while local work is running
or being reconciled. Database flush synchronizes the file before atomic replacement and the
directory on POSIX systems. A cross-process lock keyed by the real workspace path releases a writer
only after process-group termination is confirmed; adopting a dead host's reservation does not
release it automatically. Pure rules calculate rounds, reconciliation and requested/effective
limits. Trigger integration remains pending; this foundation does not change who executes subtasks
or prove CLI isolation.

Managed runs now have per-attempt MCP identity: the host injects `FAZAI_RUN_TOKEN` only into the
bridge environment, and the transport consumes its preface before the MCP protocol. Every call
validates owner, generation and revocation; mutations are attributed to the authenticated run and
counted. `get_skill`, `get_agent`, `get_board_artifact` and `read_rule_file` use the captured
snapshot, and external forwarding freezes selected servers and operations. External sessions remain
available but cannot take over a card reserved by the board. The runner accepts identity and
guidance from the orchestrator without completing work solely on exit code zero. This API is not
connected to triggers yet: automatic activation, persistence before CLI release and #824/#825
remain pending.

The gateway also accepts asynchronous identity recording (`beforeStart`): the launcher waits for it
before receiving the command. Failure, cancellation or revocation while waiting prevents late
release. The measured transport preserves process identity and termination confirmation for
reconciliation. The Orchestrator described next connects this hook to flush and workspace ownership
through an injected UnitStarter; production triggers remain pending.

The `Orchestrator` now provides `drive`, round continuation, startup reconciliation, sweeping and
cancellation through an injected `UnitStarter`. It synchronizes preparation and process identity
before releasing the CLI, confirms the process group and saves the result before releasing the lock.
The workspace reference remains persisted until physical release is confirmed, including crashes in
that interval; imports also respect that reservation. Tests using Node processes, the MCP bridge and
an on-disk database cover three sequential children, one closing run, partial work, cancellation
with a descendant and a real controller restart. Host creation and trigger integration remain
pending, along with human return cycles and stable phase association. This does not activate the v1
plan or validate real AI CLIs yet.

## Card Usage tab

The open card has the **Consumo** (usage) tab, which brings the two numbers together:

- **Próxima execução** (next run): the same estimate as the ring on the board, with the phase, the
  model and the breakdown by group.
- **Gasto até agora** (spent so far): what the tool measured at the end of each of the card's runs,
  one row per phase (Discovery, PRD, Spec…), with runs, time, input, output, cache read and cache
  write tokens, and the total. For a story, the sub-tasks' runs get a row of their own and count in
  the total. The phase is the column the card was in when the run happened.

What was spent is history and only grows: deleting conversation messages, unmarking a skill or
switching the agent lowers the next runs (the estimate), never what was already spent. A run without
measurement counts as a run and shows as **não medido** (not measured), never as zero; a run in
progress counts when it ends, and the tab updates on its own. Runs from months past the detail
retention stay only in the board's monthly totals, and the tab says up to when. As everywhere else
on the board, usage is in tokens, with no dollar cost.

## Consumption and inventory of each run

Every time the AI runs (from the conversation, the heartbeat or autonomous mode), the board records
in the database what the run consumed: input tokens, output tokens, cache read tokens and cache
creation tokens, the number of turns and the tool's session id. It also records the **inventory**
of what the AI used: native tools, MCP tools (with the server of each one), subagents and skills,
with the number of calls.

- **Usage is measured in tokens and, with the "Show cost in dollars" rule on, also in dollars.** Both
  tools report the tokens: Claude Code reports input, output, cache read and cache creation, per
  model, subagents included; Cursor reports the same four counters. Only Claude Code also reports a
  dollar cost. When the tool does not report it, the board estimates the cost from the per-million-token
  price the person registered for the model in the catalog (`upsert_model`, or the Models screen), bucket
  by bucket (input, output, cache read and cache write); the price applies from the next run on, and a
  bucket with tokens and no price leaves the estimated total empty. The cost reported by the tool always
  wins over the estimate. The **Show cost in dollars** rule (`showCost` in `update_rules`) is on by
  default; when off, the dollar figure disappears (people on a subscription may prefer tokens only), but
  the data stays stored. Wherever you see "não medido" (not measured), this is why: missing
  measurement, never zero consumption.
- **Every run goes through a single door.** The card runner (manual, heartbeat and autonomous mode)
  and the board chat call the AI through the same point in the code (`AiGateway`), which opens the
  log row before running, closes it with the outcome and stores the consumption. Each tool has its
  own provider, which builds the command and reads the output. A third way to call the AI does not
  exist without going through it, and a test fails if any file tries. What stays out of the record,
  by nature, is whatever you run straight in the terminal or in the tool's own chat, without the
  board.
- **In the log channel** (**Output → Faz AI**), the tool's output appears as readable lines, and at
  the end of each run a summary line follows with input, output, cache read and cache creation, and
  turns, for example `Consumo: 1.250 entrada · 3.400 saída · 52.000 leitura de cache · 9.100 criação
  de cache · 8 turnos`. Turns are left out when the tool does not report them. The line is written
  in Portuguese, as the board's log channel is.
- **A run that fails before the first event is not repeated.** The board asks the tool for the
  structured output and only repeats the call in text mode, once and with the same restrictions, when
  the tool refuses one of those arguments before starting (an older CLI version). Any other failure
  before the first event (network, quota, login, crash, truncated output) ends as a failure, with
  usage "não medido" (not measured): the tool may have changed files or touched the board before
  failing, and repeating would duplicate the effect and the usage. The blocked card and the chat error
  say the run was not repeated, and the "Chamando…" line in the channel shows the attempt and the run
  id.
- **Gemini in the three modes.** Each run records the mode it ran in (CLI, ACP or API), and Consumo
  (usage) separates the three through the **Modo da ferramenta** (tool mode) cut. In the CLI the tokens
  come from `stream-json`, per model; in ACP, from the `usage` the agent reports each turn; in the API,
  from each request's `usageMetadata`, summed over the run. None of the three reports a dollar cost.
  When the Gemini API quota runs out, in any of the three modes, the run ends with the usage limit: the
  board does not blindly repeat it, and the profile pause (or the execution policy with the _quota_
  failure) decides what comes next, as with Claude Code (see [automation](automacao_EN.md)). A run that
  hit the limit before answering is "não medido" (not measured).
- **Questions in the board chat** are recorded too, with no card attached.
- **The detail of each run is kept for a window you configure**, from 1 to 24 months (the current
  month plus the earlier ones). The default is 6 months. After the window the detail is discarded,
  but the **monthly totals never expire**. It used to be 12 months; the shorter default keeps the
  database file within its size limit. Where to change it, and what happens when you lower it, is
  under [Metrics panel](#metrics-panel), in the **Detalhe guardado** (detail kept) block.

## Metrics panel

The **Métricas** (Metrics) button, the fourth in the top navigation (Board, Metrics, Trash,
Settings), shows what the board recorded about the work and the AI's usage. It works in the editor
and also in the board opened in the browser.

### Filters and totals

- **Filters.** The period can be Hoje (today), 7 dias, 30 dias, Este mês (this month), Últimos 12
  meses (last 12 months), Tudo (all) or a free range (start and end date). The **Workflow** filter
  limits the numbers to one workflow, and **Limpar filtros** (clear filters) goes back to the
  default. Below the controls the panel writes the period it queried.
- **Four totals.** Completed activities (cards that reached a completion column), AI runs, tokens
  and AI time. **AI time is the sum of each run's duration**: simultaneous runs add up, so the
  total can exceed the elapsed clock time. What was not measured shows as "não medido" (not
  measured), never as 0, and when only some of the runs were measured the note says how many were
  left out.
- **Runs over the usage limit.** A run that reads more than 10 million cache tokens goes over the
  limit: the **AI runs** total shows "{n} over the usage limit" (in Portuguese, "acima do limite de
  consumo") and, when the run ends, the card's conversation gets a notice with the consumption and
  the duration. The limit is fixed and the alert interrupts nothing. Without measured tokens
  (Cursor) there is no alert, and archived months are not counted.
- **Tokens.** Tokens count in every measured run, from Claude Code and from Cursor, and the note says
  how many runs were left without measurement. Before the board measures consumption, tokens and
  inventory show as "não medido" (not measured) and almost every lead time as unknown: that is the
  expected behavior, not a failure.

### Usage

- **Tokens per month.** A bar chart with each month's tokens. The month in progress is hatched,
  because it has not ended yet; a month with no data at all is a gap marked "sem dado" (no data),
  not a zero-height bar. Below the chart a table has the same numbers and a notes column (partial,
  no data, monthly total only).
- **Where the usage happened** ("Onde o consumo aconteceu"). The period's usage split by **phase,
  card type, model, AI tool, tool mode, effort or profile** (the **Recortar por** / break down by
  selector), as horizontal bars in the measure chosen in **Medida da barra** (bar measure): tokens,
  runs or AI time. The **tool mode** ("Modo da ferramenta") is how the board talked to the tool (CLI,
  ACP or API): the same Gemini measures differently in each mode, and the tool row adds the three up.
  Runs from before the mode was recorded (and months archived before it) show as "não definido" (not
  defined). The table with the three measures sits beside it. Categories past the limit add up in an
  "others" row. It reaches the whole series of the period, including months already archived.
- **Most expensive phases and Most expensive cards** ("Fases mais caras" / "Cards mais caros"). Two
  rankings side by side, in tables you sort by tokens, runs or AI time by clicking the header
  (or with Enter/Space). The default is tokens when the period has measured tokens and AI time when
  it does not, and the screen writes the criterion in force. Phases reach the whole series; cards,
  only the detail kept, and each block says so.
- **What the AI used** ("O que a IA usou"). Tools, MCP tools (with the server in its own column),
  subagents and skills, with the number of runs and uses. "Not measured yet" (no run recorded an
  inventory) is different from "no records in the period".

### Time and quality

- **How long a card stays in a phase** ("Quanto tempo o card fica na fase"). One row per phase with
  the permanences, the median, the mean, the unknown ones and how many cards are in it now. They are
  permanences, not cards: a card that returns to the phase counts twice. It is clock time, unlike the
  AI time of the phase breakdown.
- **Lead time.** From the card's creation to its **first** completion, for cards completed in the
  period: the median in front, the mean, how many were counted, how many are unknown and the
  sortable list per card. Unknown is a card whose creation date is not in the detail kept (the month
  was discarded or the card predates the log); the date is not estimated.
- **Rework** ("Retrabalho"). The quality signal that consumption and time don't show: how many reviews
  the AI asked for in each phase, how many the person approved **on the first try** (the first answer
  to a card in that phase was the approval) and how many came back with a **change request**, also by
  the model of the run that asked for the review, and how many stories done in the period already have
  a linked **Bug**. Only a person's answer counts: autonomous mode's automatic approval is not a review.
  That is why the block also brings the **AI signals**, measured without a person's review: **fixes in
  Review** (commits in runs of the Review phase), **failed `npm test`** and **commits after the pull
  request**, in the summary and per phase, each with the part done in autonomous-mode runs; the bugs
  line says how many of the done stories were autonomous. They are approximations (commit ≈ fix),
  apply only to Claude Code since Bash commands started being recorded, and the Review phase is
  recognized by its name. With no run with recorded Bash in the period, the signal is "not measured",
  not zero.

### Retention and notes

- **Detail kept** ("Detalhe guardado"). Shows the retention window for the runs' detail and how much
  space it takes. You can set it from 1 to 24 months (default 6). Raising it saves right away.
  **Lowering it asks for confirmation**, which says how many months lose their detail, and the
  discard only happens the next time the board opens. The monthly totals stay. The field saves when
  you press Enter or leave it. The times and the inventory read only the detail kept: a discarded
  month leaves those blocks.
- **Honesty notes**, always next to the number: since when the board's log exists (before that
  there is no data, the number is not small); the note that the requested period was cut at the
  start of the log; and the months that only have the monthly total (they enter the series, but with
  no breakdown by dimension and no detail per card). With a workflow filtered, a month consolidated
  before the log stored the workflow is left out of the numbers, and the note says so.

## Usage metrics with get_metrics

During a card's conversation, the AI can query aggregated statistics from the board's history
(usage, duration and tokens of runs) without opening any panel. Call the `get_metrics` tool in
natural language: "how much AI time did card #72 use?", "which card type uses the most this
month?", "which agent was used most?". The tool replies with a compact table, optimized to save
tokens.

- The aggregation can group by phase (`phase`), card type (`card_type`), AI tool (`tool`), tool mode
  (`mode`: `cli`, `acp` or `api`), model (`model`), effort (`effort`), profile (`profile`), card
  (`card`), agent (`agent`), skill (`skill`),
  used tool (`used_tool`), MCP tool (`mcp_tool`) or Bash command (`bash_command`). Omit to get only
  the period's total.
- `tool` and `used_tool` are not the same thing: `tool` is the AI tool that ran (claude, cursor);
  `used_tool` and `mcp_tool` are what the run used (Read, Bash, `get_card`). In `mcp_tool` the server
  comes in its own column, or "servidor não registrado" (server not recorded) when the name did not
  carry it. `bash_command` is the base command of each Bash call, without arguments (`npm test`,
  `git status`, `cat`), Claude Code only.
- Period filters (start and end date, in `YYYY-MM-DD`), card (e.g. `72` or `#72`), and dimensions
  (e.g. phase, model, card type).
- On the **agent**, **skill**, **used_tool**, **mcp_tool** and **bash_command** dimensions the table
  shows only the count of runs and uses (no tokens, which cannot be split among a run's components).
  `effort`, `profile` and `mode` have tokens.
- Tokens count in every measured run, from Claude Code and from Cursor. With the "Show cost in dollars" rule on, the table gains a `custo` column and, below it, the line estimated from the catalog price (only without card, phase, type, model or tool filters); when off, it has no dollar figure.
- The panel's times (permanence per phase and lead time) are not in `get_metrics`. Rework is: with
  `rework: true` (and, if you want, `start_date` and `end_date`), the answer brings the reviews, the
  first-try approvals and the change requests per phase and per model, the done stories with a
  linked bug and the AI signals (fixes in Review, failed `npm test`, commits after the PR), each with
  the autonomous-mode part; "not measured" when there is no run with recorded Bash.
- Unmeasured values appear as "-" (never 0).
- Always tells you when the board's history started and which periods have only monthly totals
  (without per-run detail). Periods outside the retention window (6 months by default) have no
  detail and aggregate only the already-consolidated totals.
