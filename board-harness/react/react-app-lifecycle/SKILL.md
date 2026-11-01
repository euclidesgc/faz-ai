---
name: react-app-lifecycle
description: 'Compor entrada e raiz da aplicação, providers e instâncias globais; controlar ordem, duração, preparação e limpeza dos recursos da aplicação.'
---

# react-app-lifecycle

Composição da raiz React, providers e duração das instâncias da aplicação.

## Contexto e limite

Leia o contrato aplicável (AGENTS.md e instruções locais), a entrega e os consumidores afetados. Confira versões e preserve decisões existentes; explicite hipótese mínima quando faltar contrato.

Não define chaves de cache, regras de sessão ou efeitos específicos de uma feature. Backend, CI/CD e deploy ficam fora deste catálogo React + Vite SPA.

## Regras essenciais

- Instâncias com estado, como QueryClient e stores, devem ter identidade estável durante o escopo aprovado; não recriar a cada render.
- Ordenar providers conforme dependências de consumo. Não transformar um provider de feature em global sem necessidade de vida útil.
- Setup de recursos externos tem cleanup correspondente. A repetição de setup/cleanup em StrictMode deve revelar problemas, não ser silenciada removendo-o.

## Modo

Escolha pelo pedido e leia **somente** a referência necessária; não carregue os três modos por padrão.

- **Projetar** — [projetar.md](references/projetar.md): decisões, contratos e critérios; sem implementar por um pedido apenas de desenho.
- **Implementar** — [implementar.md](references/implementar.md): criação, correção, refatoração ou atualização autorizada no escopo.
- **Revisar** — [revisar.md](references/revisar.md): diagnóstico e achados; sem editar por um pedido apenas de revisão.

Se a etapa envolver outra responsabilidade, consuma seu contrato aprovado; registre a dependência ausente em vez de inventar decisões. Não carregue outras skills apenas por afinidade temática.

## Critério de saída

Instâncias têm duração correta e a raiz funciona em montagem e remontagem.

## Procedência

Princípios e exemplo Vite do Bulletproof; bibliotecas e defaults do exemplo não são exigências universais. Links para conferência quando houver dúvida de versão ou evidência; não são leituras obrigatórias em toda execução. Complementos oficiais, quando listados, consultados em 17/10/2026.

- [apps/react-vite/src/main.tsx](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/apps/react-vite/src/main.tsx)
- [apps/react-vite/src/app/index.tsx](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/apps/react-vite/src/app/index.tsx)
- [apps/react-vite/src/app/provider.tsx](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/apps/react-vite/src/app/provider.tsx)
- [React: sincronização e limpeza de efeitos](https://react.dev/learn/synchronizing-with-effects)
