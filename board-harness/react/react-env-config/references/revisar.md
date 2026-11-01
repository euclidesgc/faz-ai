# Revisar — react-env-config

Leia o diff/arquivos pertinentes e os contratos consumidos. Revise a responsabilidade desta skill; não transforme a tarefa em uma auditoria de toda a aplicação.

1. Procurar coerções permissivas, defaults que escondem erro e prefixos públicos contendo credenciais.
2. Comparar configuração declarada, exemplos e usos efetivos; revisar distinção build/runtime.
3. Conferir se o teste usa entradas ausentes e inválidas, e se o diagnóstico evita valores sensíveis.

## Evidência e resultado

Demonstrar parsing válido, ausência/erro pertinente e resolução da configuração no comando afetado.

Para cada achado, indique arquivo/linha, condição que reproduz o problema, consequência e correção sugerida. Priorize impacto demonstrável; diferencie hipótese sem evidência de defeito confirmado. Se não houver achados, declare o escopo verificado e a lacuna concreta restante. Não declare execução de verificações que apenas leu nem altere arquivos num pedido só de revisão.
