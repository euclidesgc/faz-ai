---
name: react-tooling
description: 'Configurar ferramentas locais: TypeScript, Vite, aliases, ESLint, formatação, scripts de desenvolvimento, build e preview; resolver incompatibilidades de configuração.'
---

# react-tooling

Configuração coerente das ferramentas locais de desenvolvimento e verificação.

## Contexto e limite

Leia o contrato aplicável (AGENTS.md e instruções locais), a entrega e os consumidores afetados. Confira versões e preserve decisões existentes; explicite hipótese mínima quando faltar contrato.

Não define variáveis de produto, vulnerabilidades de pacotes ou CI/CD. Backend, CI/CD e deploy ficam fora deste catálogo React + Vite SPA.

## Regras essenciais

- Detectar versões, lockfile e comandos existentes antes de alterar configuração. Não instalar uma stack nova por conveniência.
- Manter resolução de aliases coerente entre TypeScript, Vite e runner de testes; configuração de tipos não prova resolução em runtime.
- Typecheck e build são verificações distintas; um build Vite bem-sucedido não substitui a checagem estática.

## Modo

Escolha pelo pedido e leia **somente** a referência necessária; não carregue os três modos por padrão.

- **Projetar** — [projetar.md](references/projetar.md): decisões, contratos e critérios; sem implementar por um pedido apenas de desenho.
- **Implementar** — [implementar.md](references/implementar.md): criação, correção, refatoração ou atualização autorizada no escopo.
- **Revisar** — [revisar.md](references/revisar.md): diagnóstico e achados; sem editar por um pedido apenas de revisão.

Se a etapa envolver outra responsabilidade, consuma seu contrato aprovado; registre a dependência ausente em vez de inventar decisões. Não carregue outras skills apenas por afinidade temática.

## Critério de saída

Comandos locais funcionam e ferramentas resolvem os mesmos caminhos.

## Procedência

Princípios e exemplo Vite do Bulletproof; bibliotecas e defaults do exemplo não são exigências universais. Links para conferência quando houver dúvida de versão ou evidência; não são leituras obrigatórias em toda execução. Complementos oficiais, quando listados, consultados em 17/10/2026.

- [docs/project-standards.md](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/docs/project-standards.md)
- [apps/react-vite/package.json](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/apps/react-vite/package.json)
- [apps/react-vite/vite.config.ts](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/apps/react-vite/vite.config.ts)
