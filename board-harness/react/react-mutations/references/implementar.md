# Implementar — react-mutations

Parta do contrato aprovado e do código existente. Inspecione consumidores antes de alterar o comportamento; para manutenção, registre o comportamento que deve ser preservado.

1. Implementar mutation usando fetcher e payload existentes, preservando callbacks necessários do consumidor.
2. Invalidar/atualizar chaves publicadas; considerar entradas/saídas da lista quando o filtro depende do campo alterado.
3. Em otimismo, impedir resposta antiga de sobrescrever o patch e recuperar falhas sem desfazer uma escrita mais recente.
4. Definir estado de envio até a etapa apropriada de reconciliação e propagar erro sem duplicar notificações.

## Verificar e entregar

Após salvar, consumidores relevantes refletem o resultado; falha e concorrência não deixam dados inventados nem apagam escrita posterior.

Execute verificações proporcionais à mudança com os comandos reais do projeto. Não acrescente teste que só repete a implementação. Informe arquivos alterados, comportamento resultante, verificações executadas e limitações concretas. Decisão transversal alterada exige atualização explícita do contrato correspondente, sem reescrever instruções por efeito implícito.
