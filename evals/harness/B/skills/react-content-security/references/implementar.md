# Implementar — react-content-security

Parta do contrato aprovado e do código existente. Inspecione consumidores antes de alterar o comportamento; para manutenção, registre o comportamento que deve ser preservado.

1. Substituir sink HTML por texto quando o requisito permitir; para rich text, sanitizar o HTML final com ferramenta existente/compatível.
2. Não alterar HTML depois da sanitização de modo que reintroduza conteúdo ativo.
3. Resolver URLs pela API URL e validar esquema/origem normalizados, incluindo caminhos // e destinos de retorno.
4. Centralizar o controle necessário nos sinks reais sem criar um sanitizer genérico baseado em substituição de strings.

## Verificar e entregar

Vetores pertinentes são neutralizados no caminho real; conteúdo/links permitidos continuam funcionando.

Execute verificações proporcionais à mudança com os comandos reais do projeto. Não acrescente teste que só repete a implementação. Informe arquivos alterados, comportamento resultante, verificações executadas e limitações concretas. Decisão transversal alterada exige atualização explícita do contrato correspondente, sem reescrever instruções por efeito implícito.
