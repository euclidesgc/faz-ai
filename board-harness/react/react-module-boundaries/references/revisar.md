# Revisar — react-module-boundaries

Leia o diff/arquivos pertinentes e os contratos consumidos. Revise a responsabilidade desta skill; não transforme a tarefa em uma auditoria de toda a aplicação.

1. Percorrer as arestas reais de import; procurar app importado por features, compartilhado importando domínio e dependências cruzadas.
2. Verificar ciclos via reexports e aliases, além de pastas aparentes. Identificar compartilhamento que só renomeia código de uma feature.
3. Comparar árvore, regra de lint e contrato; separar violação comprovada de preferência estética.

## Evidência e resultado

Imports afetados resolvem; lint/tipos passam; um fluxo consumidor preserva o comportamento após a movimentação.

Para cada achado, indique arquivo/linha, condição que reproduz o problema, consequência e correção sugerida. Priorize impacto demonstrável; diferencie hipótese sem evidência de defeito confirmado. Se não houver achados, declare o escopo verificado e a lacuna concreta restante. Não declare execução de verificações que apenas leu nem altere arquivos num pedido só de revisão.
