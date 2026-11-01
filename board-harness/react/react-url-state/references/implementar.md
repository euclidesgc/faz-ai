# Implementar — react-url-state

Parta do contrato aprovado e do código existente. Inspecione consumidores antes de alterar o comportamento; para manutenção, registre o comportamento que deve ser preservado.

1. Implementar parser/serializer próximos dos consumidores; usar API do roteador da aplicação.
2. Ler estado canônico da URL, separando apenas rascunho temporário de digitação quando necessário.
3. Atualizar parâmetros de forma composta e preservar os de outros controles; evitar navegações que só reescrevem defaults.
4. Conectar parâmetros validados à consulta sem redefinir suas chaves nesta responsabilidade.

## Verificar e entregar

Um link reproduz filtros/página; voltar/avançar restaura controles e valores inválidos têm resultado determinístico.

Execute verificações proporcionais à mudança com os comandos reais do projeto. Não acrescente teste que só repete a implementação. Informe arquivos alterados, comportamento resultante, verificações executadas e limitações concretas. Decisão transversal alterada exige atualização explícita do contrato correspondente, sem reescrever instruções por efeito implícito.
