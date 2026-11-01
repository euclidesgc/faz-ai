# Implementar — react-dependency-security

Parta do contrato aprovado e do código existente. Inspecione consumidores antes de alterar o comportamento; para manutenção, registre o comportamento que deve ser preservado.

1. Aplicar a menor correção suportada com o gerenciador do projeto e revisar alterações no lockfile.
2. Evitar override incompatível apenas para silenciar auditoria; confirmar suporte no pacote consumidor.
3. Adaptar uso afetado e executar verificação dirigida ao comportamento que o pacote fornece.
4. Reconsultar o aviso/auditoria e registrar riscos residuais sem expandir para CI/CD.

## Verificar e entregar

Versão/cadeia afetada e correção são rastreáveis; comportamento consumidor continua válido; limitações da verificação são registradas.

Execute verificações proporcionais à mudança com os comandos reais do projeto. Não acrescente teste que só repete a implementação. Informe arquivos alterados, comportamento resultante, verificações executadas e limitações concretas. Decisão transversal alterada exige atualização explícita do contrato correspondente, sem reescrever instruções por efeito implícito.
