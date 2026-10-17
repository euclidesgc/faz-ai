---
name: react-url-state
description: 'Sincronizar filtros, busca, paginação e ordenação com URL/query string; definir parsing, serialização, defaults, recarga e restauração ao voltar/avançar no histórico.'
---

# react-url-state

Representação de estado navegável na URL e no histórico.

## Contexto e limite

Leia o contrato aplicável (AGENTS.md e instruções locais), a entrega e os consumidores afetados. Confira versões e preserve decisões existentes; explicite hipótese mínima quando faltar contrato.

Não configura a árvore de rotas nem a política de cache remoto. Backend, CI/CD e deploy ficam fora deste catálogo React + Vite SPA.

## Regras essenciais

- A URL é a fonte canônica dos valores declarados navegáveis. Evitar um segundo estado sincronizado por efeitos nos dois sentidos.
- Validar parâmetros externos, normalizar defaults e preservar parâmetros não pertencentes ao controle alterado.
- Escolher push/replace por experiência de histórico. Não colocar segredos ou dados pessoais na URL.

## Modo

Escolha pelo pedido e leia **somente** a referência necessária; não carregue os três modos por padrão.

- **Projetar** — [projetar.md](references/projetar.md): decisões, contratos e critérios; sem implementar por um pedido apenas de desenho.
- **Implementar** — [implementar.md](references/implementar.md): criação, correção, refatoração ou atualização autorizada no escopo.
- **Revisar** — [revisar.md](references/revisar.md): diagnóstico e achados; sem editar por um pedido apenas de revisão.

Se a etapa envolver outra responsabilidade, consuma seu contrato aprovado; registre a dependência ausente em vez de inventar decisões. Não carregue outras skills apenas por afinidade temática.

## Critério de saída

Compartilhar/recarregar a URL reproduz o estado esperado e o histórico funciona.

## Procedência

Princípios e exemplo Vite do Bulletproof; bibliotecas e defaults do exemplo não são exigências universais. Links para conferência quando houver dúvida de versão ou evidência; não são leituras obrigatórias em toda execução. Complementos oficiais, quando listados, consultados em 17/10/2026.

- [docs/state-management.md](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/docs/state-management.md)
- [apps/react-vite/src/features/discussions/components/discussions-list.tsx](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/apps/react-vite/src/features/discussions/components/discussions-list.tsx)
- [React Router: useSearchParams](https://reactrouter.com/api/hooks/useSearchParams)
