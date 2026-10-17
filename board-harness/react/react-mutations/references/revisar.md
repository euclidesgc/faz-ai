# Revisar — react-mutations

Leia o diff/arquivos pertinentes e os contratos consumidos. Revise a responsabilidade desta skill; não transforme a tarefa em uma auditoria de toda a aplicação.

1. Reproduzir sucesso, erro e duas escritas concorrentes; conferir detalhe/listas/totais afetados.
2. Procurar invalidar tudo por comodidade, chaves copiadas, rollback global obsoleto e retries de escrita sem idempotência.
3. Distinguir sucesso remoto de falha de atualização local e preservar callbacks de extensão.

## Evidência e resultado

Após salvar, consumidores relevantes refletem o resultado; falha e concorrência não deixam dados inventados nem apagam escrita posterior.

Para cada achado, indique arquivo/linha, condição que reproduz o problema, consequência e correção sugerida. Priorize impacto demonstrável; diferencie hipótese sem evidência de defeito confirmado. Se não houver achados, declare o escopo verificado e a lacuna concreta restante. Não declare execução de verificações que apenas leu nem altere arquivos num pedido só de revisão.
