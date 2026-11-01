# Revisar — react-api-mocks

Leia o diff/arquivos pertinentes e os contratos consumidos. Revise a responsabilidade desta skill; não transforme a tarefa em uma auditoria de toda a aplicação.

1. Comparar requisição/resposta com contrato real e detectar fixture que sempre confirma a suposição do componente.
2. Verificar isolamento entre casos, inicialização tardia e requisições não tratadas que escapam para rede real.
3. Checar separação de browser/Node e inclusão/ativação indevida do worker no build de uso real.

## Evidência e resultado

Handler recebe requisição real do cliente; sucesso/erro seguem contrato e cenário repetido começa limpo.

Para cada achado, indique arquivo/linha, condição que reproduz o problema, consequência e correção sugerida. Priorize impacto demonstrável; diferencie hipótese sem evidência de defeito confirmado. Se não houver achados, declare o escopo verificado e a lacuna concreta restante. Não declare execução de verificações que apenas leu nem altere arquivos num pedido só de revisão.
