# Revisar — react-styling

Leia o diff/arquivos pertinentes e os contratos consumidos. Revise a responsabilidade desta skill; não transforme a tarefa em uma auditoria de toda a aplicação.

1. Comparar com design/tokens e detectar valores isolados, especificidade excessiva e estilos duplicados.
2. Verificar cortes de texto, navegação por teclado, foco visível, contraste e legibilidade nos temas relevantes.
3. Conferir impacto de tokens globais e conteúdo extremo; não declarar validação visual apenas com typecheck.

## Evidência e resultado

Inspeção visual ou capturas dos estados/tamanhos alterados; verificações automatizadas apenas quando ajudam a detectar regressão relevante.

Para cada achado, indique arquivo/linha, condição que reproduz o problema, consequência e correção sugerida. Priorize impacto demonstrável; diferencie hipótese sem evidência de defeito confirmado. Se não houver achados, declare o escopo verificado e a lacuna concreta restante. Não declare execução de verificações que apenas leu nem altere arquivos num pedido só de revisão.
