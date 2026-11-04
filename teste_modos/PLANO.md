# Investigação de modos de execução — sub-agentes com escopo definido

Objetivo: comprovar, por conector e transporte, se o board consegue rodar o modelo
"história = sessão condutora, sub-tarefas = sub-agentes" **com escopo de artefatos
definido com antecedência** (regras, skills, MCPs, ferramentas, modelo).

## As 4 provas de cada teste

- **P1 — Delegação**: a sessão condutora lança um sub-agente definido por nós (não um built-in).
- **P2 — Escopo enforced**: sub-agente A acessa a ferramenta/MCP/skill prevista; o sub-agente B é **bloqueado de verdade** (erro/negação, não só instrução no prompt).
- **P3 — Observação**: o filho aparece na saída/log com identidade própria e, idealmente, consumo de tokens/custo separável.
- **P4 — Retomada**: a sessão da história resume (sem processo vivo) mantendo o agente condutor e as restrições.

## Fases e ordem

1. **CLI**: Claude (já comprovado — só registrar evidência), Cursor, Codex, Kimi, Antigravity.
2. **ACP** (sem Claude): Cursor (`agent acp` — tem `cursor/task` para observar o filho), Kimi (`kimi acp`), Codex (adaptador `npx -y @agentclientprotocol/codex-acp` — implementa o RFD de sessões de sub-agente do ACP: filhos com histórico separado e permissões roteadas à raiz, após negociação de capability no `initialize`; é o ponto principal a comprovar), Antigravity (verificar se expõe ACP).
3. **API**: Anthropic, OpenAI, Moonshot, Google. (Cursor e Antigravity não têm API pública de modelo — ficam de fora desta fase.)

## O que você prepara (checklist)

1. **Logins interativos** (um por terminal, se ainda não feitos): `claude`, `agent login`, `codex login`, `kimi login`, `agy` (verificar autenticação).
2. **Crédito mínimo** em cada conta (cada teste gasta centavos; a fase API é a que cobra por token).
3. **Chaves**: `cp teste_modos/.env.example teste_modos/.env` e preencher as 4 chaves da fase API (`CURSOR_API_KEY` e `KIMI_API_KEY` só se preferir headless ao login). O `.env` já está no `.gitignore`.
4. **Autorizar** a criação de `teste_modos/sandbox/` como pasta de trabalho descartável dos testes.

## Estado verificado nesta máquina (hoje)

| Agente      | CLI                      | Versão     | ACP                                                         |
| ----------- | ------------------------ | ---------- | ----------------------------------------------------------- |
| Claude      | `claude`                 | 2.1.316    | — (só CLI/API, por decisão)                                 |
| Cursor      | `cursor-agent` / `agent` | 2026.10.22 | `agent acp` ✓                                               |
| Codex       | `codex`                  | 0.163.0    | `npx -y @agentclientprotocol/codex-acp` (adaptador oficial) |
| Kimi        | `kimi`                   | 2.3.0      | `kimi acp` ✓                                                |
| Antigravity | `agy`                    | 1.4.5      | a verificar                                                 |

## Cenário padrão (o mesmo em todos, para comparar)

Condutor com dois sub-agentes definidos por nós:

- **escritor**: pode `Read/Write/Bash`, tem um MCP de teste e uma skill de teste.
- **leitor**: só leitura, sem MCP, sem skill.

Fluxo: condutor delega ao escritor (deve conseguir tudo) → condutor delega ao leitor pedindo para escrever/usar o MCP/a skill (deve ser bloqueado) → medir consumo de cada filho → encerrar e retomar a sessão da história → repetir uma delegação.

## Registro dos resultados

Cada teste gera um arquivo `teste_modos/resultados/<fase>-<agente>.md` com as 4 provas
(passou/falhou + evidência curta) e a matriz final vai no rodapé deste plano.

## Matriz final (encerramento da investigação)

✓ = passou · ✗ = falhou · ⚠ = passou com ressalva · — = não exercitado

| Agente      | Transporte | P1 Delegação                               | P2 Escopo enforced                                                               | P3 Observação                                                                   | P4 Retomada                                          | Veredito                                                                              |
| ----------- | ---------- | ------------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Claude      | CLI        | ✓                                          | ✓ (tools + MCP + skill)                                                          | ✓ (stream-json + `modelUsage` por filho)                                        | ✓ (`--resume` mantém restrições)                     | **Pronto para piloto**                                                                |
| Kimi        | CLI        | ✓ (allowlist `subagents:` funciona)        | ✓ (tools + MCP + skill, estrutural)                                              | ✓ (stream-json + `wire.jsonl` por filho)                                        | ⚠ (contexto fiel; reenviar agente e trust no resume) | **Pronto para piloto**                                                                |
| Kimi        | ACP        | ✓                                          | ✓                                                                                | ✓ (tool_call por delegação)                                                     | ✓ (sessionId estável)                                | **Pronto para piloto**                                                                |
| Antigravity | CLI        | ✓                                          | ⚠ (tools + MCP ✓; skill vaza como arquivo)                                       | ✓                                                                               | —                                                    | Aproveitável com ressalvas                                                            |
| Antigravity | ACP        | ✓ (filho assíncrono: exige laço de espera) | ⚠ (tools + MCP ✓; skill vaza)                                                    | ✓                                                                               | ✓ (resume entre conexões)                            | Aproveitável com ressalvas; cliente deve tratar `session/request_permission`          |
| Codex       | CLI        | ✓                                          | ✗ (MCP e escrita vazam: `--approve-for-me` aplica workspace-write à sessão toda) | ✓                                                                               | —                                                    | **Escopo falha — não atende ao requisito central**                                    |
| Codex       | ACP        | ✓                                          | ✗ (leitor escreveu e usou o MCP: "Nenhuma ação foi bloqueada")                   | ✓ (melhor do trio: eventos Start/Complete com `agentThreadId` + `usage_update`) | —                                                    | **Escopo falha**                                                                      |
| Cursor      | CLI e ACP  | —                                          | ✗ **por documentação** (ver abaixo)                                              | —                                                                               | —                                                    | Teste bloqueado (sem cota), mas a doc oficial já responde o essencial: **não atende** |

**Cursor — por que a doc fecha a questão sem teste:** o frontmatter de subagente
(cursor.com/docs/subagents) só tem `name`, `description`, `model`, `readonly` e
`is_background` — **não há campo de ferramentas, MCP ou skill por subagente**. A
FAQ é explícita: "Subagents inherit all tools from the parent, including MCP
tools". Ou seja: não dá para dar um MCP ao escritor e negar ao leitor; o único
escopo possível é `readonly` (sem escrita) e modelo. Nosso requisito central
(P2, artefatos por sub-agente) não é suportado. Se um dia a conta tiver cota,
vale rerodar só para confirmar P1/P3/P4 — o P2 já está respondido.
| Anthropic / OpenAI / Moonshot / Google | API | — | — | — | — | Pendente: usuário precisa preencher `teste_modos/.env` |

## Estado no board (03/11/2026)

O que a investigação recomendou está implementado na branch `feature/board-story-sessions`, por
conector (detalhe em `docs/decisoes/sessao-da-historia-por-conector.md` e `docs/fluxo.md`):

| Conector          | No board                                                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------------------------------- |
| Claude Code (CLI) | principal por `--resume`, filha no `--agents` com o escopo do card; sonda ao vivo em 03/11                            |
| Kimi Code (CLI)   | principal por `--agent-file`/`--session`, filha em `.kimi-code/agents/` só durante a execução; sonda ao vivo em 03/11 |
| Codex (ACP)       | piloto existente (sessão filha nativa); prova real pelo board (R2) ainda pendente                                     |
| Antigravity (ACP) | modo tradicional: a filha é assíncrona e morre com o processo ACP                                                     |
| Cursor            | modo tradicional: sem escopo por subagente                                                                            |

## Conclusão

1. **O modelo "história = sessão condutora, sub-tarefas = sub-agentes com escopo
   definido com antecedência" é viável e está comprovado em Claude (CLI) e Kimi
   (CLI e ACP)** — os dois enforcem ferramentas, MCP e skill por sub-agente de
   verdade (erro estrutural, não instrução de prompt), com observação e retomada.
2. **Antigravity acompanha, com três ressalvas**: skill não é fronteira (vaza
   como leitura de arquivo), o subagente ACP é assíncrono (board precisa de laço
   de espera/resume) e o cliente ACP precisa implementar o handler de permissão.
3. **Codex não atende** ao requisito central (P2) em nenhum dos dois transportes —
   fica no modo tradicional (sessão única por sub-tarefa).
4. **Piloto recomendado: Claude + Kimi primeiro**, Antigravity em seguida.
5. Pendências que dependem do usuário: créditos na conta Cursor (rerodar cenários
   prontos) e chaves em `teste_modos/.env` para a fase API.
6. Alertas para a implementação no board (detalhes nos arquivos de resultado):
   allowlist `subagents:` no condutor; `KIMI_CODE_TRUST_WORKSPACE=1` no headless;
   `mcpServers` como lista no frontmatter do agy; MCP via `session/new` no ACP sem
   colisão de nomes com a config do projeto; escopo de ferramentas limita a
   superfície MCP, não o executável (bypass via Bash).
