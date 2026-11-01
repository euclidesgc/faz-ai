# Revisar — react-auth-session

Leia o diff/arquivos pertinentes e os contratos consumidos. Revise a responsabilidade desta skill; não transforme a tarefa em uma auditoria de toda a aplicação.

1. Percorrer acesso direto, restauração offline, expiração durante operação, logout e novo login com outra conta.
2. Procurar loops de 401/refresh, sessão copiada em stores diferentes e resposta tardia restaurando identidade antiga.
3. Conferir limpeza de dados e origem das credenciais sem inferir que ocultar UI protege o serviço.

## Evidência e resultado

Identidade muda sem vazamento entre sessões; logout/expiração não são revertidos por resposta atrasada; falha de restauração é distinguível.

Para cada achado, indique arquivo/linha, condição que reproduz o problema, consequência e correção sugerida. Priorize impacto demonstrável; diferencie hipótese sem evidência de defeito confirmado. Se não houver achados, declare o escopo verificado e a lacuna concreta restante. Não declare execução de verificações que apenas leu nem altere arquivos num pedido só de revisão.
