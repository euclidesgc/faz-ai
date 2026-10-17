# Revisar — react-i18n

Leia o diff/arquivos pertinentes e os contratos consumidos. Revise a responsabilidade desta skill; não transforme a tarefa em uma auditoria de toda a aplicação.

1. Conferir mensagens não traduzidas, parâmetros ausentes e plurais incorretos nos casos relevantes.
2. Revisar datas/números/moedas, horário e distinção entre valor canônico e apresentação.
3. Checar mudança de idioma, fallback e layout com traduções maiores sem inventar uma política nova para o produto.

## Evidência e resultado

Localidades contratadas exibem mensagens/valores corretos e fallback; dados de cálculo/transporte mantêm significado.

Para cada achado, indique arquivo/linha, condição que reproduz o problema, consequência e correção sugerida. Priorize impacto demonstrável; diferencie hipótese sem evidência de defeito confirmado. Se não houver achados, declare o escopo verificado e a lacuna concreta restante. Não declare execução de verificações que apenas leu nem altere arquivos num pedido só de revisão.
