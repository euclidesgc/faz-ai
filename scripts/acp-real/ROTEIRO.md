# Roteiro do teste real do transporte ACP

Fora do `npm test` (que usa um agente ACP falso). Roda cada ferramenta aprovada na avaliação
(`docs/decisoes/acp-transporte-de-agentes.md`: Gemini CLI, OpenCode, Kimi Code, Codex) com a CLI
instalada e logada. **CLI ausente = "não validado", nunca "passou".**

Para cada ferramenta, crie um perfil de CLI personalizado (`base: generic`) com `config.acpAgent`
igual ao id do catálogo (`gemini`, `opencode`, `kimi`, `codex-acp`) e rode um card simples
("responda OK e mova este card para Concluído") num projeto de teste limpo (`git status` vazio).

Ferramenta: ______ Versão (`<cli> --version`): ______ Data: ______

- [ ] **Card do começo ao fim**: o card termina e o andamento aparece no card.
- [ ] **Log de uso**: uma linha nova para a execução, com perfil, modelo e duração.
- [ ] **MCP fora do card negado**: dê ao card só o MCP A; peça uma chamada ao MCP B. Esperado: a
      permissão é recusada (`reject_once`) e a chamada não acontece.
- [ ] **Nenhum arquivo no projeto**: `git status --porcelain` vazio depois da execução, para o agente
      que aceita o `mcpServers` do `session/new` (`.cursor/mcp.json` só vale para o Cursor).
- [ ] **Parar**: inicie um card longo e clique em Parar. Esperado: o `session/cancel` é enviado, a
      execução termina como cancelada e `pgrep -f <cli>` não lista processo remanescente.
- [ ] **Consumo medido**: compare tokens (e custo, no OpenCode) do log de uso com o que a ferramenta
      mostra (`/stats`, painel do provedor). Anote a diferença: ______
- [ ] Erro de login: com a CLI deslogada, a mensagem traz o comando de login do catálogo.

Resultado: passou / falhou / **não validado** (motivo: ______).
