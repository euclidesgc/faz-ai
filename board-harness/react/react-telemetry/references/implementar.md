# Implementar — react-telemetry

Parta do contrato aprovado e do código existente. Inspecione consumidores antes de alterar o comportamento; para manutenção, registre o comportamento que deve ser preservado.

1. Integrar SDK/adaptador já adotado na duração prevista pela raiz; evitar inicialização repetida.
2. Sanitizar contexto antes do envio e encerrar/limpar identidade conforme o contrato da sessão.
3. Emitir no ponto definido com deduplicação pertinente; capturar erro de envio sem realimentar o próprio reportador.
4. Verificar com coletor local/mock ou transporte inspecionável, sem causar incidente externo para testar.

## Verificar e entregar

Evento contém contexto permitido uma vez por ocorrência prevista; falha de envio não quebra a UI nem expõe dados.

Execute verificações proporcionais à mudança com os comandos reais do projeto. Não acrescente teste que só repete a implementação. Informe arquivos alterados, comportamento resultante, verificações executadas e limitações concretas. Decisão transversal alterada exige atualização explícita do contrato correspondente, sem reescrever instruções por efeito implícito.
