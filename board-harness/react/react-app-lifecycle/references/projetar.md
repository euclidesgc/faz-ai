# Projetar — react-app-lifecycle

Use a entrega, os critérios do produto, o contrato da aplicação e os consumidores reais como entrada. Se faltar decisão que muda comportamento, registre a dúvida e avance no que independe dela.

1. Mapear main, raiz React, providers, serviços e quem depende de quem.
2. Definir duração por app, sessão ou feature e quais preparações realmente bloqueiam a primeira renderização.
3. Especificar desmontagem, remontagem e cancelamento da preparação; consumir política de sessão/cache existente.

## Entrega para a próxima etapa

Registre decisão e motivo, arquivos/contratos afetados, dependências e critério de verificação. Compare alternativas somente quando houver escolha relevante. Reutilize contratos da spec; não transcreva o catálogo inteiro no plano.

Verificação planejada: Rerender/remontagem não apagam cache indevidamente nem duplicam recursos; preparação falha de forma observável.
