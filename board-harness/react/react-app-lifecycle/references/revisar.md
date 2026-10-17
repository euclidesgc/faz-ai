# Revisar — react-app-lifecycle

Leia o diff/arquivos pertinentes e os contratos consumidos. Revise a responsabilidade desta skill; não transforme a tarefa em uma auditoria de toda a aplicação.

1. Identificar providers que consomem contexto antes de seu fornecedor ou instâncias recriadas durante render.
2. Inspecionar setup/cleanup, inicialização não idempotente e bloqueio da aplicação por recursos opcionais.
3. Distinguir renderizações extras de desenvolvimento de vazamento real de recursos.

## Evidência e resultado

Rerender/remontagem não apagam cache indevidamente nem duplicam recursos; preparação falha de forma observável.

Para cada achado, indique arquivo/linha, condição que reproduz o problema, consequência e correção sugerida. Priorize impacto demonstrável; diferencie hipótese sem evidência de defeito confirmado. Se não houver achados, declare o escopo verificado e a lacuna concreta restante. Não declare execução de verificações que apenas leu nem altere arquivos num pedido só de revisão.
