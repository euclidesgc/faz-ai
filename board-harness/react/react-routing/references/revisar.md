# Revisar — react-routing

Leia o diff/arquivos pertinentes e os contratos consumidos. Revise a responsabilidade desta skill; não transforme a tarefa em uma auditoria de toda a aplicação.

1. Procurar paths duplicados, parâmetros sem encoding e loops de redirecionamento.
2. Conferir ordem de rotas aninhadas, fallback de erro e resultado de sessão em restauração.
3. Checar se loader e tela usam a mesma identidade de consulta, sem reimplementar política de cache.

## Evidência e resultado

Rotas válidas e desconhecidas têm resultado definido; link e acesso direto chegam ao mesmo recurso.

Para cada achado, indique arquivo/linha, condição que reproduz o problema, consequência e correção sugerida. Priorize impacto demonstrável; diferencie hipótese sem evidência de defeito confirmado. Se não houver achados, declare o escopo verificado e a lacuna concreta restante. Não declare execução de verificações que apenas leu nem altere arquivos num pedido só de revisão.
