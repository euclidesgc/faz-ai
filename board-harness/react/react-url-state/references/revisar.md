# Revisar — react-url-state

Leia o diff/arquivos pertinentes e os contratos consumidos. Revise a responsabilidade desta skill; não transforme a tarefa em uma auditoria de toda a aplicação.

1. Procurar loop de efeitos, perda de parâmetros e coerção de página inválida/negativa.
2. Comparar estado após clique, recarga e voltar; conferir que controles refletem navegação externa.
3. Checar encoding e push/replace, inclusive busca rápida que polui histórico.

## Evidência e resultado

Um link reproduz filtros/página; voltar/avançar restaura controles e valores inválidos têm resultado determinístico.

Para cada achado, indique arquivo/linha, condição que reproduz o problema, consequência e correção sugerida. Priorize impacto demonstrável; diferencie hipótese sem evidência de defeito confirmado. Se não houver achados, declare o escopo verificado e a lacuna concreta restante. Não declare execução de verificações que apenas leu nem altere arquivos num pedido só de revisão.
