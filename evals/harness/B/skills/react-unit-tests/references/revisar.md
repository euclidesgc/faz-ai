# Revisar — react-unit-tests

Leia o diff/arquivos pertinentes e os contratos consumidos. Revise a responsabilidade desta skill; não transforme a tarefa em uma auditoria de toda a aplicação.

1. Avaliar se o teste distingue comportamento correto de defeito plausível; remover asserts que só repetem o código.
2. Checar limites, precisão, timezone e mutação de entradas quando fazem parte do contrato.
3. Procurar ordem implícita, mock não restaurado e snapshot amplo que ninguém consegue avaliar.

## Evidência e resultado

Teste detecta o defeito-alvo e passa na implementação correta, sem depender de ordem ou internals dispensáveis.

Para cada achado, indique arquivo/linha, condição que reproduz o problema, consequência e correção sugerida. Priorize impacto demonstrável; diferencie hipótese sem evidência de defeito confirmado. Se não houver achados, declare o escopo verificado e a lacuna concreta restante. Não declare execução de verificações que apenas leu nem altere arquivos num pedido só de revisão.
