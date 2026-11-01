# Projetar — react-module-boundaries

Use a entrega, os critérios do produto, o contrato da aplicação e os consumidores reais como entrada. Se faltar decisão que muda comportamento, registre a dúvida e avance no que independe dela.

1. Mapear consumidores e dependências do assunto; distinguir feature de página e de utilitário sem domínio.
2. Desenhar apenas os caminhos afetados e as arestas permitidas. Para dependência entre features, propor composição em app ou contrato realmente compartilhado.
3. Especificar movimentações, sequência compatível e regra de lint que pode impedir a regressão.

## Entrega para a próxima etapa

Registre decisão e motivo, arquivos/contratos afetados, dependências e critério de verificação. Compare alternativas somente quando houver escolha relevante. Reutilize contratos da spec; não transcreva o catálogo inteiro no plano.

Verificação planejada: Imports afetados resolvem; lint/tipos passam; um fluxo consumidor preserva o comportamento após a movimentação.
