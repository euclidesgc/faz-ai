# Implementar — react-module-boundaries

Parta do contrato aprovado e do código existente. Inspecione consumidores antes de alterar o comportamento; para manutenção, registre o comportamento que deve ser preservado.

1. Localizar imports, exports, aliases e testes dos módulos movidos antes de editar.
2. Mover a responsabilidade inteira, ajustar consumidores e preservar contratos e comportamento. Não promover código de uma feature para compartilhado apenas para contornar lint.
3. Aplicar restrições de import/ciclo compatíveis com o ESLint instalado; não copiar sintaxe de outra versão.
4. Atualizar o mapa do AGENTS.md se a estrutura aprovada mudou.

## Verificar e entregar

Imports afetados resolvem; lint/tipos passam; um fluxo consumidor preserva o comportamento após a movimentação.

Execute verificações proporcionais à mudança com os comandos reais do projeto. Não acrescente teste que só repete a implementação. Informe arquivos alterados, comportamento resultante, verificações executadas e limitações concretas. Decisão transversal alterada exige atualização explícita do contrato correspondente, sem reescrever instruções por efeito implícito.
