# #494: gitflow, tela das órfãs na aba Git, selo no board e docs

## Contexto

A #465 limpa as branches e worktrees que o board criou e cuja história terminou. As partes 1 a 3 (#465, #489, #492) entregaram a regra pura, o varredor no host e a ligação ao board (`BoardState.orphans` e as mensagens `git.orphans.*`). Faltava a pessoa ver o relatório, decidir o que depende dela e saber que há algo esperando.

## Decisão

- **A tela só lê e pede.** `OrphansSection` lê `BoardState.orphans` e envia `git.orphans.scan|clean|cleanSafe` por `commands.ts` (`req`, para `useAction` mostrar a espera). O veredito é do host; a webview não recalcula nada.
- **Fora do bloco `isWeb`.** A seção aparece também no VS Code, onde o resto da aba Git é só um atalho para o Settings.
- **Confirmação só nos itens de decisão**, pelo `ask()` do `boardStore` (mesmo padrão de `store/actions.ts`). O texto diz quantos arquivos e commits se perdem; ao confirmar, a webview envia `acceptLoss` com esses dois números e o host revalida contra o disco. Item seguro limpa direto.
- **Selo no topo conta só `decision`.** As seguras o host limpa sozinho, então não pedem atenção. O selo reaproveita a classe `topbar-pending` (sem CSS novo) e abre `openSettings('git')`.
- **Falha de remoção** vem em `report.failed[id]` e aparece na linha como "Não removido: motivo".

## Alternativas descartadas

- **Diálogo próprio de confirmação.** O `Dialog` global já cobre título, texto, perigo e cancelamento.
- **Confirmar também as seguras.** Não há perda a mostrar; seria um clique a mais sem informação.
- **Contar no selo todas as órfãs.** As seguras somem na rodada seguinte; o selo acenderia e apagaria sem a pessoa ter o que fazer.

## Consequências

- A tela não tem regra de negócio: se o veredito mudar no host, a tela acompanha sem mudança.
- Sem heartbeat ligado, o relatório só atualiza na abertura e em **Verificar de novo**; o README diz isso.
