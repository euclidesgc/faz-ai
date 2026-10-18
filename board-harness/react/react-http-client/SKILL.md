---
name: react-http-client
description: 'Implementar cliente HTTP e fetchers: base URL, headers, credenciais, serialização, cancelamento e normalização de erros de transporte no consumo de APIs existentes.'
---

# react-http-client

Execução de requisições e representação das respostas/falhas de transporte.

## Contexto e limite

Leia o contrato aplicável (AGENTS.md e instruções locais), a entrega e os consumidores afetados. Confira versões e preserve decisões existentes; explicite hipótese mínima quando faltar contrato.

Não define DTOs, políticas de login, retry de queries ou cache. Backend, CI/CD e deploy ficam fora deste catálogo React + Vite SPA.

## Regras essenciais

- Reutilizar cliente configurado e fetchers explícitos; não espalhar detalhes de transporte nos componentes.
- Definir se o cliente retorna envelope ou payload e manter tipos coerentes. Preservar status/categoria necessários aos consumidores.
- Não adicionar retry automático de escrita ou refresh de token sem contrato e limites. Política de sessão vem de autenticação; feedback vem da recuperação de erros.

## Modo

Escolha pelo pedido e leia **somente** a referência necessária; não carregue os três modos por padrão.

- **Projetar** — [projetar.md](references/projetar.md): decisões, contratos e critérios; sem implementar por um pedido apenas de desenho.
- **Implementar** — [implementar.md](references/implementar.md): criação, correção, refatoração ou atualização autorizada no escopo.
- **Revisar** — [revisar.md](references/revisar.md): diagnóstico e achados; sem editar por um pedido apenas de revisão.

Se a etapa envolver outra responsabilidade, consuma seu contrato aprovado; registre a dependência ausente em vez de inventar decisões. Não carregue outras skills apenas por afinidade temática.

## Critério de saída

Fetchers são reutilizáveis e respostas/falhas preservam informação útil aos consumidores.

## Procedência

Princípios e exemplo Vite do Bulletproof; bibliotecas e defaults do exemplo não são exigências universais. Links para conferência quando houver dúvida de versão ou evidência; não são leituras obrigatórias em toda execução. Complementos oficiais, quando listados, consultados em 17/10/2026.

- [docs/api-layer.md](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/docs/api-layer.md)
- [apps/react-vite/src/lib/api-client.ts](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/apps/react-vite/src/lib/api-client.ts)
