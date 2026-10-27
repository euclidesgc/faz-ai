[🇧🇷 Português](configuracoes.md) · 🇺🇸 English

# Board settings

This is the detailed manual of the **Configurações** (Settings) screen: what each section adjusts, how
the board connects to the AI agents (Claude Code, Cursor, Codex, Gemini and the others), each agent's
model catalog with the suggestion rules, and the fallback rules. The Harness and the
board's agents are in [Harness, agents and AI tools](harness_EN.md).

![Settings › Connect agents: the default agent, the list and the chosen agent's connection](images/settings_en.png)

## Sections of the screen

| Section               | What it adjusts                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workflows e colunas   | As many workflows as you want (independent cards or sub-tasks), with editable names and a position you change by dragging; **Nova coluna** (new column) on each one; names, order (drag) and meaning of the columns; where the AI works and which ones require approval; each column's phase (AI instruction and document template). Opening and closing workflows and columns happens on the board itself and is remembered                                                     |
| Tipos de card         | Story, Bug, Sub-task…, with color and default field values per type                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Campos personalizados | The fields you create (text, select, date, link…) and where they appear; select options that are technologies (Flutter, React, Python…) get their logo. The board fields (Fase, Tags, Modelo, Skills, Rules, MCPs and Esforço da atividade) stay out: the rules, the triage and the AI depend on them, so they can't be deleted or renamed, and a new field can't take their names. On the open card, the custom fields get their own section                                     |
| Regras do board       | Completion and phase-advance blocks, confirmations, short track for small stories (Baixo effort or Bug type skips PRD and Spec)                                                                                                                                                                                                                                                                                                                         |
| Conectar agentes      | The AI agents that run the cards (every enabled agent, at the same time, and the default one for cards with no model); each one's account (sign in and out); **Conectar** (connect) with the board and the mode (CLI, ACP or API); each agent's models; the quick test, the test session and the protocol log; copies and custom profiles; each agent's fallback rules                                                                                                               |
| Harness               | The board artifacts (rules, skills, agents and MCP servers), with typed imports, CRUD, assistants and the harness default agent; permissions, heartbeat and the rules that suggest each card's model (see [Harness](harness_EN.md#harness) and [Agents](harness_EN.md#agents))                                                                                                                                                                                                                                                               |
| Git                   | Mode, gitflow, branch names and prefixes, worktrees, automatic merge and decision records; editable in the editor and in the browser. "Tocar histórias em paralelo" (work on stories in parallel) lives in Harness › Ferramenta e execução                                                                                                                                                                                                                                      |
| Aparência             | **Idioma** (language: automatic, Português (Brasil) or English), theme, font and size, per board, in the editor and in the browser; statuses (name and color, in the Fluxos tab; here only in browser mode)                                                                                                                                                                                                                                                                             |
| Backup                | Export and import the board, in the Backup tab, in the editor and in the browser (in the editor, also through the command palette: `fazai.exportBoard`, `fazai.importBoard`)                                                                                                                                                                                                                                                                                                          |

## Connect agents

**Settings → Conectar agentes** (connect agents) brings together what used to live on two screens
(Ferramentas de IA and Modelos de IA). Every enabled agent runs cards, alongside the others: each card
goes to its model's agent (the card's, the harness agent's or the suggestion rule's; see
[Which CLI runs](#which-cli-runs)), with nothing to switch. The **default agent** runs the cards with no
model and carries the **Padrão** (default) badge in the list and on its panel, which opens already selected
when you enter the screen. On the left is the list of agents; on the right, the chosen agent, with
the **Conexão** (connection), **Modelos** (models) and **Testar** (test) tabs.
The fallback rules of the agent chosen in the list sit at the end of the screen. The model
suggestion rules apply to the whole board and live in **Harness › Ferramenta e execução** (tool and
execution).

### The list

The list joins the agents the board runs (the ones the extension ships and your profiles) with the
[official ACP registry](https://agentclientprotocol.com/registry), which provides each one's icon,
description and published version. The default agent comes first; then the connected ones, those with a
**closed context** before the ones not tested yet and these before those with an **open context**; then
the rest. Each row tells the mode and the state: connected, enabled, disabled, not installed, Connect in
progress, waiting for you or stopped with an error. With the card context known, the state gets a lock:
closed and green, or open and orange. Registry agents the board does not run yet stay
apart, under **Outros agentes do registro do ACP** (other agents from the ACP registry): you can sign in
and talk to them in the test session, but not use them for cards. The registry is downloaded once and
kept for 6 hours in the data folder; without a network, the list keeps the previous copy and says how old
it is. **Atualizar** (refresh) downloads the list again and checks once more
which agents are installed, each one's version and sign-in (use it after installing an agent, signing in
to it or updating it with the board open). **Agente personalizado (CLI)** (custom agent) opens the custom
profile form ([below](#custom-profile-advanced)).

### The account: signing in and out

The Connection tab starts with **Uso nos cards** (use in cards, see below) and goes on with the
installation, the account and the connection to the board. The **Conta** (account) section tells whether
the agent is signed in and which account it uses ("Claude Max · pe…@example.com"), when the tool reports
it; the email shows shortened, since the screen ends up in screenshots and recordings, and the full one is
in the hint on hover. The check is short and
leaves no process running: on the ready CLIs, the CLI's own status (`claude auth status`, `cursor-agent
status`); on agents over ACP, `initialize` and a new session with no request, which do not spend your
account. When you open an enabled, installed agent, the screen checks the account by itself, and the
**Atualizar** (refresh) button at the top checks again; when signed out (or not checked), the
**Verificar a conta** (check the account) button checks right away.

When signed out, the section shows the ways in that the tool offers:

- **Entrar no terminal** (sign in from the terminal): the board opens the tool's own sign-in in an
  editor terminal (the command shows on screen, like `claude auth login`) and waits for the terminal to
  close; when it exits without error, the board checks the account again by itself and, if Connect had
  stopped for lack of a sign-in, resumes it. In the browser, without the editor, the screen shows the
  command for you to run and check afterwards.
- **Entrar** (sign in): the agent signs in over the protocol (it may open the browser), and the board
  waits for you to finish.
- **Entrar com a chave** (sign in with the key): the API key goes to the tool and never comes back to the
  screen or to the log. For Gemini, it goes through Connect, which checks it and keeps it in this
  computer's vault.

**Sair da conta** (sign out) appears when the agent is signed in and the tool can sign out through the
board (the protocol's `logout`, or the CLI command on Claude Code and Cursor). It asks for confirmation,
because it applies to the whole machine: the terminal and the editor are signed out too until you sign in
again.

### Connect: from the tool to the board connection

The **Conexão com o board** (connection to the board) section takes the catalog profile through these
steps, showing the progress on screen. For a tool with more than one mode (Gemini: CLI, ACP and API),
the mode selector sits at the top of the section, with the **Recomendado** (recommended) badge and the
reason on the recommended mode, and **Como funciona o modo** (how the mode works) opens the mode's sheet:
what the board controls, the expected regime, the precision of what was used, the consumption, what the
tool brings on its own, how you sign in, the billing and when to choose it. **Recommended** is the mode
in which the board controls the most of what the agent accesses and measures what it spends; a tie is
broken by what the tool loads on its own (less is better). It is one profile per tool, with a
switchable mode: Connect in another mode (**Conectar no modo API**, connect in API mode) moves the
profile to that mode when the sign-in works, with the same id, the same policies, the same model
catalog and the same key.

1. **Find the tool**: the command on the terminal's PATH and its version; without it, the install link.
   In API mode there is nothing to find: the extension talks to the API itself.
2. **Sign in**: for Gemini, the **API key** field (a password field). The key is kept in this
   computer's vault, the same for every folder and for the three modes; it never comes back to the
   screen and never goes into the log, the run records or the board export. In **ACP** it goes, on
   each process, to the agent's sign-in over the protocol, and Gemini CLI accepts it without asking the
   API: it is really checked on the first run, and a wrong key shows up there, with Gemini's message.
   In **API** and **CLI** it is **checked right away**: the board reads the account's model list with it
   (this does not spend the account), and the screen says "API key checked". In all three, the new key
   only replaces the stored one after it is accepted; if refused, the previous one stays. The profile is
   only turned on (and only changes mode) after this step. On the ready CLIs, the sign-in probe; without
   a sign-in, the step stops with the command, and **Entrar no terminal** leads to the sign-in the board
   follows.
3. **Check the capabilities**: the verifier's probes record the profile's proofs, and the regime comes
   from them, with no question asked: the five capabilities proven give the exclusive regime;
   permissions, MCP and delegation proven, the compatible one. An ACP agent is always compatible (the
   context files it reads by itself have no proof over the protocol). API mode is exclusive by
   construction, with no probe. Over ACP, the MCP proof is the agent connecting to the test server the
   board hands in the session. Each agent starts its servers at a different moment: when the session
   opens (Gemini, OpenCode), right after (Codex) or only on the first request (Antigravity). So the probe
   waits up to 10 seconds and, with no connection, sends a minimal request ("Responda só OK.") and waits
   again; that request uses one turn from the account, and only for the agents that need it.
4. **Ciência do contexto aberto** (open context acknowledgment, compatible regime only): the warning
   says what the tool loads on its own and what that costs, and the **Usar assim mesmo** (use it anyway)
   button records your acknowledgment for that profile. The regime applies per profile: Gemini can run
   in the compatible regime while Claude Code stays exclusive.
5. **Read the models**: the models the tool announces go into the catalog, in every model field (in
   API, the account's models that answer `generateContent`).

At the end, a single line: **Pronto para rodar cards** (ready to run cards), with the date the board
checked. **Ver detalhes** (see details) opens the steps, the technical summary (the version, the sign-in,
the regime, how many models) and the mode sheet, with **Parar de usar com o contexto aberto** (stop using with the open context);
**Trocar a chave** (change the key) stays in view. Without your acknowledgment, the line says it is
missing and the details open already. An error stays attached to the step where it happened, with **Tentar de novo** (try again),
which resumes from that step (the acknowledgment and the models do not redo the sign-in or the probes);
if the agent refuses the key at sign-in, the field comes back with what you pasted. **Reconectar**
(reconnect), low-key because it is rare, redoes the sign-in, the check and the model reading: use it if
something stopped working. The acknowledgment belongs to each
profile and can go away: **Parar de usar com o contexto aberto** removes it (the profile stops running in the compatible
regime until you acknowledge again); reconnecting a profile that now proves the exclusive regime removes
it by itself; and **importing a board does not bring the profiles' acknowledgments**. An execution policy
does not swap the profile for another one with a different regime (`constraints-changed`).

At the top of the tab, **Uso nos cards** (use in cards): **Ligado** (enabled) tells whether the board
uses the agent; when enabled, it runs the cards with one of its models, alongside the other agents, and
the cards' Model field and the chat offer its models. **Tornar padrão** (make default) makes it run the
cards with no model. The default agent cannot be disabled (the switch's hint says so): make another one
the default first. The capability check has no separate command: it
runs in Connect and Reconnect, by itself when you enable an ACP agent and, on the verifiable profiles
that do not go through Connect (the Claude Code copy and a custom ACP profile from an earlier version),
through the **Verificar capacidades** (check capabilities) button at the end of the profile's Conexão tab. None of the
probes spends your account. When a proof loses its validity (the CLI, the environment or the extension
changed), the requirements banner says where to redo it: **Abrir Conectar agentes** (open Connect
agents) on the catalog profile, **Abrir o perfil** (open the profile) on the copy.

### Card context: closed or open

A card costs less and comes out more precise when the AI uses only what the board provides (the story,
the phase, the chosen rules, skills and MCP servers). The **Contexto do card** (card context) section, in
the Connection tab, says whether that holds for the agent:

- **Contexto fechado** (closed context, with a lock, also in the agent list): running through the board,
  nothing the tool reads on its own reached the model.
- **Contexto aberto** (open context): some file loads on its own in every card, and the line says which.
  That costs more and may bring instructions that are not in the card.
- **Not verified**: the test hasn't run yet, or no location had proof.

In **API mode** (Gemini through the API) the context is **closed by construction**: the board itself
builds each request to the model and no program reads files on its own. The section says so directly,
with no test and no spending from the account.

The board finds this out at run time, with no list of locations stored in the extension, so it also
works for an agent that shows up later:

1. **Discovery.** The board asks the agent itself where its tool loads instructions, rules, memory,
   skills, agents, hooks, settings and MCP servers from, in the project and in the user's folder. The
   request brings an example from a fictional tool, so the agent doesn't copy real names.
2. **Verification.** The board runs the agent **the way it runs a card** (the same barriers, no tools and
   no MCP) and asks it to copy the lines in its context that start with passages picked at random from
   those files. Quoting the rest of the line proves the file reached the model; nobody gets that right
   by chance. The project's instruction files the agent didn't mention are checked too.
3. **Control.** One line goes in the request itself: if the agent doesn't quote it, no "stays out"
   counts. If it uses tools during the test, nothing counts as proof, since it may have opened the file
   on purpose.

What the agent declares shows as **Padrão da ferramenta** (tool default: "always loads", "loads when
relevant"): how the tool behaves running on its own. Each location's verdict comes only from the test. A
file the tool "always loads" that, through the board, **stays out** only enters a card when you include
it (as a card or phase rule, for example).

- **Locations that don't exist in the project yet** (an `AGENTS.md` you haven't created) are tested with
  a decoy in a throwaway folder: you learn before creating the file whether it would enter every card.
- **Files in your home folder are only read**: the board never writes to them. A declared location that
  doesn't exist there stays untested.
- **Settings, hooks and MCP servers** don't enter the context as text, so quoting doesn't check them;
  Connect's capability verifier covers them.
- **Acrescentar um local** (add a location) adds a path the agent didn't declare to the test. It stays on
  this machine only, and a new discovery doesn't erase it.

For each location that **loads on its own**, the section says what to do, by the file's origin, and what
it costs (about four characters per token; for skills and agents, only the description, which is what
always enters):

- **Old Faz AI copy** (`skills/faz-ai-*` in the tool's folder): earlier board versions installed the flow
  skill there; the flow now comes from the board, and the folder can be deleted.
- **Tool plugin** (`plugins/<name>/…`): if you don't use the plugin, uninstall it. **Como desinstalar?**
  (how to uninstall) asks the agent itself for the command (one request from the account) and shows it as
  the agent's suggestion, for you to check; the board never runs the command.
- **Skill or instructions from your home folder**: they apply to every project. Import the skill into the
  board and remove it from the folder, or move to the project whatever is only for it.
- **Project file**: **Importar como regra** (import as rule) moves the whole content to a board rule (which
  only enters the cards that ask for it) and leaves a reference sentence in the file, for whoever uses the
  tool outside the board. The preview shows the rule name and how the file ends up; nothing is written
  before the confirmation, and the board never overwrites a rule with the same name.
- **Repeated files**: the section says how much of one file repeats in the other. When every line of one
  is in the other, **Juntar** (merge) replaces the repeated one with a reference (in CLAUDE.md,
  `@AGENTS.md`, Claude Code's import; in the others, a sentence pointing to the file). With lines to lose,
  the section only suggests merging by hand.

**Abrir pasta** (open folder) opens the location in the system, without changing anything. **Manter
assim** (keep it) accepts that the location enters every card: the suggestion goes away, the cost leaves
the summary and the summary says the context is open by your choice; **Desfazer** (undo) brings the
suggestion back. The actions only apply to the project files the last test showed leaking (they stay in
git and can be undone); the home folder and plugins only get the suggestion. After importing or merging,
the test runs again.

The test runs on its own after each Connect on a version not tested yet and, whenever you want, through
**Testar agora** (test now) or **Testar de novo** (test again). It uses a few requests from the agent's
account (the discovery and one or two quoting rounds). The result stays in the board's database, outside
the export, and the screen warns when the agent changed versions since the last test. The test only
informs: card admission is still decided by each profile's regime.

### Each agent's models

The **Modelos** (models) tab shows the agent's catalog: the models the cards' Model field, the chat and
the suggestion rules offer for it, with each one's effort levels. Each model has a name, an identifier in
the tool, accepted efforts and a default effort; **Novo modelo** (new model) registers one by hand and the
trash icon removes it from the catalog, without confirmation.

**Detectar modelos** (detect models) reads the tool's list: for Cursor, the models of your account,
through the `cursor-agent models` command, read when the board opens with the CLI signed in, and the
first list read replaces the built-in one only once. Claude Code has no command that lists the models: on
Connect and on **Detectar modelos**, the board reads the [models page of the official
documentation](https://code.claude.com/docs/en/model-config) (in Markdown) and takes from it, for each alias it
runs (`fable`, `opus`, `sonnet`, `haiku`), the model name on the Anthropic API, the effort levels, the default
effort and the minimum Claude Code version. The tab says "list read from the documentation" with the date, and a
model that needs a newer CLI than the installed one warns, with `claude update`: on an older CLI, the alias runs
the previous model. Without network, the list built into the extension applies. On
an agent over ACP, the button opens a session with the agent (`initialize` and `session/new`, with no
prompt, so it does not spend your account) and reads the models it announces: the model selector among
the session config options, in the protocol's current schema, or the `models` block of the earlier
form, which Gemini CLI still uses. The agent's current model comes first. An agent that announces no
models leaves the catalog as it is, with a warning; then **Novo modelo** (new model) or **Outro
modelo…** (other model) in the card apply. When running, the card's model goes through the session
selector (`session/set_config_option`) when the agent exposes it, and through the command line
(`--model`) where the agent accepts it; an agent that takes neither keeps its own model, and the run log
says which.

Each model read from the tool (by **Detectar modelos** or by **Conectar**) keeps the date it was read,
and the tab says "lista lida da ferramenta em …" (list read from the tool on …) with the most recent
one. Without that line, the list is the built-in one or the one you built by hand. An old list (the
account changed plan, the tool dropped a model) is fixed by detecting again or reconnecting.

For Cursor, the list has one line per level of each model (`claude-opus-5-5-low`, `-medium`,
`-high`…); the board groups the variants into one model with its levels. The fast versions (`-fast`,
they answer sooner and charge more for the same tokens) stay out until you turn on **Incluir os modos
rápidos** (include fast modes) on Cursor's Models tab: then each one enters as a separate model
("Claude Opus 5.5 1M Fast"), only for the models in the catalog; turning it off removes them from the
catalog. Through MCP, it is the `includeFastModels` rule of `update_rules`. On Cursor's free plan only
**Auto** runs: the other models are refused before starting (the blocked card explains how to pick
Auto), which is why Cursor's suggestion rules all start at Auto.

### Test: the quick test, the test session and the protocol log

The **Testar** (test) tab has three parts:

- **Teste rápido pelo caminho dos cards** (quick test through the cards path): a short request through
  the same path as the runs (the profile's CLI, ACP or API), after a confirmation, because it uses your
  subscription. An OK answer does not prove isolation, permissions or MCP.
- **Sessão de teste pelo ACP** (test session over ACP): opens the agent through the official ACP SDK
  and talks to it in real time: the text, the reasoning, the tools, the plan and the permission
  requests, which you answer there. The top shows what the agent declared (protocol version, the
  agent's name and version, the session, the account and the capabilities) and the **session options**
  it announces (model, mode, effort, fast mode), which apply to the test only: a card's model comes from
  its Model field. The session uses the same command as the cards when the board knows the agent over
  ACP; Claude Code, which runs the cards through the CLI, tests through the `claude-agent-acp` adapter.
  One session per screen: opening another closes the previous one. It closes by itself after 10 idle
  minutes (never in the middle of an answer), with **Encerrar sessão** (end session) or when the
  screen closes, and the conversation says when it closed. If the agent asks for a sign-in, sign in on
  the Connection tab and click **Abrir de novo** (open again).
- **Log do protocolo ACP** (ACP protocol log): every JSON-RPC message of the account checks, the
  sign-ins and the test session, in both directions, with each request's time, the slowest request,
  the lines the agent writes outside the protocol (`stderr`) and the start and exit of each process.
  The day's file (`acp-YYYY-MM-DD.jsonl`, in the board's trace folder) keeps everything, with the full
  JSON; **Abrir arquivo** (open file) opens it in the editor; files older than seven days are deleted along with the trace files.
  **Ocultar session/update** (hide session/update) only filters the list, not what is recorded. Keys and access tokens never go in; the
  consumption counters (`inputTokens`, `totalTokens`) do.

### CLI profiles, copies and custom profiles

Each board agent is a **CLI profile**: a tool the board can choose to run. The ready profiles are Claude
Code, Cursor and Kimi Code, through the one-shot CLI, and the catalog's ACP agents (Gemini CLI, Codex,
OpenCode, GitHub Copilot CLI, Qwen Code, goose and Google Antigravity), which come disabled. A **copy**
uses the source tool's model catalog and consumption measurement, but keeps its own command,
credentials and verification. A **custom** profile accepts another CLI with text output; tokens and cost
stay unknown. Imports stay disabled until reviewed locally. Saved configuration and credentials never
come back to the screen or into the board export.

The profile actions sit at the end of the **Conexão** tab: **Duplicar** (duplicate) on all of them and,
on copies and custom profiles, **Editar** (edit), **Apagar** (delete; the profile in use cannot be
deleted), **Verificar capacidades** (check capabilities) and the compatible regime acknowledgment. Each
profile's verified capabilities and isolation show in **Verificar ambiente** (check environment). Commands, arguments, environment and credentials stay in the local vault: export, screen and
MCP show only references and state. Copies do not inherit isolation proofs, and a custom profile
without a verified translation does not run.

### Which CLI runs

The value of the **Modelo** (Model) field (`<profile>:<model>@<effort>`) already names the CLI
profile. For each run the board uses the first level that is filled in: the **card's Model**, the
**agent's model**, the **model rule** (even with "Preencher o modelo sugerido automaticamente",
fill in the suggested model automatically, off) and, with none, the **default agent** in
Configurações → Conectar agentes. So sub-tasks of the same story can run on different CLIs, and
effort-based rules can point to different profiles. Cards on different agents run at the same time,
within the Harness parallel run limits, without switching the default.

The first level that is filled in is final: if the choice is invalid (profile off, model outside the
catalog or unknown effort), the card is **blocked** with the reason, without falling to the next
level or to the default. The Model field, the chat and the rule editor list the models of **all
enabled profiles**, grouped by profile. Expired login and missing CLI apply per profile: they stop
only the cards of that profile, and the warning appears only for the profiles in use. The same goes for
a profile the board does not run (the custom CLI one, or a permission the tool does not accept):
**Trabalhar na fase** (work on the phase) turns off only on its cards, the heartbeat and the autopilot
skip only those cards, and the board only stops when no enabled profile runs. **Sugerir
regras** (suggest rules) acts only on the suggested profile and preserves other profiles' bands.
Over MCP, `get_card` shows the target in `model` (`tool`, `from` and, if invalid, `blocked`).

### Ready ACP agent

The ACP catalog agents that do not coincide with a ready CLI come as ready profiles of the
**Agente ACP** (ACP agent) type: Gemini CLI, Codex, OpenCode, GitHub Copilot CLI, Qwen Code, goose
and Google Antigravity. They appear disabled in the list; enable the ones you use, preferably through
**Conectar**. Like the other ready profiles they have no Edit or Delete: **Duplicar** (duplicate)
creates a custom profile with the same agent, to change the environment or the name. The profile id
(`gemini`, `codex-acp`…) is the model catalog's tool. The status tells whether the agent's command is on
the PATH and its version, with the install link. Cursor and Kimi Code stay on the ready one-shot CLIs,
which measure tokens; Claude Code keeps running through the `claude` CLI.

### Custom profile (Advanced)

The custom profile is the advanced path, for a command line the catalog does not include: the catalog
agents come in through **Conectar**. The form opens from the **Agente personalizado (CLI)** (custom
agent) button, below the list. A new custom profile is **CLI only**: the board refuses to turn a custom
CLI into an ACP agent. Custom ACP profiles created in an earlier version (and a copy of a ready ACP
agent) **keep running as they are**: their Conexão tab shows a notice, with **Abrir o agente do catálogo**
(open the catalog agent) and **Verificar capacidades** (check capabilities); editing shows the same
notice and keeps the saved agent.

To create a custom profile, enter the command and one argument per line. The markers `{prompt}`,
`{model}`, `{effort}`, `{mcpConfig}` and `{addDir}` insert, respectively, the request, the model,
the effort, the MCP file and an additional folder when they are available. Choose **Entrada do
pedido** (prompt input: argument or stdin) and **Servidor do board** (board server: CLI, project
file or none). In a card's **Modelo** (model) field, every enabled custom profile (own CLI or ACP
agent) forms a group, even with no model registered, and that group's **Outro modelo…** (other model)
item accepts a free-form identifier for the profile without adding it to the catalog. The **quick test**
runs a short request and uses your subscription; an OK response does not prove isolation, permissions or
MCP restrictions. Capabilities without evidence remain unknown and may prevent a run.

### Capabilities and evidence

Under **Capacidades e evidências** (Capabilities and evidence), each profile shows the date and
version of the documentation checked and a badge: **Contexto vazio** (empty context: only with
capabilities verified by the host), **Carrega por conta própria** (loads on its own: there are
known items, listed in the tooltip) or **Sem prova de isolamento** (no proof of isolation: an empty
list is not proof). In copies and custom profiles, the **O que a CLI carrega por conta própria**
(what the CLI loads on its own) section of the form lets you mark, by type (rules, skills, agents,
hooks, MCP) and origin (project, user), what the CLI reads by itself; it is a declaration, not a
verification. Each run's summary, the card (**Próxima execução**, next run) and
`get_card`/`get_harness` (`execution.cliLoads`) use that same decision. The real-CLI test lives
outside `npm test`: `npm run test:cli-real` (Claude Code validated in a controlled local
environment; Cursor and Kimi Code **not validated**).

## Model suggestion for each card

In **Harness › Ferramenta e execução** (tool and execution), the **suggestion rules** combine conditions with AND and OR, for
example `Esforço da atividade = Alto E Tags = backend`, and suggest the agent, the model and the effort.
The result is always a suggestion: on the card, the model and the effort can be changed at any time. The
rule editor has only name, conditions and suggested model. **Preencher o modelo sugerido
automaticamente** (fill in the suggested model automatically), right above the rules, fills in the Model
field when a card is created or changes, if it is empty or holds the previous suggestion; a model chosen
by hand is never replaced.

## Fallback rules

When a model runs out of usage quota, the board continues the card on another model, from any
enabled agent. Without a rule, the card waits for the quota to renew. The signal comes from each
tool's output reader: Claude Code's `rate_limit_event` and limit `result`, Gemini's 429, Kimi Code's
quota 403 and Cursor's `ActionRequiredError: You've hit your usage limit` refusal (on the Free plan,
the agent quota is separate from the dashboard's usage bar: it can run out with the bar at half).
The **fallback rules** live
under **Configurações → Conectar agentes** (Settings → Connect agents), below the chosen agent, and
belong to the agent chosen in the list: each rule starts from one of its
models that fails, and the section shows only its rules (old rules without an agent show up on every
agent). They sit in a list: the order is the priority (the first matching rule wins), and each row
shows **when** ("Claude Code · CLI · Opus 5.5 runs out of quota"), what the board **uses instead**
("Gemini · API · Pro, then Cursor · CLI · Auto") and **how** (switches by itself or asks first), with
the switch to enable and disable, move up, move down, edit and remove.

**Montar nova regra** (build new rule) opens the editor on the same screen, in three steps:

1. **When this model runs out of quota**: the model that fails, among the models of the agent on the
   screen. One source per rule; for another model, build another rule. A new rule starts with no model.
2. **Use instead, in this order**: the list of models that replace the failed one, from any agent on
   the board, including other models of the same agent. Each row offers every model except the one
   that fails and those already chosen on other rows, and changing the model that fails resets the
   list to one empty row. If the first one fails too, the board tries the next. Without the model that
   fails, with an empty row, or with a target equal to the model that fails, the rule does not save:
   the button is off with the reason, and the host refuses the same save. A target on a turned-off
   agent shows a warning in the list and in the editor: the rule saves, but the switch only happens
   after you turn the agent on in Connect agents.
3. **How to switch**: **Switches by itself** (the card continues on the next model without asking) or
   **Asks first** (the card stays with you, with the options in the conversation).

The name comes from the rule itself ("Opus 5.5 → Gemini · API · Pro") until you write one, and the
sentence at the bottom of the editor says exactly what the rule does. **Salvar regra** (save rule)
saves and takes effect right away: saving from the screen is the human review (the AI never saves or
enables a rule). If another window changed the same rule while you were editing, the editor warns and
offers **Recarregar e salvar de novo** (reload and save again), keeping your draft.

**Avançado** (advanced), closed by default, holds what the simple path does not need: the failure
types (today the run only reports an exhausted quota; the other types wait until it reports them),
the actions **Bloqueia o card** (blocks the card) and **Espera e tenta de novo** (waits and tries
again), how to treat a model hand-picked on the card (by default the rule also switches when the
source is exactly that model), the situation conditions (run action, harness agent, phase, card type,
who called; empty means all), the limits (attempts, deadline, backoff and process caps), **Simulate**
the draft, **Suggest fallbacks** and **Review conflicts** with the AI, and the rule's **earlier
versions** (use one as a draft).

The profiles the rules know are the board's profiles (the extension's, the copies and the custom
ones), with the mode in the name ("Gemini · API", "Claude Code · CLI"), and each one's models are
those in the board catalog. The mode is not part of the rule: switching Gemini's mode in **Conectar**
(connect) keeps its rules.

The Gemini quota is **per model** (Pro can run out while Flash still has quota), but the usage-limit
pause is **per profile**: without a rule, the whole Gemini profile waits for the renewal. To continue
with another model when one runs out, build the rule Pro → Flash: the switch happens right away, and
the profile is not paused.

The runner, the chat and the assistants ("Sugerir agentes, regras ou skills", suggest agents, rules
or skills; "Indicar artefatos", suggest artifacts) decide the switch through this same evaluator:
with an enabled, applicable rule the run continues on its target; without a rule, the failure blocks
and nothing runs on another target. At the end of the section, **Testar as regras** (test the rules)
simulates the next run with the chosen rule (of the agent on the screen), without spending tokens or
opening the CLI, and says **Passou** (passed) when that rule decided, the way it was configured, or
**Não passou** (failed) with the reason (an earlier rule in the list decided, the rule does not apply
to the scenario, or it applied but the board could not proceed). Without a rule for the agent, the test and **Revisar conflitos** do not appear:
the block only offers **Criar com ajuda de IA**. **Revisar conflitos** (review
conflicts) looks at the rules of the agent on the screen: rules of different agents start from
different models and never tie on the same failure, but a cycle that goes through another agent (Opus →
Gemini Pro in one rule, Gemini Pro → Opus in another) shows up. Enabling the rule that closes a cycle
does not save, and the error names the other rule and its agent. **Criar com ajuda de IA** (create with AI help) asks the AI only for a proposal (a draft with
explanation, differences and simulated examples, without secrets): it goes through the editor's
validator and nothing is saved until you open the proposal in the editor and save. The AI also reads
the rules over MCP (`get_execution_policies`, read-only).

Underneath, each rule is still a versioned execution policy (schema 41): every save creates a
version, earlier versions are kept, and the host refuses two enabled rules tied on priority or a
target outside the catalog.

### The old fallback model

The old **fallback model** on suggestion rules no longer switches anything at run time: fallback is
decided only by the fallback rules. When the board opens, when rules are saved or after a backup is
imported, each legacy fallback becomes a **disabled rule pending review** (id `legacy-<rule>`, action
_asks first_, failure _quota_, target = the fallback model), with history at version 1. The rule does
not copy the suggestion rule's conditions (card fields and type): adjust them under Advanced. The
conversion happens once; if you remove the rule, it does not come back.

In the list, the pending rule shows **Precisa da sua revisão** (needs your review) with the switch
locked; **Revisar e ligar** (review and enable) opens the editor, and saving records it as reviewed.
At the end of the section, a notice lists the proposals and the fallbacks that could not be converted
(model or effort outside the catalog). The suggestion rule editor no longer has a fallback field. The
MCP `set_model_rules` has no `fallback` parameter (the key is ignored in a call) and `get_models`
returns no fallback. On export, CLI profile credentials and variables are not in the file; on import,
the profiles come back disabled and the rules pending, and the notice lists both.

## Dependencies between options and cross-links

Several Settings options only take effect because of another. The board shows a discreet line under
the dependent options (for example, "Depende de **uma regra de sugestão de modelo** (agora:
nenhuma)", depends on a model suggestion rule (now: none), below "Preencher o modelo sugerido
automaticamente"); the option stays disabled when the dependency
is not met. The links let you navigate: click one to go to the matching board section, which
scrolls and highlights for 2 seconds, or click a link in the Settings to open the board at the
right section. In browser mode, the links to the Settings appear as text only.

**"Preencher o modelo sugerido automaticamente"** (fill in the suggested model automatically) lives
in Harness › Ferramenta e execução, next to the suggestion rules, not in Regras do board. The
Heartbeat interval field stays disabled when the heartbeat is off, with no additional dependency
component.

## Updating the default board

When a new version of the extension changes the default board, the board asks whether you want to
update it (or use **Faz AI: Atualizar board para o padrão atual**, update the board to the current
default). The update only adds what is missing: no card leaves its place and what you customized is
kept. A copy of the database is saved first.
