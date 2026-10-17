# Implementar — react-page-metadata

Parta do contrato aprovado e do código existente. Inspecione consumidores antes de alterar o comportamento; para manutenção, registre o comportamento que deve ser preservado.

1. Integrar Head/Helmet ou mecanismo já adotado sem duplicar provider na feature.
2. Aplicar valores escapados e fallback pertinente em loading/erro, evitando dados privados desnecessários.
3. Garantir atualização e remoção de valores específicos ao sair da rota.
4. Verificar DOM head após sequência de navegação e acesso direto, sem apenas procurar a tag no JSX.

## Verificar e entregar

Título/descrição corretos após navegação, recarga e falha pertinente, sem duplicatas ou valores residuais.

Execute verificações proporcionais à mudança com os comandos reais do projeto. Não acrescente teste que só repete a implementação. Informe arquivos alterados, comportamento resultante, verificações executadas e limitações concretas. Decisão transversal alterada exige atualização explícita do contrato correspondente, sem reescrever instruções por efeito implícito.
