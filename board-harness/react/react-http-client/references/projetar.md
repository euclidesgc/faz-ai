# Projetar — react-http-client

Use a entrega, os critérios do produto, o contrato da aplicação e os consumidores reais como entrada. Se faltar decisão que muda comportamento, registre a dúvida e avance no que independe dela.

1. Inspecionar cliente atual, semântica de resposta, origens permitidas, credenciais e protocolo do serviço.
2. Definir cancelamento, timeout e formato de falha, distinguindo rede, status HTTP e abort.
3. Atribuir tratamento de 401/403 e notificações a consumidores definidos para evitar ciclos e mensagens duplicadas.

## Entrega para a próxima etapa

Registre decisão e motivo, arquivos/contratos afetados, dependências e critério de verificação. Compare alternativas somente quando houver escolha relevante. Reutilize contratos da spec; não transcreva o catálogo inteiro no plano.

Verificação planejada: Fetchers apresentam resposta, erro HTTP, falha de rede e cancelamento de modo coerente com os contratos usados.
