# Implementar — react-app-lifecycle

Parta do contrato aprovado e do código existente. Inspecione consumidores antes de alterar o comportamento; para manutenção, registre o comportamento que deve ser preservado.

1. Compor os providers na raiz adequada; inicializar serviços de forma estável no escopo definido.
2. Integrar preparação assíncrona com loading/falha explícitos sem bloquear seções que não dependem dela.
3. Liberar listeners, timers e conexões criados pela raiz; ignorar ou cancelar trabalho que terminou após desmontagem.
4. Preservar ordem e identidade quando a raiz renderiza novamente.

## Verificar e entregar

Rerender/remontagem não apagam cache indevidamente nem duplicam recursos; preparação falha de forma observável.

Execute verificações proporcionais à mudança com os comandos reais do projeto. Não acrescente teste que só repete a implementação. Informe arquivos alterados, comportamento resultante, verificações executadas e limitações concretas. Decisão transversal alterada exige atualização explícita do contrato correspondente, sem reescrever instruções por efeito implícito.
