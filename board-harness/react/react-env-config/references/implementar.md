# Implementar — react-env-config

Parta do contrato aprovado e do código existente. Inspecione consumidores antes de alterar o comportamento; para manutenção, registre o comportamento que deve ser preservado.

1. Implementar schema/leitura central sem espalhar import.meta.env nos consumidores.
2. Converter booleanos/números explicitamente; usar defaults de produto apenas quando previstos no contrato.
3. Atualizar exemplo de configuração sem segredos e remover leituras divergentes no escopo.
4. Produzir erro que identifica o nome inválido sem despejar o ambiente completo.

## Verificar e entregar

Demonstrar parsing válido, ausência/erro pertinente e resolução da configuração no comando afetado.

Execute verificações proporcionais à mudança com os comandos reais do projeto. Não acrescente teste que só repete a implementação. Informe arquivos alterados, comportamento resultante, verificações executadas e limitações concretas. Decisão transversal alterada exige atualização explícita do contrato correspondente, sem reescrever instruções por efeito implícito.
