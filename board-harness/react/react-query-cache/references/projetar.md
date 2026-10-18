# Projetar — react-query-cache

Use a entrega, os critérios do produto, o contrato da aplicação e os consumidores reais como entrada. Se faltar decisão que muda comportamento, registre a dúvida e avance no que independe dela.

1. Listar recurso, filtros, paginação e escopo; definir fábrica de chaves/opções e o que consumidores podem customizar.
2. Definir staleTime, retenção, retry e gatilhos conforme necessidade de atualização e custo.
3. Descrever carregamento inicial/atualização e troca de parâmetros; publicar chaves para mutations e identidade para loaders.

## Entrega para a próxima etapa

Registre decisão e motivo, arquivos/contratos afetados, dependências e critério de verificação. Compare alternativas somente quando houver escolha relevante. Reutilize contratos da spec; não transcreva o catálogo inteiro no plano.

Verificação planejada: Filtros/escopos diferentes não compartilham resposta incorreta; loader e hook compartilham consulta; comportamento de atualização é observável.
