# Implementar — react-api-contracts

Parta do contrato aprovado e do código existente. Inspecione consumidores antes de alterar o comportamento; para manutenção, registre o comportamento que deve ser preservado.

1. Implementar tipos/schemas próximos da API da feature ou área compartilhada justificada.
2. Mapear nomes, datas e unidades explicitamente; evitar defaults que fabriquem dados válidos a partir de payload corrompido.
3. Validar na fronteira escolhida e converter falha de contrato em erro consumível sem vazar payload sensível.
4. Atualizar consumidores/fixtures pertinentes sem alterar transporte ou chaves de cache incidentalmente.

## Verificar e entregar

Payload válido é aceito/mapeado; incompatibilidades significativas produzem falha definida sem acessar dados como se fossem válidos.

Execute verificações proporcionais à mudança com os comandos reais do projeto. Não acrescente teste que só repete a implementação. Informe arquivos alterados, comportamento resultante, verificações executadas e limitações concretas. Decisão transversal alterada exige atualização explícita do contrato correspondente, sem reescrever instruções por efeito implícito.
