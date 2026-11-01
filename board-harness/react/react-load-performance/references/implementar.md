# Implementar — react-load-performance

Parta do contrato aprovado e do código existente. Inspecione consumidores antes de alterar o comportamento; para manutenção, registre o comportamento que deve ser preservado.

1. Aplicar lazy na fronteira útil e evitar quebrar um caminho crítico em muitas requisições sequenciais.
2. Ajustar imagens/fontes/recursos conforme uso e viewport; não atrasar indiscriminadamente recurso necessário ao primeiro conteúdo.
3. Usar prefetch com as opções/chaves aprovadas quando probabilidade de uso justifica custo.
4. Comparar antes/depois em condições equivalentes e verificar navegação/loading/erro de chunk.

## Verificar e entregar

Métrica antes/depois em cenário controlado demonstra benefício; rota e recursos continuam corretos em build local.

Execute verificações proporcionais à mudança com os comandos reais do projeto. Não acrescente teste que só repete a implementação. Informe arquivos alterados, comportamento resultante, verificações executadas e limitações concretas. Decisão transversal alterada exige atualização explícita do contrato correspondente, sem reescrever instruções por efeito implícito.
