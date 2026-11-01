# Revisar — react-browser-data-security

Leia o diff/arquivos pertinentes e os contratos consumidos. Revise a responsabilidade desta skill; não transforme a tarefa em uma auditoria de toda a aplicação.

1. Procurar tokens/dados privados em storage, URLs, logs, fixtures públicas e configuração embutida.
2. Verificar remetente/origem/schema de mensagens quando a superfície existe; não inventar vetor ausente.
3. Conferir remoção e respostas tardias junto ao contrato de sessão; reportar requisito externo sem alterar backend.

## Evidência e resultado

Dados têm finalidade/retenção verificáveis; origem/formato inesperados são rejeitados quando há mensagens; diagnóstico não expõe segredos.

Para cada achado, indique arquivo/linha, condição que reproduz o problema, consequência e correção sugerida. Priorize impacto demonstrável; diferencie hipótese sem evidência de defeito confirmado. Se não houver achados, declare o escopo verificado e a lacuna concreta restante. Não declare execução de verificações que apenas leu nem altere arquivos num pedido só de revisão.
