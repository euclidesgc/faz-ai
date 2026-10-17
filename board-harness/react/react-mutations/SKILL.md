---
name: react-mutations
description: 'Coordenar escrita remota: mutations, invalidação de consultas, reconciliação, atualização otimista, rollback e concorrência após criar, editar ou excluir recursos.'
---

# react-mutations

Escrita remota e atualização dos dados afetados no cliente.

## Contexto e limite

Leia o contrato aplicável (AGENTS.md e instruções locais), a entrega e os consumidores afetados. Confira versões e preserve decisões existentes; explicite hipótese mínima quando faltar contrato.

Não redefine chaves de consulta, formato do endpoint ou campos do formulário. Backend, CI/CD e deploy ficam fora deste catálogo React + Vite SPA.

## Regras essenciais

- Consumir DTO/fetcher e fábricas de chaves existentes; não redefinir identidade de leitura na mutation.
- Preferir invalidação/reconciliação simples quando suficiente. Otimismo precisa de benefício concreto e comportamento para falha e concorrência.
- Uma falha de refetch após escrita não prova que a escrita falhou. Não repetir operação não idempotente automaticamente para recuperar a UI.

## Modo

Escolha pelo pedido e leia **somente** a referência necessária; não carregue os três modos por padrão.

- **Projetar** — [projetar.md](references/projetar.md): decisões, contratos e critérios; sem implementar por um pedido apenas de desenho.
- **Implementar** — [implementar.md](references/implementar.md): criação, correção, refatoração ou atualização autorizada no escopo.
- **Revisar** — [revisar.md](references/revisar.md): diagnóstico e achados; sem editar por um pedido apenas de revisão.

Se a etapa envolver outra responsabilidade, consuma seu contrato aprovado; registre a dependência ausente em vez de inventar decisões. Não carregue outras skills apenas por afinidade temática.

## Critério de saída

Escrita bem-sucedida atualiza os consumidores e falhas não deixam estado incorreto.

## Procedência

Princípios e exemplo Vite do Bulletproof; bibliotecas e defaults do exemplo não são exigências universais. Links para conferência quando houver dúvida de versão ou evidência; não são leituras obrigatórias em toda execução. Complementos oficiais, quando listados, consultados em 17/10/2026.

- [docs/api-layer.md](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/docs/api-layer.md)
- [apps/react-vite/src/features/discussions/api/create-discussion.ts](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/apps/react-vite/src/features/discussions/api/create-discussion.ts)
- [TanStack Query: atualização otimista](https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates)
