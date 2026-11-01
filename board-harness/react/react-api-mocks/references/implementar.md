# Implementar — react-api-mocks

Parta do contrato aprovado e do código existente. Inspecione consumidores antes de alterar o comportamento; para manutenção, registre o comportamento que deve ser preservado.

1. Implementar handlers na API da versão MSW instalada, consumindo schemas/DTOs existentes.
2. Preparar dados determinísticos e resetar overrides e banco/estado simulado; reset de handlers sozinho pode não limpar dados.
3. Inicializar mocks antes das requisições e liberar recursos de teste; restringir ativação ao modo previsto.
4. Responder de forma fiel a validações/status do contrato sem transformar o mock em backend de produção.

## Verificar e entregar

Handler recebe requisição real do cliente; sucesso/erro seguem contrato e cenário repetido começa limpo.

Execute verificações proporcionais à mudança com os comandos reais do projeto. Não acrescente teste que só repete a implementação. Informe arquivos alterados, comportamento resultante, verificações executadas e limitações concretas. Decisão transversal alterada exige atualização explícita do contrato correspondente, sem reescrever instruções por efeito implícito.
