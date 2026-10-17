# Revisar — react-query-cache

Leia o diff/arquivos pertinentes e os contratos consumidos. Revise a responsabilidade desta skill; não transforme a tarefa em uma auditoria de toda a aplicação.

1. Checar parâmetro omitido da chave, chave instável e colisão entre consulta simples e infinita.
2. Verificar compartilhamento entre loader/hook e isolamento na troca de usuário/tenant.
3. Investigar refetch/retry excessivo e duplicação do cache em estado local antes de culpar o transporte.

## Evidência e resultado

Filtros/escopos diferentes não compartilham resposta incorreta; loader e hook compartilham consulta; comportamento de atualização é observável.

Para cada achado, indique arquivo/linha, condição que reproduz o problema, consequência e correção sugerida. Priorize impacto demonstrável; diferencie hipótese sem evidência de defeito confirmado. Se não houver achados, declare o escopo verificado e a lacuna concreta restante. Não declare execução de verificações que apenas leu nem altere arquivos num pedido só de revisão.
