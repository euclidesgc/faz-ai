# Projetar — react-error-recovery

Use a entrega, os critérios do produto, o contrato da aplicação e os consumidores reais como entrada. Se faltar decisão que muda comportamento, registre a dúvida e avance no que independe dela.

1. Mapear falhas por origem e impacto: seção, rota ou raiz; separar erro esperado de crash.
2. Definir informação preservada, mensagem, ação de recuperação e critério de reset.
3. Atribuir quem notifica e quem reporta; consumir retry de query e telemetria sem redefini-los.

## Entrega para a próxima etapa

Registre decisão e motivo, arquivos/contratos afetados, dependências e critério de verificação. Compare alternativas somente quando houver escolha relevante. Reutilize contratos da spec; não transcreva o catálogo inteiro no plano.

Verificação planejada: Falha fica contida onde previsto e usuário consegue executar a recuperação; erros assíncronos não são confundidos com proteção do boundary.
