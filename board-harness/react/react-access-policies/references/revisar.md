# Revisar — react-access-policies

Leia o diff/arquivos pertinentes e os contratos consumidos. Revise a responsabilidade desta skill; não transforme a tarefa em uma auditoria de toda a aplicação.

1. Conferir casos permitido/negado para cada ramo relevante da matriz, incluindo recurso sem proprietário e papel desconhecido.
2. Procurar comparações de papel duplicadas, default permissivo e política desatualizada após troca de usuário.
3. Verificar tratamento de 403 e explicitar limite da proteção no navegador.

## Evidência e resultado

Papéis/propriedades relevantes resultam nas decisões aprovadas; identidade/recurso desconhecido não liberam ações protegidas.

Para cada achado, indique arquivo/linha, condição que reproduz o problema, consequência e correção sugerida. Priorize impacto demonstrável; diferencie hipótese sem evidência de defeito confirmado. Se não houver achados, declare o escopo verificado e a lacuna concreta restante. Não declare execução de verificações que apenas leu nem altere arquivos num pedido só de revisão.
