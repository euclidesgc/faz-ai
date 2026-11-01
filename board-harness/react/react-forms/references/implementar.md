# Implementar — react-forms

Parta do contrato aprovado e do código existente. Inspecione consumidores antes de alterar o comportamento; para manutenção, registre o comportamento que deve ser preservado.

1. Usar solução de formulário já adotada e os contratos/schemas aprovados, evitando validações paralelas divergentes.
2. Converter valores de input de forma explícita e construir payload pelo mapper existente.
3. Integrar mutation, estado pendente e erros sem capturar sucesso remoto como se ainda fosse falha de envio.
4. Aplicar reset apenas no momento previsto e manter valores ao falhar; impedir envio duplicado pertinente sem prometer idempotência no serviço.

## Verificar e entregar

Entrada válida/inválida, rejeição remota e reset têm resultado definido; refetch não perde rascunho indevidamente.

Execute verificações proporcionais à mudança com os comandos reais do projeto. Não acrescente teste que só repete a implementação. Informe arquivos alterados, comportamento resultante, verificações executadas e limitações concretas. Decisão transversal alterada exige atualização explícita do contrato correspondente, sem reescrever instruções por efeito implícito.
