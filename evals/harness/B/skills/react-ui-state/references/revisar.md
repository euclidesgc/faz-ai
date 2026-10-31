# Revisar — react-ui-state

Leia o diff/arquivos pertinentes e os contratos consumidos. Revise a responsabilidade desta skill; não transforme a tarefa em uma auditoria de toda a aplicação.

1. Procurar fontes duplicadas, useEffect usado para derivar valor e store compartilhado por conveniência.
2. Reproduzir sequência rápida de eventos, troca de recurso e remontagem; examinar closures obsoletas e mutação de objetos.
3. Verificar que a correção mantém contratos de URL/form/cache e não move suas responsabilidades para UI state.

## Evidência e resultado

Transições e reset pertinentes são demonstrados; estado derivado acompanha a fonte sem sincronização circular.

Para cada achado, indique arquivo/linha, condição que reproduz o problema, consequência e correção sugerida. Priorize impacto demonstrável; diferencie hipótese sem evidência de defeito confirmado. Se não houver achados, declare o escopo verificado e a lacuna concreta restante. Não declare execução de verificações que apenas leu nem altere arquivos num pedido só de revisão.
