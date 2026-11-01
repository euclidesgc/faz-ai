# Projetar — react-content-security

Use a entrega, os critérios do produto, o contrato da aplicação e os consumidores reais como entrada. Se faltar decisão que muda comportamento, registre a dúvida e avance no que independe dela.

1. Mapear origem do conteúdo até os sinks: HTML, href/src, navegação e wrappers que injetam DOM.
2. Definir formato permitido, links/imagens e quais protocolos/origens fazem sentido em cada uso.
3. Escolher sanitização e vetores de verificação pertinentes; distinguir controle do cliente de headers externos fora do escopo.

## Entrega para a próxima etapa

Registre decisão e motivo, arquivos/contratos afetados, dependências e critério de verificação. Compare alternativas somente quando houver escolha relevante. Reutilize contratos da spec; não transcreva o catálogo inteiro no plano.

Verificação planejada: Vetores pertinentes são neutralizados no caminho real; conteúdo/links permitidos continuam funcionando.
