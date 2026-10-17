# Revisar — react-component-contracts

Leia o diff/arquivos pertinentes e os contratos consumidos. Revise a responsabilidade desta skill; não transforme a tarefa em uma auditoria de toda a aplicação.

1. Checar duplicação entre prop e estado interno, callbacks em render e divergência entre API tipada e comportamento.
2. Procurar flags que mascaram responsabilidades distintas e abstrações compartilhadas com apenas um caso específico.
3. Verificar consumidores reais, semântica e compatibilidade; separar revisão do contrato de avaliação visual completa.

## Evidência e resultado

Consumidores tipam e interagem corretamente; contrato de valor/evento se mantém em rerender e reset pertinentes.

Para cada achado, indique arquivo/linha, condição que reproduz o problema, consequência e correção sugerida. Priorize impacto demonstrável; diferencie hipótese sem evidência de defeito confirmado. Se não houver achados, declare o escopo verificado e a lacuna concreta restante. Não declare execução de verificações que apenas leu nem altere arquivos num pedido só de revisão.
