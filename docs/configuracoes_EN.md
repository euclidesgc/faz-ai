[🇧🇷 Português](configuracoes.md) · 🇺🇸 English

# Board settings

This is the detailed manual of the **Configurações** (Settings) screen: what each section adjusts,
how CLI profiles work, the model catalog with its suggestion rules and the execution and fallback
policies. The Harness, the agents and the AI tool connection are in
[Harness, agents and AI tools](harness_EN.md).

![Settings: model catalog and suggestion rules](images/settings_en.png)

## Sections of the screen

| Section               | What it adjusts                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workflows e colunas   | As many workflows as you want (independent cards or sub-tasks), with editable names and a position you change by dragging; **Nova coluna** (new column) on each one; names, order (drag) and meaning of the columns; where the AI works and which ones require approval; each column's phase (AI instruction and document template). Opening and closing workflows and columns happens on the board itself and is remembered                                                     |
| Tipos de card         | Story, Bug, Sub-task…, with color and default field values per type                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Campos personalizados | The fields you create (text, select, date, link…) and where they appear; select options that are technologies (Flutter, React, Python…) get their logo. The board fields (Fase, Tags, Modelo, Skills, Rules, MCPs and Esforço da atividade) stay out: the rules, the triage and the AI depend on them, so they can't be deleted or renamed, and a new field can't take their names. On the open card, the custom fields get their own section                                     |
| Regras do board       | Completion and phase-advance blocks, confirmations, filling in the suggested model, short track for small stories (Baixo effort or Bug type skips PRD and Spec)                                                                                                                                                                                                                                                                                                                         |
| Harness               | A single library of rules, skills, subagents and MCPs, with typed imports, CRUD and assistants; tool, permissions, default agent and heartbeat (see [Harness](harness_EN.md#harness) and [Agents](harness_EN.md#agents))                                                                                                                                                                                                                                                               |
| Ferramentas de IA     | **Connect a tool** (choose the tool and the mode and connect); CLI profiles: enable, set a default, duplicate, create and test                                                                                                                                                                                                                                                                                                                                                         |
| Modelos de IA         | Models and effort levels by profile; rules that suggest each card's model                                                                                                                                                                                                                                                                                                                                                                                                              |
| Git                   | Mode, gitflow, branch names and prefixes, worktrees, automatic merge and decision records; editable in the editor and in the browser. "Tocar histórias em paralelo" (work on stories in parallel) lives in Harness de IA › Ferramenta e execução                                                                                                                                                                                                                                      |
| Aparência             | **Idioma** (language: automatic, Português (Brasil) or English), theme, font and size, per board, in the editor and in the browser; statuses (name and color, in the Fluxos tab; here only in browser mode)                                                                                                                                                                                                                                                                             |
| Backup                | Export and import the board, in the Backup tab, in the editor and in the browser (in the editor, also through the command palette: `fazai.exportBoard`, `fazai.importBoard`)                                                                                                                                                                                                                                                                                                          |

## AI tools: Connect a tool

At the top of **Settings → AI tools**, **Connect a tool** shows the fixed list of tools the extension
ships (Gemini first, each with its billing note). Once you pick a tool, each mode the extension
offers for it (CLI, ACP or API; never one that doesn't work) becomes a card with the same sheet, so
you can compare line by line: what the board controls, the expected regime, the accuracy of what was
used, usage, what the tool brings on its own, how you sign in, billing, and when to choose it. Modes
not offered yet appear by name only, without a card.

**Recommended** is the mode in which the board controls the most of what the agent accesses and
measures what it spends; a tie is broken by what the tool loads on its own (less is better). The
badge only appears when the recommended mode is offered, with the reason in one sentence. For
Gemini, the recommendation is the **API**, and the badge is on its card; the **ACP** card stays next to
it. Claude Code shows the CLI with the badge and why it is the only one (its ACP
requires API billing, outside the subscription).

A card's **Connect** button takes the tool's catalog profile, in that mode, through these steps, with
the progress on screen. There is one profile per tool, with a switchable mode: for Gemini, the **ACP**
and **API** cards connect the same profile (same id, same policies, same model catalog and same key),
and it switches to the card's mode once the sign-in succeeds; the card of the mode the profile runs in
shows **Mode in use**.

1. **Find the tool**: the command on the terminal's PATH and its version; without it, the **Install**
   link. In API mode there is nothing to find: the extension itself talks to the API.
2. **Sign in**: for Gemini, the **API key** field (a password field). The key is stored in this
   computer's vault, the same in every folder and in both modes; it never comes back to the screen and
   never goes to the log, the run records or the board export. Over **ACP** it goes, for each process,
   to the agent's sign-in through the protocol, and Gemini CLI accepts it without calling the API: it is
   actually checked on the first run, and a wrong key shows up there, with Gemini's message. Over the
   **API** it is **checked right away**: the board reads the account's model list with it (it does not
   spend the account), and the screen says "API key checked". In both, a new key only replaces the
   stored one after it is accepted; if refused, the previous one stays. The profile is only turned on
   (and only switches mode) after this step. For the ready CLIs, the sign-in probe, with the terminal
   command when missing.
3. **Check the capabilities**: the verifier's probes record the profile's evidence, and the regime
   follows from it, without asking: all five capabilities proven give the exclusive regime;
   permissions, MCP and delegation proven, the compatible one. An ACP agent is always compatible (the
   context files it reads on its own have no proof through the protocol). API mode is exclusive by
   construction, with no probe: the board asserts the proof on the first run, for the card's model; the
   ACP acknowledgment, if any, is removed.
4. **Regime acknowledgment** (compatible only): a separate button, **I understand what the tool
   loads**, records your acknowledgment for that profile. The regime is per profile: Gemini can run
   in the compatible regime while Claude Code stays exclusive.
5. **Read the models**: the models the tool announces join the catalog, in every model field (over the
   API, the account's models that answer `generateContent`).

At the end, **Connected** with the version, the sign-in, the regime, how many models and the date, plus
the **Change the key** and **Revoke acknowledgment** actions. An error stays on the step where it
happened, with **Try again**, which resumes from that step (the acknowledgment and the models do not
redo the sign-in or the probes); if the agent refuses the key at sign-in, the field comes back with
what you pasted. Each catalog profile, in the list below, shows its connection state (including when
Connect is waiting for you) and **Reconnect**.

The acknowledgment is per profile and can go away: **Revoke acknowledgment** removes it (the profile
stops running in the compatible regime until you acknowledge it again); reconnecting a profile that now
proves the exclusive regime removes it on its own; and **importing a board does not bring the profiles'
acknowledgments**: whoever imports gives their own, on the machine where the profile runs. Profiles that
do not go through Connect (copies and custom profiles) give and revoke the acknowledgment in the list,
with **Acknowledge the compatible regime** and the same text as Connect. An execution policy does not
switch to a profile with a different regime (`constraints-changed`). The
requirements banner keeps checking the tool and the sign-in: for Gemini over ACP, without the key in
the vault the sign-in stays "not verified" (you may have your own `GEMINI_API_KEY`); over the API,
without the key in the vault the sign-in is missing (there is no other), and the sign-in warning leads
to Connect.

The **Admission regime** option left Harness › Tool and execution. If you turned on the compatible
regime for the whole board in an earlier version, it stays on (with a notice and a **Back to
exclusive** button); profiles acknowledged in Connect stay compatible.

## AI tools: CLI profiles

A **CLI profile** is a tool the board can choose to run. The built-in profiles are Claude Code,
Cursor and Kimi Code. A **copy** uses the model catalog and usage measurement of its source tool,
but keeps its own command, credentials and verification. A **custom** profile accepts another CLI
with text output; tokens and cost remain unknown. In **Configurações → Ferramentas de IA**
(Settings → AI tools), enable a reviewed profile and choose the default; only this screen creates,
edits, duplicates and tests profiles. Imports stay disabled until local review. Saved configuration
and credentials are not returned to the screen and are not included in the board export.

Commands, arguments, environment and credentials remain in the local vault: exports, the screen and
MCP show only references and status. Copies do not inherit isolation evidence, and a custom profile
without a verified mapping does not run. Version/login probes and the **Testar** (Test) button do
not prove capabilities.

### Which CLI runs

The value of the **Modelo** (Model) field (`<profile>:<model>@<effort>`) already names the CLI
profile. For each run the board uses the first level that is filled in: the **card's Model**, the
**agent's model**, the **model rule** (even with "Preencher o modelo sugerido automaticamente",
fill in the suggested model automatically, off) and, with none, the **default CLI profile** in
Configurações → Ferramentas de IA. So sub-tasks of the same story can run on different CLIs, and
effort-based rules can point to different profiles.

The first level that is filled in is final: if the choice is invalid (profile off, model outside the
catalog or unknown effort), the card is **blocked** with the reason, without falling to the next
level or to the default. The Model field, the chat and the rule editor list the models of **all
enabled profiles**, grouped by profile. Expired login and missing CLI apply per profile: they stop
only the cards of that profile, and the warning appears only for the profiles in use. **Sugerir
regras** (suggest rules) acts only on the suggested profile and preserves other profiles' bands.
Over MCP, `get_card` shows the target in `model` (`tool`, `from` and, if invalid, `blocked`).

### Ready ACP agent

The ACP catalog agents that do not coincide with a ready CLI come as ready profiles of the
**Agente ACP** (ACP agent) type: Gemini CLI, Codex, OpenCode, GitHub Copilot CLI, Qwen Code, goose
and Google Antigravity. They appear switched off in **Ferramentas de IA** (AI tools); turn on the
ones you use. Like the other ready profiles they have no Edit or Delete: **Duplicar** (duplicate)
creates a custom profile with the same agent, to change the environment or the name. The profile id
(`gemini`, `codex-acp`…) is the model catalog's tool, and **Detectar modelos** (detect models) reads
the agent's models into it. **Verificar situação** (check status) checks whether the agent's command
is on the PATH and its version; the login stays "not verified" (for Gemini, "connected" with the key
in the vault, through [Connect](#ai-tools-connect-a-tool)), and the **Instalar** (install) link opens the agent's official ACP mode page. Cursor and Kimi Code stay on
the ready one-shot CLIs, which measure tokens; Claude Code keeps running through the `claude` CLI.

### Custom profile

To create a custom profile, enter the command and one argument per line. The markers `{prompt}`,
`{model}`, `{effort}`, `{mcpConfig}` and `{addDir}` insert, respectively, the request, the model,
the effort, the MCP file and an additional folder when they are available. Choose **Entrada do
pedido** (prompt input: argument or stdin) and **Servidor do board** (board server: CLI, project
file or none). In a card's **Modelo** (model) field, every enabled custom profile (own CLI or ACP
agent) forms a group, even with no model registered, and that group's **Outro modelo…** (other model)
item accepts a free-form identifier for the profile without adding it to the catalog. **Testar** (Test) runs a short request
and uses your subscription; an OK response does not prove isolation, permissions or MCP
restrictions. Capabilities without evidence remain unknown and may prevent a run.

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

## AI models and suggestion rules

**Detectar modelos** (detect models) reads the tool's list: for Cursor, the models of your account,
through the `cursor-agent models` command, read when the board opens with the CLI signed in, and the
first list read replaces the built-in one only once; for Claude Code, a built-in list you can edit.
In a profile with **Agente ACP** (ACP agent), the button opens a session with the agent (`initialize`
and `session/new`, with no prompt, so it does not spend your account) and reads the models it
announces: the model selector among the session config options, in the protocol's current schema, or
the `models` block of the earlier form, which Gemini CLI still uses. The agent's current model comes
first. An agent that announces no models leaves the catalog as it is, with a warning; then **Novo
modelo** (new model) or **Outro modelo…** (other model) in the card apply. When running, the card's
model goes through the session selector (`session/set_config_option`) when the agent exposes it, and
through the command line (`--model`) where the agent accepts it; an agent that takes neither keeps
its own model, and the run log says which.

For Cursor, the list has one line per level of each model (`claude-opus-5-5-low`, `-medium`,
`-high`…); the board groups the variants into one model with its levels. The fast versions (`-fast`,
they answer sooner and charge more for the same tokens) stay out until you turn on **Incluir os
modos rápidos** (include fast modes) on the Cursor card: then each one enters as a separate model
("Claude Opus 5.5 1M Fast"), only for the models in the catalog; turning it off removes them from
the catalog. Through MCP, it is the `includeFastModels` rule of `update_rules`. On Cursor's free plan
only **Auto** runs: the other models are refused before starting (the blocked card explains how to
pick Auto), which is why Cursor's suggestion rules all start at Auto.

Suggestion rules combine conditions with AND and OR, for example
`Esforço da atividade = Alto E Tags = backend`. The result is always a suggestion: on the card, the
model and the effort can be changed at any time. The rule editor has only name, conditions and
suggested model.

## Execution and fallback policies

The **execution and fallback policies** separate versioned definition, local human review and
history (schema 41). The resolver does not replace an invalid explicit choice with a default, nor
redirect a prefix to the default copied profile. The evaluator and the simulation use the same
function, with explained rejections, ordered targets, accumulated limits and a reconciliation
requirement when there is partial or unknown work. Imported policies remain pending review; earlier
snapshots do not change with editing.

Under **Configurações → Ferramentas de IA → Políticas de execução e fallback → Gerenciar
políticas** (Settings → AI tools → Execution and fallback policies → Manage policies), the manual
editor supports conditions, ordered targets, limits, duplication, removal and paginated history. A
complete comparison precedes the human review confirmation; saving as pending does not authorize
execution. Version conflicts preserve the draft and let you reload the base before reviewing again.
The host simulator uses the same evaluator, without AI, and identifies credentials/admission as
scenario assumptions. Changes to the saved policies or to the context invalidate the displayed
result.

The runner, the chat and the assistants ("Sugerir agentes, regras ou skills", suggest agents,
rules or skills; "Indicar artefatos", suggest artifacts) decide the target switch through this same
evaluator: with an enabled, applicable policy the run continues on its target; without a policy,
the failure blocks and nothing runs on another target. In **Próxima execução** (next run), the
simulation evaluates only the saved and enabled policies, without spending tokens or opening the
CLI. **Criar com ajuda de IA** (create with AI help), **Sugerir fallbacks** (suggest fallbacks) and
**Revisar conflitos** (review conflicts) ask the AI only for a proposal (a draft with explanation,
differences and simulated examples, without secrets): it goes through the editor's validator and
nothing is saved or enabled until you review and confirm. The AI also reads the policies over MCP
(`get_execution_policies`, read-only); creating, reviewing and enabling is always the person's
action.

### The old fallback model

The old **fallback model** on suggestion rules no longer switches anything at run time: fallback is
decided only by the execution and fallback policies. When the board opens, when rules are saved or
after a backup is imported, each legacy fallback becomes a **disabled policy proposal pending
review** (id `legacy-<rule>`, action _offer_, failure _quota_, target = the fallback model), with
history at version 1. The proposal does not copy the rule's conditions (card fields and type):
adjust them in the editor. The conversion happens once; if you remove the proposal, it does not
come back.

Under **Políticas → Gerenciar políticas** (Policies → Manage policies) a notice lists the proposals
and the fallbacks that could not be converted (model or effort outside the catalog); nothing
switches CLI until you compare, simulate, review and enable the policy. The rule editor no longer
has a fallback field and does not show the old fallback; the conversion and the notice live in the
policies. The MCP `set_model_rules` has no `fallback` parameter (the key is ignored in a call) and
`get_models` returns no fallback. On export, CLI profile credentials and variables are not in the
file; on import, the profiles come back disabled and the policies pending, and the notice lists
both.

## Dependencies between options and cross-links

Several Settings options only take effect because of another. The board shows a discreet line under
the dependent options (for example, "Depende de **uma regra de sugestão de modelo** (agora:
nenhuma)", depends on a model suggestion rule (now: none), below "Preencher o modelo sugerido
automaticamente", or "Depende de **agentes marcados como disponíveis**", depends on agents marked
as available, below "Agente padrão", default agent); the option stays disabled when the dependency
is not met. The links let you navigate: click one to go to the matching board section, which
scrolls and highlights for 2 seconds, or click a link in the Settings to open the board at the
right section. In browser mode, the links to the Settings appear as text only.

**"Preencher o modelo sugerido automaticamente"** (fill in the suggested model automatically) lives
in Modelos, not in Regras; a simple notice in Regras indicates the move. The Heartbeat interval
field stays disabled when the heartbeat is off, with no additional dependency component. The headers
of Modelos, Agentes, Rules and Skills show "Mostrando os X do [ferramenta] · trocar ferramenta"
(showing the X of [tool] · switch tool), letting you change the tool from any of these board
screens.

## Updating the default board

When a new version of the extension changes the default board, the board asks whether you want to
update it (or use **Faz AI: Atualizar board para o padrão atual**, update the board to the current
default). The update only adds what is missing: no card leaves its place and what you customized is
kept. A copy of the database is saved first.
