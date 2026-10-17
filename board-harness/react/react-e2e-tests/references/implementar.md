# Implementar — react-e2e-tests

Parta do contrato aprovado e do código existente. Inspecione consumidores antes de alterar o comportamento; para manutenção, registre o comportamento que deve ser preservado.

1. Usar Playwright e comandos locais existentes com navegador suportado; iniciar app no contexto de teste apropriado.
2. Preparar dados/sessão sem dependência de outro teste e sem persistir credenciais reais em artefatos.
3. Navegar/interagir por locators estáveis e aguardar estado de negócio; verificar resultado após navegação/recarga se pertinente.
4. Executar jornada afetada e usar trace/erro de rede para distinguir falha de produto de ambiente indisponível.

## Verificar e entregar

Jornada passa isoladamente em navegador com dados controlados e produz diagnóstico utilizável quando o comportamento falha.

Execute verificações proporcionais à mudança com os comandos reais do projeto. Não acrescente teste que só repete a implementação. Informe arquivos alterados, comportamento resultante, verificações executadas e limitações concretas. Decisão transversal alterada exige atualização explícita do contrato correspondente, sem reescrever instruções por efeito implícito.
