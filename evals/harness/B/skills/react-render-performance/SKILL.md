---
name: react-render-performance
description: 'Diagnosticar lentidão de interações e renderizações com profiler; otimizar seletores, composição, cálculos e listas com evidência de custo e preservação de comportamento.'
---

# react-render-performance

Custo das atualizações e renderizações da interface.

## Contexto e limite

Leia o contrato aplicável (AGENTS.md e instruções locais), a entrega e os consumidores afetados. Confira versões e preserve decisões existentes; explicite hipótese mínima quando faltar contrato.

Não redefine propriedade do estado sem respeitar seu contrato. Backend, CI/CD e deploy ficam fora deste catálogo React + Vite SPA.

## Regras essenciais

- Medir interação com dados representativos antes de otimizar. Contagem de renders sozinha não quantifica tempo nem problema do usuário.
- Usar memoização/virtualização quando há ganho verificável e contrato preservado; não aplicar useMemo/useCallback/memo em toda função por regra.
- Preservar dependências corretas, semântica e fonte de verdade. Remover dependência para congelar render pode criar closure obsoleta.

## Modo

Escolha pelo pedido e leia **somente** a referência necessária; não carregue os três modos por padrão.

- **Projetar** — [projetar.md](references/projetar.md): decisões, contratos e critérios; sem implementar por um pedido apenas de desenho.
- **Implementar** — [implementar.md](references/implementar.md): criação, correção, refatoração ou atualização autorizada no escopo.
- **Revisar** — [revisar.md](references/revisar.md): diagnóstico e achados; sem editar por um pedido apenas de revisão.

Se a etapa envolver outra responsabilidade, consuma seu contrato aprovado; registre a dependência ausente em vez de inventar decisões. Não carregue outras skills apenas por afinidade temática.

## Critério de saída

Interação medida melhora e continua produzindo os mesmos resultados.

## Procedência

Princípios e exemplo Vite do Bulletproof; bibliotecas e defaults do exemplo não são exigências universais. Links para conferência quando houver dúvida de versão ou evidência; não são leituras obrigatórias em toda execução. Complementos oficiais, quando listados, consultados em 17/10/2026.

- [docs/performance.md](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/docs/performance.md)
- [docs/state-management.md](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/docs/state-management.md)
- [React: Profiler](https://react.dev/reference/react/Profiler)
