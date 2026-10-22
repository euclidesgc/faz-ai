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
| Ferramentas de IA     | CLI profiles: enable, set a default, duplicate, create and test                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Modelos de IA         | Models and effort levels by profile; rules that suggest each card's model                                                                                                                                                                                                                                                                                                                                                                                                              |
| Git                   | Mode, gitflow, branch names and prefixes, worktrees, automatic merge and decision records; editable in the editor and in the browser. "Tocar histórias em paralelo" (work on stories in parallel) lives in Harness de IA › Ferramenta e execução                                                                                                                                                                                                                                      |
| Aparência             | **Idioma** (language: automatic, Português (Brasil) or English), theme, font and size, per board, in the editor and in the browser; statuses (name and color, in the Fluxos tab; here only in browser mode)                                                                                                                                                                                                                                                                             |
| Backup                | Export and import the board, in the Backup tab, in the editor and in the browser (in the editor, also through the command palette: `fazai.exportBoard`, `fazai.importBoard`)                                                                                                                                                                                                                                                                                                          |

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

### Custom profile

To create a custom profile, enter the command and one argument per line. The markers `{prompt}`,
`{model}`, `{effort}`, `{mcpConfig}` and `{addDir}` insert, respectively, the request, the model,
the effort, the MCP file and an additional folder when they are available. Choose **Entrada do
pedido** (prompt input: argument or stdin) and **Servidor do board** (board server: CLI, project
file or none). In a card's **Modelo** field, **Outro modelo…** (other model) accepts a free-form
identifier for that profile without adding it to the catalog. **Testar** (Test) runs a short request
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
