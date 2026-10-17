# Revisar — react-e2e-tests

Leia o diff/arquivos pertinentes e os contratos consumidos. Revise a responsabilidade desta skill; não transforme a tarefa em uma auditoria de toda a aplicação.

1. Procurar seletor estrutural frágil, espera por timeout, dados compartilhados e autenticação herdada de outro teste.
2. Conferir se asserts provam o resultado ou só que um clique ocorreu.
3. Inspecionar isolamento de contextos, destinos e artefatos sensíveis; não transformar teste instável em aprovado por retry.

## Evidência e resultado

Jornada passa isoladamente em navegador com dados controlados e produz diagnóstico utilizável quando o comportamento falha.

Para cada achado, indique arquivo/linha, condição que reproduz o problema, consequência e correção sugerida. Priorize impacto demonstrável; diferencie hipótese sem evidência de defeito confirmado. Se não houver achados, declare o escopo verificado e a lacuna concreta restante. Não declare execução de verificações que apenas leu nem altere arquivos num pedido só de revisão.
