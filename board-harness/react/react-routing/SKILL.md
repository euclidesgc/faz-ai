---
name: react-routing
description: 'Definir caminhos, parâmetros de rota, links, rotas aninhadas, loaders e transições de navegação em uma SPA; tratar destinos desconhecidos.'
---

# react-routing

Correspondência entre URLs, rotas e transições de navegação.

## Contexto e limite

Leia o contrato aplicável (AGENTS.md e instruções locais), a entrega e os consumidores afetados. Confira versões e preserve decisões existentes; explicite hipótese mínima quando faltar contrato.

Não define filtros na query string nem decisões de autorização. Backend, CI/CD e deploy ficam fora deste catálogo React + Vite SPA.

## Regras essenciais

- Centralizar construção de caminhos conforme convenção do projeto; codificar parâmetros dinâmicos usados em links.
- Roteamento integra decisões de acesso existentes; não inventa papéis nem confunde sessão ainda carregando com acesso negado.
- Loaders e componentes que consultam os mesmos dados devem consumir o contrato de consulta existente, sem criar cache paralelo.

## Modo

Escolha pelo pedido e leia **somente** a referência necessária; não carregue os três modos por padrão.

- **Projetar** — [projetar.md](references/projetar.md): decisões, contratos e critérios; sem implementar por um pedido apenas de desenho.
- **Implementar** — [implementar.md](references/implementar.md): criação, correção, refatoração ou atualização autorizada no escopo.
- **Revisar** — [revisar.md](references/revisar.md): diagnóstico e achados; sem editar por um pedido apenas de revisão.

Se a etapa envolver outra responsabilidade, consuma seu contrato aprovado; registre a dependência ausente em vez de inventar decisões. Não carregue outras skills apenas por afinidade temática.

## Critério de saída

Caminhos válidos chegam à página correta e destinos inválidos têm resultado definido.

## Procedência

Princípios e exemplo Vite do Bulletproof; bibliotecas e defaults do exemplo não são exigências universais. Links para conferência quando houver dúvida de versão ou evidência; não são leituras obrigatórias em toda execução. Complementos oficiais, quando listados, consultados em 17/10/2026.

- [apps/react-vite/src/app/router.tsx](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/apps/react-vite/src/app/router.tsx)
- [apps/react-vite/src/config/paths.ts](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/apps/react-vite/src/config/paths.ts)
