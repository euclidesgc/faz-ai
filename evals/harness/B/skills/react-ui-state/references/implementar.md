# Implementar — react-ui-state

Parta do contrato aprovado e do código existente. Inspecione consumidores antes de alterar o comportamento; para manutenção, registre o comportamento que deve ser preservado.

1. Implementar transições com atualizações imutáveis e funcionais quando dependem do valor anterior.
2. Reutilizar derivações e seletores; não copiar respostas de consulta para store visual sem requisito explícito de edição.
3. Limitar efeitos à sincronização externa com dependências e cleanup corretos.
4. Tratar troca de recurso e fechamento/reabertura para não exibir seleção obsoleta.

## Verificar e entregar

Transições e reset pertinentes são demonstrados; estado derivado acompanha a fonte sem sincronização circular.

Execute verificações proporcionais à mudança com os comandos reais do projeto. Não acrescente teste que só repete a implementação. Informe arquivos alterados, comportamento resultante, verificações executadas e limitações concretas. Decisão transversal alterada exige atualização explícita do contrato correspondente, sem reescrever instruções por efeito implícito.
