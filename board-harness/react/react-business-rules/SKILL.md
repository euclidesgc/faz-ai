---
name: react-business-rules
description: 'Modelar regras de negócio do frontend: invariantes, cálculos, elegibilidade e transições do domínio; preservar significado durante correções e refatorações.'
---

# react-business-rules

Invariantes, cálculos e transições de negócio executados no frontend.

## Contexto e limite

Leia o contrato aplicável (AGENTS.md e instruções locais), a entrega e os consumidores afetados. Confira versões e preserve decisões existentes; explicite hipótese mínima quando faltar contrato.

Não define DTOs externos, políticas de acesso ou persistência do backend. Backend, CI/CD e deploy ficam fora deste catálogo React + Vite SPA.

## Regras essenciais

- Derivar regras de requisitos e exemplos aprovados, nunca de nomes de campos ou conveniência da interface.
- Manter cálculos e transições determinísticos quando possível, fora de JSX e sem dependência de transporte/estado visual.
- O cliente auxilia a experiência; invariantes que protegem serviços precisam de validação externa. Não implementar o backend.

## Modo

Escolha pelo pedido e leia **somente** a referência necessária; não carregue os três modos por padrão.

- **Projetar** — [projetar.md](references/projetar.md): decisões, contratos e critérios; sem implementar por um pedido apenas de desenho.
- **Implementar** — [implementar.md](references/implementar.md): criação, correção, refatoração ou atualização autorizada no escopo.
- **Revisar** — [revisar.md](references/revisar.md): diagnóstico e achados; sem editar por um pedido apenas de revisão.

Se a etapa envolver outra responsabilidade, consuma seu contrato aprovado; registre a dependência ausente em vez de inventar decisões. Não carregue outras skills apenas por afinidade temática.

## Critério de saída

Regras têm exemplos verificáveis e comportamento anterior é preservado quando exigido.

## Procedência

Recorte/complementação deste catálogo; não atribuir os controles adicionais integralmente ao Bulletproof. Links para conferência quando houver dúvida de versão ou evidência; não são leituras obrigatórias em toda execução. Complementos oficiais, quando listados, consultados em 17/10/2026.

- [docs/application-overview.md](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/docs/application-overview.md)
- [apps/react-vite/src/features/discussions/api/create-discussion.ts](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/apps/react-vite/src/features/discussions/api/create-discussion.ts)
