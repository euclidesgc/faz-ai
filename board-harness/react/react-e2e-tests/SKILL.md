---
name: react-e2e-tests
description: 'Testar jornadas no navegador real com Playwright: navegação, formulários, sessão, rede controlada, isolamento de dados e diagnósticos de falhas ponta a ponta.'
---

# react-e2e-tests

Evidência das jornadas da aplicação em um navegador real.

## Contexto e limite

Leia o contrato aplicável (AGENTS.md e instruções locais), a entrega e os consumidores afetados. Confira versões e preserve decisões existentes; explicite hipótese mínima quando faltar contrato.

Não exige backend real nem substitui toda verificação por E2E. Backend, CI/CD e deploy ficam fora deste catálogo React + Vite SPA.

## Regras essenciais

- Escolher jornadas críticas que ganham evidência no navegador; não converter toda verificação de função em E2E.
- Definir origem/porta, dados e sessão isolados; não depender de ordem entre testes nem alterar serviço real não autorizado.
- Usar locators e esperas por condição observável. Sleep fixo, força de clique e retries amplos podem esconder defeito real.

## Modo

Escolha pelo pedido e leia **somente** a referência necessária; não carregue os três modos por padrão.

- **Projetar** — [projetar.md](references/projetar.md): decisões, contratos e critérios; sem implementar por um pedido apenas de desenho.
- **Implementar** — [implementar.md](references/implementar.md): criação, correção, refatoração ou atualização autorizada no escopo.
- **Revisar** — [revisar.md](references/revisar.md): diagnóstico e achados; sem editar por um pedido apenas de revisão.

Se a etapa envolver outra responsabilidade, consuma seu contrato aprovado; registre a dependência ausente em vez de inventar decisões. Não carregue outras skills apenas por afinidade temática.

## Critério de saída

Jornada é repetível e verifica resultados do ponto de vista do usuário.

## Procedência

Princípios e exemplo Vite do Bulletproof; bibliotecas e defaults do exemplo não são exigências universais. Links para conferência quando houver dúvida de versão ou evidência; não são leituras obrigatórias em toda execução. Complementos oficiais, quando listados, consultados em 17/10/2026.

- [docs/testing.md](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/docs/testing.md)
- [apps/react-vite/playwright.config.ts](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/apps/react-vite/playwright.config.ts)
- [Playwright: boas práticas](https://playwright.dev/docs/best-practices)
