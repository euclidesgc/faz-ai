# Implementar — react-integration-tests

Parta do contrato aprovado e do código existente. Inspecione consumidores antes de alterar o comportamento; para manutenção, registre o comportamento que deve ser preservado.

1. Renderizar pela utilidade de teste da aplicação com instâncias isoladas e estado inicial explícito.
2. Interagir como usuário e selecionar por papel/nome/label, respeitando idioma do projeto.
3. Usar handlers de rede do cenário; aguardar conteúdo/estado final e verificar efeito relevante.
4. Limpar handlers/caches/estado e executar os testes afetados, evitando mock que torne impossível o erro visado.

## Verificar e entregar

Interação real entre partes detecta incompatibilidade pertinente; cenário roda isolado sem ordem implícita e observa resultado final.

Execute verificações proporcionais à mudança com os comandos reais do projeto. Não acrescente teste que só repete a implementação. Informe arquivos alterados, comportamento resultante, verificações executadas e limitações concretas. Decisão transversal alterada exige atualização explícita do contrato correspondente, sem reescrever instruções por efeito implícito.
