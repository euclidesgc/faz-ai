# Revisar — react-http-client

Leia o diff/arquivos pertinentes e os contratos consumidos. Revise a responsabilidade desta skill; não transforme a tarefa em uma auditoria de toda a aplicação.

1. Checar envelope real versus tipo declarado, erros engolidos e interceptors registrados repetidamente.
2. Inspecionar cancelamento, headers sensíveis enviados a origem indevida e notificações duplicadas.
3. Verificar loops de 401/retry e dependências de UI que dificultam o consumo do fetcher fora de React.

## Evidência e resultado

Fetchers apresentam resposta, erro HTTP, falha de rede e cancelamento de modo coerente com os contratos usados.

Para cada achado, indique arquivo/linha, condição que reproduz o problema, consequência e correção sugerida. Priorize impacto demonstrável; diferencie hipótese sem evidência de defeito confirmado. Se não houver achados, declare o escopo verificado e a lacuna concreta restante. Não declare execução de verificações que apenas leu nem altere arquivos num pedido só de revisão.
