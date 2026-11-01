---
name: react-ui-state
description: 'Definir propriedade do estado visual local ou compartilhado: hooks, reducers, stores, seletores, derivações, efeitos e reset de modais, seleção e preferências de interface, incluindo abertura/fechamento e troca de item selecionado.'
---

# react-ui-state

Propriedade e sincronização do estado visual no cliente.

## Contexto e limite

Leia o contrato aplicável (AGENTS.md e instruções locais), a entrega e os consumidores afetados. Confira versões e preserve decisões existentes; explicite hipótese mínima quando faltar contrato.

Não define estado remoto, de formulário, de URL ou de sessão. Backend, CI/CD e deploy ficam fora deste catálogo React + Vite SPA.

## Regras essenciais

- Começar no menor ancestral comum dos consumidores; store global exige necessidade concreta de alcance ou duração.
- Calcular dados derivados a partir da fonte canônica; não sincronizar dois estados equivalentes por efeitos.
- Efeitos sincronizam sistemas externos. Transições causadas por interação pertencem a handlers/reducers; estado remoto, formulário, URL e sessão têm contratos próprios.

## Modo

Escolha pelo pedido e leia **somente** a referência necessária; não carregue os três modos por padrão.

- **Projetar** — [projetar.md](references/projetar.md): decisões, contratos e critérios; sem implementar por um pedido apenas de desenho.
- **Implementar** — [implementar.md](references/implementar.md): criação, correção, refatoração ou atualização autorizada no escopo.
- **Revisar** — [revisar.md](references/revisar.md): diagnóstico e achados; sem editar por um pedido apenas de revisão.

Se a etapa envolver outra responsabilidade, consuma seu contrato aprovado; registre a dependência ausente em vez de inventar decisões. Não carregue outras skills apenas por afinidade temática.

## Critério de saída

Estado tem proprietário e reset/limpeza no momento correto.

## Procedência

Princípios e exemplo Vite do Bulletproof; bibliotecas e defaults do exemplo não são exigências universais. Links para conferência quando houver dúvida de versão ou evidência; não são leituras obrigatórias em toda execução. Complementos oficiais, quando listados, consultados em 17/10/2026.

- [docs/state-management.md](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/docs/state-management.md)
- [apps/react-vite/src/hooks/use-disclosure.ts](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/apps/react-vite/src/hooks/use-disclosure.ts)
- [apps/react-vite/src/components/ui/notifications/notifications-store.ts](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/apps/react-vite/src/components/ui/notifications/notifications-store.ts)
