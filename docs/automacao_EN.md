[🇧🇷 Português](automacao.md) · 🇺🇸 English

# Heartbeat and autonomous mode

The board has two automations: the **heartbeat**, a clock that tidies the board and calls the AI on
ready cards, and the **autonomous mode (YOLO)**, in which the AI drives a story end to end without
asking for approval. This document describes both in detail; the flow of a story is in
[fluxo_EN.md](fluxo_EN.md).

## Heartbeat

With the heartbeat on (Configurações → Automação, settings → automation), the board calls the AI on its own at every
interval, while the editor is open in the project folder. The heartbeat itself does not depend on
the AI: it is a board clock that, on each round, first tidies the board and then decides what the AI
does.

### What each round does

- **Returns to the AI** the cards blocked by the tool's usage limit (the limit renews on its own),
  with a notice in the conversation, and **warns once** about a card that has been with you for two
  days or more.
- **Respects the usage-limit pause, profile by profile**: when a CLI profile runs out of the plan's
  limit, that profile's queue pauses; with you in the loop, the card asks whether to wait or continue
  with another model (see Fallback rules in `configuracoes_EN.md`). In autonomous mode, when no
  execution policy offers another destination, the card goes back to the AI and that
  profile's queue pauses, in the heartbeat, the autopilot and the orchestrator, until the renewal the
  output reported (plus 3 minutes); with no time given, the wait is 5 minutes and doubles on each new
  failure, up to 60. Other profiles keep going, the round log says which profile waits and until
  when, and the top of the board shows one line per profile ("Usage limit for Claude Code: its queue
  resumes at 1:53 PM."). Once the pause expires, the profile's first automatic run is the test. With
  a fallback policy, the run continues on its destination. The pause is saved in the board (it
  survives reopening the editor); a run you start by hand stays allowed and, when it finishes well,
  ends the pause. With Gemini, in the CLI, ACP and API modes, the renewal comes from the API error:
  the daily quota renews at midnight Pacific time (the Gemini API rule), and the per-minute limit
  (429 `RESOURCE_EXHAUSTED`) brings the wait in `retryDelay`, a short pause; with neither, the
  backoff applies.
- **Checks the pull requests** of every story that has one (automatic merge detection) and cleans up
  leftover branches and worktrees (orphan branches and worktrees).
- **Syncs the local branches** the board knows about (the main branch, `develop` and the branch of
  each open story) with origin, so the next task starts from the latest base and the AI finds the
  story branch up to date. **Fast-forward only**: a branch moves only when it is behind origin and
  has no commit that origin lacks. Nothing is merged with a commit, rewritten or forced. A branch is
  left as it is when an AI run is on its story (or in the folder where it is checked out), when that
  folder has changes or untracked files, or when the branch is ahead of origin or has diverged from
  it. Each updated branch, and each reason for skipping one (once per reason), shows up in the log
  with the `Branches:` prefix. Your personal branches are not touched. Without network or without
  origin, the sync waits for the next round.
- **Checks for conflicts with the base before the PR**: for each story with a branch and no pull
  request yet, it asks git, read-only (`git merge-tree`, git 2.38 or newer; below that, the check is
  skipped with a line in the log), whether the branch conflicts with the current base on origin. If
  it does, it posts a notice in the conversation once per branch commit, with the files, for the AI
  to update the branch and resolve it before opening the PR. Nothing changes on the card or the
  branches.
- **Summarizes the conversation** of stories with three or more messages since the last summary, or
  two that add up to a lot of text (at least one from the AI), before working on the phase; the AI
  then receives only the summary and what comes after it.
- **Refines new Backlog cards** (**Refinar os cards novos do Backlog**, in the same settings; on by
  default): from the title, the AI improves the description, fills in model, skills, rules and
  checklist and leaves the card waiting for your review. Approving moves the card to the first
  phase.
- **Works on ready cards** and answers pending messages, with one run per story. An approved card
  moves to the next column as "Pronto" (ready) right away, but the phase work starts on the next
  round, if there is a slot (with the heartbeat off, approving calls the AI immediately). When the
  phase is done, the AI leaves the card waiting for your review or your answer.

### Round order and queue

- The round has a fixed order: tidying (usage limit, stalled cards); a single `git fetch`; the pull
  requests (a merged story loses its branch, so they come before the sync); the branch sync; orphans
  and published versions; and, last, the AI queue, which waits for the sync to finish so it starts
  from branches already up to date. The number of stories in the round is still reported right away.
  This maintenance (GitHub and git queries, no AI) runs up to **four** tasks in parallel. It is a
  fixed limit of the heartbeat's own, not **Tocar histórias em paralelo** (work on stories in
  parallel) nor **Histórias ao mesmo tempo** (stories at the same time): those still apply only to
  AI runs. With two windows on the same board, only the owner window does the maintenance.
- With nothing pending for the AI, nothing runs, and the log (Output → Faz AI) says why: expired
  login, story in autonomous mode, execution already running, with the person or waiting for another
  card. With something pending, the log says how many stories are with you and what the AI will do
  in each one (phase, refine, summarize).
- The round follows the board order: bugs first; then the rightmost story (the most advanced one
  finishes before a new one starts); within a column, top to bottom. What decides is the card's
  position, not its number nor what has already been approved.
- Cards that are with you (waiting for review or an answer, blocked) are not touched, unless you
  left an unanswered message in the conversation.
- Runs use the same permission and time limit as the "Trabalhar na fase" button.

Which columns require approval, and in which ones the AI works, is set in Configurações → Workflows
e colunas. You can always move any card yourself without approval.

### Parallel runs

Activities **without a branch** (refine, summarize and the phases that only produce a document, such
as Discovery, PRD, Spec and Plan on the default board; the rule is any column with an artifact
before the code phase) run at the same time in any workspace mode, up to **Histórias ao mesmo
tempo** (two by default, up to six), even with **Tocar histórias em paralelo** off. Activities
**with a branch** (Implementation and Homologation) keep the previous limit: one at a time outside
the worktree.

In "Worktree por história" mode, **Tocar histórias em paralelo** (Settings → Automação, automation;
off by default) makes the heartbeat drive several branch stories at once, each in its own
working folder, up to the same **Histórias ao mesmo tempo**. The two caps (text and branch) are
counted separately; each counts every run in progress, including the ones called by hand. In
autonomous mode (whose stories are stacked), the queue order applies to stories that need a branch;
a story in a text phase starts as soon as there is a free slot, even with the previous one still
open.

Outside the worktree, `prepare_workspace` called in a text phase while another story has a run in
progress is refused (folder in use): the branch is created in the code phase. With the "Sem
restrições" permission the AI can still switch branches by hand; the guard covers only the board's
path.

The description of each Git field in the Settings explains why in each mode: with a branch in the
project folder, two stories at once would switch the branch under each other and mix their changes;
with worktrees they are isolated, at the cost of one more copy of the files on disk per story (with
dependencies installed in each) and more memory and CPU while several AI sessions, tests and builds
run together. These fields are the same in the editor and in the browser.

### Controls and indicators

- **Rodar o heartbeat agora** (run the heartbeat now), in the settings or with the command **Faz AI:
  Rodar o heartbeat agora**, starts a round right away, even with the heartbeat off. **Faz AI: Parar
  as execuções da IA e o modo autônomo** stops everything.
- The activity bar at the bottom of the board (visible on every view) shows what the AI is doing
  right now: with one run, "IA em #12 (Discovery, há 3 min)", with the card reference clickable to
  open it; with several, "IA em N cards: #12 Discovery · #15 refinando · …" and the full list in the
  tooltip. With no run at all, it shows the reason: the autopilot's note (why the queue stopped), the
  heartbeat's state ("Heartbeat desligado", "Heartbeat parado: motivo", "Próxima rodada às HH:MM")
  or, finally, "IA parada".
- The **heart** at the top right of the board shows the heartbeat: red and beating while it is
  running; grey and still when it is off or cannot run (no connection to Faz AI, or no tool).
  Clicking it turns the heartbeat on and off.

## Autonomous mode (YOLO)

A **story** can be marked **YOLO**: in the card panel, turn on **Modo autônomo**, or click the
mode's icon in the card footer, without opening the card (for several at once, select the stories
and use the selection bar). The board asks for confirmation, because the mode gives up every
approval; check **Não avisar novamente** (don't warn again) in the warning to turn it on directly
next time. Turning a story off asks for no confirmation. From then on the AI drives the story by
itself, **without asking for authorization or confirmation on anything**.

### Até onde (up to)

The warning to turn it on brings the **Até onde** selector, with the phases the AI works in from the
story's current column on; the default is the last one, **Homologação (abre o pull request)** (opens
the pull request), which is the full mode described below. Pick an earlier phase, such as Plan, and
the AI goes on by itself up to it: it does that phase's work, asks for your review and the mode
turns off, with a note in the conversation. For it to go on by itself from there, turn the mode on
again. With the mode on, the card bar shows **Modo autônomo até [phase]** (autonomous mode up to),
and changing the phase there asks for no confirmation. The selector starts at the last phase you
chose, and with **Não avisar novamente** checked the mode turns on straight up to it. In the
selection bar, the selector only offers the phases that apply to every selected story. The AI reads
the stop in `autonomousUntil` in `get_card`, and in the stop phase `phase.requiresApproval` comes as
true.

### How the AI behaves

- **From Backlog to the last column the AI works in** (Homologação, on the default board): it does
  Discovery, PRD, Spec and Plan, creates the sub-tasks, implements them one by one, reviews and, in
  that last column, opens the pull request, records it with `set_pull_request` and stops there. The
  story waits for your review. Columns that require approval stop holding the card, and the AI's
  review request becomes an approval right away, with its summary recorded in the conversation.
  Nothing holds the story before the chosen column: not even a pending item (`request_review` with
  `pending`, which is recorded in the conversation while the AI is told to decide).
- **No questions**: the AI does not use `ask_question`; faced with a doubt it decides and records the
  decision and the reason in the conversation. `ask_questions` is accepted: the board answers each
  question with the recommended option and records it in the **Perguntas e respostas** section of
  the description. Only a real impediment (access, environment, a failure it cannot fix) blocks the
  card.
- **Sub-task descriptions checked**: the autopilot and the autonomous mode drive the story through
  the same board path, so a sub-task missing the required sections is not run: the AI fixes it in a
  story session and, if a section is still missing, the story is blocked with the reason (see the
  description check in `fluxo_EN.md`).
- **Conversation summarized between phases**: when the story moves to another column with three or
  more messages since the last summary (or two that add up to a lot of text; at least one from the
  AI), the autopilot runs **Resumir a conversa** (summarize the conversation) before the new phase:
  the messages before the summary stay in the conversation but are deactivated (the AI receives only
  the summary and what comes after), so each run's context does not carry the whole conversation.
  One summary per column; if the AI does not write the summary, the conversation stays and the phase
  goes on.
- **By the project's patterns**: since nobody reviews the decisions along the way, the AI follows
  the project's patterns and architecture rules (`CLAUDE.md`, `AGENTS.md`, `DESIGN.md` and the
  similar code that already exists) and, among the paths that follow them, picks the least complex
  one.
- **No merge**: the AI stops at the last column it works in, with the pull request open; merging and
  moving the card on to Concluído stay with you. Concluído means merged.
- **No restrictions**: in the mode's runs the AI uses the "Sem restrições" permission (edits files
  and runs commands), because it needs git and `gh`. Turning the mode on accepts this for the story.
- **Splitting a large request**: the AI can create the following stories from an autonomous story
  (`create_card` with `autonomous_from`). They are born autonomous, join the queue, and get a
  **related** link to the origin story (skipped silently if any link already exists between the
  two). It never turns the mode on for a story you did not turn on.

### Queue and PR stack

The **autopilot** drives autonomous stories one at a time, in board order (bugs first, then the
rightmost, and within a column top to bottom), corrected by precedence: a story that depends on
another in the queue (**depends on** link, including through a sub-task) or derives from it comes
after it, however high it sits on the board.

With the mode on, each story waiting for its turn shows the **Fila N** (queue N) badge on the card
(1 = next); the number disappears when the AI starts on the story, when it passes to you and when it
is concluded, and pausing the mode clears them all. The autopilot moves on to the next story in the
queue as soon as the current one is delivered (stopped at the AI's last column, with the pull
request recorded), without waiting for your review or the heartbeat interval.

No impediment holds up the queue: a story that is blocked, waiting for your answer, waiting for
another card to finish (a dependency), or stuck in a cycle (open, but with nothing pending with the
AI) is skipped, and the turn goes to the next story in the queue that can advance: run, or move to
another column when the AI does not work in it. A story that depends on another keeps waiting for
that one to finish, even while stories further down the queue run ahead of it; it goes back into
contention once the dependency leaves open. Only when no story in the queue can advance does the
autopilot show the impediment warning, with the reason of the first story that is stuck.

Each story's branch starts from the most recently created branch among the other autonomous-mode
stories still open (the same order the queue runs in, even after dragging cards), and its pull
request is opened with `--base` on it, forming a stack of PRs; with no other open story ahead of it,
the branch starts from the main branch. A story whose predecessor in the stack already had its pull
request merged also starts from the main branch, since its code is already there.

**Brakes.** The autopilot keeps to **one story at a time**: an unblocked story goes back to its
position on the board and waits for the one currently running to finish. A run that fails leaves the
card Bloqueado, with the reason, and the circuit breaker blocks the story after 3 consecutive runs
with no progress; blocking a story frees the queue to move on to the next one, instead of locking it
up (a story that keeps getting stuck can spend up to 3 runs each, across the whole queue). Once you
unblock the card it carries on by itself.

### Autonomous mode button and commands

The **autonomous mode button** at the top of the board exists whenever there is an open story and
says what the click does:

- **Ligar modo autônomo** (turn on; no story in the mode): after the confirmation with "Até onde", it
  puts every unfinished story in the mode (or only the selected ones, when there is a selection),
  and they join the queue and are driven one at a time, respecting the parallel-run limits.
- **Pausar modo autônomo** (pause; lit, with the autopilot driving): pausing interrupts the AI.
- **Retomar modo autônomo** (resume; dimmed, paused): with open stories still outside the mode, it
  also puts them in the mode before resuming, with the same confirmation.

From the editor: **Faz AI: Pausar o modo autônomo (YOLO)**, **Faz AI: Retomar o modo autônomo
(YOLO)** and **Faz AI: Parar as execuções da IA e o modo autônomo**.

When the editor opens, the autopilot starts by itself whenever there is a pending autonomous-mode
story, unless you paused it: the pause is recorded on the board (it survives reopening the editor),
and "Retomar" (resume), or turning the mode on for a story, clears it; closing the editor does not
count as a pause. After a failure to start the AI tool, the autopilot does not start itself again
until you resume it. With the tool's login expired, the autopilot and the heartbeat wait for the
sign-in to come back, without spending runs. The heartbeat does not drive autonomous stories; they
belong to the autopilot.

## Card stuck in "Em execução" (running)

A card is "Em execução" only while an AI session is on it. If the session that marked it ended
without passing the turn (the editor window closed with the AI running, the story session finished
with a sub-task marked by `start_work`, a session outside the board crashed), the board sends it back
to Pronto (ready): when the board opens, the cards of runs the previous session left open (and their
sub-tasks); when a story's session ends, its sub-tasks; and every minute, any card "Em execução" with
no board run for longer than one run's time limit (Settings → Automação → time limit), with the
explanation in the conversation.
