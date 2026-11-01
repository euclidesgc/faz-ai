# Revisar — react-telemetry

Leia o diff/arquivos pertinentes e os contratos consumidos. Revise a responsabilidade desta skill; não transforme a tarefa em uma auditoria de toda a aplicação.

1. Conferir utilidade do contexto, frequência e duplicação em um cenário reproduzível.
2. Inspecionar dado efetivamente enviado e breadcrumbs automáticos, não só o objeto passado manualmente.
3. Simular transporte indisponível e troca de usuário; verificar que a jornada continua e contexto anterior não vaza.

## Evidência e resultado

Evento contém contexto permitido uma vez por ocorrência prevista; falha de envio não quebra a UI nem expõe dados.

Para cada achado, indique arquivo/linha, condição que reproduz o problema, consequência e correção sugerida. Priorize impacto demonstrável; diferencie hipótese sem evidência de defeito confirmado. Se não houver achados, declare o escopo verificado e a lacuna concreta restante. Não declare execução de verificações que apenas leu nem altere arquivos num pedido só de revisão.
