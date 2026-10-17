# Implementar — react-business-rules

Parta do contrato aprovado e do código existente. Inspecione consumidores antes de alterar o comportamento; para manutenção, registre o comportamento que deve ser preservado.

1. Implementar funções/reducers de domínio com nomes do produto e parâmetros explícitos para relógio ou contexto variável.
2. Reutilizar a regra nos pontos afetados em vez de repetir expressões em JSX e validações.
3. Preservar precisão/unidades e definir falha de transição inválida sem mutar a entrada.
4. Não alterar payload remoto ou política de permissão para fazer uma regra caber.

## Verificar e entregar

Exemplos e fronteiras da regra produzem resultados esperados; refatoração mantém invariantes e comportamento aprovado.

Execute verificações proporcionais à mudança com os comandos reais do projeto. Não acrescente teste que só repete a implementação. Informe arquivos alterados, comportamento resultante, verificações executadas e limitações concretas. Decisão transversal alterada exige atualização explícita do contrato correspondente, sem reescrever instruções por efeito implícito.
