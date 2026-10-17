# Implementar — react-unit-tests

Parta do contrato aprovado e do código existente. Inspecione consumidores antes de alterar o comportamento; para manutenção, registre o comportamento que deve ser preservado.

1. Escrever casos legíveis com exemplos de produto, incluindo erro ou transição inválida significativa.
2. Usar asserts sobre retorno/efeito público; não duplicar o algoritmo no expected.
3. Injetar/controlar tempo e dependências necessárias sem mockar a unidade sob teste.
4. Executar arquivo afetado e conferir que a regressão-alvo faria o teste falhar por razão relevante.

## Verificar e entregar

Teste detecta o defeito-alvo e passa na implementação correta, sem depender de ordem ou internals dispensáveis.

Execute verificações proporcionais à mudança com os comandos reais do projeto. Não acrescente teste que só repete a implementação. Informe arquivos alterados, comportamento resultante, verificações executadas e limitações concretas. Decisão transversal alterada exige atualização explícita do contrato correspondente, sem reescrever instruções por efeito implícito.
