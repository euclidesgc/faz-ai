# Implementar — react-i18n

Parta do contrato aprovado e do código existente. Inspecione consumidores antes de alterar o comportamento; para manutenção, registre o comportamento que deve ser preservado.

1. Adicionar chaves e traduções na estrutura vigente sem mudar nomes de chave por preferência.
2. Interpolar valores usando a API da biblioteca adotada e não construir sentenças por fragmentos.
3. Usar formatadores locais apropriados com parâmetros do produto; não interpretar uma string localizada como número de API.
4. Verificar localidades/fallback e texto longo; evitar testes dependentes do timezone acidental da máquina.

## Verificar e entregar

Localidades contratadas exibem mensagens/valores corretos e fallback; dados de cálculo/transporte mantêm significado.

Execute verificações proporcionais à mudança com os comandos reais do projeto. Não acrescente teste que só repete a implementação. Informe arquivos alterados, comportamento resultante, verificações executadas e limitações concretas. Decisão transversal alterada exige atualização explícita do contrato correspondente, sem reescrever instruções por efeito implícito.
