# Implementar — react-tooling

Parta do contrato aprovado e do código existente. Inspecione consumidores antes de alterar o comportamento; para manutenção, registre o comportamento que deve ser preservado.

1. Alterar a configuração na sintaxe suportada pelas versões instaladas e preservar opções específicas do produto.
2. Sincronizar aliases nos consumidores necessários e usar o gerenciador do lockfile.
3. Executar os comandos afetados; quando houver import dinâmico ou recurso estático, inspecionar também build/preview local.
4. Atualizar os comandos no contrato da aplicação.

## Verificar e entregar

Executar tipos e verificação específica da configuração; build/preview quando a alteração afeta resolução ou empacotamento.

Execute verificações proporcionais à mudança com os comandos reais do projeto. Não acrescente teste que só repete a implementação. Informe arquivos alterados, comportamento resultante, verificações executadas e limitações concretas. Decisão transversal alterada exige atualização explícita do contrato correspondente, sem reescrever instruções por efeito implícito.
