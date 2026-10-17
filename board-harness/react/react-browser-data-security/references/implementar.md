# Implementar — react-browser-data-security

Parta do contrato aprovado e do código existente. Inspecione consumidores antes de alterar o comportamento; para manutenção, registre o comportamento que deve ser preservado.

1. Remover exposição desnecessária de bundle, URL, logs e persistência; evitar imprimir valores ao investigar.
2. Aplicar retenção/remoção nos pontos acordados, incluindo caches persistidos e rascunhos privados existentes.
3. Validar mensagens como dados, rejeitar origem/formato inesperados e não executar conteúdo recebido.
4. Encaminhar controles CSRF contratados ao cliente HTTP sem presumir que CORS sozinho protege escrita.

## Verificar e entregar

Dados têm finalidade/retenção verificáveis; origem/formato inesperados são rejeitados quando há mensagens; diagnóstico não expõe segredos.

Execute verificações proporcionais à mudança com os comandos reais do projeto. Não acrescente teste que só repete a implementação. Informe arquivos alterados, comportamento resultante, verificações executadas e limitações concretas. Decisão transversal alterada exige atualização explícita do contrato correspondente, sem reescrever instruções por efeito implícito.
