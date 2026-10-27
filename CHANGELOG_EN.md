[🇧🇷 Português](CHANGELOG.md) · 🇺🇸 English

# Changelog

## 0.48.0

### Added

- The board library marks what is factory-made, and copies now follow their source.
- New Hotfix card type, which starts from the main branch and creates a tag and GitHub Release.
- New MCP tool `set_base_branch` changes a story's base.
- New MCP tool `release_card` returns a card that was with the person back to the AI.
- Card context gains suggestions, import as rule and file merging for what loads on its own (#1116, #1117).
- In Connect agents, the board asks the agent itself what its tool loads on its own.
- New Connect agents screen brings together the board's AI agent, replacing AI tools and AI models.
- Each agent shows the account in use and lets you sign in and out through the board.
- The Test tab talks to the agent over ACP in real time and shows the protocol log.
- The board writes a daily trace of everything that happens, to investigate defects, and the **Faz AI: Open the board trace** command opens it.
- New real Gemini test in CLI, ACP and API modes, for extension developers.
- The Gemini usage limit now applies in all three modes, and Metrics show the tool mode.
- Gemini can now run through the CLI, with the key kept in the vault and an isolated home on each run.
- New Connect a tool screen connects Gemini over ACP with the API key kept in the vault.
- Gemini can run through the API, with the board driving the call loop and the card's MCP tools.
- Gemini through the API also reads and writes files and runs commands, within the permission and project folder limits.
- ACP agents such as Gemini CLI, Codex and OpenCode appear as ready catalog profiles, switched off (#1095).
- The **Detectar modelos** button now works on ACP agents, reading the models the agent announces (#1094).
- The **Admission regime** option lets you choose between the exclusive and the compatible regime (#1091).
- Capability admission now covers the ACP transport (#1090).
- CLI profiles gain the ACP transport to run agents such as Gemini CLI, OpenCode and Codex (#983).
- When each run ends, the board checks what the AI used against what the card allowed (#972).
- On Cursor, a hook ensures the run respects what the card allows (#965).
- The selected card gets a shadow that sets it apart from the others (#1069).

### Changed

- The import artifacts dialog is better organized, with its actions in a single footer.
- Factory agents can no longer be deleted, and any agent can be turned off.
- **Send** always calls the AI, even with the card blocked, and turns into **Stop** while it works.
- Bug now starts from `develop` instead of the main branch.
- In Connect agents, the list follows the order of use and each agent shows a closed or open context lock.
- The Connection tab of Connect agents is simpler.
- A single **Atualizar** button replaces **Verificar situação** and **Atualizar lista** in Connect agents.
- Model suggestion moved to Harness › Tool and execution.
- Fallback rules now belong to each agent, with validated entries and a test verdict.
- Fallback rules become a simple list, replacing "Execution and fallback policies".
- The board runs cards from any enabled agent at the same time, and the agent in use becomes the default agent (#387).
- The custom profile becomes an advanced path and only accepts CLI.
- The admission regime is now set per profile, from what it proves in Connect.
- Each AI profile now stores the tool and the mode (CLI or ACP), and the database moves to format 48.
- Capability checking is now done per profile and applies to the profile that will run the card.
- The isolation proof now counts for every permission and survives an editor restart.
- **Refine with AI** no longer keeps the previous description text (#1076).
- The AI receives at most the last 20 conversation messages (#1076).

### Removed

- The "Default agent" card at the top of Connect agents is gone.
- The "This project's tool" section of the Harness is gone.
- The **Recreate default board** item and the `reset_board` MCP tool are gone.
- The AI tools and AI models screens are gone, moved to Connect agents.
- The **Faz AI: Verify the AI CLI isolation** command is gone, because the check runs in Connect.
- The ACP agent field of the new custom profile is gone, because an ACP agent comes in through Connect a tool.

### Fixed

- Old ACP protocol log files are now deleted along with the trace files, even with the window open for days.
- The Hide session/update switch gets a hint explaining it only filters the list.
- Interface review: spacing, headings, empty fields, collapsible blocks and narrow tables are consistent across all screens.
- The heartbeat and the other switches in Settings get the right spacing.
- The import and export artifacts dialogs and the context editors no longer take up the whole screen.
- Import finds the installed tools again, such as Claude Code.
- Environment diagnostics now list the old copies of the board flow and of the factory agents (#1115).
- Summarizing or refining a blocked card no longer leaves it "Em execução" forever.
- A sub-task answered by the person runs again, and the story no longer stays stopped.
- Claude Code models are now read from the official documentation, with Haiku 5.5 under the right name.
- Codex and Google Antigravity over ACP connect again.
- The screen no longer shifts when a select or menu opens in the editor.
- Model selectors group by agent and gain a name filter.
- The fallback rules test ignores the interval between attempts.
- The fallback rules simulator was reworked and now gives the decision in one sentence.
- On Cursor, an exhausted agent quota is no longer treated as an ordinary failure.
- On Cursor, a child process that outlives the exit no longer holds the `.cursor/mcp.json` lease.
- The Cursor hook is now installed in any editor when `cursor-agent` is on the PATH.
- On Cursor, a run with no confirmed end no longer refuses the following ones until the window is reopened.
- The whole screen no longer scrolls past its limit, as if there were a screen inside another.
- The buttons of each model suggestion rule are no longer stuck together.
- Fixed the Settings › AI tools defects found in the end-to-end test with the board trace.
- Fixed the layout of Settings › AI tools and of the top bar in narrow panels.
- Execution policies now accept profiles beyond the three ready CLIs, such as Gemini and ACP agents.
- Tools denied by the card now also hold in runs over ACP.
- With Gemini or another ACP profile as the default, the agent keeps the card's tools.
- The log no longer replaces "gemini" with "[credencial local]".
- The ACP run check now compares in the card's vocabulary, with no false deviations.
- The card's agent runs again with an ACP or custom profile.
- Custom and ACP profiles show up in the card's Model field (#1093).
- A custom or ACP profile runs cards and the chat again in the default runtime (#1091).
- The conversation and heartbeat run section shows again with a custom profile as default (#1091).

## 0.47.0

### Added

- The minimum-context configuration is frozen and verified before each run (#998, #999, #1045, #1001).
- In Execution plan, **Propose with AI** suggests additional skills and MCPs for each action (#996, #1002).
- New minimum-context v1 runtime on the AI ports, opt-in (#1000).
- New optional short-track rule takes small stories straight from Discovery to Plan (#602).
- The runner posts a notice in the conversation when an AI run goes over 10 million cache-read tokens (#603).
- In Harness, the **Export to the tool** button copies rules, skills and agents to Claude Code, Cursor or Kimi Code (#623, #901, #902).
- The metrics panel now measures precision in autonomous mode too (#605).
- Diagnostics show capabilities, the Test button, the next run and the limits (#880).
- The AI now asks questions with options through the `ask_questions` tool (#895).
- The open card shows the AI's questions in a carousel, one at a time (#955).
- An AI assistant helps create, suggest fallbacks for and review conflicts in execution policies (#734).
- Each CLI profile declares what the tool still loads on its own, without promising an empty context (#619).
- The card menu gains **Duplicate card** (#723).
- The Archived tab gains search, filters, pagination and each story's archived sub-tasks (#724).
- The trash gains multiple selection and bulk actions (#721).
- The Archived tab gains multi-card selection with bulk restore and move to trash (#775).
- The Harness inventory and **Import** now read the project's `.kimi-code/AGENTS.md` (#623).
- Per-profile execution adapters keep the base reader on copies and run custom profiles.
- Custom CLI profiles get their own command resolution and probes.
- Ready CLI profiles, copies and custom profiles are now stored in the database, in schema 42.
- Execution and fallback policies gain a versioned base, a shared evaluator and a manual editor.
- The real CLI is now tested through the board's execution path.
- `npm run test:cli-real` verifies the contract with the real Claude Code.
- The persisted orchestrator now drives runs with controlled processes.
- The gateway accepts an asynchronous identity registration before releasing the launcher.
- Controlled runs now have an MCP identity per attempt.
- Orchestration gains a persisted foundation of units and attempts, in schema 39.
- Library files are pinned per run.
- The execution plan is now reviewable per activity.
- The gateway gains the base for v1 contract admission by capabilities.
- The run identity is recorded before the AI starts.
- The project MCP is now leased during the run on Cursor and Kimi Code.
- The board gains the base for versioned context contracts, in schema 35.
- The Usage tab and the agent editors show the effective context with each item's origin.
- Creating and editing subagents gains AI assistance in every part.
- The selection bar and the column menu gain contextual bulk actions (#616).
- The log keeps the command of each Bash call (#604).
- `get_card` accepts `only` to return just the blocks you need.

### Changed

- Card search by number is more precise (#1065).
- The board responds faster with a large history (#1066).
- The plan usage limit now pauses the CLI profile's queue instead of the cards (#1047).
- The card cycle uses fewer MCP calls, with summarized responses (#601).
- Board settings return to the board's own Settings screen (#726).
- The AI texts and default board v13 now use the questions with options (#956).
- The board now runs the Implementation sub-tasks, one per run of its own (#621, #824).
- The chosen model now decides the CLI of each run (#620).
- The model fallback becomes an execution policy proposal (#735).
- Execution and fallback policies now live in Settings → AI tools (#733).
- Chat, assistants and suggestions use the same execution policy as the cards (#732).
- The board flow arrives through MCP, with no file in the tool folder (#617).
- AI tools become CLI profiles you can turn on, duplicate, create and test (#618).
- Import now uses the format adapter, and Diagnostics warn about the old copy of the flow skill (#851).
- Diagnostics and the top warning are now per CLI profile (#622).
- The Harness screen now has the Tool and execution and Board artifacts tabs (#616).
- The board now keeps its own copy of agents, skills, rules and MCP servers (#615).
- Profile IDs are now separate from the CLI bases.
- MCP settings stay in a local vault, and import goes through review.
- The Harness now has the board library in a folder shared between tools (#615).
- Import by type gains review and protection against duplicates.
- Creating rules and skills gains step-by-step guidance.
- Library management gains bulk actions and MCP descriptions.
- The AI resolves the pull request conflict in a run of its own, and the board checks for conflicts before the PR (#747).
- Document phases now start from the code map the previous phase already read (#600).
- The heartbeat syncs local branches and does maintenance in a fixed order and in parallel (#722).
- `get_board` gets leaner, with one agent list and no repeated appearance or inventory (#598).
- The fixed `get_card` notes get short, and the full text moves to per-topic skills (#588).
- In the card conversation, the "Summarize conversation" button moves to the right and stands out.
- The automatic summary also considers the conversation's size.
- On the open card, the "Save description" button moves up to the section header.
- The column's select-all box moves to the start of the header (#579).
- The heartbeat now takes care of the whole board on each round.
- Approve no longer calls the AI right away when the heartbeat is on.
- The summary deactivates earlier messages instead of deleting them.
- Every board action now shows it is waiting for confirmation.

### Removed

- The per-rule model fallback is gone for good (#853).
- Native delegation to subagents and the parallel sub-task limit on screen are gone (#825).
- The board no longer reads or writes the tool folders (#926).
- Rules no longer shows the notice about the Models tab (#725).
- The Criticality field left the board.

### Fixed

- Autonomous mode no longer refuses the cards of an agent that declares the flow skill.
- The context contract editor opens from the agent again (#1054).
- The MCP bridge ignores the uninterpolated run token (#823).
- The open card's sub-tasks are aligned (#844).
- The board's MCP and skill install in your user folder on their own, and the outdated warning only shows when real (#809).
- A run that fails before the first event is no longer repeated (#739).
- Refine no longer pastes the whole previous description into the conversation (#599).
- Opening a select no longer shifts the board.
- Claude Code's exhausted usage limit no longer blocks the card.
- The "How to use the Harness" notice no longer returns after being dismissed.

## 0.46.0

### Added

- The MCP registration is redone when the extension updates (#563).

### Changed

- The board's MCP server is installed only in the tool's global scope (#563).

### Fixed

- The `faz-ai-fluxo` skill loads on Cursor again (#563).
- Kimi Code's exhausted usage limit no longer blocks the card (#570).

## 0.45.0

### Added

- The board now works with Kimi Code, the third AI tool.
- The heartbeat says why it did not run (#551).
- The Kimi Code Harness lists, adds and removes hooks, and the factory agents get adjustments for it.
- Changing the main branch or `develop` to a new name now also lets you rename it on `origin` (#466).
- New `fazai.git.mainBranch` option to fix the main branch.
- The board cleans up orphan branches and worktrees (#465).
- New `npm run e2e:kimi` tests Kimi Code in a clean container.
- The main branch and `develop` can also be renamed from the browser (#498).
- Diagnostics gain the Main/develop branch name item (#498).

### Changed

- The repository release now follows gitflow (#481).

### Fixed

- Resuming autonomous mode in a window that does not own the board now shows a warning.
- Exhausted usage limit no longer blocks the card (#551).
- The column menu fits the trash item (#530).

## 0.44.0

### Added

- The board creates `develop` when it is missing.
- The main branch is detected automatically.
- New notices in the story conversation about the state of the branches.
- The AI reads where to open the pull request.
- New Settings → Git screen for gitflow.
- Six new editor Settings options, under Faz AI › Git.
- Orphan cleanup and renaming the main branch on `origin` come in the next deliveries.

### Changed

- Branches created by the board follow gitflow (#462).
- The branch name now accepts `{fluxo}`.
- The branch is now created from what is on `origin`.
- Completing a story under gitflow cleans up the worktree and branches (#464).
- Stacks and hotfixes are now handled when a story is completed (#480).

## 0.43.0

### Added

- Every slow action now shows it is working.

### Changed

- In the AI Harness, the scope now comes before the topic.
- The Harness buttons gain size, spacing and a hint.

## 0.42.0

### Added

- The Harness is clearer to use, with the **How to use the Harness** notice.

## 0.41.0

### Added

- The harness becomes a Diagnostics item (5/5).
- **Suggest artifacts** and planning now use only what is on the board (3/5).

### Changed

- New board artifact bank, with modes, MCP servers, switched-off rules and imported folders (1/5).
- The agent editor becomes per tool and gains creation assistants (4/5).
- The Harness screen becomes per tool and per topic (2/5).

## 0.40.0

### Added

- The autonomous mode queue is visible on the card.
- Autonomous mode can be turned on from the board.
- The column header gains a select-all box.

### Changed

- Approve calls the AI right away (#475).

### Fixed

- Cards stuck in "Em execução" go back to the AI.

## 0.39.0

### Added

- Phase documents gain the "Questions for you" section (#441).
- The autopilot summarizes the conversation between autonomous mode phases (#441).

### Changed

- Approve moves the card to the next column (#441).
- Autonomous mode runs without stops up to the chosen column (#441).
- The Approved status hint now says "The card moves on to the next column".

## 0.38.0

### Added

- Pasting an image into the card description sends it to the attachments (#440).

### Changed

- The column menu gains "Select all" and bulk actions (#436).

### Fixed

- The "Flow skill" card and the "Board server" no longer duplicate in the AI Harness (#437).

## 0.37.0

### Added

- Each card shows the estimated run context, with detail by group and by item.
- The open card gains the **Usage** tab, with the estimate and the measured spend per phase.

### Changed

- Board fields leave the settings, and the tab is now called Custom fields.
- The sub-task Phase now belongs to the board and the AI.
- The global harness is reread right away when it changes.

### Fixed

- MCP instructions are now read in full on Claude Code.

## 0.36.0

### Added

- New `fazai.git.decisionRecords` option writes the story's decision record to the repository during Homologação.
- The metrics panel and `get_metrics` show rework: reviews requested, approved on the first try and change requests.
- Critical project areas require your approval on core stories, even in autonomous mode.
- Autonomous mode can go only up to a chosen phase, instead of all the way to the pull request.
- New Revisão column, between Implementação and Homologação, where the AI runs the checks and reviews the diff.
- Small stories can start straight at a later phase, without the documents of the earlier phases.

### Changed

- The `revisor-de-codigo` agent classifies each finding and is shorter, including when looking for code that only passes the test.
- The Spec template gains the Desenho do programa section, and discarded alternatives come with the reason.
- The Plan splits the delivery into parts that are easy to review and creates derived stories above about 400 lines.
- The pull request body explains the delivery: goal, what was done, how to review, decisions and how to test.
- In autonomous mode, the AI follows the project's patterns and picks the least complex path.
- Atualizar board replaces the texts of phases still on the previous default and keeps customized ones.

## 0.35.0

### Added

- The Harness shows the files that Claude Code instructions import with `@path` and the subfolder files read on demand.
- New Global tab in the AI Harness gathers what applies to all your projects, including plugins and organization policy.
- New Projeto tab in the AI Harness lists, in groups, everything the tool reads in the project folder.
- The environment check gets a button to reload the window and make a freshly installed version take effect.
- The Harness gets bulk actions in the Projeto and Global tabs, with confirmation for deleting and removing.
- The Harness now finds `AGENTS.md`, automatic memory, the organization policy and Cursor items, each with its own group.
- Harness files open in a window of the board itself, with formatted view and editing.
- The other AI tool found on the machine shows under Optional in the environment check.
- The environment check reads the Node.js version and requires 22 or newer.

### Changed

- The environment check becomes a checklist with Required, Optional and Recommended lists, with no installer.
- The environment check buttons are more prominent, with the action that fixes each item in blue.
- The plugin list shows only the really installed ones and allows bulk disable, enable and uninstall.
- Merge detection now happens in the heartbeat, and the `fazai.git.watchMerges` and `fazai.git.watchMergeMinutes` keys leave the Settings.
- The default run time limit becomes 45 minutes and the heartbeat interval 10 minutes.
- A warning icon on the Settings tab and on Check environment replaces the yellow bar.

### Removed

- The "Tudo que a ferramenta carrega" tab is gone, since the Projeto and Global tabs show the same content.

### Fixed

- The harness editor no longer loads forever when the board does not answer.
- The Harness no longer jumps when you pick an option, and each row's buttons wrap in narrow panels.
- Warnings on the Git, run and Harness screens now show in amber.
- The Claude Code sign-in warning suggests `claude auth login`.

## 0.34.1

### Fixed

- An earlier version of the extension refuses to open a board saved by a newer version, instead of failing halfway.
- The error opening the board is now explained, no longer locks the window and lets you try again.

## 0.34.0

### Added

- An expired tool login now shows as an error warning on the board, instead of stopping without explanation (#189).
- Autonomous mode turns on and off right from the card icon, with a shorter warning (#416).
- Each model suggestion rule gains a fallback model, used when the primary hits the limit.
- Cards can be collapsed to show only the strip and the title.
- New activity bar at the bottom of the board shows what the AI is doing right now.
- A new button summarizes the card's conversation, also available as `generate_summary`.
- Exporting and importing the board now work from the editor's command palette.
- Faz AI settings appear in the editor Settings, with new palette commands.
- Markdown attachments open formatted, with a selector to see the code.
- New environment check lists what the board needs and how to fix each item.
- The environment check gains Install everything, which runs the steps in an editor terminal.
- The board stores the full path of the MCPs, so the editor chat can find them.
- Settings show dependency warnings between options and links to jump to the related option.

### Changed

- AI usage now shows only in tokens, with no dollar cost.
- The autonomous mode pause is recorded on the board and lasts until you resume (#220).
- An Arquivados tab replaces the archived column, and Restore replaces Unarchive.
- Text-only phases run in parallel in any workspace mode (#331).
- Dragging cards is smooth, with the other cards sliding aside and the correct final position (#286).
- The Save description button is more prominent and sits below the editor (#287).
- The create-card button moves to the top of the column.
- The Git and parallel keys move to the editor Settings, with automatic migration.
- The Trabalhar na fase and Refinar com IA buttons show a formatted hint.
- Every run started by the board begins from an empty context, and the AI Harness defines what gets in.
- Agents become tool files, with ten factory agents created on first opening.
- Every call to the AI goes through a single gateway, and the usage log is no longer optional (#187).
- The Cursor e2e test shows cleaner output.
- Autonomous mode resumes by itself when the editor opens, respecting what you paused.
- In the queue, bugs come first and the most advanced story finishes before a new one starts.
- The "Como testar" script is now written in the card description and the pull request.
- The board MCP and the flow skill become requirements for every tool.
- Theme, font and font size move to the editor's native Settings.
- The status table moves from the Appearance tab to the Workflows tab.

### Removed

- The board now supports only Claude Code and Cursor.
- The price table is gone, and the board no longer calculates cost (#187).

### Fixed

- Autonomous mode no longer re-runs or blocks a story that was already delivered (#413).
- A blocked story no longer holds up the autopilot's whole queue.
- The autonomous story delivery is now detected when the PR arrives before the last column.
- Autonomous Implementação no longer stalls with the conductor.
- The default agent no longer becomes a file with a truncated name in the profile migration.
- Installing the flow skill checks it even when it already existed.
- The environment check install script now comes fully in English.
- The sub-task LED no longer goes dark seconds after lighting up.
- A story waiting for a dependency no longer stalls the autonomous queue.
- The autonomous-mode branch stack respects the queue order when reordering by drag.
- The board opens again without the "FOREIGN KEY constraint failed" error.
- The board server in Cursor and the other tools has a global install that works and a warning that goes away.
- The card's autonomous-mode bar shows only a short line about another story's block.
- A pending item for the person now hands over the card status, through the `pending` parameter of `request_review`.
- Claude Code's `allowed_warning` no longer counts as an exhausted limit.
- The switch to the fallback model only happens when the run failed.
- If the retry with the fallback model cannot start, the card is blocked with the reason.
- On a sub-task, the run counts as text or branch by the story's phase.
- The Export the board and Import a board commands have English titles when the editor is in English.
- The delivered-story comment is always authored by the AI tool's name.
- The autopilot note in the activity bar shows only the first line of the reason, capped at 160 characters.
- On Windows, runs and CLI probes no longer open a `cmd.exe` window.
- On Windows, the MCP server's named pipe carries the user name.
- The multi-select bar now has a background, border and padding in both themes.
- The Modo autônomo checkbox and the batch button reflect the click right away and lock until the board confirms.
- Collapsing or expanding a card with the keyboard keeps focus on the collapse button.
- The card's selection checkbox shows up when it receives keyboard focus.
- The activity bar no longer announces the whole line to screen readers every minute.
- Dragging a card right after dropping another starts from the order on screen.
- In AI Models, Preencher o modelo sugerido automaticamente shows as off when there is no suggestion rule.
- Resumir a conversa locks right after the click, and two quick clicks no longer start two runs.
- Only one Novo card form is open at a time on the board, and Esc closes it.

## 0.33.0

### Added

- Cursor's Auto now has a variable price, and the board does not estimate its cost.
- A new Cursor Token Rate switch (`cursorTokenRate`) adds the Teams and Enterprise per-token fee to the estimate.

### Changed

- The README images for agents, harness and models were redone with the current interface.
- The board MCP server and the flow skill are installed in each tool's section, globally by default (#141).
- The price table hint and the README explain fast mode, long context and how Cursor model names match.

## 0.32.0

### Added

- The "Incluir os modos rápidos" switch adds the fast versions of Cursor models to the catalog, each with its own price.
- A bar at the top of the board warns what is missing for the AI tool to work, with the action to fix each item.
- Cursor accepts the "only the board" and "board and files" levels, besides "no restrictions".
- The board records tokens, cost and usage inventory for each AI run, estimating cost from the model's price.
- The new Métricas view shows completed activities, runs, tokens, cost and AI time, with period and workflow filters.
- The metrics panel brings the monthly cost and tokens series, as a chart and a table.
- The metrics panel shows where usage happened, card time in each phase, lead time, the most expensive rankings and what the AI used.
- `get_metrics` also groups by effort, profile, used tool and MCP tool.
- The window for each run's detail is configurable from 1 to 24 months, with a default of 6.
- Clicking the branch name on the open card copies it.
- The heartbeat can drive several stories at once, in "Worktree por história" mode, with the "Tocar histórias em paralelo" switch.
- Independent sub-tasks run at the same time, and a card can depend on another.
- In Settings → Backup, you can export the board to a `.fazai.json` file and import it back.
- The Vínculos section of the open card now shows the relation between story and sub-tasks.
- A completed story leaves the board, archived, when the version that contains it is published.
- The AI can query the board's usage metrics in the card conversation with `get_metrics`.

### Changed

- The README images were redone with this version's interface.
- "Chamar IA" became two buttons: "Trabalhar na fase" and the new "Refinar com IA".
- Cursor's models are now your account's, read from `cursor-agent models`.
- The board's tools refuse unknown parameters instead of silently ignoring them.
- The Cursor catalog was updated: `"type": "stdio"` on MCP servers, Grok subagents and new hook events.
- Cursor's CLI is looked up as `cursor-agent`, and the model effort goes as a suffix of the id.
- The card's LED now looks like an LED and shows the state at a glance: green, yellow, red or off.
- Buttons now say what the click does, and autonomous mode has a single name in the interface.
- Splitting a large request into stories with `autonomous_from` now links them as related.

### Fixed

- Agents, models and suggestion rules no longer lose a change made right after another.
- Suggestion rules now appear translated in the English interface.
- Windows, macOS and Linux use the same board in the editor and the terminal, without opening an empty database or losing data.
- Claude Code and Cursor runs are sturdier.
- The open card no longer loses what was written, and Esc closes only what is on top.
- The card's AI buttons show on the board the error of a run that did not even start.
- The board server is registered with the full path of node.
- Cursor in the background really works, with the board server, consumption, inventory and the story's folder.
- On Windows, the prompt reaches npm-installed CLIs intact, and Stop ends the whole process tree.
- Claude Code configuration warnings no longer hide the real error reason in the chat and on the card.

## 0.31.1

### Fixed

- The open card works again: it opens centered and closes only on a click outside or Esc.

## 0.31.0

### Added

- The board now keeps a history of card events and AI runs.
- No conversation content goes into the history, and the detail is kept for 12 months beyond the monthly totals.
- The default board appears translated when the interface is in English.
- Options of select fields that name a technology get its logo.
- The AI fills in Tags, Effort, Model and Skills and creates the checklist on the first call for a card without them.
- The AI LED also appears at the top of the open card.
- The board detects the pull request merge and concludes the story on its own.

### Changed

- Autonomous mode stops at Homologação, with the pull request open, instead of going on to Concluído.
- The AI queue follows the board order, with bugs first, not the card number.
- The attachment opens in a window inside the board, where text and JSON can be read and edited.
- The open card opens as a centered window and no longer covers the chat.

### Fixed

- The published package ships with the version's release notes at the top of the changelog.
- The release no longer pushes straight to `main` and goes through a release branch with a PR.

## 0.30.0

### Added

- Autonomous mode (YOLO): the AI drives a story from Backlog to the pull request without asking for confirmation, with a queued autopilot.
- The README asks for ratings and points to the issues, which gained bug and improvement forms.
- Interface in Portuguese and English, with the **Language** chosen in Settings → Appearance.
- Chat with the AI on the board to create, move, link and query cards in natural language.
- Parent, child and related links between cards of any workflow, with `link_cards` and `unlink_cards`.
- Every new card of a type is born with the skills chosen in the per-type defaults.
- Agents gain the **What this agent does** field, which suggests skills and MCP servers, plus ready-made tool sets.
- A theme button in the board's top bar cycles between System, Light and Dark.
- The contrast of text, controls and keyboard focus is now checked by an automated test in both themes.
- Internal: ESLint, Prettier and board interaction tests set up, with no change for users.
- The "⋯" menu button tells screen readers whether the menu is open.
- Cards waiting on you get a border in the status color.
- An LED blinks slowly on the card bar while the AI is working on it.
- MCP gained `create_workflow` and `delete_workflow`, and lost `set_workflow_layout` and the `collapsed` parameter of `update_column`.
- Each workflow has a handle to drag its position on the board, and MCP gained `move_workflow`.
- A heart at the top of the board shows whether the heartbeat is running and turns it on or off on click.

### Changed

- Open-card, board and filter controls now use Radix selects and fields.
- The AI harness gets three tabs: Tool and execution, From the project and Everything the tool loads.
- Execution profiles become Agents, and every run started by the board goes through an agent.
- The card's Skills field opens a picker window with search, tabs and each skill's origin.
- The AI harness gets a new list of skills, agents, hooks and MCP servers, with group selection and bulk actions.
- The board uses its own palette, the same in the editor and the browser, in light and dark.
- The primary button is indigo in both themes.
- Scrollbars use the board's colors, and the columns' scrollbar gained breathing room.
- Internal: the front end uses UI primitives instead of repeating the same HTML in every screen.
- Internal: the Harness screen was split into one file per section, with actions asked of the host through named commands.
- Internal: all code follows Prettier, and `npm run typecheck` covers the interface tests.
- Internal: board rules repeated in the host and the front end now live in one place, `src/shared`.
- Internal: the MCP tools move from one huge file to one file per group, without changing what the AI sees.
- Internal: the host message router becomes a typed dispatcher with per-domain handlers.
- Internal: the Harness screen becomes a composition of sections, with new interaction tests.
- Internal: the card panel becomes a composition of parts, with new interaction tests.
- Emojis and loose symbols give way to a single set of line icons (Lucide) across the whole board.
- The board card gets a bar in the type's color, status with icon and time, its own line for the model and a footer with branch and PR.
- Settings get tidier, at full width, with title and main action on the same line and a collapsible side menu.
- The Fields screen is redone with one card per field, a live preview and the **New field** button.
- Forms now use Radix Themes components.
- Workflows and columns are redone: you can create and delete workflows, and the board remembers each one's state.
- The AI LED always stays on the card, turned off when the AI finishes, and a story lights up for work on its sub-tasks.
- Board rules get the new design, with one card per rule.
- The AI harness gets the new design, with cards and the main button at the top of each section.
- Execution profiles get the new design, with cards and Radix selectors.
- AI models get the new design, with a new-model draft and buttons at the top.
- The Git and Appearance screens get the new design, with form cards and Radix controls.
- The last old controls in Settings, including the open card's custom fields, move to Radix.

### Removed

- Cards lose the colored stripe on the left, and the type color lives in the card bar.

### Fixed

- Skills and agents with a multi-line `description: |` or `>` now show the full description.
- The sidebar's Filters panel uses the board theme's background and is no longer almost invisible.
- Status and type badges stay readable in any chosen color.
- Switching cards while editing the description no longer saves the draft to the wrong card.
- Text on the type and status colors is now chosen by perceived contrast, with a preview and a warning when picking the color.
- Text, link and number fields on a card no longer drop letters when you type fast.
- The test browser's logs (`.playwright-mcp`) are now ignored by git.
- In Settings > Fields, the "On the board" selector no longer overlaps the options column in narrow windows.

## 0.29.1

### Added

- The README warns that the project is in alpha.
- New section on setting up the development environment and publishing with `main` accepting only pull requests.

## 0.29.0

### Added

- The board opens in the browser, in sync with the editor, and the `faz-ai` command serves it outside the editor.
- The AI is told the run's permission level and blocks the card saying which option to choose when it is not enough.
- Run failures bring the end of the tool's output into the card, with the block reason formatted.

### Changed

- With Claude Code, calling the AI no longer depends on **Connect AI (MCP)** or on approving `.mcp.json`.
- Usability improvements: a **Call AI** button in the card header, floating notices, an **N with you** counter, visible keyboard focus and more.

### Fixed

- Calling the AI works without the CLI on the PATH, since the board looks for the executable in the usual folders and in editor extensions.
- Each folder has its own database, and windows on different projects no longer overwrite each other.

## 0.28.0

### Added

- Find and install skills from a folder, a GitHub repository or a git address.
- The Plugins section shows each tool's commands for installing and removing plugins.

## 0.27.0

### Added

- Each skill's supporting files appear on screen, with open, create and delete.
- New **Create templates skill** option, for class templates and code examples.
- `get_card` returns the supporting files of the card's skills, and the new MCP tool `write_skill_file` writes them.

## 0.26.0

### Added

- Hooks listed one per command, with add and remove in the formats of Claude Code, Codex, Cursor and Copilot.
- Claude Code and Cursor CLI permission rules can be listed, added and removed.

## 0.25.0

### Added

- MCP servers can be added and removed in each tool's files, in the project and in the user folder.

## 0.24.0

### Added

- Execution profiles define agent, skills, MCP servers, tools and model per phase, changeable per card.
- MCP gained `set_card_profile`, and `get_card`, `get_board` and `update_column` now handle profiles.

### Changed

- Runs started by the board pass the profile to the tool as a parameter or as an instruction in the prompt.
- The model and effort set on the card are now sent to the tool when it runs.

## 0.23.0

### Added

- Each skill can be Automatic or Only when named, in each tool's own format.

### Changed

- The card's "Skills" field also offers disabled skills, and the run receives the path of each of the card's skills.

## 0.22.0

### Added

- Harness lets you create, delete and copy skills, agents, commands and rules between the user folder, plugins and the project.

## 0.21.0

### Added

- The harness gets one tab per tool, showing what it loads in the project, in the user folder and from plugins.

### Changed

- The card's "Skills" field offers global and plugin skills, with a filter by origin.
- In Kimi Code, the project's skills folder is now `.kimi-code/skills`.

## 0.20.0

### Changed

- Column order changes by dragging the row in the settings, instead of the arrow buttons.
- A new column goes after the column you choose, or before the first completion column by default.

## 0.19.0

### Added

- The project's agents can be created, edited and deleted in the harness, with the MCP tools `get_agent`, `create_agent`, `update_agent` and `delete_agent`.

## 0.18.0

### Added

- In Acceptance, the AI opens the story's pull request and records its address on the card.
- Optional automatic merge, off by default, that completes the card when the acceptance is approved.

## 0.17.0

### Added

- Each story has its own branch and working folder, with a new Git tab in the settings.

## 0.16.0

### Added

- Heartbeat: the board calls the AI on its own at every interval when something is pending for it.

## 0.15.0

### Added

- Calling the AI from the conversation runs the project's tool in the background for a card.
- Images pasted into the conversation become card attachments.

## 0.14.0

### Added

- Pending-work queue with a "With you" filter, a sidebar counter, a notification and the MCP tool `get_pending_work`.
- The flow skill (`faz-ai-fluxo`) teaches the AI to take cards through the board.

## 0.13.0

### Added

- Each column has the instruction for the AI and the template of the document the phase produces.
- New Discovery and Acceptance columns in the default board.
- Phase documents stay attached to the story and appear as links in the sub-tasks.

## 0.12.0

### Added

- The card status shows whether the pending item is with you or with the AI.
- In columns that require approval, the AI only moves the card after you approve.
- Existing boards are brought to the new default, with confirmation and without moving cards.

### Changed

- The "Comments" tab is now called **Conversation**.

## 0.11.1 and earlier

See the repository's commit history.
