---
name: react-page-composition
description: 'Compor telas e páginas combinando features, layouts e contratos existentes; conectar ações e estados de carregamento, vazio, sucesso e falha na camada da aplicação.'
---

# react-page-composition

Composição de uma página com recursos e contratos existentes.

## Contexto e limite

Leia o contrato aplicável (AGENTS.md e instruções locais), a entrega e os consumidores afetados. Confira versões e preserve decisões existentes; explicite hipótese mínima quando faltar contrato.

Não reimplementa consultas, validação, políticas de acesso ou componentes básicos. Backend, CI/CD e deploy ficam fora deste catálogo React + Vite SPA.

## Regras essenciais

- Composição entre features pertence à camada app; não fazer uma feature importar outra para montar a página.
- Página orquestra contratos existentes; não duplica fetcher, cálculo, schema ou política para preencher uma lacuna.
- Representar os estados realmente distintos da jornada, incluindo dados anteriores durante atualização quando isso fizer parte do contrato.

## Modo

Escolha pelo pedido e leia **somente** a referência necessária; não carregue os três modos por padrão.

- **Projetar** — [projetar.md](references/projetar.md): decisões, contratos e critérios; sem implementar por um pedido apenas de desenho.
- **Implementar** — [implementar.md](references/implementar.md): criação, correção, refatoração ou atualização autorizada no escopo.
- **Revisar** — [revisar.md](references/revisar.md): diagnóstico e achados; sem editar por um pedido apenas de revisão.

Se a etapa envolver outra responsabilidade, consuma seu contrato aprovado; registre a dependência ausente em vez de inventar decisões. Não carregue outras skills apenas por afinidade temática.

## Critério de saída

Página tem resultados definidos para os estados pertinentes e usa os contratos aprovados.

## Procedência

Princípios e exemplo Vite do Bulletproof; bibliotecas e defaults do exemplo não são exigências universais. Links para conferência quando houver dúvida de versão ou evidência; não são leituras obrigatórias em toda execução. Complementos oficiais, quando listados, consultados em 17/10/2026.

- [docs/project-structure.md](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/docs/project-structure.md)
- [apps/react-vite/src/app/routes/app/discussions/discussion.tsx](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/apps/react-vite/src/app/routes/app/discussions/discussion.tsx)
