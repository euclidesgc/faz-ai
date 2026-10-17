# Revisar — react-error-recovery

Leia o diff/arquivos pertinentes e os contratos consumidos. Revise a responsabilidade desta skill; não transforme a tarefa em uma auditoria de toda a aplicação.

1. Provocar falha de render e falha assíncrona separadamente; observar contenção e ação de recuperação.
2. Procurar catch vazio, reload como única solução de erro de campo e fallback que falha pelo mesmo motivo.
3. Contar mensagens/reportes da mesma falha e verificar exposição de detalhes internos.

## Evidência e resultado

Falha fica contida onde previsto e usuário consegue executar a recuperação; erros assíncronos não são confundidos com proteção do boundary.

Para cada achado, indique arquivo/linha, condição que reproduz o problema, consequência e correção sugerida. Priorize impacto demonstrável; diferencie hipótese sem evidência de defeito confirmado. Se não houver achados, declare o escopo verificado e a lacuna concreta restante. Não declare execução de verificações que apenas leu nem altere arquivos num pedido só de revisão.
