# Implementar — react-component-contracts

Parta do contrato aprovado e do código existente. Inspecione consumidores antes de alterar o comportamento; para manutenção, registre o comportamento que deve ser preservado.

1. Implementar contrato tipado e impedir combinações inválidas quando isso simplifica uso real.
2. Manter eventos previsíveis e composição de children/slots sem esconder acoplamento a rede/domínio.
3. Encaminhar atributos e ref segundo API da versão React instalada; evitar espalhar props incompatíveis no DOM.
4. Migrar consumidores afetados preservando interações e identificação acessível.

## Verificar e entregar

Consumidores tipam e interagem corretamente; contrato de valor/evento se mantém em rerender e reset pertinentes.

Execute verificações proporcionais à mudança com os comandos reais do projeto. Não acrescente teste que só repete a implementação. Informe arquivos alterados, comportamento resultante, verificações executadas e limitações concretas. Decisão transversal alterada exige atualização explícita do contrato correspondente, sem reescrever instruções por efeito implícito.
