# Implementar — react-query-cache

Parta do contrato aprovado e do código existente. Inspecione consumidores antes de alterar o comportamento; para manutenção, registre o comportamento que deve ser preservado.

1. Criar definição de consulta próxima do fetcher e consumir parâmetros já validados.
2. Reutilizar opções em hooks/loaders/prefetch; preservar isolamento de resultado por filtro/escopo.
3. Integrar cancelamento do fetcher e consulta habilitada apenas quando pré-condições estão satisfeitas.
4. Preservar política aprovada para dados anteriores e erros; não alterar escrita/rollback nesta etapa.

## Verificar e entregar

Filtros/escopos diferentes não compartilham resposta incorreta; loader e hook compartilham consulta; comportamento de atualização é observável.

Execute verificações proporcionais à mudança com os comandos reais do projeto. Não acrescente teste que só repete a implementação. Informe arquivos alterados, comportamento resultante, verificações executadas e limitações concretas. Decisão transversal alterada exige atualização explícita do contrato correspondente, sem reescrever instruções por efeito implícito.
