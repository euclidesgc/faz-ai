# Revisar — react-dependency-security

Leia o diff/arquivos pertinentes e os contratos consumidos. Revise a responsabilidade desta skill; não transforme a tarefa em uma auditoria de toda a aplicação.

1. Conferir cadeia instalada e condição vulnerável antes/depois; verificar se o pacote afetado continua transitivo.
2. Revisar mudanças não relacionadas, downgrade, override e instalação de pacote com nome suspeito.
3. Separar ausência de alerta, indisponibilidade de auditoria e remediação comprovada; não prometer risco zero.

## Evidência e resultado

Versão/cadeia afetada e correção são rastreáveis; comportamento consumidor continua válido; limitações da verificação são registradas.

Para cada achado, indique arquivo/linha, condição que reproduz o problema, consequência e correção sugerida. Priorize impacto demonstrável; diferencie hipótese sem evidência de defeito confirmado. Se não houver achados, declare o escopo verificado e a lacuna concreta restante. Não declare execução de verificações que apenas leu nem altere arquivos num pedido só de revisão.
