# Revisar — react-accessibility

Leia o diff/arquivos pertinentes e os contratos consumidos. Revise a responsabilidade desta skill; não transforme a tarefa em uma auditoria de toda a aplicação.

1. Verificar operação sem mouse, foco após erro/fechamento e nome/papel/valor dos controles.
2. Procurar div clicável, label desconectado, aria-hidden sobre elemento focável e anúncio excessivo.
3. Distinguir resultado de scanner de teste manual; relatar barreira, usuário afetado e interação que a reproduz.

## Evidência e resultado

Fluxo pertinente funciona por teclado, foco é previsível e semântica/mensagens são verificadas; declarar limite se não houve leitor de tela.

Para cada achado, indique arquivo/linha, condição que reproduz o problema, consequência e correção sugerida. Priorize impacto demonstrável; diferencie hipótese sem evidência de defeito confirmado. Se não houver achados, declare o escopo verificado e a lacuna concreta restante. Não declare execução de verificações que apenas leu nem altere arquivos num pedido só de revisão.
