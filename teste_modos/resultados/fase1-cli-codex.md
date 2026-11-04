# Fase 1 · CLI · Codex 0.163.0 — P1 e P3 PASSAM; P2-MCP FALHA; P2-sandbox em prova

Sandbox: `teste_modos/sandbox/codex` (agentes em `.codex/agents/*.toml`,
MCP em `.codex/config.toml`). Login ChatGPT.

## Rodadas 1–2 (run1) — bloqueio de aprovação de MCP

- A política padrão do `codex exec` nega MCP: `MCP tool call requires approval,
but approval policy is never`. Não combina com `--sandbox`: a flag certa é
  `--approve-for-me` (que já implica workspace-write).
- Primeira execução desperdiçada por cota esgotada (reset às 15:43) e pela
  flag `--approve-for-me` com valor indevido.

## Rodada 3 (run3, com --approve-for-me)

- **P1 Delegação — PASSA.** Condutor delegou a `escritor` e `leitor`
  (eventos `collab_tool_call` com `sender_thread_id` — as ferramentas de
  colaboração multi-agent são visíveis no `--json`).
- **P2 MCP — FALHA (sem escopo).** O `leitor` chamou o mesmo `codigo_secreto`
  e obteve `MCP-OK-7429`: os servidores MCP são da sessão (`config.toml`), sem
  campo por agente no TOML. O `sandbox_mode` por agente não cobre MCP.
- **P2 Escrita — INCONCLUSIVO nesta rodada.** O leitor não tentou escrever por
  obedência às `developer_instructions` ("não modifique arquivos"), sem
  exercitar o sandbox `read-only`. Rodada 4 prova o sandbox de fato.
- **P3 Observação — PASSA.** `--json` com itens por thread e `usage` por turno.
  **Custo alto:** ~100–117k tokens de entrada por rodada (82–97k em cache) —
  multi-agent do Codex hidrata bastante contexto por filho.
- **P4 Retomada — a verificar** (`codex resume`).

## Rodada 4 (run4) — prova do sandbox read-only do leitor: **FALHA**

O leitor (`sandbox_mode = "read-only"` no TOML) **escreveu
`resultado-leitor.txt`** via `exec_command`, exit 0, sem erro. Hipótese
operante: o `--approve-for-me` (necessário para o MCP do escritor passar)
aplica workspace-write à sessão inteira e atropela o sandbox por agente.
Conclusão prática para o board: **no modo exec, o escopo por sub-agente do
Codex (MCP e sandbox) não se sustenta** — o TOML por agente vale como papel e
preferência de modelo, não como fronteira.

**Resumo Codex CLI: P1 ✓, P3 ✓, P2 ✗ (MCP e escrita sem escopo real), P4 a verificar.**

## Mitigação (análise posterior — como usar o Codex no modelo novo)

O que falhou foi só o **escopo negativo estrutural** (garantir que o sub-agente
NÃO faça). O **escopo positivo** (entregar artefatos) funciona por prompt em
qualquer conector — e no Codex há três pontos de injeção:

1. `developer_instructions` do TOML — é um system prompt por sub-agente escrito
   por nós; o board grava o TOML ao criar a sub-tarefa (dá para colar a skill
   literalmente, ou o caminho + instrução de ler).
2. O prompt de delegação do condutor (dinâmico, por invocação).
3. `AGENTS.md` do projeto (compartilhado).

Evidência de que instrução funciona no modo cooperativo: na rodada 3 o leitor
**não** escreveu porque obedeceu às `developer_instructions` — só escreveu na
rodada 4, quando o teste o empurrou adversarialmente.

Para o escopo negativo, três caminhos (em ordem de preferência):

- **Handler de permissão no cliente ACP do board**: se o `codex-acp` rotear os
  pedidos de permissão com identidade do thread filho (ele já emite
  `agentThreadId` nos eventos), o board aprova/nega por sub-tarefa e o
  enforcement sai do modelo e vira política do board. **Teste alvo quando a
  fase de testes retomar.**
- **Sessão-mãe restritiva + narrowing por TOML**: a doc da comunidade confirma
  que o filho pode estreitar a si mesmo (`sandbox_mode = "read-only"`), mas o
  MCP morre junto (política `never`) — só serve para sub-tarefas sem MCP.
- **Split de sessões** para sub-tarefas sensíveis: escritor em sessão com
  `--approve-for-me`, leitor em sessão read-only. Estrutural hoje, mas é o
  "modo tradicional", não o modelo novo.

Receita pragmática: Codex entra no modelo novo com **escopo declarativo por
prompt** (skills + intenção) para sub-tarefas de baixo risco; sub-tarefas com
garantia dura (sem escrita/sem MCP) rodam em sessão separada até o teste do
handler de permissão do `codex-acp`.

## Fronteira de escopo = a sessão (a história)

No Codex não há cerca por sub-agente: o que está na sessão é de todos; o que
não está, ninguém usa. Consequência para o board: **a sessão da história deve
ser montada com a UNIÃO dos artefatos das sub-tarefas planejadas** — não com
tudo o que existe. Se surgir sub-tarefa que precise de algo fora da sessão, o
board atualiza o `config.toml` e retoma a sessão (`codex resume` — por isso o
P4 do Codex virou teste prioritário).

Custo de contexto (por que "carregar tudo em toda história" é má ideia):

- **MCP pesa**: o schema das ferramentas de cada servidor entra no contexto de
  toda chamada do modelo — e no Codex, que já mediu ~100–117k tokens de entrada
  por rodada, isso infla todos os turnos, dos filhos inclusive.
- **Skill é quase de graça**: só nome + descrição ficam no contexto; o corpo do
  SKILL.md só carrega quando a skill é invocada. Skills podem ir todas em toda
  sessão sem custo relevante — e a invocação automática por descrição vira
  feature, não risco.
- Resumo: **MCPs por história (união das sub-tarefas); skills podem ser todas.**
