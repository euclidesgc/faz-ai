# Revisar — react-render-performance

Leia o diff/arquivos pertinentes e os contratos consumidos. Revise a responsabilidade desta skill; não transforme a tarefa em uma auditoria de toda a aplicação.

1. Conferir baseline e resultado, custo introduzido pela otimização e condições de medição do profiler.
2. Procurar dependência omitida, comparator incorreto, closures antigas e otimização que só esconde atualizações.
3. Examinar teclado/foco quando lista muda ou virtualiza e separar gargalo de rede do trabalho de render.

## Evidência e resultado

Interação medida melhora em condições comparáveis e segue exibindo valores atuais após mudanças de props/estado.

Para cada achado, indique arquivo/linha, condição que reproduz o problema, consequência e correção sugerida. Priorize impacto demonstrável; diferencie hipótese sem evidência de defeito confirmado. Se não houver achados, declare o escopo verificado e a lacuna concreta restante. Não declare execução de verificações que apenas leu nem altere arquivos num pedido só de revisão.
