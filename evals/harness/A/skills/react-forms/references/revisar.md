# Revisar — react-forms

Leia o diff/arquivos pertinentes e os contratos consumidos. Revise a responsabilidade desta skill; não transforme a tarefa em uma auditoria de toda a aplicação.

1. Testar primeiro carregamento, refetch com edição, troca de registro e cancelamento/reabertura.
2. Procurar defaults reaplicados a cada render, coerções de número vazio e erros remotos sem associação ao campo.
3. Conferir acessibilidade básica, duplicação de envio e diferenças entre schema local e contrato consumido.

## Evidência e resultado

Entrada válida/inválida, rejeição remota e reset têm resultado definido; refetch não perde rascunho indevidamente.

Para cada achado, indique arquivo/linha, condição que reproduz o problema, consequência e correção sugerida. Priorize impacto demonstrável; diferencie hipótese sem evidência de defeito confirmado. Se não houver achados, declare o escopo verificado e a lacuna concreta restante. Não declare execução de verificações que apenas leu nem altere arquivos num pedido só de revisão.
