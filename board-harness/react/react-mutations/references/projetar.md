# Projetar — react-mutations

Use a entrega, os critérios do produto, o contrato da aplicação e os consumidores reais como entrada. Se faltar decisão que muda comportamento, registre a dúvida e avance no que independe dela.

1. Mapear consumidores afetados: detalhe, listas filtradas, totais e identidade/tenant.
2. Definir sucesso, invalidação/reconciliação, conclusão do estado pending e quem notifica/navega.
3. Se houver otimismo, especificar cancelamento, snapshot/patch, rollback e concorrência que pode invalidar o snapshot.

## Entrega para a próxima etapa

Registre decisão e motivo, arquivos/contratos afetados, dependências e critério de verificação. Compare alternativas somente quando houver escolha relevante. Reutilize contratos da spec; não transcreva o catálogo inteiro no plano.

Verificação planejada: Após salvar, consumidores relevantes refletem o resultado; falha e concorrência não deixam dados inventados nem apagam escrita posterior.
