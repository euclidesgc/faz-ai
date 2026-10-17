# Projetar — react-dependency-security

Use a entrega, os critérios do produto, o contrato da aplicação e os consumidores reais como entrada. Se faltar decisão que muda comportamento, registre a dúvida e avance no que independe dela.

1. Obter identificador, fonte, intervalo afetado/corrigido e dependentes; distinguir runtime, build e testes.
2. Relacionar pré-condições do aviso ao uso real e documentar incertezas, sem declarar seguro por ausência de PoC.
3. Comparar atualização pontual, dependente transitivo, substituição ou mitigação, considerando API/lockfile e esforço.

## Entrega para a próxima etapa

Registre decisão e motivo, arquivos/contratos afetados, dependências e critério de verificação. Compare alternativas somente quando houver escolha relevante. Reutilize contratos da spec; não transcreva o catálogo inteiro no plano.

Verificação planejada: Versão/cadeia afetada e correção são rastreáveis; comportamento consumidor continua válido; limitações da verificação são registradas.
