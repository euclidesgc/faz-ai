# Fase 1 · CLI · Kimi Code 2.4.1 — P1, P2, P3, P4 PASSAM

**Resultado mais forte da fase 1 junto com o Claude:** ferramentas, MCP e skill
todos com escopo enforced por sub-agente, comprovados em execução real.

Sandbox: `teste_modos/sandbox/kimi` (condutor via `--agent-file`, sub-agentes em
`.kimi-code/agents/`, skill via `--skills-dir`, MCP em `.kimi-code/mcp.json`).

## Rodada 1 (run1.jsonl) — falha de ambiente, achado importante

`subagent error: Unknown agent type: "escritor"` — a descoberta de agentes e da
config segue a **raiz do `.git`**, não o cwd: sem `.git` no sandbox, a raiz
resolveu para o repo `faz_ai`, e a sessão carregou até o MCP do board
(`mcp__faz-ai__*`) da config do projeto. Lição para o board: no Kimi, a fronteira
de config é a worktree/raiz git — o que casa com o modelo "história = worktree".

## Rodada 2 (run2.jsonl, após `git init` no sandbox)

- **P1 Delegação — PASSA.** Condutor (`--agent-file condutor.md`, com
  `subagents: [escritor, leitor]`) delegou aos dois: `agent-0` (escritor) e
  `agent-1` (leitor), `actual_subagent_type` correto em ambos.
- **P2 Ferramentas — PASSA (enforced estrutural).** Leitor sem `Write`/`Edit`:
  "o bloqueio é estrutural (a ferramenta não está exposta ao sub-agente leitor)".
  Escritor recebeu exatamente a lista declarada.
- **P2 Skill — PASSA.** Escritor invocou `Skill(skill-teste)` e obteve
  `SKILL-OK-3158`; o leitor tinha `Skill` em `disallowedTools` (bloqueio
  confirmado no relatório dele).
- **P2 MCP — causa encontrada: confiança da pasta.** O `.kimi-code/mcp.json`
  do projeto é **ignorado em pastas não confiáveis**:
  `Warning: this folder is not trusted; skipped 1 project-level MCP server:
mcp-segredo` — a CLI orienta `KIMI_CODE_TRUST_WORKSPACE=1` (ou "Trust this
  folder" no interativo). Reteste com a variável em `run3.jsonl`.
  **Alerta de segurança para o board:** sem o servidor exposto, o sub-agente
  contornou o bloqueio falando direto com o binário do servidor via `Bash` —
  escopo de ferramentas limita a superfície MCP, não o executável.
- **P3 Observação — PASSA.** stream-json com `agent_id`, tipo efetivo, status e
  resumo por filho; estado persistido em `agents/` da sessão (`wire.jsonl`).

## Rodada 3 (run3.jsonl, com `KIMI_CODE_TRUST_WORKSPACE=1`) — confirmação completa

- **MCP por sub-agente — PASSA (enforced).** Escritor obteve `MCP-OK-7429`
  (`resultado-escritor.txt` com `MCP=MCP-OK-7429` e `SKILL=SKILL-OK-3158`).
  O leitor, com `disallowedTools: [Skill, mcp__*]`, relatou: "Nenhuma ferramenta
  com prefixo `mcp__` foi exposta a este subagente" e nenhuma ferramenta de
  escrita — bloqueio estrutural dos três lados (escrita, MCP, Skill).
- O allowlist `subagents:` do condutor (só escritor e leitor) funcionou: só os
  dois tipos foram lançados.

## P4 Retomada (resume1.jsonl) — PASSA, com duas ressalvas

Sessão da rodada 1 (`session_e2616306-…`) retomada com
`kimi --session <id> -p "…"`. O condutor voltou e relatou **fielmente** o
histórico daquela sessão ("o subagente escritor nunca rodou — lançamento
recusado com Unknown agent type"), confirmando que o contexto é restaurado.
Ressalvas para o board:

- **Identidade do agente não é reafirmada no resume**: ao ser perguntado, o
  condutor respondeu "sei apenas que atuo como condutor da história, sem nome
  de agente informado". Ao retomar, o harness deve reenviar a configuração do
  agente (`--agent-file` / flags) — não confiar que o binding persiste.
- **MCP de projeto é pulado no resume sem confiança**: o stderr do resume
  repetiu `this folder is not trusted; skipped 1 project-level MCP server` —
  `KIMI_CODE_TRUST_WORKSPACE=1` é obrigatório também na retomada.

## Lembretes para o board

- MCP de projeto exige pasta confiável (`KIMI_CODE_TRUST_WORKSPACE=1` no
  headless), na abertura e no resume.
- A fronteira de config é a raiz do `.git` — casa com "história = worktree".
- Escopo de ferramentas limita a superfície MCP, não o executável: um
  sub-agente com `Bash` pode falar direto com o binário de um servidor MCP
  não exposto. Se o segredo importa, isole o servidor (rede/permissão), não
  dependa só da allowlist.

## Sonda ao vivo (03/11/2026, CLI 2.4.1) — o caminho do board

Duas chamadas em pasta temporária com `git init` e `KIMI_CODE_TRUST_WORKSPACE=1`:

1. `kimi -p "…" --output-format stream-json --agent-file condutor.md`, com o condutor declarando
   `tools: ["Read","Glob","Grep","Agent"]` e `subagents: ["*"]`. O `session.resume_hint` trouxe o id.
2. **Só depois** da primeira chamada, `.kimi-code/agents/filha-1.md` foi criado (tools `Read`,
   `disallowedTools` com `Agent`, `AgentSwarm`, `Bash`, `Write`, `Edit`, `subagents: []`). A retomada
   `kimi -p "…" --session <id>` (sem flag de agente, como a CLI exige) descobriu a filha nova: a
   chamada `Agent` com `subagent_type: "filha-1"` voltou com `actual_subagent_type: filha-1` e
   `status: completed` no resultado; a chamada com `subagent_type: "inexistente"` voltou
   `subagent error: Unknown agent type` (sem `actual_subagent_type`: nunca houve filha).

Conclusões para o board (`src/extension/ai/providers/kimi.ts`, `aiOutput/kimi.ts`): a principal
nasce com `--agent-file` e retoma com `--session`; como a retomada não recebe arquivo de agente, a
allowlist `subagents` da principal fica `["*"]` e quem confere qual filha nasceu é o board, pelo
nome no resultado da chamada; a filha é gravada em `.kimi-code/agents/<nome>.md` do projeto só
durante a execução (e nunca sobrescreve um arquivo existente); a filha roda no modelo da sessão (o
arquivo ignora `model`), então o board recusa antes de delegar a sub-tarefa que pede outro; a CLI não
informa o estado dos servidores MCP na largada, e a prontidão vale pelo `.kimi-code/mcp.json` que o
próprio board grava por empréstimo. Cenário: `test/scenarios/storySessionKimi.scenario.test.ts`.
