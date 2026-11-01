# Projetar — react-integration-tests

Use a entrega, os critérios do produto, o contrato da aplicação e os consumidores reais como entrada. Se faltar decisão que muda comportamento, registre a dúvida e avance no que independe dela.

1. Definir cenário, partes reais, fronteira simulada e falha de integração a detectar.
2. Escolher providers, navegação e cenários de rede necessários; consumir contrato/handlers existentes.
3. Priorizar caminho principal e erro pertinente em vez de reproduzir toda a suíte unitária em UI.

## Entrega para a próxima etapa

Registre decisão e motivo, arquivos/contratos afetados, dependências e critério de verificação. Compare alternativas somente quando houver escolha relevante. Reutilize contratos da spec; não transcreva o catálogo inteiro no plano.

Verificação planejada: Interação real entre partes detecta incompatibilidade pertinente; cenário roda isolado sem ordem implícita e observa resultado final.
