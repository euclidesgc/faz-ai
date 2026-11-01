---
name: react-query-cache
description: 'Organizar leitura remota e cache de consultas: query keys, validade, paginação, refetch, retry, prefetch e integração de loaders com TanStack Query ou solução adotada.'
---

# react-query-cache

Leitura, identificação e validade dos dados remotos em cache.

## Contexto e limite

Leia o contrato aplicável (AGENTS.md e instruções locais), a entrega e os consumidores afetados. Confira versões e preserve decisões existentes; explicite hipótese mínima quando faltar contrato.

Não define operação de escrita ou contratos HTTP; publica as chaves usadas pela invalidação. Backend, CI/CD e deploy ficam fora deste catálogo React + Vite SPA.

## Regras essenciais

- A chave identifica recurso e todos os parâmetros que mudam o resultado, incluindo escopo de identidade/tenant quando pertinente. Não incluir tokens ou segredos.
- Hook, loader e prefetch reutilizam a mesma definição de consulta e chave; não criar cópia do dado remoto em store de UI.
- Validade, retenção e refetch são decisões distintas. Retry deve distinguir falha transitória, cancelamento e erro permanente; não copiar defaults do exemplo como regra universal.

## Modo

Escolha pelo pedido e leia **somente** a referência necessária; não carregue os três modos por padrão.

- **Projetar** — [projetar.md](references/projetar.md): decisões, contratos e critérios; sem implementar por um pedido apenas de desenho.
- **Implementar** — [implementar.md](references/implementar.md): criação, correção, refatoração ou atualização autorizada no escopo.
- **Revisar** — [revisar.md](references/revisar.md): diagnóstico e achados; sem editar por um pedido apenas de revisão.

Se a etapa envolver outra responsabilidade, consuma seu contrato aprovado; registre a dependência ausente em vez de inventar decisões. Não carregue outras skills apenas por afinidade temática.

## Critério de saída

Leituras e paginação são consistentes e isoladas pelo contexto necessário.

## Procedência

Princípios e exemplo Vite do Bulletproof; bibliotecas e defaults do exemplo não são exigências universais. Links para conferência quando houver dúvida de versão ou evidência; não são leituras obrigatórias em toda execução. Complementos oficiais, quando listados, consultados em 17/10/2026.

- [docs/state-management.md](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/docs/state-management.md)
- [docs/api-layer.md](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/docs/api-layer.md)
- [apps/react-vite/src/features/discussions/api/get-discussions.ts](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/apps/react-vite/src/features/discussions/api/get-discussions.ts)
