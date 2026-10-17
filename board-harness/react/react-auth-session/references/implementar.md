# Implementar — react-auth-session

Parta do contrato aprovado e do código existente. Inspecione consumidores antes de alterar o comportamento; para manutenção, registre o comportamento que deve ser preservado.

1. Implementar restauração/login/logout com estado explícito na solução existente; limitar tentativas conforme protocolo.
2. Coordenar troca de identidade, cancelamento e remoção de dados privados sem apagar dados públicos necessários.
3. Invalidar resultados atrasados da identidade anterior e impedir flashes de conteúdo autenticado obsoleto.
4. Integrar decisão de sessão em consumidores; validar destino de retorno pelo contrato de conteúdo seguro, sem decidir papéis aqui.

## Verificar e entregar

Identidade muda sem vazamento entre sessões; logout/expiração não são revertidos por resposta atrasada; falha de restauração é distinguível.

Execute verificações proporcionais à mudança com os comandos reais do projeto. Não acrescente teste que só repete a implementação. Informe arquivos alterados, comportamento resultante, verificações executadas e limitações concretas. Decisão transversal alterada exige atualização explícita do contrato correspondente, sem reescrever instruções por efeito implícito.
