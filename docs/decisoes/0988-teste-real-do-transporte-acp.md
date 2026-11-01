# Teste real do transporte ACP (#988)

Roteiro: `scripts/acp-real/ROTEIRO.md`. O handshake fora do board (`initialize`, `session/new` e um
`session/prompt` curto, permissões sempre negadas) roda com `scripts/acp-real/handshake.mjs`.

## Primeira rodada (2026-10-22, manhã): sem as CLIs

macOS, nenhuma das CLIs aprovadas instalada: Gemini CLI, OpenCode, Kimi Code e Codex ficaram
**não validados**. `cursor-agent` (2026.10.19) estava instalado, mas o Cursor ficou na CLI one-shot
na avaliação e não foi exercitado pelo ACP.

## Segunda rodada (2026-10-22, tarde): handshake com as CLIs instaladas e logadas

Só o handshake, não o card inteiro pelo board: a admissão por capacidades ainda recusa o perfil ACP
(ver a épica `epica-conectar-ferramenta-por-acp.md`). Permissões, MCP do card, Parar e log de uso
seguem cobertos só pelo agente falso dos testes.

| Ferramenta | Versão | initialize | session/new | session/prompt | Consumo informado |
| --- | --- | --- | --- | --- | --- |
| Gemini CLI | 0.65.0 (chave de API) | ok, só com `clientInfo.version` | ok: `models` (6, `auto` padrão), `modes` default/autoEdit/yolo/plan | **mudo sem `--skip-trust`**; com a flag: OK em 30 s | `usage` com `thoughtTokens`; `_meta.quota` por modelo; `usage_update` sem custo |
| OpenCode | 1.19.4 | ok, só com `clientInfo.version` | ok: sem `models`; `configOptions` model (15 opções) e mode build/plan | OK em 3 s | `usage` com `cachedReadTokens`; `usage_update.cost` em USD (zero no modelo gratuito) |
| Codex (`codex-acp`) | 2.2.2 | ok | ok: `models` (40, modelo×esforço), `modes` read-only/workspace-write/agent/agent-full-access, `configOptions` model, reasoning_effort, fast-mode | OK em 3 s | `usage` completo e `_meta.quota.model_usage`; `usage_update` sem custo |
| Kimi Code | 2.2.0 | ok: `authMethods` de terminal (`kimi login`) | ok: sem `models`; `configOptions` model (4), thinking low/high/max, mode | OK em 15 s | **nada**: nem `usage` nem `usage_update` |
| Google Antigravity | 1.4.1 (`agy_acp_server.par` do registro) | ok: `authMethods` Google, Gemini Enterprise, chave de API, Agent Platform | **`auth_required` sem login; `authenticate(oauth-personal)` abriu o navegador, entrou e gravou `auth.type` em `~/.gemini/antigravity-acp/settings.json`**; depois ok: `models` (6, modelo×raciocínio, `gemini-3.8-flash-high` padrão), `modes` default/auto_edit/yolo, `configOptions` model, thinking_level, mode | OK em 5 s | **nada** no prompt; `usage_update` só com o contexto |

O `agy` 1.4.5 instalado pela pessoa é o CLI interativo do Antigravity, sem modo ACP; o servidor ACP é
outro binário, que o registro distribui em zip por plataforma. Entrou no catálogo como `antigravity-acp`; a pasta do binário vai no PATH, porque por link simbólico ele
não encontra o próprio harness (`Could not find default localharness binary`).

O que a rodada mudou no código (#983):

- `initialize` passa `clientInfo.version` (a versão da extensão): Gemini CLI e OpenCode recusam
  o pedido sem ele (`invalid_type` em `clientInfo.version`); Kimi e Codex aceitavam.
- O comando do Gemini no catálogo é `gemini --acp --skip-trust`: sem a pasta confiável, o
  `session/prompt` não responde nem avisa. `GEMINI_CLI_TRUST_WORKSPACE=true` no ambiente não bastou
  no modo ACP (basta no `-p`).

O que a rodada mostrou para a épica:

- **Login pela tela (história 3)**: o Antigravity é a prova do desenho: `authenticate` pelo protocolo
  abriu o navegador, a pessoa entrou e o servidor guardou a escolha; o board não viu credencial. Todos devolvem `authMethods` (Gemini: Google, chave de API,
  Vertex, gateway; Codex: chave de API ou ChatGPT; OpenCode: `opencode-login`; Kimi: método de
  terminal, com o comando em `_meta.terminal-auth`). O Gemini com conta individual não entra mais
  pelo Google (o erro manda para o Antigravity); a chave de API funciona.
- **Modelos na conexão (história 4)**: Gemini e Codex trazem `models` no `session/new`; OpenCode e
  Kimi trazem a lista só em `configOptions` (`category: model`). A história precisa ler os dois.
  O Codex traz o esforço dentro do id do modelo (`gpt-6-sol[high]`) e também em `configOptions`.
- **Medição**: o Codex 2.2.2 devolve `usage` com cache e `model_usage` por modelo, diferente do
  relato da 1.6.2 (só o último pedido). Vale reavaliar `usage.tokens: 'last_request'` com um
  turno de várias chamadas antes de gravar. O Kimi segue sem medição.

Pendente: o card inteiro pelo board (depende da história 1 da épica), o Parar com processo real e a
conferência do consumo contra o painel de cada ferramenta.
