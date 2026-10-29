[🇧🇷 Português](gitflow.md) · 🇺🇸 English

# Branch, pull request and gitflow

How Faz AI Kanban creates each story's branch and working folder, opens and merges the pull
request, cleans up what is left when the story is concluded and watches the merges on GitHub.

## Branch and working folder per story

Each story works on its own branch, created by the board (for example
`feature/12-login-com-google`). By default it comes with a worktree: a separate working folder,
next to the project, where the AI changes the code without touching your folder or your work in
progress. Sub-tasks commit to the story's branch.

- The branch is created when the AI starts the implementation (it calls `prepare_workspace`) or with
  the **Criar branch da história** (create the story's branch) button on the card.
- The card shows the branch and opens the working folder in a new window.
- Below the branch, the **Commits by phase** section lists the story's commits (up to 200) grouped by phase, with hash, subject, date, card and run, read from the `Faz-AI-Card`, `Faz-AI-Phase` and `Faz-AI-Run` trailers. Commits without a phase go under **No phase**, last. The list is read when the card opens and when the branch changes, with no periodic refresh, and the section is hidden when there are no commits.
- The mode (worktree, branch in the same folder, or off), the branch name pattern, the worktrees
  folder and automatic PR merge when approving acceptance live in **Settings → Git**, and **drive
  stories in parallel** in **Settings → Automação** (automation), in the editor and in the
  browser.
- Each worktree is a working copy: dependencies have to be installed in it.

### Derived stories and stacked PRs

The Plan estimates the lines of code of the delivery: above about 400, the AI keeps the first part
in the story and creates the next ones as **derived stories**, in order (`create_card` with
`derived_from` pointing to the previous part). The branch of each derived story starts from the
branch of the previous part and its pull request is stacked on top of that one; the card shows
**Derivada de #N** (derived from #N). If the previous part has no branch yet, the derived story
waits for it before creating its own.

## Gitflow

Branches follow gitflow, on by default (**Settings → Git › Usar o gitflow**). The card type sets the
branch kind, and each kind starts from one place and goes back to another:

| Branch                       | Produced by                   | Starts from     | The PR goes to  |
| ---------------------------- | ----------------------------- | --------------- | --------------- |
| main (`main`, `master`...)   | —                             | —               | —               |
| `develop`                    | —                             | the main branch | —               |
| `feature/`                   | História and Débito técnico   | `develop`       | `develop`       |
| `bugfix/`                    | Retrabalho and Bug            | `develop`       | `develop`       |
| `hotfix/`                    | Hotfix                        | the main branch | the main branch |
| `release/`                   | no card type (prefix only)    | `develop`       | the main branch |

- The **main branch is detected on its own**, with no network: the `origin` HEAD; otherwise `main` or
  `master`; otherwise the current branch. The gitflow section on the Git tab shows which one and why.
- If `develop` doesn't exist, the board creates it from the main branch and pushes it to `origin`; if
  it can't push, it says so in the story's conversation, with the command to run by hand. It doesn't
  create it when `git fetch` failed (it may already exist on `origin`) or when the main branch came
  from the current branch: it refuses and says what to do (check the network, or run
  `git remote set-head origin -a`).
- Before creating the branch, the board runs `git fetch origin` (up to 20 s, no password prompt) and
  starts from `origin/<base>`, with no upstream (`--no-track`). With no `origin`, or if the fetch
  fails, it starts from the local refs and says so in the conversation.
- A deleted branch is recreated from the recorded base; if that base is gone too (the previous story
  in the stack was already merged), it comes back from the flow's base and the conversation says the
  PR changes target.
- The AI reads the PR base in `workspace.prBase` of `get_card` and opens the pull request with
  `--base`. In stacked stories (autonomous mode or derived ones) the base is the previous story's
  branch.
- A defect in a feature that is still only on `develop` is **Retrabalho** (rework), not Bug. Each card
  type's branch kind is chosen on the Git tab.
- The branch name uses `{fluxo}` (the kind's prefix: `feature/`, `bugfix/`, `hotfix/`). The old
  pattern `{tipo}/{numero}-{titulo}` is converted to `{fluxo}{numero}-{titulo}` when the setting is
  read.

### Options under Settings → Git

Available in the editor and in the browser:

| Field                    | Default    | What it does                                                                  |
| ------------------------ | ---------- | ----------------------------------------------------------------------------- |
| **Usar o gitflow**       | on         | Off, every branch starts from the main branch and `{fluxo}` becomes `<type>/`. |
| **Branch principal**     | empty      | Pinned main branch; empty detects it (`origin` HEAD, `main` or `master`).     |
| **Branch de integração** | `develop`  | Integration branch.                                                           |
| **Prefixo de feature**   | `feature/` | Prefix of feature branches.                                                   |
| **Prefixo de bugfix**    | `bugfix/`  | Prefix of bugfix branches.                                                    |
| **Prefixo de hotfix**    | `hotfix/`  | Prefix of hotfix branches.                                                    |
| **Prefixo de release**   | `release/` | Informational only: no card type produces a release.                          |

An empty prefix or name, or one git doesn't accept, goes back to the default. Branches and
worktrees left over after a story are covered in
[Orphan branches and worktrees](#orphan-branches-and-worktrees).

### Renaming the main branch or `develop` on `origin`

Changing **Branch principal** or **Branch de integração** to a name that does not exist yet, with
the old branch existing, opens a notice in the editor (the change also applies to `origin`, and the
board does not do it on its own). The options are **Renomear** (Rename) and **Desfazer** (Undo);
closing the box keeps the request and the question comes back when the board is reopened.

- **Rename** acts in this order: the branch on GitHub through `gh` (`gh api .../branches/<old>/rename`);
  `git fetch --prune`; `git branch -m` in the clone (including a branch checked out in a worktree); the
  upstream (`origin/<new>`); and, on the main branch only, `origin/HEAD`. GitHub redirects open PRs and
  moves the default branch to the new name (per the API documentation, not tested with a real account).
- **Without `gh`, outside GitHub or without permission**: nothing runs. The notice shows the ready-made
  commands for this clone and for the others, with **Copiar comandos** (Copy commands).
- **Failure midway**: the message says what already changed and what is missing. Each step checks the
  state before acting, so repeating is safe. The remote comes first: if it fails, nothing local changes.
- **Undo** puts the previous name back in the setting and does not touch the repository.
- **Refused** while the AI is running a story (the message lists the numbers).
- **Not changed**: CI workflows, protection rules, GitHub's default branch (for `develop`) and other
  clones. The AI does not rename branches: no new MCP tool.

In the browser (outside the editor) the question is a board dialog, on any screen: **Renomear**
(Rename, initial focus), **Desfazer** (Undo) and **Fechar** (Close, or Esc, which sends nothing and
does not come back in the session). After Rename, the dialog shows the steps done, what is left, the
error and the ready-made commands, each with **Copiar comando** (Copy command); on a partial failure
there is **Renomear de novo** (Rename again). **Settings → Git** has the **Branch principal** (main
branch; empty = detected) and **Branch de integração** (integration branch) fields, saved on leaving
the field, with the explanation of what the rename does and what it doesn't change. In the
**environment diagnostic**, the **Nome da branch principal/develop** item (a recommendation, it
doesn't block) stays pending while a request is waiting, with the local clone command and the
**Abrir a tela Git** (Open the Git screen) button.

## Tracing trailers in commits

Every commit made by a board card run carries three trailers at the end of the message:

- `Faz-AI-Card`: the card the run executes (the sub-task, or the story);
- `Faz-AI-Phase`: the story's column at the start of the run;
- `Faz-AI-Run`: the run id, the same one stored in `ai_runs`.

- They apply to CLI, ACP and API, and only to card runs: chat and suggestions get no trailers.
- Commits made by the person outside a run do not change. Nothing is written to `.git`: the setting
  applies only to the run's process and goes away with it.
- `--no-verify` does not remove the trailers. An `--amend` keeps one occurrence of each, with the
  values of the current run.
- The repository hooks (for example, husky) keep running, and a failure in one of them still blocks
  the commit.
- Needs git 2.31 or newer. Below that, the channel warns once and the run goes on without trailers.
- Implementation detail: the run receives `FAZ_AI_TRAILER_CARD`, `FAZ_AI_TRAILER_PHASE`,
  `FAZ_AI_TRAILER_RUN` and `FAZ_AI_GIT_CONFIG_COUNT`, and the `GIT_CONFIG_*` pairs that point
  `core.hooksPath` to a temporary folder of the run itself. The `GIT_CONFIG_*` pairs the person
  already had are kept.
- Unvalidated risks: if the tool's sandbox cannot read the temporary folder, the commit goes out
  without trailers, and the repository hooks do not run in that run either. If the tool clears the
  environment of child processes, the commit goes out without trailers and with git's normal
  configuration.

## Pull request and merge in Homologação

In Homologação the AI writes the **"Como testar"** (how to test) script (what was built, the steps
to verify it with the expected result, and what was left out) in the story's description, pushes
the branch, opens the pull request with the same script in its body, records its address on the
card and asks for your review. The card shows the PR link.

Automatic merge is optional and starts turned off (**Settings → Git › Pull request e merge**). With
it on, when you approve a story that is in the last column before completion:

1. the board merges the PR through the GitHub CLI (`gh`), with the configured method (squash, merge
   or rebase);
2. only after the merge the card goes to Concluído, and the story's working folder is removed;
3. if the merge fails (conflict, required checks, no access), the card becomes blocked with the
   error and stays in Homologação.

The merge does not happen if the story has no PR recorded or still has open sub-tasks. With
automatic merge off, approving takes the card to Concluído right away (or leaves it Aprovado, with a
notice in the conversation, if an open sub-task prevents the conclusion).

## Story completion with gitflow

With gitflow on, when a story is concluded with its PR merged, the board leaves nothing of it
behind. This holds for a merge done by the board and for a merge
[detected](#automatic-merge-detection) by it. In order:

1. removes the story's worktree (working folder);
2. deletes the local branch, even after a squash merge (the PR already confirmed the merge);
3. deletes the remote branch (`origin/<branch>`). If GitHub already deleted it, that is neither an
   error nor a warning;
4. updates the local `develop` **by fast-forward only**, without switching the project folder's
   branch and without touching its files.

The board only deletes the branch recorded on the card, and only after the merge is confirmed. When
the cleanup is not safe, it **does not delete what is at risk**, concludes the card anyway and says
why in a comment in the conversation, with the command to run by hand:

- the worktree has uncommitted changes: nothing is deleted (neither the worktree nor the branches),
  and the notice brings the path and the pending files;
- the local branch has commits that are not in the PR: nothing is deleted;
- the remote branch received commits after the PR: it stays;
- the project folder is on the story's branch: the local branch stays (the board never switches your
  folder's branch) and the remote one is deleted;
- the local `develop` has commits that are not on `origin`, or is checked out in some folder: it is
  not updated;
- any `git` or `gh` failure (no push permission, no network, no `gh`) also becomes a notice.

No cleanup failure prevents the card from being concluded. With gitflow off ("straight to the main
branch") nothing changes: the conclusion only removes the worktree. There is no option to turn the
cleanup off separately from gitflow. Branches and worktrees left over from before are covered in
[Orphan branches and worktrees](#orphan-branches-and-worktrees).

### Stack and hotfix

- **Stacked story.** If another story was created on top of the branch of the one just concluded, the
  board changes its base to `develop` (and its PR's base too) **before** deleting the remote branch.
  If the change fails, the remote branch stays and the conversation says so.
- **Merge commit into the main branch.** The PR that goes into the main branch (hotfix or release) is
  merged with a merge commit, whatever merge type is configured. That keeps the stories' merge commit
  in the tag, and archiving the published stories depends on it.
- **All work starts from `develop`.** Including Bug, which generated hotfix up to version 15 of the
  default board ("Update board" switches it to bugfix). Only the **Hotfix** type starts from the main
  branch, which is the published version; a hotfix's `get_card` asks the AI to bump the version
  (patch) and record the fix in the changelog on the branch itself.
- **After a hotfix.** The board opens and merges a `main → develop` PR, also with a merge commit, so
  `develop` receives the fix. There is never a direct push. On conflict, the PR stays open and the
  card's conversation tells you to resolve it.
- **Release from the main branch.** Then the board creates the tag and the GitHub Release on the
  merge commit (`gh release create <tag> --target <commit> --generate-notes`). The version is the
  main branch's `package.json` one; without a `package.json`, the next one (patch) after the latest
  `vX.Y.Z` tag. If the `package.json` version already has a tag (the hotfix did not bump the
  version), or there is nowhere to take the version from, nothing is created and the conversation
  warns. Publishing to a store still follows the project's release process; in this repository,
  `npm run release -- current --no-git`, run on the updated main branch, publishes the version that already has a tag and release.

### Orphan branches and worktrees

An orphan is a branch or worktree the board created whose story has finished (merged, done,
cancelled, archived or in the trash) or no longer exists on the board. The main branch, `develop`,
branches in use outside the worktrees folder and the bases of stories that are still active (the PR
stack) are never included. The board measures git on opening and on every heartbeat round (after
checking the merges) and gives each item a verdict:

- **Safe** (`Segura`): there is nothing to lose (a worktree with no changed files; a branch with no
  commits only it has, or already merged into the base). The board cleans it on its own: removes the
  worktree and deletes the **local** branch with `git branch -D`. The remote branch is not touched by
  this cleanup.
- **Needs a decision** (`Precisa de decisão`): it has uncommitted files, commits that exist only
  there, a story the board doesn't know, or a branch still in use by a worktree. Nothing is deleted
  on its own.

Under **Settings → Git → Branches e worktrees órfãs** (orphan branches and worktrees) each item shows
the story, the situation and the verdict. **Limpar** (Clear) removes one item; on a decision item it
opens a confirmation saying how many files and commits are lost, and only after you confirm does the
board remove it (checking the disk again first). **Limpar todas as seguras** (Clear all the safe
ones) acts on all the safe ones at once; **Verificar de novo** (Check again) measures again. When an
item could not be removed, its row shows "Não removido" (Not removed) with the reason, and the next
round tries again. While there are decision orphans, the top of the board shows the **N órfãs**
(N orphans) badge, which opens that section. With the heartbeat off, the board only measures on
opening and on **Verificar de novo**.

## Decision records

With **Settings → Git › Registros de decisão** (decision records) pointing to a folder of the
repository, such as `docs/decisoes`, Homologação writes there, before opening the pull request, the
story's decision record: the context, the decision, the discarded alternatives (with the reason for
each one), the consequences and the program design diagrams, from the approved Spec. The file is
named `<story number>-<title>.md`, goes in a commit of the story's branch and is cited in the PR
body. That way the decision lives in the repository, next to the code, and not only in the board's
database. `get_card` brings the path in `phase.decisionRecord`. Empty, the default, turns it off.

## Automatic merge detection

The board watches the pull request of every open story that has one (in any column, with or without
autonomous mode; only blocked and running stories are left out) and detects when it is merged,
concluding the story automatically. There is no setting of its own: the check happens on every
heartbeat round, on the same interval, and also on **Rodar o heartbeat agora** (Run the heartbeat
now). With the heartbeat off, it only happens when you ask for a round. The GitHub queries run in
parallel, up to four at a time; each story's completion and cleanup run one at a time, in board
order. When the merge is detected:

1. the board records the merge commit on the card;
2. registers in the conversation that the story was completed;
3. moves the card to the done column ahead and removes the working folder. With gitflow on, it also
   does the rest of the [story completion with gitflow](#story-completion-with-gitflow): deletes the
   branches and updates the local `develop`.

### PR closed without a merge or in conflict

If the pull request is closed without a merge, the board registers a warning in the conversation
once only.

If it is open with conflicts, the board warns in the conversation once per conflict (the notice
quotes the PR commit) and, in the same round, calls the AI in a run just to resolve it, at the front
of the queue: it updates the branch by merging from the PR base (no rebase, no force push), resolves
the conflicts, runs the checks, pushes the branch and records what it did in the conversation. This
applies to any story, including autonomous and already delivered ones, except a blocked one and one
waiting for your answer. The run uses the phase's model and permission, follows the limits of
activities with a branch, shows on the card as "resolving conflict" and, at the end, the card
returns to the status it had. If the AI cannot do it, it blocks the card with the reason; if it
finishes and the PR is still in conflict at the same commit, the board blocks the card and the
resolution is yours (unblocking gives the AI one more try).

The merge is still done by the person, manually or through automatic merge; the board only
observes. Failures in querying the PR state (no network, no authentication, no `gh` installed) do
not block anything: the warning appears in the log, and the board tries again on the next round.

### Archiving published stories

In the same round, after looking at the pull requests, the board takes the last step of the cycle:
**when the version containing a concluded story is published, it records in the conversation which
version carried it (tag and release link) and archives the card**. That way the Concluído column
holds only what is merged and has not reached your users yet; what was already delivered goes to the
Arquivados tab, from which you can restore the story (with its archived sub-tasks) at any time.
There is nothing to turn on: the step comes along with merge detection, in the same heartbeat round.

A story counts as published when there is a tag that **contains** the merge commit **and** that has a
**published release** on GitHub (which is what this project's `npm run release` creates). A tag
without a release does not count, a draft release does not count, a prerelease does. The recorded
version is the oldest among those containing the commit, by publication date. The criterion is
deliberately conservative: archiving late fixes itself on the next round, archiving early hides a
card with nobody noticing.

Everything here is best effort. A project with no releases, outside GitHub or on a machine without
`gh` simply archives nothing: no card is blocked and the reason appears once in the log. The board
never publishes a version (it only reads what you published), and stories concluded before this
feature existed, which have no merge commit recorded, stay yours to archive with one click.
