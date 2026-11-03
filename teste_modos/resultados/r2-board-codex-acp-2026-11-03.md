# R2 — sonda real pelo host do board (03/11/2026)

Sonda headless isolada: projeto Git temporário com um `README.md`, banco e ponte MCP próprios; `createBoardHost` e socket MCP reais; perfil `codex-acp` em regime compatível aprovado pelo verificador. Nenhuma alteração no projeto principal foi solicitada ao modelo. A flag `FAZAI_INTERNAL_STORY_SESSIONS=1` foi definida antes de criar o host. O turno foi limitado a 60 segundos.

## Observado

- O handshake e a verificação do executor passaram.
- A História abriu uma sessão ACP principal e o board persistiu seu ID nativo. O ID foi inspecionado apenas como hash sanitizado.
- A principal criou uma sub-tarefa no board e o runner iniciou a execução desse card.
- Na expiração do limite, a intenção da filha ainda estava `pending`; não havia ID nativo da filha persistido. Portanto **esta sonda não comprova R2**.
- O encerramento da sonda revelou que `boardHost.dispose()` podia fechar o banco após pedir parada ao runner, antes de seu callback terminar. A atualização tardia falhou com `Database closed`. A correção deve esperar a quiescência do runner antes de fechar o banco.

As tentativas anteriores nesta rodada não servem como prova do modo novo: uma não ligou a flag experimental e outra tentou escrever manualmente o campo protegido `Fase`. Nenhuma foi usada para concluir o aceite.

Próxima prova: repetir uma única História com tempo suficiente para a filha concluir, verificar o vínculo nativo e sua configuração efetiva no banco, então fechar e reabrir o host para confirmar retomada e cancelamento sem escrita tardia.
