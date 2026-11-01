# Revisar — react-business-rules

Leia o diff/arquivos pertinentes e os contratos consumidos. Revise a responsabilidade desta skill; não transforme a tarefa em uma auditoria de toda a aplicação.

1. Comparar exemplos do requisito aos ramos de execução; procurar arredondamento implícito e condições de borda omitidas.
2. Inspecionar duplicações divergentes entre tela e formulário e dependências de relógio/locale não controladas.
3. Apontar mudança de significado mesmo quando tipos e testes existentes continuam passando.

## Evidência e resultado

Exemplos e fronteiras da regra produzem resultados esperados; refatoração mantém invariantes e comportamento aprovado.

Para cada achado, indique arquivo/linha, condição que reproduz o problema, consequência e correção sugerida. Priorize impacto demonstrável; diferencie hipótese sem evidência de defeito confirmado. Se não houver achados, declare o escopo verificado e a lacuna concreta restante. Não declare execução de verificações que apenas leu nem altere arquivos num pedido só de revisão.
