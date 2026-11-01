# Revisar — react-api-contracts

Leia o diff/arquivos pertinentes e os contratos consumidos. Revise a responsabilidade desta skill; não transforme a tarefa em uma auditoria de toda a aplicação.

1. Comparar exemplos reais ao schema e verificar se o parsing é executado de fato.
2. Procurar any/casts, campos opcionais incorretos, data tratada como Date sem conversão e coerção permissiva.
3. Conferir se fixtures apenas repetem a suposição do consumidor e escondem divergência do serviço.

## Evidência e resultado

Payload válido é aceito/mapeado; incompatibilidades significativas produzem falha definida sem acessar dados como se fossem válidos.

Para cada achado, indique arquivo/linha, condição que reproduz o problema, consequência e correção sugerida. Priorize impacto demonstrável; diferencie hipótese sem evidência de defeito confirmado. Se não houver achados, declare o escopo verificado e a lacuna concreta restante. Não declare execução de verificações que apenas leu nem altere arquivos num pedido só de revisão.
