# Implementar — react-access-policies

Parta do contrato aprovado e do código existente. Inspecione consumidores antes de alterar o comportamento; para manutenção, registre o comportamento que deve ser preservado.

1. Implementar funções/predicados tipados sem dependência da apresentação da página.
2. Integrar resultados nos consumidores previstos mantendo regra única e fallback adequado.
3. Reavaliar política quando identidade ou recurso muda; não capturar autorização em closure obsoleta.
4. Tratar 403 como recusa mesmo quando a decisão local permitiu; não repetir automaticamente nem converter todo 403 em logout.

## Verificar e entregar

Papéis/propriedades relevantes resultam nas decisões aprovadas; identidade/recurso desconhecido não liberam ações protegidas.

Execute verificações proporcionais à mudança com os comandos reais do projeto. Não acrescente teste que só repete a implementação. Informe arquivos alterados, comportamento resultante, verificações executadas e limitações concretas. Decisão transversal alterada exige atualização explícita do contrato correspondente, sem reescrever instruções por efeito implícito.
