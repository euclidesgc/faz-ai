# Projetar — react-telemetry

Use a entrega, os critérios do produto, o contrato da aplicação e os consumidores reais como entrada. Se faltar decisão que muda comportamento, registre a dúvida e avance no que independe dela.

1. Partir de pergunta diagnóstica concreta e definir evento, contexto permitido e responsável pela emissão.
2. Mapear correlação, release/rota sem dados pessoais, volume/amostragem e consentimento aplicáveis no contrato.
3. Definir comportamento sem ferramenta configurada e como verificar emissão sem publicar dados reais.

## Entrega para a próxima etapa

Registre decisão e motivo, arquivos/contratos afetados, dependências e critério de verificação. Compare alternativas somente quando houver escolha relevante. Reutilize contratos da spec; não transcreva o catálogo inteiro no plano.

Verificação planejada: Evento contém contexto permitido uma vez por ocorrência prevista; falha de envio não quebra a UI nem expõe dados.
