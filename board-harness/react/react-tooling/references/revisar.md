# Revisar — react-tooling

Leia o diff/arquivos pertinentes e os contratos consumidos. Revise a responsabilidade desta skill; não transforme a tarefa em uma auditoria de toda a aplicação.

1. Conferir se editor, teste e navegador resolvem o mesmo import; procurar caminhos que funcionam apenas por hoisting.
2. Distinguir aviso de ferramenta, falha de tipos e falha de empacotamento. Investigar supressões amplas introduzidas para passar checks.
3. Revisar scripts/lockfile/config juntos e confirmar comandos executáveis.

## Evidência e resultado

Executar tipos e verificação específica da configuração; build/preview quando a alteração afeta resolução ou empacotamento.

Para cada achado, indique arquivo/linha, condição que reproduz o problema, consequência e correção sugerida. Priorize impacto demonstrável; diferencie hipótese sem evidência de defeito confirmado. Se não houver achados, declare o escopo verificado e a lacuna concreta restante. Não declare execução de verificações que apenas leu nem altere arquivos num pedido só de revisão.
