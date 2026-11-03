# Sonda ACP · filhos Codex

Data: 02/11/2026. Ambiente local: `@agentclientprotocol/codex-acp` 2.2.2 e Codex CLI 0.163.0. As sondas rodaram em pastas temporárias vazias; os logs brutos ficaram em `/tmp` e não foram copiados ao repositório.

## Negociação ACP

O primeiro teste enviou apenas a capability canônica `clientCapabilities.subagents: {}`. O adaptador a anunciou em `agentCapabilities.sessionCapabilities.subagents`, e um filho de fato foi iniciado, mas a conexão não recebeu eventos ACP de ciclo de vida.

Repeti o mesmo prompt com o fallback AIR do adaptador, primeiro junto da capability canônica e depois sozinho:

```json
"_meta": {
  "jetbrains": {
    "air": {
      "version": 1,
      "capabilities": ["nativeSubagentSessions"]
    }
  }
}
```

Nos dois casos o adaptador emitiu `subagent_spawned` e `subagent_state_update` com `state: "completed"`. A conclusão é que ACP 2.2.2 entrega os eventos nativos quando o cliente anuncia `nativeSubagentSessions` pelo metadado AIR. A capability canônica sozinha não foi suficiente nesta combinação instalada de adaptador/SDK.

## IDs e atualizações do filho

Uma sonda direta do app-server, usando `codex app-server --stdio`, mostrou o evento de origem no stream do pai:

```text
item/started / item/completed
  item.type = subAgentActivity
  item.kind = started
  item.agentThreadId = <UUID do thread filho>
  item.agentPath = /root/inspect_directory
```

As notificações seguintes do filho usam `params.threadId` igual a `agentThreadId`, inclusive `turn/started`, `turn/completed` e itens de mensagem/ferramenta. O pai depois emite `subAgentActivity` com `kind: "completed"` e o mesmo ID. O adaptador converte o início em `session/update` com `sessionUpdate: "subagent_spawned"` e `subagentSessionId`; o fim vira `subagent_state_update`. Assim, o board consegue associar as notificações dirigidas ao filho ao `sessionId` ACP anunciado pelo pai.

O adaptador espera os filhos ativos terminarem antes de resolver `session/prompt` do pai. O timeout interno é de dez minutos; se ele expira, o adaptador marca filhos restantes como falhos e conclui o prompt.

## MCP herdado e segunda filha após retomada

Também rodei uma sonda MCP inofensiva numa pasta temporária. A sessão pai recebeu um único servidor stdio `child-probe`, com ferramenta `confirm`; a ferramenta apenas devolve `CHILD_MCP_OK` e grava um contador local da sonda. O prompt pediu explicitamente a uma filha para chamá-la uma vez.

- Na sessão nova, o adaptador enviou `subagent_spawned` no ID da sessão pai. A chamada ACP `mcp.child-probe.confirm` foi endereçada ao `sessionId` da filha anunciado nesse evento, e o servidor MCP registrou uma chamada. O estado final da filha foi `completed`.
- Depois abri a mesma sessão com `session/load`, reenviei o mesmo `mcpServers` e pedi uma nova filha. O fluxo incluiu o spawn/fim históricos da primeira filha e um segundo par spawn/fim com outro ID de filha. A nova chamada `mcp.child-probe.confirm` foi endereçada a esse segundo ID; o servidor registrou exatamente mais uma chamada.
- Nos dois ciclos, spawn e estado final foram endereçados à sessão pai. O ID de sessão das chamadas MCP da filha correspondeu ao ID `subagentSessionId` anunciado para aquela filha. Não houve chamadas MCP pelo pai.

Resultado: a lista MCP configurada na sessão pai também fica disponível às filhas, e uma filha nova após `session/load` ganha ID próprio e pode usar o servidor herdado. Não foi necessário alterar arquivos no workspace temporário; o resultado e os contadores foram verificados pelos logs sanitizados fora do repositório.

## Conferência da configuração efetiva da filha

Após carregar a sessão principal no mesmo processo ACP, `session/load` do ID de uma filha concluída devolveu suas `configOptions`. A sonda local retornou `model: gpt-6-astra` e `reasoning_effort: medium` para a filha observada. Tentar carregar a filha antes da principal foi recusado pelo adaptador. O piloto agora confere esses valores antes de aceitar a tentativa; esta sonda demonstra leitura da configuração, mas ainda não demonstra a escolha de um modelo diferente do principal em uma execução pelo board.

## Cancelamento

ACP 2.2.2 não oferece cancelamento direcionado a uma sessão filha. `session/cancel` recebe o ID da sessão raiz e interrompe o turno raiz; ao sair com interrupção, o adaptador encerra o estado dos filhos restantes. A capability de cada filho é `{}`, e a documentação do adaptador confirma que não há operação de cancelamento/fechamento direcionada.

O app-server tem `turn/interrupt { threadId, turnId }` e as sondas mostram que o stream fornece o ID do thread filho e o ID do turno filho. Um cliente que fale diretamente com o app-server pode, portanto, interromper um filho por ID. O board via ACP não recebe um contrato para enviar esse pedido ao adaptador, então o cancelamento individual não está disponível pelo transporte atual.

Referências: [RFD de subagentes ACP](https://agentclientprotocol.com/rfds/subagents) · [documentação de sessões filhas do adaptador Codex](https://github.com/agentclientprotocol/codex-acp/blob/main/docs/subagent-sessions.md).
