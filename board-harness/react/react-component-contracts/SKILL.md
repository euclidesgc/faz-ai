---
name: react-component-contracts
description: 'Definir API de componentes: props, eventos, composição, slots, refs e modos controlado/não controlado; extrair componentes reutilizáveis sem acoplamento à feature.'
---

# react-component-contracts

API e composição dos componentes de interface.

## Contexto e limite

Leia o contrato aplicável (AGENTS.md e instruções locais), a entrega e os consumidores afetados. Confira versões e preserve decisões existentes; explicite hipótese mínima quando faltar contrato.

Não define tokens visuais, experiência completa da página ou procedimento de auditoria acessível. Backend, CI/CD e deploy ficam fora deste catálogo React + Vite SPA.

## Regras essenciais

- Props representam variações reais; preferir composição a um componente com muitas flags combináveis e estados impossíveis.
- Definir um proprietário do valor em componentes controlados. Não copiar props para estado sem um contrato explícito de rascunho/reset.
- Componente compartilhado não importa features, consultas ou permissões específicas. Preservar semântica nativa e eventos necessários ao consumidor.

## Modo

Escolha pelo pedido e leia **somente** a referência necessária; não carregue os três modos por padrão.

- **Projetar** — [projetar.md](references/projetar.md): decisões, contratos e critérios; sem implementar por um pedido apenas de desenho.
- **Implementar** — [implementar.md](references/implementar.md): criação, correção, refatoração ou atualização autorizada no escopo.
- **Revisar** — [revisar.md](references/revisar.md): diagnóstico e achados; sem editar por um pedido apenas de revisão.

Se a etapa envolver outra responsabilidade, consuma seu contrato aprovado; registre a dependência ausente em vez de inventar decisões. Não carregue outras skills apenas por afinidade temática.

## Critério de saída

Componente cumpre contrato e componentes compartilhados não importam features.

## Procedência

Princípios e exemplo Vite do Bulletproof; bibliotecas e defaults do exemplo não são exigências universais. Links para conferência quando houver dúvida de versão ou evidência; não são leituras obrigatórias em toda execução. Complementos oficiais, quando listados, consultados em 17/10/2026.

- [docs/components-and-styling.md](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/docs/components-and-styling.md)
- [apps/react-vite/src/components/ui/button/button.tsx](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/apps/react-vite/src/components/ui/button/button.tsx)
