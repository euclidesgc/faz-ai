# Implementar — react-http-client

Parta do contrato aprovado e do código existente. Inspecione consumidores antes de alterar o comportamento; para manutenção, registre o comportamento que deve ser preservado.

1. Implementar fetchers tipados usando DTO/schema aprovado e encoding correto de path/query/body.
2. Encaminhar AbortSignal quando a stack suporta; não converter cancelamento em toast de falha.
3. Preservar rejeição/status no interceptor e garantir que .data/payload não sejam extraídos duas vezes.
4. Conectar credenciais apenas segundo contrato de origem/sessão; não relaxar CORS nem desabilitar validações para contornar erro.

## Verificar e entregar

Fetchers apresentam resposta, erro HTTP, falha de rede e cancelamento de modo coerente com os contratos usados.

Execute verificações proporcionais à mudança com os comandos reais do projeto. Não acrescente teste que só repete a implementação. Informe arquivos alterados, comportamento resultante, verificações executadas e limitações concretas. Decisão transversal alterada exige atualização explícita do contrato correspondente, sem reescrever instruções por efeito implícito.
