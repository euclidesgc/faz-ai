# Fase 1 · CLI · Kimi Code 2.4.1 — P1, P2, P3 PASSAM (P4 a verificar)

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

## Pendências

- **P4 Retomada** — `kimi -r <session_id>` (a CLI emite o hint ao fim:
  `session_e2616306-…` na rodada 1). A doc garante que o agente vinculado é
  restaurado no resume; falta executar.
- Registrar no board: MCP de projeto exige pasta confiável
  (`KIMI_CODE_TRUST_WORKSPACE=1` no headless).
