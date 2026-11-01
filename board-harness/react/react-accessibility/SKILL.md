---
name: react-accessibility
description: 'Projetar e verificar acessibilidade: semântica, nomes acessíveis, teclado, foco, diálogos, anúncios e mensagens de erro em componentes e fluxos interativos.'
---

# react-accessibility

Semântica e interação acessível dos fluxos e componentes.

## Contexto e limite

Leia o contrato aplicável (AGENTS.md e instruções locais), a entrega e os consumidores afetados. Confira versões e preserve decisões existentes; explicite hipótese mínima quando faltar contrato.

Não altera a regra do produto ou estabelece o design visual completo. Backend, CI/CD e deploy ficam fora deste catálogo React + Vite SPA.

## Regras essenciais

- Preferir elementos nativos; ARIA complementa semântica e não implementa interação de teclado.
- Nome acessível, foco visível e sequência lógica fazem parte do comportamento. Não adicionar tabindex positivo para compensar estrutura inadequada.
- Ferramentas automáticas revelam apenas parte das barreiras; registrar observações manuais e limites da verificação.

## Modo

Escolha pelo pedido e leia **somente** a referência necessária; não carregue os três modos por padrão.

- **Projetar** — [projetar.md](references/projetar.md): decisões, contratos e critérios; sem implementar por um pedido apenas de desenho.
- **Implementar** — [implementar.md](references/implementar.md): criação, correção, refatoração ou atualização autorizada no escopo.
- **Revisar** — [revisar.md](references/revisar.md): diagnóstico e achados; sem editar por um pedido apenas de revisão.

Se a etapa envolver outra responsabilidade, consuma seu contrato aprovado; registre a dependência ausente em vez de inventar decisões. Não carregue outras skills apenas por afinidade temática.

## Critério de saída

Fluxo pode ser operado por teclado e controles têm semântica e identificação adequadas.

## Procedência

Recorte/complementação deste catálogo; não atribuir os controles adicionais integralmente ao Bulletproof. Links para conferência quando houver dúvida de versão ou evidência; não são leituras obrigatórias em toda execução. Complementos oficiais, quando listados, consultados em 17/10/2026.

- [apps/react-vite/src/components/ui/dialog/dialog.tsx](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/apps/react-vite/src/components/ui/dialog/dialog.tsx)
- [apps/react-vite/.eslintrc.cjs](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/apps/react-vite/.eslintrc.cjs)
- [W3C APG: diálogo modal](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
