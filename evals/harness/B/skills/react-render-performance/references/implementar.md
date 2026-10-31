# Implementar — react-render-performance

Parta do contrato aprovado e do código existente. Inspecione consumidores antes de alterar o comportamento; para manutenção, registre o comportamento que deve ser preservado.

1. Reduzir propagação de estado onde permitido pelo contrato, seletor amplo ou cálculo repetido comprovadamente caro.
2. Introduzir memoização somente com dependências/igualdade corretas e estabilidade que afeta o caminho medido.
3. Se virtualizar, preservar foco, navegação e conteúdo acessível necessário ao fluxo.
4. Repetir a medição comparável e testar atualização/troca de recurso para detectar dado obsoleto.

## Verificar e entregar

Interação medida melhora em condições comparáveis e segue exibindo valores atuais após mudanças de props/estado.

Execute verificações proporcionais à mudança com os comandos reais do projeto. Não acrescente teste que só repete a implementação. Informe arquivos alterados, comportamento resultante, verificações executadas e limitações concretas. Decisão transversal alterada exige atualização explícita do contrato correspondente, sem reescrever instruções por efeito implícito.
