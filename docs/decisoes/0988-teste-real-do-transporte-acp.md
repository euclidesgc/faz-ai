# Teste real do transporte ACP (#988)

Roteiro: `scripts/acp-real/ROTEIRO.md`. Ambiente desta execução: macOS, sem as CLIs aprovadas.

| Ferramenta | CLI no PATH | Resultado |
| --- | --- | --- |
| Gemini CLI | não | **não validado** |
| OpenCode | não | **não validado** |
| Kimi Code | não | **não validado** |
| Codex (`codex-acp`) | não | **não validado** |

`cursor-agent` (2026.10.19) está instalado, mas o Cursor ficou na CLI one-shot na avaliação e não foi
exercitado pelo ACP.

## Decisão

Sem a CLI não há como afirmar nenhum dos sete itens do roteiro; todos ficam "não validado". Cobertura
atual: `test/acpTransport.test.ts` e `test/aiGateway.test.ts`, com agente falso (log de uso, MCP fora
do card negado, nenhum arquivo no projeto, cancelamento sem processo remanescente). A conferência
contra o consumo mostrado pela ferramenta depende de uma máquina com as CLIs logadas: pendente.
