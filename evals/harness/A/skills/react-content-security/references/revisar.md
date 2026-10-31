# Revisar — react-content-security

Leia o diff/arquivos pertinentes e os contratos consumidos. Revise a responsabilidade desta skill; não transforme a tarefa em uma auditoria de toda a aplicação.

1. Rastrear entrada externa até execução/renderização; verificar se todos os caminhos passam pelo controle.
2. Exercitar atributos de evento, protocolos perigosos e URL com origem enganosa conforme a superfície presente.
3. Checar sanitizador/configuração e relatar risco demonstrável; não afirmar proteção completa apenas pela presença de DOMPurify.

## Evidência e resultado

Vetores pertinentes são neutralizados no caminho real; conteúdo/links permitidos continuam funcionando.

Para cada achado, indique arquivo/linha, condição que reproduz o problema, consequência e correção sugerida. Priorize impacto demonstrável; diferencie hipótese sem evidência de defeito confirmado. Se não houver achados, declare o escopo verificado e a lacuna concreta restante. Não declare execução de verificações que apenas leu nem altere arquivos num pedido só de revisão.
