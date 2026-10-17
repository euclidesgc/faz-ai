---
name: react-unit-tests
description: 'Escrever e revisar testes unitários de regras, cálculos, transições e hooks isolados; escolher fronteiras, exemplos e asserts que detectam regressões de comportamento.'
---

# react-unit-tests

Evidência isolada de regras, cálculos e unidades relevantes.

## Contexto e limite

Leia o contrato aplicável (AGENTS.md e instruções locais), a entrega e os consumidores afetados. Confira versões e preserve decisões existentes; explicite hipótese mínima quando faltar contrato.

Não testa jornada completa nem exige teste para toda função. Backend, CI/CD e deploy ficam fora deste catálogo React + Vite SPA.

## Regras essenciais

- Testar contrato observável, não variáveis internas nem a redação da implementação. Cobertura numérica não substitui escolha de casos.
- Testar unidade isolada quando oferece evidência útil; não exigir teste para todo wrapper ou ajuste visual reversível.
- Controlar relógio, aleatoriedade e entradas externas relevantes; restaurar mocks/timers para manter isolamento.

## Modo

Escolha pelo pedido e leia **somente** a referência necessária; não carregue os três modos por padrão.

- **Projetar** — [projetar.md](references/projetar.md): decisões, contratos e critérios; sem implementar por um pedido apenas de desenho.
- **Implementar** — [implementar.md](references/implementar.md): criação, correção, refatoração ou atualização autorizada no escopo.
- **Revisar** — [revisar.md](references/revisar.md): diagnóstico e achados; sem editar por um pedido apenas de revisão.

Se a etapa envolver outra responsabilidade, consuma seu contrato aprovado; registre a dependência ausente em vez de inventar decisões. Não carregue outras skills apenas por afinidade temática.

## Critério de saída

Testes detectam regressão e toleram refatoração equivalente.

## Procedência

Princípios e exemplo Vite do Bulletproof; bibliotecas e defaults do exemplo não são exigências universais. Links para conferência quando houver dúvida de versão ou evidência; não são leituras obrigatórias em toda execução. Complementos oficiais, quando listados, consultados em 17/10/2026.

- [docs/testing.md](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/docs/testing.md)
- [apps/react-vite/src/hooks/**tests**/use-disclosure.test.ts](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/apps/react-vite/src/hooks/__tests__/use-disclosure.test.ts)
