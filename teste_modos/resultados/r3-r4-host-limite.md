# R3–R4 — limite da prova pelo board real

Data: 02/11/2026. Inspecionei o harness headless de board (`evals/lib/hostBoard.ts`) e o executor ACP real. O harness cria projeto, dados, bridge e socket MCP sob uma raiz temporária e usa `createBoardHost`; portanto existe isolamento de dados para uma sonda real.

Não rodei `openHostBoard` nem `npm run eval` nesta rodada. `openHostBoard` chama `host.verifyExecutor(profile)`, que executa a sonda de capacidades real do perfil antes da história; o caminho de avaliação, depois disso, envia prompts ao modelo. Assim, mesmo a abertura do host não é uma prova sem consumo, e uma história que contenha delegação/leitura/escrita seria uma chamada paga. O probe ACP mínimo existente (`scripts/acp-real/handshake.mjs`) contorna o board, portanto não seria evidência de execução end-to-end pelo board.

## O que a evidência atual cobre

- **P1 / delegação:** `r2-codex-filhos.md` registra subagentes reais do `codex-acp` 2.2.2 e eventos associados a IDs próprios.
- **P2 / escopo enforced:** ainda não demonstrado pelo board com o Codex real. A sonda R2 mostra que o MCP de teste foi herdado pela filha; isso não comprova que uma filha sem MCP seja efetivamente impedida nem que o board aplique escopos por filho.
- **P3 / observação:** R2 mostra eventos e identidade de filho no protocolo. Não comprova persistência desses dados no log/relatório de uma execução real do board.
- **P4 / retomada:** `r1-codex-acp-retomada.md` demonstra retomada de sessão principal em novo processo, e R2 demonstra nova filha depois de `session/load`. Ainda falta retomar uma história pelo board e confirmar que suas restrições foram mantidas.

Resultado: **parcial, não homologado end-to-end**. Não houve alteração de runtime nem chamada de modelo nesta rodada. O workspace tinha mudanças preexistentes em `.gitignore` e `teste_modos/`; elas não foram tocadas.
