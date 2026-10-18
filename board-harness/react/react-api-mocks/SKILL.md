---
name: react-api-mocks
description: 'Simular API com MSW: handlers HTTP, fixtures, cenários de erro/latência, inicialização em desenvolvimento/teste e reset de dados conforme contrato do serviço.'
---

# react-api-mocks

Respostas e cenários de rede simulados para desenvolvimento e testes.

## Contexto e limite

Leia o contrato aplicável (AGENTS.md e instruções locais), a entrega e os consumidores afetados. Confira versões e preserve decisões existentes; explicite hipótese mínima quando faltar contrato.

Não implementa backend de produção nem escreve os asserts da feature. Backend, CI/CD e deploy ficam fora deste catálogo React + Vite SPA.

## Regras essenciais

- Simular a fronteira HTTP mantendo método, path, status, headers/envelope relevantes e formato real do contrato.
- Mocks não devem esconder requisição inesperada nem fabricar todos os caminhos como sucesso. Definir política explícita para rotas não tratadas.
- Worker/browser e servidor Node de testes têm setup distinto; nenhum mock deve ser ativado acidentalmente na aplicação destinada a uso real.

## Modo

Escolha pelo pedido e leia **somente** a referência necessária; não carregue os três modos por padrão.

- **Projetar** — [projetar.md](references/projetar.md): decisões, contratos e critérios; sem implementar por um pedido apenas de desenho.
- **Implementar** — [implementar.md](references/implementar.md): criação, correção, refatoração ou atualização autorizada no escopo.
- **Revisar** — [revisar.md](references/revisar.md): diagnóstico e achados; sem editar por um pedido apenas de revisão.

Se a etapa envolver outra responsabilidade, consuma seu contrato aprovado; registre a dependência ausente em vez de inventar decisões. Não carregue outras skills apenas por afinidade temática.

## Critério de saída

Simulação reproduz cenários necessários sem esconder divergências de protocolo.

## Procedência

Princípios e exemplo Vite do Bulletproof; bibliotecas e defaults do exemplo não são exigências universais. Links para conferência quando houver dúvida de versão ou evidência; não são leituras obrigatórias em toda execução. Complementos oficiais, quando listados, consultados em 17/10/2026.

- [docs/testing.md](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/docs/testing.md)
- [apps/react-vite/src/testing/mocks/browser.ts](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/apps/react-vite/src/testing/mocks/browser.ts)
- [apps/react-vite/src/testing/mocks/server.ts](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/apps/react-vite/src/testing/mocks/server.ts)
