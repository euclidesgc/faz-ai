# Revisar — react-load-performance

Leia o diff/arquivos pertinentes e os contratos consumidos. Revise a responsabilidade desta skill; não transforme a tarefa em uma auditoria de toda a aplicação.

1. Conferir evidência comparável, efeito no caminho crítico e diferença entre menos bytes e menor tempo percebido.
2. Identificar lazy anulado por import eager, prefetch excessivo e waterfall deslocado para outra etapa.
3. Verificar regressão funcional e declarar ruído/limite de ambiente sem afirmar ganho não medido.

## Evidência e resultado

Métrica antes/depois em cenário controlado demonstra benefício; rota e recursos continuam corretos em build local.

Para cada achado, indique arquivo/linha, condição que reproduz o problema, consequência e correção sugerida. Priorize impacto demonstrável; diferencie hipótese sem evidência de defeito confirmado. Se não houver achados, declare o escopo verificado e a lacuna concreta restante. Não declare execução de verificações que apenas leu nem altere arquivos num pedido só de revisão.
