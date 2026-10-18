# Projetar — react-api-mocks

Use a entrega, os critérios do produto, o contrato da aplicação e os consumidores reais como entrada. Se faltar decisão que muda comportamento, registre a dúvida e avance no que independe dela.

1. Listar operações e cenários necessários: sucesso, vazio, erro e latência apenas quando pertinentes.
2. Definir fixture mínima com identidade/relacionamentos válidos e forma determinística de preparar/resetar estado.
3. Separar handlers compartilhados de overrides por teste e determinar ativação por configuração local existente.

## Entrega para a próxima etapa

Registre decisão e motivo, arquivos/contratos afetados, dependências e critério de verificação. Compare alternativas somente quando houver escolha relevante. Reutilize contratos da spec; não transcreva o catálogo inteiro no plano.

Verificação planejada: Handler recebe requisição real do cliente; sucesso/erro seguem contrato e cenário repetido começa limpo.
