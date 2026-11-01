# Revisar — react-integration-tests

Leia o diff/arquivos pertinentes e os contratos consumidos. Revise a responsabilidade desta skill; não transforme a tarefa em uma auditoria de toda a aplicação.

1. Checar se o defeito de integração poderia passar por causa de hook/store mockado ou assert fraco.
2. Inspecionar isolamento, esperas, providers e cobertura de erro/transição que faz parte do caso.
3. Distinguir limitação do DOM simulado de verificação de layout, foco nativo e comportamento que exige navegador.

## Evidência e resultado

Interação real entre partes detecta incompatibilidade pertinente; cenário roda isolado sem ordem implícita e observa resultado final.

Para cada achado, indique arquivo/linha, condição que reproduz o problema, consequência e correção sugerida. Priorize impacto demonstrável; diferencie hipótese sem evidência de defeito confirmado. Se não houver achados, declare o escopo verificado e a lacuna concreta restante. Não declare execução de verificações que apenas leu nem altere arquivos num pedido só de revisão.
