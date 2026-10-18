# Implementar — react-error-recovery

Parta do contrato aprovado e do código existente. Inspecione consumidores antes de alterar o comportamento; para manutenção, registre o comportamento que deve ser preservado.

1. Adicionar boundary/fallback no menor escopo útil e tratar rejeições de eventos/async explicitamente.
2. Manter mensagem segura e ação coerente: tentar de novo, corrigir dados, voltar ou recarregar conforme caso.
3. Preservar estado recuperável e conectar reset ao recurso/operação pertinente.
4. Eliminar feedback duplicado no caminho afetado, mantendo rejeição consumível pelo chamador.

## Verificar e entregar

Falha fica contida onde previsto e usuário consegue executar a recuperação; erros assíncronos não são confundidos com proteção do boundary.

Execute verificações proporcionais à mudança com os comandos reais do projeto. Não acrescente teste que só repete a implementação. Informe arquivos alterados, comportamento resultante, verificações executadas e limitações concretas. Decisão transversal alterada exige atualização explícita do contrato correspondente, sem reescrever instruções por efeito implícito.
