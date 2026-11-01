---
name: react-integration-tests
description: 'Testar componentes e features integrados com providers, interações e rede simulada; verificar fluxos de UI, estados assíncronos e contratos entre partes.'
---

# react-integration-tests

Evidência do comportamento de componentes e features integrados.

## Contexto e limite

Leia o contrato aplicável (AGENTS.md e instruções locais), a entrega e os consumidores afetados. Confira versões e preserve decisões existentes; explicite hipótese mínima quando faltar contrato.

Não define os handlers compartilhados de rede nem toda jornada no navegador. Backend, CI/CD e deploy ficam fora deste catálogo React + Vite SPA.

## Regras essenciais

- Observar o que o usuário vê/faz: papel, nome acessível, conteúdo e resultado. Não acoplar asserts à estrutura interna do hook.
- Manter providers reais relevantes e simular a fronteira externa; não mockar o hook de consulta se o risco é integrar consulta e UI.
- Criar cache/estado isolado por teste e aguardar resultados observáveis sem sleeps fixos.

## Modo

Escolha pelo pedido e leia **somente** a referência necessária; não carregue os três modos por padrão.

- **Projetar** — [projetar.md](references/projetar.md): decisões, contratos e critérios; sem implementar por um pedido apenas de desenho.
- **Implementar** — [implementar.md](references/implementar.md): criação, correção, refatoração ou atualização autorizada no escopo.
- **Revisar** — [revisar.md](references/revisar.md): diagnóstico e achados; sem editar por um pedido apenas de revisão.

Se a etapa envolver outra responsabilidade, consuma seu contrato aprovado; registre a dependência ausente em vez de inventar decisões. Não carregue outras skills apenas por afinidade temática.

## Critério de saída

Integração detecta incompatibilidades relevantes entre suas partes.

## Procedência

Princípios e exemplo Vite do Bulletproof; bibliotecas e defaults do exemplo não são exigências universais. Links para conferência quando houver dúvida de versão ou evidência; não são leituras obrigatórias em toda execução. Complementos oficiais, quando listados, consultados em 17/10/2026.

- [docs/testing.md](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/docs/testing.md)
- [apps/react-vite/src/testing/test-utils.tsx](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/apps/react-vite/src/testing/test-utils.tsx)
- [Testing Library: princípios](https://testing-library.com/docs/guiding-principles/)
